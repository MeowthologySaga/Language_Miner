/**
 * Remote translation request ceilings.
 *
 * A large PDF is intentionally split by the caller into bounded batches. Each
 * batch gets a fresh budget, while every HTTP attempt made for that batch
 * (including retries, repair prompts, and fallback prompts) consumes the same
 * budget. This keeps one bad batch finite without imposing a whole-document
 * size limit.
 */
export const GEMINI_MAX_ATTEMPTS_PER_REQUEST = 4;
export const GEMINI_PDF_BATCH_MAX_REMOTE_CALLS = 8;
export const OLLAMA_TEXT_MAX_REMOTE_CALLS = 3;
export const OLLAMA_PDF_BATCH_MAX_REMOTE_CALLS = 8;
export const GOOGLE_TRANSLATE_MAX_TEXTS_PER_REQUEST = 128;

export class RemoteRequestBudgetExceededError extends Error {
  readonly maximum: number;
  readonly label: string;

  constructor(maximum: number, label: string) {
    super(`${label} reached its remote request limit (${maximum}).`);
    this.name = "RemoteRequestBudgetExceededError";
    this.maximum = maximum;
    this.label = label;
  }
}

export class RemoteRequestBudget {
  readonly maximum: number;
  readonly label: string;
  private consumedCount = 0;

  constructor(maximum: number, label = "Translation task") {
    if (!Number.isInteger(maximum) || maximum < 1) {
      throw new Error("Remote request budget must be a positive integer.");
    }
    this.maximum = maximum;
    this.label = label;
  }

  get consumed() {
    return this.consumedCount;
  }

  get remaining() {
    return Math.max(0, this.maximum - this.consumedCount);
  }

  consume() {
    if (this.remaining <= 0) {
      throw new RemoteRequestBudgetExceededError(this.maximum, this.label);
    }
    this.consumedCount += 1;
    return this.consumedCount;
  }
}

export type TranslationRequestControl = {
  signal?: AbortSignal;
  requestBudget?: RemoteRequestBudget;
};

export function isRemoteRequestBudgetExceededError(
  error: unknown
): error is RemoteRequestBudgetExceededError {
  return error instanceof RemoteRequestBudgetExceededError;
}

export function createTranslationAbortError(message = "Translation request was canceled.") {
  return new DOMException(message, "AbortError");
}

export function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

/** Electron may serialize an AbortError as a plain Error, so inspect its message too. */
export function isTranslationCancellationError(error: unknown) {
  if (isAbortError(error)) return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /AbortError|\babort(?:ed)?\b|\bcancel(?:ed|led)?\b|취소|중지/i.test(message);
}

export function throwIfTranslationAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }
  throw signal.reason ?? createTranslationAbortError();
}
