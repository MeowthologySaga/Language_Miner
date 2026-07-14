export const DEFAULT_EXTERNAL_REQUEST_TIMEOUT_MS = 120_000;

type FetchTimeoutOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  timeoutMessage?: string;
};

/**
 * Adds a bounded timeout while preserving an optional caller cancellation signal.
 * The timer and external abort listener are always released after fetch settles.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: FetchTimeoutOptions = {}
) {
  const timeoutMs = Math.max(
    1,
    Math.round(options.timeoutMs ?? DEFAULT_EXTERNAL_REQUEST_TIMEOUT_MS)
  );
  const controller = new AbortController();
  let timedOut = false;
  const sourceSignals = [options.signal, init.signal]
    .filter((signal): signal is AbortSignal => Boolean(signal))
    .filter((signal, index, signals) => signals.indexOf(signal) === index);
  const abortListeners = sourceSignals.map((signal) => ({
    signal,
    listener: () => controller.abort(signal.reason)
  }));
  const alreadyAborted = sourceSignals.find((signal) => signal.aborted);
  if (alreadyAborted) {
    controller.abort(alreadyAborted.reason);
  } else {
    for (const { signal, listener } of abortListeners) {
      signal.addEventListener("abort", listener, { once: true });
    }
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("Request timed out", "TimeoutError"));
  }, timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (timedOut) {
      throw new Error(options.timeoutMessage ?? `요청 시간이 ${timeoutMs}ms를 초과했습니다.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    for (const { signal, listener } of abortListeners) {
      signal.removeEventListener("abort", listener);
    }
  }
}
