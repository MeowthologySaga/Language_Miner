import "../styles/listeningLoop.css";
import {
  AlertTriangle,
  BookmarkPlus,
  Captions,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  Headphones,
  Highlighter,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Repeat2,
  RotateCcw,
  Save,
  Wand2,
  X,
  Youtube
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "../components/Dialog";
import { useCloudTranslationPreflight } from "../components/CloudTranslationPreflightDialog";
import { HighlightedText } from "../components/HighlightedText";
import type { LocalEnglishMinerApi } from "../data/api";
import {
  listeningLoopSeeds,
  type ListeningLoopSeed,
  type ListeningLoopSegment
} from "../shared/listeningLoopSeeds";
import { isInteractiveShortcutTarget } from "../shared/shortcutTargets";
import {
  DAILY_ROUTINE_CLIP_COUNT,
  buildDailyRoutineSeed,
  clamp,
  createTranscriptByCandidateId,
  formatDuration,
  formatStatusSnippet,
  formatTime,
  formatVideoDuration,
  getBatchSummary,
  getBatchTranscriptCandidates,
  getCandidateDuration,
  getCandidateThumbnailUrl,
  getDailyRoutineClipCount,
  getListeningSourceKey,
  getListeningSegmentChannelName,
  getListeningSegmentTitle,
  getListeningSegmentVideoId,
  getLocalDateKey,
  getSeedDurationSeconds,
  getTranscriptSeedId,
  getVisibleListeningVideoCandidates,
  getYouTubeThumbnailUrl,
  getYouTubeWatchUrl,
  hasCandidateVideoDuration,
  localizeListeningLoopSeedDisplay,
  matchesKnownLearningLanguage,
  transcriptsToSeeds,
  upsertTranscript,
  type BatchTranscriptItem
} from "./listeningLoopUtils";
import {
  createListeningYouTubePlayerBridge,
  suppressYouTubeCaptions,
  type YouTubePlayer
} from "./listeningLoopPlayerBridge";
import {
  getSelectedListeningHighlightText,
  normalizeHighlightLookupKey,
  readStoredString,
  writeStoredString
} from "./listeningLoopSelection";
import type { LLMProvider } from "../services/llm/types";
import { createListeningLoopInputCard } from "./listeningLoopCardFactory";
import type {
  HighlightMapping,
  ListeningTranscript,
  ListeningVideoCandidate,
  AppSettings,
  ProfileId,
  StudyCard
} from "../shared/types";

type ListeningLoopPageProps = {
  api: LocalEnglishMinerApi;
  cards: StudyCard[];
  onCardsChanged: () => Promise<void>;
  onMissionProgressChanged?: () => Promise<void>;
  onOpenWebReaderUrl: (url: string, label?: string) => void;
  onSettingsChange: (settings: AppSettings) => void;
  profileId: ProfileId;
  provider: LLMProvider;
  settings: AppSettings;
};

const AUTO_TRANSCRIBE_LAST_RUN_KEY = "lem:listeningLoop:autoTranscribeLastRunDate";
const YOUTUBE_PLAYER_STATE_PLAYING = 1;
const LISTENING_HIGHLIGHT_LIMIT = 8;

const ROUTINE_STORAGE_PREFIX = "lem:listeningLoop:dailyRoutine";
const ROUTINE_SENTENCE_TARGET_PREFIX = "lem:listeningLoop:dailySentenceTarget";
const LISTENING_HEARD_SENTENCES_PREFIX = "lem:listeningLoop:heardSentences";
const DAILY_ROUTINE_STORAGE_VERSION = 6;
const DAILY_ROUTINE_DEFAULT_SENTENCE_TARGET = 30;
const DAILY_ROUTINE_MIN_SENTENCE_TARGET = 5;
const DAILY_ROUTINE_MAX_SENTENCE_TARGET = 100;

type DailyRoutineState = {
  version: number;
  dateKey: string;
  targetLanguageCode: string;
  partialVideoClipsEnabled: boolean;
  sentenceTargetCount: number;
  seed: ListeningLoopSeed;
  reserveSegments: ListeningLoopSegment[];
  selectedCandidateIds: string[];
  createdAt: string;
};

type PendingShortfallRoutine = {
  state: DailyRoutineState;
  selectedCandidateIds: string[];
  preparedSentenceCount: number;
  targetSentenceCount: number;
};

export function ListeningLoopPage({
  api,
  cards,
  onCardsChanged,
  onMissionProgressChanged,
  onOpenWebReaderUrl,
  onSettingsChange,
  profileId,
  provider,
  settings
}: ListeningLoopPageProps) {
  const { i18n, t } = useTranslation();
  const appLocale = i18n.resolvedLanguage?.startsWith("en") ? "en" : "ko";
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(appLocale === "en" ? "en-US" : "ko-KR"),
    [appLocale]
  );
  const targetLanguageLabel =
    (appLocale === "en"
      ? settings.learningProfile.targetLanguage.nameEn
      : settings.learningProfile.targetLanguage.nameKo) ||
    settings.learningProfile.targetLanguage.nameEn ||
    settings.learningProfile.targetLanguage.nameKo ||
    settings.learningProfile.targetLanguage.code;
  const [showEntrance, setShowEntrance] = useState(true);
  const [activeSeedId, setActiveSeedId] = useState(listeningLoopSeeds[0].id);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [subtitleVisible, setSubtitleVisible] = useState(false);
  const [videoCovered, setVideoCovered] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [playerErrorCode, setPlayerErrorCode] = useState<number | null>(null);
  const [savedSessionKeys, setSavedSessionKeys] = useState<Set<string>>(() => new Set());
  const [heardSentenceKeysToday, setHeardSentenceKeysToday] = useState<Set<string>>(
    () => new Set()
  );
  const [segmentHighlightsBySourceKey, setSegmentHighlightsBySourceKey] = useState<
    Record<string, HighlightMapping[]>
  >({});
  const [saveStatus, setSaveStatus] = useState("");
  const [isSavingSegment, setIsSavingSegment] = useState(false);
  const [videoCandidates, setVideoCandidates] = useState<ListeningVideoCandidate[]>([]);
  const [transcripts, setTranscripts] = useState<ListeningTranscript[]>([]);
  const [candidateStatus, setCandidateStatus] = useState("");
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [transcribingCandidateId, setTranscribingCandidateId] = useState("");
  const [autoTranscribeLastRunDate, setAutoTranscribeLastRunDate] = useState(() =>
    readStoredString(AUTO_TRANSCRIBE_LAST_RUN_KEY)
  );
  const [dailyRoutineState, setDailyRoutineState] = useState<DailyRoutineState | null>(null);
  const [routineBuilderOpen, setRoutineBuilderOpen] = useState(false);
  const [selectedRoutineCandidateIds, setSelectedRoutineCandidateIds] = useState<string[]>([]);
  const [routineSentenceTarget, setRoutineSentenceTarget] = useState(
    DAILY_ROUTINE_DEFAULT_SENTENCE_TARGET
  );
  const [routineSentenceTargetInput, setRoutineSentenceTargetInput] = useState(
    String(DAILY_ROUTINE_DEFAULT_SENTENCE_TARGET)
  );
  const [isBuildingRoutine, setIsBuildingRoutine] = useState(false);
  const [routineStatus, setRoutineStatus] = useState("");
  const [pendingShortfallRoutine, setPendingShortfallRoutine] =
    useState<PendingShortfallRoutine | null>(null);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [isBatchTranscribing, setIsBatchTranscribing] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchTranscriptItem[]>([]);
  const [batchStartedAt, setBatchStartedAt] = useState<number | null>(null);
  const [batchFinishedAt, setBatchFinishedAt] = useState<number | null>(null);
  const [batchNow, setBatchNow] = useState(Date.now());
  const {
    confirmCloudTranslation,
    cloudTranslationPreflightDialog
  } = useCloudTranslationPreflight();
  const playerHostRef = useRef<HTMLIFrameElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const loadedVideoIdRef = useRef("");
  const subtitleSourceRef = useRef<HTMLParagraphElement | null>(null);
  const heardSentenceKeysTodayRef = useRef<Set<string>>(new Set());
  const targetLanguageCode = settings.learningProfile.targetLanguage.code;
  const normalizedTargetLanguageCode = normalizeListeningLanguageCode(targetLanguageCode);
  const nativeLanguageCode = settings.learningProfile.nativeLanguage.code;
  const autoTranscribeEnabled = settings.listeningLoopBackgroundPrebuildEnabled;
  const partialVideoClipsEnabled = settings.listeningLoopLongVideoPartialClipsEnabled;
  const dailyRoutineSeed = useMemo(
    () =>
      dailyRoutineState?.seed
        ? localizeListeningLoopSeedDisplay(dailyRoutineState.seed, t, {
            dailyTargetSentenceCount: dailyRoutineState.sentenceTargetCount,
            dailyUsePartialVideoClips: dailyRoutineState.partialVideoClipsEnabled,
            formatNumber: numberFormatter.format
          })
        : null,
    [dailyRoutineState, i18n.resolvedLanguage, numberFormatter, t]
  );
  const dailyRoutineReserveSegments = dailyRoutineState?.reserveSegments ?? [];
  const generatedSeeds = useMemo(
    () =>
      transcriptsToSeeds(transcripts)
        .filter((seed) =>
          matchesKnownLearningLanguage(seed.languageCode, targetLanguageCode)
        )
        .map((seed) =>
          localizeListeningLoopSeedDisplay(seed, t, {
            formatNumber: numberFormatter.format
          })
        ),
    [i18n.resolvedLanguage, numberFormatter, t, targetLanguageCode, transcripts]
  );
  const builtInSeeds = useMemo(
    () =>
      listeningLoopSeeds
        .filter((seed) =>
          matchesKnownLearningLanguage(seed.languageCode, targetLanguageCode)
        )
        .map((seed) =>
          localizeListeningLoopSeedDisplay(seed, t, {
            formatNumber: numberFormatter.format
          })
        ),
    [i18n.resolvedLanguage, numberFormatter, t, targetLanguageCode]
  );
  const allSeeds = useMemo(
    () => [
      ...(dailyRoutineSeed ? [dailyRoutineSeed] : []),
      ...generatedSeeds,
      ...builtInSeeds
    ],
    [builtInSeeds, dailyRoutineSeed, generatedSeeds]
  );
  const activeSeed = useMemo(
    () =>
      allSeeds.find((seed) => seed.id === activeSeedId) ??
      allSeeds[0] ??
      createEmptyListeningSeed(normalizedTargetLanguageCode),
    [activeSeedId, allSeeds, normalizedTargetLanguageCode]
  );
  const hasActiveSeed = allSeeds.length > 0 && activeSeed.segments.length > 0;
  const activeSeedIndex = useMemo(
    () => Math.max(0, allSeeds.findIndex((seed) => seed.id === activeSeed.id)),
    [activeSeed.id, allSeeds]
  );
  const currentSegment =
    activeSeed.segments[segmentIndex] ?? activeSeed.segments[0] ?? createEmptyListeningSegment();
  const currentSegmentVideoId = getListeningSegmentVideoId(activeSeed, currentSegment);
  const currentSegmentTitle = getListeningSegmentTitle(activeSeed, currentSegment);
  const currentSegmentChannelName = getListeningSegmentChannelName(activeSeed, currentSegment);
  const activeUnitLabel = t("listeningLoop.unitSentence");
  const savedCardKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const card of cards) {
      if (card.deckType === "input-listening" && card.targetText?.startsWith("listening:")) {
        keys.add(card.targetText);
      }
    }
    return keys;
  }, [cards]);
  const currentSourceKey = getListeningSourceKey(activeSeed, currentSegment);
  const todayHeardSentenceCount = heardSentenceKeysToday.size;
  const learnedListeningVideoIds = useMemo(
    () =>
      readStoredListeningLearnedVideoIds(
        profileId,
        normalizedTargetLanguageCode,
        cards,
        heardSentenceKeysToday
      ),
    [cards, heardSentenceKeysToday, normalizedTargetLanguageCode, profileId]
  );
  const currentHighlightMappings = segmentHighlightsBySourceKey[currentSourceKey] ?? [];
  const isCurrentSaved =
    savedCardKeys.has(currentSourceKey) || savedSessionKeys.has(currentSourceKey);
  const transcriptByCandidateId = useMemo(() => {
    return createTranscriptByCandidateId(transcripts);
  }, [transcripts]);
  const getVisibleCandidatesForCurrentProfile = useCallback(
    (
      candidates: ListeningVideoCandidate[],
      transcriptMap: Map<string, ListeningTranscript>
    ) =>
      getVisibleListeningVideoCandidates(candidates, transcriptMap, targetLanguageCode, {
        dateKey: getLocalDateKey(),
        excludeReadyTranscriptsBeforeDate: true,
        learnedVideoIds: learnedListeningVideoIds
      }),
    [learnedListeningVideoIds, targetLanguageCode]
  );
  const visibleVideoCandidates = useMemo(
    () => getVisibleCandidatesForCurrentProfile(videoCandidates, transcriptByCandidateId),
    [getVisibleCandidatesForCurrentProfile, transcriptByCandidateId, videoCandidates]
  );
  const batchCandidates = useMemo(
    () => getBatchTranscriptCandidates(visibleVideoCandidates, transcriptByCandidateId),
    [transcriptByCandidateId, visibleVideoCandidates]
  );
  const batchSummary = useMemo(() => getBatchSummary(batchItems), [batchItems]);
  const dailyRoutineQueueCandidates = useMemo(() => {
    const candidateById = new Map(videoCandidates.map((candidate) => [candidate.id, candidate]));
    return (dailyRoutineState?.selectedCandidateIds ?? [])
      .map((candidateId) => candidateById.get(candidateId))
      .filter((candidate): candidate is ListeningVideoCandidate => Boolean(candidate));
  }, [dailyRoutineState?.selectedCandidateIds, videoCandidates]);
  const dailyRoutineReadyCandidateCount = useMemo(
    () =>
      dailyRoutineQueueCandidates.filter((candidate) => {
        const transcript = transcriptByCandidateId.get(candidate.id);
        return transcript?.status === "ready" && transcript.segments.length > 0;
      }).length,
    [dailyRoutineQueueCandidates, transcriptByCandidateId]
  );
  const sideQueueCandidates = dailyRoutineSeed ? dailyRoutineQueueCandidates : visibleVideoCandidates;

  function getLocalizedCandidateSourceLabel(candidate: ListeningVideoCandidate) {
    if (candidate.sourceType === "youtube_extension") {
      return t("listeningLoop.candidate.sourceWatched");
    }
    if (candidate.sourceType === "youtube_rss") {
      return t("listeningLoop.candidate.sourceRss");
    }
    if (candidate.sourceType === "manual") {
      return t("listeningLoop.candidate.sourceManual");
    }
    return t("listeningLoop.candidate.sourceDefault");
  }

  function getLocalizedCandidateTranscriptLabel(
    transcript: ListeningTranscript | undefined,
    isTranscribing: boolean
  ) {
    if (isTranscribing || transcript?.status === "processing") {
      return t("listeningLoop.candidate.transcriptRunning");
    }
    if (transcript?.status === "ready" && transcript.segments.length > 0) {
      return t("listeningLoop.counts.segments", {
        formattedCount: numberFormatter.format(transcript.segments.length)
      });
    }
    if (transcript?.status === "failed") {
      return t("listeningLoop.candidate.transcriptRetry");
    }
    return t("listeningLoop.candidate.transcriptCreate");
  }

  function getLocalizedCandidateDurationInfo(
    candidate: ListeningVideoCandidate,
    transcript: ListeningTranscript | undefined
  ) {
    const duration = getCandidateDuration(candidate, transcript);
    if (!duration) {
      return {
        label: t("listeningLoop.candidate.durationUnknown"),
        tone: "unknown",
        title: t("listeningLoop.candidate.durationUnknownTitle")
      };
    }
    const source =
      duration.source === "video"
        ? t("listeningLoop.candidate.durationVideoSource")
        : t("listeningLoop.candidate.durationTranscriptSource");
    const titleKey =
      duration.seconds <= 6 * 60
        ? "listeningLoop.candidate.durationShort"
        : duration.seconds <= 15 * 60
          ? "listeningLoop.candidate.durationMedium"
          : "listeningLoop.candidate.durationLong";
    return {
      label: formatVideoDuration(duration.seconds),
      tone:
        duration.seconds <= 6 * 60
          ? "short"
          : duration.seconds <= 15 * 60
            ? "medium"
            : "long",
      title: t(titleKey, { source })
    };
  }

  function getLocalizedCandidateWatchLabel(candidate: ListeningVideoCandidate) {
    if (candidate.watchedSeconds && candidate.watchedSeconds >= 1) {
      return t("listeningLoop.candidate.watchedSeconds", {
        formattedCount: numberFormatter.format(Math.round(candidate.watchedSeconds))
      });
    }
    if (candidate.progressRatio && candidate.progressRatio > 0) {
      return t("listeningLoop.candidate.progressPercent", {
        formattedCount: numberFormatter.format(Math.round(candidate.progressRatio * 100))
      });
    }
    return t("listeningLoop.candidate.collectedCount", {
      formattedCount: numberFormatter.format(candidate.watchCount)
    });
  }

  function getLocalizedBatchStatusLabel(item: BatchTranscriptItem) {
    if (item.status === "done") {
      return t("listeningLoop.batch.done");
    }
    if (item.status === "failed") {
      return t("listeningLoop.batch.failed");
    }
    if (item.status === "running") {
      return t("listeningLoop.batch.runningStatus");
    }
    return t("listeningLoop.batch.pending");
  }

  function getLocalizedBatchElapsedLabel(item: BatchTranscriptItem, now: number) {
    if (item.elapsedMs !== undefined) {
      return formatDuration(item.elapsedMs);
    }
    if (item.startedAt !== undefined) {
      return formatDuration(now - item.startedAt);
    }
    return "--";
  }

  function formatStoredDate(value: string) {
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat(appLocale === "en" ? "en-US" : "ko-KR", {
      dateStyle: "medium"
    }).format(parsed);
  }

  const loadVideoCandidates = useCallback(
    async (options: { fetchRss?: boolean } = {}) => {
      setIsLoadingCandidates(true);
      setCandidateStatus(options.fetchRss ? t("listeningLoop.status.rssLoading") : "");
      try {
        let fetchedCandidates: ListeningVideoCandidate[] = [];
        if (options.fetchRss) {
          fetchedCandidates = await api.listening.fetchRssCandidates(targetLanguageCode);
        }
        const nextCandidates = await api.listening.listVideoCandidates();
        const nextTranscripts = await api.listening.listTranscripts();
        const nextTranscriptByCandidateId = createTranscriptByCandidateId(nextTranscripts);
        const nextVisibleCandidates = getVisibleCandidatesForCurrentProfile(
          nextCandidates,
          nextTranscriptByCandidateId
        );
        setVideoCandidates(nextCandidates);
        setTranscripts(nextTranscripts);
        setCandidateStatus(
          options.fetchRss
            ? fetchedCandidates.length > 0
              ? t("listeningLoop.status.rssUpdated", {
                  language: targetLanguageLabel,
                  formattedCount: numberFormatter.format(fetchedCandidates.length)
                })
              : t("listeningLoop.status.rssUnavailable", { language: targetLanguageLabel })
            : nextVisibleCandidates.length > 0
              ? t("listeningLoop.status.candidatesReady", {
                  language: targetLanguageLabel,
                  formattedCount: numberFormatter.format(nextVisibleCandidates.length)
                })
              : ""
        );
        const missingDurationCandidates = nextVisibleCandidates.filter(
          (candidate) => !hasCandidateVideoDuration(candidate)
        );
        if (missingDurationCandidates.length > 0) {
          setCandidateStatus(
            t("listeningLoop.status.durationChecking", {
              formattedCount: numberFormatter.format(missingDurationCandidates.length)
            })
          );
          const refreshedCandidates = await api.listening.refreshVideoCandidateMetadata(
            missingDurationCandidates.map((candidate) => candidate.id)
          );
          setVideoCandidates(refreshedCandidates);
          const refreshedVisibleCandidates = getVisibleCandidatesForCurrentProfile(
            refreshedCandidates,
            nextTranscriptByCandidateId
          );
          const resolvedCount = missingDurationCandidates.filter((candidate) => {
            const refreshed = refreshedCandidates.find((item) => item.id === candidate.id);
            return Boolean(refreshed && hasCandidateVideoDuration(refreshed));
          }).length;
          const unresolvedCount = Math.max(0, missingDurationCandidates.length - resolvedCount);
          setCandidateStatus(
            options.fetchRss
              ? t("listeningLoop.status.rssDurationResult", {
                  language: targetLanguageLabel,
                  candidateCount: numberFormatter.format(refreshedVisibleCandidates.length),
                  resolvedCount: numberFormatter.format(resolvedCount),
                  unresolved: unresolvedCount
                    ? t("listeningLoop.status.unresolvedSuffix", {
                        formattedCount: numberFormatter.format(unresolvedCount)
                      })
                    : ""
                })
              : unresolvedCount === 0
                ? t("listeningLoop.status.durationResolved", {
                    formattedCount: numberFormatter.format(resolvedCount)
                  })
                : t("listeningLoop.status.durationPartial", {
                    resolvedCount: numberFormatter.format(resolvedCount),
                    unresolvedCount: numberFormatter.format(unresolvedCount)
                  })
          );
        }
      } catch {
        setCandidateStatus(t("listeningLoop.status.candidateLoadFailed"));
      } finally {
        setIsLoadingCandidates(false);
      }
    },
    [
      api,
      getVisibleCandidatesForCurrentProfile,
      numberFormatter,
      t,
      targetLanguageCode,
      targetLanguageLabel
    ]
  );

  const loadCurrentSegment = useCallback(() => {
    if (!hasActiveSeed || !currentSegmentVideoId || !currentSegment.text) {
      return;
    }
    const player = playerRef.current;
    if (!player) {
      return;
    }
    setPlayerErrorCode(null);
    if (loadedVideoIdRef.current !== currentSegmentVideoId) {
      player.loadVideoById({
        videoId: currentSegmentVideoId,
        startSeconds: currentSegment.start,
        endSeconds: currentSegment.end
      });
      loadedVideoIdRef.current = currentSegmentVideoId;
    } else {
      player.seekTo(currentSegment.start, true);
    }
    player.setLoopRange?.({
      startSeconds: currentSegment.start,
      endSeconds: currentSegment.end,
      enabled: isLooping
    });
    suppressYouTubeCaptions(player);
    player.playVideo();
    setIsVideoPlaying(true);
  }, [
    currentSegment.end,
    currentSegment.start,
    currentSegment.text,
    currentSegmentVideoId,
    hasActiveSeed,
    isLooping
  ]);

  const startBatchTranscription = useCallback(
    async (source: "manual" | "auto" = "manual") => {
      if (isBatchTranscribing) {
        setBatchModalOpen(true);
        return;
      }

      const targets = getBatchTranscriptCandidates(visibleVideoCandidates, transcriptByCandidateId);
      const startedAt = Date.now();
      setBatchStartedAt(startedAt);
      setBatchFinishedAt(null);
      setBatchNow(startedAt);
      setBatchItems(
        targets.map((candidate) => ({
          candidateId: candidate.id,
          title: candidate.title,
          channelName: candidate.channelName,
          status: "pending"
        }))
      );
      setBatchModalOpen(true);

      if (source === "auto") {
        const dateKey = getLocalDateKey();
        setAutoTranscribeLastRunDate(dateKey);
        writeStoredString(AUTO_TRANSCRIBE_LAST_RUN_KEY, dateKey);
      }

      if (targets.length === 0) {
        setBatchFinishedAt(Date.now());
        setCandidateStatus(t("listeningLoop.status.noBatchTargets"));
        return;
      }

      setIsBatchTranscribing(true);
      setCandidateStatus(
        source === "auto"
          ? t("listeningLoop.status.autoTranscriptionStarted", {
              formattedCount: numberFormatter.format(targets.length)
            })
          : t("listeningLoop.status.batchTranscriptionStarted", {
              formattedCount: numberFormatter.format(targets.length)
            })
      );

      let doneCount = 0;
      let failedCount = 0;

      for (const candidate of targets) {
        const itemStartedAt = Date.now();
        setTranscribingCandidateId(candidate.id);
        setBatchItems((items) =>
          items.map((item) =>
            item.candidateId === candidate.id
              ? {
                  ...item,
                  status: "running",
                  startedAt: itemStartedAt,
                  message: t("listeningLoop.status.whisperRunning")
                }
              : item
          )
        );

        try {
          const result = await api.listening.generateTranscript(candidate.id);
          const itemEndedAt = Date.now();
          const transcript = result.transcript;
          if (transcript) {
            setTranscripts((previous) => upsertTranscript(previous, transcript));
          }

          const ok = Boolean(result.ok && transcript?.status === "ready" && transcript.segments.length > 0);
          if (ok) {
            doneCount += 1;
          } else {
            failedCount += 1;
          }

          setBatchItems((items) =>
            items.map((item) =>
              item.candidateId === candidate.id
                ? {
                    ...item,
                    status: ok ? "done" : "failed",
                    endedAt: itemEndedAt,
                    elapsedMs: itemEndedAt - itemStartedAt,
                    message: result.message,
                    segmentCount: transcript?.segments.length
                  }
                : item
            )
          );
        } catch {
          failedCount += 1;
          const itemEndedAt = Date.now();
          setBatchItems((items) =>
            items.map((item) =>
              item.candidateId === candidate.id
                ? {
                    ...item,
                    status: "failed",
                    endedAt: itemEndedAt,
                    elapsedMs: itemEndedAt - itemStartedAt,
                    message: t("listeningLoop.status.whisperFailed")
                  }
                : item
            )
          );
        }
      }

      setTranscribingCandidateId("");
      setIsBatchTranscribing(false);
      setBatchFinishedAt(Date.now());
      const nextTranscripts = await api.listening.listTranscripts();
      setTranscripts(nextTranscripts);
      setCandidateStatus(
        t("listeningLoop.status.batchFinished", {
          done: numberFormatter.format(doneCount),
          failed: numberFormatter.format(failedCount)
        })
      );
    },
    [
      api,
      isBatchTranscribing,
      numberFormatter,
      t,
      transcriptByCandidateId,
      visibleVideoCandidates
    ]
  );

  useEffect(() => {
    void loadVideoCandidates();
  }, [loadVideoCandidates]);

  useEffect(() => {
    const storedTarget = readStoredRoutineSentenceTarget(profileId, normalizedTargetLanguageCode);
    setRoutineSentenceTarget(storedTarget);
    setRoutineSentenceTargetInput(String(storedTarget));
    setPendingShortfallRoutine(null);
  }, [normalizedTargetLanguageCode, profileId]);

  useEffect(() => {
    const nextKeys = readStoredListeningHeardSentenceKeys(
      profileId,
      normalizedTargetLanguageCode,
      getLocalDateKey()
    );
    heardSentenceKeysTodayRef.current = nextKeys;
    setHeardSentenceKeysToday(nextKeys);
  }, [normalizedTargetLanguageCode, profileId]);

  useEffect(() => {
    const storedRoutine = readStoredDailyRoutineState(
      profileId,
      normalizedTargetLanguageCode
    );
    setDailyRoutineState(storedRoutine);
    if (storedRoutine?.seed) {
      setActiveSeedId(storedRoutine.seed.id);
      setSegmentIndex(0);
      setSubtitleVisible(false);
    }
  }, [normalizedTargetLanguageCode, profileId]);

  useEffect(() => {
    const visibleIds = new Set(visibleVideoCandidates.map((candidate) => candidate.id));
    setSelectedRoutineCandidateIds((previous) => {
      const kept = previous.filter((candidateId) => visibleIds.has(candidateId));
      if (kept.length > 0) {
        return kept;
      }
      return visibleVideoCandidates.slice(0, 1).map((candidate) => candidate.id);
    });
  }, [visibleVideoCandidates]);

  useEffect(() => {
    if (allSeeds.length === 0) {
      setSegmentIndex(0);
      return;
    }
    if (!allSeeds.some((seed) => seed.id === activeSeedId)) {
      setActiveSeedId(allSeeds[0].id);
      setSegmentIndex(0);
      setSubtitleVisible(false);
    }
  }, [activeSeedId, allSeeds]);

  useEffect(() => {
    if (!isBatchTranscribing) {
      return;
    }

    const timer = window.setInterval(() => {
      setBatchNow(Date.now());
    }, 500);
    return () => window.clearInterval(timer);
  }, [isBatchTranscribing]);

  useEffect(() => {
    if (!autoTranscribeEnabled || isLoadingCandidates || isBatchTranscribing) {
      return;
    }

    const today = getLocalDateKey();
    if (autoTranscribeLastRunDate === today || batchCandidates.length === 0) {
      return;
    }

    void startBatchTranscription("auto");
  }, [
    autoTranscribeEnabled,
    autoTranscribeLastRunDate,
    batchCandidates.length,
    isBatchTranscribing,
    isLoadingCandidates,
    startBatchTranscription
  ]);

  useEffect(() => {
    if (!batchModalOpen || typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setBatchModalOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [batchModalOpen]);

  useEffect(() => {
    if (showEntrance || !hasActiveSeed || !currentSegmentVideoId || !playerHostRef.current) {
      return;
    }

    playerRef.current = createListeningYouTubePlayerBridge(playerHostRef.current, {
      videoId: currentSegmentVideoId,
      startSeconds: currentSegment.start,
      endSeconds: currentSegment.end,
      loopEnabled: isLooping,
      onReady: () => {
        suppressYouTubeCaptions(playerRef.current);
        setIsPlayerReady(true);
      },
      onStateChange: (state) => {
        setIsVideoPlaying(state === YOUTUBE_PLAYER_STATE_PLAYING);
      },
      onError: (code) => {
        setIsVideoPlaying(false);
        setPlayerErrorCode(code);
      }
    });

    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
      loadedVideoIdRef.current = "";
      setIsPlayerReady(false);
    };
  }, [currentSegmentVideoId, hasActiveSeed, showEntrance]);

  useEffect(() => {
    if (!isPlayerReady) {
      return;
    }
    setSubtitleVisible(false);
    setSaveStatus("");
    loadCurrentSegment();
  }, [activeSeed.id, currentSegment.id, isPlayerReady, loadCurrentSegment]);

  useEffect(() => {
    if (!isPlayerReady || !isLooping || !isVideoPlaying) {
      return;
    }

    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) {
        return;
      }
      const currentTime = player.getCurrentTime();
      if (
        currentTime >= currentSegment.end - 0.12 ||
        currentTime < currentSegment.start - 0.5
      ) {
        player.seekTo(currentSegment.start, true);
        player.playVideo();
      }
    }, 250);

    return () => window.clearInterval(timer);
  }, [currentSegment.end, currentSegment.start, isLooping, isPlayerReady, isVideoPlaying]);

  useEffect(() => {
    if (!isPlayerReady || isLooping || !isVideoPlaying) {
      return;
    }

    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) {
        return;
      }
      if (player.getCurrentTime() < currentSegment.end - 0.12) {
        return;
      }
      if (segmentIndex < activeSeed.segments.length - 1) {
        setSegmentIndex((index) => Math.min(index + 1, activeSeed.segments.length - 1));
        setSubtitleVisible(false);
        return;
      }
      player.pauseVideo();
      setIsVideoPlaying(false);
    }, 250);

    return () => window.clearInterval(timer);
  }, [
    activeSeed.segments.length,
    currentSegment.end,
    isLooping,
    isPlayerReady,
    isVideoPlaying,
    segmentIndex
  ]);

  useEffect(() => {
    if (!isPlayerReady) {
      return;
    }
    playerRef.current?.setLoopRange?.({
      startSeconds: currentSegment.start,
      endSeconds: currentSegment.end,
      enabled: isLooping
    });
  }, [currentSegment.end, currentSegment.start, isLooping, isPlayerReady]);

  function selectSeed(seed: ListeningLoopSeed) {
    setActiveSeedId(seed.id);
    setSegmentIndex(0);
    setSubtitleVisible(false);
    setIsLooping(true);
  }

  function moveVideo(step: number) {
    const nextSeed = allSeeds[clamp(activeSeedIndex + step, 0, Math.max(0, allSeeds.length - 1))];
    if (!nextSeed || nextSeed.id === activeSeed.id) {
      return;
    }
    selectSeed(nextSeed);
    setSaveStatus("");
  }

  async function handleCandidateAction(candidate: ListeningVideoCandidate) {
    const transcript = transcriptByCandidateId.get(candidate.id);
    if (transcript?.status === "ready" && transcript.segments.length > 0) {
      await markListeningCandidatesLearned([candidate.id]);
      setActiveSeedId(getTranscriptSeedId(transcript));
      setSegmentIndex(0);
      setSubtitleVisible(false);
      setCandidateStatus(
        t("listeningLoop.status.loopOpened", {
          formattedCount: numberFormatter.format(transcript.segments.length)
        })
      );
      return;
    }

    setTranscribingCandidateId(candidate.id);
    setCandidateStatus(t("listeningLoop.status.whisperPreparing"));
    try {
      const result = await api.listening.generateTranscript(candidate.id);
      const nextTranscripts = await api.listening.listTranscripts();
      setTranscripts(nextTranscripts);
      if (result.transcript?.status === "ready" && result.transcript.segments.length > 0) {
        await markListeningCandidatesLearned([candidate.id]);
        setActiveSeedId(getTranscriptSeedId(result.transcript));
        setSegmentIndex(0);
        setSubtitleVisible(false);
      }
      setCandidateStatus(result.message);
    } catch {
      setCandidateStatus(t("listeningLoop.status.whisperFailed"));
    } finally {
      setTranscribingCandidateId("");
    }
  }

  async function markListeningCandidatesLearned(candidateIds: string[]) {
    const uniqueIds = [...new Set(candidateIds.filter(Boolean))];
    if (uniqueIds.length === 0) {
      return;
    }
    try {
      const nextCandidates = await api.listening.markVideoCandidatesLearned(uniqueIds);
      setVideoCandidates(nextCandidates);
    } catch {
      // Learning completion is a queue hygiene marker; playback should not fail if it cannot be written.
    }
  }

  async function openRoutineBuilder(options: { refreshRss?: boolean } = { refreshRss: true }) {
    setRoutineBuilderOpen(true);
    setPendingShortfallRoutine(null);
    setSelectedRoutineCandidateIds((previous) => {
      const visibleIds = new Set(visibleVideoCandidates.map((candidate) => candidate.id));
      const kept = previous.filter((candidateId) => visibleIds.has(candidateId));
      if (kept.length > 0) {
        return kept;
      }
      return visibleVideoCandidates.slice(0, 1).map((candidate) => candidate.id);
    });
    if (!options.refreshRss || isLoadingCandidates) {
      setRoutineStatus("");
      return;
    }
    setRoutineStatus(
      t("listeningLoop.status.recommendationsRefreshing", { language: targetLanguageLabel })
    );
    await loadVideoCandidates({ fetchRss: true });
    setRoutineStatus(t("listeningLoop.status.chooseInterestingVideo"));
  }

  function toggleRoutineCandidate(candidateId: string) {
    setPendingShortfallRoutine(null);
    setSelectedRoutineCandidateIds((previous) => {
      if (previous.includes(candidateId)) {
        return previous.filter((id) => id !== candidateId);
      }
      return [...previous, candidateId];
    });
  }

  function clearRoutineCandidateSelection() {
    setPendingShortfallRoutine(null);
    setSelectedRoutineCandidateIds([]);
    setRoutineStatus(t("listeningLoop.status.selectionCleared"));
  }

  function autoSelectRoutineCandidates() {
    const candidates = visibleVideoCandidates
      .map((candidate, index) => {
        const transcript = transcriptByCandidateId.get(candidate.id);
        const duration = getCandidateDuration(candidate, transcript);
        const readyScore = transcript?.status === "ready" && transcript.segments.length > 0 ? 100 : 0;
        const durationScore = duration
          ? duration.seconds <= 6 * 60
            ? 40
            : duration.seconds <= 15 * 60
              ? 20
              : 0
          : 10;
        return {
          candidate,
          score: readyScore + durationScore - index
        };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, DAILY_ROUTINE_CLIP_COUNT)
      .map((item) => item.candidate.id);

    setPendingShortfallRoutine(null);
    setSelectedRoutineCandidateIds(candidates);
    setRoutineStatus(
      candidates.length > 0
        ? t("listeningLoop.status.autoSelected", {
            formattedCount: numberFormatter.format(candidates.length)
          })
        : t("listeningLoop.status.noAutoSelection")
    );
  }

  function updateRoutineSentenceTargetInput(value: string) {
    const nextInput = value.replace(/[^\d]/g, "").slice(0, 3);
    setRoutineSentenceTargetInput(nextInput);
    setPendingShortfallRoutine(null);
    if (!nextInput) {
      return;
    }
    const numericTarget = Number(nextInput);
    if (!Number.isFinite(numericTarget)) {
      return;
    }
    setRoutineSentenceTarget(numericTarget);
    if (
      numericTarget >= DAILY_ROUTINE_MIN_SENTENCE_TARGET &&
      numericTarget <= DAILY_ROUTINE_MAX_SENTENCE_TARGET
    ) {
      writeStoredRoutineSentenceTarget(profileId, normalizedTargetLanguageCode, numericTarget);
    }
  }

  function commitRoutineSentenceTargetInput() {
    const nextTarget = normalizeRoutineSentenceTarget(routineSentenceTargetInput);
    setRoutineSentenceTarget(nextTarget);
    setRoutineSentenceTargetInput(String(nextTarget));
    setPendingShortfallRoutine(null);
    writeStoredRoutineSentenceTarget(profileId, normalizedTargetLanguageCode, nextTarget);
    return nextTarget;
  }

  function startDailyRoutineFromEntrance() {
    if (!dailyRoutineSeed) {
      void openRoutineBuilder();
      return;
    }
    setActiveSeedId(dailyRoutineSeed.id);
    setSegmentIndex(0);
    setSubtitleVisible(false);
    setIsLooping(true);
    setShowEntrance(false);
  }

  function openDirectYouTubePicker() {
    onOpenWebReaderUrl(
      getListeningYouTubePickerUrl(
        normalizedTargetLanguageCode,
        targetLanguageLabel
      ),
      t("listeningLoop.entrance.directPickerLabel")
    );
  }

  async function buildRoutineFromSelectedCandidates() {
    if (isBuildingRoutine) {
      return;
    }
    const selectedIds = selectedRoutineCandidateIds.filter((candidateId) =>
      visibleVideoCandidates.some((candidate) => candidate.id === candidateId)
    );
    if (selectedIds.length === 0) {
      setRoutineStatus(t("listeningLoop.status.selectAtLeastOne"));
      setRoutineBuilderOpen(true);
      return;
    }
    const targetSentenceCount = commitRoutineSentenceTargetInput();

    setIsBuildingRoutine(true);
    setRoutineStatus(t("listeningLoop.status.preparingTranscripts"));
    setCandidateStatus(t("listeningLoop.status.buildingDailyRoutine"));

    const transcriptMap = new Map(transcriptByCandidateId);
    let failedCount = 0;

    try {
      for (const candidateId of selectedIds) {
        const candidate = visibleVideoCandidates.find((item) => item.id === candidateId);
        const existingTranscript = transcriptMap.get(candidateId);
        if (
          !candidate ||
          (existingTranscript?.status === "ready" && existingTranscript.segments.length > 0)
        ) {
          continue;
        }

        setTranscribingCandidateId(candidateId);
        setRoutineStatus(
          t("listeningLoop.status.transcribingCandidate", { title: candidate.title })
        );
        try {
          const result = await api.listening.generateTranscript(candidateId);
          if (result.transcript) {
            transcriptMap.set(candidateId, result.transcript);
            setTranscripts((previous) => upsertTranscript(previous, result.transcript as ListeningTranscript));
          }
          if (!result.ok || !result.transcript?.segments.length) {
            failedCount += 1;
          }
        } catch {
          failedCount += 1;
          setRoutineStatus(
            t("listeningLoop.status.someTranscriptionsFailed", {
              error: t("listeningLoop.status.whisperFailed")
            })
          );
        }
      }

      const nextTranscripts = await api.listening.listTranscripts();
      const nextTranscriptMap = createTranscriptByCandidateId(nextTranscripts);
      setTranscripts(nextTranscripts);

      const result = buildDailyRoutineSeed({
        candidates: visibleVideoCandidates,
        transcriptByCandidateId: nextTranscriptMap,
        selectedCandidateIds: selectedIds,
        targetLanguageCode,
        targetSentenceCount,
        usePartialVideoClips: partialVideoClipsEnabled,
        dateKey: getLocalDateKey()
      });

      if (!result.seed || result.missingCandidateIds.length > 0) {
        setRoutineStatus(
          failedCount > 0
            ? t("listeningLoop.status.routineFailedTranscription")
            : t("listeningLoop.status.routineNoTranscript")
        );
        setCandidateStatus("");
        return;
      }

      const nextState: DailyRoutineState = {
        version: DAILY_ROUTINE_STORAGE_VERSION,
        dateKey: getLocalDateKey(),
        targetLanguageCode: normalizedTargetLanguageCode,
        partialVideoClipsEnabled,
        sentenceTargetCount: targetSentenceCount,
        seed: result.seed,
        reserveSegments: result.reserveSegments,
        selectedCandidateIds: result.selectedCandidateIds,
        createdAt: new Date().toISOString()
      };
      if (result.preparedSentenceCount < result.targetSentenceCount) {
        setPendingShortfallRoutine({
          state: nextState,
          selectedCandidateIds: selectedIds,
          preparedSentenceCount: result.preparedSentenceCount,
          targetSentenceCount: result.targetSentenceCount
        });
        setRoutineBuilderOpen(true);
        setRoutineStatus(
          t("listeningLoop.status.shortfall", {
            prepared: numberFormatter.format(result.preparedSentenceCount),
            target: numberFormatter.format(result.targetSentenceCount)
          })
        );
        setCandidateStatus("");
        return;
      }

      await startPreparedDailyRoutine(nextState, selectedIds);
    } finally {
      setTranscribingCandidateId("");
      setIsBuildingRoutine(false);
    }
  }

  async function startPendingShortfallRoutine() {
    if (!pendingShortfallRoutine || isBuildingRoutine) {
      return;
    }
    setIsBuildingRoutine(true);
    try {
      await startPreparedDailyRoutine(
        pendingShortfallRoutine.state,
        pendingShortfallRoutine.selectedCandidateIds
      );
      setPendingShortfallRoutine(null);
    } finally {
      setIsBuildingRoutine(false);
    }
  }

  async function startPreparedDailyRoutine(
    nextState: DailyRoutineState,
    selectedIds: string[]
  ) {
    setDailyRoutineState(nextState);
    writeStoredDailyRoutineState(profileId, normalizedTargetLanguageCode, nextState);
    await markListeningCandidatesLearned(selectedIds);
    setActiveSeedId(nextState.seed.id);
    setSegmentIndex(0);
    setSubtitleVisible(false);
    setIsLooping(true);
    setRoutineBuilderOpen(false);
    setRoutineStatus(
      t("listeningLoop.status.routineBuilt", {
        clipCount: numberFormatter.format(getDailyRoutineClipCount(nextState.seed)),
        mediaUnit: partialVideoClipsEnabled
          ? t("listeningLoop.status.clip")
          : t("listeningLoop.status.video"),
        prepared: numberFormatter.format(nextState.seed.segments.length),
        target: numberFormatter.format(nextState.sentenceTargetCount),
        reserve:
          nextState.reserveSegments.length > 0
            ? t("listeningLoop.status.reserveSuffix", {
                formattedCount: numberFormatter.format(nextState.reserveSegments.length)
              })
            : ""
      })
    );
    setCandidateStatus(
      t("listeningLoop.status.missionRoutineBuilt", {
        language: targetLanguageLabel,
        formattedCount: numberFormatter.format(nextState.seed.segments.length)
      })
    );
    setShowEntrance(false);
  }

  async function recordCurrentSentenceHeard() {
    if (!hasActiveSeed || !currentSegment.text.trim() || !currentSourceKey) {
      return;
    }

    const dateKey = getLocalDateKey();
    const sourceKey = currentSourceKey;
    if (heardSentenceKeysTodayRef.current.has(sourceKey)) {
      return;
    }

    const nextKeys = new Set(heardSentenceKeysTodayRef.current);
    nextKeys.add(sourceKey);
    heardSentenceKeysTodayRef.current = nextKeys;
    setHeardSentenceKeysToday(nextKeys);
    writeStoredListeningHeardSentenceKeys(
      profileId,
      normalizedTargetLanguageCode,
      dateKey,
      nextKeys
    );

    try {
      await api.missions.recordEvent({
        type: "listening_sentence_completed",
        amount: 1,
        metadata: {
          sourceKey,
          seedId: activeSeed.id,
          segmentId: currentSegment.id,
          videoId: currentSegmentVideoId,
          languageCode: normalizedTargetLanguageCode
        }
      });
      await onMissionProgressChanged?.();
    } catch {
      const rollbackKeys = new Set(heardSentenceKeysTodayRef.current);
      rollbackKeys.delete(sourceKey);
      heardSentenceKeysTodayRef.current = rollbackKeys;
      setHeardSentenceKeysToday(rollbackKeys);
      writeStoredListeningHeardSentenceKeys(
        profileId,
        normalizedTargetLanguageCode,
        dateKey,
        rollbackKeys
      );
      setSaveStatus(t("listeningLoop.status.heardRecordFailed"));
    }
  }

  function moveSegment(step: number) {
    const nextIndex = clamp(segmentIndex + step, 0, Math.max(0, activeSeed.segments.length - 1));
    if (nextIndex === segmentIndex) {
      return;
    }
    if (step > 0) {
      void recordCurrentSentenceHeard();
    }
    setSegmentIndex(nextIndex);
    setSubtitleVisible(false);
  }

  function replaySegment() {
    playerRef.current?.seekTo(currentSegment.start, true);
    playerRef.current?.playVideo();
    setIsVideoPlaying(true);
  }

  function togglePlayback() {
    const player = playerRef.current;
    if (!player) {
      return;
    }

    const isPlaying = isVideoPlaying || player.getPlayerState() === YOUTUBE_PLAYER_STATE_PLAYING;
    if (isPlaying) {
      player.pauseVideo();
      setIsVideoPlaying(false);
      return;
    }

    player.playVideo();
    setIsVideoPlaying(true);
  }

  function toggleLooping() {
    setIsLooping((value) => !value);
  }

  function applySelectionHighlight() {
    const selectedText = getSelectedListeningHighlightText(
      subtitleSourceRef.current,
      currentSegment.text
    );
    if (!selectedText) {
      setSubtitleVisible(true);
      setSaveStatus(t("listeningLoop.status.highlightSelectionFirst"));
      return;
    }

    const normalizedSelectionKey = normalizeHighlightLookupKey(selectedText);
    if (
      currentHighlightMappings.some(
        (mapping) => normalizeHighlightLookupKey(mapping.sourceText) === normalizedSelectionKey
      )
    ) {
      removeHighlightMapping(selectedText);
      window.getSelection()?.removeAllRanges();
      return;
    }

    if (currentHighlightMappings.length >= LISTENING_HIGHLIGHT_LIMIT) {
      setSaveStatus(
        t("listeningLoop.status.highlightLimit", {
          formattedCount: numberFormatter.format(LISTENING_HIGHLIGHT_LIMIT)
        })
      );
      return;
    }

    const nextMapping: HighlightMapping = {
      sourceText: selectedText,
      colorKey: "yellow"
    };
    setSegmentHighlightsBySourceKey((previous) => ({
      ...previous,
      [currentSourceKey]: [...(previous[currentSourceKey] ?? []), nextMapping]
    }));
    setSaveStatus(
      t("listeningLoop.status.highlightAdded", { text: formatStatusSnippet(selectedText) })
    );
    window.getSelection()?.removeAllRanges();
  }

  function removeHighlightMapping(sourceText: string) {
    setSegmentHighlightsBySourceKey((previous) => {
      const nextMappings = (previous[currentSourceKey] ?? []).filter(
        (mapping) => mapping.sourceText !== sourceText
      );
      const next = { ...previous };
      if (nextMappings.length === 0) {
        delete next[currentSourceKey];
      } else {
        next[currentSourceKey] = nextMappings;
      }
      return next;
    });
    setSaveStatus(
      t("listeningLoop.status.highlightRemoved", { text: formatStatusSnippet(sourceText) })
    );
  }

  async function saveCurrentSegment() {
    if (isSavingSegment) {
      return;
    }
    if (!hasActiveSeed || !currentSegment.text.trim()) {
      setSaveStatus(
        t("listeningLoop.status.prepareFirst", { language: targetLanguageLabel })
      );
      return;
    }
    if (isCurrentSaved) {
      setSaveStatus(t("listeningLoop.status.alreadySaved"));
      return;
    }

    const now = new Date();
    const youtubeUrl = `https://www.youtube.com/watch?v=${currentSegmentVideoId}&t=${Math.floor(
      currentSegment.start
    )}s`;
    const structureNote = [
        t("listeningLoop.sourceNote.video", { value: currentSegmentTitle }),
        t("listeningLoop.sourceNote.channel", { value: currentSegmentChannelName }),
        t("listeningLoop.sourceNote.speaker", { value: currentSegment.speaker }),
        t("listeningLoop.sourceNote.range", {
          start: formatTime(currentSegment.start),
          end: formatTime(currentSegment.end)
        }),
        `YouTube: ${youtubeUrl}`,
        currentHighlightMappings.length > 0
          ? t("listeningLoop.sourceNote.highlights", {
              value: currentHighlightMappings.map((mapping) => mapping.sourceText).join(", ")
            })
          : ""
    ]
      .filter(Boolean)
      .join("\n");

    const allowed =
      settings.providerName !== "gemini" && settings.providerName !== "ollama"
        ? true
        : await confirmCloudTranslation({
            settings,
            providerName: settings.providerName === "gemini" ? "gemini" : "local",
            model:
              settings.providerName === "gemini"
                ? settings.geminiModel
                : settings.ollamaModel,
            operation: "text",
            textGroups: [[
              currentSegment.text,
              activeSeed.segments[segmentIndex - 1]?.text ?? "",
              activeSeed.segments[segmentIndex + 1]?.text ?? "",
              structureNote
            ]],
            scopeLabel: t("cloudTranslationPreflight.cardScope"),
            dataCategories: [
              t("cloudTranslationPreflight.cardSelectedText"),
              t("cloudTranslationPreflight.cardContext"),
              t("cloudTranslationPreflight.learningProfile")
            ]
          });
    if (!allowed) {
      setSaveStatus(t("manualChatGptBridge.cancelled"));
      return;
    }

    setSaveStatus(t("listeningLoop.status.saving"));
    setIsSavingSegment(true);
    try {
      setSaveStatus(t("listeningLoop.status.aiGenerating"));
      const card = await createListeningLoopInputCard({
        provider,
        profileId,
        settings,
        segment: currentSegment,
        sourceKey: currentSourceKey,
        sourceLanguageCode: activeSeed.languageCode || normalizedTargetLanguageCode,
        targetLanguageCode: normalizedTargetLanguageCode,
        nativeLanguageCode,
        videoTitle: currentSegmentTitle,
        channelName: currentSegmentChannelName,
        highlightMappings: currentHighlightMappings,
        structureNote,
        beforeSentence: activeSeed.segments[segmentIndex - 1]?.text,
        afterSentence: activeSeed.segments[segmentIndex + 1]?.text,
        readerTextContext: activeSeed.segments
          .slice(Math.max(0, segmentIndex - 2), segmentIndex + 3)
          .map((segment) => segment.text)
          .join(" "),
        now
      });
      await api.cards.save(card, profileId);
      setSavedSessionKeys((previous) => {
        const next = new Set(previous);
        next.add(currentSourceKey);
        return next;
      });
      setSaveStatus(
        t("listeningLoop.status.saved", { text: formatStatusSnippet(currentSegment.text) })
      );
      try {
        await onCardsChanged();
      } catch {
        setSaveStatus(
          t("listeningLoop.status.savedRefreshWarning", { error: t("common.errorUnknown") })
        );
      }
    } catch {
      setSaveStatus(t("listeningLoop.status.saveFailed", { error: t("common.errorUnknown") }));
    } finally {
      setIsSavingSegment(false);
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (showEntrance || batchModalOpen) {
        return;
      }
      if (
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        isInteractiveShortcutTarget(event.target)
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (event.shiftKey && key === "a") {
        event.preventDefault();
        moveVideo(-1);
        return;
      }

      if (event.shiftKey && key === "d") {
        event.preventDefault();
        moveVideo(1);
        return;
      }

      if (key === "s") {
        event.preventDefault();
        if (!event.repeat) {
          togglePlayback();
        }
        return;
      }

      if (key === "q") {
        event.preventDefault();
        if (!event.repeat) {
          toggleLooping();
        }
        return;
      }

      if (key === "f") {
        event.preventDefault();
        if (!event.repeat) {
          applySelectionHighlight();
        }
        return;
      }

      if (key === "a") {
        event.preventDefault();
        moveSegment(-1);
        return;
      }

      if (key === "d") {
        event.preventDefault();
        moveSegment(1);
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();
        if (!event.repeat) {
          setSubtitleVisible((value) => !value);
        }
        return;
      }

      if (key === "r") {
        event.preventDefault();
        if (!event.repeat) {
          void saveCurrentSegment();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  });

  if (showEntrance) {
    const routineCandidates = visibleVideoCandidates;

    if (routineBuilderOpen) {
      return (
        <div
          className="listening-loop-page listening-loop-entrance-page listening-routine-picker-page"
          data-qa="listening-loop-entrance"
        >
          <section className="panel listening-entrance-main listening-routine-picker-main">
            <div className="listening-entrance-hero">
              <div>
                <span className="section-kicker">
                  <Youtube size={16} />
                  {t("listeningLoop.entrance.pickerKicker")}
                </span>
                <h1>{t("listeningLoop.entrance.pickerTitle")}</h1>
                <p aria-live="polite" role="status">
                  {routineStatus ||
                    t("listeningLoop.counts.candidates", {
                      formattedCount: numberFormatter.format(routineCandidates.length)
                    })}
                </p>
              </div>
              <div className="listening-entrance-hero-actions">
                <button
                  className="button secondary"
                  data-qa="listening-auto-select-routine"
                  type="button"
                  disabled={isLoadingCandidates || isBuildingRoutine || routineCandidates.length === 0}
                  onClick={autoSelectRoutineCandidates}
                >
                  <Wand2 size={16} />
                  {t("listeningLoop.entrance.autoSelect")}
                </button>
                <button
                  className="button ghost small"
                  data-qa="listening-clear-routine-selection"
                  type="button"
                  disabled={isBuildingRoutine || selectedRoutineCandidateIds.length === 0}
                  onClick={clearRoutineCandidateSelection}
                >
                  <X size={14} />
                  {t("listeningLoop.entrance.clearSelection")}
                </button>
                <button
                  className="button primary"
                  data-qa="listening-build-routine"
                  type="button"
                  disabled={isBuildingRoutine || selectedRoutineCandidateIds.length === 0}
                  onClick={() => void buildRoutineFromSelectedCandidates()}
                >
                  {isBuildingRoutine ? <Loader2 className="spin-icon" size={16} /> : <Wand2 size={16} />}
                  {isBuildingRoutine
                    ? t("listeningLoop.entrance.building")
                    : t("listeningLoop.entrance.buildTarget", {
                        formattedCount: numberFormatter.format(routineSentenceTarget)
                      })}
                </button>
                <button
                  className="button ghost small"
                  data-qa="listening-entrance-refresh"
                  type="button"
                  disabled={isLoadingCandidates}
                  onClick={() => void loadVideoCandidates({ fetchRss: true })}
                >
                  <RefreshCw size={14} />
                  {t("listeningLoop.entrance.refresh")}
                </button>
                <button
                  className="button ghost small"
                  type="button"
                  disabled={isBuildingRoutine}
                  onClick={() => setRoutineBuilderOpen(false)}
                >
                  {t("listeningLoop.entrance.home")}
                </button>
              </div>
            </div>

            <section className="listening-routine-target-panel">
              <label htmlFor="listening-routine-sentence-target">
                <strong>{t("listeningLoop.entrance.targetTitle")}</strong>
                <small>{t("listeningLoop.entrance.targetDescription")}</small>
              </label>
              <input
                id="listening-routine-sentence-target"
                aria-label={t("listeningLoop.entrance.targetAria")}
                className="text-input listening-routine-target-input"
                data-qa="listening-routine-sentence-target"
                inputMode="numeric"
                maxLength={3}
                pattern="[0-9]*"
                type="text"
                value={routineSentenceTargetInput}
                onBlur={() => commitRoutineSentenceTargetInput()}
                onChange={(event) => updateRoutineSentenceTargetInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                }}
              />
            </section>

            {pendingShortfallRoutine ? (
              <section className="listening-routine-shortfall" data-qa="listening-routine-shortfall">
                <div>
                  <strong>{t("listeningLoop.entrance.shortfallTitle")}</strong>
                  <small>
                    {t("listeningLoop.entrance.shortfallDescription", {
                      prepared: numberFormatter.format(
                        pendingShortfallRoutine.preparedSentenceCount
                      ),
                      target: numberFormatter.format(pendingShortfallRoutine.targetSentenceCount)
                    })}
                  </small>
                </div>
                <div className="listening-routine-shortfall-actions">
                  <button
                    className="button secondary"
                    type="button"
                    disabled={isBuildingRoutine}
                    onClick={() =>
                      setRoutineStatus(t("listeningLoop.status.chooseMoreThenRetry"))
                    }
                  >
                    {t("listeningLoop.entrance.chooseMore")}
                  </button>
                  <button
                    className="button primary"
                    type="button"
                    disabled={isBuildingRoutine}
                    onClick={() => void startPendingShortfallRoutine()}
                  >
                    {t("listeningLoop.entrance.startPrepared", {
                      formattedCount: numberFormatter.format(
                        pendingShortfallRoutine.preparedSentenceCount
                      )
                    })}
                  </button>
                </div>
              </section>
            ) : null}

            <section
              className="listening-routine-builder listening-routine-builder-scene"
              data-qa="listening-routine-builder"
            >
              <div className="listening-entrance-section-head">
                <div>
                  <h2>{t("listeningLoop.entrance.recommendedVideos")}</h2>
                  <p>
                    {partialVideoClipsEnabled
                      ? t("listeningLoop.entrance.clipDescription")
                      : t("listeningLoop.entrance.routineDescription")}
                  </p>
                </div>
                <span>
                  {t("listeningLoop.counts.selected", {
                    formattedCount: numberFormatter.format(selectedRoutineCandidateIds.length)
                  })}
                </span>
              </div>
              <div className="listening-routine-source-list">
                {routineCandidates.length > 0 ? (
                  routineCandidates.map((candidate) => {
                    const transcript = transcriptByCandidateId.get(candidate.id);
                    const duration = getCandidateDuration(candidate, transcript);
                    const durationInfo = getLocalizedCandidateDurationInfo(candidate, transcript);
                    const selectedOrder = selectedRoutineCandidateIds.indexOf(candidate.id) + 1;
                    return (
                      <button
                        className={
                          selectedOrder > 0
                            ? "listening-routine-source selected"
                            : "listening-routine-source"
                        }
                        data-qa="listening-routine-source"
                        data-candidate-source={candidate.sourceType}
                        data-duration-seconds={duration?.seconds ?? ""}
                        data-video-id={candidate.videoId}
                        aria-label={t("listeningLoop.candidate.selectAria", {
                          title: candidate.title
                        })}
                        aria-pressed={selectedOrder > 0}
                        key={candidate.id}
                        type="button"
                        onClick={() => toggleRoutineCandidate(candidate.id)}
                      >
                        <img alt="" loading="lazy" src={getCandidateThumbnailUrl(candidate)} />
                        <div>
                          <span className="listening-source-order">
                            {selectedOrder > 0
                              ? t("listeningLoop.counts.rank", {
                                  formattedCount: numberFormatter.format(selectedOrder)
                                })
                              : getLocalizedCandidateSourceLabel(candidate)}
                          </span>
                          <strong>{candidate.title}</strong>
                          <small>
                            {candidate.channelName || "YouTube"} ·{" "}
                            {duration ? formatVideoDuration(duration.seconds) : durationInfo.label} ·{" "}
                            {getLocalizedCandidateTranscriptLabel(
                              transcript,
                              transcribingCandidateId === candidate.id
                            )}
                          </small>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="listening-candidate-empty">
                    {isLoadingCandidates
                      ? t("listeningLoop.entrance.loadingRecommendations", {
                          language: targetLanguageLabel
                        })
                      : t("listeningLoop.entrance.noRecommendations")}
                  </div>
                )}
              </div>
            </section>
          </section>
        </div>
      );
    }

    return (
      <div
        className="listening-loop-page listening-loop-entrance-page listening-loop-home-page"
        data-qa="listening-loop-entrance"
      >
        <section className="panel listening-entrance-main listening-home-main">
          <div className="listening-entrance-hero listening-home-hero">
            <div>
              <span className="section-kicker">
                <Headphones size={16} />
                {t("listeningLoop.title")}
              </span>
              <h1>{t("listeningLoop.entrance.homeTitle")}</h1>
              <p>{t("listeningLoop.entrance.homeDescription")}</p>
            </div>
          </div>

          <div className="listening-home-action-grid">
            {dailyRoutineSeed ? (
              <button
                className="listening-home-action-card primary resume"
                data-qa="listening-resume-routine"
                type="button"
                onClick={startDailyRoutineFromEntrance}
              >
                <span className="listening-home-action-icon">
                  <Play size={24} />
                </span>
                <span>
                  <strong>{t("listeningLoop.entrance.resume")}</strong>
                  <small>
                    {t("listeningLoop.entrance.resumeDescription", {
                      sentenceCount: numberFormatter.format(dailyRoutineSeed.segments.length),
                      videoCount: numberFormatter.format(
                        dailyRoutineState?.selectedCandidateIds.length ?? 0
                      )
                    })}
                  </small>
                </span>
              </button>
            ) : null}

            <button
              className={dailyRoutineSeed ? "listening-home-action-card" : "listening-home-action-card primary"}
              data-qa="listening-create-routine"
              disabled={isBuildingRoutine}
              type="button"
              onClick={() => void openRoutineBuilder()}
            >
              <span className="listening-home-action-icon">
                <Wand2 size={24} />
              </span>
              <span>
                <strong>
                  {dailyRoutineSeed
                    ? t("listeningLoop.entrance.newPlaylist")
                    : t("listeningLoop.entrance.createRoutine")}
                </strong>
                <small>
                  {t("listeningLoop.entrance.createDescription", {
                    language: targetLanguageLabel
                  })}
                </small>
              </span>
            </button>

            <button
              className="listening-home-action-card"
              data-qa="listening-direct-youtube"
              type="button"
              onClick={openDirectYouTubePicker}
            >
              <span className="listening-home-action-icon">
                <Youtube size={24} />
              </span>
              <span>
                <strong>{t("listeningLoop.entrance.directVideo")}</strong>
                <small>{t("listeningLoop.entrance.directDescription")}</small>
              </span>
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="listening-loop-page">
      {cloudTranslationPreflightDialog}
      <section className="panel listening-loop-main">
        <div className="listening-loop-header">
          <div>
            <span className="section-kicker">
              <Headphones size={16} />
              {t("listeningLoop.title")}
            </span>
            <h1>{hasActiveSeed ? activeSeed.title : t("listeningLoop.title")}</h1>
            <p>
              {currentSegmentTitle} · {currentSegmentChannelName} · {activeSeed.topicLabel}
            </p>
          </div>
          <div className="listening-loop-header-actions">
            <button
              className="button ghost small"
              data-qa="listening-open-entrance"
              type="button"
              onClick={() => setShowEntrance(true)}
            >
              {t("listeningLoop.practice.entrance")}
            </button>
            <span className="listening-loop-counter">
              {t("listeningLoop.practice.currentPosition", {
                current: numberFormatter.format(segmentIndex + 1),
                total: numberFormatter.format(activeSeed.segments.length)
              })}
            </span>
            <span className="listening-loop-counter">
              {t("listeningLoop.counts.heardToday", {
                formattedCount: numberFormatter.format(todayHeardSentenceCount)
              })}
            </span>
            <span
              className={
                isLooping
                  ? "listening-loop-mode-pill active"
                  : "listening-loop-mode-pill inactive"
              }
            >
              {t("listeningLoop.practice.loopState", { state: isLooping ? "ON" : "OFF" })}
            </span>
          </div>
        </div>

        <div className="listening-player-shell">
          <iframe
            ref={playerHostRef}
            className="listening-player-frame"
            title={t("listeningLoop.practice.youtubePlayer")}
            allow="autoplay; encrypted-media; picture-in-picture"
          />
          {playerErrorCode !== null ? (
            <div
              className="listening-player-error"
              data-qa="listening-player-error"
              role="alert"
            >
              <AlertTriangle size={28} />
              <strong>
                {playerErrorCode === 153
                  ? t("listeningLoop.playerError.blockedTitle")
                  : t("listeningLoop.playerError.genericTitle")}
              </strong>
              <span>
                {playerErrorCode === 153
                  ? t("listeningLoop.playerError.blockedMessage")
                  : t("listeningLoop.playerError.genericMessage", {
                      code: numberFormatter.format(playerErrorCode)
                    })}
              </span>
              <button
                className="button secondary small"
                type="button"
                onClick={() => window.open(getYouTubeWatchUrl(currentSegmentVideoId, currentSegment.start), "_blank")}
              >
                <Youtube size={15} />
                {t("listeningLoop.practice.openYouTube")}
              </button>
            </div>
          ) : null}
          {videoCovered ? (
            <button
              className="listening-video-cover"
              type="button"
              onClick={() => setVideoCovered(false)}
            >
              <EyeOff size={26} />
              <strong>{t("listeningLoop.practice.videoCovered")}</strong>
              <span>{t("listeningLoop.practice.videoCoveredDescription")}</span>
            </button>
          ) : null}
        </div>

        <div className="listening-loop-controls">
          <div
            className="listening-video-controls"
            aria-label={t("listeningLoop.practice.videoControls")}
            role="group"
          >
            <button
              className="button secondary"
              data-qa="listening-prev-video"
              type="button"
              disabled={activeSeedIndex === 0}
              onClick={() => moveVideo(-1)}
            >
              <ChevronLeft size={17} />
              {t("listeningLoop.practice.previousVideo")}
              <kbd>Shift+A</kbd>
            </button>
            <button
              className="button primary"
              data-qa="listening-play-toggle"
              type="button"
              disabled={!isPlayerReady}
              onClick={togglePlayback}
            >
              {isVideoPlaying ? <Pause size={17} /> : <Play size={17} />}
              {isVideoPlaying
                ? t("listeningLoop.practice.pause")
                : t("listeningLoop.practice.play")}
              <kbd>S</kbd>
            </button>
            <button
              className="button secondary"
              data-qa="listening-next-video"
              type="button"
              disabled={activeSeedIndex >= allSeeds.length - 1}
              onClick={() => moveVideo(1)}
            >
              {t("listeningLoop.practice.nextVideo")}
              <ChevronRight size={17} />
              <kbd>Shift+D</kbd>
            </button>
          </div>

          <div
            className="listening-sentence-controls"
            aria-label={t("listeningLoop.practice.sentenceControls", {
              unit: activeUnitLabel
            })}
            role="group"
          >
            <button
              className="button secondary small"
              type="button"
              disabled={segmentIndex === 0}
              onClick={() => moveSegment(-1)}
            >
              <ChevronLeft size={15} />
              {t("listeningLoop.practice.previousUnit", { unit: activeUnitLabel })}
              <kbd>A</kbd>
            </button>
            <button
              className="button secondary small"
              data-qa="listening-replay-button"
              type="button"
              onClick={replaySegment}
            >
              <RotateCcw size={15} />
              {t("listeningLoop.practice.replay")}
            </button>
            <button
              className="button secondary small"
              data-qa="listening-subtitle-toggle"
              type="button"
              onClick={() => setSubtitleVisible((value) => !value)}
            >
              {subtitleVisible ? <EyeOff size={15} /> : <Eye size={15} />}
              {subtitleVisible
                ? t("listeningLoop.practice.hide")
                : t("listeningLoop.practice.show")}
              <kbd>Space</kbd>
            </button>
            <button
              aria-pressed={isLooping}
              className={
                isLooping
                  ? "button secondary small listening-loop-toggle active"
                  : "button secondary small listening-loop-toggle inactive"
              }
              data-qa="listening-loop-toggle"
              title={
                isLooping
                  ? t("listeningLoop.practice.loopOnDescription")
                  : t("listeningLoop.practice.loopOffDescription")
              }
              type="button"
              onClick={toggleLooping}
            >
              <Repeat2 size={15} />
              {t("listeningLoop.practice.loopState", { state: isLooping ? "ON" : "OFF" })}
              <kbd>Q</kbd>
            </button>
            <button
              className="button secondary small"
              data-qa="listening-next-segment"
              type="button"
              disabled={segmentIndex >= activeSeed.segments.length - 1}
              onClick={() => moveSegment(1)}
            >
              {t("listeningLoop.practice.nextUnit", { unit: activeUnitLabel })}
              <ChevronRight size={15} />
              <kbd>D</kbd>
            </button>
          </div>

          <button
            className="button ghost small listening-cover-control"
            data-qa="listening-cover-toggle"
            type="button"
            onClick={() => setVideoCovered((value) => !value)}
          >
            {videoCovered ? <Eye size={15} /> : <EyeOff size={15} />}
            {videoCovered
              ? t("listeningLoop.practice.showVideo")
              : t("listeningLoop.practice.hideVideo")}
          </button>
        </div>

        <section className="listening-subtitle-card">
          <div className="listening-subtitle-head">
            <div>
              <span>
                <Captions size={16} />
                {currentSegment.speaker}
              </span>
              <small>
                {formatTime(currentSegment.start)} - {formatTime(currentSegment.end)}
              </small>
            </div>
            <div className="listening-subtitle-actions">
              <button
                className="button ghost small"
                data-qa="listening-highlight-selection"
                type="button"
                onClick={applySelectionHighlight}
              >
                <Highlighter size={15} />
                {t("listeningLoop.practice.highlight")}
                <kbd>F</kbd>
              </button>
              <button
                className="button ghost small"
                data-qa="listening-subtitle-toggle"
                type="button"
                onClick={() => setSubtitleVisible((value) => !value)}
              >
                {subtitleVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                {subtitleVisible
                  ? t("listeningLoop.practice.hideUnit", { unit: activeUnitLabel })
                  : t("listeningLoop.practice.showUnit", { unit: activeUnitLabel })}
              </button>
            </div>
          </div>
          {subtitleVisible ? (
            <div className="listening-subtitle-visible">
              <p
                ref={subtitleSourceRef}
                className="listening-subtitle-source"
                data-qa="listening-subtitle-source"
              >
                <HighlightedText
                  text={currentSegment.text}
                  mappings={currentHighlightMappings}
                  target="source"
                />
              </p>
              <small>{currentSegment.translationKo}</small>
              {currentSegment.noteKo ? <em>{currentSegment.noteKo}</em> : null}
            </div>
          ) : (
            <button
              className="listening-subtitle-hidden"
              type="button"
              onClick={() => setSubtitleVisible(true)}
            >
              {t("listeningLoop.practice.unitHidden", { unit: activeUnitLabel })}
            </button>
          )}
          <div className="listening-save-row">
            <button
              className="button success"
              data-qa="listening-save-segment"
              type="button"
              disabled={isCurrentSaved || isSavingSegment}
              onClick={() => void saveCurrentSegment()}
            >
              {isCurrentSaved ? <BookmarkPlus size={16} /> : <Save size={16} />}
              {isSavingSegment
                ? t("listeningLoop.practice.saveWorking")
                : isCurrentSaved
                  ? t("listeningLoop.practice.saved")
                  : t("listeningLoop.practice.saveSentence")}
            </button>
            <span aria-live="polite" role="status">
              {saveStatus || t("listeningLoop.practice.saveDestination")}
            </span>
          </div>
        </section>
      </section>

      <aside className="panel listening-loop-side">
        <div className="listening-candidate-panel">
          <div className="listening-candidate-head">
            <div>
              <strong>{t("listeningLoop.queue.title")}</strong>
              <small>
                {dailyRoutineSeed
                  ? t("listeningLoop.queue.routineSummary", {
                      videoCount: numberFormatter.format(dailyRoutineQueueCandidates.length),
                      readyCount: numberFormatter.format(dailyRoutineReadyCandidateCount)
                    })
                  : t("listeningLoop.queue.recommendationSummary")}
              </small>
            </div>
            <button
              className="button ghost small"
              data-qa="listening-refresh-candidates"
              type="button"
              disabled={isLoadingCandidates}
              onClick={() => void loadVideoCandidates({ fetchRss: true })}
            >
              <RefreshCw size={14} />
              {t("listeningLoop.queue.refresh")}
            </button>
          </div>
          {candidateStatus ? (
            <p className="listening-candidate-status" aria-live="polite" role="status">
              {candidateStatus}
            </p>
          ) : null}
          {!dailyRoutineSeed ? (
            <>
          <div className="listening-batch-actions">
            <button
              className="button primary small"
              data-qa="listening-batch-transcribe"
              type="button"
              disabled={!isBatchTranscribing && batchCandidates.length === 0}
              onClick={() =>
                isBatchTranscribing
                  ? setBatchModalOpen(true)
                  : void startBatchTranscription("manual")
              }
            >
              {isBatchTranscribing ? <Loader2 className="spin-icon" size={14} /> : <Wand2 size={14} />}
              {isBatchTranscribing
                ? t("listeningLoop.queue.showProgress")
                : t("listeningLoop.queue.createAll")}
            </button>
            <span>
              {t("listeningLoop.counts.remainingCandidates", {
                formattedCount: numberFormatter.format(batchCandidates.length)
              })}
              {batchStartedAt
                ? t("listeningLoop.queue.elapsedRecent", {
                    elapsed: formatDuration((batchFinishedAt ?? batchNow) - batchStartedAt)
                  })
                : ""}
            </span>
          </div>
          <label className="listening-auto-transcribe-toggle">
            <input
              type="checkbox"
              checked={autoTranscribeEnabled}
              onChange={(event) => {
                const enabled = event.currentTarget.checked;
                onSettingsChange({
                  ...settings,
                  listeningLoopBackgroundPrebuildEnabled: enabled
                });
              }}
            />
            <span>
              {t("listeningLoop.queue.backgroundPrebuild")}
              <small>
                {autoTranscribeLastRunDate
                  ? t("listeningLoop.queue.lastAutoRun", {
                      date: formatStoredDate(autoTranscribeLastRunDate)
                    })
                  : t("listeningLoop.queue.autoRunDescription")}
              </small>
            </span>
          </label>
            </>
          ) : null}
          <div className="listening-candidate-list">
            {sideQueueCandidates.map((candidate) => {
              const thumbnailUrl = getCandidateThumbnailUrl(candidate);
              const transcript = transcriptByCandidateId.get(candidate.id);
              const duration = getCandidateDuration(candidate, transcript);
              const durationInfo = getLocalizedCandidateDurationInfo(candidate, transcript);
              return (
                <button
                  className="listening-video-card"
                  key={candidate.id}
                  data-qa="listening-video-card"
                  data-video-id={candidate.videoId}
                  data-candidate-source={candidate.sourceType}
                  data-duration-seconds={duration?.seconds ?? ""}
                  type="button"
                  disabled={transcribingCandidateId === candidate.id}
                  onClick={() => void handleCandidateAction(candidate)}
                >
                  <img alt="" loading="lazy" src={thumbnailUrl} />
                  <div className="listening-video-card-body">
                    <div className="listening-video-card-badges">
                      <span>{getLocalizedCandidateSourceLabel(candidate)}</span>
                      <span
                        className={`listening-duration-chip ${durationInfo.tone}`}
                        data-qa="listening-duration-chip"
                        data-duration-seconds={duration?.seconds ?? ""}
                        title={durationInfo.title}
                      >
                        <Clock size={11} />
                        {durationInfo.label}
                      </span>
                    </div>
                    <strong>{candidate.title}</strong>
                    <small>
                      {candidate.channelName || "YouTube"} · {getLocalizedCandidateWatchLabel(candidate)}
                    </small>
                    <em>
                      {getLocalizedCandidateTranscriptLabel(
                        transcript,
                        transcribingCandidateId === candidate.id
                      )}
                    </em>
                  </div>
                </button>
              );
            })}
            {sideQueueCandidates.length === 0 ? (
              <div className="listening-candidate-empty">
                {t("listeningLoop.queue.empty")}
              </div>
            ) : null}
          </div>
        </div>

        <div className="panel-heading">
          <Youtube size={18} />
          <h2>{t("listeningLoop.queue.recommendations")}</h2>
        </div>
        <div className="listening-seed-list">
          {builtInSeeds.map((seed) => (
            <button
              className={
                activeSeed.id === seed.id ? "listening-video-card active" : "listening-video-card"
              }
              key={seed.id}
              type="button"
              onClick={() => selectSeed(seed)}
            >
              <img alt="" loading="lazy" src={getYouTubeThumbnailUrl(seed.videoId)} />
              <div className="listening-video-card-body">
                <strong>{seed.title}</strong>
                <small>
                  {t("listeningLoop.queue.seedMeta", {
                    channel: seed.channelName,
                    level: seed.levelLabel,
                    formattedCount: numberFormatter.format(seed.segments.length)
                  })}
                </small>
                <span>{seed.recommendedReason}</span>
              </div>
            </button>
          ))}
          {builtInSeeds.length === 0 ? (
            <div className="listening-candidate-empty">
              {t("listeningLoop.queue.noBuiltIn", { language: targetLanguageLabel })}
            </div>
          ) : null}
        </div>
      </aside>
      {batchModalOpen ? (
        <Dialog
          ariaLabel={t("listeningLoop.batch.dialogAria")}
          className="listening-batch-modal"
          backdropClassName="listening-batch-modal-backdrop"
          onClose={() => setBatchModalOpen(false)}
        >
            <div className="listening-batch-modal-head">
              <div>
                <span>
                  <Wand2 size={16} />
                  {t("listeningLoop.batch.kicker")}
                </span>
                <h2>
                  {isBatchTranscribing
                    ? t("listeningLoop.batch.runningTitle")
                    : t("listeningLoop.batch.resultTitle")}
                </h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label={t("common.close")}
                onClick={() => setBatchModalOpen(false)}
              >
                <X size={17} />
              </button>
            </div>

            <div className="listening-batch-summary">
              <div>
                <strong>{numberFormatter.format(batchSummary.done)}</strong>
                <span>{t("listeningLoop.batch.done")}</span>
              </div>
              <div>
                <strong>{numberFormatter.format(batchSummary.running)}</strong>
                <span>{t("listeningLoop.batch.running")}</span>
              </div>
              <div>
                <strong>{numberFormatter.format(batchSummary.failed)}</strong>
                <span>{t("listeningLoop.batch.failed")}</span>
              </div>
              <div>
                <strong>{numberFormatter.format(batchItems.length)}</strong>
                <span>{t("listeningLoop.batch.total")}</span>
              </div>
            </div>

            <div className="listening-batch-list">
              {batchItems.length > 0 ? (
                batchItems.map((item, index) => (
                  <div className={`listening-batch-item ${item.status}`} key={item.candidateId}>
                    <div className="listening-batch-item-icon">
                      {item.status === "done" ? <CheckCircle2 size={17} /> : null}
                      {item.status === "failed" ? <AlertTriangle size={17} /> : null}
                      {item.status === "running" ? <Loader2 className="spin-icon" size={17} /> : null}
                      {item.status === "pending" ? <Clock size={17} /> : null}
                    </div>
                    <div>
                      <strong>
                        {numberFormatter.format(index + 1)}. {item.title}
                      </strong>
                      <small>
                        {t("listeningLoop.batch.itemMeta", {
                          channel: item.channelName || "YouTube",
                          status: getLocalizedBatchStatusLabel(item),
                          elapsed: getLocalizedBatchElapsedLabel(item, batchNow),
                          segments:
                            typeof item.segmentCount === "number"
                              ? t("listeningLoop.batch.segmentSuffix", {
                                  formattedCount: numberFormatter.format(item.segmentCount)
                                })
                              : ""
                        })}
                      </small>
                      {item.message ? <p>{item.message}</p> : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="listening-batch-empty">
                  {t("listeningLoop.batch.empty")}
                </div>
              )}
            </div>

            <div className="listening-batch-footer">
              <span>
                {isBatchTranscribing
                  ? t("listeningLoop.batch.continuesInBackground")
                  : batchStartedAt
                    ? t("listeningLoop.batch.totalElapsed", {
                        elapsed: formatDuration((batchFinishedAt ?? Date.now()) - batchStartedAt)
                      })
                    : t("listeningLoop.batch.waiting")}
              </span>
              <button
                className="button secondary"
                type="button"
                onClick={() => setBatchModalOpen(false)}
              >
                {t("common.close")}
              </button>
            </div>
        </Dialog>
      ) : null}
    </div>
  );
}

function getDailyRoutineStorageKey(profileId: ProfileId, targetLanguageCode: string) {
  return `${ROUTINE_STORAGE_PREFIX}:${profileId}:${targetLanguageCode || "unknown"}`;
}

function getRoutineSentenceTargetStorageKey(profileId: ProfileId, targetLanguageCode: string) {
  return `${ROUTINE_SENTENCE_TARGET_PREFIX}:${profileId}:${targetLanguageCode || "unknown"}`;
}

function getListeningHeardSentencesStorageKey(
  profileId: ProfileId,
  targetLanguageCode: string,
  dateKey: string
) {
  return `${LISTENING_HEARD_SENTENCES_PREFIX}:${profileId}:${targetLanguageCode || "unknown"}:${dateKey}`;
}

function readStoredListeningHeardSentenceKeys(
  profileId: ProfileId,
  targetLanguageCode: string,
  dateKey: string
) {
  if (typeof localStorage === "undefined") {
    return new Set<string>();
  }
  try {
    const raw = localStorage.getItem(
      getListeningHeardSentencesStorageKey(profileId, targetLanguageCode, dateKey)
    );
    if (!raw) {
      return new Set<string>();
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set<string>();
    }
    return new Set(parsed.filter((value): value is string => typeof value === "string"));
  } catch {
    return new Set<string>();
  }
}

function writeStoredListeningHeardSentenceKeys(
  profileId: ProfileId,
  targetLanguageCode: string,
  dateKey: string,
  sentenceKeys: Set<string>
) {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(
    getListeningHeardSentencesStorageKey(profileId, targetLanguageCode, dateKey),
    JSON.stringify([...sentenceKeys].slice(-500))
  );
}

function readStoredListeningLearnedVideoIds(
  profileId: ProfileId,
  targetLanguageCode: string,
  cards: StudyCard[],
  todaySentenceKeys: Set<string>
) {
  const learnedVideoIds = new Set<string>();
  for (const card of cards) {
    addListeningVideoIdFromSourceKey(learnedVideoIds, card.targetText);
  }
  for (const sourceKey of todaySentenceKeys) {
    addListeningVideoIdFromSourceKey(learnedVideoIds, sourceKey);
  }

  if (typeof localStorage === "undefined") {
    return learnedVideoIds;
  }

  const storagePrefix = `${LISTENING_HEARD_SENTENCES_PREFIX}:${profileId}:${
    targetLanguageCode || "unknown"
  }:`;
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(storagePrefix)) {
      continue;
    }
    try {
      const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
      if (!Array.isArray(parsed)) {
        continue;
      }
      for (const sourceKey of parsed) {
        if (typeof sourceKey === "string") {
          addListeningVideoIdFromSourceKey(learnedVideoIds, sourceKey);
        }
      }
    } catch {
      // Ignore old or malformed localStorage entries.
    }
  }

  return learnedVideoIds;
}

function addListeningVideoIdFromSourceKey(videoIds: Set<string>, sourceKey: string | undefined) {
  if (!sourceKey?.startsWith("listening:")) {
    return;
  }
  const withoutPrefix = sourceKey.slice("listening:".length);
  const separatorIndex = withoutPrefix.indexOf(":");
  const videoId = (
    separatorIndex >= 0 ? withoutPrefix.slice(0, separatorIndex) : withoutPrefix
  ).trim();
  if (videoId) {
    videoIds.add(videoId);
  }
}

function readStoredRoutineSentenceTarget(profileId: ProfileId, targetLanguageCode: string) {
  if (typeof localStorage === "undefined") {
    return DAILY_ROUTINE_DEFAULT_SENTENCE_TARGET;
  }
  const storedValue = localStorage.getItem(
    getRoutineSentenceTargetStorageKey(profileId, targetLanguageCode)
  );
  if (!storedValue) {
    return DAILY_ROUTINE_DEFAULT_SENTENCE_TARGET;
  }
  return normalizeRoutineSentenceTarget(storedValue);
}

function writeStoredRoutineSentenceTarget(
  profileId: ProfileId,
  targetLanguageCode: string,
  sentenceTarget: number
) {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(
    getRoutineSentenceTargetStorageKey(profileId, targetLanguageCode),
    String(normalizeRoutineSentenceTarget(sentenceTarget))
  );
}

function readStoredDailyRoutineState(
  profileId: ProfileId,
  targetLanguageCode: string
): DailyRoutineState | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  try {
    const raw = localStorage.getItem(getDailyRoutineStorageKey(profileId, targetLanguageCode));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<DailyRoutineState>;
    if (
      parsed.version !== DAILY_ROUTINE_STORAGE_VERSION ||
      parsed.dateKey !== getLocalDateKey() ||
      parsed.targetLanguageCode !== targetLanguageCode ||
      !parsed.seed ||
      !Array.isArray(parsed.seed.segments) ||
      parsed.seed.segments.length === 0
    ) {
      return null;
    }
    return {
      version: DAILY_ROUTINE_STORAGE_VERSION,
      dateKey: parsed.dateKey,
      targetLanguageCode: parsed.targetLanguageCode,
      partialVideoClipsEnabled: Boolean(parsed.partialVideoClipsEnabled),
      sentenceTargetCount: normalizeRoutineSentenceTarget(parsed.sentenceTargetCount),
      seed: parsed.seed,
      reserveSegments: Array.isArray(parsed.reserveSegments) ? parsed.reserveSegments : [],
      selectedCandidateIds: Array.isArray(parsed.selectedCandidateIds)
        ? parsed.selectedCandidateIds.filter((id): id is string => typeof id === "string")
        : [],
      createdAt: parsed.createdAt || new Date().toISOString()
    };
  } catch {
    return null;
  }
}

function writeStoredDailyRoutineState(
  profileId: ProfileId,
  targetLanguageCode: string,
  state: DailyRoutineState
) {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(
    getDailyRoutineStorageKey(profileId, targetLanguageCode),
    JSON.stringify(state)
  );
}

function normalizeRoutineSentenceTarget(value: unknown) {
  if (typeof value === "string" && value.trim() === "") {
    return DAILY_ROUTINE_DEFAULT_SENTENCE_TARGET;
  }
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return DAILY_ROUTINE_DEFAULT_SENTENCE_TARGET;
  }
  return clamp(
    Math.round(numeric),
    DAILY_ROUTINE_MIN_SENTENCE_TARGET,
    DAILY_ROUTINE_MAX_SENTENCE_TARGET
  );
}

function getListeningYouTubePickerUrl(targetLanguageCode: string, targetLanguageLabel: string) {
  const normalized = normalizeListeningLanguageCode(targetLanguageCode);
  const queryByLanguage: Record<string, string> = {
    en: "English conversation listening practice",
    ja: "日本語 会話 聞き取り",
    ko: "한국어 회화 듣기"
  };
  const query =
    queryByLanguage[normalized] || `${targetLanguageLabel || targetLanguageCode} listening practice`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

function isDailyRoutineSeed(seed: ListeningLoopSeed) {
  return seed.id.startsWith("daily-routine:");
}

function normalizeListeningLanguageCode(languageCode: string | undefined) {
  return String(languageCode ?? "")
    .trim()
    .toLowerCase()
    .split("-")[0];
}

function createEmptyListeningSeed(targetLanguageCode: string): ListeningLoopSeed {
  return {
    id: `empty:${targetLanguageCode || "unknown"}`,
    title: "",
    channelName: "",
    videoId: "",
    languageCode: targetLanguageCode || undefined,
    levelLabel: "",
    topicLabel: "",
    recommendedReason: "",
    segments: []
  };
}

function createEmptyListeningSegment(): ListeningLoopSegment {
  return {
    id: "empty",
    speaker: "",
    start: 0,
    end: 0,
    text: "",
    translationKo: ""
  };
}
