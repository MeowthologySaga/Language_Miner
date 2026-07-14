import { describe, expect, it } from "vitest";
import { resolveAppOnboardingCompletion } from "./appOnboardingCompletion";

describe("resolveAppOnboardingCompletion", () => {
  it("opens only when neither renderer nor host has a completion marker", () => {
    expect(resolveAppOnboardingCompletion(false, false)).toEqual({
      completed: false,
      shouldOpen: true,
      shouldBackfillHost: false
    });
    expect(resolveAppOnboardingCompletion(false, null).shouldOpen).toBe(true);
  });

  it("keeps onboarding closed when either durable marker survives", () => {
    expect(resolveAppOnboardingCompletion(true, false)).toEqual({
      completed: true,
      shouldOpen: false,
      shouldBackfillHost: true
    });
    expect(resolveAppOnboardingCompletion(false, true)).toEqual({
      completed: true,
      shouldOpen: false,
      shouldBackfillHost: false
    });
    expect(resolveAppOnboardingCompletion(true, null).shouldOpen).toBe(false);
  });
});
