import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const safeStorageState = vi.hoisted(() => ({ available: true }));

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => safeStorageState.available,
    encryptString: (value: string) => Buffer.from(`encrypted:${value}`, "utf8"),
    decryptString: (value: Buffer) => value.toString("utf8").replace(/^encrypted:/, "")
  }
}));

import {
  findRecognizedLegacyDevelopmentUserDataPath,
  SecureSettingsPrivacyScope
} from "./legacySecureSettingsPrivacy";
import { SecureSettingsVault } from "./secureSettingsVault";

const roots: string[] = [];

afterEach(() => {
  safeStorageState.available = true;
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function createRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lem-legacy-secure-"));
  roots.push(root);
  return root;
}

describe("legacy secure settings privacy scope", () => {
  it("recognizes only a separate non-link Electron profile with the Language Miner database", () => {
    const appDataPath = createRoot();
    const legacyPath = path.join(appDataPath, "Electron");
    const currentPath = path.join(appDataPath, "Language Miner");
    fs.mkdirSync(legacyPath);
    fs.mkdirSync(currentPath);

    expect(
      findRecognizedLegacyDevelopmentUserDataPath({
        appDataPath,
        currentUserDataPath: currentPath,
        platform: "win32"
      })
    ).toBeNull();

    fs.writeFileSync(path.join(legacyPath, "local-english-miner.sqlite"), "database", "utf8");
    expect(
      findRecognizedLegacyDevelopmentUserDataPath({
        appDataPath,
        currentUserDataPath: currentPath,
        platform: "win32"
      })
    ).toBe(legacyPath);
    expect(
      findRecognizedLegacyDevelopmentUserDataPath({
        appDataPath,
        currentUserDataPath: legacyPath,
        platform: "win32"
      })
    ).toBeNull();
  });

  it("clears and verifies current and recognized legacy encrypted key copies together", () => {
    const root = createRoot();
    const currentPath = path.join(root, "Language Miner");
    const legacyPath = path.join(root, "Electron");
    const current = new SecureSettingsVault(currentPath);
    const legacy = new SecureSettingsVault(legacyPath);
    current.set({ geminiApiKey: "current-gemini" });
    legacy.set({ geminiApiKey: "legacy-gemini", googleTranslateApiKey: "legacy-google" });
    fs.writeFileSync(path.join(legacyPath, "local-english-miner.sqlite"), "keep-database", "utf8");
    const scope = new SecureSettingsPrivacyScope([current, legacy]);

    expect(scope.clear()).toEqual({ removed: 3 });
    expect(scope.verifyCleared()).toEqual({
      verified: true,
      remainingKeys: 0,
      remainingFiles: 0
    });
    expect(fs.existsSync(path.join(currentPath, "secure-settings.json"))).toBe(false);
    expect(fs.existsSync(path.join(legacyPath, "secure-settings.json"))).toBe(false);
    expect(current.isLegacyProfileMigrationComplete()).toBe(true);
    expect(fs.readFileSync(path.join(legacyPath, "local-english-miner.sqlite"), "utf8")).toBe(
      "keep-database"
    );
  });

  it("prevents a never-migrated legacy key from returning after clear and restart", () => {
    const root = createRoot();
    const currentPath = path.join(root, "Language Miner");
    const legacyPath = path.join(root, "Electron");
    const current = new SecureSettingsVault(currentPath);
    const legacy = new SecureSettingsVault(legacyPath);
    legacy.set({ geminiApiKey: "legacy-gemini" });

    const scope = new SecureSettingsPrivacyScope([current, legacy]);
    expect(scope.clear()).toEqual({ removed: 1 });
    expect(scope.verifyCleared()).toEqual({
      verified: true,
      remainingKeys: 0,
      remainingFiles: 0
    });

    const restartedCurrent = new SecureSettingsVault(currentPath);
    expect(restartedCurrent.isLegacyProfileMigrationComplete()).toBe(true);
    expect(
      restartedCurrent.completeLegacyProfileMigration({ geminiApiKey: "legacy-gemini" })
    ).toMatchObject({ attempted: false, migrated: 0 });
    expect(restartedCurrent.get("geminiApiKey")).toBe("");
  });

  it("keeps migration blocked when keys are cleared without safeStorage and it becomes available later", () => {
    const root = createRoot();
    const currentPath = path.join(root, "Language Miner");
    const current = new SecureSettingsVault(currentPath);
    safeStorageState.available = false;
    current.set({ geminiApiKey: "session-only-gemini" });

    const scope = new SecureSettingsPrivacyScope([current]);
    expect(scope.clear()).toEqual({ removed: 1 });
    expect(current.isLegacyProfileMigrationComplete()).toBe(true);

    safeStorageState.available = true;
    const restartedCurrent = new SecureSettingsVault(currentPath);
    expect(
      restartedCurrent.completeLegacyProfileMigration({ geminiApiKey: "legacy-gemini" })
    ).toMatchObject({ attempted: false, migrated: 0 });
    expect(restartedCurrent.get("geminiApiKey")).toBe("");
  });

  it("fails closed before clearing any vault when the current tombstone cannot be written", () => {
    const root = createRoot();
    const currentPath = path.join(root, "Language Miner");
    const current = new SecureSettingsVault(currentPath);
    current.set({ geminiApiKey: "keep-until-tombstone-is-durable" });
    const legacyClear = vi.fn(() => ({ removed: 1 }));
    const scope = new SecureSettingsPrivacyScope([
      current,
      {
        markLegacyProfileMigrationComplete: vi.fn(),
        isLegacyProfileMigrationComplete: () => false,
        clear: legacyClear,
        verifyCleared: () => ({ verified: true, remainingKeys: 0, remainingFiles: 0 })
      }
    ]);
    vi.spyOn(fs, "renameSync").mockImplementationOnce(() => {
      throw new Error("read-only marker destination");
    });

    expect(() => scope.clear()).toThrow("read-only marker destination");
    expect(legacyClear).not.toHaveBeenCalled();
    expect(current.get("geminiApiKey")).toBe("keep-until-tombstone-is-durable");
    expect(current.isLegacyProfileMigrationComplete()).toBe(false);
  });

  it("allows a key explicitly entered after deletion without reopening legacy migration", () => {
    const root = createRoot();
    const currentPath = path.join(root, "Language Miner");
    const current = new SecureSettingsVault(currentPath);
    const scope = new SecureSettingsPrivacyScope([current]);

    expect(scope.clear()).toEqual({ removed: 0 });
    current.set({ geminiApiKey: "new-explicit-key" });

    expect(current.get("geminiApiKey")).toBe("new-explicit-key");
    expect(current.isLegacyProfileMigrationComplete()).toBe(true);
    expect(
      current.completeLegacyProfileMigration({ geminiApiKey: "old-legacy-key" })
    ).toMatchObject({ attempted: false, migrated: 0 });
    expect(new SecureSettingsVault(currentPath).get("geminiApiKey")).toBe("new-explicit-key");
  });

  it("fails verification when either vault still reports a residual", () => {
    const scope = new SecureSettingsPrivacyScope([
      {
        markLegacyProfileMigrationComplete: () => undefined,
        isLegacyProfileMigrationComplete: () => true,
        clear: () => ({ removed: 1 }),
        verifyCleared: () => ({ verified: true, remainingKeys: 0, remainingFiles: 0 })
      },
      {
        markLegacyProfileMigrationComplete: () => undefined,
        isLegacyProfileMigrationComplete: () => true,
        clear: () => ({ removed: 0 }),
        verifyCleared: () => ({ verified: false, remainingKeys: 1, remainingFiles: 2 })
      }
    ]);

    expect(scope.clear()).toEqual({ removed: 1 });
    expect(scope.verifyCleared()).toEqual({
      verified: false,
      remainingKeys: 1,
      remainingFiles: 2
    });
  });

  it("still attempts later vaults and fails verification when a legacy clear throws", () => {
    const root = createRoot();
    const currentPath = path.join(root, "Language Miner");
    const current = new SecureSettingsVault(currentPath);
    const lockedLegacy = new SecureSettingsVault(path.join(root, "Electron"));
    const laterLegacy = new SecureSettingsVault(path.join(root, "Electron-later"));
    lockedLegacy.set({ geminiApiKey: "locked-legacy-key" });
    laterLegacy.set({
      geminiApiKey: "later-gemini",
      googleTranslateApiKey: "later-google"
    });
    const throwingLegacyClear = vi.spyOn(lockedLegacy, "clear").mockImplementation(() => {
      throw new Error("locked");
    });
    const laterLegacyClear = vi.spyOn(laterLegacy, "clear");
    const scope = new SecureSettingsPrivacyScope([current, lockedLegacy, laterLegacy]);

    expect(scope.clear()).toEqual({ removed: 2 });
    expect(throwingLegacyClear).toHaveBeenCalledOnce();
    expect(laterLegacyClear).toHaveBeenCalledOnce();
    expect(current.isLegacyProfileMigrationComplete()).toBe(true);
    expect(scope.verifyCleared()).toEqual({
      verified: false,
      remainingKeys: 1,
      remainingFiles: 1
    });
    expect(
      new SecureSettingsVault(currentPath).completeLegacyProfileMigration({
        geminiApiKey: "locked-legacy-key"
      })
    ).toMatchObject({ attempted: false, migrated: 0 });
  });

  it("does not verify zero residuals without the current tombstone", () => {
    const scope = new SecureSettingsPrivacyScope([
      {
        markLegacyProfileMigrationComplete: () => undefined,
        isLegacyProfileMigrationComplete: () => false,
        clear: () => ({ removed: 0 }),
        verifyCleared: () => ({ verified: true, remainingKeys: 0, remainingFiles: 0 })
      }
    ]);

    expect(scope.verifyCleared()).toEqual({
      verified: false,
      remainingKeys: 0,
      remainingFiles: 0
    });
  });
});
