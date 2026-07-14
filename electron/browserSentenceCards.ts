import {
  createBrowserSentenceFallbackCardData,
  ensureBrowserSentenceSelectedTerms
} from "../src/shared/browserSentenceFallbackCard";
import { createStudyCardFromGenerated } from "../src/shared/cardFactory";
import {
  createTranslationUsageEvent,
  estimateTranslationUsage,
  formatCompactNumber,
  scaleTranslationUsageTotalsForAttempts
} from "../src/shared/translationUsage";
import { GEMINI_MAX_ATTEMPTS_PER_REQUEST } from "../src/shared/translationRequestLimits";
import type {
  AppSettings,
  CloudProviderConsentRecord,
  HighlightColorKey,
  LifeLogMetadata,
  StudyCard,
  TranslationUsageEvent,
  TranslationProviderName
} from "../src/shared/types";
import { normalizeBridgeText } from "./bridgeInputUtils";
import { isValidCloudProviderConsentRecord } from "../src/shared/cloudProviderConsent";

export type BrowserSentenceCardCaptureInput = {
  action?: "preview" | "save";
  selectedText?: string;
  sourceSentence?: string;
  beforeContext?: string;
  afterContext?: string;
  pageTextContext?: string;
  appName?: string;
  metadata?: LifeLogMetadata;
  languagePolicyOverride?: boolean;
};

export type BrowserBridgeTranslateInput = {
  text?: string;
  sourceLang?: string;
  targetLang?: string;
};

export type BrowserSentenceCardProviderStatus = {
  providerName: "gemini" | "ollama" | "fallback";
  model?: string;
  reason?: string;
  usageEstimate?: BrowserSentenceCardUsageEstimate;
};

export type BrowserSentenceCardUsageEstimate = {
  costLabel: string;
  electricityLabel: string;
  tokenLabel: string;
  requestLabel: string;
  runtimeLabel?: string;
  note?: string;
};

export type BrowserSentenceCardCreationResult = {
  card: StudyCard;
  providerStatus: BrowserSentenceCardProviderStatus;
  usage?: TranslationUsageEvent;
};

export type BrowserCardProviderSettings = Pick<
  AppSettings,
  | "providerName"
  | "ollamaBaseUrl"
  | "ollamaModel"
  | "geminiApiKey"
  | "geminiModel"
  | "geminiPlan"
  | "learningProfile"
  | "dailyAppTokenLimit"
  | "monthlySpendLimitKrw"
> & { cloudConsent?: CloudProviderConsentRecord };

export const browserCardColors: HighlightColorKey[] = [
  "red",
  "orange",
  "blue",
  "purple",
  "green",
  "pink",
  "cyan",
  "yellow",
  "lime",
  "slate"
];

export function createFallbackBrowserSentenceCard(input: {
  selectedText: string;
  sourceSentence: string;
  translatedSentence?: string;
  profileId: string;
  now: string;
}) {
  const fallbackCard = createStudyCardFromGenerated(
    createBrowserSentenceFallbackCardData({
      selectedText: input.selectedText,
      sourceSentence: input.sourceSentence,
      translatedSentence: input.translatedSentence,
      colorKeys: browserCardColors
    })
  );
  return {
    ...fallbackCard,
    profileId: input.profileId,
    createdAt: input.now,
    updatedAt: input.now
  };
}

export function prepareBrowserSentenceCard(
  card: StudyCard,
  input: BrowserSentenceCardCaptureInput
): StudyCard {
  return withBrowserSentenceSourceNote(
    ensureBrowserSentenceSelectedTerms(
      card,
      normalizeBridgeText(input.selectedText),
      browserCardColors
    ),
    input
  );
}

export function withBrowserSentenceSourceNote(
  card: StudyCard,
  input: BrowserSentenceCardCaptureInput
): StudyCard {
  if (card.cardType !== "reading" || card.deckType !== "input") {
    return card;
  }

  const sourceNote = createBrowserSentenceSourceNote(input);
  if (!sourceNote) {
    return card;
  }

  return {
    ...card,
    structureNote: sourceNote
  };
}

export function createBrowserSentenceSourceNote(input: BrowserSentenceCardCaptureInput) {
  const appName = normalizeBridgeText(input.appName);
  const title = normalizeBridgeText(input.metadata?.title);
  const url = normalizeBridgeText(input.metadata?.url);
  const capturedAt = normalizeBridgeText(input.metadata?.capturedAt);
  const lines = [
    appName ? `앱: ${appName}` : "",
    title && title !== appName ? `문서: ${title}` : "",
    url ? `URL: ${url}` : "",
    capturedAt ? `수집 시각: ${capturedAt}` : ""
  ].filter(Boolean);
  return lines.join("\n");
}

export function estimateBrowserSentenceCardUsage(
  input: BrowserSentenceCardCaptureInput,
  settings: BrowserCardProviderSettings & { providerName: "gemini" | "ollama" }
): BrowserSentenceCardUsageEstimate {
  const usageProviderName: TranslationProviderName =
    settings.providerName === "ollama" ? "local" : "gemini";
  const model = settings.providerName === "gemini" ? settings.geminiModel : settings.ollamaModel;
  const sourceLang = settings.learningProfile.targetLanguage.code;
  const targetLang = settings.learningProfile.nativeLanguage.code;
  const estimateText = [
    `Selected: ${normalizeBridgeText(input.selectedText)}`,
    `Source: ${normalizeBridgeText(input.sourceSentence)}`,
    input.beforeContext ? `Before: ${normalizeBridgeText(input.beforeContext)}` : "",
    input.afterContext ? `After: ${normalizeBridgeText(input.afterContext)}` : "",
    input.appName ? `App: ${normalizeBridgeText(input.appName)}` : "",
    input.metadata?.title ? `Title: ${normalizeBridgeText(input.metadata.title)}` : ""
  ]
    .filter(Boolean)
    .join("\n");
  const estimate = estimateTranslationUsage({
    texts: [{ text: estimateText, cacheStatus: "miss" }],
    providerName: usageProviderName,
    model,
    plan: settings.geminiPlan,
    sourceLang,
    targetLang,
    dailyAppTokenLimit: settings.dailyAppTokenLimit,
    monthlySpendLimitKrw: settings.monthlySpendLimitKrw
  });
  const maximumAttempts =
    usageProviderName === "gemini" ? GEMINI_MAX_ATTEMPTS_PER_REQUEST : 1;
  const electricity = estimateBrowserSentenceCardElectricity(
    usageProviderName,
    estimate.totalTokens.max * maximumAttempts,
    estimate.requestCount * maximumAttempts
  );

  return {
    costLabel: formatKrwValue(estimate.estimatedCostKrw.max * maximumAttempts),
    electricityLabel: formatElectricityValue(electricity.krw),
    tokenLabel: `${formatCompactNumber(estimate.totalTokens.max * maximumAttempts)} tokens`,
    requestLabel: `${estimate.requestCount * maximumAttempts}회`,
    runtimeLabel:
      electricity.runtimeSeconds > 0
        ? `로컬 약 ${formatRuntimeSeconds(electricity.runtimeSeconds)}`
        : undefined,
    note:
      settings.providerName === "gemini" && settings.geminiPlan === "free"
        ? "Gemini 무료 등급 기준"
        : settings.providerName === "ollama"
          ? "Ollama 로컬 실행 기준"
          : undefined
  };
}

export function createBrowserSentenceCardUsageEvent(
  input: BrowserSentenceCardCaptureInput,
  settings: BrowserCardProviderSettings & { providerName: "gemini" | "ollama" },
  profileId: string
): TranslationUsageEvent {
  const usageProviderName: TranslationProviderName =
    settings.providerName === "ollama" ? "local" : "gemini";
  const model = settings.providerName === "gemini" ? settings.geminiModel : settings.ollamaModel;
  const sourceLang = settings.learningProfile.targetLanguage.code;
  const targetLang = settings.learningProfile.nativeLanguage.code;
  const estimateText = [
    `Selected: ${normalizeBridgeText(input.selectedText)}`,
    `Source: ${normalizeBridgeText(input.sourceSentence)}`,
    input.beforeContext ? `Before: ${normalizeBridgeText(input.beforeContext)}` : "",
    input.afterContext ? `After: ${normalizeBridgeText(input.afterContext)}` : "",
    input.pageTextContext ? `Page context: ${normalizeBridgeText(input.pageTextContext).slice(0, 2200)}` : "",
    input.appName ? `App: ${normalizeBridgeText(input.appName)}` : "",
    input.metadata?.title ? `Title: ${normalizeBridgeText(input.metadata.title)}` : "",
    "Generate one structured browser sentence card as JSON."
  ]
    .filter(Boolean)
    .join("\n");
  const estimate = estimateTranslationUsage({
    texts: [{ text: estimateText, cacheStatus: "miss" }],
    providerName: usageProviderName,
    model,
    plan: settings.geminiPlan,
    sourceLang,
    targetLang,
    dailyAppTokenLimit: settings.dailyAppTokenLimit,
    monthlySpendLimitKrw: settings.monthlySpendLimitKrw
  });

  return createTranslationUsageEvent({
    profileId,
    providerName: usageProviderName,
    model: estimate.model,
    plan: settings.geminiPlan,
    sourceLang,
    targetLang,
    usage: scaleTranslationUsageTotalsForAttempts(
      {
        inputTokens: estimate.inputTokens.max,
        outputTokens: estimate.outputTokens.max,
        totalTokens: estimate.totalTokens.max,
        billableCharacters: estimate.billableCharacters,
        requestCount: estimate.requestCount,
        cacheHitCount: estimate.cacheHitCount,
        cacheMissCount: estimate.cacheMissCount
      },
      usageProviderName === "gemini" ? GEMINI_MAX_ATTEMPTS_PER_REQUEST : 1
    )
  });
}

export function estimateBrowserSentenceCardElectricity(
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
  const runtimeSeconds =
    Math.max(0, totalTokens) / tokensPerSecond + Math.max(0, requestCount) * 0.8;
  const kwh = (systemWatts / 1000) * (runtimeSeconds / 3600);
  return {
    krw: Math.round(kwh * krwPerKwh * 10) / 10,
    runtimeSeconds
  };
}

export function formatKrwValue(value: number) {
  if (value <= 0) {
    return "0원";
  }
  if (value < 1) {
    return "1원 미만";
  }
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

export function formatElectricityValue(value: number) {
  if (value <= 0) {
    return "0원";
  }
  if (value < 1) {
    return "1원 미만";
  }
  return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}원`;
}

export function formatRuntimeSeconds(value: number) {
  if (value < 60) {
    return `${Math.max(1, Math.round(value))}초`;
  }
  return `${Math.round((value / 60) * 10) / 10}분`;
}

export function getEffectiveBrowserCardProviderSettings(
  settings: BrowserCardProviderSettings
): (BrowserCardProviderSettings & { providerName: "gemini" | "ollama" }) | null {
  const hasGeminiKey = Boolean(settings.geminiApiKey.trim());
  if (
    settings.providerName === "gemini" &&
    hasGeminiKey &&
    isValidCloudProviderConsentRecord(settings.cloudConsent, "gemini")
  ) {
    return { ...settings, providerName: "gemini" };
  }
  if (settings.providerName === "ollama") {
    return { ...settings, providerName: "ollama" };
  }
  return null;
}

export function getBrowserCardProviderFallbackReason(settings: BrowserCardProviderSettings) {
  if (settings.providerName === "chatgptWeb") {
    return "Manual ChatGPT Web generation requires the visible Language Miner app.";
  }
  if (settings.providerName === "gemini" && !settings.geminiApiKey.trim()) {
    return "Gemini API key is empty.";
  }
  if (settings.providerName === "mock" && !settings.geminiApiKey.trim()) {
    return "Card provider is mock and Gemini API key is empty.";
  }
  return "No card provider was available.";
}

export function getBrowserCardProviderDebugStatus(settings: BrowserCardProviderSettings) {
  const effective = getEffectiveBrowserCardProviderSettings(settings);
  return {
    configuredProviderName: settings.providerName,
    providerName: effective?.providerName ?? "fallback",
    model:
      effective?.providerName === "gemini"
        ? effective.geminiModel
        : effective?.providerName === "ollama"
          ? effective.ollamaModel
          : undefined,
    geminiPlan: settings.geminiPlan,
    learningProfile: settings.learningProfile,
    dailyAppTokenLimit: settings.dailyAppTokenLimit,
    monthlySpendLimitKrw: settings.monthlySpendLimitKrw,
    hasGeminiApiKey: Boolean(settings.geminiApiKey.trim())
  };
}

export function isDuplicateBrowserSentenceCardCapture(
  recentCaptures: Map<string, number>,
  input: BrowserSentenceCardCaptureInput,
  selectedText: string,
  sourceSentence: string,
  dedupeMs: number,
  now = Date.now()
) {
  for (const [key, capturedAt] of recentCaptures.entries()) {
    if (now - capturedAt > dedupeMs) {
      recentCaptures.delete(key);
    }
  }

  const key = [
    normalizeBridgeText(input.appName),
    normalizeBridgeText(input.metadata?.url),
    selectedText,
    sourceSentence
  ].join("\u001f");
  const previous = recentCaptures.get(key);
  recentCaptures.set(key, now);
  return previous !== undefined && now - previous < dedupeMs;
}
