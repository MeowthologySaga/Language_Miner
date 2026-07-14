import { describe, expect, it } from "vitest";
import {
  createInitialSrs,
  getNextReviewIntervalLabel,
  scheduleCardReview
} from "./srs";

describe("srs", () => {
  const now = new Date("2026-06-09T00:00:00.000Z");

  it("creates new cards due immediately", () => {
    const srs = createInitialSrs(now);

    expect(srs.dueAt).toBe(now.toISOString());
    expect(srs.intervalDays).toBe(0);
    expect(srs.easeFactor).toBe(2.5);
    expect(srs.reviewCount).toBe(0);
  });

  it("uses learning steps for new cards", () => {
    const initial = createInitialSrs(now);

    expect(scheduleCardReview(initial, "again", now).dueAt).toBe(
      "2026-06-09T00:01:00.000Z"
    );
    expect(scheduleCardReview(initial, "hard", now).dueAt).toBe(
      "2026-06-09T00:06:00.000Z"
    );
    expect(scheduleCardReview(initial, "good", now).intervalDays).toBe(1);
    expect(scheduleCardReview(initial, "easy", now).intervalDays).toBe(4);
  });

  it("expands graduated intervals with ease factor", () => {
    const graduated = {
      ...createInitialSrs(now),
      intervalDays: 4,
      easeFactor: 2.5,
      reviewCount: 3
    };

    const again = scheduleCardReview(graduated, "again", now);
    const hard = scheduleCardReview(graduated, "hard", now);
    const good = scheduleCardReview(graduated, "good", now);
    const easy = scheduleCardReview(graduated, "easy", now);

    expect(again.intervalDays).toBe(0);
    expect(again.lapseCount).toBe(1);
    expect(hard.intervalDays).toBe(5);
    expect(hard.easeFactor).toBe(2.35);
    expect(good.intervalDays).toBe(10);
    expect(easy.intervalDays).toBe(13);
    expect(easy.easeFactor).toBe(2.65);
  });

  it("formats next review labels for buttons", () => {
    const card = { srs: createInitialSrs(now) };

    expect(getNextReviewIntervalLabel(card, "again", now)).toBe("1분");
    expect(getNextReviewIntervalLabel(card, "hard", now)).toBe("6분");
    expect(getNextReviewIntervalLabel(card, "good", now)).toBe("1일");
    expect(getNextReviewIntervalLabel(card, "easy", now)).toBe("4일");
  });
});
