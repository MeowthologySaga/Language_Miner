import { describe, expect, it } from "vitest";
import type { TranslationUsageEstimate } from "../shared/translationUsage";
import type {
  BilingualExportHistoryRecord,
  PdfSegmentTranslation,
  PdfTextSegment
} from "../shared/types";
import type { PageTranslationState } from "./pdfSelectionReaderUtils";
import {
  getFailedPageNumbers,
  getPdfReaderWorkflowState,
  getUntranslatedPageNumbers,
  hasCompletePageTranslation
} from "./pdfReaderWorkflowState";

function makeSegment(id: string, index: number): PdfTextSegment {
  return {
    id,
    index,
    pageNumber: 1,
    text: `Segment ${index}`
  };
}

function makeTranslation(id: string): PdfSegmentTranslation {
  return {
    id,
    translationKo: `Translation ${id}`,
    cacheStatus: "miss"
  };
}

function makePageState(ids: string[], translatedIds = ids): PageTranslationState {
  return {
    segments: ids.map((id, index) => makeSegment(id, index)),
    translations: translatedIds.map(makeTranslation),
    cacheStatus: translatedIds.length === ids.length ? "miss" : "partial"
  };
}

function makeExportRecord(): BilingualExportHistoryRecord {
  return {
    id: "export-1",
    title: "Lesson",
    filePath: "C:/exports/lesson.pdf",
    fileType: "pdf",
    pageRange: "1-3",
    pageCount: 3,
    segmentCount: 12,
    providerLabel: "Gemini",
    sourceLanguageLabel: "English",
    targetLanguageLabel: "Korean",
    createdAt: "2026-06-25T00:00:00.000Z"
  };
}

function makeUsageEstimate(
  overrides: Partial<TranslationUsageEstimate> = {}
): TranslationUsageEstimate {
  return {
    providerName: "gemini",
    model: "gemini-2.5-flash-lite",
    sourceLang: "en",
    targetLang: "ko",
    textCount: 1,
    totalCharacters: 100,
    billableCharacters: 100,
    cacheHitCount: 0,
    cacheMissCount: 1,
    cacheSavingsPercent: 0,
    requestCount: 1,
    inputTokens: { min: 10, max: 20 },
    outputTokens: { min: 10, max: 20 },
    totalTokens: { min: 20, max: 40 },
    estimatedCostKrw: { min: 0, max: 0 },
    dailyLimitUsagePercent: { min: 0, max: 0 },
    monthlyLimitUsagePercent: { min: 0, max: 0 },
    freeTier: false,
    localOnly: false,
    ...overrides
  };
}

describe("pdfReaderWorkflowState", () => {
  it("returns failed page numbers in page order", () => {
    expect(
      getFailedPageNumbers({
        12: {
          pageNumber: 12,
          message: "failed",
          segmentCount: 1,
          updatedAt: "now"
        },
        3: {
          pageNumber: 3,
          message: "failed",
          segmentCount: 1,
          updatedAt: "now"
        }
      })
    ).toEqual([3, 12]);
  });

  it("finds pages that are missing translations", () => {
    expect(
      getUntranslatedPageNumbers(4, {
        1: makePageState(["a"]),
        2: makePageState(["b", "c"], ["b"]),
        4: makePageState(["d"])
      })
    ).toEqual([2, 3]);
  });

  it("checks cached page translation coverage by segment order", () => {
    const segments = [makeSegment("a", 0), makeSegment("b", 1)];
    expect(hasCompletePageTranslation(makePageState(["a", "b"]), segments, false)).toBe(true);
    expect(hasCompletePageTranslation(makePageState(["b", "a"]), segments, false)).toBe(false);
    expect(hasCompletePageTranslation(makePageState(["a", "b"]), segments, true)).toBe(false);
  });

  it("derives maker progress, keepalive, and limit blocks", () => {
    const state = getPdfReaderWorkflowState({
      currentPage: 2,
      documentJob: {
        id: "job-1",
        status: "translating",
        pageRange: "1-4",
        totalPages: 4,
        processedPages: 1,
        translatedSegments: 5,
        totalSegments: 20,
        failedPages: 0,
        message: "Translating",
        updatedAt: "now"
      },
      exportRecords: [makeExportRecord()],
      isDownloadingModel: false,
      isExporting: false,
      isMakerMode: true,
      isOpening: false,
      isTranslating: true,
      makerRuntimeBlocked: false,
      makerUsageEstimate: makeUsageEstimate({
        freeTier: true,
        dailyLimitUsagePercent: { min: 95, max: 100 },
        estimatedCostKrw: { min: 0, max: 0 }
      }),
      monthlySpendLimitKrw: 5000,
      pageCount: 4,
      pageRangeInput: "1-4",
      pageTranslationFailures: {},
      pdfDocumentLoaded: true,
      stopOnFreeTierLimit: true,
      stopOnMonthlyLimit: false,
      translatedPageCount: 2
    });

    expect(state.displayedProgressPercent).toBe(25);
    expect(state.selectedRangePageCount).toBe(4);
    expect(state.isMakerJobActive).toBe(true);
    expect(state.shouldKeepMakerAlive).toBe(true);
    expect(state.canShowMakerDone).toBe(false);
    expect(state.makerFreeTierLimitBlocked).toBe(true);
    expect(state.makerStartBlocked).toBe(true);
  });

  it("allows maker done state after export completes", () => {
    const state = getPdfReaderWorkflowState({
      currentPage: 1,
      documentJob: {
        id: "job-1",
        status: "exported",
        pageRange: "1",
        totalPages: 1,
        processedPages: 1,
        translatedSegments: 2,
        totalSegments: 2,
        failedPages: 0,
        message: "Saved",
        updatedAt: "now"
      },
      exportRecords: [makeExportRecord()],
      isDownloadingModel: false,
      isExporting: false,
      isMakerMode: true,
      isOpening: false,
      isTranslating: false,
      makerRuntimeBlocked: false,
      makerUsageEstimate: null,
      monthlySpendLimitKrw: 0,
      pageCount: 1,
      pageRangeInput: "1",
      pageTranslationFailures: {},
      pdfDocumentLoaded: true,
      stopOnFreeTierLimit: false,
      stopOnMonthlyLimit: false,
      translatedPageCount: 1
    });

    expect(state.canShowMakerDone).toBe(true);
    expect(state.shouldKeepMakerAlive).toBe(false);
  });
});
