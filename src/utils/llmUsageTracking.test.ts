import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../appSettings";
import type { LLMProvider } from "../services/llm/types";
import { sampleReadingCard } from "../services/llm/mockProvider";
import type {
  GenerateCharacterChatReplyInput,
  GenerateLifeExpressionCardInput,
  GenerateReadingCardInput
} from "../shared/types";
import { createUsageTrackedProvider } from "./llmUsageTracking";
import {
  readTranslationUsageEvents,
  summarizeTranslationUsage
} from "./translationUsageLedger";

describe("llm usage tracking", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("records local electricity estimates for Ollama card generation", async () => {
    installMemoryLocalStorage();
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    const rawProvider = createImmediateProvider();
    const settings = {
      ...defaultSettings,
      profileId: "profile-en",
      providerName: "ollama" as const,
      ollamaModel: "gemma3:12b"
    };
    const provider = createUsageTrackedProvider(rawProvider, settings);

    await provider.generateReadingCard({
      selectedText: "glitching out",
      sourceSentence: "Is it glitching out or something?",
      learningProfile: settings.learningProfile,
      learnerLevel: "intermediate"
    });

    const events = readTranslationUsageEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      profileId: "profile-en",
      providerName: "local",
      model: "gemma3:12b"
    });
    const summary = summarizeTranslationUsage(settings);
    expect(summary.todayTokens).toBeGreaterThan(0);
    expect(summary.todayLocalRuntimeMinutes).toBeGreaterThan(0);
    expect(summary.todayLocalElectricityKrw).toBeGreaterThanOrEqual(0);
  });

  it("reserves and records a conservative Gemini retry/fallback ceiling", async () => {
    installMemoryLocalStorage();
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    const settings = {
      ...defaultSettings,
      profileId: "profile-en",
      providerName: "gemini" as const,
      geminiApiKey: "session-key",
      geminiModel: "gemini-2.5-flash"
    };
    const provider = createUsageTrackedProvider(createImmediateProvider(), settings);

    await provider.generateCharacterChatReply({
      character: {
        id: "character",
        name: "Tutor",
        description: "A tutor",
        personality: "Patient",
        scenario: "Practice",
        firstMessage: "Hello",
        messageExample: "",
        alternateGreetings: [],
        tags: [],
        sourceFormat: "local",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      messages: [],
      userMessage: "Can we practice?",
      ragHints: []
    });

    expect(readTranslationUsageEvents()[0].usage.requestCount).toBe(4);
  });

  it("records provider-observed Gemini usage without adding an estimated duplicate", async () => {
    installMemoryLocalStorage();
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    let observer: Parameters<NonNullable<LLMProvider["setUsageObserver"]>>[0] | undefined;
    const rawProvider: LLMProvider = {
      ...createImmediateProvider(),
      setUsageObserver(nextObserver) {
        observer = nextObserver;
      },
      async generateReadingCard(input) {
        observer?.({
          providerName: "gemini",
          model: "gemini-2.5-flash-lite",
          plan: "paid",
          sourceLang: "en",
          targetLang: "ko",
          usage: {
            inputTokens: 11,
            outputTokens: 7,
            totalTokens: 18,
            billableCharacters: 40,
            requestCount: 1,
            cacheHitCount: 0,
            cacheMissCount: 1
          },
          outcome: "success",
          exact: true,
          attemptCount: 1
        });
        return sampleReadingCard(input.sourceSentence, [input.selectedText], input.learningProfile);
      }
    };
    const settings = {
      ...defaultSettings,
      profileId: "profile-en",
      providerName: "gemini" as const,
      geminiPlan: "paid" as const
    };

    await createUsageTrackedProvider(rawProvider, settings).generateReadingCard({
      selectedText: "observed",
      sourceSentence: "Observed usage is recorded once.",
      learningProfile: settings.learningProfile
    });

    const events = readTranslationUsageEvents();
    expect(events).toHaveLength(1);
    expect(events[0].usage).toMatchObject({ totalTokens: 18, requestCount: 1 });
  });
});

function createImmediateProvider(): LLMProvider {
  return {
    name: "ImmediateProvider",
    async testConnection() {
      return true;
    },
    async generateReadingCard(input: GenerateReadingCardInput) {
      return sampleReadingCard(input.sourceSentence, [input.selectedText], input.learningProfile);
    },
    async generateLifeExpressionCard(input: GenerateLifeExpressionCardInput) {
      return sampleReadingCard(input.koreanText, ["expression"], input.learningProfile);
    },
    async generateCharacterChatReply(input: GenerateCharacterChatReplyInput) {
      return `Echo: ${input.userMessage}`;
    }
  };
}

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
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
  });
}
