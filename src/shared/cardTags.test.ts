import { describe, expect, it } from "vitest";
import { createInitialSrs } from "./srs";
import {
  CARD_TAG_UNTAGGED_FILTER,
  getCardTagCounts,
  getCardTags,
  matchesCardTagFilters,
  normalizeCardTags,
  splitCardTagInput,
  withCardTags
} from "./cardTags";
import type { StudyCard } from "./types";

describe("cardTags", () => {
  it("normalizes, deduplicates, and splits tag input", () => {
    expect(splitCardTagInput(" #주제 : 건강, 의도:다시묻기\n주제:건강 ")).toEqual([
      "주제:건강",
      "의도:다시묻기"
    ]);
    expect(normalizeCardTags(["Game", "game", " 게임 "])).toEqual(["Game", "게임"]);
  });

  it("uses legacy output guide tags until a top-level tag list is saved", () => {
    const card = makeCard({
      outputStudyGuide: {
        templateVersion: "adaptive-v1",
        contextKo: "상황",
        dialogue: [],
        keyChunks: [],
        insight: { title: "뉘앙스", bodyKo: "설명" },
        literalMeaningKo: "직역",
        nuanceKo: "뉘앙스",
        breakdown: [],
        alternatives: [],
        miniDrills: [],
        tags: ["건강", "증상설명"]
      }
    });

    expect(getCardTags(card)).toEqual(["건강", "증상설명"]);
    expect(getCardTags(withCardTags(card, []))).toEqual([]);
  });

  it("counts tags and matches OR plus untagged filters", () => {
    const health = withCardTags(makeCard({ id: "health" }), ["주제:건강", "말투:일상"]);
    const cafe = withCardTags(makeCard({ id: "cafe" }), ["상황:카페"]);
    const untagged = makeCard({ id: "none", tags: [] });

    expect(getCardTagCounts([health, cafe, untagged])).toEqual([
      { tag: "말투:일상", count: 1 },
      { tag: "상황:카페", count: 1 },
      { tag: "주제:건강", count: 1 }
    ]);
    expect(matchesCardTagFilters(health, ["상황:카페", "주제:건강"])).toBe(true);
    expect(matchesCardTagFilters(cafe, ["주제:건강"])).toBe(false);
    expect(matchesCardTagFilters(untagged, [CARD_TAG_UNTAGGED_FILTER])).toBe(true);
  });
});

function makeCard(overrides: Partial<StudyCard>): StudyCard {
  return {
    id: "card",
    cardType: "life_expression",
    deckType: "output",
    direction: "native_to_target",
    sourceSentence: "문장",
    targetText: "Sentence.",
    frontText: "문장",
    highlightMappings: [],
    vocabularyItems: [],
    srs: createInitialSrs(new Date("2026-07-10T00:00:00.000Z")),
    ...overrides
  };
}
