import { describe, expect, it } from "vitest";
import { buildGlossaryEntries, filterGlossaryEntries } from "./glossary";
import type { StudyCard } from "./types";

describe("glossary", () => {
  it("builds deduplicated glossary entries from card vocabulary", () => {
    const entries = buildGlossaryEntries([
      makeCard("a", "It did not work for me.", [
        {
          term: "work",
          basicMeaningKo: "작동하다",
          meaningInContextKo: "효과가 있다",
          partOfSpeech: "verb",
          examples: ["It works for me."]
        }
      ]),
      makeCard("b", "The plan WORKS.", [
        {
          term: "WORK",
          basicMeaningKo: "일하다",
          examples: ["This works."]
        }
      ])
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      term: "work",
      meaningKo: "효과가 있다",
      partOfSpeech: "verb",
      policy: "card_based",
      sourceCardCount: 2,
      exampleCount: 2
    });
  });

  it("filters entries by term, meaning, and source preview", () => {
    const cards = [
      makeCard("a", "The old door looked battered.", [
        {
          term: "battered",
          basicMeaningKo: "낡고 손상된",
          examples: []
        }
      ]),
      makeCard("b", "Could you walk me through it?", [
        {
          term: "walk through",
          basicMeaningKo: "차근차근 설명하다",
          examples: []
        }
      ])
    ];

    expect(buildGlossaryEntries(cards, "설명").map((entry) => entry.term)).toEqual([
      "walk through"
    ]);
    expect(buildGlossaryEntries(cards, "door").map((entry) => entry.term)).toEqual([
      "battered"
    ]);
    expect(buildGlossaryEntries(cards, "card based")).toHaveLength(2);
    const built = buildGlossaryEntries(cards);
    expect(filterGlossaryEntries(built, "설명").map((entry) => entry.term)).toEqual([
      "walk through"
    ]);
  });
});

function makeCard(
  id: string,
  sourceSentence: string,
  vocabularyItems: Array<{
    term: string;
    basicMeaningKo: string;
    meaningInContextKo?: string;
    partOfSpeech?: string;
    examples: string[];
  }>
): StudyCard {
  return {
    id,
    cardType: "reading",
    deckType: "input",
    direction: "en_to_ko",
    sourceSentence,
    frontText: sourceSentence,
    literalTranslationKo: "",
    naturalTranslationKo: "",
    highlightMappings: [],
    vocabularyItems: vocabularyItems.map((item) => ({
      ...item,
      colorKey: "blue"
    })),
    srs: {
      dueAt: "2026-06-12T00:00:00.000Z",
      intervalDays: 0,
      easeFactor: 2.5,
      reviewCount: 0,
      lapseCount: 0
    }
  };
}
