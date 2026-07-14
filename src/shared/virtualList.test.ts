import { describe, expect, it } from "vitest";
import { calculateVirtualListWindow } from "./virtualList";

describe("calculateVirtualListWindow", () => {
  it("renders only a bounded, overscanned window for a large list", () => {
    expect(
      calculateVirtualListWindow({
        itemCount: 10_000,
        rowHeight: 64,
        scrollTop: 64 * 500,
        viewportHeight: 640,
        overscan: 5
      })
    ).toEqual({
      startIndex: 495,
      endIndex: 515,
      offsetTop: 64 * 495,
      totalHeight: 64 * 10_000
    });
  });

  it("clamps invalid and end-of-list inputs", () => {
    expect(
      calculateVirtualListWindow({
        itemCount: 3,
        rowHeight: 50,
        scrollTop: 99_999,
        viewportHeight: 100,
        overscan: 2
      })
    ).toEqual({ startIndex: 1, endIndex: 3, offsetTop: 50, totalHeight: 150 });
  });
});
