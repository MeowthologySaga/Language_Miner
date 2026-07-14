import { describe, expect, it, vi } from "vitest";
import { defaultLearningProfile } from "../../shared/languages";
import { RendererPrivacyLifecycle } from "../../rendererPrivacyLifecycle";
import type { LLMProvider } from "./types";
import { createPrivacyGuardedProvider } from "./privacyGuardedProvider";

const readingInput = {
  selectedText: "mined",
  sourceSentence: "I mined a useful sentence.",
  learningProfile: defaultLearningProfile
};

describe("privacy-guarded language-model provider", () => {
  it("propagates lifecycle cancellation to an active provider request", async () => {
    const lifecycle = new RendererPrivacyLifecycle();
    let observedSignal: AbortSignal | undefined;
    const provider = createPrivacyGuardedProvider(
      createProviderStub({
        generateReadingCard: (input) => {
          observedSignal = input.signal;
          return new Promise((_, reject) => {
            input.signal?.addEventListener("abort", () => {
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            });
          });
        }
      }),
      lifecycle
    );

    const pending = provider.generateReadingCard(readingInput);
    lifecycle.begin("learning_data");

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(observedSignal?.aborted).toBe(true);
  });

  it("does not start new provider work while deletion is blocked", async () => {
    const lifecycle = new RendererPrivacyLifecycle();
    const generateReadingCard = vi.fn();
    const provider = createPrivacyGuardedProvider(
      createProviderStub({ generateReadingCard }),
      lifecycle
    );
    lifecycle.begin("all_local_data");

    await expect(provider.generateReadingCard(readingInput)).rejects.toMatchObject({
      name: "AbortError"
    });
    expect(generateReadingCard).not.toHaveBeenCalled();
  });

  it("rejects a late result even if the provider ignores abort", async () => {
    const lifecycle = new RendererPrivacyLifecycle();
    let resolveRequest!: (value: never) => void;
    const provider = createPrivacyGuardedProvider(
      createProviderStub({
        generateReadingCard: () =>
          new Promise((resolve) => {
            resolveRequest = resolve;
          })
      }),
      lifecycle
    );

    const pending = provider.generateReadingCard(readingInput);
    lifecycle.begin("api_keys");
    lifecycle.finish();
    resolveRequest({} as never);

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("drops late usage observations so deletion cannot recreate the renderer ledger", () => {
    const lifecycle = new RendererPrivacyLifecycle();
    let emitUsage: Parameters<NonNullable<LLMProvider["setUsageObserver"]>>[0] | undefined;
    const observer = vi.fn();
    const provider = createPrivacyGuardedProvider(
      createProviderStub({
        setUsageObserver(nextObserver) {
          emitUsage = nextObserver;
        }
      }),
      lifecycle
    );
    provider.setUsageObserver?.(observer);

    lifecycle.begin("all_local_data");
    lifecycle.finish();
    emitUsage?.({
      providerName: "gemini",
      model: "gemini-test",
      sourceLang: "en",
      targetLang: "ko",
      usage: {
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
        billableCharacters: 0,
        requestCount: 1,
        cacheHitCount: 0,
        cacheMissCount: 1
      },
      outcome: "success",
      exact: true,
      attemptCount: 1
    });

    expect(observer).not.toHaveBeenCalled();
  });
});

function createProviderStub(overrides: Partial<LLMProvider>): LLMProvider {
  return {
    name: "privacy-test",
    async testConnection() {
      return true;
    },
    async generateReadingCard() {
      throw new Error("not implemented");
    },
    async generateLifeExpressionCard() {
      throw new Error("not implemented");
    },
    async generateCharacterChatReply() {
      throw new Error("not implemented");
    },
    ...overrides
  };
}
