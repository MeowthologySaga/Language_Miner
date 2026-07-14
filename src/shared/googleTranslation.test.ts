import { afterEach, describe, expect, it, vi } from "vitest";
import { translateTextsWithGoogle } from "./googleTranslation";

describe("Google translation batching", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("translates a PDF batch in one request and preserves result order", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          translations: [
            { translatedText: "첫 번째 &amp; 결과" },
            { translatedText: "두 번째 결과" }
          ]
        }
      })
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await translateTextsWithGoogle(
      { googleApiKey: "test-key", sourceLang: "en", targetLang: "ko" },
      ["First", "Second"]
    );

    expect(result).toEqual(["첫 번째 & 결과", "두 번째 결과"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toMatchObject({ q: ["First", "Second"] });
  });

  it("forwards cancellation to the in-flight Google fetch", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockImplementation((_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal.reason),
          { once: true }
        );
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = translateTextsWithGoogle(
      {
        googleApiKey: "test-key",
        targetLang: "ko",
        signal: controller.signal
      },
      ["Cancel me"]
    );
    controller.abort(new DOMException("user canceled", "AbortError"));

    await expect(request).rejects.toThrow("user canceled");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
