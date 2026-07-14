import { describe, expect, it } from "vitest";
import type {
  BilingualExportHistoryRecord,
  PdfSegmentTranslation,
  PdfTextSegment
} from "../shared/types";
import {
  createReaderArtifactFromExportRecord,
  formatPageList,
  formatPdfExportActionError,
  getDocumentJobStatusLabel,
  getMergedCacheStatus,
  isOllamaConnectionError,
  matchesShortcut,
  mergeSegmentTranslations
} from "./pdfSelectionReaderUtils";

function makeSegment(id: string, index: number): PdfTextSegment {
  return {
    id,
    index,
    pageNumber: 1,
    text: `Segment ${index}`
  };
}

function makeTranslation(
  id: string,
  translationKo: string,
  cacheStatus: PdfSegmentTranslation["cacheStatus"] = "miss"
): PdfSegmentTranslation {
  return {
    id,
    translationKo,
    cacheStatus
  };
}

function makeKeyboardEvent(input: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    altKey: false,
    ctrlKey: false,
    key: "",
    metaKey: false,
    shiftKey: false,
    ...input
  } as KeyboardEvent;
}

function makeExportRecord(
  overrides: Partial<BilingualExportHistoryRecord> = {}
): BilingualExportHistoryRecord {
  return {
    id: "record-1",
    title: "Exported Lesson",
    filePath: "C:/exports/lesson.pdf",
    fileType: "pdf",
    pageRange: "1-2",
    pageCount: 2,
    segmentCount: 12,
    providerLabel: "Gemini",
    sourceLanguageLabel: "English",
    targetLanguageLabel: "Korean",
    createdAt: "2026-06-25T00:00:00.000Z",
    ...overrides
  };
}

describe("pdfSelectionReaderUtils", () => {
  it("merges non-empty translations by source segment order", () => {
    const segments = [makeSegment("a", 0), makeSegment("b", 1), makeSegment("c", 2)];
    const cached = [makeTranslation("b", "둘", "hit"), makeTranslation("c", "   ", "hit")];
    const fresh = [makeTranslation("a", "하나"), makeTranslation("c", "셋")];

    expect(mergeSegmentTranslations(segments, cached, fresh)).toEqual([
      makeTranslation("a", "하나"),
      makeTranslation("b", "둘", "hit"),
      makeTranslation("c", "셋")
    ]);
  });

  it("summarizes long page lists for status messages", () => {
    expect(formatPageList([1, 2, 3])).toBe("1, 2, 3");
    expect(formatPageList([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(
      "1, 2, 3, 4, 5, 6, 7, 8 외 2개"
    );
  });

  it("returns cache status from translated coverage", () => {
    expect(getMergedCacheStatus([], 2)).toBe("miss");
    expect(getMergedCacheStatus([makeTranslation("a", "하나", "hit")], 2)).toBe("partial");
    expect(
      getMergedCacheStatus([makeTranslation("a", "하나", "hit"), makeTranslation("b", "둘", "hit")], 2)
    ).toBe("hit");
    expect(
      getMergedCacheStatus([makeTranslation("a", "하나", "hit"), makeTranslation("b", "둘")], 2)
    ).toBe("miss");
  });

  it("matches configured capture shortcuts", () => {
    expect(matchesShortcut(makeKeyboardEvent({ ctrlKey: true, key: "Q" }), "Ctrl+Q")).toBe(true);
    expect(matchesShortcut(makeKeyboardEvent({ ctrlKey: true, shiftKey: true, key: "Q" }), "Ctrl+Q")).toBe(false);
    expect(matchesShortcut(makeKeyboardEvent({ altKey: true, key: "x" }), "Alt+X")).toBe(true);
  });

  it("labels known job and Ollama states", () => {
    expect(getDocumentJobStatusLabel("exported")).toBe("저장 완료");
    expect(getDocumentJobStatusLabel("canceled")).toBe("사용자 중지");
    expect(isOllamaConnectionError("Ollama에 연결할 수 없습니다: ECONNREFUSED")).toBe(true);
    expect(isOllamaConnectionError("다른 번역 오류")).toBe(false);
  });
  it("creates reader artifacts from export history records", () => {
    expect(createReaderArtifactFromExportRecord(makeExportRecord())).toEqual({
      id: "record-1",
      title: "Exported Lesson",
      filePath: "C:/exports/lesson.pdf",
      fileType: "pdf",
      sourceLabel: "English",
      translationLabel: "Korean",
      pageCount: 2,
      createdAt: "2026-06-25T00:00:00.000Z"
    });
  });

  it("formats export record action errors with a useful fallback", () => {
    expect(
      formatPdfExportActionError(
        "Open failed",
        makeExportRecord(),
        new Error("File missing"),
        "Unknown file operation error."
      )
    ).toContain("Open");
    expect(
      formatPdfExportActionError(
        "Open failed",
        makeExportRecord({ title: "" }),
        "unknown",
        "Unknown file operation error."
      )
    ).toContain("Unknown file operation error.");
  });

  it("recognizes localized and transport-level Ollama connection errors", () => {
    expect(isOllamaConnectionError("Ollama에 연결할 수 없습니다: ECONNREFUSED")).toBe(true);
    expect(isOllamaConnectionError("Ollama connection failed: service unavailable")).toBe(true);
    expect(isOllamaConnectionError("fetch failed: ECONNREFUSED")).toBe(true);
    expect(
      isOllamaConnectionError(
        "Error invoking remote method: OLLAMA_READINESS:server_unreachable"
      )
    ).toBe(true);
    expect(isOllamaConnectionError("OLLAMA_READINESS:runtime_not_installed")).toBe(true);
    expect(isOllamaConnectionError("OLLAMA_READINESS:runtime_start_failed")).toBe(true);
    expect(isOllamaConnectionError("OLLAMA_READINESS:model_list_failed")).toBe(true);
    expect(isOllamaConnectionError("OLLAMA_READINESS:model_missing")).toBe(false);
    expect(isOllamaConnectionError("다른 번역 오류")).toBe(false);
  });
});
