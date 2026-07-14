import {
  createTranslationUsageEvent,
  estimateTranslationUsage
} from "../src/shared/translationUsage";
import type {
  TranslatePdfSegmentsInput,
  TranslateTextInput,
  TranslateTextResult,
  TranslationCacheEntry,
  TranslationCacheLookupInput,
  TranslationUsageEvent
} from "../src/shared/types";

export function translationResultFromEntry(
  entry: TranslationCacheEntry,
  cacheStatus: TranslateTextResult["cacheStatus"],
  usage?: TranslationUsageEvent
): TranslateTextResult {
  return {
    translatedText: entry.translatedText,
    providerName: entry.providerName,
    sourceLang: entry.sourceLang,
    targetLang: entry.targetLang,
    cacheStatus,
    usage,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt
  };
}

export function estimateUsageEventForTexts(
  input: Pick<
    TranslateTextInput,
    | "profileId"
    | "providerName"
    | "model"
    | "geminiModel"
    | "geminiPlan"
    | "ollamaModel"
    | "sourceLang"
    | "targetLang"
  >,
  texts: string[]
): TranslationUsageEvent {
  const model = getUsageModelName(input);
  const estimate = estimateTranslationUsage({
    texts: texts.map((text) => ({ text, cacheStatus: "miss" })),
    providerName: input.providerName,
    model,
    plan: input.geminiPlan,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang
  });
  return createTranslationUsageEvent({
    profileId: input.profileId,
    providerName: input.providerName,
    model: estimate.model,
    plan: input.geminiPlan,
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
  });
}

export function mergeUsageEvents(
  events: TranslationUsageEvent[],
  input: Pick<
    TranslatePdfSegmentsInput,
    | "profileId"
    | "providerName"
    | "model"
    | "geminiModel"
    | "geminiPlan"
    | "ollamaModel"
    | "sourceLang"
    | "targetLang"
  >
): TranslationUsageEvent | undefined {
  if (events.length === 0) {
    return undefined;
  }

  const usage = events.reduce(
    (sum, event) => ({
      inputTokens: sum.inputTokens + event.usage.inputTokens,
      outputTokens: sum.outputTokens + event.usage.outputTokens,
      totalTokens: sum.totalTokens + event.usage.totalTokens,
      billableCharacters: sum.billableCharacters + event.usage.billableCharacters,
      requestCount: sum.requestCount + event.usage.requestCount,
      cacheHitCount: sum.cacheHitCount + event.usage.cacheHitCount,
      cacheMissCount: sum.cacheMissCount + event.usage.cacheMissCount
    }),
    {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      billableCharacters: 0,
      requestCount: 0,
      cacheHitCount: 0,
      cacheMissCount: 0
    }
  );

  return createTranslationUsageEvent({
    profileId: input.profileId,
    providerName: input.providerName,
    model: getUsageModelName(input),
    plan: input.geminiPlan,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang,
    usage
  });
}

function getUsageModelName(
  input: Pick<
    TranslateTextInput,
    "providerName" | "model" | "geminiModel" | "ollamaModel"
  >
) {
  if (input.model?.trim()) {
    return input.model;
  }
  if (input.providerName === "gemini") {
    return input.geminiModel;
  }
  if (input.providerName === "local") {
    return input.ollamaModel;
  }
  return undefined;
}

export function segmentCacheInput(
  input: TranslatePdfSegmentsInput,
  segment: TranslatePdfSegmentsInput["segments"][number]
): TranslationCacheLookupInput {
  return {
    profileId: input.profileId,
    text: segment.text,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang,
    providerName: input.providerName,
    model: input.model,
    promptVersion: input.promptVersion,
    contextHash: input.translationContext?.contextHash ?? input.contextHash
  };
}

export function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
