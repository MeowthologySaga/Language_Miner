import { describe, expect, it, vi } from "vitest";
import {
  readReaderBookmarks,
  readerBookmarkToArtifact,
  removeReaderBookmark,
  upsertReaderBookmark
} from "./readerBookmarks";

describe("readerBookmarks", () => {
  it("persists pages per profile and converts them back to reader artifacts", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    } as unknown as Storage;
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    const bookmark = upsertReaderBookmark(
      storage,
      {
        profileId: "profile-a",
        documentId: "doc-a",
        title: "A Book",
        filePath: "C:\\Books\\a.pdf",
        fileType: "pdf",
        sourceLabel: "English",
        translationLabel: "Korean",
        pageNumber: 7,
        pageCount: 20
      },
      "2026-07-13T00:00:00.000Z"
    );
    expect(readReaderBookmarks(storage, "profile-a")).toHaveLength(1);
    expect(readerBookmarkToArtifact(bookmark)).toMatchObject({ id: "doc-a", initialPage: 7 });
    removeReaderBookmark(storage, "profile-a", bookmark.id);
    expect(readReaderBookmarks(storage, "profile-a")).toEqual([]);
    vi.unstubAllGlobals();
  });
});
