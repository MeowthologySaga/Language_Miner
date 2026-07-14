import type {
  BilingualExportHistoryRecord,
  BilingualPdfExportResult,
  BilingualReaderArtifact,
  PdfSegmentTranslation,
  PdfTextSegment
} from "../shared/types";

export type PageTranslationState = {
  segments: PdfTextSegment[];
  translations: PdfSegmentTranslation[];
  cacheStatus: "hit" | "miss" | "partial";
};

export type DocumentJobStatus =
  | "checking"
  | "translating"
  | "completed"
  | "partial"
  | "canceled"
  | "blocked"
  | "exporting"
  | "exported"
  | "failed";

export function getDocumentJobStatusLabel(status: DocumentJobStatus) {
  switch (status) {
    case "checking":
      return "확인 중";
    case "translating":
      return "번역 중";
    case "completed":
      return "완료";
    case "partial":
      return "일부 실패";
    case "canceled":
      return "사용자 중지";
    case "blocked":
      return "대기";
    case "exporting":
      return "저장 중";
    case "exported":
      return "저장 완료";
    case "failed":
      return "실패";
    default:
      return "대기";
  }
}

export function getExportArtifactLabel(fileType: BilingualPdfExportResult["fileType"]) {
  return fileType === "pdf" ? "대조 PDF" : "대조 HTML";
}

export function formatExportRecordDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function createReaderArtifactFromExportRecord(
  record: BilingualExportHistoryRecord
): BilingualReaderArtifact {
  return {
    id: record.id,
    title: record.title,
    filePath: record.filePath,
    fileType: record.fileType,
    sourceLabel: record.sourceLanguageLabel,
    translationLabel: record.targetLanguageLabel,
    pageCount: record.pageCount,
    createdAt: record.createdAt
  };
}

export function formatPdfExportActionError(
  actionLabel: string,
  record: BilingualExportHistoryRecord,
  error: unknown,
  unknownErrorMessage: string
) {
  const message =
    error instanceof Error && error.message.trim()
      ? error.message
      : unknownErrorMessage;
  return `${actionLabel}: ${record.title || record.filePath} (${record.filePath}) - ${message}`;
}

export function formatPageList(pageNumbers: number[]) {
  const visiblePageNumbers = pageNumbers.slice(0, 8).join(", ");
  return pageNumbers.length > 8
    ? `${visiblePageNumbers} 외 ${pageNumbers.length - 8}개`
    : visiblePageNumbers;
}

export function mergeSegmentTranslations(
  segments: PdfTextSegment[],
  ...translationGroups: PdfSegmentTranslation[][]
) {
  const translationsById = new Map<string, PdfSegmentTranslation>();

  translationGroups.forEach((translations) => {
    translations.forEach((translation) => {
      if (translation.translationKo.trim()) {
        translationsById.set(translation.id, translation);
      }
    });
  });

  return segments.flatMap((segment) => {
    const translation = translationsById.get(segment.id);
    return translation ? [translation] : [];
  });
}

export function mergePageTranslationStates(
  ...translationGroups: Record<number, PageTranslationState>[]
) {
  return translationGroups.reduce<Record<number, PageTranslationState>>(
    (merged, translationsByPage) => ({
      ...merged,
      ...translationsByPage
    }),
    {}
  );
}

export function getMergedCacheStatus(
  translations: PdfSegmentTranslation[],
  segmentCount: number
): PageTranslationState["cacheStatus"] {
  if (translations.length === 0) {
    return "miss";
  }

  if (translations.length < segmentCount) {
    return "partial";
  }

  return translations.every((translation) => translation.cacheStatus === "hit") ? "hit" : "miss";
}

export function arrayBufferFromPdfFileData(data: Uint8Array) {
  const bytes = new Uint8Array(data.byteLength);
  bytes.set(data);
  return bytes.buffer;
}

export function isOllamaConnectionError(message: string) {
  return (
    /OLLAMA_READINESS:(?:runtime_not_installed|runtime_start_failed|server_unreachable|model_list_failed)/i.test(
      message
    ) ||
    /Ollama.*(?:연결할 수 없|연결.*실패|connect(?:ion|ed)?.*(?:fail|refus|unavailable)|(?:fail|refus|unavailable).*connect)/i.test(
      message
    ) || /ECONNREFUSED|ERR_CONNECTION_REFUSED/i.test(message)
  );
}

export function matchesShortcut(event: KeyboardEvent, shortcut: string) {
  const normalized = shortcut.trim().toLowerCase().replace(/\s+/g, "");
  if (!normalized) {
    return false;
  }

  const parts = normalized.split("+");
  const key = parts[parts.length - 1];
  const expectsCtrl = parts.includes("ctrl") || parts.includes("control");
  const expectsShift = parts.includes("shift");
  const expectsAlt = parts.includes("alt");
  const eventKey = event.key.toLowerCase();

  return (
    event.ctrlKey === expectsCtrl &&
    event.shiftKey === expectsShift &&
    event.altKey === expectsAlt &&
    eventKey === key
  );
}

export function isPageNavigationShortcut(event: KeyboardEvent) {
  if (event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) {
    return false;
  }

  const key = event.key.toLowerCase();
  return key === "arrowleft" || key === "arrowright" || key === "a" || key === "d";
}

export function getPageNavigationDelta(event: KeyboardEvent) {
  const key = event.key.toLowerCase();
  return key === "arrowleft" || key === "a" ? -1 : 1;
}

export function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}
