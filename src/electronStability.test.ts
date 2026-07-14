import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const electronMain = readFileSync(join(process.cwd(), "electron", "main.ts"), "utf8");
const preload = readFileSync(join(process.cwd(), "electron", "preload.ts"), "utf8");
const webReaderScripts = readFileSync(
  join(process.cwd(), "electron", "webReaderScripts.ts"),
  "utf8"
);
const webReaderLoginHardeningScript = readFileSync(
  join(process.cwd(), "electron", "webReaderLoginHardeningScript.ts"),
  "utf8"
);
const webReaderSelectionPopoverScript = readFileSync(
  join(process.cwd(), "electron", "webReaderSelectionPopoverScript.ts"),
  "utf8"
);
const webReaderLifeMiningScript = readFileSync(
  join(process.cwd(), "electron", "webReaderLifeMiningScript.ts"),
  "utf8"
);
const appSmokeQa = readFileSync(join(process.cwd(), "electron", "appSmokeQa.ts"), "utf8");
const appSmokeRoutes = readFileSync(
  join(process.cwd(), "electron", "appSmokeRoutes.ts"),
  "utf8"
);
const appSmokeScreenshots = readFileSync(
  join(process.cwd(), "electron", "appSmokeScreenshots.ts"),
  "utf8"
);
const webReaderQa = readFileSync(join(process.cwd(), "electron", "webReaderQa.ts"), "utf8");
const desktopOcr = readFileSync(join(process.cwd(), "electron", "desktopOcr.ts"), "utf8");
const listeningYoutubePlayerPage = readFileSync(
  join(process.cwd(), "electron", "listeningYoutubePlayerPage.ts"),
  "utf8"
);
const bilingualPdfExport = readFileSync(
  join(process.cwd(), "electron", "bilingualPdfExport.ts"),
  "utf8"
);
const documentFileActions = readFileSync(
  join(process.cwd(), "electron", "documentFileActions.ts"),
  "utf8"
);
const playZoneRuntimeWindow = readFileSync(
  join(process.cwd(), "electron", "playZoneRuntimeWindow.ts"),
  "utf8"
);
const playZonePage = readFileSync(
  join(process.cwd(), "src", "pages", "PlayZonePage.tsx"),
  "utf8"
);
const playZoneFileActions = readFileSync(
  join(process.cwd(), "electron", "playZoneFileActions.ts"),
  "utf8"
);
const listeningRssCandidates = readFileSync(
  join(process.cwd(), "electron", "listeningRssCandidates.ts"),
  "utf8"
);
const listeningVideoBridge = readFileSync(
  join(process.cwd(), "electron", "listeningVideoBridge.ts"),
  "utf8"
);
const bridgeInputUtils = readFileSync(
  join(process.cwd(), "electron", "bridgeInputUtils.ts"),
  "utf8"
);
const lifeMinerBridgeProtocol = readFileSync(
  join(process.cwd(), "electron", "lifeMinerBridgeProtocol.ts"),
  "utf8"
);
const lifeMinerBridgeState = readFileSync(
  join(process.cwd(), "electron", "lifeMinerBridgeState.ts"),
  "utf8"
);
const database = readFileSync(join(process.cwd(), "electron", "database.ts"), "utf8");
const databaseRows = readFileSync(join(process.cwd(), "electron", "databaseRows.ts"), "utf8");
const browserSentenceCards = readFileSync(
  join(process.cwd(), "electron", "browserSentenceCards.ts"),
  "utf8"
);
const webReaderLifeMiningState = readFileSync(
  join(process.cwd(), "electron", "webReaderLifeMiningState.ts"),
  "utf8"
);
const translationIpcHelpers = readFileSync(
  join(process.cwd(), "electron", "translationIpcHelpers.ts"),
  "utf8"
);

describe("Electron stability boundaries", () => {
  it("keeps Web Reader injection scripts outside the production main entrypoint", () => {
    expect(electronMain).toContain('from "./webReaderScripts"');
    expect(electronMain).not.toContain("const WEB_READER_SELECTION_POPOVER_SCRIPT = String.raw`");
    expect(electronMain).not.toContain(
      "function buildWebReaderLifeMiningScript(state: WebReaderLifeMiningState)"
    );

    expect(webReaderScripts).toContain('from "./webReaderLoginHardeningScript"');
    expect(webReaderScripts).toContain('from "./webReaderSelectionPopoverScript"');
    expect(webReaderScripts).toContain('from "./webReaderLifeMiningScript"');
    expect(webReaderScripts).not.toContain("const POPOVER_ID");
    expect(webReaderScripts).not.toContain("function normalizeText(value)");

    expect(webReaderLoginHardeningScript).toContain(
      "export function buildWebReaderLoginHardeningScript"
    );
    expect(webReaderLoginHardeningScript).not.toContain('from "./main"');

    expect(webReaderSelectionPopoverScript).toContain(
      "export const WEB_READER_SELECTION_POPOVER_SCRIPT"
    );
    expect(webReaderSelectionPopoverScript).toContain(
      "export function buildWebReaderSelectionPopoverScript"
    );
    expect(electronMain).toContain(
      "buildWebReaderSelectionPopoverScript(currentAppLocale)"
    );
    expect(webReaderSelectionPopoverScript).toContain("const POPOVER_SCRIPT_VERSION");
    expect(webReaderSelectionPopoverScript).toContain("api.version === POPOVER_SCRIPT_VERSION");
    expect(webReaderSelectionPopoverScript).toContain("version: POPOVER_SCRIPT_VERSION");
    expect(webReaderSelectionPopoverScript).toContain('document.querySelectorAll("#" + POPOVER_ID)');
    expect(webReaderSelectionPopoverScript).toContain("const POPOVER_ID");
    expect(webReaderSelectionPopoverScript).toContain("hide: dismissPopover");
    expect(webReaderSelectionPopoverScript).toContain("renderHighlightedResultText");
    expect(webReaderSelectionPopoverScript).toContain('card.highlightMappings, "source"');
    expect(webReaderSelectionPopoverScript).toContain('class="highlight highlight-');
    expect(webReaderSelectionPopoverScript).toContain("mark.highlight-red");
    expect(webReaderSelectionPopoverScript).not.toContain('from "./main"');

    expect(webReaderLifeMiningScript).toContain("export function buildWebReaderLifeMiningScript");
    expect(webReaderLifeMiningScript).toContain("WebReaderLifeMiningState");
    expect(webReaderLifeMiningScript).not.toContain('from "./main"');
  });

  it("gates QA-only IPC handlers and preload APIs behind the QA runtime flag", () => {
    expect(preload).toContain("const qaRuntime = isQaRuntime();");
    expect(preload).toContain("...(qaRuntime");
    expect(preload).toContain("testSelectionPopover");
    expect(preload).toContain("hidePopover");
    expect(preload).toContain("getPageTextSegments");
    expect(preload).toContain("applyPageTranslations");
    expect(preload).toContain("restorePageTranslations");
    expect(preload).toContain('ipcRenderer.invoke("webReader:setVisible", visible)');
    expect(preload).toContain("qa: {");

    expect(electronMain).toContain('ipcMain.handle("webReader:hidePopover"');
    expect(electronMain).toContain('ipcMain.handle("webReader:getPageTextSegments"');
    expect(electronMain).toContain('ipcMain.handle("webReader:applyPageTranslations"');
    expect(electronMain).toContain('ipcMain.handle("webReader:restorePageTranslations"');
    expect(electronMain).toContain('ipcMain.handle("webReader:setVisible"');
    expect(electronMain).toContain("function setWebReaderViewVisible");
    expect(electronMain).toContain("owner.removeBrowserView(view)");
    expect(electronMain).toContain("window.__LEM_WEB_READER_POPOVER.hide");

    expect(electronMain).toMatch(
      /if \(isQaRuntime\(\)\) \{[\s\S]*webReader:testSelectionPopover[\s\S]*webReader:testLifeMiningCapture[\s\S]*webReader:captureLifeMiningNow[\s\S]*\}/
    );
    expect(electronMain).toMatch(/if \(isQaRuntime\(\)\) \{[\s\S]*qa:heartbeat[\s\S]*\}/);
  });

  it("keeps app smoke and Web Reader visual QA runners outside the production main entrypoint", () => {
    expect(electronMain).toContain('from "./appSmokeQa"');
    expect(electronMain).toContain('from "./webReaderQa"');
    expect(appSmokeQa).toContain('from "./appSmokeScreenshots"');
    expect(appSmokeQa).toContain('from "./appSmokeRoutes"');
    expect(electronMain).not.toContain("type AppSmokeRouteReport");
    expect(electronMain).not.toContain("const appSmokeRoutes = [");
    expect(electronMain).not.toContain("async function testWebReaderSelectionPopover");
    expect(electronMain).not.toContain("async function testWebReaderShadowTitleSelectionPopover");
    expect(electronMain).not.toContain("async function testWebReaderLifeMiningCapture");
    expect(appSmokeQa).not.toContain("async function captureAppSmokeScreenshot");
    expect(appSmokeQa).not.toContain("async function captureDesktopWindowScreenshot");
    expect(appSmokeQa).not.toContain("async function captureWebReaderViewProofScreenshot");

    expect(appSmokeQa).toContain("export async function runAppSmokeQa");
    expect(appSmokeQa).toContain("export async function runWebReaderPopoverVisualQa");
    expect(appSmokeQa).toContain("export async function runWebReaderLifeMiningProofQa");
    expect(appSmokeQa).not.toContain("type AppSmokeRouteReport =");
    expect(appSmokeQa).not.toContain("const appSmokeRoutes = [");
    expect(appSmokeQa).not.toContain("const appSmokeRouteActionProbes");
    expect(appSmokeQa).toContain("type AppSmokeQaWebReaderAccess");
    expect(appSmokeQa).not.toContain('from "./main"');
    expect(appSmokeQa).not.toContain("webReaderView");

    expect(appSmokeRoutes).toContain("export type AppSmokeRouteReport");
    expect(appSmokeRoutes).toContain("export const appSmokeRoutes");
    expect(appSmokeRoutes).toContain("export const appSmokeRouteActionProbes");
    expect(appSmokeRoutes).not.toContain('from "./main"');

    expect(webReaderQa).toContain("export async function testWebReaderSelectionPopover");
    expect(webReaderQa).toContain("export async function testWebReaderShadowTitleSelectionPopover");
    expect(webReaderQa).toContain("export async function testWebReaderLifeMiningCapture");
    expect(webReaderQa).toContain("export function configureWebReaderQaAccess");
    expect(webReaderQa).not.toContain('from "./main"');
    expect(webReaderQa).not.toContain("webReaderView");

    expect(appSmokeScreenshots).toContain("export async function captureAppSmokeScreenshot");
    expect(appSmokeScreenshots).toContain(
      "export async function captureWebReaderViewProofScreenshot"
    );
    expect(appSmokeScreenshots).toContain("export async function captureDesktopWindowScreenshot");
    expect(appSmokeScreenshots).not.toContain('from "./main"');
  });

  it("removes Web Reader BrowserView and popup listeners during cleanup", () => {
    expect(electronMain).toContain("cleanupWebReaderPopupWindow");
    expect(electronMain).toContain("cleanupWebReaderViewListeners");
    expect(electronMain).toContain('popup.webContents.off("did-stop-loading"');
    expect(electronMain).toContain('view.webContents.off("did-stop-loading"');
    expect(electronMain).toContain('view.webContents.off("dom-ready"');
  });

  it("keeps Desktop OCR window and script plumbing outside the production main entrypoint", () => {
    expect(electronMain).toContain('from "./desktopOcr"');
    expect(electronMain).not.toContain("function createDesktopOcrOverlayHtml");
    expect(electronMain).not.toContain("function createDesktopOcrResultHtml");
    expect(electronMain).not.toContain("function createWindowsOcrPowerShellScript");
    expect(electronMain).not.toContain("desktopOcrCaptureWindow");

    expect(desktopOcr).toContain("export function registerDesktopOcrShortcut");
    expect(desktopOcr).toContain("export async function startDesktopOcrCapture");
    expect(desktopOcr).toContain("export async function finishDesktopOcrSelection");
    expect(desktopOcr).toContain("function createWindowsOcrPowerShellScript");
    expect(desktopOcr).not.toContain('from "./main"');
  });

  it("keeps the Listening YouTube iframe page outside the production main entrypoint", () => {
    expect(electronMain).toContain('from "./listeningYoutubePlayerPage"');
    expect(electronMain).not.toContain("window.onYouTubeIframeAPIReady");
    expect(electronMain).not.toContain('const HOST_SOURCE = "lem-listening-youtube-host"');

    expect(listeningYoutubePlayerPage).toContain(
      "export function writeListeningYouTubePlayerPage"
    );
    expect(listeningYoutubePlayerPage).toContain("window.onYouTubeIframeAPIReady");
    expect(listeningYoutubePlayerPage).not.toContain('from "./main"');
  });

  it("keeps bilingual PDF composition outside the production main entrypoint", () => {
    expect(electronMain).toContain('from "./bilingualPdfExport"');
    expect(electronMain).not.toContain("async function buildPdfWithSelectableSourcePages");
    expect(electronMain).not.toContain("function drawSourceHighlights");
    expect(electronMain).not.toContain("function parseCssRgba");

    expect(bilingualPdfExport).toContain("export async function exportBilingualPdf");
    expect(bilingualPdfExport).toContain("export async function buildPdfWithSelectableSourcePages");
    expect(bilingualPdfExport).not.toContain('from "./main"');
  });

  it("keeps document file actions outside the production main entrypoint", () => {
    expect(electronMain).toContain('from "./documentFileActions"');
    expect(electronMain).not.toContain("function readPdfFile(");
    expect(electronMain).not.toContain("async function pickReaderArtifact");
    expect(electronMain).not.toContain("async function pickLocalVideoFile");
    expect(electronMain).not.toContain("async function pickLocalVideoFolder");
    expect(electronMain).not.toContain("function getUniqueFilePath");
    expect(electronMain).not.toContain("PDFDocument.load");

    expect(documentFileActions).toContain("export function readPdfFile");
    expect(documentFileActions).toContain("export async function pickReaderArtifact");
    expect(documentFileActions).toContain("export async function pickLocalVideoFile");
    expect(documentFileActions).toContain("export async function pickLocalVideoFolder");
    expect(documentFileActions).toContain("export function getUniqueFilePath");
    expect(documentFileActions).not.toContain('from "./main"');
  });

  it("keeps Play Zone runtime window plumbing outside the production main entrypoint", () => {
    expect(electronMain).toContain('from "./playZoneRuntimeWindow"');
    expect(electronMain).toContain('from "./playZoneFileActions"');
    expect(electronMain).not.toContain("function normalizePlayZoneRuntimeEntryUrl");
    expect(electronMain).not.toContain("let youtubeEmbedHeaderPatchRegistered");
    expect(electronMain).not.toContain("function isAllowedPlayZoneRuntimeWindowUrl");
    expect(electronMain).not.toContain("function scanPlayZoneLibraryFolder");

    expect(playZoneRuntimeWindow).toContain("export async function openPlayZoneRuntimeWindow");
    expect(playZoneRuntimeWindow).toContain("export function isAllowedPlayZoneRuntimeWindowUrl");
    expect(playZoneRuntimeWindow).toContain("export function registerYouTubeEmbedRequestHeaders");
    expect(playZoneRuntimeWindow).not.toContain('from "./main"');
    expect(playZoneRuntimeWindow).toContain(
      'export const PLAY_ZONE_RUNTIME_PARTITION = "playzone-runtime"'
    );
    expect(electronMain).toContain("fromPartition(PLAY_ZONE_RUNTIME_PARTITION)");
    expect(electronMain).toContain(
      ".protocol.handle(PLAY_ZONE_ENTRY_PROTOCOL, handleRequest)"
    );
    expect(playZoneFileActions).toContain("export function scanPlayZoneLibraryFolder");
    expect(playZoneFileActions).toContain("export async function pickPlayZonePackFile");
    expect(playZoneFileActions).not.toContain('from "./main"');
  });

  it("does not let Electron fall back to a renderer-created Play Zone runtime", () => {
    const hostBranchStart = playZonePage.indexOf("if (hostOpenRuntimeWindow)");
    const hostBranchReturn = playZonePage.indexOf("return;", hostBranchStart);
    const browserFallback = playZonePage.indexOf("window.open", hostBranchStart);

    expect(hostBranchStart).toBeGreaterThan(-1);
    expect(hostBranchReturn).toBeGreaterThan(hostBranchStart);
    expect(browserFallback).toBeGreaterThan(hostBranchReturn);
    expect(playZonePage).toContain("Electron must never fall back");
  });

  it("keeps Listening RSS parsing and bridge input normalization outside the production main entrypoint", () => {
    expect(electronMain).toContain('from "./listeningRssCandidates"');
    expect(electronMain).toContain('from "./listeningVideoBridge"');
    expect(electronMain).toContain('from "./bridgeInputUtils"');
    expect(electronMain).not.toContain("function parseYouTubeRssEntries");
    expect(electronMain).not.toContain("function normalizeBridgeMultilineText");
    expect(electronMain).not.toContain("function prepareListeningVideoCandidate");
    expect(electronMain).not.toContain("const LISTENING_RSS_MAX_DURATION_SECONDS");

    expect(listeningRssCandidates).toContain("export async function fetchListeningRssCandidates");
    expect(listeningRssCandidates).toContain("export function parseYouTubeRssEntries");
    expect(listeningRssCandidates).not.toContain('from "./main"');

    expect(listeningVideoBridge).toContain("export function prepareListeningVideoCandidate");
    expect(listeningVideoBridge).toContain("export function isDuplicateListeningVideoCapture");
    expect(listeningVideoBridge).not.toContain('from "./main"');

    expect(bridgeInputUtils).toContain("export function normalizeBridgeText");
    expect(bridgeInputUtils).toContain("export function getYouTubeVideoId");
    expect(bridgeInputUtils).not.toContain('from "./main"');
  });

  it("keeps Life Miner bridge protocol helpers outside the production main entrypoint", () => {
    expect(electronMain).toContain('from "./lifeMinerBridgeProtocol"');
    expect(electronMain).toContain('from "./lifeMinerBridgeState"');
    expect(electronMain).not.toContain("class LifeMinerBridgeRequestError extends Error");
    expect(electronMain).not.toContain("const LIFE_MINER_BRIDGE_MAX_BODY_BYTES");
    expect(electronMain).not.toContain("function setLifeMinerCorsHeaders");
    expect(electronMain).not.toContain("function readLifeMinerJsonBody");
    expect(electronMain).not.toContain("function getSingleHeaderValue");
    expect(electronMain).not.toContain("function pairLifeMinerBridgeOrigin");
    expect(electronMain).not.toContain("function validateLifeMinerBridgeToken");
    expect(electronMain).not.toContain("function getLifeLogRawContentLengths");

    expect(lifeMinerBridgeProtocol).toContain("export class LifeMinerBridgeRequestError");
    expect(lifeMinerBridgeProtocol).toContain("export function setLifeMinerCorsHeaders");
    expect(lifeMinerBridgeProtocol).toContain("export function readLifeMinerJsonBody");
    expect(lifeMinerBridgeProtocol).not.toContain('from "./main"');

    expect(lifeMinerBridgeState).toContain("export class LifeMinerBridgePairing");
    expect(lifeMinerBridgeState).toContain("export function isDuplicateLifeMinerCapture");
    expect(lifeMinerBridgeState).toContain("export function getLifeLogRawContentLengths");
    expect(lifeMinerBridgeState).not.toContain('from "./main"');
  });

  it("keeps database row mappers outside the LocalDatabase implementation", () => {
    expect(database).toContain('from "./databaseRows"');
    expect(database).not.toContain("type TranslationCacheRow =");
    expect(database).not.toContain("type ListeningVideoCandidateRow =");
    expect(database).not.toContain("function translationCacheFromRow");
    expect(database).not.toContain("function parseLifeLogMetadata");
    expect(database).not.toContain("function listeningVideoCandidateFromRow");
    expect(database).not.toContain("function getTranslationCacheKey");

    expect(databaseRows).toContain("export function cardFromRow");
    expect(databaseRows).toContain("export function lifeLogFromRow");
    expect(databaseRows).toContain("export function translationCacheFromRow");
    expect(databaseRows).toContain("export function listeningVideoCandidateFromRow");
    expect(databaseRows).toContain("export function getTranslationCacheKey");
    expect(databaseRows).not.toContain('from "./database"');
  });

  it("keeps browser sentence card helper logic outside the production main entrypoint", () => {
    expect(electronMain).toContain('from "./browserSentenceCards"');
    expect(electronMain).not.toContain("const browserCardColors");
    expect(electronMain).not.toContain("function prepareBrowserSentenceCard");
    expect(electronMain).not.toContain("function createBrowserSentenceSourceNote");
    expect(electronMain).not.toContain("function estimateBrowserSentenceCardUsage");
    expect(electronMain).not.toContain("function isDuplicateBrowserSentenceCardCapture");

    expect(browserSentenceCards).toContain("export const browserCardColors");
    expect(browserSentenceCards).toContain("export function prepareBrowserSentenceCard");
    expect(browserSentenceCards).toContain("export function createBrowserSentenceSourceNote");
    expect(browserSentenceCards).toContain("export function estimateBrowserSentenceCardUsage");
    expect(browserSentenceCards).toContain("export function isDuplicateBrowserSentenceCardCapture");
    expect(browserSentenceCards).not.toContain('from "./main"');
  });

  it("keeps Web Reader Life Mining metadata helpers outside the production main entrypoint", () => {
    expect(electronMain).toContain('from "./webReaderLifeMiningState"');
    expect(electronMain).not.toContain("function normalizeWebReaderLifeMiningMetadata");
    expect(electronMain).not.toContain("function isNoisyDiscordLifeLogMetadataMessage");

    expect(webReaderLifeMiningState).toContain(
      "export function normalizeWebReaderLifeMiningMetadata"
    );
    expect(webReaderLifeMiningState).toContain(
      "export function isNoisyDiscordLifeLogMetadataMessage"
    );
    expect(webReaderLifeMiningState).not.toContain('from "./main"');
  });

  it("keeps translation IPC helper mapping outside the production main entrypoint", () => {
    expect(electronMain).toContain('from "./translationIpcHelpers"');
    expect(electronMain).not.toContain("function translationResultFromEntry");
    expect(electronMain).not.toContain("function estimateUsageEventForTexts");
    expect(electronMain).not.toContain("function mergeUsageEvents");
    expect(electronMain).not.toContain("function segmentCacheInput");

    expect(translationIpcHelpers).toContain("export function translationResultFromEntry");
    expect(translationIpcHelpers).toContain("export function estimateUsageEventForTexts");
    expect(translationIpcHelpers).toContain("export function segmentCacheInput");
    expect(translationIpcHelpers).not.toContain('from "./main"');
  });
});
