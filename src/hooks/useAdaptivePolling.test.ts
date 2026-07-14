import { describe, expect, it } from "vitest";
import { normalizePollingInterval } from "./useAdaptivePolling";

describe("normalizePollingInterval", () => {
  it("prevents aggressive sub-second polling", () => {
    expect(normalizePollingInterval(300)).toBe(1000);
    expect(normalizePollingInterval(800)).toBe(1000);
  });

  it("keeps slower polling intervals", () => {
    expect(normalizePollingInterval(2000)).toBe(2000);
  });
});
