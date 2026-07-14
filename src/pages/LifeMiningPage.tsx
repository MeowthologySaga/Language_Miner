import "../styles/lifeMining.css";
import {
  Calculator,
  Check,
  Clock,
  Globe2,
  Inbox,
  Lightbulb,
  ListChecks,
  Loader2,
  Plus,
  Radio,
  Save,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { CardGenerationUsageEstimate } from "../components/CardGenerationUsageEstimate";
import { CardPreview } from "../components/CardPreview";
import { Dialog } from "../components/Dialog";
import { EmptyState } from "../components/EmptyState";
import type { LocalEnglishMinerApi } from "../data/api";
import type { LLMProvider } from "../services/llm/types";
import { createStudyCardFromGenerated } from "../shared/cardFactory";
import {
  getLifeLogDisplayMessages,
  type LifeLogDisplayMessage
} from "../shared/lifeLogMessages";
import { isLifeLogProcessedForProfile } from "../shared/lifeLogProgress";
import { isRemoteOllamaUrl } from "../shared/localEndpointPolicy";
import { isAbortError } from "../shared/translationRequestLimits";
import type { CardGenerationUsageEstimate as CardGenerationUsageEstimateData } from "../shared/cardGenerationUsage";
import {
  combineTranslationUsageBudgetRequests,
  estimateTranslationUsage,
  toTranslationUsageBudgetRequest,
  type TranslationUsageBudgetAssessment,
  type TranslationUsageBudgetRequest
} from "../shared/translationUsage";
import type { AppSettings, LifeLog, StudyCard } from "../shared/types";
import { previewTranslationUsageBudget } from "../utils/translationUsageLedger";
import {
  calculateLifeLogVirtualWindow,
  getLifeLogNavigationIndex,
  getScrollTopForVirtualLifeLogIndex,
  LIFE_LOG_DEFAULT_VIEWPORT_HEIGHT,
  LIFE_LOG_VIRTUALIZATION_THRESHOLD,
  LIFE_LOG_VIRTUAL_OVERSCAN,
  LIFE_LOG_VIRTUAL_ROW_HEIGHT
} from "./lifeMiningVirtualization";

type LifeMiningPageProps = {
  api: LocalEnglishMinerApi;
  provider: LLMProvider;
  settings: AppSettings;
  lifeLogs: LifeLog[];
  onLifeLogsChanged: () => Promise<void>;
  onCardsChanged: () => Promise<void>;
};

type LifeLogConversationMessage = LifeLogDisplayMessage;
type LifeLogCandidatePreviewMessage = LifeLogConversationMessage & {
  isTarget: boolean;
};
type LifeBulkAction = "delete" | "generate";

const LIFE_LOG_BUBBLE_COLLAPSE_LENGTH = 220;
const LIFE_LOG_CANDIDATE_PREVIEW_TEXT_LENGTH = 54;

export function LifeMiningPage({
  api,
  provider,
  settings,
  lifeLogs,
  onLifeLogsChanged,
  onCardsChanged
}: LifeMiningPageProps) {
  const { t, i18n } = useTranslation();
  const localeTag = (i18n.resolvedLanguage ?? i18n.language).startsWith("en")
    ? "en-US"
    : "ko-KR";
  const [text, setText] = useState("");
  const [beforeContext, setBeforeContext] = useState("");
  const [afterContext, setAfterContext] = useState("");
  const [selectedLog, setSelectedLog] = useState<LifeLog | null>(null);
  const [candidate, setCandidate] = useState<StudyCard | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingLifeLog, setIsSavingLifeLog] = useState(false);
  const [isSavingCard, setIsSavingCard] = useState(false);
  const [savedCardId, setSavedCardId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusMessageIsError, setStatusMessageIsError] = useState(false);
  const [isResultPopoverOpen, setIsResultPopoverOpen] = useState(false);
  const [pendingCostLog, setPendingCostLog] = useState<LifeLog | null>(null);
  const [isManualAddOpen, setIsManualAddOpen] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  const [pendingBulkAction, setPendingBulkAction] = useState<LifeBulkAction | null>(null);
  const [isBulkActionRunning, setIsBulkActionRunning] = useState(false);
  const detailPanelRef = useRef<HTMLElement | null>(null);
  const savingLifeLogRef = useRef(false);
  const generationLogIdsRef = useRef(new Set<string>());
  const generationAbortControllerRef = useRef<AbortController | null>(null);
  const savingCardRef = useRef(false);
  const bulkSavedCardIdsRef = useRef(new Map<string, string>());
  const lifeLogListRef = useRef<HTMLDivElement | null>(null);
  const pendingLifeLogFocusIndexRef = useRef<number | null>(null);
  const [activeLifeLogId, setActiveLifeLogId] = useState<string | null>(null);
  const [lifeLogListScrollTop, setLifeLogListScrollTop] = useState(0);
  const [lifeLogListViewportHeight, setLifeLogListViewportHeight] = useState(
    LIFE_LOG_DEFAULT_VIEWPORT_HEIGHT
  );
  const [lifeLogColumnCount, setLifeLogColumnCount] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 1240px)").matches ? 1 : 2
  );
  const visibleLifeLogs = useMemo(
    () => lifeLogs.filter((log) => !isLifeLogProcessedForProfile(log, settings.profileId)),
    [lifeLogs, settings.profileId]
  );
  const visibleLifeLogIdSet = useMemo(
    () => new Set(visibleLifeLogs.map((log) => log.id)),
    [visibleLifeLogs]
  );
  const autoLogs = useMemo(
    () => visibleLifeLogs.filter((log) => log.sourceType === "browser_extension"),
    [visibleLifeLogs]
  );
  const isLifeLogListVirtualized =
    visibleLifeLogs.length >= LIFE_LOG_VIRTUALIZATION_THRESHOLD;
  const virtualLifeLogWindow = useMemo(
    () =>
      calculateLifeLogVirtualWindow({
        itemCount: visibleLifeLogs.length,
        columnCount: lifeLogColumnCount,
        rowHeight: LIFE_LOG_VIRTUAL_ROW_HEIGHT,
        scrollTop: isLifeLogListVirtualized ? lifeLogListScrollTop : 0,
        viewportHeight: lifeLogListViewportHeight,
        overscan: LIFE_LOG_VIRTUAL_OVERSCAN
      }),
    [
      isLifeLogListVirtualized,
      lifeLogColumnCount,
      lifeLogListScrollTop,
      lifeLogListViewportHeight,
      visibleLifeLogs.length
    ]
  );
  const renderedLifeLogStartIndex = isLifeLogListVirtualized
    ? virtualLifeLogWindow.startItemIndex
    : 0;
  const renderedLifeLogs = useMemo(
    () =>
      isLifeLogListVirtualized
        ? visibleLifeLogs.slice(
            virtualLifeLogWindow.startItemIndex,
            virtualLifeLogWindow.endItemIndex
          )
        : visibleLifeLogs,
    [
      isLifeLogListVirtualized,
      virtualLifeLogWindow.endItemIndex,
      virtualLifeLogWindow.startItemIndex,
      visibleLifeLogs
    ]
  );
  const rovingLifeLogId = activeLifeLogId && visibleLifeLogIdSet.has(activeLifeLogId)
    ? activeLifeLogId
    : selectedLog && visibleLifeLogIdSet.has(selectedLog.id)
      ? selectedLog.id
      : visibleLifeLogs[0]?.id ?? null;
  const renderedHasRovingLifeLog = renderedLifeLogs.some((log) => log.id === rovingLifeLogId);
  const completedForProfileCount = lifeLogs.length - visibleLifeLogs.length;
  const selectedLogIdSet = useMemo(() => new Set(selectedLogIds), [selectedLogIds]);
  const selectedLifeLogs = useMemo(
    () => visibleLifeLogs.filter((log) => selectedLogIdSet.has(log.id)),
    [selectedLogIdSet, visibleLifeLogs]
  );
  const selectedLifeLogCount = selectedLifeLogs.length;
  const isAllVisibleSelected =
    visibleLifeLogs.length > 0 && selectedLifeLogCount === visibleLifeLogs.length;
  const lastAutoLog = autoLogs[0];
  const targetLanguageLabel =
    (i18n.resolvedLanguage === "en"
      ? settings.learningProfile.targetLanguage.nameEn
      : settings.learningProfile.targetLanguage.nameKo) ||
    settings.learningProfile.targetLanguage.nameEn ||
    settings.learningProfile.targetLanguage.nameKo;
  const targetCardLabel = t("lifeMining.targetCard", { language: targetLanguageLabel });
  const usesRemoteOllama =
    settings.providerName === "ollama" && isRemoteOllamaUrl(settings.ollamaBaseUrl);
  const externalTransferNotice =
    settings.providerName === "gemini"
      ? t("lifeMining.cost.geminiTransfer")
      : settings.providerName === "chatgptWeb"
        ? t("manualChatGptBridge.privacyNotice")
      : usesRemoteOllama
        ? t("lifeMining.cost.remoteOllamaTransfer")
        : "";
  const pendingCostEstimate = pendingCostLog
    ? estimateLifeMiningCardCost(pendingCostLog, settings, t, localeTag)
    : null;
  const pendingCostBudgetAssessment = pendingCostEstimate
    ? previewTranslationUsageBudget(settings, pendingCostEstimate.budgetRequest)
    : null;
  const pendingBulkEstimate =
    pendingBulkAction === "generate"
      ? estimateLifeMiningBulkCost(selectedLifeLogs, settings, t, localeTag)
      : null;
  const pendingBulkBudgetAssessment = pendingBulkEstimate
    ? previewTranslationUsageBudget(settings, pendingBulkEstimate.budgetRequest)
    : null;
  const hasOpenOverlay = Boolean(
    pendingCostLog || isManualAddOpen || pendingBulkAction || isResultPopoverOpen
  );
  const selectedLogUsageEstimate = selectedLog
    ? toCardGenerationUsageEstimate(estimateLifeMiningCardCost(selectedLog, settings, t, localeTag))
    : null;

  useEffect(() => {
    if (!selectedLog && !candidate) {
      return;
    }
    const detailPanel = detailPanelRef.current;
    if (!detailPanel) {
      return;
    }

    requestAnimationFrame(() => {
      const bounds = detailPanel.getBoundingClientRect();
      const isMostlyBelowViewport = bounds.top > window.innerHeight * 0.72;
      const isAboveViewport = bounds.bottom < 96;
      if (isMostlyBelowViewport || isAboveViewport) {
        detailPanel.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    });
  }, [candidate, selectedLog]);

  useEffect(() => {
    setSelectedLogIds((previous) => previous.filter((id) => visibleLifeLogIdSet.has(id)));
  }, [visibleLifeLogIdSet]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1240px)");
    const updateColumnCount = () => setLifeLogColumnCount(media.matches ? 1 : 2);
    updateColumnCount();
    media.addEventListener("change", updateColumnCount);
    return () => media.removeEventListener("change", updateColumnCount);
  }, []);

  useEffect(() => {
    const list = lifeLogListRef.current;
    if (!list) {
      return;
    }

    const updateViewportHeight = () => {
      if (list.clientHeight > 0) {
        setLifeLogListViewportHeight(list.clientHeight);
      }
    };
    updateViewportHeight();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateViewportHeight);
      return () => window.removeEventListener("resize", updateViewportHeight);
    }

    const observer = new ResizeObserver(updateViewportHeight);
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setActiveLifeLogId((previous) => {
      if (previous && visibleLifeLogIdSet.has(previous)) {
        return previous;
      }
      if (selectedLog && visibleLifeLogIdSet.has(selectedLog.id)) {
        return selectedLog.id;
      }
      return visibleLifeLogs[0]?.id ?? null;
    });
  }, [selectedLog?.id, visibleLifeLogIdSet, visibleLifeLogs]);

  useEffect(() => {
    const list = lifeLogListRef.current;
    if (!isLifeLogListVirtualized) {
      if (list) {
        list.scrollTop = 0;
      }
      setLifeLogListScrollTop(0);
    }
  }, [isLifeLogListVirtualized]);

  useEffect(() => {
    if (!isLifeLogListVirtualized) {
      return;
    }
    const list = lifeLogListRef.current;
    const activeIndex = visibleLifeLogs.findIndex((log) => log.id === rovingLifeLogId);
    if (!list || activeIndex < 0) {
      return;
    }
    const nextScrollTop = getScrollTopForVirtualLifeLogIndex({
      index: activeIndex,
      itemCount: visibleLifeLogs.length,
      columnCount: lifeLogColumnCount,
      rowHeight: LIFE_LOG_VIRTUAL_ROW_HEIGHT,
      viewportHeight: list.clientHeight || lifeLogListViewportHeight,
      currentScrollTop: list.scrollTop
    });
    if (nextScrollTop !== list.scrollTop) {
      list.scrollTop = nextScrollTop;
    }
    setLifeLogListScrollTop(nextScrollTop);
  }, [
    isLifeLogListVirtualized,
    lifeLogColumnCount,
    lifeLogListViewportHeight,
    rovingLifeLogId,
    visibleLifeLogs
  ]);

  useEffect(() => {
    const pendingIndex = pendingLifeLogFocusIndexRef.current;
    if (pendingIndex === null) {
      return;
    }
    const button = lifeLogListRef.current?.querySelector<HTMLButtonElement>(
      `[data-life-log-index="${pendingIndex}"]`
    );
    if (button) {
      pendingLifeLogFocusIndexRef.current = null;
      button.focus();
    }
  }, [activeLifeLogId, virtualLifeLogWindow.endItemIndex, virtualLifeLogWindow.startItemIndex]);

  useEffect(() => {
    if (!selectedLog) {
      return;
    }

    const latestSelectedLog = lifeLogs.find((log) => log.id === selectedLog.id);
    if (!latestSelectedLog) {
      setSelectedLog(visibleLifeLogs[0] ?? null);
      setCandidate(null);
      setSavedCardId(null);
      return;
    }

    if (isLifeLogProcessedForProfile(latestSelectedLog, settings.profileId)) {
      setSelectedLog(visibleLifeLogs.find((log) => log.id !== selectedLog.id) ?? null);
      setCandidate(null);
      setSavedCardId(null);
      return;
    }

    setSelectedLog(latestSelectedLog);
  }, [lifeLogs, selectedLog?.id, settings.profileId]);

  async function saveLifeLog() {
    if (!text.trim() || savingLifeLogRef.current) {
      return;
    }
    savingLifeLogRef.current = true;
    setIsSavingLifeLog(true);
    setStatusMessage("");
    setStatusMessageIsError(false);
    try {
      const saved = await api.lifeLogs.save({
        text: text.trim(),
        beforeContext: beforeContext.trim() || undefined,
        afterContext: afterContext.trim() || undefined,
        sourceType: "manual"
      });
      setSelectedLog(saved);
      setText("");
      setBeforeContext("");
      setAfterContext("");
      setStatusMessage(t("lifeMining.statuses.candidateSaved"));
      setStatusMessageIsError(false);
      setIsManualAddOpen(false);
      await onLifeLogsChanged();
    } catch (error) {
      setStatusMessage(toErrorMessage(error, t("lifeMining.statuses.candidateSaveFailed")));
      setStatusMessageIsError(true);
    } finally {
      savingLifeLogRef.current = false;
      setIsSavingLifeLog(false);
    }
  }

  async function makeEnglishCard(log: LifeLog) {
    if (generationLogIdsRef.current.has(log.id) || generationAbortControllerRef.current) {
      return;
    }
    const abortController = new AbortController();
    generationAbortControllerRef.current = abortController;
    generationLogIdsRef.current.add(log.id);
    setIsGenerating(true);
    setStatusMessage("");
    setStatusMessageIsError(false);
    setSavedCardId(null);
    try {
      const generated = await provider.generateLifeExpressionCard({
        koreanText: log.text,
        beforeContext: log.beforeContext,
        afterContext: log.afterContext,
        learningProfile: settings.learningProfile,
        learnerLevel: "intermediate",
        signal: abortController.signal
      });
      setSelectedLog(log);
      setCandidate(createStudyCardFromGenerated(generated));
      setPendingCostLog(null);
      setPendingBulkAction(null);
      setIsManualAddOpen(false);
      setIsResultPopoverOpen(true);
    } catch (error) {
      const wasCancelled = abortController.signal.aborted || isAbortError(error);
      setCandidate(null);
      setIsResultPopoverOpen(false);
      setStatusMessage(
        wasCancelled
          ? t("lifeMining.statuses.generationCancelled")
          : toErrorMessage(error, t("lifeMining.statuses.generationFailed"))
      );
      setStatusMessageIsError(!wasCancelled);
    } finally {
      generationLogIdsRef.current.delete(log.id);
      if (generationAbortControllerRef.current === abortController) {
        generationAbortControllerRef.current = null;
      }
      setIsGenerating(false);
    }
  }

  function openManualAdd() {
    setPendingCostLog(null);
    setPendingBulkAction(null);
    setIsResultPopoverOpen(false);
    setIsManualAddOpen(true);
  }

  function openResultPopover() {
    setPendingCostLog(null);
    setPendingBulkAction(null);
    setIsManualAddOpen(false);
    setIsResultPopoverOpen(true);
  }

  function selectLifeLog(log: LifeLog) {
    setSelectedLog(log);
    setCandidate(null);
    setSavedCardId(null);
    setIsResultPopoverOpen(false);
  }

  function toggleSelectionMode() {
    setIsSelectionMode((value) => {
      const next = !value;
      if (!next) {
        setSelectedLogIds([]);
        setPendingBulkAction(null);
      }
      return next;
    });
  }

  function toggleLifeLogSelection(logId: string) {
    setSelectedLogIds((previous) =>
      previous.includes(logId) ? previous.filter((id) => id !== logId) : [...previous, logId]
    );
  }

  function toggleSelectAllLifeLogs() {
    setSelectedLogIds(isAllVisibleSelected ? [] : visibleLifeLogs.map((log) => log.id));
  }

  function requestBulkAction(action: LifeBulkAction) {
    if (
      selectedLifeLogCount === 0 ||
      isBulkActionRunning ||
      isGenerating ||
      generationAbortControllerRef.current
    ) {
      return;
    }
    if (action === "generate") {
      const estimate = estimateLifeMiningBulkCost(selectedLifeLogs, settings, t, localeTag);
      const assessment = previewTranslationUsageBudget(settings, estimate.budgetRequest);
      if (!assessment.allowed) {
        setStatusMessage(formatLifeMiningBudgetReasons(assessment, t, localeTag));
        setStatusMessageIsError(true);
        return;
      }
    }
    setPendingCostLog(null);
    setIsManualAddOpen(false);
    setIsResultPopoverOpen(false);
    setPendingBulkAction(action);
  }

  async function confirmBulkAction() {
    const action = pendingBulkAction;
    const logs = selectedLifeLogs;
    if (!action || logs.length === 0 || generationAbortControllerRef.current) {
      setPendingBulkAction(null);
      return;
    }

    if (action === "generate") {
      const assessment = previewTranslationUsageBudget(
        settings,
        estimateLifeMiningBulkCost(logs, settings, t, localeTag).budgetRequest
      );
      if (!assessment.allowed) {
        setStatusMessage(formatLifeMiningBudgetReasons(assessment, t, localeTag));
        setStatusMessageIsError(true);
        setPendingBulkAction(null);
        return;
      }
    }

    setIsBulkActionRunning(true);
    setIsGenerating(action === "generate");
    setStatusMessage("");
    setStatusMessageIsError(false);
    const abortController = action === "generate" ? new AbortController() : null;
    if (abortController) {
      generationAbortControllerRef.current = abortController;
    }
    try {
      if (action === "delete") {
        const results = await Promise.allSettled(
          logs.map(async (log) => {
            const deleted = await api.lifeLogs.delete(log.id);
            if (!deleted) {
              throw new Error(t("lifeMining.statuses.deleteFailed"));
            }
            return log;
          })
        );
        const deletedLogs = results.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : []
        );
        const deletedIds = new Set(deletedLogs.map((log) => log.id));
        const failedLogs = logs.filter((log) => !deletedIds.has(log.id));
        if (selectedLog && deletedIds.has(selectedLog.id)) {
          setSelectedLog(null);
          setCandidate(null);
          setSavedCardId(null);
          setIsResultPopoverOpen(false);
        }
        setStatusMessage(
          failedLogs.length > 0
            ? t("lifeMining.statuses.deletedWithFailures", {
                deleted: deletedLogs.length,
                failed: failedLogs.length
              })
            : t("lifeMining.statuses.deleted", { count: deletedLogs.length })
        );
        setStatusMessageIsError(failedLogs.length > 0);
        setSelectedLogIds(failedLogs.map((log) => log.id));
        setIsSelectionMode(failedLogs.length > 0);
        await onLifeLogsChanged();
      } else {
        setCandidate(null);
        setSavedCardId(null);
        setIsResultPopoverOpen(false);
        const failedLogs: LifeLog[] = [];
        let completedCount = 0;
        for (const [index, log] of logs.entries()) {
          setStatusMessage(t("lifeMining.statuses.generatingProgress", {
            current: index + 1,
            total: logs.length
          }));
          setStatusMessageIsError(false);
          try {
            let cardId = bulkSavedCardIdsRef.current.get(log.id);
            if (!cardId) {
              const generated = await provider.generateLifeExpressionCard({
                koreanText: log.text,
                beforeContext: log.beforeContext,
                afterContext: log.afterContext,
                learningProfile: settings.learningProfile,
                learnerLevel: "intermediate",
                signal: abortController?.signal
              });
              const saved = await api.cards.save(
                createStudyCardFromGenerated({
                  ...generated,
                  id: buildLifeMiningCardId(log.id, settings.profileId)
                })
              );
              cardId = saved.id;
              bulkSavedCardIdsRef.current.set(log.id, cardId);
            }
            await api.lifeLogs.markProcessed(log.id, settings.profileId);
            bulkSavedCardIdsRef.current.delete(log.id);
            completedCount += 1;
          } catch (error) {
            failedLogs.push(log);
            if (isAbortError(error)) {
              abortController?.abort();
              break;
            }
          }
        }
        if (completedCount > 0) {
          setSelectedLog(null);
        }
        setStatusMessage(
          abortController?.signal.aborted
            ? t("lifeMining.statuses.cancelledAfter", {
                completed: completedCount,
                failed: failedLogs.length
              })
            : failedLogs.length > 0
              ? t("lifeMining.statuses.generatedWithFailures", {
                  completed: completedCount,
                  failed: failedLogs.length
                })
              : t("lifeMining.statuses.generated", { count: completedCount })
        );
        setStatusMessageIsError(!abortController?.signal.aborted && failedLogs.length > 0);
        setSelectedLogIds(failedLogs.map((log) => log.id));
        setIsSelectionMode(failedLogs.length > 0);
        await Promise.allSettled([onCardsChanged(), onLifeLogsChanged()]);
      }
      setPendingBulkAction(null);
    } catch (error) {
      setStatusMessage(toErrorMessage(error, t("lifeMining.statuses.bulkFailed")));
      setStatusMessageIsError(true);
      setPendingBulkAction(null);
    } finally {
      if (generationAbortControllerRef.current === abortController) {
        generationAbortControllerRef.current = null;
      }
      setIsBulkActionRunning(false);
      setIsGenerating(false);
    }
  }

  function requestMakeEnglishCard(log: LifeLog) {
    const estimate = estimateLifeMiningCardCost(log, settings, t, localeTag);
    const assessment = previewTranslationUsageBudget(settings, estimate.budgetRequest);
    if (!assessment.allowed) {
      setStatusMessage(formatLifeMiningBudgetReasons(assessment, t, localeTag));
      setStatusMessageIsError(true);
      return;
    }
    if (settings.confirmLifeMiningCardCost || Boolean(externalTransferNotice)) {
      setPendingBulkAction(null);
      setIsManualAddOpen(false);
      setIsResultPopoverOpen(false);
      setPendingCostLog(log);
      return;
    }
    void makeEnglishCard(log);
  }

  async function confirmLifeMiningCardCost() {
    const log = pendingCostLog;
    if (!log) {
      return;
    }
    const assessment = previewTranslationUsageBudget(
      settings,
      estimateLifeMiningCardCost(log, settings, t, localeTag).budgetRequest
    );
    if (!assessment.allowed) {
      setStatusMessage(formatLifeMiningBudgetReasons(assessment, t, localeTag));
      setStatusMessageIsError(true);
      return;
    }
    setPendingCostLog(null);
    await makeEnglishCard(log);
  }

  async function saveCard() {
    if (!candidate || savingCardRef.current) {
      return;
    }
    savingCardRef.current = true;
    setIsSavingCard(true);
    try {
      const saved = await api.cards.save(candidate);
      setCandidate(saved);
      setSavedCardId(saved.id);
      if (selectedLog) {
        await api.lifeLogs.markProcessed(selectedLog.id, settings.profileId);
      }
      setStatusMessage(t("lifeMining.statuses.cardSaved"));
      setStatusMessageIsError(false);
      setIsResultPopoverOpen(false);
      await onCardsChanged();
      await onLifeLogsChanged();
      if (selectedLog) {
        setSelectedLog(visibleLifeLogs.find((log) => log.id !== selectedLog.id) ?? null);
        setCandidate(null);
        setSavedCardId(null);
        setIsResultPopoverOpen(false);
      }
    } catch (error) {
      setStatusMessage(toErrorMessage(error, t("lifeMining.statuses.cardSaveFailed")));
      setStatusMessageIsError(true);
    } finally {
      savingCardRef.current = false;
      setIsSavingCard(false);
    }
  }

  function focusLifeLogAtIndex(index: number) {
    if (visibleLifeLogs.length === 0) {
      return;
    }
    const nextIndex = Math.min(visibleLifeLogs.length - 1, Math.max(0, index));
    const nextLog = visibleLifeLogs[nextIndex];
    const list = lifeLogListRef.current;

    pendingLifeLogFocusIndexRef.current = nextIndex;
    setActiveLifeLogId(nextLog.id);

    if (!list || !isLifeLogListVirtualized) {
      return;
    }

    const nextScrollTop = getScrollTopForVirtualLifeLogIndex({
      index: nextIndex,
      itemCount: visibleLifeLogs.length,
      columnCount: lifeLogColumnCount,
      rowHeight: LIFE_LOG_VIRTUAL_ROW_HEIGHT,
      viewportHeight: list.clientHeight || lifeLogListViewportHeight,
      currentScrollTop: list.scrollTop
    });
    if (nextScrollTop !== list.scrollTop) {
      list.scrollTop = nextScrollTop;
    }
    setLifeLogListScrollTop(nextScrollTop);
  }

  function handleLifeLogKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    lifeLogIndex: number
  ) {
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    const pageRowCount = Math.max(
      1,
      Math.floor(lifeLogListViewportHeight / LIFE_LOG_VIRTUAL_ROW_HEIGHT)
    );
    const nextIndex = getLifeLogNavigationIndex({
      key: event.key,
      currentIndex: lifeLogIndex,
      itemCount: visibleLifeLogs.length,
      columnCount: lifeLogColumnCount,
      pageRowCount
    });
    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    focusLifeLogAtIndex(nextIndex);
  }

  const renderedLifeLogItems = renderedLifeLogs.map((log, renderedIndex) => {
    const lifeLogIndex = renderedLifeLogStartIndex + renderedIndex;
    const isProcessed = isLifeLogProcessedForProfile(log, settings.profileId);
    const isBulkSelected = selectedLogIdSet.has(log.id);
    const usageEstimate = toCardGenerationUsageEstimate(
      estimateLifeMiningCardCost(log, settings, t, localeTag)
    );
    const isFallbackTabStop =
      isLifeLogListVirtualized && !renderedHasRovingLifeLog && renderedIndex === 0;
    return (
      <div
        aria-posinset={lifeLogIndex + 1}
        aria-setsize={visibleLifeLogs.length}
        className={[
          "life-log-item",
          selectedLog?.id === log.id && !isSelectionMode ? "selected" : "",
          isSelectionMode ? "selection-mode" : "",
          isBulkSelected ? "bulk-selected" : ""
        ]
          .filter(Boolean)
          .join(" ")}
        data-life-log-item="true"
        key={log.id}
        role="listitem"
      >
        <button
          aria-current={
            !isSelectionMode && selectedLog?.id === log.id ? "true" : undefined
          }
          aria-pressed={isSelectionMode ? isBulkSelected : undefined}
          className={isSelectionMode ? "life-log-select selection-mode" : "life-log-select"}
          data-life-log-index={lifeLogIndex}
          tabIndex={
            isLifeLogListVirtualized
              ? rovingLifeLogId === log.id || isFallbackTabStop
                ? 0
                : -1
              : undefined
          }
          type="button"
          onClick={() => {
            setActiveLifeLogId(log.id);
            if (isSelectionMode) {
              toggleLifeLogSelection(log.id);
            } else {
              selectLifeLog(log);
            }
          }}
          onFocus={() => setActiveLifeLogId(log.id)}
          onKeyDown={(event) => handleLifeLogKeyDown(event, lifeLogIndex)}
        >
          {isSelectionMode ? (
            <span
              className={isBulkSelected ? "life-log-check checked" : "life-log-check"}
              aria-hidden="true"
            >
              {isBulkSelected ? <Check size={14} /> : null}
            </span>
          ) : null}
          <span className="life-log-body">
            <span className="life-log-text">{log.text}</span>
            <LifeLogCandidatePreview log={log} />
            <small className="life-log-source-line">
              {getLifeLogCandidateSourceLine(log, t, localeTag)}
            </small>
          </span>
        </button>
        {!isSelectionMode ? (
          <div className="card-generation-action-row life-card-action-row">
            {!hasOpenOverlay ? (
              <CardGenerationUsageEstimate
                align="start"
                estimate={usageEstimate}
                variant="badge"
              />
            ) : null}
            <button
              className="button success small life-card-action"
              data-qa="life-candidate-generate"
              type="button"
              disabled={isGenerating}
              onClick={() => requestMakeEnglishCard(log)}
            >
              {isProcessed ? t("lifeMining.actions.makeAgain") : targetCardLabel}
            </button>
          </div>
        ) : null}
      </div>
    );
  });

  return (
    <div className={`page-grid life-layout${hasOpenOverlay ? " is-overlay-open" : ""}`}>
      <section className="panel list-panel life-candidate-panel">
        <div className="life-candidate-toolbar">
          <div className="panel-heading">
            <Lightbulb size={19} />
            <h1>{t("lifeMining.title")}</h1>
            <span className="pill">{t("lifeMining.candidateCount", {
              count: visibleLifeLogs.length,
              formattedCount: formatInteger(visibleLifeLogs.length, localeTag)
            })}</span>
            {completedForProfileCount > 0 ? (
              <span className="muted-small">{t("lifeMining.completedCount", {
                count: completedForProfileCount,
                formattedCount: formatInteger(completedForProfileCount, localeTag)
              })}</span>
            ) : null}
          </div>
          <div className="life-candidate-actions">
            <button
              className={isSelectionMode ? "button primary small" : "button secondary small"}
              data-qa="life-selection-mode"
              type="button"
              onClick={toggleSelectionMode}
            >
              <ListChecks size={15} />
              {isSelectionMode ? t("lifeMining.cancelSelection") : t("lifeMining.selectionMode")}
            </button>
            <button
              className="button secondary small"
              data-qa="life-manual-add"
              type="button"
              onClick={openManualAdd}
            >
              <Plus size={15} />
              {t("lifeMining.manualAdd")}
            </button>
          </div>
        </div>
        {statusMessage ? (
          <p
            aria-live={statusMessageIsError ? "assertive" : "polite"}
            className={statusMessageIsError
              ? "status-text danger life-status-text"
              : "status-text life-status-text"}
            role={statusMessageIsError ? "alert" : "status"}
          >
            {statusMessage}
          </p>
        ) : null}
        {isGenerating && !pendingBulkAction ? (
          <button
            className="button secondary small"
            data-qa="life-generation-cancel"
            type="button"
            onClick={() => generationAbortControllerRef.current?.abort()}
          >
            {t("lifeMining.cancelGeneration")}
          </button>
        ) : null}
        {isSelectionMode ? (
          <div className="life-selection-toolbar" data-qa="life-selection-toolbar">
            <strong>{t("lifeMining.selectedCount", {
              count: selectedLifeLogCount,
              formattedCount: formatInteger(selectedLifeLogCount, localeTag)
            })}</strong>
            <button
              className="button secondary small"
              data-qa="life-select-all"
              type="button"
              disabled={visibleLifeLogs.length === 0 || isBulkActionRunning}
              onClick={toggleSelectAllLifeLogs}
            >
              <Check size={15} />
              {isAllVisibleSelected ? t("lifeMining.clearAll") : t("lifeMining.selectAll")}
            </button>
            <button
              className="button danger small"
              data-qa="life-bulk-delete"
              type="button"
              disabled={selectedLifeLogCount === 0 || isBulkActionRunning}
              onClick={() => requestBulkAction("delete")}
            >
              <Trash2 size={15} />
              {t("lifeMining.delete")}
            </button>
            <button
              className="button success small"
              data-qa="life-bulk-generate"
              type="button"
              disabled={selectedLifeLogCount === 0 || isBulkActionRunning}
              onClick={() => requestBulkAction("generate")}
            >
              <Sparkles size={15} />
              {t("lifeMining.generateSentences")}
            </button>
          </div>
        ) : null}
        <div className="life-auto-status" data-qa="life-auto-status">
          <div>
            <Radio size={16} />
            <strong>
              {t("lifeMining.autoCapture.status", {
                state: settings.lifeMiningCaptureSettings.enabled
                  ? t("lifeMining.autoCapture.on")
                  : t("lifeMining.autoCapture.off")
              })}
            </strong>
            <span>{t("lifeMining.autoCapture.candidates", {
              count: autoLogs.length,
              formattedCount: formatInteger(autoLogs.length, localeTag)
            })}</span>
          </div>
          <small>
            {!settings.lifeMiningCaptureSettings.enabled
              ? t("lifeMining.autoCapture.disabled")
              : lastAutoLog
                ? t("lifeMining.autoCapture.recent", {
                    source: getLifeLogSourceLabel(lastAutoLog, t),
                    time: formatLifeLogTime(
                      lastAutoLog.createdAt,
                      localeTag,
                      t("common.unknown")
                    )
                  })
                : t("lifeMining.autoCapture.waiting")}
          </small>
        </div>
        <div
          aria-busy={isBulkActionRunning || isGenerating}
          aria-label={t("lifeMining.title")}
          className={`life-log-list${
            isLifeLogListVirtualized ? " life-log-list-virtualized" : ""
          }`}
          ref={lifeLogListRef}
          role="list"
          onScroll={(event) => {
            if (isLifeLogListVirtualized) {
              setLifeLogListScrollTop(event.currentTarget.scrollTop);
            }
          }}
        >
          {isLifeLogListVirtualized ? (
            <div
              className="life-log-list-virtual-spacer"
              role="presentation"
              style={{ height: `${virtualLifeLogWindow.totalHeight}px` }}
            >
              <div
                className="life-log-list-virtual-window"
                role="presentation"
                style={{ transform: `translateY(${virtualLifeLogWindow.offsetTop}px)` }}
              >
                {renderedLifeLogItems}
              </div>
            </div>
          ) : (
            renderedLifeLogItems
          )}
          {visibleLifeLogs.length === 0 ? (
            <EmptyState
              data-qa="life-empty-state"
              description={t("lifeMining.empty.listDescription")}
              icon={<Lightbulb size={24} />}
              title={t("lifeMining.empty.listTitle")}
            />
          ) : null}
        </div>
      </section>

      <section className="panel detail-panel" ref={detailPanelRef}>
        {candidate ? (
          <div className="life-generated-result-summary" data-qa="life-generated-result-summary">
            <div className="life-generated-result-icon">
              <Sparkles size={22} />
            </div>
            <div>
              <span>{t("lifeMining.result.title")}</span>
              <h2>{candidate.targetText || candidate.frontText || t("lifeMining.result.ready")}</h2>
              <p>{t("lifeMining.result.description")}</p>
            </div>
            <div className="life-generated-result-actions">
              <button
                className="button secondary"
                data-qa="life-result-reopen"
                type="button"
                onClick={openResultPopover}
              >
                {t("lifeMining.actions.result")}
              </button>
              <button
                className="button primary"
                data-qa="life-save-card"
                type="button"
                disabled={isSavingCard || savedCardId === candidate.id}
                onClick={() => void saveCard()}
              >
                <Save size={18} />
                {savedCardId === candidate.id
                  ? t("lifeMining.actions.saved")
                  : t("lifeMining.actions.saveCard")}
              </button>
            </div>
          </div>
        ) : selectedLog ? (
          <div className="life-log-detail">
            <div className="panel-heading">
              <Inbox size={19} />
              <h2>{t("lifeMining.result.selected")}</h2>
            </div>
            <LifeLogConversationPreview log={selectedLog} profileId={settings.profileId} />
            <div className="card-generation-action-row life-card-action-row">
              {!hasOpenOverlay ? (
                <CardGenerationUsageEstimate
                  align="start"
                  estimate={selectedLogUsageEstimate}
                  variant="badge"
                />
              ) : null}
              <button
                className="button success wide life-card-action"
                data-qa="life-selected-generate"
                type="button"
                disabled={isGenerating}
                onClick={() => requestMakeEnglishCard(selectedLog)}
              >
                {isLifeLogProcessedForProfile(selectedLog, settings.profileId)
                  ? t("lifeMining.actions.makeAgain")
                  : targetCardLabel}
              </button>
            </div>
          </div>
        ) : (
          <EmptyState
            data-qa="life-detail-empty-state"
            description={
              isGenerating
                ? t("lifeMining.empty.generatingDescription")
                : visibleLifeLogs.length > 0
                  ? t("lifeMining.empty.chooseDescription")
                  : t("lifeMining.empty.noneDescription")
            }
            icon={isGenerating ? <Loader2 className="spin" size={24} /> : <Inbox size={24} />}
            title={
              isGenerating
                ? t("lifeMining.empty.generatingTitle")
                : visibleLifeLogs.length > 0
                  ? t("lifeMining.empty.chooseTitle")
                  : t("lifeMining.empty.noneTitle")
            }
          />
        )}
      </section>
      {candidate && isResultPopoverOpen ? (
        <Dialog
          ariaLabel={t("lifeMining.result.dialogAria")}
          backdropClassName="life-result-popover-layer"
          className="life-result-popover"
          closeOnBackdrop={!isSavingCard}
          onClose={() => {
            if (!isSavingCard) {
              setIsResultPopoverOpen(false);
            }
          }}
        >
          <div className="life-result-popover-content" data-qa="life-result-popover">
            <div className="life-result-popover-heading">
              <div>
                <span>{t("lifeMining.result.title")}</span>
                <h2>{candidate.targetText || candidate.frontText || t("lifeMining.result.card")}</h2>
              </div>
              <button
                aria-label={t("common.close")}
                className="icon-button"
                data-qa="life-result-popover-close"
                disabled={isSavingCard}
                type="button"
                onClick={() => setIsResultPopoverOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="life-result-popover-body">
              <CardPreview card={candidate} settings={settings} defaultShowBack />
            </div>
            <div className="life-result-popover-actions">
              <button
                className="button secondary"
                disabled={isSavingCard}
                type="button"
                onClick={() => setIsResultPopoverOpen(false)}
              >
                {t("lifeMining.actions.close")}
              </button>
              <button
                className="button primary"
                data-qa="life-result-save-card"
                type="button"
                disabled={isSavingCard || savedCardId === candidate.id}
                onClick={() => void saveCard()}
              >
                <Save size={18} />
                {savedCardId === candidate.id
                  ? t("lifeMining.actions.saved")
                  : t("lifeMining.actions.saveCard")}
              </button>
            </div>
          </div>
        </Dialog>
      ) : null}
      {isManualAddOpen ? (
        <Dialog
          ariaLabel={t("lifeMining.manual.dialogAria")}
          backdropClassName="life-cost-modal-backdrop"
          className="life-cost-modal life-manual-modal"
          closeOnBackdrop={!isSavingLifeLog}
          onClose={() => {
            if (!isSavingLifeLog) {
              setIsManualAddOpen(false);
            }
          }}
        >
            <div className="life-cost-modal-heading">
              <div>
                <span>{t("lifeMining.manual.kicker")}</span>
                <h2>{t("lifeMining.manual.title")}</h2>
              </div>
              <button
                aria-label={t("lifeMining.manual.closeAria")}
                className="icon-button"
                data-qa="life-manual-close"
                disabled={isSavingLifeLog}
                type="button"
                onClick={() => setIsManualAddOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="life-manual-form">
              <label className="field-label">
                {t("lifeMining.manual.text")}
                <textarea
                  className="text-input tall"
                  data-qa="life-manual-text"
                  placeholder={t("lifeMining.manual.textPlaceholder")}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                />
              </label>
              <label className="field-label">
                {t("lifeMining.manual.before")}
                <textarea
                  className="text-input"
                  placeholder={t("lifeMining.manual.beforePlaceholder")}
                  value={beforeContext}
                  onChange={(event) => setBeforeContext(event.target.value)}
                />
              </label>
              <label className="field-label">
                {t("lifeMining.manual.after")}
                <textarea
                  className="text-input"
                  placeholder={t("lifeMining.manual.afterPlaceholder")}
                  value={afterContext}
                  onChange={(event) => setAfterContext(event.target.value)}
                />
              </label>
            </div>
            <div className="life-cost-actions life-manual-actions">
              <button
                className="button secondary"
                data-qa="life-manual-cancel"
                disabled={isSavingLifeLog}
                type="button"
                onClick={() => setIsManualAddOpen(false)}
              >
                {t("lifeMining.actions.close")}
              </button>
              <button
                className="button primary"
                data-qa="life-manual-save"
                disabled={isSavingLifeLog || !text.trim()}
                type="button"
                onClick={() => void saveLifeLog()}
              >
                <Save size={18} />
                {isSavingLifeLog ? t("lifeMining.manual.saving") : t("lifeMining.manual.saveCandidate")}
              </button>
            </div>
        </Dialog>
      ) : null}
      {pendingBulkAction ? (
        <Dialog
          ariaLabel={t("lifeMining.bulk.dialogAria")}
          backdropClassName="life-cost-modal-backdrop"
          className="life-cost-modal life-bulk-modal"
          closeOnBackdrop={!isBulkActionRunning}
          onClose={() => {
            if (!isBulkActionRunning) {
              setPendingBulkAction(null);
            }
          }}
        >
            <div className="life-cost-modal-heading">
              <div>
                <span>{t("lifeMining.bulk.kicker")}</span>
                <h2>
                  {pendingBulkAction === "delete"
                    ? t("lifeMining.bulk.deleteTitle")
                    : t("lifeMining.bulk.generateTitle")}
                </h2>
              </div>
              <button
                aria-label={t("lifeMining.bulk.closeAria")}
                className="icon-button"
                disabled={isBulkActionRunning}
                type="button"
                onClick={() => setPendingBulkAction(null)}
              >
                <X size={18} />
              </button>
            </div>
            <p className="life-bulk-confirm-copy">
              {pendingBulkAction === "delete"
                ? t("lifeMining.bulk.deleteDescription", { count: selectedLifeLogCount })
                : t("lifeMining.bulk.generateDescription", { count: selectedLifeLogCount })}
            </p>
            {pendingBulkAction === "generate" && pendingBulkEstimate ? (
              <div className="life-cost-summary">
                <Calculator size={19} />
                <div>
                  <strong>{pendingBulkEstimate.costLabel}</strong>
                  <span>
                    {t("lifeMining.bulk.total", {
                      tokens: pendingBulkEstimate.tokenLabel,
                      requests: pendingBulkEstimate.requestLabel
                    })}
                  </span>
                </div>
              </div>
            ) : null}
            {pendingBulkAction === "generate" ? (
              <>
                {externalTransferNotice ? (
                  <p className="life-cost-note">{externalTransferNotice}</p>
                ) : null}
                <p className="life-cost-note">{t("lifeMining.cost.localGuard")}</p>
              </>
            ) : null}
            {pendingBulkBudgetAssessment && !pendingBulkBudgetAssessment.allowed ? (
              <p aria-live="assertive" className="status-text" role="alert">
                {formatLifeMiningBudgetReasons(pendingBulkBudgetAssessment, t, localeTag)}
              </p>
            ) : null}
            <div className="life-cost-preview life-bulk-preview">
              <span>{t("lifeMining.bulk.selected")}</span>
              <ul>
                {selectedLifeLogs.slice(0, 3).map((log) => (
                  <li key={log.id}>{log.text}</li>
                ))}
              </ul>
              {selectedLifeLogCount > 3 ? (
                <small>{t("lifeMining.bulk.more", { count: selectedLifeLogCount - 3 })}</small>
              ) : null}
            </div>
            <div className="life-cost-actions">
              <button
                className="button secondary"
                data-qa="life-bulk-cancel"
                disabled={isBulkActionRunning}
                type="button"
                onClick={() => setPendingBulkAction(null)}
              >
                {t("lifeMining.bulk.no")}
              </button>
              {pendingBulkAction === "generate" && isBulkActionRunning ? (
                <button
                  className="button danger"
                  data-qa="life-bulk-abort"
                  type="button"
                  onClick={() => generationAbortControllerRef.current?.abort()}
                >
                  {t("lifeMining.cancelGeneration")}
                </button>
              ) : null}
              <button
                className={pendingBulkAction === "delete" ? "button danger" : "button success"}
                data-qa="life-bulk-confirm"
                disabled={
                  isBulkActionRunning ||
                  (pendingBulkAction === "generate" && pendingBulkBudgetAssessment?.allowed === false)
                }
                type="button"
                onClick={() => void confirmBulkAction()}
              >
                {isBulkActionRunning ? t("lifeMining.bulk.processing") : t("lifeMining.bulk.yes")}
              </button>
            </div>
        </Dialog>
      ) : null}
      {pendingCostLog && pendingCostEstimate ? (
        <Dialog
          ariaLabel={t("lifeMining.cost.dialogAria")}
          backdropClassName="life-cost-modal-backdrop"
          className="life-cost-modal"
          onClose={() => setPendingCostLog(null)}
        >
            <div className="life-cost-modal-heading">
              <div>
                <span>{t("lifeMining.cost.kicker")}</span>
                <h2>{t("lifeMining.cost.title")}</h2>
              </div>
              <button
                aria-label={t("lifeMining.cost.closeAria")}
                className="icon-button"
                type="button"
                onClick={() => setPendingCostLog(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="life-cost-summary">
              <Calculator size={19} />
              <div>
                <strong>{pendingCostEstimate.costLabel}</strong>
                <span>{pendingCostEstimate.providerLabel}</span>
              </div>
            </div>
            <div className="life-cost-grid">
              <div>
                <span>{t("lifeMining.cost.model")}</span>
                <strong>{pendingCostEstimate.modelLabel}</strong>
              </div>
              <div>
                <span>{t("lifeMining.cost.tokens")}</span>
                <strong>{pendingCostEstimate.tokenLabel}</strong>
              </div>
              <div>
                <span>{t("lifeMining.cost.requests")}</span>
                <strong>{pendingCostEstimate.requestLabel}</strong>
              </div>
              <div>
                <span>{t("lifeMining.cost.electricity")}</span>
                <strong>{pendingCostEstimate.electricityLabel}</strong>
              </div>
            </div>
            <p className="life-cost-note">{pendingCostEstimate.note}</p>
            {externalTransferNotice ? (
              <p className="life-cost-note">{externalTransferNotice}</p>
            ) : null}
            <p className="life-cost-note">{t("lifeMining.cost.localGuard")}</p>
            {pendingCostBudgetAssessment ? (
              <p
                aria-live={pendingCostBudgetAssessment.allowed ? "polite" : "assertive"}
                className={
                  pendingCostBudgetAssessment.allowed ? "life-cost-note" : "status-text"
                }
                role={pendingCostBudgetAssessment.allowed ? "status" : "alert"}
              >
                {pendingCostBudgetAssessment.allowed
                  ? t("lifeMining.cost.projected", {
                      tokens: formatInteger(pendingCostBudgetAssessment.projectedTodayTokens, localeTag),
                      cost: formatWon(pendingCostBudgetAssessment.projectedMonthCostKrw, localeTag)
                    })
                  : formatLifeMiningBudgetReasons(pendingCostBudgetAssessment, t, localeTag)}
              </p>
            ) : null}
            <div className="life-cost-preview">
              <span>{t("lifeMining.cost.myText")}</span>
              <p>{pendingCostLog.text}</p>
            </div>
            <div className="life-cost-actions">
              <button className="button secondary" type="button" onClick={() => setPendingCostLog(null)}>
                {t("common.cancel")}
              </button>
              <button
                className="button success"
                disabled={isGenerating || pendingCostBudgetAssessment?.allowed === false}
                type="button"
                onClick={() => void confirmLifeMiningCardCost()}
              >
                {t("lifeMining.cost.continue")}
              </button>
            </div>
        </Dialog>
      ) : null}
    </div>
  );
}

function LifeLogCandidatePreview({ log }: { log: LifeLog }) {
  const { t } = useTranslation();
  const messages = getLifeLogCandidatePreviewMessages(log, t);

  return (
    <span className="life-log-message-preview" aria-label={t("lifeMining.preview.conversationAria")}>
      {messages.map((message, index) => (
        <span
          key={`${message.role}-${message.speaker}-${message.text.slice(0, 18)}-${index}`}
          className={[
            "life-log-preview-row",
            message.role === "me" ? "is-me" : "is-other",
            message.isTarget ? "is-target" : ""
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span className="life-log-preview-speaker">{message.speaker}</span>
          <span className="life-log-preview-bubble">{message.text}</span>
        </span>
      ))}
    </span>
  );
}

function LifeLogConversationPreview({
  log,
  profileId
}: {
  log: LifeLog;
  profileId: AppSettings["profileId"];
}) {
  const { t, i18n } = useTranslation();
  const localeTag = (i18n.resolvedLanguage ?? i18n.language).startsWith("en")
    ? "en-US"
    : "ko-KR";
  const messages = getLifeLogConversationMessages(log, t);
  const isProcessed = isLifeLogProcessedForProfile(log, profileId);
  return (
    <div className="life-log-conversation-preview">
      <div className="life-log-detail-meta">
        <span>
          <Globe2 size={13} />
          {getLifeLogSourceLabel(log, t)}
        </span>
        <span>
          <Clock size={13} />
          {formatLifeLogTime(log.createdAt, localeTag, t("common.unknown"))}
        </span>
        <span className={isProcessed ? "processed" : ""}>
          {isProcessed ? t("lifeMining.preview.processed") : t("lifeMining.preview.unprocessed")}
        </span>
      </div>
      <div className="life-chat-thread life-log-chat-thread">
        {messages.map((message, index) => (
          <LifeLogChatBubble
            key={`${message.speaker}-${message.text.slice(0, 24)}-${index}`}
            message={message}
          />
        ))}
      </div>
      {log.metadata?.title || log.metadata?.url ? (
        <div className="life-log-source-card">
          <small>{t("lifeMining.preview.sourceLocation")}</small>
          <p>{getSafeLifeLogSourceLocation(log, t("common.unknown"))}</p>
        </div>
      ) : null}
    </div>
  );
}

function LifeLogChatBubble({ message }: { message: LifeLogConversationMessage }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const isCollapsible =
    message.role === "other" && message.text.length > LIFE_LOG_BUBBLE_COLLAPSE_LENGTH;
  const shouldClamp = isCollapsible && !expanded;

  return (
    <div className={`life-chat-row life-chat-row-${message.role}`}>
      {message.role === "other" ? (
        <span className="life-chat-avatar" title={message.speaker}>
          {getLifeLogSpeakerInitials(message.speaker)}
        </span>
      ) : null}
      <div className={`life-chat-bubble life-chat-bubble-${message.role}`}>
        <span className="life-chat-speaker">{message.speaker}</span>
        <p className={shouldClamp ? "life-chat-text is-clamped" : "life-chat-text"}>
          {message.text}
        </p>
        {isCollapsible ? (
          <button
            className="life-chat-read-more"
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? t("lifeMining.preview.collapse") : t("lifeMining.preview.showAll")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function getLifeLogConversationMessages(log: LifeLog, t: TFunction): LifeLogConversationMessage[] {
  return getLifeLogDisplayMessages(
    log,
    log.appName || getLifeLogSourceLabel(log, t).replace(/\s*·.*$/, "") || t("lifeMining.preview.other")
  ).map((message) => ({
    ...message,
    speaker:
      message.role === "me"
        ? t("lifeMining.preview.me")
        : message.speaker || t("lifeMining.preview.other")
  }));
}

function getLifeLogCandidatePreviewMessages(
  log: LifeLog,
  t: TFunction
): LifeLogCandidatePreviewMessage[] {
  const messages = getLifeLogConversationMessages(log, t).filter((message) => message.text.trim());
  const fallbackTarget: LifeLogConversationMessage = {
    speaker: t("lifeMining.preview.me"),
    text: log.text,
    role: "me"
  };

  if (!messages.length) {
    return [toLifeLogCandidatePreviewMessage(fallbackTarget, true, t)];
  }

  const targetIndex = getLifeLogCandidateTargetMessageIndex(messages, log.text);
  const target = targetIndex >= 0 ? messages[targetIndex] : fallbackTarget;
  const before = targetIndex >= 0 ? findNearestLifeLogPreviewMessage(messages, targetIndex, -1) : null;
  const after = targetIndex >= 0 ? findNearestLifeLogPreviewMessage(messages, targetIndex, 1) : null;

  return [before, target, after]
    .filter((message): message is LifeLogConversationMessage => Boolean(message))
    .slice(0, 3)
    .map((message) => toLifeLogCandidatePreviewMessage(message, message === target, t));
}

function getLifeLogCandidateTargetMessageIndex(
  messages: LifeLogConversationMessage[],
  targetText: string
) {
  const normalizedTarget = normalizeLifeLogPreviewLookupText(targetText);
  const exactIndex = messages.findIndex(
    (message) =>
      message.role === "me" &&
      normalizeLifeLogPreviewLookupText(message.text) === normalizedTarget
  );
  if (exactIndex >= 0) {
    return exactIndex;
  }

  const includesIndex = messages.findIndex((message) => {
    const normalizedMessage = normalizeLifeLogPreviewLookupText(message.text);
    return (
      message.role === "me" &&
      Boolean(normalizedTarget) &&
      (normalizedMessage.includes(normalizedTarget) || normalizedTarget.includes(normalizedMessage))
    );
  });
  if (includesIndex >= 0) {
    return includesIndex;
  }

  return messages.findIndex((message) => message.role === "me");
}

function findNearestLifeLogPreviewMessage(
  messages: LifeLogConversationMessage[],
  targetIndex: number,
  direction: -1 | 1
) {
  for (
    let index = targetIndex + direction;
    index >= 0 && index < messages.length;
    index += direction
  ) {
    if (messages[index]?.role === "other") {
      return messages[index];
    }
  }
  return messages[targetIndex + direction] ?? null;
}

function toLifeLogCandidatePreviewMessage(
  message: LifeLogConversationMessage,
  isTarget: boolean,
  t: TFunction
): LifeLogCandidatePreviewMessage {
  return {
    ...message,
    speaker:
      normalizeLifeLogSpeaker(message.speaker) ||
      (message.role === "me" ? t("lifeMining.preview.me") : t("lifeMining.preview.other")),
    text: truncateLifeLogPreviewText(message.text),
    isTarget
  };
}

function truncateLifeLogPreviewText(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= LIFE_LOG_CANDIDATE_PREVIEW_TEXT_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, LIFE_LOG_CANDIDATE_PREVIEW_TEXT_LENGTH).trimEnd()}...`;
}

function normalizeLifeLogPreviewLookupText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function getLifeLogSpeakerInitials(value: string) {
  const normalized = normalizeLifeLogSpeaker(value);
  if (!normalized) {
    return "?";
  }
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return normalized.slice(0, 2).toUpperCase();
}

function normalizeLifeLogSpeaker(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

type LifeMiningCostEstimate = {
  providerLabel: string;
  modelLabel: string;
  tokenLabel: string;
  requestLabel: string;
  costLabel: string;
  electricityLabel: string;
  note: string;
  totalTokens: { min: number; max: number };
  estimatedCostKrw: { min: number; max: number };
  requestCount: number;
  budgetRequest: TranslationUsageBudgetRequest;
};

function toCardGenerationUsageEstimate(
  estimate: LifeMiningCostEstimate
): CardGenerationUsageEstimateData {
  return {
    costLabel: estimate.costLabel,
    electricityLabel: estimate.electricityLabel,
    tokenLabel: estimate.tokenLabel,
    requestLabel: estimate.requestLabel,
    note: estimate.providerLabel
  };
}

function estimateLifeMiningCardCost(
  log: LifeLog,
  settings: AppSettings,
  t: TFunction,
  localeTag: string
): LifeMiningCostEstimate {
  if (settings.providerName === "mock") {
    return {
      providerLabel: t("lifeMining.estimate.mockProvider"),
      modelLabel: "mock",
      tokenLabel: t("lifeMining.estimate.noApiTokens"),
      requestLabel: t("lifeMining.estimate.zeroRequests"),
      costLabel: t("lifeMining.estimate.zeroCost"),
      electricityLabel: t("lifeMining.estimate.zeroCost"),
      note: t("lifeMining.estimate.mockNote"),
      totalTokens: { min: 0, max: 0 },
      estimatedCostKrw: { min: 0, max: 0 },
      requestCount: 0,
      budgetRequest: { estimatedTokens: 0, estimatedCostKrw: 0 }
    };
  }

  if (settings.providerName === "chatgptWeb") {
    return {
      providerLabel: t("manualChatGptBridge.providerLabel"),
      modelLabel: t("manualChatGptBridge.manualMode"),
      tokenLabel: t("manualChatGptBridge.webHandled"),
      requestLabel: t("manualChatGptBridge.oneManualRound"),
      costLabel: t("manualChatGptBridge.noApiCharge"),
      electricityLabel: t("manualChatGptBridge.noAppElectricity"),
      note: t("manualChatGptBridge.usageDisclaimer"),
      totalTokens: { min: 0, max: 0 },
      estimatedCostKrw: { min: 0, max: 0 },
      requestCount: 0,
      budgetRequest: { estimatedTokens: 0, estimatedCostKrw: 0 }
    };
  }

  const estimateText = [
    log.beforeContext ? `${t("lifeMining.manual.before")}:\n${log.beforeContext}` : "",
    `${t("lifeMining.manual.text")}:\n${log.text}`,
    log.afterContext ? `${t("lifeMining.manual.after")}:\n${log.afterContext}` : "",
    "Generate one structured life-expression card as JSON with variants, pattern notes, and practice prompts."
  ]
    .filter(Boolean)
    .join("\n\n");
  const estimate = estimateTranslationUsage({
    texts: [{ text: estimateText, cacheStatus: "miss" }],
    providerName: settings.providerName === "ollama" ? "local" : "gemini",
    model: settings.providerName === "ollama" ? settings.ollamaModel : settings.geminiModel,
    plan: settings.geminiPlan,
    sourceLang: settings.learningProfile.nativeLanguage.code,
    targetLang: settings.learningProfile.targetLanguage.code,
    dailyAppTokenLimit: settings.dailyAppTokenLimit,
    monthlySpendLimitKrw: settings.monthlySpendLimitKrw
  });
  const usesRemoteOllama =
    settings.providerName === "ollama" && isRemoteOllamaUrl(settings.ollamaBaseUrl);

  return {
    providerLabel:
      settings.providerName === "ollama"
        ? usesRemoteOllama
          ? t("lifeMining.estimate.remoteOllamaProvider", { url: settings.ollamaBaseUrl })
          : t("lifeMining.estimate.ollamaProvider")
        : settings.geminiPlan === "free"
          ? t("lifeMining.estimate.geminiFree")
          : t("lifeMining.estimate.geminiPaid"),
    modelLabel: estimate.model,
    tokenLabel: t("lifeMining.estimate.tokenRange", {
      range: `${formatInteger(estimate.totalTokens.min, localeTag)} ~ ${formatInteger(
        estimate.totalTokens.max,
        localeTag
      )}`
    }),
    requestLabel: t("lifeMining.estimate.requestCount", {
      count: estimate.requestCount,
      formattedCount: formatInteger(estimate.requestCount, localeTag)
    }),
    costLabel:
      settings.providerName === "ollama" && !usesRemoteOllama
        ? t("lifeMining.estimate.zeroCost")
        : estimate.estimatedCostKrw.min === 0 && estimate.estimatedCostKrw.max === 0
          ? t("lifeMining.estimate.possibleCost")
          : `${formatWon(estimate.estimatedCostKrw.min, localeTag)} ~ ${formatWon(
            estimate.estimatedCostKrw.max,
            localeTag
          )}`,
    electricityLabel: t("lifeMining.estimate.zeroCost"),
    note:
      settings.providerName === "ollama"
        ? usesRemoteOllama
          ? t("lifeMining.estimate.remoteOllamaNote")
          : t("lifeMining.estimate.ollamaNote")
        : t("lifeMining.estimate.geminiNote"),
    totalTokens: estimate.totalTokens,
    estimatedCostKrw: estimate.estimatedCostKrw,
    requestCount: estimate.requestCount,
    budgetRequest: toTranslationUsageBudgetRequest(estimate)
  };
}

function estimateLifeMiningBulkCost(
  logs: LifeLog[],
  settings: AppSettings,
  t: TFunction,
  localeTag: string
): LifeMiningCostEstimate {
  if (settings.providerName === "chatgptWeb") {
    return {
      providerLabel: t("manualChatGptBridge.providerLabel"),
      modelLabel: t("manualChatGptBridge.manualMode"),
      tokenLabel: t("manualChatGptBridge.webHandled"),
      requestLabel: t("manualChatGptBridge.manualRounds", {
        count: logs.length,
        formattedCount: formatInteger(logs.length, localeTag)
      }),
      costLabel: t("manualChatGptBridge.noApiCharge"),
      electricityLabel: t("manualChatGptBridge.noAppElectricity"),
      note: t("manualChatGptBridge.usageDisclaimer"),
      totalTokens: { min: 0, max: 0 },
      estimatedCostKrw: { min: 0, max: 0 },
      requestCount: 0,
      budgetRequest: { estimatedTokens: 0, estimatedCostKrw: 0 }
    };
  }
  const estimates = logs.map((log) =>
    estimateLifeMiningCardCost(log, settings, t, localeTag)
  );
  const totalTokens = estimates.reduce(
    (total, estimate) => ({
      min: total.min + estimate.totalTokens.min,
      max: total.max + estimate.totalTokens.max
    }),
    { min: 0, max: 0 }
  );
  const estimatedCostKrw = estimates.reduce(
    (total, estimate) => ({
      min: total.min + estimate.estimatedCostKrw.min,
      max: total.max + estimate.estimatedCostKrw.max
    }),
    { min: 0, max: 0 }
  );
  const requestCount = estimates.reduce((sum, estimate) => sum + estimate.requestCount, 0);
  const budgetRequest = combineTranslationUsageBudgetRequests(
    estimates.map((estimate) => estimate.budgetRequest)
  );
  return {
    providerLabel: estimates[0]?.providerLabel ?? t("lifeMining.estimate.genericProvider"),
    modelLabel: estimates[0]?.modelLabel ?? "-",
    tokenLabel: t("lifeMining.estimate.tokenRange", {
      range: `${formatInteger(totalTokens.min, localeTag)} ~ ${formatInteger(
        totalTokens.max,
        localeTag
      )}`
    }),
    requestLabel: t("lifeMining.estimate.requestCount", {
      count: requestCount,
      formattedCount: formatInteger(requestCount, localeTag)
    }),
    costLabel:
      settings.providerName === "mock" ||
      (settings.providerName === "ollama" && !isRemoteOllamaUrl(settings.ollamaBaseUrl))
        ? t("lifeMining.estimate.zeroCost")
        : estimatedCostKrw.min === 0 && estimatedCostKrw.max === 0
          ? t("lifeMining.estimate.possibleCost")
          : `${formatWon(estimatedCostKrw.min, localeTag)} ~ ${formatWon(estimatedCostKrw.max, localeTag)}`,
    electricityLabel: t("lifeMining.estimate.zeroCost"),
    note: t("lifeMining.estimate.bulkNote", {
      count: logs.length,
      formattedCount: formatInteger(logs.length, localeTag)
    }),
    totalTokens,
    estimatedCostKrw,
    requestCount,
    budgetRequest
  };
}

function buildLifeMiningCardId(logId: string, profileId: string) {
  return `life-${profileId}-${logId}`;
}

function formatLifeMiningBudgetReasons(
  assessment: TranslationUsageBudgetAssessment,
  t: TFunction,
  localeTag: string
) {
  const reasons: string[] = [];
  if (assessment.dailyLimitExceeded) {
    reasons.push(t("lifeMining.cost.dailyLimitExceeded", {
      projected: formatInteger(assessment.projectedTodayTokens, localeTag),
      limit: formatInteger(assessment.dailyLimit, localeTag)
    }));
  }
  if (assessment.monthlyLimitExceeded) {
    reasons.push(t("lifeMining.cost.monthlyLimitExceeded", {
      projected: formatWon(assessment.projectedMonthCostKrw, localeTag),
      limit: formatWon(assessment.monthlyLimitKrw, localeTag)
    }));
  }
  return reasons.join(" ") || t("lifeMining.cost.guardBlocked");
}

function toErrorMessage(_error: unknown, fallback: string) {
  return fallback;
}

function formatInteger(value: number, localeTag: string) {
  return Math.round(value).toLocaleString(localeTag);
}

function formatWon(value: number, localeTag: string) {
  return new Intl.NumberFormat(localeTag, {
    style: "currency",
    currency: "KRW",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0
  }).format(Math.round(value));
}

function getLifeLogSourceLabel(log: LifeLog, t: TFunction) {
  if (log.sourceType === "browser_extension") {
    return log.appName
      ? t("lifeMining.source.extension", { app: log.appName })
      : t("lifeMining.source.browserExtension");
  }

  if (log.sourceType === "manual") {
    return t("lifeMining.source.manual");
  }

  return log.appName ?? log.sourceType;
}

function getLifeLogCandidateSourceLine(log: LifeLog, t: TFunction, localeTag: string) {
  return [
    getLifeLogCompactSourceLabel(log, t),
    getLifeLogCompactChannelLabel(log),
    formatLifeLogCompactTime(log.createdAt, localeTag, t("common.unknown"))
  ]
    .filter(Boolean)
    .join(" · ");
}

function getLifeLogCompactSourceLabel(log: LifeLog, t: TFunction) {
  if (log.appName?.trim()) {
    return log.appName.trim();
  }
  if (log.sourceType === "manual") {
    return t("lifeMining.source.manual");
  }
  if (log.sourceType === "browser_extension") {
    return t("lifeMining.source.browser");
  }
  if (log.sourceType === "desktop_capture") {
    return t("lifeMining.source.desktopCapture");
  }
  return log.sourceType;
}

function getLifeLogCompactChannelLabel(log: LifeLog) {
  const title = typeof log.metadata?.title === "string" ? log.metadata.title.trim() : "";
  if (!title) {
    return "";
  }

  const parts = title.split(/[|·]/).map((part) => part.trim()).filter(Boolean);
  const channel = parts.find((part) => part.startsWith("#"));
  return channel ?? "";
}

function formatLifeLogTime(value: string, localeTag: string, invalidFallback: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return invalidFallback;
  }

  return date.toLocaleString(localeTag);
}

function formatLifeLogCompactTime(value: string, localeTag: string, invalidFallback: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return invalidFallback;
  }

  return date.toLocaleString(localeTag, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getSafeLifeLogSourceLocation(log: LifeLog, invalidFallback: string) {
  const title = typeof log.metadata?.title === "string" ? log.metadata.title.trim() : "";
  if (title) {
    if (/^(?:[a-z]:[\\/]|\\\\|file:)/i.test(title)) {
      return invalidFallback;
    }
    if (!/^https?:/i.test(title)) {
      return title;
    }
  }
  const rawUrl = title || (typeof log.metadata?.url === "string" ? log.metadata.url.trim() : "");
  if (!rawUrl) {
    return invalidFallback;
  }
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return invalidFallback;
    }
    const safePath = url.pathname === "/" ? "" : url.pathname;
    return `${url.host}${safePath}`;
  } catch {
    return invalidFallback;
  }
}
