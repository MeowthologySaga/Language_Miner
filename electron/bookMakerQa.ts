import type { BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { TranslationProviderName } from "../src/shared/types";
import { serializeSafeDebugLogEntry } from "./safeDebugLog";

type BookMakerQaDocument = {
  name?: string;
  pdfPath: string;
  pageRange?: string;
  exportMode?: "reading" | "paper";
  showSourceHighlights?: boolean;
  bypassCache?: boolean;
  timeoutMs?: number;
  retryLimit?: number;
};

export type BookMakerQaConfig = {
  documents?: BookMakerQaDocument[];
  docs?: BookMakerQaDocument[];
  outputDir?: string;
  reportPath?: string;
  model?: string;
  baseUrl?: string;
  translationProviderName?: TranslationProviderName;
  localMtModel?: string;
  timeoutMs?: number;
  retryLimit?: number;
  systemWatts?: number;
  krwPerKwh?: number;
};

type BookMakerQaDomState = {
  done: boolean;
  progress: boolean;
  ready: boolean;
  recovery: boolean;
  errorText: string;
  jobText: string;
  bodyText: string;
};

type BookMakerQaDocumentReport = {
  name: string;
  pdfPath: string;
  pageRange: string;
  status: "passed" | "failed";
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
  retryAttempts: number;
  outputFiles: string[];
  finalState?: BookMakerQaDomState;
  error?: string;
};

let bookMakerQaHeartbeatPath = "";

export function appendBookMakerQaHeartbeat(payload: Record<string, unknown>) {
  if (!bookMakerQaHeartbeatPath) {
    return;
  }

  try {
    fs.mkdirSync(path.dirname(bookMakerQaHeartbeatPath), { recursive: true });
    const safeHeartbeat = JSON.parse(
      serializeSafeDebugLogEntry({
        time: new Date().toISOString(),
        ...payload
      })
    );
    fs.writeFileSync(
      bookMakerQaHeartbeatPath,
      `${JSON.stringify(safeHeartbeat, null, 2)}\n`,
      "utf8"
    );
  } catch {
    // Heartbeat writes must not affect the export job.
  }
}

export function readBookMakerQaConfig(): BookMakerQaConfig {
  const configPath = process.env.LM_QA_BOOK_MAKER_CONFIG;
  if (!configPath) {
    throw new Error("LM_QA_BOOK_MAKER_CONFIG is required for Book Maker QA.");
  }

  const resolvedConfigPath = resolveFromCwd(configPath);
  return JSON.parse(fs.readFileSync(resolvedConfigPath, "utf8")) as BookMakerQaConfig;
}

export function prepareBookMakerQaSettingsOverride(config: BookMakerQaConfig) {
  const override: Record<string, unknown> = {};
  if (config.translationProviderName) {
    override.translationProviderName = config.translationProviderName;
  }
  if (config.localMtModel) {
    override.localMtModel = config.localMtModel;
  }
  if (config.model || config.baseUrl) {
    override.translationProviderName = config.translationProviderName ?? "local";
  }
  if (config.model) {
    override.ollamaModel = config.model;
  }
  if (config.baseUrl) {
    override.ollamaBaseUrl = config.baseUrl;
  }

  if (Object.keys(override).length > 0) {
    process.env.LM_QA_APP_SETTINGS_JSON = JSON.stringify(override);
  }
}

export async function runBookMakerQa(window: BrowserWindow, config: BookMakerQaConfig) {
  const documents = config.documents ?? config.docs ?? [];
  if (documents.length === 0) {
    throw new Error("Book Maker QA config must include at least one document.");
  }

  const startedAt = new Date();
  const outputDir = resolveFromCwd(
    process.env.LM_QA_EXPORT_DIR ?? config.outputDir ?? path.join("debug", "qa", "exports")
  );
  const reportPath = resolveFromCwd(
    process.env.LM_QA_BOOK_MAKER_REPORT ??
      config.reportPath ??
      path.join("debug", "reports", `book-maker-electron-qa-${qaTimestamp()}.json`)
  );
  bookMakerQaHeartbeatPath = getBookMakerQaHeartbeatPath(reportPath);
  process.env.LM_QA_EXPORT_DIR = outputDir;
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });

  const documentReports: BookMakerQaDocumentReport[] = [];

  try {
    await waitForBookMakerQaSelector(window, '[data-qa="nav-bookMaker"]', 30_000);
    for (const [index, documentConfig] of documents.entries()) {
      const report = await runBookMakerQaDocument({
        window,
        documentConfig,
        outputDir,
        config,
        resetBeforeOpen: index > 0
      });
      documentReports.push(report);
    }
  } finally {
    await restoreBookMakerQaSettings(window);
  }

  const finishedAt = new Date();
  const elapsedMs = finishedAt.getTime() - startedAt.getTime();
  const report = {
    status: documentReports.every((documentReport) => documentReport.status === "passed")
      ? "passed"
      : "failed",
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    elapsedMs,
    outputDir,
    documents: documentReports,
    totals: {
      documents: documentReports.length,
      passed: documentReports.filter((documentReport) => documentReport.status === "passed").length,
      failed: documentReports.filter((documentReport) => documentReport.status === "failed").length
    },
    lastHeartbeat: readBookMakerQaHeartbeat(reportPath),
    energyEstimate: estimateQaEnergyCost(elapsedMs, config)
  };
  const safeReport = JSON.parse(serializeSafeDebugLogEntry(report));
  fs.writeFileSync(reportPath, `${JSON.stringify(safeReport, null, 2)}\n`, "utf8");

  if (report.status === "failed") {
    throw new Error(`Book Maker QA failed. Report: ${reportPath}`);
  }
}

async function runBookMakerQaDocument(input: {
  window: BrowserWindow;
  documentConfig: BookMakerQaDocument;
  outputDir: string;
  config: BookMakerQaConfig;
  resetBeforeOpen: boolean;
}): Promise<BookMakerQaDocumentReport> {
  const { window, documentConfig, outputDir, config, resetBeforeOpen } = input;
  const resolvedPdfPath = resolveFromCwd(documentConfig.pdfPath);
  const pageRange = documentConfig.pageRange ?? "1-30";
  const retryLimit = documentConfig.retryLimit ?? config.retryLimit ?? 3;
  const timeoutMs = documentConfig.timeoutMs ?? config.timeoutMs ?? 20 * 60 * 1000;
  const startedAt = new Date();
  const beforeFiles = new Set(listQaPdfOutputs(outputDir));
  let retryAttempts = 0;
  let finalState: BookMakerQaDomState | undefined;

  try {
    if (!fs.existsSync(resolvedPdfPath)) {
      throw new Error(`PDF not found: ${resolvedPdfPath}`);
    }

    await navigateToBookMakerQa(window);
    if (resetBeforeOpen) {
      await resetBookMakerQaDocument(window);
    }
    await attachPdfFileToBookMakerQa(window, resolvedPdfPath);
    await waitForBookMakerQaReady(window, timeoutMs);
    await configureBookMakerQaDocumentOptions(window, documentConfig, pageRange);
    await clickBookMakerQaStart(window);

    while (true) {
      finalState = await waitForBookMakerQaTerminalState(window, timeoutMs);
      if (finalState.done) {
        break;
      }

      if (finalState.recovery && retryAttempts < retryLimit) {
        retryAttempts += 1;
        await clickBookMakerQaRetry(window);
        continue;
      }

      throw new Error(
        finalState.errorText ||
          finalState.jobText ||
          `Book Maker did not finish after ${retryAttempts} retry attempts.`
      );
    }

    const finishedAt = new Date();
    return {
      name: documentConfig.name ?? path.basename(resolvedPdfPath),
      pdfPath: resolvedPdfPath,
      pageRange,
      status: "passed",
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      elapsedMs: finishedAt.getTime() - startedAt.getTime(),
      retryAttempts,
      outputFiles: listQaPdfOutputs(outputDir).filter((filePath) => !beforeFiles.has(filePath)),
      finalState
    };
  } catch (caught) {
    finalState ??= await getBookMakerQaDomState(window).catch(() => undefined);
    const finishedAt = new Date();
    return {
      name: documentConfig.name ?? path.basename(resolvedPdfPath),
      pdfPath: resolvedPdfPath,
      pageRange,
      status: "failed",
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      elapsedMs: finishedAt.getTime() - startedAt.getTime(),
      retryAttempts,
      outputFiles: listQaPdfOutputs(outputDir).filter((filePath) => !beforeFiles.has(filePath)),
      finalState,
      error: caught instanceof Error ? caught.message : String(caught)
    };
  }
}

async function navigateToBookMakerQa(window: BrowserWindow) {
  await executeQaScript(
    window,
    `
(() => {
  const button = document.querySelector('[data-qa="nav-bookMaker"]');
  if (!button) {
    throw new Error("Book Maker navigation button was not found.");
  }
  button.click();
  return true;
})()
`
  );
  await waitForBookMakerQaSelector(
    window,
    '[data-qa="book-maker-file-input"], [data-qa="book-maker-replace-file-input"], [data-qa="book-maker-new-pdf-button"]',
    30_000
  );
}

async function restoreBookMakerQaSettings(window: BrowserWindow) {
  await executeQaScript(
    window,
    `
(() => {
  const previousSettings = localStorage.getItem("lem:qa:previousSettings");
  if (previousSettings === "__null__") {
    localStorage.removeItem("lem:settings");
  } else if (previousSettings) {
    localStorage.setItem("lem:settings", previousSettings);
  }
  localStorage.removeItem("lem:qa:previousSettings");
  return true;
})()
`
  ).catch(() => undefined);
}

async function resetBookMakerQaDocument(window: BrowserWindow) {
  await executeQaScript(
    window,
    `
(() => {
  const resetButton = document.querySelector('[data-qa="book-maker-new-pdf-button"]');
  if (resetButton) {
    resetButton.click();
  }
  return true;
})()
`
  );
  await waitForBookMakerQaSelector(window, '[data-qa="book-maker-file-input"]', 30_000);
}

async function attachPdfFileToBookMakerQa(window: BrowserWindow, pdfPath: string) {
  const fileName = path.basename(pdfPath);
  const fileBase64 = fs.readFileSync(pdfPath).toString("base64");
  await executeQaScript(
    window,
    `
(() => {
  const input = document.querySelector('[data-qa="book-maker-file-input"], [data-qa="book-maker-replace-file-input"]');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Book Maker file input was not found.");
  }
  const binary = atob(${JSON.stringify(fileBase64)});
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const file = new File([bytes], ${JSON.stringify(fileName)}, { type: "application/pdf" });
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  Object.defineProperty(input, "files", { value: dataTransfer.files, configurable: true });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
})()
`
  );
}

async function configureBookMakerQaDocumentOptions(
  window: BrowserWindow,
  documentConfig: BookMakerQaDocument,
  pageRange: string
) {
  await executeQaScript(
    window,
    `
(() => {
  const details = document.querySelector('[data-qa="book-maker-advanced-settings"]');
  if (details instanceof HTMLDetailsElement) {
    details.open = true;
  }

  const setInputValue = (selector, value) => {
    const element = document.querySelector(selector);
    if (!(element instanceof HTMLInputElement)) {
      throw new Error("Missing input: " + selector);
    }
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    descriptor?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const setCheckboxValue = (selector, checked) => {
    if (typeof checked !== "boolean") {
      return;
    }
    const element = document.querySelector(selector);
    if (element instanceof HTMLInputElement && element.checked !== checked) {
      element.click();
    }
  };

  setInputValue('[data-qa="book-maker-page-range"]', ${JSON.stringify(pageRange)});
  setCheckboxValue('[data-qa="book-maker-cache-bypass"]', ${JSON.stringify(
    Boolean(documentConfig.bypassCache)
  )});
  setCheckboxValue('[data-qa="book-maker-source-highlights"]', ${JSON.stringify(
    documentConfig.showSourceHighlights
  )});

  const exportMode = ${JSON.stringify(documentConfig.exportMode)};
  if (exportMode) {
    const modeButton = document.querySelector('[data-qa="book-maker-export-mode-' + exportMode + '"]');
    if (modeButton instanceof HTMLButtonElement && !modeButton.classList.contains("active")) {
      modeButton.click();
    }
  }
  return true;
})()
`
  );
}

async function clickBookMakerQaStart(window: BrowserWindow) {
  await executeQaScript(
    window,
    `
(() => {
  const button = document.querySelector('[data-qa="book-maker-start-button"]');
  if (!(button instanceof HTMLButtonElement) || button.disabled) {
    throw new Error("Book Maker start button is not ready.");
  }
  button.click();
  return true;
})()
`
  );
}

async function clickBookMakerQaRetry(window: BrowserWindow) {
  await executeQaScript(
    window,
    `
(() => {
  const button = document.querySelector('[data-qa="book-maker-retry-failed-export"], [data-qa="book-maker-progress-retry-failed"]');
  if (!(button instanceof HTMLButtonElement) || button.disabled) {
    throw new Error("Book Maker retry button is not ready.");
  }
  button.click();
  return true;
})()
`
  );
}

async function waitForBookMakerQaReady(window: BrowserWindow, timeoutMs: number) {
  await waitForBookMakerQaSelector(
    window,
    '[data-qa="book-maker-start-button"]:not(:disabled)',
    timeoutMs
  );
}

async function waitForBookMakerQaTerminalState(window: BrowserWindow, timeoutMs: number) {
  const startedAt = Date.now();
  let lastState: BookMakerQaDomState | undefined;
  while (Date.now() - startedAt < timeoutMs) {
    lastState = await getBookMakerQaDomState(window);
    if (lastState.done || lastState.recovery || lastState.errorText) {
      return lastState;
    }
    await delay(1_000);
  }

  throw new Error(
    `Timed out waiting for Book Maker to finish. Last state: ${JSON.stringify(lastState)}`
  );
}

async function waitForBookMakerQaSelector(
  window: BrowserWindow,
  selector: string,
  timeoutMs: number
) {
  const startedAt = Date.now();
  let lastSnapshot: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    const found = await executeQaScript<boolean>(
      window,
      `Boolean(document.querySelector(${JSON.stringify(selector)}))`
    );
    if (found) {
      return;
    }
    lastSnapshot = await getBookMakerQaPageSnapshot(window).catch(() => undefined);
    await delay(250);
  }
  throw new Error(
    `Timed out waiting for selector: ${selector}. Snapshot: ${JSON.stringify(lastSnapshot)}`
  );
}

async function getBookMakerQaPageSnapshot(window: BrowserWindow) {
  return executeQaScript(window, `
(() => ({
  location: window.location.href,
  readyState: document.readyState,
  title: document.title,
  bodyText: (document.body?.innerText ?? "").replace(/\\s+/g, " ").trim().slice(0, 1000),
  bodyHtml: (document.body?.innerHTML ?? "").replace(/\\s+/g, " ").trim().slice(0, 1000)
}))()
`);
}

async function getBookMakerQaDomState(window: BrowserWindow): Promise<BookMakerQaDomState> {
  return executeQaScript<BookMakerQaDomState>(
    window,
    `
(() => {
  const exists = (selector) => Boolean(document.querySelector(selector));
  const text = (selector) =>
    document.querySelector(selector)?.textContent?.replace(/\\s+/g, " ").trim() ?? "";
  return {
    done: exists('[data-qa="book-maker-done"]'),
    progress: exists('[data-qa="book-maker-progress"]'),
    ready: exists('[data-qa="book-maker-start-button"]:not(:disabled)'),
    recovery: exists('[data-qa="book-maker-recovery"]'),
    errorText: text('[data-qa="pdf-error"]'),
    jobText: text('[data-qa="book-maker-job"]'),
    bodyText: (document.body?.innerText ?? "").replace(/\\s+/g, " ").trim().slice(0, 3000)
  };
})()
`
  );
}

function listQaPdfOutputs(outputDir: string) {
  if (!fs.existsSync(outputDir)) {
    return [];
  }

  return fs
    .readdirSync(outputDir)
    .filter((fileName) => fileName.toLowerCase().endsWith(".pdf"))
    .map((fileName) => path.join(outputDir, fileName))
    .sort();
}

function getBookMakerQaHeartbeatPath(reportPath: string) {
  return reportPath.replace(/\.json$/i, ".heartbeat.json");
}

function readBookMakerQaHeartbeat(reportPath: string) {
  const heartbeatPath = getBookMakerQaHeartbeatPath(reportPath);
  try {
    if (!fs.existsSync(heartbeatPath)) {
      return undefined;
    }
    return JSON.parse(fs.readFileSync(heartbeatPath, "utf8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function estimateQaEnergyCost(elapsedMs: number, config: BookMakerQaConfig) {
  const systemWatts = config.systemWatts ?? 350;
  const krwPerKwh = config.krwPerKwh ?? 200;
  const kWh = (systemWatts / 1000) * (elapsedMs / 3_600_000);
  return {
    method: "wall_clock_estimate",
    systemWatts,
    krwPerKwh,
    kWh: Math.round(kWh * 100_000) / 100_000,
    krw: Math.round(kWh * krwPerKwh * 10) / 10
  };
}

function resolveFromCwd(value: string) {
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

function qaTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function executeQaScript<T = unknown>(window: BrowserWindow, script: string): Promise<T> {
  return window.webContents.executeJavaScript(script, true) as Promise<T>;
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
