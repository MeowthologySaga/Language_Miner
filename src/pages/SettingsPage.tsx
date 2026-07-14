import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FolderOpen,
  Plus,
  Search,
  Settings,
  Trash2,
  Users,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import type { LocalEnglishMinerApi } from "../data/api";
import type { LLMProvider } from "../services/llm/types";
import { Dialog } from "../components/Dialog";
import {
  defaultLifeMiningCaptureSettings,
  resolveLifeMiningPresetSettings
} from "../shared/lifeMiningSettings";
import { DEFAULT_PROFILE_ID } from "../shared/profiles";
import { isLoopbackHttpUrl } from "../shared/localEndpointPolicy";
import {
  readCloudProviderConsent,
  recordCloudProviderConsent
} from "../shared/cloudProviderConsent";
import {
  DEFAULT_DAILY_APP_TOKEN_LIMIT,
  DEFAULT_LOCAL_MT_MODEL,
  DEFAULT_MONTHLY_SPEND_LIMIT_KRW,
  formatCompactNumber,
  formatKrwRange,
} from "../shared/translationUsage";
import {
  createProfileId,
  createProfilePreset,
  getBrowserTranslatorApi,
  getProfileInitials,
  getSettingsStatusClassName,
  hasConfiguredCardSyncFolder,
  normalizeCardSyncPrerequisites,
  normalizeTranslatorLanguage,
  shouldResetCardConnectionStatus,
  shouldResetTranslationConnectionStatus
} from "./settingsPageUtils";
import { LanguageProfileEditor } from "./LanguageProfileEditor";
import { SettingsAiOverviewPanel } from "./SettingsAiOverviewPanel";
import { SettingsBackupPanel } from "./SettingsBackupPanel";
import { SettingsLocalePanel } from "./SettingsLocalePanel";
import { SettingsCardEnginePanel } from "./SettingsCardEnginePanel";
import { SettingsOverviewPanel } from "./SettingsOverviewPanel";
import { SettingsProfileAccountPanel } from "./SettingsProfileAccountPanel";
import { SettingsProfileSwitcher } from "./SettingsProfileSwitcher";
import { SettingsPrivacyControls } from "./SettingsPrivacyControls";
import { SettingsTtsPanel } from "./SettingsTtsPanel";
import { SettingsPageHeader } from "./SettingsPageHeader";
import { SettingsNavigation } from "./SettingsNavigation";
import {
  browserCaptureSiteOptions,
  geminiModelPresets,
  lifeMiningContextOptions,
  lifeMiningPresetOptions,
  lifeMiningScopeOptions,
  lifeMiningTargetOptions,
  translationProviderPresets,
  getSettingsPanelClassName,
  isSettingsPanelVisible as isSettingsPanelVisibleForState,
  type SettingsPanelId,
  type SettingsTabId
} from "./settingsPageOptions";
import type {
  AppSettings,
  AppRuntimeStatus,
  BilingualPdfExportMode,
  LearningProfileRecord,
  LifeMiningCapturePreset,
  LifeMiningCaptureSettings,
  ProfileId,
  SecureSettingsStatus,
  TranslationConnectionTestResult
} from "../shared/types";
import type {
  PrivacyDataDeleteResult,
  PrivacyDataDeleteTarget
} from "../shared/privacyData";
import { rendererPrivacyLifecycle } from "../rendererPrivacyLifecycle";

type ProfileStats = Record<
  ProfileId,
  {
    cardCount: number;
    dueCount: number;
  }
>;

const SETTINGS_PANEL_IDS: SettingsPanelId[] = [
  "profile",
  "locale",
  "cardEngine",
  "apiUsage",
  "tts",
  "capture",
  "sync",
  "background",
  "labs",
  "developer",
  "privacy",
  "export"
];

type SettingsPageProps = {
  api: LocalEnglishMinerApi;
  activeProfileId: ProfileId;
  initialTab?: SettingsTabId | null;
  profileManagerOpenRequest?: number;
  profiles: LearningProfileRecord[];
  profileStats: ProfileStats;
  settings: AppSettings;
  provider: LLMProvider;
  privacyDeletionInProgress: boolean;
  onSelectProfile: (profileId: ProfileId) => void;
  onCreateProfile: (profile: LearningProfileRecord) => void;
  onUpdateProfile: (profile: LearningProfileRecord) => void;
  onDeleteProfile: (profileId: ProfileId) => Promise<void>;
  onInitialTabConsumed?: () => void;
  onSettingsChange: (settings: AppSettings) => void;
  onPrivacyDeleteStart: (target: PrivacyDataDeleteTarget) => Promise<void> | void;
  onPrivacyDeleteResult: (result: PrivacyDataDeleteResult) => void;
  onPrivacyDeleteError: (target: PrivacyDataDeleteTarget) => void;
};

type PendingSettingsConfirmation =
  | { kind: "bridgeRevoke" }
  | { kind: "bridgeForget" }
  | { kind: "cloudProvider"; providerName: "gemini" | "google"; next: Partial<AppSettings> }
  | { kind: "lifeMiningEnable" };

export function SettingsPage({
  api,
  activeProfileId,
  initialTab = null,
  profileManagerOpenRequest = 0,
  profiles,
  profileStats,
  settings,
  provider,
  privacyDeletionInProgress,
  onSelectProfile,
  onCreateProfile,
  onUpdateProfile,
  onDeleteProfile,
  onInitialTabConsumed,
  onSettingsChange,
  onPrivacyDeleteStart,
  onPrivacyDeleteResult,
  onPrivacyDeleteError
}: SettingsPageProps) {
  const { i18n, t } = useTranslation();
  const useEnglishLanguageNames = (i18n.resolvedLanguage ?? i18n.language).startsWith("en");
  const [connectionStatus, setConnectionStatus] = useState("");
  const [translationConnectionStatus, setTranslationConnectionStatus] = useState("");
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [isTestingTranslationConnection, setIsTestingTranslationConnection] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<AppRuntimeStatus | null>(null);
  const [runtimeStatusMessage, setRuntimeStatusMessage] = useState("");
  const [bridgePairingStatus, setBridgePairingStatus] = useState<{
    paired: boolean;
    origin: string | null;
  } | null>(null);
  const [bridgePairingMessage, setBridgePairingMessage] = useState("");
  const [isUpdatingBridgePairing, setIsUpdatingBridgePairing] = useState(false);
  const [bridgeForgetConfirmation, setBridgeForgetConfirmation] = useState("");
  const bridgeForgetInputRef = useRef<HTMLInputElement>(null);
  const [secureSettingsStatus, setSecureSettingsStatus] =
    useState<SecureSettingsStatus | null>(null);
  const [isProfileSwitcherOpen, setIsProfileSwitcherOpen] = useState(false);
  const [isProfileManagerOpen, setIsProfileManagerOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState(activeProfileId);
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTabId>("basic");
  const [settingsSearch, setSettingsSearch] = useState("");
  const settingsPageRef = useRef<HTMLDivElement>(null);
  const [profileDeleteCandidate, setProfileDeleteCandidate] =
    useState<LearningProfileRecord | null>(null);
  const [deletingProfileId, setDeletingProfileId] = useState<ProfileId | null>(null);
  const [profileDeleteError, setProfileDeleteError] = useState("");
  const [pendingSettingsConfirmation, setPendingSettingsConfirmation] =
    useState<PendingSettingsConfirmation | null>(null);

  function localizeConnectionTestResult(result: TranslationConnectionTestResult) {
    const model =
      result.model ||
      (result.providerName === "localMt"
        ? settings.localMtModel
        : result.providerName === "local"
          ? settings.ollamaModel
          : settings.geminiModel);
    const baseUrl = result.baseUrl || settings.ollamaBaseUrl;

    if (result.ok) {
      switch (result.providerName) {
        case "gemini":
          return t("settings.status.geminiConnected", { model });
        case "google":
          return t("settings.status.googleTranslationConnected");
        case "localMt":
          return t("settings.status.localMtConnected", { model });
        case "local":
          return t("settings.status.ollamaModelConnected", { model });
        case "browser":
          return t("settings.status.translationSuccess");
      }
    }

    switch (result.code) {
      case "browser_renderer_only":
        return t("settings.status.browserTranslationUnavailable");
      case "api_key_required":
        return result.providerName === "gemini"
          ? t("settings.status.geminiApiKeyRequired")
          : t("settings.status.googleApiKeyRequired");
      case "model_required":
        return t("settings.status.ollamaModelRequired");
      case "ollama_runtime_not_installed":
        return t("settings.status.ollamaNotInstalled");
      case "ollama_runtime_start_failed":
        return t("settings.status.ollamaStartFailed");
      case "ollama_model_missing":
        return t("settings.status.ollamaModelMissing", { model });
      case "ollama_server_unreachable":
        return t("settings.status.ollamaServerUnavailable", { url: baseUrl });
      case "ollama_model_list_failed":
        return t("settings.status.ollamaModelListFailed", { url: baseUrl });
      case "local_mt_setup_failed":
        return t("settings.status.localMtSetupFailed", { model });
      case "provider_request_failed":
        if (result.providerName === "gemini") {
          return t("settings.status.geminiConnectionFailed");
        }
        if (result.providerName === "google") {
          return t("settings.status.googleTranslationConnectionFailed");
        }
        if (result.providerName === "localMt") {
          return t("settings.status.localMtSetupFailed", { model });
        }
        return t("settings.status.ollamaServerUnavailable", { url: baseUrl });
      case "connected":
        return t("settings.status.translationSuccess");
    }
  }

  useEffect(() => {
    if (!initialTab) {
      return;
    }
    setSettingsSearch("");
    setActiveSettingsTab(initialTab);
    onInitialTabConsumed?.();
  }, [initialTab, onInitialTabConsumed]);
  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0],
    [activeProfileId, profiles]
  );
  const editingProfile = useMemo(
    () => profiles.find((profile) => profile.id === editingProfileId) ?? activeProfile,
    [activeProfile, editingProfileId, profiles]
  );
  const [profileDraft, setProfileDraft] = useState<LearningProfileRecord | null>(
    () => editingProfile ?? null
  );
  const usagePreview = useMemo(
    () => ({
      dailyLimitLabel: formatCompactNumber(settings.dailyAppTokenLimit || DEFAULT_DAILY_APP_TOKEN_LIMIT),
      monthlyLimitLabel: formatKrwRange({
        min: settings.monthlySpendLimitKrw || DEFAULT_MONTHLY_SPEND_LIMIT_KRW,
        max: settings.monthlySpendLimitKrw || DEFAULT_MONTHLY_SPEND_LIMIT_KRW
      })
    }),
    [settings.dailyAppTokenLimit, settings.monthlySpendLimitKrw]
  );
  const activeTranslationProviderPreset = translationProviderPresets.find(
    (preset) => preset.value === settings.translationProviderName
  );
  const lifeMiningCaptureSettings =
    settings.lifeMiningCaptureSettings ?? defaultLifeMiningCaptureSettings;
  const selectedLifeTargetOption = lifeMiningTargetOptions.find(
    (option) => option.value === lifeMiningCaptureSettings.target
  );
  const selectedLifeScopeOption = lifeMiningScopeOptions.find(
    (option) => option.value === lifeMiningCaptureSettings.scope
  );
  const syncFolderMayUploadExternally = /(?:onedrive|dropbox|google[ _-]?drive|icloud)/i.test(
    settings.cardSyncFolderPath
  );
  const hasSyncFolder = hasConfiguredCardSyncFolder(settings.cardSyncFolderPath);
  const activeProfileStat = activeProfile ? profileStats[activeProfile.id] : undefined;
  const normalizedSettingsSearch = settingsSearch.trim().toLowerCase();

  function selectSettingsTab(tab: SettingsTabId) {
    setActiveSettingsTab(tab);
    window.requestAnimationFrame(() => {
      settingsPageRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
    });
  }

  function isSettingsPanelVisible(panelId: SettingsPanelId) {
    return isSettingsPanelVisibleForState({
      activeSettingsTab,
      normalizedSettingsSearch,
      panelId
    });
  }

  function getSettingsPanelClass(panelId: SettingsPanelId, extraClassName = "") {
    return getSettingsPanelClassName({
      activeSettingsTab,
      extraClassName,
      normalizedSettingsSearch,
      panelId
    });
  }

  useEffect(() => {
    setEditingProfileId(activeProfileId);
  }, [activeProfileId]);

  useEffect(() => {
    if (!privacyDeletionInProgress) return;
    setIsTestingConnection(false);
    setIsTestingTranslationConnection(false);
    setConnectionStatus("");
    setTranslationConnectionStatus("");
    setPendingSettingsConfirmation(null);
    setBridgeForgetConfirmation("");
  }, [privacyDeletionInProgress]);

  useEffect(() => {
    if (hasSyncFolder || (!settings.cardSyncOnStartup && !settings.cardSyncOnQuit)) {
      return;
    }
    onSettingsChange({
      ...settings,
      cardSyncOnStartup: false,
      cardSyncOnQuit: false
    });
  }, [hasSyncFolder, onSettingsChange, settings]);

  useEffect(() => {
    setProfileDraft(editingProfile ? { ...editingProfile } : null);
    setProfileDeleteCandidate(null);
  }, [editingProfile]);

  useEffect(() => {
    if (profileManagerOpenRequest <= 0) {
      return;
    }
    openProfileManager();
  }, [profileManagerOpenRequest]);

  useEffect(() => {
    if (privacyDeletionInProgress) return;
    let isMounted = true;
    void api.app?.getRuntimeStatus().then((status) => {
      if (!isMounted) {
        return;
      }
      setRuntimeStatus(status);
      setRuntimeStatusMessage(status.message);
    });
    return () => {
      isMounted = false;
    };
  }, [api.app, privacyDeletionInProgress]);

  useEffect(() => {
    const shouldPoll =
      activeSettingsTab === "capture" || normalizedSettingsSearch.includes("capture");
    if (!api.lifeMinerBridge || !shouldPoll) {
      return;
    }
    let isMounted = true;
    const refreshPairingStatus = () => {
      void api.lifeMinerBridge
        ?.getPairingStatus()
        .then((status) => {
          if (isMounted) {
            setBridgePairingStatus(status);
            setBridgePairingMessage("");
          }
        })
        .catch(() => {
          if (isMounted) {
            setBridgePairingStatus(null);
            setBridgePairingMessage(t("settings.status.bridgeReadFailed"));
          }
        });
    };
    refreshPairingStatus();
    const pollId = window.setInterval(refreshPairingStatus, 3_000);
    return () => {
      isMounted = false;
      window.clearInterval(pollId);
    };
  }, [activeSettingsTab, api.lifeMinerBridge, normalizedSettingsSearch, t]);

  useEffect(() => {
    if (privacyDeletionInProgress) return;
    let isMounted = true;
    void api.secureSettings
      ?.getStatus()
      .then((status) => {
        if (isMounted) {
          setSecureSettingsStatus(status);
        }
      })
      .catch(() => {
        if (isMounted) {
          setSecureSettingsStatus(null);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [api.secureSettings, privacyDeletionInProgress]);

  useEffect(() => {
    setSecureSettingsStatus((current) =>
      current
        ? {
            ...current,
            geminiApiKeyConfigured: Boolean(settings.geminiApiKey.trim()),
            googleTranslateApiKeyConfigured: Boolean(settings.googleTranslateApiKey.trim())
          }
        : current
    );
  }, [settings.geminiApiKey, settings.googleTranslateApiKey]);

  async function updateBridgePairing(action: "rotate" | "revoke") {
    if (!api.lifeMinerBridge || isUpdatingBridgePairing) {
      return;
    }
    setIsUpdatingBridgePairing(true);
    setBridgePairingMessage("");
    try {
      const status =
        action === "rotate"
          ? await api.lifeMinerBridge.rotateToken()
          : await api.lifeMinerBridge.revoke();
      setBridgePairingStatus(status);
      setBridgePairingMessage(
        action === "rotate"
          ? t("settings.capture.bridgeRotated")
          : t("settings.capture.bridgeRevoked")
      );
    } catch {
      setBridgePairingMessage(t("settings.status.bridgeUpdateFailed"));
    } finally {
      setIsUpdatingBridgePairing(false);
    }
  }

  async function forgetUninstalledExtension() {
    if (
      !api.lifeMinerBridge ||
      isUpdatingBridgePairing ||
      privacyDeletionInProgress ||
      bridgeForgetConfirmation.trim() !== t("settings.capture.bridgeForgetPhrase")
    ) {
      return;
    }
    setIsUpdatingBridgePairing(true);
    setBridgePairingMessage("");
    try {
      const status = await api.lifeMinerBridge.forgetUninstalledExtension({
        confirmation: bridgeForgetConfirmation
      });
      setBridgePairingStatus(status);
      setBridgePairingMessage(t("settings.capture.bridgeForgotten"));
      setBridgeForgetConfirmation("");
    } catch {
      setBridgePairingMessage(t("settings.status.bridgeUpdateFailed"));
    } finally {
      setIsUpdatingBridgePairing(false);
    }
  }

  function update(next: Partial<AppSettings>) {
    if (privacyDeletionInProgress) {
      return;
    }
    const cloudProvider = getCloudProviderForSettingsUpdate(next);
    if (
      cloudProvider &&
      (typeof window === "undefined" ||
        !readCloudProviderConsent(window.localStorage, cloudProvider))
    ) {
      setPendingSettingsConfirmation({
        kind: "cloudProvider",
        providerName: cloudProvider,
        next
      });
      return;
    }
    applySettingsUpdate(next);
  }

  function applySettingsUpdate(next: Partial<AppSettings>) {
    if (privacyDeletionInProgress) {
      return;
    }
    const normalizedNext = normalizeCardSyncPrerequisites(settings, next);
    if (shouldResetCardConnectionStatus(settings, normalizedNext)) {
      setConnectionStatus("");
    }
    if (shouldResetTranslationConnectionStatus(settings, normalizedNext)) {
      setTranslationConnectionStatus("");
    }
    if ("geminiApiKey" in normalizedNext) {
      setSecureSettingsStatus((current) =>
        current
          ? { ...current, geminiApiKeyConfigured: Boolean(normalizedNext.geminiApiKey?.trim()) }
          : current
      );
    }
    if ("googleTranslateApiKey" in normalizedNext) {
      setSecureSettingsStatus((current) =>
        current
          ? {
              ...current,
              googleTranslateApiKeyConfigured: Boolean(
                normalizedNext.googleTranslateApiKey?.trim()
              )
            }
          : current
      );
    }
    onSettingsChange({
      ...settings,
      ...normalizedNext
    });
  }

  function updateBrowserCaptureSite(
    key: keyof AppSettings["browserCaptureSiteSettings"],
    enabled: boolean
  ) {
    update({
      browserCaptureSiteSettings: {
        ...settings.browserCaptureSiteSettings,
        [key]: enabled
      }
    });
  }

  function updateLifeMiningCaptureSettings(next: Partial<LifeMiningCaptureSettings>) {
    update({
      lifeMiningCaptureSettings: {
        ...lifeMiningCaptureSettings,
        ...next,
        preset: next.preset ?? "custom"
      }
    });
  }

  function applyLifeMiningPreset(preset: Exclude<LifeMiningCapturePreset, "custom">) {
    update({
      lifeMiningCaptureSettings: resolveLifeMiningPresetSettings(
        preset,
        lifeMiningCaptureSettings.enabled
      )
    });
  }

  function getCloudProviderForSettingsUpdate(
    next: Partial<AppSettings>
  ): "gemini" | "google" | null {
    if (next.providerName === "gemini" && settings.providerName !== "gemini") {
      return "gemini";
    }
    if (
      next.translationProviderName === "gemini" &&
      settings.translationProviderName !== "gemini"
    ) {
      return "gemini";
    }
    if (
      next.translationProviderName === "google" &&
      settings.translationProviderName !== "google"
    ) {
      return "google";
    }
    return null;
  }

  const hasSettingsSearchResults =
    !normalizedSettingsSearch || SETTINGS_PANEL_IDS.some((panelId) => isSettingsPanelVisible(panelId));

  function updateLifeMiningCaptureConsent(enabled: boolean) {
    if (enabled) {
      setPendingSettingsConfirmation({ kind: "lifeMiningEnable" });
      return;
    }
    applyLifeMiningCaptureEnabled(false);
  }

  function applyLifeMiningCaptureEnabled(enabled: boolean) {
    update({
      lifeMiningCaptureSettings: {
        ...lifeMiningCaptureSettings,
        enabled
      }
    });
  }

  async function confirmPendingSettingsAction() {
    if (privacyDeletionInProgress) return;
    const pending = pendingSettingsConfirmation;
    if (!pending) return;
    if (
      pending.kind === "bridgeForget" &&
      bridgeForgetConfirmation.trim() !== t("settings.capture.bridgeForgetPhrase")
    ) {
      return;
    }
    setPendingSettingsConfirmation(null);
    if (pending.kind === "bridgeRevoke") {
      await updateBridgePairing("revoke");
      return;
    }
    if (pending.kind === "bridgeForget") {
      await forgetUninstalledExtension();
      return;
    }
    if (pending.kind === "cloudProvider") {
      try {
        recordCloudProviderConsent(window.localStorage, {
          provider: pending.providerName,
          keyStorage: secureSettingsStatus?.available ? "safeStorage" : "session"
        });
      } catch {
        const message = t("app.secureStorageWriteError");
        setConnectionStatus(message);
        setTranslationConnectionStatus(message);
        return;
      }
      applySettingsUpdate(pending.next);
      return;
    }
    if (pending.kind === "lifeMiningEnable") {
      applyLifeMiningCaptureEnabled(true);
    }
  }

  function getPendingConfirmationCopy() {
    if (!pendingSettingsConfirmation) return null;
    if (pendingSettingsConfirmation.kind === "bridgeRevoke") {
      return {
        title: t("settings.confirmations.bridgeRevokeTitle"),
        message: t("settings.capture.bridgeRevokeConfirm"),
        confirmLabel: t("settings.confirmations.revoke")
      };
    }
    if (pendingSettingsConfirmation.kind === "bridgeForget") {
      return {
        title: t("settings.confirmations.bridgeForgetTitle"),
        message: t("settings.capture.bridgeForgetConfirm"),
        confirmLabel: t("settings.confirmations.forget")
      };
    }
    if (pendingSettingsConfirmation.kind === "lifeMiningEnable") {
      return {
        title: t("settings.confirmations.lifeMiningTitle"),
        message: t("settings.capture.lifeMiningConsent"),
        confirmLabel: t("settings.confirmations.enable")
      };
    }
    const providerName = pendingSettingsConfirmation.providerName;
    return {
      title: t("settings.confirmations.cloudTitle", {
        provider: providerName === "gemini" ? "Gemini" : "Google Cloud Translation"
      }),
      message: t("settings.cloudConsent.confirm", {
        provider: providerName === "gemini" ? "Gemini" : "Google Cloud Translation",
        data: t(
          providerName === "gemini"
            ? "settings.cloudConsent.geminiData"
            : "settings.cloudConsent.googleData"
        ),
        keyStorage: secureSettingsStatus?.available
          ? t("settings.cloudConsent.safeStorage")
          : t("settings.cloudConsent.sessionStorage")
      }),
      confirmLabel: t("settings.confirmations.enable")
    };
  }

  function openProfileManager(profileId = activeProfileId) {
    setEditingProfileId(profileId);
    setIsProfileManagerOpen(true);
    setIsProfileSwitcherOpen(false);
    setProfileDeleteCandidate(null);
  }

  function selectProfile(profileId: ProfileId) {
    onSelectProfile(profileId);
    setIsProfileSwitcherOpen(false);
  }

  function createProfile() {
    const nextIndex = profiles.length + 1;
    const profile = createProfilePreset(
      nextIndex,
      settings,
      t("settings.profile.defaultName", { index: nextIndex })
    );
    onCreateProfile(profile);
    setEditingProfileId(profile.id);
    setProfileDraft(profile);
    setIsProfileManagerOpen(true);
    setIsProfileSwitcherOpen(false);
    setProfileDeleteCandidate(null);
  }

  function duplicateProfile(profile: LearningProfileRecord) {
    const now = new Date().toISOString();
    const copy: LearningProfileRecord = {
      ...profile,
      id: createProfileId(),
      name: t("settings.profile.copyName", { name: profile.name }),
      createdAt: now,
      updatedAt: now
    };
    onCreateProfile(copy);
    setEditingProfileId(copy.id);
    setProfileDraft(copy);
    setIsProfileManagerOpen(true);
    setIsProfileSwitcherOpen(false);
    setProfileDeleteCandidate(null);
  }

  function saveProfileDraft() {
    if (!profileDraft) {
      return;
    }
    onUpdateProfile(profileDraft);
  }

  async function deleteProfile(profileId: ProfileId) {
    if (profileId === DEFAULT_PROFILE_ID || profiles.length <= 1 || deletingProfileId) {
      return;
    }
    setDeletingProfileId(profileId);
    setProfileDeleteError("");
    try {
      await onDeleteProfile(profileId);
      setProfileDeleteCandidate(null);
      if (editingProfileId === profileId) {
        const nextProfile = profiles.find((profile) => profile.id !== profileId);
        setEditingProfileId(nextProfile?.id ?? activeProfileId);
      }
    } catch {
      setProfileDeleteError(t("settings.status.profileDeleteFailed"));
    } finally {
      setDeletingProfileId(null);
    }
  }

  async function testConnection() {
    if (privacyDeletionInProgress || rendererPrivacyLifecycle.isBlocked()) return;
    const requestEpoch = rendererPrivacyLifecycle.captureEpoch();
    const canCommit = () => rendererPrivacyLifecycle.canCommit(requestEpoch);
    setIsTestingConnection(true);
    if (settings.providerName === "gemini") {
      setConnectionStatus(t("settings.status.cardEngineTesting"));
      try {
        const sessionKeys = await readSessionApiKeys();
        const result = await api.translations.testConnection({
          providerName: "gemini",
          geminiApiKey: settings.geminiApiKey.trim() || sessionKeys.geminiApiKey,
          geminiModel: settings.geminiModel
        });
        if (!canCommit()) return;
        setConnectionStatus(
          result.ok
            ? t("settings.status.geminiConnected", { model: settings.geminiModel })
            : localizeConnectionTestResult(result)
        );
      } catch {
        if (canCommit()) setConnectionStatus(t("settings.status.cardEngineFailed"));
      } finally {
        if (canCommit()) setIsTestingConnection(false);
      }
      return;
    }
    const isLocalOllama = isLoopbackHttpUrl(settings.ollamaBaseUrl);
    setConnectionStatus(t(isLocalOllama
      ? "settings.status.ollamaStarting"
      : "settings.status.cardEngineTesting"));
    try {
      if (isLocalOllama) {
        const runtime = await api.translations.ensureOllamaRunning(settings.ollamaBaseUrl);
        if (!canCommit()) return;
        if (runtime.status === "not_installed") {
          setConnectionStatus(t("settings.status.ollamaNotInstalled"));
          return;
        }
        if (runtime.status === "start_failed") {
          setConnectionStatus(t("settings.status.ollamaStartFailed"));
          return;
        }
      }
      const ok = await provider.testConnection();
      if (!canCommit()) return;
      if (!ok) {
        setConnectionStatus(t("settings.status.ollamaServerUnavailable", {
          url: settings.ollamaBaseUrl
        }));
        return;
      }
      const status = await api.translations.getOllamaModelStatus({
        baseUrl: settings.ollamaBaseUrl,
        model: settings.ollamaModel
      });
      if (!canCommit()) return;
      setConnectionStatus(status.installed
        ? t("settings.status.ollamaModelConnected", { model: status.model })
        : t("settings.status.ollamaModelMissing", { model: status.model }));
    } catch {
      if (canCommit()) {
        setConnectionStatus(t("settings.status.ollamaServerUnavailable", {
          url: settings.ollamaBaseUrl
        }));
      }
    } finally {
      if (canCommit()) setIsTestingConnection(false);
    }
  }

  async function testTranslationConnection() {
    if (privacyDeletionInProgress || rendererPrivacyLifecycle.isBlocked()) return;
    const requestEpoch = rendererPrivacyLifecycle.captureEpoch();
    const canCommit = () => rendererPrivacyLifecycle.canCommit(requestEpoch);
    setIsTestingTranslationConnection(true);
    try {
      if (settings.translationProviderName === "browser") {
        setTranslationConnectionStatus(t("settings.status.browserTranslationTesting"));
        const translator = getBrowserTranslatorApi();
        if (!translator) {
          setTranslationConnectionStatus(t("settings.status.browserTranslationUnavailable"));
          return;
        }

        const sourceLanguage = normalizeTranslatorLanguage(
          settings.learningProfile.targetLanguage.code,
          "en"
        );
        const targetLanguage = normalizeTranslatorLanguage(
          settings.learningProfile.nativeLanguage.code,
          "ko"
        );
        const availability = await translator.availability({
          sourceLanguage,
          targetLanguage
        });
        if (!canCommit()) return;
        setTranslationConnectionStatus(
          availability === "unavailable"
            ? t("settings.status.browserTranslationPairUnavailable", {
                source: sourceLanguage,
                target: targetLanguage
              })
            : t("settings.status.browserTranslationAvailability", {
                availability,
                source: sourceLanguage,
                target: targetLanguage
              })
        );
        return;
      }

      setTranslationConnectionStatus(
        t(
          settings.translationProviderName === "localMt"
            ? "settings.status.localMtPreparing"
            : "settings.status.translationTesting"
        )
      );
      const sessionKeys = await readSessionApiKeys();
      const result = await api.translations.testConnection({
        providerName: settings.translationProviderName,
        googleApiKey:
          settings.googleTranslateApiKey.trim() || sessionKeys.googleTranslateApiKey,
        geminiApiKey: settings.geminiApiKey.trim() || sessionKeys.geminiApiKey,
        geminiModel: settings.geminiModel,
        localMtModel: settings.localMtModel,
        ollamaBaseUrl: settings.ollamaBaseUrl,
        ollamaModel: settings.ollamaModel
      });
      if (canCommit()) setTranslationConnectionStatus(localizeConnectionTestResult(result));
    } catch {
      if (canCommit()) setTranslationConnectionStatus(t("settings.status.translationFailed"));
    } finally {
      if (canCommit()) setIsTestingTranslationConnection(false);
    }
  }

  async function updateLaunchAtLogin(enabled: boolean) {
    if (!api.app) {
      setRuntimeStatusMessage(t("settings.status.desktopBackgroundOnly"));
      return;
    }

    const status = await api.app.setLaunchAtLogin(enabled);
    setRuntimeStatus(status);
    setRuntimeStatusMessage(status.message);
  }

  async function readSessionApiKeys() {
    if (privacyDeletionInProgress) {
      return { geminiApiKey: "", googleTranslateApiKey: "" };
    }
    if (!api.secureSettings) {
      return { geminiApiKey: "", googleTranslateApiKey: "" };
    }
    try {
      return await api.secureSettings.getForSession();
    } catch {
      return { geminiApiKey: "", googleTranslateApiKey: "" };
    }
  }

  const pendingConfirmationCopy = getPendingConfirmationCopy();

  function blockSettingsInteractionDuringPrivacyDelete(event: SyntheticEvent) {
    if (!privacyDeletionInProgress) return;
    const target = event.target;
    if (target instanceof Element && target.closest("[data-privacy-delete-controls]")) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <div
      aria-busy={privacyDeletionInProgress}
      className="settings-grid"
      ref={settingsPageRef}
      onChangeCapture={blockSettingsInteractionDuringPrivacyDelete}
      onClickCapture={blockSettingsInteractionDuringPrivacyDelete}
      onSubmitCapture={blockSettingsInteractionDuringPrivacyDelete}
    >
      {pendingSettingsConfirmation && pendingConfirmationCopy ? (
        <Dialog
          ariaDescribedBy="settings-confirm-message"
          ariaLabelledBy="settings-confirm-title"
          backdropClassName="profile-manager-modal-backdrop"
          className="panel settings-confirm-dialog"
          closeOnBackdrop={false}
          initialFocusRef={
            pendingSettingsConfirmation.kind === "bridgeForget"
              ? bridgeForgetInputRef
              : undefined
          }
          onClose={() => {
            setPendingSettingsConfirmation(null);
            setBridgeForgetConfirmation("");
          }}
        >
          <h2 id="settings-confirm-title">{pendingConfirmationCopy.title}</h2>
          <p id="settings-confirm-message">{pendingConfirmationCopy.message}</p>
          {pendingSettingsConfirmation.kind === "bridgeForget" ? (
            <label className="field-label" htmlFor="settings-bridge-forget-confirmation">
              {t("settings.capture.bridgeForgetConfirmationLabel")}
              <code>{t("settings.capture.bridgeForgetPhrase")}</code>
              <input
                ref={bridgeForgetInputRef}
                autoComplete="off"
                className="text-input"
                data-qa="settings-life-miner-bridge-forget-confirmation"
                id="settings-bridge-forget-confirmation"
                spellCheck={false}
                type="text"
                value={bridgeForgetConfirmation}
                onChange={(event) => setBridgeForgetConfirmation(event.target.value)}
              />
            </label>
          ) : null}
          <div className="settings-confirm-actions">
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                setPendingSettingsConfirmation(null);
                setBridgeForgetConfirmation("");
              }}
            >
              {t("common.cancel")}
            </button>
            <button
              className="button primary"
              disabled={
                pendingSettingsConfirmation.kind === "bridgeForget" &&
                bridgeForgetConfirmation.trim() !== t("settings.capture.bridgeForgetPhrase")
              }
              type="button"
              onClick={() => void confirmPendingSettingsAction()}
            >
              {pendingConfirmationCopy.confirmLabel}
            </button>
          </div>
        </Dialog>
      ) : null}
      <SettingsPageHeader
        normalizedSettingsSearch={normalizedSettingsSearch}
        settingsSearch={settingsSearch}
        onSettingsSearchChange={setSettingsSearch}
      />

      <SettingsNavigation
        activeSettingsTab={activeSettingsTab}
        isSearching={Boolean(normalizedSettingsSearch)}
        onSettingsSearchChange={setSettingsSearch}
        onSettingsTabChange={selectSettingsTab}
      />

      <main className="settings-content">

      {!hasSettingsSearchResults ? (
        <section aria-live="polite" className="panel settings-search-empty" role="status">
          <Search size={24} />
          <strong>{t("settings.searchEmpty.title")}</strong>
          <span>{t("settings.searchEmpty.description")}</span>
          <button className="button secondary" type="button" onClick={() => setSettingsSearch("")}>
            {t("settings.searchEmpty.clear")}
          </button>
        </section>
      ) : null}

      {activeSettingsTab === "basic" && !normalizedSettingsSearch ? (
        <SettingsOverviewPanel
          lifeMiningCaptureSettings={lifeMiningCaptureSettings}
          settings={settings}
        />
      ) : null}

      {isSettingsPanelVisible("profile") ? (
        <SettingsProfileAccountPanel
          activeProfile={activeProfile}
          activeProfileStat={activeProfileStat}
          settings={settings}
          onOpenManager={() => openProfileManager()}
          onOpenSwitcher={() => setIsProfileSwitcherOpen(true)}
        />
      ) : null}
      <SettingsLocalePanel className={getSettingsPanelClass("locale")} />
      {isProfileManagerOpen && profileDraft ? (
        <Dialog
          ariaLabel={t("settings.profile.manage")}
          backdropClassName="profile-manager-modal-backdrop"
          className="panel profile-manager-panel"
          onClose={() => {
            setIsProfileManagerOpen(false);
            setProfileDeleteCandidate(null);
          }}
        >
          <div className="profile-manager-heading">
            <div className="panel-heading">
              <Users size={19} />
              <h2>{t("settings.profile.manage")}</h2>
            </div>
            <button
              className="button secondary"
              type="button"
              onClick={() => {
                setIsProfileManagerOpen(false);
                setProfileDeleteCandidate(null);
              }}
            >
              <X size={16} />
              {t("common.close")}
            </button>
          </div>
          <div className="profile-manager-layout">
            <div className="profile-manager-list" aria-label={t("settings.profile.listLabel")}>
              {profiles.map((profile) => {
                const stat = profileStats[profile.id];
                return (
                  <button
                    className={profile.id === profileDraft.id ? "active" : ""}
                    key={profile.id}
                    type="button"
                    onClick={() => {
                      setEditingProfileId(profile.id);
                      setProfileDeleteCandidate(null);
                    }}
                  >
                    <span className="profile-avatar">{getProfileInitials(profile)}</span>
                    <span>
                      <strong>{profile.name}</strong>
                      <small>
                        {useEnglishLanguageNames
                          ? profile.learningProfile.targetLanguage.nameEn
                          : profile.learningProfile.targetLanguage.nameKo}{" "}
                        →{" "}
                        {useEnglishLanguageNames
                          ? profile.learningProfile.nativeLanguage.nameEn
                          : profile.learningProfile.nativeLanguage.nameKo}
                      </small>
                      <small>
                        {t("settings.profile.cardsCount", { count: stat?.cardCount ?? 0 })} ·{" "}
                        {t("settings.profile.reviewsCount", { count: stat?.dueCount ?? 0 })}
                      </small>
                    </span>
                  </button>
                );
              })}
              <button type="button" onClick={createProfile}>
                <span className="profile-avatar muted-avatar">
                  <Plus size={16} />
                </span>
                <span>
                  <strong>{t("settings.profile.new")}</strong>
                  <small>{t("settings.profile.newDescription")}</small>
                </span>
              </button>
            </div>
            <div className="profile-editor-panel">
              <label className="field-label">
                {t("settings.profile.name")}
                <input
                  className="text-input"
                  value={profileDraft.name}
                  onChange={(event) =>
                    setProfileDraft({
                      ...profileDraft,
                      name: event.target.value
                    })
                  }
                />
              </label>
              <LanguageProfileEditor
                label={t("settings.profile.targetLanguage")}
                language={profileDraft.learningProfile.targetLanguage}
                onChange={(targetLanguage) =>
                  setProfileDraft({
                    ...profileDraft,
                    learningProfile: {
                      ...profileDraft.learningProfile,
                      targetLanguage
                    }
                  })
                }
              />
              <LanguageProfileEditor
                label={t("settings.profile.nativeLanguage")}
                language={profileDraft.learningProfile.nativeLanguage}
                onChange={(nativeLanguage) =>
                  setProfileDraft({
                    ...profileDraft,
                    learningProfile: {
                      ...profileDraft.learningProfile,
                      nativeLanguage
                    }
                  })
                }
              />
              <div className="profile-scope-strip">
                <span>{t("nav.cards")}</span>
                <span>{t("nav.review")}</span>
                <span>{t("settings.profile.documents")}</span>
                <span>{t("settings.profile.translationCache")}</span>
                <strong>{t("settings.profile.lifeLogSharedLong")}</strong>
              </div>
              {profileDeleteCandidate?.id === profileDraft.id ? (
                <div className="profile-delete-confirm">
                  <AlertTriangle size={18} />
                  <div>
                    <strong>
                      {t("settings.profile.deleteConfirmTitle", { name: profileDraft.name })}
                    </strong>
                    <small>{t("settings.profile.deleteConfirmDescription")}</small>
                    {profileDeleteError ? (
                      <small aria-live="assertive" role="alert">{profileDeleteError}</small>
                    ) : null}
                  </div>
                  <button
                    className="button secondary"
                    disabled={deletingProfileId === profileDraft.id}
                    type="button"
                    onClick={() => setProfileDeleteCandidate(null)}
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    className="button secondary danger-button"
                    disabled={deletingProfileId === profileDraft.id}
                    type="button"
                    onClick={() => void deleteProfile(profileDraft.id)}
                  >
                    {deletingProfileId === profileDraft.id
                      ? t("settings.profile.deleting")
                      : t("settings.profile.deletePermanently")}
                  </button>
                </div>
              ) : null}
              <div className="profile-editor-actions">
                <button className="button primary" type="button" onClick={saveProfileDraft}>
                  <CheckCircle2 size={17} />
                  {t("common.save")}
                </button>
                <button className="button secondary" type="button" onClick={() => duplicateProfile(profileDraft)}>
                  <Copy size={17} />
                  {t("settings.profile.duplicate")}
                </button>
                <button
                  className="button secondary danger-button"
                  disabled={profiles.length <= 1 || profileDraft.id === DEFAULT_PROFILE_ID}
                  type="button"
                  onClick={() => {
                    setProfileDeleteError("");
                    setProfileDeleteCandidate(profileDraft);
                  }}
                >
                  <Trash2 size={17} />
                  {t("common.delete")}
                </button>
              </div>
              {profileDraft.id === DEFAULT_PROFILE_ID ? (
                <p className="muted compact" role="note">
                  {t("settings.profile.defaultCannotDelete")}
                </p>
              ) : null}
            </div>
          </div>
        </Dialog>
      ) : null}

      {activeSettingsTab === "ai" && !normalizedSettingsSearch ? (
        <SettingsAiOverviewPanel settings={settings} />
      ) : null}

      <SettingsCardEnginePanel
        className={getSettingsPanelClass("cardEngine", "settings-ai-panel")}
        connectionStatus={connectionStatus}
        isTestingConnection={isTestingConnection}
        showOllamaSettings={normalizedSettingsSearch.includes("ollama")}
        settings={settings}
        onSettingsChange={update}
        onTestConnection={() => void testConnection()}
      />

      <section className={getSettingsPanelClass("apiUsage", "api-usage-panel settings-ai-panel")}>
        <div className="settings-ai-section-heading">
          <span className="settings-ai-step">2</span>
          <div>
            <h2>{t("settings.api.title")}</h2>
            <p>{t("settings.api.description")}</p>
          </div>
        </div>

        <div className="settings-ai-subsection">
          <div className="settings-subsection-heading">
            <strong>{t("settings.api.translationEngine")}</strong>
            <small>{t("settings.api.translationEngineDescription")}</small>
          </div>
          <div
            aria-label={t("settings.api.translationEngine")}
            className="settings-provider-grid five"
            role="group"
          >
            {translationProviderPresets.map((preset) => (
              <button
                aria-pressed={settings.translationProviderName === preset.value}
                className={settings.translationProviderName === preset.value ? "active" : ""}
                key={preset.value}
                type="button"
                onClick={() => update({ translationProviderName: preset.value })}
              >
                <span>
                  <strong>{t(preset.labelKey)}</strong>
                  <small>{t(preset.descriptionKey)}</small>
                </span>
                {settings.translationProviderName === preset.value ? (
                  <CheckCircle2 size={17} />
                ) : null}
              </button>
            ))}
          </div>

          <div className="settings-provider-detail">
            {settings.translationProviderName === "localMt" || Boolean(normalizedSettingsSearch) ? (
              <>
                <label className="field-label">
                  {t("settings.api.localModel")}
                  <input
                    className="text-input"
                    value={settings.localMtModel || DEFAULT_LOCAL_MT_MODEL}
                    onChange={(event) => update({ localMtModel: event.target.value })}
                  />
                </label>
                <p className="muted compact">
                  {t("settings.api.localModelHint")}
                </p>
              </>
            ) : null}

            {settings.translationProviderName === "gemini" ||
            settings.providerName === "gemini" ||
            Boolean(normalizedSettingsSearch) ? (
              <>
                <div className="settings-two-column">
                  <label className="field-label">
                    {t("settings.api.geminiKey")}
                    <input
                      autoComplete="off"
                      className="text-input"
                      data-qa="settings-gemini-api-key"
                      placeholder={t("settings.api.keyPlaceholder")}
                      type="password"
                      value={settings.geminiApiKey}
                      onChange={(event) => update({ geminiApiKey: event.target.value })}
                    />
                  </label>
                  <label className="field-label">
                    {t("settings.api.geminiModel")}
                    <input
                      className="text-input"
                      value={settings.geminiModel}
                      onChange={(event) => update({ geminiModel: event.target.value })}
                    />
                  </label>
                </div>
                <div
                  aria-label={t("settings.api.geminiPresets")}
                  className="model-preset-grid settings-preset-grid gemini"
                >
                  {geminiModelPresets.map((preset) => (
                    <button
                      aria-pressed={settings.geminiModel === preset.value}
                      className={
                        settings.geminiModel === preset.value
                          ? "model-preset-button active"
                          : "model-preset-button"
                      }
                      key={preset.value}
                      type="button"
                      onClick={() => update({ geminiModel: preset.value })}
                    >
                      <strong>{t(preset.labelKey)}</strong>
                      <span>{preset.value}</span>
                      <small>{t(preset.descriptionKey)}</small>
                    </button>
                  ))}
                </div>
                <label className="field-label settings-plan-field">
                  {t("settings.api.geminiPlan")}
                  <div
                    aria-label={t("settings.api.geminiPlan")}
                    className="segmented-control"
                    role="group"
                  >
                    {(["free", "paid"] as const).map((plan) => (
                      <button
                        aria-pressed={settings.geminiPlan === plan}
                        className={settings.geminiPlan === plan ? "active" : ""}
                        key={plan}
                        type="button"
                        onClick={() => update({ geminiPlan: plan })}
                      >
                        {plan === "free"
                          ? t("settings.api.freePlanSelection")
                          : t("settings.api.paidPlan")}
                      </button>
                    ))}
                  </div>
                  <small>{t("settings.api.planHint")}</small>
                </label>
              </>
            ) : null}

            {settings.translationProviderName === "google" || Boolean(normalizedSettingsSearch) ? (
              <label className="field-label">
                {t("settings.api.googleKey")}
                <input
                  autoComplete="off"
                  className="text-input"
                  data-qa="settings-google-translate-api-key"
                  placeholder={t("settings.api.googleKeyPlaceholder")}
                  type="password"
                  value={settings.googleTranslateApiKey}
                  onChange={(event) => update({ googleTranslateApiKey: event.target.value })}
                />
              </label>
            ) : null}

            {settings.translationProviderName === "local" ? (
              <div className="settings-selected-provider-note" role="status">
                <Settings size={16} />
                <span>{t("settings.api.ollamaSharedSettings")}</span>
              </div>
            ) : null}
            {settings.translationProviderName === "browser" ? (
              <div className="settings-selected-provider-note" role="status">
                <Settings size={16} />
                <span>{t("settings.api.browserTranslationHint")}</span>
              </div>
            ) : null}
            {settings.geminiApiKey.trim() ||
            settings.googleTranslateApiKey.trim() ||
            secureSettingsStatus?.geminiApiKeyConfigured ||
            secureSettingsStatus?.googleTranslateApiKeyConfigured ? (
              <div className="profile-editor-actions">
                {settings.geminiApiKey.trim() || secureSettingsStatus?.geminiApiKeyConfigured ? (
                  <button
                    className="button secondary danger-button"
                    type="button"
                    onClick={() => update({ geminiApiKey: "" })}
                  >
                    {t("settings.api.deleteGeminiKey")}
                  </button>
                ) : null}
                {settings.googleTranslateApiKey.trim() ||
                secureSettingsStatus?.googleTranslateApiKeyConfigured ? (
                  <button
                    className="button secondary danger-button"
                    type="button"
                    onClick={() => update({ googleTranslateApiKey: "" })}
                  >
                    {t("settings.api.deleteGoogleKey")}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <button
            className="button secondary settings-connection-button"
            data-qa="settings-translation-engine-test"
            disabled={isTestingTranslationConnection}
            type="button"
            onClick={() => void testTranslationConnection()}
          >
            <CheckCircle2 size={18} />
            {isTestingTranslationConnection
              ? t("settings.connection.testing")
              : settings.translationProviderName === "localMt"
                ? t("settings.api.prepareLocalMt")
                : t("settings.api.testTranslation")}
          </button>
          {translationConnectionStatus ? (
            <p
              aria-live="polite"
              className={getSettingsStatusClassName(translationConnectionStatus)}
              role="status"
            >
              {translationConnectionStatus}
            </p>
          ) : null}
        </div>

        {api.secureSettings ? (
          <div
            className={
              secureSettingsStatus?.available === false
                ? "settings-security-note danger"
                : "settings-security-note"
            }
            role="status"
          >
            {secureSettingsStatus?.available === false ? (
              <AlertTriangle size={18} />
            ) : (
              <CheckCircle2 size={18} />
            )}
            <span>
              <strong>{t("settings.api.secureStorageTitle")}</strong>
              <small>
                {secureSettingsStatus?.available === false
                  ? t("settings.api.secureStorageUnavailable")
                  : t("settings.api.secureStorageAvailable", {
                      gemini:
                        secureSettingsStatus?.geminiApiKeyConfigured ||
                        settings.geminiApiKey.trim()
                          ? t("settings.api.configured")
                          : t("settings.api.notConfigured"),
                      google:
                        secureSettingsStatus?.googleTranslateApiKeyConfigured ||
                        settings.googleTranslateApiKey.trim()
                          ? t("settings.api.configured")
                          : t("settings.api.notConfigured")
                    })}
              </small>
            </span>
          </div>
        ) : null}

        <div className="settings-ai-subsection">
          <div className="settings-subsection-heading">
            <strong>{t("settings.usage.title")}</strong>
            <small>{t("settings.usage.description")}</small>
          </div>
          <div className="api-usage-summary">
            <div>
              <span>{t("settings.usage.currentEngine")}</span>
              <strong>
                {activeTranslationProviderPreset
                  ? t(activeTranslationProviderPreset.labelKey)
                  : settings.translationProviderName}
              </strong>
            </div>
            <div>
              <span>{t("settings.usage.dailyAppLimit")}</span>
              <strong>
                {t("settings.usage.tokens", { value: usagePreview.dailyLimitLabel })}
              </strong>
            </div>
            <div>
              <span>{t("settings.usage.monthlyGuard")}</span>
              <strong>{usagePreview.monthlyLimitLabel}</strong>
            </div>
          </div>
          <div className="settings-two-column">
            <label className="field-label">
              {t("settings.usage.dailyTokenGuard")}
              <input
                className="text-input"
                min={1}
                type="number"
                value={settings.dailyAppTokenLimit}
                onChange={(event) =>
                  update({ dailyAppTokenLimit: Number(event.target.value) || 1 })
                }
              />
            </label>
            <label className="field-label">
              {t("settings.usage.monthlyGuardKrw")}
              <input
                className="text-input"
                min={0}
                type="number"
                value={settings.monthlySpendLimitKrw}
                onChange={(event) =>
                  update({ monthlySpendLimitKrw: Number(event.target.value) || 0 })
                }
              />
            </label>
          </div>
          <div className="settings-ai-toggle-groups">
            <div>
              <strong>{t("settings.usage.preflight")}</strong>
              <label className="toggle-field compact-toggle">
                <input
                  checked={settings.confirmEstimatedCostBeforeRun}
                  type="checkbox"
                  onChange={(event) =>
                    update({ confirmEstimatedCostBeforeRun: event.target.checked })
                  }
                />
                <span>
                  <strong>{t("settings.usage.bookPreflight")}</strong>
                  <small>{t("settings.usage.bookPreflightDescription")}</small>
                </span>
              </label>
              <label className="toggle-field compact-toggle">
                <input
                  checked={settings.confirmLifeMiningCardCost}
                  type="checkbox"
                  onChange={(event) =>
                    update({ confirmLifeMiningCardCost: event.target.checked })
                  }
                />
                <span>
                  <strong>{t("settings.usage.lifeMiningPreflight")}</strong>
                  <small>{t("settings.usage.lifeMiningPreflightDescription")}</small>
                </span>
              </label>
            </div>
            <div>
              <strong>{t("settings.usage.stopNewWork")}</strong>
              <label className="toggle-field compact-toggle">
                <input
                  checked={settings.stopOnFreeTierLimit}
                  type="checkbox"
                  onChange={(event) => update({ stopOnFreeTierLimit: event.target.checked })}
                />
                <span>
                  <strong>{t("settings.usage.dailyTokenGuard")}</strong>
                  <small>{t("settings.usage.dailyTokenGuardDescription")}</small>
                </span>
              </label>
              <label className="toggle-field compact-toggle">
                <input
                  checked={settings.stopOnMonthlyLimit}
                  type="checkbox"
                  onChange={(event) => update({ stopOnMonthlyLimit: event.target.checked })}
                />
                <span>
                  <strong>{t("settings.usage.monthlyGuard")}</strong>
                  <small>{t("settings.usage.monthlyGuardDescription")}</small>
                </span>
              </label>
            </div>
          </div>
        </div>

        <p className="selection-warning">{t("settings.usage.disclaimer")}</p>

        <div className="settings-ai-subsection subtle">
          <div className="settings-subsection-heading">
            <strong>{t("settings.pdf.title")}</strong>
            <small>{t("settings.pdf.description")}</small>
          </div>
          <label className="toggle-field compact-toggle">
            <input
              checked={settings.showPdfSourceHighlights}
              type="checkbox"
              onChange={(event) => update({ showPdfSourceHighlights: event.target.checked })}
            />
            <span>
              <strong>{t("settings.pdf.showSourceBoxes")}</strong>
              <small>{t("settings.pdf.showSourceBoxesDescription")}</small>
            </span>
          </label>
          <label className="field-label settings-plan-field">
            {t("settings.pdf.exportMode")}
            <div
              aria-label={t("settings.pdf.exportMode")}
              className="segmented-control"
              role="group"
            >
              {(["reading", "paper"] as BilingualPdfExportMode[]).map((exportMode) => (
                <button
                  aria-pressed={settings.pdfExportMode === exportMode}
                  className={settings.pdfExportMode === exportMode ? "active" : ""}
                  key={exportMode}
                  type="button"
                  onClick={() => update({ pdfExportMode: exportMode })}
                >
                  {exportMode === "reading"
                    ? t("settings.pdf.readingMode")
                    : t("settings.pdf.paperMode")}
                </button>
              ))}
            </div>
          </label>
          <p className="muted compact">
            {t("settings.pdf.paperModeHint")}
          </p>
        </div>
      </section>

      <SettingsTtsPanel
        className={getSettingsPanelClass("tts", "settings-ai-panel")}
        settings={settings}
        showUnavailableDetails={normalizedSettingsSearch.includes("piper")}
        onSettingsChange={update}
      />

      <section className={getSettingsPanelClass("capture")}>
        <div className="panel-heading">
          <Settings size={19} />
          <h2>{t("settings.capture.title")}</h2>
        </div>
        <label className="field-label">
          {t("settings.capture.shortcut")}
          <input
            className="text-input"
            data-qa="settings-capture-shortcut"
            placeholder="Ctrl+Q"
            value={settings.captureShortcut}
            onChange={(event) => update({ captureShortcut: event.target.value || "Ctrl+Q" })}
          />
        </label>
        <p className="muted compact">
          {t("settings.capture.shortcutHint")}
        </p>
        <label className="toggle-field">
          <input
            checked={settings.browserSelectionCardMode === "autoSave"}
            type="checkbox"
            onChange={(event) =>
              update({
                browserSelectionCardMode: event.target.checked ? "autoSave" : "preview"
              })
            }
          />
          <span>
            <strong>{t("settings.capture.autoSaveSelection")}</strong>
            <small>{t("settings.capture.autoSaveSelectionHint")}</small>
          </span>
        </label>
        <div className="capture-site-settings">
          <div>
            <strong>{t("settings.capture.lifeMiningUnit")}</strong>
            <small>{t("settings.capture.lifeMiningUnitHint")}</small>
          </div>
          <label className="toggle-field">
            <input
              checked={lifeMiningCaptureSettings.enabled}
              data-qa="settings-life-mining-enabled"
              type="checkbox"
              onChange={(event) => updateLifeMiningCaptureConsent(event.target.checked)}
            />
            <span>
              <strong>{t("settings.capture.lifeMiningAutomatic")}</strong>
              <small>{t("settings.capture.lifeMiningAutomaticHint")}</small>
            </span>
          </label>
          <div className="model-preset-grid">
            {lifeMiningPresetOptions.map((option) => (
              <button
                aria-pressed={lifeMiningCaptureSettings.preset === option.value}
                className={
                  lifeMiningCaptureSettings.preset === option.value
                    ? "model-preset-button active"
                    : "model-preset-button"
                }
                data-qa={`settings-life-mining-preset-${option.value}`}
                key={option.value}
                type="button"
                onClick={() => applyLifeMiningPreset(option.value)}
              >
                <strong>{t(option.labelKey)}</strong>
                <small>{t(option.descriptionKey)}</small>
              </button>
            ))}
            <button
              aria-pressed={lifeMiningCaptureSettings.preset === "custom"}
              className={
                lifeMiningCaptureSettings.preset === "custom"
                  ? "model-preset-button active"
                  : "model-preset-button"
              }
              type="button"
              onClick={() => updateLifeMiningCaptureSettings({ preset: "custom" })}
            >
              <strong>{t("settings.capture.custom")}</strong>
              <small>{t("settings.capture.customHint")}</small>
            </button>
          </div>
          <label className="field-label">
            {t("settings.capture.target")}
            <div
              aria-label={t("settings.capture.targetLabel")}
              className="segmented-control"
              role="group"
            >
              {lifeMiningTargetOptions.map((option) => (
                <button
                  aria-pressed={lifeMiningCaptureSettings.target === option.value}
                  className={lifeMiningCaptureSettings.target === option.value ? "active" : ""}
                  key={option.value}
                  type="button"
                  onClick={() => updateLifeMiningCaptureSettings({ target: option.value })}
                >
                  {t(option.labelKey)}
                </button>
              ))}
            </div>
            <small>{selectedLifeTargetOption ? t(selectedLifeTargetOption.descriptionKey) : null}</small>
          </label>
          <label className="field-label">
            {t("settings.capture.scope")}
            <div
              aria-label={t("settings.capture.scopeLabel")}
              className="segmented-control"
              role="group"
            >
              {lifeMiningScopeOptions.map((option) => (
                <button
                  aria-pressed={lifeMiningCaptureSettings.scope === option.value}
                  className={lifeMiningCaptureSettings.scope === option.value ? "active" : ""}
                  key={option.value}
                  type="button"
                  onClick={() => updateLifeMiningCaptureSettings({ scope: option.value })}
                >
                  {t(option.labelKey)}
                </button>
              ))}
            </div>
            <small>{selectedLifeScopeOption ? t(selectedLifeScopeOption.descriptionKey) : null}</small>
          </label>
          <div className="settings-two-column">
            <label className="field-label">
              {t("settings.capture.context")}
              <select
                className="text-input"
                value={lifeMiningCaptureSettings.contextMode}
                onChange={(event) =>
                  updateLifeMiningCaptureSettings({
                    contextMode: event.target.value as LifeMiningCaptureSettings["contextMode"]
                  })
                }
              >
                {lifeMiningContextOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              {t("settings.capture.contextBefore")}
              <input
                className="text-input"
                min={0}
                max={20}
                step={1}
                type="number"
                value={lifeMiningCaptureSettings.contextBeforeCount}
                onChange={(event) =>
                  updateLifeMiningCaptureSettings({
                    contextBeforeCount: Number(event.target.value)
                  })
                }
              />
            </label>
          </div>
          <div className="settings-two-column">
            <label className="field-label">
              {t("settings.capture.contextAfter")}
              <input
                className="text-input"
                min={0}
                max={10}
                step={1}
                type="number"
                value={lifeMiningCaptureSettings.contextAfterCount}
                onChange={(event) =>
                  updateLifeMiningCaptureSettings({
                    contextAfterCount: Number(event.target.value)
                  })
                }
              />
            </label>
            <label className="field-label">
              {t("settings.capture.maxChars")}
              <input
                className="text-input"
                min={300}
                max={6000}
                step={100}
                type="number"
                value={lifeMiningCaptureSettings.maxMessageChars}
                onChange={(event) =>
                  updateLifeMiningCaptureSettings({
                    maxMessageChars: Number(event.target.value) || 1500
                  })
                }
              />
            </label>
          </div>
          <div className="settings-two-column">
            <label className="field-label">
              {t("settings.capture.longMessage")}
              <select
                className="text-input"
                value={lifeMiningCaptureSettings.longMessageMode}
                onChange={(event) =>
                  updateLifeMiningCaptureSettings({
                    longMessageMode: event.target.value as LifeMiningCaptureSettings["longMessageMode"]
                  })
                }
              >
                <option value="truncate">{t("settings.capture.truncate")}</option>
                <option value="skip">{t("settings.capture.skipLong")}</option>
              </select>
            </label>
            <label className="toggle-field compact-toggle">
              <input
                checked={lifeMiningCaptureSettings.dedupeEnabled}
                type="checkbox"
                onChange={(event) =>
                  updateLifeMiningCaptureSettings({ dedupeEnabled: event.target.checked })
                }
              />
              <span>
                <strong>{t("settings.capture.dedupe")}</strong>
                <small>{t("settings.capture.dedupeHint")}</small>
              </span>
            </label>
          </div>
          <label className="toggle-field compact-toggle">
            <input
              checked={lifeMiningCaptureSettings.filterLowSignalTargets}
              type="checkbox"
              onChange={(event) =>
                updateLifeMiningCaptureSettings({
                  filterLowSignalTargets: event.target.checked
                })
              }
            />
            <span>
              <strong>{t("settings.capture.filterLowSignal")}</strong>
              <small>{t("settings.capture.filterLowSignalHint")}</small>
            </span>
          </label>
        </div>
        <div className="capture-site-settings">
          <div>
            <strong>{t("settings.capture.sitesTitle")}</strong>
            <small>{t("settings.capture.sitesHint")}</small>
          </div>
          <div className="capture-site-grid">
            {browserCaptureSiteOptions.map((option) => (
              <label className="toggle-field compact-toggle" key={option.key}>
                <input
                  checked={settings.browserCaptureSiteSettings[option.key] === true}
                  data-qa={`settings-capture-site-${option.key}`}
                  disabled={!lifeMiningCaptureSettings.enabled}
                  type="checkbox"
                  onChange={(event) => updateBrowserCaptureSite(option.key, event.target.checked)}
                />
                <span>
                  <strong>{t(option.labelKey)}</strong>
                  <small>{t(option.descriptionKey)}</small>
                </span>
              </label>
            ))}
          </div>
          <div className="profile-scope-strip" data-qa="settings-life-miner-bridge-status">
            <span>{t("settings.capture.bridgeTitle")}</span>
            <strong>
              {bridgePairingStatus?.paired
                ? t("settings.capture.connected")
                : t("settings.capture.disconnected")}
            </strong>
            <span>
              {bridgePairingStatus?.origin ?? t("settings.capture.bridgeOriginHint")}
            </span>
          </div>
          <p className="muted compact">
            {t("settings.capture.bridgeHint")}
          </p>
          <p className="selection-warning" role="note">
            {t("settings.capture.bridgeForgetHint")}
          </p>
          {bridgePairingMessage ? (
            <p aria-live="polite" className="status-text" role="status">
              {bridgePairingMessage}
            </p>
          ) : null}
          <div className="profile-editor-actions">
            <button
              className="button secondary"
              data-qa="settings-life-miner-bridge-rotate"
              disabled={!api.lifeMinerBridge || isUpdatingBridgePairing}
              type="button"
              onClick={() => void updateBridgePairing("rotate")}
            >
              {t("settings.capture.rotateToken")}
            </button>
            <button
              className="button secondary danger-button"
              data-qa="settings-life-miner-bridge-revoke"
              disabled={
                !api.lifeMinerBridge ||
                isUpdatingBridgePairing ||
                !bridgePairingStatus?.paired
              }
              type="button"
              onClick={() => setPendingSettingsConfirmation({ kind: "bridgeRevoke" })}
            >
              {t("settings.capture.revoke")}
            </button>
            <button
              className="button secondary danger-button"
              data-qa="settings-life-miner-bridge-forget"
              disabled={
                !api.lifeMinerBridge || isUpdatingBridgePairing || privacyDeletionInProgress
              }
              type="button"
              onClick={() => {
                setBridgeForgetConfirmation("");
                setPendingSettingsConfirmation({ kind: "bridgeForget" });
              }}
            >
              {t("settings.capture.forgetUninstalledExtension")}
            </button>
          </div>
        </div>
      </section>

      <section className={getSettingsPanelClass("sync")}>
        <div className="panel-heading">
          <FolderOpen size={19} />
          <h2>{t("settings.sync.title")}</h2>
        </div>
        <label className="field-label">
          {t("settings.sync.folder")}
          <input
            className="text-input"
            placeholder={t("settings.sync.folderPlaceholder")}
            value={settings.cardSyncFolderPath}
            onChange={(event) => update({ cardSyncFolderPath: event.target.value })}
          />
        </label>
        {!hasSyncFolder ? (
          <p className="selection-warning" role="status">
            {t("settings.sync.folderRequiredForAutomatic")}
          </p>
        ) : null}
        <div className="settings-two-column">
          <label className="toggle-field">
            <input
              checked={hasSyncFolder && settings.cardSyncOnStartup}
              disabled={!hasSyncFolder}
              type="checkbox"
              onChange={(event) => update({ cardSyncOnStartup: event.target.checked })}
            />
            <span>
              <strong>{t("settings.sync.onStartup")}</strong>
              <small>{t("settings.sync.onStartupHint")}</small>
            </span>
          </label>
          <label className="toggle-field">
            <input
              checked={hasSyncFolder && settings.cardSyncOnQuit}
              disabled={!hasSyncFolder}
              type="checkbox"
              onChange={(event) => update({ cardSyncOnQuit: event.target.checked })}
            />
            <span>
              <strong>{t("settings.sync.onQuit")}</strong>
              <small>{t("settings.sync.onQuitHint")}</small>
            </span>
          </label>
        </div>
        <p className="muted compact">
          {t("settings.sync.actionsHint")}
        </p>
        {syncFolderMayUploadExternally ? (
          <p className="selection-warning" role="alert">
            {t("settings.sync.externalFolderWarning")}
          </p>
        ) : null}
      </section>

      <section className={getSettingsPanelClass("background")}>
        <div className="panel-heading">
          <Settings size={19} />
          <h2>{t("settings.background.title")}</h2>
        </div>
        <div className="background-status-card">
          <strong>{t("settings.background.tray")}</strong>
          <small>{t("settings.background.trayHint")}</small>
          <span className={runtimeStatus?.trayAvailable ? "status-pill active" : "status-pill"}>
            {runtimeStatus?.trayAvailable
              ? t("settings.background.on")
              : t("settings.connection.testing")}
          </span>
        </div>
        <label className="toggle-field">
          <input
            checked={Boolean(runtimeStatus?.launchAtLogin)}
            data-qa="settings-launch-at-login"
            disabled={!runtimeStatus?.canConfigureLaunchAtLogin}
            type="checkbox"
            onChange={(event) => void updateLaunchAtLogin(event.target.checked)}
          />
          <span>
            <strong>{t("settings.background.launchAtLogin")}</strong>
            <small>{t("settings.background.launchAtLoginHint")}</small>
          </span>
        </label>
        <label className="toggle-field">
          <input
            checked={settings.listeningLoopBackgroundPrebuildEnabled}
            data-qa="settings-listening-loop-background-prebuild"
            type="checkbox"
            onChange={(event) =>
              update({ listeningLoopBackgroundPrebuildEnabled: event.target.checked })
            }
          />
          <span>
            <strong>{t("settings.background.prebuildListening")}</strong>
            <small>{t("settings.background.prebuildListeningHint")}</small>
          </span>
        </label>
        <label className="toggle-field">
          <input
            checked={settings.listeningLoopLongVideoPartialClipsEnabled}
            data-qa="settings-listening-loop-long-video-partial-clips"
            type="checkbox"
            onChange={(event) =>
              update({ listeningLoopLongVideoPartialClipsEnabled: event.target.checked })
            }
          />
          <span>
            <strong>{t("settings.background.partialLongVideo")}</strong>
            <small>{t("settings.background.partialLongVideoHint")}</small>
          </span>
        </label>
        <p className="muted compact">
          {t("settings.background.closeBehavior")}
        </p>
        {runtimeStatusMessage ? (
          <p aria-live="polite" className="status-text" role="status">
            {runtimeStatusMessage}
          </p>
        ) : null}
      </section>

      <section className={getSettingsPanelClass("labs")}>
        <div className="panel-heading">
          <AlertTriangle size={19} />
          <h2>{t("settings.labs.title")}</h2>
        </div>
        <label className="toggle-field">
          <input
            checked={settings.labsHideGlossaryNavigation}
            data-qa="settings-labs-hide-glossary-navigation"
            type="checkbox"
            onChange={(event) => update({ labsHideGlossaryNavigation: event.target.checked })}
          />
          <span>
            <strong>{t("settings.labs.hideGlossary")}</strong>
            <small>{t("settings.labs.hideGlossaryHint")}</small>
          </span>
        </label>
        <label className="toggle-field">
          <input
            checked={settings.labsHideSidebarNavigation}
            data-qa="settings-labs-hide-sidebar-navigation"
            type="checkbox"
            onChange={(event) => update({ labsHideSidebarNavigation: event.target.checked })}
          />
          <span>
            <strong>{t("settings.labs.hideNavigation")}</strong>
            <small>{t("settings.labs.hideNavigationHint")}</small>
          </span>
        </label>
        <p className="muted compact">
          {t("settings.labs.hint")}
        </p>
      </section>

      <section className={getSettingsPanelClass("developer")}>
        <div className="panel-heading">
          <Settings size={19} />
          <h2>{t("settings.developer.title")}</h2>
        </div>
        <div className="developer-options-panel">
          <strong>{t("settings.developer.tools")}</strong>
        <label className="toggle-field">
          <input
            checked={settings.debugMode}
            data-qa="settings-debug-mode"
            type="checkbox"
            onChange={(event) => update({ debugMode: event.target.checked })}
          />
          <span>
            <strong>{t("settings.developer.debugMode")}</strong>
            <small>{t("settings.developer.debugModeHint")}</small>
          </span>
        </label>
        <label className="field-label">
          {t("settings.developer.pdfPath")}
          <input
            className="text-input"
            value={settings.debugPdfPath}
            onChange={(event) => update({ debugPdfPath: event.target.value })}
          />
        </label>
        <p className="muted compact">
          {t("settings.developer.pdfPathHint")}
        </p>
        </div>
      </section>

      <section className={getSettingsPanelClass("privacy")}>
        <div className="panel-heading">
          <Settings size={19} />
          <h2>{t("settings.privacy.title")}</h2>
        </div>
        <ul className="settings-list">
          <li>{t("settings.privacy.localData")}</li>
          <li>{t("settings.privacy.plaintextData")}</li>
          <li>{t("settings.privacy.googleTransfer")}</li>
          <li>{t("settings.privacy.lifeMiningOptIn")}</li>
          <li>{t("settings.privacy.noKeylogging")}</li>
        </ul>
      </section>

      <SettingsPrivacyControls
        api={api}
        className={getSettingsPanelClass("privacy", "settings-privacy-controls-panel")}
        deletionInProgress={privacyDeletionInProgress}
        onDeleteError={onPrivacyDeleteError}
        onDeleteResult={onPrivacyDeleteResult}
        onDeleteStart={onPrivacyDeleteStart}
      />

      <SettingsBackupPanel
        api={api}
        className={getSettingsPanelClass("export")}
        profiles={profiles}
      />

      </main>

      {isProfileSwitcherOpen ? (
        <SettingsProfileSwitcher
          activeProfileId={activeProfileId}
          profileStats={profileStats}
          profiles={profiles}
          onClose={() => setIsProfileSwitcherOpen(false)}
          onCreateProfile={createProfile}
          onOpenManager={() => openProfileManager()}
          onSelectProfile={selectProfile}
        />
      ) : null}
    </div>
  );
}
