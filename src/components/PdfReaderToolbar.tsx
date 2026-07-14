import { ChevronLeft, ChevronRight, FileText, Loader2, Upload } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

type PdfReaderToolbarProps = {
  cacheStatus: "idle" | "hit" | "miss";
  currentPage: number;
  fileName: string;
  isOpening: boolean;
  pageCount: number;
  pdfDocumentLoaded: boolean;
  providerLabel: string;
  translatedPageCount: number;
  onFileSelected: (file: File | undefined) => void;
  onGoToPage: (page: number) => void;
};

export function PdfReaderToolbar({
  cacheStatus,
  currentPage,
  fileName,
  isOpening,
  pageCount,
  pdfDocumentLoaded,
  providerLabel,
  translatedPageCount,
  onFileSelected,
  onGoToPage
}: PdfReaderToolbarProps) {
  const { i18n, t } = useTranslation();
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language),
    [i18n.language, i18n.resolvedLanguage]
  );
  return (
    <>
      <div className="pdf-workbench-header">
        <div className="panel-heading pdf-heading">
          <FileText size={19} />
          <h1>{t("pdfAuthoring.toolbar.title")}</h1>
        </div>
        <div className="pdf-badge-row">
          <span className="pill">
            {t("pdfAuthoring.workflow.providerTranslation", { provider: providerLabel })}
          </span>
          {translatedPageCount > 0 ? (
            <span className="pill">
              {t("pdfAuthoring.toolbar.pagesTranslated", { count: translatedPageCount })}
            </span>
          ) : null}
          {cacheStatus === "hit" ? (
            <span className="pill cache-pill hit">{t("pdfAuthoring.toolbar.cacheHit")}</span>
          ) : null}
          {cacheStatus === "miss" ? (
            <span className="pill cache-pill miss">{t("pdfAuthoring.toolbar.cacheMiss")}</span>
          ) : null}
        </div>
      </div>

      <div className="pdf-toolbar">
        <div className="pdf-toolbar-left">
          <label className="file-button pdf-file-button" data-qa="pdf-reader-open-pdf">
            {isOpening ? <Loader2 className="spin" size={17} /> : <Upload size={17} />}
            {t("pdfAuthoring.toolbar.openPdf")}
            <input
              accept="application/pdf"
              data-qa="pdf-reader-file-input"
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                onFileSelected(file);
              }}
            />
          </label>

          {pdfDocumentLoaded ? (
            <div className="pdf-page-controls">
              <button
                aria-label={t("pdfAuthoring.artifactReader.toolbar.previousPage")}
                className="icon-button"
                disabled={currentPage <= 1}
                type="button"
                onClick={() => onGoToPage(currentPage - 1)}
              >
                <ChevronLeft size={18} />
              </button>
              <input
                aria-label={t("pdfAuthoring.toolbar.pageInput")}
                className="pdf-page-input"
                max={pageCount}
                min={1}
                type="number"
                value={currentPage}
                onChange={(event) => onGoToPage(Number(event.target.value))}
              />
              <span className="muted compact">/ {numberFormatter.format(pageCount)}</span>
              <button
                aria-label={t("pdfAuthoring.artifactReader.toolbar.nextPage")}
                className="icon-button"
                disabled={currentPage >= pageCount}
                type="button"
                onClick={() => onGoToPage(currentPage + 1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          ) : null}
        </div>

        <div className="pdf-toolbar-meta">
          {fileName ? <span>{fileName}</span> : <span>{t("pdfAuthoring.toolbar.noPdf")}</span>}
        </div>
      </div>
    </>
  );
}
