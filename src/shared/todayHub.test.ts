import { describe, expect, it } from "vitest";
import { buildStudyActivityHeatmap, buildTodayHubSummary } from "./todayHub";
import type { LifeLog, StudyCard } from "./types";

const now = new Date("2026-06-12T09:00:00.000Z");

describe("todayHub", () => {
  it("summarizes review, life mining, and listening work for the active profile", () => {
    const summary = buildTodayHubSummary({
      cards: [
        makeCard("new-input", "input", {
          dueAt: "2026-06-12T08:00:00.000Z",
          reviewCount: 0
        }),
        makeCard("due-output", "output", {
          dueAt: "2026-06-11T08:00:00.000Z",
          reviewCount: 3
        }),
        makeCard("future", "input", {
          dueAt: "2026-06-13T08:00:00.000Z",
          reviewCount: 3
        }),
        makeCard("listening-today", "input-listening", {
          createdAt: "2026-06-12T07:00:00.000Z",
          dueAt: "2026-06-12T08:00:00.000Z",
          reviewCount: 0
        })
      ],
      lifeLogs: [
        makeLifeLog("pending-browser", "browser_extension"),
        makeLifeLog("pending-manual", "manual"),
        makeLifeLog("done-other-profile", "browser_extension", ["other-profile"]),
        makeLifeLog("done-active-profile", "manual", ["active-profile"])
      ],
      now,
      profileId: "active-profile"
    });

    expect(summary.review.totalDueCount).toBe(3);
    expect(summary.review.overdueCount).toBe(1);
    expect(summary.review.newCount).toBe(2);
    expect(summary.life.pendingCount).toBe(3);
    expect(summary.life.autoPendingCount).toBe(2);
    expect(summary.life.manualPendingCount).toBe(1);
    expect(summary.life.completedForProfileCount).toBe(1);
    expect(summary.listening.totalCardCount).toBe(1);
    expect(summary.listening.dueCount).toBe(1);
    expect(summary.listening.savedTodayCount).toBe(1);
  });

  it("builds a profile-aware study activity heatmap from stored events", () => {
    const heatmap = buildStudyActivityHeatmap({
      cards: [
        makeCard("created-in-range", "input", {
          createdAt: "2026-06-01T08:00:00.000Z",
          dueAt: "2026-06-12T08:00:00.000Z",
          lastReviewedAt: "2026-06-12T08:30:00.000Z",
          profileId: "active-profile",
          reviewCount: 1
        }),
        makeCard("legacy-profileless", "output", {
          createdAt: "2026-06-10T08:00:00.000Z",
          dueAt: "2026-06-12T08:00:00.000Z",
          reviewCount: 0
        }),
        makeCard("other-profile", "input", {
          createdAt: "2026-06-12T08:00:00.000Z",
          dueAt: "2026-06-12T08:00:00.000Z",
          profileId: "other-profile",
          reviewCount: 0
        })
      ],
      lifeLogs: [
        makeLifeLog("life-today", "manual", [], "2026-06-12T00:00:00.000Z"),
        makeLifeLog("life-out-of-range", "manual", [], "2026-05-01T00:00:00.000Z")
      ],
      now,
      profileId: "active-profile",
      weekCount: 2
    });

    const todayCell = heatmap.weeks
      .flatMap((week) => week.days)
      .find((day) => day.dateKey === "2026-06-12");
    const legacyCell = heatmap.weeks
      .flatMap((week) => week.days)
      .find((day) => day.dateKey === "2026-06-10");

    expect(heatmap.weeks).toHaveLength(2);
    expect(heatmap.totalCount).toBe(4);
    expect(heatmap.activeDayCount).toBe(3);
    expect(heatmap.maxCount).toBe(2);
    expect(heatmap.todayCount).toBe(2);
    expect(todayCell).toMatchObject({
      count: 2,
      isToday: true,
      level: 1
    });
    expect(legacyCell).toMatchObject({
      count: 1,
      level: 1
    });
  });
});

function makeCard(
  id: string,
  deckType: StudyCard["deckType"],
  options: {
    createdAt?: string;
    dueAt: string;
    lastReviewedAt?: string;
    profileId?: string;
    reviewCount: number;
  }
): StudyCard {
  return {
    id,
    profileId: options.profileId,
    cardType: "reading",
    deckType,
    direction: deckType === "output" ? "ko_to_en" : "en_to_ko",
    sourceSentence: "source",
    frontText: "front",
    highlightMappings: [],
    vocabularyItems: [],
    createdAt: options.createdAt ?? "2026-06-10T00:00:00.000Z",
    srs: {
      dueAt: options.dueAt,
      easeFactor: 2.5,
      intervalDays: options.reviewCount === 0 ? 0 : 1,
      lapseCount: 0,
      reviewCount: options.reviewCount,
      lastReviewedAt: options.lastReviewedAt
    }
  };
}

function makeLifeLog(
  id: string,
  sourceType: LifeLog["sourceType"],
  processedProfileIds: string[] = [],
  createdAt = "2026-06-12T00:00:00.000Z"
): LifeLog {
  return {
    id,
    text: id,
    sourceType,
    processed: false,
    createdAt,
    metadata: {
      processedProfileIds
    }
  };
}
