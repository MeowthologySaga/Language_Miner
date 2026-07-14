import "../styles/documentManagement.css";
import "../styles/pdfReaderShell.css";
import "../styles/pdfTools.css";
import { BookOpen, Bookmark, Clock } from "lucide-react";
import { BilingualArtifactReader } from "../components/BilingualArtifactReader";
import { PDFSelectionReader } from "../components/PDFSelectionReader";
import type { LocalEnglishMinerApi } from "../data/api";
import type { LLMProvider } from "../services/llm/types";
import type { AppSettings, BilingualReaderArtifact, RecentDocumentRecord } from "../shared/types";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookmarksPage } from "./BookmarksPage";
import { DocumentLibraryPage } from "./DocumentLibraryPage";
import { readerBookmarkToArtifact } from "../readerBookmarks";

type PdfReaderPane = "reader" | "library" | "bookmarks";

type PdfReaderPageProps = {
  api: LocalEnglishMinerApi;
  artifact: BilingualReaderArtifact | null;
  initialPane?: PdfReaderPane;
  provider: LLMProvider;
  recentDocuments: RecentDocumentRecord[];
  settings: AppSettings;
  onCardsChanged: () => Promise<void>;
  onNavigate: (route: "bookMaker") => void;
  onOpenReaderArtifact: (
    artifact: BilingualReaderArtifact,
    source?: RecentDocumentRecord["source"]
  ) => void;
  onRecentDocumentsChange: (records: RecentDocumentRecord[]) => void;
  onSettingsChange: (settings: AppSettings) => void;
};

export function PdfReaderPage({
  api,
  artifact,
  initialPane = "reader",
  provider,
  recentDocuments,
  settings,
  onCardsChanged,
  onNavigate,
  onOpenReaderArtifact,
  onRecentDocumentsChange,
  onSettingsChange
}: PdfReaderPageProps) {
  const { t } = useTranslation();
  const [readerMode, setReaderMode] = useState<"finished" | "live">("finished");
  const [readerPane, setReaderPane] = useState<PdfReaderPane>(initialPane);

  useEffect(() => {
    setReaderPane(initialPane);
  }, [initialPane]);

  function openReaderArtifact(
    nextArtifact: BilingualReaderArtifact,
    source?: RecentDocumentRecord["source"]
  ) {
    onOpenReaderArtifact(nextArtifact, source);
    setReaderPane("reader");
  }

  const workspaceTabs = (
    <div aria-label={t("pdfReaderShell.workspaceLabel")} className="segmented-control reader-workspace-tabs" role="group">
      <button
        aria-pressed={readerPane === "reader"}
        className={readerPane === "reader" ? "active" : ""}
        data-qa="pdf-reader-pane-reader"
        type="button"
        onClick={() => setReaderPane("reader")}
      >
        <BookOpen size={15} />
        {t("pdfReaderShell.reader")}
      </button>
      <button
        aria-pressed={readerPane === "library"}
        className={readerPane === "library" ? "active" : ""}
        data-qa="pdf-reader-pane-library"
        type="button"
        onClick={() => setReaderPane("library")}
      >
        <Clock size={15} />
        {t("pdfReaderShell.recent")}
      </button>
      <button
        aria-pressed={readerPane === "bookmarks"}
        className={readerPane === "bookmarks" ? "active" : ""}
        data-qa="pdf-reader-pane-bookmarks"
        type="button"
        onClick={() => setReaderPane("bookmarks")}
      >
        <Bookmark size={15} />
        {t("pdfReaderShell.bookmarks")}
      </button>
    </div>
  );

  const modeTabs = (
    <div aria-label={t("pdfReaderShell.modeLabel")} className="segmented-control reader-mode-tabs" role="group">
      <button
        aria-pressed={readerMode === "finished"}
        className={readerMode === "finished" ? "active" : ""}
        data-qa="pdf-reader-finished-tab"
        type="button"
        onClick={() => setReaderMode("finished")}
      >
        {t("pdfReaderShell.finished")}
      </button>
      <button
        aria-pressed={readerMode === "live"}
        className={readerMode === "live" ? "active" : ""}
        data-qa="pdf-reader-live-tab"
        type="button"
        onClick={() => setReaderMode("live")}
      >
        {t("pdfReaderShell.live")}
      </button>
    </div>
  );

  return (
    <div className="document-workspace reader-workspace document-reader-workspace">
      <div className="document-reader-shell">
        <div className="reader-mode-header document-reader-navigation">
          <div>
            <h1>{t("pdfReaderShell.title")}</h1>
            <span>{t("pdfReaderShell.description")}</span>
          </div>
          {workspaceTabs}
        </div>
        {readerPane === "reader" ? (
          <div className={`reader-mode-shell reader-mode-shell-${readerMode}`}>
            {readerMode === "finished" ? (
              <BilingualArtifactReader
                api={api}
                artifact={artifact}
                provider={provider}
                settings={settings}
                onCardsChanged={onCardsChanged}
                onOpenLiveTranslate={() => setReaderMode("live")}
                modeTabs={modeTabs}
              />
            ) : (
              <>
                <div className="reader-mode-header">
                  <div>
                    <h2>{t("pdfReaderShell.liveTitle")}</h2>
                    <span>{t("pdfReaderShell.liveDescription")}</span>
                  </div>
                  {modeTabs}
                </div>
                <PDFSelectionReader
                  api={api}
                  mode="reader"
                  provider={provider}
                  settings={settings}
                  onCardsChanged={onCardsChanged}
                  onSettingsChange={onSettingsChange}
                />
              </>
            )}
          </div>
        ) : null}
        {readerPane === "library" ? (
          <DocumentLibraryPage
            api={api}
            recentDocuments={recentDocuments}
            settings={settings}
            onNavigate={(route) => {
              if (route === "pdfReader") {
                setReaderPane("reader");
                return;
              }
              onNavigate(route);
            }}
            onOpenReaderArtifact={openReaderArtifact}
            onRecentDocumentsChange={onRecentDocumentsChange}
          />
        ) : null}
        {readerPane === "bookmarks" ? (
          <BookmarksPage
            profileId={settings.profileId}
            onOpenBookmark={(bookmark) => openReaderArtifact(readerBookmarkToArtifact(bookmark), "reader")}
            onNavigate={(route) => {
              setReaderPane(route === "documentLibrary" ? "library" : "reader");
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
