import { describe, expect, it } from "vitest";
import {
  createVocabularyExampleLanguageRules,
  normalizeTargetLanguageVocabularyExamples
} from "./vocabularyExampleLanguage";
import type { LearningProfile } from "./types";

const japaneseProfile: LearningProfile = {
  targetLanguage: { code: "ja", nameKo: "일본어", nameEn: "Japanese" },
  nativeLanguage: { code: "ko", nameKo: "한국어", nameEn: "Korean" }
};

describe("vocabulary example language normalization", () => {
  it("replaces high-confidence native-language examples with target-language fallbacks", () => {
    const examples = normalizeTargetLanguageVocabularyExamples({
      values: [
        "이것은 元来의 의미와는 다릅니다.",
        "그는 元来부터 온화한 성격이었다.",
        "元来, 그 문제는 복잡했습니다."
      ],
      term: "元来",
      sourceTexts: ["なお元来の古い大和言葉では、原則として"],
      targetLanguageCode: "ja"
    });

    expect(examples).toEqual([
      "「元来」はこの文で自然に使えます。",
      "彼は「元来」という表現を使いました。",
      "この場面では「元来」が大切な意味を持ちます。"
    ]);
  });

  it("keeps matching target-language examples before fallback examples", () => {
    const examples = normalizeTargetLanguageVocabularyExamples({
      values: ["元来、この制度は別の目的で作られました。"],
      term: "元来",
      targetLanguageCode: "ja"
    });

    expect(examples).toEqual([
      "元来、この制度は別の目的で作られました。",
      "「元来」はこの文で自然に使えます。",
      "彼は「元来」という表現を使いました。"
    ]);
  });

  it("adds explicit prompt rules that examples stay in the target language", () => {
    const rules = createVocabularyExampleLanguageRules(japaneseProfile).join("\n");
    expect(rules).toContain(
      "examples must be 3 short, new sentences written only in Japanese (ja)"
    );
    expect(rules).toContain("exampleTranslationsKo must contain Korean translations");
  });
});
