import { describe, expect, it } from "vitest";
import {
  MAX_READER_SCALE,
  MIN_READER_SCALE,
  clampScale,
  findSentenceTermMatches,
  getPageNavigationDelta,
  isEditableTarget,
  isPageNavigationShortcut,
  matchesShortcut,
  normalizeWheelDelta,
  pdfTextItemsToString,
  replaceSourceSentenceInContext
} from "./bilingualArtifactReaderUtils";

function keyboardEvent(input: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    altKey: false,
    ctrlKey: false,
    key: "",
    metaKey: false,
    shiftKey: false,
    ...input
  } as KeyboardEvent;
}

describe("bilingual artifact reader utils", () => {
  it("normalizes PDF text items without leaking invalid entries", () => {
    expect(
      pdfTextItemsToString([{ str: "Hello" }, { str: "  world" }, { value: "ignored" }, null])
    ).toBe("Hello world");
  });

  it("replaces edited source sentences inside the normalized context", () => {
    expect(
      replaceSourceSentenceInContext(
        "Before. The old sentence. After.",
        "The old sentence.",
        "The edited sentence.",
        "Before.",
        "After."
      )
    ).toBe("Before. The edited sentence. After.");

    expect(replaceSourceSentenceInContext("", "old", "edited", "before", "after")).toBe("edited");
  });

  it("matches terms case-insensitively while skipping overlapping matches", () => {
    const matches = findSentenceTermMatches("The quick quickness is quick.", [
      "quickness",
      "quick"
    ]);

    expect(matches.map((match) => [match.start, match.end])).toEqual([
      [4, 9],
      [10, 19],
      [23, 28]
    ]);
  });

  it("clamps scale and normalizes wheel deltas", () => {
    expect(clampScale(0)).toBe(MIN_READER_SCALE);
    expect(clampScale(99)).toBe(MAX_READER_SCALE);
    expect(normalizeWheelDelta(2, 1)).toBe(64);
    expect(normalizeWheelDelta(2, 2)).toBe(1200);
    expect(normalizeWheelDelta(2, 0)).toBe(2);
  });

  it("recognizes page and capture shortcuts without editable targets", () => {
    const arrowLeft = keyboardEvent({ key: "ArrowLeft" });
    const ctrlQ = keyboardEvent({ ctrlKey: true, key: "q" });

    expect(isPageNavigationShortcut(arrowLeft)).toBe(true);
    expect(getPageNavigationDelta(arrowLeft)).toBe(-1);
    expect(matchesShortcut(ctrlQ, "Ctrl+Q")).toBe(true);
    expect(isEditableTarget({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(true);
  });
});
