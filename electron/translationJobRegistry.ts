import {
  createTranslationAbortError,
  throwIfTranslationAborted
} from "../src/shared/translationRequestLimits";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export type ActiveTranslationJob = {
  signal: AbortSignal;
  abort: () => void;
  finish: () => void;
};

/** Keeps renderer-owned controllers isolated by WebContents id and request id. */
export class TranslationJobRegistry {
  private readonly controllers = new Map<string, AbortController>();

  start(senderId: number, requestId?: string): ActiveTranslationJob {
    const normalizedRequestId = normalizeTranslationRequestId(requestId);
    const controller = new AbortController();
    if (!normalizedRequestId) {
      return {
        signal: controller.signal,
        abort: () => controller.abort(createTranslationAbortError()),
        finish: () => undefined
      };
    }

    const key = createRegistryKey(senderId, normalizedRequestId);
    if (this.controllers.has(key)) {
      throw new Error(`Translation request id is already active: ${normalizedRequestId}`);
    }
    this.controllers.set(key, controller);

    let finished = false;
    return {
      signal: controller.signal,
      abort: () => controller.abort(createTranslationAbortError()),
      finish: () => {
        if (finished) return;
        finished = true;
        if (this.controllers.get(key) === controller) {
          this.controllers.delete(key);
        }
      }
    };
  }

  cancel(senderId: number, requestId: string): boolean {
    const normalizedRequestId = normalizeTranslationRequestId(requestId, true);
    const controller = this.controllers.get(createRegistryKey(senderId, normalizedRequestId));
    if (!controller) {
      return false;
    }
    controller.abort(createTranslationAbortError());
    return true;
  }

  cancelAll(senderId: number): number {
    const prefix = `${senderId}:`;
    let canceled = 0;
    for (const [key, controller] of this.controllers) {
      if (!key.startsWith(prefix)) continue;
      controller.abort(createTranslationAbortError());
      canceled += 1;
    }
    return canceled;
  }

  isActive(senderId: number, requestId: string): boolean {
    const normalizedRequestId = normalizeTranslationRequestId(requestId, true);
    return this.controllers.has(createRegistryKey(senderId, normalizedRequestId));
  }
}

export function normalizeTranslationRequestId(
  requestId: unknown,
  required: true
): string;
export function normalizeTranslationRequestId(
  requestId: unknown,
  required?: false
): string | undefined;
export function normalizeTranslationRequestId(
  requestId: unknown,
  required = false
): string | undefined {
  if (requestId === undefined || requestId === null || requestId === "") {
    if (required) {
      throw new Error("Translation request id is required.");
    }
    return undefined;
  }
  if (typeof requestId !== "string" || !REQUEST_ID_PATTERN.test(requestId)) {
    throw new Error(
      "Translation request id must be 1-128 characters using letters, numbers, '.', '_', ':' or '-'."
    );
  }
  return requestId;
}

export function assertTranslationJobActive(signal?: AbortSignal) {
  throwIfTranslationAborted(signal);
}

function createRegistryKey(senderId: number, requestId: string) {
  return `${senderId}:${requestId}`;
}
