import { describe, expect, it } from "vitest";
import {
  createTranslationCacheEntry,
  getTranslationCacheKey,
  segmentCacheInput
} from "./memoryTranslationCache";
import type { TranslatePdfSegmentsInput, TranslationCacheLookupInput } from "../shared/types";

describe("memory translation cache", () => {
  it("uses normalized text when building cache keys", () => {
    const base: TranslationCacheLookupInput = {
      profileId: "default",
      text: "hello world",
      sourceLang: "en",
      targetLang: "ko",
      providerName: "gemini",
      model: "gemini-2.5-flash",
      promptVersion: "v1",
      contextHash: "ctx"
    };

    expect(getTranslationCacheKey(base, "default")).toBe(
      getTranslationCacheKey({ ...base, text: "  hello   world\n" }, "default")
    );
  });

  it("prefers translation context hash for PDF segment cache inputs", () => {
    const input: TranslatePdfSegmentsInput = {
      segments: [{ id: "s1", pageNumber: 1, index: 0, text: "Segment text." }],
      sourceLang: "en",
      targetLang: "ko",
      providerName: "gemini",
      contextHash: "legacy-context",
      translationContext: {
        sourceLang: "en",
        targetLang: "ko",
        contextHash: "document-context",
        promptVersion: "v1",
        styleGuide: [],
        terms: []
      }
    };

    expect(segmentCacheInput(input, input.segments[0]).contextHash).toBe("document-context");
  });

  it("preserves existing cache entry creation date on update", () => {
    const existing = createTranslationCacheEntry({
      id: "entry-1",
      input: {
        profileId: "default",
        text: "Hello",
        sourceLang: "en",
        targetLang: "ko",
        providerName: "google"
      },
      normalizedProfileId: "default",
      now: "2026-01-01T00:00:00.000Z",
      translatedText: "안녕"
    });

    const updated = createTranslationCacheEntry({
      existing,
      id: existing.id,
      input: {
        profileId: "default",
        text: "Hello",
        sourceLang: "en",
        targetLang: "ko",
        providerName: "google"
      },
      normalizedProfileId: "default",
      now: "2026-01-02T00:00:00.000Z",
      translatedText: "안녕하세요"
    });

    expect(updated.createdAt).toBe(existing.createdAt);
    expect(updated.updatedAt).toBe("2026-01-02T00:00:00.000Z");
  });
});
