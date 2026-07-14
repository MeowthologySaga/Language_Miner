import { describe, expect, it } from "vitest";
import {
  createBrowserSentenceFallbackCardData,
  createFallbackVocabularyItem,
  ensureBrowserSentenceSelectedTerms,
  normalizeBrowserVocabularyIpa
} from "./browserSentenceFallbackCard";
import type { HighlightColorKey, HighlightMapping, VocabularyItem } from "./types";

describe("browser sentence fallback cards", () => {
  it("creates a useful fallback card for a selected question word", () => {
    const card = createBrowserSentenceFallbackCardData({
      selectedText: "How",
      sourceSentence: "How do I get up there?",
      translatedSentence: "어떻게 올라갈 수 있어?",
      colorKeys: ["red", "blue"]
    });

    expect(card.frontText).toBe("How do I get up there?");
    expect(card.vocabularyItems).toHaveLength(1);
    expect(card.vocabularyItems[0]).toMatchObject({
      term: "How",
      basicMeaningKo: "어떻게, 어떤 방식으로",
      meaningInContextKo: "방법이나 경로를 묻는 의문사",
      etymologyKo: "How do I + 동사원형...? = 내가 어떻게 ...하지? / 어떻게 ...할 수 있지?",
      usagePatterns: [
        "Collocation: How do I + verb?",
        "How do I ...?",
        "How can I ...?",
        "How do you ...?"
      ]
    });
    expect(card.vocabularyItems[0].examples).toEqual([
      "How do I open this door?",
      "How can I reach that ledge?",
      "How do you solve this puzzle?"
    ]);
    expect(card.vocabularyItems[0].exampleTranslationsKo).toEqual([
      "이 문은 어떻게 열어요?",
      "저 난간에는 어떻게 닿을 수 있나요?",
      "이 퍼즐은 어떻게 푸나요?"
    ]);
    expect(card.vocabularyItems[0].examples).not.toContain("How do I get up there?");
    expect(card.vocabularyItems[0].basicMeaningKo).not.toBe("선택 표현");
    expect(card.confusingComparisons).toHaveLength(1);
    expect(card.confusingComparisons?.[0].title).toContain("How");
    expect(card.structureNote).toBe("");
    expect(card.pumpPrompts).toEqual([]);
  });

  it("fills known fallback details for attention and hibernated", () => {
    const attention = createFallbackVocabularyItem(
      "attention",
      "Im sorry I wasn't paying attention.",
      "red"
    );
    const hibernated = createFallbackVocabularyItem(
      "hibernated",
      "Vincent is a boomer who hibernated.",
      "blue"
    );

    expect(attention.basicMeaningKo).toBe("주의, 관심");
    expect(attention.usagePatterns?.[0]).toMatch(/Collocation:/);
    expect(attention.usagePatterns).toContain("pay attention to ...");
    expect(attention.examples).toHaveLength(3);
    expect(hibernated.basicMeaningKo).toBe("겨울잠을 잤다, 긴 잠에 들어 있었다");
    expect(hibernated.etymologyKo).toContain("겨울잠");
    expect(hibernated.examples).toHaveLength(3);
    expect(hibernated.exampleTranslationsKo).toHaveLength(3);
  });

  it("adds Korean translations to generic fallback examples", () => {
    const item = createFallbackVocabularyItem(
      "nothing to do",
      "Alice had nothing to do.",
      "purple"
    );

    expect(item.examples).toEqual([
      'I noticed "nothing to do" in the sentence.',
      'Try using "nothing to do" in a short reply.',
      'The expression "nothing to do" changes the tone.'
    ]);
    expect(item.exampleTranslationsKo).toEqual([
      '문장에서 "nothing to do"이라는 표현을 발견했습니다.',
      '짧은 답변에서 "nothing to do"을 써 보세요.',
      '"nothing to do"이라는 표현은 말투를 바꿉니다.'
    ]);
  });

  it("keeps one vocabulary block per selected term when a provider returns only one", () => {
    const colorKeys: HighlightColorKey[] = ["green", "blue", "pink"];
    const card = {
      sourceSentence: "alpha beta gamma",
      highlightMappings: [
        {
          sourceText: "alpha",
          literalKo: "literal alpha",
          naturalKo: "natural alpha",
          colorKey: "green"
        }
      ] satisfies HighlightMapping[],
      vocabularyItems: [
        {
          term: "alpha",
          partOfSpeech: "word",
          basicMeaningKo: "custom alpha",
          meaningInContextKo: "custom alpha in context",
          colorKey: "green",
          examples: ["Alpha starts the sequence."]
        }
      ] satisfies VocabularyItem[]
    };

    const fixed = ensureBrowserSentenceSelectedTerms(
      card,
      "alpha, beta, gamma",
      colorKeys
    );

    expect(fixed.vocabularyItems.map((item) => item.term)).toEqual(["alpha", "beta", "gamma"]);
    expect(fixed.vocabularyItems[0].basicMeaningKo).toBe("custom alpha");
    expect(fixed.vocabularyItems[1].examples).toHaveLength(3);
    expect(fixed.highlightMappings.map((mapping) => mapping.sourceText)).toEqual([
      "alpha",
      "beta",
      "gamma"
    ]);
    expect(fixed.confusingComparisons).toHaveLength(3);
    expect(fixed.confusingComparisons?.map((comparison) => comparison.title)).toEqual([
      "alpha vs near synonym",
      "beta vs near synonym",
      "gamma vs near synonym"
    ]);
    expect(fixed.confusingComparisons?.map((comparison) => comparison.kind)).toEqual([
      "similar",
      "similar",
      "similar"
    ]);
  });

  it("fills missing etymology notes on existing selected-term vocabulary blocks", () => {
    const fixed = ensureBrowserSentenceSelectedTerms(
      {
        sourceSentence:
          "I could already do long and short range skills, so the only pawns I could use was a tank and a healer.",
        highlightMappings: [
          {
            sourceText: "range",
            literalKo: "범위",
            naturalKo: "거리/범위",
            colorKey: "red"
          }
        ],
        vocabularyItems: [
          {
            term: "range",
            ipa: "/reɪndʒ/",
            partOfSpeech: "noun",
            basicMeaningKo: "범위, 영역",
            meaningInContextKo: "기술이나 공격이 미치는 거리 또는 영역",
            colorKey: "red",
            usagePatterns: ["Collocation: long range"],
            examples: ["The sniper's rifle had a long range."]
          }
        ]
      },
      "range",
      ["red"]
    );

    expect(fixed.vocabularyItems).toHaveLength(1);
    const item = fixed.vocabularyItems[0] as VocabularyItem;
    expect(item.basicMeaningKo).toBe("범위, 영역");
    expect(item.etymologyKo).toContain("long/short range");
    expect(item.usagePatterns).toContain("ranged skill");
  });

  it("replaces placeholder comparisons with a typed comparison for each selected term", () => {
    const fixed = ensureBrowserSentenceSelectedTerms(
      {
        sourceSentence: "The hero encounters a trap.",
        highlightMappings: [],
        vocabularyItems: [],
        confusingComparisons: [
          {
            title: "Encounters vs similar expression",
            explanationKo: "placeholder comparison"
          }
        ]
      },
      "Encounters",
      ["red"]
    );

    expect(fixed.confusingComparisons).toHaveLength(1);
    const comparison = fixed.confusingComparisons[0]!;
    expect(comparison).toMatchObject({
      kind: "similar",
      title: "encounters vs meets"
    });
    expect(comparison.title).not.toMatch(/similar expression/i);
  });

  it("normalizes legacy collocation comparison kinds away from comparison labels", () => {
    const fixed = ensureBrowserSentenceSelectedTerms(
      {
        sourceSentence: "The building had a glass facade.",
        highlightMappings: [],
        vocabularyItems: [],
        confusingComparisons: [
          {
            kind: "collocation",
            title: "facade vs face",
            explanationKo:
              "collocation 차이가 아니라 건물 정면과 일반적인 앞면 사이의 쓰임 차이를 봅니다."
          } as any
        ]
      },
      "facade",
      ["red"]
    );

    expect(fixed.confusingComparisons).toHaveLength(1);
    expect(fixed.confusingComparisons[0]?.kind).toBe("nuance");
    expect(fixed.confusingComparisons[0]?.kind).not.toBe("collocation");
  });

  it("keeps a provider vocabulary block when the selected surface form differs from the lemma", () => {
    const card = {
      sourceSentence: "Their facades were worn by time.",
      literalTranslationKo: "그들의 외벽은 시간에 의해 닳아 있었다.",
      naturalTranslationKo: "그 건물의 외벽은 세월에 닳아 있었다.",
      highlightMappings: [
        {
          sourceText: "facades",
          literalKo: "외벽",
          naturalKo: "외벽",
          colorKey: "orange"
        }
      ] satisfies HighlightMapping[],
      vocabularyItems: [
        {
          term: "facade",
          ipa: "/fəˈsɑːd/",
          partOfSpeech: "noun",
          basicMeaningKo: "건물의 정면, 외벽",
          meaningInContextKo: "건물 바깥쪽에서 보이는 앞면이나 외관",
          colorKey: "orange",
          usagePatterns: ["building facade"],
          examples: ["The theater's facade was restored."]
        }
      ] satisfies VocabularyItem[]
    };

    const fixed = ensureBrowserSentenceSelectedTerms(card, "facades", ["orange"]);

    expect(fixed.vocabularyItems).toHaveLength(1);
    expect(fixed.vocabularyItems[0]).toMatchObject({
      term: "facade",
      basicMeaningKo: "건물의 정면, 외벽"
    });
    expect(fixed.vocabularyItems[0].usagePatterns?.[0]).toMatch(/Collocation:/);
    expect(fixed.highlightMappings[0]).toMatchObject({
      sourceText: "facades",
      literalKo: "외벽",
      naturalKo: "외벽"
    });
  });

  it("normalizes browser vocabulary IPA and repairs acronym respellings", () => {
    expect(normalizeBrowserVocabularyIpa("runes", "IPA: /ruːnz/")).toBe("/ruːnz/");
    expect(normalizeBrowserVocabularyIpa("Ngl", "pronounced en gee el")).toBe("/ˌɛn dʒiː ˈɛl/");
    expect(normalizeBrowserVocabularyIpa("Ngl", "/en gee el/")).toBe("/ˌɛn dʒiː ˈɛl/");
    expect(normalizeBrowserVocabularyIpa("not gonna lie", "/not gonna lie/")).toBe("");
  });

  it("uses the existing vocabulary fields for internet slang acronyms", () => {
    const card = createBrowserSentenceFallbackCardData({
      selectedText: "NGL",
      sourceSentence: "NGL, that ending was great.",
      colorKeys: ["red"]
    });

    expect(card.vocabularyItems[0]).toMatchObject({
      term: "NGL",
      ipa: "/ˌɛn dʒiː ˈɛl/",
      partOfSpeech: "internet slang / discourse marker",
      basicMeaningKo: "솔직히 말해서"
    });
    expect(card.vocabularyItems[0]?.etymologyKo).toContain("not gonna lie");
    expect(card.vocabularyItems[0]?.usagePatterns).toContain("Expanded form: not gonna lie");
    expect(card.confusingComparisons?.[0]).toMatchObject({
      kind: "nuance",
      title: "NGL vs TBH"
    });
  });

  it("creates target-language fallback examples when a non-English target is provided", () => {
    const card = createBrowserSentenceFallbackCardData({
      selectedText: "元来",
      sourceSentence: "なお元来の古い大和言葉では、原則として",
      colorKeys: ["red"],
      targetLanguageCode: "ja"
    });

    expect(card.vocabularyItems[0].examples).toEqual([
      "「元来」はこの文で自然に使えます。",
      "彼は「元来」という表現を使いました。",
      "この場面では「元来」が大切な意味を持ちます。"
    ]);
    expect(card.vocabularyItems[0].exampleTranslationsKo).toEqual([
      '"元来"은 이 문장에서 자연스럽게 쓰입니다.',
      '그는 "元来"이라는 표현을 사용했습니다.',
      '이 장면에서는 "元来"이 중요한 의미를 가집니다.'
    ]);
  });
});
