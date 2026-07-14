import fs from "node:fs";
import path from "node:path";

type SecureSettingsPrivacyVault = {
  markLegacyProfileMigrationComplete(): void;
  isLegacyProfileMigrationComplete(): boolean;
  clear(): { removed: number };
  verifyCleared(): { verified: boolean; remainingKeys: number; remainingFiles: number };
};

export class SecureSettingsPrivacyScope {
  constructor(private readonly vaults: readonly SecureSettingsPrivacyVault[]) {
    if (vaults.length === 0) {
      throw new Error("At least one secure settings vault is required.");
    }
  }

  clear() {
    // The first vault is always the current userData vault. Persist the migration
    // tombstone before deleting any current or legacy copy so a later startup can
    // never re-import a key from a legacy profile. Failure here is intentionally
    // fatal: clearing without the durable tombstone could resurrect the key.
    this.vaults[0].markLegacyProfileMigrationComplete();

    let removed = 0;
    // Privacy deletion is best-effort across every recognized vault. One damaged or
    // locked legacy file must not prevent the current vault (or another legacy copy)
    // from being cleared. verifyCleared() below remains the source of truth.
    for (const vault of this.vaults) {
      try {
        removed += vault.clear().removed;
      } catch {
        // Verification reports an inaccessible vault as a remaining file.
      }
    }
    return {
      removed
    };
  }

  verifyCleared() {
    let currentTombstonePresent = false;
    try {
      currentTombstonePresent = this.vaults[0].isLegacyProfileMigrationComplete();
    } catch {
      currentTombstonePresent = false;
    }
    const results = this.vaults.map((vault) => {
      try {
        return vault.verifyCleared();
      } catch {
        return { verified: false, remainingKeys: 0, remainingFiles: 1 };
      }
    });
    return {
      verified: currentTombstonePresent && results.every((result) => result.verified),
      remainingKeys: results.reduce((total, result) => total + result.remainingKeys, 0),
      remainingFiles: results.reduce((total, result) => total + result.remainingFiles, 0)
    };
  }
}

export function findRecognizedLegacyDevelopmentUserDataPath(input: {
  appDataPath: string;
  currentUserDataPath: string;
  platform?: NodeJS.Platform;
}) {
  if ((input.platform ?? process.platform) !== "win32") return null;

  const appDataPath = path.resolve(input.appDataPath);
  const legacyUserDataPath = path.resolve(appDataPath, "Electron");
  if (legacyUserDataPath === path.resolve(input.currentUserDataPath)) return null;

  try {
    const appDataStat = fs.lstatSync(appDataPath);
    const legacyStat = fs.lstatSync(legacyUserDataPath);
    if (
      !appDataStat.isDirectory() ||
      appDataStat.isSymbolicLink() ||
      !legacyStat.isDirectory() ||
      legacyStat.isSymbolicLink()
    ) {
      return null;
    }

    const canonicalAppData = fs.realpathSync(appDataPath);
    const canonicalLegacy = fs.realpathSync(legacyUserDataPath);
    if (!isPathInside(canonicalLegacy, canonicalAppData)) return null;

    const languageMinerDatabasePath = path.join(legacyUserDataPath, "local-english-miner.sqlite");
    const databaseStat = fs.lstatSync(languageMinerDatabasePath);
    if (!databaseStat.isFile() || databaseStat.isSymbolicLink()) return null;
    const canonicalDatabase = fs.realpathSync(languageMinerDatabasePath);
    if (!isPathInside(canonicalDatabase, canonicalLegacy)) return null;

    return legacyUserDataPath;
  } catch {
    return null;
  }
}

function isPathInside(candidatePath: string, rootPath: string) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}
