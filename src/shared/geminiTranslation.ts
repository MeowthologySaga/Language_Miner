import { parsePdfSegmentTranslationsLenient } from "./pdfSegmentTranslations";
import { fetchWithTimeout } from "./fetchTimeout";
import { redactSecrets } from "./secretRedaction";
import {
  buildPdfSegmentTranslationRepairUserPrompt,
  buildPdfSegmentTranslationSystemPrompt,
  buildPdfSegmentTranslationUserPrompt,
  buildPdfTranslationSystemPrompt
} from "./translationPrompts";
import {
  createTranslationUsageEvent,
  DEFAULT_GEMINI_MODEL,
  estimateTranslationUsage
} from "./translationUsage";
import type {
  PdfSegmentTranslation,
  TranslatePdfSegmentsInput,
  TranslateTextInput,
  TranslationUsageEvent,
  TranslationUsageTotals
} from "./types";
import {
  GEMINI_MAX_ATTEMPTS_PER_REQUEST,
  GEMINI_PDF_BATCH_MAX_REMOTE_CALLS,
  RemoteRequestBudget,
  throwIfTranslationAborted,
  type TranslationRequestControl
} from "./translationRequestLimits";

export { GEMINI_MAX_ATTEMPTS_PER_REQUEST } from "./translationRequestLimits";

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: {
    message?: string;
  };
};

type GeminiRequestError = {
  message: string;
  status: number;
  model: string;
};

type GeminiRequestResult = {
  text: string;
  model: string;
  usage: TranslationUsageTotals;
};

export type GeminiUsageObservation = {
  model: string;
  usage: TranslationUsageTotals;
  outcome: "success" | "failure";
  exact: boolean;
  attemptCount: number;
};

export type GeminiUsageObserver = (observation: GeminiUsageObservation) => void;

const GEMINI_OVERLOAD_FALLBACK_MODEL = "gemini-2.5-flash-lite";
const GEMINI_RETRY_DELAYS_MS = [600, 1600];
export const GEMINI_MAX_CONCURRENT_REQUESTS = 2;

let activeGeminiRequestCount = 0;
const geminiRequestWaiters: Array<{
  resolve: () => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  abortListener?: () => void;
}> = [];

type AbortableGeminiInput = TranslationRequestControl & {
  timeoutMs?: number;
  onUsage?: GeminiUsageObserver;
};

export async function translateTextWithGemini(input: TranslateTextInput & AbortableGeminiInput): Promise<{
  translatedText: string;
  usage: TranslationUsageEvent;
}> {
  const requestBudget =
    input.requestBudget ??
    new RemoteRequestBudget(GEMINI_MAX_ATTEMPTS_PER_REQUEST, "Gemini text translation");
  const model = normalizeGeminiModel(input.geminiModel ?? input.model);
  const sourceLanguage = input.sourceLanguage ?? {
    code: input.sourceLang?.trim() || "auto",
    nameKo: input.sourceLang?.trim() || "Source",
    nameEn: input.sourceLang?.trim() || "Source"
  };
  const outputLanguage = input.outputLanguage ?? {
    code: input.targetLang.trim() || "ko",
    nameKo: input.targetLang.trim() || "Target",
    nameEn: input.targetLang.trim() || "Target"
  };
  const estimate = estimateTranslationUsage({
    texts: [{ text: input.text, cacheStatus: "miss" }],
    providerName: "gemini",
    model,
    plan: input.geminiPlan,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang
  });
  const result = await requestGeminiContent({
    apiKey: input.geminiApiKey,
    model,
    systemPrompt: buildPdfTranslationSystemPrompt({
      sourceLanguage,
      outputLanguage
    }),
    userPrompt: input.text,
    signal: input.signal,
    requestBudget,
    timeoutMs: input.timeoutMs,
    onUsage: input.onUsage,
    fallbackUsage: {
      inputTokens: estimate.inputTokens.max,
      outputTokens: estimate.outputTokens.max,
      totalTokens: estimate.totalTokens.max,
      billableCharacters: input.text.length,
      requestCount: 1,
      cacheHitCount: 0,
      cacheMissCount: 1
    }
  });

  if (!result.text.trim()) {
    throw new Error("Gemini 응답에 번역문이 없습니다.");
  }

  return {
    translatedText: result.text.trim(),
    usage: createTranslationUsageEvent({
      providerName: "gemini",
      model: result.model,
      plan: input.geminiPlan,
      sourceLang: input.sourceLang,
      targetLang: input.targetLang,
      usage: result.usage
    })
  };
}

export async function translatePdfSegmentsWithGemini(
  input: TranslatePdfSegmentsInput & AbortableGeminiInput
): Promise<{
  translations: PdfSegmentTranslation[];
  usage: TranslationUsageEvent;
}> {
  const requestBudget =
    input.requestBudget ??
    new RemoteRequestBudget(GEMINI_PDF_BATCH_MAX_REMOTE_CALLS, "Gemini PDF batch");
  const model = normalizeGeminiModel(input.geminiModel ?? input.model);
  const sourceLanguage = input.sourceLanguage ?? {
    code: input.sourceLang?.trim() || "auto",
    nameKo: input.sourceLang?.trim() || "Source",
    nameEn: input.sourceLang?.trim() || "Source"
  };
  const outputLanguage = input.outputLanguage ?? {
    code: input.targetLang.trim() || "ko",
    nameKo: input.targetLang.trim() || "Target",
    nameEn: input.targetLang.trim() || "Target"
  };
  const estimate = estimateTranslationUsage({
    texts: input.segments.map((segment) => ({ text: segment.text, cacheStatus: "miss" })),
    providerName: "gemini",
    model,
    plan: input.geminiPlan,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang
  });
  const usageTotals: TranslationUsageTotals[] = [];
  let usageModel = model;
  const result = await requestGeminiContent({
    apiKey: input.geminiApiKey,
    model,
    responseMimeType: "application/json",
    systemPrompt: buildPdfSegmentTranslationSystemPrompt({
      sourceLanguage,
      outputLanguage,
      segmentCount: input.segments.length,
      translationContext: input.translationContext
    }),
    userPrompt: buildPdfSegmentTranslationUserPrompt(input.segments, input.translationContext),
    signal: input.signal,
    requestBudget,
    timeoutMs: input.timeoutMs,
    onUsage: input.onUsage,
    fallbackUsage: {
      inputTokens: estimate.inputTokens.max,
      outputTokens: estimate.outputTokens.max,
      totalTokens: estimate.totalTokens.max,
      billableCharacters: input.segments.reduce((sum, segment) => sum + segment.text.length, 0),
      requestCount: 1,
      cacheHitCount: 0,
      cacheMissCount: input.segments.length
    }
  });
  usageTotals.push(result.usage);
  usageModel = result.model;

  const translationsById = new Map<string, string>();
  addParsedGeminiSegmentTranslations(translationsById, result.text, input.segments);

  let unresolvedSegments = getUnresolvedGeminiSegments(input.segments, translationsById);
  if (unresolvedSegments.length > 0 && requestBudget.remaining > 0) {
    const repairResult = await requestGeminiContent({
      apiKey: input.geminiApiKey,
      model,
      responseMimeType: "application/json",
      systemPrompt: buildPdfSegmentTranslationSystemPrompt({
        sourceLanguage,
        outputLanguage,
        segmentCount: unresolvedSegments.length,
        translationContext: input.translationContext
      }),
      userPrompt: buildPdfSegmentTranslationRepairUserPrompt({
        segments: unresolvedSegments,
        previousTranslations: unresolvedSegments.map((segment) => ({
          id: segment.id,
          translationKo: translationsById.get(segment.id) ?? "",
          issues: ["Gemini omitted this segment id or returned an empty translation."]
        })),
        translationContext: input.translationContext
      }),
      signal: input.signal,
      requestBudget,
      timeoutMs: input.timeoutMs,
      onUsage: input.onUsage,
      fallbackUsage: buildGeminiSegmentFallbackUsage(input, unresolvedSegments, model)
    });
    usageTotals.push(repairResult.usage);
    usageModel = repairResult.model;
    addParsedGeminiSegmentTranslations(translationsById, repairResult.text, unresolvedSegments);
  }

  unresolvedSegments = getUnresolvedGeminiSegments(input.segments, translationsById);
  for (const segment of unresolvedSegments) {
    if (requestBudget.remaining <= 0) {
      break;
    }
    const fallbackResult = await translateSinglePdfSegmentWithGeminiFallback({
      input,
      segment,
      model,
      sourceLanguage,
      outputLanguage,
      requestBudget
    });
    usageTotals.push(...fallbackResult.usageTotals);
    usageModel = fallbackResult.model;
    if (fallbackResult.translationKo) {
      translationsById.set(segment.id, fallbackResult.translationKo);
    }
  }

  const translations = input.segments.flatMap((segment) => {
    const translationKo = translationsById.get(segment.id)?.trim();
    return translationKo ? [{ id: segment.id, translationKo }] : [];
  });

  return {
    translations,
    usage: createTranslationUsageEvent({
      providerName: "gemini",
      model: usageModel,
      plan: input.geminiPlan,
      sourceLang: input.sourceLang,
      targetLang: input.targetLang,
      usage: mergeGeminiUsageTotals(usageTotals, {
        inputTokens: estimate.inputTokens.max,
        outputTokens: estimate.outputTokens.max,
        totalTokens: estimate.totalTokens.max,
        billableCharacters: input.segments.reduce((sum, segment) => sum + segment.text.length, 0),
        requestCount: 1,
        cacheHitCount: 0,
        cacheMissCount: input.segments.length
      })
    })
  };
}

export async function testGeminiConnection(input: {
  apiKey?: string;
  model?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  onUsage?: GeminiUsageObserver;
}): Promise<boolean> {
  const model = normalizeGeminiModel(input.model);
  const result = await requestGeminiContent({
    apiKey: input.apiKey,
    model,
    systemPrompt: "Return only OK.",
    userPrompt: "OK",
    signal: input.signal,
    timeoutMs: input.timeoutMs,
    onUsage: input.onUsage,
    fallbackUsage: {
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
      billableCharacters: 2,
      requestCount: 1,
      cacheHitCount: 0,
      cacheMissCount: 1
    }
  });
  return result.text.trim().length > 0;
}

export async function requestGeminiContent(input: {
  apiKey?: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  fallbackUsage: TranslationUsageTotals;
  responseMimeType?: "application/json" | "text/plain";
  signal?: AbortSignal;
  requestBudget?: RemoteRequestBudget;
  timeoutMs?: number;
  onUsage?: GeminiUsageObserver;
}): Promise<GeminiRequestResult> {
  throwIfTranslationAborted(input.signal);
  const apiKey = input.apiKey?.trim();
  if (!apiKey) {
    throw new Error("Gemini API key가 필요합니다.");
  }

  const models = getGeminiRequestModels(input.model);
  const errors: GeminiRequestError[] = [];
  const requestBudget =
    input.requestBudget ??
    new RemoteRequestBudget(GEMINI_MAX_ATTEMPTS_PER_REQUEST, "Gemini request");
  if (requestBudget.remaining <= 0) {
    requestBudget.consume();
  }
  let attemptCount = 0;
  let usageObserved = false;
  const observeUsageOnce = (observation: GeminiUsageObservation) => {
    if (usageObserved) return;
    usageObserved = true;
    try {
      input.onUsage?.(observation);
    } catch {
      // Usage telemetry is local bookkeeping and must not alter the provider result.
    }
  };

  try {
    for (const [modelIndex, model] of models.entries()) {
      const retryCount = modelIndex === 0 ? GEMINI_RETRY_DELAYS_MS.length + 1 : 1;
      for (let attempt = 0; attempt < retryCount; attempt += 1) {
        if (
          attemptCount >= GEMINI_MAX_ATTEMPTS_PER_REQUEST ||
          requestBudget.remaining <= 0
        ) break;
        requestBudget.consume();
        attemptCount += 1;
        const result = await tryGeminiContent({
          ...input,
          apiKey,
          model
        });
        if ("payload" in result) {
          const text =
            result.payload.candidates?.[0]?.content?.parts
              ?.map((part) => part.text ?? "")
              .join("")
              .trim() ?? "";

          const currentUsage = usageTotalsFromGemini(
            result.payload.usageMetadata,
            input.fallbackUsage
          );
          const usage = addConservativeFailedAttemptUsage(
            currentUsage,
            input.fallbackUsage,
            attemptCount - 1
          );
          observeUsageOnce({
            model,
            usage,
            outcome: "success",
            exact: Boolean(result.payload.usageMetadata) && attemptCount === 1,
            attemptCount
          });
          return { text, model, usage };
        }

        errors.push(result.error);
        if (!shouldRetryGeminiError(result.error) || attempt >= retryCount - 1) {
          break;
        }
        await sleep(GEMINI_RETRY_DELAYS_MS[attempt] ?? 0, input.signal);
      }

      const lastError = errors[errors.length - 1];
      if (!lastError || !shouldFallbackGeminiModel(lastError, model, models[modelIndex + 1])) {
        break;
      }
    }
  } catch (error) {
    if (attemptCount > 0) {
      observeUsageOnce({
        model: errors.at(-1)?.model ?? models[0],
        usage: scaleGeminiFallbackUsage(input.fallbackUsage, attemptCount),
        outcome: "failure",
        exact: false,
        attemptCount
      });
    }
    throw error;
  }

  if (attemptCount > 0) {
    observeUsageOnce({
      model: errors.at(-1)?.model ?? models[0],
      usage: scaleGeminiFallbackUsage(input.fallbackUsage, attemptCount),
      outcome: "failure",
      exact: false,
      attemptCount
    });
  }
  throw new Error(formatGeminiRequestError(input.model, errors));
}

function addConservativeFailedAttemptUsage(
  successfulUsage: TranslationUsageTotals,
  fallbackUsage: TranslationUsageTotals,
  failedAttemptCount: number
): TranslationUsageTotals {
  if (failedAttemptCount <= 0) {
    return successfulUsage;
  }
  const failedUsage = scaleGeminiFallbackUsage(fallbackUsage, failedAttemptCount);
  return {
    inputTokens: successfulUsage.inputTokens + failedUsage.inputTokens,
    outputTokens: successfulUsage.outputTokens + failedUsage.outputTokens,
    totalTokens: successfulUsage.totalTokens + failedUsage.totalTokens,
    billableCharacters: successfulUsage.billableCharacters + failedUsage.billableCharacters,
    requestCount: successfulUsage.requestCount + failedUsage.requestCount,
    cacheHitCount: successfulUsage.cacheHitCount + failedUsage.cacheHitCount,
    cacheMissCount: successfulUsage.cacheMissCount + failedUsage.cacheMissCount
  };
}

function scaleGeminiFallbackUsage(
  fallbackUsage: TranslationUsageTotals,
  attemptCount: number
): TranslationUsageTotals {
  const multiplier = Math.max(1, Math.floor(attemptCount));
  return {
    inputTokens: fallbackUsage.inputTokens * multiplier,
    outputTokens: fallbackUsage.outputTokens * multiplier,
    totalTokens: fallbackUsage.totalTokens * multiplier,
    billableCharacters: fallbackUsage.billableCharacters * multiplier,
    requestCount: Math.max(multiplier, fallbackUsage.requestCount * multiplier),
    cacheHitCount: fallbackUsage.cacheHitCount * multiplier,
    cacheMissCount: Math.max(multiplier, fallbackUsage.cacheMissCount * multiplier)
  };
}

async function tryGeminiContent(input: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  fallbackUsage: TranslationUsageTotals;
  responseMimeType?: "application/json" | "text/plain";
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<
  | { payload: GeminiGenerateContentResponse }
  | { error: GeminiRequestError }
> {
  const response = await runWithGeminiRequestSlot(input.signal, () =>
    fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        input.model
      )}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": input.apiKey
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: input.systemPrompt }]
          },
          contents: [
            {
              role: "user",
              parts: [{ text: input.userPrompt }]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            topP: 0.9,
            responseMimeType: input.responseMimeType
          }
        })
      },
      {
        signal: input.signal,
        timeoutMs: input.timeoutMs,
        timeoutMessage: `Gemini ${input.model} 요청 시간이 초과되었습니다.`
      }
    )
  );
  const payload = (await response.json()) as GeminiGenerateContentResponse;
  if (response.ok) {
    return { payload };
  }

  return {
    error: {
      message: redactSecrets(
        payload.error?.message ?? `Gemini request failed: ${response.status}`,
        [input.apiKey]
      ),
      status: response.status,
      model: input.model
    }
  };
}

async function runWithGeminiRequestSlot<T>(signal: AbortSignal | undefined, run: () => Promise<T>) {
  await acquireGeminiRequestSlot(signal);
  try {
    return await run();
  } finally {
    releaseGeminiRequestSlot();
  }
}

function acquireGeminiRequestSlot(signal?: AbortSignal) {
  if (signal?.aborted) return Promise.reject(createGeminiAbortError());
  if (activeGeminiRequestCount < GEMINI_MAX_CONCURRENT_REQUESTS) {
    activeGeminiRequestCount += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const waiter: (typeof geminiRequestWaiters)[number] = { resolve, reject, signal };
    if (signal) {
      waiter.abortListener = () => {
        const index = geminiRequestWaiters.indexOf(waiter);
        if (index >= 0) geminiRequestWaiters.splice(index, 1);
        reject(createGeminiAbortError());
      };
      signal.addEventListener("abort", waiter.abortListener, { once: true });
    }
    geminiRequestWaiters.push(waiter);
  });
}

function releaseGeminiRequestSlot() {
  activeGeminiRequestCount = Math.max(0, activeGeminiRequestCount - 1);
  while (geminiRequestWaiters.length) {
    const waiter = geminiRequestWaiters.shift();
    if (!waiter) return;
    if (waiter.signal?.aborted) {
      waiter.reject(createGeminiAbortError());
      continue;
    }
    if (waiter.abortListener && waiter.signal) {
      waiter.signal.removeEventListener("abort", waiter.abortListener);
    }
    activeGeminiRequestCount += 1;
    waiter.resolve();
    return;
  }
}

function createGeminiAbortError() {
  return new DOMException("Gemini request was canceled.", "AbortError");
}

function usageTotalsFromGemini(
  usage: GeminiGenerateContentResponse["usageMetadata"],
  fallback: TranslationUsageTotals
): TranslationUsageTotals {
  if (!usage) {
    return fallback;
  }

  const inputTokens = usage.promptTokenCount ?? fallback.inputTokens;
  const knownOutputTokens =
    (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0);
  const outputTokens =
    knownOutputTokens > 0
      ? knownOutputTokens
      : Math.max(0, (usage.totalTokenCount ?? fallback.totalTokens) - inputTokens);
  const totalTokens = usage.totalTokenCount ?? inputTokens + outputTokens;

  return {
    ...fallback,
    inputTokens,
    outputTokens,
    totalTokens
  };
}

function addParsedGeminiSegmentTranslations(
  translationsById: Map<string, string>,
  responseText: string,
  expectedSegments: TranslatePdfSegmentsInput["segments"]
) {
  const parsed = parsePdfSegmentTranslationsLenient(responseText, expectedSegments).translations;
  for (const translation of parsed) {
    const translationKo = translation.translationKo.trim();
    if (translationKo) {
      translationsById.set(translation.id, translationKo);
    }
  }
}

function getUnresolvedGeminiSegments(
  segments: TranslatePdfSegmentsInput["segments"],
  translationsById: Map<string, string>
) {
  return segments.filter((segment) => !translationsById.get(segment.id)?.trim());
}

async function translateSinglePdfSegmentWithGeminiFallback(input: {
  input: TranslatePdfSegmentsInput & AbortableGeminiInput;
  segment: TranslatePdfSegmentsInput["segments"][number];
  model: string;
  sourceLanguage: NonNullable<TranslatePdfSegmentsInput["sourceLanguage"]>;
  outputLanguage: NonNullable<TranslatePdfSegmentsInput["outputLanguage"]>;
  requestBudget: RemoteRequestBudget;
}): Promise<{
  translationKo?: string;
  model: string;
  usageTotals: TranslationUsageTotals[];
}> {
  const usageTotals: TranslationUsageTotals[] = [];
  let model = input.model;

  for (let attempt = 0; attempt < 2 && input.requestBudget.remaining > 0; attempt += 1) {
    const result = await requestGeminiContent({
      apiKey: input.input.geminiApiKey,
      model: input.model,
      responseMimeType: "application/json",
      systemPrompt: buildPdfSegmentTranslationSystemPrompt({
        sourceLanguage: input.sourceLanguage,
        outputLanguage: input.outputLanguage,
        segmentCount: 1,
        translationContext: input.input.translationContext
      }),
      userPrompt: buildPdfSegmentTranslationUserPrompt(
        [input.segment],
        input.input.translationContext
      ),
      signal: input.input.signal,
      requestBudget: input.requestBudget,
      timeoutMs: input.input.timeoutMs,
      onUsage: input.input.onUsage,
      fallbackUsage: buildGeminiSegmentFallbackUsage(input.input, [input.segment], input.model)
    });
    usageTotals.push(result.usage);
    model = result.model;
    const parsed = parsePdfSegmentTranslationsLenient(result.text, [input.segment]).translations;
    const translationKo = parsed
      .find((translation) => translation.id === input.segment.id)
      ?.translationKo.trim();
    if (translationKo) {
      return { translationKo, model, usageTotals };
    }
  }

  if (input.requestBudget.remaining <= 0) {
    return { model, usageTotals };
  }

  const plainResult = await requestGeminiContent({
    apiKey: input.input.geminiApiKey,
    model: input.model,
    systemPrompt: buildPdfTranslationSystemPrompt({
      sourceLanguage: input.sourceLanguage,
      outputLanguage: input.outputLanguage
    }),
    userPrompt: input.segment.text,
    signal: input.input.signal,
    requestBudget: input.requestBudget,
    timeoutMs: input.input.timeoutMs,
    onUsage: input.input.onUsage,
    fallbackUsage: buildGeminiSegmentFallbackUsage(input.input, [input.segment], input.model)
  });
  usageTotals.push(plainResult.usage);
  model = plainResult.model;
  const translationKo = plainResult.text.trim();

  return {
    translationKo: translationKo || undefined,
    model,
    usageTotals
  };
}

function buildGeminiSegmentFallbackUsage(
  input: TranslatePdfSegmentsInput,
  segments: TranslatePdfSegmentsInput["segments"],
  model: string
): TranslationUsageTotals {
  const estimate = estimateTranslationUsage({
    texts: segments.map((segment) => ({ text: segment.text, cacheStatus: "miss" })),
    providerName: "gemini",
    model,
    plan: input.geminiPlan,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang
  });

  return {
    inputTokens: estimate.inputTokens.max,
    outputTokens: estimate.outputTokens.max,
    totalTokens: estimate.totalTokens.max,
    billableCharacters: segments.reduce((sum, segment) => sum + segment.text.length, 0),
    requestCount: 1,
    cacheHitCount: 0,
    cacheMissCount: segments.length
  };
}

function mergeGeminiUsageTotals(
  usageTotals: TranslationUsageTotals[],
  fallback: TranslationUsageTotals
): TranslationUsageTotals {
  if (usageTotals.length === 0) {
    return fallback;
  }

  return usageTotals.reduce(
    (sum, usage) => ({
      inputTokens: sum.inputTokens + usage.inputTokens,
      outputTokens: sum.outputTokens + usage.outputTokens,
      totalTokens: sum.totalTokens + usage.totalTokens,
      billableCharacters: sum.billableCharacters + usage.billableCharacters,
      requestCount: sum.requestCount + usage.requestCount,
      cacheHitCount: sum.cacheHitCount + usage.cacheHitCount,
      cacheMissCount: sum.cacheMissCount + usage.cacheMissCount
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
}

function normalizeGeminiModel(model?: string) {
  const trimmed = model?.trim() || DEFAULT_GEMINI_MODEL;
  return trimmed.replace(/^models\//, "");
}

function getGeminiRequestModels(primaryModel: string) {
  const normalizedPrimary = normalizeGeminiModel(primaryModel);
  const fallback = normalizeGeminiModel(GEMINI_OVERLOAD_FALLBACK_MODEL);
  return normalizedPrimary === fallback
    ? [normalizedPrimary]
    : [normalizedPrimary, fallback];
}

function shouldRetryGeminiError(error: GeminiRequestError) {
  return (
    [429, 500, 502, 503, 504].includes(error.status) ||
    /high demand|overload|unavailable|rate limit|temporarily/i.test(error.message)
  );
}

function shouldFallbackGeminiModel(
  error: GeminiRequestError,
  currentModel: string,
  nextModel?: string
) {
  return Boolean(
    nextModel &&
      normalizeGeminiModel(currentModel) !== normalizeGeminiModel(nextModel) &&
      (error.status === 503 || /high demand|overload|unavailable/i.test(error.message))
  );
}

function formatGeminiRequestError(primaryModel: string, errors: GeminiRequestError[]) {
  const lastError = errors[errors.length - 1];
  if (!lastError) {
    return "Gemini request failed.";
  }

  const triedModels = Array.from(new Set(errors.map((error) => error.model))).join(", ");
  if (errors.some((error) => shouldFallbackGeminiModel(error, error.model, GEMINI_OVERLOAD_FALLBACK_MODEL))) {
    return `Gemini model is overloaded. Tried ${triedModels}. Change Settings > Gemini model to ${GEMINI_OVERLOAD_FALLBACK_MODEL} or retry later. Last error: ${lastError.message}`;
  }

  return primaryModel === lastError.model
    ? lastError.message
    : `Gemini request failed after fallback from ${primaryModel} to ${lastError.model}. Last error: ${lastError.message}`;
}

function sleep(ms: number, signal?: AbortSignal) {
  if (signal?.aborted) {
    return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
  }
  return new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, ms);
    function handleAbort() {
      clearTimeout(timeoutId);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    }
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}
