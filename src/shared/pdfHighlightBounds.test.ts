import { describe, expect, it } from "vitest";
import { buildSafePdfPageHighlights } from "./pdfHighlightBounds";

describe("PDF highlight bounds", () => {
  it("keeps highlights inside the page", () => {
    const highlights = buildSafePdfPageHighlights([
      {
        id: "p1-s001",
        sourceLineBounds: [
          { left: 0.12, top: 0.97, width: 0.78, height: 0.08 },
          { left: -0.1, top: 0.2, width: 0.3, height: 0.02 }
        ]
      }
    ]);

    expect(highlights.length).toBeGreaterThan(0);
    highlights.forEach((highlight) => {
      expect(highlight.bounds.left).toBeGreaterThanOrEqual(0);
      expect(highlight.bounds.top).toBeGreaterThanOrEqual(0);
      expect(highlight.bounds.left + highlight.bounds.width).toBeLessThanOrEqual(1);
      expect(highlight.bounds.top + highlight.bounds.height).toBeLessThanOrEqual(1);
    });
  });

  it("merges same-row overlaps and prevents vertical overlaps", () => {
    const highlights = buildSafePdfPageHighlights([
      {
        id: "p1-s001",
        sourceLineBounds: [
          { left: 0.1, top: 0.2, width: 0.34, height: 0.04 },
          { left: 0.28, top: 0.203, width: 0.32, height: 0.04 },
          { left: 0.1, top: 0.225, width: 0.48, height: 0.04 }
        ]
      }
    ]);

    expect(highlights.length).toBeGreaterThan(0);
    for (let leftIndex = 0; leftIndex < highlights.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < highlights.length; rightIndex += 1) {
        expect(rectsOverlap(highlights[leftIndex].bounds, highlights[rightIndex].bounds)).toBe(false);
      }
    }
  });

  it("lifts text-layer boxes so highlights sit over the glyph row", () => {
    const highlights = buildSafePdfPageHighlights([
      {
        id: "p1-s001",
        sourceLineBounds: [{ left: 0.1, top: 0.2, width: 0.48, height: 0.02 }]
      }
    ]);

    expect(highlights).toHaveLength(1);
    expect(highlights[0].bounds.top).toBeLessThan(0.2);
    expect(highlights[0].bounds.top).toBeGreaterThanOrEqual(0);
  });

  it("packs near-bottom rows upward without leaving the page", () => {
    const highlights = buildSafePdfPageHighlights([
      {
        id: "p1-s001",
        sourceLineBounds: [
          { left: 0.1, top: 0.93, width: 0.52, height: 0.025 },
          { left: 0.1, top: 0.955, width: 0.52, height: 0.025 },
          { left: 0.1, top: 0.98, width: 0.52, height: 0.025 }
        ]
      }
    ]);

    expect(highlights.length).toBeGreaterThan(0);
    expect(highlights[highlights.length - 1].bounds.top).toBeLessThan(0.98);
    highlights.forEach((highlight) => {
      expect(highlight.bounds.top + highlight.bounds.height).toBeLessThanOrEqual(1);
    });
    for (let leftIndex = 0; leftIndex < highlights.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < highlights.length; rightIndex += 1) {
        expect(rectsOverlap(highlights[leftIndex].bounds, highlights[rightIndex].bounds)).toBe(false);
      }
    }
  });
});

function rectsOverlap(
  left: { left: number; top: number; width: number; height: number },
  right: { left: number; top: number; width: number; height: number }
) {
  const horizontalOverlap =
    Math.min(left.left + left.width, right.left + right.width) - Math.max(left.left, right.left);
  const verticalOverlap =
    Math.min(left.top + left.height, right.top + right.height) - Math.max(left.top, right.top);

  return horizontalOverlap > 0 && verticalOverlap > 0;
}
