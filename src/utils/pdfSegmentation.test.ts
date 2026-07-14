import { describe, expect, it } from "vitest";
import {
  attachSegmentBounds,
  buildPdfPageTextFromLayoutItems,
  segmentPdfPageText
} from "./pdfSegmentation";

describe("PDF page segmentation", () => {
  it("creates stable page segment ids", () => {
    const first = segmentPdfPageText({
      pageNumber: 12,
      text: "A short paragraph. Another short paragraph."
    });
    const second = segmentPdfPageText({
      pageNumber: 12,
      text: "A short paragraph. Another short paragraph."
    });

    expect(first).toEqual(second);
    expect(first[0].id).toMatch(/^p12-s001-[a-f0-9]{6}$/);
  });

  it("splits long text without dropping content", () => {
    const text = [
      "First sentence has enough words to stand alone.",
      "Second sentence has enough words to stand alone.",
      "Third sentence has enough words to stand alone."
    ].join(" ");
    const segments = segmentPdfPageText({
      pageNumber: 1,
      text,
      maxSegmentLength: 70
    });

    expect(segments.length).toBeGreaterThan(1);
    expect(segments.map((segment) => segment.text).join(" ")).toBe(text);
  });

  it("removes PDF line hyphenation", () => {
    const segments = segmentPdfPageText({
      pageNumber: 1,
      text: "A hyphen-\nated word appears."
    });

    expect(segments[0].text).toContain("hyphenated");
  });

  it("does not merge separate paragraphs into one segment", () => {
    const segments = segmentPdfPageText({
      pageNumber: 1,
      text: "First paragraph.\n\nSecond paragraph."
    });

    expect(segments.map((segment) => segment.text)).toEqual([
      "First paragraph.",
      "Second paragraph."
    ]);
  });

  it("attaches merged layout bounds to matching segments", () => {
    const pageText = "First sentence. Second sentence.";
    const segments = segmentPdfPageText({
      pageNumber: 1,
      text: pageText,
      maxSegmentLength: 20
    });
    const boundedSegments = attachSegmentBounds({
      pageText,
      segments,
      layoutItems: [
        {
          startOffset: 0,
          endOffset: 15,
          bounds: { left: 0.1, top: 0.2, width: 0.2, height: 0.03 }
        },
        {
          startOffset: 16,
          endOffset: 32,
          bounds: { left: 0.1, top: 0.25, width: 0.25, height: 0.03 }
        }
      ]
    });

    expect(boundedSegments[0].sourceBounds).toEqual({
      left: 0.1,
      top: 0.2,
      width: 0.2,
      height: 0.03
    });
    expect(boundedSegments[1].sourceBounds).toEqual({
      left: 0.1,
      top: 0.25,
      width: 0.25,
      height: 0.03
    });
  });

  it("keeps line-level bounds for multi-line segment highlights", () => {
    const pageText = "First line continues";
    const segments = segmentPdfPageText({
      pageNumber: 1,
      text: pageText,
      maxSegmentLength: 100
    });
    const boundedSegments = attachSegmentBounds({
      pageText,
      segments,
      layoutItems: [
        {
          startOffset: 0,
          endOffset: 5,
          bounds: { left: 0.1, top: 0.1, width: 0.05, height: 0.02 }
        },
        {
          startOffset: 6,
          endOffset: 10,
          bounds: { left: 0.16, top: 0.1, width: 0.04, height: 0.02 }
        },
        {
          startOffset: 11,
          endOffset: 20,
          bounds: { left: 0.1, top: 0.14, width: 0.1, height: 0.02 }
        }
      ]
    });

    expect(boundedSegments[0].sourceBounds).toEqual({
      left: 0.1,
      top: 0.1,
      width: 0.1,
      height: 0.06
    });
    expect(boundedSegments[0].sourceLineBounds).toEqual([
      { left: 0.1, top: 0.1, width: 0.1, height: 0.02 },
      { left: 0.1, top: 0.14, width: 0.1, height: 0.02 }
    ]);
  });

  it("clips segment bounds inside a shared PDF text item by character offset", () => {
    const pageText = "abcdefghij klmnopqrst";
    const boundedSegments = attachSegmentBounds({
      pageText,
      segments: [
        {
          id: "p1-s001-left",
          pageNumber: 1,
          index: 0,
          text: "abcdefghij"
        },
        {
          id: "p1-s002-right",
          pageNumber: 1,
          index: 1,
          text: "klmnopqrst"
        }
      ],
      layoutItems: [
        {
          startOffset: 0,
          endOffset: pageText.length,
          bounds: { left: 0.1, top: 0.2, width: 0.42, height: 0.02 }
        }
      ]
    });

    expect(boundedSegments[0].sourceLineBounds).toEqual([
      { left: 0.1, top: 0.2, width: 0.2, height: 0.02 }
    ]);
    expect(boundedSegments[1].sourceLineBounds).toEqual([
      { left: 0.32, top: 0.2, width: 0.2, height: 0.02 }
    ]);
  });

  it("builds page text from positioned PDF text items with paragraph breaks", () => {
    const pageText = buildPdfPageTextFromLayoutItems([
      {
        text: "First",
        bounds: { left: 0.1, top: 0.1, width: 0.05, height: 0.02 }
      },
      {
        text: "line",
        bounds: { left: 0.16, top: 0.1, width: 0.04, height: 0.02 }
      },
      {
        text: "continues",
        bounds: { left: 0.1, top: 0.122, width: 0.08, height: 0.02 }
      },
      {
        text: "Next paragraph",
        bounds: { left: 0.1, top: 0.2, width: 0.18, height: 0.02 }
      }
    ]);

    expect(pageText.text).toBe("First line continues\n\nNext paragraph");
    expect(pageText.layoutItems).toHaveLength(4);
    expect(pageText.layoutItems[3].startOffset).toBe("First line continues\n\n".length);
  });

  it("treats an indented next line after sentence end as a new paragraph", () => {
    const pageText = buildPdfPageTextFromLayoutItems([
      {
        text: "This paragraph",
        bounds: { left: 0.1, top: 0.1, width: 0.18, height: 0.02 }
      },
      {
        text: "continues.",
        bounds: { left: 0.1, top: 0.122, width: 0.11, height: 0.02 }
      },
      {
        text: "Runes begin another paragraph.",
        bounds: { left: 0.13, top: 0.144, width: 0.3, height: 0.02 }
      }
    ]);
    const segments = segmentPdfPageText({
      pageNumber: 1,
      text: pageText.text
    });

    expect(pageText.text).toBe("This paragraph continues.\n\nRunes begin another paragraph.");
    expect(segments.map((segment) => segment.text)).toEqual([
      "This paragraph continues.",
      "Runes begin another paragraph."
    ]);
  });

  it("dehyphenates wrapped PDF text items while keeping layout offsets usable", () => {
    const pageText = buildPdfPageTextFromLayoutItems([
      {
        text: "hyphen-",
        bounds: { left: 0.1, top: 0.1, width: 0.08, height: 0.02 }
      },
      {
        text: "ated",
        bounds: { left: 0.1, top: 0.122, width: 0.05, height: 0.02 }
      }
    ]);

    expect(pageText.text).toBe("hyphenated");
    expect(pageText.layoutItems[0].endOffset).toBe("hyphen".length);
    expect(pageText.layoutItems[1].startOffset).toBe("hyphen".length);
  });
});
