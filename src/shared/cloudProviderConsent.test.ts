import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../appSettings";
import {
  CloudProviderConsentRequiredError,
  assertCloudProviderConsent,
  attachRendererCloudConsent,
  createCloudProviderConsentRecord,
  disconnectLegacyCloudSettings,
  getCloudProviderConsentStorageKey,
  getCloudOperationConsentStorageKey,
  readCloudProviderConsent,
  recordCloudProviderConsent,
  recordCloudOperationConsent
} from "./cloudProviderConsent";

function createMemoryStorage(entries: Array<[string, string]> = []) {
  const values = new Map(entries);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value)
  };
}

describe("cloud provider consent records", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("writes and reads a valid version 1 consent record", () => {
    const storage = createMemoryStorage();
    const recorded = recordCloudProviderConsent(storage, {
      provider: "gemini",
      keyStorage: "safeStorage",
      acceptedAt: "2026-07-14T00:00:00.000Z"
    });

    expect(recorded).toEqual({
      version: 1,
      provider: "gemini",
      acceptedAt: "2026-07-14T00:00:00.000Z",
      keyStorage: "safeStorage",
      costAcknowledged: true,
      externalTransferAcknowledged: true
    });
    expect(readCloudProviderConsent(storage, "gemini")).toEqual(recorded);
    expect(() => assertCloudProviderConsent("gemini", recorded)).not.toThrow();
  });

  it("records the versioned operation approval used by the common preflight", () => {
    const storage = createMemoryStorage();
    const recorded = recordCloudOperationConsent(
      storage,
      "remoteOllama",
      "2026-07-14T01:00:00.000Z"
    );

    expect(recorded).toEqual({
      version: 1,
      provider: "remoteOllama",
      acceptedAt: "2026-07-14T01:00:00.000Z"
    });
    expect(
      JSON.parse(storage.getItem(getCloudOperationConsentStorageKey("remoteOllama")) ?? "null")
    ).toEqual(recorded);
  });

  it.each([
    [
      "legacy",
      JSON.stringify({
        provider: "gemini",
        acceptedAt: "2026-07-14T00:00:00.000Z",
        keyStorage: "safeStorage",
        costAcknowledged: true,
        externalTransferAcknowledged: true
      })
    ],
    ["malformed", "{not-json"],
    [
      "mismatched provider",
      JSON.stringify(
        createCloudProviderConsentRecord({
          provider: "google",
          keyStorage: "session",
          acceptedAt: "2026-07-14T00:00:00.000Z"
        })
      )
    ]
  ])("rejects a %s record", (_label, rawRecord) => {
    const storage = createMemoryStorage([
      [getCloudProviderConsentStorageKey("gemini"), rawRecord]
    ]);

    const result = readCloudProviderConsent(storage, "gemini");

    expect(result).toBeNull();
    expect(() => assertCloudProviderConsent("gemini", result)).toThrow(
      CloudProviderConsentRequiredError
    );
  });

  it("fails legacy Gemini card and translation settings closed without consent", () => {
    const settings = {
      ...defaultSettings,
      providerName: "gemini" as const,
      translationProviderName: "gemini" as const
    };

    expect(disconnectLegacyCloudSettings(settings, createMemoryStorage())).toMatchObject({
      providerName: "mock",
      translationProviderName: "localMt"
    });
  });

  it("fails legacy Google translation settings closed without consent", () => {
    const settings = {
      ...defaultSettings,
      translationProviderName: "google" as const
    };

    expect(disconnectLegacyCloudSettings(settings, createMemoryStorage())).toMatchObject({
      providerName: settings.providerName,
      translationProviderName: "localMt"
    });
  });

  it("preserves cloud settings when the matching provider consents are valid", () => {
    const storage = createMemoryStorage();
    recordCloudProviderConsent(storage, {
      provider: "gemini",
      keyStorage: "safeStorage",
      acceptedAt: "2026-07-14T00:00:00.000Z"
    });
    recordCloudProviderConsent(storage, {
      provider: "google",
      keyStorage: "session",
      acceptedAt: "2026-07-14T00:00:00.000Z"
    });
    const geminiSettings = {
      ...defaultSettings,
      providerName: "gemini" as const,
      translationProviderName: "gemini" as const
    };
    const googleSettings = {
      ...geminiSettings,
      translationProviderName: "google" as const
    };

    expect(disconnectLegacyCloudSettings(geminiSettings, storage)).toBe(geminiSettings);
    expect(disconnectLegacyCloudSettings(googleSettings, storage)).toBe(googleSettings);
  });

  it("attaches matching consent from renderer localStorage", () => {
    const storage = createMemoryStorage();
    const consent = recordCloudProviderConsent(storage, {
      provider: "gemini",
      keyStorage: "safeStorage",
      acceptedAt: "2026-07-14T00:00:00.000Z"
    });
    vi.stubGlobal("window", { localStorage: storage });

    expect(
      attachRendererCloudConsent({
        providerName: "gemini",
        text: "Hello"
      })
    ).toEqual({
      providerName: "gemini",
      text: "Hello",
      cloudConsent: consent
    });
  });

  it("blocks renderer cloud requests without valid matching consent", () => {
    vi.stubGlobal("window", { localStorage: createMemoryStorage() });

    expect(() =>
      attachRendererCloudConsent({
        providerName: "google",
        text: "Hello"
      })
    ).toThrow(CloudProviderConsentRequiredError);
  });

  it("does not require cloud consent for a local translation provider", () => {
    const input = { providerName: "localMt" as const, text: "Hello" };

    expect(attachRendererCloudConsent(input)).toBe(input);
  });
});
