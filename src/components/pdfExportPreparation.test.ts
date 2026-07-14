import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getExportPageImageScale,
  getTranslationSegmentsForExportMode,
  prepareBilingualExportPage,
  withTimeout
} from "./pdfExportPreparation";
import type { PageTranslationState } from "./pdfSelectionReaderUtils";
import type { PdfTextSegment } from "../shared/types";

function createSegment(id: string, text: string): PdfTextSegment {
  return {
    id,
    pageNumber: 1,
    index: Number(id.replace(/\D/g, "")) || 0,
    text,
    sourceBounds: {
      left: 0.1,
      top: 0.1,
      width: 0.7,
      height: 0.04
    }
  };
}

const proseSegment = createSegment(
  "segment-1",
  "This paragraph should be translated into the target language."
);
const tableSegment = createSegment(
  "segment-2",
  "Table 2 Method Acc BLEU F1 Params Runtime Baseline 10 20 30 40 50 Ours 11 21 31 41 51"
);

describe("pdfExportPreparation", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("scales export page images within the configured bounds", () => {
    expect(getExportPageImageScale(0)).toBe(1.8);
    expect(getExportPageImageScale(400)).toBe(2.6);
    expect(getExportPageImageScale(1000)).toBe(1.6);
    expect(getExportPageImageScale(2000)).toBe(1.6);
  });

  it("rejects timed out page renders and calls the timeout cleanup", async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const promise = withTimeout(new Promise(() => undefined), 100, onTimeout);
    const assertion = expect(promise).rejects.toThrow("PDF page image render timed out.");

    await vi.advanceTimersByTimeAsync(100);

    await assertion;
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("filters paper-preserved segments from translation work", () => {
    expect(getTranslationSegmentsForExportMode([proseSegment, tableSegment], "reading")).toEqual([
      proseSegment,
      tableSegment
    ]);
    expect(getTranslationSegmentsForExportMode([proseSegment, tableSegment], "paper")).toEqual([
      proseSegment
    ]);
  });

  it("prepares export pages with translated prose and blank preserved paper segments", async () => {
    const translationsByPage: Record<number, PageTranslationState> = {
      1: {
        segments: [proseSegment],
        translations: [
          {
            id: proseSegment.id,
            translationKo: "번역된 문단",
            cacheStatus: "miss"
          }
        ],
        cacheStatus: "miss"
      }
    };

    const prepared = await prepareBilingualExportPage({
      pageNumber: 1,
      translationsByPage,
      exportMode: "paper",
      readPageData: async () => ({ segments: [proseSegment, tableSegment] }),
      renderPageImage: async () => ({
        dataUrl: "data:image/png;base64,test",
        width: 612,
        height: 792
      })
    });

    expect(prepared.sourceSegmentCount).toBe(2);
    expect(prepared.translatedSegmentCount).toBe(2);
    expect(prepared.page).toMatchObject({
      pageNumber: 1,
      sourcePageImageDataUrl: "data:image/png;base64,test",
      sourcePageWidth: 612,
      sourcePageHeight: 792
    });
    expect(prepared.page.segments).toEqual([
      expect.objectContaining({
        id: proseSegment.id,
        sourceText: proseSegment.text,
        translationText: "번역된 문단"
      }),
      expect.objectContaining({
        id: tableSegment.id,
        sourceText: tableSegment.text,
        translationText: ""
      })
    ]);
  });
});
