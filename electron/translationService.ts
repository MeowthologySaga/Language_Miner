import type {
  OllamaModelInput,
  OllamaModelStatusResult,
  PdfSegmentTranslation,
  ProfileLanguage,
  PullOllamaModelResult,
  TranslationConnectionTestInput,
  TranslationConnectionTestResult,
  TranslatePdfSegmentsInput,
  TranslateTextInput
} from "../src/shared/types";
import {
  buildPdfSegmentTranslationRepairUserPrompt,
  buildPdfSegmentTranslationSystemPrompt,
  buildPdfSegmentTranslationUserPrompt,
  buildPdfTranslationRevisionPrompt,
  buildPdfTranslationSystemPrompt
} from "../src/shared/translationPrompts";
import { buildPdfTranslationContext } from "../src/shared/pdfTranslationContext";
import { fetchWithTimeout } from "../src/shared/fetchTimeout";
import { buildGoogleTranslationRequest } from "../src/shared/googleTranslationRequest";
import { redactSecrets } from "../src/shared/secretRedaction";
import { assertCloudProviderConsent } from "../src/shared/cloudProviderConsent";
import {
  isOllamaReadinessError,
  OllamaReadinessError,
  type OllamaReadinessErrorCode
} from "../src/shared/ollamaReadinessError";
import { translateTextsWithGoogle as translateTextsWithGoogleShared } from "../src/shared/googleTranslation";
import { parsePdfSegmentTranslationsLenient } from "../src/shared/pdfSegmentTranslations";
import {
  testGeminiConnection,
  translatePdfSegmentsWithGemini as translatePdfSegmentsWithGeminiShared,
  translateTextWithGemini as translateTextWithGeminiShared,
  type GeminiUsageObserver
} from "../src/shared/geminiTranslation";
import {
  assessPdfTranslationQuality,
  hasCriticalPdfTranslationQualityIssues,
  shouldReviewPdfProperNouns
} from "../src/shared/translationQuality";
import {
  OLLAMA_PDF_BATCH_MAX_REMOTE_CALLS,
  OLLAMA_TEXT_MAX_REMOTE_CALLS,
  RemoteRequestBudget,
  isAbortError,
  isRemoteRequestBudgetExceededError,
  throwIfTranslationAborted,
  type TranslationRequestControl
} from "../src/shared/translationRequestLimits";
import {
  testLocalMtConnection,
  translatePdfSegmentsWithLocalMt,
  translateWithLocalMt
} from "./localMtTranslationService";
import { ensureOllamaRuntime } from "./ollamaRuntimeService";

export { translatePdfSegmentsWithLocalMt, translateWithLocalMt };

type GoogleTranslateResponse = {
  data?: {
    translations?: Array<{
      translatedText?: string;
    }>;
  };
  error?: {
    message?: string;
  };
};

export async function translateWithGoogle(
  input: TranslateTextInput & TranslationRequestControl
) {
  assertCloudProviderConsent("google", input.cloudConsent);
  const apiKey = input.googleApiKey?.trim();
  if (!apiKey) {
    throw new Error("Google Translate API key가 필요합니다.");
  }

  const requestBody: Record<string, unknown> = {
    q: input.text,
    target: normalizeTargetLang(input.targetLang),
    format: "text"
  };
  const sourceLang = normalizeSourceLang(input.sourceLang);
  if (sourceLang !== "auto") {
    requestBody.source = sourceLang;
  }

  const request = buildGoogleTranslationRequest(apiKey, requestBody);
  const response = await fetchWithTimeout(
    request.url,
    request.init,
    {
      signal: input.signal,
      timeoutMs: 45_000,
      timeoutMessage: "Google Translate request timed out."
    }
  );
  const payload = (await response.json()) as GoogleTranslateResponse;
  if (!response.ok) {
    throw new Error(
      redactSecrets(payload.error?.message ?? "Google Translate 요청에 실패했습니다.", [apiKey])
    );
  }

  const translatedText = payload.data?.translations?.[0]?.translatedText;
  if (!translatedText) {
    throw new Error("Google Translate 응답에 번역문이 없습니다.");
  }

  return decodeHtmlEntities(translatedText);
}

export async function translateTextsWithGoogle(
  input: TranslatePdfSegmentsInput & TranslationRequestControl,
  texts: string[]
) {
  assertCloudProviderConsent("google", input.cloudConsent);
  return translateTextsWithGoogleShared(input, texts);
}

export async function translateWithGemini(
  input: TranslateTextInput & TranslationRequestControl & { onUsage?: GeminiUsageObserver }
) {
  assertCloudProviderConsent("gemini", input.cloudConsent);
  return translateTextWithGeminiShared(input);
}

export async function translatePdfSegmentsWithGemini(
  input: TranslatePdfSegmentsInput & TranslationRequestControl & { onUsage?: GeminiUsageObserver }
) {
  assertCloudProviderConsent("gemini", input.cloudConsent);
  return translatePdfSegmentsWithGeminiShared(input);
}

export async function testTranslationConnection(
  input: TranslationConnectionTestInput,
  options: { onGeminiUsage?: GeminiUsageObserver } = {}
): Promise<TranslationConnectionTestResult> {
  if (input.providerName === "gemini" || input.providerName === "google") {
    try {
      assertCloudProviderConsent(input.providerName, input.cloudConsent);
    } catch {
      return connectionTestResult(input, false, "provider_request_failed");
    }
  }
  if (
    (input.providerName === "gemini" && !input.geminiApiKey?.trim()) ||
    (input.providerName === "google" && !input.googleApiKey?.trim())
  ) {
    return connectionTestResult(input, false, "api_key_required");
  }

  try {
    if (input.providerName === "gemini") {
      await testGeminiConnection({
        apiKey: input.geminiApiKey,
        model: input.geminiModel,
        onUsage: options.onGeminiUsage
      });
      return connectionTestResult(input, true, "connected");
    }

    if (input.providerName === "google") {
      await translateWithGoogle({
        text: "Hello.",
        targetLang: "ko",
        providerName: "google",
        googleApiKey: input.googleApiKey,
        cloudConsent: input.cloudConsent
      });
      return connectionTestResult(input, true, "connected");
    }

    if (input.providerName === "browser") {
      return {
        ok: false,
        code: "browser_renderer_only",
        providerName: "browser"
      };
    }

    if (input.providerName === "localMt") {
      return testLocalMtConnection(input);
    }

    await ensureOllamaReadyForTranslation({
      baseUrl: input.ollamaBaseUrl,
      model: input.ollamaModel ?? ""
    });
    return connectionTestResult(input, true, "connected");
  } catch (caught) {
    if (isOllamaReadinessError(caught)) {
      return connectionTestResult(input, false, connectionCodeFromOllamaError(caught.code), {
        baseUrl: caught.details.baseUrl,
        model: caught.details.model
      });
    }
    return connectionTestResult(input, false, "provider_request_failed");
  }
}

function connectionCodeFromOllamaError(
  code: OllamaReadinessErrorCode
): TranslationConnectionTestResult["code"] {
  switch (code) {
    case "model_required":
      return "model_required";
    case "runtime_not_installed":
      return "ollama_runtime_not_installed";
    case "runtime_start_failed":
      return "ollama_runtime_start_failed";
    case "model_missing":
      return "ollama_model_missing";
    case "server_unreachable":
      return "ollama_server_unreachable";
    case "model_list_failed":
      return "ollama_model_list_failed";
  }
}

function connectionTestResult(
  input: TranslationConnectionTestInput,
  ok: boolean,
  code: TranslationConnectionTestResult["code"],
  details: { baseUrl?: string; model?: string } = {}
): TranslationConnectionTestResult {
  return {
    ok,
    code,
    providerName: input.providerName,
    model:
      details.model ??
      (input.providerName === "localMt"
        ? input.localMtModel?.trim()
        : input.providerName === "local"
          ? input.ollamaModel?.trim()
          : input.providerName === "gemini"
            ? input.geminiModel?.trim()
            : undefined),
    baseUrl:
      details.baseUrl ??
      (input.providerName === "local" ? input.ollamaBaseUrl?.trim() : undefined)
  };
}

export async function translateWithLocalOllama(
  input: TranslateTextInput & TranslationRequestControl
) {
  const { baseUrl: normalizedBaseUrl, model } = await ensureOllamaReadyForTranslation({
    baseUrl: input.ollamaBaseUrl,
    model: input.ollamaModel ?? ""
  });

  const sourceLanguage = input.sourceLanguage ?? languageFromCode(input.sourceLang, "Source");
  const outputLanguage = input.outputLanguage ?? languageFromCode(input.targetLang, "Target");
  const systemPrompt = buildPdfTranslationSystemPrompt({
    sourceLanguage,
    outputLanguage
  });
  const requestBudget =
    input.requestBudget ??
    new RemoteRequestBudget(OLLAMA_TEXT_MAX_REMOTE_CALLS, "Ollama text translation");

  let translatedText = await requestOllamaChat(normalizedBaseUrl, model, [
    {
      role: "system",
      content: systemPrompt
    },
    {
      role: "user",
      content: input.text
    }
  ], {
    signal: input.signal,
    requestBudget
  });

  const shouldRunProperNounReview = shouldReviewPdfProperNouns({
    sourceText: input.text,
    outputLanguage
  });
  for (let revisionAttempt = 0; revisionAttempt < 2; revisionAttempt += 1) {
    const issues = assessPdfTranslationQuality({
      sourceText: input.text,
      translatedText,
      outputLanguage
    });
    const shouldRevise =
      issues.length > 0 || (revisionAttempt === 0 && shouldRunProperNounReview);
    if (!shouldRevise) {
      break;
    }

    translatedText = await requestOllamaChat(normalizedBaseUrl, model, [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: buildPdfTranslationRevisionPrompt({
          sourceText: input.text,
          previousTranslation: translatedText,
          sourceLanguage,
          outputLanguage,
          issueMessages:
            issues.length > 0
              ? issues.map((issue) => issue.message)
              : [
                  "The source contains likely proper nouns or titles. Re-check that names and titles are not malformed, guessed, or translated into unrelated words."
                ]
        })
      }
    ], {
      signal: input.signal,
      requestBudget
    });
  }

  translatedText = translatedText.trim();

  if (!translatedText) {
    throw new Error("Ollama 응답에 번역문이 없습니다.");
  }

  return translatedText;
}

export async function translatePdfSegmentsWithLocalOllama(
  input: TranslatePdfSegmentsInput & TranslationRequestControl
): Promise<PdfSegmentTranslation[]> {
  const { baseUrl: normalizedBaseUrl, model } = await ensureOllamaReadyForTranslation({
    baseUrl: input.ollamaBaseUrl,
    model: input.ollamaModel ?? ""
  });
  const sourceLanguage = input.sourceLanguage ?? languageFromCode(input.sourceLang, "Source");
  const outputLanguage = input.outputLanguage ?? languageFromCode(input.targetLang, "Target");
  const translationContext =
    input.translationContext ??
    buildPdfTranslationContext({
      segments: input.segments,
      sourceLang: input.sourceLang,
      targetLang: input.targetLang
    });
  const translations = new Map<string, string>();
  const requestBudget =
    input.requestBudget ??
    new RemoteRequestBudget(OLLAMA_PDF_BATCH_MAX_REMOTE_CALLS, "Ollama PDF batch");

  const systemPrompt = buildPdfSegmentTranslationSystemPrompt({
    sourceLanguage,
    outputLanguage,
    segmentCount: input.segments.length,
    translationContext
  });
  const responseText = await requestOllamaChat(normalizedBaseUrl, model, [
    {
      role: "system",
      content: systemPrompt
    },
    {
      role: "user",
      content: buildPdfSegmentTranslationUserPrompt(input.segments, translationContext)
    }
  ], {
    signal: input.signal,
    requestBudget
  });
  const parsed = parsePdfSegmentTranslationsLenient(responseText, input.segments).translations;
  const parsedById = new Map(parsed.map((translation) => [translation.id, translation]));
  const repairCandidates = [];

  for (const segment of input.segments) {
    const candidate = parsedById.get(segment.id)?.translationKo.trim();
    if (!candidate) {
      repairCandidates.push({
        segment,
        translationKo: "",
        issues: ["The model returned an empty translation."]
      });
      continue;
    }

    const issues = assessPdfTranslationQuality({
      sourceText: segment.text,
      translatedText: candidate,
      outputLanguage,
      translationContext
    });
    if (issues.length > 0) {
      repairCandidates.push({
        segment,
        translationKo: candidate,
        issues: issues.map((issue) => issue.message)
      });
      continue;
    }

    translations.set(segment.id, candidate);
  }

  if (repairCandidates.length > 0 && requestBudget.remaining > 0) {
    const repairSegments = repairCandidates.map((candidate) => candidate.segment);
    const repairPrompt = buildPdfSegmentTranslationSystemPrompt({
      sourceLanguage,
      outputLanguage,
      segmentCount: repairSegments.length,
      translationContext
    });
    const repairResponseText = await requestOllamaChat(normalizedBaseUrl, model, [
      {
        role: "system",
        content: repairPrompt
      },
      {
        role: "user",
        content: buildPdfSegmentTranslationRepairUserPrompt({
          segments: repairSegments,
          previousTranslations: repairCandidates.map((candidate) => ({
            id: candidate.segment.id,
            translationKo: candidate.translationKo,
            issues: candidate.issues
          })),
          translationContext
        })
      }
    ], {
      signal: input.signal,
      requestBudget
    });
    const repairParsed = parsePdfSegmentTranslationsLenient(
      repairResponseText,
      repairSegments
    ).translations;
    const repairParsedById = new Map(repairParsed.map((translation) => [translation.id, translation]));
    for (const repairCandidate of repairCandidates) {
      const repaired = repairParsedById.get(repairCandidate.segment.id)?.translationKo.trim();
      if (!repaired) {
        continue;
      }
      const remainingIssues = assessPdfTranslationQuality({
        sourceText: repairCandidate.segment.text,
        translatedText: repaired,
        outputLanguage,
        translationContext
      });
      if (hasCriticalQualityIssues(remainingIssues)) {
        continue;
      }
      translations.set(repairCandidate.segment.id, repaired);
    }
  }

  const unresolvedSegments = input.segments.filter((segment) => !translations.has(segment.id));
  for (const segment of unresolvedSegments) {
    if (requestBudget.remaining <= 0) {
      break;
    }
    const fallbackTranslation = await translateSinglePdfSegmentFallback({
      segment,
      normalizedBaseUrl,
      model,
      sourceLanguage,
      outputLanguage,
      translationContext,
      signal: input.signal,
      requestBudget
    });
    if (fallbackTranslation) {
      translations.set(segment.id, fallbackTranslation);
    }
  }

  return input.segments.flatMap((segment) => {
    const translationKo = translations.get(segment.id);
    return translationKo ? [{ id: segment.id, translationKo }] : [];
  });
}

async function translateSinglePdfSegmentFallback(input: {
  segment: TranslatePdfSegmentsInput["segments"][number];
  normalizedBaseUrl: string;
  model: string;
  sourceLanguage: ProfileLanguage;
  outputLanguage: ProfileLanguage;
  translationContext: NonNullable<TranslatePdfSegmentsInput["translationContext"]>;
  signal?: AbortSignal;
  requestBudget: RemoteRequestBudget;
}) {
  for (let attempt = 0; attempt < 2 && input.requestBudget.remaining > 0; attempt += 1) {
    const responseText = await requestOllamaChat(input.normalizedBaseUrl, input.model, [
      {
        role: "system",
        content: buildPdfSegmentTranslationSystemPrompt({
          sourceLanguage: input.sourceLanguage,
          outputLanguage: input.outputLanguage,
          segmentCount: 1,
          translationContext: input.translationContext
        })
      },
      {
        role: "user",
        content: buildPdfSegmentTranslationUserPrompt([input.segment], input.translationContext)
      }
    ], {
      signal: input.signal,
      requestBudget: input.requestBudget
    });
    const parsed = parsePdfSegmentTranslationsLenient(responseText, [input.segment]).translations;
    const candidate = parsed.find((translation) => translation.id === input.segment.id)
      ?.translationKo.trim();
    if (candidate && isUsablePdfSegmentTranslation(input.segment.text, candidate, input)) {
      return candidate;
    }
  }

  if (input.requestBudget.remaining <= 0) {
    return undefined;
  }

  const plainText = await requestOllamaChat(input.normalizedBaseUrl, input.model, [
    {
      role: "system",
      content: buildPdfTranslationSystemPrompt({
        sourceLanguage: input.sourceLanguage,
        outputLanguage: input.outputLanguage
      })
    },
    {
      role: "user",
      content: input.segment.text
    }
  ], {
    signal: input.signal,
    requestBudget: input.requestBudget
  });
  const plainCandidate = plainText.trim();
  if (plainCandidate && isUsablePdfSegmentTranslation(input.segment.text, plainCandidate, input)) {
    return plainCandidate;
  }

  return undefined;
}

function isUsablePdfSegmentTranslation(
  sourceText: string,
  translatedText: string,
  input: {
    outputLanguage: ProfileLanguage;
    translationContext: NonNullable<TranslatePdfSegmentsInput["translationContext"]>;
  }
) {
  const issues = assessPdfTranslationQuality({
    sourceText,
    translatedText,
    outputLanguage: input.outputLanguage,
    translationContext: input.translationContext
  });
  return !hasCriticalQualityIssues(issues);
}

async function requestOllamaChat(
  normalizedBaseUrl: string,
  model: string,
  messages: Array<{ role: "system" | "user"; content: string }>,
  control: TranslationRequestControl
) {
  throwIfTranslationAborted(control.signal);
  control.requestBudget?.consume();
  let response: Response;
  try {
    response = await fetchWithTimeout(`${normalizedBaseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        options: {
          temperature: 0.1,
          top_p: 0.9,
          repeat_penalty: 1.05
        },
        messages
      })
    }, {
      signal: control.signal,
      timeoutMs: 120_000,
      timeoutMessage: "Ollama response timed out."
    });
  } catch (caught) {
    if (isAbortError(caught) || isRemoteRequestBudgetExceededError(caught)) {
      throw caught;
    }
    throw new Error(
      `Ollama에 연결할 수 없습니다. Ollama를 설치하고 실행한 뒤 Settings baseUrl(${normalizedBaseUrl})을 확인해 주세요.`
    );
  }

  if (!response.ok) {
    throw new Error(
      `Ollama 번역 요청에 실패했습니다: ${response.status}. ${await readOllamaError(response)}`
    );
  }

  const payload = (await response.json()) as {
    message?: { content?: string };
    response?: string;
  };
  throwIfTranslationAborted(control.signal);
  return (payload.message?.content ?? payload.response ?? "").trim();
}

function hasCriticalQualityIssues(issues: ReturnType<typeof assessPdfTranslationQuality>) {
  return hasCriticalPdfTranslationQualityIssues(issues);
}

async function ensureOllamaReadyForTranslation(input: OllamaModelInput) {
  const normalized = normalizeOllamaInput(input);
  const runtime = await ensureOllamaRuntime(normalized.baseUrl);
  if (runtime.status === "not_installed") {
    throw new OllamaReadinessError("runtime_not_installed", {
      baseUrl: normalized.baseUrl
    });
  }
  if (runtime.status === "start_failed") {
    throw new OllamaReadinessError("runtime_start_failed", {
      baseUrl: normalized.baseUrl
    });
  }
  const status = await getOllamaModelStatus(normalized);
  if (!status.installed) {
    throw new OllamaReadinessError("model_missing", {
      baseUrl: status.baseUrl,
      model: status.model
    });
  }
  return status;
}

export async function getOllamaModelStatus(
  input: OllamaModelInput
): Promise<OllamaModelStatusResult> {
  const { baseUrl, model } = normalizeOllamaInput(input);
  const installedModels = await listOllamaModels(baseUrl);

  return {
    baseUrl,
    model,
    installed: isRequestedModelInstalled(model, installedModels),
    installedModels
  };
}

export async function pullOllamaModel(
  input: OllamaModelInput
): Promise<PullOllamaModelResult> {
  const status = await getOllamaModelStatus(input);
  if (status.installed) {
    return {
      baseUrl: status.baseUrl,
      model: status.model,
      status: "already_installed"
    };
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(`${status.baseUrl}/api/pull`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: status.model,
        stream: false
      })
    }, { timeoutMs: 30 * 60_000, timeoutMessage: "Ollama model download timed out." });
  } catch {
    throw new Error(
      `Ollama에 연결할 수 없습니다. Ollama를 설치하고 실행한 뒤 Settings baseUrl(${status.baseUrl})을 확인해 주세요.`
    );
  }

  if (!response.ok) {
    throw new Error(
      `Ollama 모델 다운로드에 실패했습니다: ${response.status}. ${await readOllamaError(response)}`
    );
  }

  return {
    baseUrl: status.baseUrl,
    model: status.model,
    status: "downloaded"
  };
}

async function listOllamaModels(baseUrl: string) {
  let response: Response;
  try {
    response = await fetchWithTimeout(`${baseUrl}/api/tags`, {}, {
      timeoutMs: 10_000,
      timeoutMessage: "Ollama model status request timed out."
    });
  } catch {
    throw new OllamaReadinessError("server_unreachable", { baseUrl });
  }

  if (!response.ok) {
    throw new OllamaReadinessError("model_list_failed", {
      baseUrl,
      httpStatus: response.status
    });
  }

  const payload = (await response.json()) as {
    models?: Array<{
      name?: string;
      model?: string;
    }>;
  };

  return (payload.models ?? [])
    .flatMap((entry) => [entry.name, entry.model])
    .filter((name): name is string => Boolean(name));
}

function normalizeOllamaInput(input: OllamaModelInput) {
  const baseUrl = (input.baseUrl?.trim() || "http://localhost:11434").replace(/\/$/, "");
  const model = input.model.trim();
  if (!model) {
    throw new OllamaReadinessError("model_required", { baseUrl });
  }

  return {
    baseUrl,
    model
  };
}

function isRequestedModelInstalled(model: string, installedModels: string[]) {
  const requested = model.toLowerCase();
  const aliases = requested.includes(":") ? [requested] : [requested, `${requested}:latest`];
  return installedModels.some((installedModel) =>
    aliases.includes(installedModel.toLowerCase())
  );
}

function languageFromCode(code: string | undefined, fallbackName: string): ProfileLanguage {
  const normalizedCode = code?.trim() || "auto";
  return {
    code: normalizedCode,
    nameKo: normalizedCode,
    nameEn: fallbackName
  };
}

async function readOllamaError(response: Response) {
  try {
    const payload = (await response.clone().json()) as { error?: string };
    if (payload.error) {
      return payload.error;
    }
  } catch {
    // Fall through to text.
  }

  try {
    return await response.text();
  } catch {
    return "응답 내용을 읽을 수 없습니다.";
  }
}

function normalizeSourceLang(sourceLang?: string) {
  return sourceLang?.trim() || "auto";
}

function normalizeTargetLang(targetLang: string) {
  return targetLang.trim() || "ko";
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_match, number: string) =>
      String.fromCodePoint(Number.parseInt(number, 10))
    )
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
