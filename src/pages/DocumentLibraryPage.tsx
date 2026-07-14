import {
  BookOpen,
  Clock,
  FileText,
  FolderOpen,
  History,
  Languages,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DocumentNotice,
  DocumentTechnicalDetails,
  type DocumentNoticeValue
} from "../components/DocumentTechnicalDetails";
import type { LocalEnglishMinerApi } from "../data/api";
import {
  appLocaleFromLanguage,
  documentBasename,
  documentSafeTitle,
  documentTechnicalError,
  formatDocumentDate,
  formatDocumentNumber
} from "../shared/documentPresentation";
import type {
  AppSettings,
  BilingualExportHistoryRecord,
  BilingualReaderArtifact,
  RecentDocumentRecord
} from "../shared/types";

type DocumentLibraryRoute = "pdfReader" | "bookMaker";
type DocumentFilter = "all" | "recent" | "exports" | "debug";

type DocumentLibraryPageProps = {
  api: LocalEnglishMinerApi;
  settings: AppSettings;
  recentDocuments: RecentDocumentRecord[];
  includeExports?: boolean;
  onNavigate: (route: DocumentLibraryRoute) => void;
  onOpenReaderArtifact: (
    artifact: BilingualReaderArtifact,
    source?: RecentDocumentRecord["source"]
  ) => void;
  onRecentDocumentsChange: (records: RecentDocumentRecord[]) => void;
};

type LibraryDocument = {
  id: string;
  title: string;
  filePath: string;
  fileType: "pdf" | "html";
  pageCount: number;
  sourceLabel: string;
  translationLabel: string;
  source: RecentDocumentRecord["source"];
  isRecent: boolean;
  lastOpenedAt: string;
  createdAt: string;
  exportRecord?: BilingualExportHistoryRecord;
};

export function DocumentLibraryPage({
  api,
  settings,
  recentDocuments,
  includeExports = false,
  onNavigate,
  onOpenReaderArtifact,
  onRecentDocumentsChange
}: DocumentLibraryPageProps) {
  const { i18n, t } = useTranslation();
  const appLocale = appLocaleFromLanguage(i18n.resolvedLanguage ?? i18n.language);
  const [exportRecords, setExportRecords] = useState<BilingualExportHistoryRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DocumentFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isPickingFile, setIsPickingFile] = useState(false);
  const [revealingDocumentId, setRevealingDocumentId] = useState("");
  const [status, setStatus] = useState<DocumentNoticeValue | null>(null);
  const [error, setError] = useState<DocumentNoticeValue | null>(null);

  useEffect(() => {
    if (!includeExports) {
      setExportRecords([]);
      setIsLoading(false);
      return;
    }
    void loadExportRecords();
  }, [api, includeExports]);

  const documents = useMemo(
    () => buildLibraryDocuments(recentDocuments, includeExports ? exportRecords : [], settings),
    [exportRecords, includeExports, recentDocuments, settings]
  );
  const filteredDocuments = useMemo(
    () => filterLibraryDocuments(documents, filter, query),
    [documents, filter, query]
  );
  const selectedDocument =
    filteredDocuments.find((document) => document.id === selectedId) ?? filteredDocuments[0];

  useEffect(() => {
    if (!selectedDocument) {
      setSelectedId("");
      return;
    }
    if (selectedDocument.id !== selectedId) {
      setSelectedId(selectedDocument.id);
    }
  }, [selectedDocument, selectedId]);

  async function loadExportRecords() {
    setIsLoading(true);
    setError(null);
    try {
      setExportRecords(await api.documents.listExportRecords());
    } catch (caught) {
      setError({
        summary: t("documentLibrary.messages.loadFailed"),
        technicalDetail: documentTechnicalError(caught)
      });
    } finally {
      setIsLoading(false);
    }
  }

  function openDocumentInReader(document: LibraryDocument) {
    onOpenReaderArtifact(libraryDocumentToArtifact(document), document.source);
  }

  async function pickAndOpenDocument() {
    setIsPickingFile(true);
    setStatus(null);
    setError(null);
    try {
      const artifact = await api.documents.pickReaderArtifact();
      if (!artifact) {
        setStatus({ summary: t("documentLibrary.messages.pickCancelled") });
        return;
      }

      onOpenReaderArtifact(
        {
          ...artifact,
          sourceLabel: settings.learningProfile.targetLanguage.nameEn,
          translationLabel: settings.learningProfile.nativeLanguage.nameEn
        },
        "manual"
      );
    } catch (caught) {
      setError({
        summary: t("documentLibrary.messages.addFailed"),
        technicalDetail: documentTechnicalError(caught)
      });
    } finally {
      setIsPickingFile(false);
    }
  }

  async function revealDocument(document: LibraryDocument) {
    setStatus(null);
    setError(null);
    setRevealingDocumentId(document.id);
    try {
      const revealed = await api.documents.revealPath(document.filePath);
      if (!revealed) {
        setError({
          summary: t("documentLibrary.messages.revealUnsupported", {
            file: documentBasename(document.filePath, document.title)
          }),
          technicalDetail: document.filePath
        });
        return;
      }
      setStatus({
        summary: t("documentLibrary.messages.locationOpened", {
          file: documentBasename(document.filePath, document.title)
        }),
        technicalDetail: document.filePath
      });
    } catch (caught) {
      setError({
        summary: t("documentLibrary.messages.actionFailed", {
          action: t("documentLibrary.actions.reveal"),
          file: documentBasename(document.filePath, document.title)
        }),
        technicalDetail: [document.filePath, documentTechnicalError(caught)]
          .filter(Boolean)
          .join("\n")
      });
    } finally {
      setRevealingDocumentId("");
    }
  }

  function removeFromRecent(document: LibraryDocument) {
    setError(null);
    onRecentDocumentsChange(
      recentDocuments.filter(
        (record) => !sameDocument(record.filePath, document.filePath, record.fileType, document.fileType)
      )
    );
    setStatus({
      summary: t("documentLibrary.messages.removed", {
        file: documentBasename(document.filePath, document.title)
      })
    });
  }

  function clearRecentDocuments() {
    setError(null);
    onRecentDocumentsChange([]);
    setStatus({ summary: t("documentLibrary.messages.cleared") });
  }

  return (
    <div className="document-page library-page">
      <header className="document-page-heading">
        <h1 id="document-library-title">{t("documentLibrary.title")}</h1>
        <p>{t("documentLibrary.description")}</p>
      </header>
      <div className="document-library-layout" aria-labelledby="document-library-title">
        <aside className="document-filter-rail" aria-label={t("documentLibrary.filters.ariaLabel")}>
          <h2>{t("documentLibrary.filters.title")}</h2>
          <button
            className={filter === "all" ? "active" : ""}
            type="button"
            onClick={() => setFilter("all")}
          >
            <FileText aria-hidden="true" size={16} />
            {t("documentLibrary.filters.all")}
            <span>{formatDocumentNumber(documents.length, appLocale)}</span>
          </button>
          <button
            className={filter === "recent" ? "active" : ""}
            type="button"
            onClick={() => setFilter("recent")}
          >
            <Clock aria-hidden="true" size={16} />
            {t("documentLibrary.filters.recent")}
            <span>{formatDocumentNumber(recentDocuments.length, appLocale)}</span>
          </button>
          {includeExports ? (
            <button
              className={filter === "exports" ? "active" : ""}
              type="button"
              onClick={() => setFilter("exports")}
            >
              <History aria-hidden="true" size={16} />
              {t("documentLibrary.filters.exports")}
              <span>{formatDocumentNumber(exportRecords.length, appLocale)}</span>
            </button>
          ) : null}
          {settings.debugMode && settings.debugPdfPath.trim() ? (
            <button
              className={filter === "debug" ? "active" : ""}
              type="button"
              onClick={() => setFilter("debug")}
            >
              <FileText aria-hidden="true" size={16} />
              {t("documentLibrary.filters.debug")}
            </button>
          ) : null}

          <div className="document-filter-section">
            <span>{t("documentLibrary.actions.title")}</span>
            <button
              data-qa="document-library-add-file"
              type="button"
              onClick={() => void pickAndOpenDocument()}
            >
              {isPickingFile ? (
                <Loader2 aria-hidden="true" className="spin" size={16} />
              ) : (
                <Plus aria-hidden="true" size={16} />
              )}
              {t("documentLibrary.actions.addFile")}
            </button>
            <button
              data-qa="document-library-open-book-maker"
              type="button"
              onClick={() => onNavigate("bookMaker")}
            >
              <Languages aria-hidden="true" size={16} />
              {t("documentLibrary.actions.makeBook")}
            </button>
            {includeExports ? (
              <button data-qa="document-library-refresh" type="button" onClick={() => void loadExportRecords()}>
                <RefreshCw aria-hidden="true" size={16} />
                {t("documentLibrary.actions.refresh")}
              </button>
            ) : null}
          </div>
        </aside>

        <section className="document-table-panel">
          <div className="document-table-toolbar">
            <label className="document-search">
              <Search aria-hidden="true" size={15} />
              <span className="sr-only">{t("documentLibrary.searchLabel")}</span>
              <input
                type="search"
                placeholder={t("documentLibrary.searchPlaceholder")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <button
              className="button primary"
              data-qa="document-library-add-file-toolbar"
              disabled={isPickingFile}
              type="button"
              onClick={() => void pickAndOpenDocument()}
            >
              {isPickingFile ? (
                <Loader2 aria-hidden="true" className="spin" size={16} />
              ) : (
                <Plus aria-hidden="true" size={16} />
              )}
              {t("documentLibrary.actions.addFile")}
            </button>
          </div>

          <DocumentNotice kind="success" value={status} />
          <DocumentNotice kind="error" value={error} />

          <div
            aria-busy={isLoading}
            aria-label={t("documentLibrary.listAria")}
            className="document-card-list"
            role="list"
          >
            {isLoading ? (
              <div
                aria-live="polite"
                className="empty-document-state"
                role="status"
              >
                <Loader2 aria-hidden="true" className="spin" size={30} />
                <strong>{t("documentLibrary.states.loading")}</strong>
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="empty-document-state" role="status">
                <FileText aria-hidden="true" size={30} />
                <strong>{t("documentLibrary.states.empty")}</strong>
                <span>{t("documentLibrary.states.emptyDescription")}</span>
                <button
                  className="button secondary"
                  data-qa="document-library-add-file-empty"
                  type="button"
                  onClick={() => void pickAndOpenDocument()}
                >
                  {t("documentLibrary.actions.addFile")}
                </button>
              </div>
            ) : (
              filteredDocuments.map((document) => (
                <div className="document-file-card-item" key={document.id} role="listitem">
                  <button
                    aria-pressed={selectedDocument?.id === document.id}
                    className={`document-file-card${selectedDocument?.id === document.id ? " selected" : ""}`}
                    type="button"
                    onClick={() => setSelectedId(document.id)}
                    onDoubleClick={() => openDocumentInReader(document)}
                  >
                    <span className="document-file-card-icon">
                      <FileText aria-hidden="true" size={18} />
                    </span>
                    <span className="document-file-card-main">
                      <span className="document-file-card-title">{document.title}</span>
                      <span className="document-file-card-path">
                        {documentBasename(document.filePath, document.title)}
                      </span>
                      <span className="document-file-card-meta">
                        <span>{document.fileType.toUpperCase()}</span>
                        <span>
                          {document.pageCount > 0
                            ? t("documents.pageBadge", {
                                formattedCount: formatDocumentNumber(
                                  document.pageCount,
                                  appLocale
                                )
                              })
                            : t("documents.pageUnknown")}
                        </span>
                        <span>{t(sourceTranslationKey(document.source))}</span>
                        <span>
                          {t("documentLibrary.lastOpenedBadge", {
                            date: formatDocumentDate(document.lastOpenedAt, appLocale)
                          })}
                        </span>
                      </span>
                    </span>
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

        <aside className="document-detail-panel">
          {selectedDocument ? (
            <>
              <div className="document-detail-title">
                <FileText aria-hidden="true" size={34} />
                <strong>{selectedDocument.title}</strong>
                <span>{t(sourceTranslationKey(selectedDocument.source))}</span>
              </div>
              <dl>
                <div>
                  <dt>{t("documents.fileName")}</dt>
                  <dd>{documentBasename(selectedDocument.filePath, selectedDocument.title)}</dd>
                </div>
                <div>
                  <dt>{t("documents.format")}</dt>
                  <dd>{selectedDocument.fileType.toUpperCase()}</dd>
                </div>
                <div>
                  <dt>{t("documents.pages")}</dt>
                  <dd>
                    {selectedDocument.pageCount > 0
                      ? formatDocumentNumber(selectedDocument.pageCount, appLocale)
                      : "-"}
                  </dd>
                </div>
                <div>
                  <dt>{t("documents.languages")}</dt>
                  <dd>
                    {selectedDocument.sourceLabel} / {selectedDocument.translationLabel}
                  </dd>
                </div>
                <div>
                  <dt>{t("documents.lastOpened")}</dt>
                  <dd>{formatDocumentDate(selectedDocument.lastOpenedAt, appLocale, true)}</dd>
                </div>
              </dl>
              <DocumentTechnicalDetails
                items={[
                  { label: t("documents.localPath"), value: selectedDocument.filePath }
                ]}
              />
              <div className="document-detail-actions">
                <button
                  className="button primary reader-action"
                  data-qa="document-library-open-selected-reader"
                  type="button"
                  onClick={() => openDocumentInReader(selectedDocument)}
                >
                  <BookOpen aria-hidden="true" size={17} />
                  {t("documentLibrary.actions.openReader")}
                </button>
                <button
                  className="button primary maker-action"
                  data-qa="document-library-open-selected-book-maker"
                  type="button"
                  onClick={() => onNavigate("bookMaker")}
                >
                  <Languages aria-hidden="true" size={17} />
                  {t("documentLibrary.actions.makeBook")}
                </button>
                <button
                  className="button secondary"
                  disabled={revealingDocumentId === selectedDocument.id}
                  type="button"
                  onClick={() => void revealDocument(selectedDocument)}
                >
                  {revealingDocumentId === selectedDocument.id ? (
                    <Loader2 aria-hidden="true" className="spin" size={17} />
                  ) : (
                    <FolderOpen aria-hidden="true" size={17} />
                  )}
                  {revealingDocumentId === selectedDocument.id
                    ? t("documentLibrary.actions.revealing")
                    : t("documentLibrary.actions.reveal")}
                </button>
                <button className="button secondary" type="button" onClick={() => removeFromRecent(selectedDocument)}>
                  <Trash2 aria-hidden="true" size={17} />
                  {t("documentLibrary.actions.removeRecent")}
                </button>
                <button className="button secondary" type="button" onClick={clearRecentDocuments}>
                  {t("documentLibrary.actions.clearRecent")}
                </button>
              </div>
            </>
          ) : (
            <div className="empty-document-state" role="status">
              <FileText aria-hidden="true" size={30} />
              <strong>{t("documentLibrary.states.noSelection")}</strong>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function buildLibraryDocuments(
  recentDocuments: RecentDocumentRecord[],
  exportRecords: BilingualExportHistoryRecord[],
  settings: AppSettings
) {
  const documents = new Map<string, LibraryDocument>();

  for (const record of exportRecords) {
    addLibraryDocument(documents, exportRecordToDocument(record));
  }
  if (settings.debugMode && settings.debugPdfPath.trim()) {
    addLibraryDocument(documents, debugPathToDocument(settings));
  }
  for (const record of recentDocuments) {
    addLibraryDocument(documents, recentRecordToDocument(record));
  }

  return Array.from(documents.values()).sort((left, right) =>
    right.lastOpenedAt.localeCompare(left.lastOpenedAt)
  );
}

function addLibraryDocument(target: Map<string, LibraryDocument>, document: LibraryDocument) {
  const key = documentKey(document.filePath, document.fileType);
  const existing = target.get(key);
  if (!existing) {
    target.set(key, document);
    return;
  }

  target.set(key, {
    ...existing,
    ...document,
    id: existing.id || document.id,
    exportRecord: existing.exportRecord ?? document.exportRecord,
    isRecent: existing.isRecent || document.isRecent,
    lastOpenedAt:
      existing.lastOpenedAt.localeCompare(document.lastOpenedAt) > 0
        ? existing.lastOpenedAt
        : document.lastOpenedAt,
    createdAt:
      existing.createdAt.localeCompare(document.createdAt) < 0
        ? existing.createdAt
        : document.createdAt
  });
}

function filterLibraryDocuments(
  documents: LibraryDocument[],
  filter: DocumentFilter,
  query: string
) {
  const normalizedQuery = query.trim().toLowerCase();
  return documents.filter((document) => {
    if (filter === "recent" && !document.isRecent) {
      return false;
    }
    if (filter === "exports" && !document.exportRecord) {
      return false;
    }
    if (filter === "debug" && document.source !== "debug") {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }

    return `${document.title} ${document.filePath}`.toLowerCase().includes(normalizedQuery);
  });
}

function exportRecordToDocument(record: BilingualExportHistoryRecord): LibraryDocument {
  return {
    id: `export-${record.id}`,
    title: documentSafeTitle(record.title, record.filePath),
    filePath: record.filePath,
    fileType: record.fileType,
    pageCount: record.pageCount,
    sourceLabel: record.sourceLanguageLabel,
    translationLabel: record.targetLanguageLabel,
    source: "export",
    isRecent: false,
    lastOpenedAt: record.createdAt,
    createdAt: record.createdAt,
    exportRecord: record
  };
}

function recentRecordToDocument(record: RecentDocumentRecord): LibraryDocument {
  return {
    id: `recent-${record.id}`,
    title: documentSafeTitle(record.title, record.filePath),
    filePath: record.filePath,
    fileType: record.fileType,
    pageCount: record.pageCount,
    sourceLabel: record.sourceLabel,
    translationLabel: record.translationLabel,
    source: record.source,
    isRecent: true,
    lastOpenedAt: record.lastOpenedAt,
    createdAt: record.createdAt
  };
}

function debugPathToDocument(settings: AppSettings): LibraryDocument {
  const now = new Date().toISOString();
  return {
    id: `debug-${settings.debugPdfPath}`,
    title: documentBasename(settings.debugPdfPath),
    filePath: settings.debugPdfPath,
    fileType: "pdf",
    pageCount: 0,
    sourceLabel: settings.learningProfile.targetLanguage.nameEn,
    translationLabel: settings.learningProfile.nativeLanguage.nameEn,
    source: "debug",
    isRecent: false,
    lastOpenedAt: now,
    createdAt: now
  };
}

function libraryDocumentToArtifact(document: LibraryDocument): BilingualReaderArtifact {
  return {
    id: document.exportRecord?.id ?? document.id,
    title: document.title,
    filePath: document.filePath,
    fileType: document.fileType,
    sourceLabel: document.sourceLabel,
    translationLabel: document.translationLabel,
    pageCount: document.pageCount,
    createdAt: document.createdAt
  };
}

function sameDocument(
  leftPath: string,
  rightPath: string,
  leftFileType: "pdf" | "html",
  rightFileType: "pdf" | "html"
) {
  return documentKey(leftPath, leftFileType) === documentKey(rightPath, rightFileType);
}

function documentKey(filePath: string, fileType: "pdf" | "html") {
  return `${fileType}:${filePath.trim().toLowerCase()}`;
}

function sourceTranslationKey(source: RecentDocumentRecord["source"]) {
  if (source === "export") {
    return "documentLibrary.sources.export" as const;
  }
  if (source === "manual") {
    return "documentLibrary.sources.manual" as const;
  }
  if (source === "debug") {
    return "documentLibrary.sources.debug" as const;
  }
  return "documentLibrary.sources.recent" as const;
}
