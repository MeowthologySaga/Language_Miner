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
} from "../shared/types";
import type {
  AppBackupPreview,
  AppBackupRendererSnapshot,
  AppBackupRestoreMode,
  AppBackupRestoreResult
} from "../shared/appBackup";
import type {
  PrivacyDataDeleteRequest,
  PrivacyDataDeleteResult,
  PrivacyRendererCleanupRequest
} from "../shared/privacyData";

export type LocalEnglishMinerApi = {
  app?: {
    markRendererReady?(): Promise<boolean>;
    getRuntimeStatus(): Promise<AppRuntimeStatus>;
    getAppOnboardingCompleted?(): Promise<boolean>;
    completeAppOnboarding?(): Promise<boolean>;
    setLaunchAtLogin(enabled: boolean): Promise<AppRuntimeStatus>;
    openExternalUrl?(url: string): Promise<boolean>;
    openChatGpt?(): Promise<boolean>;
    setPlayerFullscreen?(enabled: boolean): Promise<boolean>;
    setBridgeSettings(settings: {
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
    }): Promise<boolean>;
    openPlayZoneRuntimeWindow?(input: {
      runtimeId: "cartridge";
      cartridgeId: string;
      title: string;
      entryUrl: string;
      walletBalance: number;
      diamondActions: PlayZoneDiamondAction[];
    }): Promise<boolean>;
    onPlayZoneWalletChanged?(callback: () => void): () => void;
    onUsageRecorded?(callback: (event: TranslationUsageEvent) => void): () => void;
  };
  webReader?: {
    attach(input: {
      url: string;
      bounds: { x: number; y: number; width: number; height: number };
    }): Promise<WebReaderBrowserState>;
    setBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<WebReaderBrowserState>;
    setVisible?(visible: boolean): Promise<boolean>;
    loadUrl(url: string): Promise<WebReaderBrowserState>;
    goBack(): Promise<WebReaderBrowserState>;
    goForward(): Promise<WebReaderBrowserState>;
    reload(): Promise<WebReaderBrowserState>;
    getState(): Promise<WebReaderBrowserState>;
    getLifeMiningState(): Promise<WebReaderLifeMiningState>;
    getPageTextSegments?(): Promise<WebReaderPageTextSegments | null>;
    applyPageTranslations?(input: WebReaderPageTranslationApplyInput): Promise<boolean>;
    restorePageTranslations?(): Promise<boolean>;
    getSelection(): Promise<WebReaderBrowserSelection | null>;
    consumePopoverAction?(): Promise<Record<string, unknown> | null>;
    showSelectionPopover?(): Promise<boolean>;
    showPopoverStatus?(input: { state: "ready" | "working" | "ok" | "error"; message?: string }): Promise<boolean>;
    showPopoverResult?(card: unknown): Promise<boolean>;
    hidePopover?(): Promise<boolean>;
    testSelectionPopover?(
      preferredText?: string,
      expectedContext?: string
    ): Promise<Record<string, unknown> | null>;
    testLifeMiningCapture?(): Promise<WebReaderLifeMiningState>;
    captureLifeMiningNow?(): Promise<{
      state: WebReaderLifeMiningState;
      savedCount: number;
      queued: boolean;
      debug: unknown;
    }>;
    detach(): Promise<boolean>;
  };
  profiles?: {
    setActive(profileId: ProfileId): Promise<boolean>;
    getDataSummary(profileId?: ProfileId): Promise<ProfileDataSummary>;
    deleteData(profileId: ProfileId): Promise<ProfileDataDeleteResult>;
  };
  secureSettings?: {
    getStatus(): Promise<SecureSettingsStatus>;
    getForSession(): Promise<{ geminiApiKey: string; googleTranslateApiKey: string }>;
    set(input: { geminiApiKey?: string; googleTranslateApiKey?: string }): Promise<SecureSettingsStatus>;
    migrateLegacy(input: { geminiApiKey?: string; googleTranslateApiKey?: string }): Promise<SecureSettingsStatus>;
  };
  lifeMinerBridge?: {
    getPairingStatus(): Promise<{ paired: boolean; origin: string | null }>;
    rotateToken(): Promise<{ paired: boolean; origin: string | null }>;
    revoke(): Promise<{ paired: boolean; origin: string | null }>;
    forgetUninstalledExtension(input: {
      confirmation: string;
    }): Promise<{ paired: boolean; origin: string | null }>;
  };
  backups?: {
    export(input: {
      renderer: AppBackupRendererSnapshot;
      profileIds: string[];
    }): Promise<{ canceled: boolean; filePath?: string }>;
    previewImport(input: {
      renderer: AppBackupRendererSnapshot;
      profileIds: string[];
    }): Promise<AppBackupPreview | null>;
    restore(input: {
      handleId: string;
      mode: AppBackupRestoreMode;
      currentRenderer: AppBackupRendererSnapshot;
      currentProfileIds: string[];
    }): Promise<AppBackupRestoreResult>;
    rollbackRestore(rollbackHandle: string): Promise<boolean>;
    finalizeRestore(rollbackHandle: string): Promise<boolean>;
  };
  privacy?: {
    deleteData(input: PrivacyDataDeleteRequest): Promise<PrivacyDataDeleteResult>;
    completeRendererCleanup(input: PrivacyRendererCleanupRequest): Promise<PrivacyDataDeleteResult>;
    getDeleteStatus(operationId: string): Promise<PrivacyDataDeleteResult>;
    getPendingDeleteStatus(): Promise<PrivacyDataDeleteResult | null>;
    acknowledgeDeleteResult(operationId: string): Promise<PrivacyDataDeleteResult>;
  };
  desktopCapture?: {
    startOcrCapture(): Promise<boolean>;
    finishOcrSelection(rect: DesktopOcrSelectionRect): Promise<DesktopOcrCaptureResult>;
    cancelOcrSelection(): Promise<boolean>;
    createInputCard(input: DesktopOcrCardInput): Promise<StudyCard>;
  };
  cards: {
    list(profileId?: ProfileId): Promise<StudyCard[]>;
    listPage(profileId?: ProfileId, offset?: number, limit?: number): Promise<CardPageResult>;
    listDue(nowIso?: string, profileId?: ProfileId): Promise<StudyCard[]>;
    save(card: StudyCard, profileId?: ProfileId): Promise<StudyCard>;
    delete(id: string): Promise<boolean>;
    review(cardId: string, rating: ReviewRating): Promise<StudyCard>;
    onChanged?(callback: (card: StudyCard) => void): () => void;
  };
  wallet: {
    get(): Promise<DiamondWallet>;
    listTransactions(): Promise<DiamondTransaction[]>;
    lookupSpend(input: DiamondSpendRequest): Promise<DiamondSpendLookupResult>;
    spend(input: DiamondSpendRequest): Promise<DiamondSpendResult>;
  };
  missions: {
    getToday(profileId?: ProfileId): Promise<DailyMissionBoard>;
    recordEvent(
      event: Omit<LearningMissionEvent, "id" | "dateKey" | "createdAt">
    ): Promise<DailyMissionBoard>;
    claimReward(missionId: DailyMissionId, profileId?: ProfileId): Promise<DailyMissionBoard>;
    claimDailyBonus(profileId?: ProfileId): Promise<DailyMissionBoard>;
  };
  cardSync: {
    status(settings: CardSyncSettings): Promise<CardSyncStatus>;
    connect(settings: CardSyncSettings): Promise<CardSyncStatus>;
    disconnect(): Promise<CardSyncStatus>;
    upload(settings: CardSyncSettings, profileId?: ProfileId): Promise<CardSyncResult>;
    download(settings: CardSyncSettings, profileId?: ProfileId): Promise<CardSyncResult>;
    sync(settings: CardSyncSettings, profileId?: ProfileId): Promise<CardSyncResult>;
  };
  lifeLogs: {
    list(): Promise<LifeLog[]>;
    listPage(offset?: number, limit?: number): Promise<LifeLogPageResult>;
    save(input: Omit<LifeLog, "id" | "processed" | "createdAt">): Promise<LifeLog>;
    markProcessed(id: string, profileId?: ProfileId): Promise<boolean>;
    delete(id: string): Promise<boolean>;
    onChanged?(callback: (lifeLog: LifeLog) => void): () => void;
  };
  listening: {
    listVideoCandidates(): Promise<ListeningVideoCandidate[]>;
    saveVideoCandidate(input: ListeningVideoCandidateInput): Promise<ListeningVideoCandidate>;
    markVideoCandidatesLearned(candidateIds: string[]): Promise<ListeningVideoCandidate[]>;
    fetchRssCandidates(languageCode?: string): Promise<ListeningVideoCandidate[]>;
    refreshVideoCandidateMetadata(candidateIds?: string[]): Promise<ListeningVideoCandidate[]>;
    listTranscripts(): Promise<ListeningTranscript[]>;
    getTranscript(candidateId: string): Promise<ListeningTranscript | null>;
    saveTranscript(transcript: ListeningTranscript): Promise<ListeningTranscript>;
    generateTranscript(candidateId: string): Promise<ListeningTranscriptGenerationResult>;
    pickLocalVideoFile(folderPath?: string): Promise<ListeningLocalVideoFile | null>;
    listLocalVideoFolderVideos(folderPath: string): Promise<ListeningLocalVideoFile[]>;
    getLocalFilePath?(file: File): string;
    pickLocalVideoFolder(): Promise<ListeningLocalVideoFolder | null>;
    prepareLocalVideoFile(input: ListeningLocalVideoFile): Promise<ListeningLocalVideoFile>;
    createListeningCardMediaClip(
      input: ListeningCardMediaClipInput
    ): Promise<ListeningCardMediaClipResult>;
    extractLocalEmbeddedSubtitle(
      input: ListeningLocalTranscriptInput
    ): Promise<ListeningTranscriptGenerationResult>;
    generateLocalTranscript(
      input: ListeningLocalTranscriptInput
    ): Promise<ListeningTranscriptGenerationResult>;
    getToolStatus(): Promise<ListeningToolStatus>;
  };
  documents: {
    exportBilingualPdf(input: BilingualPdfExportInput): Promise<BilingualPdfExportResult>;
    listExportRecords(profileId?: ProfileId): Promise<BilingualExportHistoryRecord[]>;
    saveExportRecord(record: BilingualExportHistoryRecord): Promise<BilingualExportHistoryRecord>;
    redownloadExport(record: BilingualExportHistoryRecord): Promise<BilingualPdfExportResult>;
    pickReaderArtifact(): Promise<BilingualReaderArtifact | null>;
    readPdfFile(filePath: string): Promise<PdfFileReadResult | null>;
    readTextFile(filePath: string): Promise<TextFileReadResult | null>;
    openPath(filePath: string): Promise<boolean>;
    revealPath(filePath: string): Promise<boolean>;
  };
  playZone?: {
    pickPackFile(): Promise<PlayZoneLibraryEntry | null>;
    listInstalledPacks(): Promise<PlayZoneLibraryEntry[]>;
    installOfficialPack(input: { packId: string; requestId: string }): Promise<PlayZoneLibraryEntry>;
    cancelOfficialPackDownload(requestId: string): Promise<boolean>;
    onOfficialDownloadProgress(
      callback: (progress: PlayZoneOfficialDownloadProgress) => void
    ): () => void;
    installPack(input: {
      sourcePath: string;
      replaceInstallationId?: string;
    }): Promise<PlayZoneLibraryEntry>;
    scanPackFile(filePath: string): Promise<PlayZoneLibraryEntry>;
    pickLibraryFolder(): Promise<PlayZoneLibraryScanResult | null>;
    scanLibraryFolder(folderPath: string): Promise<PlayZoneLibraryScanResult>;
    loadSave(input: { cartridgeId: string; fallback: unknown }): Promise<unknown>;
    writeSave(input: { cartridgeId: string; value: unknown }): Promise<boolean>;
    clearSave(input: { cartridgeId: string }): Promise<boolean>;
    backupSave?(input: { cartridgeId: string }): Promise<PlayZoneSaveBackupResult>;
  };
  translations: {
    getCached(input: TranslationCacheLookupInput): Promise<TranslationCacheEntry | null>;
    saveCached(
      input: TranslationCacheLookupInput & { translatedText: string }
    ): Promise<TranslationCacheEntry>;
    getOllamaModelStatus(input: OllamaModelInput): Promise<OllamaModelStatusResult>;
    ensureOllamaRunning(baseUrl?: string): Promise<EnsureOllamaRuntimeResult>;
    pullOllamaModel(input: OllamaModelInput): Promise<PullOllamaModelResult>;
    testConnection(input: TranslationConnectionTestInput): Promise<TranslationConnectionTestResult>;
    translate(input: TranslateTextInput): Promise<TranslateTextResult>;
    translatePdfSegments(input: TranslatePdfSegmentsInput): Promise<TranslatePdfSegmentsResult>;
    cancel(requestId: string): Promise<boolean>;
  };
  tts?: {
    synthesize(input: TtsSynthesisInput): Promise<TtsSynthesisResult>;
    listVoices(): Promise<TtsVoiceInfo[]>;
  };
  qa?: {
    heartbeat(payload: Record<string, unknown>): Promise<boolean>;
  };
};

export type WebReaderBrowserState = {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  innerHeight: number;
  innerWidth: number;
};

export type WebReaderPageTextSegment = {
  id: string;
  text: string;
};

export type WebReaderPageTextSegments = {
  url: string;
  title: string;
  segments: WebReaderPageTextSegment[];
};

export type WebReaderPageTranslationApplyInput = {
  targetLanguageCode: string;
  segments: Array<WebReaderPageTextSegment & { translatedText: string }>;
};

export type WebReaderBrowserSelection = {
  selectedText: string;
  sourceSentence?: string;
  fullText: string;
  selectionOffset?: number;
  title: string;
  url: string;
  rect: {
    left: number;
    top: number;
    right?: number;
    bottom?: number;
    width: number;
    height: number;
  };
};
