import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "./appSettings";
import type { LocalEnglishMinerApi } from "./data/api";
import { createProfiledApi } from "./profiledApi";
import { createTranslationUsageEvent, estimateTranslationUsage } from "./shared/translationUsage";
import { recordCloudProviderConsent } from "./shared/cloudProviderConsent";
import type { AppSettings, StudyCard, TranslateTextResult } from "./shared/types";
import { readTranslationUsageEvents } from "./utils/translationUsageLedger";

const japaneseSettings: AppSettings = {
  ...defaultSettings,
  profileId: "profile-ja",
  learningProfile: {
    targetLanguage: { code: "ja", nameKo: "일본어", nameEn: "Japanese" },
    nativeLanguage: { code: "ko", nameKo: "한국어", nameEn: "Korean" }
  }
};

describe("createProfiledApi input language guard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("switches to a detected-language profile when the accessible resolver chooses switch", async () => {
    const switchToLanguageProfile = vi.fn(() => true);
    const resolveInputLanguageMismatch = vi.fn(async () => "switch" as const);

    const rawSave = vi.fn();
    const api = createProfiledApi(
      {
        cards: {
          save: rawSave
        }
      } as unknown as LocalEnglishMinerApi,
      "profile-ja",
      japaneseSettings,
      { switchToLanguageProfile, resolveInputLanguageMismatch }
    );

    await expect(api.cards.save(makeReadingCard())).rejects.toThrow();
    expect(resolveInputLanguageMismatch).toHaveBeenCalledWith(
      expect.objectContaining({ expectedLanguageCode: "ja", detectedLanguageCode: "en" })
    );
    expect(switchToLanguageProfile).toHaveBeenCalledWith("en");
    expect(rawSave).not.toHaveBeenCalled();
  });

  it("never falls back to browser-native prompt or alert without a mismatch resolver", async () => {
    const prompt = vi.fn();
    const alert = vi.fn();
    vi.stubGlobal("window", { prompt, alert });
    const rawSave = vi.fn();
    const api = createProfiledApi(
      { cards: { save: rawSave } } as unknown as LocalEnglishMinerApi,
      "profile-ja",
      japaneseSettings
    );

    await expect(api.cards.save(makeReadingCard())).rejects.toThrow();
    expect(prompt).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
    expect(rawSave).not.toHaveBeenCalled();
  });

  it("preserves translated-page source metadata when the card matches the profile", async () => {
    const rawSave = vi.fn(async (card: StudyCard) => card);
    const api = createProfiledApi(
      {
        cards: {
          save: rawSave
        }
      } as unknown as LocalEnglishMinerApi,
      "profile-ja",
      japaneseSettings
    );
    const card: StudyCard = {
      ...makeReadingCard(),
      sourceSentence: "これは翻訳ページから選んだ日本語の文です。",
      frontText: "これは翻訳ページから選んだ日本語の文です。",
      languageMetadata: {
        profileTargetLanguageCode: "ja",
        profileNativeLanguageCode: "ko",
        detectedSourceLanguageCode: "ja",
        actualSourceLanguageCode: "ja",
        confidence: 1,
        policyStatus: "match",
        sourceKind: "translated_page"
      }
    } satisfies StudyCard;

    await api.cards.save(card);

    expect(rawSave).toHaveBeenCalledWith(
      expect.objectContaining({
        languageMetadata: expect.objectContaining({
          policyStatus: "match",
          sourceKind: "translated_page"
        })
      }),
      "profile-ja"
    );
  });

  it("binds paginated card reads to the active profile", async () => {
    const rawListPage = vi.fn(async () => ({ items: [], total: 0, offset: 0, limit: 25 }));
    const api = createProfiledApi(
      {
        cards: { listPage: rawListPage }
      } as unknown as LocalEnglishMinerApi,
      "profile-ja",
      japaneseSettings
    );

    await api.cards.listPage("ignored-profile", 50, 25);

    expect(rawListPage).toHaveBeenCalledWith("profile-ja", 50, 25);
  });

  it("skips pre-generated TTS while seeding bundled sample cards", async () => {
    const rawSave = vi.fn(async (card: StudyCard) => card);
    const synthesize = vi.fn(async () => {
      throw new Error("Bundled samples must not wait for TTS synthesis.");
    });
    const settings: AppSettings = {
      ...defaultSettings,
      preGenerateCardTts: true,
      ttsProviderName: "system"
    };
    const api = createProfiledApi(
      {
        cards: { save: rawSave },
        tts: { synthesize }
      } as unknown as LocalEnglishMinerApi,
      settings.profileId,
      settings
    );
    const card: StudyCard = {
      ...makeReadingCard(),
      id: `sample:${settings.profileId}:input-reading:final-template:v2`,
      profileId: settings.profileId,
      languageMetadata: {
        profileTargetLanguageCode: "en",
        profileNativeLanguageCode: "ko",
        detectedSourceLanguageCode: "en",
        actualSourceLanguageCode: "en",
        confidence: 1,
        policyStatus: "match" as const,
        sourceKind: "original" as const
      }
    };

    await api.cards.save(card);

    expect(synthesize).not.toHaveBeenCalled();
    expect(rawSave).toHaveBeenCalledOnce();
  });
});

describe("createProfiledApi usage tracking", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("records translation usage returned by the underlying API", async () => {
    const dispatchEvent = vi.fn();
    installMemoryLocalStorage();
    vi.stubGlobal("window", { dispatchEvent });
    const usage = createTranslationUsageEvent({
      profileId: "profile-ja",
      providerName: "local",
      model: "gemma3:12b",
      sourceLang: "ja",
      targetLang: "ko",
      usage: {
        inputTokens: 120,
        outputTokens: 80,
        totalTokens: 200,
        billableCharacters: 0,
        requestCount: 1,
        cacheHitCount: 0,
        cacheMissCount: 1
      }
    });
    const rawTranslate = vi.fn(async (): Promise<TranslateTextResult> => ({
      translatedText: "번역",
      providerName: "local",
      sourceLang: "ja",
      targetLang: "ko",
      cacheStatus: "miss",
      usage,
      createdAt: usage.createdAt,
      updatedAt: usage.createdAt
    }));
    const api = createProfiledApi(
      {
        translations: {
          translate: rawTranslate
        }
      } as unknown as LocalEnglishMinerApi,
      "profile-ja",
      japaneseSettings
    );

    await api.translations.translate({
      text: "こんにちは",
      providerName: "local",
      sourceLang: "ja",
      targetLang: "ko"
    });

    expect(rawTranslate).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: "profile-ja"
      })
    );
    expect(readTranslationUsageEvents()).toHaveLength(1);
    expect(readTranslationUsageEvents()[0]).toMatchObject({
      profileId: "profile-ja",
      providerName: "local",
      model: "gemma3:12b"
    });
    expect(dispatchEvent).toHaveBeenCalled();
  });

  it("records successful translation connection tests", async () => {
    installMemoryLocalStorage();
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    const api = createProfiledApi(
      {
        translations: {
          testConnection: vi.fn(async () => ({
            ok: true,
            code: "connected",
            providerName: "local",
            model: "gemma3:12b"
          }))
        }
      } as unknown as LocalEnglishMinerApi,
      "profile-ja",
      japaneseSettings
    );

    await api.translations.testConnection({
      providerName: "local",
      ollamaModel: "gemma3:12b"
    });

    expect(readTranslationUsageEvents()).toHaveLength(1);
    expect(readTranslationUsageEvents()[0]).toMatchObject({
      profileId: "profile-ja",
      providerName: "local",
      model: "gemma3:12b"
    });
  });

  it("blocks a translation before the API call when cumulative usage would exceed the limit", async () => {
    const localStorage = installMemoryLocalStorage();
    recordCloudProviderConsent(localStorage, {
      provider: "gemini",
      keyStorage: "session",
      acceptedAt: "2026-07-14T00:00:00.000Z"
    });
    vi.stubGlobal("window", { dispatchEvent: vi.fn(), localStorage });
    const settings = {
      ...japaneseSettings,
      dailyAppTokenLimit: 500,
      stopOnFreeTierLimit: true
    };
    recordUsageForBudget(settings.profileId, 499);
    const rawTranslate = vi.fn();
    const api = createProfiledApi(
      {
        translations: { translate: rawTranslate }
      } as unknown as LocalEnglishMinerApi,
      settings.profileId,
      settings
    );

    await expect(
      api.translations.translate({
        text: "This request must not reach the paid provider.",
        providerName: "gemini",
        sourceLang: "en",
        targetLang: "ko"
      })
    ).rejects.toThrow("일일 한도");
    expect(rawTranslate).not.toHaveBeenCalled();
  });

  it("reserves the full Gemini text retry ceiling before calling the API", async () => {
    const localStorage = installMemoryLocalStorage();
    recordCloudProviderConsent(localStorage, {
      provider: "gemini",
      keyStorage: "session",
      acceptedAt: "2026-07-14T00:00:00.000Z"
    });
    vi.stubGlobal("window", { dispatchEvent: vi.fn(), localStorage });
    const text = "Reserve enough usage for every possible Gemini retry.";
    const singleAttempt = estimateTranslationUsage({
      texts: [{ text, cacheStatus: "miss" }],
      providerName: "gemini",
      model: japaneseSettings.geminiModel,
      plan: japaneseSettings.geminiPlan,
      sourceLang: "en",
      targetLang: "ko",
      dailyAppTokenLimit: japaneseSettings.dailyAppTokenLimit,
      monthlySpendLimitKrw: japaneseSettings.monthlySpendLimitKrw
    });
    const settings = {
      ...japaneseSettings,
      dailyAppTokenLimit: Math.ceil(singleAttempt.totalTokens.max * 2),
      stopOnFreeTierLimit: true
    };
    const rawTranslate = vi.fn();
    const api = createProfiledApi(
      { translations: { translate: rawTranslate } } as unknown as LocalEnglishMinerApi,
      settings.profileId,
      settings
    );

    await expect(
      api.translations.translate({
        text,
        providerName: "gemini",
        sourceLang: "en",
        targetLang: "ko"
      })
    ).rejects.toThrow();

    expect(singleAttempt.totalTokens.max).toBeGreaterThan(0);
    expect(rawTranslate).not.toHaveBeenCalled();
  });

  it("reserves the full Gemini PDF batch ceiling before calling the API", async () => {
    const localStorage = installMemoryLocalStorage();
    recordCloudProviderConsent(localStorage, {
      provider: "gemini",
      keyStorage: "session",
      acceptedAt: "2026-07-14T00:00:00.000Z"
    });
    vi.stubGlobal("window", { dispatchEvent: vi.fn(), localStorage });
    const text = "A PDF segment that may require retries, repair, and fallback prompts.";
    const singleAttempt = estimateTranslationUsage({
      texts: [{ text, cacheStatus: "miss" }],
      providerName: "gemini",
      model: japaneseSettings.geminiModel,
      plan: japaneseSettings.geminiPlan,
      sourceLang: "en",
      targetLang: "ko",
      dailyAppTokenLimit: japaneseSettings.dailyAppTokenLimit,
      monthlySpendLimitKrw: japaneseSettings.monthlySpendLimitKrw
    });
    const settings = {
      ...japaneseSettings,
      dailyAppTokenLimit: Math.ceil(singleAttempt.totalTokens.max * 4),
      stopOnFreeTierLimit: true
    };
    const rawTranslatePdf = vi.fn();
    const api = createProfiledApi(
      {
        translations: { translatePdfSegments: rawTranslatePdf }
      } as unknown as LocalEnglishMinerApi,
      settings.profileId,
      settings
    );

    await expect(
      api.translations.translatePdfSegments({
        segments: [{ id: "segment-1", pageNumber: 1, index: 0, text }],
        providerName: "gemini",
        sourceLang: "en",
        targetLang: "ko"
      })
    ).rejects.toThrow();

    expect(singleAttempt.totalTokens.max).toBeGreaterThan(0);
    expect(rawTranslatePdf).not.toHaveBeenCalled();
  });

  it("reserves the full Gemini connection-test retry ceiling before calling the API", async () => {
    const localStorage = installMemoryLocalStorage();
    recordCloudProviderConsent(localStorage, {
      provider: "gemini",
      keyStorage: "session",
      acceptedAt: "2026-07-14T00:00:00.000Z"
    });
    vi.stubGlobal("window", { dispatchEvent: vi.fn(), localStorage });
    const text = "Translation engine connection test.";
    const singleAttempt = estimateTranslationUsage({
      texts: [{ text, cacheStatus: "miss" }],
      providerName: "gemini",
      model: japaneseSettings.geminiModel,
      plan: japaneseSettings.geminiPlan,
      sourceLang: japaneseSettings.learningProfile.targetLanguage.code,
      targetLang: japaneseSettings.learningProfile.nativeLanguage.code,
      dailyAppTokenLimit: japaneseSettings.dailyAppTokenLimit,
      monthlySpendLimitKrw: japaneseSettings.monthlySpendLimitKrw
    });
    const settings = {
      ...japaneseSettings,
      dailyAppTokenLimit: Math.ceil(singleAttempt.totalTokens.max * 2),
      stopOnFreeTierLimit: true
    };
    const rawTestConnection = vi.fn();
    const api = createProfiledApi(
      {
        translations: { testConnection: rawTestConnection }
      } as unknown as LocalEnglishMinerApi,
      settings.profileId,
      settings
    );

    await expect(
      api.translations.testConnection({
        providerName: "gemini",
        geminiApiKey: "test-key",
        geminiModel: settings.geminiModel
      })
    ).rejects.toThrow();

    expect(singleAttempt.totalTokens.max).toBeGreaterThan(0);
    expect(rawTestConnection).not.toHaveBeenCalled();
  });
});

function recordUsageForBudget(profileId: string, totalTokens: number) {
  const event = createTranslationUsageEvent({
    profileId,
    providerName: "local",
    model: "local",
    targetLang: "ko",
    usage: {
      inputTokens: totalTokens,
      outputTokens: 0,
      totalTokens,
      billableCharacters: 0,
      requestCount: 1,
      cacheHitCount: 0,
      cacheMissCount: 1
    }
  });
  localStorage.setItem("lem:translationUsageEvents", JSON.stringify([event]));
}

function makeReadingCard(): StudyCard {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: "card-1",
    profileId: "profile-ja",
    cardType: "reading",
    deckType: "input",
    direction: "target_to_native",
    sourceSentence: "This English Reddit sentence should switch to an English learning profile.",
    frontText: "This English Reddit sentence should switch to an English learning profile.",
    literalTranslationKo: "",
    naturalTranslationKo: "",
    highlightMappings: [],
    vocabularyItems: [],
    srs: {
      dueAt: now,
      intervalDays: 0,
      easeFactor: 2.5,
      reviewCount: 0,
      lapseCount: 0
    },
    createdAt: now,
    updatedAt: now
  };
}

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    }
  };
  vi.stubGlobal("localStorage", localStorage);
  return localStorage;
}
