import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GEMINI_MAX_ATTEMPTS_PER_REQUEST,
  GEMINI_MAX_CONCURRENT_REQUESTS,
  requestGeminiContent,
  translatePdfSegmentsWithGemini,
  translateTextWithGemini
} from "./geminiTranslation";

describe("Gemini translation requests", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries overloaded Gemini models and falls back to Flash-Lite", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(false, 503, {
          error: {
            message:
              "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later."
          }
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(false, 503, {
          error: { message: "The model is overloaded. Please try again later." }
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(false, 503, {
          error: { message: "The model is overloaded. Please try again later." }
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(true, 200, {
          candidates: [
            {
              content: {
                parts: [{ text: "번역 결과" }]
              }
            }
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 5,
            totalTokenCount: 15
          }
        })
      );

    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = translateTextWithGemini({
      text: "The road goes ever on.",
      sourceLang: "en",
      targetLang: "ko",
      providerName: "gemini",
      geminiApiKey: "test-key",
      geminiModel: "gemini-2.5-flash",
      geminiPlan: "free"
    });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.translatedText).toBe("번역 결과");
    expect(result.usage.model).toBe("gemini-2.5-flash-lite");
    expect(String(fetchMock.mock.calls[0][0])).toContain("gemini-2.5-flash");
    expect(String(fetchMock.mock.calls[3][0])).toContain("gemini-2.5-flash-lite");
  });

  it("repairs omitted PDF segment ids before reporting missing translations", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        geminiTextResponse(
          JSON.stringify([{ id: "p1-s001", translationKo: "첫 번째 번역" }])
        )
      )
      .mockResolvedValueOnce(
        geminiTextResponse(
          JSON.stringify([{ id: "p1-s002", translationKo: "두 번째 번역" }])
        )
      );

    vi.stubGlobal("fetch", fetchMock);

    const result = await translatePdfSegmentsWithGemini({
      segments: [
        { id: "p1-s001", pageNumber: 1, index: 0, text: "First segment." },
        { id: "p1-s002", pageNumber: 1, index: 1, text: "Second segment." }
      ],
      sourceLang: "en",
      targetLang: "ko",
      providerName: "gemini",
      geminiApiKey: "test-key",
      geminiModel: "gemini-2.5-flash-lite",
      geminiPlan: "paid"
    });

    expect(result.translations).toEqual([
      { id: "p1-s001", translationKo: "첫 번째 번역" },
      { id: "p1-s002", translationKo: "두 번째 번역" }
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.usage.usage.requestCount).toBe(2);
  });

  it("falls back to plain single-segment Gemini translation when JSON repair keeps omitting an id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(geminiTextResponse("[]"))
      .mockResolvedValueOnce(geminiTextResponse("[]"))
      .mockResolvedValueOnce(geminiTextResponse("[]"))
      .mockResolvedValueOnce(geminiTextResponse("[]"))
      .mockResolvedValueOnce(geminiTextResponse("최종 단일 번역"));

    vi.stubGlobal("fetch", fetchMock);

    const result = await translatePdfSegmentsWithGemini({
      segments: [{ id: "p1-s001", pageNumber: 1, index: 0, text: "A stubborn segment." }],
      sourceLang: "en",
      targetLang: "ko",
      providerName: "gemini",
      geminiApiKey: "test-key",
      geminiModel: "gemini-2.5-flash-lite",
      geminiPlan: "paid"
    });

    expect(result.translations).toEqual([{ id: "p1-s001", translationKo: "최종 단일 번역" }]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("limits simultaneous Gemini HTTP requests", async () => {
    const resolvers: Array<() => void> = [];
    let active = 0;
    let peak = 0;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          active += 1;
          peak = Math.max(peak, active);
          resolvers.push(() => {
            active -= 1;
            resolve(geminiTextResponse("OK"));
          });
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    const requests = Array.from({ length: 3 }, () =>
      requestGeminiContent({
        apiKey: "test-key",
        model: "gemini-2.5-flash-lite",
        systemPrompt: "Return OK",
        userPrompt: "OK",
        fallbackUsage: {
          inputTokens: 1,
          outputTokens: 1,
          totalTokens: 2,
          billableCharacters: 2,
          requestCount: 1,
          cacheHitCount: 0,
          cacheMissCount: 1
        }
      })
    );

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(GEMINI_MAX_CONCURRENT_REQUESTS));
    resolvers.shift()?.();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    resolvers.splice(0).forEach((resolve) => resolve());
    await Promise.all(requests);
    expect(peak).toBe(GEMINI_MAX_CONCURRENT_REQUESTS);
  });

  it("reports successful usage exactly once", async () => {
    const observer = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(geminiTextResponse("OK")));

    const result = await requestGeminiContent({
      apiKey: "test-key",
      model: "gemini-2.5-flash-lite",
      systemPrompt: "Return OK",
      userPrompt: "OK",
      fallbackUsage: fallbackUsage(),
      onUsage: observer
    });

    expect(result.text).toBe("OK");
    expect(observer).toHaveBeenCalledTimes(1);
    expect(observer.mock.calls[0][0]).toMatchObject({
      outcome: "success",
      attemptCount: 1
    });
  });

  it("reports retry-then-success usage once with every incurred attempt included", async () => {
    vi.useFakeTimers();
    const observer = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(false, 429, { error: { message: "retry after quota throttle" } })
      )
      .mockResolvedValueOnce(geminiTextResponse("OK"));
    vi.stubGlobal("fetch", fetchMock);

    const request = requestGeminiContent({
      apiKey: "test-key",
      model: "gemini-2.5-flash-lite",
      systemPrompt: "Return OK",
      userPrompt: "OK",
      fallbackUsage: fallbackUsage(),
      onUsage: observer
    });
    await vi.runAllTimersAsync();
    const result = await request;

    expect(result.text).toBe("OK");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(observer).toHaveBeenCalledTimes(1);
    expect(observer.mock.calls[0][0]).toMatchObject({
      outcome: "success",
      exact: false,
      attemptCount: 2,
      usage: expect.objectContaining({ requestCount: 2 })
    });
  });

  it("reports one conservative usage observation on final HTTP failure", async () => {
    const observer = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        jsonResponse(false, 400, { error: { message: "invalid request" } })
      )
    );

    await expect(
      requestGeminiContent({
        apiKey: "test-key",
        model: "gemini-2.5-flash-lite",
        systemPrompt: "Return OK",
        userPrompt: "OK",
        fallbackUsage: fallbackUsage(),
        onUsage: observer
      })
    ).rejects.toThrow("invalid request");

    expect(observer).toHaveBeenCalledTimes(1);
    expect(observer.mock.calls[0][0]).toMatchObject({
      outcome: "failure",
      exact: false,
      attemptCount: 1,
      usage: fallbackUsage()
    });
  });

  it("reports retry exhaustion once with conservative usage for every attempt", async () => {
    vi.useFakeTimers();
    const observer = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(false, 429, { error: { message: "retryable quota throttle" } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = requestGeminiContent({
      apiKey: "test-key",
      model: "gemini-2.5-flash-lite",
      systemPrompt: "Return OK",
      userPrompt: "OK",
      fallbackUsage: fallbackUsage(),
      onUsage: observer
    });
    const assertion = expect(request).rejects.toThrow("retryable quota throttle");
    await vi.runAllTimersAsync();
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(observer).toHaveBeenCalledTimes(1);
    expect(observer.mock.calls[0][0]).toMatchObject({
      outcome: "failure",
      exact: false,
      attemptCount: 3,
      usage: expect.objectContaining({
        totalTokens: fallbackUsage().totalTokens * 3,
        requestCount: 3
      })
    });
  });

  it("forwards cancellation to an in-flight Gemini request", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockImplementation((_url, init) =>
      new Promise((_resolve, reject) => {
        if (init?.signal?.aborted) {
          reject(init.signal.reason);
          return;
        }
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal.reason),
          { once: true }
        );
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = translateTextWithGemini({
      text: "Cancel this request.",
      targetLang: "ko",
      providerName: "gemini",
      geminiApiKey: "test-key",
      signal: controller.signal
    });
    controller.abort(new DOMException("user canceled", "AbortError"));

    await expect(request).rejects.toThrow("user canceled");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([429, 500])("keeps retryable HTTP %s responses under the per-request ceiling", async (status) => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(false, status, { error: { message: `retryable ${status}` } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = requestGeminiContent({
      apiKey: "test-key",
      model: "gemini-2.5-flash-lite",
      systemPrompt: "Translate",
      userPrompt: "Hello",
      fallbackUsage: fallbackUsage()
    });
    const assertion = expect(request).rejects.toThrow(`retryable ${status}`);
    await vi.runAllTimersAsync();
    await assertion;

    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(
      GEMINI_MAX_ATTEMPTS_PER_REQUEST
    );
  });

  it("does not retry a timed-out Gemini fetch beyond the ceiling", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation((_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal.reason), {
          once: true
        });
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = requestGeminiContent({
      apiKey: "test-key",
      model: "gemini-2.5-flash-lite",
      systemPrompt: "Translate",
      userPrompt: "Hello",
      fallbackUsage: fallbackUsage(),
      timeoutMs: 25
    });
    const assertion = expect(request).rejects.toThrow("시간이 초과");
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shares one eight-call ceiling across PDF repair and per-segment fallback", async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiTextResponse(""));
    vi.stubGlobal("fetch", fetchMock);

    const result = await translatePdfSegmentsWithGemini({
      segments: Array.from({ length: 4 }, (_, index) => ({
        id: `p1-s00${index + 1}`,
        pageNumber: 1,
        index,
        text: `Segment ${index + 1}.`
      })),
      sourceLang: "en",
      targetLang: "ko",
      providerName: "gemini",
      geminiApiKey: "test-key",
      geminiModel: "gemini-2.5-flash-lite"
    });

    expect(result.translations).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });
});

function fallbackUsage() {
  return {
    inputTokens: 1,
    outputTokens: 1,
    totalTokens: 2,
    billableCharacters: 5,
    requestCount: 1,
    cacheHitCount: 0,
    cacheMissCount: 1
  };
}

function jsonResponse(ok: boolean, status: number, payload: unknown) {
  return {
    ok,
    status,
    json: async () => payload
  } as Response;
}

function geminiTextResponse(text: string) {
  return jsonResponse(true, 200, {
    candidates: [
      {
        content: {
          parts: [{ text }]
        }
      }
    ],
    usageMetadata: {
      promptTokenCount: 10,
      candidatesTokenCount: 5,
      totalTokenCount: 15
    }
  });
}
