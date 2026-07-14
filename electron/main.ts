import {
  app,
  BrowserView,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  protocol,
  session,
  shell,
  Tray,
  type BrowserWindowConstructorOptions,
  type IpcMainInvokeEvent
} from "electron";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { LocalDatabase } from "./database";
import { isAllowedWebReaderUrl, normalizeWebReaderHttpUrl } from "./webReaderUrlPolicy";
import {
  isWebReaderPracticeUrl,
  renderWebReaderPracticeHtml,
  WEB_READER_PRACTICE_PROTOCOL
} from "../src/shared/webReaderPractice";
import { SecureSettingsVault, type SecureSettingsInput } from "./secureSettingsVault";
import {
  findRecognizedLegacyDevelopmentUserDataPath,
  SecureSettingsPrivacyScope
} from "./legacySecureSettingsPrivacy";
import { AppOnboardingStateStore } from "./appOnboardingState";
import { PrivacyDataService } from "./privacyDataService";
import { ExtensionQueueClearCoordinator } from "./extensionQueueClearCoordinator";
import { PrivacyDeletionCoordinator } from "./privacyDeletionCoordinator";
import { PrivacyDeletionStateStore } from "./privacyDeletionStateStore";
import { LifeMinerBridgeControlStore } from "./lifeMinerBridgeControlStore";
import { serializeSafeDebugLogEntry } from "./safeDebugLog";
import {
  electronText,
  formatElectronNumber,
  formatElectronText,
  normalizeElectronAppLocale
} from "./appDialogLocalization";
import {
  getYouTubeVideoId,
  normalizeBridgeMultilineText,
  normalizeBridgeNumber,
  normalizeBridgeText
} from "./bridgeInputUtils";
import {
  isDuplicateListeningVideoCapture,
  prepareListeningVideoCandidate
} from "./listeningVideoBridge";
import {
  createFallbackBrowserSentenceCard,
  createBrowserSentenceCardUsageEvent,
  getBrowserCardProviderDebugStatus,
  getEffectiveBrowserCardProviderSettings,
  estimateBrowserSentenceCardUsage,
  isDuplicateBrowserSentenceCardCapture,
  prepareBrowserSentenceCard,
  type BrowserBridgeTranslateInput,
  type BrowserCardProviderSettings,
  type BrowserSentenceCardCaptureInput,
  type BrowserSentenceCardCreationResult
} from "./browserSentenceCards";
import { normalizeWebReaderLifeMiningMetadata } from "./webReaderLifeMiningState";
import {
  getAutoBilingualExportFilePath,
  getQaExportFilePath,
  listLocalVideoFolderVideos,
  openExportPath,
  pickLocalVideoFile,
  pickLocalVideoFolder,
  pickReaderArtifact,
  readPdfFile,
  readTextFile,
  redownloadExport,
  revealExportPath
} from "./documentFileActions";
import { exportBilingualPdf as exportBilingualPdfDocument } from "./bilingualPdfExport";
import {
  openPlayZoneRuntimeWindow,
  PLAY_ZONE_RUNTIME_PARTITION,
  registerYouTubeEmbedRequestHeaders,
  type PlayZoneRuntimeWindowDependencies,
  type PlayZoneRuntimeWindowInput
} from "./playZoneRuntimeWindow";
import {
  authorizePlayZoneRuntimeEntry,
  installPlayZonePack,
  pickPlayZoneLibraryFolder,
  pickPlayZonePackFile,
  scanPlayZonePackFile,
  scanPlayZoneLibraryFolder
} from "./playZoneFileActions";
import { listPlayZonePacksWithOfficialCatalog } from "./playZoneOfficialCatalog";
import { downloadAndInstallOfficialPlayZonePack } from "./playZoneOfficialInstaller";
import {
  createPlayZoneEntryProtocolUrl,
  clearPlayZoneEntryProtocolMounts,
  PLAY_ZONE_ENTRY_PROTOCOL,
  readPlayZoneEntryProtocolFile,
  registerPlayZoneEntryProtocolMount
} from "./playZoneEntryProtocol";
import { injectPlayZoneHostBridge } from "./playZoneHostBridgeScript";
import {
  backupPlayZoneSave,
  capturePlayZoneRollbackSnapshot,
  clearPlayZoneSave,
  exportPlayZoneSaves,
  loadPlayZoneSave,
  restorePlayZoneRollbackSnapshot,
  restorePlayZoneSaves,
  writePlayZoneSave
} from "./playZoneSaveStore";
import {
  PlayZoneManagedFileWriterCoordinator,
  type PlayZoneManagedFileWriteIntent,
  type PlayZoneManagedFileWriterBlock,
  type PrivacyManagedDataWriterOptions
} from "./playZoneManagedFileWriterCoordinator";
import {
  AppBackupPreviewStore,
  createAppBackupDocument,
  createImportedProfileIdMap,
  readAppBackupFile,
  writeAppBackupFile
} from "./appBackupService";
import {
  AppBackupRollbackStore,
  disposeAppBackupRollbackSnapshot,
  type AppBackupRollbackSnapshot
} from "./appBackupRollbackStore";
import {
  closeDesktopOcrCaptureWindow,
  closeDesktopOcrWindowsForPrivacyDeletion,
  finishDesktopOcrSelection,
  registerDesktopOcrShortcut,
  startDesktopOcrCapture,
  unregisterDesktopOcrShortcut
} from "./desktopOcr";
import { writeListeningYouTubePlayerPage } from "./listeningYoutubePlayerPage";
import {
  appendBookMakerQaHeartbeat,
  prepareBookMakerQaSettingsOverride,
  readBookMakerQaConfig,
  runBookMakerQa
} from "./bookMakerQa";
import {
  buildWebReaderLifeMiningScript,
  buildWebReaderLoginHardeningScript,
  buildWebReaderSelectionPopoverScript
} from "./webReaderScripts";
import {
  runAppSmokeQa,
  runWebReaderLifeMiningProofQa,
  runWebReaderPopoverVisualQa,
  type AppSmokeQaWebReaderAccess,
  type WebReaderViewState
} from "./appSmokeQa";
import { runDocsScreenshotQa } from "./docsScreenshotQa";
import { runManualScreenshotQa } from "./manualScreenshotQa";
import { resolveQaDeviceScaleFactor } from "./appSmokeScale";
import {
  captureWebReaderLifeMiningNow,
  configureWebReaderQaAccess,
  testWebReaderLifeMiningCapture,
  testWebReaderSelectionPopover,
  testWebReaderShadowTitleSelectionPopover
} from "./webReaderQa";
import { isQaRuntime, qaTimestamp, runQaTaskAndExit } from "./qaRuntime";
import { GeminiProvider } from "../src/services/llm/geminiProvider";
import { OllamaProvider } from "../src/services/llm/ollamaProvider";
import { ensureOllamaRuntime } from "./ollamaRuntimeService";
import {
  disconnectLocalCardSyncFolder,
  downloadCardsFromLocalFolder,
  getLocalFolderCardSyncStatus,
  pickLocalCardSyncFolder,
  syncCardsWithLocalFolderNow,
  syncCardsWithLocalFolder,
  uploadCardsToLocalFolder
} from "./localFolderCardSync";
import {
  getOllamaModelStatus,
  pullOllamaModel,
  testTranslationConnection,
  translatePdfSegmentsWithGemini,
  translatePdfSegmentsWithLocalMt,
  translatePdfSegmentsWithLocalOllama,
  translateWithGemini,
  translateWithLocalMt,
  translateWithLocalOllama,
  translateWithGoogle,
  translateTextsWithGoogle
} from "./translationService";
import { TranslationJobRegistry } from "./translationJobRegistry";
import { listTtsVoices, synthesizeTts } from "./ttsService";
import {
  createListeningCardMediaClip,
  extractLocalEmbeddedSubtitleTranscript,
  fetchYouTubeVideoMetadataBatch,
  generateLocalFileListeningTranscript,
  generateListeningTranscript,
  getDefaultListeningWhisperModel,
  getListeningToolStatus,
  prepareLocalVideoPlaybackFile,
  type YouTubeVideoMetadata
} from "./listeningTranscription";
import { fetchListeningRssCandidates } from "./listeningRssCandidates";
import {
  assessTranslationUsageBudget,
  createTranslationUsageEvent,
  DEFAULT_DAILY_APP_TOKEN_LIMIT,
  DEFAULT_LOCAL_MT_MODEL,
  DEFAULT_MONTHLY_SPEND_LIMIT_KRW,
} from "../src/shared/translationUsage";
import type { GeminiUsageObservation } from "../src/shared/geminiTranslation";
import { createInitialSrs } from "../src/shared/srs";
import {
  LIFE_MINER_BRIDGE_PORT,
  prepareLifeLogCapture,
  type LifeMinerCaptureInput
} from "../src/shared/lifeLogCapture";
import {
  getLifeMinerBridgeBaseUrl,
  isAllowedLifeMinerOrigin,
  LifeMinerBridgeRequestError,
  LIFE_MINER_EXTENSION_HEADER,
  readLifeMinerJsonBody,
  setLifeMinerCorsHeaders,
  writeLifeMinerJson
} from "./lifeMinerBridgeProtocol";
import {
  getLifeLogRawContentLengths,
  enforceLifeMinerRateLimit,
  isDuplicateLifeMinerCapture,
  isLifeMinerDebugEnabled,
  LifeMinerBridgePairing,
  LIFE_MINER_BRIDGE_DEDUPE_MS
} from "./lifeMinerBridgeState";
import {
  chunk,
  estimateUsageEventForTexts,
  mergeUsageEvents,
  segmentCacheInput,
  translationResultFromEntry
} from "./translationIpcHelpers";
import {
  defaultLifeMiningCaptureSettings,
  normalizeLifeMiningCaptureSettings
} from "../src/shared/lifeMiningSettings";
import {
  applyLifeMiningCapturePolicy,
  isBrowserCaptureSiteAllowed
} from "../src/shared/lifeMiningCapturePolicy";
import type {
  AppSettings,
  BilingualExportHistoryRecord,
  BilingualPdfExportInput,
  BilingualPdfExportResult,
  BilingualReaderArtifact,
  BrowserCaptureSiteSettings,
  BrowserSelectionCardMode,
  AppRuntimeStatus,
  CardSyncResult,
  CardSyncSettings,
  CardSyncStatus,
  CloudProviderConsentRecord,
  DailyMissionId,
  DesktopOcrCardInput,
  DesktopOcrCaptureResult,
  DesktopOcrSelectionRect,
  EnsureOllamaRuntimeResult,
  LearningMissionEvent,
  LifeLog,
  LifeLogMetadata,
  LifeMiningCaptureSettings,
  ListeningCardMediaClipInput,
  ListeningLocalTranscriptInput,
  ListeningLocalVideoFile,
  ListeningTranscript,
  ListeningVideoCandidate,
  ListeningVideoCandidateInput,
  LearningProfile,
  OllamaModelInput,
  PdfSegmentTranslation,
  PdfFileReadResult,
  ProfileId,
  OllamaModelStatusResult,
  PullOllamaModelResult,
  ReviewRating,
  StudyCard,
  StudyCardListeningMedia,
  TextFileReadResult,
  TranslatePdfSegmentsInput,
  TranslatePdfSegmentsResult,
  TranslateTextInput,
  TranslateTextResult,
  TranslationCacheLookupInput,
  TranslationConnectionTestInput,
  TranslationConnectionTestResult,
  TtsSynthesisInput,
  TranslationUsageEvent,
  WebReaderLifeMiningState
} from "../src/shared/types";
import { createStudyCardFromGenerated } from "../src/shared/cardFactory";
import { isInputReadingCard, isLifeMiningOutputCard } from "../src/shared/cardDeck";
import { isDefaultSampleCardId } from "../src/shared/defaultSampleCards";
import {
  assessInputLanguagePolicy,
  withInputLanguageMetadata
} from "../src/shared/inputLanguagePolicy";
import { defaultLearningProfile, normalizeLearningProfile } from "../src/shared/languages";
import { DEFAULT_PROFILE_ID } from "../src/shared/profiles";
import type {
  AppBackupRendererSnapshot,
  AppBackupRestoreMode
} from "../src/shared/appBackup";
import {
  isPrivacyDataDeleteTarget,
  type PrivacyDataDeleteRequest,
  type PrivacyDataDeleteResult
} from "../src/shared/privacyData";
import {
  GEMINI_PDF_BATCH_MAX_REMOTE_CALLS,
  OLLAMA_PDF_BATCH_MAX_REMOTE_CALLS,
  RemoteRequestBudget,
  isAbortError,
  isRemoteRequestBudgetExceededError,
  throwIfTranslationAborted,
  type TranslationRequestControl
} from "../src/shared/translationRequestLimits";

let mainWindow: BrowserWindow | null = null;
let revealMainWindowWhenRendererReady: (() => void) | null = null;
let webReaderView: BrowserView | null = null;
let webReaderViewOwner: BrowserWindow | null = null;
let webReaderViewIsAttached = false;
let webReaderViewIsLoading = false;
let webReaderViewTargetUrl = "";
const webReaderPopupWindows = new Set<BrowserWindow>();
const webReaderPopupCleanupByWindow = new WeakMap<BrowserWindow, () => void>();
let webReaderViewCleanup: (() => void) | null = null;
let webReaderSessionFlushTimer: NodeJS.Timeout | null = null;
let webReaderSessionFlushInFlight: Promise<void> | null = null;
let webReaderSessionPersistenceRegistered = false;
let webReaderPermissionPolicyRegistered = false;
let webReaderYouTubeCandidateCaptureTimer: NodeJS.Timeout | null = null;
let beforeQuitCleanupRan = false;
let beforeQuitSessionFlushComplete = false;
let appTray: Tray | null = null;
let database: LocalDatabase | null = null;
let secureSettingsVault: SecureSettingsVault | null = null;
let appOnboardingState: AppOnboardingStateStore | null = null;
const appBackupPreviewStore = new AppBackupPreviewStore();
const appBackupRollbackStore = new AppBackupRollbackStore();
const translationJobRegistry = new TranslationJobRegistry();
let lifeMinerBridgeServer: Server | null = null;
let activeProfileId: ProfileId = DEFAULT_PROFILE_ID;
let currentAppLocale: "ko" | "en" = "ko";
let desktopOcrShortcutAvailable = true;
let browserSelectionCardMode: BrowserSelectionCardMode = "preview";
let browserCaptureSiteSettings: BrowserCaptureSiteSettings = {
  discord: false,
  chatgpt: false,
  claude: false,
  youtube: false,
  reddit: false,
  genericWeb: false
};
let lifeMiningCaptureSettings: LifeMiningCaptureSettings = defaultLifeMiningCaptureSettings;
let browserCaptureShortcut = "Ctrl+Q";
let webReaderLifeMiningPollTimer: NodeJS.Timeout | null = null;
let webReaderLifeMiningState: WebReaderLifeMiningState = {
  enabled: false,
  mode: "off",
  message: electronText(currentAppLocale, "webReaderUnavailable")
};
let mainWindowPlayerFullscreenActive = false;
let mainWindowMenuBarVisibleBeforePlayerFullscreen = true;
let mainWindowWasFullscreenBeforePlayerFullscreen = false;
let browserCardProviderSettings: BrowserCardProviderSettings = {
  providerName: "mock",
  ollamaBaseUrl: "http://127.0.0.1:11434",
  ollamaModel: "gemma4:12b",
  geminiApiKey: "",
  geminiModel: "gemini-2.5-flash-lite",
  geminiPlan: "free",
  learningProfile: defaultLearningProfile,
  dailyAppTokenLimit: DEFAULT_DAILY_APP_TOKEN_LIMIT,
  monthlySpendLimitKrw: DEFAULT_MONTHLY_SPEND_LIMIT_KRW
};
let bridgeUsageBudgetState = {
  todayTokens: 0,
  monthCostKrw: 0,
  stopOnFreeTierLimit: true,
  stopOnMonthlyLimit: true,
  pendingTokens: 0,
  pendingCostKrw: 0,
  unsyncedTokens: 0,
  unsyncedCostKrw: 0
};
let cardSyncRuntimeSettings: Pick<AppSettings, "cardSyncFolderPath" | "cardSyncOnQuit"> = {
  cardSyncFolderPath: "",
  cardSyncOnQuit: true
};
let isQuitting = false;

const recentLifeMinerCaptures = new Map<string, number>();
const recentLifeMinerBridgeRequests = new Map<string, number[]>();
const recentBrowserSentenceCardCaptures = new Map<string, number>();
const recentListeningVideoCaptures = new Map<string, number>();
const officialPlayZoneDownloadControllers = new Map<
  string,
  {
    senderId: number;
    packId: string;
    controller: AbortController;
    settled: Promise<void>;
  }
>();
const privacyManagedDataWriters = new PlayZoneManagedFileWriterCoordinator();
let privacyManagedFileDeletionInProgress = false;
let privacySecureSettingsDeletionInProgress = false;
let privacyWebReaderDeletionInProgress = false;
const lifeMinerBridgeControlStore = new LifeMinerBridgeControlStore(() => app.getPath("userData"));
const lifeMinerBridgePairing = new LifeMinerBridgePairing(
  randomUUID(),
  randomUUID,
  lifeMinerBridgeControlStore
);
const extensionQueueClearCoordinator = new ExtensionQueueClearCoordinator();
const privacyDeletionStateStore = new PrivacyDeletionStateStore(() => app.getPath("userData"));
const privacyDeletionCoordinator = new PrivacyDeletionCoordinator(
  extensionQueueClearCoordinator,
  randomUUID,
  privacyDeletionStateStore
);
const finalizedPrivacyDeletionIds = new Set<string>();
const LIFE_MINER_BRIDGE_FORGET_CONFIRMATIONS = new Set([
  "확장 프로그램을 제거했습니다",
  "I UNINSTALLED THE EXTENSION"
]);
const TRAY_ICON_RELATIVE_PATHS =
  process.platform === "win32"
    ? [path.join("assets", "tray-mole-miner.png"), path.join("assets", "tray-mole-miner.ico")]
    : [path.join("assets", "tray-mole-miner.png")];
const FALLBACK_TRAY_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#2563eb"/>
  <path d="M17 18h10l5 16 5-16h10v28h-7V28l-6 18h-5l-6-18v18h-6V18z" fill="#f8fafc"/>
</svg>`;

type WebReaderBoundsInput = {
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
};

type WebReaderAttachInput = {
  url?: unknown;
  bounds?: WebReaderBoundsInput;
};

const DISABLED_CHROMIUM_FEATURES_FOR_WEB_LOGIN = ["WebAuthenticationConditionalUI"];
const LOCAL_VIDEO_PROTOCOL = "lem-video";
const WEB_READER_SESSION_PARTITION = "persist:language-miner-web-reader";

protocol.registerSchemesAsPrivileged([
  {
    scheme: WEB_READER_PRACTICE_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: false,
      corsEnabled: false
    }
  },
  {
    scheme: LOCAL_VIDEO_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  },
  {
    scheme: PLAY_ZONE_ENTRY_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

app.commandLine.appendSwitch(
  "disable-features",
  DISABLED_CHROMIUM_FEATURES_FOR_WEB_LOGIN.join(",")
);

async function createWindow() {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;

  mainWindow = new BrowserWindow({
    show: false,
    width: 1240,
    height: 820,
    minWidth: 940,
    minHeight: 680,
    backgroundColor: "#f4f7fb",
    title: "Language Miner",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      additionalArguments: getQaPreloadArguments(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false
    }
  });
  configureMainWindowPlayerFullscreenChrome(mainWindow);

  let showFallbackTimer: NodeJS.Timeout | null = null;
  const revealMainWindow = () => {
    if (showFallbackTimer) {
      clearTimeout(showFallbackTimer);
      showFallbackTimer = null;
    }
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
    if (revealMainWindowWhenRendererReady === revealMainWindow) {
      revealMainWindowWhenRendererReady = null;
    }
  };
  revealMainWindowWhenRendererReady = revealMainWindow;
  mainWindow.once("ready-to-show", revealMainWindow);
  showFallbackTimer = setTimeout(revealMainWindow, 8_000);
  showFallbackTimer.unref();

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));
  }

  mainWindow.on("close", (event) => {
    if (isQuitting) {
      return;
    }
    event.preventDefault();
    mainWindow?.hide();
  });

  mainWindow.on("closed", () => {
    if (showFallbackTimer) {
      clearTimeout(showFallbackTimer);
      showFallbackTimer = null;
    }
    if (revealMainWindowWhenRendererReady === revealMainWindow) {
      revealMainWindowWhenRendererReady = null;
    }
    destroyWebReaderView();
    mainWindow = null;
  });
}

function setMainWindowPlayerFullscreen(
  owner: BrowserWindow | null,
  enabledInput: unknown
): boolean {
  const ownerWindow = owner && !owner.isDestroyed() ? owner : mainWindow;
  if (!ownerWindow || ownerWindow.isDestroyed()) {
    return false;
  }

  const enabled = Boolean(enabledInput);
  if (enabled) {
    if (!mainWindowPlayerFullscreenActive) {
      mainWindowMenuBarVisibleBeforePlayerFullscreen = ownerWindow.isMenuBarVisible();
      mainWindowWasFullscreenBeforePlayerFullscreen = ownerWindow.isFullScreen();
    }
    mainWindowPlayerFullscreenActive = true;
    ownerWindow.setMenuBarVisibility(false);
    if (!ownerWindow.isFullScreen()) {
      ownerWindow.setFullScreen(true);
    }
    return true;
  }

  if (!mainWindowPlayerFullscreenActive) {
    return true;
  }

  mainWindowPlayerFullscreenActive = false;
  if (!mainWindowWasFullscreenBeforePlayerFullscreen && ownerWindow.isFullScreen()) {
    ownerWindow.setFullScreen(false);
  }
  ownerWindow.setMenuBarVisibility(mainWindowMenuBarVisibleBeforePlayerFullscreen);
  return true;
}

function configureMainWindowPlayerFullscreenChrome(ownerWindow: BrowserWindow) {
  ownerWindow.webContents.on("enter-html-full-screen", () => {
    setMainWindowPlayerFullscreen(ownerWindow, true);
  });
  ownerWindow.webContents.on("leave-html-full-screen", () => {
    setMainWindowPlayerFullscreen(ownerWindow, false);
  });
}

function getPlayZoneRuntimeWindowDependencies(
  devServerUrl = process.env.VITE_DEV_SERVER_URL
): PlayZoneRuntimeWindowDependencies {
  return {
    additionalArguments: getQaPreloadArguments(),
    appLocale: currentAppLocale,
    createWindow: (options) => new BrowserWindow(options),
    devServerUrl,
    distIndexPath: path.join(__dirname, "../../dist/index.html"),
    preloadPath: path.join(__dirname, "preload.js"),
    resolveEntryAuthorization: resolvePlayZoneRuntimeEntryAuthorization,
    notifyWalletChanged: notifyPlayZoneWalletChanged
  };
}

function resolvePlayZoneRuntimeEntryAuthorization(entryUrl: string) {
  const snapshot = authorizePlayZoneRuntimeEntry(entryUrl, getPlayZoneInstalledRoot());
  if (!snapshot) return null;
  const mountId = registerPlayZoneEntryProtocolMount(
    snapshot.snapshotRootPath,
    snapshot.runtimeFiles
  );
  const protocolUrl = createPlayZoneEntryProtocolUrl(mountId, snapshot.relativeEntryPath);
  return protocolUrl
    ? { ...snapshot.authorization, entryUrl: protocolUrl }
    : null;
}

function getPlayZoneArchiveCacheRoot() {
  return path.join(app.getPath("userData"), "play-zone-archives");
}

function getPlayZoneInstalledRoot() {
  return path.join(app.getPath("userData"), "play-zone-installed");
}

function getPlayZoneDownloadRoot() {
  return path.join(app.getPath("userData"), "play-zone-downloads");
}

function getPlayZoneSaveRoot() {
  return path.join(app.getPath("userData"), "play-zone-saves");
}

function getAutomaticBackupRoot() {
  return path.join(app.getPath("userData"), "backups");
}

function createCurrentAppBackup(
  renderer: AppBackupRendererSnapshot,
  profileIds: string[]
) {
  return createAppBackupDocument({
    appVersion: app.getVersion(),
    profileIds,
    payload: {
      database: ensureDatabase().exportAppBackupSnapshot(),
      renderer,
      playZoneSaves: exportPlayZoneSaves(getPlayZoneSaveRoot())
    }
  });
}

function captureCurrentAppBackupRollbackSnapshot(): AppBackupRollbackSnapshot {
  return {
    database: ensureDatabase().exportAppBackupRollbackSnapshot(),
    playZone: capturePlayZoneRollbackSnapshot(getPlayZoneSaveRoot())
  };
}

function restoreCurrentAppBackupRollbackSnapshot(snapshot: AppBackupRollbackSnapshot) {
  const failures: string[] = [];
  try {
    ensureDatabase().restoreAppBackupRollbackSnapshot(snapshot.database);
  } catch (error) {
    failures.push(`database: ${getAppBackupErrorMessage(error)}`);
  }
  try {
    restorePlayZoneRollbackSnapshot(getPlayZoneSaveRoot(), snapshot.playZone);
  } catch (error) {
    failures.push(`PlayZone: ${getAppBackupErrorMessage(error)}`);
  }
  if (failures.length) {
    throw new Error(failures.join(" / "));
  }
}

function normalizeExistingFile(filePath: string) {
  const normalizedPath = path.resolve(filePath);
  try {
    return fs.existsSync(normalizedPath) && fs.statSync(normalizedPath).isFile()
      ? normalizedPath
      : null;
  } catch {
    return null;
  }
}

async function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    await createWindow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
}

function createAppTray() {
  if (appTray) {
    return;
  }

  const icon = createTrayIconImage();
  appTray = new Tray(icon);
  appTray.setToolTip("Language Miner");
  refreshAppTrayMenu();
  appTray.on("click", () => {
    void showMainWindow();
  });
}

function refreshAppTrayMenu() {
  if (!appTray) return;
  appTray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Language Miner", enabled: false },
      {
        label: electronText(currentAppLocale, "trayShowApp"),
        click: () => {
          void showMainWindow();
        }
      },
      { label: electronText(currentAppLocale, "trayCaptureRunning"), enabled: false },
      { type: "separator" },
      {
        label: electronText(currentAppLocale, "trayQuit"),
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ])
  );
}

function createTrayIconImage() {
  for (const relativePath of TRAY_ICON_RELATIVE_PATHS) {
    const iconPath = path.join(__dirname, relativePath);
    const icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) {
      return prepareTrayIconImage(icon);
    }
  }

  return prepareTrayIconImage(
    nativeImage.createFromDataURL(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(FALLBACK_TRAY_ICON_SVG)}`
    )
  );
}

function prepareTrayIconImage(icon: Electron.NativeImage) {
  icon.setTemplateImage(false);
  return icon.resize({ width: 16, height: 16, quality: "best" });
}

function getAppRuntimeStatus(message?: string): AppRuntimeStatus {
  return {
    isElectron: true,
    trayAvailable: Boolean(appTray),
    launchAtLogin: app.getLoginItemSettings().openAtLogin,
    canConfigureLaunchAtLogin: app.isPackaged,
    message:
      message ??
      (!desktopOcrShortcutAvailable
        ? electronText(currentAppLocale, "runtimeDesktopOcrShortcutUnavailable")
        : app.isPackaged
          ? electronText(currentAppLocale, "runtimeTrayAvailable")
          : electronText(currentAppLocale, "runtimeTrayDevelopment"))
  };
}

function setLaunchAtLogin(enabled: boolean): AppRuntimeStatus {
  if (!app.isPackaged && enabled) {
    return getAppRuntimeStatus(electronText(currentAppLocale, "runtimeStartupPackagedOnly"));
  }

  app.setLoginItemSettings({
    openAtLogin: enabled && app.isPackaged
  });

  return getAppRuntimeStatus(
    app.getLoginItemSettings().openAtLogin
      ? electronText(currentAppLocale, "runtimeStartupEnabled")
      : electronText(currentAppLocale, "runtimeStartupDisabled")
  );
}

function syncCardsBeforeQuit() {
  if (isPrivacyDeletionBlockingManagedDataWrites()) {
    return;
  }
  const folderPath = cardSyncRuntimeSettings.cardSyncFolderPath.trim();
  if (!cardSyncRuntimeSettings.cardSyncOnQuit || !folderPath) {
    return;
  }

  try {
    const db = ensureDatabase();
    const result = syncCardsWithLocalFolderNow(
      { folderPath },
      db.listCards(activeProfileId),
      (cards) => db.importCards(cards, activeProfileId),
      activeProfileId,
      currentAppLocale
    );
    console.log(`[card-sync] quit sync completed: ${result.message}`);
  } catch (caught) {
    console.warn(
      "[card-sync] quit sync failed",
      serializeSafeDebugLogEntry({ error: caught })
    );
  }
}

async function createAndSaveDesktopOcrInputCard(input: DesktopOcrCardInput) {
  const selectedText = normalizeBridgeText(input.selectedText).slice(0, 240);
  const sourceSentence = normalizeBridgeText(input.sourceSentence || input.ocrText || selectedText).slice(
    0,
    1200
  );
  if (!selectedText || !sourceSentence) {
    throw new Error(electronText(currentAppLocale, "desktopCardSelectionRequired"));
  }

  const cardResult = await createBrowserSentenceCard({
    selectedText,
    sourceSentence,
    appName: electronText(currentAppLocale, "externalOcrAppName"),
    metadata: {
      title: electronText(currentAppLocale, "externalOcrTitle")
    },
    languagePolicyOverride: input.languagePolicyOverride
  });
  notifyUsageRecorded(cardResult.usage);
  const card = applyMainInputLanguagePolicy(cardResult.card, {
    text: sourceSentence,
    contextText: input.ocrText,
    override: input.languagePolicyOverride
  });

  const db = ensureDatabase();
  const wasExisting = db.hasCard(card.id);
  const saved = db.saveCard(card, activeProfileId);
  if (!wasExisting) {
    recordCardCreationMissionEvent(db, saved, activeProfileId, "desktop_ocr");
  }
  notifyCardsChanged(saved);
  return saved;
}

function applyMainInputLanguagePolicy(
  card: StudyCard,
  input: {
    text: string;
    contextText?: string;
    override?: boolean;
    allowMismatch?: boolean;
  }
) {
  if (card.cardType !== "reading" || card.deckType === "output") {
    return card;
  }

  const assessment = assessInputLanguagePolicy({
    text: input.text,
    contextText: input.contextText,
    learningProfile: browserCardProviderSettings.learningProfile,
    override: input.override,
    sourceKind: input.override ? "manual_override" : "original"
  });
  if (assessment.shouldBlock) {
    if (!input.allowMismatch) {
      throw new Error(
        formatElectronText(currentAppLocale, "inputLanguageMismatch", {
          expected: assessment.expectedLanguageCode,
          detected: assessment.detectedLanguageCode
        })
      );
    }
  }
  return withInputLanguageMetadata(card, assessment);
}

function isHttpUrl(rawUrl: string) {
  return isAllowedWebReaderUrl(rawUrl);
}

function parseExternalHttpUrl(rawUrl: unknown) {
  if (typeof rawUrl !== "string") {
    return null;
  }
  try {
    const url = new URL(rawUrl.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function getWebReaderUserAgent(currentUserAgent: string) {
  return currentUserAgent
    .replace(/\sElectron\/\S+/g, "")
    .replace(/\sLocalEnglishMiner\/\S+/g, "")
    .trim();
}

function canExecuteWebReaderScript(view: BrowserView) {
  return !view.webContents.isDestroyed() && !view.webContents.isLoading();
}

async function injectWebReaderLoginHardening(view = webReaderView) {
  if (!view || view.webContents.isDestroyed()) {
    return false;
  }
  const rawUrl = view.webContents.getURL();
  let host = "";
  try {
    host = new URL(rawUrl).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return false;
  }
  const shouldHarden =
    host === "discord.com" ||
    host.endsWith(".discord.com") ||
    host === "accounts.google.com" ||
    host.endsWith(".accounts.google.com");
  if (!shouldHarden) {
    return false;
  }
  if (!canExecuteWebReaderScript(view)) {
    return false;
  }
  try {
    await view.webContents.executeJavaScript(buildWebReaderLoginHardeningScript(), true);
    return true;
  } catch {
    return false;
  }
}

async function flushWebReaderSessionStorage(reason = "web-reader") {
  if (webReaderSessionFlushInFlight) {
    return webReaderSessionFlushInFlight;
  }

  webReaderSessionFlushInFlight = (async () => {
    try {
      const webReaderSession = getWebReaderSession();
      webReaderSession.flushStorageData();
      await webReaderSession.cookies.flushStore();
    } catch {
      console.warn(`Failed to flush ${reason} session storage.`);
    } finally {
      webReaderSessionFlushInFlight = null;
    }
  })();

  return webReaderSessionFlushInFlight;
}

function scheduleWebReaderSessionStorageFlush(reason = "web-reader") {
  if (webReaderSessionFlushTimer) {
    clearTimeout(webReaderSessionFlushTimer);
  }
  webReaderSessionFlushTimer = setTimeout(() => {
    webReaderSessionFlushTimer = null;
    void flushWebReaderSessionStorage(reason);
  }, 750);
}

function registerWebReaderSessionPersistence() {
  if (webReaderSessionPersistenceRegistered) {
    return;
  }
  webReaderSessionPersistenceRegistered = true;
  const webReaderSession = getWebReaderSession();
  configureWebReaderPermissionPolicy();
  webReaderSession.cookies.on("changed", (_event, cookie) => {
    const domain = (cookie.domain ?? "").replace(/^\./, "").toLowerCase();
    const shouldPersist =
      domain === "discord.com" ||
      domain.endsWith(".discord.com") ||
      domain === "accounts.google.com" ||
      domain.endsWith(".accounts.google.com");
    if (shouldPersist) {
      scheduleWebReaderSessionStorageFlush("web-reader-cookie-change");
    }
  });
}

function getWebReaderSession() {
  return session.fromPartition(WEB_READER_SESSION_PARTITION);
}

function configureWebReaderPermissionPolicy() {
  if (webReaderPermissionPolicyRegistered) return;
  webReaderPermissionPolicyRegistered = true;
  const webReaderSession = getWebReaderSession();
  webReaderSession.setPermissionCheckHandler(() => false);
  webReaderSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  webReaderSession.setDevicePermissionHandler(() => false);
}

function createWebReaderPopupWindowOptions(owner: BrowserWindow): BrowserWindowConstructorOptions {
  return {
    parent: owner,
    modal: false,
    show: true,
    width: 520,
    height: 720,
    minWidth: 420,
    minHeight: 520,
    backgroundColor: "#ffffff",
    title: electronText(currentAppLocale, "webReaderLoginTitle"),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: WEB_READER_SESSION_PARTITION
    }
  };
}

function cleanupWebReaderPopupWindow(popup: BrowserWindow) {
  const cleanup = webReaderPopupCleanupByWindow.get(popup);
  if (cleanup) {
    cleanup();
  } else {
    webReaderPopupWindows.delete(popup);
  }
}

function configureWebReaderPopupWindow(popup: BrowserWindow, owner: BrowserWindow) {
  cleanupWebReaderPopupWindow(popup);
  webReaderPopupWindows.add(popup);
  popup.setMenuBarVisibility(false);
  popup.webContents.setUserAgent(getWebReaderUserAgent(popup.webContents.getUserAgent()));

  const handleDomReady = () => {
    void injectWebReaderLoginHardening({
      webContents: popup.webContents
    } as BrowserView);
  };
  const handleStopLoading = () => {
    void injectWebReaderLoginHardening({
      webContents: popup.webContents
    } as BrowserView);
    scheduleWebReaderSessionStorageFlush("web-reader-popup-load");
  };
  const handleNavigate = () => {
    scheduleWebReaderSessionStorageFlush("web-reader-popup-navigate");
  };
  const handleNavigateInPage = () => {
    scheduleWebReaderSessionStorageFlush("web-reader-popup-navigate-in-page");
  };
  const handleWillNavigate = (event: Electron.Event, url: string) => {
    if (!isHttpUrl(url)) event.preventDefault();
  };
  const handleCreateWindow = (childWindow: BrowserWindow) => {
    configureWebReaderPopupWindow(childWindow, owner);
  };
  const handleClosed = () => {
    cleanupWebReaderPopupWindow(popup);
  };

  popup.webContents.on("dom-ready", handleDomReady);
  popup.webContents.on("did-stop-loading", handleStopLoading);
  popup.webContents.on("did-navigate", handleNavigate);
  popup.webContents.on("did-navigate-in-page", handleNavigateInPage);
  popup.webContents.on("will-navigate", handleWillNavigate);
  popup.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: createWebReaderPopupWindowOptions(owner)
      };
    }
    return { action: "deny" };
  });
  popup.webContents.on("did-create-window", handleCreateWindow);
  popup.on("closed", handleClosed);

  const cleanup = () => {
    webReaderPopupCleanupByWindow.delete(popup);
    webReaderPopupWindows.delete(popup);
    try {
      popup.off("closed", handleClosed);
    } catch {
      // The window may already be disposed.
    }
    try {
      if (!popup.webContents.isDestroyed()) {
        popup.webContents.off("dom-ready", handleDomReady);
        popup.webContents.off("did-stop-loading", handleStopLoading);
        popup.webContents.off("did-navigate", handleNavigate);
        popup.webContents.off("did-navigate-in-page", handleNavigateInPage);
        popup.webContents.off("will-navigate", handleWillNavigate);
        popup.webContents.off("did-create-window", handleCreateWindow);
        popup.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      }
    } catch {
      // WebContents may already be destroyed as part of window close.
    }
  };
  webReaderPopupCleanupByWindow.set(popup, cleanup);
}

function closeWebReaderPopupWindows() {
  for (const popup of Array.from(webReaderPopupWindows)) {
    cleanupWebReaderPopupWindow(popup);
    if (!popup.isDestroyed()) {
      popup.close();
    }
  }
}

function cleanupWebReaderViewListeners() {
  const cleanup = webReaderViewCleanup;
  if (cleanup) {
    cleanup();
  }
}

function ensureWebReaderView(owner: BrowserWindow) {
  if (webReaderView && webReaderViewOwner === owner && !webReaderView.webContents.isDestroyed()) {
    if (!webReaderViewIsAttached) {
      owner.addBrowserView(webReaderView);
      webReaderViewIsAttached = true;
    }
    return webReaderView;
  }

  destroyWebReaderView();
  webReaderViewOwner = owner;
  webReaderView = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: WEB_READER_SESSION_PARTITION
    }
  });
  const view = webReaderView;
  view.webContents.setUserAgent(getWebReaderUserAgent(view.webContents.getUserAgent()));
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: createWebReaderPopupWindowOptions(owner)
      };
    }
    return { action: "deny" };
  });
  const handleCreateWindow = (popup: BrowserWindow) => {
    configureWebReaderPopupWindow(popup, owner);
  };
  const handleStartLoading = () => {
    if (webReaderView === view) {
      webReaderViewIsLoading = true;
    }
  };
  const handleStopLoading = () => {
    if (webReaderView === view) {
      webReaderViewIsLoading = false;
    }
    void injectWebReaderLoginHardening(view);
    void injectWebReaderSelectionPopover(view);
    void injectWebReaderLifeMining(view);
    scheduleWebReaderYouTubeCandidateCapture(view);
    scheduleWebReaderSessionStorageFlush("web-reader-load");
  };
  const handleDomReady = () => {
    void injectWebReaderLoginHardening(view);
    void injectWebReaderSelectionPopover(view);
    void injectWebReaderLifeMining(view);
    scheduleWebReaderYouTubeCandidateCapture(view);
  };
  const handleNavigate = (_event: Electron.Event, url: string) => {
    if (webReaderView === view) {
      webReaderViewTargetUrl = url;
    }
    updateWebReaderLifeMiningStateFromView(view);
    scheduleWebReaderYouTubeCandidateCapture(view);
    scheduleWebReaderSessionStorageFlush("web-reader-navigate");
  };
  const handleNavigateInPage = (_event: Electron.Event, url: string) => {
    if (webReaderView === view) {
      webReaderViewTargetUrl = url;
    }
    updateWebReaderLifeMiningStateFromView(view);
    scheduleWebReaderYouTubeCandidateCapture(view);
    scheduleWebReaderSessionStorageFlush("web-reader-navigate-in-page");
  };
  const handleWillNavigate = (event: Electron.Event, url: string) => {
    if (!isHttpUrl(url)) event.preventDefault();
  };
  const handleDestroyed = () => {
    if (webReaderView === view) {
      webReaderView = null;
      webReaderViewOwner = null;
      webReaderViewIsAttached = false;
      webReaderViewIsLoading = false;
      webReaderViewTargetUrl = "";
    }
    if (webReaderViewCleanup === cleanup) {
      webReaderViewCleanup = null;
    }
    stopWebReaderLifeMiningPolling();
  };
  const cleanup = () => {
    if (webReaderViewCleanup === cleanup) {
      webReaderViewCleanup = null;
    }
    try {
      if (!view.webContents.isDestroyed()) {
        view.webContents.off("did-create-window", handleCreateWindow);
        view.webContents.off("did-start-loading", handleStartLoading);
        view.webContents.off("did-stop-loading", handleStopLoading);
        view.webContents.off("dom-ready", handleDomReady);
        view.webContents.off("did-navigate", handleNavigate);
        view.webContents.off("did-navigate-in-page", handleNavigateInPage);
        view.webContents.off("will-navigate", handleWillNavigate);
        view.webContents.off("destroyed", handleDestroyed);
        view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      }
    } catch {
      // The BrowserView may already be tearing down.
    }
  };
  view.webContents.on("did-create-window", handleCreateWindow);
  view.webContents.on("did-start-loading", handleStartLoading);
  view.webContents.on("did-stop-loading", handleStopLoading);
  view.webContents.on("dom-ready", handleDomReady);
  view.webContents.on("did-navigate", handleNavigate);
  view.webContents.on("did-navigate-in-page", handleNavigateInPage);
  view.webContents.on("will-navigate", handleWillNavigate);
  view.webContents.on("destroyed", handleDestroyed);
  webReaderViewCleanup = cleanup;
  owner.addBrowserView(view);
  webReaderViewIsAttached = true;
  startWebReaderLifeMiningPolling();
  return view;
}

function setWebReaderViewVisible(visible: boolean) {
  const view = webReaderView;
  const owner = webReaderViewOwner;
  if (!view || !owner || view.webContents.isDestroyed() || owner.isDestroyed()) {
    return false;
  }
  if (visible && !webReaderViewIsAttached) {
    owner.addBrowserView(view);
    webReaderViewIsAttached = true;
  } else if (!visible && webReaderViewIsAttached) {
    owner.removeBrowserView(view);
    webReaderViewIsAttached = false;
  }
  return true;
}

function destroyWebReaderView() {
  closeWebReaderPopupWindows();
  stopWebReaderLifeMiningPolling();
  if (webReaderYouTubeCandidateCaptureTimer) {
    clearTimeout(webReaderYouTubeCandidateCaptureTimer);
    webReaderYouTubeCandidateCaptureTimer = null;
  }
  if (!webReaderView) {
    return;
  }
  const view = webReaderView;
  const owner = webReaderViewOwner;
  webReaderView = null;
  webReaderViewOwner = null;
  webReaderViewIsAttached = false;
  webReaderViewIsLoading = false;
  webReaderViewTargetUrl = "";
  cleanupWebReaderViewListeners();
  try {
    owner?.removeBrowserView(view);
  } catch {
    // The owner may already be closing.
  }
  if (!view.webContents.isDestroyed()) {
    void flushWebReaderSessionStorage("web-reader-destroy");
    void view.webContents.loadURL("about:blank").catch(() => {
      // The view may be closing already.
    });
  }
}

async function destroyWebReaderViewForPrivacyDeletion() {
  const view = webReaderView;
  const popupWindows = Array.from(webReaderPopupWindows);
  destroyWebReaderView();
  for (const popup of popupWindows) {
    if (!popup.isDestroyed()) popup.destroy();
  }
  if (!view || view.webContents.isDestroyed()) return;
  await flushWebReaderSessionStorage("privacy-delete-view-close").catch(() => undefined);
  if (view.webContents.isDestroyed()) return;
  const destroyed = new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 1_000);
    view.webContents.once("destroyed", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
  view.webContents.close({ waitForBeforeUnload: false });
  await destroyed;
  if (!view.webContents.isDestroyed()) {
    throw new Error("Web Reader could not be closed for privacy deletion.");
  }
}

async function loadWebReaderViewUrl(view: BrowserView, url: string) {
  if (!url) {
    return;
  }
  if (webReaderViewTargetUrl === url) {
    await injectWebReaderSelectionPopover(view);
    await injectWebReaderLifeMining(view);
    return;
  }
  webReaderViewTargetUrl = url;
  webReaderViewIsLoading = true;
  try {
    await view.webContents.loadURL(url);
    await injectWebReaderSelectionPopover(view);
    await injectWebReaderLifeMining(view);
    scheduleWebReaderSessionStorageFlush("web-reader-load-url");
  } catch (error) {
    const code = typeof error === "object" && error ? (error as { code?: unknown }).code : undefined;
    if (code !== "ERR_ABORTED") {
      throw error;
    }
  }
}

function normalizeWebReaderBounds(input: WebReaderBoundsInput | undefined): Electron.Rectangle {
  return {
    x: Math.max(0, Math.round(normalizeBridgeNumber(input?.x) ?? 0)),
    y: Math.max(0, Math.round(normalizeBridgeNumber(input?.y) ?? 0)),
    width: Math.max(1, Math.round(normalizeBridgeNumber(input?.width) ?? 1)),
    height: Math.max(1, Math.round(normalizeBridgeNumber(input?.height) ?? 1))
  };
}

function normalizeWebReaderUrl(value: unknown) {
  return normalizeWebReaderHttpUrl(normalizeBridgeText(value));
}

async function applyWebReaderBounds(view: BrowserView, boundsInput: WebReaderBoundsInput | undefined) {
  const bounds = normalizeWebReaderBounds(boundsInput);
  view.setBounds(bounds);
  view.setAutoResize({ width: false, height: false });
  return bounds;
}

async function getWebReaderViewState(view = webReaderView): Promise<WebReaderViewState> {
  if (!view || view.webContents.isDestroyed()) {
    return {
      url: "",
      title: "",
      canGoBack: false,
      canGoForward: false,
      isLoading: false,
      innerHeight: 0,
      innerWidth: 0
    };
  }

  let innerHeight = 0;
  let innerWidth = 0;
  const viewBounds = view.getBounds();
  const isLoading = webReaderViewIsLoading || view.webContents.isLoading();
  if (!isLoading) {
    try {
      const metrics = (await view.webContents.executeJavaScript(
        "({ innerHeight: window.innerHeight, innerWidth: window.innerWidth })"
      )) as { innerHeight?: unknown; innerWidth?: unknown };
      innerHeight = normalizeBridgeNumber(metrics.innerHeight) ?? 0;
      innerWidth = normalizeBridgeNumber(metrics.innerWidth) ?? 0;
    } catch {
      // The page may still be navigating.
    }
  }
  if (innerHeight <= 0) {
    innerHeight = viewBounds.height;
  }
  if (innerWidth <= 0) {
    innerWidth = viewBounds.width;
  }

  return {
    url: view.webContents.getURL(),
    title: view.webContents.getTitle(),
    canGoBack: view.webContents.navigationHistory.canGoBack(),
    canGoForward: view.webContents.navigationHistory.canGoForward(),
    isLoading,
    innerHeight,
    innerWidth
  };
}

async function getWebReaderSelection() {
  const view = webReaderView;
  if (!view || !canExecuteWebReaderScript(view)) {
    return null;
  }
  try {
    return (await view.webContents.executeJavaScript(`
      (() => {
        function normalizeText(value) {
          return String(value || "").replace(/\\u00a0/g, " ").replace(/\\s+/g, " ").trim();
        }
        function findClosestSelectionOffset(fullText, selectedText, preferredOffset) {
          const haystack = normalizeText(fullText).toLowerCase();
          const needle = normalizeText(selectedText).toLowerCase();
          if (!haystack || !needle) {
            return -1;
          }
          let bestIndex = -1;
          let bestDistance = Infinity;
          let index = haystack.indexOf(needle);
          while (index >= 0) {
            const distance = Math.abs(index - (Number(preferredOffset) || 0));
            if (distance < bestDistance) {
              bestDistance = distance;
              bestIndex = index;
            }
            index = haystack.indexOf(needle, index + Math.max(1, needle.length));
          }
          return bestIndex;
        }
        function getRangeElement(range) {
          const node = range && range.startContainer;
          if (!node) {
            return null;
          }
          if (node.nodeType === Node.ELEMENT_NODE) {
            return node;
          }
          return node.parentElement || null;
        }
        const TEXT_BLOCK_SELECTOR = [
          "p",
          "li",
          "td",
          "th",
          "dd",
          "blockquote",
          "figcaption",
          "caption",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "[slot='title']",
          "[data-testid='post-title']",
          "[data-adclicklocation='title']",
          "[id^='post-title']",
          "shreddit-title",
          "shreddit-post",
          "shreddit-comment"
        ].join(",");
        function getElementText(element) {
          const ownText = normalizeText(element && (element.innerText || element.textContent));
          if (ownText) {
            return ownText;
          }
          return normalizeText(element && element.shadowRoot && element.shadowRoot.textContent);
        }
        function isUsableTextBlock(element, selectedText) {
          if (!element || element === document.body || element === document.documentElement) {
            return false;
          }
          const text = getElementText(element);
          if (!text || !text.toLowerCase().includes(normalizeText(selectedText).toLowerCase())) {
            return false;
          }
          const rect = element.getBoundingClientRect ? element.getBoundingClientRect() : null;
          return !rect || (rect.width > 0 && rect.height > 0);
        }
        function getComposedParentElement(element) {
          if (element && element.parentElement) {
            return element.parentElement;
          }
          const root = element && element.getRootNode ? element.getRootNode() : null;
          return root && root.host instanceof HTMLElement ? root.host : null;
        }
        function findSelectionTextBlock(range, selectedText) {
          const element = getRangeElement(range);
          if (!element) {
            return null;
          }
          const closestBlock = element.closest ? element.closest(TEXT_BLOCK_SELECTOR) : null;
          if (isUsableTextBlock(closestBlock, selectedText)) {
            return closestBlock;
          }
          let candidate = element;
          let fallback = null;
          while (candidate && candidate !== document.body && candidate !== document.documentElement) {
            if (isUsableTextBlock(candidate, selectedText)) {
              const tagName = String(candidate.tagName || "").toLowerCase();
              const text = getElementText(candidate);
              if (candidate.matches?.(TEXT_BLOCK_SELECTOR) || tagName.startsWith("shreddit-")) {
                return candidate;
              }
              if (!fallback && text.length <= 1200) {
                fallback = candidate;
              }
            }
            candidate = getComposedParentElement(candidate);
          }
          return fallback;
        }
        function getSelectionTextContext(range, selectedText) {
          const block = findSelectionTextBlock(range, selectedText);
          if (block) {
            const blockText = getElementText(block);
            let blockOffset = 0;
            try {
              const beforeRange = document.createRange();
              beforeRange.selectNodeContents(block);
              beforeRange.setEnd(range.startContainer, range.startOffset);
              blockOffset = normalizeText(beforeRange.toString()).length;
            } catch {
              blockOffset = 0;
            }
            const closestOffset = findClosestSelectionOffset(blockText, selectedText, blockOffset);
            return {
              fullText: blockText,
              selectionOffset: closestOffset >= 0 ? closestOffset : blockOffset
            };
          }
          const bodyText = normalizeText(document.body && document.body.innerText ? document.body.innerText : "");
          let bodyOffset = 0;
          try {
            const beforeRange = document.createRange();
            beforeRange.selectNodeContents(document.body);
            beforeRange.setEnd(range.startContainer, range.startOffset);
            bodyOffset = normalizeText(beforeRange.toString()).length;
          } catch {
            bodyOffset = 0;
          }
          const closestOffset = findClosestSelectionOffset(bodyText, selectedText, bodyOffset);
          return {
            fullText: bodyText,
            selectionOffset: closestOffset >= 0 ? closestOffset : bodyOffset
          };
        }
        const selection = window.getSelection();
        const selectedText = normalizeText(selection && selection.toString ? selection.toString() : "");
        if (!selection || selection.rangeCount === 0 || !selectedText) {
          return null;
        }
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const textContext = getSelectionTextContext(range, selectedText);
        return {
          selectedText,
          fullText: textContext.fullText.slice(0, 80000),
          selectionOffset: textContext.selectionOffset,
          title: document.title || "",
          url: location.href,
          rect: {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height
          }
        };
      })()
    `)) as unknown;
  } catch {
    return null;
  }
}

async function getWebReaderPageTextSegments() {
  const view = webReaderView;
  if (!view || !canExecuteWebReaderScript(view)) {
    return null;
  }
  try {
    return await view.webContents.executeJavaScript(`
      (() => {
        const BLOCK_SELECTOR = [
          "article p",
          "article li",
          "main p",
          "main li",
          "p",
          "li",
          "blockquote",
          "h1",
          "h2",
          "h3",
          "[data-testid='post-title']",
          "[data-testid='comment']",
          "[slot='title']",
          "[slot='text-body']",
          "shreddit-title",
          "shreddit-comment",
          "shreddit-post"
        ].join(",");
        function normalizeText(value) {
          return String(value || "").replace(/\\u00a0/g, " ").replace(/\\s+/g, " ").trim();
        }
        function isVisible(element) {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return (
            rect.width > 20 &&
            rect.height > 8 &&
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity || "1") > 0
          );
        }
        const segments = [];
        const seenTexts = new Set();
        const elements = Array.from(document.querySelectorAll(BLOCK_SELECTOR));
        for (const element of elements) {
          if (!(element instanceof HTMLElement) || !isVisible(element)) {
            continue;
          }
          const original = element.dataset.lmOriginalText || element.innerText || element.textContent || "";
          const text = normalizeText(original);
          if (text.length < 24 || text.length > 900 || seenTexts.has(text.toLowerCase())) {
            continue;
          }
          seenTexts.add(text.toLowerCase());
          if (!element.dataset.lmTranslateId) {
            element.dataset.lmTranslateId = "lm-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
          }
          if (!element.dataset.lmOriginalText) {
            element.dataset.lmOriginalText = text;
          }
          segments.push({
            id: element.dataset.lmTranslateId,
            text
          });
          if (segments.length >= 18 || segments.reduce((sum, segment) => sum + segment.text.length, 0) >= 6000) {
            break;
          }
        }
        return {
          url: location.href,
          title: document.title || "",
          segments
        };
      })()
    `);
  } catch {
    return null;
  }
}

async function applyWebReaderPageTranslations(input: unknown) {
  const view = webReaderView;
  if (!view || !canExecuteWebReaderScript(view)) {
    return false;
  }
  const payload = normalizeWebReaderPageTranslationApplyInput(input);
  if (!payload.segments.length) {
    return false;
  }
  const json = JSON.stringify(payload);
  try {
    await view.webContents.executeJavaScript(`
      (() => {
        const payload = ${json};
        const translations = new Map(payload.segments.map((segment) => [segment.id, segment.translatedText]));
        for (const element of Array.from(document.querySelectorAll("[data-lm-translate-id]"))) {
          if (!(element instanceof HTMLElement)) {
            continue;
          }
          const id = element.dataset.lmTranslateId;
          const translatedText = id ? translations.get(id) : "";
          if (!translatedText) {
            continue;
          }
          if (!element.dataset.lmOriginalText) {
            element.dataset.lmOriginalText = String(element.innerText || element.textContent || "").replace(/\\s+/g, " ").trim();
          }
          element.textContent = translatedText;
          element.dataset.lmTranslated = "true";
          element.lang = payload.targetLanguageCode;
        }
        document.documentElement.dataset.lmPageTranslated = payload.targetLanguageCode;
        return true;
      })()
    `);
    return true;
  } catch {
    return false;
  }
}

async function restoreWebReaderPageTranslations() {
  const view = webReaderView;
  if (!view || !canExecuteWebReaderScript(view)) {
    return false;
  }
  try {
    return Boolean(
      await view.webContents.executeJavaScript(`
        (() => {
          let restored = 0;
          for (const element of Array.from(document.querySelectorAll("[data-lm-original-text]"))) {
            if (!(element instanceof HTMLElement)) {
              continue;
            }
            element.textContent = element.dataset.lmOriginalText || element.textContent || "";
            delete element.dataset.lmTranslated;
            restored += 1;
          }
          delete document.documentElement.dataset.lmPageTranslated;
          return restored > 0;
        })()
      `)
    );
  } catch {
    return false;
  }
}

function normalizeWebReaderPageTranslationApplyInput(input: unknown) {
  const record = isRecord(input) ? input : {};
  const targetLanguageCode =
    typeof record.targetLanguageCode === "string"
      ? record.targetLanguageCode.trim().toLowerCase().split("-")[0]
      : "";
  const segments = Array.isArray(record.segments)
    ? record.segments
        .map((segment) => {
          if (!isRecord(segment)) {
            return null;
          }
          const id = typeof segment.id === "string" ? segment.id.trim() : "";
          const text = typeof segment.text === "string" ? segment.text : "";
          const translatedText =
            typeof segment.translatedText === "string" ? segment.translatedText.trim() : "";
          return id && translatedText ? { id, text, translatedText } : null;
        })
        .filter(
          (
            segment
          ): segment is {
            id: string;
            text: string;
            translatedText: string;
          } => Boolean(segment)
        )
    : [];
  return {
    targetLanguageCode,
    segments
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function injectWebReaderSelectionPopover(view = webReaderView) {
  if (!view || !canExecuteWebReaderScript(view)) {
    return false;
  }
  try {
    await view.webContents.executeJavaScript(
      buildWebReaderSelectionPopoverScript(currentAppLocale)
    );
    return true;
  } catch {
    return false;
  }
}

function resolveWebReaderLifeMiningState(urlInput: string): WebReaderLifeMiningState {
  const lastCaptureAt = webReaderLifeMiningState.lastCaptureAt;
  if (!lifeMiningCaptureSettings.enabled) {
    return {
      enabled: false,
      mode: "off",
      lastCaptureAt,
      message: electronText(currentAppLocale, "lifeMiningOff")
    };
  }
  try {
    const url = new URL(urlInput || "about:blank");
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return {
        enabled: false,
        siteKey: "unsupported",
        mode: "off",
        lastCaptureAt,
        message: electronText(currentAppLocale, "lifeMiningWaitingForPage")
      };
    }

    const hostname = url.hostname.replace(/^www\./i, "").toLowerCase();
    const pathname = url.pathname.toLowerCase();
    const authPageMessage = electronText(currentAppLocale, "lifeMiningDisabledOnSignIn");
    if (
      (hostname.endsWith("discord.com") && /^\/(?:login|register)(?:\/|$)/.test(pathname)) ||
      (hostname.endsWith("chatgpt.com") && /^\/(?:auth|login|sign-in|signin)(?:\/|$)/.test(pathname))
    ) {
      return {
        enabled: false,
        siteKey: hostname.endsWith("discord.com") ? "discord" : "chatgpt",
        mode: "off",
        lastCaptureAt,
        message: authPageMessage
      };
    }
    let siteKey: keyof BrowserCaptureSiteSettings = "genericWeb";
    let mode: WebReaderLifeMiningState["mode"] = "selection";
    if (hostname.endsWith("discord.com")) {
      siteKey = "discord";
      mode = "auto";
    } else if (hostname.endsWith("chatgpt.com") || hostname.endsWith("chat.openai.com")) {
      siteKey = "chatgpt";
      mode = "auto";
    } else if (hostname.endsWith("claude.ai")) {
      siteKey = "claude";
      mode = "auto";
    } else if (hostname.endsWith("reddit.com")) {
      siteKey = "reddit";
    } else if (hostname.endsWith("youtube.com") || hostname.endsWith("youtu.be")) {
      siteKey = "youtube";
    }

    const enabled = Boolean(browserCaptureSiteSettings[siteKey]);
    return {
      enabled,
      siteKey,
      mode: enabled ? mode : "off",
      lastCaptureAt,
      message: enabled
        ? mode === "auto"
          ? electronText(currentAppLocale, "lifeMiningAutoSelectionOn")
          : electronText(currentAppLocale, "lifeMiningSelectionOn")
        : electronText(currentAppLocale, "lifeMiningSiteOff")
    };
  } catch {
    return {
      enabled: false,
      siteKey: "unsupported",
      mode: "off",
      lastCaptureAt,
      message: electronText(currentAppLocale, "webAddressUnavailable")
    };
  }
}

function updateWebReaderLifeMiningStateFromView(view = webReaderView) {
  const previous = webReaderLifeMiningState;
  const url = view && !view.webContents.isDestroyed()
    ? view.webContents.getURL() || webReaderViewTargetUrl
    : webReaderViewTargetUrl;
  const next = resolveWebReaderLifeMiningState(url);
  const previousCaptureTime = previous.lastCaptureAt ? Date.parse(previous.lastCaptureAt) : 0;
  const hasRecentCaptureMessage =
    Number.isFinite(previousCaptureTime) && Date.now() - previousCaptureTime < 10_000;
  webReaderLifeMiningState = {
    ...next,
    lastCaptureAt: previous.lastCaptureAt,
    message: hasRecentCaptureMessage && previous.message ? previous.message : next.message
  };
  return webReaderLifeMiningState;
}

function scheduleWebReaderYouTubeCandidateCapture(view = webReaderView) {
  if (webReaderYouTubeCandidateCaptureTimer) {
    clearTimeout(webReaderYouTubeCandidateCaptureTimer);
  }
  webReaderYouTubeCandidateCaptureTimer = setTimeout(() => {
    webReaderYouTubeCandidateCaptureTimer = null;
    void captureWebReaderYouTubeCandidate(view);
  }, 900);
}

async function captureWebReaderYouTubeCandidate(view = webReaderView) {
  if (!view || view.webContents.isDestroyed()) {
    return;
  }
  const currentUrl = view.webContents.getURL() || webReaderViewTargetUrl;
  const videoId = getYouTubeVideoId(currentUrl);
  if (!videoId) {
    return;
  }

  const title =
    normalizeYouTubeWatchTitle(view.webContents.getTitle()) ||
    formatElectronText(currentAppLocale, "youtubeVideoFallback", { videoId });
  const candidate = prepareListeningVideoCandidate(
    {
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      title,
      sourceType: "manual",
      languageCode: browserCardProviderSettings.learningProfile.targetLanguage.code,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      collectedAt: new Date().toISOString(),
      metadata: {
        source: "web_reader_direct",
        pageUrl: currentUrl,
        languageCode: browserCardProviderSettings.learningProfile.targetLanguage.code
      }
    },
    "manual"
  );
  if (!candidate) {
    return;
  }

  if (
    isDuplicateListeningVideoCapture(
      recentListeningVideoCaptures,
      candidate,
      LIFE_MINER_BRIDGE_DEDUPE_MS
    )
  ) {
    return;
  }

  await runPrivacyManagedDataWrite(() =>
    ensureDatabase().saveListeningVideoCandidate(candidate)
  );
}

function normalizeYouTubeWatchTitle(value: string) {
  return normalizeBridgeText(value)
    .replace(/\s+-\s+YouTube$/i, "")
    .replace(/^YouTube\s*$/, "")
    .trim()
    .slice(0, 240);
}

async function injectWebReaderLifeMining(view = webReaderView) {
  if (!view || view.webContents.isDestroyed()) {
    webReaderLifeMiningState = {
      enabled: false,
      mode: "off",
      message: electronText(currentAppLocale, "webReaderUnavailable"),
      lastCaptureAt: webReaderLifeMiningState.lastCaptureAt
    };
    return false;
  }
  const state = updateWebReaderLifeMiningStateFromView(view);
  if (!canExecuteWebReaderScript(view)) {
    return false;
  }
  try {
    await view.webContents.executeJavaScript(
      buildWebReaderLifeMiningScript(state, {
        shortcut: browserCaptureShortcut,
        captureSettings: lifeMiningCaptureSettings
      })
    );
    return true;
  } catch {
    webReaderLifeMiningState = {
      ...state,
      enabled: false,
      mode: "off",
      message: electronText(currentAppLocale, "lifeMiningInjectionUnavailable")
    };
    return false;
  }
}

function startWebReaderLifeMiningPolling() {
  if (webReaderLifeMiningPollTimer || !lifeMiningCaptureSettings.enabled) {
    return;
  }
  webReaderLifeMiningPollTimer = setInterval(() => {
    void consumeWebReaderLifeMiningCaptures();
  }, 1200);
  webReaderLifeMiningPollTimer.unref?.();
}

function stopWebReaderLifeMiningPolling() {
  if (!webReaderLifeMiningPollTimer) {
    return;
  }
  clearInterval(webReaderLifeMiningPollTimer);
  webReaderLifeMiningPollTimer = null;
  webReaderLifeMiningState = {
    enabled: false,
    mode: "off",
    lastCaptureAt: webReaderLifeMiningState.lastCaptureAt,
    message: electronText(currentAppLocale, "webReaderClosed")
  };
}

async function saveWebReaderLifeMiningCapture(
  payload: unknown,
  intent?: PlayZoneManagedFileWriteIntent
) {
  if (!lifeMiningCaptureSettings.enabled) return null;
  const payloadInput = typeof payload === "object" && payload ? (payload as Record<string, unknown>) : {};
  const capture: LifeMinerCaptureInput = {
    text: normalizeBridgeMultilineText(payloadInput.text).slice(0, 3000),
    beforeContext: normalizeBridgeMultilineText(payloadInput.beforeContext).slice(0, 3000) || undefined,
    afterContext: normalizeBridgeMultilineText(payloadInput.afterContext).slice(0, 3000) || undefined,
    appName:
      normalizeBridgeText(payloadInput.appName).slice(0, 120) ||
      electronText(currentAppLocale, "webReaderAppName"),
    metadata: normalizeWebReaderLifeMiningMetadata(payloadInput.metadata)
  };
  const prepared = prepareLifeLogCapture(capture, {
    filterLowSignalTargets: lifeMiningCaptureSettings.filterLowSignalTargets
  });
  if (!prepared.accepted) {
    webReaderLifeMiningState = {
      ...updateWebReaderLifeMiningStateFromView(),
      message: electronText(currentAppLocale, "lifeMiningSkipped")
    };
    return null;
  }

  if (isDuplicateLifeMinerCapture(recentLifeMinerCaptures, prepared.lifeLogInput)) {
    webReaderLifeMiningState = {
      ...updateWebReaderLifeMiningStateFromView(),
      lastCaptureAt: new Date().toISOString(),
      message: electronText(currentAppLocale, "lifeMiningDuplicateSkipped")
    };
    return null;
  }

  const saved = await runPrivacyManagedDataWrite(
    () => ensureDatabase().saveLifeLog(prepared.lifeLogInput),
    intent
  );
  notifyLifeLogsChanged(saved);
  webReaderLifeMiningState = {
    ...updateWebReaderLifeMiningStateFromView(),
    lastCaptureAt: saved.createdAt,
    message: electronText(currentAppLocale, "lifeMiningCandidateSaved")
  };
  return saved;
}

async function consumeWebReaderLifeMiningCaptures() {
  const view = webReaderView;
  if (!view || !canExecuteWebReaderScript(view)) {
    return [];
  }
  try {
    const intent = capturePrivacyManagedDataWriteIntent();
    const captures = await view.webContents.executeJavaScript(
      "window.__LEM_WEB_READER_LIFE_MINER && window.__LEM_WEB_READER_LIFE_MINER.consumeCaptures ? window.__LEM_WEB_READER_LIFE_MINER.consumeCaptures() : []"
    );
    if (!Array.isArray(captures) || captures.length === 0) {
      return [];
    }
    const saved: LifeLog[] = [];
    for (const capture of captures) {
      const lifeLog = await saveWebReaderLifeMiningCapture(capture, intent);
      if (lifeLog) {
        saved.push(lifeLog);
      }
    }
    return saved;
  } catch {
    return [];
  }
}

async function readWebReaderLifeMiningDebug() {
  const view = webReaderView;
  if (!view || !canExecuteWebReaderScript(view)) {
    return null;
  }
  try {
    return await view.webContents.executeJavaScript(
      "window.__LEM_WEB_READER_LIFE_MINER && typeof window.__LEM_WEB_READER_LIFE_MINER.debug === 'function' ? window.__LEM_WEB_READER_LIFE_MINER.debug() : null"
    );
  } catch {
    return { error: "web_reader_debug_unavailable" };
  }
}

async function getWebReaderLifeMiningState() {
  await consumeWebReaderLifeMiningCaptures();
  const state = updateWebReaderLifeMiningStateFromView();
  if (state.enabled && state.siteKey === "discord") {
    const debug = await readWebReaderLifeMiningDebug();
    const debugInput = typeof debug === "object" && debug ? (debug as Record<string, unknown>) : {};
    const visibleMessageCount = Number(debugInput.visibleMessageCount);
    if (!debugInput.inputPresent && (!Number.isFinite(visibleMessageCount) || visibleMessageCount <= 0)) {
      webReaderLifeMiningState = {
        ...state,
        message: electronText(currentAppLocale, "discordConversationUnavailable")
      };
      return webReaderLifeMiningState;
    }
  }
  return state;
}

async function consumeWebReaderPopoverAction() {
  const view = webReaderView;
  if (!view || !canExecuteWebReaderScript(view)) {
    return null;
  }
  await injectWebReaderSelectionPopover(view);
  try {
    return await view.webContents.executeJavaScript(
      "window.__LEM_WEB_READER_POPOVER && window.__LEM_WEB_READER_POPOVER.consumeAction ? window.__LEM_WEB_READER_POPOVER.consumeAction() : null"
    );
  } catch {
    return null;
  }
}

async function showWebReaderPopoverFromSelection() {
  const view = webReaderView;
  if (!view || !canExecuteWebReaderScript(view)) {
    return false;
  }
  await injectWebReaderSelectionPopover(view);
  try {
    return Boolean(
      await view.webContents.executeJavaScript(
        "window.__LEM_WEB_READER_POPOVER && window.__LEM_WEB_READER_POPOVER.showFromSelection ? window.__LEM_WEB_READER_POPOVER.showFromSelection() : false"
      )
    );
  } catch {
    return false;
  }
}

async function showWebReaderPopoverStatus(input: unknown) {
  const view = webReaderView;
  if (!view || !canExecuteWebReaderScript(view)) {
    return false;
  }
  await injectWebReaderSelectionPopover(view);
  const payload = typeof input === "object" && input ? (input as { state?: unknown; message?: unknown }) : {};
  const state = normalizeBridgeText(payload.state) || "ready";
  const message = normalizeBridgeText(payload.message);
  try {
    await view.webContents.executeJavaScript(
      `window.__LEM_WEB_READER_POPOVER && window.__LEM_WEB_READER_POPOVER.showStatus(${JSON.stringify(
        state
      )}, ${JSON.stringify(message)})`
    );
    return true;
  } catch {
    return false;
  }
}

async function showWebReaderPopoverResult(card: unknown) {
  const view = webReaderView;
  if (!view || !canExecuteWebReaderScript(view)) {
    return false;
  }
  await injectWebReaderSelectionPopover(view);
  try {
    await view.webContents.executeJavaScript(
      `window.__LEM_WEB_READER_POPOVER && window.__LEM_WEB_READER_POPOVER.showResult(${JSON.stringify(
        card
      ).replace(/</g, "\\u003c")})`
    );
    return true;
  } catch {
    return false;
  }
}

async function hideWebReaderPopover() {
  const view = webReaderView;
  if (!view || !canExecuteWebReaderScript(view)) {
    return false;
  }
  await injectWebReaderSelectionPopover(view);
  try {
    await view.webContents.executeJavaScript(
      "window.__LEM_WEB_READER_POPOVER && window.__LEM_WEB_READER_POPOVER.hide ? window.__LEM_WEB_READER_POPOVER.hide() : false"
    );
    return true;
  } catch {
    return false;
  }
}

function assertTrustedIpcSender(event: IpcMainInvokeEvent) {
  const senderUrl = event.senderFrame?.url || event.sender.getURL();
  try {
    const parsed = new URL(senderUrl);
    const devServerUrl = process.env.VITE_DEV_SERVER_URL;
    if (devServerUrl && parsed.origin === new URL(devServerUrl).origin) return;
    if (parsed.protocol === "file:") {
      const senderPath = path.resolve(fileURLToPath(parsed));
      const trustedRendererPaths = [
        path.resolve(app.getAppPath(), "dist", "index.html"),
        path.resolve(__dirname, "../../dist/index.html")
      ];
      if (trustedRendererPaths.includes(senderPath)) return;
    }
  } catch {
    // Reject malformed or non-app renderer URLs below.
  }
  throw new Error("IPC request rejected: untrusted renderer.");
}

function assertMainWindowIpcSender(event: IpcMainInvokeEvent) {
  assertTrustedIpcSender(event);
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
    throw new Error("IPC request rejected: the main app window is required.");
  }
}

function assertCurrentMainWindowSender(event: IpcMainInvokeEvent) {
  if (!isCurrentMainWindowSender(event)) {
    throw new Error("IPC request rejected: the current main frame is required.");
  }
}

function isCurrentMainWindowSender(event: IpcMainInvokeEvent) {
  return Boolean(
    mainWindow &&
    !mainWindow.isDestroyed() &&
    event.sender === mainWindow.webContents &&
    event.senderFrame === mainWindow.webContents.mainFrame
  );
}

function registerIpcHandlers() {
  ipcMain.handle("app:rendererReady", (event) => {
    // A previous renderer can finish its double-rAF startup callback just after
    // QA or an in-app reload replaces the main frame. This signal has no data
    // authority, so ignore only that stale-frame race without weakening the
    // strict sender checks used by every stateful IPC below.
    if (!isCurrentMainWindowSender(event)) return false;
    revealMainWindowWhenRendererReady?.();
    return true;
  });
  ipcMain.handle("app:getRuntimeStatus", () => getAppRuntimeStatus());
  ipcMain.handle("app:getOnboardingCompleted", (event) => {
    assertCurrentMainWindowSender(event);
    return ensureAppOnboardingState().isCompleted();
  });
  ipcMain.handle("app:completeOnboarding", (event) => {
    assertCurrentMainWindowSender(event);
    return runPrivacyManagedDataWrite(() => ensureAppOnboardingState().markCompleted());
  });
  ipcMain.handle("app:setLaunchAtLogin", (_event, enabled: boolean) =>
    setLaunchAtLogin(Boolean(enabled))
  );
  ipcMain.handle("app:openExternalUrl", async (event, rawUrl: unknown) => {
    assertMainWindowIpcSender(event);
    const url = parseExternalHttpUrl(rawUrl);
    if (!url) {
      return false;
    }
    await shell.openExternal(url);
    return true;
  });
  ipcMain.handle("app:openChatGpt", async (event) => {
    assertMainWindowIpcSender(event);
    await shell.openExternal("https://chatgpt.com/");
    return true;
  });
  ipcMain.handle("app:setPlayerFullscreen", (event, enabled: boolean) =>
    setMainWindowPlayerFullscreen(BrowserWindow.fromWebContents(event.sender), enabled)
  );
  ipcMain.handle("lifeMinerBridge:getPairingStatus", (event) => {
    assertMainWindowIpcSender(event);
    return lifeMinerBridgePairing.getStatus();
  });
  ipcMain.handle("lifeMinerBridge:rotateToken", (event) => {
    assertMainWindowIpcSender(event);
    assertPrivacyDeletionAllowsBridgeCredentialsMutation();
    return lifeMinerBridgePairing.rotateToken();
  });
  ipcMain.handle("lifeMinerBridge:revoke", (event) => {
    assertMainWindowIpcSender(event);
    assertPrivacyDeletionAllowsBridgeCredentialsMutation();
    // Revoking a token is not proof that the browser extension was uninstalled.
    // Keep everPaired fail-closed so an automatic re-pair cannot bypass deletion.
    return lifeMinerBridgePairing.revoke();
  });
  ipcMain.handle("lifeMinerBridge:forgetUninstalledExtension", (event, input: unknown) => {
    assertMainWindowIpcSender(event);
    assertPrivacyDeletionAllowsBridgeCredentialsMutation();
    assertLifeMinerBridgeForgetConfirmation(input);
    // Revoke first. If the durable metadata write fails, the safer ordinary
    // revoke remains in effect while everPaired and release proofs stay intact.
    const status = lifeMinerBridgePairing.revoke();
    lifeMinerBridgeControlStore.forgetPairingHistoryAndReleaseProofs();
    return status;
  });
  ipcMain.handle("secureSettings:getStatus", (event) => {
    assertMainWindowIpcSender(event);
    return ensureSecureSettingsVault().getStatus();
  });
  ipcMain.handle("secureSettings:getForSession", (event) => {
    assertMainWindowIpcSender(event);
    assertPrivacyDeletionAllowsSecureSettingsWrites();
    return {
      geminiApiKey: ensureSecureSettingsVault().get("geminiApiKey"),
      googleTranslateApiKey: ensureSecureSettingsVault().get("googleTranslateApiKey")
    };
  });
  ipcMain.handle("secureSettings:set", (event, input: SecureSettingsInput) => {
    assertMainWindowIpcSender(event);
    assertPrivacyDeletionAllowsSecureSettingsWrites();
    return ensureSecureSettingsVault().set(input);
  });
  ipcMain.handle("secureSettings:migrateLegacy", (event, input: SecureSettingsInput) => {
    assertMainWindowIpcSender(event);
    assertPrivacyDeletionAllowsSecureSettingsWrites();
    return ensureSecureSettingsVault().migrateLegacy(input);
  });
  ipcMain.handle("backups:export", async (event, input: unknown) => {
    assertMainWindowIpcSender(event);
    const managedFileWriteIntent = capturePlayZoneManagedFileWriteIntent();
    const backupInput = normalizeAppBackupRendererInput(input);
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner) throw new Error(electronText(currentAppLocale, "backupWindowUnavailable"));
    const defaultName = `Language-Miner-${new Date().toISOString().slice(0, 10)}.lembackup`;
    const result = await dialog.showSaveDialog(owner, {
      title: electronText(currentAppLocale, "backupSaveTitle"),
      defaultPath: path.join(app.getPath("documents"), defaultName),
      buttonLabel: electronText(currentAppLocale, "backupSaveButton"),
      filters: [{ name: electronText(currentAppLocale, "backupFilter"), extensions: ["lembackup"] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    return runPlayZoneManagedFileWrite(
      () => ({
        canceled: false,
        filePath: writeAppBackupFile(
          result.filePath,
          createCurrentAppBackup(backupInput.renderer, backupInput.profileIds)
        )
      }),
      managedFileWriteIntent
    );
  });
  ipcMain.handle("backups:previewImport", async (event, input: unknown) => {
    assertMainWindowIpcSender(event);
    const managedFileWriteIntent = capturePlayZoneManagedFileWriteIntent();
    const previewInput = normalizeAppBackupRendererInput(input);
    const createPreviewContext = () => ({
      currentProfileIds: previewInput.profileIds,
      currentPayload: {
        database: ensureDatabase().exportAppBackupSnapshot(),
        renderer: previewInput.renderer,
        playZoneSaves: exportPlayZoneSaves(getPlayZoneSaveRoot())
      }
    });
    const qaBackupPath =
      isQaRuntime() && process.env.LM_QA_BACKUP_IMPORT_PATH
        ? path.resolve(process.env.LM_QA_BACKUP_IMPORT_PATH)
        : "";
    if (qaBackupPath) {
      return runPlayZoneManagedFileWrite(
        () => appBackupPreviewStore.add(readAppBackupFile(qaBackupPath), createPreviewContext()),
        managedFileWriteIntent
      );
    }
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner) throw new Error(electronText(currentAppLocale, "backupWindowUnavailable"));
    const result = await dialog.showOpenDialog(owner, {
      title: electronText(currentAppLocale, "backupOpenTitle"),
      buttonLabel: electronText(currentAppLocale, "backupOpenButton"),
      properties: ["openFile"],
      filters: [{ name: electronText(currentAppLocale, "backupFilter"), extensions: ["lembackup"] }]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return runPlayZoneManagedFileWrite(
      () => appBackupPreviewStore.add(readAppBackupFile(result.filePaths[0]), createPreviewContext()),
      managedFileWriteIntent
    );
  });
  ipcMain.handle("backups:restore", (event, input: unknown) => {
    assertMainWindowIpcSender(event);
    return runPlayZoneManagedFileWrite(() => {
      const restoreInput = normalizeAppBackupRestoreInput(input);
      const document = appBackupPreviewStore.take(restoreInput.handleId);
      const rollbackSnapshot = captureCurrentAppBackupRollbackSnapshot();
      let safetyBackupPath: string;
      try {
        const safetyDocument = createCurrentAppBackup(
          restoreInput.currentRenderer,
          restoreInput.currentProfileIds
        );
        safetyBackupPath = writeAppBackupFile(
          path.join(
            getAutomaticBackupRoot(),
            `Language-Miner-safety-before-restore-${new Date()
              .toISOString()
              .replace(/[^0-9]/g, "")
              .slice(0, 14)}.lembackup`
          ),
          safetyDocument
        );
      } catch (error) {
        disposeAppBackupRollbackSnapshot(rollbackSnapshot);
        throw error;
      }
      const profileIdMap =
        restoreInput.mode === "new_profile"
          ? createImportedProfileIdMap(document.manifest.profileIds)
          : {};
      try {
        const counts = ensureDatabase().restoreAppBackupSnapshot(
          document.payload.database,
          restoreInput.mode,
          profileIdMap
        );
        restorePlayZoneSaves(
          getPlayZoneSaveRoot(),
          document.payload.playZoneSaves,
          restoreInput.mode
        );
        const rollbackHandle = appBackupRollbackStore.add(rollbackSnapshot);
        return {
          restored: true,
          counts,
          renderer: document.payload.renderer,
          profileIdMap,
          safetyBackupPath,
          rollbackHandle
        };
      } catch (caught) {
        try {
          restoreCurrentAppBackupRollbackSnapshot(rollbackSnapshot);
        } catch (rollbackError) {
          throw new Error(
            formatElectronText(currentAppLocale, "backupRestoreAndRollbackFailed", {
              backupName: path.basename(safetyBackupPath),
              restoreError: getAppBackupErrorMessage(caught),
              rollbackError: getAppBackupErrorMessage(rollbackError)
            })
          );
        } finally {
          disposeAppBackupRollbackSnapshot(rollbackSnapshot);
        }
        throw new Error(
          formatElectronText(currentAppLocale, "backupRestoreRolledBack", {
            error: getAppBackupErrorMessage(caught)
          })
        );
      }
    });
  });
  ipcMain.handle("backups:rollbackRestore", (event, handle: unknown) => {
    assertMainWindowIpcSender(event);
    return runPlayZoneManagedFileWrite(() => {
      const snapshot = appBackupRollbackStore.take(typeof handle === "string" ? handle : "");
      try {
        restoreCurrentAppBackupRollbackSnapshot(snapshot);
        return true;
      } finally {
        disposeAppBackupRollbackSnapshot(snapshot);
      }
    });
  });
  ipcMain.handle("backups:finalizeRestore", (event, handle: unknown) => {
    assertMainWindowIpcSender(event);
    return appBackupRollbackStore.discard(typeof handle === "string" ? handle : "");
  });
  ipcMain.handle("privacy:deleteData", async (event, input: unknown) => {
    assertMainWindowIpcSender(event);
    const request = normalizePrivacyDataDeleteRequest(input);
    const deletesManagedFiles =
      request.target === "learning_data" || request.target === "all_local_data";
    const deletesApiKeys =
      request.target === "api_keys" || request.target === "all_local_data";
    const deletesWebReaderSession =
      request.target === "web_reader_login" || request.target === "all_local_data";
    const blocksPrivacyWrites = deletesManagedFiles || deletesApiKeys;
    let managedDataDeletionBlock: PlayZoneManagedFileWriterBlock | null = null;
    if (blocksPrivacyWrites) {
      const pending = privacyDeletionCoordinator.peekPendingStatus();
      if (pending) {
        const finalizedPending = finalizePrivacyDeletionIfVerified(pending);
        if (finalizedPending.phase === "pending" || finalizedPending.rendererResetRequired) {
          return finalizedPending;
        }
        persistExtensionBarrierRelease(finalizedPending, true);
        privacyDeletionCoordinator.discardForRetry(pending.operationId);
      }
      if (privacyManagedFileDeletionInProgress) {
        throw new Error("A local-data deletion is already in progress.");
      }
      privacyManagedFileDeletionInProgress = true;
      try {
        managedDataDeletionBlock = privacyManagedDataWriters.blockNewWrites();
      } catch (error) {
        privacyManagedFileDeletionInProgress = false;
        throw error;
      }
    }
    if (deletesApiKeys) {
      if (privacySecureSettingsDeletionInProgress) {
        managedDataDeletionBlock?.release();
        privacyManagedFileDeletionInProgress = false;
        throw new Error("An API-key deletion is already in progress.");
      }
      privacySecureSettingsDeletionInProgress = true;
    }
    if (deletesWebReaderSession) {
      if (privacyWebReaderDeletionInProgress) {
        managedDataDeletionBlock?.release();
        privacyManagedFileDeletionInProgress = false;
        if (deletesApiKeys) privacySecureSettingsDeletionInProgress = false;
        throw new Error("A Web Reader data deletion is already in progress.");
      }
      privacyWebReaderDeletionInProgress = true;
    }
    try {
      prepareRuntimeForPrivacyDeletion(request, event.sender.id);
      if (deletesApiKeys && !deletesManagedFiles && managedDataDeletionBlock) {
        await quiescePrivacyManagedDataWritersForDeletion(managedDataDeletionBlock);
      }
      if (deletesManagedFiles) {
        closePlayZoneRuntimeWindowsForPrivacyDeletion();
      }
      if (request.target === "web_reader_login" || request.target === "all_local_data") {
        await destroyWebReaderViewForPrivacyDeletion();
      }
      const privacyDataService = new PrivacyDataService({
        userDataPath: app.getPath("userData"),
        legacyUserDataPath: findPackagedLegacyDevelopmentUserDataPath(),
        database: ensureDatabase(),
        secureSettings: createPrivacySecureSettingsScope(),
        quiesceManagedFileWriters: deletesManagedFiles && managedDataDeletionBlock
          ? () => quiesceAndClearPlayZoneRuntimeForPrivacyDeletion(managedDataDeletionBlock)
          : undefined,
        clearWebReaderLoginData,
        clearElectronCaches
      });
      const result = await privacyDataService.deleteData(request);
      return finalizePrivacyDeletionIfVerified(
        privacyDeletionCoordinator.begin(
          preparePrivacyResultForOptionalExtension(result)
        )
      );
    } finally {
      if (blocksPrivacyWrites) {
        managedDataDeletionBlock?.release();
        privacyManagedFileDeletionInProgress = false;
      }
      if (deletesApiKeys) privacySecureSettingsDeletionInProgress = false;
      if (deletesWebReaderSession) privacyWebReaderDeletionInProgress = false;
    }
  });
  ipcMain.handle(
    "privacy:completeRendererCleanup",
    (event, input: { operationId?: unknown; report?: unknown } | null) => {
      assertMainWindowIpcSender(event);
      return finalizePrivacyDeletionIfVerified(privacyDeletionCoordinator.completeRendererCleanup(
        input?.operationId,
        input?.report
      ));
    }
  );
  ipcMain.handle("privacy:getDeleteStatus", (event, operationId: unknown) => {
    assertMainWindowIpcSender(event);
    return finalizePrivacyDeletionIfVerified(privacyDeletionCoordinator.getStatus(operationId));
  });
  ipcMain.handle("privacy:getPendingDeleteStatus", (event) => {
    assertMainWindowIpcSender(event);
    const pending = privacyDeletionCoordinator.getPendingStatus();
    return pending ? finalizePrivacyDeletionIfVerified(pending) : null;
  });
  ipcMain.handle("privacy:acknowledgeDeleteResult", (event, operationId: unknown) => {
    assertMainWindowIpcSender(event);
    const result = finalizePrivacyDeletionIfVerified(
      privacyDeletionCoordinator.getStatus(operationId)
    );
    privacyDeletionCoordinator.acknowledgeTerminal(operationId);
    return result;
  });
  ipcMain.handle("playZone:openRuntimeWindow", (event, input: PlayZoneRuntimeWindowInput) => {
    assertMainWindowIpcSender(event);
    return runPlayZoneManagedFileWrite(() =>
      openPlayZoneRuntimeWindow(input, getPlayZoneRuntimeWindowDependencies())
    );
  });
  ipcMain.handle("playZone:pickPackFile", (event) => {
    assertMainWindowIpcSender(event);
    const managedFileWriteIntent = capturePlayZoneManagedFileWriteIntent();
    return pickPlayZonePackFile(
      BrowserWindow.fromWebContents(event.sender),
      getPlayZoneArchiveCacheRoot(),
      currentAppLocale,
      (operation) => runPlayZoneManagedFileWrite(operation, managedFileWriteIntent)
    );
  });
  ipcMain.handle("playZone:listInstalledPacks", (event) => {
    assertMainWindowIpcSender(event);
    return runPlayZoneManagedFileWrite(() =>
      listPlayZonePacksWithOfficialCatalog(getPlayZoneInstalledRoot())
    );
  });
  ipcMain.handle("playZone:installOfficialPack", async (event, input: unknown) => {
    assertMainWindowIpcSender(event);
    return runPlayZoneManagedFileWrite(async () => {
      const candidate = input && typeof input === "object"
        ? input as { packId?: unknown; requestId?: unknown }
        : {};
      const packId = typeof candidate.packId === "string" ? candidate.packId.trim() : "";
      const requestId = typeof candidate.requestId === "string" ? candidate.requestId.trim() : "";
      if (!/^[A-Za-z0-9._-]{1,100}$/.test(packId) || !/^[A-Za-z0-9-]{8,80}$/.test(requestId)) {
        throw new Error("Invalid official PlayZone download request.");
      }
      if (officialPlayZoneDownloadControllers.has(requestId)) {
        throw new Error("Official PlayZone download request is already active.");
      }
      if (officialPlayZoneDownloadControllers.size > 0) {
        throw new Error("Another official PlayZone download is already active.");
      }
      const controller = new AbortController();
      let markSettled = () => {};
      const settled = new Promise<void>((resolve) => {
        markSettled = resolve;
      });
      officialPlayZoneDownloadControllers.set(requestId, {
        senderId: event.sender.id,
        packId,
        controller,
        settled
      });
      const abortWhenRendererCloses = () => controller.abort();
      event.sender.once("destroyed", abortWhenRendererCloses);
      try {
        return await downloadAndInstallOfficialPlayZonePack({
          packId,
          requestId,
          downloadRootPath: getPlayZoneDownloadRoot(),
          archiveCacheRootPath: getPlayZoneArchiveCacheRoot(),
          installedRootPath: getPlayZoneInstalledRoot(),
          signal: controller.signal,
          onProgress: (progress) => {
            if (!event.sender.isDestroyed()) {
              event.sender.send("playZone:officialDownloadProgress", progress);
            }
          }
        });
      } finally {
        event.sender.removeListener("destroyed", abortWhenRendererCloses);
        officialPlayZoneDownloadControllers.delete(requestId);
        markSettled();
      }
    });
  });
  ipcMain.handle("playZone:cancelOfficialPackDownload", (event, requestId: unknown) => {
    assertMainWindowIpcSender(event);
    const normalizedRequestId = typeof requestId === "string" ? requestId.trim() : "";
    const active = officialPlayZoneDownloadControllers.get(normalizedRequestId);
    if (!active || active.senderId !== event.sender.id) return false;
    active.controller.abort();
    return true;
  });
  ipcMain.handle("playZone:installPack", (event, input: unknown) => {
    assertMainWindowIpcSender(event);
    const candidate = input && typeof input === "object"
      ? input as { sourcePath?: unknown; replaceInstallationId?: unknown }
      : {};
    return runPlayZoneManagedFileWrite(() =>
      installPlayZonePack({
        sourcePath: typeof candidate.sourcePath === "string" ? candidate.sourcePath : "",
        replaceInstallationId: typeof candidate.replaceInstallationId === "string"
          ? candidate.replaceInstallationId
          : undefined
      }, getPlayZoneArchiveCacheRoot(), getPlayZoneInstalledRoot())
    );
  });
  ipcMain.handle("playZone:scanPackFile", (event, filePath: unknown) => {
    assertMainWindowIpcSender(event);
    return runPlayZoneManagedFileWrite(() =>
      scanPlayZonePackFile(
        typeof filePath === "string" ? filePath : "",
        getPlayZoneArchiveCacheRoot()
      )
    );
  });
  ipcMain.handle("playZone:pickLibraryFolder", (event) => {
    assertMainWindowIpcSender(event);
    const managedFileWriteIntent = capturePlayZoneManagedFileWriteIntent();
    return pickPlayZoneLibraryFolder(
      BrowserWindow.fromWebContents(event.sender),
      getPlayZoneArchiveCacheRoot(),
      currentAppLocale,
      (operation) => runPlayZoneManagedFileWrite(operation, managedFileWriteIntent)
    );
  });
  ipcMain.handle("playZone:scanLibraryFolder", (event, folderPath: unknown) => {
    assertMainWindowIpcSender(event);
    return runPlayZoneManagedFileWrite(() =>
      scanPlayZoneLibraryFolder(
        typeof folderPath === "string" ? folderPath : "",
        getPlayZoneArchiveCacheRoot()
      )
    );
  });
  ipcMain.handle("playZone:loadSave", (event, input) => {
    assertTrustedIpcSender(event);
    return runPlayZoneManagedFileWrite(() => loadPlayZoneSave(getPlayZoneSaveRoot(), input));
  });
  ipcMain.handle("playZone:writeSave", (event, input) => {
    assertTrustedIpcSender(event);
    return runPlayZoneManagedFileWrite(() => writePlayZoneSave(getPlayZoneSaveRoot(), input));
  });
  ipcMain.handle("playZone:clearSave", (event, input) => {
    assertTrustedIpcSender(event);
    return runPlayZoneManagedFileWrite(() => clearPlayZoneSave(getPlayZoneSaveRoot(), input));
  });
  ipcMain.handle("playZone:backupSave", (event, input) => {
    assertMainWindowIpcSender(event);
    return runPlayZoneManagedFileWrite(() => backupPlayZoneSave(getPlayZoneSaveRoot(), input));
  });
  ipcMain.handle("webReader:attach", async (event, input: WebReaderAttachInput) => {
    assertMainWindowIpcSender(event);
    assertPrivacyDeletionAllowsWebReaderSession();
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner) {
      throw new Error(electronText(currentAppLocale, "webReaderOwnerUnavailable"));
    }
    const view = ensureWebReaderView(owner);
    await applyWebReaderBounds(view, input.bounds);
    const url = normalizeWebReaderUrl(input.url);
    await loadWebReaderViewUrl(view, url);
    await injectWebReaderSelectionPopover(view);
    return getWebReaderViewState(view);
  });
  ipcMain.handle("webReader:setBounds", async (_event, bounds: WebReaderBoundsInput) => {
    if (!webReaderView || webReaderView.webContents.isDestroyed()) {
      return getWebReaderViewState();
    }
    await applyWebReaderBounds(webReaderView, bounds);
    await injectWebReaderSelectionPopover(webReaderView);
    return getWebReaderViewState(webReaderView);
  });
  ipcMain.handle("webReader:setVisible", (_event, visible: unknown) => {
    assertPrivacyDeletionAllowsWebReaderSession();
    return setWebReaderViewVisible(visible !== false);
  });
  ipcMain.handle("webReader:loadUrl", async (event, urlInput: unknown) => {
    assertMainWindowIpcSender(event);
    assertPrivacyDeletionAllowsWebReaderSession();
    if (!webReaderView || webReaderView.webContents.isDestroyed()) {
      return getWebReaderViewState();
    }
    const url = normalizeWebReaderUrl(urlInput);
    await loadWebReaderViewUrl(webReaderView, url);
    return getWebReaderViewState(webReaderView);
  });
  ipcMain.handle("webReader:goBack", () => {
    assertPrivacyDeletionAllowsWebReaderSession();
    if (webReaderView?.webContents.navigationHistory.canGoBack()) {
      webReaderView.webContents.navigationHistory.goBack();
    }
    return getWebReaderViewState();
  });
  ipcMain.handle("webReader:goForward", () => {
    assertPrivacyDeletionAllowsWebReaderSession();
    if (webReaderView?.webContents.navigationHistory.canGoForward()) {
      webReaderView.webContents.navigationHistory.goForward();
    }
    return getWebReaderViewState();
  });
  ipcMain.handle("webReader:reload", () => {
    assertPrivacyDeletionAllowsWebReaderSession();
    webReaderView?.webContents.reload();
    return getWebReaderViewState();
  });
  ipcMain.handle("webReader:getState", () => getWebReaderViewState());
  ipcMain.handle("webReader:getLifeMiningState", () => getWebReaderLifeMiningState());
  ipcMain.handle("webReader:getPageTextSegments", () => getWebReaderPageTextSegments());
  ipcMain.handle("webReader:applyPageTranslations", (_event, input: unknown) =>
    applyWebReaderPageTranslations(input)
  );
  ipcMain.handle("webReader:restorePageTranslations", () => restoreWebReaderPageTranslations());
  ipcMain.handle("webReader:getSelection", () => getWebReaderSelection());
  ipcMain.handle("webReader:consumePopoverAction", () => consumeWebReaderPopoverAction());
  ipcMain.handle("webReader:showSelectionPopover", () => showWebReaderPopoverFromSelection());
  ipcMain.handle("webReader:showPopoverStatus", (_event, input: unknown) =>
    showWebReaderPopoverStatus(input)
  );
  ipcMain.handle("webReader:showPopoverResult", (_event, card: unknown) =>
    showWebReaderPopoverResult(card)
  );
  ipcMain.handle("webReader:hidePopover", () => hideWebReaderPopover());
  if (isQaRuntime()) {
    ipcMain.handle(
      "webReader:testSelectionPopover",
      (_event, preferredText?: unknown, expectedContext?: unknown) =>
        testWebReaderSelectionPopover(preferredText, expectedContext)
    );
    ipcMain.handle("webReader:testLifeMiningCapture", () => testWebReaderLifeMiningCapture());
    ipcMain.handle("webReader:captureLifeMiningNow", () => captureWebReaderLifeMiningNow());
  }
  ipcMain.handle("webReader:detach", () => {
    destroyWebReaderView();
    return true;
  });
  ipcMain.handle(
    "app:setBridgeSettings",
    (
      event,
      settings: {
        appLocale?: "ko" | "en";
        browserCaptureSiteSettings?: Partial<BrowserCaptureSiteSettings>;
        lifeMiningCaptureSettings?: Partial<LifeMiningCaptureSettings>;
        captureShortcut?: string;
        browserSelectionCardMode?: BrowserSelectionCardMode;
        providerName?: AppSettings["providerName"];
        ollamaBaseUrl?: string;
        ollamaModel?: string;
        geminiApiKey?: string;
        geminiModel?: string;
        geminiPlan?: AppSettings["geminiPlan"];
        cloudConsent?: CloudProviderConsentRecord;
        learningProfile?: Partial<LearningProfile>;
        dailyAppTokenLimit?: number;
        monthlySpendLimitKrw?: number;
        stopOnFreeTierLimit?: boolean;
        stopOnMonthlyLimit?: boolean;
        usageSummary?: { todayTokens?: number; monthCostKrw?: number };
        cardSyncFolderPath?: string;
        cardSyncOnQuit?: boolean;
      }
    ) => {
      assertMainWindowIpcSender(event);
      assertPrivacyDeletionAllowsSecureSettingsWrites();
      currentAppLocale = settings.appLocale === "en" ? "en" : "ko";
      void injectWebReaderSelectionPopover();
      refreshAppTrayMenu();
      cardSyncRuntimeSettings = {
        cardSyncFolderPath:
          typeof settings.cardSyncFolderPath === "string"
            ? settings.cardSyncFolderPath
            : cardSyncRuntimeSettings.cardSyncFolderPath,
        cardSyncOnQuit:
          typeof settings.cardSyncOnQuit === "boolean"
            ? settings.cardSyncOnQuit
            : cardSyncRuntimeSettings.cardSyncOnQuit
      };
      bridgeUsageBudgetState = {
        ...bridgeUsageBudgetState,
        todayTokens: Math.max(0, Number(settings.usageSummary?.todayTokens) || 0),
        monthCostKrw: Math.max(0, Number(settings.usageSummary?.monthCostKrw) || 0),
        stopOnFreeTierLimit: settings.stopOnFreeTierLimit !== false,
        stopOnMonthlyLimit: settings.stopOnMonthlyLimit !== false,
        // A fresh renderer summary includes events previously sent through usage:recorded.
        unsyncedTokens: 0,
        unsyncedCostKrw: 0
      };
      browserSelectionCardMode =
        settings.browserSelectionCardMode === "autoSave" ? "autoSave" : "preview";
      browserCaptureSiteSettings = normalizeBrowserCaptureSiteSettings(
        settings.browserCaptureSiteSettings
      );
      lifeMiningCaptureSettings = normalizeLifeMiningCaptureSettings(
        settings.lifeMiningCaptureSettings
      );
      if (lifeMiningCaptureSettings.enabled && webReaderView) {
        startWebReaderLifeMiningPolling();
      } else if (!lifeMiningCaptureSettings.enabled) {
        stopWebReaderLifeMiningPolling();
      }
      browserCaptureShortcut =
        typeof settings.captureShortcut === "string" && settings.captureShortcut.trim()
          ? settings.captureShortcut.trim()
          : browserCaptureShortcut;
      browserCardProviderSettings = {
        providerName:
          settings.providerName === "gemini" ||
          settings.providerName === "ollama" ||
          settings.providerName === "mock" ||
          settings.providerName === "chatgptWeb"
            ? settings.providerName
            : browserCardProviderSettings.providerName,
        ollamaBaseUrl:
          typeof settings.ollamaBaseUrl === "string" && settings.ollamaBaseUrl.trim()
            ? settings.ollamaBaseUrl
            : browserCardProviderSettings.ollamaBaseUrl,
        ollamaModel:
          typeof settings.ollamaModel === "string" && settings.ollamaModel.trim()
            ? settings.ollamaModel
            : browserCardProviderSettings.ollamaModel,
        geminiApiKey: (() => {
          if (typeof settings.geminiApiKey === "string" && settings.geminiApiKey.trim()) {
            ensureSecureSettingsVault().migrateLegacy({ geminiApiKey: settings.geminiApiKey });
          }
          return ensureSecureSettingsVault().get("geminiApiKey");
        })(),
        geminiModel:
          typeof settings.geminiModel === "string" && settings.geminiModel.trim()
            ? settings.geminiModel
            : browserCardProviderSettings.geminiModel,
        geminiPlan: settings.geminiPlan === "paid" ? "paid" : "free",
        cloudConsent: settings.cloudConsent,
        learningProfile: normalizeLearningProfile(settings.learningProfile),
        dailyAppTokenLimit:
          typeof settings.dailyAppTokenLimit === "number" && settings.dailyAppTokenLimit > 0
            ? settings.dailyAppTokenLimit
            : browserCardProviderSettings.dailyAppTokenLimit,
        monthlySpendLimitKrw:
          typeof settings.monthlySpendLimitKrw === "number" && settings.monthlySpendLimitKrw >= 0
            ? settings.monthlySpendLimitKrw
            : browserCardProviderSettings.monthlySpendLimitKrw
      };
      void injectWebReaderLifeMining(webReaderView);
      return true;
    }
  );
  ipcMain.handle("profiles:setActive", (event, profileId: ProfileId) => {
    assertMainWindowIpcSender(event);
    activeProfileId = normalizeProfileId(profileId);
    return true;
  });
  ipcMain.handle("profiles:getDataSummary", (_event, profileId?: ProfileId) =>
    ensureDatabase().getProfileDataSummary(profileId)
  );
  ipcMain.handle("profiles:deleteData", (event, profileId: ProfileId) => {
    assertMainWindowIpcSender(event);
    return runPrivacyManagedDataWrite(() => ensureDatabase().deleteProfileData(profileId));
  });
  ipcMain.handle("desktopCapture:startOcrCapture", async (event) => {
    assertMainWindowIpcSender(event);
    return runPrivacyManagedDataWrite(async () => {
      await startDesktopOcrCapture(currentAppLocale);
      return true;
    });
  });
  ipcMain.handle(
    "desktopCapture:finishOcrSelection",
    async (event, rect: DesktopOcrSelectionRect): Promise<DesktopOcrCaptureResult> => {
      assertTrustedIpcSender(event);
      return runAbortablePrivacyManagedDataWrite((signal) =>
        finishDesktopOcrSelection(rect, currentAppLocale, signal)
      );
    }
  );
  ipcMain.handle("desktopCapture:cancelOcrSelection", (event) => {
    assertTrustedIpcSender(event);
    closeDesktopOcrCaptureWindow();
    return true;
  });
  ipcMain.handle("desktopCapture:createInputCard", async (event, input: DesktopOcrCardInput) => {
    assertTrustedIpcSender(event);
    return runPrivacyManagedDataWrite(() => createAndSaveDesktopOcrInputCard(input));
  });
  ipcMain.handle("cards:list", (_event, profileId?: ProfileId) =>
    ensureDatabase().listCards(profileId)
  );
  ipcMain.handle("cards:listPage", (_event, profileId?: ProfileId, offset?: number, limit?: number) =>
    ensureDatabase().listCardsPage(profileId, offset, limit)
  );
  ipcMain.handle("cards:listDue", (_event, nowIso?: string, profileId?: ProfileId) =>
    ensureDatabase().listDueCards(nowIso, profileId)
  );
  ipcMain.handle("cards:save", (_event, card: StudyCard, profileId?: ProfileId) => {
    return runPrivacyManagedDataWrite(() => {
      const db = ensureDatabase();
      const wasExisting = db.hasCard(card.id);
      const saved = db.saveCard(card, profileId);
      if (!wasExisting && !isDefaultSampleCardId(saved.id)) {
        recordCardCreationMissionEvent(db, saved, profileId ?? activeProfileId);
      }
      notifyCardsChanged(saved);
      return saved;
    });
  });
  ipcMain.handle("cards:delete", (_event, id: string) => {
    return runPrivacyManagedDataWrite(() => {
      ensureDatabase().deleteCard(id);
      return true;
    });
  });
  ipcMain.handle("cards:review", (_event, cardId: string, rating: ReviewRating) => {
    return runPrivacyManagedDataWrite(() => {
      const db = ensureDatabase();
      const reviewed = db.reviewCard(cardId, rating);
      db.recordMissionEvent({
        type: "review_completed",
        profileId: reviewed.profileId ?? activeProfileId,
        amount: 1,
        metadata: {
          cardId,
          rating
        }
      });
      notifyCardsChanged(reviewed);
      return reviewed;
    });
  });
  ipcMain.handle("wallet:get", () => ensureDatabase().getDiamondWallet());
  ipcMain.handle("wallet:listTransactions", () => ensureDatabase().listDiamondTransactions());
  ipcMain.handle("wallet:lookupSpend", (event, input) => {
    assertTrustedIpcSender(event);
    return ensureDatabase().lookupDiamondSpend(input);
  });
  ipcMain.handle("wallet:spend", (event, input) => {
    assertTrustedIpcSender(event);
    return runPrivacyManagedDataWrite(() => {
      const result = ensureDatabase().spendDiamonds(input);
      if (result.ok) {
        notifyPlayZoneWalletChanged();
      }
      return result;
    });
  });
  ipcMain.handle("missions:getToday", (_event, profileId?: ProfileId) =>
    ensureDatabase().getTodayMissions(profileId ?? activeProfileId)
  );
  ipcMain.handle(
    "missions:recordEvent",
    (_event, input: Omit<LearningMissionEvent, "id" | "dateKey" | "createdAt">) =>
      runPrivacyManagedDataWrite(() =>
        ensureDatabase().recordMissionEvent({
          ...input,
          profileId: input.profileId ?? activeProfileId
        })
      )
  );
  ipcMain.handle("missions:claimReward", (_event, missionId: DailyMissionId, profileId?: ProfileId) =>
    runPrivacyManagedDataWrite(() =>
      ensureDatabase().claimMissionReward(missionId, profileId ?? activeProfileId)
    )
  );
  ipcMain.handle("missions:claimDailyBonus", (_event, profileId?: ProfileId) =>
    runPrivacyManagedDataWrite(() =>
      ensureDatabase().claimDailyBonus(profileId ?? activeProfileId)
    )
  );
  ipcMain.handle(
    "cardSync:status",
    (_event, settings: CardSyncSettings): Promise<CardSyncStatus> =>
      getLocalFolderCardSyncStatus(settings, currentAppLocale)
  );
  ipcMain.handle(
    "cardSync:connect",
    (_event, settings: CardSyncSettings): Promise<CardSyncStatus> => {
      const intent = capturePrivacyManagedDataWriteIntent();
      return pickLocalCardSyncFolder(
        settings,
        currentAppLocale,
        (operation) => runPrivacyManagedDataWrite(operation, intent)
      );
    }
  );
  ipcMain.handle("cardSync:disconnect", (): Promise<CardSyncStatus> =>
    runPrivacyManagedDataWrite(() => disconnectLocalCardSyncFolder(currentAppLocale))
  );
  ipcMain.handle(
    "cardSync:upload",
    (_event, settings: CardSyncSettings, profileId?: ProfileId): Promise<CardSyncResult> =>
      runPrivacyManagedDataWrite(() =>
        uploadCardsToLocalFolder(
          settings,
          ensureDatabase().listCards(profileId),
          profileId ?? activeProfileId,
          currentAppLocale
        )
      )
  );
  ipcMain.handle(
    "cardSync:download",
    (_event, settings: CardSyncSettings, profileId?: ProfileId): Promise<CardSyncResult> =>
      runPrivacyManagedDataWrite(() =>
        downloadCardsFromLocalFolder(
          settings,
          ensureDatabase().listCards(profileId),
          (cards) => ensureDatabase().importCards(cards, profileId),
          profileId ?? activeProfileId,
          currentAppLocale
        )
      )
  );
  ipcMain.handle(
    "cardSync:sync",
    (_event, settings: CardSyncSettings, profileId?: ProfileId): Promise<CardSyncResult> =>
      runPrivacyManagedDataWrite(() =>
        syncCardsWithLocalFolder(
          settings,
          ensureDatabase().listCards(profileId),
          (cards) => ensureDatabase().importCards(cards, profileId),
          profileId ?? activeProfileId,
          currentAppLocale
        )
      )
  );
  ipcMain.handle(
    "lifeLogs:save",
    (_event, input: Omit<LifeLog, "id" | "processed" | "createdAt">) =>
      runPrivacyManagedDataWrite(() => ensureDatabase().saveLifeLog(input))
  );
  ipcMain.handle("lifeLogs:list", () => ensureDatabase().listLifeLogs());
  ipcMain.handle("lifeLogs:listPage", (_event, offset?: number, limit?: number) =>
    ensureDatabase().listLifeLogsPage(offset, limit)
  );
  ipcMain.handle("lifeLogs:markProcessed", (_event, id: string, profileId?: ProfileId) => {
    return runPrivacyManagedDataWrite(() => {
      ensureDatabase().markLifeLogProcessed(id, profileId);
      return true;
    });
  });
  ipcMain.handle("lifeLogs:delete", (_event, id: string) => {
    return runPrivacyManagedDataWrite(() => {
      ensureDatabase().deleteLifeLog(id);
      return true;
    });
  });
  ipcMain.handle("listening:listVideoCandidates", () =>
    ensureDatabase().listListeningVideoCandidates()
  );
  ipcMain.handle(
    "listening:saveVideoCandidate",
    (_event, input: ListeningVideoCandidateInput) =>
      runPrivacyManagedDataWrite(() => ensureDatabase().saveListeningVideoCandidate(input))
  );
  ipcMain.handle("listening:markVideoCandidatesLearned", (_event, candidateIds?: unknown) => {
    return runPrivacyManagedDataWrite(() => {
      const database = ensureDatabase();
      const ids = Array.isArray(candidateIds)
        ? candidateIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        : [];
      const idSet = new Set(ids);
      const candidates = database.listListeningVideoCandidates(500);
      const learnedVideoIds = new Set(
        candidates
          .filter((candidate) => idSet.has(candidate.id))
          .map((candidate) => candidate.videoId.trim())
          .filter(Boolean)
      );
      const learnedAt = new Date().toISOString();
      candidates
        .filter(
          (candidate) =>
            idSet.has(candidate.id) || learnedVideoIds.has(candidate.videoId.trim())
        )
        .forEach((candidate) => {
          database.updateListeningVideoCandidateMetadata(candidate.id, {
            metadata: {
              learnedAt,
              learned: true
            }
          });
        });
      return database.listListeningVideoCandidates();
    });
  });
  ipcMain.handle("listening:fetchRssCandidates", async (_event, languageCode?: string) => {
    return runAbortablePrivacyManagedDataWrite(async (signal) => {
      const targetLanguageCode =
        typeof languageCode === "string" && languageCode.trim()
          ? languageCode
          : browserCardProviderSettings.learningProfile.targetLanguage.code;
      const candidates = await fetchListeningRssCandidates(
        undefined,
        targetLanguageCode,
        undefined,
        signal
      );
      throwIfPrivacyManagedDataWriteAborted(signal);
      const database = ensureDatabase();
      return candidates.map((candidate) => database.saveListeningVideoCandidate(candidate));
    });
  });
  ipcMain.handle("listening:refreshVideoCandidateMetadata", async (_event, candidateIds?: unknown) =>
    runAbortablePrivacyManagedDataWrite((signal) =>
      refreshListeningVideoCandidateMetadata(candidateIds, signal)
    )
  );
  ipcMain.handle("listening:listTranscripts", () =>
    ensureDatabase().listListeningTranscripts()
  );
  ipcMain.handle("listening:getTranscript", (_event, candidateId: string) =>
    ensureDatabase().getListeningTranscript(candidateId)
  );
  ipcMain.handle("listening:saveTranscript", (_event, transcript: ListeningTranscript) =>
    runPrivacyManagedDataWrite(() => ensureDatabase().saveListeningTranscript(transcript))
  );
  ipcMain.handle("listening:getToolStatus", () => getListeningToolStatus());
  ipcMain.handle("listening:pickLocalVideoFile", async (_event, folderPath?: unknown) => {
    const intent = capturePrivacyManagedDataWriteIntent();
    const initialFolderPath =
      typeof folderPath === "string" && folderPath.trim() ? folderPath.trim() : undefined;
    const picked = await pickLocalVideoFile(mainWindow, initialFolderPath, currentAppLocale);
    return runAbortablePrivacyManagedDataWrite(
      (signal) => (picked ? prepareLocalVideoFileForPlayback(picked, signal) : null),
      intent
    );
  });
  ipcMain.handle("listening:listLocalVideoFolderVideos", (_event, folderPath?: unknown) => {
    if (typeof folderPath !== "string" || !folderPath.trim()) {
      return [];
    }
    return listLocalVideoFolderVideos(folderPath).map(withLocalVideoPlaybackProtocol);
  });
  ipcMain.handle("listening:pickLocalVideoFolder", () =>
    pickLocalVideoFolder(mainWindow, currentAppLocale)
  );
  ipcMain.handle("listening:prepareLocalVideoFile", async (_event, input: ListeningLocalVideoFile) =>
    runAbortablePrivacyManagedDataWrite((signal) =>
      prepareLocalVideoFileForPlayback(input, signal)
    )
  );
  ipcMain.handle(
    "listening:createListeningCardMediaClip",
    async (_event, input: ListeningCardMediaClipInput) => {
      return runAbortablePrivacyManagedDataWrite(async (signal) => {
        try {
          const result = await createListeningCardMediaClip(input, {
            workRoot: path.join(app.getPath("userData"), "media", "listening-card-clips"),
            signal
          });
          throwIfPrivacyManagedDataWriteAborted(signal);
          return result.media
            ? {
                ...result,
                media: withLocalListeningMediaProtocol(result.media)
              }
            : result;
        } catch (caught) {
          throwIfPrivacyManagedDataWriteAborted(signal);
          console.warn(
            "[listening] card media clip failed",
            serializeSafeDebugLogEntry({ error: caught })
          );
          return {
            ok: false,
            toolStatus: await getListeningToolStatus(signal),
            message: electronText(currentAppLocale, "listeningSourceAudioFailed")
          };
        }
      });
    }
  );
  ipcMain.handle(
    "listening:extractLocalEmbeddedSubtitle",
    async (_event, input: ListeningLocalTranscriptInput) => {
      return runAbortablePrivacyManagedDataWrite(async (signal) => {
      const toolStatus = await getListeningToolStatus(signal);
      const filePath = input.filePath.trim();
      const title = input.title?.trim() || path.basename(filePath, path.extname(filePath));
      const transcriptLanguageCode =
        input.languageCode ?? browserCardProviderSettings.learningProfile.targetLanguage.code;

      try {
        const transcript = await extractLocalEmbeddedSubtitleTranscript(
          {
            filePath,
            title,
            languageCode: transcriptLanguageCode
          },
          {
            workRoot: path.join(app.getPath("userData"), "listening-transcripts"),
            modelName: "embedded-subtitle",
            signal
          }
        );
        throwIfPrivacyManagedDataWriteAborted(signal);
        const saved = ensureDatabase().saveListeningTranscript({
          ...transcript,
          languageCode: transcript.languageCode ?? transcriptLanguageCode
        });
        return {
          ok: true,
          transcript: saved,
          toolStatus,
          message:
            saved.segments.length === 1
              ? electronText(currentAppLocale, "listeningEmbeddedImportedOne")
              : formatElectronText(currentAppLocale, "listeningEmbeddedImported", {
                  count: formatElectronNumber(currentAppLocale, saved.segments.length)
                })
        };
      } catch (caught) {
        throwIfPrivacyManagedDataWriteAborted(signal);
        console.warn(
          "[listening] embedded subtitle import failed",
          serializeSafeDebugLogEntry({ error: caught })
        );
        return {
          ok: false,
          toolStatus,
          message: electronText(currentAppLocale, "listeningEmbeddedUnavailable")
        };
      }
      });
    }
  );
  ipcMain.handle("listening:generateTranscript", async (_event, candidateId: string) => {
    return runAbortablePrivacyManagedDataWrite(async (signal) => {
    const database = ensureDatabase();
    const candidate = database.getListeningVideoCandidate(candidateId);
    const toolStatus = await getListeningToolStatus(signal);
    if (!candidate) {
      return {
        ok: false,
        toolStatus,
        message: electronText(currentAppLocale, "listeningCandidateUnavailable")
      };
    }

    const now = new Date().toISOString();
    const transcriptLanguageCode =
      candidate.languageCode ?? browserCardProviderSettings.learningProfile.targetLanguage.code;
    const transcriptModelName = getDefaultListeningWhisperModel(transcriptLanguageCode);
    throwIfPrivacyManagedDataWriteAborted(signal);
    database.saveListeningTranscript({
      id: `transcript:${candidate.id}`,
      candidateId: candidate.id,
      videoId: candidate.videoId,
      title: candidate.title,
      channelName: candidate.channelName,
      languageCode: transcriptLanguageCode,
      status: "processing",
      segments: [],
      modelName: transcriptModelName,
      createdAt: now,
      updatedAt: now
    });

    try {
      const transcript = await generateListeningTranscript(
        {
          ...candidate,
          languageCode: transcriptLanguageCode
        },
        {
          workRoot: path.join(app.getPath("userData"), "listening-transcripts"),
          modelName: transcriptModelName,
          signal
        }
      );
      throwIfPrivacyManagedDataWriteAborted(signal);
      const saved = database.saveListeningTranscript({
        ...transcript,
        languageCode: transcript.languageCode ?? transcriptLanguageCode
      });
      return {
        ok: true,
        transcript: saved,
        toolStatus,
        message:
          saved.segments.length === 1
            ? electronText(currentAppLocale, "listeningSegmentCreatedOne")
            : formatElectronText(currentAppLocale, "listeningSegmentsCreated", {
                count: formatElectronNumber(currentAppLocale, saved.segments.length)
              })
      };
    } catch (caught) {
      throwIfPrivacyManagedDataWriteAborted(signal);
      console.warn(
        "[listening] remote video transcription failed",
        serializeSafeDebugLogEntry({ error: caught })
      );
      const message = electronText(currentAppLocale, "listeningWhisperFailed");
      const failedTranscript: ListeningTranscript = {
        id: `transcript:${candidate.id}`,
        candidateId: candidate.id,
        videoId: candidate.videoId,
        title: candidate.title,
        channelName: candidate.channelName,
        languageCode: transcriptLanguageCode,
        status: "failed",
        segments: [],
        errorMessage: message,
        modelName: transcriptModelName,
        createdAt: now,
        updatedAt: new Date().toISOString()
      };
      throwIfPrivacyManagedDataWriteAborted(signal);
      const saved = database.saveListeningTranscript(failedTranscript);
      return {
        ok: false,
        transcript: saved,
        toolStatus,
        message
      };
    }
    });
  });
  ipcMain.handle(
    "listening:generateLocalTranscript",
    async (_event, input: ListeningLocalTranscriptInput) => {
      return runAbortablePrivacyManagedDataWrite(async (signal) => {
      const toolStatus = await getListeningToolStatus(signal);
      const now = new Date().toISOString();
      const filePath = input.filePath.trim();
      const title = input.title?.trim() || path.basename(filePath, path.extname(filePath));
      const candidateId = `local-file:${filePath}`;
      const transcriptLanguageCode =
        input.languageCode ?? browserCardProviderSettings.learningProfile.targetLanguage.code;
      const transcriptModelName = getDefaultListeningWhisperModel(transcriptLanguageCode);

      throwIfPrivacyManagedDataWriteAborted(signal);
      ensureDatabase().saveListeningTranscript({
        id: `transcript:${candidateId}`,
        candidateId,
        videoId: `local:${path.basename(filePath)}`,
        title,
        channelName: electronText(currentAppLocale, "localFileSourceName"),
        languageCode: transcriptLanguageCode,
        status: "processing",
        segments: [],
        modelName: transcriptModelName,
        createdAt: now,
        updatedAt: now
      });

      try {
        const transcript = await generateLocalFileListeningTranscript(
          {
            filePath,
            title,
            languageCode: transcriptLanguageCode
          },
          {
            workRoot: path.join(app.getPath("userData"), "listening-transcripts"),
            modelName: transcriptModelName,
            signal
          }
        );
        throwIfPrivacyManagedDataWriteAborted(signal);
        const saved = ensureDatabase().saveListeningTranscript({
          ...transcript,
          languageCode: transcript.languageCode ?? transcriptLanguageCode
        });
        return {
          ok: true,
          transcript: saved,
          toolStatus,
          message:
            saved.segments.length === 1
              ? electronText(currentAppLocale, "listeningSegmentCreatedOne")
              : formatElectronText(currentAppLocale, "listeningSegmentsCreated", {
                  count: formatElectronNumber(currentAppLocale, saved.segments.length)
                })
        };
      } catch (caught) {
        throwIfPrivacyManagedDataWriteAborted(signal);
        console.warn(
          "[listening] local video transcription failed",
          serializeSafeDebugLogEntry({ error: caught })
        );
        const message = electronText(currentAppLocale, "listeningLocalWhisperFailed");
        const failedTranscript: ListeningTranscript = {
          id: `transcript:${candidateId}`,
          candidateId,
          videoId: `local:${path.basename(filePath)}`,
          title,
          channelName: electronText(currentAppLocale, "localFileSourceName"),
          languageCode: transcriptLanguageCode,
          status: "failed",
          segments: [],
          errorMessage: message,
          modelName: transcriptModelName,
          createdAt: now,
          updatedAt: new Date().toISOString()
        };
        throwIfPrivacyManagedDataWriteAborted(signal);
        const saved = ensureDatabase().saveListeningTranscript(failedTranscript);
        return {
          ok: false,
          transcript: saved,
          toolStatus,
          message
        };
      }
      });
    }
  );
  ipcMain.handle(
    "documents:exportBilingualPdf",
    async (event, input: BilingualPdfExportInput): Promise<BilingualPdfExportResult> => {
      assertMainWindowIpcSender(event);
      return exportBilingualPdfDocument(input, {
        createWindow: createBilingualPdfExportWindow,
        exportFilePath: getQaExportFilePath(input) ?? getAutoBilingualExportFilePath(input),
        tempDir: app.getPath("temp")
      });
    }
  );
  ipcMain.handle("documents:listExportRecords", (_event, profileId?: ProfileId) =>
    ensureDatabase().listExportRecords(profileId)
  );
  ipcMain.handle(
    "documents:saveExportRecord",
    (event, record: BilingualExportHistoryRecord) => {
      assertMainWindowIpcSender(event);
      return runPrivacyManagedDataWrite(() => ensureDatabase().saveExportRecord(record));
    }
  );
  ipcMain.handle(
    "documents:redownloadExport",
    async (
      event,
      record: BilingualExportHistoryRecord
    ): Promise<BilingualPdfExportResult> => {
      assertMainWindowIpcSender(event);
      return redownloadExport(record);
    }
  );
  ipcMain.handle(
    "documents:pickReaderArtifact",
    async (event): Promise<BilingualReaderArtifact | null> => {
      assertMainWindowIpcSender(event);
      return pickReaderArtifact(mainWindow, currentAppLocale);
    }
  );
  ipcMain.handle(
    "documents:readPdfFile",
    (event, filePath: string): PdfFileReadResult | null => {
      assertMainWindowIpcSender(event);
      return readPdfFile(filePath);
    }
  );
  ipcMain.handle(
    "documents:readTextFile",
    (event, filePath: string): TextFileReadResult | null => {
      assertMainWindowIpcSender(event);
      return readTextFile(filePath);
    }
  );
  ipcMain.handle("documents:openPath", async (event, filePath: string) => {
    assertMainWindowIpcSender(event);
    return openExportPath(filePath);
  });
  ipcMain.handle("documents:revealPath", async (event, filePath: string) => {
    assertMainWindowIpcSender(event);
    return revealExportPath(filePath);
  });
  ipcMain.handle("translations:getCached", (_event, input: TranslationCacheLookupInput) =>
    ensureDatabase().getTranslationCache(input)
  );
  ipcMain.handle(
    "translations:saveCached",
    (_event, input: TranslationCacheLookupInput & { translatedText: string }) =>
      runPrivacyManagedDataWrite(() => ensureDatabase().saveTranslationCache(input))
  );
  ipcMain.handle(
    "translations:getOllamaModelStatus",
    (_event, input: OllamaModelInput): Promise<OllamaModelStatusResult> =>
      getOllamaModelStatus(input)
  );
  ipcMain.handle(
    "translations:ensureOllamaRunning",
    (event, baseUrl: unknown): Promise<EnsureOllamaRuntimeResult> => {
      assertMainWindowIpcSender(event);
      if (process.env.LM_QA_DOC_SCREENSHOTS === "1") {
        return Promise.resolve({
          status: "not_installed",
          baseUrl: typeof baseUrl === "string" ? baseUrl : "http://127.0.0.1:11434"
        });
      }
      return ensureOllamaRuntime(typeof baseUrl === "string" ? baseUrl : undefined);
    }
  );
  ipcMain.handle(
    "translations:pullOllamaModel",
    (_event, input: OllamaModelInput): Promise<PullOllamaModelResult> =>
      pullOllamaModel(input)
  );
  ipcMain.handle(
    "translations:testConnection",
    (event, input: TranslationConnectionTestInput): Promise<TranslationConnectionTestResult> => {
      assertMainWindowIpcSender(event);
      const consentSafeInput = withSecureTranslationKeys(input);
      return runPrivacyManagedDataWrite(() =>
        testTranslationConnection(consentSafeInput, {
          onGeminiUsage: createMainGeminiUsageObserver({
            profileId: activeProfileId,
            geminiPlan: browserCardProviderSettings.geminiPlan,
            sourceLang: browserCardProviderSettings.learningProfile.targetLanguage.code,
            targetLang: browserCardProviderSettings.learningProfile.nativeLanguage.code
          })
        })
      );
    }
  );
  ipcMain.handle("translations:cancel", (event, requestId: string): boolean => {
    assertMainWindowIpcSender(event);
    return translationJobRegistry.cancel(event.sender.id, requestId);
  });
  ipcMain.handle(
    "translations:translate",
    async (event, input: TranslateTextInput): Promise<TranslateTextResult> => {
      assertMainWindowIpcSender(event);
      return runTranslationIpcJob(event, input.requestId, async ({ signal }) => {
        input = withSecureTranslationKeys(input);
        throwIfTranslationAborted(signal);
        const cached = ensureDatabase().getTranslationCache(input);
        if (cached) {
          return translationResultFromEntry(cached, "hit");
        }

      if (!input.text.trim()) {
        throw new Error(electronText(currentAppLocale, "translationTextMissing"));
      }

      if (input.providerName === "google") {
        const translatedText = await translateWithGoogle({ ...input, signal });
        throwIfTranslationAborted(signal);
        const saved = ensureDatabase().saveTranslationCache({
          ...input,
          translatedText
        });
        return translationResultFromEntry(saved, "miss", estimateUsageEventForTexts(input, [input.text]));
      }

      if (input.providerName === "gemini") {
        const geminiResult = await translateWithGemini({
          ...input,
          signal,
          requestBudget: undefined,
          onUsage: createMainGeminiUsageObserver(input)
        });
        throwIfTranslationAborted(signal);
        const saved = ensureDatabase().saveTranslationCache({
          ...input,
          translatedText: geminiResult.translatedText
        });
        return translationResultFromEntry(saved, "miss");
      }

      if (input.providerName === "browser") {
        throw new Error("Built-in translator runs in the renderer, not the Electron main process.");
      }

      if (input.providerName === "localMt") {
        const translatedText = await translateWithLocalMt(input);
        throwIfTranslationAborted(signal);
        const saved = ensureDatabase().saveTranslationCache({
          ...input,
          translatedText
        });
        return translationResultFromEntry(
          saved,
          "miss",
          estimateUsageEventForTexts(input, [input.text])
        );
      }

      const translatedText = await translateWithLocalOllama({
        ...input,
        signal,
        requestBudget: undefined
      });
      throwIfTranslationAborted(signal);
      const saved = ensureDatabase().saveTranslationCache({
        ...input,
        translatedText
      });
      return translationResultFromEntry(
        saved,
        "miss",
        estimateUsageEventForTexts(input, [input.text])
      );
      });
    }
  );
  ipcMain.handle(
    "translations:translatePdfSegments",
    async (event, input: TranslatePdfSegmentsInput): Promise<TranslatePdfSegmentsResult> => {
      assertMainWindowIpcSender(event);
      return runTranslationIpcJob(event, input.requestId, async ({ signal }) => {
        input = withSecureTranslationKeys(input);
        throwIfTranslationAborted(signal);
        if (input.providerName === "browser") {
          throw new Error("Built-in translator runs in the renderer, not the Electron main process.");
        }

      const now = new Date().toISOString();
      const cachedTranslations: PdfSegmentTranslation[] = [];
      const missingSegments = [];

      for (const segment of input.segments) {
        throwIfTranslationAborted(signal);
        const cached = input.bypassCache
          ? null
          : ensureDatabase().getTranslationCache(segmentCacheInput(input, segment));
        if (cached) {
          cachedTranslations.push({
            id: segment.id,
            translationKo: cached.translatedText,
            cacheStatus: "hit"
          });
        } else {
          missingSegments.push(segment);
        }
      }

      const translatedMisses: PdfSegmentTranslation[] = [];
      const usageEvents: TranslationUsageEvent[] = [];
      const batchSize = input.providerName === "local" ? 4 : input.providerName === "localMt" ? 16 : 8;
      for (const segmentBatch of chunk(missingSegments, batchSize)) {
        throwIfTranslationAborted(signal);
        let batchTranslations: PdfSegmentTranslation[];
        if (input.providerName === "google") {
          const translatedTexts = await translateTextsWithGoogle(
            { ...input, signal },
            segmentBatch.map((segment) => segment.text)
          );
          batchTranslations = segmentBatch.map((segment, index) => ({
            id: segment.id,
            translationKo: translatedTexts[index],
            cacheStatus: "miss" as const
          }));
          usageEvents.push(
            estimateUsageEventForTexts(
              input,
              segmentBatch.map((segment) => segment.text)
            )
          );
        } else if (input.providerName === "gemini") {
          const geminiBatch = await translatePdfSegmentsWithGemini({
            ...input,
            segments: segmentBatch,
            signal,
            requestBudget: new RemoteRequestBudget(
              GEMINI_PDF_BATCH_MAX_REMOTE_CALLS,
              "Gemini PDF batch"
            ),
            onUsage: createMainGeminiUsageObserver(input)
          });
          batchTranslations = geminiBatch.translations.map((translation) => ({
            ...translation,
            cacheStatus: "miss" as const
          }));
        } else if (input.providerName === "localMt") {
          batchTranslations = (
            await translatePdfSegmentsWithLocalMt({
              ...input,
              segments: segmentBatch
            })
          ).map((translation) => ({
            ...translation,
            cacheStatus: "miss" as const
          }));
          usageEvents.push(
            estimateUsageEventForTexts(
              input,
              segmentBatch.map((segment) => segment.text)
            )
          );
        } else {
          batchTranslations = await translateLocalPdfSegmentBatch(input, segmentBatch, {
            signal,
            requestBudget: new RemoteRequestBudget(
              OLLAMA_PDF_BATCH_MAX_REMOTE_CALLS,
              "Ollama PDF batch"
            )
          });
          usageEvents.push(
            estimateUsageEventForTexts(
              input,
              segmentBatch.map((segment) => segment.text)
            )
          );
        }

        if (batchTranslations.length < segmentBatch.length) {
          appendTranslationDebugLog({
            type: "pdf-segment-missing-after-batch",
            providerName: input.providerName,
            model: input.model,
            promptVersion: input.promptVersion,
            contextHash: input.contextHash,
            requestedIds: segmentBatch.map((segment) => segment.id),
            returnedIds: batchTranslations.map((translation) => translation.id)
          });
        }

        throwIfTranslationAborted(signal);
        batchTranslations.forEach((translation) => {
          const segment = segmentBatch.find((candidate) => candidate.id === translation.id);
          if (!segment) {
            return;
          }

          ensureDatabase().saveTranslationCache({
            ...segmentCacheInput(input, segment),
            translatedText: translation.translationKo
          });
          translatedMisses.push(translation);
        });
      }

      const translationsById = new Map(
        [...cachedTranslations, ...translatedMisses].map((translation) => [
          translation.id,
          translation
        ])
      );
      const translations = input.segments
        .map((segment) => translationsById.get(segment.id))
        .filter((translation): translation is PdfSegmentTranslation => Boolean(translation));
      const missingSegmentIds = input.segments
        .filter((segment) => !translationsById.has(segment.id))
        .map((segment) => segment.id);

      if (missingSegmentIds.length > 0) {
        appendTranslationDebugLog({
          type: "pdf-segment-missing-final",
          providerName: input.providerName,
          model: input.model,
          promptVersion: input.promptVersion,
          contextHash: input.contextHash,
          missingSegmentIds
        });
      }

      return {
        translations,
        providerName: input.providerName,
        sourceLang: input.sourceLang?.trim() || "auto",
        targetLang: input.targetLang.trim() || "ko",
        cacheStatus:
          !input.bypassCache && translatedMisses.length === 0
            ? "hit"
            : cachedTranslations.length > 0
              ? "partial"
              : "miss",
        missingSegmentIds,
        usage: mergeUsageEvents(usageEvents, input),
        createdAt: now,
        updatedAt: now
      };
      });
    }
  );
  ipcMain.handle("tts:synthesize", (_event, input: TtsSynthesisInput) =>
    runAbortablePrivacyManagedDataWrite((signal) => synthesizeTts(input, { signal }))
  );
  ipcMain.handle("tts:listVoices", () => listTtsVoices());
  if (isQaRuntime()) {
    ipcMain.handle("qa:heartbeat", (_event, payload: Record<string, unknown>) => {
      appendBookMakerQaHeartbeat(payload);
      return true;
    });
  }
}

function createBilingualPdfExportWindow() {
  return new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
}

async function translateLocalPdfSegmentBatch(
  input: TranslatePdfSegmentsInput,
  segmentBatch: TranslatePdfSegmentsInput["segments"],
  control: TranslationRequestControl
): Promise<PdfSegmentTranslation[]> {
  throwIfTranslationAborted(control.signal);
  try {
    return (
      await translatePdfSegmentsWithLocalOllama({
        ...input,
        segments: segmentBatch,
        ...control
      })
    ).map((translation) => ({
      ...translation,
      cacheStatus: "miss" as const
    }));
  } catch (caught) {
    if (isAbortError(caught)) {
      throw caught;
    }
    if (isRemoteRequestBudgetExceededError(caught)) {
      return [];
    }
    appendTranslationDebugLog({
      type: "pdf-segment-batch-error",
      providerName: input.providerName,
      model: input.model,
      promptVersion: input.promptVersion,
      contextHash: input.contextHash,
      segmentIds: segmentBatch.map((segment) => segment.id),
      message: caught instanceof Error ? caught.message : String(caught)
    });

    if (segmentBatch.length <= 1) {
      throw caught;
    }

    const translations: PdfSegmentTranslation[] = [];
    for (const segment of segmentBatch) {
      throwIfTranslationAborted(control.signal);
      try {
        const [translation] = await translateLocalPdfSegmentBatch(input, [segment], control);
        if (translation) {
          translations.push(translation);
        }
      } catch (singleCaught) {
        if (isAbortError(singleCaught)) {
          throw singleCaught;
        }
        appendTranslationDebugLog({
          type: "pdf-segment-single-error",
          providerName: input.providerName,
          model: input.model,
          promptVersion: input.promptVersion,
          contextHash: input.contextHash,
          segmentId: segment.id,
          message: singleCaught instanceof Error ? singleCaught.message : String(singleCaught)
        });
      }
    }
    return translations;
  }
}

function normalizeBrowserCaptureSiteSettings(
  settings?: Partial<BrowserCaptureSiteSettings>
): BrowserCaptureSiteSettings {
  return {
    discord: settings?.discord === true,
    chatgpt: settings?.chatgpt === true,
    claude: settings?.claude === true,
    youtube: settings?.youtube === true,
    reddit: settings?.reddit === true,
    genericWeb: settings?.genericWeb === true
  };
}

async function clearWebReaderLoginData() {
  await flushWebReaderSessionStorage("privacy-delete");
  const webReaderSession = getWebReaderSession();
  const cookieCount = (await webReaderSession.cookies.get({})).length;
  await webReaderSession.clearStorageData({
    storages: ["cookies", "localstorage", "indexdb", "serviceworkers", "cachestorage"]
  });
  await webReaderSession.cookies.flushStore();
  const remainingCookies = (await webReaderSession.cookies.get({})).length;
  if (remainingCookies === 0) {
    // A second successful storage sweep verifies that no site-storage category was recreated
    // between the destructive clear and the cookie check.
    await webReaderSession.clearStorageData({
      storages: ["cookies", "localstorage", "indexdb", "serviceworkers", "cachestorage"]
    });
    await webReaderSession.cookies.flushStore();
  }
  const verifiedRemainingCookies = (await webReaderSession.cookies.get({})).length;
  return {
    removedItems: Math.max(0, cookieCount - verifiedRemainingCookies),
    remainingItems: verifiedRemainingCookies,
    verified: verifiedRemainingCookies === 0
  };
}

async function clearElectronCaches() {
  const playZoneRuntimeSession = session.fromPartition(PLAY_ZONE_RUNTIME_PARTITION);
  const cacheSessions = Array.from(
    new Set([session.defaultSession, getWebReaderSession(), playZoneRuntimeSession])
  );
  for (const electronSession of cacheSessions) {
    await Promise.all([
      electronSession.clearCache(),
      electronSession.clearStorageData({
        storages: ["cachestorage", "shadercache", "serviceworkers"]
      }),
      electronSession.clearHostResolverCache(),
      electronSession.clearSharedDictionaryCache()
    ]);
  }
  let remainingBytes = 0;
  for (const electronSession of cacheSessions) {
    remainingBytes += await electronSession.getCacheSize();
  }
  if (remainingBytes > 0) {
    for (const electronSession of cacheSessions) {
      await electronSession.clearCache();
    }
    remainingBytes = 0;
    for (const electronSession of cacheSessions) {
      remainingBytes += await electronSession.getCacheSize();
    }
  }
  return {
    removedItems: cacheSessions.length,
    remainingItems: remainingBytes,
    verified: remainingBytes === 0
  };
}

async function clearPlayZoneRuntimeStorageForPrivacyDeletion() {
  const runtimeSession = session.fromPartition(PLAY_ZONE_RUNTIME_PARTITION);
  const cookieCount = (await runtimeSession.cookies.get({})).length;
  const storages = [
    "cookies",
    "localstorage",
    "indexdb",
    "cachestorage",
    "serviceworkers",
    "shadercache"
  ] as const;
  await Promise.all([
    runtimeSession.clearCache(),
    runtimeSession.clearStorageData({ storages: [...storages] }),
    runtimeSession.clearHostResolverCache(),
    runtimeSession.clearSharedDictionaryCache()
  ]);
  await runtimeSession.cookies.flushStore();
  // Repeat the complete sweep after writers and windows are gone. This catches
  // storage recreated between the first clear and Chromium's asynchronous flush.
  await runtimeSession.clearStorageData({ storages: [...storages] });
  await runtimeSession.clearCache();
  await runtimeSession.cookies.flushStore();
  const remainingCookies = (await runtimeSession.cookies.get({})).length;
  const remainingBytes = await runtimeSession.getCacheSize();
  return {
    removedItems: Math.max(0, cookieCount - remainingCookies),
    remainingItems: remainingCookies + remainingBytes,
    verified: remainingCookies === 0 && remainingBytes === 0
  };
}

function closePlayZoneRuntimeWindowsForPrivacyDeletion() {
  const runtimeSession = session.fromPartition(PLAY_ZONE_RUNTIME_PARTITION);
  for (const window of BrowserWindow.getAllWindows()) {
    if (
      window === mainWindow ||
      window.isDestroyed() ||
      window.webContents.session !== runtimeSession
    ) {
      continue;
    }
    window.destroy();
  }
  clearPlayZoneEntryProtocolMounts();
}

async function cancelOfficialPlayZoneDownloadsForPrivacyDeletion() {
  const activeDownloads = [...officialPlayZoneDownloadControllers.values()];
  for (const active of activeDownloads) {
    active.controller.abort(
      new Error("Official PlayZone download canceled for local-data deletion.")
    );
  }
  await Promise.all(activeDownloads.map((active) => active.settled));
}

async function quiescePrivacyManagedDataWritersForDeletion(
  deletionBlock: PlayZoneManagedFileWriterBlock
) {
  closeDesktopOcrWindowsForPrivacyDeletion();
  deletionBlock.cancelActive(
    new Error("Managed-data operation canceled for local-data deletion.")
  );
  await Promise.all([
    cancelOfficialPlayZoneDownloadsForPrivacyDeletion(),
    deletionBlock.drain({ timeoutMs: 30_000 })
  ]);
  closeDesktopOcrWindowsForPrivacyDeletion();
}

async function quiesceAndClearPlayZoneRuntimeForPrivacyDeletion(
  deletionBlock: PlayZoneManagedFileWriterBlock
) {
  await quiescePrivacyManagedDataWritersForDeletion(deletionBlock);
  // A non-abortable operation may have created its runtime window while the
  // first close was in progress. Close again only after every writer drained.
  closePlayZoneRuntimeWindowsForPrivacyDeletion();
  const cleared = await clearPlayZoneRuntimeStorageForPrivacyDeletion();
  if (!cleared.verified) {
    throw new Error("PlayZone runtime storage could not be fully cleared.");
  }
}

function capturePrivacyManagedDataWriteIntent() {
  if (isPrivacyDeletionBlockingManagedDataWrites()) {
    throw new Error("Local data changes are unavailable during local-data deletion.");
  }
  return privacyManagedDataWriters.captureWriteIntent();
}

function runPrivacyManagedDataWrite<T>(
  operation: () => T | Promise<T>,
  intent?: PlayZoneManagedFileWriteIntent,
  options?: PrivacyManagedDataWriterOptions
) {
  if (isPrivacyDeletionBlockingManagedDataWrites()) {
    return Promise.reject(
      new Error("Local data changes are unavailable during local-data deletion.")
    );
  }
  return privacyManagedDataWriters.run(operation, intent, options);
}

function runAbortablePrivacyManagedDataWrite<T>(
  operation: (signal: AbortSignal) => T | Promise<T>,
  intent?: PlayZoneManagedFileWriteIntent
) {
  if (isPrivacyDeletionBlockingManagedDataWrites()) {
    return Promise.reject(
      new Error("Local data changes are unavailable during local-data deletion.")
    );
  }
  return privacyManagedDataWriters.runAbortable(operation, intent);
}

function throwIfPrivacyManagedDataWriteAborted(signal: AbortSignal) {
  if (!signal.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  const error = new Error("Managed-data operation was canceled.");
  error.name = "AbortError";
  throw error;
}

function capturePlayZoneManagedFileWriteIntent() {
  return capturePrivacyManagedDataWriteIntent();
}

function runPlayZoneManagedFileWrite<T>(
  operation: () => T | Promise<T>,
  intent?: PlayZoneManagedFileWriteIntent
) {
  return runPrivacyManagedDataWrite(operation, intent);
}

function isPrivacyDeletionBlockingPlayZoneWrites() {
  return isPrivacyDeletionBlockingManagedDataWrites();
}

function isPrivacyDeletionBlockingManagedDataWrites() {
  if (privacyManagedFileDeletionInProgress) return true;
  const pending = privacyDeletionCoordinator.peekPendingStatus();
  return Boolean(
    pending &&
    (pending.target === "learning_data" || pending.target === "all_local_data")
  );
}

function assertPrivacyDeletionAllowsSecureSettingsWrites() {
  const pending = privacyDeletionCoordinator.peekPendingStatus();
  if (
    privacySecureSettingsDeletionInProgress ||
    (pending &&
      (pending.target === "api_keys" || pending.target === "all_local_data"))
  ) {
    throw new Error("API-key changes are unavailable during privacy deletion.");
  }
}

function assertPrivacyDeletionAllowsBridgeCredentialsMutation() {
  if (
    privacyManagedFileDeletionInProgress ||
    privacySecureSettingsDeletionInProgress ||
    privacyWebReaderDeletionInProgress ||
    privacyDeletionCoordinator.peekPendingStatus()
  ) {
    throw new Error(
      "Life Miner bridge credentials cannot change until privacy deletion is finished."
    );
  }
}

function assertLifeMinerBridgeForgetConfirmation(input: unknown) {
  const confirmation =
    input && typeof input === "object" && !Array.isArray(input) &&
    typeof (input as { confirmation?: unknown }).confirmation === "string"
      ? (input as { confirmation: string }).confirmation.trim()
      : "";
  if (!LIFE_MINER_BRIDGE_FORGET_CONFIRMATIONS.has(confirmation)) {
    throw new Error("The extension-uninstall confirmation phrase does not match.");
  }
}

function assertPrivacyDeletionAllowsWebReaderSession() {
  const pending = privacyDeletionCoordinator.peekPendingStatus();
  if (
    privacyWebReaderDeletionInProgress ||
    (pending &&
      (pending.target === "web_reader_login" || pending.target === "all_local_data"))
  ) {
    throw new Error("Web Reader navigation is unavailable during privacy deletion.");
  }
}

function prepareRuntimeForPrivacyDeletion(
  request: PrivacyDataDeleteRequest,
  senderId: number
) {
  if (request.target === "api_keys" || request.target === "all_local_data") {
    browserCardProviderSettings = {
      ...browserCardProviderSettings,
      providerName: "mock",
      geminiApiKey: "",
      geminiPlan: "free"
    };
    translationJobRegistry.cancelAll(senderId);
  }
  if (request.target !== "learning_data" && request.target !== "all_local_data") return;

  if (request.target !== "all_local_data") {
    translationJobRegistry.cancelAll(senderId);
  }
  stopWebReaderLifeMiningPolling();
  closeDesktopOcrWindowsForPrivacyDeletion();
  if (webReaderYouTubeCandidateCaptureTimer) {
    clearTimeout(webReaderYouTubeCandidateCaptureTimer);
    webReaderYouTubeCandidateCaptureTimer = null;
  }
  appBackupPreviewStore.clear();
  appBackupRollbackStore.clear();
  recentLifeMinerCaptures.clear();
  recentLifeMinerBridgeRequests.clear();
  recentBrowserSentenceCardCaptures.clear();
  recentListeningVideoCaptures.clear();
  cardSyncRuntimeSettings = { cardSyncFolderPath: "", cardSyncOnQuit: false };
  bridgeUsageBudgetState = {
    todayTokens: 0,
    monthCostKrw: 0,
    stopOnFreeTierLimit: true,
    stopOnMonthlyLimit: true,
    pendingTokens: 0,
    pendingCostKrw: 0,
    unsyncedTokens: 0,
    unsyncedCostKrw: 0
  };
  if (request.target !== "all_local_data") return;

  activeProfileId = DEFAULT_PROFILE_ID;
  currentAppLocale = normalizeElectronAppLocale(app.getLocale());
  refreshAppTrayMenu();
  browserSelectionCardMode = "preview";
  browserCaptureSiteSettings = {
    discord: false,
    chatgpt: false,
    claude: false,
    youtube: false,
    reddit: false,
    genericWeb: false
  };
  lifeMiningCaptureSettings = defaultLifeMiningCaptureSettings;
  browserCaptureShortcut = "Ctrl+Q";
  browserCardProviderSettings = {
    providerName: "mock",
    ollamaBaseUrl: "http://127.0.0.1:11434",
    ollamaModel: "gemma4:12b",
    geminiApiKey: "",
    geminiModel: "gemini-2.5-flash-lite",
    geminiPlan: "free",
    learningProfile: defaultLearningProfile,
    dailyAppTokenLimit: DEFAULT_DAILY_APP_TOKEN_LIMIT,
    monthlySpendLimitKrw: DEFAULT_MONTHLY_SPEND_LIMIT_KRW
  };
  webReaderLifeMiningState = {
    enabled: false,
    mode: "off",
    message: electronText(currentAppLocale, "webReaderUnavailable")
  };
}

function finalizePrivacyDeletionIfVerified(result: PrivacyDataDeleteResult) {
  persistExtensionBarrierRelease(result);
  if (
    (result.target === "learning_data" || result.target === "all_local_data") &&
    result.ok &&
    result.operationId &&
    !finalizedPrivacyDeletionIds.has(result.operationId)
  ) {
    finalizedPrivacyDeletionIds.add(result.operationId);
    if (result.target === "all_local_data") {
      lifeMinerBridgePairing.revoke();
    } else {
      lifeMinerBridgePairing.rotateToken();
    }
    while (finalizedPrivacyDeletionIds.size > 128) {
      const oldest = finalizedPrivacyDeletionIds.values().next().value;
      if (typeof oldest !== "string") break;
      finalizedPrivacyDeletionIds.delete(oldest);
    }
  }
  return result;
}

function persistExtensionBarrierRelease(result: PrivacyDataDeleteResult, force = false) {
  const extensionStatus = result.extensionQueueStatus;
  const requestId =
    extensionStatus && extensionStatus.status !== "unknown"
      ? extensionStatus.requestId
      : "";
  if (!requestId) return;
  const destructiveOperationFailed = Object.entries(result.operations).some(
    ([name, status]) =>
      name !== "rendererStorage" &&
      name !== "extensionQueue" &&
      (status === "failed" || status === "partial")
  );
  const extensionReachedTerminalFailure =
    result.operations.extensionQueue === "failed" ||
    result.operations.extensionQueue === "partial";
  if (force || result.ok || destructiveOperationFailed || extensionReachedTerminalFailure) {
    lifeMinerBridgeControlStore.setBarrierReleaseRequestId(requestId);
  }
}

function preparePrivacyResultForOptionalExtension(result: PrivacyDataDeleteResult) {
  if (
    (result.target !== "learning_data" && result.target !== "all_local_data") ||
    lifeMinerBridgePairing.hasPairedHistory()
  ) {
    return result;
  }
  return {
    ...result,
    operations: {
      ...result.operations,
      extensionQueue: "not_requested" as const
    },
    warnings: result.warnings.filter(
      (warning) => warning.code !== "extension_queue_verification_pending"
    ),
    extensionQueueManualClearRequired: false
  };
}

function ensureDatabase() {
  if (!database) {
    throw new Error("Database is not ready.");
  }
  return database;
}

function ensureSecureSettingsVault() {
  if (!secureSettingsVault) throw new Error("Secure settings are not ready.");
  return secureSettingsVault;
}

function createPrivacySecureSettingsScope() {
  const vaults: SecureSettingsVault[] = [ensureSecureSettingsVault()];
  const legacyUserDataPath = findPackagedLegacyDevelopmentUserDataPath();
  if (legacyUserDataPath) {
    vaults.push(new SecureSettingsVault(legacyUserDataPath));
  }
  return new SecureSettingsPrivacyScope(vaults);
}

function findPackagedLegacyDevelopmentUserDataPath() {
  if (!app.isPackaged || process.env.LM_QA_USER_DATA_DIR) return null;
  return findRecognizedLegacyDevelopmentUserDataPath({
    appDataPath: app.getPath("appData"),
    currentUserDataPath: app.getPath("userData")
  });
}

function ensureAppOnboardingState() {
  if (!appOnboardingState) throw new Error("App onboarding state is not ready.");
  return appOnboardingState;
}

function normalizePrivacyDataDeleteRequest(input: unknown): PrivacyDataDeleteRequest {
  if (!input || typeof input !== "object") {
    throw new Error("Privacy deletion request is invalid.");
  }
  const candidate = input as { target?: unknown; confirmation?: unknown };
  if (!isPrivacyDataDeleteTarget(candidate.target)) {
    throw new Error("Privacy deletion target is invalid.");
  }
  return {
    target: candidate.target,
    confirmation: typeof candidate.confirmation === "string" ? candidate.confirmation : undefined
  };
}

function normalizeAppBackupRendererInput(input: unknown) {
  if (!input || typeof input !== "object") {
    throw new Error(electronText(currentAppLocale, "backupRequestInvalid"));
  }
  const candidate = input as {
    renderer?: unknown;
    profileIds?: unknown;
  };
  return {
    renderer: normalizeAppBackupRendererSnapshot(candidate.renderer),
    profileIds: Array.isArray(candidate.profileIds)
      ? candidate.profileIds.filter((value): value is string => typeof value === "string")
      : []
  };
}

function normalizeAppBackupRestoreInput(input: unknown): {
  handleId: string;
  mode: AppBackupRestoreMode;
  currentRenderer: AppBackupRendererSnapshot;
  currentProfileIds: string[];
} {
  if (!input || typeof input !== "object") {
    throw new Error(electronText(currentAppLocale, "restoreRequestInvalid"));
  }
  const candidate = input as {
    handleId?: unknown;
    mode?: unknown;
    currentRenderer?: unknown;
    currentProfileIds?: unknown;
  };
  const handleId = typeof candidate.handleId === "string" ? candidate.handleId.trim() : "";
  if (!handleId) throw new Error(electronText(currentAppLocale, "restorePreviewMissing"));
  if (
    candidate.mode !== "merge" &&
    candidate.mode !== "replace" &&
    candidate.mode !== "new_profile"
  ) {
    throw new Error(electronText(currentAppLocale, "restoreModeUnsupported"));
  }
  return {
    handleId,
    mode: candidate.mode,
    currentRenderer: normalizeAppBackupRendererSnapshot(candidate.currentRenderer),
    currentProfileIds: Array.isArray(candidate.currentProfileIds)
      ? candidate.currentProfileIds.filter(
          (value): value is string => typeof value === "string"
        )
      : []
  };
}

function normalizeAppBackupRendererSnapshot(value: unknown): AppBackupRendererSnapshot {
  if (!value || typeof value !== "object") {
    throw new Error(electronText(currentAppLocale, "rendererBackupMissing"));
  }
  const candidate = value as { entries?: unknown; excludedKeys?: unknown };
  if (!candidate.entries || typeof candidate.entries !== "object" || Array.isArray(candidate.entries)) {
    throw new Error(electronText(currentAppLocale, "rendererBackupInvalid"));
  }
  const entries = Object.fromEntries(
    Object.entries(candidate.entries).filter(
      (entry): entry is [string, string] =>
        entry[0].startsWith("lem:") && typeof entry[1] === "string"
    )
  );
  const excludedKeys = Array.isArray(candidate.excludedKeys)
    ? candidate.excludedKeys.filter((value): value is string => typeof value === "string")
    : [];
  return { entries, excludedKeys };
}

function getAppBackupErrorMessage(_error: unknown) {
  return electronText(currentAppLocale, "unknownError");
}

function withSecureTranslationKeys<T extends { googleApiKey?: string; geminiApiKey?: string }>(
  input: T
): T {
  assertPrivacyDeletionAllowsSecureSettingsWrites();
  const vault = ensureSecureSettingsVault();
  return {
    ...input,
    googleApiKey: vault.get("googleTranslateApiKey"),
    geminiApiKey: vault.get("geminiApiKey")
  };
}

async function runTranslationIpcJob<T>(
  event: IpcMainInvokeEvent,
  requestId: string | undefined,
  run: (control: TranslationRequestControl) => Promise<T>
): Promise<T> {
  let abortActiveJob: (() => void) | undefined;
  return runPrivacyManagedDataWrite(
    async () => {
      const job = translationJobRegistry.start(event.sender.id, requestId);
      abortActiveJob = () => job.abort();
      const abortWhenRendererCloses = () => job.abort();
      event.sender.once("destroyed", abortWhenRendererCloses);
      try {
        return await run({ signal: job.signal });
      } finally {
        event.sender.removeListener("destroyed", abortWhenRendererCloses);
        job.finish();
        abortActiveJob = undefined;
      }
    },
    undefined,
    { cancel: () => abortActiveJob?.() }
  );
}

function startLifeMinerBridge() {
  if (lifeMinerBridgeServer) {
    return;
  }

  const server = createServer((request, response) => {
    void handleLifeMinerBridgeRequest(request, response).catch((caught) => {
      const statusCode =
        caught instanceof LifeMinerBridgeRequestError ? caught.statusCode : 500;
      const errorPayload: Record<string, unknown> = {
        ok: false,
        error:
          caught instanceof LifeMinerBridgeRequestError
            ? caught.message
            : "Life Miner bridge failed."
      };
      if (statusCode === 401) {
        errorPayload.bridgeTokenRequired = true;
      }
      writeLifeMinerJson(response, statusCode, errorPayload);
    });
  });

  server.on("error", (error) => {
    const bridgeError = error as NodeJS.ErrnoException;
    if (bridgeError.code === "EADDRINUSE") {
      console.info(
        `Life Miner bridge already running on 127.0.0.1:${LIFE_MINER_BRIDGE_PORT}.`
      );
    } else {
      console.warn(
        "Life Miner bridge could not start.",
        serializeSafeDebugLogEntry({ error })
      );
    }
    if (lifeMinerBridgeServer === server) {
      lifeMinerBridgeServer = null;
    }
    try {
      server.close();
    } catch {
      // The server may already be closed after a failed listen attempt.
    }
  });
  server.listen(LIFE_MINER_BRIDGE_PORT, "127.0.0.1", () => {
    lifeMinerBridgeServer = server;
    console.info(`Life Miner bridge listening on 127.0.0.1:${LIFE_MINER_BRIDGE_PORT}`);
  });
}

function stopLifeMinerBridge() {
  lifeMinerBridgeServer?.close();
  lifeMinerBridgeServer = null;
}

async function handleLifeMinerBridgeRequest(
  request: IncomingMessage,
  response: ServerResponse
) {
  const origin = request.headers.origin;
  if (request.method === "OPTIONS") {
    if (!isAllowedLifeMinerOrigin(origin)) {
      writeLifeMinerJson(response, 403, { ok: false, error: "Origin is not allowed." });
      return;
    }
    setLifeMinerCorsHeaders(response, origin);
    response.writeHead(204);
    response.end();
    return;
  }

  const requestUrl = new URL(
    request.url ?? "/",
    getLifeMinerBridgeBaseUrl(request.headers.host)
  );

  if (request.method === "GET" && requestUrl.pathname === "/health") {
    writeLifeMinerJson(response, 200, {
      ok: true,
      service: "local-english-miner-life-miner",
      version: app.getVersion()
    });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/listening-youtube-player") {
    writeListeningYouTubePlayerPage(response, requestUrl, currentAppLocale);
    return;
  }

  if (!isAllowedLifeMinerOrigin(origin)) {
    writeLifeMinerJson(response, 403, { ok: false, error: "Origin is not allowed." });
    return;
  }

  if (request.headers["x-local-english-miner"] !== LIFE_MINER_EXTENSION_HEADER) {
    writeLifeMinerJson(response, 403, { ok: false, error: "Extension header is required." });
    return;
  }

  enforceLifeMinerRateLimit(
    recentLifeMinerBridgeRequests,
    `${origin ?? "no-origin"}:${request.socket.remoteAddress ?? "local"}`
  );

  if (request.method === "POST" && requestUrl.pathname === "/pair") {
    const pairing = lifeMinerBridgePairing.pair(origin);
    writeLifeMinerJson(response, 200, {
      ok: true,
      bridgeToken: pairing.token,
      bridgeTokenRequired: true,
      pairedExtensionOrigin: pairing.origin
    });
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/settings") {
    lifeMinerBridgePairing.validateToken(request, origin);
    const extensionQueueClearCommand = extensionQueueClearCoordinator.getPendingCommand();
    writeLifeMinerJson(response, 200, {
      ok: true,
      browserCaptureSiteSettings,
      lifeMiningCaptureSettings,
      browserSelectionCardMode,
      browserCardProvider: getBrowserCardProviderDebugStatus(browserCardProviderSettings),
      bridgeTokenRequired: true,
      pairedExtensionOrigin: lifeMinerBridgePairing.getStatus().origin,
      extensionQueueClearRequestId: extensionQueueClearCommand?.requestId,
      extensionQueueBarrierReleaseRequestId:
        lifeMinerBridgeControlStore.getBarrierReleaseRequestId() ?? undefined
    });
    return;
  }

  if (request.method !== "POST") {
    writeLifeMinerJson(response, 404, { ok: false, error: "Not found." });
    return;
  }

  lifeMinerBridgePairing.validateToken(request, origin);

  if (requestUrl.pathname === "/privacy/queue-barrier-release-ack") {
    const payload = await readLifeMinerJsonBody<{ requestId?: unknown }>(request);
    const requestId = typeof payload.requestId === "string" ? payload.requestId : "";
    const accepted = lifeMinerBridgeControlStore.acknowledgeBarrierRelease(requestId);
    writeLifeMinerJson(response, accepted ? 200 : 409, {
      ok: accepted,
      accepted
    });
    return;
  }

  if (requestUrl.pathname === "/privacy/queue-clear-ack") {
    const payload = await readLifeMinerJsonBody<{
      requestId?: unknown;
      removedItems?: unknown;
      remainingItems?: unknown;
    }>(request);
    const accepted = extensionQueueClearCoordinator.acknowledge(payload);
    if (accepted) {
      privacyDeletionCoordinator.noteExtensionStatusChanged();
      const pending = privacyDeletionCoordinator.peekPendingStatus();
      if (pending) finalizePrivacyDeletionIfVerified(pending);
    }
    writeLifeMinerJson(response, accepted ? 200 : 409, {
      ok: accepted,
      accepted
    });
    return;
  }

  if (
    !lifeMiningCaptureSettings.enabled &&
    (requestUrl.pathname === "/life-logs" || requestUrl.pathname === "/youtube-watch")
  ) {
    writeLifeMinerJson(response, 403, { ok: false, error: "Life Mining capture is disabled." });
    return;
  }

  if (requestUrl.pathname === "/life-logs") {
    await runPrivacyManagedDataWrite(() => handleLifeLogBridgePost(request, response));
    return;
  }

  if (requestUrl.pathname === "/sentence-cards") {
    await runPrivacyManagedDataWrite(() => handleSentenceCardBridgePost(request, response));
    return;
  }

  if (requestUrl.pathname === "/translate") {
    await runPrivacyManagedDataWrite(() => handleTranslateBridgePost(request, response));
    return;
  }

  if (requestUrl.pathname === "/youtube-watch") {
    await runPrivacyManagedDataWrite(() => handleListeningVideoBridgePost(request, response));
    return;
  }

  writeLifeMinerJson(response, 404, { ok: false, error: "Not found." });
}

async function handleLifeLogBridgePost(
  request: IncomingMessage,
  response: ServerResponse
) {
  const payload = await readLifeMinerJsonBody<LifeMinerCaptureInput>(request);
  if (!isBrowserCaptureSiteAllowed(payload, browserCaptureSiteSettings)) {
    writeLifeMinerJson(response, 403, {
      ok: false,
      error: "Capture is disabled for this site in Language Miner settings."
    });
    return;
  }
  const policyResult = applyLifeMiningCapturePolicy(payload, lifeMiningCaptureSettings);
  if (!policyResult.accepted) {
    writeLifeMinerJson(response, 202, {
      ok: true,
      skipped: true,
      reason: policyResult.reason
    });
    return;
  }
  const prepared = prepareLifeLogCapture(policyResult.input, {
    filterLowSignalTargets: lifeMiningCaptureSettings.filterLowSignalTargets
  });
  if (!prepared.accepted) {
    writeLifeMinerJson(response, 202, {
      ok: true,
      skipped: true,
      reason: prepared.reason
    });
    return;
  }

  if (
    lifeMiningCaptureSettings.dedupeEnabled &&
    isDuplicateLifeMinerCapture(recentLifeMinerCaptures, prepared.lifeLogInput)
  ) {
    writeLifeMinerJson(response, 200, {
      ok: true,
      duplicate: true
    });
    return;
  }

  const shouldDebugRawContent = isLifeMinerDebugEnabled(prepared.lifeLogInput);
  const beforeRawContentLengths = shouldDebugRawContent
    ? getLifeLogRawContentLengths(prepared.lifeLogInput)
    : [];
  if (shouldDebugRawContent) {
    console.info("[LifeMiner] raw_content lengths before save:", beforeRawContentLengths);
  }

  const saved = ensureDatabase().saveLifeLog(prepared.lifeLogInput);
  if (shouldDebugRawContent) {
    const afterRawContentLengths = getLifeLogRawContentLengths(saved);
    console.info("[LifeMiner] raw_content lengths after save:", afterRawContentLengths);
    if (JSON.stringify(beforeRawContentLengths) !== JSON.stringify(afterRawContentLengths)) {
      console.warn("[LifeMiner] raw_content length mismatch after save:", {
        before: beforeRawContentLengths,
        after: afterRawContentLengths
      });
    }
  }
  notifyLifeLogsChanged(saved);
  writeLifeMinerJson(response, 200, {
    ok: true,
    saved: true
  });
}

async function handleSentenceCardBridgePost(
  request: IncomingMessage,
  response: ServerResponse
) {
  const payload = await readLifeMinerJsonBody<BrowserSentenceCardCaptureInput>(request);
  const selectedText = normalizeBridgeText(payload.selectedText).slice(0, 240);
  const sourceSentence = normalizeBridgeText(payload.sourceSentence || payload.selectedText).slice(
    0,
    1200
  );
  if (!selectedText || !sourceSentence) {
    writeLifeMinerJson(response, 202, {
      ok: true,
      skipped: true,
      reason: "empty_selection"
    });
    return;
  }

  const shouldSave =
    payload.action === "save" ||
    (payload.action !== "preview" && browserSelectionCardMode === "autoSave");

  if (
    shouldSave &&
    isDuplicateBrowserSentenceCardCapture(
      recentBrowserSentenceCardCaptures,
      payload,
      selectedText,
      sourceSentence,
      LIFE_MINER_BRIDGE_DEDUPE_MS
    )
  ) {
    writeLifeMinerJson(response, 200, {
      ok: true,
      duplicate: true
    });
    return;
  }

  const cardResult = await createBrowserSentenceCard({
    ...payload,
    selectedText,
    sourceSentence
  });
  notifyUsageRecorded(cardResult.usage);
  const card = applyMainInputLanguagePolicy(cardResult.card, {
    text: sourceSentence,
    contextText: [payload.beforeContext, payload.afterContext, payload.pageTextContext]
      .filter(Boolean)
      .join("\n"),
    override: payload.languagePolicyOverride,
    allowMismatch: !shouldSave
  });

  if (!shouldSave) {
    writeLifeMinerJson(response, 200, {
      ok: true,
      preview: true,
      card,
      providerStatus: cardResult.providerStatus
    });
    return;
  }

  const db = ensureDatabase();
  const wasExisting = db.hasCard(card.id);
  const saved = db.saveCard(card, activeProfileId);
  if (!wasExisting) {
    recordCardCreationMissionEvent(db, saved, activeProfileId, "browser_extension");
  }
  notifyCardsChanged(saved);
  writeLifeMinerJson(response, 200, {
    ok: true,
    card: saved,
    providerStatus: cardResult.providerStatus
  });
}

async function handleTranslateBridgePost(
  request: IncomingMessage,
  response: ServerResponse
) {
  const payload = await readLifeMinerJsonBody<BrowserBridgeTranslateInput>(request);
  const text = normalizeBridgeText(payload.text).slice(0, 900);
  if (!text) {
    writeLifeMinerJson(response, 202, {
      ok: true,
      skipped: true,
      reason: "empty_text"
    });
    return;
  }

  const translatedText = await translateBridgeText({
    text,
    sourceLang: payload.sourceLang || browserCardProviderSettings.learningProfile.targetLanguage.code,
    targetLang: payload.targetLang || browserCardProviderSettings.learningProfile.nativeLanguage.code
  });
  writeLifeMinerJson(response, 200, {
    ok: true,
    translatedText
  });
}

async function handleListeningVideoBridgePost(
  request: IncomingMessage,
  response: ServerResponse
) {
  const payload = await readLifeMinerJsonBody<ListeningVideoCandidateInput>(request);
  const candidate = prepareListeningVideoCandidate(payload, "youtube_extension");
  if (!candidate) {
    writeLifeMinerJson(response, 202, {
      ok: true,
      skipped: true,
      reason: "invalid_video_candidate"
    });
    return;
  }

  if (
    isDuplicateListeningVideoCapture(
      recentListeningVideoCaptures,
      candidate,
      LIFE_MINER_BRIDGE_DEDUPE_MS
    )
  ) {
    writeLifeMinerJson(response, 200, {
      ok: true,
      duplicate: true
    });
    return;
  }

  const saved = ensureDatabase().saveListeningVideoCandidate(candidate);
  writeLifeMinerJson(response, 200, {
    ok: true,
    videoCandidate: saved
  });
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const chunks: T[][] = [];
  const size = Math.max(1, chunkSize);
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function createBrowserSentenceCard(
  input: Required<Pick<BrowserSentenceCardCaptureInput, "selectedText" | "sourceSentence">> &
    BrowserSentenceCardCaptureInput
): Promise<BrowserSentenceCardCreationResult> {
  const now = new Date().toISOString();
  const generatedResult = await createProviderBrowserSentenceCard(input, now).catch(() => {
    console.warn("[sentence-card] provider generation failed; using a basic local card");
    return null;
  });
  if (generatedResult) {
    return {
      ...generatedResult,
      card: prepareBrowserSentenceCard(generatedResult.card, input)
    };
  }

  let translatedSentence = "";
  try {
    translatedSentence = await translateBridgeText({
      text: input.sourceSentence,
      sourceLang: browserCardProviderSettings.learningProfile.targetLanguage.code,
      targetLang: browserCardProviderSettings.learningProfile.nativeLanguage.code
    });
  } catch {
    translatedSentence = "";
  }

  const fallbackCard = createFallbackBrowserSentenceCard({
    selectedText: input.selectedText,
    sourceSentence: input.sourceSentence,
    translatedSentence,
    profileId: activeProfileId,
    now
  });
  return {
    card: prepareBrowserSentenceCard(fallbackCard, input),
    providerStatus: {
      providerName: "fallback"
    }
  };
}

async function createProviderBrowserSentenceCard(
  input: Required<Pick<BrowserSentenceCardCaptureInput, "selectedText" | "sourceSentence">> &
    BrowserSentenceCardCaptureInput,
  now: string
): Promise<BrowserSentenceCardCreationResult | null> {
  const settings = getEffectiveBrowserCardProviderSettings(browserCardProviderSettings);
  if (!settings) {
    return null;
  }

  const usageEvent = createBrowserSentenceCardUsageEvent(input, settings, activeProfileId);
  const budget = reserveBridgeUsageBudget(usageEvent);

  try {
    const provider =
      settings.providerName === "gemini"
        ? new GeminiProvider({
            apiKey: settings.geminiApiKey,
            model: settings.geminiModel,
            plan: settings.geminiPlan,
            cloudConsent: settings.cloudConsent
          })
        : new OllamaProvider({
            baseUrl: settings.ollamaBaseUrl,
            model: settings.ollamaModel
          });

    if (provider instanceof GeminiProvider) {
      provider.setUsageObserver((observation) => {
        notifyUsageRecorded(
          createTranslationUsageEvent({
            profileId: activeProfileId,
            providerName: "gemini",
            model: observation.model,
            plan: settings.geminiPlan,
            sourceLang: observation.sourceLang,
            targetLang: observation.targetLang,
            usage: observation.usage
          })
        );
      });
    }

  const beforeContext = normalizeBridgeText(input.beforeContext);
  const afterContext = normalizeBridgeText(input.afterContext);
    const generated = await provider.generateReadingCard({
    selectedText: input.selectedText,
    sourceSentence: input.sourceSentence,
    beforeSentence: beforeContext || undefined,
    afterSentence: afterContext || undefined,
    readerTextContext: [beforeContext, input.sourceSentence, afterContext].filter(Boolean).join("\n"),
    translationContext: normalizeBridgeText(input.appName || input.metadata?.title),
    learningProfile: settings.learningProfile,
    learnerLevel: "intermediate"
  });

    const card = createStudyCardFromGenerated(generated);
    budget.commit();
    return {
      card: {
        ...card,
        profileId: activeProfileId,
        createdAt: card.createdAt ?? now,
        updatedAt: now
      },
      providerStatus: {
        providerName: settings.providerName,
        model: settings.providerName === "gemini" ? settings.geminiModel : settings.ollamaModel,
        usageEstimate: estimateBrowserSentenceCardUsage(input, settings)
      },
      usage: settings.providerName === "gemini" ? undefined : usageEvent
    };
  } finally {
    budget.release();
  }
}

function reserveBridgeUsageBudget(event: TranslationUsageEvent) {
  const estimatedTokens = Math.max(0, event.usage.totalTokens);
  const estimatedCostKrw = Math.max(0, event.estimatedCostKrw.max);
  const assessment = assessTranslationUsageBudget({
    request: { estimatedTokens, estimatedCostKrw },
    current: {
      todayTokens:
        bridgeUsageBudgetState.todayTokens +
        bridgeUsageBudgetState.unsyncedTokens +
        bridgeUsageBudgetState.pendingTokens,
      monthCostKrw:
        bridgeUsageBudgetState.monthCostKrw +
        bridgeUsageBudgetState.unsyncedCostKrw +
        bridgeUsageBudgetState.pendingCostKrw
    },
    settings: {
      dailyAppTokenLimit: browserCardProviderSettings.dailyAppTokenLimit,
      monthlySpendLimitKrw: browserCardProviderSettings.monthlySpendLimitKrw,
      stopOnFreeTierLimit: bridgeUsageBudgetState.stopOnFreeTierLimit,
      stopOnMonthlyLimit: bridgeUsageBudgetState.stopOnMonthlyLimit
    }
  });
  if (!assessment.allowed) {
    const numberFormat = new Intl.NumberFormat(currentAppLocale === "en" ? "en-US" : "ko-KR");
    const reasons = [
      assessment.dailyLimitExceeded
        ? formatElectronText(currentAppLocale, "usageDailyLimitExceeded", {
            projected: numberFormat.format(Math.ceil(assessment.projectedTodayTokens)),
            limit: numberFormat.format(Math.ceil(assessment.dailyLimit))
          })
        : "",
      assessment.monthlyLimitExceeded
        ? formatElectronText(currentAppLocale, "usageMonthlyLimitExceeded", {
            projected: numberFormat.format(Math.ceil(assessment.projectedMonthCostKrw)),
            limit: numberFormat.format(Math.ceil(assessment.monthlyLimitKrw))
          })
        : ""
    ].filter(Boolean);
    throw new Error(reasons.join(" ") || electronText(currentAppLocale, "usageBudgetLimit"));
  }
  bridgeUsageBudgetState.pendingTokens += estimatedTokens;
  bridgeUsageBudgetState.pendingCostKrw += estimatedCostKrw;
  let committed = false;
  let released = false;
  return {
    commit() {
      if (committed) return;
      committed = true;
      bridgeUsageBudgetState.unsyncedTokens += estimatedTokens;
      bridgeUsageBudgetState.unsyncedCostKrw += estimatedCostKrw;
    },
    release() {
      if (released) return;
      released = true;
      bridgeUsageBudgetState.pendingTokens = Math.max(
        0,
        bridgeUsageBudgetState.pendingTokens - estimatedTokens
      );
      bridgeUsageBudgetState.pendingCostKrw = Math.max(
        0,
        bridgeUsageBudgetState.pendingCostKrw - estimatedCostKrw
      );
    }
  };
}

async function translateBridgeText(input: {
  text: string;
  sourceLang: string;
  targetLang: string;
}) {
  const normalizedText = normalizeBridgeText(input.text);
  const cacheInput: TranslateTextInput = {
    profileId: activeProfileId,
    text: normalizedText,
    sourceLang: input.sourceLang,
    targetLang: input.targetLang,
    providerName: "localMt",
    model: DEFAULT_LOCAL_MT_MODEL
  };
  const cached = ensureDatabase().getTranslationCache(cacheInput);
  if (cached) {
    return cached.translatedText;
  }

  const translatedText = await translateWithLocalMt(cacheInput);
  const saved = ensureDatabase().saveTranslationCache({
    ...cacheInput,
    translatedText
  });
  notifyUsageRecorded(estimateUsageEventForTexts(cacheInput, [normalizedText]));
  return saved.translatedText;
}

async function refreshListeningVideoCandidateMetadata(
  candidateIdsInput?: unknown,
  signal?: AbortSignal
) {
  if (signal) throwIfPrivacyManagedDataWriteAborted(signal);
  const database = ensureDatabase();
  const requestedIds = Array.isArray(candidateIdsInput)
    ? new Set(candidateIdsInput.map((id) => normalizeBridgeText(id)).filter(Boolean))
    : null;
  const candidates = database
    .listListeningVideoCandidates(500)
    .filter((candidate) => !requestedIds || requestedIds.has(candidate.id))
    .filter(
      (candidate) =>
        !candidate.durationSeconds &&
        !candidate.metadata?.durationSeconds &&
        candidate.videoId &&
        candidate.url
    );

  if (candidates.length === 0) {
    return database.listListeningVideoCandidates();
  }

  const durationFetchedAt = new Date().toISOString();
  const metadataByVideoId = new Map<string, YouTubeVideoMetadata>();

  for (const candidateBatch of chunkArray(candidates, 30)) {
    if (signal) throwIfPrivacyManagedDataWriteAborted(signal);
    const batchMetadataByVideoId = await fetchYouTubeVideoMetadataBatch(
      candidateBatch.map((candidate) => candidate.url),
      25_000,
      signal
    );
    for (const [videoId, metadata] of batchMetadataByVideoId) {
      metadataByVideoId.set(videoId, metadata);
    }
  }

  for (const candidate of candidates) {
    if (signal) throwIfPrivacyManagedDataWriteAborted(signal);
    const metadata = metadataByVideoId.get(candidate.videoId);
    if (!metadata) {
      continue;
    }

    database.updateListeningVideoCandidateMetadata(candidate.id, {
      channelName: candidate.channelName || metadata.channelName,
      thumbnailUrl: candidate.thumbnailUrl || metadata.thumbnailUrl,
      durationSeconds: metadata.durationSeconds,
      metadata: {
        ...candidate.metadata,
        durationSeconds: metadata.durationSeconds,
        durationSource: metadata.durationSeconds ? metadata.durationSource ?? "youtube-page" : undefined,
        durationFetchedAt,
        metadataTitle: metadata.title,
        metadataUrl: metadata.webpageUrl
      }
    });
  }

  return database.listListeningVideoCandidates();
}

function notifyLifeLogsChanged(lifeLog: LifeLog) {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("lifeLogs:changed", lifeLog);
  }
}

function notifyCardsChanged(card: StudyCard) {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("cards:changed", card);
  }
}

function notifyPlayZoneWalletChanged() {
  mainWindow?.webContents.send("playZone:walletChanged");
}

function createMainGeminiUsageObserver(
  input: {
    profileId?: ProfileId;
    geminiPlan?: AppSettings["geminiPlan"];
    sourceLang?: string;
    targetLang?: string;
  }
) {
  return (observation: GeminiUsageObservation) => {
    notifyUsageRecorded(
      createTranslationUsageEvent({
        profileId: input.profileId,
        providerName: "gemini",
        model: observation.model,
        plan: input.geminiPlan,
        sourceLang: input.sourceLang,
        targetLang: input.targetLang ?? "und",
        usage: observation.usage
      })
    );
  };
}

function notifyUsageRecorded(event: TranslationUsageEvent | undefined) {
  if (!event) {
    return;
  }
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("usage:recorded", event);
  }
}

function recordCardCreationMissionEvent(
  db: LocalDatabase,
  card: StudyCard,
  fallbackProfileId: ProfileId,
  source?: string
) {
  const type = getCardCreationMissionEventType(card);
  if (!type) {
    return;
  }
  db.recordMissionEvent({
    type,
    profileId: card.profileId ?? fallbackProfileId,
    amount: 1,
    metadata: {
      cardId: card.id,
      deckType: card.deckType,
      source
    }
  });
}

function getCardCreationMissionEventType(card: StudyCard): LearningMissionEvent["type"] | null {
  if (isInputReadingCard(card)) {
    return "card_created";
  }
  if (isLifeMiningOutputCard(card)) {
    return "life_mining_card_created";
  }
  return null;
}

async function prepareLocalVideoFileForPlayback(
  input: ListeningLocalVideoFile,
  signal?: AbortSignal
): Promise<ListeningLocalVideoFile> {
  try {
    const prepared = await prepareLocalVideoPlaybackFile(
      input,
      path.join(app.getPath("userData"), "video-reader"),
      { signal }
    );
    if (signal) throwIfPrivacyManagedDataWriteAborted(signal);
    return withLocalVideoPlaybackProtocol(prepared);
  } catch (caught) {
    if (signal) throwIfPrivacyManagedDataWriteAborted(signal);
    console.warn(
      "[local-video] playback preparation failed",
      serializeSafeDebugLogEntry({ error: caught })
    );
    return withLocalVideoPlaybackProtocol({
      ...input,
      originalFileUrl: input.originalFileUrl ?? input.fileUrl,
      playbackFilePath: input.playbackFilePath ?? input.filePath,
      playbackSource: input.playbackSource ?? "original",
      playbackMessage: electronText(currentAppLocale, "localVideoPlaybackFallback")
    });
  }
}

function registerLocalVideoProtocol() {
  protocol.handle(LOCAL_VIDEO_PROTOCOL, async (request) => {
    try {
      const filePath = decodeLocalVideoProtocolUrl(request.url);
      return createLocalVideoProtocolResponse(filePath, request.headers.get("range"));
    } catch {
      return new Response("Local video request failed security verification.", {
        status: 404,
        headers: {
          "Content-Type": "text/plain; charset=utf-8"
        }
      });
    }
  });
}

function registerPlayZoneEntryProtocol() {
  const handleRequest = async (request: Request) => {
    try {
      const verifiedFile = readPlayZoneEntryProtocolFile(request.url);
      return createPlayZoneEntryProtocolResponse(verifiedFile.filePath, verifiedFile.contents);
    } catch {
      return new Response("PlayZone cartridge request failed security verification.", {
        status: 404,
        headers: {
          "Content-Type": "text/plain; charset=utf-8"
        }
      });
    }
  };

  protocol.handle(PLAY_ZONE_ENTRY_PROTOCOL, handleRequest);
  session
    .fromPartition(PLAY_ZONE_RUNTIME_PARTITION)
    .protocol.handle(PLAY_ZONE_ENTRY_PROTOCOL, handleRequest);
}

function registerWebReaderPracticeProtocol() {
  const handleRequest = async (request: Request) => {
    if (!isWebReaderPracticeUrl(request.url)) {
      return new Response("Practice page not found.", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }
    return new Response(
      renderWebReaderPracticeHtml(currentAppLocale === "en" ? "en" : "ko"),
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "Content-Security-Policy":
            "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
          "Content-Type": "text/html; charset=utf-8",
          "Cross-Origin-Resource-Policy": "same-origin",
          "Permissions-Policy":
            "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()",
          "Referrer-Policy": "no-referrer",
          "X-Content-Type-Options": "nosniff"
        }
      }
    );
  };

  protocol.handle(WEB_READER_PRACTICE_PROTOCOL, handleRequest);
  getWebReaderSession().protocol.handle(WEB_READER_PRACTICE_PROTOCOL, handleRequest);
}

function withLocalVideoPlaybackProtocol(input: ListeningLocalVideoFile): ListeningLocalVideoFile {
  const playbackPath = input.playbackFilePath || input.filePath;
  if (!playbackPath) {
    return input;
  }
  return {
    ...input,
    fileUrl: buildLocalVideoProtocolUrl(playbackPath)
  };
}

function withLocalListeningMediaProtocol(media: StudyCardListeningMedia): StudyCardListeningMedia {
  return {
    ...media,
    videoClip: media.videoClip
      ? {
          ...media.videoClip,
          fileUrl: buildLocalVideoProtocolUrl(media.videoClip.filePath)
        }
      : undefined,
    audioClip: media.audioClip
      ? {
          ...media.audioClip,
          fileUrl: buildLocalVideoProtocolUrl(media.audioClip.filePath)
        }
      : undefined,
    frameImage: media.frameImage
      ? {
          ...media.frameImage,
          fileUrl: buildLocalVideoProtocolUrl(media.frameImage.filePath)
        }
      : undefined
  };
}

function buildLocalVideoProtocolUrl(filePath: string) {
  const token = Buffer.from(path.resolve(filePath), "utf8").toString("base64url");
  return `${LOCAL_VIDEO_PROTOCOL}://local/${token}`;
}

function decodeLocalVideoProtocolUrl(url: string) {
  const parsed = new URL(url);
  const pathToken = parsed.pathname.replace(/^\/+/, "").split("/")[0];
  const token = pathToken || parsed.hostname;
  if (!token) {
    throw new Error("Missing local video token.");
  }
  return Buffer.from(token, "base64url").toString("utf8");
}

function createLocalVideoProtocolResponse(filePath: string, rangeHeader: string | null) {
  const normalizedPath = path.resolve(filePath);
  const stat = fs.statSync(normalizedPath);
  if (!stat.isFile()) {
    throw new Error("Requested local video path is not a file.");
  }

  const fileSize = stat.size;
  const range = parseHttpRangeHeader(rangeHeader, fileSize);
  const headers = new Headers({
    "Accept-Ranges": "bytes",
    "Content-Type": getLocalVideoMimeType(normalizedPath),
    "Cache-Control": "no-store"
  });

  if (range) {
    headers.set("Content-Length", String(range.end - range.start + 1));
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${fileSize}`);
    return new Response(
      Readable.toWeb(fs.createReadStream(normalizedPath, { start: range.start, end: range.end })) as ReadableStream,
      {
        status: 206,
        headers
      }
    );
  }

  headers.set("Content-Length", String(fileSize));
  return new Response(
    Readable.toWeb(fs.createReadStream(normalizedPath)) as ReadableStream,
    {
      status: 200,
      headers
    }
  );
}

function createPlayZoneEntryProtocolResponse(filePath: string, verifiedContents: Buffer) {
  const normalizedPath = path.resolve(filePath);

  if (isPlayZoneHtmlFile(normalizedPath)) {
    const html = injectPlayZoneHostBridge(verifiedContents.toString("utf8"));
    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": String(Buffer.byteLength(html, "utf8")),
        "Cache-Control": "no-store",
        "Content-Security-Policy": [
          "default-src 'none'",
          "script-src 'self' 'unsafe-inline' blob:",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "media-src 'self' data: blob:",
          "font-src 'self' data:",
          "connect-src 'none'",
          "worker-src 'self' blob:",
          "frame-src 'none'",
          "child-src 'none'",
          "object-src 'none'",
          "manifest-src 'none'",
          "base-uri 'none'",
          "form-action 'none'"
        ].join("; "),
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), clipboard-read=(), clipboard-write=()"
      }
    });
  }

  return new Response(Uint8Array.from(verifiedContents).buffer, {
      status: 200,
      headers: {
        "Content-Type": getPlayZoneEntryMimeType(normalizedPath),
        "Content-Length": String(verifiedContents.length),
        "Cache-Control": getPlayZoneEntryCacheControl(normalizedPath),
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff"
      }
    });
}

function isPlayZoneHtmlFile(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  return extension === ".html" || extension === ".htm";
}

function getPlayZoneEntryCacheControl(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (
    [
      ".apng",
      ".avif",
      ".bmp",
      ".gif",
      ".ico",
      ".jpg",
      ".jpeg",
      ".mp3",
      ".ogg",
      ".png",
      ".svg",
      ".wav",
      ".webp",
      ".woff",
      ".woff2"
    ].includes(extension)
  ) {
    return "public, max-age=31536000, immutable";
  }
  return "no-cache";
}

function parseHttpRangeHeader(rangeHeader: string | null, fileSize: number) {
  const match = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) {
    return null;
  }
  const rawStart = match[1];
  const rawEnd = match[2];
  let start = rawStart ? Number(rawStart) : 0;
  let end = rawEnd ? Number(rawEnd) : fileSize - 1;

  if (!rawStart && rawEnd) {
    const suffixLength = Number(rawEnd);
    start = Math.max(0, fileSize - suffixLength);
    end = fileSize - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= fileSize) {
    throw new Error("Invalid range request.");
  }

  return {
    start,
    end: Math.min(end, fileSize - 1)
  };
}

function getPlayZoneEntryMimeType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".html" || extension === ".htm") {
    return "text/html; charset=utf-8";
  }
  if (extension === ".js" || extension === ".mjs") {
    return "text/javascript; charset=utf-8";
  }
  if (extension === ".css") {
    return "text/css; charset=utf-8";
  }
  if (extension === ".json") {
    return "application/json; charset=utf-8";
  }
  if (extension === ".svg") {
    return "image/svg+xml";
  }
  if (extension === ".png") {
    return "image/png";
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  if (extension === ".gif") {
    return "image/gif";
  }
  if (extension === ".wasm") {
    return "application/wasm";
  }
  return "application/octet-stream";
}

function getLocalVideoMimeType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".m4a" || extension === ".mp4a") {
    return "audio/mp4";
  }
  if (extension === ".mp3") {
    return "audio/mpeg";
  }
  if (extension === ".wav") {
    return "audio/wav";
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }
  if (extension === ".png") {
    return "image/png";
  }
  if (extension === ".webm") {
    return "video/webm";
  }
  if (extension === ".mov") {
    return "video/quicktime";
  }
  if (extension === ".m4v") {
    return "video/x-m4v";
  }
  return "video/mp4";
}

function normalizeProfileId(profileId: ProfileId | undefined) {
  return profileId?.trim() || DEFAULT_PROFILE_ID;
}

function appendTranslationDebugLog(entry: Record<string, unknown>) {
  try {
    const logPath = path.join(app.getPath("userData"), "translation-debug.log");
    const secrets = secureSettingsVault
      ? [
          secureSettingsVault.get("geminiApiKey"),
          secureSettingsVault.get("googleTranslateApiKey")
        ]
      : [];
    fs.appendFileSync(
      logPath,
      `${serializeSafeDebugLogEntry({
        time: new Date().toISOString(),
        ...entry
      }, secrets)}\n`,
      "utf8"
    );
  } catch {
    // Debug logging must never break translation/export.
  }
}

function resolveFromCwd(value: string) {
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

function getQaPreloadArguments() {
  const settingsJson = process.env.LM_QA_APP_SETTINGS_JSON;
  if (!settingsJson) {
    return [];
  }

  return [`--lm-qa-app-settings=${Buffer.from(settingsJson, "utf8").toString("base64")}`];
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

configureWebReaderQaAccess({
  getView: () => webReaderView,
  canExecuteScript: canExecuteWebReaderScript,
  injectSelectionPopover: injectWebReaderSelectionPopover,
  injectLifeMining: injectWebReaderLifeMining,
  getLifeMiningState: getWebReaderLifeMiningState,
  consumeLifeMiningCaptures: consumeWebReaderLifeMiningCaptures,
  saveLifeMiningCapture: saveWebReaderLifeMiningCapture
});

const appSmokeQaWebReaderAccess: AppSmokeQaWebReaderAccess = {
  getView: () => webReaderView,
  getPopupWindows: () => webReaderPopupWindows,
  canExecuteScript: canExecuteWebReaderScript,
  getState: () => getWebReaderViewState(),
  injectSelectionPopover: () => injectWebReaderSelectionPopover(),
  testSelectionPopover: testWebReaderSelectionPopover,
  testShadowTitleSelectionPopover: testWebReaderShadowTitleSelectionPopover,
  injectLifeMining: () => injectWebReaderLifeMining(),
  captureLifeMiningNow: captureWebReaderLifeMiningNow
};

function configureQaUserDataPath() {
  const qaUserDataDir = process.env.LM_QA_USER_DATA_DIR;
  if (!qaUserDataDir) {
    return;
  }
  app.setPath("userData", resolveFromCwd(qaUserDataDir));
}

function configureQaDeviceScaleFactor() {
  const scaleFactor = resolveQaDeviceScaleFactor(process.env);
  if (scaleFactor === null) {
    return;
  }
  app.commandLine.appendSwitch("force-device-scale-factor", String(scaleFactor));
}

const legacySecureSettingsHelperMode =
  process.env.LM_LEGACY_SECURE_SETTINGS_HELPER === "1";

function configureLegacySecureSettingsHelperPath() {
  if (!legacySecureSettingsHelperMode) return false;
  const requestedPath = process.env.LM_LEGACY_SECURE_SETTINGS_USER_DATA;
  const expectedPath = path.join(app.getPath("appData"), "Electron");
  if (!requestedPath || path.resolve(requestedPath) !== path.resolve(expectedPath)) return false;
  app.setPath("userData", expectedPath);
  return true;
}

const legacySecureSettingsHelperConfigured = configureLegacySecureSettingsHelperPath();
if (!legacySecureSettingsHelperMode) {
  configureQaDeviceScaleFactor();
  configureQaUserDataPath();
}

const isPrimaryAppInstance = legacySecureSettingsHelperMode
  ? true
  : app.requestSingleInstanceLock();
if (!legacySecureSettingsHelperMode && !isPrimaryAppInstance) {
  app.quit();
} else if (!legacySecureSettingsHelperMode) {
  app.on("second-instance", () => {
    void showMainWindow();
  });
}

app.whenReady().then(async () => {
  if (legacySecureSettingsHelperMode) {
    sendLegacySecureSettingsToParent(legacySecureSettingsHelperConfigured);
    return;
  }
  if (!isPrimaryAppInstance) {
    return;
  }
  currentAppLocale = normalizeElectronAppLocale(app.getLocale());
  privacyDeletionCoordinator.restore();
  registerWebReaderPracticeProtocol();
  registerLocalVideoProtocol();
  registerPlayZoneEntryProtocol();
  const bookMakerQaConfig =
    process.env.LM_QA_BOOK_MAKER === "1" ? readBookMakerQaConfig() : undefined;
  const appSmokeQaReportPath =
    process.env.LM_QA_APP_SMOKE === "1"
      ? resolveFromCwd(
          process.env.LM_QA_APP_SMOKE_REPORT ??
            path.join("debug", "reports", `app-smoke-electron-qa-${qaTimestamp()}.json`)
        )
      : undefined;
  const docsScreenshotQaReportPath =
    process.env.LM_QA_DOC_SCREENSHOTS === "1"
      ? resolveFromCwd(
          process.env.LM_QA_DOC_SCREENSHOTS_REPORT ??
            path.join("debug", "reports", `docs-screenshots-${qaTimestamp()}.json`)
        )
      : undefined;
  const docsScreenshotOutputDirectory =
    process.env.LM_QA_DOC_SCREENSHOTS === "1"
      ? resolveFromCwd(
          process.env.LM_QA_DOC_SCREENSHOTS_OUTPUT ??
            path.join("debug", "qa", "docs-screenshots")
        )
      : undefined;
  const manualScreenshotQaReportPath =
    process.env.LM_QA_MANUAL_SCREENSHOTS === "1"
      ? resolveFromCwd(
          process.env.LM_QA_MANUAL_SCREENSHOTS_REPORT ??
            path.join("debug", "reports", `manual-screenshots-${qaTimestamp()}.json`)
        )
      : undefined;
  const manualScreenshotOutputDirectory =
    process.env.LM_QA_MANUAL_SCREENSHOTS === "1"
      ? resolveFromCwd(
          process.env.LM_QA_MANUAL_SCREENSHOTS_OUTPUT ??
            path.join("debug", "qa", "manual-screenshots")
        )
      : undefined;
  const webReaderPopoverQaReportPath =
    process.env.LM_QA_WEB_READER_POPOVER === "1"
      ? resolveFromCwd(
          process.env.LM_QA_WEB_READER_POPOVER_REPORT ??
            path.join("debug", "reports", `web-reader-popover-qa-${qaTimestamp()}.json`)
        )
      : undefined;
  const webReaderLifeMiningQaReportPath =
    process.env.LM_QA_WEB_READER_LIFE_PROOF === "1"
      ? resolveFromCwd(
          process.env.LM_QA_WEB_READER_LIFE_PROOF_REPORT ??
            path.join("debug", "reports", `web-reader-life-mining-qa-${qaTimestamp()}.json`)
        )
      : undefined;
  if (bookMakerQaConfig) {
    prepareBookMakerQaSettingsOverride(bookMakerQaConfig);
  }

  database = new LocalDatabase(app.getPath("userData"));
  await database.init();
  secureSettingsVault = new SecureSettingsVault(app.getPath("userData"));
  await migrateLegacyDevelopmentSecureSettings(secureSettingsVault);
  appOnboardingState = new AppOnboardingStateStore(app.getPath("userData"));
  registerIpcHandlers();
  registerYouTubeEmbedRequestHeaders(session.defaultSession);
  registerWebReaderSessionPersistence();
  startLifeMinerBridge();
  createAppTray();
  desktopOcrShortcutAvailable = registerDesktopOcrShortcut(
    () => currentAppLocale,
    () => !isPrivacyDeletionBlockingManagedDataWrites()
  );
  await createWindow();

  if (manualScreenshotQaReportPath && manualScreenshotOutputDirectory && mainWindow) {
    const docsLocale = process.env.LM_QA_APP_LOCALE === "en" ? "en" : "ko";
    runQaTaskAndExit({
      reportPath: manualScreenshotQaReportPath,
      run: () =>
        runManualScreenshotQa(
          mainWindow as BrowserWindow,
          manualScreenshotQaReportPath,
          manualScreenshotOutputDirectory,
          docsLocale
        )
    });
  } else if (docsScreenshotQaReportPath && docsScreenshotOutputDirectory && mainWindow) {
    const docsLocale = process.env.LM_QA_APP_LOCALE === "en" ? "en" : "ko";
    runQaTaskAndExit({
      reportPath: docsScreenshotQaReportPath,
      run: () =>
        runDocsScreenshotQa(
          mainWindow as BrowserWindow,
          docsScreenshotQaReportPath,
          docsScreenshotOutputDirectory,
          docsLocale,
          appSmokeQaWebReaderAccess
        )
    });
  } else if (webReaderLifeMiningQaReportPath && mainWindow) {
    runQaTaskAndExit({
      reportPath: webReaderLifeMiningQaReportPath,
      run: () =>
        runWebReaderLifeMiningProofQa(
          mainWindow as BrowserWindow,
          webReaderLifeMiningQaReportPath,
          appSmokeQaWebReaderAccess
        )
    });
  } else if (webReaderPopoverQaReportPath && mainWindow) {
    runQaTaskAndExit({
      reportPath: webReaderPopoverQaReportPath,
      run: () =>
        runWebReaderPopoverVisualQa(
          mainWindow as BrowserWindow,
          webReaderPopoverQaReportPath,
          appSmokeQaWebReaderAccess
        )
    });
  } else if (appSmokeQaReportPath && mainWindow) {
    runQaTaskAndExit({
      reportPath: appSmokeQaReportPath,
      run: () =>
        runAppSmokeQa(
          mainWindow as BrowserWindow,
          appSmokeQaReportPath,
          appSmokeQaWebReaderAccess
        )
    });
  } else if (bookMakerQaConfig && mainWindow) {
    runQaTaskAndExit({
      reportPath: process.env.LM_QA_BOOK_MAKER_REPORT,
      resolveReportPath: resolveFromCwd,
      run: () => runBookMakerQa(mainWindow as BrowserWindow, bookMakerQaConfig)
    });
  }

  app.on("activate", async () => {
    await showMainWindow();
  });
});

type LegacySecureSettingsHelperMessage = SecureSettingsInput & {
  nonce: string;
  available: boolean;
};

function sendLegacySecureSettingsToParent(configured: boolean) {
  const nonce = process.env.LM_LEGACY_SECURE_SETTINGS_NONCE ?? "";
  if (!configured || !nonce || typeof process.send !== "function") {
    app.exit(1);
    return;
  }

  const vault = new SecureSettingsVault(app.getPath("userData"));
  const status = vault.getStatus();
  const message: LegacySecureSettingsHelperMessage = {
    nonce,
    available: status.available,
    geminiApiKey: vault.get("geminiApiKey"),
    googleTranslateApiKey: vault.get("googleTranslateApiKey")
  };
  const fallback = setTimeout(() => app.exit(1), 5_000);
  process.send(message, undefined, undefined, () => {
    clearTimeout(fallback);
    app.exit(0);
  });
}

async function migrateLegacyDevelopmentSecureSettings(vault: SecureSettingsVault) {
  if (
    process.platform !== "win32" ||
    !app.isPackaged ||
    process.env.LM_QA_USER_DATA_DIR ||
    vault.isLegacyProfileMigrationComplete() ||
    !vault.getStatus().available
  ) {
    return;
  }
  const legacyUserDataPath = findPackagedLegacyDevelopmentUserDataPath();
  if (!legacyUserDataPath) return;

  try {
    const legacySecureSettingsPath = path.join(legacyUserDataPath, "secure-settings.json");
    try {
      const secureSettingsStat = fs.lstatSync(legacySecureSettingsPath);
      if (
        !secureSettingsStat.isFile() ||
        secureSettingsStat.isSymbolicLink() ||
        secureSettingsStat.size > 64 * 1024
      ) {
        vault.completeLegacyProfileMigration({});
        return;
      }
    } catch {
      vault.completeLegacyProfileMigration({});
      return;
    }

    const input = await requestLegacySecureSettingsFromHelper(legacyUserDataPath);
    if (input) vault.completeLegacyProfileMigration(input);
  } catch {
    // A missing or unrecognized development profile is the normal case.
  }
}

function requestLegacySecureSettingsFromHelper(
  legacyUserDataPath: string
): Promise<SecureSettingsInput | null> {
  const nonce = randomUUID();
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(process.execPath, [], {
      env: {
        ...process.env,
        LM_LEGACY_SECURE_SETTINGS_HELPER: "1",
        LM_LEGACY_SECURE_SETTINGS_USER_DATA: legacyUserDataPath,
        LM_LEGACY_SECURE_SETTINGS_NONCE: nonce
      },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      windowsHide: true
    });
    const finish = (value: SecureSettingsInput | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(value);
    };
    const timeout = setTimeout(() => {
      child.kill();
      finish(null);
    }, 10_000);

    child.once("error", () => finish(null));
    child.once("exit", () => finish(null));
    child.on("message", (raw) => {
      if (!raw || typeof raw !== "object") return;
      const message = raw as Partial<LegacySecureSettingsHelperMessage>;
      if (message.nonce !== nonce || message.available !== true) return;
      finish({
        geminiApiKey: normalizeSecureHelperValue(message.geminiApiKey),
        googleTranslateApiKey: normalizeSecureHelperValue(message.googleTranslateApiKey)
      });
    });
  });
}

function normalizeSecureHelperValue(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized.length <= 16 * 1024 ? normalized : "";
}

app.on("window-all-closed", () => {
  // Keep the process alive for Life Mining background capture. Quit is handled from the tray.
});

function runBeforeQuitCleanup() {
  if (beforeQuitCleanupRan) {
    return;
  }
  beforeQuitCleanupRan = true;
  isQuitting = true;
  appBackupRollbackStore.clear();
  syncCardsBeforeQuit();
  unregisterDesktopOcrShortcut();
  stopLifeMinerBridge();
  appTray?.destroy();
  appTray = null;
}

app.on("before-quit", (event) => {
  isQuitting = true;
  if (!beforeQuitSessionFlushComplete) {
    event.preventDefault();
    beforeQuitSessionFlushComplete = true;
    runBeforeQuitCleanup();
    void flushWebReaderSessionStorage("before-quit").finally(() => {
      app.quit();
    });
    return;
  }

  runBeforeQuitCleanup();
});
