import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGoogleTranslationRequest } from "./googleTranslationRequest";
import { requestGeminiContent } from "./geminiTranslation";
import { redactSecrets } from "./secretRedaction";

const fallbackUsage = {
  inputTokens: 1,
  outputTokens: 1,
  totalTokens: 2,
  billableCharacters: 2,
  requestCount: 1,
  cacheHitCount: 0,
  cacheMissCount: 1
};

describe("external API request credential safety", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends Gemini credentials in a header instead of the URL", async () => {
    const apiKey = ["gemini", "canary", "secret"].join("-");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: "OK" }] } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await requestGeminiContent({
      apiKey,
      model: "gemini-2.5-flash-lite",
      systemPrompt: "Return OK",
      userPrompt: "OK",
      fallbackUsage
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain(apiKey);
    expect(url).not.toMatch(/[?&]key=/i);
    expect(new Headers(init.headers).get("x-goog-api-key")).toBe(apiKey);
  });

  it("redacts a Gemini credential echoed by an API error", async () => {
    const apiKey = ["gemini", "error", "canary"].join("-");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: `invalid key ${apiKey}` } }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        })
      )
    );

    let message = "";
    try {
      await requestGeminiContent({
        apiKey,
        model: "gemini-2.5-flash-lite",
        systemPrompt: "Return OK",
        userPrompt: "OK",
        fallbackUsage
      });
    } catch (error) {
      message = String(error);
    }
    expect(message).toContain("[REDACTED]");
    expect(message).not.toContain(apiKey);
  });

  it("builds Google Translate requests without query-string credentials", () => {
    const apiKey = ["google", "canary", "secret"].join("-");
    const request = buildGoogleTranslationRequest(apiKey, {
      q: "Hello",
      target: "ko",
      format: "text"
    });

    expect(request.url).not.toContain(apiKey);
    expect(request.url).not.toMatch(/[?&]key=/i);
    expect(new Headers(request.init.headers).get("x-goog-api-key")).toBe(apiKey);
  });

  it("redacts literal, encoded, URL, and header credentials", () => {
    const secret = "a key/+";
    const message = [
      secret,
      encodeURIComponent(secret),
      "?key=url-secret",
      "x-goog-api-key: header-secret"
    ].join(" ");

    const redacted = redactSecrets(message, [secret]);

    expect(redacted).not.toContain(secret);
    expect(redacted).not.toContain(encodeURIComponent(secret));
    expect(redacted).not.toContain("url-secret");
    expect(redacted).not.toContain("header-secret");
    expect(redacted).toContain("[REDACTED]");
  });
});
