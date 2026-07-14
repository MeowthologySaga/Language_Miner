import { BrowserWindow, desktopCapturer } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { AppSmokeQaWebReaderAccess } from "./appSmokeQa";
export async function captureAppSmokeScreenshot(
  window: BrowserWindow,
  reportPath: string,
  route: string,
  webReader: AppSmokeQaWebReaderAccess
) {
  const screenshotPath = reportPath.replace(
    /\.json$/i,
    route === "pdfHub" ? ".today-hub.png" : `.${route}.png`
  );
  const targetSelector =
    route === "pdfHub"
      ? '[data-qa="today-hub"]'
      : route === "webReader"
        ? ".web-reader-page"
        : ".listening-loop-main";
  await executeScreenshotScript(
    window,
    `
(() => {
  const target = document.querySelector(${JSON.stringify(targetSelector)});
  if (target instanceof HTMLElement) {
    target.scrollIntoView({ block: "start" });
  }
})()
`
  );
  if (route === "webReader") {
    await delay(2_500);
    try {
      await captureWebReaderViewProofScreenshot(screenshotPath, webReader);
    } catch {
      try {
        await captureDesktopWindowScreenshot(window, screenshotPath);
      } catch {
        await captureBrowserWindowPageScreenshot(window, screenshotPath);
      }
    }
    return screenshotPath;
  }
  await captureBrowserWindowPageScreenshot(window, screenshotPath);
  return screenshotPath;
}

async function captureBrowserWindowPageScreenshot(window: BrowserWindow, screenshotPath: string) {
  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  window.focus();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await delay(250);
    const bounds = window.getContentBounds();
    const image = await window.capturePage({
      x: 0,
      y: 0,
      width: Math.max(1, bounds.width),
      height: Math.max(1, bounds.height)
    });
    const png = image.toPNG();
    if (png.length > 0) {
      fs.writeFileSync(screenshotPath, png);
      return;
    }
  }
  throw new Error(`Failed to capture app smoke screenshot: ${screenshotPath}`);
}

export async function captureWebReaderViewProofScreenshot(
  screenshotPath: string,
  webReader: AppSmokeQaWebReaderAccess
) {
  await delay(1_000);
  const view = webReader.getView();
  if (!view || view.webContents.isDestroyed()) {
    throw new Error("Web Reader BrowserView is not available for proof screenshot.");
  }
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
  const withCaptureTimeout = async <T>(task: Promise<T>, label: string) =>
    Promise.race([
      task,
      new Promise<T>((_, reject) => {
        setTimeout(() => reject(new Error(`${label} timed out`)), 5_000);
      })
    ]);
  const savePng = (png: Buffer) => {
    if (png.length <= 0) {
      return false;
    }
    fs.writeFileSync(screenshotPath, png);
    return true;
  };

  let capturePageError = "";
  try {
    const image = await withCaptureTimeout(view.webContents.capturePage(), "capturePage");
    if (savePng(image.toPNG())) {
      return;
    }
  } catch (error) {
    capturePageError = error instanceof Error ? error.message : String(error);
  }

  let debuggerError = "";
  const devtools = view.webContents.debugger;
  let attachedHere = false;
  try {
    if (!devtools.isAttached()) {
      devtools.attach("1.3");
      attachedHere = true;
    }
    await withCaptureTimeout(devtools.sendCommand("Page.enable"), "debugger Page.enable");
    const result = (await withCaptureTimeout(
      devtools.sendCommand("Page.captureScreenshot", {
        captureBeyondViewport: false,
        format: "png",
        fromSurface: true
      }),
      "debugger Page.captureScreenshot"
    )) as { data?: string };
    const png = Buffer.from(result.data || "", "base64");
    if (savePng(png)) {
      return;
    }
  } catch (error) {
    debuggerError = error instanceof Error ? error.message : String(error);
  } finally {
    if (attachedHere && devtools.isAttached()) {
      devtools.detach();
    }
  }
  throw new Error(
    `Failed to capture Web Reader proof screenshot: ${screenshotPath}${
      capturePageError ? `; capturePage failed: ${capturePageError}` : ""
    }${
      debuggerError ? `; debugger fallback failed: ${debuggerError}` : ""
    }`
  );
}

function getNativeWindowHandleText(window: BrowserWindow) {
  try {
    const handle = window.getNativeWindowHandle();
    if (handle.length >= 8) {
      return handle.readBigUInt64LE(0).toString();
    }
    if (handle.length >= 4) {
      return String(handle.readUInt32LE(0));
    }
  } catch {
    // Source matching can fall back to the title.
  }
  return "";
}

function getWindowMediaSourceId(window: BrowserWindow) {
  try {
    const maybeGetMediaSourceId = (
      window as BrowserWindow & { getMediaSourceId?: () => string }
    ).getMediaSourceId;
    if (typeof maybeGetMediaSourceId === "function") {
      return maybeGetMediaSourceId.call(window);
    }
  } catch {
    // Fall through to alternate source matching.
  }
  return "";
}

export async function captureDesktopWindowScreenshot(window: BrowserWindow, screenshotPath: string) {
  if (window.isMinimized()) {
    window.restore();
  }
  const originalTitle = window.getTitle();
  const captureTitle = `${originalTitle || "Language Miner"} QA ${Date.now()}`;
  try {
    window.setTitle(captureTitle);
    window.show();
    window.focus();
    await delay(750);

    const bounds = window.getBounds();
    const mediaSourceId = getWindowMediaSourceId(window);
    const handleText = getNativeWindowHandleText(window);
    const title = window.getTitle();
    const sources = await desktopCapturer.getSources({
      types: ["window"],
      thumbnailSize: {
        width: Math.max(1, bounds.width),
        height: Math.max(1, bounds.height)
      },
      fetchWindowIcons: false
    });
    const source =
      sources.find((candidate) => mediaSourceId && candidate.id === mediaSourceId) ??
      sources.find((candidate) => candidate.name === title) ??
      sources.find((candidate) => handleText && candidate.id.includes(handleText)) ??
      sources.find((candidate) => candidate.name.includes("Language Miner"));

    if (!source || source.thumbnail.isEmpty()) {
      throw new Error(
        `Failed to capture desktop window screenshot. Sources: ${sources
          .map((candidate) => `${candidate.name} (${candidate.id})`)
          .slice(0, 20)
          .join(", ")}`
      );
    }

    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    fs.writeFileSync(screenshotPath, source.thumbnail.toPNG());
  } finally {
    if (originalTitle && !window.isDestroyed()) {
      window.setTitle(originalTitle);
    }
  }
}
async function executeScreenshotScript<T = unknown>(window: BrowserWindow, script: string): Promise<T> {
  return window.webContents.executeJavaScript(script, true) as Promise<T>;
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
