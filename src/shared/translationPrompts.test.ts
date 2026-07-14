import { describe, expect, it } from "vitest";
import { defaultLearningProfile, languagePresets } from "./languages";
import { buildPdfTranslationContext } from "./pdfTranslationContext";
import {
  buildPdfSegmentTranslationSystemPrompt,
  buildPdfSegmentTranslationUserPrompt,
  buildPdfTranslationSystemPrompt,
  PDF_SEGMENT_TRANSLATION_PROMPT_VERSION,
  PDF_TRANSLATION_PROMPT_VERSION
} from "./translationPrompts";

describe("PDF translation prompt", () => {
  it("uses profile languages and the v5 prompt version", () => {
    const prompt = buildPdfTranslationSystemPrompt({
      sourceLanguage: defaultLearningProfile.targetLanguage,
      outputLanguage: defaultLearningProfile.nativeLanguage
    });

    expect(PDF_TRANSLATION_PROMPT_VERSION).toBe("pdf-translation-v5");
    expect(prompt).toContain("English text into Korean");
    expect(prompt).toContain("Return only the Korean translation");
  });

  it("includes rules for proper nouns, title pages, and Korean output cleanup", () => {
    const prompt = buildPdfTranslationSystemPrompt({
      sourceLanguage: defaultLearningProfile.targetLanguage,
      outputLanguage: defaultLearningProfile.nativeLanguage
    });

    expect(prompt).toContain("proper nouns");
    expect(prompt).toContain("preserve the original source spelling");
    expect(prompt).toContain("create malformed title translations");
    expect(prompt).toContain("script-mixed names");
    expect(prompt).toContain("title pages");
    expect(prompt).toContain("adult innuendo");
    expect(prompt).toContain("do not make the translation more explicit than the source");
    expect(prompt).toContain("unnecessary Chinese characters into Korean output");
  });

  it("can build a Japanese to Korean prompt from presets", () => {
    const prompt = buildPdfTranslationSystemPrompt({
      sourceLanguage: languagePresets[2],
      outputLanguage: languagePresets[1]
    });

    expect(prompt).toContain("Japanese text into Korean");
  });

  it("builds a segment JSON prompt with id and translationKo requirements", () => {
    const prompt = buildPdfSegmentTranslationSystemPrompt({
      sourceLanguage: defaultLearningProfile.targetLanguage,
      outputLanguage: defaultLearningProfile.nativeLanguage,
      segmentCount: 2
    });
    const translationContext = buildPdfTranslationContext({
      sourceLang: "en",
      targetLang: "ko",
      segments: [
        { text: "The Example Road was edited by J. R. Smith." },
        { text: "Second segment." }
      ]
    });
    const userPrompt = buildPdfSegmentTranslationUserPrompt([
      { id: "p1-s001-abcd12", text: "First segment." },
      { id: "p1-s002-abcd34", text: "Second segment." }
    ], translationContext);

    expect(PDF_SEGMENT_TRANSLATION_PROMPT_VERSION).toBe("pdf-segment-translation-v3");
    expect(prompt).toContain("JSON object with context");
    expect(prompt).toContain("Return only a top-level JSON array");
    expect(prompt).toContain("Do not wrap the array in an object");
    expect(prompt).toContain("id, translationKo");
    expect(prompt).toContain("no missing ids");
    expect(prompt).toContain("merged segments");
    expect(prompt).toContain("provided document context");
    expect(prompt).not.toContain("Hobbit");
    expect(prompt).not.toContain("Tolkien");
    expect(JSON.parse(userPrompt)).toMatchObject({
      context: {
        sourceLang: "en",
        targetLang: "ko",
        contextHash: translationContext.contextHash
      },
      segments: [
        { id: "p1-s001-abcd12", text: "First segment." },
        { id: "p1-s002-abcd34", text: "Second segment." }
      ]
    });
  });
});
