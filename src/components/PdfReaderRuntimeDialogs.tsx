import { Download, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog } from "./Dialog";

type PendingModelDownloadPrompt = {
  model: string;
};

type PendingOllamaSetupPrompt = {
  baseUrl: string;
  model: string;
};

type PdfReaderRuntimeDialogsProps = {
  isDownloadingModel: boolean;
  ollamaDownloadUrl: string;
  pendingModelDownload: PendingModelDownloadPrompt | null;
  pendingOllamaSetup: PendingOllamaSetupPrompt | null;
  onDismissModelDownload: () => void;
  onDismissOllamaSetup: () => void;
  onDownloadMissingModel: () => void;
  onRetryOllamaSetup: () => void;
};

export function PdfReaderRuntimeDialogs({
  isDownloadingModel,
  ollamaDownloadUrl,
  pendingModelDownload,
  pendingOllamaSetup,
  onDismissModelDownload,
  onDismissOllamaSetup,
  onDownloadMissingModel,
  onRetryOllamaSetup
}: PdfReaderRuntimeDialogsProps) {
  const { t } = useTranslation();
  return (
    <>
      {pendingModelDownload ? (
        <Dialog
          ariaLabelledBy="model-download-title"
          ariaDescribedBy="model-download-description"
          backdropClassName="model-download-backdrop"
          className="model-download-dialog"
          closeOnBackdrop={!isDownloadingModel}
          closeOnEscape={!isDownloadingModel}
          onClose={onDismissModelDownload}
        >
            <div className="model-download-icon">
              {isDownloadingModel ? (
                <Loader2 className="spin" size={22} />
              ) : (
                <Download size={22} />
              )}
            </div>
            <h3 id="model-download-title">{t("pdfAuthoring.dialogs.modelTitle")}</h3>
            <p id="model-download-description">
              {t("pdfAuthoring.dialogs.modelDescription", {
                model: pendingModelDownload.model
              })}
            </p>
            <div className="model-download-actions">
              <button
                className="button primary"
                disabled={isDownloadingModel}
                type="button"
                onClick={onDownloadMissingModel}
              >
                {isDownloadingModel ? <Loader2 className="spin" size={16} /> : <Download size={16} />}
                {t("pdfAuthoring.dialogs.download")}
              </button>
              <button
                className="button ghost"
                disabled={isDownloadingModel}
                type="button"
                onClick={onDismissModelDownload}
              >
                {t("common.cancel")}
              </button>
            </div>
        </Dialog>
      ) : null}
      {pendingOllamaSetup ? (
        <Dialog
          ariaLabelledBy="ollama-setup-title"
          ariaDescribedBy="ollama-setup-description"
          backdropClassName="model-download-backdrop"
          className="model-download-dialog"
          onClose={onDismissOllamaSetup}
        >
            <div className="model-download-icon">
              <Download size={22} />
            </div>
            <h3 id="ollama-setup-title">{t("pdfAuthoring.dialogs.ollamaTitle")}</h3>
            <p id="ollama-setup-description">{t("pdfAuthoring.dialogs.ollamaDescription")}</p>
            <div className="model-download-steps">
              <span>{t("pdfAuthoring.dialogs.stepInstall")}</span>
              <span>{t("pdfAuthoring.dialogs.stepRun")}</span>
              <span>{t("pdfAuthoring.dialogs.stepRetry")}</span>
            </div>
            <p className="compact">
              {t("pdfAuthoring.dialogs.address")}: <strong>{pendingOllamaSetup.baseUrl}</strong>
              <br />
              {t("pdfAuthoring.dialogs.model")}: <strong>{pendingOllamaSetup.model}</strong>
            </p>
            <div className="model-download-actions">
              <a className="button primary" href={ollamaDownloadUrl} rel="noreferrer" target="_blank">
                <Download size={16} />
                {t("pdfAuthoring.dialogs.downloadOllama")}
              </a>
              <button className="button secondary" type="button" onClick={onRetryOllamaSetup}>
                {t("pdfAuthoring.dialogs.retry")}
              </button>
              <button className="button ghost" type="button" onClick={onDismissOllamaSetup}>
                {t("common.cancel")}
              </button>
            </div>
        </Dialog>
      ) : null}
    </>
  );
}
