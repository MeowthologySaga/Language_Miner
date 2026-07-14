import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createReaderArtifactFromFilePath,
  formatPageNumbersForFileName,
  getUniqueFilePath,
  readPdfFile,
  readTextFile,
  sanitizeFileName
} from "./documentFileActions";

describe("documentFileActions", () => {
  it("sanitizes file names and formats page lists for export paths", () => {
    expect(sanitizeFileName(' bad:/name*?.pdf ')).toBe("bad__name__.pdf");
    expect(formatPageNumbersForFileName([1, 2, 3])).toBe("p1-3");
    expect(formatPageNumbersForFileName([4, 1, 8])).toBe("p1-4-8");
    expect(formatPageNumbersForFileName([10, 12, 11, 99, 42])).toBe("p10-99-5pages");
    expect(formatPageNumbersForFileName([0, -1, 1.5])).toBe("");
  });

  it("finds an unused copy path next to an existing file", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "lem-doc-actions-"));
    try {
      const existingPath = path.join(tempDir, "export.pdf");
      writeFileSync(existingPath, "one");
      expect(getUniqueFilePath(existingPath)).toBe(path.join(tempDir, "export-2.pdf"));
      writeFileSync(path.join(tempDir, "export-2.pdf"), "two");
      expect(getUniqueFilePath(existingPath)).toBe(path.join(tempDir, "export-3.pdf"));
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("reads supported text and PDF files", () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "lem-doc-actions-"));
    try {
      const htmlPath = path.join(tempDir, "reader.html");
      const pdfPath = path.join(tempDir, "reader.pdf");
      writeFileSync(htmlPath, "<main>Hello</main>", "utf8");
      writeFileSync(pdfPath, new Uint8Array([37, 80, 68, 70]));

      expect(readTextFile(htmlPath)).toEqual({
        fileName: "reader.html",
        filePath: htmlPath,
        text: "<main>Hello</main>"
      });
      expect(readTextFile("")).toBeNull();
      expect(Array.from(readPdfFile(pdfPath)?.data ?? [])).toEqual([37, 80, 68, 70]);
      expect(readPdfFile("")).toBeNull();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("creates reader artifacts from existing HTML files", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "lem-doc-actions-"));
    try {
      const htmlPath = path.join(tempDir, "lesson.html");
      writeFileSync(htmlPath, "<main>Lesson</main>", "utf8");

      await expect(createReaderArtifactFromFilePath(htmlPath)).resolves.toMatchObject({
        title: "lesson.html",
        filePath: htmlPath,
        fileType: "html",
        sourceLabel: "English",
        translationLabel: "Korean",
        pageCount: 1
      });
      await expect(createReaderArtifactFromFilePath(path.join(tempDir, "bad.md"))).rejects.toThrow(
        "Only PDF or HTML"
      );
      expect(existsSync(htmlPath)).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
