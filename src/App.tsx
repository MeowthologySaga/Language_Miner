import {
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Gem,
  GraduationCap,
  ListChecks,
  SkipForward,
  Sparkles,
  X
} from "lucide-react";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { Dialog } from "./components/Dialog";
import { InputLanguageMismatchDialog } from "./components/InputLanguageMismatchDialog";
import { ManualChatGptBridgeDialog } from "./components/ManualChatGptBridgeDialog";
import { getApiClient } from "./data/apiClient";
import {
  finishDailyRoutineStep,
  goToNextDailyRoutineStep,
  goToPreviousDailyRoutineStep,
  reopenSkippedDailyRoutineStep,
  readDailyRoutineRun
} from "./appDailyRoutine";
import {
  readNavSectionExpandedState,
  readSidebarCollapsed,
  writeNavSectionExpandedState,
  writeSidebarCollapsed,
  type NavSectionExpandedState,
  type NavSectionId
} from "./appSidebarState";
import {
  getNavSectionIdForTab,
  getPrimaryNavTab,
  homeNavItem,
  navSectionHasTab,
  navSections,
  routeMeta,
  type NavItem,
  type NavSection,
  type TabKey
} from "./appNavigation";
import {
  ACTIVE_PROFILE_STORAGE_KEY,
  getProfileInitials,
  normalizeProfileRecordForSave,
  PROFILES_STORAGE_KEY,
  readProfiles
} from "./appProfiles";
import {
  applyWebLocalGeminiSettings,
  defaultSettings,
  normalizeAppSettingsForStorage,
  normalizeStoredProviderName,
  readAppSettings
} from "./appSettings";
import {
  AppOnboarding,
  readAppOnboardingCompleted,
  writeAppOnboardingCompleted
} from "./AppOnboarding";
import { resolveAppOnboardingCompletion } from "./appOnboardingCompletion";
import {
  formatElectricityCost,
  formatInteger,
  formatLocalRuntime,
  formatUsageCost,
  formatUsageLimit,
  getUsageLimitChipClassName
} from "./appUsageFormatting";
import {
  createProfiledApi,
  type InputLanguageMismatchDecision,
  type InputLanguageMismatchRequest
} from "./profiledApi";
import { cleanupProfileLocalStorage } from "./profileLocalStorageCleanup";
import { readDismissedDefaultSampleCardIds } from "./defaultSampleCardDismissal";
import {
  getLastReaderArtifactKey,
  getRecentDocumentsKey,
  normalizeRecentDocuments,
  pathsMatch,
  readReaderArtifact,
  readRecentDocuments,
  recentDocumentFromArtifact
} from "./recentDocuments";
import { createProvider } from "./services/llm/providerRegistry";
import { createPrivacyGuardedProvider } from "./services/llm/privacyGuardedProvider";
import type {
  ManualChatGptUiBridge,
  ManualChatGptUiRequest
} from "./services/llm/manualChatGptProvider";
import {
  persistSecureSettingsSafely,
  prepareSecureSettings,
  resolveSecureSettingsHydration,
  settingsForLocalStorage,
  type SecureApiKeys
} from "./secureSettingsPersistence";
import { announceAppRendererReady } from "./startupLifecycle";
import {
  buildDailyMissionBoard,
  getMissionDateKey,
  normalizeDailyMissionBoard
} from "./shared/dailyMissions";
import {
  createDefaultSampleCards,
  DEFAULT_OUTPUT_MOCK_CARD_SEED_VERSION,
  DEFAULT_SAMPLE_CARD_SEED_VERSION,
  getLegacyOutputHealthCardId,
  getLegacyReadingPrototypeCardId
} from "./shared/defaultSampleCards";
import {
  createDailyRoutineRun,
  getCurrentRoutineStep,
  getDailyRoutineProgress,
  getDailyRoutineStorageKey,
  type DailyRoutineRun,
  type DailyRoutineStep,
  type DailyRoutineStepId
} from "./shared/dailyRoutine";
import { formatCompactNumber } from "./shared/translationUsage";
import {
  DEFAULT_PROFILE_ID,
  localizeBuiltInProfileNames,
  normalizeActiveProfileId
} from "./shared/profiles";
import { SettingsProfileSwitcher } from "./pages/SettingsProfileSwitcher";
import { createProfilePreset } from "./pages/settingsPageUtils";
import type { SettingsTabId } from "./pages/settingsPageOptions";
import type {
  AppSettings,
  BilingualReaderArtifact,
  DailyMissionBoard,
  DailyMissionId,
  DiamondWallet,
  LifeLog,
  LearningProfileRecord,
  ProfileLanguage,
  ProfileId,
  RecentDocumentRecord,
  StudyCard
} from "./shared/types";
import {
  recordTranslationUsageEvent,
  summarizeAppTranslationUsage,
  type TranslationUsageLedgerSummary,
  usageUpdatedEventName
} from "./utils/translationUsageLedger";
import { createUsageTrackedProvider } from "./utils/llmUsageTracking";
import { readRendererCloudProviderConsent } from "./shared/cloudProviderConsent";
import type {
  PrivacyDataDeleteResult,
  PrivacyDataDeleteTarget
} from "./shared/privacyData";
import {
  canApplySecureSettingsWrite,
  getRendererPrivacyResetPlan,
  nextSecureSettingsWriteRevision,
  privacyTargetDeletesApiKeys,
  privacyTargetDeletesLearningData,
  rendererPrivacyLifecycle,
  zeroizeRendererApiKeys
} from "./rendererPrivacyLifecycle";

type WebReaderOpenUrlRequest = {
  requestId: number;
  url: string;
  label?: string;
};

type PendingManualChatGptRequest = {
  request: ManualChatGptUiRequest;
  resolve: (response: string) => void;
  reject: (error: Error) => void;
  cleanup: () => void;
};

const BilingualBookMakerPage = lazy(() =>
  import("./pages/BilingualBookMakerPage").then((module) => ({
    default: module.BilingualBookMakerPage
  }))
);
const CardsPage = lazy(() =>
  import("./pages/CardsPage").then((module) => ({ default: module.CardsPage }))
);
const CharacterChatPage = lazy(() =>
  import("./pages/CharacterChatPage").then((module) => ({ default: module.CharacterChatPage }))
);
const GlossaryPage = lazy(() =>
  import("./pages/GlossaryPage").then((module) => ({ default: module.GlossaryPage }))
);
const LifeMiningPage = lazy(() =>
  import("./pages/LifeMiningPage").then((module) => ({ default: module.LifeMiningPage }))
);
const ListeningLoopPage = lazy(() =>
  import("./pages/ListeningLoopPage").then((module) => ({ default: module.ListeningLoopPage }))
);
const PdfHubPage = lazy(() =>
  import("./pages/PdfHubPage").then((module) => ({ default: module.PdfHubPage }))
);
const PdfReaderPage = lazy(() =>
  import("./pages/PdfReaderPage").then((module) => ({ default: module.PdfReaderPage }))
);
const PlayZonePage = lazy(() =>
  import("./pages/PlayZonePage").then((module) => ({ default: module.PlayZonePage }))
);
const PlayZoneRuntimePage = lazy(() =>
  import("./pages/PlayZoneRuntimePage").then((module) => ({
    default: module.PlayZoneRuntimePage
  }))
);
const ReviewPage = lazy(() =>
  import("./pages/ReviewPage").then((module) => ({ default: module.ReviewPage }))
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage }))
);
const TutorialPage = lazy(() =>
  import("./pages/TutorialPage").then((module) => ({ default: module.TutorialPage }))
);
const VideoReaderPage = lazy(() =>
  import("./pages/VideoReaderPage").then((module) => ({ default: module.VideoReaderPage }))
);
const WebReaderPage = lazy(() =>
  import("./pages/WebReaderPage").then((module) => ({ default: module.WebReaderPage }))
);
const WritingPracticePage = lazy(() =>
  import("./pages/WritingPracticePage").then((module) => ({ default: module.WritingPracticePage }))
);

type ProfileStats = Record<
  ProfileId,
  {
    cardCount: number;
    dueCount: number;
  }
>;

type DailyRewardEffect = {
  id: number;
  amount: number;
  label: string;
};

type BootstrapState = "loading" | "ready" | "error";

type RendererPrivacyOperation = {
  epoch: number;
  target: PrivacyDataDeleteTarget;
};

const defaultDiamondWallet: DiamondWallet = {
  balance: 0,
  totalEarned: 0,
  totalSpent: 0,
  updatedAt: new Date().toISOString()
};

function getLocalizedLanguageName(language: ProfileLanguage, locale: string) {
  return locale.toLowerCase().startsWith("en") ? language.nameEn : language.nameKo;
}

function getDefaultSampleCardSeedKey(profileId: ProfileId) {
  return `lem:defaultSampleCards:v${DEFAULT_SAMPLE_CARD_SEED_VERSION}:${profileId}`;
}

function getDefaultOutputMockCardSeedKey(profileId: ProfileId) {
  return `lem:defaultOutputMockCards:v${DEFAULT_OUTPUT_MOCK_CARD_SEED_VERSION}:${profileId}`;
}

function readLegacyApiKeys(fallback: SecureApiKeys): SecureApiKeys {
  try {
    const stored = JSON.parse(localStorage.getItem("lem:settings") ?? "{}") as Partial<SecureApiKeys>;
    return {
      geminiApiKey:
        typeof stored.geminiApiKey === "string" ? stored.geminiApiKey : fallback.geminiApiKey,
      googleTranslateApiKey:
        typeof stored.googleTranslateApiKey === "string"
          ? stored.googleTranslateApiKey
          : fallback.googleTranslateApiKey
    };
  } catch {
    return fallback;
  }
}

function isPlayZoneRuntimeWindow() {
  if (typeof window === "undefined") {
    return false;
  }
  return new URLSearchParams(window.location.search).has("playZoneRuntime");
}

export default function App() {
  const { t } = useTranslation();
  if (isPlayZoneRuntimeWindow()) {
    return (
      <Suspense fallback={<div className="app-loading">{t("app.gameLoading")}</div>}>
        <PlayZoneRuntimePage />
      </Suspense>
    );
  }

  return <MainApp />;
}

function MainApp() {
  const { i18n, t } = useTranslation();
  const appUsageLocale = (i18n.resolvedLanguage ?? i18n.language).startsWith("en")
    ? "en"
    : "ko";
  const api = useMemo(() => getApiClient(), []);
  const [privacyStartupCheckComplete, setPrivacyStartupCheckComplete] = useState(
    () => !api.privacy?.getPendingDeleteStatus
  );
  const mainContentRef = useRef<HTMLElement>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("pdfHub");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(readSidebarCollapsed);
  const [expandedNavSections, setExpandedNavSections] = useState(readNavSectionExpandedState);
  const [shouldKeepBookMakerMounted, setShouldKeepBookMakerMounted] = useState(false);
  const [isSidebarProfileSwitcherOpen, setIsSidebarProfileSwitcherOpen] = useState(false);
  const [isTutorialStartConfirmOpen, setIsTutorialStartConfirmOpen] = useState(false);
  const [inputLanguageMismatchRequest, setInputLanguageMismatchRequest] = useState<
    (InputLanguageMismatchRequest & {
      resolve: (decision: InputLanguageMismatchDecision) => void;
    }) | null
  >(null);
  const inputLanguageMismatchRequestRef = useRef<
    (InputLanguageMismatchRequest & {
      resolve: (decision: InputLanguageMismatchDecision) => void;
    }) | null
  >(null);
  const [pendingManualChatGptRequest, setPendingManualChatGptRequest] =
    useState<PendingManualChatGptRequest | null>(null);
  const pendingManualChatGptRequestRef = useRef<PendingManualChatGptRequest | null>(null);
  const [profileManagerOpenRequest, setProfileManagerOpenRequest] = useState(0);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTabId | null>(null);
  const [webReaderOpenUrlRequest, setWebReaderOpenUrlRequest] =
    useState<WebReaderOpenUrlRequest | null>(null);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [isOnboardingResolved, setIsOnboardingResolved] = useState(false);
  const [cards, setCards] = useState<StudyCard[]>([]);
  const [lifeLogs, setLifeLogs] = useState<LifeLog[]>([]);
  const [settings, setSettings] = useState<AppSettings>(readAppSettings);
  const [profiles, setProfiles] = useState<LearningProfileRecord[]>(() =>
    readProfiles(settings.learningProfile, appUsageLocale)
  );
  const [activeProfileId, setActiveProfileId] = useState<ProfileId>(() =>
    normalizeActiveProfileId(localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY), profiles)
  );
  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0],
    [activeProfileId, profiles]
  );

  useEffect(() => {
    setProfiles((current) => {
      const localized = localizeBuiltInProfileNames(current, appUsageLocale);
      if (localized === current) {
        return current;
      }
      localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(localized));
      return localized;
    });
  }, [appUsageLocale]);

  useEffect(() => {
    if (!privacyStartupCheckComplete) return;
    let cancelled = false;
    const onboardingEpoch = rendererPrivacyLifecycle.captureEpoch();
    const localCompletion = readAppOnboardingCompleted();
    const readHostCompletion = api.app?.getAppOnboardingCompleted;

    if (!readHostCompletion) {
      const resolution = resolveAppOnboardingCompletion(localCompletion, null);
      setIsOnboardingOpen(resolution.shouldOpen);
      setIsOnboardingResolved(true);
      return undefined;
    }

    void readHostCompletion()
      .then((hostCompletion) => {
        if (cancelled || !rendererPrivacyLifecycle.canCommit(onboardingEpoch)) return;
        const resolution = resolveAppOnboardingCompletion(localCompletion, hostCompletion);
        setIsOnboardingOpen(resolution.shouldOpen);
        setIsOnboardingResolved(true);
        if (resolution.shouldBackfillHost) {
          void api.app?.completeAppOnboarding?.().catch(() => undefined);
        }
      })
      .catch(() => {
        if (!cancelled && rendererPrivacyLifecycle.canCommit(onboardingEpoch)) {
          const resolution = resolveAppOnboardingCompletion(localCompletion, null);
          setIsOnboardingOpen(resolution.shouldOpen);
          setIsOnboardingResolved(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [api.app, privacyStartupCheckComplete]);
  const activeSettings = useMemo<AppSettings>(
    () =>
      applyWebLocalGeminiSettings({
        ...settings,
        profileId: activeProfile?.id ?? DEFAULT_PROFILE_ID,
        learningProfile: activeProfile?.learningProfile ?? settings.learningProfile
      }),
    [activeProfile, settings]
  );
  const switchToLanguageProfile = useCallback(
    (languageCode: string) => {
      const normalizedLanguageCode = languageCode.trim().toLowerCase().split("-")[0];
      const matchingProfile = profiles.find(
        (profile) =>
          profile.learningProfile.targetLanguage.code.trim().toLowerCase().split("-")[0] ===
          normalizedLanguageCode
      );
      if (!matchingProfile) {
        return false;
      }
      const normalizedProfileId = normalizeActiveProfileId(matchingProfile.id, profiles);
      setActiveProfileId(normalizedProfileId);
      localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, normalizedProfileId);
      return normalizedProfileId === matchingProfile.id;
    },
    [profiles]
  );
  const resolveInputLanguageMismatch = useCallback(
    (request: InputLanguageMismatchRequest) => {
      if (inputLanguageMismatchRequestRef.current) {
        return Promise.resolve<InputLanguageMismatchDecision>("cancel");
      }
      return new Promise<InputLanguageMismatchDecision>((resolve) => {
        const pending = { ...request, resolve };
        inputLanguageMismatchRequestRef.current = pending;
        setInputLanguageMismatchRequest(pending);
      });
    },
    []
  );
  const finishInputLanguageMismatch = useCallback(
    (decision: InputLanguageMismatchDecision) => {
      const pending = inputLanguageMismatchRequestRef.current;
      if (!pending) return;
      inputLanguageMismatchRequestRef.current = null;
      setInputLanguageMismatchRequest(null);
      pending.resolve(decision);
    },
    []
  );
  useEffect(
    () => () => {
      inputLanguageMismatchRequestRef.current?.resolve("cancel");
      inputLanguageMismatchRequestRef.current = null;
    },
    []
  );
  const profiledApi = useMemo(
    () =>
      createProfiledApi(api, activeSettings.profileId, activeSettings, {
        switchToLanguageProfile,
        resolveInputLanguageMismatch
      }),
    [activeSettings, api, resolveInputLanguageMismatch, switchToLanguageProfile]
  );
  const [recentDocuments, setRecentDocuments] = useState<RecentDocumentRecord[]>(() =>
    readRecentDocuments(activeProfileId)
  );
  const [readerArtifact, setReaderArtifact] = useState<BilingualReaderArtifact | null>(() =>
    readReaderArtifact(activeProfileId)
  );
  const [profileStats, setProfileStats] = useState<ProfileStats>({});
  const [diamondWallet, setDiamondWallet] = useState<DiamondWallet>(defaultDiamondWallet);
  const [dailyMissionBoard, setDailyMissionBoard] = useState<DailyMissionBoard>(() =>
    buildDailyMissionBoard(getMissionDateKey(), [])
  );
  const [dailyRoutineRun, setDailyRoutineRun] = useState<DailyRoutineRun | null>(null);
  const [dismissedDailyRoutineRunnerId, setDismissedDailyRoutineRunnerId] = useState("");
  const [dailyRewardEffect, setDailyRewardEffect] = useState<DailyRewardEffect | null>(null);
  const [usageSummary, setUsageSummary] = useState<TranslationUsageLedgerSummary>(() =>
    summarizeAppTranslationUsage(defaultSettings)
  );
  const [bootstrapState, setBootstrapState] = useState<BootstrapState>("loading");
  const [bootstrapError, setBootstrapError] = useState("");
  const [bootstrapRetryRequest, setBootstrapRetryRequest] = useState(0);
  const [writingPracticeFocus, setWritingPracticeFocus] = useState<{
    cardId: string;
    promptIndex: number;
    requestId: number;
  } | null>(null);
  const startupCardSyncCompletedKey = useRef("");
  const startupCardSyncPendingKey = useRef("");
  const secureSettingsHydratedRef = useRef(false);
  const secureSettingsAvailableRef = useRef(false);
  const secureSettingsWriteRevisionRef = useRef(0);
  const secureSettingsWriteQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingPrivacyResumeStartedRef = useRef(false);
  const rendererPrivacyOperationRef = useRef<RendererPrivacyOperation | null>(null);
  const [rendererPrivacyOperation, setRendererPrivacyOperation] =
    useState<RendererPrivacyOperation | null>(null);
  const rendererEpochAtRender = rendererPrivacyLifecycle.captureEpoch();

  useEffect(() => {
    if (!isOnboardingResolved || bootstrapState === "loading") return;
    announceAppRendererReady();
  }, [bootstrapState, isOnboardingResolved]);

  const requestManualChatGptResponse = useCallback<ManualChatGptUiBridge>(
    (request) =>
      new Promise<string>((resolve, reject) => {
        if (!privacyStartupCheckComplete || rendererPrivacyOperationRef.current) {
          reject(createManualChatGptAbortError(t("manualChatGptBridge.cancelled")));
          return;
        }
        if (pendingManualChatGptRequestRef.current) {
          reject(new Error(t("manualChatGptBridge.busy")));
          return;
        }
        if (request.signal?.aborted) {
          reject(createManualChatGptAbortError(t("manualChatGptBridge.cancelled")));
          return;
        }

        let pending: PendingManualChatGptRequest;
        const handleAbort = () => {
          if (pendingManualChatGptRequestRef.current !== pending) return;
          pending.cleanup();
          pendingManualChatGptRequestRef.current = null;
          setPendingManualChatGptRequest(null);
          reject(createManualChatGptAbortError(t("manualChatGptBridge.cancelled")));
        };
        pending = {
          request,
          resolve,
          reject,
          cleanup: () => request.signal?.removeEventListener("abort", handleAbort)
        };
        request.signal?.addEventListener("abort", handleAbort, { once: true });
        pendingManualChatGptRequestRef.current = pending;
        setPendingManualChatGptRequest(pending);
      }),
    [privacyStartupCheckComplete, t]
  );

  const finishManualChatGptResponse = useCallback(
    (response: string) => {
      const pending = pendingManualChatGptRequestRef.current;
      if (!pending) return t("manualChatGptBridge.invalidResponse");
      try {
        pending.request.validateResponse(response);
      } catch (caught) {
        const detail = caught instanceof Error ? caught.message : String(caught);
        return `${t("manualChatGptBridge.invalidResponse")} ${detail}`;
      }
      pending.cleanup();
      pendingManualChatGptRequestRef.current = null;
      setPendingManualChatGptRequest(null);
      pending.resolve(response);
      return null;
    },
    [t]
  );

  const cancelManualChatGptResponse = useCallback(() => {
    const pending = pendingManualChatGptRequestRef.current;
    if (!pending) return;
    pending.cleanup();
    pendingManualChatGptRequestRef.current = null;
    setPendingManualChatGptRequest(null);
    pending.reject(createManualChatGptAbortError(t("manualChatGptBridge.cancelled")));
  }, [t]);

  useEffect(
    () => () => {
      const pending = pendingManualChatGptRequestRef.current;
      if (!pending) return;
      pending.cleanup();
      pendingManualChatGptRequestRef.current = null;
      pending.reject(createManualChatGptAbortError("Language Miner closed the manual ChatGPT bridge."));
    },
    []
  );

  async function beginRendererPrivacyDelete(target: PrivacyDataDeleteTarget) {
    const existingOperation = rendererPrivacyOperationRef.current;
    if (existingOperation) {
      return;
    }

    const epoch = rendererPrivacyLifecycle.begin(target);
    const operation = { epoch, target };
    rendererPrivacyOperationRef.current = operation;
    setRendererPrivacyOperation(operation);
    setShouldKeepBookMakerMounted(false);
    setWritingPracticeFocus(null);

    const pendingManualRequest = pendingManualChatGptRequestRef.current;
    if (pendingManualRequest) {
      pendingManualRequest.cleanup();
      pendingManualChatGptRequestRef.current = null;
      setPendingManualChatGptRequest(null);
      pendingManualRequest.reject(
        createManualChatGptAbortError(t("manualChatGptBridge.cancelled"))
      );
    }

    let invalidatedSecureSettingsQueue: Promise<void> | null = null;
    if (privacyTargetDeletesApiKeys(target)) {
      secureSettingsWriteRevisionRef.current = nextSecureSettingsWriteRevision(
        secureSettingsWriteRevisionRef.current
      );
      secureSettingsHydratedRef.current = true;
      invalidatedSecureSettingsQueue = secureSettingsWriteQueueRef.current;
      const zeroized = zeroizeRendererApiKeys(settings);
      writeSettingsToLocalStorage(zeroized);
      setSettings(zeroized);
    }

    if (privacyTargetDeletesLearningData(target)) {
      setCards([]);
      setLifeLogs([]);
      setRecentDocuments([]);
      setReaderArtifact(null);
      setDailyRoutineRun(null);
      setWritingPracticeFocus(null);
      setProfileStats({});
      setDiamondWallet(defaultDiamondWallet);
      setDailyMissionBoard(buildDailyMissionBoard(getMissionDateKey(), []));
    }
    setBootstrapState("ready");

    if (invalidatedSecureSettingsQueue) {
      await invalidatedSecureSettingsQueue.catch(() => undefined);
    }
    await waitForRendererPrivacyUnmount();
  }

  function finishRendererPrivacyDelete(result: PrivacyDataDeleteResult) {
    const operation = rendererPrivacyOperationRef.current;
    if (!operation || operation.target !== result.target) {
      return;
    }

    const resetPlan = getRendererPrivacyResetPlan(
      result.target,
      result.operations.rendererStorage,
      result.phase
    );
    if (resetPlan.clearLearningState) {
      setCards([]);
      setLifeLogs([]);
      setRecentDocuments([]);
      setReaderArtifact(null);
      setDailyRoutineRun(null);
      setWritingPracticeFocus(null);
      setProfileStats({});
      setDiamondWallet(defaultDiamondWallet);
      setDailyMissionBoard(buildDailyMissionBoard(getMissionDateKey(), []));
      setDailyRewardEffect(null);
      setUsageSummary(
        summarizeAppTranslationUsage(zeroizeRendererApiKeys(activeSettings))
      );
      setBootstrapError("");
      setBootstrapState("ready");
    }

    if (resetPlan.resetApplicationState) {
      const freshSettings = zeroizeRendererApiKeys(readAppSettings());
      const freshProfiles = readProfiles(freshSettings.learningProfile, appUsageLocale);
      const freshActiveProfileId = normalizeActiveProfileId(null, freshProfiles);
      secureSettingsHydratedRef.current = true;
      setSettings(freshSettings);
      setUsageSummary(summarizeAppTranslationUsage(freshSettings));
      setProfiles(freshProfiles);
      setActiveProfileId(freshActiveProfileId);
      setRecentDocuments(readRecentDocuments(freshActiveProfileId));
      setReaderArtifact(readReaderArtifact(freshActiveProfileId));
      setIsSidebarProfileSwitcherOpen(false);
      setIsSidebarCollapsed(readSidebarCollapsed());
      setExpandedNavSections(readNavSectionExpandedState());
      if (resetPlan.openFreshOnboarding) {
        setIsOnboardingOpen(true);
        setIsOnboardingResolved(true);
      }
    }

    if (result.phase === "pending" || result.rendererResetRequired) {
      return;
    }
    rendererPrivacyLifecycle.finish();
    rendererPrivacyOperationRef.current = null;
    setRendererPrivacyOperation(null);
  }

  function failRendererPrivacyDelete(target: PrivacyDataDeleteTarget) {
    const operation = rendererPrivacyOperationRef.current;
    if (!operation || operation.target !== target) {
      return;
    }
    rendererPrivacyLifecycle.finish();
    rendererPrivacyOperationRef.current = null;
    setRendererPrivacyOperation(null);
  }

  useEffect(() => {
    const privacyApi = api.privacy;
    if (!privacyApi?.getPendingDeleteStatus || pendingPrivacyResumeStartedRef.current) {
      return;
    }
    pendingPrivacyResumeStartedRef.current = true;
    let active = true;
    void (async () => {
      try {
        let pending = await privacyApi.getPendingDeleteStatus();
        if (!active) return;
        if (!pending?.operationId) {
          setPrivacyStartupCheckComplete(true);
          return;
        }
        setActiveTab("settings");
        await beginRendererPrivacyDelete(pending.target);
        if (!active) return;
        setPrivacyStartupCheckComplete(true);
        if (!pending.rendererResetRequired) {
          pending = await privacyApi.getDeleteStatus(pending.operationId);
          if (pending.phase !== "pending" && !pending.rendererResetRequired) {
            pending = await privacyApi.acknowledgeDeleteResult(pending.operationId!);
          }
          if (active) finishRendererPrivacyDelete(pending);
        }
      } catch {
        if (active) setPrivacyStartupCheckComplete(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [api.privacy]);

  const rawProvider = useMemo(
    () => createProvider(activeSettings, { manualChatGptBridge: requestManualChatGptResponse }),
    [activeSettings, requestManualChatGptResponse]
  );
  const provider = useMemo(
    () => createUsageTrackedProvider(createPrivacyGuardedProvider(rawProvider), activeSettings),
    [activeSettings, rawProvider]
  );
  const providerDisplayName = t(
    `app.providers.${normalizeStoredProviderName(activeSettings.providerName)}`
  );
  const currentRoutineStep = useMemo(
    () => getCurrentRoutineStep(dailyRoutineRun),
    [dailyRoutineRun]
  );
  const dailyRoutineProgress = useMemo(
    () => getDailyRoutineProgress(dailyRoutineRun),
    [dailyRoutineRun]
  );

  const handleBookMakerKeepAliveChange = useCallback((shouldKeepAlive: boolean) => {
    setShouldKeepBookMakerMounted(shouldKeepAlive);
  }, []);

  useEffect(() => {
    const sectionId = getNavSectionIdForTab(activeTab);
    if (!sectionId) {
      return;
    }
    setExpandedNavSections((previous) => {
      if (previous[sectionId]) {
        return previous;
      }
      const next = { ...previous, [sectionId]: true };
      writeNavSectionExpandedState(next);
      return next;
    });
  }, [activeTab]);

  function toggleSidebarCollapsed() {
    setIsSidebarCollapsed((previous) => {
      const next = !previous;
      writeSidebarCollapsed(next);
      return next;
    });
  }

  function toggleNavSection(sectionId: NavSectionId) {
    setExpandedNavSections((previous) => {
      const next = { ...previous, [sectionId]: !previous[sectionId] };
      writeNavSectionExpandedState(next);
      return next;
    });
  }

  async function loadCards() {
    const epoch = rendererPrivacyLifecycle.captureEpoch();
    if (rendererPrivacyLifecycle.isBlocked()) return;
    const loadedCards = await profiledApi.cards.list();
    if (!rendererPrivacyLifecycle.canCommit(epoch)) return;
    const withSamples = await ensureDefaultSampleCards(loadedCards, epoch);
    if (rendererPrivacyLifecycle.canCommit(epoch)) setCards(withSamples);
  }

  async function loadLifeLogs() {
    const epoch = rendererPrivacyLifecycle.captureEpoch();
    if (rendererPrivacyLifecycle.isBlocked()) return;
    const nextLifeLogs = await api.lifeLogs.list();
    if (rendererPrivacyLifecycle.canCommit(epoch)) setLifeLogs(nextLifeLogs);
  }

  async function ensureDefaultSampleCards(loadedCards: StudyCard[], epoch: number) {
    const profileId = activeSettings.profileId;
    const seedKey = getDefaultSampleCardSeedKey(profileId);
    const outputMockSeedKey = getDefaultOutputMockCardSeedKey(profileId);
    const dismissedSampleIds = readDismissedDefaultSampleCardIds(localStorage, profileId);
    const samples = createDefaultSampleCards(profileId).filter(
      (sample) => !dismissedSampleIds.has(sample.id)
    );
    const shouldSeedDefaultSamples = localStorage.getItem(seedKey) !== "1";
    const shouldSeedOutputMocks = localStorage.getItem(outputMockSeedKey) !== "1";
    const legacyReadingPrototypeId = getLegacyReadingPrototypeCardId(profileId);
    const legacyOutputHealthId = getLegacyOutputHealthCardId(profileId);
    const legacySampleIds = new Set([legacyReadingPrototypeId, legacyOutputHealthId]);
    const legacyIdsToRemove = loadedCards
      .map((card) => card.id)
      .filter((cardId) => legacySampleIds.has(cardId));

    for (const legacyId of legacyIdsToRemove) {
      if (!rendererPrivacyLifecycle.canCommit(epoch)) return loadedCards;
      await profiledApi.cards.delete(legacyId);
    }

    const currentCards = legacyIdsToRemove.length
      ? loadedCards.filter((card) => !legacySampleIds.has(card.id))
      : loadedCards;
    const currentCardIds = new Set(currentCards.map((card) => card.id));
    const hasMissingFinalSamples = samples.some((sample) => !currentCardIds.has(sample.id));

    if (shouldSeedDefaultSamples || shouldSeedOutputMocks || hasMissingFinalSamples) {
      const samplesToSave = samples.filter((sample) => {
        const isMissing = !currentCardIds.has(sample.id);
        const shouldRefreshFinalSample = shouldSeedDefaultSamples;

        return shouldRefreshFinalSample || isMissing;
      });

      for (const sample of samplesToSave) {
        if (!rendererPrivacyLifecycle.canCommit(epoch)) return currentCards;
        await profiledApi.cards.save(sample);
      }
      if (!rendererPrivacyLifecycle.canCommit(epoch)) return currentCards;
      localStorage.setItem(seedKey, "1");
      localStorage.setItem(outputMockSeedKey, "1");
      return samplesToSave.length || legacyIdsToRemove.length
        ? profiledApi.cards.list()
        : currentCards;
    }
    return legacyIdsToRemove.length ? profiledApi.cards.list() : currentCards;
  }

  async function handleCardsChanged() {
    await loadCards();
    await loadEconomy();
  }

  function startWritingPracticeFromCard(card: StudyCard, promptIndex = 0) {
    setWritingPracticeFocus({
      cardId: card.id,
      promptIndex,
      requestId: Date.now()
    });
    setActiveTab("writingPractice");
  }

  function clearWritingPracticeFocus() {
    setWritingPracticeFocus(null);
  }

  async function loadEconomy() {
    const epoch = rendererPrivacyLifecycle.captureEpoch();
    if (rendererPrivacyLifecycle.isBlocked()) return;
    const [wallet, missionBoard] = await Promise.all([
      profiledApi.wallet.get(),
      profiledApi.missions.getToday()
    ]);
    if (rendererPrivacyLifecycle.canCommit(epoch)) {
      setDiamondWallet(wallet);
      setDailyMissionBoard(normalizeDailyMissionBoard(missionBoard));
    }
  }

  function showDailyRewardEffect(amount: number, label: string) {
    if (amount <= 0) {
      return;
    }
    setDailyRewardEffect({
      id: Date.now(),
      amount,
      label
    });
  }

  const dismissDailyRewardEffect = useCallback((effectId: number) => {
    setDailyRewardEffect((current) => (current?.id === effectId ? null : current));
  }, []);

  async function claimMissionReward(missionId: DailyMissionId) {
    const normalizedBoard = normalizeDailyMissionBoard(dailyMissionBoard);
    const rewardMission = normalizedBoard.missions.find((mission) => mission.id === missionId);
    const board = normalizeDailyMissionBoard(await profiledApi.missions.claimReward(missionId));
    setDailyMissionBoard(board);
    setDiamondWallet(await profiledApi.wallet.get());
    if (rewardMission) {
      showDailyRewardEffect(rewardMission.rewardDiamonds, rewardMission.title);
    }
  }

  async function claimDailyBonus() {
    const rewardBonus = normalizeDailyMissionBoard(dailyMissionBoard).bonus;
    const board = normalizeDailyMissionBoard(await profiledApi.missions.claimDailyBonus());
    setDailyMissionBoard(board);
    setDiamondWallet(await profiledApi.wallet.get());
    showDailyRewardEffect(rewardBonus.rewardDiamonds, rewardBonus.title);
  }

  function persistDailyRoutineRun(run: DailyRoutineRun | null) {
    setDailyRoutineRun(run);
    if (!run) {
      localStorage.removeItem(getDailyRoutineStorageKey(activeSettings.profileId));
      return;
    }
    localStorage.setItem(getDailyRoutineStorageKey(activeSettings.profileId), JSON.stringify(run));
  }

  function navigateToRoutineStep(step: DailyRoutineStep | null) {
    if (!step) {
      setActiveTab("pdfHub");
      return;
    }
    setActiveTab(step.route);
  }

  function startDailyRoutine() {
    const run = createDailyRoutineRun(getMissionDateKey(), activeSettings.profileId);
    setDismissedDailyRoutineRunnerId("");
    persistDailyRoutineRun(run);
    navigateToRoutineStep(getCurrentRoutineStep(run));
  }

  function resumeDailyRoutine() {
    if (!dailyRoutineRun || dailyRoutineRun.status === "completed") {
      startDailyRoutine();
      return;
    }

    const now = new Date().toISOString();
    const currentStep = getCurrentRoutineStep(dailyRoutineRun);
    const nextRun: DailyRoutineRun = {
      ...dailyRoutineRun,
      status: "running",
      updatedAt: now,
      steps: dailyRoutineRun.steps.map((step) =>
        step.id === currentStep?.id
          ? {
              ...step,
              status: "running",
              startedAt: step.startedAt ?? now
            }
          : step
      )
    };
    persistDailyRoutineRun(nextRun);
    navigateToRoutineStep(getCurrentRoutineStep(nextRun));
  }

  async function completeDailyRoutineStep() {
    if (!dailyRoutineRun || dailyRoutineRun.status === "completed") {
      return;
    }

    const currentStep = getCurrentRoutineStep(dailyRoutineRun);
    if (currentStep?.id === "claim-rewards") {
      await claimAvailableRoutineRewards();
    }

    const nextRun = finishDailyRoutineStep(dailyRoutineRun, "completed");
    persistDailyRoutineRun(nextRun);
    navigateToRoutineStep(nextRun.status === "completed" ? null : getCurrentRoutineStep(nextRun));
  }

  function skipDailyRoutineStep() {
    if (!dailyRoutineRun || dailyRoutineRun.status === "completed") {
      return;
    }
    const currentStep = getCurrentRoutineStep(dailyRoutineRun);
    const nextRun =
      currentStep?.status === "completed"
        ? goToNextDailyRoutineStep(dailyRoutineRun)
        : finishDailyRoutineStep(dailyRoutineRun, "skipped");
    persistDailyRoutineRun(nextRun);
    navigateToRoutineStep(nextRun.status === "completed" ? null : getCurrentRoutineStep(nextRun));
  }

  function goToPreviousDailyRoutineStepFromRunner() {
    if (!dailyRoutineRun || dailyRoutineRun.status === "completed") {
      return;
    }
    const nextRun = goToPreviousDailyRoutineStep(dailyRoutineRun);
    persistDailyRoutineRun(nextRun);
    navigateToRoutineStep(getCurrentRoutineStep(nextRun));
  }

  function reopenSkippedDailyRoutine(stepId: DailyRoutineStepId) {
    if (!dailyRoutineRun) {
      return;
    }
    const nextRun = reopenSkippedDailyRoutineStep(dailyRoutineRun, stepId);
    persistDailyRoutineRun(nextRun);
    navigateToRoutineStep(getCurrentRoutineStep(nextRun));
  }

  async function claimAvailableRoutineRewards() {
    let board = normalizeDailyMissionBoard(await profiledApi.missions.getToday());
    let claimedRewardAmount = 0;
    let claimedRewardCount = 0;
    let lastRewardLabel = "";
    for (const mission of board.missions) {
      if (mission.claimable) {
        claimedRewardAmount += mission.rewardDiamonds;
        claimedRewardCount += 1;
        lastRewardLabel = mission.title;
        board = normalizeDailyMissionBoard(await profiledApi.missions.claimReward(mission.id));
      }
    }
    if (board.bonus.claimable) {
      claimedRewardAmount += board.bonus.rewardDiamonds;
      claimedRewardCount += 1;
      lastRewardLabel = board.bonus.title;
      board = normalizeDailyMissionBoard(await profiledApi.missions.claimDailyBonus());
    }
    setDailyMissionBoard(board);
    setDiamondWallet(await profiledApi.wallet.get());
    if (claimedRewardAmount > 0) {
      showDailyRewardEffect(
        claimedRewardAmount,
        claimedRewardCount > 1
          ? t("app.reward.multiple", { count: claimedRewardCount })
          : lastRewardLabel
      );
    }
  }

  async function loadProfileStats(nextProfiles = profiles) {
    const epoch = rendererPrivacyLifecycle.captureEpoch();
    if (rendererPrivacyLifecycle.isBlocked()) return;
    if (api.profiles?.getDataSummary) {
      const summaries = await Promise.all(
        nextProfiles.map((profile) => api.profiles!.getDataSummary(profile.id))
      );
      if (rendererPrivacyLifecycle.canCommit(epoch)) {
        setProfileStats(
          Object.fromEntries(
            summaries.map((summary) => [
              summary.profileId,
              {
                cardCount: summary.cardCount,
                dueCount: summary.dueCardCount
              }
            ])
          )
        );
      }
      return;
    }

    const now = Date.now();
    const entries = await Promise.all(
      nextProfiles.map(async (profile) => {
        const profileCards = await api.cards.list(profile.id);
        return [
          profile.id,
          {
            cardCount: profileCards.length,
            dueCount: profileCards.filter((card) => {
              const dueTime = new Date(card.srs.dueAt).getTime();
              return Number.isFinite(dueTime) && dueTime <= now;
            }).length
          }
        ] as const;
      })
    );
    if (rendererPrivacyLifecycle.canCommit(epoch)) {
      setProfileStats(Object.fromEntries(entries));
    }
  }

  function writeSettingsToLocalStorage(
    value: AppSettings,
    encryptionAvailable = secureSettingsAvailableRef.current
  ) {
    localStorage.setItem(
      "lem:settings",
      JSON.stringify(settingsForLocalStorage(value, encryptionAvailable))
    );
  }

  function enqueueSecureSettingsWrite(value: AppSettings, revision: number) {
    const client = api.secureSettings;
    if (!client) {
      writeSettingsToLocalStorage(value, false);
      return;
    }

    secureSettingsWriteQueueRef.current = secureSettingsWriteQueueRef.current
      .then(async () => {
        if (!canApplySecureSettingsWrite(revision, secureSettingsWriteRevisionRef.current)) {
          return;
        }
        const result = await persistSecureSettingsSafely(client, value);
        if (!canApplySecureSettingsWrite(revision, secureSettingsWriteRevisionRef.current)) {
          return;
        }
        if (result.encryptionSucceeded) {
          secureSettingsAvailableRef.current = true;
          writeSettingsToLocalStorage(result.localValue, true);
          return;
        }
        secureSettingsAvailableRef.current = false;
        writeSettingsToLocalStorage(result.localValue, false);
        console.error(t("app.secureStorageSessionOnly"));
      })
      .catch(() => {
        console.error(t("app.secureStorageWriteError"));
      });
  }

  function updateSettings(next: AppSettings) {
    if (
      rendererPrivacyOperationRef.current ||
      rendererEpochAtRender !== rendererPrivacyLifecycle.captureEpoch()
    ) {
      return;
    }
    const normalizedNext = normalizeAppSettingsForStorage(next, activeSettings.profileId);
    const revision = nextSecureSettingsWriteRevision(secureSettingsWriteRevisionRef.current);
    secureSettingsWriteRevisionRef.current = revision;
    const secureKeysChanged =
      normalizedNext.geminiApiKey !== activeSettings.geminiApiKey ||
      normalizedNext.googleTranslateApiKey !== activeSettings.googleTranslateApiKey;
    setSettings(normalizedNext);
    if (
      api.secureSettings &&
      (secureSettingsAvailableRef.current || secureKeysChanged)
    ) {
      enqueueSecureSettingsWrite(normalizedNext, revision);
    } else {
      writeSettingsToLocalStorage(normalizedNext, false);
    }
    if (!areLearningProfilesEquivalent(
      normalizedNext.learningProfile,
      activeSettings.learningProfile
    )) {
      updateActiveProfileLanguage(normalizedNext.learningProfile);
    }
  }

  function persistProfiles(nextProfiles: LearningProfileRecord[]) {
    const normalized = nextProfiles.length > 0 ? nextProfiles : profiles;
    setProfiles(normalized);
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(normalized));
  }

  function createProfile(profile: LearningProfileRecord) {
    const normalized = normalizeProfileRecordForSave(
      profile,
      profiles,
      t("settings.profile.defaultName", { index: profiles.length + 1 })
    );
    const nextProfiles = [...profiles, normalized];
    persistProfiles(nextProfiles);
    selectProfile(normalized.id, nextProfiles);
  }

  function updateProfile(profile: LearningProfileRecord) {
    const profileIndex = Math.max(0, profiles.findIndex((candidate) => candidate.id === profile.id));
    const normalized = normalizeProfileRecordForSave(
      profile,
      profiles,
      t("settings.profile.defaultName", { index: profileIndex + 1 }),
      profile.id
    );
    const nextProfiles = profiles.map((candidate) =>
      candidate.id === normalized.id ? normalized : candidate
    );
    persistProfiles(nextProfiles);
    if (normalized.id === activeProfileId) {
      const nextSettings = {
        ...settings,
        profileId: normalized.id,
        learningProfile: normalized.learningProfile
      };
      setSettings(nextSettings);
      writeSettingsToLocalStorage(nextSettings);
    }
  }

  async function deleteProfile(profileId: ProfileId) {
    if (profiles.length <= 1 || profileId === DEFAULT_PROFILE_ID) {
      return;
    }
    const nextProfiles = profiles.filter((profile) => profile.id !== profileId);
    if (nextProfiles.length === profiles.length) {
      return;
    }

    if (!api.profiles?.deleteData) {
      throw new Error(t("app.deleteProfileUnavailable"));
    }
    await api.profiles.deleteData(profileId);

    cleanupProfileLocalStorage(profileId);
    persistProfiles(nextProfiles);
    if (activeProfileId === profileId) {
      selectProfile(nextProfiles[0].id, nextProfiles);
    }
  }

  function updateRecentDocuments(next: RecentDocumentRecord[]) {
    const normalized = normalizeRecentDocuments(next, activeSettings.profileId);
    setRecentDocuments(normalized);
    localStorage.setItem(getRecentDocumentsKey(activeSettings.profileId), JSON.stringify(normalized));
  }

  function rememberRecentDocument(
    artifact: BilingualReaderArtifact,
    source: RecentDocumentRecord["source"] = "reader"
  ) {
    const now = new Date().toISOString();
    const record = recentDocumentFromArtifact(artifact, source, now, activeSettings.profileId);
    setRecentDocuments((previous) => {
      const next = [
        record,
        ...previous.filter(
          (candidate) =>
            !pathsMatch(candidate.filePath, record.filePath) || candidate.fileType !== record.fileType
        )
      ].slice(0, 50);
      localStorage.setItem(getRecentDocumentsKey(activeSettings.profileId), JSON.stringify(next));
      return next;
    });
  }

  function openReaderArtifact(
    artifact: BilingualReaderArtifact,
    source: RecentDocumentRecord["source"] = "reader"
  ) {
    const profiledArtifact = {
      ...artifact,
      profileId: activeSettings.profileId
    };
    setReaderArtifact(profiledArtifact);
    localStorage.setItem(getLastReaderArtifactKey(activeSettings.profileId), JSON.stringify(profiledArtifact));
    rememberRecentDocument(profiledArtifact, source);
    setActiveTab("pdfReader");
  }

  function updateActiveProfileLanguage(learningProfile: AppSettings["learningProfile"]) {
    setProfiles((previous) => {
      const activeProfile = previous.find((profile) => profile.id === activeSettings.profileId);
      if (
        !activeProfile ||
        areLearningProfilesEquivalent(activeProfile.learningProfile, learningProfile)
      ) {
        return previous;
      }
      const now = new Date().toISOString();
      const nextProfiles = previous.map((profile) =>
        profile.id === activeSettings.profileId
          ? {
              ...profile,
              learningProfile,
              updatedAt: now
            }
          : profile
      );
      localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(nextProfiles));
      return nextProfiles;
    });
  }

  function selectProfile(profileId: ProfileId, availableProfiles = profiles) {
    const normalized = normalizeActiveProfileId(profileId, availableProfiles);
    setActiveProfileId(normalized);
    localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, normalized);
  }

  function selectProfileFromSidebar(profileId: ProfileId) {
    selectProfile(profileId);
    setIsSidebarProfileSwitcherOpen(false);
  }

  function createProfileFromSidebar() {
    const nextIndex = profiles.length + 1;
    const profile = createProfilePreset(
      nextIndex,
      activeSettings,
      t("settings.profile.defaultName", { index: nextIndex })
    );
    createProfile(profile);
    setIsSidebarProfileSwitcherOpen(false);
    navigateToTab("settings");
    setProfileManagerOpenRequest((request) => request + 1);
  }

  function openProfileManagerFromSidebar() {
    setIsSidebarProfileSwitcherOpen(false);
    navigateToTab("settings");
    setProfileManagerOpenRequest((request) => request + 1);
  }

  useEffect(() => {
    if (
      !privacyStartupCheckComplete ||
      !api.secureSettings ||
      secureSettingsHydratedRef.current ||
      rendererPrivacyOperationRef.current
    ) {
      return;
    }
    secureSettingsHydratedRef.current = true;
    const hydrationEpoch = rendererPrivacyLifecycle.captureEpoch();
    void (async () => {
      try {
        const migrationStartRevision = secureSettingsWriteRevisionRef.current;
        const prepared = await prepareSecureSettings(
          api.secureSettings!,
          () => readLegacyApiKeys(readAppSettings())
        );
        if (!rendererPrivacyLifecycle.canCommit(hydrationEpoch)) return;
        if (!prepared.available) {
          writeSettingsToLocalStorage(readAppSettings(), false);
          return;
        }
        const migrationEndRevision = secureSettingsWriteRevisionRef.current;
        const settingsChangedDuringMigration = migrationEndRevision !== migrationStartRevision;
        secureSettingsAvailableRef.current = true;
        if (settingsChangedDuringMigration) {
          await secureSettingsWriteQueueRef.current;
        }
        if (!rendererPrivacyLifecycle.canCommit(hydrationEpoch)) return;
        const latestSessionKeys = settingsChangedDuringMigration
          ? await api.secureSettings!.getForSession()
          : null;
        if (!rendererPrivacyLifecycle.canCommit(hydrationEpoch)) return;
        const hydratedKeys = resolveSecureSettingsHydration(
          prepared.sessionKeys,
          latestSessionKeys
        );
        setSettings((previous) => ({
          ...previous,
          geminiApiKey: hydratedKeys.geminiApiKey,
          googleTranslateApiKey: hydratedKeys.googleTranslateApiKey
        }));
        if (!settingsChangedDuringMigration) {
          writeSettingsToLocalStorage(readAppSettings(), true);
        }
      } catch {
        if (!rendererPrivacyLifecycle.canCommit(hydrationEpoch)) return;
        secureSettingsAvailableRef.current = false;
        secureSettingsHydratedRef.current = false;
        writeSettingsToLocalStorage(readAppSettings(), false);
        console.error(t("app.secureStorageLoadError"));
      }
    })();
  }, [api.secureSettings, privacyStartupCheckComplete]);

  useEffect(() => {
    let cancelled = false;
    const epoch = rendererPrivacyLifecycle.captureEpoch();
    if (!privacyStartupCheckComplete || rendererPrivacyOperationRef.current) return undefined;
    setBootstrapState("loading");
    setBootstrapError("");

    void Promise.all([loadCards(), loadLifeLogs(), loadEconomy()])
      .then(() => {
        if (!cancelled && rendererPrivacyLifecycle.canCommit(epoch)) {
          setBootstrapState("ready");
        }
      })
      .catch(() => {
        if (cancelled || !rendererPrivacyLifecycle.canCommit(epoch)) {
          return;
        }
        setBootstrapError(t("app.bootstrap.fallbackError"));
        setBootstrapState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeSettings.profileId,
    api,
    bootstrapRetryRequest,
    privacyStartupCheckComplete,
    rendererPrivacyOperation
  ]);

  useEffect(() => {
    if (!privacyStartupCheckComplete || rendererPrivacyOperationRef.current) return;
    setDailyRoutineRun(readDailyRoutineRun(activeSettings.profileId));
    setDismissedDailyRoutineRunnerId("");
  }, [activeSettings.profileId, rendererPrivacyOperation]);

  useEffect(() => {
    if (!privacyStartupCheckComplete || rendererPrivacyOperationRef.current) return;
    void loadProfileStats().catch(() => {
      console.warn(t("app.profileStatsLoadError"));
    });
  }, [api, cards, privacyStartupCheckComplete, profiles, rendererPrivacyOperation]);

  useEffect(() => {
    if (!privacyStartupCheckComplete || rendererPrivacyOperationRef.current) return;
    localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, activeSettings.profileId);
    void api.profiles?.setActive(activeSettings.profileId);
    setRecentDocuments(readRecentDocuments(activeSettings.profileId));
    setReaderArtifact(readReaderArtifact(activeSettings.profileId));
    setSettings((previous) => {
      const next = {
        ...previous,
        profileId: activeSettings.profileId,
        learningProfile: activeSettings.learningProfile
      };
      writeSettingsToLocalStorage(next);
      return next;
    });
  }, [
    activeSettings.learningProfile,
    activeSettings.profileId,
    api,
    privacyStartupCheckComplete,
    rendererPrivacyOperation
  ]);

  useEffect(() => {
    window.scrollTo({ left: 0, top: 0 });
    const frame = window.requestAnimationFrame(() => {
      mainContentRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab]);

  useEffect(() => {
    if (!isSidebarProfileSwitcherOpen) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsSidebarProfileSwitcherOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSidebarProfileSwitcherOpen]);

  useEffect(() => {
    if (activeTab === "webReader") {
      return;
    }
    void api.webReader?.detach?.();
  }, [activeTab, api.webReader]);

  useEffect(() => {
    if (!privacyStartupCheckComplete || rendererPrivacyOperationRef.current) return;
    void api.app?.setBridgeSettings({
      appLocale: (i18n.resolvedLanguage ?? i18n.language).startsWith("en") ? "en" : "ko",
      browserCaptureSiteSettings: activeSettings.browserCaptureSiteSettings,
      lifeMiningCaptureSettings: activeSettings.lifeMiningCaptureSettings,
      captureShortcut: activeSettings.captureShortcut,
      browserSelectionCardMode: activeSettings.browserSelectionCardMode,
      providerName: activeSettings.providerName,
      ollamaBaseUrl: activeSettings.ollamaBaseUrl,
      ollamaModel: activeSettings.ollamaModel,
      geminiApiKey: activeSettings.geminiApiKey,
      geminiModel: activeSettings.geminiModel,
      geminiPlan: activeSettings.geminiPlan,
      cloudConsent: readRendererCloudProviderConsent("gemini") ?? undefined,
      learningProfile: activeSettings.learningProfile,
      dailyAppTokenLimit: activeSettings.dailyAppTokenLimit,
      monthlySpendLimitKrw: activeSettings.monthlySpendLimitKrw,
      stopOnFreeTierLimit: activeSettings.stopOnFreeTierLimit,
      stopOnMonthlyLimit: activeSettings.stopOnMonthlyLimit,
      usageSummary: {
        todayTokens: usageSummary.todayTokens,
        monthCostKrw: usageSummary.monthCostKrw
      },
      cardSyncFolderPath: activeSettings.cardSyncFolderPath,
      cardSyncOnQuit: activeSettings.cardSyncOnQuit
    });
  }, [
    activeSettings.browserCaptureSiteSettings,
    activeSettings.lifeMiningCaptureSettings,
    activeSettings.captureShortcut,
    activeSettings.browserSelectionCardMode,
    activeSettings.geminiApiKey,
    activeSettings.geminiModel,
    activeSettings.geminiPlan,
    activeSettings.learningProfile,
    activeSettings.dailyAppTokenLimit,
    activeSettings.monthlySpendLimitKrw,
    activeSettings.stopOnFreeTierLimit,
    activeSettings.stopOnMonthlyLimit,
    usageSummary.todayTokens,
    usageSummary.monthCostKrw,
    activeSettings.cardSyncFolderPath,
    activeSettings.cardSyncOnQuit,
    activeSettings.ollamaBaseUrl,
    activeSettings.ollamaModel,
    activeSettings.providerName,
    i18n.language,
    i18n.resolvedLanguage,
    api,
    privacyStartupCheckComplete,
    rendererPrivacyOperation
  ]);

  useEffect(() => {
    if (!privacyStartupCheckComplete || rendererPrivacyOperationRef.current) return undefined;
    const folderPath = activeSettings.cardSyncFolderPath.trim();
    if (!activeSettings.cardSyncOnStartup || !folderPath) {
      return undefined;
    }

    const syncKey = `${activeSettings.profileId}\0${folderPath}`;
    if (
      startupCardSyncCompletedKey.current === syncKey ||
      startupCardSyncPendingKey.current === syncKey
    ) {
      return undefined;
    }

    startupCardSyncPendingKey.current = syncKey;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await profiledApi.cardSync.sync({ folderPath });
          await handleCardsChanged();
          startupCardSyncCompletedKey.current = syncKey;
        } catch {
          console.warn(t("app.startupSyncError"));
        } finally {
          if (startupCardSyncPendingKey.current === syncKey) {
            startupCardSyncPendingKey.current = "";
          }
        }
      })();
    }, 2500);

    return () => {
      window.clearTimeout(timer);
      if (startupCardSyncPendingKey.current === syncKey) {
        startupCardSyncPendingKey.current = "";
      }
    };
  }, [
    activeSettings.cardSyncFolderPath,
    activeSettings.cardSyncOnStartup,
    activeSettings.profileId,
    privacyStartupCheckComplete,
    profiledApi,
    rendererPrivacyOperation
  ]);

  useEffect(() => {
    if (!privacyStartupCheckComplete) return undefined;
    const unsubscribe = api.lifeLogs.onChanged?.(() => {
      if (rendererPrivacyOperationRef.current) return;
      void loadLifeLogs();
    });
    return () => {
      unsubscribe?.();
    };
  }, [api, privacyStartupCheckComplete, profiledApi]);

  useEffect(() => {
    if (!privacyStartupCheckComplete) return undefined;
    const unsubscribe = api.cards.onChanged?.(() => {
      if (rendererPrivacyOperationRef.current) return;
      void handleCardsChanged();
    });
    return () => {
      unsubscribe?.();
    };
  }, [api, privacyStartupCheckComplete, profiledApi]);

  useEffect(() => {
    if (rendererPrivacyOperationRef.current) return undefined;
    function refreshUsageSummary() {
      setUsageSummary(summarizeAppTranslationUsage(activeSettings));
    }

    refreshUsageSummary();
    window.addEventListener(usageUpdatedEventName, refreshUsageSummary);
    return () => {
      window.removeEventListener(usageUpdatedEventName, refreshUsageSummary);
    };
  }, [activeSettings, rendererPrivacyOperation]);

  useEffect(() => {
    return api.app?.onUsageRecorded?.((event) => {
      if (rendererPrivacyOperationRef.current) return;
      recordTranslationUsageEvent(event);
    });
  }, [api]);

  useEffect(() => {
    return api.app?.onPlayZoneWalletChanged?.(() => {
      if (rendererPrivacyOperationRef.current) return;
      void loadEconomy();
    });
  }, [api, profiledApi]);

  const ActiveIcon = routeMeta[activeTab].icon;
  const SidebarToggleIcon = isSidebarCollapsed ? ChevronsRight : ChevronsLeft;
  const isSidebarHidden = Boolean(activeSettings.labsHideSidebarNavigation);
  const isGlossaryNavigationHidden = Boolean(activeSettings.labsHideGlossaryNavigation);
  const shellClassName = [
    "app-shell",
    isSidebarCollapsed ? "sidebar-collapsed" : "",
    isSidebarHidden ? "sidebar-hidden" : ""
  ]
    .filter(Boolean)
    .join(" ");
  const navigateToTab = (tab: TabKey) => {
    if (rendererPrivacyOperationRef.current && tab !== "settings") {
      return;
    }
    if (tab === "tutorial" && activeTab !== "tutorial") {
      setIsTutorialStartConfirmOpen(true);
      return;
    }
    setActiveTab(tab);
  };
  const cancelTutorialStart = () => {
    setIsTutorialStartConfirmOpen(false);
  };
  const confirmTutorialStart = () => {
    setIsTutorialStartConfirmOpen(false);
    setActiveTab("tutorial");
  };
  const closeOnboarding = async () => {
    writeAppOnboardingCompleted();
    try {
      await api.app?.completeAppOnboarding?.();
    } catch {
      // localStorage remains the browser fallback if the desktop persistence bridge fails.
    } finally {
      setIsOnboardingOpen(false);
    }
  };
  const skipOnboarding = async (nextSettings: AppSettings) => {
    updateSettings(nextSettings);
    await closeOnboarding();
  };
  const completeOnboarding = async (nextSettings: AppSettings) => {
    updateSettings(nextSettings);
    await closeOnboarding();
  };
  const openSettingsFromOnboarding = async (nextSettings: AppSettings) => {
    updateSettings(nextSettings);
    await closeOnboarding();
    setSettingsInitialTab("ai");
    navigateToTab("settings");
  };
  const consumeSettingsInitialTab = useCallback(() => {
    setSettingsInitialTab(null);
  }, []);
  const openWebReaderUrl = (url: string, label?: string) => {
    setWebReaderOpenUrlRequest({
      requestId: Date.now(),
      url,
      label
    });
    setActiveTab("webReader");
  };
  const isNavItemVisible = (item: NavItem) =>
    !(isGlossaryNavigationHidden && item.key === "glossary");
  const renderNavButton = (groupTitle: string, item: NavItem) => {
    const meta = routeMeta[item.key];
    const Icon = item.icon ?? meta.icon;
    const label = t(item.labelKey ?? meta.labelKey);
    const primaryActiveTab = getPrimaryNavTab(activeTab);
    return (
      <button
        key={`${groupTitle}-${item.key}-${label}`}
        className={primaryActiveTab === item.key ? "active" : ""}
        data-qa={`nav-${item.key}`}
        title={label}
        type="button"
        aria-current={primaryActiveTab === item.key ? "page" : undefined}
        aria-pressed={primaryActiveTab === item.key}
        aria-expanded={item.key === "tutorial" ? isTutorialStartConfirmOpen : undefined}
        aria-haspopup={item.key === "tutorial" ? "dialog" : undefined}
        onClick={() => navigateToTab(item.key)}
      >
        <Icon size={18} />
        <span className="nav-item-label">{label}</span>
      </button>
    );
  };
  const renderNavSection = (section: NavSection) => {
    const SectionIcon = section.icon;
    const sectionTitle = t(section.titleKey);
    const isExpanded = expandedNavSections[section.id];
    const visibleGroups = section.groups
      ?.map((group) => ({
        ...group,
        items: group.items.filter(isNavItemVisible)
      }))
      .filter((group) => group.items.length > 0);
    const visibleItems = section.items?.filter(isNavItemVisible);
    const visibleSection: NavSection = {
      ...section,
      groups: visibleGroups,
      items: visibleItems
    };
    const isActive = navSectionHasTab(visibleSection, activeTab);
    if (section.directKey) {
      const directKey = section.directKey;
      return (
        <section
          className={`nav-section nav-section-${section.id} nav-section-direct${
            isActive ? " active" : ""
          }`}
          key={section.id}
        >
          <button
            className={isActive ? "nav-section-toggle active" : "nav-section-toggle"}
            data-qa={`nav-${directKey}`}
            title={sectionTitle}
            type="button"
            aria-current={isActive ? "page" : undefined}
            aria-pressed={isActive}
            onClick={() => navigateToTab(directKey)}
          >
            <SectionIcon size={18} />
            <span className="nav-section-title">{sectionTitle}</span>
          </button>
        </section>
      );
    }

    return (
      <section
        className={
          isExpanded
            ? `nav-section nav-section-${section.id} expanded`
            : `nav-section nav-section-${section.id}`
        }
        key={section.id}
      >
        <button
          aria-expanded={isExpanded}
          className={isActive ? "nav-section-toggle active" : "nav-section-toggle"}
          data-qa={`nav-section-${section.id}`}
          title={sectionTitle}
          type="button"
          onClick={() => toggleNavSection(section.id)}
        >
          <SectionIcon size={18} />
          <span className="nav-section-title">{sectionTitle}</span>
          <ChevronDown className="nav-section-chevron" size={16} />
        </button>
        <div className="nav-section-body" hidden={!isExpanded}>
          {visibleGroups?.map((group) => (
            <div className="nav-subgroup" key={`${section.id}-${group.title}`}>
              <span className="nav-subgroup-title">{t(group.titleKey)}</span>
              {group.items.map((item) => renderNavButton(t(group.titleKey), item))}
            </div>
          ))}
          {visibleItems?.map((item) => renderNavButton(sectionTitle, item))}
        </div>
      </section>
    );
  };

  return (
    <div className={shellClassName}>
      <a className="skip-link" href="#app-main-content">
        {t("app.skipToContent")}
      </a>
      {isSidebarHidden ? (
        <button
          aria-label={t("app.navigation.restore")}
          className="icon-button sidebar-restore-button"
          title={t("app.navigation.restore")}
          type="button"
          onClick={() => updateSettings({ ...activeSettings, labsHideSidebarNavigation: false })}
        >
          <ChevronsRight size={16} />
          <span>{t("app.navigation.restoreShort")}</span>
        </button>
      ) : null}
      <aside className="app-sidebar">
        <div className="sidebar-top">
          <div className="brand-block">
            <div className="brand-mark">LM</div>
            <div className="brand-copy">
              <strong className="brand-name">Language Miner</strong>
              <p>{providerDisplayName}</p>
            </div>
          </div>
          <button
            aria-label={
              isSidebarCollapsed ? t("app.navigation.expand") : t("app.navigation.collapse")
            }
            className="icon-button sidebar-collapse-button"
            title={
              isSidebarCollapsed ? t("app.navigation.expand") : t("app.navigation.collapse")
            }
            type="button"
            onClick={toggleSidebarCollapsed}
          >
            <SidebarToggleIcon size={16} />
          </button>
        </div>
        <div className="profile-switcher">
          <label>{t("app.profile.label")}</label>
          <button
            aria-expanded={isSidebarProfileSwitcherOpen}
            aria-haspopup="dialog"
            className="profile-summary-button"
            type="button"
            onClick={() => setIsSidebarProfileSwitcherOpen(true)}
          >
            <span className="profile-avatar">{getProfileInitials(activeProfile)}</span>
            <span>
              <strong>{activeProfile?.name ?? t("app.profile.fallbackName")}</strong>
              <small>
                {t("app.profile.languageSummary", {
                  target: getLocalizedLanguageName(
                    activeSettings.learningProfile.targetLanguage,
                    i18n.resolvedLanguage ?? i18n.language
                  ),
                  native: getLocalizedLanguageName(
                    activeSettings.learningProfile.nativeLanguage,
                    i18n.resolvedLanguage ?? i18n.language
                  )
                })}
              </small>
            </span>
          </button>
        </div>
        <nav className="tab-nav" aria-label={t("app.navigation.primaryLabel")}>
          <div className="nav-home">{renderNavButton("home", homeNavItem)}</div>
          {navSections
            .filter((section) => section.id !== "manage")
            .map((section) => renderNavSection(section))}
          {navSections
            .filter((section) => section.id === "manage")
            .map((section) => renderNavSection(section))}
        </nav>
        <button
          className="sidebar-usage-card"
          type="button"
          onClick={() => navigateToTab("settings")}
        >
          <div className="sidebar-estimate-box sidebar-combined-estimate">
            <div className="sidebar-combined-head">
              <span>{t("app.usage.todayEstimate")}</span>
            </div>
            <div className="sidebar-usage-breakdown">
              <div className="sidebar-usage-row api">
                <span>API</span>
                <strong>{formatUsageCost(usageSummary.todayCostKrw, appUsageLocale)}</strong>
                <small>
                  {formatCompactNumber(usageSummary.todayTokens)} tokens ·{" "}
                  {t("app.usage.requests", { count: usageSummary.todayRequestCount })}
                </small>
              </div>
              <div className="sidebar-usage-row electricity">
                <span>{t("app.usage.electricity")}</span>
                <strong>
                  {formatElectricityCost(
                    usageSummary.todayLocalElectricityKrw,
                    appUsageLocale
                  )}
                </strong>
                <small>
                  {t("app.usage.localRuntime", {
                    runtime: formatLocalRuntime(
                      usageSummary.todayLocalRuntimeMinutes,
                      appUsageLocale
                    )
                  })}
                </small>
              </div>
            </div>
            <div className="sidebar-month-lines">
              <span>
                {t("app.usage.apiMonthly", {
                  used: formatUsageCost(usageSummary.monthCostKrw, appUsageLocale),
                  limit: formatUsageLimit(usageSummary.monthlyLimitKrw, appUsageLocale)
                })}
              </span>
              <span>
                {t("app.usage.electricityMonthly", {
                  cost: formatElectricityCost(
                    usageSummary.monthLocalElectricityKrw,
                    appUsageLocale
                  )
                })}
              </span>
            </div>
            <span className={getUsageLimitChipClassName(usageSummary.monthlySpendPercent)}>
              {t("app.usage.guardPercent", {
                percent: Math.round(usageSummary.monthlySpendPercent)
              })}
            </span>
          </div>
        </button>
      </aside>

      <main
        ref={mainContentRef}
        aria-label={t(routeMeta[activeTab].labelKey)}
        className="app-main"
        id="app-main-content"
        tabIndex={-1}
      >
        {activeTab !== "webReader" ? (
          <header className="topbar">
            <div className="topbar-title">
              <ActiveIcon size={20} />
              <span>{t(routeMeta[activeTab].labelKey)}</span>
            </div>
            <div className="topbar-stats">
              <span className="diamond-balance">
                <Gem size={15} />
                {t("app.stats.diamonds", {
                  value: formatInteger(diamondWallet.balance, appUsageLocale)
                })}
              </span>
              <span>{t("app.stats.cards", { count: cards.length })}</span>
              <span>{t("app.stats.logs", { count: lifeLogs.length })}</span>
            </div>
          </header>
        ) : null}

        {dailyRoutineRun &&
        dailyRoutineRun.status !== "completed" &&
        dismissedDailyRoutineRunnerId !== dailyRoutineRun.id ? (
          <DailyRoutineRunner
            currentStep={currentRoutineStep}
            progress={dailyRoutineProgress}
            run={dailyRoutineRun}
            onCompleteStep={() => void completeDailyRoutineStep()}
            onDismiss={() => setDismissedDailyRoutineRunnerId(dailyRoutineRun.id)}
            onOpenStep={() => navigateToRoutineStep(currentRoutineStep)}
            onPreviousStep={goToPreviousDailyRoutineStepFromRunner}
            onReopenSkippedStep={reopenSkippedDailyRoutine}
            onSkipStep={skipDailyRoutineStep}
          />
        ) : null}

        {bootstrapState === "loading" ? (
          <section className="app-bootstrap-state" role="status" aria-live="polite">
            <strong>{t("app.bootstrap.loadingTitle")}</strong>
            <p>{t("app.bootstrap.loadingDescription")}</p>
          </section>
        ) : bootstrapState === "error" ? (
          <section className="app-bootstrap-state is-error" role="alert">
            <strong>{t("app.bootstrap.errorTitle")}</strong>
            <p>{bootstrapError}</p>
            <button
              className="button primary"
              type="button"
              onClick={() => setBootstrapRetryRequest((request) => request + 1)}
            >
              {t("common.retry")}
            </button>
          </section>
        ) : (
          <AppErrorBoundary resetKey={activeTab} title={t("app.routeError")}>
            <Suspense
              fallback={
                <div className="route-loading" role="status" aria-live="polite">
                  {t("app.routeLoading")}
                </div>
              }
            >
        {activeTab === "pdfHub" ? (
          <PdfHubPage
            cards={cards}
            lifeLogs={lifeLogs}
            missionBoard={dailyMissionBoard}
            profileId={activeSettings.profileId}
            routineCurrentStep={currentRoutineStep}
            routineProgress={dailyRoutineProgress}
            routineRun={dailyRoutineRun}
            wallet={diamondWallet}
            onClaimDailyBonus={claimDailyBonus}
            onClaimMission={claimMissionReward}
            onNavigate={setActiveTab}
            onResumeRoutine={resumeDailyRoutine}
            onStartRoutine={startDailyRoutine}
          />
        ) : null}
        {activeTab === "pdfReader" || activeTab === "documentLibrary" || activeTab === "bookmarks" ? (
          <PdfReaderPage
            api={profiledApi}
            artifact={readerArtifact}
            initialPane={
              activeTab === "documentLibrary"
                ? "library"
                : activeTab === "bookmarks"
                  ? "bookmarks"
                  : "reader"
            }
            provider={provider}
            recentDocuments={recentDocuments}
            settings={activeSettings}
            onCardsChanged={handleCardsChanged}
            onNavigate={(route) => setActiveTab(route)}
            onOpenReaderArtifact={openReaderArtifact}
            onRecentDocumentsChange={updateRecentDocuments}
            onSettingsChange={updateSettings}
          />
        ) : null}
        {activeTab === "webReader" ? (
          <WebReaderPage
            api={profiledApi}
            openUrlRequest={webReaderOpenUrlRequest}
            provider={provider}
            sidebarOverlayOpen={false}
            settings={activeSettings}
            onCardsChanged={handleCardsChanged}
            onLifeLogsChanged={loadLifeLogs}
            onSettingsChange={updateSettings}
            onSwitchToLanguageProfile={switchToLanguageProfile}
          />
        ) : null}
        {activeTab === "bookMaker" || activeTab === "exportHistory" || shouldKeepBookMakerMounted ? (
          <div
            aria-hidden={activeTab !== "bookMaker" && activeTab !== "exportHistory"}
            className={
              activeTab === "bookMaker" || activeTab === "exportHistory"
                ? "route-keepalive active"
                : "route-keepalive"
            }
          >
            <BilingualBookMakerPage
              api={profiledApi}
              initialPane={activeTab === "exportHistory" ? "history" : "maker"}
              settings={activeSettings}
              onKeepAliveChange={handleBookMakerKeepAliveChange}
              onNavigate={(route) => setActiveTab(route)}
              onOpenReaderArtifact={openReaderArtifact}
              onSettingsChange={updateSettings}
            />
          </div>
        ) : null}
        {activeTab === "glossary" ? (
          <GlossaryPage cards={cards} onNavigate={(route) => setActiveTab(route)} />
        ) : null}
        {activeTab === "cards" ? (
          <CardsPage
            api={profiledApi}
            cards={cards}
            settings={activeSettings}
            onCardsChanged={handleCardsChanged}
            onNavigate={(route) => setActiveTab(route)}
            onSettingsChange={updateSettings}
            onStartWritingPractice={startWritingPracticeFromCard}
          />
        ) : null}
        {activeTab === "playZone" ? <PlayZonePage walletBalance={diamondWallet.balance} /> : null}
        {activeTab === "characterChat" ? (
          <CharacterChatPage
            api={profiledApi}
            cards={cards}
            provider={provider}
            settings={activeSettings}
            onLifeLogsChanged={loadLifeLogs}
            onNavigate={(route) => setActiveTab(route)}
          />
        ) : null}
        {activeTab === "listeningLoop" ? (
          <ListeningLoopPage
            api={profiledApi}
            cards={cards}
            onCardsChanged={handleCardsChanged}
            onMissionProgressChanged={loadEconomy}
            onOpenWebReaderUrl={openWebReaderUrl}
            onSettingsChange={updateSettings}
            profileId={activeSettings.profileId}
            provider={provider}
            settings={activeSettings}
          />
        ) : null}
        {activeTab === "videoReader" ? (
          <VideoReaderPage
            api={profiledApi}
            cards={cards}
            onCardsChanged={handleCardsChanged}
            profileId={activeSettings.profileId}
            provider={provider}
            settings={activeSettings}
          />
        ) : null}
        {activeTab === "writingPractice" ? (
          <WritingPracticePage
            api={profiledApi}
            cards={cards}
            focusCardId={writingPracticeFocus?.cardId}
            focusPromptIndex={writingPracticeFocus?.promptIndex}
            focusRequestId={writingPracticeFocus?.requestId}
            onFocusConsumed={clearWritingPracticeFocus}
            onMissionProgressChanged={loadEconomy}
            onNavigate={(route) => setActiveTab(route)}
          />
        ) : null}
        {activeTab === "review" ? (
          <ReviewPage
            api={profiledApi}
            cards={cards}
            onCardsChanged={handleCardsChanged}
            onMissionProgressChanged={loadEconomy}
            onNavigate={(route) => setActiveTab(route)}
            onStartWritingPractice={startWritingPracticeFromCard}
            profileId={activeSettings.profileId}
            settings={activeSettings}
          />
        ) : null}
        {activeTab === "life" ? (
          <LifeMiningPage
            api={profiledApi}
            settings={activeSettings}
            lifeLogs={lifeLogs}
            provider={provider}
            onCardsChanged={handleCardsChanged}
            onLifeLogsChanged={loadLifeLogs}
          />
        ) : null}
        {activeTab === "tutorial" ? (
          <TutorialPage
            profileId={activeSettings.profileId}
            onNavigate={(route) => setActiveTab(route)}
          />
        ) : null}
        {activeTab === "settings" ? (
          <SettingsPage
            api={profiledApi}
            activeProfileId={activeSettings.profileId}
            initialTab={settingsInitialTab}
            profileManagerOpenRequest={profileManagerOpenRequest}
            profileStats={profileStats}
            profiles={profiles}
            provider={provider}
            privacyDeletionInProgress={rendererPrivacyOperation !== null}
            settings={activeSettings}
            onCreateProfile={createProfile}
            onDeleteProfile={deleteProfile}
            onInitialTabConsumed={consumeSettingsInitialTab}
            onSelectProfile={selectProfile}
            onSettingsChange={updateSettings}
            onUpdateProfile={updateProfile}
            onPrivacyDeleteError={failRendererPrivacyDelete}
            onPrivacyDeleteResult={finishRendererPrivacyDelete}
            onPrivacyDeleteStart={beginRendererPrivacyDelete}
          />
        ) : null}
            </Suspense>
          </AppErrorBoundary>
        )}
        <DailyRewardEffectToast reward={dailyRewardEffect} onDone={dismissDailyRewardEffect} />
      </main>
      {isSidebarProfileSwitcherOpen ? (
        <SettingsProfileSwitcher
          activeProfileId={activeSettings.profileId}
          profileStats={profileStats}
          profiles={profiles}
          onClose={() => setIsSidebarProfileSwitcherOpen(false)}
          onCreateProfile={createProfileFromSidebar}
          onOpenManager={openProfileManagerFromSidebar}
          onSelectProfile={selectProfileFromSidebar}
        />
      ) : null}
      {isOnboardingOpen ? (
        <AppOnboarding
          settings={activeSettings}
          onComplete={completeOnboarding}
          onOpenSettings={openSettingsFromOnboarding}
          onSkip={skipOnboarding}
        />
      ) : null}
      {isTutorialStartConfirmOpen ? (
        <TutorialStartConfirmDialog
          onCancel={cancelTutorialStart}
          onConfirm={confirmTutorialStart}
        />
      ) : null}
      {inputLanguageMismatchRequest ? (
        <InputLanguageMismatchDialog
          request={inputLanguageMismatchRequest}
          onDecision={finishInputLanguageMismatch}
        />
      ) : null}
      {pendingManualChatGptRequest ? (
        <ManualChatGptBridgeDialog
          request={pendingManualChatGptRequest.request}
          onCancel={cancelManualChatGptResponse}
          onSubmit={finishManualChatGptResponse}
        />
      ) : null}
    </div>
  );
}

function areLearningProfilesEquivalent(
  left: AppSettings["learningProfile"],
  right: AppSettings["learningProfile"]
) {
  return (
    left.targetLanguage.code === right.targetLanguage.code &&
    left.targetLanguage.nameKo === right.targetLanguage.nameKo &&
    left.targetLanguage.nameEn === right.targetLanguage.nameEn &&
    left.nativeLanguage.code === right.nativeLanguage.code &&
    left.nativeLanguage.nameKo === right.nativeLanguage.nameKo &&
    left.nativeLanguage.nameEn === right.nativeLanguage.nameEn
  );
}

function createManualChatGptAbortError(message: string) {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function waitForRendererPrivacyUnmount() {
  if (typeof window === "undefined") return Promise.resolve();
  return new Promise<void>((resolve) => {
    let completed = false;
    const finish = () => {
      if (completed) return;
      completed = true;
      window.clearTimeout(timeoutId);
      resolve();
    };
    const timeoutId = window.setTimeout(finish, 50);
    window.requestAnimationFrame(finish);
  });
}


type TutorialStartConfirmDialogProps = {
  onCancel: () => void;
  onConfirm: () => void;
};

function TutorialStartConfirmDialog({ onCancel, onConfirm }: TutorialStartConfirmDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog
      ariaDescribedBy="tutorial-start-confirm-description"
      ariaLabelledBy="tutorial-start-confirm-title"
      backdropClassName="tutorial-start-confirm-backdrop"
      className="tutorial-start-confirm-dialog"
      onClose={onCancel}
    >
      <div className="tutorial-start-confirm-heading">
        <span aria-hidden="true">
          <GraduationCap size={20} />
        </span>
        <div>
          <small>{t("app.tutorialConfirm.eyebrow")}</small>
          <h2 id="tutorial-start-confirm-title">{t("app.tutorialConfirm.title")}</h2>
        </div>
      </div>
      <p id="tutorial-start-confirm-description">{t("app.tutorialConfirm.description")}</p>
      <div className="tutorial-start-confirm-actions">
        <button className="button secondary" type="button" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button className="button primary" type="button" onClick={onConfirm}>
          {t("common.confirm")}
        </button>
      </div>
    </Dialog>
  );
}

type DailyRewardEffectToastProps = {
  reward: DailyRewardEffect | null;
  onDone: (effectId: number) => void;
};

function DailyRewardEffectToast({ reward, onDone }: DailyRewardEffectToastProps) {
  const { i18n, t } = useTranslation();
  const locale = (i18n.resolvedLanguage ?? i18n.language).startsWith("en") ? "en" : "ko";
  useEffect(() => {
    if (!reward) {
      return;
    }
    const timeoutId = window.setTimeout(() => onDone(reward.id), 1900);
    return () => window.clearTimeout(timeoutId);
  }, [onDone, reward]);

  if (!reward) {
    return null;
  }

  return (
    <div className="daily-reward-effect" role="status" aria-live="polite" key={reward.id}>
      <span className="daily-reward-orbit" aria-hidden="true" />
      <span className="daily-reward-gem" aria-hidden="true">
        <Gem size={22} />
      </span>
      <span className="daily-reward-copy">
        <strong>{t("app.reward.diamonds", { value: formatInteger(reward.amount, locale) })}</strong>
        <small>{t("app.reward.received", { label: reward.label })}</small>
      </span>
      <Sparkles className="daily-reward-spark spark-a" size={16} aria-hidden="true" />
      <Sparkles className="daily-reward-spark spark-b" size={13} aria-hidden="true" />
      <Sparkles className="daily-reward-spark spark-c" size={11} aria-hidden="true" />
    </div>
  );
}

type DailyRoutineRunnerProps = {
  run: DailyRoutineRun;
  currentStep: DailyRoutineStep | null;
  progress: ReturnType<typeof getDailyRoutineProgress>;
  onCompleteStep: () => void;
  onDismiss: () => void;
  onOpenStep: () => void;
  onPreviousStep: () => void;
  onReopenSkippedStep: (stepId: DailyRoutineStepId) => void;
  onSkipStep: () => void;
};

function DailyRoutineRunner({
  run,
  currentStep,
  progress,
  onCompleteStep,
  onDismiss,
  onOpenStep,
  onPreviousStep,
  onReopenSkippedStep,
  onSkipStep
}: DailyRoutineRunnerProps) {
  const { t } = useTranslation();
  if (!currentStep) {
    return null;
  }

  const skippedSteps = run.steps.filter((step) => step.status === "skipped");
  const firstSkippedStep = skippedSteps[0] ?? null;
  const skippedSummaryLabel =
    skippedSteps.length === 1
      ? firstSkippedStep
        ? getLocalizedDailyRoutineStepTitle(t, firstSkippedStep)
        : ""
      : t("app.routine.skippedMore", {
          title: firstSkippedStep
            ? getLocalizedDailyRoutineStepTitle(t, firstSkippedStep)
            : t("app.routine.skippedFallback"),
          count: skippedSteps.length - 1
        });
  const currentStepIsSkipped = currentStep.status === "skipped";
  const currentStepIsCompleted = currentStep.status === "completed";
  const currentStepIndex = run.steps.findIndex((step) => step.id === currentStep.id);
  const hasPreviousStep = currentStepIndex > 0;
  const openCurrentStep = currentStepIsSkipped
    ? () => onReopenSkippedStep(currentStep.id)
    : onOpenStep;

  return (
    <section className="daily-routine-runner">
      <div className="daily-routine-runner-main">
        <span className="daily-routine-runner-icon">
          <ListChecks size={18} />
        </span>
        <div className="daily-routine-runner-copy">
          <span className="daily-routine-runner-kicker">
            {t("app.routine.kicker", {
              completed: progress.completedCount,
              total: progress.totalCount
            })}
            {progress.skippedCount > 0
              ? t("app.routine.skippedCount", { count: progress.skippedCount })
              : ""}
          </span>
          <strong>{getLocalizedDailyRoutineStepTitle(t, currentStep)}</strong>
          <small>{getLocalizedDailyRoutineStepDescription(t, currentStep)}</small>
          {firstSkippedStep ? (
            <div
              className="daily-routine-skipped-summary"
              aria-label={t("app.routine.skippedSummaryLabel")}
            >
              <button
                className="daily-routine-skipped-chip"
                type="button"
                onClick={() => onReopenSkippedStep(firstSkippedStep.id)}
                title={
                  skippedSteps.length === 1
                    ? t("app.routine.returnToStep", {
                        title: getLocalizedDailyRoutineStepTitle(t, firstSkippedStep)
                      })
                    : t("app.routine.returnToStepHint", {
                        title: getLocalizedDailyRoutineStepTitle(t, firstSkippedStep)
                      })
                }
              >
                <span>{t("app.routine.skippedChip", { count: skippedSteps.length })}</span>
                <strong>{skippedSummaryLabel}</strong>
                <em>{t("app.routine.return")}</em>
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div
        className="daily-routine-runner-status"
        aria-label={t("app.routine.progressLabel", {
          completed: progress.completedCount,
          skipped: progress.skippedCount,
          total: progress.totalCount
        })}
      >
        <div className="daily-routine-runner-progress" aria-hidden="true">
          <span style={{ width: `${progress.percent}%` }} />
        </div>
        <div className="daily-routine-step-dots" aria-label={t("app.routine.stepsLabel")}>
          {run.steps.map((step, index) => {
            const isCurrentStep = step.id === currentStep.id;
            const isDotActionable = step.status === "skipped" || isCurrentStep;
            return (
              <button
                aria-label={getDailyRoutineStepDotLabel(t, step, index, isCurrentStep)}
                className={getDailyRoutineStepDotClassName(step, isCurrentStep)}
                disabled={!isDotActionable}
                key={step.id}
                title={getDailyRoutineStepDotLabel(t, step, index, isCurrentStep)}
                type="button"
                onClick={() => {
                  if (step.status === "skipped") {
                    onReopenSkippedStep(step.id);
                    return;
                  }
                  if (isCurrentStep) {
                    onOpenStep();
                  }
                }}
              />
            );
          })}
        </div>
      </div>
      <div className="daily-routine-runner-actions">
        <button className="button secondary small" type="button" onClick={openCurrentStep}>
          {currentStepIsSkipped
            ? t("app.routine.returnSkipped")
            : getLocalizedDailyRoutineStepAction(t, currentStep)}
        </button>
        <button
          className="button secondary small"
          type="button"
          disabled={!hasPreviousStep}
          onClick={onPreviousStep}
        >
          <ChevronsLeft size={15} />
          {t("app.routine.previous")}
        </button>
        <button
          className="button secondary small"
          type="button"
          disabled={currentStep.status === "skipped"}
          onClick={onSkipStep}
        >
          <SkipForward size={15} />
          {t("app.routine.next")}
        </button>
        <button
          className="button primary small"
          type="button"
          disabled={currentStepIsSkipped || currentStepIsCompleted}
          onClick={onCompleteStep}
        >
          {t("app.routine.complete")}
        </button>
      </div>
      <button
        aria-label={t("app.routine.dismiss")}
        className="icon-button daily-routine-runner-dismiss"
        title={t("app.routine.dismiss")}
        type="button"
        onClick={onDismiss}
      >
        <X size={15} />
      </button>
    </section>
  );
}

function getDailyRoutineStepDotClassName(step: DailyRoutineStep, isCurrentStep: boolean) {
  return [
    "daily-routine-step-dot",
    `status-${step.status}`,
    isCurrentStep ? "current" : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function getDailyRoutineStepDotLabel(
  t: TFunction,
  step: DailyRoutineStep,
  index: number,
  isCurrentStep: boolean
) {
  const stepNumber = index + 1;
  if (step.status === "completed") {
    return t("app.routine.dotCompleted", {
      number: stepNumber,
      title: getLocalizedDailyRoutineStepTitle(t, step)
    });
  }
  if (step.status === "skipped") {
    return t("app.routine.dotSkipped", {
      number: stepNumber,
      title: getLocalizedDailyRoutineStepTitle(t, step)
    });
  }
  if (isCurrentStep || step.status === "running") {
    return t("app.routine.dotCurrent", {
      number: stepNumber,
      title: getLocalizedDailyRoutineStepTitle(t, step)
    });
  }
  return t("app.routine.dotWaiting", {
    number: stepNumber,
    title: getLocalizedDailyRoutineStepTitle(t, step)
  });
}

function getLocalizedDailyRoutineStepTitle(t: TFunction, step: DailyRoutineStep) {
  if (step.id === "review") return t("today.routine.steps.review.title");
  if (step.id === "listening-loop") return t("today.routine.steps.listening.title");
  if (step.id === "writing-practice") return t("today.routine.steps.writing.title");
  return t("today.routine.steps.rewards.title");
}

function getLocalizedDailyRoutineStepDescription(t: TFunction, step: DailyRoutineStep) {
  if (step.id === "review") return t("today.routine.steps.review.description");
  if (step.id === "listening-loop") return t("today.routine.steps.listening.description");
  if (step.id === "writing-practice") return t("today.routine.steps.writing.description");
  return t("today.routine.steps.rewards.description");
}

function getLocalizedDailyRoutineStepAction(t: TFunction, step: DailyRoutineStep) {
  if (step.id === "review") return t("today.routine.steps.review.action");
  if (step.id === "listening-loop") return t("today.routine.steps.listening.action");
  if (step.id === "writing-practice") return t("today.routine.steps.writing.action");
  return t("today.routine.steps.rewards.action");
}
