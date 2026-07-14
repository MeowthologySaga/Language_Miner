import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { BilingualExportHistoryRecord } from "../shared/types";
import type { DocumentTranslationJob } from "./pdfReaderWorkflowState";

type PdfMakerJobSummaryProps = {
  canOpenReaderArtifact: boolean;
  displayedProgressPercent: number;
  documentJob: DocumentTranslationJob | null;
  documentJobProgressPercent: number;
  exportRecords: BilingualExportHistoryRecord[];
  failedPageCount: number;
  fileName: string;
  pageCount: number;
  selectedRangePageCount: number;
  translatedPageCount: number;
  translatedSegmentCount: number;
  onOpenExportRecord: (record: BilingualExportHistoryRecord) => void;
  onOpenExportRecordInReader: (record: BilingualExportHistoryRecord) => void;
  onRedownloadExportRecord: (record: BilingualExportHistoryRecord) => void;
  onRevealExportRecord: (record: BilingualExportHistoryRecord) => void;
};

export function PdfMakerJobSummary({
  canOpenReaderArtifact,
  displayedProgressPercent,
  documentJob,
  documentJobProgressPercent,
  exportRecords,
  failedPageCount,
  fileName,
  pageCount,
  selectedRangePageCount,
  translatedPageCount,
  translatedSegmentCount,
  onOpenExportRecord,
  onOpenExportRecordInReader,
  onRedownloadExportRecord,
  onRevealExportRecord
}: PdfMakerJobSummaryProps) {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale]
  );
  const getStatusLabel = (status: DocumentTranslationJob["status"]) => {
    switch (status) {
      case "checking":
        return t("pdfAuthoring.jobSummary.status.checking");
      case "translating":
        return t("pdfAuthoring.jobSummary.status.translating");
      case "completed":
        return t("pdfAuthoring.jobSummary.status.completed");
      case "partial":
        return t("pdfAuthoring.jobSummary.status.partial");
      case "canceled":
        return t("pdfAuthoring.jobSummary.status.canceled");
      case "blocked":
        return t("pdfAuthoring.jobSummary.status.blocked");
      case "exporting":
        return t("pdfAuthoring.jobSummary.status.exporting");
      case "exported":
        return t("pdfAuthoring.jobSummary.status.exported");
      case "failed":
        return t("pdfAuthoring.jobSummary.status.failed");
      default:
        return t("pdfAuthoring.jobSummary.status.blocked");
    }
  };
  return (
    <div className="pdf-job-summary">
      <div className="pdf-job-overview">
        <div className="pdf-job-main">
          <div className="pdf-job-title">
            <span>{t("pdfAuthoring.jobSummary.title")}</span>
            <strong>{fileName || t("pdfAuthoring.jobSummary.untitled")}</strong>
          </div>
          <div
            className="pdf-job-progress"
            aria-label={t("pdfAuthoring.jobSummary.translationProgress")}
          >
            <span style={{ width: `${displayedProgressPercent}%` }} />
          </div>
        </div>
        <div className="pdf-job-stats">
          <span>
            {t("pdfAuthoring.jobSummary.pageProgress", {
              current: numberFormatter.format(translatedPageCount),
              total: numberFormatter.format(pageCount)
            })}
          </span>
          <span>
            {t("pdfAuthoring.jobSummary.segments", {
              value: numberFormatter.format(translatedSegmentCount)
            })}
          </span>
          <span>
            {t("pdfAuthoring.jobSummary.selected", {
              value: numberFormatter.format(selectedRangePageCount)
            })}
          </span>
          {failedPageCount > 0 ? (
            <span>{t("pdfAuthoring.jobSummary.failed", { count: failedPageCount })}</span>
          ) : null}
        </div>
        {documentJob ? (
          <div className={`pdf-document-job ${documentJob.status}`} data-qa="book-maker-job">
            <div className="pdf-document-job-header">
              <span>{t("pdfAuthoring.jobSummary.jobStatus")}</span>
              <strong>{getStatusLabel(documentJob.status)}</strong>
            </div>
            <div
              className="pdf-document-job-progress"
              aria-label={t("pdfAuthoring.jobSummary.jobProgress")}
            >
              <span style={{ width: `${documentJobProgressPercent}%` }} />
            </div>
            <p>{documentJob.message}</p>
            <div className="pdf-document-job-meta">
              <span>
                {t("pdfAuthoring.jobSummary.range", { range: documentJob.pageRange || "-" })}
              </span>
              <span>
                {t("pdfAuthoring.jobSummary.pageProgress", {
                  current: numberFormatter.format(documentJob.processedPages),
                  total: numberFormatter.format(documentJob.totalPages)
                })}
              </span>
              <span>
                {t("pdfAuthoring.jobSummary.segmentProgress", {
                  current: numberFormatter.format(documentJob.translatedSegments),
                  total: numberFormatter.format(documentJob.totalSegments)
                })}
              </span>
              {documentJob.failedPages > 0 ? (
                <span>{t("pdfAuthoring.jobSummary.failed", { count: documentJob.failedPages })}</span>
              ) : null}
              {documentJob.outputPath ? (
                <details className="pdf-technical-path">
                  <summary>{t("pdfAuthoring.jobSummary.technicalPath")}</summary>
                  <code>{documentJob.outputPath}</code>
                </details>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      {exportRecords.length > 0 ? (
        <div
          className="pdf-export-records"
          aria-label={t("pdfAuthoring.jobSummary.recentExportsLabel")}
        >
          <div className="pdf-export-records-title">
            <span>{t("pdfAuthoring.jobSummary.recentResults")}</span>
            <strong>{numberFormatter.format(exportRecords.length)}</strong>
          </div>
          <div className="pdf-export-record-list">
            {exportRecords.map((record) => (
              <article className="pdf-export-record" key={record.id}>
                <div>
                  <strong>{record.title}</strong>
                  <span>{fileNameFromPath(record.filePath)}</span>
                </div>
                <div className="pdf-export-record-side">
                  <div className="pdf-export-record-meta">
                    <span>{t("pdfAuthoring.jobSummary.range", { range: record.pageRange })}</span>
                    <span>
                      {record.fileType === "pdf"
                        ? t("pdfAuthoring.reader.ui.artifactPdf")
                        : t("pdfAuthoring.reader.ui.artifactHtml")}
                    </span>
                    <span>
                      {t("pdfAuthoring.jobSummary.pages", {
                        value: numberFormatter.format(record.pageCount)
                      })}
                    </span>
                    <span>
                      {t("pdfAuthoring.jobSummary.segments", {
                        value: numberFormatter.format(record.segmentCount)
                      })}
                    </span>
                    <span>{record.providerLabel}</span>
                    <span>{formatLocalizedDate(record.createdAt, dateFormatter)}</span>
                    <details className="pdf-technical-path">
                      <summary>{t("pdfAuthoring.jobSummary.technicalPath")}</summary>
                      <code>{record.filePath}</code>
                    </details>
                  </div>
                  <div className="pdf-export-record-actions">
                    <button
                      className="mini-button"
                      type="button"
                      onClick={() => onOpenExportRecord(record)}
                    >
                      {t("pdfAuthoring.jobSummary.open")}
                    </button>
                    <button
                      className="mini-button"
                      type="button"
                      onClick={() => onRedownloadExportRecord(record)}
                    >
                      {t("pdfAuthoring.jobSummary.redownload")}
                    </button>
                    {canOpenReaderArtifact ? (
                      <button
                        className="mini-button"
                        type="button"
                        onClick={() => onOpenExportRecordInReader(record)}
                      >
                        {t("pdfAuthoring.jobSummary.reader")}
                      </button>
                    ) : null}
                    <button
                      className="mini-button"
                      type="button"
                      onClick={() => onRevealExportRecord(record)}
                    >
                      {t("pdfAuthoring.jobSummary.folder")}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatLocalizedDate(value: string, formatter: Intl.DateTimeFormat) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : formatter.format(date);
}

function fileNameFromPath(value: string) {
  return value.split(/[\\/]/).filter(Boolean).at(-1) ?? value;
}
