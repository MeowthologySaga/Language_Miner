import { describe, expect, it } from "vitest";
import {
  createDailyRoutineRun,
  getCurrentRoutineStep,
  getDailyRoutineProgress,
  normalizeDailyRoutineRun
} from "./dailyRoutine";

describe("dailyRoutine", () => {
  it("creates a running routine with the first step active", () => {
    const run = createDailyRoutineRun("2026-06-10", "profile-a");

    expect(run.status).toBe("running");
    expect(run.currentStepId).toBe("review");
    expect(getCurrentRoutineStep(run)?.id).toBe("review");
    expect(getDailyRoutineProgress(run)).toEqual({
      completedCount: 0,
      skippedCount: 0,
      totalCount: 4,
      percent: 0
    });
  });

  it("rejects stored routines from another date or profile", () => {
    const run = createDailyRoutineRun("2026-06-09", "profile-a");

    expect(normalizeDailyRoutineRun(run, "2026-06-10", "profile-a")).toBeNull();
    expect(normalizeDailyRoutineRun(run, "2026-06-09", "profile-b")).toBeNull();
  });

  it("tracks skipped steps separately from completed progress", () => {
    const run = createDailyRoutineRun("2026-06-10", "profile-a");
    run.steps[0] = {
      ...run.steps[0],
      status: "skipped",
      completedAt: "2026-06-10T00:00:00.000Z"
    };

    expect(getDailyRoutineProgress(run)).toEqual({
      completedCount: 0,
      skippedCount: 1,
      totalCount: 4,
      percent: 0
    });
  });

  it("normalizes legacy paused routines back to running", () => {
    const run = createDailyRoutineRun("2026-06-10", "profile-a");
    run.status = "paused";

    const normalized = normalizeDailyRoutineRun(run, "2026-06-10", "profile-a");

    expect(normalized?.status).toBe("running");
  });

  it("drops retired listening preparation steps from stored routines", () => {
    const run = createDailyRoutineRun("2026-06-10", "profile-a");
    run.steps = [
      {
        id: "listening-prepare" as never,
        title: "듣기 준비",
        description: "이전 버전의 중복 듣기 단계",
        actionLabel: "듣기 큐 열기",
        route: "listeningLoop",
        estimatedMinutes: 3,
        status: "running",
        startedAt: "2026-06-10T00:00:00.000Z"
      },
      ...run.steps.map((step) => ({ ...step, status: "pending" as const }))
    ];

    const normalized = normalizeDailyRoutineRun(run, "2026-06-10", "profile-a");

    expect(normalized?.status).toBe("running");
    expect(normalized?.currentStepId).toBe("review");
    expect(normalized?.steps.map((step) => step.id)).toEqual([
      "review",
      "listening-loop",
      "writing-practice",
      "claim-rewards"
    ]);
  });
});
