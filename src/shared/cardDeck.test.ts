import { describe, expect, it } from "vitest";
import { createStudyCardFromGenerated } from "./cardFactory";
import {
  getCardDeckFilterLabel,
  getCardDeckLabel,
  getCardDeckShortLabel,
  isInputReadingCard,
  isLifeMiningOutputCard,
  normalizeCardDeck
} from "./cardDeck";
import type { GeneratedCardData } from "./types";

const baseGeneratedCard: GeneratedCardData = {
  cardType: "reading",
  sourceSentence: "The road winds through the hills.",
  frontText: "The road winds through the hills.",
  literalTranslationKo: "직역 설명",
  naturalTranslationKo: "자연스러운 번역",
  highlightMappings: [],
  vocabularyItems: []
};

describe("cardDeck", () => {
  it("stores reading cards as target-to-native input cards", () => {
    const card = createStudyCardFromGenerated(baseGeneratedCard);

    expect(card.deckType).toBe("input");
    expect(card.direction).toBe("target_to_native");
  });

  it("normalizes generated input cards to the input back format", () => {
    const card = createStudyCardFromGenerated({
      ...baseGeneratedCard,
      sourceSentence: "The hero encounters a trap.",
      frontText: "The hero encounters a trap.",
      highlightMappings: [
        {
          sourceText: "encounters",
          literalKo: "마주친다",
          naturalKo: "맞닥뜨린다",
          colorKey: "red"
        }
      ],
      vocabularyItems: [
        {
          term: "encounters",
          basicMeaningKo: "마주치다",
          meaningInContextKo: "뜻밖에 문제나 상황을 맞닥뜨리다",
          colorKey: "red",
          examples: ["The hero encounters a trap."]
        }
      ],
      confusingComparisons: []
    });

    expect(card.deckType).toBe("input");
    expect(card.direction).toBe("target_to_native");
    expect(card.vocabularyItems[0]?.usagePatterns?.[0]).toMatch(/Collocation:/);
    expect(card.confusingComparisons).toHaveLength(1);
    expect(card.confusingComparisons?.[0]).toMatchObject({
      kind: "similar",
      title: "encounters vs meets"
    });
  });

  it("keeps complete generated reading structures and repairs incomplete ones", () => {
    const readingStructure = {
      segments: [
        {
          id: "subject",
          text: "The road",
          labelKo: "주어",
          tone: "subject" as const,
          groupId: "clause-1"
        },
        {
          id: "action",
          text: "winds through the hills.",
          labelKo: "동사구",
          tone: "action" as const,
          groupId: "clause-1"
        }
      ],
      groups: [
        {
          id: "clause-1",
          kind: "clause" as const,
          titleKo: "절 1 · 장면",
          summaryKo: "길이 언덕 사이로 이어집니다.",
          segmentIds: ["subject", "action"]
        }
      ]
    };

    const complete = createStudyCardFromGenerated({
      ...baseGeneratedCard,
      readingStructure
    });
    const incomplete = createStudyCardFromGenerated({
      ...baseGeneratedCard,
      readingStructure: {
        ...readingStructure,
        segments: readingStructure.segments.slice(0, 1)
      }
    });

    expect(complete.readingStructure).toEqual(readingStructure);
    expect(incomplete.readingStructure).toBeDefined();
    expect(incomplete.readingStructure?.segments).toHaveLength(2);
    expect(incomplete.readingStructure?.groups).toHaveLength(1);
  });

  it("creates a fallback STEP 3 structure when the model omits it", () => {
    const sourceSentence =
      "However, medals are not automatically given; drivers need to explicitly request the medal upon meeting criteria.";
    const card = createStudyCardFromGenerated({
      ...baseGeneratedCard,
      sourceSentence,
      frontText: sourceSentence,
      readingStructure: undefined
    });

    expect(card.readingStructure).toBeDefined();
    expect(card.readingStructure?.groups.length).toBeGreaterThanOrEqual(3);
    expect(card.readingStructure?.segments.some((segment) => segment.tone === "connector")).toBe(
      true
    );
    expect(
      card.readingStructure?.segments
        .map((segment) => segment.text)
        .join(" ")
        .replace(/\s+([,.;:!?])/g, "$1")
    ).toBe(sourceSentence);
  });

  it("stores life mining cards as native-to-target output cards", () => {
    const card = createStudyCardFromGenerated({
      ...baseGeneratedCard,
      cardType: "life_expression",
      sourceSentence: "나 좀 늦을 것 같아.",
      frontText: "맥락\n늦는다고 말하는 상황.\n\n원문\nMe: 나 좀 늦을 것 같아."
    });

    expect(card.deckType).toBe("output");
    expect(card.direction).toBe("native_to_target");
  });

  it("normalizes older saved cards with missing deck fields", () => {
    const card = normalizeCardDeck({
      ...baseGeneratedCard,
      cardType: "life_expression"
    });

    expect(card.deckType).toBe("output");
    expect(card.direction).toBe("native_to_target");
  });

  it("keeps explicitly saved listening cards in the listening input deck", () => {
    const card = normalizeCardDeck({
      ...baseGeneratedCard,
      deckType: "input-listening",
      direction: "en_to_ko"
    });

    expect(card.deckType).toBe("input-listening");
    expect(card.direction).toBe("en_to_ko");
  });

  it("keeps explicitly saved generic listening cards in the listening input deck", () => {
    const card = normalizeCardDeck({
      ...baseGeneratedCard,
      deckType: "input-listening",
      direction: "target_to_native"
    });

    expect(card.deckType).toBe("input-listening");
    expect(card.direction).toBe("target_to_native");
    expect(card.listeningStudyGuide).toMatchObject({
      templateVersion: "listening-adaptive-v1"
    });
    expect(card.listeningStudyGuide?.chunks.length).toBeGreaterThan(0);
  });

  it("keeps a generated adaptive listening guide when normalizing a saved card", () => {
    const card = normalizeCardDeck({
      ...baseGeneratedCard,
      deckType: "input-listening",
      listeningStudyGuide: {
        templateVersion: "listening-adaptive-v1" as const,
        listeningIssue: {
          title: "축약",
          bodyKo: "소리가 짧아집니다."
        },
        chunks: [
          {
            en: "The hero",
            pronunciationKo: "더 히어로",
            ipa: "/ðə ˈhɪroʊ/",
            reasonKo: "the가 약하게 들립니다."
          }
        ],
        dictation: {
          prompt: "____ encounters a trap.",
          answer: "The hero",
          explanationKo: "문장 첫 덩어리입니다."
        }
      }
    });

    expect(card.listeningStudyGuide?.listeningIssue.title).toBe("축약");
    expect(card.listeningStudyGuide?.chunks[0]?.pronunciationKo).toBe("더 히어로");
  });

  it("labels reading input cards separately from listening input cards", () => {
    const readingCard = createStudyCardFromGenerated(baseGeneratedCard);
    const listeningCard = normalizeCardDeck({
      ...baseGeneratedCard,
      deckType: "input-listening",
      direction: "target_to_native"
    });

    expect(getCardDeckLabel(readingCard)).toBe("읽기 카드");
    expect(getCardDeckShortLabel(readingCard)).toBe("읽기");
    expect(getCardDeckFilterLabel("input")).toBe("읽기 카드");
    expect(getCardDeckLabel(listeningCard)).toBe("듣기 카드");
    expect(getCardDeckShortLabel(listeningCard)).toBe("듣기");
    expect(getCardDeckLabel(listeningCard, "en")).toBe("Listening Card");
  });

  it("counts only reading input cards as the reading input mission source", () => {
    expect(isInputReadingCard({ cardType: "reading", deckType: "input" })).toBe(true);
    expect(isInputReadingCard({ cardType: "reading", deckType: "input-listening" })).toBe(false);
    expect(isInputReadingCard({ cardType: "life_expression", deckType: "output" })).toBe(false);
  });

  it("counts only life expression output cards as the life mining mission source", () => {
    expect(isLifeMiningOutputCard({ cardType: "life_expression", deckType: "output" })).toBe(true);
    expect(isLifeMiningOutputCard({ cardType: "reading", deckType: "input" })).toBe(false);
    expect(isLifeMiningOutputCard({ cardType: "reading", deckType: "input-listening" })).toBe(false);
  });
});
