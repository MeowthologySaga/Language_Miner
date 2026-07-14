import { describe, expect, it } from "vitest";
import { defaultLearningProfile } from "../shared/languages";
import type { SentenceExtractionResult } from "../utils/sentenceExtraction";
import {
  createCardRequestFromExtraction,
  createCardRequestFromSentenceTerms,
  createSentenceTermsSession,
  estimateReaderCardUsage
} from "./bilingualArtifactReaderCards";

const extraction: SentenceExtractionResult = {
  selectedText: "dilapidated",
  sourceSentence: "The street was lined with dilapidated houses.",
  beforeSentence: "The old district was quiet.",
  afterSentence: "Nobody had moved in for years.",
  normalizedFullText:
    "The old district was quiet. The street was lined with dilapidated houses. Nobody had moved in for years.",
  extractionConfidence: "high"
};

describe("bilingual artifact reader cards", () => {
  it("builds a single-selection card request from sentence extraction", () => {
    expect(createCardRequestFromExtraction(extraction)).toMatchObject({
      selectedText: "dilapidated",
      selectedTerms: ["dilapidated"],
      sourceSentence: "The street was lined with dilapidated houses.",
      readerTextContext: extraction.normalizedFullText,
      extractionConfidence: "high"
    });
  });

  it("can use the fallback source sentence as estimate context", () => {
    const fallbackExtraction: SentenceExtractionResult = {
      ...extraction,
      sourceSentence: "Fallback context around dilapidated.",
      normalizedFullText: "A much larger reader context.",
      extractionConfidence: "fallback"
    };

    expect(
      createCardRequestFromExtraction(fallbackExtraction, {
        fallbackContext: "sourceSentence"
      }).readerTextContext
    ).toBe("Fallback context around dilapidated.");
  });

  it("builds sentence-term sessions and card requests without dropping edit metadata", () => {
    const session = {
      ...createSentenceTermsSession(extraction),
      selectedTerms: ["dilapidated", "lined"],
      isSourceSentenceEdited: true
    };

    expect(createCardRequestFromSentenceTerms(session)).toMatchObject({
      selectedText: "dilapidated, lined",
      selectedTerms: ["dilapidated", "lined"],
      readerTextContext: extraction.normalizedFullText,
      isSourceSentenceEdited: true
    });
  });

  it("estimates usage from a reader card request", () => {
    const estimate = estimateReaderCardUsage(createCardRequestFromExtraction(extraction), {
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
