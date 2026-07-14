import fs from "node:fs";
import path from "node:path";
import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import {
  buildBilingualDocumentHtml,
  getBilingualDocumentPageMap,
  getBilingualDocumentStats,
  getBilingualSourceHighlightsForPage
} from "../src/shared/bilingualExport";
import type { BilingualPdfExportInput, BilingualPdfExportResult } from "../src/shared/types";
import { serializeSafeDebugLogEntry } from "./safeDebugLog";

type BilingualPdfPrintToPdfOptions = {
  printBackground: boolean;
  preferCSSPageSize: boolean;
  margins: {
    marginType: "custom";
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
};

export type BilingualPdfExportWindow = {
  loadFile(filePath: string): Promise<void>;
  webContents: {
    printToPDF(options: BilingualPdfPrintToPdfOptions): Promise<Uint8Array>;
  };
  destroy(): void;
};

export type BilingualPdfExportDependencies = {
  createWindow(): BilingualPdfExportWindow;
  exportFilePath: string;
  tempDir: string;
  now?: () => number;
};

export async function exportBilingualPdf(
  input: BilingualPdfExportInput,
  dependencies: BilingualPdfExportDependencies
): Promise<BilingualPdfExportResult> {
  if (input.pages.length === 0) {
    throw new Error("No pages were provided for bilingual PDF export.");
  }

  const exportStats = getBilingualDocumentStats(input);
  if (exportStats.segmentCount === 0) {
    throw new Error("No translated segments were provided for bilingual PDF export.");
  }

  const sourcePdfBytes = getSourcePdfBytes(input);
  const html = buildBilingualDocumentHtml(
    sourcePdfBytes
      ? {
          ...input,
          omitSourceColumnContent: true,
          showSourceHighlights: false
        }
      : input
  );
  const htmlPath = path.join(
    dependencies.tempDir,
    `${sanitizeTempFileName(input.title) || "bilingual-translation"}-${dependencies.now?.() ?? Date.now()}.html`
  );
  const exportWindow = dependencies.createWindow();

  try {
    fs.writeFileSync(htmlPath, html, "utf8");
    await exportWindow.loadFile(htmlPath);
    const layoutPdfBuffer = await exportWindow.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      margins: {
        marginType: "custom",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0
      }
    });
    const pdfBuffer = await buildPdfWithSelectableSourcePages(input, layoutPdfBuffer, sourcePdfBytes);
    fs.writeFileSync(dependencies.exportFilePath, pdfBuffer);
  } finally {
    exportWindow.destroy();
    try {
      if (fs.existsSync(htmlPath)) {
        fs.unlinkSync(htmlPath);
      }
    } catch {
      // Temporary export HTML cleanup failure should not fail the PDF export.
    }
  }

  return {
    filePath: dependencies.exportFilePath,
    fileType: "pdf",
    pageCount: exportStats.pageCount,
    segmentCount: exportStats.segmentCount
  };
}

export async function buildPdfWithSelectableSourcePages(
  input: BilingualPdfExportInput,
  layoutPdfBuffer: Uint8Array,
  sourcePdfBytes = getSourcePdfBytes(input)
) {
  if (!sourcePdfBytes) {
    return layoutPdfBuffer;
  }

  try {
    const sourceDocument = await PDFDocument.load(sourcePdfBytes);
    const layoutDocument = await PDFDocument.load(layoutPdfBuffer);
    const outputDocument = await PDFDocument.create();
    const pageMap = getBilingualDocumentPageMap(input);
    const layoutPages = layoutDocument.getPages();

    for (let pageIndex = 0; pageIndex < layoutPages.length; pageIndex += 1) {
      const layoutPage = layoutPages[pageIndex];
      const layoutSize = layoutPage.getSize();
      const outputPage = outputDocument.addPage([layoutSize.width, layoutSize.height]);
      const sourceColumnWidth = layoutSize.width / 2;
      const pageMapEntry = pageMap[pageIndex];

      if (pageMapEntry?.kind === "cover") {
        const embeddedCover = await outputDocument.embedPage(layoutPage);
        outputPage.drawPage(embeddedCover, {
          x: 0,
          y: 0,
          width: layoutSize.width,
          height: layoutSize.height
        });
        continue;
      }

      if (pageMapEntry?.kind === "source" && pageMapEntry.sourcePageNumber) {
        await drawLayoutPdfHalf(outputDocument, outputPage, layoutPage, "right");
        const sourcePage = sourceDocument.getPages()[pageMapEntry.sourcePageNumber - 1];
        if (sourcePage) {
          const embeddedSourcePage = await outputDocument.embedPage(sourcePage);
          const sourceSize = sourcePage.getSize();
          const placement = fitPdfPageIntoRect(
            sourceSize.width,
            sourceSize.height,
            sourceColumnWidth,
            layoutSize.height
          );
          outputPage.drawPage(embeddedSourcePage, placement);
          if (input.showSourceHighlights) {
            drawSourceHighlights(outputPage, input, pageMapEntry.sourcePageNumber, placement);
          }
        } else {
          await drawLayoutPdfHalf(outputDocument, outputPage, layoutPage, "left");
        }
        continue;
      }

      const embeddedLayout = await outputDocument.embedPage(layoutPage);
      outputPage.drawPage(embeddedLayout, {
        x: 0,
        y: 0,
        width: layoutSize.width,
        height: layoutSize.height
      });
    }

    return await outputDocument.save();
  } catch (caught) {
    console.warn(
      "Falling back to image-based bilingual PDF export because source PDF composition failed.",
      serializeSafeDebugLogEntry({ error: caught })
    );
    return layoutPdfBuffer;
  }
}

function drawSourceHighlights(
  outputPage: PDFPage,
  input: BilingualPdfExportInput,
  sourcePageNumber: number,
  placement: { x: number; y: number; width: number; height: number }
) {
  const exportPage = input.pages.find((page) => page.pageNumber === sourcePageNumber);
  if (!exportPage) {
    return;
  }

  getBilingualSourceHighlightsForPage(exportPage).forEach((highlight) => {
    const background = parseCssRgba(highlight.background) ?? {
      red: 0.92,
      green: 0.28,
      blue: 0.6,
      alpha: 0.12
    };
    const border = parseCssHexColor(highlight.border) ?? {
      red: 0.92,
      green: 0.28,
      blue: 0.6
    };
    outputPage.drawRectangle({
      x: placement.x + highlight.rect.left * placement.width,
      y:
        placement.y +
        placement.height -
        (highlight.rect.top + highlight.rect.height) * placement.height,
      width: highlight.rect.width * placement.width,
      height: highlight.rect.height * placement.height,
      color: rgb(background.red, background.green, background.blue),
      opacity: background.alpha,
      borderColor: rgb(border.red, border.green, border.blue),
      borderOpacity: 0.72,
      borderWidth: 0.8
    });
  });
}

async function drawLayoutPdfHalf(
  outputDocument: PDFDocument,
  outputPage: ReturnType<PDFDocument["addPage"]>,
  layoutPage: ReturnType<PDFDocument["getPages"]>[number],
  side: "left" | "right"
) {
  const layoutSize = layoutPage.getSize();
  const halfWidth = layoutSize.width / 2;
  const left = side === "left" ? 0 : halfWidth;
  const embeddedHalf = await outputDocument.embedPage(layoutPage, {
    left,
    bottom: 0,
    right: left + halfWidth,
    top: layoutSize.height
  });
  outputPage.drawPage(embeddedHalf, {
    x: side === "left" ? 0 : halfWidth,
    y: 0,
    width: halfWidth,
    height: layoutSize.height
  });
}

export function fitPdfPageIntoRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number
) {
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: (targetWidth - width) / 2,
    y: (targetHeight - height) / 2,
    width,
    height
  };
}

export function parseCssHexColor(value: string) {
  const normalized = value.trim();
  const match = /^#([0-9a-f]{6})$/i.exec(normalized);
  if (!match) {
    return undefined;
  }

  const raw = match[1];
  return {
    red: Number.parseInt(raw.slice(0, 2), 16) / 255,
    green: Number.parseInt(raw.slice(2, 4), 16) / 255,
    blue: Number.parseInt(raw.slice(4, 6), 16) / 255
  };
}

export function parseCssRgba(value: string) {
  const match = /^rgba\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d?(?:\.\d+)?)\s*\)$/i.exec(
    value.trim()
  );
  if (!match) {
    return undefined;
  }

  return {
    red: clampUnit(Number(match[1]) / 255),
    green: clampUnit(Number(match[2]) / 255),
    blue: clampUnit(Number(match[3]) / 255),
    alpha: clampUnit(Number(match[4]))
  };
}

export function normalizePdfBytes(value: unknown) {
  if (!value) {
    return undefined;
  }

  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  if (Array.isArray(value)) {
    return new Uint8Array(value);
  }

  return undefined;
}

export function getSourcePdfBytes(input: BilingualPdfExportInput) {
  const inlineBytes = normalizePdfBytes(input.sourcePdfData);
  if (inlineBytes) {
    return inlineBytes;
  }

  const sourcePdfFilePath = input.sourcePdfFilePath?.trim();
  if (!sourcePdfFilePath) {
    return undefined;
  }

  try {
    return fs.readFileSync(sourcePdfFilePath);
  } catch {
    return undefined;
  }
}

function clampUnit(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function sanitizeTempFileName(value: string) {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}
