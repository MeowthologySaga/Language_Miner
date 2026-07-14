import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const safeStorageState = vi.hoisted(() => ({ available: true }));

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => safeStorageState.available,
    encryptString: (value: string) => Buffer.from(`encrypted:${value}`, "utf8"),
    decryptString: (value: Buffer) => {
      const decoded = value.toString("utf8");
      if (!decoded.startsWith("encrypted:")) throw new Error("Invalid encrypted value");
      return decoded.replace(/^encrypted:/, "");
    }
  }
}));

import { SecureSettingsVault } from "./secureSettingsVault";

const tempDirectories: string[] = [];

afterEach(() => {
  safeStorageState.available = true;
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function createVault() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lem-secure-settings-"));
  tempDirectories.push(directory);
  return { directory, vault: new SecureSettingsVault(directory) };
}

describe("SecureSettingsVault privacy controls", () => {
  it("encrypts missing values received from the isolated legacy-profile helper", () => {
    const { directory, vault } = createVault();

    const result = vault.completeLegacyProfileMigration({
      geminiApiKey: "legacy-gemini",
      googleTranslateApiKey: "legacy-google"
    });

    expect(result.attempted).toBe(true);
    expect(result.migrated).toBe(2);
    expect(result.status).toMatchObject({
      geminiApiKeyConfigured: true,
      googleTranslateApiKeyConfigured: true
    });
    expect(vault.get("geminiApiKey")).toBe("legacy-gemini");
    expect(vault.get("googleTranslateApiKey")).toBe("legacy-google");
    expect(fs.readFileSync(path.join(directory, "secure-settings.json"), "utf8")).not.toContain(
      "legacy-gemini"
    );
    expect(fs.existsSync(path.join(directory, "secure-settings-legacy-electron-v2.done"))).toBe(
      true
    );
  });

  it("never overwrites a current encrypted key during legacy profile migration", () => {
    const { vault } = createVault();
    vault.set({ geminiApiKey: "current-gemini" });

    const result = vault.completeLegacyProfileMigration({
      geminiApiKey: "legacy-gemini",
      googleTranslateApiKey: "legacy-google"
    });

    expect(result.migrated).toBe(1);
    expect(vault.get("geminiApiKey")).toBe("current-gemini");
    expect(vault.get("googleTranslateApiKey")).toBe("legacy-google");
  });

  it("does not replace a present but unreadable target entry", () => {
    const { directory, vault } = createVault();
    fs.writeFileSync(
      path.join(directory, "secure-settings.json"),
      JSON.stringify({ geminiApiKey: "present-but-corrupt" }),
      "utf8"
    );

    expect(vault.completeLegacyProfileMigration({ geminiApiKey: "legacy-gemini" }).migrated).toBe(
      0
    );
    expect(vault.get("geminiApiKey")).toBe("");
    expect(JSON.parse(fs.readFileSync(path.join(directory, "secure-settings.json"), "utf8"))).toEqual(
      { geminiApiKey: "present-but-corrupt" }
    );
  });

  it("does not resurrect a migrated key after the user clears it", () => {
    const { vault } = createVault();

    expect(vault.completeLegacyProfileMigration({ geminiApiKey: "legacy-gemini" }).migrated).toBe(1);
    vault.clear();
    expect(
      vault.completeLegacyProfileMigration({ geminiApiKey: "legacy-gemini" }).attempted
    ).toBe(false);
    expect(vault.get("geminiApiKey")).toBe("");
  });

  it("rejects empty and oversized helper values", () => {
    const { vault } = createVault();

    expect(
      vault.completeLegacyProfileMigration({
        geminiApiKey: "   ",
        googleTranslateApiKey: "x".repeat(16 * 1024 + 1)
      }).migrated
    ).toBe(0);
    expect(vault.get("geminiApiKey")).toBe("");
    expect(vault.get("googleTranslateApiKey")).toBe("");
  });

  it("waits to complete migration until OS encryption is available", () => {
    const { directory, vault } = createVault();
    safeStorageState.available = false;

    expect(vault.completeLegacyProfileMigration({ geminiApiKey: "legacy-gemini" }).attempted).toBe(
      false
    );
    expect(
      fs.existsSync(path.join(directory, "secure-settings-legacy-electron-v2.done"))
    ).toBe(false);
    expect(vault.get("geminiApiKey")).toBe("");

    safeStorageState.available = true;
    expect(vault.completeLegacyProfileMigration({ geminiApiKey: "legacy-gemini" }).migrated).toBe(1);
    expect(vault.get("geminiApiKey")).toBe("legacy-gemini");
  });

  it("removes persisted keys and stale encrypted temp files", () => {
    const { directory, vault } = createVault();
    vault.set({ geminiApiKey: "gemini-secret", googleTranslateApiKey: "google-secret" });
    fs.writeFileSync(
      path.join(directory, "secure-settings.json.previous.tmp"),
      "encrypted-remnant",
      "utf8"
    );

    const result = vault.clear();

    expect(result.removed).toBe(2);
    expect(result.status).toMatchObject({
      geminiApiKeyConfigured: false,
      googleTranslateApiKeyConfigured: false
    });
    expect(vault.get("geminiApiKey")).toBe("");
    expect(vault.get("googleTranslateApiKey")).toBe("");
    expect(fs.readdirSync(directory)).toEqual([]);
  });

  it("clears session-only keys without creating a plaintext file", () => {
    safeStorageState.available = false;
    const { directory, vault } = createVault();
    vault.set({ geminiApiKey: "session-secret" });

    expect(vault.get("geminiApiKey")).toBe("session-secret");
    expect(fs.existsSync(path.join(directory, "secure-settings.json"))).toBe(false);

    const result = vault.clear();
    expect(result.removed).toBe(1);
    expect(vault.get("geminiApiKey")).toBe("");
    expect(fs.existsSync(path.join(directory, "secure-settings.json"))).toBe(false);
  });

  it("verifies that encrypted settings and temporary remnants are gone", () => {
    const { directory, vault } = createVault();
    fs.writeFileSync(path.join(directory, "secure-settings.json"), "{}", "utf8");
    fs.writeFileSync(path.join(directory, "secure-settings.json.stale.tmp"), "private", "utf8");

    expect(vault.verifyCleared()).toMatchObject({ verified: false, remainingFiles: 2 });
    vault.clear();
    expect(vault.verifyCleared()).toEqual({
      verified: true,
      remainingKeys: 0,
      remainingFiles: 0
    });
  });

  it("reports a conflicting directory as a residual instead of traversing it", () => {
    const { directory, vault } = createVault();
    const conflictPath = path.join(directory, "secure-settings.json.blocked");
    fs.mkdirSync(conflictPath);
    fs.writeFileSync(path.join(conflictPath, "keep.txt"), "do not traverse", "utf8");

    vault.clear();

    expect(vault.verifyCleared()).toEqual({
      verified: false,
      remainingKeys: 0,
      remainingFiles: 1
    });
    expect(fs.readFileSync(path.join(conflictPath, "keep.txt"), "utf8")).toBe("do not traverse");
  });
});
