import {
  BookmarkPlus,
  Captions,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  FolderOpen,
  FileVideo,
  Home,
  Languages,
  Link,
  ListVideo,
  Loader2,
  Maximize2,
  Minimize2,
  Mic2,
  Pause,
  Play,
  RotateCcw,
  Scissors,
  ShieldOff,
  Sparkles,
  Subtitles,
  Wand2,
  X,
  Youtube
} from "lucide-react";
import type { TFunction } from "i18next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  UIEvent as ReactUIEvent
} from "react";
import { Dialog } from "../components/Dialog";
import type { LocalEnglishMinerApi } from "../data/api";
import {
  TRANSLATION_CANCEL_COPY,
  useCloudTranslationPreflight
} from "../components/CloudTranslationPreflightDialog";
import type { LLMProvider } from "../services/llm/types";
import "../styles/videoReader.css";
import {
  EMBEDDED_SUBTITLE_SENTENCE_MODEL,
  mergeSubtitleSegmentsIntoSentences,
  usesLegacyEmbeddedSubtitleSegments
} from "../shared/subtitleSegments";
import {
  getTranslationModelName
} from "../shared/translationUsage";
import { isTranslationCancellationError } from "../shared/translationRequestLimits";
import type {
  AppSettings,
  HighlightColorKey,
  HighlightMapping,
  ListeningCardMediaClipInput,
  ListeningTranscript,
  ListeningTranscriptSegment,
  ListeningLocalVideoFile,
  ListeningLocalVideoFolder,
  StudyCardListeningAnnotation,
  ListeningVideoCandidate,
  ProfileId,
  StudyCard
} from "../shared/types";
import { isInteractiveShortcutTarget } from "../shared/shortcutTargets";
import { documentTechnicalError } from "../shared/documentPresentation";
import { calculateVirtualListWindow } from "../shared/virtualList";
import {
  getVideoTranscriptKeyboardIndex,
  getVideoTranscriptScrollTopForIndex,
  VIDEO_TRANSCRIPT_FULLSCREEN_ROW_HEIGHT,
  VIDEO_TRANSCRIPT_OVERSCAN,
  VIDEO_TRANSCRIPT_TIMELINE_ROW_HEIGHT,
  VIDEO_TRANSCRIPT_VIRTUALIZE_THRESHOLD
} from "../shared/videoTranscriptVirtualization";
import { getListeningProsodyLabel as getSharedListeningProsodyLabel } from "../shared/listeningVocabularyPolicy";
import { createListeningLoopInputCard } from "./listeningLoopCardFactory";

type VideoReaderPageProps = {
  api: LocalEnglishMinerApi;
  cards: StudyCard[];
  onCardsChanged: () => Promise<void>;
  profileId: ProfileId;
  provider: LLMProvider;
  settings: AppSettings;
};

type SubtitleMode = "hidden" | "source" | "translation" | "bilingual";
type PlaybackSpeed = 0.75 | 0.9 | 1 | 1.1;
type PlayerMode = "local" | "youtube";
type VideoReaderSideTab = "subtitles" | "playlist" | "settings";
type TranscriptStatusKind = "empty" | "working" | "ready" | "failed";
type SavedVideoFolder = ListeningLocalVideoFolder & {
  id: string;
};
type CaptionWordPopover = {
  word: string;
  normalizedWord: string;
  sourceKey: string;
  segmentId: string;
  x: number;
  y: number;
};
type CaptionTextPart = {
  value: string;
  isWord: boolean;
};
type CaptionHighlightDragState = {
  active: boolean;
  shouldHighlight: boolean;
  touchedKeys: Set<string>;
};
type VideoReaderTranslationProgress = {
  current: number;
  total: number;
  skippedCount: number;
  currentText?: string;
};
type SaveListeningSegmentCardOptions = {
  textToSave: string;
  targetText: string;
  duplicateMessage: string;
  noteLines: string[];
  successMessagePrefix?: string;
};
type VideoReaderResumeSource =
  | {
      mode: "local";
      filePath: string;
      fileName: string;
      title: string;
      folderPath?: string;
      playbackMessage?: string;
    }
  | {
      mode: "youtube";
      videoId: string;
      url: string;
      candidateId?: string;
    };
type VideoReaderResumeSession = {
  profileId: ProfileId;
  source: VideoReaderResumeSource;
  transcript: ListeningTranscript;
  segmentIndex: number;
  playbackTime: number;
  subtitleMode: SubtitleMode;
  videoCovered: boolean;
  loopEnabled: boolean;
  playbackSpeed: PlaybackSpeed;
  updatedAt: string;
};

type YouTubePlayer = {
  loadVideoById(input: { videoId: string; startSeconds?: number; endSeconds?: number }): void;
  cueVideoById?(input: { videoId: string; startSeconds?: number; endSeconds?: number }): void;
  playVideo(): void;
  pauseVideo(): void;
  getCurrentTime(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setPlaybackRate?(rate: number): void;
  unloadModule?(moduleName: string): void;
  setOption?(moduleName: string, option: string, value: unknown): void;
  destroy(): void;
};

type YouTubeWindow = Window & {
  YT?: {
    Player: new (
      element: HTMLElement,
      options: {
        videoId: string;
        width: string;
        height: string;
        playerVars: Record<string, string | number>;
        events: {
          onReady: () => void;
        };
      }
    ) => YouTubePlayer;
  };
  onYouTubeIframeAPIReady?: () => void;
};

const youtubeApiCallbacks: Array<() => void> = [];
const VIDEO_READER_DRAFT_KEY = "lem:videoReader:manualTranscript";
const VIDEO_READER_FOLDERS_KEY_PREFIX = "lem:videoReader:folders";
const VIDEO_READER_RESUME_KEY_PREFIX = "lem:videoReader:resume";
const VIDEO_READER_FULLSCREEN_RAIL_KEY = "lem:videoReader:fullscreenSubtitleRail";
const VIDEO_READER_R_KEY_CONFIRM_KEY = "lem:videoReader:rKeyConfirm";
const VIDEO_READER_SAVE_FRAME_IMAGE_KEY = "lem:videoReader:saveFrameImage";
const VIDEO_READER_VIDEO_ACCEPT = ".mp4,.m4v,.webm,.mkv,.mov,.avi,video/*";
const playbackSpeeds: PlaybackSpeed[] = [0.75, 0.9, 1, 1.1];
const listeningCardHighlightColorKeys: HighlightColorKey[] = [
  "yellow",
  "cyan",
  "orange",
  "green",
  "blue",
  "purple",
  "pink",
  "lime",
  "red",
  "slate"
];

type VideoTranscriptListVariant = "timeline" | "fullscreen";

type VideoTranscriptListProps = {
  activeIndex: number;
  ariaLabel: string;
  formatCount: (value: number) => string;
  formatTimestamp: (seconds: number) => string;
  onSelect: (index: number) => void;
  segments: ListeningTranscriptSegment[];
  variant: VideoTranscriptListVariant;
};

function VideoTranscriptList({
  activeIndex,
  ariaLabel,
  formatCount,
  formatTimestamp,
  onSelect,
  segments,
  variant
}: VideoTranscriptListProps) {
  const rowHeight =
    variant === "fullscreen"
      ? VIDEO_TRANSCRIPT_FULLSCREEN_ROW_HEIGHT
      : VIDEO_TRANSCRIPT_TIMELINE_ROW_HEIGHT;
  const fallbackViewportHeight = variant === "fullscreen" ? 756 : 492;
  const virtualized = segments.length >= VIDEO_TRANSCRIPT_VIRTUALIZE_THRESHOLD;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pendingKeyboardFocusRef = useRef<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(fallbackViewportHeight);
  const virtualWindow = useMemo(
    () =>
      calculateVirtualListWindow({
        itemCount: segments.length,
        rowHeight,
        scrollTop,
        viewportHeight,
        overscan: VIDEO_TRANSCRIPT_OVERSCAN
      }),
    [rowHeight, scrollTop, segments.length, viewportHeight]
  );
  const renderedStartIndex = virtualized ? virtualWindow.startIndex : 0;
  const renderedSegments = virtualized
    ? segments.slice(virtualWindow.startIndex, virtualWindow.endIndex)
    : segments;

  useEffect(() => {
    if (!virtualized) return;
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      if (container.clientHeight > 0) {
        setViewportHeight(container.clientHeight);
      }
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [virtualized]);

  useEffect(() => {
    if (virtualized) return;
    const container = containerRef.current;
    if (container) container.scrollTop = 0;
    setScrollTop(0);
  }, [virtualized]);

  useEffect(() => {
    if (!virtualized) return;
    const container = containerRef.current;
    if (!container) return;
    const nextScrollTop = getVideoTranscriptScrollTopForIndex({
      index: activeIndex,
      itemCount: segments.length,
      rowHeight,
      scrollTop: container.scrollTop,
      viewportHeight
    });
    if (Math.abs(nextScrollTop - container.scrollTop) < 1) return;
    container.scrollTop = nextScrollTop;
    setScrollTop(nextScrollTop);
  }, [activeIndex, rowHeight, segments.length, viewportHeight, virtualized]);

  useEffect(() => {
    const pendingIndex = pendingKeyboardFocusRef.current;
    if (pendingIndex === null) return;
    const button = containerRef.current?.querySelector<HTMLButtonElement>(
      `[data-video-transcript-index="${pendingIndex}"]`
    );
    if (!button) return;
    pendingKeyboardFocusRef.current = null;
    button.focus();
  }, [activeIndex, virtualWindow.endIndex, virtualWindow.startIndex]);

  function handleScroll(event: ReactUIEvent<HTMLDivElement>) {
    if (virtualized) {
      setScrollTop(event.currentTarget.scrollTop);
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!virtualized || event.altKey || event.ctrlKey || event.metaKey) return;
    const nextIndex = getVideoTranscriptKeyboardIndex({
      key: event.key,
      currentIndex: activeIndex,
      itemCount: segments.length,
      pageSize: Math.max(1, Math.floor(viewportHeight / rowHeight))
    });
    if (nextIndex === null) return;
    event.preventDefault();
    if (nextIndex === activeIndex) {
      containerRef.current
        ?.querySelector<HTMLButtonElement>(`[data-video-transcript-index="${nextIndex}"]`)
        ?.focus();
      pendingKeyboardFocusRef.current = null;
      return;
    }
    pendingKeyboardFocusRef.current = nextIndex;
    onSelect(nextIndex);
  }

  const segmentRows = renderedSegments.map((segment, visibleIndex) => {
    const index = renderedStartIndex + visibleIndex;
    const active = index === activeIndex;
    return (
      <div
        aria-posinset={index + 1}
        aria-setsize={segments.length}
        className="video-reader-transcript-list-item"
        key={`${segment.id}:${index}`}
        role="listitem"
        style={virtualized ? { height: rowHeight } : undefined}
      >
        <button
          aria-current={active ? "true" : undefined}
          className={active ? "active" : ""}
          data-video-transcript-index={index}
          tabIndex={virtualized ? (active ? 0 : -1) : undefined}
          type="button"
          onClick={() => onSelect(index)}
        >
          {variant === "fullscreen" ? (
            <>
              <span>{formatTimestamp(segment.start)}</span>
              <strong>{segment.text}</strong>
              {segment.translationKo ? <small>{segment.translationKo}</small> : null}
            </>
          ) : (
            <>
              <span>{formatCount(index + 1)}</span>
              <strong>{segment.text}</strong>
              <small>
                {formatTimestamp(segment.start)} - {formatTimestamp(segment.end)}
              </small>
            </>
          )}
        </button>
      </div>
    );
  });

  return (
    <div
      aria-keyshortcuts={
        virtualized ? "ArrowUp ArrowDown ArrowLeft ArrowRight PageUp PageDown Home End A D" : undefined
      }
      aria-label={ariaLabel}
      className={`video-reader-${variant === "fullscreen" ? "fullscreen-rail-list" : "timeline"}${
        virtualized ? " is-virtualized" : ""
      }`}
      ref={containerRef}
      role="list"
      tabIndex={virtualized ? 0 : undefined}
      onKeyDown={handleKeyDown}
      onScroll={handleScroll}
    >
      {virtualized ? (
        <div
          className="video-reader-transcript-virtual-spacer"
          role="presentation"
          style={{ height: virtualWindow.totalHeight }}
        >
          <div
            className="video-reader-transcript-virtual-window"
            role="presentation"
            style={{ transform: `translateY(${virtualWindow.offsetTop}px)` }}
          >
            {segmentRows}
          </div>
        </div>
      ) : (
        segmentRows
      )}
    </div>
  );
}

export function VideoReaderPage({
  api,
  cards,
  onCardsChanged,
  profileId,
  provider,
  settings
}: VideoReaderPageProps) {
  const { i18n, t } = useTranslation();
  const appLocale = i18n.resolvedLanguage === "en" ? "en-US" : "ko-KR";
  const countFormatter = useMemo(() => new Intl.NumberFormat(appLocale), [appLocale]);
  const timestampFormatters = useMemo(
    () => ({
      minutes: new Intl.NumberFormat(appLocale, { useGrouping: false }),
      seconds: new Intl.NumberFormat(appLocale, {
        minimumIntegerDigits: 2,
        useGrouping: false
      })
    }),
    [appLocale]
  );
  const formatCount = useCallback(
    (value: number) => countFormatter.format(value),
    [countFormatter]
  );
  const formatPlaybackTime = useCallback(
    (seconds: number) => formatTime(seconds, timestampFormatters),
    [timestampFormatters]
  );
  const [playerMode, setPlayerMode] = useState<PlayerMode>("local");
  const [localVideoUrl, setLocalVideoUrl] = useState("");
  const [localVideoName, setLocalVideoName] = useState("");
  const [localVideoPath, setLocalVideoPath] = useState("");
  const [localVideoFolderPath, setLocalVideoFolderPath] = useState("");
  const [localVideoPlaybackMessage, setLocalVideoPlaybackMessage] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeVideoId, setYoutubeVideoId] = useState("");
  const [youtubeCandidate, setYoutubeCandidate] = useState<ListeningVideoCandidate | null>(null);
  const [transcript, setTranscript] = useState<ListeningTranscript>(() =>
    readManualTranscript(t("videoReader.labels.directAdd"))
  );
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [subtitleMode, setSubtitleMode] = useState<SubtitleMode>("hidden");
  const [subtitleBlurred, setSubtitleBlurred] = useState(false);
  const [videoCovered, setVideoCovered] = useState(false);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [shadowingEnabled, setShadowingEnabled] = useState(false);
  const [autoPauseEnabled, setAutoPauseEnabled] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [selectionText, setSelectionText] = useState("");
  const [captionWordPopover, setCaptionWordPopover] = useState<CaptionWordPopover | null>(null);
  const [highlightedCaptionWordKeys, setHighlightedCaptionWordKeys] = useState<Set<string>>(
    () => new Set()
  );
  const [rKeyConfirmEnabled, setRKeyConfirmEnabled] = useState(() =>
    readRKeyConfirmPreference()
  );
  const [saveFrameImageEnabled, setSaveFrameImageEnabled] = useState(() =>
    readSaveFrameImagePreference()
  );
  const [rKeyConfirmOpen, setRKeyConfirmOpen] = useState(false);
  const [videoReaderSideTab, setVideoReaderSideTab] = useState<VideoReaderSideTab>("subtitles");
  const [localPlaylistVideos, setLocalPlaylistVideos] = useState<ListeningLocalVideoFile[]>([]);
  const [isLoadingLocalPlaylist, setIsLoadingLocalPlaylist] = useState(false);
  const [status, setStatus] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isExtractingEmbeddedSubtitle, setIsExtractingEmbeddedSubtitle] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationProgress, setTranslationProgress] = useState<VideoReaderTranslationProgress | null>(null);
  const [translationNotice, setTranslationNotice] = useState("");
  const [technicalDetail, setTechnicalDetail] = useState("");
  const [isSavingCard, setIsSavingCard] = useState(false);
  const [isPreparingLocalVideo, setIsPreparingLocalVideo] = useState(false);
  const [isPlayerFullscreen, setIsPlayerFullscreen] = useState(false);
  const [fullscreenSubtitleRailVisible, setFullscreenSubtitleRailVisible] = useState(() =>
    readFullscreenSubtitleRailPreference()
  );
  const [playerFrameStyle, setPlayerFrameStyle] = useState<CSSProperties>({});
  const [resumeSession, setResumeSession] = useState<VideoReaderResumeSession | null>(() =>
    readVideoReaderResumeSession(profileId)
  );
  const [savedVideoFolders, setSavedVideoFolders] = useState<SavedVideoFolder[]>(() =>
    readStoredVideoFolders(profileId)
  );
  const [savedSessionKeys, setSavedSessionKeys] = useState<Set<string>>(() => new Set());
  const rKeyDialogCancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerShellRef = useRef<HTMLDivElement | null>(null);
  const youtubeHostRef = useRef<HTMLDivElement | null>(null);
  const youtubePlayerRef = useRef<YouTubePlayer | null>(null);
  const shadowResumeTimerRef = useRef<number>(0);
  const localVideoLoadRequestRef = useRef(0);
  const pendingResumeSeekRef = useRef<number | null>(null);
  const embeddedSubtitleAutoCheckKeysRef = useRef<Set<string>>(new Set());
  const manualSegmentSeekUntilRef = useRef(0);
  const shouldResumeAfterCaptionHoverRef = useRef(false);
  const captionHoverInsideRef = useRef(false);
  const translationNoticeTimerRef = useRef(0);
  const activeTranslationJobRef = useRef<{
    requestId: string;
    cancelRequested: boolean;
  } | null>(null);
  const {
    confirmCloudTranslation,
    cloudTranslationPreflightDialog
  } = useCloudTranslationPreflight();
  const translationApiRef = useRef(api.translations);
  translationApiRef.current = api.translations;
  useEffect(() => () => {
    const activeJob = activeTranslationJobRef.current;
    if (!activeJob) return;
    activeJob.cancelRequested = true;
    void translationApiRef.current.cancel(activeJob.requestId).catch(() => false);
  }, []);
  const captionHighlightDragRef = useRef<CaptionHighlightDragState>({
    active: false,
    shouldHighlight: true,
    touchedKeys: new Set()
  });
  const currentSegment = transcript.segments[segmentIndex] ?? null;
  const currentSourceKey = currentSegment
    ? getVideoReaderSourceKey(transcript, currentSegment)
    : "";
  const savedCardsBySourceKey = useMemo(() => {
    const byKey = new Map<string, StudyCard>();
    for (const card of cards) {
      if (card.deckType === "input-listening" && card.targetText?.startsWith("video-reader:")) {
        byKey.set(card.targetText, card);
      }
    }
    return byKey;
  }, [cards]);
  const savedCardKeys = useMemo(() => new Set(savedCardsBySourceKey.keys()), [savedCardsBySourceKey]);
  const currentSavedCard = currentSourceKey ? savedCardsBySourceKey.get(currentSourceKey) : undefined;
  const isCurrentSaved =
    Boolean(currentSourceKey) &&
    ((currentSavedCard ? hasUsableListeningAudio(currentSavedCard) : false) ||
      savedSessionKeys.has(currentSourceKey));
  const captionWordSavedCard = captionWordPopover?.sourceKey
    ? savedCardsBySourceKey.get(captionWordPopover.sourceKey)
    : undefined;
  const isCaptionWordSaved =
    Boolean(captionWordPopover?.sourceKey) &&
    ((captionWordSavedCard ? hasUsableListeningAudio(captionWordSavedCard) : false) ||
      savedSessionKeys.has(captionWordPopover?.sourceKey ?? ""));
  const translationProgressPercent = translationProgress?.total
    ? Math.round((translationProgress.current / translationProgress.total) * 100)
    : 0;
  const selectedTextForCard = selectionText.trim() || currentSegment?.text || "";
  const canUsePlayer = playerMode === "youtube" ? Boolean(youtubeVideoId) : Boolean(localVideoUrl);
  const transcriptStatusKind = getTranscriptStatusKind(transcript, {
    isPreparing: isPreparingLocalVideo,
    isExtracting: isExtractingEmbeddedSubtitle,
    isTranscribing
  });
  const transcriptStatusText = isExtractingEmbeddedSubtitle
    ? t("videoReader.status.embeddedChecking")
    : getTranscriptStatusText(transcript, transcriptStatusKind, t, formatCount);
  const transcriptStatusDetail = getTranscriptStatusDetail(
    transcript,
    transcriptStatusKind,
    isExtractingEmbeddedSubtitle
      ? t("videoReader.status.embeddedSearching")
      : status,
    t
  );
  const localPlaylistIndex = useMemo(
    () =>
      localVideoPath
        ? localPlaylistVideos.findIndex(
            (video) => normalizeLocalPathKey(video.filePath) === normalizeLocalPathKey(localVideoPath)
          )
        : -1,
    [localPlaylistVideos, localVideoPath]
  );
  const previousPlaylistVideo =
    localPlaylistIndex > 0 ? localPlaylistVideos[localPlaylistIndex - 1] : null;
  const nextPlaylistVideo =
    localPlaylistIndex >= 0 && localPlaylistIndex < localPlaylistVideos.length - 1
      ? localPlaylistVideos[localPlaylistIndex + 1]
      : null;
  const targetLanguageName =
    appLocale === "en-US"
      ? settings.learningProfile.targetLanguage.nameEn
      : settings.learningProfile.targetLanguage.nameKo;

  useEffect(() => {
    return () => {
      if (translationNoticeTimerRef.current) {
        window.clearTimeout(translationNoticeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setStatus("");
    setTranslationNotice("");
    setTechnicalDetail("");
  }, [appLocale]);

  useEffect(() => {
    return () => {
      if (localVideoUrl) {
        URL.revokeObjectURL(localVideoUrl);
      }
    };
  }, [localVideoUrl]);

  useEffect(() => {
    setSavedVideoFolders(readStoredVideoFolders(profileId));
    setResumeSession(readVideoReaderResumeSession(profileId));
  }, [profileId]);

  useEffect(() => {
    const shouldRefreshLegacyEmbeddedTranscript = usesLegacyEmbeddedSubtitleSegments(
      transcript.modelName
    );
    if (
      playerMode !== "local" ||
      !localVideoPath ||
      (!shouldRefreshLegacyEmbeddedTranscript && transcript.segments.length > 0) ||
      isPreparingLocalVideo ||
      isExtractingEmbeddedSubtitle ||
      isTranscribing
    ) {
      return;
    }
    const expectedCandidateId = `local-file:${localVideoPath}`;
    if (transcript.candidateId && transcript.candidateId !== expectedCandidateId) {
      return;
    }
    void extractLocalEmbeddedSubtitleForFile(
      localVideoPath,
      transcript.title || localVideoName.replace(/\.[^.]+$/, ""),
      true
    );
  }, [
    playerMode,
    localVideoPath,
    localVideoName,
    transcript.candidateId,
    transcript.modelName,
    transcript.segments.length,
    transcript.title,
    isPreparingLocalVideo,
    isExtractingEmbeddedSubtitle,
    isTranscribing
  ]);

  useEffect(() => {
    const syncFullscreenState = () => {
      const nextIsFullscreen = document.fullscreenElement === playerShellRef.current;
      setIsPlayerFullscreen(nextIsFullscreen);
      void api.app?.setPlayerFullscreen?.(nextIsFullscreen);
    };
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      void api.app?.setPlayerFullscreen?.(false);
    };
  }, [api]);

  useEffect(() => {
    if (!canUsePlayer) {
      setPlayerFrameStyle({});
      return;
    }

    let animationFrame = 0;
    const updatePlayerFrame = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const shell = playerShellRef.current;
        const parent = shell?.parentElement;
        if (!shell || !parent) {
          return;
        }
        const controlDock = parent.querySelector<HTMLElement>(".video-reader-control-dock");
        const controlDockHeight = controlDock?.offsetHeight ?? 0;
        const shellTop = shell.getBoundingClientRect().top;
        const parentWidth = parent.clientWidth;
        const parentAvailableHeight = parent.clientHeight > 0
          ? parent.clientHeight - controlDockHeight - 20
          : Number.POSITIVE_INFINITY;
        const viewportAvailableHeight = window.innerHeight - shellTop - controlDockHeight - 32;
        const availableHeight = Math.max(240, Math.min(parentAvailableHeight, viewportAvailableHeight));
        const nextWidth = Math.max(320, Math.min(parentWidth, availableHeight * (16 / 9)));
        const nextHeight = nextWidth * (9 / 16);
        const width = `${Math.round(nextWidth)}px`;
        const height = `${Math.round(nextHeight)}px`;
        setPlayerFrameStyle((previous) => {
          if (previous.width === width && previous.height === height) {
            return previous;
          }
          return { width, height };
        });
      });
    };

    updatePlayerFrame();
    const parent = playerShellRef.current?.parentElement;
    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(updatePlayerFrame)
      : null;
    if (resizeObserver && parent) {
      resizeObserver.observe(parent);
    }
    window.addEventListener("resize", updatePlayerFrame);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePlayerFrame);
    };
  }, [canUsePlayer, playerMode, localVideoName, youtubeVideoId, transcript.segments.length]);

  useEffect(() => {
    if (playerMode !== "youtube" || !youtubeVideoId) {
      return;
    }

    let cancelled = false;
    void loadYouTubeIframeApi().then(() => {
      if (cancelled || !youtubeHostRef.current) {
        return;
      }
      youtubePlayerRef.current?.destroy();
      const youtubeWindow = window as YouTubeWindow;
      youtubePlayerRef.current = new youtubeWindow.YT!.Player(youtubeHostRef.current, {
        videoId: youtubeVideoId,
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          rel: 0,
          cc_load_policy: 0,
          playsinline: 1
        },
        events: {
          onReady: () => {
            suppressYouTubeCaptions(youtubePlayerRef.current);
            youtubePlayerRef.current?.setPlaybackRate?.(playbackSpeed);
            setIsPlayerReady(true);
          }
        }
      });
    });

    return () => {
      cancelled = true;
      youtubePlayerRef.current?.destroy();
      youtubePlayerRef.current = null;
      setIsPlayerReady(false);
    };
  }, [playerMode, youtubeVideoId]);

  useEffect(() => {
    if (playerMode === "local") {
      const video = videoRef.current;
      if (video) {
        video.playbackRate = playbackSpeed;
      }
      return;
    }
    youtubePlayerRef.current?.setPlaybackRate?.(playbackSpeed);
  }, [playbackSpeed, playerMode]);

  useEffect(() => {
    if (!currentSegment) {
      return;
    }
    clearShadowTimer();
    setSelectionText("");
    setCaptionWordPopover(null);
    setHighlightedCaptionWordKeys(new Set());
    setRKeyConfirmOpen(false);
    shouldResumeAfterCaptionHoverRef.current = false;
    captionHoverInsideRef.current = false;
    endCaptionHighlightDrag();
  }, [currentSegment?.id]);

  useEffect(() => {
    function handleWindowMouseUp() {
      endCaptionHighlightDrag();
    }
    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => window.removeEventListener("mouseup", handleWindowMouseUp);
  }, []);

  useEffect(() => {
    if (!canUsePlayer || transcript.segments.length === 0) {
      return;
    }
    const timer = window.setInterval(() => {
      syncSegmentWithPlaybackTime();
    }, 220);
    return () => window.clearInterval(timer);
  }, [canUsePlayer, playerMode, transcript.segments, isPlaying]);

  useEffect(() => {
    if (!canUsePlayer || pendingResumeSeekRef.current === null) {
      return;
    }
    if (playerMode === "youtube" && !isPlayerReady) {
      return;
    }
    applyPendingResumeSeek();
  }, [canUsePlayer, playerMode, isPlayerReady, localVideoUrl, youtubeVideoId]);

  useEffect(() => {
    if (!canUsePlayer) {
      return;
    }
    writeCurrentResumeSession();
    const timer = window.setInterval(() => {
      writeCurrentResumeSession();
    }, 1500);
    return () => {
      window.clearInterval(timer);
      writeCurrentResumeSession();
    };
  }, [
    canUsePlayer,
    playerMode,
    localVideoPath,
    localVideoName,
    localVideoPlaybackMessage,
    youtubeVideoId,
    youtubeUrl,
    youtubeCandidate?.id,
    transcript,
    segmentIndex,
    subtitleMode,
    videoCovered,
    loopEnabled,
    playbackSpeed
  ]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!currentSegment || (!loopEnabled && !shadowingEnabled && !autoPauseEnabled)) {
        return;
      }
      const currentTime = getCurrentTime();
      if (currentTime < currentSegment.start - 0.5 || currentTime >= currentSegment.end - 0.08) {
        handleSegmentEnd();
      }
    }, 180);
    return () => window.clearInterval(timer);
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        isInteractiveShortcutTarget(event.target)
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (event.key === "Enter" || event.code === "NumpadEnter") {
        event.preventDefault();
        if (event.repeat) {
          return;
        }
        void togglePlayerFullscreen();
        return;
      }
      if (key === "h" || event.key === "Home") {
        event.preventDefault();
        if (event.repeat) {
          return;
        }
        void goToVideoReaderHome();
        return;
      }
      if (key === "a" || event.key === "ArrowLeft") {
        event.preventDefault();
        moveSegment(-1);
        return;
      }
      if (key === "d" || event.key === "ArrowRight") {
        event.preventDefault();
        moveSegment(1);
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        if (event.repeat) {
          return;
        }
        if (autoPauseEnabled && !isPlaying) {
          moveSegment(1);
          return;
        }
        setSubtitleMode((mode) => (mode === "hidden" ? "bilingual" : "hidden"));
        return;
      }
      if (key === "s") {
        event.preventDefault();
        if (event.repeat) {
          return;
        }
        togglePlayback();
        return;
      }
      if (key === "q") {
        event.preventDefault();
        if (event.repeat) {
          return;
        }
        setSubtitleBlurred((value) => !value);
        return;
      }
      if (key === "r") {
        event.preventDefault();
        if (event.repeat) {
          return;
        }
        requestRKeyCardSave();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  function handleSegmentEnd() {
    if (!currentSegment) {
      return;
    }
    if (shadowingEnabled) {
      pausePlayback();
      setStatus(t("videoReader.status.shadowPause"));
      clearShadowTimer();
      shadowResumeTimerRef.current = window.setTimeout(() => {
        replaySegment();
      }, 2600);
      return;
    }
    if (autoPauseEnabled) {
      pausePlayback();
      setStatus(t("videoReader.status.autoPause"));
      return;
    }
    if (loopEnabled) {
      replaySegment();
    }
  }

  async function handleVideoFile(file: File | undefined) {
    if (!file) {
      return;
    }
    setTechnicalDetail("");
    const objectUrl = URL.createObjectURL(file);
    const electronPath = getElectronFilePath(file, api);
    const title = file.name.replace(/\.[^.]+$/, "");
    if (!electronPath) {
      applyLocalVideoFile(
        {
          filePath: "",
          fileName: file.name,
          title,
          fileUrl: objectUrl,
          folderPath: "",
          playbackSource: "original"
        },
        t("videoReader.status.browserFileLoaded")
      );
      return;
    }

    const requestId = localVideoLoadRequestRef.current + 1;
    localVideoLoadRequestRef.current = requestId;
    setIsPreparingLocalVideo(true);
    setStatus(t("videoReader.status.preparingLocalVideo"));
    try {
      const prepared = await api.listening.prepareLocalVideoFile({
        filePath: electronPath,
        fileName: file.name,
        title,
        fileUrl: objectUrl,
        folderPath: getParentFolderPath(electronPath)
      });
      if (localVideoLoadRequestRef.current !== requestId) {
        if (prepared.fileUrl !== objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
        return;
      }
      if (prepared.fileUrl !== objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      applyLocalVideoFile(
        prepared,
        t("videoReader.status.localVideoLoaded")
      );
      void extractLocalEmbeddedSubtitleForFile(prepared.filePath, prepared.title, true);
    } catch (caught) {
      if (localVideoLoadRequestRef.current !== requestId) {
        return;
      }
      setTechnicalDetail(documentTechnicalError(caught));
      applyLocalVideoFile(
        {
          filePath: electronPath,
          fileName: file.name,
          title,
          fileUrl: objectUrl,
          folderPath: getParentFolderPath(electronPath),
          playbackSource: "original"
        },
        t("videoReader.status.localPrepareFailed")
      );
      void refreshLocalVideoPlaylist(getParentFolderPath(electronPath));
    } finally {
      if (localVideoLoadRequestRef.current === requestId) {
        setIsPreparingLocalVideo(false);
      }
    }
  }

  async function pickLocalVideoFile(folderPath?: string) {
    setTechnicalDetail("");
    const requestId = localVideoLoadRequestRef.current + 1;
    localVideoLoadRequestRef.current = requestId;
    setIsPreparingLocalVideo(true);
    setStatus(t("videoReader.status.selectingLocalVideo"));
    try {
      const picked = await api.listening.pickLocalVideoFile(folderPath);
      if (localVideoLoadRequestRef.current !== requestId) {
        return;
      }
      if (!picked) {
        setStatus("");
        return;
      }
      applyLocalVideoFile(picked, t("videoReader.status.localVideoLoaded"));

      void refreshLocalVideoPlaylist(picked.folderPath ?? getParentFolderPath(picked.filePath));

      const candidateId = `local-file:${picked.filePath}`;
      const existingTranscript = await api.listening.getTranscript(candidateId);
      if (
        existingTranscript?.segments.length &&
        isCurrentEmbeddedSubtitleTranscript(existingTranscript.modelName) &&
        !usesLegacyEmbeddedSubtitleSegments(existingTranscript.modelName)
      ) {
        updateTranscript(existingTranscript);
        setSegmentIndex(0);
        setSubtitleMode("source");
        setStatus(t("videoReader.status.savedSubtitleLoaded"));
        return;
      }

      updateTranscript({
        ...transcript,
        id: `transcript:${candidateId}`,
        candidateId,
        videoId: `local:${picked.fileName}`,
        title: picked.title,
        channelName: t("videoReader.labels.localFile"),
        segments: [],
        status: "ready",
        modelName: "manual-local-video",
        updatedAt: new Date().toISOString()
      });
      setSegmentIndex(0);
      if (
        existingTranscript?.segments.length &&
        usesLegacyEmbeddedSubtitleSegments(existingTranscript.modelName)
      ) {
        setStatus(t("videoReader.status.legacySubtitleRebuilding"));
      } else if (existingTranscript?.segments.length) {
        setStatus(t("videoReader.status.existingTranscriptChecking"));
      } else if (existingTranscript) {
        setStatus(t("videoReader.status.emptyTranscriptChecking"));
      }
      void autoExtractEmbeddedSubtitleOrUseExisting(
        picked.filePath,
        picked.title,
        existingTranscript
      );
    } catch (caught) {
      setTechnicalDetail(documentTechnicalError(caught));
      setStatus(t("videoReader.status.localPrepareFailed"));
    } finally {
      if (localVideoLoadRequestRef.current === requestId) {
        setIsPreparingLocalVideo(false);
      }
    }
  }

  async function addVideoFolder() {
    setTechnicalDetail("");
    try {
      const picked = await api.listening.pickLocalVideoFolder();
      if (!picked) {
        return;
      }
      setSavedVideoFolders((previous) => {
        const nextFolder: SavedVideoFolder = {
          ...picked,
          id: getVideoFolderId(picked.folderPath)
        };
        const nextFolders = [
          nextFolder,
          ...previous.filter((folder) => folder.id !== nextFolder.id)
        ].slice(0, 12);
        writeStoredVideoFolders(profileId, nextFolders);
        return nextFolders;
      });
      setLocalVideoFolderPath(picked.folderPath);
      setVideoReaderSideTab("playlist");
      void refreshLocalVideoPlaylist(picked.folderPath);
      setStatus(t("videoReader.status.folderAdded", { name: picked.folderName }));
    } catch (caught) {
      setTechnicalDetail(documentTechnicalError(caught));
      setStatus(t("videoReader.status.playlistLoadFailed"));
    }
  }

  async function refreshLocalVideoPlaylist(folderPath = localVideoFolderPath) {
    const normalizedFolderPath = folderPath.trim();
    if (!normalizedFolderPath) {
      setLocalPlaylistVideos([]);
      return;
    }
    setTechnicalDetail("");
    setIsLoadingLocalPlaylist(true);
    try {
      const videos = await api.listening.listLocalVideoFolderVideos(normalizedFolderPath);
      setLocalPlaylistVideos(videos);
    } catch (caught) {
      setTechnicalDetail(documentTechnicalError(caught));
      setStatus(t("videoReader.status.playlistLoadFailed"));
    } finally {
      setIsLoadingLocalPlaylist(false);
    }
  }

  async function openLocalPlaylistVideo(video: ListeningLocalVideoFile) {
    setTechnicalDetail("");
    const requestId = localVideoLoadRequestRef.current + 1;
    localVideoLoadRequestRef.current = requestId;
    setIsPreparingLocalVideo(true);
    setVideoReaderSideTab("playlist");
    setStatus(t("videoReader.status.playlistOpening"));
    try {
      const prepared = await api.listening.prepareLocalVideoFile(video);
      if (localVideoLoadRequestRef.current !== requestId) {
        return;
      }
      applyLocalVideoFile(
        prepared,
        t("videoReader.status.playlistLoaded")
      );
      void refreshLocalVideoPlaylist(prepared.folderPath ?? getParentFolderPath(prepared.filePath));

      const candidateId = `local-file:${prepared.filePath}`;
      const existingTranscript = await api.listening.getTranscript(candidateId);
      if (
        existingTranscript?.segments.length &&
        isCurrentEmbeddedSubtitleTranscript(existingTranscript.modelName) &&
        !usesLegacyEmbeddedSubtitleSegments(existingTranscript.modelName)
      ) {
        updateTranscript(existingTranscript);
        setSegmentIndex(0);
        setSubtitleMode("source");
        setStatus(t("videoReader.status.savedSubtitleLoaded"));
        return;
      }

      updateTranscript({
        ...transcript,
        id: `transcript:${candidateId}`,
        candidateId,
        videoId: `local:${prepared.fileName}`,
        title: prepared.title,
        channelName: t("videoReader.labels.localFile"),
        segments: [],
        status: "ready",
        modelName: "manual-local-video",
        updatedAt: new Date().toISOString()
      });
      setSegmentIndex(0);
      if (
        existingTranscript?.segments.length &&
        usesLegacyEmbeddedSubtitleSegments(existingTranscript.modelName)
      ) {
        setStatus(t("videoReader.status.legacySubtitleRebuilding"));
      } else if (existingTranscript?.segments.length) {
        setStatus(t("videoReader.status.existingTranscriptChecking"));
      } else if (existingTranscript) {
        setStatus(t("videoReader.status.emptyTranscriptChecking"));
      }
      void autoExtractEmbeddedSubtitleOrUseExisting(prepared.filePath, prepared.title, existingTranscript);
    } catch (caught) {
      setTechnicalDetail(documentTechnicalError(caught));
      setStatus(t("videoReader.status.playlistOpenFailed"));
    } finally {
      if (localVideoLoadRequestRef.current === requestId) {
        setIsPreparingLocalVideo(false);
      }
    }
  }

  async function resumeLastVideo(nextSubtitleMode?: SubtitleMode) {
    setTechnicalDetail("");
    const session = readVideoReaderResumeSession(profileId);
    if (!session) {
      setStatus(t("videoReader.status.noResume"));
      return;
    }
    const nextSegmentIndex = clamp(
      session.segmentIndex,
      0,
      Math.max(0, session.transcript.segments.length - 1)
    );
    const nextPlaybackTime =
      session.playbackTime > 0
        ? session.playbackTime
        : session.transcript.segments[nextSegmentIndex]?.start ?? 0;

    setResumeSession(session);
    setSubtitleMode(getResumeSubtitleMode(session, nextSubtitleMode));
    setVideoCovered(session.videoCovered);
    setLoopEnabled(session.loopEnabled);
    setPlaybackSpeed(session.playbackSpeed);
    pendingResumeSeekRef.current = nextPlaybackTime;

    if (session.source.mode === "youtube") {
      setPlayerMode("youtube");
      setYoutubeUrl(session.source.url);
      setYoutubeVideoId(session.source.videoId);
      setYoutubeCandidate(null);
      setLocalVideoUrl("");
      setLocalVideoName("");
      setLocalVideoPath("");
      setLocalVideoFolderPath("");
      setLocalVideoPlaybackMessage("");
      setLocalPlaylistVideos([]);
      updateTranscript(session.transcript);
      setSegmentIndex(nextSegmentIndex);
      setStatus(
        t("videoReader.status.resume", {
          title: session.transcript.title || t("videoReader.labels.youtube")
        })
      );
      return;
    }

    setIsPreparingLocalVideo(true);
    setStatus(t("videoReader.status.reopeningLocal"));
    try {
      const prepared = await api.listening.prepareLocalVideoFile({
        filePath: session.source.filePath,
        fileName: session.source.fileName,
        title: session.source.title,
        fileUrl: getLocalVideoFileUrl(session.source.filePath),
        folderPath: session.source.folderPath ?? getParentFolderPath(session.source.filePath)
      });
      pendingResumeSeekRef.current = nextPlaybackTime;
      applyLocalVideoFile(
        prepared,
        t("videoReader.status.resume", {
          title: session.transcript.title || session.source.title || session.source.fileName
        })
      );
      void refreshLocalVideoPlaylist(prepared.folderPath ?? getParentFolderPath(prepared.filePath));
      updateTranscript(session.transcript);
      setSegmentIndex(nextSegmentIndex);
    } catch (caught) {
      setTechnicalDetail(documentTechnicalError(caught));
      setStatus(t("videoReader.status.resumeFailed"));
    } finally {
      setIsPreparingLocalVideo(false);
    }
  }

  function applyLocalVideoFile(
    picked: {
      filePath: string;
      fileName: string;
      title: string;
      fileUrl: string;
      folderPath?: string;
      playbackMessage?: string;
      playbackSource?: "original" | "remuxed";
    },
    nextStatus: string
  ) {
    if (localVideoUrl) {
      URL.revokeObjectURL(localVideoUrl);
    }
    setPlayerMode("local");
    setLocalVideoUrl(picked.fileUrl);
    setLocalVideoName(picked.fileName);
    setLocalVideoPath(picked.filePath);
    setLocalVideoFolderPath(picked.folderPath ?? getParentFolderPath(picked.filePath));
    setLocalVideoPlaybackMessage(picked.playbackMessage ?? "");
    setYoutubeVideoId("");
    setYoutubeCandidate(null);
    setTranscript((previous) => ({
      ...previous,
      id: `manual-video:${picked.fileName}:${Date.now()}`,
      candidateId: picked.filePath ? `local-file:${picked.filePath}` : `manual-video:${picked.fileName}`,
      videoId: `local:${picked.fileName}`,
      title: picked.title || picked.fileName.replace(/\.[^.]+$/, ""),
      status: "ready",
      segments: [],
      modelName: "manual-local-video",
      createdAt: new Date().toISOString(),
      channelName: t("videoReader.labels.localFile"),
      updatedAt: new Date().toISOString()
    }));
    setSegmentIndex(0);
    setStatus(nextStatus);
  }

  function buildCurrentResumeSession(playbackTime = getCurrentTime()): VideoReaderResumeSession | null {
    let source: VideoReaderResumeSource | null = null;
    if (playerMode === "local") {
      if (!localVideoPath) {
        return null;
      }
      source = {
        mode: "local",
        filePath: localVideoPath,
        fileName: localVideoName || getVideoFolderNameFromPath(localVideoPath),
        title: transcript.title || localVideoName.replace(/\.[^.]+$/, ""),
        folderPath: localVideoFolderPath || getParentFolderPath(localVideoPath) || undefined,
        playbackMessage: localVideoPlaybackMessage || undefined
      };
    } else if (youtubeVideoId) {
      source = {
        mode: "youtube",
        videoId: youtubeVideoId,
        url: youtubeUrl.trim() || `https://www.youtube.com/watch?v=${youtubeVideoId}`,
        candidateId: youtubeCandidate?.id
      };
    }
    if (!source) {
      return null;
    }
    return {
      profileId,
      source,
      transcript,
      segmentIndex,
      playbackTime: Number.isFinite(playbackTime) ? Math.max(0, playbackTime) : 0,
      subtitleMode,
      videoCovered,
      loopEnabled,
      playbackSpeed,
      updatedAt: new Date().toISOString()
    };
  }

  function writeCurrentResumeSession(playbackTime?: number) {
    const nextPlaybackTime =
      playbackTime ?? pendingResumeSeekRef.current ?? getCurrentTime();
    const session = buildCurrentResumeSession(nextPlaybackTime);
    if (!session) {
      return;
    }
    writeVideoReaderResumeSession(profileId, session);
    setResumeSession(session);
  }

  async function goToVideoReaderHome() {
    if (!canUsePlayer) {
      return;
    }
    const playbackTime = getCurrentTime();
    writeCurrentResumeSession(playbackTime);
    clearShadowTimer();
    setCaptionWordPopover(null);
    setSelectionText("");
    setRKeyConfirmOpen(false);
    shouldResumeAfterCaptionHoverRef.current = false;
    captionHoverInsideRef.current = false;
    pausePlayback();

    try {
      if (document.fullscreenElement === playerShellRef.current) {
        await document.exitFullscreen();
        await api.app?.setPlayerFullscreen?.(false);
      }
    } catch {
      // Home navigation should still work if fullscreen teardown is rejected.
    }

    setPlayerMode("local");
    setLocalVideoUrl("");
    setLocalVideoName("");
    setLocalVideoPath("");
    setLocalVideoFolderPath("");
    setLocalVideoPlaybackMessage("");
    setYoutubeVideoId("");
    setYoutubeCandidate(null);
    setIsPlayerReady(false);
    setStatus(t("videoReader.status.movedHome"));
  }

  async function extractLocalEmbeddedSubtitleForFile(
    filePath = localVideoPath,
    title = transcript.title || localVideoName.replace(/\.[^.]+$/, ""),
    auto = false
  ) {
    setTechnicalDetail("");
    if (!filePath) {
      setStatus(t("videoReader.status.embeddedLocalOnly"));
      return false;
    }
    const autoCheckKey = `${filePath}:${transcript.modelName ?? "no-transcript"}`;
    if (auto && embeddedSubtitleAutoCheckKeysRef.current.has(autoCheckKey)) {
      return false;
    }
    if (auto) {
      embeddedSubtitleAutoCheckKeysRef.current.add(autoCheckKey);
    }
    setIsExtractingEmbeddedSubtitle(true);
    setStatus(
      auto
        ? t("videoReader.status.embeddedAutoChecking")
        : t("videoReader.status.embeddedLoading")
    );
    try {
      const result = await api.listening.extractLocalEmbeddedSubtitle({
        filePath,
        title,
        languageCode: settings.learningProfile.targetLanguage.code
      });
      if (result.transcript?.segments.length) {
        updateTranscript(result.transcript);
        setSegmentIndex(0);
        setSubtitleMode("source");
        setVideoCovered(false);
        setStatus(
          t("videoReader.status.embeddedImported", {
            formattedCount: formatCount(result.transcript.segments.length)
          })
        );
        return true;
      }
      setTechnicalDetail(documentTechnicalError(result.message));
      setStatus(t("videoReader.status.embeddedNotFound"));
      return false;
    } catch (caught) {
      setTechnicalDetail(documentTechnicalError(caught));
      setStatus(t("videoReader.status.embeddedLoadFailed"));
      return false;
    } finally {
      setIsExtractingEmbeddedSubtitle(false);
    }
  }

  async function autoExtractEmbeddedSubtitleOrUseExisting(
    filePath: string,
    title: string,
    existingTranscript: ListeningTranscript | null
  ) {
    const extracted = await extractLocalEmbeddedSubtitleForFile(filePath, title, true);
    if (!extracted && existingTranscript?.segments.length) {
      updateTranscript(existingTranscript);
      setSegmentIndex(0);
      setSubtitleMode("source");
      setStatus(t("videoReader.status.savedFallbackLoaded"));
    }
  }

  async function transcribeLocalVideo() {
    setTechnicalDetail("");
    if (!localVideoPath) {
      setStatus(t("videoReader.status.localWhisperDesktopOnly"));
      return;
    }
    setIsTranscribing(true);
    setStatus(t("videoReader.status.localWhisperRunning"));
    try {
      const result = await api.listening.generateLocalTranscript({
        filePath: localVideoPath,
        title: transcript.title || localVideoName.replace(/\.[^.]+$/, ""),
        languageCode: settings.learningProfile.targetLanguage.code
      });
      if (result.transcript) {
        updateTranscript(result.transcript);
        setSegmentIndex(0);
        if (result.transcript.segments.length) {
          setSubtitleMode("source");
          setVideoCovered(false);
        }
      }
      if (!result.transcript?.segments.length) {
        setTechnicalDetail(documentTechnicalError(result.message));
      }
      setStatus(
        result.transcript?.segments.length
          ? t("videoReader.status.whisperComplete", {
              formattedCount: formatCount(result.transcript.segments.length)
            })
          : t("videoReader.status.whisperNoSegments")
      );
    } catch (caught) {
      setTechnicalDetail(documentTechnicalError(caught));
      setStatus(t("videoReader.status.localWhisperFailed"));
    } finally {
      setIsTranscribing(false);
    }
  }

  async function handleSubtitleFile(file: File | undefined) {
    if (!file) {
      return;
    }
    setTechnicalDetail("");
    try {
      const text = await file.text();
      const segments = parseSubtitleText(text, t("videoReader.labels.speaker"));
      if (segments.length === 0) {
        setStatus(t("videoReader.status.subtitleNoSegments"));
        return;
      }
      updateTranscript({
        ...transcript,
        title: transcript.title || file.name.replace(/\.[^.]+$/, ""),
        segments,
        status: "ready",
        modelName: "imported-subtitle",
        updatedAt: new Date().toISOString()
      });
      setSegmentIndex(0);
      setSubtitleMode("source");
      setStatus(
        t("videoReader.status.subtitleImported", {
          formattedCount: formatCount(segments.length)
        })
      );
    } catch (caught) {
      setTechnicalDetail(documentTechnicalError(caught));
      setStatus(t("videoReader.status.subtitleReadFailed"));
    }
  }

  async function prepareYoutube() {
    setTechnicalDetail("");
    const videoId = getYouTubeVideoId(youtubeUrl);
    if (!videoId) {
      setStatus(t("videoReader.status.invalidYoutube"));
      return;
    }
    try {
      setPlayerMode("youtube");
      setLocalVideoFolderPath("");
      setLocalPlaylistVideos([]);
      setYoutubeVideoId(videoId);
      setStatus(t("videoReader.status.youtubeReady"));
      const candidate = await api.listening.saveVideoCandidate({
        videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: t("videoReader.labels.youtubeTitle", { id: videoId }),
        sourceType: "manual",
        languageCode: settings.learningProfile.targetLanguage.code,
        channelName: t("videoReader.labels.directAdd"),
        collectedAt: new Date().toISOString()
      });
      setYoutubeCandidate(candidate);
      const existingTranscript = await api.listening.getTranscript(candidate.id);
      if (existingTranscript) {
        updateTranscript(existingTranscript);
        setSegmentIndex(0);
        if (existingTranscript.segments.length) {
          setSubtitleMode("source");
          setStatus(t("videoReader.status.savedTranscriptLoaded"));
        } else {
          setStatus(t("videoReader.status.savedTranscriptEmpty"));
        }
      }
    } catch (caught) {
      setTechnicalDetail(documentTechnicalError(caught));
      setStatus(t("videoReader.status.youtubePrepareFailed"));
    }
  }

  async function pasteYoutubeUrlFromClipboard() {
    setTechnicalDetail("");
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText.trim()) {
        setStatus(t("videoReader.status.clipboardEmpty"));
        return;
      }
      setYoutubeUrl(clipboardText.trim());
      setStatus(t("videoReader.status.clipboardReady"));
    } catch (caught) {
      setTechnicalDetail(documentTechnicalError(caught));
      setStatus(t("videoReader.status.clipboardFailed"));
    }
  }

  async function transcribeYoutube() {
    const candidate = youtubeCandidate;
    if (!candidate) {
      await prepareYoutube();
      return;
    }
    setIsTranscribing(true);
    setStatus(t("videoReader.status.whisperRunning"));
    try {
      const result = await api.listening.generateTranscript(candidate.id);
      if (result.transcript) {
        updateTranscript(result.transcript);
        setSegmentIndex(0);
        if (result.transcript.segments.length) {
          setSubtitleMode("source");
          setVideoCovered(false);
        }
      }
      if (!result.transcript?.segments.length) {
        setTechnicalDetail(documentTechnicalError(result.message));
      }
      setStatus(
        result.transcript?.segments.length
          ? t("videoReader.status.whisperComplete", {
              formattedCount: formatCount(result.transcript.segments.length)
            })
          : t("videoReader.status.whisperNoSegments")
      );
    } catch (caught) {
      setTechnicalDetail(documentTechnicalError(caught));
      setStatus(t("videoReader.status.whisperFailed"));
    } finally {
      setIsTranscribing(false);
    }
  }

  function showTranslationNotice(message: string) {
    setTranslationProgress(null);
    setTranslationNotice(message);
    if (translationNoticeTimerRef.current) {
      window.clearTimeout(translationNoticeTimerRef.current);
    }
    translationNoticeTimerRef.current = window.setTimeout(() => {
      setTranslationNotice("");
      translationNoticeTimerRef.current = 0;
    }, 3200);
  }

  async function requestTranslateAllSegments() {
    setTechnicalDetail("");
    if (transcript.segments.length === 0 || isTranslating) {
      if (transcript.segments.length === 0) {
        showTranslationNotice(t("videoReader.translation.noSegments"));
      }
      return;
    }
    const untranslatedSegments = getUntranslatedTranscriptSegments(transcript.segments);
    if (untranslatedSegments.length === 0) {
      setStatus(t("videoReader.translation.alreadyComplete"));
      showTranslationNotice(t("videoReader.translation.alreadyComplete"));
      return;
    }
    const allowed = await confirmCloudTranslation({
      settings,
      providerName: getVideoReaderTranslationProviderName(),
      model: getTranslationModelName(settings),
      operation: "text",
      textGroups: untranslatedSegments.map((segment) => [segment.text]),
      scopeLabel: t("videoReader.cloud.allScope", {
        formattedCount: formatCount(untranslatedSegments.length)
      }),
      dataCategories: [
        t("videoReader.cloud.originalSubtitles"),
        t("videoReader.cloud.languageSettings")
      ],
      sourceLang: transcript.languageCode ?? settings.learningProfile.targetLanguage.code,
      targetLang: settings.learningProfile.nativeLanguage.code
    });
    if (!allowed) {
      setStatus(TRANSLATION_CANCEL_COPY.canceledBeforeStart);
      return;
    }
    setTechnicalDetail("");
    await translateAllSegments();
  }

  function getVideoReaderTranslationProviderName() {
    return settings.translationProviderName === "browser"
      ? "localMt"
      : settings.translationProviderName;
  }

  async function translateAllSegments() {
    if (transcript.segments.length === 0 || isTranslating) {
      return;
    }
    const untranslatedTotal = getUntranslatedTranscriptSegments(transcript.segments).length;
    if (untranslatedTotal === 0) {
      setStatus(t("videoReader.translation.alreadyComplete"));
      showTranslationNotice(t("videoReader.translation.alreadyComplete"));
      return;
    }
    const requestId = crypto.randomUUID();
    const activeJob = { requestId, cancelRequested: false };
    activeTranslationJobRef.current = activeJob;
    setIsTranslating(true);
    setTranslationNotice("");
    setTranslationProgress({
      current: 0,
      total: untranslatedTotal,
      skippedCount: transcript.segments.length - untranslatedTotal
    });
    setStatus(
      t("videoReader.translation.started", {
        formattedTotal: formatCount(untranslatedTotal)
      })
    );
    const translatedSegments = [...transcript.segments];
    let translatedCount = 0;
    try {
      for (let index = 0; index < transcript.segments.length; index += 1) {
        if (activeJob.cancelRequested) {
          break;
        }
        const segment = transcript.segments[index];
        if (segment.translationKo?.trim()) {
          continue;
        }
        setTranslationProgress({
          current: translatedCount,
          total: untranslatedTotal,
          skippedCount: transcript.segments.length - untranslatedTotal,
          currentText: segment.text
        });
        setStatus(
          t("videoReader.translation.running", {
            formattedCurrent: formatCount(translatedCount + 1),
            formattedTotal: formatCount(untranslatedTotal)
          })
        );
        const result = await api.translations.translate({
          requestId,
          text: segment.text,
          sourceLang: transcript.languageCode ?? settings.learningProfile.targetLanguage.code,
          targetLang: settings.learningProfile.nativeLanguage.code,
          providerName:
            getVideoReaderTranslationProviderName(),
          model: getTranslationModelName(settings),
          googleApiKey: settings.googleTranslateApiKey,
          geminiApiKey: settings.geminiApiKey,
          geminiModel: settings.geminiModel,
          geminiPlan: settings.geminiPlan,
          ollamaBaseUrl: settings.ollamaBaseUrl,
          ollamaModel: settings.ollamaModel,
          sourceLanguage: settings.learningProfile.targetLanguage,
          outputLanguage: settings.learningProfile.nativeLanguage
        });
        if (activeJob.cancelRequested) {
          break;
        }
        translatedSegments[index] = {
          ...segment,
          translationKo: result.translatedText
        };
        translatedCount += 1;
        setTranslationProgress({
          current: translatedCount,
          total: untranslatedTotal,
          skippedCount: transcript.segments.length - untranslatedTotal,
          currentText: segment.text
        });
      }
      const nextTranscript = {
        ...transcript,
        segments: translatedSegments,
        updatedAt: new Date().toISOString()
      };
      await persistTranscript(nextTranscript);
      setStatus(
        activeJob.cancelRequested
          ? t("videoReader.translation.canceledSaved", {
              formattedCount: formatCount(translatedCount)
            })
          : t("videoReader.translation.complete")
      );
    } catch (caught) {
      if (activeJob.cancelRequested || isTranslationCancellationError(caught)) {
        activeJob.cancelRequested = true;
        try {
          await persistTranscript({
            ...transcript,
            segments: translatedSegments,
            updatedAt: new Date().toISOString()
          });
          setStatus(
            t("videoReader.translation.canceledSaved", {
              formattedCount: formatCount(translatedCount)
            })
          );
        } catch (persistError) {
          setTechnicalDetail(documentTechnicalError(persistError));
          setStatus(t("videoReader.translation.canceledSaveFailed"));
        }
      } else {
        setTechnicalDetail(documentTechnicalError(caught));
        setStatus(t("videoReader.translation.failed"));
      }
    } finally {
      if (activeTranslationJobRef.current === activeJob) {
        activeTranslationJobRef.current = null;
      }
      setIsTranslating(false);
      setTranslationProgress(null);
    }
  }

  async function stopVideoTranslation() {
    const activeJob = activeTranslationJobRef.current;
    if (!activeJob || activeJob.cancelRequested) return;
    activeJob.cancelRequested = true;
    setStatus(TRANSLATION_CANCEL_COPY.stopping);
    await api.translations.cancel(activeJob.requestId).catch(() => false);
  }

  async function saveCurrentSegmentCard() {
    return saveListeningSegmentCard({
      textToSave: selectedTextForCard,
      targetText: currentSourceKey,
      duplicateMessage: t("videoReader.card.duplicateSentence"),
      noteLines: [
        selectionText
          ? t("videoReader.card.selectionNote", { text: selectionText })
          : t("videoReader.card.wholeSentenceNote")
      ]
    });
  }

  function updateRKeyConfirmPreference(enabled: boolean) {
    setRKeyConfirmEnabled(enabled);
    writeRKeyConfirmPreference(enabled);
    if (!enabled) {
      setRKeyConfirmOpen(false);
    }
  }

  function updateSaveFrameImagePreference(enabled: boolean) {
    setSaveFrameImageEnabled(enabled);
    writeSaveFrameImagePreference(enabled);
  }

  function requestRKeyCardSave() {
    if (!currentSegment || !selectedTextForCard.trim()) {
      void saveCurrentSegmentCard();
      return;
    }
    if (!rKeyConfirmEnabled) {
      void saveCurrentSegmentCard();
      return;
    }
    setCaptionWordPopover(null);
    setRKeyConfirmOpen(true);
  }

  async function confirmRKeyCardSave() {
    const saved = await saveCurrentSegmentCard();
    if (saved) {
      setRKeyConfirmOpen(false);
    }
  }

  async function saveCaptionWordCard() {
    if (!captionWordPopover) {
      return;
    }
    const popover = captionWordPopover;
    const wasAlreadySaved =
      savedCardKeys.has(popover.sourceKey) || savedSessionKeys.has(popover.sourceKey);
    const saved = await saveListeningSegmentCard({
      textToSave: popover.word,
      targetText: popover.sourceKey,
      duplicateMessage: t("videoReader.card.duplicateWord"),
      noteLines: [
        t("videoReader.card.fullSentenceNote", { text: currentSegment?.text ?? "" }),
        t("videoReader.card.contextWordNote", { word: popover.word })
      ],
      successMessagePrefix: t("videoReader.card.savedWordPrefix")
    });
    if (saved || wasAlreadySaved) {
      closeCaptionWordPopover();
    }
  }

  async function buildListeningHighlightMappings(textToSave: string): Promise<HighlightMapping[]> {
    const terms = getListeningHighlightTerms(textToSave);
    if (terms.length === 0) {
      return [];
    }
    const allowed = await confirmCloudTranslation({
      settings,
      providerName: getVideoReaderTranslationProviderName(),
      model: getTranslationModelName(settings),
      operation: "text",
      textGroups: terms.map((term) => [term]),
      scopeLabel: t("videoReader.cloud.highlightScope", {
        formattedCount: formatCount(terms.length)
      }),
      dataCategories: [
        t("videoReader.cloud.selectedExpressions"),
        t("videoReader.cloud.languageSettings")
      ],
      sourceLang: transcript.languageCode ?? settings.learningProfile.targetLanguage.code,
      targetLang: settings.learningProfile.nativeLanguage.code
    });
    if (!allowed) {
      return terms.map((sourceText, index) => ({
        sourceText,
        colorKey: listeningCardHighlightColorKeys[index % listeningCardHighlightColorKeys.length]
      }));
    }
    const requestId = crypto.randomUUID();
    const mappings: HighlightMapping[] = [];
    for (let index = 0; index < terms.length; index += 1) {
      const sourceText = terms[index];
      const meaningAnchor = await translateListeningHighlightTerm(sourceText, requestId);
      mappings.push({
        sourceText,
        literalKo: meaningAnchor,
        naturalKo: meaningAnchor,
        colorKey: listeningCardHighlightColorKeys[index % listeningCardHighlightColorKeys.length]
      });
    }
    return mappings;
  }

  function getListeningHighlightTerms(textToSave: string) {
    const normalizedTextToSave = normalizeListeningHighlightKey(textToSave);
    const terms: string[] = [];
    const parts = currentSegment ? splitCaptionTextIntoParts(currentSegment.text) : [];

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      if (!part.isWord || !highlightedCaptionWordKeys.has(getCaptionWordHighlightKey(index))) {
        continue;
      }
      const term = normalizeCaptionWordForDisplay(part.value);
      if (!term || !normalizedTextToSave.includes(normalizeListeningHighlightKey(term))) {
        continue;
      }
      terms.push(term);
    }

    if (!terms.length && selectionText.trim()) {
      const selected = selectionText.trim();
      if (normalizedTextToSave.includes(normalizeListeningHighlightKey(selected))) {
        terms.push(selected);
      }
    }

    if (!terms.length && textToSave.trim() && textToSave.trim() !== currentSegment?.text.trim()) {
      terms.push(textToSave.trim());
    }

    return uniqueListeningHighlightTerms(terms).slice(0, listeningCardHighlightColorKeys.length);
  }

  async function translateListeningHighlightTerm(sourceText: string, requestId: string) {
    const translationText = currentSegment?.translationKo?.trim() ?? "";
    const directMatch = findMeaningAnchor(translationText, sourceText);
    if (directMatch) {
      return directMatch;
    }
    if (!translationText) {
      return undefined;
    }
    try {
      const result = await api.translations.translate({
        requestId,
        text: sourceText,
        sourceLang: transcript.languageCode ?? settings.learningProfile.targetLanguage.code,
        targetLang: settings.learningProfile.nativeLanguage.code,
        providerName:
          settings.translationProviderName === "browser"
            ? "localMt"
            : settings.translationProviderName,
        model: getTranslationModelName(settings),
        googleApiKey: settings.googleTranslateApiKey,
        geminiApiKey: settings.geminiApiKey,
        geminiModel: settings.geminiModel,
        geminiPlan: settings.geminiPlan,
        ollamaBaseUrl: settings.ollamaBaseUrl,
        ollamaModel: settings.ollamaModel,
        sourceLanguage: settings.learningProfile.targetLanguage,
        outputLanguage: settings.learningProfile.nativeLanguage
      });
      return findMeaningAnchor(translationText, result.translatedText) ?? result.translatedText.trim();
    } catch {
      return undefined;
    }
  }

  function buildListeningAnnotations(
    textToSave: string,
    mappings: HighlightMapping[]
  ): StudyCardListeningAnnotation[] {
    const normalizedTextToSave = normalizeListeningHighlightKey(textToSave);
    return mappings
      .filter((mapping) =>
        normalizedTextToSave.includes(normalizeListeningHighlightKey(mapping.sourceText))
      )
      .slice(0, 5)
      .map((mapping) => {
        const mark = inferListeningProsodyMark(mapping.sourceText);
        return {
          anchorText: mapping.sourceText,
          mark,
          label: getSharedListeningProsodyLabel(
            mapping.sourceText,
            mark,
            currentSegment?.text ?? ""
          ),
          confidence: 0.68
        };
      });
  }

  async function saveListeningSegmentCard({
    textToSave,
    targetText,
    duplicateMessage,
    noteLines,
    successMessagePrefix = t("videoReader.card.savedPrefix")
  }: SaveListeningSegmentCardOptions) {
    if (isSavingCard) {
      return false;
    }
    setTechnicalDetail("");
    const normalizedTextToSave = textToSave.trim();
    const existingCard = targetText ? savedCardsBySourceKey.get(targetText) : undefined;
    const existingCardHasAudio = existingCard ? hasUsableListeningAudio(existingCard) : false;
    if (targetText && (existingCardHasAudio || savedSessionKeys.has(targetText))) {
      setStatus(duplicateMessage);
      return false;
    }
    if (!currentSegment || !normalizedTextToSave || !targetText) {
      setStatus(t("videoReader.card.noCaption"));
      return false;
    }
    setIsSavingCard(true);
    try {
      setStatus(t("videoReader.card.preparingHighlights"));
      const highlightMappings = await buildListeningHighlightMappings(normalizedTextToSave);
      const listeningAnnotations = buildListeningAnnotations(normalizedTextToSave, highlightMappings);
      const now = new Date();
      const baseStructureNoteLines = [
        t("videoReader.card.noteVideo", { title: transcript.title }),
        t("videoReader.card.noteSpeaker", { speaker: currentSegment.speaker }),
        t("videoReader.card.noteRange", {
          start: formatPlaybackTime(currentSegment.start),
          end: formatPlaybackTime(currentSegment.end)
        }),
        ...noteLines
      ];
      const sourceLanguageCode =
        transcript.languageCode ?? settings.learningProfile.targetLanguage.code;
      const videoTitle = transcript.title || localVideoName.replace(/\.[^.]+$/, "");
      const channelName =
        transcript.channelName ||
        youtubeCandidate?.channelName ||
        (playerMode === "local"
          ? t("videoReader.labels.localFile")
          : t("videoReader.labels.youtube"));
      const readerTextContext = [
        transcript.segments[segmentIndex - 1]?.text,
        currentSegment.text,
        transcript.segments[segmentIndex + 1]?.text
      ]
        .filter(Boolean)
        .join("\n");
      const generatedCard = await createListeningLoopInputCard({
        provider,
        profileId,
        settings,
        segment: {
          ...currentSegment,
          translationKo: currentSegment.translationKo ?? "",
          sourceTitle: videoTitle,
          sourceChannelName: channelName,
          sourceLanguageCode
        },
        sourceKey: targetText,
        sourceLanguageCode,
        targetLanguageCode: settings.learningProfile.targetLanguage.code,
        nativeLanguageCode: settings.learningProfile.nativeLanguage.code,
        videoTitle,
        channelName,
        highlightMappings,
        structureNote: baseStructureNoteLines.join("\n"),
        beforeSentence: transcript.segments[segmentIndex - 1]?.text,
        afterSentence: transcript.segments[segmentIndex + 1]?.text,
        readerTextContext,
        now
      });
      const card: StudyCard = {
        ...generatedCard,
        id: existingCard?.id ?? generatedCard.id,
        srs: existingCard?.srs ?? generatedCard.srs,
        createdAt: existingCard?.createdAt ?? generatedCard.createdAt,
        updatedAt: now.toISOString(),
        ...(listeningAnnotations.length ? { listeningAnnotations } : {})
      };

      setStatus(t("videoReader.card.preparingMedia"));
      const mediaResult = await createListeningCardMediaForCurrentSegment(card.id);
      if (mediaResult.media) {
        card.listeningMedia = mediaResult.media;
      } else {
        card.structureNote = [
          ...baseStructureNoteLines,
          t("videoReader.card.noteOriginalAudio", {
            message: mediaResult.message || t("videoReader.card.generationFailed")
          })
        ].join("\n");
      }
      setStatus(t("videoReader.card.saving"));
      await api.cards.save(card, profileId);
      if (mediaResult.media) {
        setSavedSessionKeys((previous) => {
          const next = new Set(previous);
          next.add(targetText);
          return next;
        });
      }
      setStatus(
        `${successMessagePrefix}: ${formatStatusSnippet(normalizedTextToSave)}${
          mediaResult.message ? ` · ${mediaResult.message}` : ""
        }`
      );
      try {
        await onCardsChanged();
      } catch (caught) {
        setTechnicalDetail(documentTechnicalError(caught));
        setStatus(t("videoReader.card.refreshFailed"));
      }
      return true;
    } catch (caught) {
      setTechnicalDetail(documentTechnicalError(caught));
      setStatus(t("videoReader.card.saveFailed"));
      return false;
    } finally {
      setIsSavingCard(false);
    }
  }

  async function createListeningCardMediaForCurrentSegment(cardId: string) {
    const input = buildListeningCardMediaClipInput(cardId);
    if (!input) {
      return {
        media: undefined,
        message: currentSegment
          ? t("videoReader.card.noOriginalSource")
          : ""
      };
    }
    const createMediaClip = api.listening.createListeningCardMediaClip;
    if (typeof createMediaClip !== "function") {
      return {
        media: undefined,
        message: t("videoReader.card.outdatedDesktop")
      };
    }
    try {
      const result = await createMediaClip(input);
      if (result.ok && result.media) {
        return {
          media: result.media,
          message: result.media.frameImage
            ? t("videoReader.card.audioAndFrameSaved")
            : t("videoReader.card.audioSaved")
        };
      }
      setTechnicalDetail(documentTechnicalError(result.message));
      return {
        media: undefined,
        message: t("videoReader.card.noOriginalAudio", {
          message: t("videoReader.card.generationFailed")
        })
      };
    } catch (caught) {
      setTechnicalDetail(documentTechnicalError(caught));
      return {
        media: undefined,
        message: t("videoReader.card.noOriginalAudio", {
          message: t("videoReader.card.generationFailed")
        })
      };
    }
  }

  function buildListeningCardMediaClipInput(cardId: string): ListeningCardMediaClipInput | null {
    if (!currentSegment) {
      return null;
    }
    const transcriptAudioPath = transcript.audioPath?.trim() ?? "";
    const localSourcePath =
      localVideoPath.trim() ||
      getLocalFilePathFromTranscriptCandidateId(transcript.candidateId) ||
      (resumeSession?.source.mode === "local" ? resumeSession.source.filePath : "");
    const sourcePath = transcriptAudioPath || localSourcePath;
    if (!sourcePath) {
      return null;
    }

    const isYoutubeAudioSource = playerMode === "youtube" && Boolean(transcriptAudioPath);
    return {
      profileId,
      cardId,
      sourcePath,
      frameSourcePath: localSourcePath || undefined,
      sourceType: isYoutubeAudioSource
        ? "youtube-audio"
        : transcriptAudioPath
          ? "transcript-audio"
          : "local-video",
      start: currentSegment.start,
      end: currentSegment.end,
      includeFrameImage: saveFrameImageEnabled && Boolean(localSourcePath)
    };
  }

  function updateTranscript(nextTranscript: ListeningTranscript) {
    setTranscript(nextTranscript);
    writeManualTranscript(nextTranscript);
  }

  async function persistTranscript(nextTranscript: ListeningTranscript) {
    const saved =
      nextTranscript.candidateId.startsWith("manual-video:") ||
      nextTranscript.candidateId === "manual-video-reader"
        ? nextTranscript
        : await api.listening.saveTranscript(nextTranscript);
    updateTranscript(saved);
  }

  function moveSegment(step: number) {
    selectSegment(segmentIndex + step);
  }

  function selectSegment(index: number, options: { seek?: boolean; play?: boolean } = {}) {
    const nextIndex = clamp(index, 0, Math.max(0, transcript.segments.length - 1));
    const nextSegment = transcript.segments[nextIndex];
    setSegmentIndex(nextIndex);
    if (options.seek === false || !nextSegment) {
      return;
    }
    manualSegmentSeekUntilRef.current = Date.now() + 500;
    seekToSegment(nextSegment, options.play ?? isPlaying);
  }

  function seekToSegment(segment: ListeningTranscriptSegment, shouldPlay: boolean) {
    if (playerMode === "youtube") {
      if (youtubePlayerRef.current && isPlayerReady) {
        if (shouldPlay) {
          youtubePlayerRef.current.loadVideoById({
            videoId: youtubeVideoId,
            startSeconds: segment.start,
            endSeconds: segment.end
          });
        } else if (youtubePlayerRef.current.cueVideoById) {
          youtubePlayerRef.current.cueVideoById({
            videoId: youtubeVideoId,
            startSeconds: segment.start,
            endSeconds: segment.end
          });
        } else {
          youtubePlayerRef.current.seekTo(segment.start, true);
        }
        suppressYouTubeCaptions(youtubePlayerRef.current);
        youtubePlayerRef.current.setPlaybackRate?.(playbackSpeed);
        if (!shouldPlay) {
          youtubePlayerRef.current.pauseVideo();
        } else {
          youtubePlayerRef.current.playVideo();
        }
      }
      setIsPlaying(shouldPlay);
      return;
    }
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.currentTime = segment.start;
    if (shouldPlay) {
      void video.play();
    } else {
      video.pause();
    }
    setIsPlaying(shouldPlay);
  }

  function syncSegmentWithPlaybackTime(seconds = getCurrentTime()) {
    if (!isPlaying) {
      return;
    }
    if (Date.now() < manualSegmentSeekUntilRef.current) {
      return;
    }
    const nextIndex = findSegmentIndexAtTime(transcript.segments, seconds);
    if (nextIndex < 0) {
      return;
    }
    setSegmentIndex((previous) => (previous === nextIndex ? previous : nextIndex));
  }

  function replaySegment() {
    if (!currentSegment) {
      return;
    }
    seekTo(currentSegment.start);
    playPlayback();
  }

  function playPlayback() {
    if (playerMode === "youtube") {
      youtubePlayerRef.current?.playVideo();
    } else {
      void videoRef.current?.play();
    }
    setIsPlaying(true);
  }

  function pausePlayback() {
    if (playerMode === "youtube") {
      youtubePlayerRef.current?.pauseVideo();
    } else {
      videoRef.current?.pause();
    }
    setIsPlaying(false);
  }

  function togglePlayback() {
    if (isPlaying) {
      pausePlayback();
    } else {
      playPlayback();
    }
  }

  async function togglePlayerFullscreen() {
    const playerShell = playerShellRef.current;
    if (!playerShell) {
      return;
    }
    setTechnicalDetail("");
    try {
      if (document.fullscreenElement === playerShell) {
        await document.exitFullscreen();
        await api.app?.setPlayerFullscreen?.(false);
        return;
      }
      await playerShell.requestFullscreen();
      setIsPlayerFullscreen(true);
      await api.app?.setPlayerFullscreen?.(true);
    } catch (caught) {
      setTechnicalDetail(documentTechnicalError(caught));
      setStatus(t("videoReader.status.fullscreenFailed"));
    }
  }

  function updateFullscreenSubtitleRailPreference(nextVisible: boolean) {
    setFullscreenSubtitleRailVisible(nextVisible);
    writeFullscreenSubtitleRailPreference(nextVisible);
  }

  function seekTo(seconds: number) {
    if (playerMode === "youtube") {
      youtubePlayerRef.current?.seekTo(seconds, true);
    } else if (videoRef.current) {
      videoRef.current.currentTime = seconds;
    }
  }

  function applyPendingResumeSeek() {
    const seconds = pendingResumeSeekRef.current;
    if (seconds === null) {
      return;
    }
    if (playerMode === "youtube" && !isPlayerReady) {
      return;
    }
    seekTo(seconds);
    pendingResumeSeekRef.current = null;
  }

  function getCurrentTime() {
    if (playerMode === "youtube") {
      return youtubePlayerRef.current?.getCurrentTime() ?? 0;
    }
    return videoRef.current?.currentTime ?? 0;
  }

  function handleCaptionMouseEnter() {
    captionHoverInsideRef.current = true;
    if (isPlaying) {
      shouldResumeAfterCaptionHoverRef.current = true;
      pausePlayback();
    }
  }

  function handleCaptionMouseLeave() {
    captionHoverInsideRef.current = false;
    endCaptionHighlightDrag();
    if (captionWordPopover) {
      return;
    }
    resumeCaptionHoverPlaybackIfNeeded();
  }

  function resumeCaptionHoverPlaybackIfNeeded() {
    if (!shouldResumeAfterCaptionHoverRef.current) {
      return;
    }
    shouldResumeAfterCaptionHoverRef.current = false;
    playPlayback();
  }

  function closeCaptionWordPopover() {
    setCaptionWordPopover(null);
    resumeCaptionHoverPlaybackIfNeeded();
  }

  function beginCaptionHighlightDrag(event: ReactMouseEvent<HTMLSpanElement>, index: number) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    window.getSelection?.()?.removeAllRanges();
    setCaptionWordPopover(null);
    setSelectionText("");
    const key = getCaptionWordHighlightKey(index);
    const shouldHighlight = !highlightedCaptionWordKeys.has(key);
    captionHighlightDragRef.current = {
      active: true,
      shouldHighlight,
      touchedKeys: new Set([key])
    };
    setCaptionWordHighlightState(key, shouldHighlight);
  }

  function updateCaptionHighlightDrag(event: ReactMouseEvent<HTMLSpanElement>, index: number) {
    const dragState = captionHighlightDragRef.current;
    if (!dragState.active || (event.buttons & 1) !== 1) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const key = getCaptionWordHighlightKey(index);
    if (dragState.touchedKeys.has(key)) {
      return;
    }
    dragState.touchedKeys.add(key);
    setCaptionWordHighlightState(key, dragState.shouldHighlight);
  }

  function endCaptionHighlightDrag() {
    const dragState = captionHighlightDragRef.current;
    if (!dragState.active) {
      return;
    }
    dragState.active = false;
    dragState.touchedKeys.clear();
  }

  function setCaptionWordHighlightState(highlightKey: string, shouldHighlight: boolean) {
    setHighlightedCaptionWordKeys((previous) => {
      if (shouldHighlight === previous.has(highlightKey)) {
        return previous;
      }
      const next = new Set(previous);
      if (shouldHighlight) {
        next.add(highlightKey);
      } else {
        next.delete(highlightKey);
      }
      return next;
    });
  }

  function handleCaptionWordContextMenu(
    event: ReactMouseEvent<HTMLSpanElement>,
    rawWord: string
  ) {
    event.preventDefault();
    event.stopPropagation();
    if (!currentSegment || !currentSourceKey) {
      return;
    }
    openCaptionWordMenu(rawWord, event.clientX + 8, event.clientY + 8);
  }

  function openCaptionWordMenu(rawWord: string, requestedX: number, requestedY: number) {
    if (!currentSegment || !currentSourceKey) {
      return;
    }
    const word = normalizeCaptionWordForDisplay(rawWord);
    const normalizedWord = normalizeCaptionWordForKey(word);
    if (!word || !normalizedWord) {
      return;
    }
    const popoverWidth = 220;
    const popoverHeight = 112;
    setCaptionWordPopover({
      word,
      normalizedWord,
      sourceKey: getVideoReaderWordSourceKey(currentSourceKey, normalizedWord),
      segmentId: currentSegment.id,
      x: clamp(requestedX, 12, Math.max(12, window.innerWidth - popoverWidth - 12)),
      y: clamp(requestedY, 12, Math.max(12, window.innerHeight - popoverHeight - 12))
    });
  }

  function handleCaptionWordKeyDown(
    event: ReactKeyboardEvent<HTMLSpanElement>,
    rawWord: string,
    index: number
  ) {
    if (event.key === "Enter") {
      event.preventDefault();
      const key = getCaptionWordHighlightKey(index);
      setCaptionWordHighlightState(key, !highlightedCaptionWordKeys.has(key));
      return;
    }
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      const bounds = event.currentTarget.getBoundingClientRect();
      openCaptionWordMenu(rawWord, bounds.left, bounds.bottom + 8);
    }
  }

  function renderInteractiveCaptionText(text: string) {
    return splitCaptionTextIntoParts(text).map((part, index) =>
      part.isWord ? (() => {
        const highlightKey = getCaptionWordHighlightKey(index);
        return (
           <span
            aria-label={t("videoReader.caption.wordAction", {
              word: normalizeCaptionWordForDisplay(part.value)
            })}
            aria-pressed={highlightedCaptionWordKeys.has(highlightKey)}
            className={`video-reader-caption-word${
              highlightedCaptionWordKeys.has(highlightKey) ? " is-highlighted" : ""
            }`}
            key={`${part.value}-${index}`}
            onContextMenu={(event) => handleCaptionWordContextMenu(event, part.value)}
            onKeyDown={(event) => handleCaptionWordKeyDown(event, part.value, index)}
            onMouseDown={(event) => beginCaptionHighlightDrag(event, index)}
            onMouseEnter={(event) => updateCaptionHighlightDrag(event, index)}
            role="button"
            tabIndex={0}
            title={t("videoReader.shortcuts.wordKeyboard")}
          >
            {part.value}
          </span>
        );
      })() : (
        <span className="video-reader-caption-gap" key={`${part.value}-${index}`}>
          {part.value}
        </span>
      )
    );
  }

  function clearShadowTimer() {
    if (shadowResumeTimerRef.current) {
      window.clearTimeout(shadowResumeTimerRef.current);
      shadowResumeTimerRef.current = 0;
    }
  }

  const hasResumeDraft = Boolean(resumeSession);
  const resumeTitle =
    resumeSession?.transcript.title || t("videoReader.home.noResumeTitle");
  const resumeSubtitle = resumeSession
    ? getVideoReaderResumeSubtitle(
        resumeSession,
        t,
        formatCount,
        formatPlaybackTime
      )
    : t("videoReader.home.noResumeDescription");
  const resumeProgressWidth = resumeSession ? getVideoReaderResumeProgressWidth(resumeSession) : "0%";
  const technicalErrorDisclosure = technicalDetail ? (
    <details className="video-reader-technical-details">
      <summary>{t("videoReader.errorPanel.technicalSummary")}</summary>
      <p>{t("videoReader.errorPanel.technicalDescription")}</p>
      <code>{technicalDetail}</code>
    </details>
  ) : null;
  const translationFeedbackOverlay = translationProgress ? (
    <div className="video-reader-translation-overlay" role="presentation">
      <div
        aria-label={t("videoReader.aria.translationStatus")}
        aria-live="polite"
        className="video-reader-translation-panel progress"
        role="status"
      >
        <div>
          <strong>
            {t("videoReader.translation.progressTitle", {
              formattedCurrent: formatCount(translationProgress.current),
              formattedTotal: formatCount(translationProgress.total)
            })}
          </strong>
          <span>
            {translationProgress.currentText
              ? formatStatusSnippet(translationProgress.currentText)
              : t("videoReader.translation.preparing")}
          </span>
        </div>
        <div
          className="video-reader-translation-progress-track"
          aria-label={t("videoReader.translation.progressAria", {
            percent: formatCount(translationProgressPercent)
          })}
        >
          <span style={{ width: `${translationProgressPercent}%` }} />
        </div>
        <small>
          {translationProgress.skippedCount > 0
            ? t("videoReader.translation.skipped", {
                formattedCount: formatCount(translationProgress.skippedCount)
              })
            : t("videoReader.translation.applyWhenDone")}
        </small>
        <button
          className="button secondary small"
          type="button"
          onClick={() => void stopVideoTranslation()}
        >
          <X size={14} />
          {TRANSLATION_CANCEL_COPY.stop}
        </button>
      </div>
    </div>
  ) : translationNotice ? (
    <div className="video-reader-translation-overlay" role="presentation">
      <div
        aria-label={t("videoReader.aria.translationStatus")}
        aria-live="assertive"
        className="video-reader-translation-panel notice"
        role="alert"
      >
        <div>
          <strong>{translationNotice}</strong>
          <span>{t("videoReader.translation.retryHint")}</span>
        </div>
      </div>
    </div>
  ) : null;

  if (!canUsePlayer) {
    return (
      <div className="video-reader-page video-reader-home-page">
        <section className="panel video-reader-home-main">
          <div className="video-reader-header video-reader-home-header">
            <div>
              <span className="section-kicker">
                <FileVideo size={16} />
                {t("videoReader.pageTitle")}
              </span>
              <h1>{t("videoReader.homeTitle")}</h1>
              <p>{t("videoReader.homeDescription")}</p>
            </div>
            <span className="video-reader-counter">{targetLanguageName}</span>
          </div>

          <section
            aria-label={t("videoReader.aria.launch")}
            className="video-reader-launch-panel"
          >
            <label className="video-reader-launch-tile primary" data-qa="video-reader-file-button">
              <span className="video-reader-launch-icon">
                <FileVideo size={26} />
              </span>
              <strong>{t("videoReader.actions.openFile")}</strong>
              <small>{t("videoReader.home.fileDescription")}</small>
              <span className="video-reader-launch-action">
                {isPreparingLocalVideo ? <Loader2 className="spin-icon" size={16} /> : <FileVideo size={16} />}
                {t("videoReader.actions.chooseLocalVideo")}
              </span>
              <input
                accept={VIDEO_READER_VIDEO_ACCEPT}
                data-qa="video-reader-file-input"
                type="file"
                onChange={(event) => void handleVideoFile(event.target.files?.[0])}
              />
            </label>

            <div className="video-reader-launch-tile">
              <span className="video-reader-launch-icon youtube">
                <Youtube size={27} />
              </span>
              <strong>{t("videoReader.actions.openYoutube")}</strong>
              <small>{t("videoReader.home.youtubeDescription")}</small>
              <div className="video-reader-youtube-home-row">
                <input
                  className="text-input"
                  data-qa="video-reader-youtube-url"
                  aria-label={t("videoReader.actions.openYoutube")}
                  placeholder={t("videoReader.home.youtubePlaceholder")}
                  value={youtubeUrl}
                  onChange={(event) => setYoutubeUrl(event.target.value)}
                />
                <button
                  className="button primary"
                  data-qa="video-reader-youtube-load"
                  type="button"
                  onClick={() => void prepareYoutube()}
                >
                  {t("videoReader.actions.open")}
                </button>
              </div>
            </div>
          </section>

          <div className="video-reader-utility-row">
            <label className="button secondary video-reader-file-button" data-qa="video-reader-subtitle-button">
              <Subtitles size={16} />
              {t("videoReader.actions.subtitleFile")}
              <input
                accept=".srt,.vtt,text/vtt"
                data-qa="video-reader-subtitle-input"
                type="file"
                onChange={(event) => void handleSubtitleFile(event.target.files?.[0])}
              />
            </label>
            <button
              className="button secondary"
              data-qa="video-reader-app-open-button"
              type="button"
              disabled={isPreparingLocalVideo}
              onClick={() =>
                savedVideoFolders[0]
                  ? void pickLocalVideoFile(savedVideoFolders[0].folderPath)
                  : void addVideoFolder()
              }
            >
              {isPreparingLocalVideo ? <Loader2 className="spin-icon" size={16} /> : <FolderOpen size={16} />}
               {t("videoReader.actions.recentFolder")}
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => void pasteYoutubeUrlFromClipboard()}
            >
              <Link size={16} />
              {t("videoReader.actions.pasteUrl")}
            </button>
          </div>

          <section
            aria-label={t("videoReader.aria.resume")}
            className="video-reader-resume-strip"
          >
            <div className="video-reader-resume-thumb">
              <Play size={20} />
            </div>
            <div className="video-reader-resume-copy">
              <span>{t("videoReader.home.resumeLabel")}</span>
              <strong>{resumeTitle}</strong>
              <small>{resumeSubtitle}</small>
            </div>
            <div className="video-reader-resume-progress" aria-hidden="true">
              <span style={{ width: resumeProgressWidth }} />
            </div>
            <button
              className="button primary"
              type="button"
              disabled={!hasResumeDraft}
              onClick={() => void resumeLastVideo()}
            >
              {isPreparingLocalVideo
                ? t("videoReader.actions.opening")
                : t("videoReader.actions.resume")}
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={!hasResumeDraft || resumeSession?.transcript.segments.length === 0}
              onClick={() => void resumeLastVideo("bilingual")}
            >
              {t("videoReader.actions.viewSubtitles")}
            </button>
          </section>

          <section
            aria-label={t("videoReader.aria.library")}
            className="video-reader-library-panel"
          >
            <div className="video-reader-library-head">
              <div>
                <span className="section-kicker">
                  <FolderOpen size={15} />
                  {t("videoReader.home.libraryLabel")}
                </span>
                <h2>{t("videoReader.home.libraryTitle")}</h2>
              </div>
              <div className="video-reader-library-actions">
                <button className="button secondary small" type="button" onClick={() => void addVideoFolder()}>
                  <FolderOpen size={15} />
                  {t("videoReader.actions.addFolder")}
                </button>
              </div>
            </div>
            <div className="video-reader-folder-grid">
              {savedVideoFolders.length > 0 ? (
                savedVideoFolders.map((folder) => (
                  <button
                    className="video-reader-folder-tile"
                    key={folder.id}
                    type="button"
                    onClick={() => void pickLocalVideoFile(folder.folderPath)}
                  >
                    <FolderOpen size={23} />
                    <strong>{folder.folderName}</strong>
                    <span>{t("videoReader.labels.savedFolder")}</span>
                    <small title={folder.folderPath}>{getVideoFolderDisplayPath(folder.folderPath)}</small>
                    <em>{t("videoReader.home.folderOpen")}</em>
                  </button>
                ))
              ) : (
                <button className="video-reader-folder-empty" type="button" onClick={() => void addVideoFolder()}>
                  <FolderOpen size={24} />
                  <strong>{t("videoReader.home.addFolderTitle")}</strong>
                  <span>{t("videoReader.home.addFolderDescription")}</span>
                </button>
              )}
            </div>
          </section>
        </section>

        <aside className="panel video-reader-home-side">
          <div className="video-reader-side-head">
            <div>
               <span className="section-kicker" aria-hidden="true">
                 {t("videoReader.labels.quickKicker")}
               </span>
               <strong>{t("videoReader.labels.quick")}</strong>
            </div>
          </div>
          <button
            className="button primary"
            type="button"
            disabled
          >
            <Wand2 size={16} />
             {t("videoReader.actions.createTranscript")}
          </button>
          <button className="button secondary" type="button" disabled>
            <ListVideo size={16} />
             {t("videoReader.labels.playlist")}
          </button>
          <div className="video-reader-home-stat">
             <span>{t("videoReader.labels.todaySaved")}</span>
             <strong>{t("videoReader.labels.noSentences")}</strong>
          </div>
           <p aria-live="polite">{status || t("videoReader.home.toolsDisabled")}</p>
           {technicalErrorDisclosure}
        </aside>
      </div>
    );
  }

  return (
    <div className="video-reader-page">
      <h1 className="sr-only">{t("videoReader.pageTitle")}</h1>
      <div
        aria-label={t("videoReader.aria.status")}
        aria-live="polite"
        className="sr-only"
        role="status"
      >
        {status}
      </div>
      {translationFeedbackOverlay}
      {cloudTranslationPreflightDialog}
      {rKeyConfirmOpen && currentSegment ? (
        <Dialog
          ariaDescribedBy="video-reader-save-dialog-description"
          ariaLabelledBy="video-reader-save-dialog-title"
          backdropClassName="video-reader-dialog-backdrop"
          className="video-reader-save-dialog"
          initialFocusRef={rKeyDialogCancelButtonRef}
          onClose={() => setRKeyConfirmOpen(false)}
        >
          <header>
            <div>
              <h2 id="video-reader-save-dialog-title">
                {t("videoReader.dialog.saveTitle")}
              </h2>
              <p id="video-reader-save-dialog-description">
                {t("videoReader.dialog.saveDescription")}
              </p>
            </div>
            <button
              aria-label={t("videoReader.dialog.close")}
              className="icon-button"
              type="button"
              onClick={() => setRKeyConfirmOpen(false)}
            >
              <X size={18} />
            </button>
          </header>
          <strong className="video-reader-save-dialog-snippet">
            {formatStatusSnippet(selectedTextForCard)}
          </strong>
          <footer>
            <button
              ref={rKeyDialogCancelButtonRef}
              className="button secondary"
              type="button"
              onClick={() => setRKeyConfirmOpen(false)}
            >
              {t("videoReader.actions.cancel")}
            </button>
            <button
              className="button primary"
              type="button"
              disabled={isSavingCard || isCurrentSaved}
              onClick={() => void confirmRKeyCardSave()}
            >
              {isSavingCard
                ? t("videoReader.actions.saving")
                : isCurrentSaved
                  ? t("videoReader.actions.saved")
                  : t("videoReader.actions.create")}
            </button>
          </footer>
        </Dialog>
      ) : null}
      <section className="panel video-reader-main">
        <div
          aria-label={t("videoReader.aria.player")}
          className={`video-reader-player-shell ${
            isPlayerFullscreen ? "is-fullscreen" : ""
          } ${fullscreenSubtitleRailVisible ? "with-fullscreen-rail" : "without-fullscreen-rail"}`}
          ref={playerShellRef}
          style={playerFrameStyle}
        >
          {technicalDetail ? (
            <div className="video-reader-error-alert" role="alert">
              <div>
                <strong>{status || t("videoReader.errorPanel.title")}</strong>
                <button
                  aria-label={t("common.close")}
                  className="icon-button"
                  type="button"
                  onClick={() => setTechnicalDetail("")}
                >
                  <X size={16} />
                </button>
              </div>
              {technicalErrorDisclosure}
            </div>
          ) : null}
          <div className="video-reader-player-media">
            {playerMode === "youtube" ? (
              <div className="video-reader-youtube-frame" ref={youtubeHostRef} />
            ) : (
              <video
                ref={videoRef}
                src={localVideoUrl}
                onLoadedMetadata={applyPendingResumeSeek}
                onError={() => {
                  setIsPlaying(false);
                  setTechnicalDetail(documentTechnicalError(localVideoPlaybackMessage));
                  setStatus(t("videoReader.status.mediaPlaybackFailed"));
                }}
                onPause={() => setIsPlaying(false)}
                onPlay={() => setIsPlaying(true)}
                onTimeUpdate={() => syncSegmentWithPlaybackTime()}
              />
            )}
            {!canUsePlayer ? (
              <div className="video-reader-empty-player">
                <FileVideo size={32} />
                <strong>{t("videoReader.player.addSourceTitle")}</strong>
                <span>{t("videoReader.player.addSourceDescription")}</span>
              </div>
            ) : null}
            {videoCovered ? (
              <button
                className="video-reader-cover"
                type="button"
                onClick={() => setVideoCovered(false)}
              >
                <ShieldOff size={28} />
                <strong>{t("videoReader.player.coveredTitle")}</strong>
                <span>{t("videoReader.player.coveredDescription")}</span>
              </button>
            ) : null}
            {currentSegment ? (
              <div
                className={`video-reader-player-caption mode-${subtitleMode}${
                  subtitleBlurred ? " is-blurred" : ""
                }`}
                onDragStart={(event) => event.preventDefault()}
                onMouseEnter={handleCaptionMouseEnter}
                onMouseLeave={handleCaptionMouseLeave}
                onMouseDown={(event) => {
                  if (event.button === 0) {
                    event.preventDefault();
                  }
                }}
                onMouseUp={() => endCaptionHighlightDrag()}
              >
                {subtitleMode === "source" || subtitleMode === "bilingual" ? (
                  <strong className="video-reader-caption-line source">
                    {renderInteractiveCaptionText(currentSegment.text)}
                  </strong>
                ) : null}
                {subtitleMode === "translation" || subtitleMode === "bilingual" ? (
                  <span className="video-reader-caption-line translation">
                    {currentSegment.translationKo || t("videoReader.transcript.translationMissing")}
                  </span>
                ) : null}
                {captionWordPopover?.segmentId === currentSegment.id ? (
                  <div
                    aria-label={t("videoReader.caption.menuLabel", {
                      word: captionWordPopover.word
                    })}
                    className="video-reader-caption-word-popover"
                    role="dialog"
                    style={{ left: captionWordPopover.x, top: captionWordPopover.y }}
                    onClick={(event) => event.stopPropagation()}
                    onContextMenu={(event) => event.preventDefault()}
                    onMouseDown={(event) => event.stopPropagation()}
                  >
                    <strong>{captionWordPopover.word}</strong>
                    <div>
                      <button
                        className="button primary small"
                        type="button"
                        disabled={isSavingCard || isCaptionWordSaved}
                        onClick={() => void saveCaptionWordCard()}
                      >
                        {isSavingCard
                          ? t("videoReader.actions.saving")
                          : isCaptionWordSaved
                            ? t("videoReader.actions.saved")
                            : t("videoReader.actions.createListeningCard")}
                      </button>
                      <button
                        className="button ghost small"
                        type="button"
                        onClick={closeCaptionWordPopover}
                      >
                        {t("videoReader.actions.cancel")}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            {canUsePlayer &&
            !videoCovered &&
            transcript.segments.length === 0 &&
            !isPreparingLocalVideo &&
            !isExtractingEmbeddedSubtitle &&
            !isTranscribing ? (
              <div className="video-reader-player-caption-empty" role="status">
                <Captions size={18} />
                <strong>{t("videoReader.transcript.playerEmptyTitle")}</strong>
                <span>{t("videoReader.transcript.playerEmptyDescription")}</span>
              </div>
            ) : null}
          </div>
          <div className="video-reader-fullscreen-toolbar">
            <button
              type="button"
              onClick={() => updateFullscreenSubtitleRailPreference(!fullscreenSubtitleRailVisible)}
            >
              <Captions size={16} />
              {fullscreenSubtitleRailVisible
                ? t("videoReader.actions.closeVerticalView")
                : t("videoReader.actions.openVerticalView")}
            </button>
            <button type="button" onClick={() => void togglePlayerFullscreen()}>
              <Minimize2 size={16} />
              {t("videoReader.actions.exitFullscreen")}
            </button>
          </div>
          <aside
            aria-label={t("videoReader.aria.fullscreenRail")}
            className="video-reader-fullscreen-rail"
          >
            <div className="video-reader-fullscreen-rail-head">
              <strong>{t("videoReader.labels.subtitleList")}</strong>
              <span>
                {transcript.segments.length > 0
                  ? t("videoReader.playlist.position", {
                      formattedCurrent: formatCount(segmentIndex + 1),
                      formattedTotal: formatCount(transcript.segments.length)
                    })
                  : t("videoReader.playlist.position", {
                      formattedCurrent: formatCount(0),
                      formattedTotal: formatCount(0)
                    })}
              </span>
            </div>
            {transcript.segments.length > 0 ? (
              <VideoTranscriptList
                activeIndex={segmentIndex}
                ariaLabel={t("videoReader.aria.fullscreenRail")}
                formatCount={formatCount}
                formatTimestamp={formatPlaybackTime}
                segments={transcript.segments}
                variant="fullscreen"
                onSelect={selectSegment}
              />
            ) : (
              <div className="video-reader-fullscreen-rail-empty">
                {t("videoReader.transcript.fullscreenEmpty")}
              </div>
            )}
          </aside>
        </div>

        <section
          aria-label={t("videoReader.aria.controls")}
          className="video-reader-control-dock"
        >
          {status ? <p className="video-reader-runtime-status">{status}</p> : null}
          <div className="video-reader-video-nav-row">
            <button
              className="button secondary"
              type="button"
              disabled={!previousPlaylistVideo || isPreparingLocalVideo}
              onClick={() => previousPlaylistVideo && void openLocalPlaylistVideo(previousPlaylistVideo)}
            >
              <ChevronLeft size={16} />
              {t("videoReader.actions.previousVideo")}
            </button>
            <div className="video-reader-video-nav-current">
              <span>{t("videoReader.labels.currentVideo")}</span>
              <strong>{transcript.title || localVideoName || t("videoReader.labels.noVideo")}</strong>
            </div>
            <button
              className="button secondary"
              type="button"
              disabled={!nextPlaylistVideo || isPreparingLocalVideo}
              onClick={() => nextPlaylistVideo && void openLocalPlaylistVideo(nextPlaylistVideo)}
            >
              {t("videoReader.actions.nextVideo")}
              <ChevronRight size={16} />
            </button>
          </div>

        <div className="video-reader-controls">
           <button
             aria-keyshortcuts="A ArrowLeft"
            className="button secondary"
            type="button"
            disabled={segmentIndex === 0}
            onClick={() => moveSegment(-1)}
          >
            <ChevronLeft size={17} />
             {t("videoReader.actions.previous")}
          </button>
           <button className="button secondary" type="button" onClick={replaySegment}>
            <RotateCcw size={16} />
             {t("videoReader.actions.replay")}
          </button>
           <button
             aria-keyshortcuts="S"
             className="button secondary"
             type="button"
             onClick={togglePlayback}
           >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
             {isPlaying ? t("videoReader.actions.pause") : t("videoReader.actions.play")}
          </button>
           <button
             aria-keyshortcuts="H Home"
             className="button secondary"
             type="button"
             onClick={() => void goToVideoReaderHome()}
           >
            <Home size={16} />
             {t("videoReader.actions.videoHome")}
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() => setVideoCovered((value) => !value)}
          >
            {videoCovered ? <Eye size={16} /> : <EyeOff size={16} />}
             {videoCovered
               ? t("videoReader.actions.showVideo")
               : t("videoReader.actions.hideVideo")}
          </button>
           <button
             aria-keyshortcuts="R"
             className="button secondary"
             type="button"
             disabled={!currentSegment || isSavingCard || isCurrentSaved}
             onClick={requestRKeyCardSave}
           >
             <BookmarkPlus size={16} />
             {isSavingCard
               ? t("videoReader.actions.saving")
               : isCurrentSaved
                 ? t("videoReader.actions.saved")
                 : t("videoReader.actions.createListeningCard")}
           </button>
           <button
             aria-keyshortcuts="D ArrowRight"
             className="button primary"
            type="button"
            disabled={segmentIndex >= transcript.segments.length - 1}
            onClick={() => moveSegment(1)}
          >
             {t("videoReader.actions.next")}
            <ChevronRight size={17} />
          </button>
           <button
             aria-keyshortcuts="Enter"
             className="button secondary"
             type="button"
             onClick={() => void togglePlayerFullscreen()}
           >
            <Maximize2 size={16} />
             {t("videoReader.actions.fullscreen")}
          </button>
        </div>

        <div className="video-reader-mode-bar">
          <div className="segmented-control compact">
            {(["hidden", "source", "translation", "bilingual"] as SubtitleMode[]).map((mode) => (
              <button
                key={mode}
                className={subtitleMode === mode ? "active" : ""}
                type="button"
                onClick={() => setSubtitleMode(mode)}
              >
                {getSubtitleModeLabel(mode, t)}
              </button>
            ))}
          </div>
          <div className="segmented-control compact">
            {playbackSpeeds.map((speed) => (
              <button
                key={speed}
                className={playbackSpeed === speed ? "active" : ""}
                type="button"
                onClick={() => setPlaybackSpeed(speed)}
              >
                {formatCount(speed)}x
              </button>
            ))}
          </div>
        </div>

        <div className="video-reader-practice-toggles">
          <label>
            <input
              checked={loopEnabled}
              type="checkbox"
              onChange={(event) => setLoopEnabled(event.target.checked)}
            />
             {t("videoReader.player.loop")}
          </label>
          <label>
            <input
              checked={autoPauseEnabled}
              type="checkbox"
              onChange={(event) => setAutoPauseEnabled(event.target.checked)}
            />
             {t("videoReader.player.autoPause")}
          </label>
          <label>
            <input
              checked={shadowingEnabled}
              type="checkbox"
              onChange={(event) => setShadowingEnabled(event.target.checked)}
            />
             {t("videoReader.player.shadowing")}
          </label>
          <label>
            <input
              checked={rKeyConfirmEnabled}
              type="checkbox"
              onChange={(event) => updateRKeyConfirmPreference(event.target.checked)}
            />
             {t("videoReader.player.saveConfirm")}
          </label>
          <label>
            <input
              checked={saveFrameImageEnabled}
              type="checkbox"
              onChange={(event) => updateSaveFrameImagePreference(event.target.checked)}
            />
             {t("videoReader.player.saveFrame")}
           </label>
           <label>
             <input
               aria-keyshortcuts="Q"
               checked={subtitleBlurred}
               type="checkbox"
               onChange={(event) => setSubtitleBlurred(event.target.checked)}
             />
             {t("videoReader.player.subtitleBlur")}
           </label>
        </div>
        </section>

      </section>

      <aside className={`panel video-reader-side tab-${videoReaderSideTab}`}>
        <div
          aria-label={t("videoReader.aria.sidePanel")}
          className="video-reader-side-tabs"
          role="group"
        >
          <button
            aria-pressed={videoReaderSideTab === "subtitles"}
            className={videoReaderSideTab === "subtitles" ? "active" : ""}
            type="button"
            onClick={() => setVideoReaderSideTab("subtitles")}
          >
            {t("videoReader.labels.subtitles")}
          </button>
          <button
            aria-pressed={videoReaderSideTab === "playlist"}
            className={videoReaderSideTab === "playlist" ? "active" : ""}
            type="button"
            onClick={() => setVideoReaderSideTab("playlist")}
          >
            {t("videoReader.labels.playlist")}
          </button>
          <button
            aria-pressed={videoReaderSideTab === "settings"}
            className={videoReaderSideTab === "settings" ? "active" : ""}
            type="button"
            onClick={() => setVideoReaderSideTab("settings")}
          >
            {t("videoReader.labels.settings")}
          </button>
        </div>
        <section className="video-reader-playlist-panel">
          <div className="video-reader-side-head">
            <div>
              <span className="section-kicker">
                <ListVideo size={15} />
                {t("videoReader.labels.playlist")}
              </span>
              <strong>
                {localVideoFolderPath
                  ? getVideoFolderNameFromPath(localVideoFolderPath)
                  : t("videoReader.labels.currentList")}
              </strong>
            </div>
            <button
              className="button ghost small"
              type="button"
              disabled={!localVideoFolderPath || isLoadingLocalPlaylist}
              onClick={() => void refreshLocalVideoPlaylist()}
            >
              {isLoadingLocalPlaylist ? <Loader2 className="spin-icon" size={14} /> : <RotateCcw size={14} />}
              {t("videoReader.actions.refresh")}
            </button>
          </div>
          <div className="video-reader-playlist-jump">
            <button
              className="button secondary small"
              type="button"
              disabled={!previousPlaylistVideo || isPreparingLocalVideo}
              onClick={() => previousPlaylistVideo && void openLocalPlaylistVideo(previousPlaylistVideo)}
            >
              <ChevronLeft size={14} />
              {t("videoReader.actions.previousVideo")}
            </button>
            <span>
              {localPlaylistIndex >= 0
                ? t("videoReader.playlist.position", {
                    formattedCurrent: formatCount(localPlaylistIndex + 1),
                    formattedTotal: formatCount(localPlaylistVideos.length)
                  })
                : localPlaylistVideos.length
                  ? t("videoReader.playlist.count", {
                      formattedCount: formatCount(localPlaylistVideos.length)
                    })
                  : t("videoReader.playlist.empty")}
            </span>
            <button
              className="button primary small"
              type="button"
              disabled={!nextPlaylistVideo || isPreparingLocalVideo}
              onClick={() => nextPlaylistVideo && void openLocalPlaylistVideo(nextPlaylistVideo)}
            >
              {t("videoReader.actions.nextVideo")}
              <ChevronRight size={14} />
            </button>
          </div>
          <div className="video-reader-playlist-list">
            {localPlaylistVideos.length > 0 ? (
              localPlaylistVideos.map((video, index) => {
                const isActive = normalizeLocalPathKey(video.filePath) === normalizeLocalPathKey(localVideoPath);
                return (
                  <button
                    className={isActive ? "active" : ""}
                    key={video.filePath}
                    type="button"
                    onClick={() => void openLocalPlaylistVideo(video)}
                  >
                    <span className="video-reader-playlist-thumb">
                      <video
                        aria-hidden="true"
                        muted
                        playsInline
                        preload="metadata"
                        src={getVideoPreviewUrl(video.fileUrl)}
                      />
                      <FileVideo size={18} />
                    </span>
                    <span className="video-reader-playlist-index">{formatCount(index + 1)}</span>
                    <strong>{video.title || video.fileName}</strong>
                    <small>{video.fileName}</small>
                  </button>
                );
              })
            ) : (
              <div className="video-reader-timeline-empty">
                {t("videoReader.playlist.folderHint")}
              </div>
            )}
          </div>
        </section>
        <div className="video-reader-side-head">
          <div>
            <span className="section-kicker">
              <Clock size={15} />
              {t("videoReader.labels.timeline")}
            </span>
            <strong>{t("videoReader.labels.subtitleList")}</strong>
          </div>
          <button
            className="button ghost small"
            type="button"
            onClick={() =>
              void (isTranslating ? stopVideoTranslation() : requestTranslateAllSegments())
            }
          >
            {isTranslating ? <X size={14} /> : <Sparkles size={14} />}
            {isTranslating
              ? TRANSLATION_CANCEL_COPY.stop
              : t("videoReader.actions.translate")}
          </button>
        </div>
        {transcript.segments.length > 0 ? (
          <VideoTranscriptList
            activeIndex={segmentIndex}
            ariaLabel={t("videoReader.aria.subtitleList")}
            formatCount={formatCount}
            formatTimestamp={formatPlaybackTime}
            segments={transcript.segments}
            variant="timeline"
            onSelect={selectSegment}
          />
        ) : (
          <div className="video-reader-timeline">
            <div className="video-reader-timeline-empty">
              {t("videoReader.transcript.listEmpty")}
            </div>
          </div>
        )}
        <div className="video-reader-help">
          <strong>{t("videoReader.shortcuts.title")}</strong>
          <span>{t("videoReader.shortcuts.previous")}</span>
          <span>{t("videoReader.shortcuts.next")}</span>
          <span>{t("videoReader.shortcuts.playback")}</span>
          <span>{t("videoReader.shortcuts.blur")}</span>
          <span>{t("videoReader.shortcuts.fullscreen")}</span>
          <span>{t("videoReader.shortcuts.subtitles")}</span>
          <span>{t("videoReader.shortcuts.save")}</span>
          <span>{t("videoReader.shortcuts.home")}</span>
          <span>{t("videoReader.shortcuts.wordKeyboard")}</span>
        </div>
        <section
          aria-label={t("videoReader.labels.videoSource")}
          className="video-reader-side-source-card"
        >
          <div className="video-reader-side-source-head">
            <span className="section-kicker">
              <FileVideo size={15} />
              {t("videoReader.pageTitle")}
            </span>
            <span className="video-reader-counter">
              {t("videoReader.playlist.position", {
                formattedCurrent: formatCount(
                  transcript.segments.length > 0 ? segmentIndex + 1 : 0
                ),
                formattedTotal: formatCount(transcript.segments.length)
              })}
            </span>
          </div>
          <h2>{transcript.title || t("videoReader.sourceTitle")}</h2>
          <p>{t("videoReader.sourceDescription")}</p>
          <div
            aria-label={t("videoReader.aria.status")}
            className={`video-reader-transcript-status compact ${transcriptStatusKind}`}
          >
            <strong>{transcriptStatusText}</strong>
            <span>{transcriptStatusDetail}</span>
          </div>
          <div className="video-reader-source-panel">
            <label className="video-reader-file-button" data-qa="video-reader-file-button">
              <FileVideo size={16} />
              {t("videoReader.actions.videoFile")}
              <input
                accept={VIDEO_READER_VIDEO_ACCEPT}
                data-qa="video-reader-file-input"
                type="file"
                onChange={(event) => void handleVideoFile(event.target.files?.[0])}
              />
            </label>
            <button
              className="button secondary"
              data-qa="video-reader-app-open-button"
              type="button"
              disabled={isPreparingLocalVideo}
              onClick={() => void pickLocalVideoFile()}
            >
              {isPreparingLocalVideo ? <Loader2 className="spin-icon" size={16} /> : <FileVideo size={16} />}
              {isPreparingLocalVideo
                ? t("videoReader.actions.preparingPlayback")
                : t("videoReader.actions.openInApp")}
            </button>
            <button
              className="button secondary"
              data-qa="video-reader-embedded-subtitle"
              type="button"
              disabled={!localVideoPath || isExtractingEmbeddedSubtitle || isTranscribing}
              onClick={() => void extractLocalEmbeddedSubtitleForFile()}
            >
              {isExtractingEmbeddedSubtitle ? <Loader2 className="spin-icon" size={16} /> : <Subtitles size={16} />}
              {isExtractingEmbeddedSubtitle
                ? t("videoReader.actions.checking")
                : t("videoReader.actions.embeddedSubtitles")}
            </button>
            <button
              className="button primary"
              data-qa="video-reader-local-whisper"
              type="button"
              disabled={!localVideoPath || isTranscribing || isExtractingEmbeddedSubtitle}
              onClick={() => void transcribeLocalVideo()}
            >
              {isTranscribing ? <Loader2 className="spin-icon" size={16} /> : <Wand2 size={16} />}
              {t("videoReader.actions.localWhisper")}
            </button>
            <label className="video-reader-file-button" data-qa="video-reader-subtitle-button">
              <Subtitles size={16} />
              {t("videoReader.actions.srtVtt")}
              <input
                accept=".srt,.vtt,text/vtt"
                data-qa="video-reader-subtitle-input"
                type="file"
                onChange={(event) => void handleSubtitleFile(event.target.files?.[0])}
              />
            </label>
          </div>
        </section>
      </aside>
    </div>
  );
}

function readManualTranscript(directAddLabel: string): ListeningTranscript {
  try {
    const raw = localStorage.getItem(VIDEO_READER_DRAFT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ListeningTranscript;
      if (Array.isArray(parsed.segments)) {
        return parsed;
      }
    }
  } catch {
    // Use empty fallback below.
  }
  const now = new Date().toISOString();
  return {
    id: "manual-video-reader",
    candidateId: "manual-video-reader",
    videoId: "manual-video-reader",
    title: "",
    channelName: directAddLabel,
    status: "ready",
    segments: [],
    modelName: "manual",
    createdAt: now,
    updatedAt: now
  };
}

function writeManualTranscript(transcript: ListeningTranscript) {
  localStorage.setItem(VIDEO_READER_DRAFT_KEY, JSON.stringify(transcript));
}

function readFullscreenSubtitleRailPreference() {
  try {
    const raw = localStorage.getItem(VIDEO_READER_FULLSCREEN_RAIL_KEY);
    return raw === null ? true : raw !== "off";
  } catch {
    return true;
  }
}

function writeFullscreenSubtitleRailPreference(visible: boolean) {
  try {
    localStorage.setItem(VIDEO_READER_FULLSCREEN_RAIL_KEY, visible ? "on" : "off");
  } catch {
    // This is a soft UI preference. Ignore storage failures rather than affecting playback.
  }
}

function readRKeyConfirmPreference() {
  try {
    const raw = localStorage.getItem(VIDEO_READER_R_KEY_CONFIRM_KEY);
    return raw === null ? true : raw !== "off";
  } catch {
    return true;
  }
}

function writeRKeyConfirmPreference(enabled: boolean) {
  try {
    localStorage.setItem(VIDEO_READER_R_KEY_CONFIRM_KEY, enabled ? "on" : "off");
  } catch {
    // This is a soft UI preference. Ignore storage failures rather than affecting playback.
  }
}

function readSaveFrameImagePreference() {
  try {
    return localStorage.getItem(VIDEO_READER_SAVE_FRAME_IMAGE_KEY) === "on";
  } catch {
    return false;
  }
}

function writeSaveFrameImagePreference(enabled: boolean) {
  try {
    localStorage.setItem(VIDEO_READER_SAVE_FRAME_IMAGE_KEY, enabled ? "on" : "off");
  } catch {
    // This is a soft UI preference. Ignore storage failures rather than affecting playback.
  }
}

function getVideoReaderResumeStorageKey(profileId: ProfileId) {
  return `${VIDEO_READER_RESUME_KEY_PREFIX}:${profileId}`;
}

function readVideoReaderResumeSession(profileId: ProfileId): VideoReaderResumeSession | null {
  try {
    const raw = localStorage.getItem(getVideoReaderResumeStorageKey(profileId));
    if (!raw) {
      return null;
    }
    return normalizeVideoReaderResumeSession(JSON.parse(raw), profileId);
  } catch {
    return null;
  }
}

function writeVideoReaderResumeSession(profileId: ProfileId, session: VideoReaderResumeSession) {
  try {
    localStorage.setItem(getVideoReaderResumeStorageKey(profileId), JSON.stringify(session));
  } catch {
    // Ignore storage failures; the current in-memory video session can still continue.
  }
}

function normalizeVideoReaderResumeSession(
  value: unknown,
  profileId: ProfileId
): VideoReaderResumeSession | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const source = normalizeVideoReaderResumeSource(record.source);
  const transcript = normalizeVideoReaderResumeTranscript(record.transcript);
  if (!source || !transcript) {
    return null;
  }
  const rawSegmentIndex = typeof record.segmentIndex === "number" ? record.segmentIndex : 0;
  const rawPlaybackTime = typeof record.playbackTime === "number" ? record.playbackTime : 0;
  return {
    profileId,
    source,
    transcript,
    segmentIndex: clamp(
      Math.floor(rawSegmentIndex),
      0,
      Math.max(0, transcript.segments.length - 1)
    ),
    playbackTime: Number.isFinite(rawPlaybackTime) ? Math.max(0, rawPlaybackTime) : 0,
    subtitleMode: normalizeSubtitleMode(record.subtitleMode),
    videoCovered: record.videoCovered === true,
    loopEnabled: record.loopEnabled === true,
    playbackSpeed: normalizePlaybackSpeed(record.playbackSpeed),
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date().toISOString()
  };
}

function normalizeVideoReaderResumeSource(value: unknown): VideoReaderResumeSource | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.mode === "local") {
    const filePath = typeof record.filePath === "string" ? record.filePath.trim() : "";
    if (!filePath) {
      return null;
    }
    const fallbackName = getVideoFolderNameFromPath(filePath);
    return {
      mode: "local",
      filePath,
      fileName:
        typeof record.fileName === "string" && record.fileName.trim()
          ? record.fileName.trim()
          : fallbackName,
      title:
        typeof record.title === "string" && record.title.trim()
          ? record.title.trim()
          : fallbackName.replace(/\.[^.]+$/, ""),
      folderPath:
        typeof record.folderPath === "string" && record.folderPath.trim()
          ? record.folderPath.trim()
          : getParentFolderPath(filePath) || undefined,
      playbackMessage:
        typeof record.playbackMessage === "string" && record.playbackMessage.trim()
          ? record.playbackMessage
          : undefined
    };
  }
  if (record.mode === "youtube") {
    const videoId = normalizeVideoId(typeof record.videoId === "string" ? record.videoId : "");
    if (!videoId) {
      return null;
    }
    const url =
      typeof record.url === "string" && record.url.trim()
        ? record.url.trim()
        : `https://www.youtube.com/watch?v=${videoId}`;
    return {
      mode: "youtube",
      videoId,
      url,
      candidateId:
        typeof record.candidateId === "string" && record.candidateId.trim()
          ? record.candidateId
          : undefined
    };
  }
  return null;
}

function normalizeVideoReaderResumeTranscript(value: unknown): ListeningTranscript | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const transcript = value as ListeningTranscript;
  return Array.isArray(transcript.segments) ? transcript : null;
}

function normalizeSubtitleMode(value: unknown): SubtitleMode {
  return value === "source" || value === "translation" || value === "bilingual"
    ? value
    : "hidden";
}

function isCurrentEmbeddedSubtitleTranscript(modelName?: string) {
  return modelName === EMBEDDED_SUBTITLE_SENTENCE_MODEL;
}

function getResumeSubtitleMode(
  session: VideoReaderResumeSession,
  requestedMode?: SubtitleMode
): SubtitleMode {
  if (requestedMode) {
    return requestedMode;
  }
  if (session.transcript.segments.length > 0 && session.subtitleMode === "hidden") {
    return "source";
  }
  return session.subtitleMode ?? "hidden";
}

function normalizePlaybackSpeed(value: unknown): PlaybackSpeed {
  return playbackSpeeds.includes(value as PlaybackSpeed) ? (value as PlaybackSpeed) : 1;
}

function getVideoReaderResumeSubtitle(
  session: VideoReaderResumeSession,
  t: TFunction,
  formatCount: (value: number) => string,
  formatPlaybackTime: (value: number) => string
) {
  const sourceLabel =
    session.source.mode === "youtube"
      ? t("videoReader.labels.youtube")
      : t("videoReader.resume.localSource");
  const segmentCount = session.transcript.segments.length;
  if (segmentCount > 0) {
    return t("videoReader.resume.withSegments", {
      source: sourceLabel,
      formattedCurrent: formatCount(session.segmentIndex + 1),
      formattedTotal: formatCount(segmentCount),
      time: formatPlaybackTime(session.playbackTime)
    });
  }
  return t("videoReader.resume.atTime", {
    source: sourceLabel,
    time: formatPlaybackTime(session.playbackTime)
  });
}

function getVideoReaderResumeProgressWidth(session: VideoReaderResumeSession) {
  const segmentCount = session.transcript.segments.length;
  if (segmentCount > 0) {
    return `${clamp(((session.segmentIndex + 1) / segmentCount) * 100, 4, 100)}%`;
  }
  return session.playbackTime > 0 ? "12%" : "4%";
}

function normalizeLocalPathKey(filePath: string) {
  return filePath.trim().replace(/\\/g, "/").toLowerCase();
}

function getParentFolderPath(filePath: string) {
  const normalized = filePath.trim();
  if (!normalized) {
    return "";
  }
  const separatorIndex = Math.max(normalized.lastIndexOf("\\"), normalized.lastIndexOf("/"));
  return separatorIndex > 0 ? normalized.slice(0, separatorIndex) : "";
}

function getVideoPreviewUrl(fileUrl: string) {
  const normalized = fileUrl.trim();
  if (!normalized || normalized.includes("#")) {
    return normalized;
  }
  return `${normalized}#t=1`;
}

function getLocalVideoFileUrl(filePath: string) {
  const normalized = filePath.trim().replace(/\\/g, "/");
  const prefix = normalized.startsWith("/") ? "file://" : "file:///";
  const encoded = normalized
    .split("/")
    .map((part, index) => (index === 0 && /^[A-Za-z]:$/.test(part) ? part : encodeURIComponent(part)))
    .join("/");
  return `${prefix}${encoded}`;
}

function getVideoFolderStorageKey(profileId: ProfileId) {
  return `${VIDEO_READER_FOLDERS_KEY_PREFIX}:${profileId}`;
}

function readStoredVideoFolders(profileId: ProfileId): SavedVideoFolder[] {
  try {
    const raw = localStorage.getItem(getVideoFolderStorageKey(profileId));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((value) => normalizeStoredVideoFolder(value))
      .filter((folder): folder is SavedVideoFolder => Boolean(folder))
      .slice(0, 12);
  } catch {
    return [];
  }
}

function writeStoredVideoFolders(profileId: ProfileId, folders: SavedVideoFolder[]) {
  try {
    localStorage.setItem(getVideoFolderStorageKey(profileId), JSON.stringify(folders));
  } catch {
    // Storage can fail in restricted browser contexts. The selected folder still works for this session.
  }
}

function normalizeStoredVideoFolder(value: unknown): SavedVideoFolder | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const folderPath = typeof record.folderPath === "string" ? record.folderPath.trim() : "";
  if (!folderPath) {
    return null;
  }
  const fallbackName = getVideoFolderNameFromPath(folderPath);
  const folderName =
    typeof record.folderName === "string" && record.folderName.trim()
      ? record.folderName.trim()
      : fallbackName;
  const id =
    typeof record.id === "string" && record.id.trim()
      ? record.id.trim()
      : getVideoFolderId(folderPath);
  const createdAt = typeof record.createdAt === "string" ? record.createdAt : undefined;
  return {
    id,
    folderPath,
    folderName,
    createdAt
  };
}

function getVideoFolderId(folderPath: string) {
  return folderPath.trim().toLowerCase();
}

function getVideoFolderNameFromPath(folderPath: string) {
  const parts = folderPath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || folderPath;
}

function getVideoFolderDisplayPath(folderPath: string) {
  const normalized = folderPath.trim();
  if (normalized.length <= 58) {
    return normalized;
  }
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  const folderName = parts[parts.length - 1];
  const parentName = parts[parts.length - 2];
  if (parentName && folderName) {
    return `...\\${parentName}\\${folderName}`;
  }
  return `${normalized.slice(0, 16)}...${normalized.slice(-34)}`;
}

function findSegmentIndexAtTime(segments: ListeningTranscriptSegment[], seconds: number) {
  if (!segments.length || !Number.isFinite(seconds)) {
    return -1;
  }
  const toleranceSeconds = 0.12;
  let low = 0;
  let high = segments.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const segment = segments[middle];
    if (seconds < segment.start - toleranceSeconds) {
      high = middle - 1;
      continue;
    }
    if (seconds > segment.end + toleranceSeconds) {
      low = middle + 1;
      continue;
    }
    return middle;
  }
  return -1;
}

function parseSubtitleText(text: string, speakerLabel: string): ListeningTranscriptSegment[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/^WEBVTT[^\n]*\n/i, "");
  const blocks = normalized.split(/\n{2,}/);
  const segments: ListeningTranscriptSegment[] = [];
  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const timeLineIndex = lines.findIndex((line) => line.includes("-->"));
    if (timeLineIndex < 0) {
      continue;
    }
    const timeMatch = lines[timeLineIndex].match(/([\d:,.]+)\s+-->\s+([\d:,.]+)/);
    if (!timeMatch) {
      continue;
    }
    const start = parseSubtitleTime(timeMatch[1]);
    const end = parseSubtitleTime(timeMatch[2]);
    const subtitleText = lines
      .slice(timeLineIndex + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!subtitleText || end <= start) {
      continue;
    }
    segments.push({
      id: `subtitle-${segments.length + 1}`,
      speaker: speakerLabel,
      start,
      end,
      text: subtitleText
    });
  }
  return mergeSubtitleSegmentsIntoSentences(segments, { idPrefix: "subtitle" });
}

function parseSubtitleTime(value: string) {
  const normalized = value.replace(",", ".");
  const parts = normalized.split(":").map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return Number(normalized) || 0;
}

function getYouTubeVideoId(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.hostname.includes("youtu.be")) {
      return normalizeVideoId(url.pathname.replace("/", ""));
    }
    return normalizeVideoId(url.searchParams.get("v") || "");
  } catch {
    return normalizeVideoId(value);
  }
}

function normalizeVideoId(value: string) {
  const normalized = value.trim();
  return /^[A-Za-z0-9_-]{6,20}$/.test(normalized) ? normalized : "";
}

function formatStatusSnippet(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 42) {
    return normalized;
  }
  return `${normalized.slice(0, 42)}...`;
}

function getElectronFilePath(file: File, api?: LocalEnglishMinerApi) {
  const apiPath = api?.listening.getLocalFilePath?.(file);
  if (apiPath) {
    return apiPath;
  }
  const electronFile = file as File & { path?: unknown };
  return typeof electronFile.path === "string" ? electronFile.path : "";
}

function getLocalFilePathFromTranscriptCandidateId(candidateId: string | undefined) {
  const prefix = "local-file:";
  const normalized = String(candidateId ?? "").trim();
  return normalized.startsWith(prefix) ? normalized.slice(prefix.length).trim() : "";
}

function hasUsableListeningAudio(card: StudyCard) {
  return Boolean(
    card.listeningMedia?.videoClip?.fileUrl ||
      card.listeningMedia?.videoClip?.filePath ||
      card.listeningMedia?.audioClip?.fileUrl ||
      card.listeningMedia?.audioClip?.filePath
  );
}

function getVideoReaderSourceKey(
  transcript: ListeningTranscript,
  segment: ListeningTranscriptSegment
) {
  return `video-reader:${transcript.candidateId}:${segment.id}:${Math.round(segment.start * 10)}`;
}

function getVideoReaderWordSourceKey(sourceKey: string, normalizedWord: string) {
  return `${sourceKey}:word:${encodeURIComponent(normalizedWord)}`;
}

function getCaptionWordHighlightKey(index: number) {
  return `word:${index}`;
}

function getUntranslatedTranscriptSegments(segments: ListeningTranscriptSegment[]) {
  return segments.filter((segment) => !segment.translationKo?.trim());
}

function splitCaptionTextIntoParts(text: string): CaptionTextPart[] {
  const parts: CaptionTextPart[] = [];
  const wordPattern = /[\p{L}\p{N}]+(?:['’ʼ-][\p{L}\p{N}]+)*/gu;
  let cursor = 0;
  for (const match of text.matchAll(wordPattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      parts.push({
        value: text.slice(cursor, index),
        isWord: false
      });
    }
    parts.push({
      value: match[0],
      isWord: true
    });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) {
    parts.push({
      value: text.slice(cursor),
      isWord: false
    });
  }
  return parts.length ? parts : [{ value: text, isWord: false }];
}

function normalizeCaptionWordForDisplay(value: string) {
  return value
    .normalize("NFKC")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .trim();
}

function normalizeCaptionWordForKey(value: string) {
  return normalizeCaptionWordForDisplay(value).toLocaleLowerCase();
}

function normalizeListeningHighlightKey(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function uniqueListeningHighlightTerms(values: string[]) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value.replace(/\s+/g, " ").trim();
    const key = normalizeListeningHighlightKey(normalized);
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function findMeaningAnchor(sentence: string, candidate: string | undefined) {
  const normalizedSentence = sentence.trim();
  const normalizedCandidate = String(candidate ?? "").trim();
  if (!normalizedSentence || !normalizedCandidate) {
    return undefined;
  }
  const exactIndex = normalizedSentence.toLocaleLowerCase().indexOf(
    normalizedCandidate.toLocaleLowerCase()
  );
  if (exactIndex >= 0) {
    return normalizedSentence.slice(exactIndex, exactIndex + normalizedCandidate.length);
  }

  const tokens = normalizedCandidate
    .replace(/[()[\]{}"'`.,!?;:]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  for (let size = Math.min(3, tokens.length); size >= 1; size -= 1) {
    for (let index = 0; index <= tokens.length - size; index += 1) {
      const phrase = tokens.slice(index, index + size).join(" ");
      if (phrase.length < 2) {
        continue;
      }
      const phraseIndex = normalizedSentence.indexOf(phrase);
      if (phraseIndex >= 0) {
        return normalizedSentence.slice(phraseIndex, phraseIndex + phrase.length);
      }
    }
  }
  return undefined;
}

function inferListeningProsodyMark(sourceText: string): StudyCardListeningAnnotation["mark"] {
  const normalized = normalizeListeningHighlightKey(sourceText);
  const words = normalized.split(/\s+/).filter(Boolean);
  if (/[’']/.test(sourceText) || words.length >= 2) {
    return "linking-bridge";
  }
  if (/^(a|an|the|to|for|of|and|or|in|on|at|is|are|was|were|be|been)$/.test(normalized)) {
    return "reduced";
  }
  if (normalized.length >= 7) {
    return "strong-stress-dot";
  }
  return "stress-dot";
}

function getTranscriptStatusKind(
  transcript: ListeningTranscript,
  state: { isPreparing: boolean; isExtracting: boolean; isTranscribing: boolean }
): TranscriptStatusKind {
  if (
    state.isPreparing ||
    state.isExtracting ||
    state.isTranscribing ||
    transcript.status === "processing"
  ) {
    return "working";
  }
  if (transcript.status === "failed") {
    return "failed";
  }
  return transcript.segments.length > 0 ? "ready" : "empty";
}

function getTranscriptStatusText(
  transcript: ListeningTranscript,
  statusKind: TranscriptStatusKind,
  t: TFunction,
  formatCount: (value: number) => string
) {
  if (statusKind === "working") {
    return t("videoReader.transcript.working");
  }
  if (statusKind === "failed") {
    return t("videoReader.transcript.failed");
  }
  if (statusKind === "ready") {
    return t("videoReader.transcript.ready", {
      formattedCount: formatCount(transcript.segments.length)
    });
  }
  return t("videoReader.transcript.empty");
}

function getTranscriptStatusDetail(
  transcript: ListeningTranscript,
  statusKind: TranscriptStatusKind,
  fallbackStatus: string,
  t: TFunction
) {
  if (statusKind === "working") {
    return (
      fallbackStatus ||
      t("videoReader.transcript.workingDetail")
    );
  }
  if (statusKind === "failed") {
    return fallbackStatus || t("videoReader.transcript.failedDetail");
  }
  if (statusKind === "ready") {
    return t("videoReader.transcript.readyDetail");
  }
  return fallbackStatus || t("videoReader.transcript.emptyDetail");
}

function getSubtitleModeLabel(mode: SubtitleMode, t: TFunction) {
  if (mode === "source") {
    return t("videoReader.player.modes.source");
  }
  if (mode === "translation") {
    return t("videoReader.player.modes.translation");
  }
  if (mode === "bilingual") {
    return t("videoReader.player.modes.bilingual");
  }
  return t("videoReader.player.modes.hidden");
}

function formatTime(
  seconds: number,
  formatters: { minutes: Intl.NumberFormat; seconds: Intl.NumberFormat }
) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${formatters.minutes.format(minutes)}:${formatters.seconds.format(remainingSeconds)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function suppressYouTubeCaptions(player: YouTubePlayer | null) {
  if (!player) {
    return;
  }

  for (const delay of [0, 250, 900, 1800]) {
    window.setTimeout(() => {
      try {
        player.unloadModule?.("captions");
        player.unloadModule?.("cc");
        player.setOption?.("captions", "track", {});
      } catch {
        // YouTube iframe modules are best-effort and vary by embed state.
      }
    }, delay);
  }
}

function loadYouTubeIframeApi() {
  const youtubeWindow = window as YouTubeWindow;
  if (youtubeWindow.YT?.Player) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    youtubeApiCallbacks.push(resolve);
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]'
    );
    if (!existingScript) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }

    const previousReady = youtubeWindow.onYouTubeIframeAPIReady;
    youtubeWindow.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      const callbacks = youtubeApiCallbacks.splice(0);
      callbacks.forEach((callback) => callback());
    };
  });
}
