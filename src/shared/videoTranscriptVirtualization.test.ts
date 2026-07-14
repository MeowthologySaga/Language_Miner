import { describe, expect, it } from "vitest";
import { calculateVirtualListWindow } from "./virtualList";
import {
  getVideoTranscriptKeyboardIndex,
  getVideoTranscriptScrollTopForIndex,
  VIDEO_TRANSCRIPT_OVERSCAN,
  VIDEO_TRANSCRIPT_TIMELINE_ROW_HEIGHT
} from "./videoTranscriptVirtualization";

describe("video transcript virtualization", () => {
  it("keeps a two-hour transcript window bounded while including the active cue", () => {
    const itemCount = 7_200;
    const activeIndex = 5_432;
    const viewportHeight = 656;
    const scrollTop = getVideoTranscriptScrollTopForIndex({
      index: activeIndex,
      itemCount,
      rowHeight: VIDEO_TRANSCRIPT_TIMELINE_ROW_HEIGHT,
      scrollTop: 0,
      viewportHeight
    });
    const window = calculateVirtualListWindow({
      itemCount,
      rowHeight: VIDEO_TRANSCRIPT_TIMELINE_ROW_HEIGHT,
      scrollTop,
      viewportHeight,
      overscan: VIDEO_TRANSCRIPT_OVERSCAN
    });

    expect(window.startIndex).toBeLessThanOrEqual(activeIndex);
    expect(window.endIndex).toBeGreaterThan(activeIndex);
    expect(window.endIndex - window.startIndex).toBeLessThanOrEqual(
      Math.ceil(viewportHeight / VIDEO_TRANSCRIPT_TIMELINE_ROW_HEIGHT) +
        VIDEO_TRANSCRIPT_OVERSCAN * 2
    );
    expect(window.totalHeight).toBe(itemCount * VIDEO_TRANSCRIPT_TIMELINE_ROW_HEIGHT);
  });

  it("does not move the list when the active cue is already visible", () => {
    expect(
      getVideoTranscriptScrollTopForIndex({
        index: 12,
        itemCount: 500,
        rowHeight: 80,
        scrollTop: 800,
        viewportHeight: 400
      })
    ).toBe(800);
  });

  it("supports bounded arrow, page, home, and end navigation", () => {
    const input = { currentIndex: 50, itemCount: 2_000, pageSize: 8 };
    expect(getVideoTranscriptKeyboardIndex({ ...input, key: "ArrowUp" })).toBe(49);
    expect(getVideoTranscriptKeyboardIndex({ ...input, key: "ArrowDown" })).toBe(51);
    expect(getVideoTranscriptKeyboardIndex({ ...input, key: "ArrowLeft" })).toBe(49);
    expect(getVideoTranscriptKeyboardIndex({ ...input, key: "d" })).toBe(51);
    expect(getVideoTranscriptKeyboardIndex({ ...input, key: "PageUp" })).toBe(42);
    expect(getVideoTranscriptKeyboardIndex({ ...input, key: "PageDown" })).toBe(58);
    expect(getVideoTranscriptKeyboardIndex({ ...input, key: "Home" })).toBe(0);
    expect(getVideoTranscriptKeyboardIndex({ ...input, key: "End" })).toBe(1_999);
    expect(getVideoTranscriptKeyboardIndex({ ...input, key: "Enter" })).toBeNull();
    expect(
      getVideoTranscriptKeyboardIndex({
        key: "ArrowDown",
        currentIndex: 0,
        itemCount: -10,
        pageSize: 8
      })
    ).toBeNull();
  });
});
