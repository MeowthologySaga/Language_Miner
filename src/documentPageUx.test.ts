import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");
const librarySource = readSource("src", "pages", "DocumentLibraryPage.tsx");
const bookmarksSource = readSource("src", "pages", "BookmarksPage.tsx");
const historySource = readSource("src", "pages", "ExportHistoryPage.tsx");
const disclosureSource = readSource(
  "src",
  "components",
  "DocumentTechnicalDetails.tsx"
);

describe("public document page UX", () => {
  it("gives every document surface a unique translated h1", () => {
    expect(librarySource).toContain('<h1 id="document-library-title">');
    expect(bookmarksSource).toContain('<h1 id="bookmarks-title">');
    expect(historySource).toContain('<h1 id="export-history-title">');
    expect(historySource).toContain('import "../styles/documentManagement.css";');
    for (const source of [librarySource, bookmarksSource, historySource]) {
      expect(source).toContain("useTranslation");
      expect(source).not.toMatch(/>\s*[가-힣][^<{]*</);
    }
  });

  it("keeps local paths and technical errors behind an explicit disclosure", () => {
    expect(disclosureSource).toContain("<details");
    expect(disclosureSource).toContain('t("documents.technicalDetails")');
    expect(librarySource).toContain("documentBasename(document.filePath");
    expect(historySource).toContain("documentBasename(record.filePath");
    expect(librarySource).not.toContain("title={document.filePath}");
    expect(historySource).not.toContain("<span>{record.filePath}</span>");
  });

  it("announces loading, empty, success, and error states", () => {
    expect(disclosureSource).toContain('role={kind === "error" ? "alert" : "status"}');
    expect(librarySource).toContain('aria-busy={isLoading}');
    expect(bookmarksSource).toContain('aria-live="polite"');
    expect(historySource).toContain('aria-busy="true"');
  });
});
