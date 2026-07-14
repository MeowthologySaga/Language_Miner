import { isRemoteOllamaUrl } from "./localEndpointPolicy";
import {
  estimateTranslationUsage,
  formatKrwRange,
  type TranslationUsageEstimate
} from "./translationUsage";
import {
  GEMINI_MAX_ATTEMPTS_PER_REQUEST,
  GEMINI_PDF_BATCH_MAX_REMOTE_CALLS,
  OLLAMA_PDF_BATCH_MAX_REMOTE_CALLS,
  OLLAMA_TEXT_MAX_REMOTE_CALLS
} from "./translationRequestLimits";
import type { AppSettings, TranslationProviderName } from "./types";

export type CloudTranslationOperation = "text" | "pdf";

export type CloudTranslationPreflightInput = {
  settings: AppSettings;
  providerName?: TranslationProviderName;
  model?: string;
  operation: CloudTranslationOperation;
  /** One group for every renderer API call planned by the job. */
  textGroups: string[][];
  scopeLabel: string;
  dataCategories: string[];
  sourceLang?: string;
  targetLang?: string;
};

export type CloudTranslationPreflightDetails = {
  providerName: "google" | "gemini" | "remoteOllama";
  providerLabel: string;
  model: string;
  endpointLabel?: string;
  scopeLabel: string;
  dataCategories: string[];
  textCount: number;
  totalCharacters: number;
  estimatedCalls: number;
  maximumCalls: number;
  estimatedCostKrw: TranslationUsageEstimate["estimatedCostKrw"];
  estimatedCostLabel: string;
  currentMonthAppEstimateKrw: number;
  projectedMonthAppEstimateKrw: number;
  remoteCostUnknown: boolean;
};

export function buildCloudTranslationPreflight(
  input: CloudTranslationPreflightInput,
  currentMonthAppEstimateKrw: number
): CloudTranslationPreflightDetails | null {
  const providerName = input.providerName ?? input.settings.translationProviderName;
  const externalProvider = getExternalProvider(providerName, input.settings.ollamaBaseUrl);
  if (!externalProvider) {
    return null;
  }

  const textGroups = input.textGroups
    .map((group) => group.filter((text) => text.trim().length > 0))
    .filter((group) => group.length > 0);
  const texts = textGroups.flat();
  if (texts.length === 0) {
    return null;
  }

  const model = getModel(input, providerName);
  const estimate = estimateTranslationUsage({
    texts: texts.map((text) => ({ text, cacheStatus: "miss" })),
    providerName,
    model,
    plan: input.settings.geminiPlan,
    sourceLang: input.sourceLang ?? input.settings.learningProfile.targetLanguage.code,
    targetLang: input.targetLang ?? input.settings.learningProfile.nativeLanguage.code,
    dailyAppTokenLimit: input.settings.dailyAppTokenLimit,
    monthlySpendLimitKrw: input.settings.monthlySpendLimitKrw
  });
  const calls = estimateRemoteCalls(providerName, input.operation, textGroups);
  const remoteCostUnknown = externalProvider === "remoteOllama";
  const retryMultiplier = calls.estimated > 0 ? calls.maximum / calls.estimated : 1;
  const estimatedCostKrw = remoteCostUnknown
    ? { min: 0, max: 0 }
    : {
        min: estimate.estimatedCostKrw.min,
        max: estimate.estimatedCostKrw.max * Math.max(1, retryMultiplier)
      };
  const currentMonth = Math.max(0, currentMonthAppEstimateKrw);

  return {
    providerName: externalProvider,
    providerLabel:
      externalProvider === "gemini"
        ? "Google Gemini"
        : externalProvider === "google"
          ? "Google Cloud Translation"
          : "Remote Ollama",
    model,
    endpointLabel:
      externalProvider === "remoteOllama" ? input.settings.ollamaBaseUrl : undefined,
    scopeLabel: input.scopeLabel,
    dataCategories: [...new Set(input.dataCategories.filter(Boolean))],
    textCount: texts.length,
    totalCharacters: texts.reduce((sum, text) => sum + text.length, 0),
    estimatedCalls: calls.estimated,
    maximumCalls: calls.maximum,
    estimatedCostKrw,
    estimatedCostLabel: remoteCostUnknown
      ? "앱에서 계산할 수 없음 · 원격 서버 정책 확인 필요"
      : formatKrwRange(estimatedCostKrw),
    currentMonthAppEstimateKrw: currentMonth,
    projectedMonthAppEstimateKrw: currentMonth + estimatedCostKrw.max,
    remoteCostUnknown
  };
}

function getExternalProvider(
  providerName: TranslationProviderName,
  ollamaBaseUrl: string
): CloudTranslationPreflightDetails["providerName"] | null {
  if (providerName === "google" || providerName === "gemini") {
    return providerName;
  }
  if (providerName === "local" && isRemoteOllamaUrl(ollamaBaseUrl)) {
    return "remoteOllama";
  }
  return null;
}

function getModel(input: CloudTranslationPreflightInput, providerName: TranslationProviderName) {
  if (input.model?.trim()) return input.model.trim();
  if (providerName === "gemini") return input.settings.geminiModel;
  if (providerName === "local") return input.settings.ollamaModel;
  return "google-translate-v2";
}

function estimateRemoteCalls(
  providerName: TranslationProviderName,
  operation: CloudTranslationOperation,
  textGroups: string[][]
) {
  return textGroups.reduce(
    (total, group) => {
      const groupSize = Math.max(1, group.length);
      if (operation === "text") {
        const maximumPerCall =
          providerName === "gemini"
            ? GEMINI_MAX_ATTEMPTS_PER_REQUEST
            : providerName === "local"
              ? OLLAMA_TEXT_MAX_REMOTE_CALLS
              : 1;
        return {
          estimated: total.estimated + 1,
          maximum: total.maximum + maximumPerCall
        };
      }

      const batchSize = providerName === "local" ? 4 : 8;
      const batchCount = Math.ceil(groupSize / batchSize);
      const maximumPerBatch =
        providerName === "gemini"
          ? GEMINI_PDF_BATCH_MAX_REMOTE_CALLS
          : providerName === "local"
            ? OLLAMA_PDF_BATCH_MAX_REMOTE_CALLS
            : 1;
      return {
        estimated: total.estimated + batchCount,
        maximum: total.maximum + batchCount * maximumPerBatch
      };
    },
    { estimated: 0, maximum: 0 }
  );
}
