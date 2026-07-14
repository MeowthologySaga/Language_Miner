import { describe, expect, it } from "vitest";
import {
  buildReviewDeckStats,
  createEmptyReviewDailyProgress,
  filterReviewQueueByDeckAndLimits,
  getReviewBucket,
  normalizeReviewSettings
} from "./reviewStats";
import type { CardDeckType, StudyCard } from "./types";

describe("reviewStats", () => {
  const now = new Date("2026-06-09T12:00:00.000Z");

  it("classifies new, learning, due review, and future review cards", () => {
    expect(getReviewBucket(makeCard({ id: "new", reviewCount: 0 }), now)).toBe("new");
    expect(getReviewBucket(makeCard({ id: "learning", reviewCount: 1, intervalDays: 0 }), now)).toBe(
      "learning"
    );
    expect(
      getReviewBucket(
        makeCard({
          id: "due",
          reviewCount: 2,
          intervalDays: 3,
          dueAt: "2026-06-09T11:00:00.000Z"
        }),
        now
      )
    ).toBe("review");
    expect(
      getReviewBucket(
        makeCard({
          id: "future",
          reviewCount: 2,
          intervalDays: 3,
          dueAt: "2026-06-10T00:00:00.000Z"
        }),
        now
      )
    ).toBe("future");
  });

  it("builds deck dashboard stats with overdue and done-today counts", () => {
    const cards = [
      makeCard({ id: "input-new", deckType: "input", reviewCount: 0 }),
      makeCard({ id: "input-learning", deckType: "input", reviewCount: 1, intervalDays: 0 }),
      makeCard({
        id: "input-review",
        deckType: "input",
        reviewCount: 2,
        intervalDays: 3,
        dueAt: "2026-06-09T09:00:00.000Z",
        lastReviewedAt: "2026-06-09T10:00:00.000Z"
      }),
      makeCard({
        id: "input-overdue",
        deckType: "input",
        reviewCount: 2,
        intervalDays: 3,
        dueAt: "2026-06-08T09:00:00.000Z"
      }),
      makeCard({ id: "listening-new", deckType: "input-listening", reviewCount: 0 }),
      makeCard({ id: "output-new", deckType: "output", reviewCount: 0 })
    ];

    const stats = buildReviewDeckStats(cards, now);

    expect(stats.input).toEqual({
      newCount: 1,
      learningCount: 1,
      reviewCount: 2,
      overdueCount: 1,
      totalCount: 4,
      doneTodayCount: 1
    });
    expect(stats["input-listening"].newCount).toBe(1);
    expect(stats["input-listening"].totalCount).toBe(1);
    expect(stats.output.newCount).toBe(1);
    expect(stats.output.totalCount).toBe(1);
  });

  it("filters the review queue by selected deck and daily limits", () => {
    const settings = normalizeReviewSettings({
      input: {
        newLimit: 1,
        reviewLimit: 1
      },
      output: {
        newLimit: 10,
        reviewLimit: 10
      }
    });
    const cards = [
      makeCard({ id: "input-new-1", deckType: "input", reviewCount: 0 }),
      makeCard({ id: "input-new-2", deckType: "input", reviewCount: 0 }),
      makeCard({ id: "input-review-1", deckType: "input", reviewCount: 2, intervalDays: 2 }),
      makeCard({ id: "input-review-2", deckType: "input", reviewCount: 2, intervalDays: 2 }),
      makeCard({ id: "output-new", deckType: "output", reviewCount: 0 })
    ];

    const queue = filterReviewQueueByDeckAndLimits(
      cards,
      "input",
      settings,
      now,
      createEmptyReviewDailyProgress()
    );

    expect(queue.map((card) => card.id)).toEqual(["input-new-1", "input-review-1"]);
  });

  it("subtracts same-day progress from available limits", () => {
    const settings = normalizeReviewSettings({
      input: {
        newLimit: 1,
        reviewLimit: 20
      }
    });
    const progress = createEmptyReviewDailyProgress();
    progress.input.newDone = 1;
    const cards = [
      makeCard({ id: "input-new", deckType: "input", reviewCount: 0 }),
      makeCard({ id: "input-review", deckType: "input", reviewCount: 2, intervalDays: 2 })
    ];

    const queue = filterReviewQueueByDeckAndLimits(cards, "input", settings, now, progress);

    expect(queue.map((card) => card.id)).toEqual(["input-review"]);
  });
});

function makeCard(input: {
  id: string;
  deckType?: CardDeckType;
  reviewCount?: number;
  intervalDays?: number;
  dueAt?: string;
  lastReviewedAt?: string;
}): StudyCard {
  return {
    id: input.id,
    cardType: input.deckType === "output" ? "life_expression" : "reading",
    deckType: input.deckType ?? "input",
    direction: input.deckType === "output" ? "ko_to_en" : "en_to_ko",
    sourceSentence: "source",
    targetText: "target",
    frontText: "front",
    highlightMappings: [],
    vocabularyItems: [],
    srs: {
      dueAt: input.dueAt ?? "2026-06-09T00:00:00.000Z",
      intervalDays: input.intervalDays ?? 0,
      easeFactor: 2.5,
      reviewCount: input.reviewCount ?? 0,
      lapseCount: 0,
      lastReviewedAt: input.lastReviewedAt
    }
  };
}
