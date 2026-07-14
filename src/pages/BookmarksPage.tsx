import { BookOpen, Bookmark, Files, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DocumentNotice,
  DocumentTechnicalDetails,
  type DocumentNoticeValue
} from "../components/DocumentTechnicalDetails";
import { EmptyState } from "../components/EmptyState";
import {
  READER_BOOKMARKS_CHANGED_EVENT,
  readReaderBookmarks,
  removeReaderBookmark,
  type ReaderBookmark
} from "../readerBookmarks";
import {
  appLocaleFromLanguage,
  documentBasename,
  documentSafeTitle,
  formatDocumentDate,
  formatDocumentNumber
} from "../shared/documentPresentation";
import type { ProfileId } from "../shared/types";

type BookmarksPageProps = {
  profileId: ProfileId;
  onNavigate: (route: "documentLibrary" | "pdfReader") => void;
  onOpenBookmark: (bookmark: ReaderBookmark) => void;
};

export function BookmarksPage({ profileId, onNavigate, onOpenBookmark }: BookmarksPageProps) {
  const { i18n, t } = useTranslation();
  const appLocale = appLocaleFromLanguage(i18n.resolvedLanguage ?? i18n.language);
  const [bookmarks, setBookmarks] = useState(() => readReaderBookmarks(localStorage, profileId));
  const [status, setStatus] = useState<DocumentNoticeValue | null>(null);

  useEffect(() => {
    const refresh = () => setBookmarks(readReaderBookmarks(localStorage, profileId));
    refresh();
    window.addEventListener(READER_BOOKMARKS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(READER_BOOKMARKS_CHANGED_EVENT, refresh);
  }, [profileId]);

  function deleteBookmark(bookmark: ReaderBookmark) {
    removeReaderBookmark(localStorage, profileId, bookmark.id);
    setBookmarks(readReaderBookmarks(localStorage, profileId));
    setStatus({
      summary: t("bookmarks.messages.deleted", {
        title: documentSafeTitle(bookmark.title, bookmark.filePath)
      })
    });
  }

  return (
    <div className="document-page export-history-page">
      <section className="export-history-panel" aria-labelledby="bookmarks-title">
        <div className="document-section-heading">
          <div>
            <h1 id="bookmarks-title">{t("bookmarks.title")}</h1>
            <p>{t("bookmarks.description")}</p>
          </div>
          <button
            className="button primary reader-action"
            data-qa="bookmarks-open-reader"
            type="button"
            onClick={() => onNavigate("pdfReader")}
          >
            <BookOpen aria-hidden="true" size={16} />
            {t("bookmarks.actions.openReader")}
          </button>
        </div>
        <DocumentNotice kind="success" value={status} />
        {bookmarks.length ? (
          <div
            aria-label={t("bookmarks.listAria")}
            className="bookmark-record-list"
            data-qa="bookmarks-list"
            role="list"
          >
            {bookmarks.map((bookmark) => (
              <article className="bookmark-record" key={bookmark.id} role="listitem">
                <Bookmark aria-hidden="true" size={18} />
                <div>
                  <strong>{documentSafeTitle(bookmark.title, bookmark.filePath)}</strong>
                  <span>
                    {t("bookmarks.position", {
                      current: formatDocumentNumber(bookmark.pageNumber, appLocale),
                      total: formatDocumentNumber(bookmark.pageCount, appLocale)
                    })}
                    {" · "}
                    {formatDocumentDate(bookmark.updatedAt, appLocale)}
                  </span>
                  {bookmark.filePath ? (
                    <>
                      <small>{documentBasename(bookmark.filePath, bookmark.title)}</small>
                      <DocumentTechnicalDetails
                        items={[
                          { label: t("documents.localPath"), value: bookmark.filePath }
                        ]}
                      />
                    </>
                  ) : (
                    <small>{t("bookmarks.missingPath")}</small>
                  )}
                </div>
                <button
                  className="button secondary"
                  disabled={!bookmark.filePath}
                  type="button"
                  onClick={() => onOpenBookmark(bookmark)}
                >
                  {t("bookmarks.actions.openPage")}
                </button>
                <button
                  aria-label={t("bookmarks.actions.deleteAria", {
                    title: documentSafeTitle(bookmark.title, bookmark.filePath),
                    page: formatDocumentNumber(bookmark.pageNumber, appLocale)
                  })}
                  className="icon-button"
                  title={t("bookmarks.actions.delete")}
                  type="button"
                  onClick={() => deleteBookmark(bookmark)}
                >
                  <Trash2 aria-hidden="true" size={16} />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div aria-live="polite" role="status">
            <EmptyState
              className="document-empty-state"
              data-qa="bookmarks-empty-state"
              description={t("bookmarks.empty.description")}
              icon={<Bookmark aria-hidden="true" size={24} />}
              title={t("bookmarks.empty.title")}
              actions={
                <>
                  <button
                    className="button primary reader-action"
                    type="button"
                    onClick={() => onNavigate("pdfReader")}
                  >
                    <BookOpen aria-hidden="true" size={16} />
                    {t("bookmarks.actions.openReader")}
                  </button>
                  <button
                    className="button secondary"
                    data-qa="bookmarks-open-library"
                    type="button"
                    onClick={() => onNavigate("documentLibrary")}
                  >
                    <Files aria-hidden="true" size={16} />
                    {t("bookmarks.actions.openLibrary")}
                  </button>
                </>
              }
            />
          </div>
        )}
      </section>
    </div>
  );
}
