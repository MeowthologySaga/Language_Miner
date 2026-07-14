import { app, dialog, shell, type BrowserWindow, type OpenDialogOptions } from "electron";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PDFDocument } from "pdf-lib";
import type {
  BilingualExportHistoryRecord,
  BilingualPdfExportInput,
  BilingualPdfExportResult,
  BilingualReaderArtifact,
  ListeningLocalVideoFolder,
  ListeningLocalVideoFile,
  PdfFileReadResult,
  TextFileReadResult
} from "../src/shared/types";
import { electronText, type ElectronAppLocale } from "./appDialogLocalization";

const LOCAL_VIDEO_EXTENSIONS = new Set([".mp4", ".mkv", ".mov", ".webm", ".avi", ".m4v"]);
const MAX_RENDERER_PDF_BYTES = 250 * 1024 * 1024;

export function readPdfFile(filePath: string): PdfFileReadResult | null {
  const normalizedPath = filePath.trim();
  if (!normalizedPath) {
    return null;
  }

  if (path.extname(normalizedPath).toLowerCase() !== ".pdf") {
    throw new Error("Only PDF files can be opened as debug PDFs.");
  }

  if (!fs.existsSync(normalizedPath)) {
    throw new Error(`PDF file not found: ${normalizedPath}`);
  }
  const stats = fs.statSync(normalizedPath);
  if (!stats.isFile() || stats.size > MAX_RENDERER_PDF_BYTES) {
    throw new Error("PDF files larger than 250 MB must be split before opening.");
  }

  const data = fs.readFileSync(normalizedPath);
  return {
    fileName: path.basename(normalizedPath),
    filePath: normalizedPath,
    data
  };
}

export async function pickReaderArtifact(
  ownerWindow: BrowserWindow | null,
  locale: ElectronAppLocale = "ko"
): Promise<BilingualReaderArtifact | null> {
  const options: OpenDialogOptions = {
    title: electronText(locale, "readerDocumentTitle"),
    properties: ["openFile"],
    filters: [
      {
        name: electronText(locale, "readerDocumentFilter"),
        extensions: ["pdf", "html", "htm"]
      }
    ]
  };
  const result = ownerWindow
    ? await dialog.showOpenDialog(ownerWindow, options)
    : await dialog.showOpenDialog(options);
  const filePath = result.filePaths[0];
  if (result.canceled || !filePath) {
    return null;
  }

  return createReaderArtifactFromFilePath(filePath);
}

export async function pickLocalVideoFile(
  ownerWindow: BrowserWindow | null,
  initialFolderPath?: string,
  locale: ElectronAppLocale = "ko"
): Promise<ListeningLocalVideoFile | null> {
  const options: OpenDialogOptions = {
    title: electronText(locale, "localVideoTitle"),
    properties: ["openFile"],
    defaultPath: normalizeExistingDirectory(initialFolderPath),
    filters: [
      {
        name: electronText(locale, "localVideoFilter"),
        extensions: ["mp4", "mkv", "mov", "webm", "avi", "m4v"]
      }
    ]
  };
  const result = ownerWindow
    ? await dialog.showOpenDialog(ownerWindow, options)
    : await dialog.showOpenDialog(options);
  const filePath = result.filePaths[0];
  if (result.canceled || !filePath) {
    return null;
  }

  return {
    filePath,
    fileName: path.basename(filePath),
    title: path.basename(filePath, path.extname(filePath)),
    fileUrl: pathToFileURL(filePath).toString(),
    folderPath: path.dirname(filePath)
  };
}

export function listLocalVideoFolderVideos(folderPath: string): ListeningLocalVideoFile[] {
  const normalizedPath = normalizeExistingDirectory(folderPath);
  if (!normalizedPath) {
    return [];
  }
  return fs
    .readdirSync(normalizedPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && LOCAL_VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => {
      const filePath = path.join(normalizedPath, entry.name);
      return {
        filePath,
        fileName: entry.name,
        title: path.basename(entry.name, path.extname(entry.name)),
        fileUrl: pathToFileURL(filePath).toString(),
        folderPath: normalizedPath
      };
    })
    .sort((left, right) =>
      left.fileName.localeCompare(right.fileName, undefined, {
        numeric: true,
        sensitivity: "base"
      })
    );
}

export async function pickLocalVideoFolder(
  ownerWindow: BrowserWindow | null,
  locale: ElectronAppLocale = "ko"
): Promise<ListeningLocalVideoFolder | null> {
  const options: OpenDialogOptions = {
    title: electronText(locale, "localVideoFolderTitle"),
    properties: ["openDirectory"]
  };
  const result = ownerWindow
    ? await dialog.showOpenDialog(ownerWindow, options)
    : await dialog.showOpenDialog(options);
  const folderPath = result.filePaths[0];
  if (result.canceled || !folderPath) {
    return null;
  }

  return {
    folderPath,
    folderName: path.basename(folderPath) || folderPath,
    createdAt: new Date().toISOString()
  };
}

function normalizeExistingDirectory(folderPath: string | undefined) {
  const normalizedPath = folderPath?.trim();
  if (!normalizedPath) {
    return undefined;
  }
  try {
    return fs.existsSync(normalizedPath) && fs.statSync(normalizedPath).isDirectory()
      ? normalizedPath
      : undefined;
  } catch {
    return undefined;
  }
}

export async function createReaderArtifactFromFilePath(
  filePath: string
): Promise<BilingualReaderArtifact> {
  const normalizedPath = filePath.trim();
  const extension = path.extname(normalizedPath).toLowerCase();
  const fileType = extension === ".pdf" ? "pdf" : "html";
  if (![".pdf", ".html", ".htm"].includes(extension)) {
    throw new Error("Only PDF or HTML documents can be added as recent reader documents.");
  }
  if (!fs.existsSync(normalizedPath)) {
    throw new Error(`Document not found: ${normalizedPath}`);
  }

  const createdAt = new Date().toISOString();
  return {
    id: `manual-${createdAt}-${normalizedPath}`,
    title: path.basename(normalizedPath),
    filePath: normalizedPath,
    fileType,
    sourceLabel: "English",
    translationLabel: "Korean",
    pageCount: fileType === "pdf" ? await countPdfPages(normalizedPath) : 1,
    createdAt
  };
}

export async function countPdfPages(filePath: string) {
  try {
    if (fs.statSync(filePath).size > MAX_RENDERER_PDF_BYTES) return 0;
    const pdf = await PDFDocument.load(fs.readFileSync(filePath), { ignoreEncryption: true });
    return pdf.getPageCount();
  } catch {
    return 0;
  }
}

export function readTextFile(filePath: string): TextFileReadResult | null {
  const normalizedPath = filePath.trim();
  if (!normalizedPath) {
    return null;
  }

  const extension = path.extname(normalizedPath).toLowerCase();
  if (![".html", ".htm", ".txt"].includes(extension)) {
    throw new Error("Only HTML or text files can be opened in the finished reader.");
  }

  if (!fs.existsSync(normalizedPath)) {
    throw new Error(`File not found: ${normalizedPath}`);
  }

  return {
    fileName: path.basename(normalizedPath),
    filePath: normalizedPath,
    text: fs.readFileSync(normalizedPath, "utf8")
  };
}

export async function redownloadExport(
  record: BilingualExportHistoryRecord
): Promise<BilingualPdfExportResult> {
  if (!record.filePath || !fs.existsSync(record.filePath)) {
    throw new Error(
      "The existing export file cannot be found. It may have been moved or deleted."
    );
  }

  const extension = record.fileType === "pdf" ? "pdf" : "html";
  const downloadPath = getAutoRedownloadFilePath(record, extension);

  if (path.resolve(record.filePath) !== path.resolve(downloadPath)) {
    fs.copyFileSync(record.filePath, downloadPath);
  }

  return {
    filePath: downloadPath,
    fileType: record.fileType,
    pageCount: record.pageCount,
    segmentCount: record.segmentCount
  };
}

export async function openExportPath(filePath: string) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error("The file cannot be found.");
  }

  const errorMessage = await shell.openPath(filePath);
  if (errorMessage) {
    throw new Error(errorMessage);
  }

  return true;
}

export async function revealExportPath(filePath: string) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error("The file cannot be found for folder reveal.");
  }

  shell.showItemInFolder(filePath);
  return true;
}

export function getAutoBilingualExportFilePath(input: BilingualPdfExportInput) {
  const downloadsPath = app.getPath("downloads");
  fs.mkdirSync(downloadsPath, { recursive: true });
  const title = sanitizeFileName(input.title) || "bilingual-translation";
  const pageSuffix = formatPageNumbersForFileName(
    input.pages.map((page) => page.pageNumber)
  );
  const baseName = [title, pageSuffix, "dual"].filter(Boolean).join("-");
  return getUniqueFilePath(path.join(downloadsPath, `${baseName}.pdf`));
}

export function getAutoRedownloadFilePath(
  record: BilingualExportHistoryRecord,
  extension: "pdf" | "html"
) {
  const downloadsPath = app.getPath("downloads");
  fs.mkdirSync(downloadsPath, { recursive: true });
  const title = sanitizeFileName(record.title) || "bilingual-translation";
  const rangeSuffix = sanitizeFileName(record.pageRange.replace(/\s+/g, "")) || "export";
  return getUniqueFilePath(path.join(downloadsPath, `${title}-${rangeSuffix}-copy.${extension}`));
}

export function getQaExportFilePath(input: BilingualPdfExportInput) {
  const exportDir = process.env.LM_QA_EXPORT_DIR;
  if (!process.env.LM_QA_BOOK_MAKER || !exportDir) {
    return undefined;
  }

  const resolvedExportDir = resolveFromCwd(exportDir);
  fs.mkdirSync(resolvedExportDir, { recursive: true });
  const title = sanitizeFileName(input.title) || "bilingual-translation";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(resolvedExportDir, `${title}-${timestamp}-dual.pdf`);
}

export function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").trim();
}

export function formatPageNumbersForFileName(pageNumbers: number[]) {
  const normalized = Array.from(new Set(pageNumbers))
    .filter((pageNumber) => Number.isInteger(pageNumber) && pageNumber > 0)
    .sort((left, right) => left - right);

  if (normalized.length === 0) {
    return "";
  }

  const first = normalized[0];
  const last = normalized[normalized.length - 1];
  const isContiguous = normalized.every((pageNumber, index) => pageNumber === first + index);
  if (isContiguous) {
    return first === last ? `p${first}` : `p${first}-${last}`;
  }

  if (normalized.length <= 4) {
    return `p${normalized.join("-")}`;
  }

  return `p${first}-${last}-${normalized.length}pages`;
}

export function getUniqueFilePath(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return filePath;
  }

  const parsedPath = path.parse(filePath);
  for (let index = 2; index < 1000; index += 1) {
    const candidate = path.join(parsedPath.dir, `${parsedPath.name}-${index}${parsedPath.ext}`);
    if (!fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return path.join(parsedPath.dir, `${parsedPath.name}-${Date.now()}${parsedPath.ext}`);
}

function resolveFromCwd(value: string) {
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}
