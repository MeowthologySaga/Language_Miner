import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from "electron";
import type {
  BilingualExportHistoryRecord,
  BilingualPdfExportInput,
  BilingualPdfExportResult,
  BilingualReaderArtifact,
  AppSettings,
  AppRuntimeStatus,
  CardSyncResult,
  CardSyncStatus,
  CloudProviderConsentRecord,
  DailyMissionBoard,
  DailyMissionId,
  DesktopOcrCardInput,
  DesktopOcrCaptureResult,
  DesktopOcrSelectionRect,
  DiamondTransaction,
  DiamondSpendLookupResult,
  DiamondSpendRequest,
  DiamondSpendResult,
  DiamondWallet,
  EnsureOllamaRuntimeResult,
  CardSyncSettings,
  LearningMissionEvent,
  LifeLog,
  ListeningLocalTranscriptInput,
  ListeningCardMediaClipInput,
  ListeningCardMediaClipResult,
  ListeningLocalVideoFolder,
  ListeningLocalVideoFile,
  ListeningToolStatus,
  ListeningTranscript,
  ListeningTranscriptGenerationResult,
  ListeningVideoCandidate,
  ListeningVideoCandidateInput,
  OllamaModelInput,
  OllamaModelStatusResult,
  PdfFileReadResult,
  PlayZoneLibraryEntry,
  PlayZoneDiamondAction,
  PlayZoneLibraryScanResult,
  PlayZoneOfficialDownloadProgress,
  PlayZoneSaveBackupResult,
  ProfileId,
  ProfileDataDeleteResult,
  ProfileDataSummary,
  CardPageResult,
  LifeLogPageResult,
  SecureSettingsStatus,
  PullOllamaModelResult,
  ReviewRating,
  StudyCard,
  TextFileReadResult,
  TtsSynthesisInput,
  TtsSynthesisResult,
  TtsVoiceInfo,
  TranslationConnectionTestInput,
  TranslationConnectionTestResult,
  TranslatePdfSegmentsInput,
  TranslatePdfSegmentsResult,
  TranslateTextInput,
  TranslateTextResult,
  TranslationCacheEntry,
  TranslationCacheLookupInput,
  TranslationUsageEvent,
  WebReaderLifeMiningState
} from "../src/shared/types";
import type {
  AppBackupPreview,
  AppBackupRendererSnapshot,
  AppBackupRestoreMode,
  AppBackupRestoreResult
} from "../src/shared/appBackup";
import type {
  PrivacyDataDeleteRequest,
  PrivacyDataDeleteResult,
  PrivacyRendererCleanupRequest
} from "../src/shared/privacyData";

applyQaSettingsOverride();

const qaRuntime = isQaRuntime();

contextBridge.exposeInMainWorld("localEnglishMiner", {
  app: {
    markRendererReady: () => ipcRenderer.invoke("app:rendererReady") as Promise<boolean>,
    getRuntimeStatus: () =>
      ipcRenderer.invoke("app:getRuntimeStatus") as Promise<AppRuntimeStatus>,
    getAppOnboardingCompleted: () =>
      ipcRenderer.invoke("app:getOnboardingCompleted") as Promise<boolean>,
    completeAppOnboarding: () =>
      ipcRenderer.invoke("app:completeOnboarding") as Promise<boolean>,
    setLaunchAtLogin: (enabled: boolean) =>
      ipcRenderer.invoke("app:setLaunchAtLogin", enabled) as Promise<AppRuntimeStatus>,
    openExternalUrl: (url: string) =>
      ipcRenderer.invoke("app:openExternalUrl", url) as Promise<boolean>,
    openChatGpt: () => ipcRenderer.invoke("app:openChatGpt") as Promise<boolean>,
    setPlayerFullscreen: (enabled: boolean) =>
      ipcRenderer.invoke("app:setPlayerFullscreen", enabled) as Promise<boolean>,
    setBridgeSettings: (settings: {
      appLocale: "ko" | "en";
      browserCaptureSiteSettings: AppSettings["browserCaptureSiteSettings"];
      lifeMiningCaptureSettings: AppSettings["lifeMiningCaptureSettings"];
      captureShortcut: AppSettings["captureShortcut"];
      browserSelectionCardMode: AppSettings["browserSelectionCardMode"];
      providerName: AppSettings["providerName"];
      ollamaBaseUrl: AppSettings["ollamaBaseUrl"];
      ollamaModel: AppSettings["ollamaModel"];
      geminiApiKey: AppSettings["geminiApiKey"];
      geminiModel: AppSettings["geminiModel"];
      geminiPlan: AppSettings["geminiPlan"];
      cloudConsent?: CloudProviderConsentRecord;
      learningProfile: AppSettings["learningProfile"];
      dailyAppTokenLimit: AppSettings["dailyAppTokenLimit"];
      monthlySpendLimitKrw: AppSettings["monthlySpendLimitKrw"];
      stopOnFreeTierLimit?: AppSettings["stopOnFreeTierLimit"];
      stopOnMonthlyLimit?: AppSettings["stopOnMonthlyLimit"];
      usageSummary?: { todayTokens: number; monthCostKrw: number };
      cardSyncFolderPath: AppSettings["cardSyncFolderPath"];
      cardSyncOnQuit: AppSettings["cardSyncOnQuit"];
    }) => ipcRenderer.invoke("app:setBridgeSettings", settings) as Promise<boolean>,
    openPlayZoneRuntimeWindow: (input: {
      runtimeId: string;
      cartridgeId: string;
      title: string;
      entryUrl: string;
      walletBalance: number;
      diamondActions: PlayZoneDiamondAction[];
    }) =>
      ipcRenderer.invoke("playZone:openRuntimeWindow", input) as Promise<boolean>,
    onPlayZoneWalletChanged: (callback: () => void) => {
      const listener = () => {
        callback();
      };
      ipcRenderer.on("playZone:walletChanged", listener);
      return () => {
        ipcRenderer.removeListener("playZone:walletChanged", listener);
      };
    },
    onUsageRecorded: (callback: (event: TranslationUsageEvent) => void) => {
      const listener = (_event: IpcRendererEvent, usageEvent: TranslationUsageEvent) => {
        callback(usageEvent);
      };
      ipcRenderer.on("usage:recorded", listener);
      return () => {
        ipcRenderer.removeListener("usage:recorded", listener);
      };
    }
  },
  webReader: {
    attach: (input: {
      url: string;
      bounds: { x: number; y: number; width: number; height: number };
    }) => ipcRenderer.invoke("webReader:attach", input),
    setBounds: (bounds: { x: number; y: number; width: number; height: number }) =>
      ipcRenderer.invoke("webReader:setBounds", bounds),
    setVisible: (visible: boolean) =>
      ipcRenderer.invoke("webReader:setVisible", visible) as Promise<boolean>,
    loadUrl: (url: string) => ipcRenderer.invoke("webReader:loadUrl", url),
    goBack: () => ipcRenderer.invoke("webReader:goBack"),
    goForward: () => ipcRenderer.invoke("webReader:goForward"),
    reload: () => ipcRenderer.invoke("webReader:reload"),
    getState: () => ipcRenderer.invoke("webReader:getState"),
    getLifeMiningState: () =>
      ipcRenderer.invoke("webReader:getLifeMiningState") as Promise<WebReaderLifeMiningState>,
    getPageTextSegments: () => ipcRenderer.invoke("webReader:getPageTextSegments"),
    applyPageTranslations: (input: unknown) =>
      ipcRenderer.invoke("webReader:applyPageTranslations", input) as Promise<boolean>,
    restorePageTranslations: () =>
      ipcRenderer.invoke("webReader:restorePageTranslations") as Promise<boolean>,
    getSelection: () => ipcRenderer.invoke("webReader:getSelection"),
    consumePopoverAction: () => ipcRenderer.invoke("webReader:consumePopoverAction"),
    showSelectionPopover: () => ipcRenderer.invoke("webReader:showSelectionPopover"),
    showPopoverStatus: (input: { state: string; message?: string }) =>
      ipcRenderer.invoke("webReader:showPopoverStatus", input),
    showPopoverResult: (card: unknown) => ipcRenderer.invoke("webReader:showPopoverResult", card),
    hidePopover: () => ipcRenderer.invoke("webReader:hidePopover") as Promise<boolean>,
    ...(qaRuntime
      ? {
          testSelectionPopover: (preferredText?: string, expectedContext?: string) =>
            ipcRenderer.invoke("webReader:testSelectionPopover", preferredText, expectedContext),
          testLifeMiningCapture: () =>
            ipcRenderer.invoke("webReader:testLifeMiningCapture") as Promise<WebReaderLifeMiningState>,
          captureLifeMiningNow: () =>
            ipcRenderer.invoke("webReader:captureLifeMiningNow") as Promise<{
              state: WebReaderLifeMiningState;
              savedCount: number;
              queued: boolean;
              debug: unknown;
            }>
        }
      : {}),
    detach: () => ipcRenderer.invoke("webReader:detach") as Promise<boolean>
  },
  profiles: {
    setActive: (profileId: ProfileId) =>
      ipcRenderer.invoke("profiles:setActive", profileId) as Promise<boolean>,
    getDataSummary: (profileId?: ProfileId) =>
      ipcRenderer.invoke("profiles:getDataSummary", profileId) as Promise<ProfileDataSummary>,
    deleteData: (profileId: ProfileId) =>
      ipcRenderer.invoke("profiles:deleteData", profileId) as Promise<ProfileDataDeleteResult>
  },
  secureSettings: {
    getStatus: () => ipcRenderer.invoke("secureSettings:getStatus") as Promise<SecureSettingsStatus>,
    getForSession: () => ipcRenderer.invoke("secureSettings:getForSession") as Promise<{
      geminiApiKey: string;
      googleTranslateApiKey: string;
    }>,
    set: (input: { geminiApiKey?: string; googleTranslateApiKey?: string }) =>
      ipcRenderer.invoke("secureSettings:set", input) as Promise<SecureSettingsStatus>,
    migrateLegacy: (input: { geminiApiKey?: string; googleTranslateApiKey?: string }) =>
      ipcRenderer.invoke("secureSettings:migrateLegacy", input) as Promise<SecureSettingsStatus>
  },
  lifeMinerBridge: {
    getPairingStatus: () => ipcRenderer.invoke("lifeMinerBridge:getPairingStatus"),
    rotateToken: () => ipcRenderer.invoke("lifeMinerBridge:rotateToken"),
    revoke: () => ipcRenderer.invoke("lifeMinerBridge:revoke"),
    forgetUninstalledExtension: (input: { confirmation: string }) =>
      ipcRenderer.invoke("lifeMinerBridge:forgetUninstalledExtension", input)
  },
  backups: {
    export: (input: { renderer: AppBackupRendererSnapshot; profileIds: string[] }) =>
      ipcRenderer.invoke("backups:export", input) as Promise<{
        canceled: boolean;
        filePath?: string;
      }>,
    previewImport: (input: { renderer: AppBackupRendererSnapshot; profileIds: string[] }) =>
      ipcRenderer.invoke("backups:previewImport", input) as Promise<AppBackupPreview | null>,
    restore: (input: {
      handleId: string;
      mode: AppBackupRestoreMode;
      currentRenderer: AppBackupRendererSnapshot;
      currentProfileIds: string[];
    }) =>
      ipcRenderer.invoke("backups:restore", input) as Promise<AppBackupRestoreResult>,
    rollbackRestore: (rollbackHandle: string) =>
      ipcRenderer.invoke("backups:rollbackRestore", rollbackHandle) as Promise<boolean>,
    finalizeRestore: (rollbackHandle: string) =>
      ipcRenderer.invoke("backups:finalizeRestore", rollbackHandle) as Promise<boolean>
  },
  privacy: {
    deleteData: (input: PrivacyDataDeleteRequest) =>
      ipcRenderer.invoke("privacy:deleteData", input) as Promise<PrivacyDataDeleteResult>,
    completeRendererCleanup: (input: PrivacyRendererCleanupRequest) =>
      ipcRenderer.invoke(
        "privacy:completeRendererCleanup",
        input
      ) as Promise<PrivacyDataDeleteResult>,
    getDeleteStatus: (operationId: string) =>
      ipcRenderer.invoke("privacy:getDeleteStatus", operationId) as Promise<PrivacyDataDeleteResult>,
    getPendingDeleteStatus: () =>
      ipcRenderer.invoke("privacy:getPendingDeleteStatus") as Promise<PrivacyDataDeleteResult | null>,
    acknowledgeDeleteResult: (operationId: string) =>
      ipcRenderer.invoke(
        "privacy:acknowledgeDeleteResult",
        operationId
      ) as Promise<PrivacyDataDeleteResult>
  },
  desktopCapture: {
    startOcrCapture: () =>
      ipcRenderer.invoke("desktopCapture:startOcrCapture") as Promise<boolean>,
    finishOcrSelection: (rect: DesktopOcrSelectionRect) =>
      ipcRenderer.invoke(
        "desktopCapture:finishOcrSelection",
        rect
      ) as Promise<DesktopOcrCaptureResult>,
    cancelOcrSelection: () =>
      ipcRenderer.invoke("desktopCapture:cancelOcrSelection") as Promise<boolean>,
    createInputCard: (input: DesktopOcrCardInput) =>
      ipcRenderer.invoke("desktopCapture:createInputCard", input) as Promise<StudyCard>
  },
  cards: {
    list: (profileId?: ProfileId) =>
      ipcRenderer.invoke("cards:list", profileId) as Promise<StudyCard[]>,
    listPage: (profileId?: ProfileId, offset?: number, limit?: number) =>
      ipcRenderer.invoke("cards:listPage", profileId, offset, limit) as Promise<CardPageResult>,
    listDue: (nowIso?: string, profileId?: ProfileId) =>
      ipcRenderer.invoke("cards:listDue", nowIso, profileId) as Promise<StudyCard[]>,
    save: (card: StudyCard, profileId?: ProfileId) =>
      ipcRenderer.invoke("cards:save", card, profileId) as Promise<StudyCard>,
    delete: (id: string) => ipcRenderer.invoke("cards:delete", id) as Promise<boolean>,
    review: (cardId: string, rating: ReviewRating) =>
      ipcRenderer.invoke("cards:review", cardId, rating) as Promise<StudyCard>,
    onChanged: (callback: (card: StudyCard) => void) => {
      const listener = (_event: IpcRendererEvent, card: StudyCard) => {
        callback(card);
      };
      ipcRenderer.on("cards:changed", listener);
      return () => {
        ipcRenderer.removeListener("cards:changed", listener);
      };
    }
  },
  wallet: {
    get: () => ipcRenderer.invoke("wallet:get") as Promise<DiamondWallet>,
    listTransactions: () =>
      ipcRenderer.invoke("wallet:listTransactions") as Promise<DiamondTransaction[]>,
    lookupSpend: (input: DiamondSpendRequest) =>
      ipcRenderer.invoke("wallet:lookupSpend", input) as Promise<DiamondSpendLookupResult>,
    spend: (input: DiamondSpendRequest) =>
      ipcRenderer.invoke("wallet:spend", input) as Promise<DiamondSpendResult>
  },
  missions: {
    getToday: (profileId?: ProfileId) =>
      ipcRenderer.invoke("missions:getToday", profileId) as Promise<DailyMissionBoard>,
    recordEvent: (event: Omit<LearningMissionEvent, "id" | "dateKey" | "createdAt">) =>
      ipcRenderer.invoke("missions:recordEvent", event) as Promise<DailyMissionBoard>,
    claimReward: (missionId: DailyMissionId, profileId?: ProfileId) =>
      ipcRenderer.invoke("missions:claimReward", missionId, profileId) as Promise<DailyMissionBoard>,
    claimDailyBonus: (profileId?: ProfileId) =>
      ipcRenderer.invoke("missions:claimDailyBonus", profileId) as Promise<DailyMissionBoard>
  },
  cardSync: {
    status: (settings: CardSyncSettings) =>
      ipcRenderer.invoke("cardSync:status", settings) as Promise<CardSyncStatus>,
    connect: (settings: CardSyncSettings) =>
      ipcRenderer.invoke("cardSync:connect", settings) as Promise<CardSyncStatus>,
    disconnect: () => ipcRenderer.invoke("cardSync:disconnect") as Promise<CardSyncStatus>,
    upload: (settings: CardSyncSettings, profileId?: ProfileId) =>
      ipcRenderer.invoke("cardSync:upload", settings, profileId) as Promise<CardSyncResult>,
    download: (settings: CardSyncSettings, profileId?: ProfileId) =>
      ipcRenderer.invoke("cardSync:download", settings, profileId) as Promise<CardSyncResult>,
    sync: (settings: CardSyncSettings, profileId?: ProfileId) =>
      ipcRenderer.invoke("cardSync:sync", settings, profileId) as Promise<CardSyncResult>
  },
  lifeLogs: {
    list: () => ipcRenderer.invoke("lifeLogs:list") as Promise<LifeLog[]>,
    listPage: (offset?: number, limit?: number) =>
      ipcRenderer.invoke("lifeLogs:listPage", offset, limit) as Promise<LifeLogPageResult>,
    save: (input: Omit<LifeLog, "id" | "processed" | "createdAt">) =>
      ipcRenderer.invoke("lifeLogs:save", input) as Promise<LifeLog>,
    markProcessed: (id: string, profileId?: ProfileId) =>
      ipcRenderer.invoke("lifeLogs:markProcessed", id, profileId) as Promise<boolean>,
    delete: (id: string) => ipcRenderer.invoke("lifeLogs:delete", id) as Promise<boolean>,
    onChanged: (callback: (lifeLog: LifeLog) => void) => {
      const listener = (_event: IpcRendererEvent, lifeLog: LifeLog) => {
        callback(lifeLog);
      };
      ipcRenderer.on("lifeLogs:changed", listener);
      return () => {
        ipcRenderer.removeListener("lifeLogs:changed", listener);
      };
    }
  },
  listening: {
    listVideoCandidates: () =>
      ipcRenderer.invoke("listening:listVideoCandidates") as Promise<ListeningVideoCandidate[]>,
    saveVideoCandidate: (input: ListeningVideoCandidateInput) =>
      ipcRenderer.invoke(
        "listening:saveVideoCandidate",
        input
      ) as Promise<ListeningVideoCandidate>,
    markVideoCandidatesLearned: (candidateIds: string[]) =>
      ipcRenderer.invoke(
        "listening:markVideoCandidatesLearned",
        candidateIds
      ) as Promise<ListeningVideoCandidate[]>,
    fetchRssCandidates: (languageCode?: string) =>
      ipcRenderer.invoke(
        "listening:fetchRssCandidates",
        languageCode
      ) as Promise<ListeningVideoCandidate[]>,
    refreshVideoCandidateMetadata: (candidateIds?: string[]) =>
      ipcRenderer.invoke(
        "listening:refreshVideoCandidateMetadata",
        candidateIds
      ) as Promise<ListeningVideoCandidate[]>,
    listTranscripts: () =>
      ipcRenderer.invoke("listening:listTranscripts") as Promise<ListeningTranscript[]>,
    getTranscript: (candidateId: string) =>
      ipcRenderer.invoke("listening:getTranscript", candidateId) as Promise<ListeningTranscript | null>,
    saveTranscript: (transcript: ListeningTranscript) =>
      ipcRenderer.invoke("listening:saveTranscript", transcript) as Promise<ListeningTranscript>,
    generateTranscript: (candidateId: string) =>
      ipcRenderer.invoke(
        "listening:generateTranscript",
        candidateId
      ) as Promise<ListeningTranscriptGenerationResult>,
    pickLocalVideoFile: (folderPath?: string) =>
      ipcRenderer.invoke(
        "listening:pickLocalVideoFile",
        folderPath
      ) as Promise<ListeningLocalVideoFile | null>,
    listLocalVideoFolderVideos: (folderPath: string) =>
      ipcRenderer.invoke(
        "listening:listLocalVideoFolderVideos",
        folderPath
      ) as Promise<ListeningLocalVideoFile[]>,
    getLocalFilePath: (file: File) => webUtils.getPathForFile(file),
    pickLocalVideoFolder: () =>
      ipcRenderer.invoke("listening:pickLocalVideoFolder") as Promise<ListeningLocalVideoFolder | null>,
    prepareLocalVideoFile: (input: ListeningLocalVideoFile) =>
      ipcRenderer.invoke("listening:prepareLocalVideoFile", input) as Promise<ListeningLocalVideoFile>,
    createListeningCardMediaClip: (input: ListeningCardMediaClipInput) =>
      ipcRenderer.invoke(
        "listening:createListeningCardMediaClip",
        input
      ) as Promise<ListeningCardMediaClipResult>,
    extractLocalEmbeddedSubtitle: (input: ListeningLocalTranscriptInput) =>
      ipcRenderer.invoke(
        "listening:extractLocalEmbeddedSubtitle",
        input
      ) as Promise<ListeningTranscriptGenerationResult>,
    generateLocalTranscript: (input: ListeningLocalTranscriptInput) =>
      ipcRenderer.invoke(
        "listening:generateLocalTranscript",
        input
      ) as Promise<ListeningTranscriptGenerationResult>,
    getToolStatus: () =>
      ipcRenderer.invoke("listening:getToolStatus") as Promise<ListeningToolStatus>
  },
  documents: {
    exportBilingualPdf: (input: BilingualPdfExportInput) =>
      ipcRenderer.invoke("documents:exportBilingualPdf", input) as Promise<BilingualPdfExportResult>,
    listExportRecords: (profileId?: ProfileId) =>
      ipcRenderer.invoke(
        "documents:listExportRecords",
        profileId
      ) as Promise<BilingualExportHistoryRecord[]>,
    saveExportRecord: (record: BilingualExportHistoryRecord) =>
      ipcRenderer.invoke(
        "documents:saveExportRecord",
        record
      ) as Promise<BilingualExportHistoryRecord>,
    redownloadExport: (record: BilingualExportHistoryRecord) =>
      ipcRenderer.invoke(
        "documents:redownloadExport",
        record
      ) as Promise<BilingualPdfExportResult>,
    pickReaderArtifact: () =>
      ipcRenderer.invoke("documents:pickReaderArtifact") as Promise<BilingualReaderArtifact | null>,
    readPdfFile: (filePath: string) =>
      ipcRenderer.invoke("documents:readPdfFile", filePath) as Promise<PdfFileReadResult | null>,
    readTextFile: (filePath: string) =>
      ipcRenderer.invoke("documents:readTextFile", filePath) as Promise<TextFileReadResult | null>,
    openPath: (filePath: string) =>
      ipcRenderer.invoke("documents:openPath", filePath) as Promise<boolean>,
    revealPath: (filePath: string) =>
      ipcRenderer.invoke("documents:revealPath", filePath) as Promise<boolean>
  },
  playZone: {
    pickPackFile: () =>
      ipcRenderer.invoke("playZone:pickPackFile") as Promise<PlayZoneLibraryEntry | null>,
    listInstalledPacks: () =>
      ipcRenderer.invoke("playZone:listInstalledPacks") as Promise<PlayZoneLibraryEntry[]>,
    installOfficialPack: (input: { packId: string; requestId: string }) =>
      ipcRenderer.invoke("playZone:installOfficialPack", input) as Promise<PlayZoneLibraryEntry>,
    cancelOfficialPackDownload: (requestId: string) =>
      ipcRenderer.invoke("playZone:cancelOfficialPackDownload", requestId) as Promise<boolean>,
    onOfficialDownloadProgress: (callback: (progress: PlayZoneOfficialDownloadProgress) => void) => {
      const listener = (_event: IpcRendererEvent, progress: PlayZoneOfficialDownloadProgress) => {
        callback(progress);
      };
      ipcRenderer.on("playZone:officialDownloadProgress", listener);
      return () => ipcRenderer.removeListener("playZone:officialDownloadProgress", listener);
    },
    installPack: (input: { sourcePath: string; replaceInstallationId?: string }) =>
      ipcRenderer.invoke("playZone:installPack", input) as Promise<PlayZoneLibraryEntry>,
    scanPackFile: (filePath: string) =>
      ipcRenderer.invoke("playZone:scanPackFile", filePath) as Promise<PlayZoneLibraryEntry>,
    pickLibraryFolder: () =>
      ipcRenderer.invoke("playZone:pickLibraryFolder") as Promise<PlayZoneLibraryScanResult | null>,
    scanLibraryFolder: (folderPath: string) =>
      ipcRenderer.invoke("playZone:scanLibraryFolder", folderPath) as Promise<PlayZoneLibraryScanResult>,
    loadSave: (input: { cartridgeId: string; fallback: unknown }) =>
      ipcRenderer.invoke("playZone:loadSave", input) as Promise<unknown>,
    writeSave: (input: { cartridgeId: string; value: unknown }) =>
      ipcRenderer.invoke("playZone:writeSave", input) as Promise<boolean>,
    clearSave: (input: { cartridgeId: string }) =>
      ipcRenderer.invoke("playZone:clearSave", input) as Promise<boolean>,
    backupSave: (input: { cartridgeId: string }) =>
      ipcRenderer.invoke("playZone:backupSave", input) as Promise<PlayZoneSaveBackupResult>
  },
  translations: {
    getCached: (input: TranslationCacheLookupInput) =>
      ipcRenderer.invoke("translations:getCached", input) as Promise<TranslationCacheEntry | null>,
    saveCached: (input: TranslationCacheLookupInput & { translatedText: string }) =>
      ipcRenderer.invoke("translations:saveCached", input) as Promise<TranslationCacheEntry>,
    getOllamaModelStatus: (input: OllamaModelInput) =>
      ipcRenderer.invoke(
        "translations:getOllamaModelStatus",
        input
      ) as Promise<OllamaModelStatusResult>,
    ensureOllamaRunning: (baseUrl?: string) =>
      ipcRenderer.invoke(
        "translations:ensureOllamaRunning",
        baseUrl
      ) as Promise<EnsureOllamaRuntimeResult>,
    pullOllamaModel: (input: OllamaModelInput) =>
      ipcRenderer.invoke(
        "translations:pullOllamaModel",
        input
      ) as Promise<PullOllamaModelResult>,
    testConnection: (input: TranslationConnectionTestInput) =>
      ipcRenderer.invoke(
        "translations:testConnection",
        input
      ) as Promise<TranslationConnectionTestResult>,
    translate: (input: TranslateTextInput) =>
      ipcRenderer.invoke("translations:translate", input) as Promise<TranslateTextResult>,
    translatePdfSegments: (input: TranslatePdfSegmentsInput) =>
      ipcRenderer.invoke(
        "translations:translatePdfSegments",
        input
      ) as Promise<TranslatePdfSegmentsResult>,
    cancel: (requestId: string) =>
      ipcRenderer.invoke("translations:cancel", requestId) as Promise<boolean>
  },
  tts: {
    synthesize: (input: TtsSynthesisInput) =>
      ipcRenderer.invoke("tts:synthesize", input) as Promise<TtsSynthesisResult>,
    listVoices: () => ipcRenderer.invoke("tts:listVoices") as Promise<TtsVoiceInfo[]>
  },
  ...(qaRuntime
    ? {
        qa: {
          heartbeat: (payload: Record<string, unknown>) =>
            ipcRenderer.invoke("qa:heartbeat", payload) as Promise<boolean>
        }
      }
    : {})
});

function isQaRuntime() {
  return (
    process.env.LM_QA_BOOK_MAKER === "1" ||
    process.env.LM_QA_APP_SMOKE === "1" ||
    process.env.LM_QA_DOC_SCREENSHOTS === "1" ||
    process.env.LM_QA_HOMEPAGE_SCREENSHOTS === "1" ||
    process.env.LM_QA_WEB_READER_POPOVER === "1" ||
    process.env.LM_QA_WEB_READER_LIFE_PROOF === "1"
  );
}

function applyQaSettingsOverride() {
  const rawOverride = process.env.LM_QA_APP_SETTINGS_JSON ?? readQaSettingsOverrideArg();
  if (!rawOverride) {
    return;
  }

  try {
    const previousSettings = localStorage.getItem("lem:settings");
    if (!localStorage.getItem("lem:qa:previousSettings")) {
      localStorage.setItem("lem:qa:previousSettings", previousSettings ?? "__null__");
    }
    const parsedSettings = previousSettings ? JSON.parse(previousSettings) : {};
    const override = JSON.parse(rawOverride);
    localStorage.setItem(
      "lem:settings",
      JSON.stringify({
        ...parsedSettings,
        ...override
      })
    );
  } catch {
    // QA settings injection must never block normal preload API setup.
  }
}

function readQaSettingsOverrideArg() {
  const prefix = "--lm-qa-app-settings=";
  const encoded = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  if (!encoded) {
    return undefined;
  }

  try {
    return Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return undefined;
  }
}
