import { fetchWithTimeout } from "./fetchTimeout";
import { buildGoogleTranslationRequest } from "./googleTranslationRequest";
import { redactSecrets } from "./secretRedaction";
import {
  GOOGLE_TRANSLATE_MAX_TEXTS_PER_REQUEST,
  throwIfTranslationAborted,
  type TranslationRequestControl
} from "./translationRequestLimits";

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

export type GoogleTranslationInput = TranslationRequestControl & {
  googleApiKey?: string;
  sourceLang?: string;
  targetLang: string;
  timeoutMs?: number;
};

export async function translateTextWithGoogle(
  input: GoogleTranslationInput & { text: string }
): Promise<string> {
  const [translatedText] = await translateTextsWithGoogle(input, [input.text]);
  return translatedText;
}

/** Cloud Translation Basic v2 accepts up to 128 `q` strings per request. */
export async function translateTextsWithGoogle(
  input: GoogleTranslationInput,
  texts: string[]
): Promise<string[]> {
  throwIfTranslationAborted(input.signal);
  if (texts.length < 1 || texts.length > GOOGLE_TRANSLATE_MAX_TEXTS_PER_REQUEST) {
    throw new Error(
      `Google Translate requests must contain 1-${GOOGLE_TRANSLATE_MAX_TEXTS_PER_REQUEST} texts.`
    );
  }

  const apiKey = input.googleApiKey?.trim();
  if (!apiKey) {
    throw new Error("Google Translate API key is required.");
  }

  const requestBody: Record<string, unknown> = {
    q: texts,
    target: normalizeTargetLang(input.targetLang),
    format: "text"
  };
  const sourceLang = normalizeSourceLang(input.sourceLang);
  if (sourceLang !== "auto") {
    requestBody.source = sourceLang;
  }

  const request = buildGoogleTranslationRequest(apiKey, requestBody);
  const response = await fetchWithTimeout(request.url, request.init, {
    signal: input.signal,
    timeoutMs: input.timeoutMs ?? 45_000,
    timeoutMessage: "Google Translate request timed out."
  });
  const payload = (await response.json()) as GoogleTranslateResponse;
  if (!response.ok) {
    throw new Error(
      redactSecrets(payload.error?.message ?? "Google Translate request failed.", [apiKey])
    );
  }

  const translations = payload.data?.translations ?? [];
  if (
    translations.length !== texts.length ||
    translations.some((translation) => !translation.translatedText)
  ) {
    throw new Error(
      `Google Translate returned ${translations.length} results for ${texts.length} texts.`
    );
  }

  throwIfTranslationAborted(input.signal);
  return translations.map((translation) => decodeHtmlEntities(translation.translatedText ?? ""));
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
