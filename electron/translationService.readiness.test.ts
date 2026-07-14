import { afterEach, describe, expect, it, vi } from "vitest";
import { createCloudProviderConsentRecord } from "../src/shared/cloudProviderConsent";

vi.mock("./ollamaRuntimeService", () => ({
  ensureOllamaRuntime: vi.fn().mockResolvedValue({
    status: "already_running",
    baseUrl: "http://127.0.0.1:11434"
  })
}));

import { testTranslationConnection } from "./translationService";

describe("translation service readiness", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    {
      label: "missing Gemini consent",
      input: { providerName: "gemini" as const, geminiApiKey: "test-key" }
    },
    {
      label: "malformed Google consent",
      input: {
        providerName: "google" as const,
        googleApiKey: "test-key",
        cloudConsent: { version: 0, provider: "google" } as never
      }
    }
  ])("blocks $label before any provider request", async ({ input }) => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const result = await testTranslationConnection(input);

    expect(result).toMatchObject({ ok: false, code: "provider_request_failed" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("runs one Google connection request after matching versioned consent", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: { translations: [{ translatedText: "안녕하세요." }] } }),
        { status: 200 }
      )
    );

    const result = await testTranslationConnection({
      providerName: "google",
      googleApiKey: "test-google-key",
      cloudConsent: createCloudProviderConsentRecord({
        provider: "google",
        keyStorage: "session",
        acceptedAt: "2026-07-14T00:00:00.000Z"
      })
    });

    expect(result).toMatchObject({ ok: true, code: "connected", providerName: "google" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain("test-google-key");
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("test-google-key");
  });

  it("fails the Ollama connection test when the selected model is missing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ models: [{ name: "other:latest" }] }), { status: 200 })
    );

    const result = await testTranslationConnection({
      providerName: "local",
      ollamaBaseUrl: "http://127.0.0.1:11434",
      ollamaModel: "gemma4:12b"
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      code: "ollama_model_missing",
      providerName: "local",
      model: "gemma4:12b"
    });
  });

  it("accepts the exact installed Gemma 12B tag used by Settings", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          models: [
            { name: "gemma4:12b", model: "gemma4:12b" },
            { name: "gemma3:12b", model: "gemma3:12b" }
          ]
        }),
        { status: 200 }
      )
    );

    const result = await testTranslationConnection({
      providerName: "local",
      ollamaBaseUrl: "http://127.0.0.1:11434",
      ollamaModel: "gemma4:12b"
    });

    expect(result).toMatchObject({
      ok: true,
      code: "connected",
      providerName: "local",
      model: "gemma4:12b"
    });
  });
});
