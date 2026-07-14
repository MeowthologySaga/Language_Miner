import "../styles/characterChat.css";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Download,
  FileJson,
  Languages,
  Lightbulb,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  Send,
  Settings,
  Sparkles,
  Square,
  Trash2,
  Upload,
  X
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode
} from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Dialog } from "../components/Dialog";
import type { LocalEnglishMinerApi } from "../data/api";
import type { LLMProvider } from "../services/llm/types";
import {
  CHARACTER_CORRECTION_STORAGE_KEY,
  CHARACTER_DEFAULT_MOLLY_DISMISSED_STORAGE_KEY,
  CHARACTER_DEFAULT_MOLLY_SEEDED_STORAGE_KEY,
  CHARACTER_MODE_STORAGE_KEY,
  CHARACTER_PRESETS_STORAGE_KEY,
  CHARACTER_SESSION_STORAGE_KEY,
  calculateCharacterCardSha256,
  characterEmotionOptions,
  createDefaultCharacterPreset,
  ensureDefaultMollyPreset,
  exportCharacterPresetAsLanguageMinerPack,
  exportCharacterPresetAsTavernV2,
  getCharacterExpressionImageCount,
  getCharacterImageUrls,
  hasCharacterExpressionImages,
  inspectCharacterPackJson,
  isDefaultMollyPreset,
  isRemoteCharacterImageUrl,
  isRunnableCharacterPreset,
  parseCharacterChatReply,
  replaceCharacterMacros,
  selectCharacterRagHints,
  type CharacterPackPermission,
  type CharacterPackStatus,
  type InspectedCharacterPreset
} from "../shared/characterCards";
import { createCharacterChatLifeLogInput } from "../shared/characterChatLifeLog";
import { randomId } from "../shared/ids";
import { isRemoteOllamaUrl } from "../shared/localEndpointPolicy";
import { isAbortError } from "../shared/translationRequestLimits";
import { GEMINI_MAX_ATTEMPTS_PER_REQUEST } from "../shared/geminiTranslation";
import { estimateTranslationUsage } from "../shared/translationUsage";
import { summarizeAppTranslationUsage } from "../utils/translationUsageLedger";
import { rendererPrivacyLifecycle } from "../rendererPrivacyLifecycle";
import type {
  AppSettings,
  CharacterChatMessage,
  CharacterChatMode,
  CharacterCorrectionMode,
  CharacterEmotion,
  CharacterPreset,
  StudyCard
} from "../shared/types";

type CharacterChatPageProps = {
  api: LocalEnglishMinerApi;
  cards: StudyCard[];
  provider: LLMProvider;
  settings: AppSettings;
  onLifeLogsChanged: () => Promise<void>;
  onNavigate?: (route: "life") => void;
};

type CharacterSessions = Record<string, CharacterChatMessage[]>;
type CharacterChatView = "home" | "chat" | "manage";
type CharacterRagHints = ReturnType<typeof selectCharacterRagHints>;

type PendingCharacterImport = {
  inspected: InspectedCharacterPreset;
  localizedWarnings: string[];
  sha256: string;
};

type CharacterPackExportDraft = {
  creator: string;
  sourceUrl: string;
  license: string;
  version: string;
  releaseNotes: string;
};

type CharacterPackExportField = keyof CharacterPackExportDraft;
type CharacterPackExportErrors = Partial<Record<CharacterPackExportField, string>>;

type PendingCharacterExternalRequest = {
  content: string;
  presetId: string;
  previousMessages: CharacterChatMessage[];
  ragHints: CharacterRagHints;
  preflight: CharacterExternalPreflight;
};

type CharacterExternalPreflight = {
  usesGemini: boolean;
  recentMessageCount: number;
  hintCount: number;
  estimatedCostKrw: { min: number; max: number } | null;
  monthEstimateKrw: number;
};

type PendingCharacterAction = {
  id: string;
  name: string;
};

type PendingRemoteImageApproval = PendingCharacterAction & {
  urls: string[];
};

const legacyMinaFirstMessage = "Hey. You look like you have something on your mind. What happened?";
const approvedRemoteCharacterImageUrls = new Set<string>();

const correctionModeOptions: CharacterCorrectionMode[] = [
  "off",
  "instant",
  "turn_summary",
  "session_summary"
];

export function CharacterChatPage({
  api,
  cards,
  provider,
  settings,
  onLifeLogsChanged,
  onNavigate
}: CharacterChatPageProps) {
  const { t, i18n } = useTranslation();
  const isEnglishUi = (i18n.resolvedLanguage ?? i18n.language).startsWith("en");
  const localeTag = isEnglishUi ? "en-US" : "ko-KR";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const dialogCancelButtonRef = useRef<HTMLButtonElement>(null);
  const exportCreatorInputRef = useRef<HTMLInputElement>(null);
  const exportSourceUrlInputRef = useRef<HTMLInputElement>(null);
  const exportLicenseInputRef = useRef<HTMLInputElement>(null);
  const exportVersionInputRef = useRef<HTMLInputElement>(null);
  const exportReleaseNotesInputRef = useRef<HTMLTextAreaElement>(null);
  const [presets, setPresets] = useState<CharacterPreset[]>(() => readCharacterPresets());
  const [, setRemoteImageApprovalRevision] = useState(0);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [sessions, setSessions] = useState<CharacterSessions>(() => readCharacterSessions());
  const [chatMode, setChatMode] = useState<CharacterChatMode>(() => readCharacterChatMode());
  const [correctionMode, setCorrectionMode] = useState<CharacterCorrectionMode>(() =>
    readCharacterCorrectionMode()
  );
  const [characterView, setCharacterView] = useState<CharacterChatView>("home");
  const [isChatInfoVisible, setIsChatInfoVisible] = useState(false);
  const [showAllExpressionImages, setShowAllExpressionImages] = useState(false);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("");
  const [captureStatus, setCaptureStatus] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingCharacterImport | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingCharacterAction | null>(null);
  const [pendingReset, setPendingReset] = useState<PendingCharacterAction | null>(null);
  const [pendingRemoteImageApproval, setPendingRemoteImageApproval] =
    useState<PendingRemoteImageApproval | null>(null);
  const [pendingExternalRequest, setPendingExternalRequest] =
    useState<PendingCharacterExternalRequest | null>(null);
  const [exportDraft, setExportDraft] = useState<CharacterPackExportDraft | null>(null);
  const [exportErrors, setExportErrors] = useState<CharacterPackExportErrors>({});
  const [exportSubmitError, setExportSubmitError] = useState("");
  const [isExportingPack, setIsExportingPack] = useState(false);

  const selectedPreset = presets.find((preset) => preset.id === selectedPresetId) ?? presets[0];
  const selectedPresetRunnable = isRunnableCharacterPreset(selectedPreset);
  const selectedRemoteImageUrls = getCharacterImageUrls(selectedPreset).filter(
    isRemoteCharacterImageUrl
  );
  const unapprovedRemoteImageUrls = selectedRemoteImageUrls.filter(
    (url) => !approvedRemoteCharacterImageUrls.has(url)
  );
  const messages = selectedPreset ? getSessionMessages(sessions, selectedPreset) : [];
  const latestCharacterEmotion = getLatestCharacterEmotion(messages);
  const latestCharacterMessageId = getLatestCharacterMessageId(messages);
  const characterMessageCount = messages.filter((message) => message.role === "character").length;
  const userMessageCount = messages.filter((message) => message.role === "user").length;
  const latestConversationPreview = getLatestConversationPreview(
    messages,
    selectedPreset?.name ?? t("characterChat.fallbackCharacter"),
    t("characterChat.home.noConversation")
  );
  const canCollapseExpressionImages =
    hasCharacterExpressionImages(selectedPreset) && characterMessageCount > 1;
  const previewHints = useMemo(
    () =>
      chatMode === "target_practice"
        ? selectCharacterRagHints(cards, draft || messages.at(-1)?.content || "", 3)
        : [],
    [cards, chatMode, draft, messages]
  );
  const activeCorrectionMode = chatMode === "target_practice" ? correctionMode : "off";
  const targetLanguageLabel =
    (isEnglishUi
      ? settings.learningProfile.targetLanguage.nameEn
      : settings.learningProfile.targetLanguage.nameKo) ||
    settings.learningProfile.targetLanguage.nameEn ||
    settings.learningProfile.targetLanguage.nameKo ||
    t("characterChat.fallbackTargetLanguage");
  const nativeLanguageLabel =
    (isEnglishUi
      ? settings.learningProfile.nativeLanguage.nameEn
      : settings.learningProfile.nativeLanguage.nameKo) ||
    settings.learningProfile.nativeLanguage.nameEn ||
    settings.learningProfile.nativeLanguage.nameKo ||
    t("characterChat.fallbackNativeLanguage");

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      requestAbortRef.current?.abort();
      requestAbortRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!selectedPresetId && presets[0]) {
      setSelectedPresetId(presets[0].id);
    }
  }, [presets, selectedPresetId]);

  useEffect(() => {
    const seeded = ensureDefaultMollyPreset(presets);
    if (!seeded.changed) {
      return;
    }
    localStorage.removeItem(CHARACTER_DEFAULT_MOLLY_DISMISSED_STORAGE_KEY);
    updatePresets(seeded.presets);
    if (selectedPresetId && !seeded.presets.some((preset) => preset.id === selectedPresetId)) {
      setSelectedPresetId(seeded.presets[0]?.id ?? "");
    }
  }, [presets, selectedPresetId]);

  useEffect(() => {
    const migratedSessions = migrateLegacyDefaultMinaSessions(sessions, presets);
    if (migratedSessions !== sessions) {
      updateSessions(migratedSessions);
    }
    // Run once after initial storage hydration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const messageList = messageListRef.current;
    if (!messageList) {
      return;
    }
    const scrollToLatest = () => {
      messageList.scrollTop = messageList.scrollHeight;
    };
    scrollToLatest();
    requestAnimationFrame(scrollToLatest);
  }, [characterView, isChatInfoVisible, isSending, messages.length, selectedPresetId]);

  function updatePresets(next: CharacterPreset[]) {
    setPresets(next);
    localStorage.setItem(CHARACTER_PRESETS_STORAGE_KEY, JSON.stringify(next));
  }

  function updateSessions(next: CharacterSessions) {
    setSessions(next);
    localStorage.setItem(CHARACTER_SESSION_STORAGE_KEY, JSON.stringify(next));
  }

  function updateChatMode(nextMode: CharacterChatMode) {
    setChatMode(nextMode);
    setStatus("");
    setCaptureStatus("");
    localStorage.setItem(CHARACTER_MODE_STORAGE_KEY, nextMode);
  }

  function updateCorrectionMode(nextMode: CharacterCorrectionMode) {
    setCorrectionMode(nextMode);
    localStorage.setItem(CHARACTER_CORRECTION_STORAGE_KEY, nextMode);
  }

  function openChat(nextMode?: CharacterChatMode, presetId?: string) {
    const nextPreset = presetId
      ? presets.find((preset) => preset.id === presetId)
      : selectedPreset;
    if (presetId) {
      setSelectedPresetId(presetId);
    }
    if (!isRunnableCharacterPreset(nextPreset)) {
      setError(t("characterChat.importReport.legacyWarning"));
      setStatus("");
      setCaptureStatus("");
      setCharacterView("manage");
      return;
    }
    if (nextMode) {
      updateChatMode(nextMode);
    }
    setError("");
    setStatus("");
    setCaptureStatus("");
    setIsChatInfoVisible(false);
    setCharacterView("chat");
  }

  function openManage(presetId?: string) {
    if (presetId) {
      setSelectedPresetId(presetId);
    }
    setError("");
    setStatus("");
    setCaptureStatus("");
    setCharacterView("manage");
  }

  function updateSelectedPreset(patch: Partial<CharacterPreset>) {
    if (!selectedPreset) {
      return;
    }
    const updated = {
      ...selectedPreset,
      ...patch,
      updatedAt: new Date().toISOString()
    };
    updatePresets(presets.map((preset) => (preset.id === updated.id ? updated : preset)));
  }

  function updateSelectedEmotionImage(emotion: CharacterEmotion, imageUrl: string) {
    if (!selectedPreset) {
      return;
    }
    const emotionImageUrls = { ...(selectedPreset.emotionImageUrls ?? {}) };
    const trimmed = imageUrl.trim();
    if (trimmed) {
      emotionImageUrls[emotion] = trimmed;
    } else {
      delete emotionImageUrls[emotion];
    }
    updateSelectedPreset({ emotionImageUrls });
  }

  function createPreset() {
    const now = new Date().toISOString();
    const preset: CharacterPreset = {
      ...createDefaultCharacterPreset(now),
      id: randomId(),
      name: "New Character",
      description: "",
      personality: "",
      scenario: "",
      firstMessage: "Hey. What's up?",
      messageExample: "",
      alternateGreetings: [],
      tags: [],
      avatarImageUrl: "",
      emotionImageUrls: {},
      expressionFallbackEmotion: "neutral",
      sourceFormat: "local",
      createdAt: now,
      updatedAt: now
    };
    updatePresets([preset, ...presets]);
    updateSessions({
      ...sessions,
      [preset.id]: initialMessagesFromPreset(preset)
    });
    setSelectedPresetId(preset.id);
    setCharacterView("manage");
  }

  function requestDeletePreset() {
    if (isSending) {
      return;
    }
    if (!selectedPreset || presets.length <= 1) {
      setError(t("characterChat.messages.needOneCharacter"));
      return;
    }
    if (isDefaultMollyPreset(selectedPreset)) {
      setError(t("characterChat.messages.cannotDeleteDefault"));
      return;
    }
    setPendingDelete({ id: selectedPreset.id, name: selectedPreset.name });
  }

  function confirmDeletePreset() {
    if (!pendingDelete) {
      return;
    }
    const presetToDelete = presets.find((preset) => preset.id === pendingDelete.id);
    if (!presetToDelete || presets.length <= 1 || isDefaultMollyPreset(presetToDelete)) {
      setPendingDelete(null);
      setError(
        presetToDelete && isDefaultMollyPreset(presetToDelete)
          ? t("characterChat.messages.cannotDeleteDefault")
          : t("characterChat.messages.needOneCharacter")
      );
      return;
    }
    const nextPresets = presets.filter((preset) => preset.id !== pendingDelete.id);
    const nextSessions = { ...sessions };
    delete nextSessions[pendingDelete.id];
    updatePresets(nextPresets);
    updateSessions(nextSessions);
    setSelectedPresetId(nextPresets[0]?.id ?? "");
    setStatus(t("characterChat.messages.deleted", { name: pendingDelete.name }));
    setError("");
    setPendingDelete(null);
  }

  function requestResetChat() {
    if (!selectedPreset || isSending) {
      return;
    }
    setPendingReset({ id: selectedPreset.id, name: selectedPreset.name });
  }

  function confirmResetChat() {
    if (!pendingReset) {
      return;
    }
    const presetToReset = presets.find((preset) => preset.id === pendingReset.id);
    if (!presetToReset) {
      setPendingReset(null);
      return;
    }
    updateSessions({
      ...sessions,
      [presetToReset.id]: initialMessagesFromPreset(presetToReset)
    });
    setStatus(t("characterChat.messages.reset"));
    setCaptureStatus("");
    setError("");
    setPendingReset(null);
  }

  async function importPreset(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }
    setError("");
    setStatus("");
    setCaptureStatus("");
    try {
      const rawJson = await file.text();
      const inspected = await inspectCharacterPackJson(rawJson);
      const sha256 =
        inspected.report.verifiedPayloadSha256 ?? await calculateCharacterCardSha256(rawJson);
      const localizedWarnings = [
        t("characterChat.importReport.dataOnlyWarning"),
        ...(inspected.report.legacy
          ? [t("characterChat.importReport.legacyWarning")]
          : []),
        ...(inspected.report.remoteImageUrls.length
          ? [t("characterChat.importReport.remoteWarning")]
          : []),
        ...(inspected.report.sourceFormat === "unknown"
          ? [t("characterChat.importReport.convertedWarning")]
          : [])
      ];
      setPendingImport({ inspected, localizedWarnings, sha256 });
    } catch (caught) {
      setError(getCharacterImportErrorMessage(caught, t));
    }
  }

  function cancelPendingImport() {
    setPendingImport(null);
    setStatus(t("characterChat.messages.importCancelled"));
  }

  function confirmPendingImport() {
    if (!pendingImport) {
      return;
    }
    const imported = pendingImport.inspected.preset;
    updatePresets([imported, ...presets]);
    updateSessions({
      ...sessions,
      [imported.id]: initialMessagesFromPreset(imported)
    });
    setSelectedPresetId(imported.id);
    setCharacterView("manage");
    setPendingImport(null);
    setStatus(t("characterChat.messages.imported", { name: imported.name }));
  }

  function requestRemoteImageApproval() {
    if (!selectedPreset || !unapprovedRemoteImageUrls.length) return;
    setPendingRemoteImageApproval({
      id: selectedPreset.id,
      name: selectedPreset.name,
      urls: [...unapprovedRemoteImageUrls]
    });
  }

  function confirmRemoteImageApproval() {
    if (!pendingRemoteImageApproval) return;
    const currentPreset = presets.find((preset) => preset.id === pendingRemoteImageApproval.id);
    if (!currentPreset) {
      setPendingRemoteImageApproval(null);
      return;
    }
    pendingRemoteImageApproval.urls.forEach((url) => approvedRemoteCharacterImageUrls.add(url));
    setRemoteImageApprovalRevision((revision) => revision + 1);
    setStatus(t("characterChat.manage.remoteApproved", {
      count: pendingRemoteImageApproval.urls.length
    }));
    setPendingRemoteImageApproval(null);
  }

  function exportPresetAsTavernV2() {
    if (!selectedPreset) {
      return;
    }
    const data = JSON.stringify(exportCharacterPresetAsTavernV2(selectedPreset), null, 2);
    const blob = new Blob([data], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${sanitizeFileName(selectedPreset.name)}.character.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function openExportPackDialog() {
    if (!selectedPreset) {
      return;
    }
    const metadata = selectedPreset.packMetadata;
    setError("");
    setExportErrors({});
    setExportSubmitError("");
    setExportDraft({
      creator: metadata?.creator ?? selectedPreset.creator ?? "",
      sourceUrl: metadata?.sourceUrl ?? "",
      license: metadata?.license ?? "",
      version: metadata?.version ?? "1.0.0",
      releaseNotes: metadata?.releaseNotes ?? t("characterChat.exportPack.initialRelease")
    });
  }

  function updateExportDraft(field: CharacterPackExportField, value: string) {
    setExportDraft((current) => current ? { ...current, [field]: value } : current);
    setExportSubmitError("");
    setExportErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function submitExportPresetAsPack() {
    if (!selectedPreset || !exportDraft || isExportingPack) return;
    const nextErrors = validateCharacterPackExportDraft(exportDraft, t);
    if (Object.keys(nextErrors).length) {
      setExportErrors(nextErrors);
      window.requestAnimationFrame(() => {
        focusFirstCharacterPackExportError(nextErrors, {
          creator: exportCreatorInputRef.current,
          sourceUrl: exportSourceUrlInputRef.current,
          license: exportLicenseInputRef.current,
          version: exportVersionInputRef.current,
          releaseNotes: exportReleaseNotesInputRef.current
        });
      });
      return;
    }

    setError("");
    setExportSubmitError("");
    setIsExportingPack(true);
    try {
      const pack = await exportCharacterPresetAsLanguageMinerPack(selectedPreset, {
        creator: exportDraft.creator.trim(),
        sourceUrl: exportDraft.sourceUrl.trim(),
        license: exportDraft.license.trim(),
        version: exportDraft.version.trim(),
        releaseNotes: exportDraft.releaseNotes.trim()
      });
      const data = JSON.stringify(pack, null, 2);
      const blob = new Blob([data], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${sanitizeFileName(selectedPreset.name)}.character-pack.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setExportDraft(null);
      setStatus(t("characterChat.exportPack.exported"));
    } catch (caught) {
      setExportSubmitError(getCharacterPackExportErrorMessage(caught, t));
    } finally {
      setIsExportingPack(false);
    }
  }

  async function sendMessage() {
    const content = draft.trim();
    if (!selectedPreset || !content || isSending) {
      return;
    }
    if (!isRunnableCharacterPreset(selectedPreset)) {
      setError(t("characterChat.importReport.legacyWarning"));
      setCharacterView("manage");
      return;
    }
    const previousMessages = getSessionMessages(sessions, selectedPreset);
    const ragHints =
      chatMode === "target_practice"
        ? selectCharacterRagHints(
            cards,
            [content, previousMessages.slice(-3).map((message) => message.content).join(" ")].join(" "),
            4
          )
        : [];
    const preflight = buildCharacterExternalPreflight(content, previousMessages, ragHints);
    if (preflight) {
      setPendingExternalRequest({
        content,
        presetId: selectedPreset.id,
        previousMessages,
        ragHints,
        preflight
      });
      return;
    }
    await performCharacterRequest(content, previousMessages, ragHints);
  }

  async function continuePendingExternalRequest() {
    const pending = pendingExternalRequest;
    setPendingExternalRequest(null);
    if (!pending) {
      return;
    }
    if (!selectedPreset || selectedPreset.id !== pending.presetId || !isRunnableCharacterPreset(selectedPreset)) {
      setError(t("characterChat.importReport.legacyWarning"));
      setCharacterView("manage");
      return;
    }
    await performCharacterRequest(pending.content, pending.previousMessages, pending.ragHints);
  }

  async function performCharacterRequest(
    content: string,
    previousMessages: CharacterChatMessage[],
    ragHints: CharacterRagHints
  ) {
    if (!selectedPreset || !isRunnableCharacterPreset(selectedPreset)) {
      setError(t("characterChat.importReport.legacyWarning"));
      setCharacterView("manage");
      return;
    }
    const requestJob = rendererPrivacyLifecycle.createJob();
    const abortController = requestJob.controller;
    if (abortController.signal.aborted) {
      requestJob.release();
      return;
    }
    requestAbortRef.current = abortController;
    setDraft("");
    setStatus("");
    setCaptureStatus("");
    setError("");
    setIsSending(true);

    const now = new Date().toISOString();
    const userMessage: CharacterChatMessage = {
      id: randomId(),
      role: "user",
      content,
      createdAt: now,
      mode: chatMode
    };
    const previousCharacterMessage =
      [...previousMessages].reverse().find((message) => message.role === "character") ?? null;
    const optimisticMessages = [...previousMessages, userMessage];
    if (rendererPrivacyLifecycle.canCommit(requestJob.epoch)) {
      updateSessions({
        ...sessions,
        [selectedPreset.id]: optimisticMessages
      });
    }

    try {
      if (chatMode === "native_capture") {
        await saveNativeCapture(userMessage, previousCharacterMessage, requestJob.epoch);
      }
      if (
        !isMountedRef.current ||
        !rendererPrivacyLifecycle.canCommit(requestJob.epoch)
      ) {
        return;
      }
      const reply = await provider.generateCharacterChatReply({
        character: selectedPreset,
        messages: previousMessages,
        userMessage: content,
        ragHints,
        chatMode,
        correctionMode: activeCorrectionMode,
        learningProfile: settings.learningProfile,
        learnerLevel: "intermediate",
        signal: abortController.signal
      });
      if (
        !isMountedRef.current ||
        !rendererPrivacyLifecycle.canCommit(requestJob.epoch)
      ) {
        return;
      }
      const parsedReply = parseCharacterChatReply(reply);
      const characterContent = replaceCharacterMacros(parsedReply.content || reply, selectedPreset.name);
      const characterMessage: CharacterChatMessage = {
        id: randomId(),
        role: "character",
        content: characterContent,
        feedbackKo: parsedReply.feedbackKo,
        suggestedTargetText: parsedReply.suggestedTargetText,
        emotion:
          parsedReply.emotion ??
          inferCharacterEmotion(characterContent, parsedReply.feedbackKo, chatMode),
        createdAt: new Date().toISOString(),
        mode: chatMode
      };
      updateSessions({
        ...sessions,
        [selectedPreset.id]: [...optimisticMessages, characterMessage]
      });
      setStatus(
        chatMode === "target_practice" && ragHints.length
          ? t("characterChat.messages.hintsUsed", { count: ragHints.length })
          : ""
      );
    } catch (error) {
      if (
        !isMountedRef.current ||
        !rendererPrivacyLifecycle.canCommit(requestJob.epoch)
      ) {
        return;
      }
      updateSessions({
        ...sessions,
        [selectedPreset.id]: optimisticMessages
      });
      setError(
        abortController.signal.aborted || isAbortError(error)
          ? t("characterChat.messages.stopped")
          : t("characterChat.messages.replyFailed")
      );
    } finally {
      requestJob.release();
      if (requestAbortRef.current === abortController) requestAbortRef.current = null;
      if (
        isMountedRef.current &&
        rendererPrivacyLifecycle.canCommit(requestJob.epoch)
      ) {
        setIsSending(false);
      }
    }
  }

  function buildCharacterExternalPreflight(
    content: string,
    previousMessages: CharacterChatMessage[],
    ragHints: CharacterRagHints
  ): CharacterExternalPreflight | null {
    const usesGemini = settings.providerName === "gemini";
    const usesRemoteOllama =
      settings.providerName === "ollama" && isRemoteOllamaUrl(settings.ollamaBaseUrl);
    if (!usesGemini && !usesRemoteOllama) {
      return null;
    }
    const payloadPreview = [
      selectedPreset?.description,
      selectedPreset?.personality,
      selectedPreset?.scenario,
      ...previousMessages.slice(-12).map((message) => message.content),
      content,
      ...ragHints.flatMap((hint) => [hint.sourceSentence, hint.naturalMeaning, ...hint.terms])
    ]
      .filter(Boolean)
      .join("\n");
    const usageSummary = summarizeAppTranslationUsage(settings);
    const estimate = usesGemini
      ? estimateTranslationUsage({
          texts: [{ text: payloadPreview, cacheStatus: "miss" }],
          providerName: "gemini",
          model: settings.geminiModel,
          plan: settings.geminiPlan,
          sourceLang: settings.learningProfile.targetLanguage.code,
          targetLang: settings.learningProfile.nativeLanguage.code
        })
      : null;
    return {
      usesGemini,
      recentMessageCount: Math.min(12, previousMessages.length),
      hintCount: ragHints.length,
      estimatedCostKrw: estimate
        ? {
            min: estimate.estimatedCostKrw.min,
            max: estimate.estimatedCostKrw.max * GEMINI_MAX_ATTEMPTS_PER_REQUEST
          }
        : null,
      monthEstimateKrw: usageSummary.monthCostKrw
    };
  }

  function stopCharacterRequest() {
    requestAbortRef.current?.abort();
  }

  async function saveNativeCapture(
    userMessage: CharacterChatMessage,
    previousCharacterMessage: CharacterChatMessage | null,
    requestEpoch: number
  ) {
    if (!selectedPreset) {
      return;
    }
    try {
      await api.lifeLogs.save(
        createCharacterChatLifeLogInput({
          character: selectedPreset,
          chatMode,
          userMessage,
          previousCharacterMessage
        })
      );
      if (!isMountedRef.current || !rendererPrivacyLifecycle.canCommit(requestEpoch)) return;
      await onLifeLogsChanged();
      if (!isMountedRef.current || !rendererPrivacyLifecycle.canCommit(requestEpoch)) return;
      setCaptureStatus(t("characterChat.messages.captureSaved"));
    } catch {
      if (!isMountedRef.current || !rendererPrivacyLifecycle.canCommit(requestEpoch)) return;
      setCaptureStatus(t("characterChat.messages.captureFailed"));
    }
  }

  if (characterView === "home") {
    return (
      <div className="character-chat-home">
        <section className="character-home-hero">
          <div className="character-home-hero-copy">
            <span className="character-home-eyebrow">{t("characterChat.title")}</span>
            <h1>{t("characterChat.home.heading", {
              name: selectedPreset?.name ?? t("characterChat.fallbackCharacter")
            })}</h1>
            <p>{t("characterChat.home.description")}</p>
            {!selectedPresetRunnable ? (
              <p className="error-text" role="alert">
                {t("characterChat.importReport.legacyWarning")}
              </p>
            ) : null}
            <div className="character-home-hero-actions">
              <button
                className="button primary"
                disabled={!selectedPresetRunnable}
                type="button"
                onClick={() => openChat(chatMode)}
              >
                <MessageCircle size={17} />
                {t("characterChat.home.continue")}
              </button>
              <button
                className="button secondary"
                disabled={!selectedPresetRunnable}
                type="button"
                onClick={() => openChat("native_capture")}
              >
                <Languages size={17} />
                {t("characterChat.home.casual")}
              </button>
              <button
                className="button secondary"
                disabled={!selectedPresetRunnable}
                type="button"
                onClick={() => openChat("target_practice")}
              >
                <Sparkles size={17} />
                {t("characterChat.home.practice")}
              </button>
            </div>
          </div>
          <div className="character-home-hero-card">
            <CharacterAvatar preset={selectedPreset} size="portrait" emotion={latestCharacterEmotion} />
            <div>
              <strong>{selectedPreset?.name ?? t("characterChat.fallbackCharacter")}</strong>
              <CharacterExpressionBadge preset={selectedPreset} />
              <p>{latestConversationPreview}</p>
            </div>
          </div>
        </section>

        <section className="character-home-stats">
          <div>
            <span>{t("characterChat.home.session")}</span>
            <strong>{t("characterChat.home.turns", {
              count: userMessageCount,
              formattedCount: formatCharacterCount(userMessageCount, localeTag)
            })}</strong>
          </div>
          <div>
            <span>{t("characterChat.home.expressionImages")}</span>
            <strong>{t("characterChat.home.imageCount", {
              count: getCharacterExpressionImageCount(selectedPreset),
              formattedCount: formatCharacterCount(
                getCharacterExpressionImageCount(selectedPreset),
                localeTag
              )
            })}</strong>
          </div>
          <div>
            <span>{t("characterChat.home.cardHints")}</span>
            <strong>{t("characterChat.home.imageCount", {
              count: cards.length,
              formattedCount: formatCharacterCount(cards.length, localeTag)
            })}</strong>
          </div>
          <div>
            <span>{t("characterChat.home.currentMode")}</span>
            <strong>{chatMode === "native_capture"
              ? t("characterChat.home.captureMode")
              : t("characterChat.home.practiceMode")}</strong>
          </div>
        </section>

        <section className="character-home-content">
          <div className="character-home-section character-home-actions">
            <div className="character-home-section-head">
              <div>
                <span>{t("characterChat.home.start")}</span>
                <h2>{t("characterChat.home.whatToday")}</h2>
              </div>
            </div>
            <button
              disabled={!selectedPresetRunnable}
              type="button"
              onClick={() => openChat("native_capture")}
            >
              <Languages size={18} />
              <span>
                <strong>{t("characterChat.home.casualTitle")}</strong>
                <small>{t("characterChat.home.casualDescription")}</small>
              </span>
            </button>
            <button
              disabled={!selectedPresetRunnable}
              type="button"
              onClick={() => openChat("target_practice")}
            >
              <MessageCircle size={18} />
              <span>
                <strong>{t("characterChat.home.practiceTitle", { language: targetLanguageLabel })}</strong>
                <small>{t("characterChat.home.practiceDescription")}</small>
              </span>
            </button>
            <button type="button" onClick={() => onNavigate?.("life")}>
              <Lightbulb size={18} />
              <span>
                <strong>{t("characterChat.home.mineTitle")}</strong>
                <small>{t("characterChat.home.mineDescription")}</small>
              </span>
            </button>
            <button type="button" onClick={() => openManage()}>
              <Settings size={18} />
              <span>
                <strong>{t("characterChat.home.manageTitle")}</strong>
                <small>{t("characterChat.home.manageDescription")}</small>
              </span>
            </button>
          </div>

          <div className="character-home-section">
            <div className="character-home-section-head">
              <div>
                <span>{t("characterChat.home.characters")}</span>
                <h2>{t("characterChat.home.chooseCharacter")}</h2>
              </div>
              <button className="mini-button" type="button" onClick={createPreset}>
                <Plus size={14} />
                {t("characterChat.manage.newCharacter")}
              </button>
            </div>
            <div className="character-home-character-grid">
              {presets.map((preset) => {
                const presetMessages = getSessionMessages(sessions, preset);
                const presetPreview = getLatestConversationPreview(
                  presetMessages,
                  preset.name,
                  t("characterChat.home.noConversation")
                );
                return (
                  <button
                    className={preset.id === selectedPreset?.id ? "active" : ""}
                    key={preset.id}
                    type="button"
                    onClick={() =>
                      isRunnableCharacterPreset(preset)
                        ? openChat(chatMode, preset.id)
                        : openManage(preset.id)
                    }
                  >
                    <CharacterAvatar
                      preset={preset}
                      size="large"
                      emotion={getLatestCharacterEmotion(presetMessages)}
                    />
                    <span>
                      <strong>{preset.name}</strong>
                      <small>{presetPreview}</small>
                      <span className="character-home-character-meta">
                        <CharacterExpressionBadge preset={preset} size="small" />
                        <em>{t("characterChat.chat.turns", {
                          count: presetMessages.filter((message) => message.role === "user").length,
                          formattedCount: formatCharacterCount(
                            presetMessages.filter((message) => message.role === "user").length,
                            localeTag
                          )
                        })}</em>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={`character-chat-page ${characterView === "chat" ? "focus-mode" : "manage-mode"}`}>
      <h1 className="sr-only">{t("characterChat.title")}</h1>
      {characterView === "manage" ? (
      <aside className="character-preset-panel">
        <div className="character-panel-heading">
          <div>
            <h2>{t("characterChat.title")}</h2>
            <p>{t("characterChat.manage.description")}</p>
          </div>
          <button className="mini-button" type="button" onClick={createPreset}>
            <Plus size={14} />
            {t("characterChat.manage.newCharacter")}
          </button>
        </div>

        <div className="character-preset-list">
          {presets.map((preset) => (
            <button
              aria-pressed={preset.id === selectedPreset?.id}
              className={preset.id === selectedPreset?.id ? "active" : ""}
              key={preset.id}
              type="button"
              onClick={() => setSelectedPresetId(preset.id)}
            >
              <CharacterAvatar preset={preset} size="small" />
              <span className="character-preset-meta">
                <strong>{preset.name}</strong>
                <span className="character-preset-badges">
                  <small>{getCharacterSourceFormatLabel(preset.sourceFormat, t)}</small>
                  <CharacterExpressionBadge preset={preset} size="small" />
                </span>
              </span>
            </button>
          ))}
        </div>

        <div className="character-import-row">
          <button className="button secondary" type="button" onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} />
            {t("characterChat.manage.importJson")}
          </button>
          <button className="button secondary" type="button" onClick={openExportPackDialog}>
            <Download size={16} />
            {t("characterChat.manage.exportPack")}
          </button>
          <button className="button secondary" type="button" onClick={exportPresetAsTavernV2}>
            <Download size={16} />
            {t("characterChat.manage.exportV2")}
          </button>
          <input
            ref={fileInputRef}
            accept=".json,application/json"
            aria-label={t("characterChat.manage.importJson")}
            type="file"
            onChange={importPreset}
          />
        </div>

        {!selectedPresetRunnable ? (
          <p className="error-text" role="alert">
            {t("characterChat.importReport.legacyWarning")}
          </p>
        ) : null}

        <section className="character-editor">
          <label>
            <span>{t("characterChat.manage.name")}</span>
            <input
              value={selectedPreset?.name ?? ""}
              onChange={(event) => updateSelectedPreset({ name: event.target.value })}
            />
          </label>
          <label>
            <span>{t("characterChat.manage.gender")}</span>
            <input
              placeholder="female"
              value={selectedPreset?.gender ?? ""}
              onChange={(event) => updateSelectedPreset({ gender: event.target.value })}
            />
          </label>
          <label>
            <span>{t("characterChat.manage.avatarUrl")}</span>
            <input
              placeholder="/tutorial/molly-gpt-neutral.png"
              value={selectedPreset?.avatarImageUrl ?? ""}
              onChange={(event) => updateSelectedPreset({ avatarImageUrl: event.target.value })}
            />
          </label>
          {selectedRemoteImageUrls.length ? (
            <div className="character-remote-image-consent" role="status">
              <span>
                <strong>{t("characterChat.manage.remoteBlocked")}</strong>
                <small>{t("characterChat.manage.remoteDescription")}</small>
              </span>
              <button
                className="button secondary"
                disabled={!unapprovedRemoteImageUrls.length}
                type="button"
                onClick={requestRemoteImageApproval}
              >
                {unapprovedRemoteImageUrls.length
                  ? t("characterChat.manage.loadRemote", {
                      count: unapprovedRemoteImageUrls.length,
                      formattedCount: formatCharacterCount(
                        unapprovedRemoteImageUrls.length,
                        localeTag
                      )
                    })
                  : t("characterChat.manage.remoteAllowed")}
              </button>
            </div>
          ) : null}
          <div className="character-expression-status">
            <CharacterExpressionBadge preset={selectedPreset} />
            <small>
              {t("characterChat.manage.expressionDescription")}
            </small>
          </div>
          <label>
            <span>{t("characterChat.manage.fallbackEmotion")}</span>
            <select
              value={selectedPreset?.expressionFallbackEmotion ?? "neutral"}
              onChange={(event) =>
                updateSelectedPreset({
                  expressionFallbackEmotion: event.target.value as CharacterEmotion
                })
              }
            >
              {characterEmotionOptions.map((emotion) => (
                <option key={emotion} value={emotion}>
                  {getCharacterEmotionLabel(emotion, t)}
                </option>
              ))}
            </select>
          </label>
          <div className="character-emotion-editor">
            <span className="character-emotion-editor-title">{t("characterChat.manage.expressionSet")}</span>
            <div className="character-emotion-grid">
              {characterEmotionOptions.map((emotion) => (
                <label key={emotion}>
                  <span>{getCharacterEmotionLabel(emotion, t)}</span>
                  <input
                    placeholder={`/tutorial/molly-gpt-${emotion}.png`}
                    value={selectedPreset?.emotionImageUrls?.[emotion] ?? ""}
                    onChange={(event) => updateSelectedEmotionImage(emotion, event.target.value)}
                  />
                </label>
              ))}
            </div>
          </div>
          <label>
            <span>{t("characterChat.manage.descriptionField")}</span>
            <textarea
              value={selectedPreset?.description ?? ""}
              onChange={(event) => updateSelectedPreset({ description: event.target.value })}
            />
          </label>
          <label>
            <span>{t("characterChat.manage.personality")}</span>
            <textarea
              value={selectedPreset?.personality ?? ""}
              onChange={(event) => updateSelectedPreset({ personality: event.target.value })}
            />
          </label>
          <label>
            <span>{t("characterChat.manage.scenario")}</span>
            <textarea
              value={selectedPreset?.scenario ?? ""}
              onChange={(event) => updateSelectedPreset({ scenario: event.target.value })}
            />
          </label>
          <label>
            <span>{t("characterChat.manage.firstMessage")}</span>
            <textarea
              value={selectedPreset?.firstMessage ?? ""}
              onChange={(event) => updateSelectedPreset({ firstMessage: event.target.value })}
            />
          </label>
          <div className="character-danger-zone">
            <div>
              <strong>{t("characterChat.manage.deleteTitle")}</strong>
              <small>{t("characterChat.manage.deleteDescription")}</small>
            </div>
            <button
              className="button danger"
              type="button"
              disabled={
                isSending ||
                !selectedPreset ||
                presets.length <= 1 ||
                isDefaultMollyPreset(selectedPreset)
              }
              onClick={requestDeletePreset}
            >
              <Trash2 size={16} />
              {t("characterChat.manage.deleteButton")}
            </button>
          </div>
        </section>
      </aside>
      ) : null}

      <section
        className={`character-chat-panel ${
          characterView === "chat" && !isChatInfoVisible ? "chat-info-hidden" : "chat-info-visible"
        }`}
      >
        {characterView === "chat" && !isChatInfoVisible ? (
          <button
            className="character-chat-info-toggle"
            type="button"
            aria-expanded={isChatInfoVisible}
            onClick={() => setIsChatInfoVisible(true)}
          >
            <Settings size={15} />
            {t("characterChat.chat.showInfo")}
          </button>
        ) : null}
        <header className="character-chat-header">
          <div className="character-chat-title">
            <CharacterAvatar preset={selectedPreset} size="portrait" emotion={latestCharacterEmotion} />
            <div>
              <h2>
                <MessageCircle size={20} />
                {selectedPreset?.name ?? t("characterChat.fallbackCharacter")}
              </h2>
              <CharacterExpressionBadge preset={selectedPreset} />
              <p>
                {chatMode === "native_capture"
                  ? t("characterChat.chat.casualSummary", { language: nativeLanguageLabel })
                  : t("characterChat.chat.practiceSummary", { language: targetLanguageLabel })}
              </p>
            </div>
          </div>
          <div className="character-chat-actions">
            <button className="button secondary" type="button" onClick={() => setCharacterView("home")}>
              <ArrowLeft size={16} />
              {t("characterChat.chat.home")}
            </button>
            {characterView === "chat" ? (
              <button className="button secondary" type="button" onClick={() => openManage()}>
                <Settings size={16} />
                {t("characterChat.chat.manage")}
              </button>
            ) : (
              <button
                className="button secondary"
                disabled={!selectedPresetRunnable}
                type="button"
                onClick={() => openChat(chatMode)}
              >
                <MessageCircle size={16} />
                {t("characterChat.chat.room")}
              </button>
            )}
            {characterView === "chat" ? (
              <button className="button secondary" type="button" onClick={() => setIsChatInfoVisible(false)}>
                <Settings size={16} />
                {t("characterChat.chat.hideInfo")}
              </button>
            ) : null}
            <button
              className="button secondary"
              disabled={isSending}
              type="button"
              onClick={requestResetChat}
            >
              <RefreshCw size={16} />
              {t("characterChat.chat.reset")}
            </button>
          </div>
        </header>

        <div className="character-mode-panel">
          <div className="character-mode-toggle" role="group" aria-label={t("characterChat.chat.modeAria")}>
            <button
              aria-pressed={chatMode === "native_capture"}
              className={chatMode === "native_capture" ? "character-mode-button active" : "character-mode-button"}
              disabled={!selectedPresetRunnable}
              type="button"
              onClick={() => updateChatMode("native_capture")}
            >
              <Languages size={16} />
              <span>
                <strong>{t("characterChat.chat.casualTitle")}</strong>
                <small>{t("characterChat.chat.casualDescription")}</small>
              </span>
            </button>
            <button
              aria-pressed={chatMode === "target_practice"}
              className={chatMode === "target_practice" ? "character-mode-button active" : "character-mode-button"}
              disabled={!selectedPresetRunnable}
              type="button"
              onClick={() => updateChatMode("target_practice")}
            >
              <MessageCircle size={16} />
              <span>
                <strong>{t("characterChat.chat.practiceTitle")}</strong>
                <small>{t("characterChat.chat.practiceDescription")}</small>
              </span>
            </button>
          </div>
          <label className="character-correction-select">
            <span>{t("characterChat.correction.label")}</span>
            <select
              disabled={!selectedPresetRunnable || chatMode !== "target_practice"}
              value={correctionMode}
              onChange={(event) => updateCorrectionMode(event.target.value as CharacterCorrectionMode)}
            >
              {correctionModeOptions.map((option) => (
                <option key={option} value={option}>
                  {getCharacterCorrectionModeLabel(option, t)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {status ? (
          <p
            aria-live="polite"
            className="success-text character-chat-status-line"
            role="status"
          >
            {status}
          </p>
        ) : null}
        {captureStatus ? (
          <p
            aria-live={captureStatus.startsWith(t("characterChat.messages.captureFailed"))
              ? "assertive"
              : "polite"}
            className={`character-chat-status-line ${
              captureStatus.startsWith(t("characterChat.messages.captureFailed")) ? "error-text" : "success-text"
            }`}
            role={captureStatus.startsWith(t("characterChat.messages.captureFailed"))
              ? "alert"
              : "status"}
          >
            {captureStatus}
          </p>
        ) : null}
        {error ? (
          <p aria-live="assertive" className="error-text character-chat-status-line" role="alert">
            {error}
          </p>
        ) : null}

        {canCollapseExpressionImages ? (
          <div className="character-message-toolbar">
            <span>{t("characterChat.chat.expressionImages")}</span>
            <button
              className="mini-button"
              type="button"
              onClick={() => setShowAllExpressionImages((value) => !value)}
            >
              {showAllExpressionImages
                ? t("characterChat.chat.latestOnly")
                : t("characterChat.chat.showAll")}
            </button>
          </div>
        ) : null}

        <div
          aria-busy={isSending}
          aria-label={t("characterChat.chat.messageLog")}
          aria-live="polite"
          aria-relevant="additions text"
          className="character-message-list"
          ref={messageListRef}
          role="log"
        >
          {messages.map((message) => {
            const displayEmotion =
              message.role === "character"
                ? getMessageDisplayEmotion(message, chatMode)
                : undefined;
            const showExpressionImage =
              message.role === "character" &&
              (showAllExpressionImages || message.id === latestCharacterMessageId);
            return (
              <article
                className={`character-message ${message.role} ${
                  message.role === "character" && !showExpressionImage ? "compact-expression" : ""
                }`}
                key={message.id}
              >
                <div className="character-message-head">
                  {message.role === "character" ? (
                    <CharacterAvatar preset={selectedPreset} size="message" emotion={displayEmotion} />
                  ) : null}
                  <strong>{message.role === "character" ? selectedPreset?.name : t("characterChat.chat.me")}</strong>
                  {displayEmotion ? (
                    <span className="character-message-emotion">
                      {getCharacterEmotionLabel(displayEmotion, t)}
                    </span>
                  ) : null}
                </div>
                <p>{replaceCharacterMacros(
                  message.content,
                  selectedPreset?.name ?? t("characterChat.fallbackCharacter")
                )}</p>
                {showExpressionImage ? (
                  <CharacterExpressionSprite preset={selectedPreset} emotion={displayEmotion} />
                ) : null}
                {message.role === "character" && (message.feedbackKo || message.suggestedTargetText) ? (
                  <div className="character-feedback-block">
                    <strong>{t("characterChat.correction.label")}</strong>
                    {message.feedbackKo ? <p>{message.feedbackKo}</p> : null}
                    {message.suggestedTargetText ? (
                      <div className="character-suggestion">
                        <span>{t("characterChat.correction.suggested")}</span>
                        <p>{message.suggestedTargetText}</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
          {isSending ? (
            <article className="character-message character pending">
              <div className="character-message-head">
                <CharacterAvatar preset={selectedPreset} size="message" emotion="thinking" />
                <strong>{selectedPreset?.name}</strong>
                <span className="character-message-emotion">
                  {getCharacterEmotionLabel("thinking", t)}
                </span>
              </div>
              <p>
                <Loader2 className="spin inline-icon" size={15} />
                {t("characterChat.chat.typing")}
              </p>
              <CharacterExpressionSprite preset={selectedPreset} emotion="thinking" />
            </article>
          ) : null}
        </div>

        {chatMode === "native_capture" ? (
          <div className="character-capture-strip">
            <Lightbulb size={16} />
            <span>{t("characterChat.chat.autoSaveNotice")}</span>
            <button className="mini-button" type="button" onClick={() => onNavigate?.("life")}>
              {t("characterChat.chat.viewLifeMining")}
            </button>
          </div>
        ) : (
          <div className="character-rag-strip">
            <FileJson size={16} />
            <span>{t("characterChat.chat.nearbyHints")}</span>
            {previewHints.length ? (
              previewHints.map((hint) => (
                <small key={hint.cardId}>{hint.terms[0] || hint.sourceSentence.slice(0, 28)}</small>
              ))
            ) : (
              <small>{t("characterChat.chat.none")}</small>
            )}
          </div>
        )}

        <form
          className="character-chat-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage();
          }}
        >
          <textarea
            aria-label={t("characterChat.chat.messageInput")}
            disabled={!selectedPresetRunnable}
            placeholder={
              chatMode === "native_capture"
                ? t("characterChat.chat.casualPlaceholder", { language: nativeLanguageLabel })
                : t("characterChat.chat.practicePlaceholder", { language: targetLanguageLabel })
            }
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage();
              }
            }}
          />
          <div className="character-chat-composer-actions">
            {isSending ? (
              <button className="button secondary" type="button" onClick={stopCharacterRequest}>
                <Square size={15} />
                {t("characterChat.chat.stop")}
              </button>
            ) : null}
            <button
              className="button primary"
              disabled={!selectedPresetRunnable || !draft.trim() || isSending}
              type="submit"
            >
              {isSending ? <Loader2 className="spin" size={17} /> : <Send size={17} />}
              {t("characterChat.chat.send")}
            </button>
          </div>
        </form>
      </section>

      {pendingImport ? (
        <Dialog
          ariaDescribedBy="character-import-description"
          ariaLabelledBy="character-import-title"
          backdropClassName="character-dialog-backdrop"
          className="character-dialog character-import-dialog"
          data-qa="character-import-security-dialog"
          initialFocusRef={dialogCancelButtonRef}
          onClose={cancelPendingImport}
        >
          <header className="character-dialog-header">
            <div>
              <span>{t("characterChat.importReport.kicker")}</span>
              <h2 id="character-import-title">{t("characterChat.importReport.title")}</h2>
            </div>
            <button
              aria-label={t("characterChat.dialogs.close")}
              className="icon-button"
              type="button"
              onClick={cancelPendingImport}
            >
              <X size={18} />
            </button>
          </header>
          <div className="character-dialog-body">
            <p id="character-import-description">{t("characterChat.importReport.description")}</p>
            <dl className="character-dialog-facts" aria-label={t("characterChat.importReport.factsAria")}>
              <div>
                <dt>{t("characterChat.importReport.labels.status")}</dt>
                <dd>{getCharacterPackStatusLabel(pendingImport.inspected.report.status, t)}</dd>
              </div>
              <div>
                <dt>{t("characterChat.importReport.labels.name")}</dt>
                <dd>{pendingImport.inspected.report.characterName}</dd>
              </div>
              <div>
                <dt>{t("characterChat.importReport.labels.format")}</dt>
                <dd>{getCharacterSourceFormatLabel(pendingImport.inspected.report.sourceFormat, t)}</dd>
              </div>
              <div>
                <dt>{t("characterChat.importReport.labels.remoteImages")}</dt>
                <dd>{pendingImport.inspected.report.remoteImageUrls.length.toLocaleString(localeTag)}</dd>
              </div>
              {pendingImport.inspected.report.manifest ? (
                <>
                  <div>
                    <dt>{t("characterChat.importReport.labels.version")}</dt>
                    <dd>{pendingImport.inspected.report.manifest.version}</dd>
                  </div>
                  <div>
                    <dt>{t("characterChat.importReport.labels.creator")}</dt>
                    <dd>{pendingImport.inspected.report.manifest.creator}</dd>
                  </div>
                  <div>
                    <dt>{t("characterChat.importReport.labels.license")}</dt>
                    <dd>{pendingImport.inspected.report.manifest.license}</dd>
                  </div>
                  <div>
                    <dt>{t("characterChat.importReport.labels.permissions")}</dt>
                    <dd>
                      {pendingImport.inspected.report.manifest.requestedPermissions.length
                        ? pendingImport.inspected.report.manifest.requestedPermissions
                            .map((permission) => getCharacterPackPermissionLabel(permission, t))
                            .join(", ")
                        : t("characterChat.importReport.noPermissions")}
                    </dd>
                  </div>
                </>
              ) : null}
            </dl>
            <div className="character-dialog-hash">
              <span>{t("characterChat.importReport.labels.sha256")}</span>
              <code>{pendingImport.sha256}</code>
            </div>
            <section className="character-dialog-warning-list" aria-labelledby="character-import-warnings">
              <h3 id="character-import-warnings">{t("characterChat.importReport.warningsTitle")}</h3>
              <ul>
                {pendingImport.localizedWarnings.map((warning) => (
                  <li key={warning}><AlertTriangle size={16} />{warning}</li>
                ))}
              </ul>
            </section>
          </div>
          <footer className="character-dialog-actions">
            <button
              ref={dialogCancelButtonRef}
              className="button secondary"
              type="button"
              onClick={cancelPendingImport}
            >
              {t("characterChat.dialogs.cancel")}
            </button>
            <button className="button primary" type="button" onClick={confirmPendingImport}>
              {t("characterChat.importReport.importButton")}
            </button>
          </footer>
        </Dialog>
      ) : null}

      {exportDraft ? (
        <Dialog
          ariaDescribedBy="character-export-description"
          ariaLabelledBy="character-export-title"
          backdropClassName="character-dialog-backdrop"
          className="character-dialog character-export-dialog"
          closeOnBackdrop={!isExportingPack}
          closeOnEscape={!isExportingPack}
          data-qa="character-export-pack-dialog"
          initialFocusRef={exportCreatorInputRef}
          onClose={() => {
            if (!isExportingPack) setExportDraft(null);
          }}
        >
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void submitExportPresetAsPack();
            }}
          >
            <header className="character-dialog-header">
              <div>
                <span>{t("characterChat.exportPack.kicker")}</span>
                <h2 id="character-export-title">{t("characterChat.exportPack.title")}</h2>
              </div>
              <button
                aria-label={t("characterChat.dialogs.close")}
                className="icon-button"
                disabled={isExportingPack}
                type="button"
                onClick={() => setExportDraft(null)}
              >
                <X size={18} />
              </button>
            </header>
            <div className="character-dialog-body character-export-form">
              <p id="character-export-description">{t("characterChat.exportPack.description")}</p>
              <CharacterExportField
                error={exportErrors.creator}
                errorId="character-export-creator-error"
                label={t("characterChat.exportPack.creatorLabel")}
              >
                <input
                  ref={exportCreatorInputRef}
                  aria-describedby={exportErrors.creator ? "character-export-creator-error" : undefined}
                  aria-invalid={Boolean(exportErrors.creator)}
                  autoComplete="name"
                  disabled={isExportingPack}
                  value={exportDraft.creator}
                  onChange={(event) => updateExportDraft("creator", event.target.value)}
                />
              </CharacterExportField>
              <CharacterExportField
                error={exportErrors.sourceUrl}
                errorId="character-export-source-error"
                hint={t("characterChat.exportPack.sourceUrlHint")}
                label={t("characterChat.exportPack.sourceUrlLabel")}
              >
                <input
                  ref={exportSourceUrlInputRef}
                  aria-describedby={exportErrors.sourceUrl
                    ? "character-export-source-error"
                    : "character-export-source-hint"}
                  aria-invalid={Boolean(exportErrors.sourceUrl)}
                  disabled={isExportingPack}
                  inputMode="url"
                  placeholder="https://github.com/owner/repository/releases"
                  type="url"
                  value={exportDraft.sourceUrl}
                  onChange={(event) => updateExportDraft("sourceUrl", event.target.value)}
                />
              </CharacterExportField>
              <CharacterExportField
                error={exportErrors.license}
                errorId="character-export-license-error"
                hint={t("characterChat.exportPack.licenseHint")}
                label={t("characterChat.exportPack.licenseLabel")}
              >
                <input
                  ref={exportLicenseInputRef}
                  aria-describedby={exportErrors.license
                    ? "character-export-license-error"
                    : "character-export-license-hint"}
                  aria-invalid={Boolean(exportErrors.license)}
                  disabled={isExportingPack}
                  placeholder="CC-BY-4.0"
                  value={exportDraft.license}
                  onChange={(event) => updateExportDraft("license", event.target.value)}
                />
              </CharacterExportField>
              <CharacterExportField
                error={exportErrors.version}
                errorId="character-export-version-error"
                hint={t("characterChat.exportPack.versionHint")}
                label={t("characterChat.exportPack.versionLabel")}
              >
                <input
                  ref={exportVersionInputRef}
                  aria-describedby={exportErrors.version
                    ? "character-export-version-error"
                    : "character-export-version-hint"}
                  aria-invalid={Boolean(exportErrors.version)}
                  disabled={isExportingPack}
                  placeholder="1.0.0"
                  value={exportDraft.version}
                  onChange={(event) => updateExportDraft("version", event.target.value)}
                />
              </CharacterExportField>
              <CharacterExportField
                error={exportErrors.releaseNotes}
                errorId="character-export-notes-error"
                label={t("characterChat.exportPack.releaseNotesLabel")}
              >
                <textarea
                  ref={exportReleaseNotesInputRef}
                  aria-describedby={exportErrors.releaseNotes ? "character-export-notes-error" : undefined}
                  aria-invalid={Boolean(exportErrors.releaseNotes)}
                  disabled={isExportingPack}
                  rows={4}
                  value={exportDraft.releaseNotes}
                  onChange={(event) => updateExportDraft("releaseNotes", event.target.value)}
                />
              </CharacterExportField>
              {exportSubmitError ? (
                <p className="character-export-submit-error" role="alert">
                  <AlertTriangle size={16} />
                  {exportSubmitError}
                </p>
              ) : null}
            </div>
            <footer className="character-dialog-actions">
              <button
                className="button secondary"
                disabled={isExportingPack}
                type="button"
                onClick={() => setExportDraft(null)}
              >
                {t("characterChat.dialogs.cancel")}
              </button>
              <button className="button primary" disabled={isExportingPack} type="submit">
                {isExportingPack ? <Loader2 className="spin" size={16} /> : <Download size={16} />}
                {isExportingPack
                  ? t("characterChat.exportPack.exporting")
                  : t("characterChat.exportPack.exportButton")}
              </button>
            </footer>
          </form>
        </Dialog>
      ) : null}

      {pendingRemoteImageApproval ? (
        <Dialog
          ariaDescribedBy="character-remote-image-description"
          ariaLabelledBy="character-remote-image-title"
          backdropClassName="character-dialog-backdrop"
          className="character-dialog character-confirm-dialog"
          data-qa="character-remote-image-dialog"
          initialFocusRef={dialogCancelButtonRef}
          onClose={() => setPendingRemoteImageApproval(null)}
        >
          <CharacterConfirmDialogHeader
            closeLabel={t("characterChat.dialogs.close")}
            eyebrow={t("characterChat.manage.remoteDialogKicker")}
            title={t("characterChat.manage.remoteDialogTitle")}
            titleId="character-remote-image-title"
            onClose={() => setPendingRemoteImageApproval(null)}
          />
          <div className="character-dialog-body">
            <p id="character-remote-image-description">
              {t("characterChat.manage.remoteConfirm", {
                count: pendingRemoteImageApproval.urls.length,
                formattedCount: formatCharacterCount(
                  pendingRemoteImageApproval.urls.length,
                  localeTag
                )
              })}
            </p>
            <div className="character-remote-hosts">
              <strong>{t("characterChat.manage.remoteHosts")}</strong>
              <ul>
                {getRemoteImageHostLabels(
                  pendingRemoteImageApproval.urls,
                  t("common.unknown")
                ).map((host) => (
                  <li key={host}>{host}</li>
                ))}
              </ul>
            </div>
            <p className="character-dialog-warning">
              <AlertTriangle size={17} />
              {t("characterChat.manage.remoteSessionOnly")}
            </p>
          </div>
          <footer className="character-dialog-actions">
            <button
              ref={dialogCancelButtonRef}
              className="button secondary"
              type="button"
              onClick={() => setPendingRemoteImageApproval(null)}
            >
              {t("characterChat.dialogs.cancel")}
            </button>
            <button className="button primary" type="button" onClick={confirmRemoteImageApproval}>
              {t("characterChat.manage.remoteApproveButton")}
            </button>
          </footer>
        </Dialog>
      ) : null}

      {pendingDelete ? (
        <Dialog
          ariaDescribedBy="character-delete-description"
          ariaLabelledBy="character-delete-title"
          backdropClassName="character-dialog-backdrop"
          className="character-dialog character-confirm-dialog"
          data-qa="character-delete-dialog"
          initialFocusRef={dialogCancelButtonRef}
          onClose={() => setPendingDelete(null)}
        >
          <CharacterConfirmDialogHeader
            closeLabel={t("characterChat.dialogs.close")}
            eyebrow={t("characterChat.manage.deleteKicker")}
            title={t("characterChat.manage.deleteDialogTitle", { name: pendingDelete.name })}
            titleId="character-delete-title"
            onClose={() => setPendingDelete(null)}
          />
          <div className="character-dialog-body">
            <p id="character-delete-description">
              {t("characterChat.messages.deleteConfirm", { name: pendingDelete.name })}
            </p>
            <p className="character-dialog-warning danger">
              <AlertTriangle size={17} />
              {t("characterChat.manage.deletePermanent")}
            </p>
          </div>
          <footer className="character-dialog-actions">
            <button
              ref={dialogCancelButtonRef}
              className="button secondary"
              type="button"
              onClick={() => setPendingDelete(null)}
            >
              {t("characterChat.dialogs.cancel")}
            </button>
            <button className="button danger" type="button" onClick={confirmDeletePreset}>
              <Trash2 size={16} />
              {t("characterChat.manage.deleteConfirmButton")}
            </button>
          </footer>
        </Dialog>
      ) : null}

      {pendingReset ? (
        <Dialog
          ariaDescribedBy="character-reset-description"
          ariaLabelledBy="character-reset-title"
          backdropClassName="character-dialog-backdrop"
          className="character-dialog character-confirm-dialog"
          data-qa="character-reset-dialog"
          initialFocusRef={dialogCancelButtonRef}
          onClose={() => setPendingReset(null)}
        >
          <CharacterConfirmDialogHeader
            closeLabel={t("characterChat.dialogs.close")}
            eyebrow={t("characterChat.chat.resetKicker")}
            title={t("characterChat.chat.resetDialogTitle", { name: pendingReset.name })}
            titleId="character-reset-title"
            onClose={() => setPendingReset(null)}
          />
          <div className="character-dialog-body">
            <p id="character-reset-description">
              {t("characterChat.chat.resetDescription")}
            </p>
          </div>
          <footer className="character-dialog-actions">
            <button
              ref={dialogCancelButtonRef}
              className="button secondary"
              type="button"
              onClick={() => setPendingReset(null)}
            >
              {t("characterChat.dialogs.cancel")}
            </button>
            <button className="button danger" type="button" onClick={confirmResetChat}>
              <RefreshCw size={16} />
              {t("characterChat.chat.resetConfirmButton")}
            </button>
          </footer>
        </Dialog>
      ) : null}

      {pendingExternalRequest ? (
        <Dialog
          ariaDescribedBy="character-external-description"
          ariaLabelledBy="character-external-title"
          backdropClassName="character-dialog-backdrop"
          className="character-dialog character-external-dialog"
          data-qa="character-external-transfer-dialog"
          initialFocusRef={dialogCancelButtonRef}
          onClose={() => setPendingExternalRequest(null)}
        >
          <CharacterConfirmDialogHeader
            closeLabel={t("characterChat.dialogs.close")}
            eyebrow={t("characterChat.externalConfirm.kicker")}
            title={t("characterChat.externalConfirm.title")}
            titleId="character-external-title"
            onClose={() => setPendingExternalRequest(null)}
          />
          <div className="character-dialog-body">
            <p id="character-external-description">{t("characterChat.externalConfirm.confirm")}</p>
            <dl className="character-dialog-facts character-external-facts">
              <div>
                <dt>{t("characterChat.externalConfirm.labels.provider")}</dt>
                <dd>
                  {pendingExternalRequest.preflight.usesGemini
                    ? t("characterChat.externalConfirm.geminiProvider", { model: settings.geminiModel })
                    : t("characterChat.externalConfirm.remoteOllama", { url: settings.ollamaBaseUrl })}
                </dd>
              </div>
              <div>
                <dt>{t("characterChat.externalConfirm.labels.payload")}</dt>
                <dd>{t("characterChat.externalConfirm.payload")}</dd>
              </div>
              <div>
                <dt>{t("characterChat.externalConfirm.labels.currentPayload")}</dt>
                <dd>{t("characterChat.externalConfirm.currentPayload", {
                  messages: pendingExternalRequest.preflight.recentMessageCount,
                  hints: pendingExternalRequest.preflight.hintCount
                })}</dd>
              </div>
              <div>
                <dt>{t("characterChat.externalConfirm.labels.cost")}</dt>
                <dd>
                  {pendingExternalRequest.preflight.usesGemini
                    ? t("characterChat.externalConfirm.costRange", {
                        value: getCharacterExternalCostLabel(
                          pendingExternalRequest.preflight.estimatedCostKrw,
                          t,
                          localeTag
                        )
                      })
                    : t("characterChat.externalConfirm.remoteCostUnknown")}
                </dd>
              </div>
              <div>
                <dt>{t("characterChat.externalConfirm.labels.calls")}</dt>
                <dd>
                  {pendingExternalRequest.preflight.usesGemini
                    ? t("characterChat.externalConfirm.geminiCalls", {
                        count: GEMINI_MAX_ATTEMPTS_PER_REQUEST
                      })
                    : t("characterChat.externalConfirm.oneCall")}
                </dd>
              </div>
              <div>
                <dt>{t("characterChat.externalConfirm.labels.month")}</dt>
                <dd>{t("characterChat.externalConfirm.monthlyEstimate", {
                  value: Math.ceil(pendingExternalRequest.preflight.monthEstimateKrw).toLocaleString(localeTag)
                })}</dd>
              </div>
            </dl>
            <p className="character-dialog-warning">
              <AlertTriangle size={17} />
              {t("characterChat.externalConfirm.guardWarning")}
            </p>
          </div>
          <footer className="character-dialog-actions">
            <button
              ref={dialogCancelButtonRef}
              className="button secondary"
              type="button"
              onClick={() => setPendingExternalRequest(null)}
            >
              {t("characterChat.dialogs.cancel")}
            </button>
            <button
              className="button primary"
              type="button"
              onClick={() => void continuePendingExternalRequest()}
            >
              {t("characterChat.externalConfirm.continueButton")}
            </button>
          </footer>
        </Dialog>
      ) : null}
    </div>
  );
}

function CharacterConfirmDialogHeader({
  closeLabel,
  eyebrow,
  onClose,
  title,
  titleId
}: {
  closeLabel: string;
  eyebrow: string;
  onClose: () => void;
  title: string;
  titleId: string;
}) {
  return (
    <header className="character-dialog-header">
      <div>
        <span>{eyebrow}</span>
        <h2 id={titleId}>{title}</h2>
      </div>
      <button aria-label={closeLabel} className="icon-button" type="button" onClick={onClose}>
        <X size={18} />
      </button>
    </header>
  );
}

function CharacterExportField({
  children,
  error,
  errorId,
  hint,
  label
}: {
  children: ReactNode;
  error?: string;
  errorId: string;
  hint?: string;
  label: string;
}) {
  const hintId = errorId.replace(/-error$/, "-hint");
  return (
    <label className="character-export-field">
      <span>{label}</span>
      {children}
      {error ? <small className="character-export-error" id={errorId}>{error}</small> : null}
      {!error && hint ? <small className="character-export-hint" id={hintId}>{hint}</small> : null}
    </label>
  );
}

const characterPackSemverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const characterPackSpdxPattern =
  /^(?:[A-Za-z0-9][A-Za-z0-9.+-]*)(?:\s+(?:AND|OR)\s+(?:[A-Za-z0-9][A-Za-z0-9.+-]*))*(?:\s+WITH\s+(?:[A-Za-z0-9][A-Za-z0-9.+-]*))?$/;

function validateCharacterPackExportDraft(
  draft: CharacterPackExportDraft,
  t: TFunction
): CharacterPackExportErrors {
  const errors: CharacterPackExportErrors = {};
  const creator = draft.creator.trim();
  const sourceUrl = draft.sourceUrl.trim();
  const license = draft.license.trim();
  const version = draft.version.trim();
  const releaseNotes = draft.releaseNotes.trim();

  if (!creator || creator.length > 200 || /[\u0000-\u001f\u007f]/.test(creator)) {
    errors.creator = t("characterChat.exportPack.validation.creator");
  }
  if (!isValidCharacterPackSourceUrl(sourceUrl)) {
    errors.sourceUrl = t("characterChat.exportPack.validation.sourceUrl");
  }
  if (!license || license.length > 200 || !characterPackSpdxPattern.test(license)) {
    errors.license = t("characterChat.exportPack.validation.license");
  }
  if (!isValidCharacterPackExportSemver(version)) {
    errors.version = t("characterChat.exportPack.validation.version");
  }
  if (!releaseNotes || releaseNotes.length > 20_000) {
    errors.releaseNotes = t("characterChat.exportPack.validation.releaseNotes");
  }
  return errors;
}

function isValidCharacterPackSourceUrl(value: string) {
  if (!value || value.length > 2_048 || /[\u0000-\u001f\u007f]/.test(value)) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function isValidCharacterPackExportSemver(value: string) {
  if (!value || value.length > 128) {
    return false;
  }
  const match = value.match(characterPackSemverPattern);
  if (!match) {
    return false;
  }
  return !(match[4]?.split(".").some(
    (identifier) => /^\d+$/.test(identifier) && identifier.length > 1 && identifier.startsWith("0")
  ) ?? false);
}

function focusFirstCharacterPackExportError(
  errors: CharacterPackExportErrors,
  fields: Record<CharacterPackExportField, HTMLElement | null>
) {
  const firstInvalidField = (Object.keys(fields) as CharacterPackExportField[])
    .find((field) => Boolean(errors[field]));
  if (firstInvalidField) {
    fields[firstInvalidField]?.focus({ preventScroll: true });
  }
}

function getRemoteImageHostLabels(urls: string[], invalidFallback: string) {
  return [...new Set(urls.map((url) => {
    try {
      return new URL(url).host;
    } catch {
      return invalidFallback;
    }
  }))];
}

function getCharacterExternalCostLabel(
  range: { min: number; max: number } | null,
  t: TFunction,
  localeTag: string
) {
  if (!range || (range.min === 0 && range.max === 0)) {
    return t("characterChat.externalConfirm.possibleCost");
  }
  return formatCharacterKrwRange(range, t, localeTag);
}

function CharacterAvatar({
  preset,
  size,
  emotion
}: {
  preset: CharacterPreset | undefined;
  size: "small" | "message" | "large" | "portrait";
  emotion?: CharacterEmotion;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = getCharacterAvatarImageUrl(preset, emotion);
  const initial = getCharacterInitial(preset?.name);
  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);
  return (
    <span className={`character-avatar ${size} emotion-${emotion ?? "neutral"}`} aria-hidden="true">
      {imageUrl && !imageFailed ? (
        <img alt="" src={imageUrl} onError={() => setImageFailed(true)} />
      ) : initial ? (
        <span>{initial}</span>
      ) : (
        <Bot size={size === "large" || size === "portrait" ? 24 : 16} />
      )}
    </span>
  );
}

function CharacterExpressionBadge({
  preset,
  size = "normal"
}: {
  preset: CharacterPreset | undefined;
  size?: "small" | "normal";
}) {
  const { i18n, t } = useTranslation();
  const localeTag = (i18n.resolvedLanguage ?? i18n.language).startsWith("en")
    ? "en-US"
    : "ko-KR";
  const hasExpressions = hasCharacterExpressionImages(preset);
  const count = getCharacterExpressionImageCount(preset);
  return (
    <span className={`character-expression-badge ${hasExpressions ? "has-images" : "empty"} ${size}`}>
      {hasExpressions
        ? t("characterChat.expressionBadge.count", {
            count,
            formattedCount: formatCharacterCount(count, localeTag)
          })
        : t("characterChat.expressionBadge.none")}
    </span>
  );
}

function CharacterExpressionSprite({
  preset,
  emotion
}: {
  preset: CharacterPreset | undefined;
  emotion: CharacterEmotion | undefined;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = hasCharacterExpressionImages(preset)
    ? getCharacterAvatarImageUrl(preset, emotion)
    : "";
  useEffect(() => {
    setImageFailed(false);
  }, [imageUrl]);
  if (!imageUrl || imageFailed) {
    return null;
  }
  return (
    <figure className={`character-expression-sprite emotion-${emotion ?? "neutral"}`}>
      <img alt="" src={imageUrl} onError={() => setImageFailed(true)} />
    </figure>
  );
}

function getCharacterAvatarImageUrl(
  preset: CharacterPreset | undefined,
  emotion: CharacterEmotion | undefined
) {
  if (!preset) {
    return "";
  }
  const selectedEmotion = emotion ?? "neutral";
  const fallbackEmotion = preset.expressionFallbackEmotion ?? "neutral";
  const imageUrl = (
    preset.emotionImageUrls?.[selectedEmotion]?.trim() ||
    preset.emotionImageUrls?.[fallbackEmotion]?.trim() ||
    preset.emotionImageUrls?.neutral?.trim() ||
    preset.avatarImageUrl?.trim() ||
    ""
  );
  return isRemoteCharacterImageUrl(imageUrl) && !approvedRemoteCharacterImageUrls.has(imageUrl)
    ? ""
    : imageUrl;
}

function getCharacterInitial(name: string | undefined) {
  return name?.trim().charAt(0).toUpperCase() ?? "";
}

function getCharacterSourceFormatLabel(sourceFormat: string | undefined, t: TFunction) {
  switch (sourceFormat) {
    case "local":
      return t("characterChat.sourceFormats.local");
    case "language_miner_pack":
      return t("characterChat.sourceFormats.languageMinerPack");
    case "tavern_v1":
      return t("characterChat.sourceFormats.tavernV1");
    case "tavern_v2":
      return t("characterChat.sourceFormats.tavernV2");
    case "tavern_v3":
      return t("characterChat.sourceFormats.tavernV3");
    case "generic_json":
      return t("characterChat.sourceFormats.genericJson");
    default:
      return t("characterChat.sourceFormats.unknown");
  }
}

function getCharacterPackStatusLabel(status: CharacterPackStatus, t: TFunction) {
  switch (status) {
    case "quarantined":
      return t("characterChat.importReport.statuses.quarantined");
    case "blocked":
      return t("characterChat.importReport.statuses.blocked");
    case "warning":
      return t("characterChat.importReport.statuses.warning");
    case "ready":
      return t("characterChat.importReport.statuses.ready");
    case "trusted_official":
      return t("characterChat.importReport.statuses.trustedOfficial");
  }
}

function getCharacterPackPermissionLabel(permission: CharacterPackPermission, t: TFunction) {
  switch (permission) {
    case "remote_images":
      return t("characterChat.importReport.permissionLabels.remoteImages");
  }
}

function getCharacterImportErrorMessage(error: unknown, t: TFunction) {
  if (!(error instanceof Error)) {
    return t("characterChat.messages.importFailed");
  }
  const message = error.message;
  const exactMessages: Record<string, string> = {
    "캐릭터카드가 허용된 최대 크기(2MB)를 초과합니다.": t("characterChat.importReport.errors.tooLarge"),
    "캐릭터카드의 최상위 값은 JSON 객체여야 합니다.": t("characterChat.importReport.errors.objectRequired"),
    "캐릭터 이름이 없습니다.": t("characterChat.importReport.errors.nameMissing"),
    "캐릭터 설명, 성격, 상황 또는 첫 메시지 중 하나 이상이 필요합니다.": t("characterChat.importReport.errors.detailsMissing"),
    "SHA-256 검사를 사용할 수 없습니다.": t("characterChat.importReport.errors.hashUnavailable"),
    "캐릭터카드의 JSON 항목이 너무 많습니다.": t("characterChat.importReport.errors.tooManyItems"),
    "캐릭터카드의 JSON 중첩이 너무 깊습니다.": t("characterChat.importReport.errors.tooDeep"),
    "캐릭터카드의 JSON 배열이 너무 큽니다.": t("characterChat.importReport.errors.arrayTooLarge"),
    "원격 캐릭터 이미지 URL에 계정 정보를 넣을 수 없습니다.": t("characterChat.importReport.errors.credentialsForbidden"),
    "캐릭터카드에서 원격 SVG 이미지는 허용하지 않습니다.": t("characterChat.importReport.errors.svgForbidden"),
    "원격 캐릭터 이미지는 PNG/JPEG/WebP/GIF 파일이어야 합니다.": t("characterChat.importReport.errors.imageUrlInvalid"),
    "캐릭터 이미지에는 안전한 앱 내부 경로, HTTPS 또는 PNG/JPEG/WebP/GIF data URL만 사용할 수 있습니다.": t("characterChat.importReport.errors.imageUrlInvalid")
  };
  if (exactMessages[message]) {
    return exactMessages[message];
  }
  const forbiddenKeyPrefix = "허용되지 않는 캐릭터카드 JSON 키입니다: ";
  if (message.startsWith(forbiddenKeyPrefix)) {
    return t("characterChat.importReport.errors.forbiddenKey", {
      key: message.slice(forbiddenKeyPrefix.length)
    });
  }
  const executableKeyPrefix = "실행 가능한 콘텐츠 필드는 캐릭터카드에 허용되지 않습니다: ";
  if (message.startsWith(executableKeyPrefix)) {
    return t("characterChat.importReport.errors.executableForbidden", {
      key: message.slice(executableKeyPrefix.length)
    });
  }
  if (error instanceof SyntaxError) {
    return t("characterChat.importReport.errors.invalidJson");
  }
  if (/payload SHA-256 해시가 일치하지 않습니다/.test(message)) {
    return t("characterChat.importReport.errors.hashMismatch");
  }
  if (/remote_images 권한/.test(message)) {
    return t("characterChat.importReport.errors.remotePermissionMissing");
  }
  const incompatibleVersion = message.match(
    /Language Miner ([^ ]+) 이상이 필요합니다\. 현재 버전: ([^ ]+)/
  );
  if (incompatibleVersion) {
    return t("characterChat.importReport.errors.incompatibleVersion", {
      required: incompatibleVersion[1],
      current: incompatibleVersion[2]
    });
  }
  if (
    /캐릭터팩|payload|remote_images|semver|UUID|SPDX|sourceUrl|SHA-256/.test(message)
  ) {
    return t("characterChat.importReport.errors.manifestInvalid");
  }
  return t("characterChat.messages.importFailed");
}

function getCharacterPackExportErrorMessage(error: unknown, t: TFunction) {
  if (!(error instanceof Error)) return t("characterChat.exportPack.failed");
  if (error.message === "SHA-256 검사를 사용할 수 없습니다.") {
    return t("characterChat.importReport.errors.hashUnavailable");
  }
  return t("characterChat.exportPack.failed");
}

function formatCharacterKrwRange(
  range: { min: number; max: number },
  t: TFunction,
  localeTag: string
) {
  const min = Math.round(range.min).toLocaleString(localeTag);
  const max = Math.round(range.max).toLocaleString(localeTag);
  if (Math.abs(range.max - range.min) <= 1) {
    return t("characterChat.externalConfirm.approximateCost", { value: max });
  }
  return t("characterChat.externalConfirm.approximateCostRange", { min, max });
}

function formatCharacterCount(value: number, localeTag: string) {
  return new Intl.NumberFormat(localeTag).format(value);
}

function getLatestCharacterEmotion(messages: CharacterChatMessage[]): CharacterEmotion {
  const latestCharacterMessage = [...messages]
    .reverse()
    .find((message) => message.role === "character");
  return latestCharacterMessage
    ? getMessageDisplayEmotion(latestCharacterMessage, latestCharacterMessage.mode ?? "target_practice")
    : "neutral";
}

function getLatestCharacterMessageId(messages: CharacterChatMessage[]) {
  return [...messages].reverse().find((message) => message.role === "character")?.id ?? "";
}

function getLatestConversationPreview(
  messages: CharacterChatMessage[],
  characterName: string,
  emptyLabel: string
) {
  const latest = [...messages].reverse().find((message) => message.content.trim());
  if (!latest) {
    return emptyLabel;
  }
  const speaker = latest.role === "user" ? "Me" : characterName;
  return `${speaker}: ${replaceCharacterMacros(latest.content, characterName).slice(0, 86)}`;
}

function getCharacterCorrectionModeLabel(mode: CharacterCorrectionMode, t: TFunction) {
  switch (mode) {
    case "instant":
      return t("characterChat.correction.instant");
    case "turn_summary":
      return t("characterChat.correction.turnSummary");
    case "session_summary":
      return t("characterChat.correction.sessionSummary");
    default:
      return t("characterChat.correction.off");
  }
}

function getCharacterEmotionLabel(emotion: CharacterEmotion, t: TFunction) {
  switch (emotion) {
    case "happy":
      return t("characterChat.emotions.happy");
    case "listening":
      return t("characterChat.emotions.listening");
    case "thinking":
      return t("characterChat.emotions.thinking");
    case "surprised":
      return t("characterChat.emotions.surprised");
    case "concerned":
      return t("characterChat.emotions.concerned");
    case "celebrating":
      return t("characterChat.emotions.celebrating");
    case "explaining":
      return t("characterChat.emotions.explaining");
    case "discovering":
      return t("characterChat.emotions.discovering");
    case "tired":
      return t("characterChat.emotions.tired");
    case "confused":
      return t("characterChat.emotions.confused");
    default:
      return t("characterChat.emotions.neutral");
  }
}

function getMessageDisplayEmotion(
  message: CharacterChatMessage,
  fallbackChatMode: CharacterChatMode
): CharacterEmotion {
  return (
    message.emotion ??
    inferCharacterEmotion(
      message.content,
      message.feedbackKo,
      message.mode ?? fallbackChatMode
    )
  );
}

function inferCharacterEmotion(
  content: string,
  feedbackKo: string | undefined,
  chatMode: CharacterChatMode
): CharacterEmotion {
  const normalized = content.toLowerCase();
  if (feedbackKo) {
    return "explaining";
  }
  if (
    normalized.includes("found") ||
    normalized.includes("discover") ||
    normalized.includes("shiny") ||
    normalized.includes("gem") ||
    normalized.includes("ore") ||
    content.includes("발견") ||
    content.includes("반짝")
  ) {
    return "discovering";
  }
  if (
    normalized.includes("tired") ||
    normalized.includes("sleepy") ||
    normalized.includes("exhausted") ||
    content.includes("피곤") ||
    content.includes("졸려")
  ) {
    return "tired";
  }
  if (
    normalized.includes("confused") ||
    normalized.includes("not sure") ||
    normalized.includes("unclear") ||
    normalized.includes("hmm") ||
    content.includes("헷갈")
  ) {
    return "confused";
  }
  if (
    normalized.includes("great") ||
    normalized.includes("good") ||
    normalized.includes("nice") ||
    normalized.includes("glad") ||
    normalized.includes("proud") ||
    normalized.includes("well done") ||
    content.includes("축하") ||
    content.includes("좋아")
  ) {
    return "celebrating";
  }
  if (
    normalized.includes("listen") ||
    normalized.includes("hear you") ||
    normalized.includes("tell me") ||
    content.includes("들어")
  ) {
    return "listening";
  }
  if (
    normalized.includes("hard") ||
    normalized.includes("sorry") ||
    normalized.includes("sad") ||
    content.includes("힘들") ||
    content.includes("미안")
  ) {
    return "concerned";
  }
  if (
    normalized.includes("maybe") ||
    normalized.includes("think") ||
    normalized.includes("why") ||
    normalized.includes("how") ||
    content.includes("?")
  ) {
    return "thinking";
  }
  if (content.includes("!") || normalized.includes("wow") || normalized.includes("really")) {
    return "surprised";
  }
  if (normalized.includes("happy") || content.includes("기뻐")) {
    return "happy";
  }
  return chatMode === "native_capture" ? "listening" : "neutral";
}

function readCharacterPresets() {
  try {
    const saved = localStorage.getItem(CHARACTER_PRESETS_STORAGE_KEY);
    const parsed = saved ? (JSON.parse(saved) as CharacterPreset[]) : [];
    if (Array.isArray(parsed) && parsed.length > 0) {
      localStorage.removeItem(CHARACTER_DEFAULT_MOLLY_DISMISSED_STORAGE_KEY);
      const seeded = ensureDefaultMollyPreset(parsed);
      if (seeded.changed) {
        localStorage.setItem(CHARACTER_PRESETS_STORAGE_KEY, JSON.stringify(seeded.presets));
      }
      if (seeded.added) {
        localStorage.setItem(CHARACTER_DEFAULT_MOLLY_SEEDED_STORAGE_KEY, "1");
      }
      return seeded.presets;
    }
  } catch {
    // Use default below.
  }
  const defaultPreset = createDefaultCharacterPreset();
  localStorage.setItem(CHARACTER_PRESETS_STORAGE_KEY, JSON.stringify([defaultPreset]));
  localStorage.setItem(CHARACTER_DEFAULT_MOLLY_SEEDED_STORAGE_KEY, "1");
  return [defaultPreset];
}

function readCharacterSessions(): CharacterSessions {
  try {
    const saved = localStorage.getItem(CHARACTER_SESSION_STORAGE_KEY);
    return saved ? (JSON.parse(saved) as CharacterSessions) : {};
  } catch {
    return {};
  }
}

function readCharacterChatMode(): CharacterChatMode {
  try {
    const saved = localStorage.getItem(CHARACTER_MODE_STORAGE_KEY);
    return saved === "native_capture" || saved === "target_practice"
      ? saved
      : "target_practice";
  } catch {
    return "target_practice";
  }
}

function readCharacterCorrectionMode(): CharacterCorrectionMode {
  try {
    const saved = localStorage.getItem(CHARACTER_CORRECTION_STORAGE_KEY);
    return isCharacterCorrectionMode(saved) ? saved : "off";
  } catch {
    return "off";
  }
}

function isCharacterCorrectionMode(value: string | null): value is CharacterCorrectionMode {
  return (
    value === "off" ||
    value === "instant" ||
    value === "turn_summary" ||
    value === "session_summary"
  );
}

function migrateLegacyDefaultMinaSessions(
  sessions: CharacterSessions,
  presets: CharacterPreset[]
): CharacterSessions {
  let changed = false;
  const nextSessions = { ...sessions };
  presets.forEach((preset) => {
    const session = nextSessions[preset.id];
    if (
      session?.length === 1 &&
      session[0]?.role === "character" &&
      session[0]?.content === legacyMinaFirstMessage
    ) {
      nextSessions[preset.id] = initialMessagesFromPreset(preset);
      changed = true;
    }
  });
  return changed ? nextSessions : sessions;
}

function getSessionMessages(sessions: CharacterSessions, preset: CharacterPreset) {
  return sessions[preset.id]?.length ? sessions[preset.id] : initialMessagesFromPreset(preset);
}

function initialMessagesFromPreset(preset: CharacterPreset): CharacterChatMessage[] {
  if (!preset.firstMessage.trim()) {
    return [];
  }
  return [
    {
      id: `${preset.id}-first-message`,
      role: "character",
      content: preset.firstMessage,
      createdAt: preset.createdAt,
      emotion: "neutral"
    }
  ];
}

function sanitizeFileName(value: string) {
  return (value || "character").replace(/[\\/:*?"<>|]+/g, "-").trim();
}
