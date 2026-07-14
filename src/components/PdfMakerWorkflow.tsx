import { FileText, Languages, Loader2, Save, Upload } from "lucide-react";
import { useMemo, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { AppSettings, BilingualExportHistoryRecord } from "../shared/types";
import type { TranslationUsageEstimate } from "../shared/translationUsage";
import { PdfMakerAdvancedSettings } from "./PdfMakerAdvancedSettings";
import { PdfMakerUsageEstimate } from "./PdfMakerUsageEstimate";

type MakerDocumentJob = {
  message: string;
  processedPages: number;
  totalPages: number;
  translatedSegments: number;
  totalSegments: number;
};

type MakerPageFailure = {
  message: string;
};

type PdfMakerWorkflowProps = {
  bypassTranslationCache: boolean;
  canOpenReaderArtifact: boolean;
  canShowMakerDone: boolean;
  displayedProgressPercent: number;
  documentJob: MakerDocumentJob | null;
  failedPageCount: number;
  failedPageNumbers: number[];
  fileName: string;
  googleKeyMissing: boolean;
  isMakerBusy: boolean;
  isMakerJobActive: boolean;
  isOpening: boolean;
  latestExportRecord: BilingualExportHistoryRecord | undefined;
  makerFreeTierLimitBlocked: boolean;
  makerMonthlyLimitBlocked: boolean;
  makerRuntimeBlocked: boolean;
  makerRuntimeBlockedMessage: string;
  makerStartBlocked: boolean;
  makerUsageEstimate: TranslationUsageEstimate | null;
  makerUsageStatus: string;
  pageCount: number;
  pageRangeInput: string;
  pageTranslationFailures: Record<number, MakerPageFailure>;
  pdfDocumentLoaded: boolean;
  providerLabel: string;
  selectedRangePageCount: number;
  settings: AppSettings;
  translatedSegmentCount: number;
  onBypassTranslationCacheChange: (enabled: boolean) => void;
  onFileSelected: (file: File | undefined) => void;
  onOpenExportRecord: (record: BilingualExportHistoryRecord) => void;
  onOpenExportRecordInReader: (record: BilingualExportHistoryRecord) => void;
  onPageRangeInputChange: (value: string) => void;
  onRedownloadExportRecord: (record: BilingualExportHistoryRecord) => void;
  onResetPdfReaderToEmpty: () => void;
  onRetryFailedPagesAndExportSelectedRange: () => void;
  onRevealExportRecord: (record: BilingualExportHistoryRecord) => void;
  onSettingsChange: (settings: AppSettings) => void;
  onTogglePdfSourceHighlights: () => void;
  onTranslateAndExportSelectedRange: () => void;
};

export function PdfMakerWorkflow({
  bypassTranslationCache,
  canOpenReaderArtifact,
  canShowMakerDone,
  displayedProgressPercent,
  documentJob,
  failedPageCount,
  failedPageNumbers,
  fileName,
  googleKeyMissing,
  isMakerBusy,
  isMakerJobActive,
  isOpening,
  latestExportRecord,
  makerFreeTierLimitBlocked,
  makerMonthlyLimitBlocked,
  makerRuntimeBlocked,
  makerRuntimeBlockedMessage,
  makerStartBlocked,
  makerUsageEstimate,
  makerUsageStatus,
  pageCount,
  pageRangeInput,
  pageTranslationFailures,
  pdfDocumentLoaded,
  providerLabel,
  selectedRangePageCount,
  settings,
  translatedSegmentCount,
  onBypassTranslationCacheChange,
  onFileSelected,
  onOpenExportRecord,
  onOpenExportRecordInReader,
  onPageRangeInputChange,
  onRedownloadExportRecord,
  onResetPdfReaderToEmpty,
  onRetryFailedPagesAndExportSelectedRange,
  onRevealExportRecord,
  onSettingsChange,
  onTogglePdfSourceHighlights,
  onTranslateAndExportSelectedRange
}: PdfMakerWorkflowProps) {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const languageDisplayNames = useMemo(
    () => new Intl.DisplayNames([locale], { type: "language" }),
    [locale]
  );
  const sourceLanguageLabel =
    languageDisplayNames.of(settings.learningProfile.targetLanguage.code) ??
    settings.learningProfile.targetLanguage.nameKo;
  const targetLanguageLabel =
    languageDisplayNames.of(settings.learningProfile.nativeLanguage.code) ??
    settings.learningProfile.nativeLanguage.nameKo;
  const failedPagesLabel = failedPageNumbers
    .map((pageNumber) => numberFormatter.format(pageNumber))
    .join(", ");
  const makerProgressStyle = {
    "--maker-progress": `${displayedProgressPercent}%`
  } as CSSProperties;

  return (
    <div className="pdf-maker-simple">
      {!pdfDocumentLoaded ? (
        <div className="pdf-maker-start">
          <label className="pdf-maker-dropzone" data-qa="book-maker-file-dropzone">
            <FileText size={42} />
            <strong>{t("pdfAuthoring.workflow.dropTitle")}</strong>
            <span>{t("pdfAuthoring.workflow.dropDescription")}</span>
            <span className="button primary reader-action">
              {isOpening ? <Loader2 className="spin" size={16} /> : <Upload size={16} />}
              {t("pdfAuthoring.workflow.selectPdf")}
            </span>
            <input
              accept="application/pdf"
              data-qa="book-maker-file-input"
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                onFileSelected(file);
              }}
            />
          </label>
          <div className="pdf-maker-chip-row">
            <span>
              {sourceLanguageLabel} → {targetLanguageLabel}
            </span>
            <span>{t("pdfAuthoring.workflow.providerTranslation", { provider: providerLabel })}</span>
            <span>
              {settings.showPdfSourceHighlights
                ? t("pdfAuthoring.workflow.boxesShown")
                : t("pdfAuthoring.workflow.boxesHidden")}
            </span>
          </div>
          {makerRuntimeBlocked ? (
            <p className="selection-warning">{makerRuntimeBlockedMessage}</p>
          ) : null}
          <PdfMakerAdvancedSettings
            bypassTranslationCache={bypassTranslationCache}
            pageCount={pageCount}
            pageRangeInput={pageRangeInput}
            settings={settings}
            onBypassTranslationCacheChange={onBypassTranslationCacheChange}
            onPageRangeInputChange={onPageRangeInputChange}
            onSettingsChange={onSettingsChange}
            onTogglePdfSourceHighlights={onTogglePdfSourceHighlights}
          />
        </div>
      ) : canShowMakerDone && latestExportRecord ? (
        <div className="pdf-maker-done" data-qa="book-maker-done">
          <div className="pdf-maker-done-icon">✓</div>
          <h3>{t("pdfAuthoring.workflow.doneTitle")}</h3>
          <p>
            {t("pdfAuthoring.workflow.doneSummary", {
              pages: numberFormatter.format(latestExportRecord.pageCount),
              segments: numberFormatter.format(latestExportRecord.segmentCount),
              provider: latestExportRecord.providerLabel
            })}
          </p>
          <div className="pdf-maker-done-actions">
            <button
              className="button primary maker-action"
              type="button"
              onClick={() => onOpenExportRecord(latestExportRecord)}
            >
              {t("pdfAuthoring.workflow.openPdf")}
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => onRedownloadExportRecord(latestExportRecord)}
            >
              {t("pdfAuthoring.workflow.redownload")}
            </button>
            {canOpenReaderArtifact ? (
              <button
                className="button secondary"
                type="button"
                onClick={() => onOpenExportRecordInReader(latestExportRecord)}
              >
                {t("pdfAuthoring.workflow.openInReader")}
              </button>
            ) : null}
            <button
              className="button secondary"
              type="button"
              onClick={() => onRevealExportRecord(latestExportRecord)}
            >
              {t("pdfAuthoring.workflow.showInFolder")}
            </button>
            <button
              className="button ghost"
              data-qa="book-maker-new-pdf-button"
              type="button"
              onClick={onResetPdfReaderToEmpty}
            >
              {t("pdfAuthoring.workflow.newPdf")}
            </button>
          </div>
        </div>
      ) : isMakerBusy || isMakerJobActive ? (
        <div className="pdf-maker-progress-panel" data-qa="book-maker-progress">
          <div className="pdf-maker-file-strip">
            <FileText size={22} />
            <div>
              <strong>{fileName || t("pdfAuthoring.workflow.selectedPdf")}</strong>
              <span>
                {t("pdfAuthoring.workflow.pagesSelected", {
                  pages: numberFormatter.format(selectedRangePageCount)
                })}
              </span>
            </div>
          </div>
          <div className="pdf-maker-progress-center">
            <div className="pdf-maker-progress-ring" style={makerProgressStyle}>
              {numberFormatter.format(displayedProgressPercent)}%
            </div>
            <h3>{documentJob?.message ?? t("pdfAuthoring.workflow.creating")}</h3>
            <p>{t("pdfAuthoring.workflow.saveDialogHint")}</p>
            <div className="pdf-maker-progress-stats">
              <span>
                {t("pdfAuthoring.workflow.pageProgress", {
                  current: numberFormatter.format(documentJob?.processedPages ?? 0),
                  total: numberFormatter.format(
                    documentJob?.totalPages ?? selectedRangePageCount
                  )
                })}
              </span>
              <span>
                {t("pdfAuthoring.workflow.segmentProgress", {
                  current: numberFormatter.format(
                    documentJob?.translatedSegments ?? translatedSegmentCount
                  ),
                  total:
                    documentJob?.totalSegments === undefined
                      ? "-"
                      : numberFormatter.format(documentJob.totalSegments)
                })}
              </span>
              {failedPageCount > 0 ? (
                <span className="failed">
                  {t("pdfAuthoring.workflow.pagesFailed", { count: failedPageCount })}
                </span>
              ) : null}
            </div>
            {failedPageCount > 0 ? (
              <button
                className="button secondary"
                data-qa="book-maker-progress-retry-failed"
                disabled={isMakerBusy}
                type="button"
                onClick={onRetryFailedPagesAndExportSelectedRange}
              >
                <Languages size={16} />
                {t("pdfAuthoring.workflow.retryFailedOnly")}
              </button>
            ) : null}
          </div>
        </div>
      ) : failedPageCount > 0 ? (
        <div className="pdf-maker-recovery" data-qa="book-maker-recovery">
          <div className="pdf-maker-selected-file">
            <FileText size={34} />
            <div>
              <span>{t("pdfAuthoring.workflow.partialFailure")}</span>
              <strong>{fileName}</strong>
              <small>
                {t("pdfAuthoring.workflow.retryPagesHint", { pages: failedPagesLabel })}
              </small>
            </div>
          </div>
          <div className="pdf-maker-failure-list">
            {failedPageNumbers.slice(0, 4).map((pageNumber) => (
              <div key={pageNumber}>
                <strong>{t("pdfAuthoring.workflow.pageShort", {
                  page: numberFormatter.format(pageNumber)
                })}</strong>
                <span>
                  {pageTranslationFailures[pageNumber]?.message ??
                    t("pdfAuthoring.workflow.translationFailed")}
                </span>
              </div>
            ))}
          </div>
          <button
            className="button primary maker-action pdf-maker-main-action"
            data-qa="book-maker-retry-failed-export"
            disabled={isMakerBusy || googleKeyMissing || makerStartBlocked}
            type="button"
            onClick={onRetryFailedPagesAndExportSelectedRange}
          >
            <Languages size={18} />
            {t("pdfAuthoring.workflow.retryAndCreate")}
          </button>
          <button
            className="button ghost"
            disabled={isMakerBusy || googleKeyMissing || makerStartBlocked}
            type="button"
            onClick={onTranslateAndExportSelectedRange}
          >
            {t("pdfAuthoring.workflow.restartAll")}
          </button>
        </div>
      ) : (
        <div className="pdf-maker-ready">
          <div className="pdf-maker-selected-file">
            <FileText size={34} />
            <div>
              <span>{t("pdfAuthoring.workflow.selectedPdf")}</span>
              <strong>{fileName}</strong>
              <small>
                {t("pdfAuthoring.workflow.selectedSummary", {
                  pages: numberFormatter.format(pageCount),
                  source: sourceLanguageLabel,
                  target: targetLanguageLabel
                })}
              </small>
            </div>
            <label className="button ghost">
              {t("pdfAuthoring.workflow.chooseAnother")}
              <input
                accept="application/pdf"
                data-qa="book-maker-replace-file-input"
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = "";
                  onFileSelected(file);
                }}
              />
            </label>
            <button
              className="button ghost"
              data-qa="book-maker-clear-button"
              type="button"
              onClick={onResetPdfReaderToEmpty}
            >
              {t("pdfAuthoring.workflow.clearSelection")}
            </button>
          </div>
          {makerRuntimeBlocked ? (
            <p className="selection-warning">{makerRuntimeBlockedMessage}</p>
          ) : null}
          <PdfMakerUsageEstimate
            estimate={makerUsageEstimate}
            makerFreeTierLimitBlocked={makerFreeTierLimitBlocked}
            makerMonthlyLimitBlocked={makerMonthlyLimitBlocked}
            makerUsageStatus={makerUsageStatus}
            providerLabel={providerLabel}
          />
          <div className="pdf-maker-status-dock">
            <div>
              <strong>
                {makerRuntimeBlocked
                  ? t("pdfAuthoring.workflow.desktopRequired")
                  : makerStartBlocked
                    ? t("pdfAuthoring.workflow.checkLimits")
                    : t("pdfAuthoring.workflow.guardSummary")}
              </strong>
              <span>
                {makerRuntimeBlocked
                  ? t("pdfAuthoring.workflow.localWebUnsupported")
                  : t("pdfAuthoring.workflow.estimateDisclaimer")}
              </span>
            </div>
            <button
              className="button primary maker-action pdf-maker-main-action"
              data-qa="book-maker-start-button"
              disabled={isMakerBusy || googleKeyMissing || makerStartBlocked}
              type="button"
              onClick={onTranslateAndExportSelectedRange}
            >
              <Save size={18} />
              {t("pdfAuthoring.workflow.createPdf")}
            </button>
          </div>
          <PdfMakerAdvancedSettings
            bypassTranslationCache={bypassTranslationCache}
            pageCount={pageCount}
            pageRangeInput={pageRangeInput}
            settings={settings}
            onBypassTranslationCacheChange={onBypassTranslationCacheChange}
            onPageRangeInputChange={onPageRangeInputChange}
            onSettingsChange={onSettingsChange}
            onTogglePdfSourceHighlights={onTogglePdfSourceHighlights}
          />
        </div>
      )}
    </div>
  );
}
