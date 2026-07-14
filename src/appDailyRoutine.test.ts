import { describe, expect, it } from "vitest";
import {
  finishDailyRoutineStep,
  goToNextDailyRoutineStep,
  goToPreviousDailyRoutineStep,
  reopenSkippedDailyRoutineStep
} from "./appDailyRoutine";
import { createDailyRoutineRun } from "./shared/dailyRoutine";

describe("appDailyRoutine", () => {
  it("keeps skipped steps available after advancing to the next routine step", () => {
    const run = createDailyRoutineRun("2026-06-10", "profile-a");

    const skipped = finishDailyRoutineStep(run, "skipped");

    expect(skipped.status).toBe("running");
    expect(skipped.currentStepId).toBe("listening-loop");
    expect(skipped.steps.find((step) => step.id === "review")?.status).toBe("skipped");
  });

  it("reopens a skipped step and parks the current running step", () => {
    const run = createDailyRoutineRun("2026-06-10", "profile-a");
    const skipped = finishDailyRoutineStep(run, "skipped");

    const reopened = reopenSkippedDailyRoutineStep(skipped, "review");

    expect(reopened.status).toBe("running");
    expect(reopened.currentStepId).toBe("review");
    expect(reopened.steps.find((step) => step.id === "review")?.status).toBe("running");
    expect(reopened.steps.find((step) => step.id === "listening-loop")?.status).toBe("pending");
  });

  it("does not complete the routine while skipped steps remain", () => {
    let run = createDailyRoutineRun("2026-06-10", "profile-a");
    run = finishDailyRoutineStep(run, "skipped");
    run = finishDailyRoutineStep(run, "completed");
    run = finishDailyRoutineStep(run, "completed");
    run = finishDailyRoutineStep(run, "completed");

    expect(run.status).toBe("running");
    expect(run.currentStepId).toBe("review");
    expect(run.steps.find((step) => step.id === "review")?.status).toBe("skipped");

    const reopened = reopenSkippedDailyRoutineStep(run, "review");
    const completed = finishDailyRoutineStep(reopened, "completed");

    expect(completed.status).toBe("completed");
  });

  it("does not turn a skipped current step into completed without reopening it first", () => {
    let run = createDailyRoutineRun("2026-06-10", "profile-a");
    run = finishDailyRoutineStep(run, "skipped");
    run = finishDailyRoutineStep(run, "completed");
    run = finishDailyRoutineStep(run, "completed");
    run = finishDailyRoutineStep(run, "completed");

    const stillSkipped = finishDailyRoutineStep(run, "completed");

    expect(stillSkipped.status).toBe("running");
    expect(stillSkipped.currentStepId).toBe("review");
    expect(stillSkipped.steps.find((step) => step.id === "review")?.status).toBe("skipped");
  });

  it("moves back to the previous routine step without clearing completed progress", () => {
    let run = createDailyRoutineRun("2026-06-10", "profile-a");
    run = finishDailyRoutineStep(run, "completed");

    const previous = goToPreviousDailyRoutineStep(run);

    expect(previous.currentStepId).toBe("review");
    expect(previous.steps.find((step) => step.id === "review")?.status).toBe("completed");
    expect(previous.steps.find((step) => step.id === "review")?.completedAt).toBeDefined();
    expect(previous.steps.find((step) => step.id === "listening-loop")?.status).toBe("running");
    expect(previous.completedAt).toBeUndefined();
  });

  it("returns from a completed focused step to the next step without changing progress", () => {
    let run = createDailyRoutineRun("2026-06-10", "profile-a");
    run = finishDailyRoutineStep(run, "completed");
    run = goToPreviousDailyRoutineStep(run);

    const next = goToNextDailyRoutineStep(run);

    expect(next.currentStepId).toBe("listening-loop");
    expect(next.steps.find((step) => step.id === "review")?.status).toBe("completed");
    expect(next.steps.find((step) => step.id === "listening-loop")?.status).toBe("running");
  });
});
