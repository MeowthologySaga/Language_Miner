import type { BilingualReaderArtifact, ProfileId } from "./shared/types";

export const READER_BOOKMARKS_CHANGED_EVENT = "lem:reader-bookmarks-changed";

export type ReaderBookmark = {
  id: string;
  profileId: ProfileId;
  documentId: string;
  title: string;
  filePath: string;
  fileType: BilingualReaderArtifact["fileType"];
  sourceLabel: string;
  translationLabel: string;
  pageNumber: number;
  pageCount: number;
  createdAt: string;
  updatedAt: string;
};

export function getReaderBookmarksKey(profileId: ProfileId) {
  return `lem:readerBookmarks:${profileId}`;
}

export function readReaderBookmarks(storage: Storage, profileId: ProfileId): ReaderBookmark[] {
  try {
    const parsed = JSON.parse(storage.getItem(getReaderBookmarksKey(profileId)) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((value) => normalizeReaderBookmark(value, profileId))
      .filter((value): value is ReaderBookmark => Boolean(value))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch {
    return [];
  }
}

export function writeReaderBookmarks(
  storage: Storage,
  profileId: ProfileId,
  bookmarks: ReaderBookmark[]
) {
  const normalized = bookmarks
    .map((value) => normalizeReaderBookmark(value, profileId))
    .filter((value): value is ReaderBookmark => Boolean(value))
    .slice(0, 2_000);
  storage.setItem(getReaderBookmarksKey(profileId), JSON.stringify(normalized));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(READER_BOOKMARKS_CHANGED_EVENT, { detail: profileId }));
  }
}

export function upsertReaderBookmark(
  storage: Storage,
  bookmark: Omit<ReaderBookmark, "id" | "createdAt" | "updatedAt">,
  now = new Date().toISOString()
) {
  const id = `${bookmark.documentId}:${bookmark.pageNumber}`;
  const current = readReaderBookmarks(storage, bookmark.profileId);
  const previous = current.find((item) => item.id === id);
  const next: ReaderBookmark = {
    ...bookmark,
    id,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now
  };
  writeReaderBookmarks(storage, bookmark.profileId, [
    next,
    ...current.filter((item) => item.id !== id)
  ]);
  return next;
}

export function removeReaderBookmark(storage: Storage, profileId: ProfileId, bookmarkId: string) {
  writeReaderBookmarks(
    storage,
    profileId,
    readReaderBookmarks(storage, profileId).filter((bookmark) => bookmark.id !== bookmarkId)
  );
}

export function readerBookmarkToArtifact(bookmark: ReaderBookmark): BilingualReaderArtifact {
  return {
    id: bookmark.documentId,
    profileId: bookmark.profileId,
    title: bookmark.title,
    filePath: bookmark.filePath,
    fileType: bookmark.fileType,
    sourceLabel: bookmark.sourceLabel,
    translationLabel: bookmark.translationLabel,
    pageCount: bookmark.pageCount,
    initialPage: bookmark.pageNumber,
    createdAt: bookmark.createdAt
  };
}

function normalizeReaderBookmark(value: unknown, fallbackProfileId: ProfileId): ReaderBookmark | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ReaderBookmark>;
  const documentId = text(candidate.documentId, 240);
  const title = text(candidate.title, 500);
  const pageNumber = Math.max(1, Math.round(Number(candidate.pageNumber) || 0));
  if (!documentId || !title || !pageNumber) return null;
  const pageCount = Math.max(pageNumber, Math.round(Number(candidate.pageCount) || pageNumber));
  const profileId = text(candidate.profileId, 160) || fallbackProfileId;
  return {
    id: text(candidate.id, 500) || `${documentId}:${pageNumber}`,
    profileId,
    documentId,
    title,
    filePath: text(candidate.filePath, 4_000),
    fileType: candidate.fileType === "html" ? "html" : "pdf",
    sourceLabel: text(candidate.sourceLabel, 500) || "원문",
    translationLabel: text(candidate.translationLabel, 500) || "번역",
    pageNumber,
    pageCount,
    createdAt: iso(candidate.createdAt),
    updatedAt: iso(candidate.updatedAt)
  };
}

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function iso(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : new Date().toISOString();
}
