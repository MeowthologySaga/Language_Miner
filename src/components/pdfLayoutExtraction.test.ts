import { describe, expect, it } from "vitest";
import type { PdfTextSegment } from "../shared/types";
import {
  buildTransformLayoutItems,
  clampPageRatio,
  getDebugHighlightBounds,
  getDebugSegmentHighlightBounds,
  getSegmentHighlightStyle,
  getTextItemBounds,
  getTextItemTop,
  getTextItemVisualHeight,
  isPdfTextContentItem,
  pdfLayoutExtractionVersion
} from "./pdfLayoutExtraction";

describe("pdfLayoutExtraction", () => {
  it("pads and clamps debug highlight bounds inside the page", () => {
    expect(clampPageRatio(-0.5)).toBe(0);
    expect(clampPageRatio(1.5)).toBe(1);

    const bounds = getDebugHighlightBounds({
      left: 0,
      top: 0.1,
      width: 0.2,
      height: 0.02
    });

    expect(bounds.left).toBe(0);
    expect(bounds.top).toBeLessThan(0.1);
    expect(bounds.width).toBeGreaterThan(0.2);
    expect(bounds.height).toBeGreaterThan(0.02);
  });

  it("uses line bounds before source bounds for segment highlights", () => {
    const segment = {
      id: "s1",
      index: 0,
      pageNumber: 1,
      text: "Text",
      sourceBounds: { left: 0.4, top: 0.4, width: 0.1, height: 0.02 },
      sourceLineBounds: [
        { left: 0.1, top: 0.2, width: 0.3, height: 0.03 },
        { left: 0.1, top: 0.24, width: 0.2, height: 0.03 }
      ]
    } satisfies PdfTextSegment;

    const highlights = getDebugSegmentHighlightBounds(segment);

    expect(highlights).toHaveLength(2);
    expect(highlights[0].left).toBeLessThan(0.1);
    expect(highlights[1].top).toBeLessThan(0.24);
  });

  it("normalizes transform text items into page ratios", () => {
    const item = {
      str: "  Hello   world  ",
      transform: [12, 0, 0, 10, 20, 80],
      width: 60,
      height: 10,
      fontName: "f1"
    };
    const viewport = { width: 200, height: 100, transform: [1, 0, 0, 1, 0, 0] };

    expect(isPdfTextContentItem(item)).toBe(true);
    expect(getTextItemBounds(item, viewport, { ascent: 0.8, descent: -0.2 })).toEqual({
      left: 0.1,
      top: 0.72,
      width: 0.3,
      height: 0.1
    });
    expect(
      buildTransformLayoutItems({ items: [item, { str: "", transform: [] }], styles: { f1: {} } }, viewport)
    ).toEqual([
      {
        text: "Hello world",
        bounds: expect.objectContaining({ left: 0.1, width: 0.3 })
      }
    ]);
  });

  it("keeps text metrics and highlight colors stable", () => {
    expect(getTextItemTop(100, 20, 16, { vertical: true })).toBe(84);
    expect(getTextItemTop(100, 20, 16, { ascent: 0.75 })).toBe(85);
    expect(getTextItemVisualHeight(20, { ascent: 0.9, descent: -0.2 })).toBe(22);
    expect(getTextItemVisualHeight(20, { ascent: 2, descent: -2 })).toBe(25);
    expect(getSegmentHighlightStyle(0)).toEqual({
      "--pdf-segment-color": "236 72 153",
      "--pdf-segment-fill": "236 72 153"
    });
    expect(pdfLayoutExtractionVersion).toBe("transform-bounds-v1");
  });
});
