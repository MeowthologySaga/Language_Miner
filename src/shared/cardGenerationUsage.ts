import {
  estimateTranslationUsage,
  formatCompactNumber
} from "./translationUsage";
import type { AppSettings, TranslationProviderName } from "./types";

export type CardGenerationUsageEstimate = {
  costLabel: string;
  electricityLabel: string;
  tokenLabel: string;
  requestLabel: string;
  runtimeLabel?: string;
  note?: string;
  costKrw?: number;
  electricityKrw?: number;
  tokenCount?: number;
  requestCount?: number;
  runtimeSeconds?: number;
  noteKey?:
    | "mock"
    | "chatgptWebManual"
    | "geminiFreeConservative"
    | "cloudBillingGuard"
    | "ollamaLocal";
};

export type CardGenerationUsageInput = {
  selectedText: string;
  sourceSentence: string;
  beforeSentence?: string;
  afterSentence?: string;
  readerTextContext?: string;
  settings: Pick<
    AppSettings,
    | "providerName"
    | "ollamaModel"
    | "geminiModel"
    | "geminiPlan"
    | "learningProfile"
    | "dailyAppTokenLimit"
    | "monthlySpendLimitKrw"
  >;
};

export function estimateCardGenerationUsage(
  input: CardGenerationUsageInput
): CardGenerationUsageEstimate {
  const { settings } = input;
  if (settings.providerName === "mock") {
    return {
      costLabel: "0원",
      electricityLabel: "0원",
      tokenLabel: "0 tokens",
      requestLabel: "0회",
      costKrw: 0,
      electricityKrw: 0,
      tokenCount: 0,
      requestCount: 0,
      runtimeSeconds: 0,
      noteKey: "mock"
    };
  }

  if (settings.providerName === "chatgptWeb") {
    return {
      costLabel: "",
      electricityLabel: "",
      tokenLabel: "",
      requestLabel: "",
      noteKey: "chatgptWebManual"
    };
  }

  const providerName: TranslationProviderName =
    settings.providerName === "ollama" ? "local" : "gemini";
  const model = settings.providerName === "ollama" ? settings.ollamaModel : settings.geminiModel;
  const estimateText = [
    `Selected: ${input.selectedText}`,
    `Source: ${input.sourceSentence}`,
    input.beforeSentence ? `Before: ${input.beforeSentence}` : "",
    input.afterSentence ? `After: ${input.afterSentence}` : "",
    input.readerTextContext ? `Context: ${input.readerTextContext.slice(0, 2200)}` : ""
  ]
    .filter(Boolean)
    .join("\n");
  const estimate = estimateTranslationUsage({
    texts: [{ text: estimateText, cacheStatus: "miss" }],
    providerName,
    model,
    plan: settings.geminiPlan,
    sourceLang: settings.learningProfile.targetLanguage.code,
    targetLang: settings.learningProfile.nativeLanguage.code,
    dailyAppTokenLimit: settings.dailyAppTokenLimit,
    monthlySpendLimitKrw: settings.monthlySpendLimitKrw
  });
  const electricity = estimateLocalElectricity(
    providerName,
    estimate.totalTokens.max,
    estimate.requestCount
  );

  return {
    costLabel: formatKrwValue(estimate.estimatedCostKrw.max),
    electricityLabel: formatElectricityValue(electricity.krw),
    tokenLabel: `${formatCompactNumber(estimate.totalTokens.max)} tokens`,
    requestLabel: `${estimate.requestCount}회`,
    runtimeLabel: electricity.runtimeSeconds > 0 ? `로컬 약 ${formatRuntime(electricity.runtimeSeconds)}` : undefined,
    costKrw: estimate.estimatedCostKrw.max,
    electricityKrw: electricity.krw,
    tokenCount: estimate.totalTokens.max,
    requestCount: estimate.requestCount,
    runtimeSeconds: electricity.runtimeSeconds,
    noteKey:
      settings.providerName === "gemini"
        ? settings.geminiPlan === "free"
          ? "geminiFreeConservative"
          : "cloudBillingGuard"
        : "ollamaLocal"
  };
}

function estimateLocalElectricity(
  providerName: TranslationProviderName,
  totalTokens: number,
  requestCount: number
) {
  if (providerName !== "local" && providerName !== "localMt" && providerName !== "browser") {
    return {
      krw: 0,
      runtimeSeconds: 0
    };
  }

  const systemWatts = 350;
  const krwPerKwh = 200;
  const tokensPerSecond = providerName === "local" ? 18 : providerName === "localMt" ? 90 : 70;
  const runtimeSeconds = Math.max(0, totalTokens) / tokensPerSecond + Math.max(0, requestCount) * 0.8;
  const kwh = (systemWatts / 1000) * (runtimeSeconds / 3600);
  return {
    krw: Math.round(kwh * krwPerKwh * 10) / 10,
    runtimeSeconds
  };
}

function formatKrwValue(value: number) {
  if (value <= 0) {
    return "0원";
  }
  if (value < 1) {
    return "1원 미만";
  }
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function formatElectricityValue(value: number) {
  if (value <= 0) {
    return "0원";
  }
  if (value < 1) {
    return "1원 미만";
  }
  return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}원`;
}

function formatRuntime(seconds: number) {
  if (seconds < 60) {
    return `${Math.max(1, Math.round(seconds))}초`;
  }
  return `${Math.round((seconds / 60) * 10) / 10}분`;
}
