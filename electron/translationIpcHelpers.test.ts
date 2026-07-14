import { describe, expect, it } from "vitest";
import type {
  TranslatePdfSegmentsInput,
  TranslateTextInput,
  TranslationCacheEntry
} from "../src/shared/types";
import {
  chunk,
  estimateUsageEventForTexts,
  mergeUsageEvents,
  segmentCacheInput,
  translationResultFromEntry
} from "./translationIpcHelpers";

const baseTextInput: TranslateTextInput = {
  text: "hello",
  sourceLang: "en",
  targetLang: "ko",
  providerName: "gemini",
  model: "gemini-2.5-flash-lite",
  geminiPlan: "free",
  profileId: "default"
};

const basePdfInput: TranslatePdfSegmentsInput = {
  ...baseTextInput,
  segments: [
    {
      id: "s1",
      index: 0,
      pageNumber: 1,
      text: "First segment."
    }
  ],
  bypassCache: false,
  promptVersion: "prompt-v1",
  contextHash: "context-1",
  translationContext: {
    sourceLang: "en",
    targetLang: "ko",
    terms: [],
    styleGuide: [],
    contextHash: "context-override",
    promptVersion: "pdf-context-v1"
  }
};

describe("translation IPC helpers", () => {
  it("maps cache entries to translate results", () => {
    const entry: TranslationCacheEntry = {
      ...baseTextInput,
      translatedText: "안녕",
      createdAt: "2026-06-25T00:00:00.000Z",
      updatedAt: "2026-06-25T00:00:00.000Z"
    };

    expect(translationResultFromEntry(entry, "hit")).toMatchObject({
      translatedText: "안녕",
      providerName: "gemini",
      sourceLang: "en",
      targetLang: "ko",
      cacheStatus: "hit"
    });
  });

  it("builds segment cache input with translation context hash precedence", () => {
    expect(segmentCacheInput(basePdfInput, basePdfInput.segments[0])).toMatchObject({
      text: "First segment.",
      sourceLang: "en",
      targetLang: "ko",
      providerName: "gemini",
      model: "gemini-2.5-flash-lite",
      promptVersion: "prompt-v1",
      contextHash: "context-override"
    });
  });

  it("estimates and merges usage events", () => {
    const first = estimateUsageEventForTexts(baseTextInput, ["First"]);
    const second = estimateUsageEventForTexts(baseTextInput, ["Second"]);
    const merged = mergeUsageEvents([first, second], basePdfInput);

    expect(merged?.usage.requestCount).toBe(
      first.usage.requestCount + second.usage.requestCount
    );
    expect(merged?.providerName).toBe("gemini");
  });

  it("uses Ollama model fallback when estimating local usage", () => {
    const event = estimateUsageEventForTexts(
      {
        ...baseTextInput,
        providerName: "local",
        model: undefined,
        ollamaModel: "gemma3:12b"
      },
      ["Local model translation input."]
    );

    expect(event.providerName).toBe("local");
    expect(event.model).toBe("gemma3:12b");
    expect(event.estimatedCostKrw).toEqual({ min: 0, max: 0 });
    expect(event.usage.totalTokens).toBeGreaterThan(0);
  });

  it("chunks arrays without dropping trailing items", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
