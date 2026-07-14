import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  exportBilingualPdf,
  fitPdfPageIntoRect,
  normalizePdfBytes,
  parseCssHexColor,
  parseCssRgba
} from "./bilingualPdfExport";
import type { BilingualPdfExportInput } from "../src/shared/types";

function createExportInput(): BilingualPdfExportInput {
  return {
    title: "Lesson / One",
    sourceLanguageLabel: "English",
    targetLanguageLabel: "Korean",
    pages: [
      {
        pageNumber: 1,
        segments: [
          {
            id: "segment-1",
            sourceText: "Hello world.",
            translationText: "Hello world translated."
          }
        ]
      }
    ]
  };
}

describe("bilingualPdfExport", () => {
  it("exports the rendered layout PDF through an injected window and cleans temp HTML", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "lem-bilingual-pdf-"));
    const exportFilePath = join(tempDir, "out.pdf");
    let loadedHtmlPath = "";
    let destroyed = false;

    try {
      const result = await exportBilingualPdf(createExportInput(), {
        createWindow: () => ({
          async loadFile(filePath) {
            loadedHtmlPath = filePath;
            expect(existsSync(filePath)).toBe(true);
          },
          webContents: {
            async printToPDF(options) {
              expect(options.printBackground).toBe(true);
              expect(options.preferCSSPageSize).toBe(true);
              return new Uint8Array([37, 80, 68, 70]);
            }
          },
          destroy() {
            destroyed = true;
          }
        }),
        exportFilePath,
        now: () => 123,
        tempDir
      });

      expect(result).toEqual({
        filePath: exportFilePath,
        fileType: "pdf",
        pageCount: 1,
        segmentCount: 1
      });
      expect(Array.from(readFileSync(exportFilePath))).toEqual([37, 80, 68, 70]);
      expect(destroyed).toBe(true);
      expect(loadedHtmlPath).toContain("Lesson - One-123.html");
      expect(existsSync(loadedHtmlPath)).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fits source pages inside the target rectangle without changing aspect ratio", () => {
    expect(fitPdfPageIntoRect(600, 800, 300, 300)).toEqual({
      x: 37.5,
      y: 0,
      width: 225,
      height: 300
    });
  });

  it("parses PDF highlight colors from CSS strings", () => {
    expect(parseCssHexColor("#336699")).toEqual({
      red: 0.2,
      green: 0.4,
      blue: 0.6
    });
    expect(parseCssHexColor("not-a-color")).toBeUndefined();

    expect(parseCssRgba("rgba(255, 127.5, 0, 0.25)")).toEqual({
      red: 1,
      green: 0.5,
      blue: 0,
      alpha: 0.25
    });
    expect(parseCssRgba("rgb(255, 0, 0)")).toBeUndefined();
  });

  it("normalizes PDF byte inputs from common IPC shapes", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(normalizePdfBytes(bytes)).toBe(bytes);
    expect(Array.from(normalizePdfBytes([4, 5, 6]) ?? [])).toEqual([4, 5, 6]);
    expect(Array.from(normalizePdfBytes(bytes.buffer) ?? [])).toEqual([1, 2, 3]);
    expect(
      Array.from(normalizePdfBytes(new DataView(new Uint8Array([7, 8]).buffer)) ?? [])
    ).toEqual([7, 8]);
    expect(normalizePdfBytes(null)).toBeUndefined();
  });
});
