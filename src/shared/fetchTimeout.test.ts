import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "./fetchTimeout";

describe("fetchWithTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("aborts a request after the configured timeout", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
          once: true
        });
      })
    );

    const request = fetchWithTimeout("https://example.invalid", {}, {
      timeoutMs: 25,
      timeoutMessage: "시간 초과"
    });
    const assertion = expect(request).rejects.toThrow("시간 초과");
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
  });

  it("forwards caller cancellation without rewriting it as a timeout", async () => {
    const external = new AbortController();
    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("사용자 취소")), {
          once: true
        });
      })
    );

    const request = fetchWithTimeout(
      "https://example.invalid",
      { signal: external.signal },
      { timeoutMs: 1_000 }
    );
    external.abort();
    await expect(request).rejects.toThrow("사용자 취소");
  });
});
