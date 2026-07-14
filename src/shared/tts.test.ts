import { describe, expect, it } from "vitest";
import { defaultLifeMiningCaptureSettings } from "./lifeMiningSettings";
import { createCardTtsInput, getCardTtsLanguageCode, getCardTtsText } from "./tts";
import type { AppSettings, StudyCard } from "./types";

const settings = {
  profileId: "profile-en",
  providerName: "mock",
  ollamaBaseUrl: "",
  ollamaModel: "",
  localMtModel: "",
  translationProviderName: "gemini",
  googleTranslateApiKey: "",
  geminiApiKey: "",
  geminiModel: "",
  geminiPlan: "paid",
  ttsProviderName: "system",
  ttsModel: "windows-system-default",
  ttsVoiceName: "",
  ttsRate: 0,
  preGenerateCardTts: true,
  monthlySpendLimitKrw: 0,
  dailyAppTokenLimit: 0,
  confirmEstimatedCostBeforeRun: false,
  confirmLifeMiningCardCost: false,
  stopOnFreeTierLimit: false,
  stopOnMonthlyLimit: false,
  learningProfile: {
    targetLanguage: { code: "en", nameKo: "영어", nameEn: "English" },
    nativeLanguage: { code: "ko", nameKo: "한국어", nameEn: "Korean" }
  },
  pdfExportMode: "reading",
  showPdfSourceHighlights: true,
  captureShortcut: "Ctrl+Q",
  browserSelectionCardMode: "preview",
  browserCaptureSiteSettings: {
    discord: true,
    chatgpt: true,
    claude: true,
    youtube: true,
    reddit: true,
    genericWeb: true
  },
  webReaderCustomSources: [],
  listeningLoopBackgroundPrebuildEnabled: false,
  listeningLoopLongVideoPartialClipsEnabled: false,
  lifeMiningCaptureSettings: defaultLifeMiningCaptureSettings,
  cardSyncFolderPath: "",
  cardSyncOnStartup: true,
  cardSyncOnQuit: true,
  labsHideSidebarNavigation: false,
  labsHideGlossaryNavigation: false,
  debugMode: false,
  debugPdfPath: ""
} satisfies AppSettings;

function makeCard(overrides: Partial<StudyCard>): StudyCard {
  return {
    id: "card-1",
    cardType: "reading",
    deckType: "input",
    direction: "target_to_native",
    sourceSentence: "한국어 원문이 잘못 들어간 경우",
    frontText: "The front sentence should be spoken in English.",
    highlightMappings: [],
    vocabularyItems: [],
    srs: {
      dueAt: new Date().toISOString(),
      intervalDays: 0,
      easeFactor: 2.5,
      reviewCount: 0,
      lapseCount: 0
    },
    ...overrides
  };
}

describe("card TTS", () => {
  it("uses the visible front text for ordinary cards", () => {
    const card = makeCard({});

    expect(getCardTtsText(card)).toBe("The front sentence should be spoken in English.");
    expect(getCardTtsLanguageCode(card, settings)).toBe("en");
    expect(createCardTtsInput(card, settings)?.languageCode).toBe("en");
  });

  it("detects Korean front text instead of blindly using the learning language", () => {
    const card = makeCard({
      sourceSentence: "The stored source can be English.",
      frontText: "앞면이 한국어면 한국어 음성으로 읽어야 한다."
    });

    expect(getCardTtsLanguageCode(card, settings)).toBe("ko");
  });

  it("uses the target expression for life-mining output cards", () => {
    const card = makeCard({
      cardType: "life_expression",
      deckType: "output",
      direction: "native_to_target",
      sourceSentence: "나 좀 늦을 것 같아.",
      targetText: "I think I'm going to be a little late.",
      frontText: "맥락\n약속에 늦는 상황\n\n원문\nMe: 나 좀 늦을 것 같아."
    });

    expect(getCardTtsText(card)).toBe("I think I'm going to be a little late.");
    expect(getCardTtsLanguageCode(card, settings)).toBe("en");
  });

  it("uses saved source language metadata for input cards", () => {
    const card = makeCard({
      frontText: "Kanji 100%",
      languageMetadata: {
        profileTargetLanguageCode: "ja",
        profileNativeLanguageCode: "ko",
        detectedSourceLanguageCode: "ja",
        actualSourceLanguageCode: "ja",
        confidence: 0.92,
        policyStatus: "match",
        sourceKind: "original"
      }
    });

    expect(getCardTtsLanguageCode(card, settings)).toBe("ja");
  });

  it("falls back to the card profile target language when detection metadata is unknown", () => {
    const card = makeCard({
      frontText: "日本語能力試験対策",
      languageMetadata: {
        profileTargetLanguageCode: "ja",
        profileNativeLanguageCode: "ko",
        detectedSourceLanguageCode: "unknown",
        actualSourceLanguageCode: "unknown",
        confidence: 0.2,
        policyStatus: "unknown",
        sourceKind: "original"
      }
    });

    expect(getCardTtsLanguageCode(card, settings)).toBe("ja");
    expect(createCardTtsInput(card, settings)?.languageCode).toBe("ja");
  });
});
