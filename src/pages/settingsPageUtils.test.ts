import { describe, expect, it } from "vitest";
import type { AppSettings, LearningProfileRecord } from "../shared/types";
import {
  createProfilePreset,
  getBrowserTranslatorApi,
  getProfileInitials,
  getSettingsStatusClassName,
  hasConfiguredCardSyncFolder,
  normalizeCardSyncPrerequisites,
  normalizeTranslatorLanguage,
  shouldResetCardConnectionStatus,
  shouldResetTranslationConnectionStatus
} from "./settingsPageUtils";

const sampleLearningProfile = {
  targetLanguage: { code: "en", nameKo: "영어", nameEn: "English" },
  nativeLanguage: { code: "ko", nameKo: "한국어", nameEn: "Korean" }
};

describe("settingsPageUtils", () => {
  it("classifies status messages without leaking UI decisions into SettingsPage", () => {
    expect(getSettingsStatusClassName("연결 실패")).toBe("status-text danger");
    expect(getSettingsStatusClassName("다운로드 확인 중")).toBe("status-text pending");
    expect(getSettingsStatusClassName("연결 성공")).toBe("status-text");
  });

  it("normalizes translator language text", () => {
    expect(normalizeTranslatorLanguage(" en ", "ko")).toBe("en");
    expect(normalizeTranslatorLanguage("   ", "ko")).toBe("ko");
  });

  it("creates and labels profile presets", () => {
    const profile = createProfilePreset(
      3,
      { learningProfile: sampleLearningProfile } as AppSettings,
      "새 프로필 3"
    );

    expect(profile.id).toMatch(/^profile-\d+-[a-z0-9]+$/);
    expect(profile.name).toBe("새 프로필 3");
    expect(profile.learningProfile).toEqual(sampleLearningProfile);
    expect(getProfileInitials(profile)).toBe("EN");
    expect(getProfileInitials(undefined)).toBe("??");
    expect(
      getProfileInitials({
        ...profile,
        learningProfile: {
          ...sampleLearningProfile,
          targetLanguage: { code: " zh ", nameKo: "중국어", nameEn: "Chinese" }
        }
      } satisfies LearningProfileRecord)
    ).toBe("ZH");
  });

  it("returns the browser Translator API only when availability exists", () => {
    const previousTranslator = (globalThis as { Translator?: unknown }).Translator;
    try {
      (globalThis as { Translator?: unknown }).Translator = {};
      expect(getBrowserTranslatorApi()).toBeUndefined();

      const translator = { availability: async () => "available" as const };
      (globalThis as { Translator?: unknown }).Translator = translator;
      expect(getBrowserTranslatorApi()).toBe(translator);
    } finally {
      (globalThis as { Translator?: unknown }).Translator = previousTranslator;
    }
  });

  it("invalidates only the connection status affected by changed AI settings", () => {
    const settings = {
      providerName: "ollama",
      translationProviderName: "localMt",
      ollamaBaseUrl: "http://127.0.0.1:11434",
      ollamaModel: "gemma4:12b",
      geminiApiKey: "key",
      geminiModel: "gemini-2.5-flash",
      googleTranslateApiKey: "google-key",
      localMtModel: "model"
    } as AppSettings;

    expect(shouldResetCardConnectionStatus(settings, { ollamaModel: "other" })).toBe(true);
    expect(shouldResetCardConnectionStatus(settings, { localMtModel: "other" })).toBe(false);
    expect(shouldResetTranslationConnectionStatus(settings, { localMtModel: "other" })).toBe(true);
  });

  it("turns automatic sync off when the sync folder is cleared", () => {
    const settings = {
      cardSyncFolderPath: "C:\\Cards",
      cardSyncOnStartup: true,
      cardSyncOnQuit: true
    } as AppSettings;

    expect(hasConfiguredCardSyncFolder("  ")).toBe(false);
    expect(normalizeCardSyncPrerequisites(settings, { cardSyncFolderPath: "  " })).toMatchObject({
      cardSyncFolderPath: "",
      cardSyncOnStartup: false,
      cardSyncOnQuit: false
    });
  });
});
