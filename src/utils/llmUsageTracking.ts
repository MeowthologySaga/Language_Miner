import type { LLMProvider, LlmUsageObservation } from "../services/llm/types";
import { GEMINI_MAX_ATTEMPTS_PER_REQUEST } from "../shared/geminiTranslation";
import {
  createTranslationUsageEvent,
  estimateTranslationUsage,
  toTranslationUsageBudgetRequest,
  type TranslationUsageEstimate
} from "../shared/translationUsage";
import type {
  AppSettings,
  GenerateCharacterChatReplyInput,
  GenerateLifeExpressionCardInput,
  GenerateReadingCardInput,
  TranslationProviderName
} from "../shared/types";
import {
  recordTranslationUsageEvent,
  reserveTranslationUsageBudget
} from "./translationUsageLedger";

export function createUsageTrackedProvider(
  provider: LLMProvider,
  settings: AppSettings
): LLMProvider {
  if (settings.providerName === "mock") {
    return provider;
  }

  const recordsObservedUsage =
    settings.providerName === "gemini" && typeof provider.setUsageObserver === "function";
  if (recordsObservedUsage) {
    provider.setUsageObserver?.((observation) => recordObservedLlmUsage(settings, observation));
  }

  return {
    name: provider.name,
    async testConnection() {
      return runWithEstimatedLlmUsage({
        settings,
        sourceLang: settings.learningProfile.targetLanguage.code,
        targetLang: settings.learningProfile.nativeLanguage.code,
        text: "Card engine connection test.",
        run: () => provider.testConnection(),
        shouldRecord: (ok) => ok,
        recordEstimate: !recordsObservedUsage
      });
    },
    async generateReadingCard(input: GenerateReadingCardInput) {
      return runWithEstimatedLlmUsage({
        settings,
        sourceLang: input.learningProfile.targetLanguage.code,
        targetLang: input.learningProfile.nativeLanguage.code,
        text: buildReadingCardUsageText(input),
        run: () => provider.generateReadingCard(input),
        recordEstimate: !recordsObservedUsage
      });
    },
    async generateLifeExpressionCard(input: GenerateLifeExpressionCardInput) {
      return runWithEstimatedLlmUsage({
        settings,
        sourceLang: input.learningProfile.nativeLanguage.code,
        targetLang: input.learningProfile.targetLanguage.code,
        text: buildLifeExpressionUsageText(input),
        run: () => provider.generateLifeExpressionCard(input),
        recordEstimate: !recordsObservedUsage
      });
    },
    async generateCharacterChatReply(input: GenerateCharacterChatReplyInput) {
      return runWithEstimatedLlmUsage({
        settings,
        sourceLang: settings.learningProfile.nativeLanguage.code,
        targetLang: settings.learningProfile.targetLanguage.code,
        text: buildCharacterChatUsageText(input),
        run: () => provider.generateCharacterChatReply(input),
        recordEstimate: !recordsObservedUsage
      });
    }
  };
}

async function runWithEstimatedLlmUsage<T>(input: {
  settings: AppSettings;
  sourceLang: string;
  targetLang: string;
  text: string;
  run: () => Promise<T>;
  shouldRecord?: (result: T) => boolean;
  recordEstimate?: boolean;
}): Promise<T> {
  const provider = getUsageProvider(input.settings);
  if (!provider) {
    return input.run();
  }

  const estimate = estimateTranslationUsage({
    texts: [{ text: input.text, cacheStatus: "miss" }],
    providerName: provider.providerName,
    model: provider.model,
    plan: input.settings.geminiPlan,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang,
    dailyAppTokenLimit: input.settings.dailyAppTokenLimit,
    monthlySpendLimitKrw: input.settings.monthlySpendLimitKrw
  });
  const guardedEstimate =
    input.settings.providerName === "gemini"
      ? scaleUsageEstimateForAttempts(estimate, GEMINI_MAX_ATTEMPTS_PER_REQUEST)
      : estimate;

  const reservation = reserveTranslationUsageBudget(
    input.settings,
    toTranslationUsageBudgetRequest(guardedEstimate)
  );
  try {
    const result = await input.run();
    if (input.recordEstimate !== false && input.shouldRecord?.(result) !== false) {
      recordEstimatedLlmUsage(input, guardedEstimate);
    }
    return result;
  } finally {
    reservation.release();
  }
}

function recordObservedLlmUsage(settings: AppSettings, observation: LlmUsageObservation) {
  recordTranslationUsageEvent(
    createTranslationUsageEvent({
      profileId: settings.profileId,
      providerName: observation.providerName,
      model: observation.model,
      plan: observation.plan ?? settings.geminiPlan,
      sourceLang: observation.sourceLang,
      targetLang: observation.targetLang,
      usage: observation.usage
    })
  );
}

function scaleUsageEstimateForAttempts(
  estimate: TranslationUsageEstimate,
  attempts: number
): TranslationUsageEstimate {
  const multiplier = Math.max(1, Math.floor(attempts));
  const scaleRange = (range: { min: number; max: number }) => ({
    min: range.min,
    max: range.max * multiplier
  });
  return {
    ...estimate,
    billableCharacters: estimate.billableCharacters * multiplier,
    cacheMissCount: estimate.cacheMissCount * multiplier,
    requestCount: estimate.requestCount * multiplier,
    inputTokens: scaleRange(estimate.inputTokens),
    outputTokens: scaleRange(estimate.outputTokens),
    totalTokens: scaleRange(estimate.totalTokens),
    estimatedCostKrw: scaleRange(estimate.estimatedCostKrw),
    dailyLimitUsagePercent: scaleRange(estimate.dailyLimitUsagePercent),
    monthlyLimitUsagePercent: scaleRange(estimate.monthlyLimitUsagePercent)
  };
}

function recordEstimatedLlmUsage(
  input: {
    settings: AppSettings;
    sourceLang: string;
    targetLang: string;
  },
  estimate: TranslationUsageEstimate
) {
  const provider = getUsageProvider(input.settings);
  if (!provider) {
    return;
  }

  recordTranslationUsageEvent(
    createTranslationUsageEvent({
      profileId: input.settings.profileId,
      providerName: provider.providerName,
      model: estimate.model,
      plan: input.settings.geminiPlan,
      sourceLang: input.sourceLang,
      targetLang: input.targetLang,
      usage: {
        inputTokens: estimate.inputTokens.max,
        outputTokens: estimate.outputTokens.max,
        totalTokens: estimate.totalTokens.max,
        billableCharacters: estimate.billableCharacters,
        requestCount: estimate.requestCount,
        cacheHitCount: estimate.cacheHitCount,
        cacheMissCount: estimate.cacheMissCount
      }
    })
  );
}

function getUsageProvider(settings: AppSettings): {
  providerName: TranslationProviderName;
  model: string;
} | null {
  if (settings.providerName === "gemini") {
    return {
      providerName: "gemini",
      model: settings.geminiModel
    };
  }
  if (settings.providerName === "ollama") {
    return {
      providerName: "local",
      model: settings.ollamaModel
    };
  }
  return null;
}

function buildReadingCardUsageText(input: GenerateReadingCardInput) {
  return [
    `Selected: ${input.selectedText}`,
    `Source sentence: ${input.sourceSentence}`,
    input.beforeSentence ? `Before sentence: ${input.beforeSentence}` : "",
    input.afterSentence ? `After sentence: ${input.afterSentence}` : "",
    input.readerTextContext ? `Reader context: ${input.readerTextContext.slice(0, 2200)}` : "",
    input.translationContext ? `Additional context: ${input.translationContext}` : "",
    "Generate one structured reading card as JSON with translations, vocabulary, comparisons, and examples."
  ]
    .filter(Boolean)
    .join("\n");
}

function buildLifeExpressionUsageText(input: GenerateLifeExpressionCardInput) {
  return [
    input.beforeContext ? `Before context:\n${input.beforeContext}` : "",
    `User expression:\n${input.koreanText}`,
    input.afterContext ? `After context:\n${input.afterContext}` : "",
    "Generate one structured life-expression card as JSON with variants, pattern notes, and practice prompts."
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildCharacterChatUsageText(input: GenerateCharacterChatReplyInput) {
  return [
    `Character: ${input.character.name}`,
    `Description: ${input.character.description}`,
    `Personality: ${input.character.personality}`,
    `Scenario: ${input.character.scenario}`,
    input.messages.length
      ? `Recent messages:\n${input.messages
          .slice(-6)
          .map((message) => `${message.role}: ${message.content}`)
          .join("\n")}`
      : "",
    input.ragHints.length
      ? `Card hints:\n${input.ragHints
          .map((hint) => `${hint.terms.join(", ")}: ${hint.sourceSentence}`)
          .join("\n")}`
      : "",
    `User message: ${input.userMessage}`,
    "Generate one in-character learner-friendly reply."
  ]
    .filter(Boolean)
    .join("\n\n");
}
