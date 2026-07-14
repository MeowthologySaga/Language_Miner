import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultSettings,
  normalizeBrowserCaptureSiteSettings,
  normalizeStoredProviderName,
  readAppSettings
} from "./appSettings";

describe("privacy-safe app settings defaults", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("keeps automatic browser capture fully opt-in", () => {
    expect(defaultSettings.providerName).toBe("mock");
    expect(defaultSettings.geminiApiKey).toBe("");
    expect(defaultSettings.googleTranslateApiKey).toBe("");
    expect(defaultSettings.lifeMiningCaptureSettings.enabled).toBe(false);
    expect(Object.values(defaultSettings.browserCaptureSiteSettings)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false
    ]);
    expect(normalizeBrowserCaptureSiteSettings()).toEqual(
      defaultSettings.browserCaptureSiteSettings
    );
  });

  it("preserves explicitly enabled sites without enabling unspecified sites", () => {
    expect(
      normalizeBrowserCaptureSiteSettings({
        discord: true,
        chatgpt: false
      })
    ).toEqual({
      discord: true,
      chatgpt: false,
      claude: false,
      youtube: false,
      reddit: false,
      genericWeb: false
    });
  });

  it("migrates legacy provider class names to stable setting ids", () => {
    expect(normalizeStoredProviderName("GeminiProvider")).toBe("gemini");
    expect(normalizeStoredProviderName("OllamaProvider")).toBe("ollama");
    expect(normalizeStoredProviderName("MockProvider")).toBe("mock");
    expect(normalizeStoredProviderName("ManualChatGptWebProvider")).toBe("chatgptWeb");
  });

  it("disables startup card sync once when migrating to finalized default templates", () => {
    const storage = new Map<string, string>([
      [
        "lem:settings",
        JSON.stringify({
          ...defaultSettings,
          cardSyncFolderPath: "D:/LanguageMinerSync",
          cardSyncOnStartup: true
        })
      ]
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value)
    });

    const migrated = readAppSettings();

    expect(migrated.cardSyncFolderPath).toBe("D:/LanguageMinerSync");
    expect(migrated.cardSyncOnStartup).toBe(false);
    expect(storage.get("lem:migrations:final-card-templates-disable-startup-sync-v1")).toBe("1");
  });

  it.each([undefined, "{malformed"])(
    "disconnects legacy cloud providers without valid versioned consent (%s)",
    (storedConsent) => {
      const storage = new Map<string, string>([
        [
          "lem:settings",
          JSON.stringify({
            ...defaultSettings,
            providerName: "gemini",
            translationProviderName: "google"
          })
        ],
        ["lem:migrations:final-card-templates-disable-startup-sync-v1", "1"]
      ]);
      if (storedConsent !== undefined) {
        storage.set("lem:cloudConsent:v1:gemini", storedConsent);
        storage.set("lem:cloudConsent:v1:google", storedConsent);
      }
      vi.stubGlobal("localStorage", {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value)
      });

      const migrated = readAppSettings();

      expect(migrated.providerName).toBe("mock");
      expect(migrated.translationProviderName).toBe("localMt");
      expect(JSON.parse(storage.get("lem:settings") ?? "{}")).toMatchObject({
        providerName: "mock",
        translationProviderName: "localMt"
      });
    }
  );
});
