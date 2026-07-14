import { describe, expect, it } from "vitest";
import { parseAppSmokeViewport } from "./appSmokeViewport";

describe("parseAppSmokeViewport", () => {
  it("accepts the three release viewport targets", () => {
    expect(parseAppSmokeViewport("940x680")).toEqual({ width: 940, height: 680 });
    expect(parseAppSmokeViewport("1240x820")).toEqual({ width: 1240, height: 820 });
    expect(parseAppSmokeViewport("1920x1080")).toEqual({ width: 1920, height: 1080 });
  });

  it("rejects malformed, undersized, and unbounded values", () => {
    expect(parseAppSmokeViewport(undefined)).toBeNull();
    expect(parseAppSmokeViewport("900x600")).toBeNull();
    expect(parseAppSmokeViewport("99999x99999")).toBeNull();
    expect(parseAppSmokeViewport("wide")).toBeNull();
  });
});
