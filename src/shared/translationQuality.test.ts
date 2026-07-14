import { describe, expect, it } from "vitest";
import { defaultLearningProfile, languagePresets } from "./languages";
import { buildPdfTranslationContext } from "./pdfTranslationContext";
import {
  assessPdfTranslationQuality,
  hasCriticalPdfTranslationQualityIssues,
  shouldReviewPdfProperNouns
} from "./translationQuality";

describe("PDF translation quality checks", () => {
  it("flags Japanese script in Korean output", () => {
    const issues = assessPdfTranslationQuality({
      sourceText: "A book title appeared.",
      translatedText: "이후 작成された 작품과 연결됩니다.",
      outputLanguage: defaultLearningProfile.nativeLanguage
    });

    expect(issues.map((issue) => issue.code)).toContain("japanese-script");
    expect(issues.map((issue) => issue.code)).toContain("mixed-cjk-korean");
  });

  it("does not run Korean-specific checks for other output languages", () => {
    const issues = assessPdfTranslationQuality({
      sourceText: "A book title appeared.",
      translatedText: "作成された",
      outputLanguage: languagePresets[0]
    });

    expect(issues).toEqual([]);
  });

  it("flags unexpected scripts in Korean output", () => {
    const issues = assessPdfTranslationQuality({
      sourceText: "The dragon spoke to the traveler.",
      translatedText: "대룡 Дrak가 여행자에게 말했다.",
      outputLanguage: defaultLearningProfile.nativeLanguage
    });

    expect(issues.map((issue) => issue.code)).toContain("unexpected-script");
  });

  it("flags Latin tokens that do not appear in the source", () => {
    const issues = assessPdfTranslationQuality({
      sourceText: "The company traveled with dwarves.",
      translatedText: "그 일행은 낯선 xenword들과 함께 여행했다.",
      outputLanguage: defaultLearningProfile.nativeLanguage
    });

    expect(issues.map((issue) => issue.code)).toContain("source-absent-latin-token");
  });

  it("allows source possessive Latin names to appear without the possessive suffix", () => {
    const issues = assessPdfTranslationQuality({
      sourceText: "Bilbo’s voice echoed in the hall.",
      translatedText: "Bilbo의 목소리가 홀에 울려 퍼졌다.",
      outputLanguage: defaultLearningProfile.nativeLanguage
    });

    expect(issues.map((issue) => issue.code)).not.toContain("source-absent-latin-token");
  });


  it("flags long source-language fragments copied into Korean output", () => {
    const sourceText =
      "Vegetable Stew is a great new way to use summer vegetables. Add carrots, squash, corn, thyme, garlic, scallion, hot pepper, onion, and tomatoes to the pot.";
    const issues = assessPdfTranslationQuality({
      sourceText,
      translatedText: `${sourceText} This sentence has not been translated yet.`,
      outputLanguage: defaultLearningProfile.nativeLanguage
    });

    expect(issues.map((issue) => issue.code)).toContain("untranslated-source-fragment");
  });

  it("flags source-absent CJK fragments even when they are not adjacent to Hangul", () => {
    const issues = assessPdfTranslationQuality({
      sourceText: "Rinse and drain the sweet corn.",
      translatedText: "단옥수수를 헹구고 물기를 뺍니다. 此部分应保留原文.",
      outputLanguage: defaultLearningProfile.nativeLanguage
    });

    expect(issues.map((issue) => issue.code)).toContain("mixed-cjk-korean");
  });

  it("allows Latin names and titles preserved from the source", () => {
    const issues = assessPdfTranslationQuality({
      sourceText: "The Long Road was edited by HarperCollins.",
      translatedText: "The Long Road는 HarperCollins에서 편집했다.",
      outputLanguage: defaultLearningProfile.nativeLanguage
    });

    expect(issues).toEqual([]);
  });

  it("requests a review pass for likely titles and initialized names", () => {
    expect(
      shouldReviewPdfProperNouns({
        sourceText: "The Long Road was edited by J. R. Smith.",
        outputLanguage: defaultLearningProfile.nativeLanguage
      })
    ).toBe(true);
  });

  it("flags missing source numbers and initials", () => {
    const issues = assessPdfTranslationQuality({
      sourceText: "J. R. Smith revised the edition in 1995.",
      translatedText: "Smith revised the edition.",
      outputLanguage: defaultLearningProfile.nativeLanguage
    });

    expect(issues.map((issue) => issue.code)).toContain("missing-source-number");
    expect(issues.map((issue) => issue.code)).toContain("missing-source-initial");
  });

  it("flags required preserve terms from context", () => {
    const context = buildPdfTranslationContext({
      sourceLang: "en",
      targetLang: "ko",
      segments: [{ text: "The PDF appendix was updated." }]
    });

    const issues = assessPdfTranslationQuality({
      sourceText: "The PDF appendix was updated.",
      translatedText: "appendix was updated.",
      outputLanguage: defaultLearningProfile.nativeLanguage,
      translationContext: context
    });

    expect(issues.map((issue) => issue.code)).toContain("glossary-term-mismatch");
  });

  it("does not match preserved acronym terms inside ordinary words", () => {
    const context = {
      sourceLang: "en",
      targetLang: "ko",
      contextHash: "test-context",
      promptVersion: "test",
      styleGuide: [],
      terms: [
        {
          source: "VI",
          target: "VI",
          category: "acronym" as const,
          policy: "preserve" as const,
          confidence: 0.94,
          occurrences: 1
        }
      ]
    };

    const issues = assessPdfTranslationQuality({
      sourceText: "The revisions were made for visitors.",
      translatedText: "방문객을 위해 개정되었습니다.",
      outputLanguage: defaultLearningProfile.nativeLanguage,
      translationContext: context
    });

    expect(issues.map((issue) => issue.code)).not.toContain("glossary-term-mismatch");
  });

  it("flags title candidates that are omitted or replaced", () => {
    const context = buildPdfTranslationContext({
      sourceLang: "en",
      targetLang: "ko",
      segments: [{ text: "Readers discussed \"The Silver Road\" in 1995." }]
    });

    const issues = assessPdfTranslationQuality({
      sourceText: "Readers discussed \"The Silver Road\" in 1995.",
      translatedText: "독자들은 1995년에 그 길에 관해 논의했다.",
      outputLanguage: defaultLearningProfile.nativeLanguage,
      translationContext: context
    });

    expect(issues.map((issue) => issue.code)).toContain("missing-context-title");
  });

  it("does not require generic proper-noun candidates to stay in source spelling", () => {
    const context = buildPdfTranslationContext({
      sourceLang: "en",
      targetLang: "ko",
      segments: [{ text: "The Men of Dale sent word to the Men of the Lake." }]
    });

    const issues = assessPdfTranslationQuality({
      sourceText: "The Men of Dale sent word to the Men of the Lake.",
      translatedText: "데일의 사람들은 호수의 사람들에게 소식을 보냈다.",
      outputLanguage: defaultLearningProfile.nativeLanguage,
      translationContext: context
    });

    expect(issues.map((issue) => issue.code)).not.toContain("missing-context-title");
  });

  it("does not treat missing context titles as a final discard reason", () => {
    expect(
      hasCriticalPdfTranslationQualityIssues([
        {
          code: "missing-context-title",
          message: "Review the title rendering."
        }
      ])
    ).toBe(false);
  });

  it("still treats script and source-absent token noise as critical", () => {
    expect(
      hasCriticalPdfTranslationQualityIssues([
        {
          code: "source-absent-latin-token",
          message: "Unexpected Latin token."
        }
      ])
    ).toBe(true);
    expect(
      hasCriticalPdfTranslationQualityIssues([
        {
          code: "japanese-script",
          message: "Unexpected Japanese script."
        }
      ])
    ).toBe(true);
  });
});
