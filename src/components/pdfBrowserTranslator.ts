import type { PdfSegmentTranslation, PdfTextSegment } from "../shared/types";

type BrowserTranslatorAvailability = "unavailable" | "downloadable" | "downloading" | "available";

type BrowserTranslatorSession = {
  translate(text: string): Promise<string>;
  destroy?: () => void;
};

type BrowserTranslatorStatic = {
  availability(options: {
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<BrowserTranslatorAvailability>;
  create(options: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (monitor: EventTarget) => void;
  }): Promise<BrowserTranslatorSession>;
};

export async function translatePdfSegmentsWithBrowserTranslator(input: {
  segments: PdfTextSegment[];
  sourceLanguage: string;
  targetLanguage: string;
  signal?: AbortSignal;
  requestTimeoutMs?: number;
  onStatus: (status: string) => void;
  copy: {
    unavailable: string;
    unsupported: (source: string, target: string) => string;
    ready: string;
    downloadMayStart: string;
    downloading: (percent: number) => string;
    translating: (current: number, total: number) => string;
  };
}): Promise<PdfSegmentTranslation[]> {
  const Translator = getBrowserTranslatorApi();
  if (!Translator) {
    throw new Error(input.copy.unavailable);
  }

  const timeoutMs = input.requestTimeoutMs ?? 60_000;
  const availability = await withBrowserTranslatorTimeout(
    Translator.availability({
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage
    }),
    timeoutMs,
    input.signal,
    "Browser translator availability check timed out."
  );
  if (availability === "unavailable") {
    throw new Error(input.copy.unsupported(input.sourceLanguage, input.targetLanguage));
  }

  input.onStatus(
    availability === "available"
      ? input.copy.ready
      : input.copy.downloadMayStart
  );

  const translator = await withBrowserTranslatorTimeout(
    Translator.create({
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage,
      monitor(monitor) {
        monitor.addEventListener("downloadprogress", (event) => {
          const progressEvent = event as Event & {
            loaded?: number;
            total?: number;
          };
          if (
            typeof progressEvent.loaded === "number" &&
            typeof progressEvent.total === "number" &&
            progressEvent.total > 0
          ) {
            input.onStatus(
              input.copy.downloading(
                Math.round((progressEvent.loaded / progressEvent.total) * 100)
              )
            );
          }
        });
      }
    }),
    Math.max(timeoutMs, 10 * 60_000),
    input.signal,
    "Browser translator setup timed out."
  );

  try {
    const translations: PdfSegmentTranslation[] = [];
    for (const [index, segment] of input.segments.entries()) {
      input.onStatus(input.copy.translating(index + 1, input.segments.length));
      const translatedText = (
        await withBrowserTranslatorTimeout(
          translator.translate(segment.text),
          timeoutMs,
          input.signal,
          "Browser translation timed out."
        )
      ).trim();
      if (translatedText) {
        translations.push({
          id: segment.id,
          translationKo: translatedText,
          cacheStatus: "miss"
        });
      }
    }
    return translations;
  } finally {
    translator.destroy?.();
  }
}

function withBrowserTranslatorTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  timeoutMessage: string
) {
  if (signal?.aborted) {
    return Promise.reject(signal.reason ?? new DOMException("Translation canceled.", "AbortError"));
  }
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", onAbort);
    };
    const settle = (callback: (value: T | PromiseLike<T>) => void, value: T) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const fail = (reason: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(reason);
    };
    const timeoutId = setTimeout(() => fail(new Error(timeoutMessage)), timeoutMs);
    const onAbort = () =>
      fail(signal?.reason ?? new DOMException("Translation canceled.", "AbortError"));
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then((value) => settle(resolve, value), fail);
  });
}

export function normalizeBrowserTranslatorLanguage(value: string | undefined, fallback: string) {
  return (value?.trim() || fallback).replace(/_/g, "-");
}

function getBrowserTranslatorApi() {
  const candidate = (globalThis as { Translator?: unknown }).Translator;
  if (!candidate || typeof candidate !== "object") {
    return undefined;
  }

  const translator = candidate as Partial<BrowserTranslatorStatic>;
  return typeof translator.availability === "function" &&
    typeof translator.create === "function"
    ? (translator as BrowserTranslatorStatic)
    : undefined;
}
