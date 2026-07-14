import { app, BrowserWindow, desktopCapturer, globalShortcut, screen } from "electron";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { DesktopOcrCaptureResult, DesktopOcrSelectionRect } from "../src/shared/types";
import { electronText, type ElectronAppLocale } from "./appDialogLocalization";

const DESKTOP_OCR_SHORTCUT = "CommandOrControl+Q";
const DESKTOP_OCR_MAX_TEXT_LENGTH = 3_000;
const DESKTOP_OCR_SCRIPT_NAME = "windows-ocr.ps1";
const DESKTOP_OCR_CAPTURE_TTL_MS = 60 * 60 * 1000;

let desktopOcrCaptureWindow: BrowserWindow | null = null;
let desktopOcrResultWindow: BrowserWindow | null = null;
let desktopOcrCaptureDisplay:
  | {
      id: number;
      bounds: Electron.Rectangle;
      scaleFactor: number;
    }
  | null = null;

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function unregisterDesktopOcrShortcut() {
  globalShortcut.unregister(DESKTOP_OCR_SHORTCUT);
}

export function registerDesktopOcrShortcut(
  getLocale: () => ElectronAppLocale = () => "ko",
  canStart: () => boolean = () => true
) {
  if (globalShortcut.isRegistered(DESKTOP_OCR_SHORTCUT)) {
    return true;
  }

  const registered = globalShortcut.register(DESKTOP_OCR_SHORTCUT, () => {
    if (!canStart()) return;
    void startDesktopOcrCapture(getLocale());
  });
  if (!registered) {
    console.warn(`Could not register desktop OCR shortcut: ${DESKTOP_OCR_SHORTCUT}`);
  }
  return registered;
}

export async function startDesktopOcrCapture(locale: ElectronAppLocale = "ko") {
  cleanupDesktopOcrCaptures();
  if (desktopOcrCaptureWindow && !desktopOcrCaptureWindow.isDestroyed()) {
    desktopOcrCaptureWindow.focus();
    return;
  }

  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);
  desktopOcrCaptureDisplay = {
    id: display.id,
    bounds: display.bounds,
    scaleFactor: display.scaleFactor || 1
  };

  const captureWindow = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  desktopOcrCaptureWindow = captureWindow;
  captureWindow.setAlwaysOnTop(true, "screen-saver");
  captureWindow.on("closed", () => {
    if (desktopOcrCaptureWindow !== captureWindow) return;
    desktopOcrCaptureWindow = null;
    desktopOcrCaptureDisplay = null;
  });
  await captureWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(createDesktopOcrOverlayHtml(locale))}`
  );
  if (captureWindow.isDestroyed() || desktopOcrCaptureWindow !== captureWindow) return;
  captureWindow.focus();
}

export function closeDesktopOcrCaptureWindow() {
  const captureWindow = desktopOcrCaptureWindow;
  desktopOcrCaptureWindow = null;
  desktopOcrCaptureDisplay = null;
  if (captureWindow && !captureWindow.isDestroyed()) {
    captureWindow.close();
  }
}

export function closeDesktopOcrWindowsForPrivacyDeletion() {
  const captureWindow = desktopOcrCaptureWindow;
  desktopOcrCaptureWindow = null;
  desktopOcrCaptureDisplay = null;
  if (captureWindow && !captureWindow.isDestroyed()) {
    captureWindow.destroy();
  }
  const resultWindow = desktopOcrResultWindow;
  desktopOcrResultWindow = null;
  if (resultWindow && !resultWindow.isDestroyed()) {
    resultWindow.destroy();
  }
}

export async function finishDesktopOcrSelection(
  rect: DesktopOcrSelectionRect,
  locale: ElectronAppLocale = "ko",
  signal?: AbortSignal
): Promise<DesktopOcrCaptureResult> {
  throwIfDesktopOcrAborted(signal);
  const displayInfo = desktopOcrCaptureDisplay;
  if (!displayInfo) {
    throw new Error(electronText(locale, "ocrDisplayUnavailable"));
  }

  const normalizedRect = normalizeDesktopOcrRect(rect, displayInfo.bounds);
  if (normalizedRect.width < 12 || normalizedRect.height < 12) {
    throw new Error(electronText(locale, "ocrAreaTooSmall"));
  }

  closeDesktopOcrCaptureWindow();
  await delay(180);
  throwIfDesktopOcrAborted(signal);

  const capturedImage = await captureDesktopOcrRegion(normalizedRect, displayInfo, locale);
  throwIfDesktopOcrAborted(signal);
  const createdAt = new Date().toISOString();
  let text = "";
  let message = electronText(locale, "ocrComplete");
  try {
    text = (await runWindowsOcr(capturedImage.filePath, locale, signal)).slice(
      0,
      DESKTOP_OCR_MAX_TEXT_LENGTH
    );
    if (!text.trim()) {
      message = electronText(locale, "ocrEmpty");
    }
  } catch {
    throwIfDesktopOcrAborted(signal);
    message = electronText(locale, "ocrFailed");
    console.warn("[desktop-ocr] OCR engine failed without exposing process output.");
  } finally {
    try {
      fs.unlinkSync(capturedImage.filePath);
    } catch {
      // Periodic TTL cleanup retries files still held by another process.
    }
  }

  const result: DesktopOcrCaptureResult = {
    id: randomUUID(),
    imageDataUrl: capturedImage.dataUrl,
    text: text.trim(),
    message,
    rect: normalizedRect,
    createdAt
  };
  throwIfDesktopOcrAborted(signal);
  await showDesktopOcrResultWindow(result, locale, signal);
  throwIfDesktopOcrAborted(signal);
  return result;
}

function normalizeDesktopOcrRect(
  rect: DesktopOcrSelectionRect,
  bounds: Electron.Rectangle
): DesktopOcrSelectionRect {
  const x = Math.max(0, Math.min(bounds.width, Math.round(rect.x)));
  const y = Math.max(0, Math.min(bounds.height, Math.round(rect.y)));
  const width = Math.max(0, Math.min(bounds.width - x, Math.round(rect.width)));
  const height = Math.max(0, Math.min(bounds.height - y, Math.round(rect.height)));
  return { x, y, width, height };
}

async function captureDesktopOcrRegion(
  rect: DesktopOcrSelectionRect,
  displayInfo: { id: number; bounds: Electron.Rectangle; scaleFactor: number },
  locale: ElectronAppLocale
) {
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: {
      width: Math.max(1, Math.round(displayInfo.bounds.width * displayInfo.scaleFactor)),
      height: Math.max(1, Math.round(displayInfo.bounds.height * displayInfo.scaleFactor))
    }
  });
  const source =
    sources.find((candidate) => candidate.display_id === String(displayInfo.id)) ??
    sources.find((candidate) => !candidate.thumbnail.isEmpty()) ??
    sources[0];
  if (!source || source.thumbnail.isEmpty()) {
    throw new Error(electronText(locale, "ocrScreenshotUnavailable"));
  }

  const image = source.thumbnail;
  const imageSize = image.getSize();
  const scaleX = imageSize.width / displayInfo.bounds.width;
  const scaleY = imageSize.height / displayInfo.bounds.height;
  const cropRect = {
    x: Math.max(0, Math.round(rect.x * scaleX)),
    y: Math.max(0, Math.round(rect.y * scaleY)),
    width: Math.max(1, Math.round(rect.width * scaleX)),
    height: Math.max(1, Math.round(rect.height * scaleY))
  };
  const cropped = image.crop(cropRect);
  const png = cropped.toPNG();
  const captureDir = getDesktopOcrDataDir();
  fs.mkdirSync(captureDir, { recursive: true });
  const filePath = path.join(captureDir, `desktop-ocr-${Date.now()}.png`);
  fs.writeFileSync(filePath, png);
  return {
    filePath,
    dataUrl: `data:image/png;base64,${png.toString("base64")}`
  };
}

async function runWindowsOcr(
  imagePath: string,
  locale: ElectronAppLocale,
  signal?: AbortSignal
) {
  throwIfDesktopOcrAborted(signal);
  if (process.platform !== "win32") {
    throw new Error(electronText(locale, "ocrWindowsOnly"));
  }

  const scriptPath = ensureWindowsOcrScript();
  const output = await execFileText("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
    imagePath
  ], signal);
  return output.replace(/\r\n/g, "\n").trim();
}

function ensureWindowsOcrScript() {
  const scriptDir = getDesktopOcrDataDir();
  fs.mkdirSync(scriptDir, { recursive: true });
  const scriptPath = path.join(scriptDir, DESKTOP_OCR_SCRIPT_NAME);
  fs.writeFileSync(scriptPath, createWindowsOcrPowerShellScript(), "utf8");
  return scriptPath;
}

function getDesktopOcrDataDir() {
  return path.join(app.getPath("userData"), "desktop-ocr");
}

export function cleanupDesktopOcrCaptures(
  now = Date.now(),
  maxAgeMs = DESKTOP_OCR_CAPTURE_TTL_MS
) {
  const captureDir = getDesktopOcrDataDir();
  if (!fs.existsSync(captureDir)) return 0;
  let removed = 0;
  for (const entry of fs.readdirSync(captureDir, { withFileTypes: true })) {
    if (!entry.isFile() || !/^desktop-ocr-\d+\.png$/i.test(entry.name)) continue;
    const filePath = path.join(captureDir, entry.name);
    try {
      if (now - fs.statSync(filePath).mtimeMs < maxAgeMs) continue;
      fs.unlinkSync(filePath);
      removed += 1;
    } catch {
      // Best-effort privacy cleanup; the next capture retries stale files.
    }
  }
  return removed;
}

function execFileText(file: string, args: string[], signal?: AbortSignal) {
  throwIfDesktopOcrAborted(signal);
  return new Promise<string>((resolve, reject) => {
    execFile(
      file,
      args,
      {
        timeout: 20_000,
        signal,
        maxBuffer: 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (signal?.aborted) {
          reject(createDesktopOcrAbortError(signal));
          return;
        }
        if (error) {
          reject(new Error(stderr.trim() || error.message));
          return;
        }
        resolve(stdout);
      }
    );
  });
}

function createDesktopOcrAbortError(signal?: AbortSignal) {
  if (signal?.reason instanceof Error) return signal.reason;
  const error = new Error("Desktop OCR was canceled.");
  error.name = "AbortError";
  return error;
}

function throwIfDesktopOcrAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw createDesktopOcrAbortError(signal);
}

export async function showDesktopOcrResultWindow(
  result: DesktopOcrCaptureResult,
  locale: ElectronAppLocale,
  signal?: AbortSignal
) {
  throwIfDesktopOcrAborted(signal);
  const previousWindow = desktopOcrResultWindow;
  if (previousWindow && !previousWindow.isDestroyed()) {
    previousWindow.close();
  }

  const resultWindow = new BrowserWindow({
    width: 680,
    height: 720,
    minWidth: 520,
    minHeight: 520,
    title: electronText(locale, "externalOcrTitle"),
    alwaysOnTop: true,
    backgroundColor: "#f8fafc",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  desktopOcrResultWindow = resultWindow;
  resultWindow.on("closed", () => {
    if (desktopOcrResultWindow === resultWindow) {
      desktopOcrResultWindow = null;
    }
  });
  try {
    await resultWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(createDesktopOcrResultHtml(result, locale))}`
    );
    throwIfDesktopOcrAborted(signal);
    if (resultWindow.isDestroyed() || desktopOcrResultWindow !== resultWindow) {
      throw createDesktopOcrWindowClosedError();
    }
    resultWindow.show();
    resultWindow.focus();
  } catch (error) {
    if (desktopOcrResultWindow === resultWindow) {
      desktopOcrResultWindow = null;
    }
    if (!resultWindow.isDestroyed()) {
      resultWindow.destroy();
    }
    throw error;
  }
}

function createDesktopOcrWindowClosedError() {
  const error = new Error("Desktop OCR result window closed before it was ready.");
  error.name = "AbortError";
  return error;
}

function createDesktopOcrOverlayHtml(locale: ElectronAppLocale) {
  const text = {
    heading: electronText(locale, "ocrCaptureHeading"),
    hint: electronText(locale, "ocrCaptureHint"),
    ready: electronText(locale, "ocrCaptureReady"),
    areaTooSmall: electronText(locale, "ocrAreaTooSmall"),
    processing: electronText(locale, "ocrProcessing"),
    failed: electronText(locale, "ocrCaptureFailed")
  };
  const title = electronText(locale, "externalOcrTitle");
  return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      cursor: crosshair;
      user-select: none;
      font-family: "Segoe UI", system-ui, sans-serif;
      color: #ffffff;
      background: rgb(15 23 42 / 18%);
    }
    .hint {
      position: fixed;
      top: 18px;
      left: 50%;
      transform: translateX(-50%);
      border: 1px solid rgb(255 255 255 / 28%);
      border-radius: 10px;
      background: rgb(15 23 42 / 82%);
      padding: 12px 16px;
      box-shadow: 0 18px 50px rgb(0 0 0 / 28%);
      font-size: 14px;
      line-height: 1.45;
      text-align: center;
    }
    .selection {
      position: fixed;
      display: none;
      border: 2px solid #38bdf8;
      background: rgb(56 189 248 / 14%);
      box-shadow: 0 0 0 9999px rgb(15 23 42 / 34%);
    }
    .status {
      position: fixed;
      right: 18px;
      bottom: 18px;
      border-radius: 999px;
      background: rgb(15 23 42 / 82%);
      padding: 9px 12px;
      color: #dbeafe;
      font-size: 13px;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="hint"><strong>${escapeHtml(text.heading)}</strong><br />${escapeHtml(text.hint)}</div>
  <div class="selection" id="selection"></div>
  <div class="status" id="status" role="status" aria-live="polite">${escapeHtml(text.ready)}</div>
  <script>
    const OCR_TEXT = ${JSON.stringify(text)};
    const api = window.localEnglishMiner?.desktopCapture;
    const selectionEl = document.getElementById("selection");
    const statusEl = document.getElementById("status");
    let startPoint = null;
    let currentRect = null;

    function normalizeRect(a, b) {
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      return {
        x,
        y,
        width: Math.abs(a.x - b.x),
        height: Math.abs(a.y - b.y)
      };
    }

    function renderRect(rect) {
      selectionEl.style.display = "block";
      selectionEl.style.left = rect.x + "px";
      selectionEl.style.top = rect.y + "px";
      selectionEl.style.width = rect.width + "px";
      selectionEl.style.height = rect.height + "px";
    }

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        api?.cancelOcrSelection();
      }
    });

    window.addEventListener("mousedown", (event) => {
      if (event.button !== 0) {
        return;
      }
      startPoint = { x: event.clientX, y: event.clientY };
      currentRect = { x: event.clientX, y: event.clientY, width: 0, height: 0 };
      renderRect(currentRect);
    });

    window.addEventListener("mousemove", (event) => {
      if (!startPoint) {
        return;
      }
      currentRect = normalizeRect(startPoint, { x: event.clientX, y: event.clientY });
      renderRect(currentRect);
    });

    window.addEventListener("mouseup", async () => {
      if (!startPoint || !currentRect) {
        return;
      }
      const rect = currentRect;
      startPoint = null;
      if (rect.width < 12 || rect.height < 12) {
        selectionEl.style.display = "none";
        statusEl.textContent = OCR_TEXT.areaTooSmall;
        return;
      }
      statusEl.textContent = OCR_TEXT.processing;
      try {
        await api?.finishOcrSelection(rect);
      } catch (error) {
        statusEl.textContent = error instanceof Error && error.message
          ? error.message
          : OCR_TEXT.failed;
      }
    });
  </script>
</body>
</html>`;
}

function createDesktopOcrResultHtml(
  result: DesktopOcrCaptureResult,
  locale: ElectronAppLocale
) {
  const uiText = {
    close: electronText(locale, "ocrClose"),
    editableHint: electronText(locale, "ocrEditableHint"),
    manualCreate: electronText(locale, "ocrManualCreate"),
    recapture: electronText(locale, "ocrRecapture"),
    create: electronText(locale, "ocrCreate"),
    selectFirst: electronText(locale, "ocrSelectFirst"),
    creatingCard: electronText(locale, "ocrCreatingCard"),
    cardSaved: electronText(locale, "ocrCardSaved"),
    cardSaveUnknown: electronText(locale, "ocrCardSaveUnknown"),
    cardCreateFailed: electronText(locale, "ocrCardCreateFailed"),
    languageMismatchMarker: electronText(locale, "inputLanguageMismatchMarker"),
    mismatchTitle: electronText(locale, "ocrMismatchTitle"),
    forcePrompt: electronText(locale, "ocrProfileForcePrompt"),
    mismatchCancel: electronText(locale, "ocrMismatchCancel"),
    mismatchSaveAnyway: electronText(locale, "ocrMismatchSaveAnyway"),
    mismatchSaved: electronText(locale, "ocrMismatchSaved")
  };
  const title = electronText(locale, "externalOcrTitle");
  const text = escapeHtml(result.text || "");
  const message = escapeHtml(result.message);
  const image = result.imageDataUrl
    ? `<img src="${result.imageDataUrl}" alt="${escapeHtml(
        electronText(locale, "ocrCapturedImageAlt")
      )}" />`
    : "";
  return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      font-family: "Segoe UI", system-ui, sans-serif;
      color: #172033;
      background: #f8fafc;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #f8fafc;
    }
    .shell {
      display: grid;
      gap: 12px;
      padding: 16px;
    }
    header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }
    h1 {
      margin: 0;
      font-size: 20px;
    }
    .muted {
      color: #64748b;
      font-size: 13px;
      line-height: 1.45;
    }
    .capture-image {
      display: grid;
      place-items: center;
      max-height: 170px;
      overflow: hidden;
      border: 1px solid #dbe4ee;
      border-radius: 8px;
      background: #0f172a;
    }
    .capture-image img {
      max-width: 100%;
      max-height: 170px;
      object-fit: contain;
    }
    #ocrText {
      min-height: 260px;
      max-height: 360px;
      overflow: auto;
      white-space: pre-wrap;
      border: 1px solid #cbd8e8;
      border-radius: 8px;
      background: #ffffff;
      padding: 14px;
      outline: 0;
      font-size: 17px;
      line-height: 1.6;
    }
    #ocrText:focus {
      border-color: #93c5fd;
      box-shadow: 0 0 0 3px rgb(37 99 235 / 12%);
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    button {
      min-height: 36px;
      border: 1px solid #cbd8e8;
      border-radius: 8px;
      background: #ffffff;
      color: #172033;
      padding: 0 12px;
      font-weight: 800;
      cursor: pointer;
    }
    button.primary {
      border-color: #1769e0;
      background: #1769e0;
      color: #ffffff;
    }
    button.secondary {
      background: #eef3f8;
    }
    button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }
    .status {
      min-height: 22px;
      color: #166534;
      font-size: 13px;
      font-weight: 750;
    }
    .popover {
      position: fixed;
      z-index: 10;
      display: none;
      min-width: 190px;
      border: 1px solid #b9d3ff;
      border-radius: 10px;
      background: #ffffff;
      padding: 8px;
      box-shadow: 0 18px 44px rgb(15 23 42 / 18%);
    }
    .popover strong {
      display: block;
      max-width: 240px;
      overflow: hidden;
      color: #172033;
      font-size: 13px;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-bottom: 7px;
    }
    .popover button {
      width: 100%;
      justify-content: center;
    }
    dialog {
      width: min(430px, calc(100vw - 32px));
      border: 1px solid #d8e0ea;
      border-radius: 14px;
      background: #ffffff;
      color: #172033;
      padding: 0;
      box-shadow: 0 26px 80px rgb(15 23 42 / 28%);
    }
    dialog::backdrop {
      background: rgb(15 23 42 / 42%);
    }
    dialog form {
      padding: 22px;
    }
    dialog h2 {
      margin: 0 0 10px;
      font-size: 20px;
    }
    dialog p {
      margin: 0;
      color: #526173;
      line-height: 1.6;
      white-space: pre-line;
      overflow-wrap: anywhere;
    }
    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <div>
        <h1>${escapeHtml(title)}</h1>
        <div class="muted">${message}</div>
      </div>
      <button type="button" onclick="window.close()">${escapeHtml(uiText.close)}</button>
    </header>
    <div class="capture-image">${image}</div>
    <div class="muted">${escapeHtml(uiText.editableHint)}</div>
    <div id="ocrText" contenteditable="true" spellcheck="false">${text}</div>
    <div class="toolbar">
      <button class="primary" id="manualCreate" type="button">${escapeHtml(uiText.manualCreate)}</button>
      <button class="secondary" id="recapture" type="button">${escapeHtml(uiText.recapture)}</button>
    </div>
    <div class="status" id="status" role="status" aria-live="polite"></div>
  </div>
  <div class="popover" id="popover">
    <strong id="selectedPreview"></strong>
    <button class="primary" id="popoverCreate" type="button">${escapeHtml(uiText.create)}</button>
  </div>
  <dialog id="languageMismatchDialog" aria-labelledby="languageMismatchTitle" aria-describedby="languageMismatchMessage languageMismatchPrompt">
    <form method="dialog">
      <h2 id="languageMismatchTitle">${escapeHtml(uiText.mismatchTitle)}</h2>
      <p id="languageMismatchMessage"></p>
      <p id="languageMismatchPrompt">${escapeHtml(uiText.forcePrompt)}</p>
      <div class="dialog-actions">
        <button class="secondary" value="cancel">${escapeHtml(uiText.mismatchCancel)}</button>
        <button class="primary" value="override">${escapeHtml(uiText.mismatchSaveAnyway)}</button>
      </div>
    </form>
  </dialog>
  <script>
    const OCR_TEXT = ${JSON.stringify(uiText)};
    const api = window.localEnglishMiner?.desktopCapture;
    const ocrText = document.getElementById("ocrText");
    const popover = document.getElementById("popover");
    const selectedPreview = document.getElementById("selectedPreview");
    const statusEl = document.getElementById("status");
    const languageMismatchDialog = document.getElementById("languageMismatchDialog");
    const languageMismatchMessage = document.getElementById("languageMismatchMessage");
    let activeSelection = null;

    function confirmLanguageMismatch(message) {
      if (!(languageMismatchDialog instanceof HTMLDialogElement)) {
        return Promise.resolve(false);
      }
      languageMismatchMessage.textContent = message;
      return new Promise((resolve) => {
        languageMismatchDialog.addEventListener(
          "close",
          () => resolve(languageMismatchDialog.returnValue === "override"),
          { once: true }
        );
        languageMismatchDialog.returnValue = "cancel";
        languageMismatchDialog.showModal();
      });
    }

    function normalizeText(value) {
      return String(value || "").replace(/\\s+/g, " ").trim();
    }

    function getPlainText() {
      return normalizeText(ocrText.innerText || ocrText.textContent || "");
    }

    function getSelectionPayload() {
      const selection = window.getSelection();
      const selectedText = normalizeText(selection?.toString() || "");
      if (!selection || selection.rangeCount === 0 || !selectedText) {
        return null;
      }
      if (!ocrText.contains(selection.anchorNode) || !ocrText.contains(selection.focusNode)) {
        return null;
      }
      return {
        selectedText,
        sourceSentence: extractSentenceContext(getPlainText(), selectedText),
        ocrText: getPlainText(),
        rect: selection.getRangeAt(0).getBoundingClientRect()
      };
    }

    function extractSentenceContext(fullText, selectedText) {
      const text = normalizeText(fullText);
      const selected = normalizeText(selectedText);
      const index = text.toLowerCase().indexOf(selected.toLowerCase());
      if (index < 0) {
        return text || selected;
      }
      const left = text.slice(0, index);
      const right = text.slice(index + selected.length);
      const leftBoundary = Math.max(left.lastIndexOf("."), left.lastIndexOf("?"), left.lastIndexOf("!"), left.lastIndexOf("\\n"));
      const rightStops = [right.indexOf("."), right.indexOf("?"), right.indexOf("!"), right.indexOf("\\n")].filter((value) => value >= 0);
      const rightBoundary = rightStops.length ? Math.min(...rightStops) : Math.min(right.length, 260);
      const sentence = text.slice(leftBoundary + 1, index + selected.length + rightBoundary + 1).trim();
      return sentence || text || selected;
    }

    function updatePopover() {
      const payload = getSelectionPayload();
      activeSelection = payload;
      if (!payload) {
        popover.style.display = "none";
        return;
      }
      selectedPreview.textContent = payload.selectedText;
      popover.style.display = "block";
      popover.style.left = Math.min(window.innerWidth - 220, Math.max(10, payload.rect.left)) + "px";
      popover.style.top = Math.min(window.innerHeight - 90, Math.max(10, payload.rect.bottom + 8)) + "px";
    }

    async function createCardFromSelection() {
      const payload = activeSelection || getSelectionPayload();
      if (!payload) {
        statusEl.textContent = OCR_TEXT.selectFirst;
        return;
      }
      statusEl.textContent = OCR_TEXT.creatingCard;
      try {
        const card = await api?.createInputCard({
          selectedText: payload.selectedText,
          sourceSentence: payload.sourceSentence,
          ocrText: payload.ocrText
        });
        statusEl.textContent = card ? OCR_TEXT.cardSaved : OCR_TEXT.cardSaveUnknown;
        popover.style.display = "none";
      } catch (error) {
        const message = error instanceof Error && error.message
          ? error.message
          : OCR_TEXT.cardCreateFailed;
        if (
          message.startsWith(OCR_TEXT.languageMismatchMarker) &&
          await confirmLanguageMismatch(message)
        ) {
          const card = await api?.createInputCard({
            selectedText: payload.selectedText,
            sourceSentence: payload.sourceSentence,
            ocrText: payload.ocrText,
            languagePolicyOverride: true
          });
          statusEl.textContent = card ? OCR_TEXT.mismatchSaved : OCR_TEXT.cardSaveUnknown;
          popover.style.display = "none";
          return;
        }
        statusEl.textContent = message;
      }
    }

    document.addEventListener("selectionchange", () => {
      window.setTimeout(updatePopover, 0);
    });
    document.getElementById("manualCreate").addEventListener("click", createCardFromSelection);
    document.getElementById("popoverCreate").addEventListener("click", createCardFromSelection);
    document.getElementById("recapture").addEventListener("click", async () => {
      await api?.startOcrCapture();
      window.close();
    });
  </script>
</body>
</html>`;
}

function createWindowsOcrPowerShellScript() {
  return String.raw`param(
  [Parameter(Mandatory = $true)]
  [string]$Path
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Storage.FileAccessMode, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrResult, Windows.Media.Ocr, ContentType = WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType = WindowsRuntime]

function Await-WinRtOperation {
  param(
    [Parameter(Mandatory = $true)]
    $Operation,
    [Parameter(Mandatory = $true)]
    [Type]$ResultType
  )

  $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object {
      $_.Name -eq "AsTask" -and
      $_.IsGenericMethod -and
      $_.GetParameters().Count -eq 1
    } |
    Select-Object -First 1

  if ($null -eq $asTask) {
    throw "Could not find WindowsRuntimeSystemExtensions.AsTask"
  }

  $task = $asTask.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  $task.Wait()
  return $task.Result
}

$file = Await-WinRtOperation ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Path)) ([Windows.Storage.StorageFile])
$stream = Await-WinRtOperation ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
try {
  $decoder = Await-WinRtOperation ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await-WinRtOperation ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  if ($null -eq $engine) {
    $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new("en"))
  }
  if ($null -eq $engine) {
    throw "Windows OCR engine is not available"
  }
  $result = Await-WinRtOperation ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  Write-Output $result.Text
}
finally {
  if ($stream -ne $null) {
    $stream.Dispose()
  }
}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
