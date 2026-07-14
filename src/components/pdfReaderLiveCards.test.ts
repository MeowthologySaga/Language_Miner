import { describe, expect, it } from "vitest";
import { defaultLearningProfile } from "../shared/languages";
import type { SentenceExtractionResult } from "../utils/sentenceExtraction";
import {
  createPdfLiveCardRequest,
  estimatePdfLiveCardUsage
} from "./pdfReaderLiveCards";

const extraction: SentenceExtractionResult = {
  selectedText: "intricate",
  sourceSentence: "The intricate diagram explained the system.",
  beforeSentence: "The manual was dense.",
  afterSentence: "The team reviewed it twice.",
  normalizedFullText:
    "The manual was dense. The intricate diagram explained the system. The team reviewed it twice.",
  extractionConfidence: "high"
};

describe("pdf reader live cards", () => {
  it("builds the provider request from the selected PDF sentence", () => {
    expect(createPdfLiveCardRequest(extraction, defaultLearningProfile)).toMatchObject({
      selectedText: "intricate",
      sourceSentence: "The intricate diagram explained the system.",
      readerTextContext: extraction.normalizedFullText,
      learningProfile: defaultLearningProfile,
      learnerLevel: "intermediate"
    });
  });

  it("uses source sentence as fallback estimate context for weak extraction", () => {
    const fallbackExtraction: SentenceExtractionResult = {
      ...extraction,
      sourceSentence: "Fallback text around intricate.",
      normalizedFullText: "A larger noisy PDF page body.",
      extractionConfidence: "fallback"
    };

    const estimate = estimatePdfLiveCardUsage(fallbackExtraction, {
      providerName: "gemini",
      ollamaModel: "gemma3:12b",
      geminiModel: "gemini-2.5-flash-lite",
      geminiPlan: "free",
      learningProfile: defaultLearningProfile,
      dailyAppTokenLimit: 500_000,
      monthlySpendLimitKrw: 5_000
    });

    expect(estimate.tokenLabel).toMatch(/tokens$/);
    expect(estimate.requestLabel.length).toBeGreaterThan(0);
  });
});
