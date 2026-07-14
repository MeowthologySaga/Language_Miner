import { afterEach, describe, expect, it, vi } from "vitest";
import { translatePdfSegmentsWithBrowserTranslator } from "./pdfBrowserTranslator";

const originalTranslator = (globalThis as { Translator?: unknown }).Translator;

afterEach(() => {
  vi.useRealTimers();
  if (originalTranslator === undefined) {
    delete (globalThis as { Translator?: unknown }).Translator;
  } else {
    (globalThis as { Translator?: unknown }).Translator = originalTranslator;
  }
});

const copy = {
  unavailable: "translator unavailable",
  unsupported: (source: string, target: string) => `${source}-${target} unsupported`,
  ready: "translator ready",
  downloadMayStart: "download may start",
  downloading: (percent: number) => `downloading ${percent}`,
  translating: (current: number, total: number) => `translating ${current}/${total}`
};

describe("browser PDF translator presentation copy", () => {
  it("uses caller-supplied localized statuses without changing translation results", async () => {
    (globalThis as { Translator?: unknown }).Translator = {
      availability: async () => "available",
      create: async () => ({
        translate: async (text: string) => `translated:${text}`,
        destroy: () => undefined
      })
    };
    const statuses: string[] = [];

    const result = await translatePdfSegmentsWithBrowserTranslator({
      segments: [{ id: "segment-1", pageNumber: 1, index: 0, text: "hello" }],
      sourceLanguage: "en",
      targetLanguage: "ko",
      onStatus: (status) => statuses.push(status),
      copy
    });

    expect(statuses).toEqual(["translator ready", "translating 1/1"]);
    expect(result).toEqual([
      { id: "segment-1", translationKo: "translated:hello", cacheStatus: "miss" }
    ]);
  });

  it("uses the localized unavailable error", async () => {
    delete (globalThis as { Translator?: unknown }).Translator;

    await expect(
      translatePdfSegmentsWithBrowserTranslator({
        segments: [],
        sourceLanguage: "en",
        targetLanguage: "ko",
        onStatus: () => undefined,
        copy
      })
    ).rejects.toThrow("translator unavailable");
  });

  it("times out a stalled browser translation and destroys the session", async () => {
    vi.useFakeTimers();
    const destroy = vi.fn();
    (globalThis as { Translator?: unknown }).Translator = {
      availability: async () => "available",
      create: async () => ({
        translate: () => new Promise<string>(() => undefined),
        destroy
      })
    };

    const request = translatePdfSegmentsWithBrowserTranslator({
      segments: [{ id: "segment-1", pageNumber: 1, index: 0, text: "hello" }],
      sourceLanguage: "en",
      targetLanguage: "ko",
      requestTimeoutMs: 20,
      onStatus: () => undefined,
      copy
    });
    const assertion = expect(request).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(20);
    await assertion;
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("honors cancellation before starting", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("stopped", "AbortError"));
    (globalThis as { Translator?: unknown }).Translator = {
      availability: async () => "available",
      create: async () => ({ translate: async () => "unused" })
    };

    await expect(
      translatePdfSegmentsWithBrowserTranslator({
        segments: [],
        sourceLanguage: "en",
        targetLanguage: "ko",
        signal: controller.signal,
        onStatus: () => undefined,
        copy
      })
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
