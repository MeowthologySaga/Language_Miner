import { FileText } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { AppSettings } from "../shared/types";

type PdfReaderEmptyStateProps = {
  isMakerMode: boolean;
  selectedTranslationModel: string;
  settings: AppSettings;
  onFileSelected: (file: File | undefined) => void;
};

export function PdfReaderEmptyState({
  isMakerMode,
  selectedTranslationModel,
  settings,
  onFileSelected
}: PdfReaderEmptyStateProps) {
  const { i18n, t } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
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
  return (
    <div className="pdf-empty-state pdf-babeldoc-empty">
      <div className="pdf-babeldoc-config">
        <div className="pdf-babeldoc-brand">
          <strong>
            {isMakerMode
              ? t("pdfAuthoring.bookMaker.title")
              : t("pdfAuthoring.toolbar.title")}
          </strong>
          <span>
            {isMakerMode
              ? t("pdfAuthoring.empty.sideBySide")
              : t("pdfAuthoring.empty.readerDescription")}
          </span>
        </div>
        <div className="pdf-babeldoc-form">
          <div className="pdf-job-field">
            <span>{t("pdfAuthoring.empty.targetLanguage")}</span>
            <strong>
              {sourceLanguageLabel} → {targetLanguageLabel}
            </strong>
          </div>
          <div className="pdf-job-field">
            <span>{t("pdfAuthoring.empty.translationService")}</span>
            <strong>{selectedTranslationModel}</strong>
          </div>
          <div className="pdf-job-field">
            <span>
              {isMakerMode
                ? t("pdfAuthoring.advanced.pageRange")
                : t("pdfAuthoring.empty.viewMode")}
            </span>
            <strong>
              {isMakerMode
                ? t("pdfAuthoring.empty.rangeAfterOpen")
                : t("pdfAuthoring.empty.currentPage")}
            </strong>
          </div>
          <div className="pdf-job-field">
            <span>{t("pdfAuthoring.empty.comparison")}</span>
            <strong>{t("pdfAuthoring.empty.sideBySide")}</strong>
          </div>
        </div>
      </div>
      <label className="pdf-babeldoc-dropzone">
        <FileText size={34} />
        <strong>{t("pdfAuthoring.empty.selectFile")}</strong>
        <span>
          {isMakerMode
            ? t("pdfAuthoring.empty.createTranslation", { language: targetLanguageLabel })
            : t("pdfAuthoring.empty.viewTranslation", { language: targetLanguageLabel })}
        </span>
        <input
          accept="application/pdf"
          type="file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = "";
            onFileSelected(file);
          }}
        />
      </label>
    </div>
  );
}
