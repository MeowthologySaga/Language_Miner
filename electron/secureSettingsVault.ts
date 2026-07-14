import { safeStorage } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { SecureSettingsStatus } from "../src/shared/types";

export type SecureSettingsInput = {
  geminiApiKey?: string;
  googleTranslateApiKey?: string;
};

export type SecureSettingsClearResult = {
  removed: number;
  status: SecureSettingsStatus;
};

export type SecureSettingsMigrationResult = {
  attempted: boolean;
  migrated: number;
  status: SecureSettingsStatus;
};

type StoredSecrets = Partial<Record<keyof SecureSettingsInput, string>>;
const LEGACY_PROFILE_MIGRATION_MARKER = "secure-settings-legacy-electron-v2.done";

export class SecureSettingsVault {
  private readonly filePath: string;
  private readonly memory: SecureSettingsInput = {};

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, "secure-settings.json");
  }

  getStatus(): SecureSettingsStatus {
    return {
      available: safeStorage.isEncryptionAvailable(),
      geminiApiKeyConfigured: Boolean(this.get("geminiApiKey")),
      googleTranslateApiKeyConfigured: Boolean(this.get("googleTranslateApiKey"))
    };
  }

  set(input: SecureSettingsInput): SecureSettingsStatus {
    const current = this.readEncrypted();
    for (const key of ["geminiApiKey", "googleTranslateApiKey"] as const) {
      if (typeof input[key] !== "string") continue;
      const value = input[key]!.trim();
      this.memory[key] = value;
      if (value) current[key] = this.encrypt(value);
      else delete current[key];
    }
    if (safeStorage.isEncryptionAvailable()) this.writeEncrypted(current);
    return this.getStatus();
  }

  migrateLegacy(input: SecureSettingsInput): SecureSettingsStatus {
    const onlyMissing: SecureSettingsInput = {};
    if (!this.get("geminiApiKey") && input.geminiApiKey?.trim()) {
      onlyMissing.geminiApiKey = input.geminiApiKey;
    }
    if (!this.get("googleTranslateApiKey") && input.googleTranslateApiKey?.trim()) {
      onlyMissing.googleTranslateApiKey = input.googleTranslateApiKey;
    }
    return this.set(onlyMissing);
  }

  completeLegacyProfileMigration(input: SecureSettingsInput): SecureSettingsMigrationResult {
    if (!safeStorage.isEncryptionAvailable() || this.isLegacyProfileMigrationComplete()) {
      return { attempted: false, migrated: 0, status: this.getStatus() };
    }

    const currentRaw = this.readRawEncryptedRecord(this.filePath) ?? {};
    const onlyMissing: SecureSettingsInput = {};
    let migrated = 0;

    for (const key of ["geminiApiKey", "googleTranslateApiKey"] as const) {
      if (
        Object.prototype.hasOwnProperty.call(currentRaw, key) ||
        Object.prototype.hasOwnProperty.call(this.memory, key)
      ) {
        continue;
      }
      const value = normalizeMigrationValue(input[key]);
      if (!value) continue;
      onlyMissing[key] = value;
      migrated += 1;
    }

    if (migrated > 0) this.set(onlyMissing);
    this.markLegacyProfileMigrationComplete();
    return { attempted: true, migrated, status: this.getStatus() };
  }

  isLegacyProfileMigrationComplete() {
    const markerPath = this.getLegacyProfileMigrationMarkerPath();
    try {
      const stat = fs.lstatSync(markerPath);
      return stat.isFile() && !stat.isSymbolicLink();
    } catch {
      return false;
    }
  }

  markLegacyProfileMigrationComplete() {
    this.writeMigrationMarker(this.getLegacyProfileMigrationMarkerPath());
  }

  clear(): SecureSettingsClearResult {
    const encrypted = this.readEncrypted();
    const removed = (["geminiApiKey", "googleTranslateApiKey"] as const).filter(
      (key) => Boolean(this.memory[key] || encrypted[key])
    ).length;

    for (const key of ["geminiApiKey", "googleTranslateApiKey"] as const) {
      delete this.memory[key];
    }

    this.removeEncryptedFiles();
    return {
      removed,
      status: this.getStatus()
    };
  }

  verifyCleared() {
    const encrypted = this.readEncrypted();
    const remainingKeys = (["geminiApiKey", "googleTranslateApiKey"] as const).filter(
      (key) => Boolean(this.memory[key] || encrypted[key])
    ).length;
    const remainingFiles = this.listEncryptedFiles().length;
    return {
      verified: remainingKeys === 0 && remainingFiles === 0,
      remainingKeys,
      remainingFiles
    };
  }

  get(key: keyof SecureSettingsInput): string {
    if (this.memory[key]) return this.memory[key] ?? "";
    const encoded = this.readEncrypted()[key];
    if (!encoded || !safeStorage.isEncryptionAvailable()) return "";
    try {
      return safeStorage.decryptString(Buffer.from(encoded, "base64"));
    } catch {
      return "";
    }
  }

  private encrypt(value: string) {
    if (!safeStorage.isEncryptionAvailable()) return "";
    return safeStorage.encryptString(value).toString("base64");
  }

  private readEncrypted(): StoredSecrets {
    const record = this.readRawEncryptedRecord(this.filePath);
    if (!record) return {};
    return selectStoredSecrets(record);
  }

  private readRawEncryptedRecord(filePath: string): Record<string, unknown> | null {
    try {
      const stat = fs.lstatSync(filePath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 64 * 1024) return null;
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private writeMigrationMarker(markerPath: string) {
    if (this.isLegacyProfileMigrationComplete()) return;
    fs.mkdirSync(path.dirname(markerPath), { recursive: true });
    const tempPath = `${markerPath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(tempPath, "1\n", { flag: "wx", mode: 0o600 });
      fs.renameSync(tempPath, markerPath);
    } catch (error) {
      // Another instance may have won the atomic rename. Only a valid, regular
      // marker is accepted; an invalid destination or write failure remains fatal.
      if (!this.isLegacyProfileMigrationComplete()) throw error;
    } finally {
      try {
        fs.rmSync(tempPath, { force: true });
      } catch {
        // Preserve the original marker-write result. A failed rename still
        // fails closed, while a concurrent valid marker remains sufficient.
      }
    }

    if (!this.isLegacyProfileMigrationComplete()) {
      throw new Error("Secure settings migration marker could not be persisted.");
    }
  }

  private getLegacyProfileMigrationMarkerPath() {
    return path.join(path.dirname(this.filePath), LEGACY_PROFILE_MIGRATION_MARKER);
  }

  private writeEncrypted(value: StoredSecrets) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    if (fs.existsSync(this.filePath)) {
      const stat = fs.lstatSync(this.filePath);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error("Secure settings path must be a regular file.");
      }
    }
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tempPath, this.filePath);
  }

  private removeEncryptedFiles() {
    const directory = path.dirname(this.filePath);
    const baseName = path.basename(this.filePath);
    if (!fs.existsSync(directory)) return;

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name !== baseName && !entry.name.startsWith(`${baseName}.`)) continue;
      const candidatePath = path.join(directory, entry.name);
      const stat = fs.lstatSync(candidatePath);
      if (stat.isDirectory() && !stat.isSymbolicLink()) continue;
      fs.rmSync(candidatePath, { force: true });
    }
  }

  private listEncryptedFiles() {
    const directory = path.dirname(this.filePath);
    const baseName = path.basename(this.filePath);
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.name === baseName || entry.name.startsWith(`${baseName}.`))
      .map((entry) => entry.name);
  }
}

function selectStoredSecrets(record: Record<string, unknown>): StoredSecrets {
  return {
    ...(typeof record.geminiApiKey === "string" ? { geminiApiKey: record.geminiApiKey } : {}),
    ...(typeof record.googleTranslateApiKey === "string"
      ? { googleTranslateApiKey: record.googleTranslateApiKey }
      : {})
  };
}

function normalizeMigrationValue(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 16 * 1024 ? normalized : "";
}
