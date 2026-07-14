import type { AppSettings } from "../shared/types";
import { useTranslation } from "react-i18next";

type PdfMakerAdvancedSettingsProps = {
  bypassTranslationCache: boolean;
  pageCount: number;
  pageRangeInput: string;
  settings: AppSettings;
  onBypassTranslationCacheChange: (enabled: boolean) => void;
  onPageRangeInputChange: (value: string) => void;
  onSettingsChange: (settings: AppSettings) => void;
  onTogglePdfSourceHighlights: () => void;
};

export function PdfMakerAdvancedSettings({
  bypassTranslationCache,
  pageCount,
  pageRangeInput,
  settings,
  onBypassTranslationCacheChange,
  onPageRangeInputChange,
  onSettingsChange,
  onTogglePdfSourceHighlights
}: PdfMakerAdvancedSettingsProps) {
  const { t } = useTranslation();
  return (
    <details className="pdf-maker-advanced" data-qa="book-maker-advanced-settings">
      <summary>{t("pdfAuthoring.advanced.title")}</summary>
      <div className="pdf-maker-advanced-grid">
        <label className="pdf-job-field pdf-range-label">
          <span>{t("pdfAuthoring.advanced.pageRange")}</span>
          <input
            className="pdf-range-input"
            data-qa="book-maker-page-range"
            placeholder={pageCount ? `1-${pageCount}` : t("pdfAuthoring.advanced.selectPdfFirst")}
            value={pageRangeInput}
            onChange={(event) => onPageRangeInputChange(event.target.value)}
          />
        </label>
        <div className="pdf-job-field">
          <span>{t("pdfAuthoring.advanced.documentMode")}</span>
          <div
            aria-label={t("pdfAuthoring.advanced.documentMode")}
            className="segmented-control compact"
            role="group"
          >
            {(["reading", "paper"] as const).map((exportMode) => (
              <button
                key={exportMode}
                className={settings.pdfExportMode === exportMode ? "active" : ""}
                data-qa={`book-maker-export-mode-${exportMode}`}
                type="button"
                onClick={() =>
                  onSettingsChange({
                    ...settings,
                    pdfExportMode: exportMode
                  })
                }
              >
                {exportMode === "reading"
                  ? t("pdfAuthoring.advanced.readingMode")
                  : t("pdfAuthoring.advanced.paperMode")}
              </button>
            ))}
          </div>
        </div>
        <label className="pdf-maker-toggle">
          <input
            checked={settings.showPdfSourceHighlights}
            data-qa="book-maker-source-highlights"
            type="checkbox"
            onChange={onTogglePdfSourceHighlights}
          />
          <span>{t("pdfAuthoring.advanced.showSourceBoxes")}</span>
        </label>
        <label className="pdf-maker-toggle">
          <input
            checked={bypassTranslationCache}
            data-qa="book-maker-cache-bypass"
            type="checkbox"
            onChange={(event) => onBypassTranslationCacheChange(event.target.checked)}
          />
          <span>{t("pdfAuthoring.advanced.bypassCache")}</span>
        </label>
      </div>
    </details>
  );
}
