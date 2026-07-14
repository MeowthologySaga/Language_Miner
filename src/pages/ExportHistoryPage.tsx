import "../styles/documentManagement.css";
import { BookOpen, Download, ExternalLink, FileText, FolderOpen, Languages, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DocumentNotice,
  DocumentTechnicalDetails,
  type DocumentNoticeValue
} from "../components/DocumentTechnicalDetails";
import { EmptyState } from "../components/EmptyState";
import type { LocalEnglishMinerApi } from "../data/api";
import {
  appLocaleFromLanguage,
  documentBasename,
  documentSafeTitle,
  documentTechnicalError,
  formatDocumentDate,
  formatDocumentNumber
} from "../shared/documentPresentation";
import type { BilingualExportHistoryRecord, BilingualReaderArtifact } from "../shared/types";

type ExportHistoryPageProps = {
  api: LocalEnglishMinerApi;
  onNavigate: (route: "bookMaker" | "pdfReader") => void;
  onOpenReaderArtifact: (artifact: BilingualReaderArtifact) => void;
};

type ExportRecordAction = "open" | "reveal" | "redownload";

export function ExportHistoryPage({
  api,
  onNavigate,
  onOpenReaderArtifact
}: ExportHistoryPageProps) {
  const { i18n, t } = useTranslation();
  const appLocale = appLocaleFromLanguage(i18n.resolvedLanguage ?? i18n.language);
  const [records, setRecords] = useState<BilingualExportHistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyRecordId, setBusyRecordId] = useState("");
  const [busyAction, setBusyAction] = useState<ExportRecordAction | "">("");
  const [status, setStatus] = useState<DocumentNoticeValue | null>(null);
  const [error, setError] = useState<DocumentNoticeValue | null>(null);

  useEffect(() => {
    void loadRecords();
  }, [api]);

  async function loadRecords() {
    setIsLoading(true);
    setError(null);
    try {
      setRecords(await api.documents.listExportRecords());
    } catch (caught) {
      setError({
        summary: t("exportHistory.messages.loadFailed"),
        technicalDetail: documentTechnicalError(caught)
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function openRecord(record: BilingualExportHistoryRecord) {
    await runRecordAction(record, "open", async () => {
      const opened = await api.documents.openPath(record.filePath);
      if (!opened) {
        throw new Error(t("exportHistory.messages.openUnsupported"));
      }
      return {
        summary: t("exportHistory.messages.opened", {
          file: documentBasename(record.filePath, record.title)
        }),
        technicalDetail: record.filePath
      };
    });
  }

  async function revealRecord(record: BilingualExportHistoryRecord) {
    await runRecordAction(record, "reveal", async () => {
      const revealed = await api.documents.revealPath(record.filePath);
      if (!revealed) {
        throw new Error(t("exportHistory.messages.revealUnsupported"));
      }
      return {
        summary: t("exportHistory.messages.revealed", {
          file: documentBasename(record.filePath, record.title)
        }),
        technicalDetail: record.filePath
      };
    });
  }

  async function redownloadRecord(record: BilingualExportHistoryRecord) {
    await runRecordAction(record, "redownload", async () => {
      const result = await api.documents.redownloadExport(record);
      const createdAt = new Date().toISOString();
      const savedRecord = await api.documents.saveExportRecord({
        ...record,
        id: `${createdAt}-${result.filePath}`,
        filePath: result.filePath,
        fileType: result.fileType,
        pageCount: result.pageCount,
        segmentCount: result.segmentCount,
        createdAt
      });
      setRecords((previous) => [
        savedRecord,
        ...previous.filter((candidate) => candidate.id !== savedRecord.id)
      ]);
      return {
        summary: t("exportHistory.messages.redownloaded", {
          file: documentBasename(result.filePath, record.title)
        }),
        technicalDetail: result.filePath
      };
    });
  }

  function openRecordInReader(record: BilingualExportHistoryRecord) {
    onOpenReaderArtifact({
      id: record.id,
      title: documentSafeTitle(record.title, record.filePath),
      filePath: record.filePath,
      fileType: record.fileType,
      sourceLabel: record.sourceLanguageLabel,
      translationLabel: record.targetLanguageLabel,
      pageCount: record.pageCount,
      createdAt: record.createdAt
    });
  }

  async function runRecordAction(
    record: BilingualExportHistoryRecord,
    actionName: ExportRecordAction,
    action: () => Promise<DocumentNoticeValue | void>
  ) {
    setBusyRecordId(record.id);
    setBusyAction(actionName);
    setStatus(null);
    setError(null);
    try {
      const nextStatus = await action();
      if (nextStatus) {
        setStatus(nextStatus);
      }
    } catch (caught) {
      setError({
        summary: t("exportHistory.messages.actionFailed", {
          action: t(exportActionTranslationKey(actionName)),
          file: documentBasename(record.filePath, record.title)
        }),
        technicalDetail: [record.filePath, documentTechnicalError(caught)]
          .filter(Boolean)
          .join("\n")
      });
    } finally {
      setBusyRecordId("");
      setBusyAction("");
    }
  }

  return (
    <div className="document-page export-history-page">
      <section className="export-history-panel" aria-labelledby="export-history-title">
        <div className="document-section-heading">
          <div>
            <h1 id="export-history-title">{t("exportHistory.title")}</h1>
            <p>{t("exportHistory.description")}</p>
          </div>
          <div className="export-history-heading-actions">
            <button
              className="button secondary"
              data-qa="export-history-refresh"
              type="button"
              onClick={() => void loadRecords()}
            >
              <RefreshCw aria-hidden="true" size={16} />
              {t("exportHistory.actions.refresh")}
            </button>
            <button
              className="button primary maker-action"
              data-qa="export-history-open-book-maker"
              type="button"
              onClick={() => onNavigate("bookMaker")}
            >
              <Languages aria-hidden="true" size={17} />
              {t("exportHistory.actions.create")}
            </button>
          </div>
        </div>

        <DocumentNotice kind="success" value={status} />
        <DocumentNotice kind="error" value={error} />

        {isLoading ? (
          <div aria-live="polite" aria-busy="true" role="status">
            <EmptyState
              className="document-empty-state"
              icon={<Loader2 aria-hidden="true" className="spin" size={24} />}
              title={t("exportHistory.states.loading")}
            />
          </div>
        ) : records.length === 0 ? (
          <div aria-live="polite" role="status">
            <EmptyState
              className="document-empty-state"
              data-qa="export-history-empty-state"
              description={t("exportHistory.states.emptyDescription")}
              icon={<FileText aria-hidden="true" size={24} />}
              title={t("exportHistory.states.empty")}
              actions={
                <>
                  <button
                    className="button primary maker-action"
                    type="button"
                    onClick={() => onNavigate("bookMaker")}
                  >
                    <Languages aria-hidden="true" size={16} />
                    {t("exportHistory.actions.create")}
                  </button>
                  <button
                    className="button secondary"
                    data-qa="export-history-open-reader"
                    type="button"
                    onClick={() => onNavigate("pdfReader")}
                  >
                    <BookOpen aria-hidden="true" size={16} />
                    {t("exportHistory.actions.openReader")}
                  </button>
                </>
              }
            />
          </div>
        ) : (
          <div
            aria-label={t("exportHistory.listAria")}
            className="export-history-list"
            role="list"
          >
            {records.map((record) => {
              const isBusy = busyRecordId === record.id;
              const recordBusyAction = isBusy ? busyAction : "";
              return (
                <article className="export-history-record" key={record.id} role="listitem">
                  <div className="export-history-record-main">
                    <FileText aria-hidden="true" size={22} />
                    <div>
                      <strong>{documentSafeTitle(record.title, record.filePath)}</strong>
                      <span>{documentBasename(record.filePath, record.title)}</span>
                    </div>
                  </div>
                  <div className="export-history-record-meta">
                    <span>{t("exportHistory.meta.range", { range: record.pageRange })}</span>
                    <span>{record.fileType.toUpperCase()}</span>
                    <span>
                      {t("exportHistory.meta.pages", {
                        formattedCount: formatDocumentNumber(record.pageCount, appLocale)
                      })}
                    </span>
                    <span>
                      {t("exportHistory.meta.segments", {
                        formattedCount: formatDocumentNumber(record.segmentCount, appLocale)
                      })}
                    </span>
                    <span>{record.providerLabel}</span>
                    <span>{formatDocumentDate(record.createdAt, appLocale, true)}</span>
                  </div>
                  <DocumentTechnicalDetails
                    items={[{ label: t("documents.localPath"), value: record.filePath }]}
                  />
                  <div className="export-history-record-actions">
                    <button className="mini-button" disabled={isBusy} type="button" onClick={() => void openRecord(record)}>
                      {recordBusyAction === "open" ? (
                        <Loader2 aria-hidden="true" className="spin" size={14} />
                      ) : (
                        <ExternalLink aria-hidden="true" size={14} />
                      )}
                      {recordBusyAction === "open"
                        ? t("exportHistory.actions.opening")
                        : t("exportHistory.actions.open")}
                    </button>
                    <button className="mini-button" disabled={isBusy} type="button" onClick={() => void redownloadRecord(record)}>
                      {recordBusyAction === "redownload" ? (
                        <Loader2 aria-hidden="true" className="spin" size={14} />
                      ) : (
                        <Download aria-hidden="true" size={14} />
                      )}
                      {recordBusyAction === "redownload"
                        ? t("exportHistory.actions.redownloading")
                        : t("exportHistory.actions.redownload")}
                    </button>
                    <button className="mini-button" disabled={isBusy} type="button" onClick={() => openRecordInReader(record)}>
                      <BookOpen aria-hidden="true" size={14} />
                      {t("exportHistory.actions.reader")}
                    </button>
                    <button className="mini-button" disabled={isBusy} type="button" onClick={() => void revealRecord(record)}>
                      {recordBusyAction === "reveal" ? (
                        <Loader2 aria-hidden="true" className="spin" size={14} />
                      ) : (
                        <FolderOpen aria-hidden="true" size={14} />
                      )}
                      {recordBusyAction === "reveal"
                        ? t("exportHistory.actions.revealing")
                        : t("exportHistory.actions.reveal")}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function exportActionTranslationKey(actionName: ExportRecordAction) {
  if (actionName === "open") {
    return "exportHistory.actionNames.open" as const;
  }
  if (actionName === "reveal") {
    return "exportHistory.actionNames.reveal" as const;
  }
  return "exportHistory.actionNames.redownload" as const;
}
