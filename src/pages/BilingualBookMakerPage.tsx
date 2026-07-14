import "../styles/pdfBookMaker.css";
import { History, Languages } from "lucide-react";
import { PDFSelectionReader } from "../components/PDFSelectionReader";
import type { LocalEnglishMinerApi } from "../data/api";
import type { AppSettings, BilingualReaderArtifact } from "../shared/types";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ExportHistoryPage } from "./ExportHistoryPage";

type BookMakerPane = "maker" | "history";

type BilingualBookMakerPageProps = {
  api: LocalEnglishMinerApi;
  initialPane?: BookMakerPane;
  settings: AppSettings;
  onKeepAliveChange?: (shouldKeepAlive: boolean) => void;
  onNavigate?: (route: "pdfReader") => void;
  onOpenReaderArtifact: (artifact: BilingualReaderArtifact) => void;
  onSettingsChange: (settings: AppSettings) => void;
};

export function BilingualBookMakerPage({
  api,
  initialPane = "maker",
  settings,
  onKeepAliveChange,
  onNavigate,
  onOpenReaderArtifact,
  onSettingsChange
}: BilingualBookMakerPageProps) {
  const { t } = useTranslation();
  const [pane, setPane] = useState<BookMakerPane>(initialPane);

  useEffect(() => {
    setPane(initialPane);
  }, [initialPane]);

  return (
    <div className="document-page maker-wizard-page">
      <div className="reader-mode-header maker-management-header">
        <div>
          {pane === "maker" ? (
            <h1>{t("pdfAuthoring.bookMaker.title")}</h1>
          ) : (
            <strong>{t("pdfAuthoring.bookMaker.title")}</strong>
          )}
          <span>{t("pdfAuthoring.bookMaker.description")}</span>
        </div>
        <div
          aria-label={t("pdfAuthoring.bookMaker.tabsLabel")}
          className="segmented-control maker-management-tabs"
          role="group"
        >
          <button
            aria-pressed={pane === "maker"}
            className={pane === "maker" ? "active" : ""}
            data-qa="book-maker-pane-maker"
            type="button"
            onClick={() => setPane("maker")}
          >
            <Languages size={15} />
            {t("pdfAuthoring.bookMaker.make")}
          </button>
          <button
            aria-pressed={pane === "history"}
            className={pane === "history" ? "active" : ""}
            data-qa="book-maker-pane-history"
            type="button"
            onClick={() => setPane("history")}
          >
            <History size={15} />
            {t("pdfAuthoring.bookMaker.history")}
          </button>
        </div>
      </div>
      {pane === "maker" ? (
        <div className="maker-workspace-shell">
          <PDFSelectionReader
            api={api}
            mode="maker"
            settings={settings}
            onMakerKeepAliveChange={onKeepAliveChange}
            onOpenReaderArtifact={onOpenReaderArtifact}
            onSettingsChange={onSettingsChange}
          />
        </div>
      ) : (
        <ExportHistoryPage
          api={api}
          onNavigate={(route) => {
            if (route === "bookMaker") {
              setPane("maker");
              return;
            }
            onNavigate?.("pdfReader");
          }}
          onOpenReaderArtifact={onOpenReaderArtifact}
        />
      )}
    </div>
  );
}
