import { describe, expect, it, vi } from "vitest";
import {
  persistSecureSettingsSafely,
  prepareSecureSettings,
  resolveSecureSettingsHydration,
  settingsForLocalStorage
} from "./secureSettingsPersistence";

const legacyKeys = {
  geminiApiKey: "legacy-gemini",
  googleTranslateApiKey: "legacy-google"
};

describe("secure settings persistence", () => {
  it("keeps keys session-only and skips migration when encryption is unavailable", async () => {
    const client = {
      getStatus: vi.fn().mockResolvedValue({
        available: false,
        geminiApiKeyConfigured: false,
        googleTranslateApiKeyConfigured: false
      }),
      migrateLegacy: vi.fn(),
      getForSession: vi.fn()
    };
    await expect(prepareSecureSettings(client, () => legacyKeys)).resolves.toEqual({
      available: false
    });
    expect(client.migrateLegacy).not.toHaveBeenCalled();
    expect(client.getForSession).not.toHaveBeenCalled();
    expect(settingsForLocalStorage(legacyKeys, false)).toEqual({
      geminiApiKey: "",
      googleTranslateApiKey: ""
    });
  });

  it("migrates before reading the encrypted session values", async () => {
    const order: string[] = [];
    const sessionKeys = {
      geminiApiKey: "vault-gemini",
      googleTranslateApiKey: "vault-google"
    };
    const client = {
      getStatus: vi.fn(async () => {
        order.push("status");
        return {
          available: true,
          geminiApiKeyConfigured: false,
          googleTranslateApiKeyConfigured: false
        };
      }),
      migrateLegacy: vi.fn(async () => {
        order.push("migrate");
        return {
          available: true,
          geminiApiKeyConfigured: true,
          googleTranslateApiKeyConfigured: true
        };
      }),
      getForSession: vi.fn(async () => {
        order.push("session");
        return sessionKeys;
      })
    };

    await expect(
      prepareSecureSettings(client, () => legacyKeys)
    ).resolves.toEqual({ available: true, legacyKeys, sessionKeys });
    expect(order).toEqual(["status", "migrate", "session"]);
    expect(settingsForLocalStorage(legacyKeys, true)).toEqual({
      geminiApiKey: "",
      googleTranslateApiKey: ""
    });
  });

  it("does not claim persistence when encryption becomes unavailable during migration", async () => {
    const client = {
      getStatus: vi.fn().mockResolvedValue({
        available: true,
        geminiApiKeyConfigured: false,
        googleTranslateApiKeyConfigured: false
      }),
      migrateLegacy: vi.fn().mockResolvedValue({
        available: false,
        geminiApiKeyConfigured: true,
        googleTranslateApiKeyConfigured: true
      }),
      getForSession: vi.fn()
    };

    await expect(prepareSecureSettings(client, () => legacyKeys)).resolves.toEqual({
      available: false
    });
    expect(client.getForSession).not.toHaveBeenCalled();
  });

  it("strips the local copy only after the secure write succeeds", async () => {
    let finishWrite: (() => void) | undefined;
    const client = {
      set: vi.fn(
        () =>
          new Promise<{
            available: boolean;
            geminiApiKeyConfigured: boolean;
            googleTranslateApiKeyConfigured: boolean;
          }>((resolve) => {
            finishWrite = () =>
              resolve({
                available: true,
                geminiApiKeyConfigured: true,
                googleTranslateApiKeyConfigured: true
              });
          })
      )
    };

    const pending = persistSecureSettingsSafely(client, legacyKeys);
    expect(client.set).toHaveBeenCalledWith(legacyKeys);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    finishWrite?.();
    await expect(pending).resolves.toEqual({
      encryptionSucceeded: true,
      localValue: { geminiApiKey: "", googleTranslateApiKey: "" }
    });
  });

  it("never returns a plaintext fallback when the secure write fails", async () => {
    const error = new Error("disk full");
    const client = { set: vi.fn().mockRejectedValue(error) };
    await expect(persistSecureSettingsSafely(client, legacyKeys)).resolves.toEqual({
      encryptionSucceeded: false,
      localValue: { geminiApiKey: "", googleTranslateApiKey: "" },
      error
    });
  });

  it("treats a resolved but unavailable vault as session-only", async () => {
    const client = {
      set: vi.fn().mockResolvedValue({
        available: false,
        geminiApiKeyConfigured: true,
        googleTranslateApiKeyConfigured: true
      })
    };

    const result = await persistSecureSettingsSafely(client, legacyKeys);

    expect(result.encryptionSucceeded).toBe(false);
    expect(result.localValue).toEqual({
      geminiApiKey: "",
      googleTranslateApiKey: ""
    });
    expect(String("error" in result ? result.error : "")).toContain("session only");
  });

  it("keeps an intentional empty-key edit made during migration", () => {
    expect(
      resolveSecureSettingsHydration(
        { geminiApiKey: "old-gemini", googleTranslateApiKey: "old-google" },
        { geminiApiKey: "", googleTranslateApiKey: "" }
      )
    ).toEqual({ geminiApiKey: "", googleTranslateApiKey: "" });
  });
});
