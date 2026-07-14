import { describe, expect, it } from "vitest";
import {
  createBrowserSentenceSourceNote,
  createFallbackBrowserSentenceCard,
  estimateBrowserSentenceCardElectricity,
  estimateBrowserSentenceCardUsage,
  createBrowserSentenceCardUsageEvent,
  formatElectricityValue,
  formatKrwValue,
  formatRuntimeSeconds,
  getBrowserCardProviderDebugStatus,
  getBrowserCardProviderFallbackReason,
  getEffectiveBrowserCardProviderSettings,
  isDuplicateBrowserSentenceCardCapture,
  prepareBrowserSentenceCard,
  type BrowserCardProviderSettings
} from "./browserSentenceCards";
import { defaultLearningProfile } from "../src/shared/languages";
import type { StudyCard } from "../src/shared/types";
import { createCloudProviderConsentRecord } from "../src/shared/cloudProviderConsent";
import { assessTranslationUsageBudget } from "../src/shared/translationUsage";

describe("browserSentenceCards", () => {
  it("builds source notes and keeps non-input cards unchanged", () => {
    expect(
      createBrowserSentenceSourceNote({
        appName: "Discord",
        metadata: {
          title: "Study Chat",
          url: "https://example.com/thread",
          capturedAt: "2026-01-01T00:00:00.000Z"
        }
      })
    ).toContain("Discord");
    expect(createBrowserSentenceSourceNote({ appName: "Same", metadata: { title: "Same" } })).toBe(
      "앱: Same"
    );

    const outputCard = makeCard({ deckType: "output" });
    const preparedOutput = prepareBrowserSentenceCard(outputCard, {
        selectedText: "keep going",
        sourceSentence: outputCard.sourceSentence,
        appName: "Browser"
      });
    expect(preparedOutput.structureNote).toBe("");
    expect(preparedOutput.vocabularyItems.map((item) => item.term.toLowerCase())).toContain(
      "keep going"
    );
  });

  it("adds selected terms and source notes to input reading cards", () => {
    const card = makeCard({
      sourceSentence: "Keep going even when it feels slow.",
      frontText: "Keep going even when it feels slow."
    });

    const prepared = prepareBrowserSentenceCard(card, {
      selectedText: "keep going",
      sourceSentence: card.sourceSentence,
      appName: "Browser",
      metadata: { url: "https://example.com" }
    });

    expect(prepared.structureNote).toContain("Browser");
    expect(prepared.structureNote).toContain("https://example.com");
    expect(prepared.vocabularyItems.map((item) => item.term.toLowerCase())).toContain(
      "keep going"
    );
    expect(prepared.highlightMappings.map((mapping) => mapping.sourceText.toLowerCase())).toContain(
      "keep going"
    );
  });

  it("creates fallback cards with profile and timestamp metadata", () => {
    const card = createFallbackBrowserSentenceCard({
      selectedText: "tbh",
      sourceSentence: "Tbh, this is useful.",
      translatedSentence: "솔직히 이건 유용하다.",
      profileId: "profile-test",
      now: "2026-01-01T00:00:00.000Z"
    });

    expect(card).toMatchObject({
      profileId: "profile-test",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      cardType: "reading",
      deckType: "input"
    });
    expect(card.vocabularyItems.length).toBeGreaterThan(0);
  });

  it("chooses effective provider settings and fallback reasons", () => {
    expect(getEffectiveBrowserCardProviderSettings(makeSettings())).toBeNull();
    expect(getBrowserCardProviderFallbackReason(makeSettings())).toBe(
      "Gemini API key is empty."
    );

    expect(
      getEffectiveBrowserCardProviderSettings(makeSettings({ providerName: "ollama" }))
    ).toMatchObject({ providerName: "ollama" });
    expect(
      getEffectiveBrowserCardProviderSettings(makeSettings({ geminiApiKey: "key" }))
    ).toMatchObject({ providerName: "gemini" });
    expect(
      getEffectiveBrowserCardProviderSettings(
        makeSettings({ geminiApiKey: "key", cloudConsent: undefined })
      )
    ).toBeNull();
    expect(
      getEffectiveBrowserCardProviderSettings(
        makeSettings({ providerName: "chatgptWeb", geminiApiKey: "key" })
      )
    ).toBeNull();
    expect(
      getBrowserCardProviderFallbackReason(
        makeSettings({ providerName: "chatgptWeb", geminiApiKey: "key" })
      )
    ).toContain("visible Language Miner app");

    expect(getBrowserCardProviderDebugStatus(makeSettings({ geminiApiKey: "key" }))).toMatchObject({
      configuredProviderName: "gemini",
      providerName: "gemini",
      hasGeminiApiKey: true
    });
  });

  it("estimates usage labels and local electricity", () => {
    const geminiUsage = estimateBrowserSentenceCardUsage(
      {
        selectedText: "keep going",
        sourceSentence: "Keep going even when it feels slow.",
        appName: "Browser"
      },
      makeSettings({ geminiApiKey: "key" }) as BrowserCardProviderSettings & {
        providerName: "gemini";
      }
    );

    expect(geminiUsage.tokenLabel).toContain("tokens");
    expect(geminiUsage.requestLabel).toContain("4");
    expect(geminiUsage.electricityLabel).toMatch(/^0/);
    expect(geminiUsage.costLabel).not.toMatch(/^0/);
    expect(geminiUsage.note).toContain("Gemini");

    const electricity = estimateBrowserSentenceCardElectricity("local", 180, 1);
    expect(electricity.runtimeSeconds).toBeGreaterThan(0);
    expect(formatKrwValue(0)).toMatch(/^0/);
    expect(formatKrwValue(0.2)).toContain("1");
    expect(formatElectricityValue(electricity.krw)).toContain("원");
    expect(formatRuntimeSeconds(30)).toContain("30");
    expect(formatRuntimeSeconds(90)).toContain("1.5");
  });

  it("creates usage events for browser sentence card generation", () => {
    const event = createBrowserSentenceCardUsageEvent(
      {
        selectedText: "keep going",
        sourceSentence: "Keep going even when it feels slow.",
        appName: "Browser"
      },
      makeSettings({ providerName: "ollama" }) as BrowserCardProviderSettings & {
        providerName: "ollama";
      },
      "profile-en"
    );

    expect(event).toMatchObject({
      profileId: "profile-en",
      providerName: "local",
      model: "gemma"
    });
    expect(event.usage.totalTokens).toBeGreaterThan(0);
    expect(event.estimatedCostKrw).toEqual({ min: 0, max: 0 });
  });

  it("reserves the full Gemini retry ceiling before browser card generation", () => {
    const event = createBrowserSentenceCardUsageEvent(
      {
        selectedText: "keep going",
        sourceSentence: "Keep going even when it feels slow.",
        appName: "Browser"
      },
      makeSettings({ geminiApiKey: "key" }) as BrowserCardProviderSettings & {
        providerName: "gemini";
      },
      "profile-en"
    );

    expect(event.usage.requestCount).toBe(4);
    expect(event.estimatedCostKrw.max).toBeGreaterThan(0);
    const oneAttemptTokens = event.usage.totalTokens / 4;
    const assessment = assessTranslationUsageBudget({
      request: {
        estimatedTokens: event.usage.totalTokens,
        estimatedCostKrw: event.estimatedCostKrw.max
      },
      current: { todayTokens: 0, monthCostKrw: 0 },
      settings: {
        dailyAppTokenLimit: Math.ceil(oneAttemptTokens * 2),
        monthlySpendLimitKrw: 100_000,
        stopOnFreeTierLimit: true,
        stopOnMonthlyLimit: true
      }
    });

    expect(oneAttemptTokens).toBeGreaterThan(0);
    expect(assessment.dailyLimitExceeded).toBe(true);
    expect(assessment.allowed).toBe(false);
  });

  it("deduplicates repeated captures and expires stale entries", () => {
    const recentCaptures = new Map<string, number>([["old", 100]]);
    const input = {
      appName: "Browser",
      metadata: { url: "https://example.com" }
    };

    expect(
      isDuplicateBrowserSentenceCardCapture(
        recentCaptures,
        input,
        "selected",
        "source",
        1_000,
        10_000
      )
    ).toBe(false);
    expect(recentCaptures.has("old")).toBe(false);
    expect(
      isDuplicateBrowserSentenceCardCapture(
        recentCaptures,
        input,
        "selected",
        "source",
        1_000,
        10_500
      )
    ).toBe(true);
    expect(
      isDuplicateBrowserSentenceCardCapture(
        recentCaptures,
        input,
        "selected",
        "source",
        1_000,
        12_000
      )
    ).toBe(false);
  });
});

function makeSettings(
  overrides: Partial<BrowserCardProviderSettings> = {}
): BrowserCardProviderSettings {
  return {
    providerName: "gemini",
    ollamaBaseUrl: "http://127.0.0.1:11434",
    ollamaModel: "gemma",
    geminiApiKey: "",
    geminiModel: "gemini-2.5-flash-lite",
    geminiPlan: "free",
    learningProfile: defaultLearningProfile,
    dailyAppTokenLimit: 500_000,
    monthlySpendLimitKrw: 5_000,
    cloudConsent: createCloudProviderConsentRecord({
      provider: "gemini",
      keyStorage: "session",
      acceptedAt: "2026-07-14T00:00:00.000Z"
    }),
    ...overrides
  };
}

function makeCard(overrides: Partial<StudyCard> = {}): StudyCard {
  return {
    id: "card-1",
    cardType: "reading",
    deckType: "input",
    direction: "en_to_ko",
    sourceSentence: "Keep going.",
    frontText: "Keep going.",
    literalTranslationKo: "",
    naturalTranslationKo: "",
    highlightMappings: [],
    vocabularyItems: [],
    structureNote: "",
    srs: {
      dueAt: "2026-01-01T00:00:00.000Z",
      intervalDays: 0,
      easeFactor: 2.5,
      reviewCount: 0,
      lapseCount: 0
    },
    ...overrides
  };
}
