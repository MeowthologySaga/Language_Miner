import {
  BookOpenCheck,
  Headphones,
  Languages,
  Link2,
  ListChecks,
  MessageSquareText,
  Mic2,
  Pencil,
  Target,
  Volume2
} from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "../i18n";
import { HighlightedText } from "./HighlightedText";
import { AdaptiveOutputBack, AdaptiveOutputFront } from "./AdaptiveOutputCard";
import { getCardDeckLabel, getCardDeckShortLabel } from "../shared/cardDeck";
import {
  getLifeExpressionPreview,
  parseLifeConversationMessages,
  shouldCollapseLifeMessage,
  type LifeConversationMessage
} from "../shared/lifeCardPreview";
import { createFallbackVocabularyItem } from "../shared/browserSentenceFallbackCard";
import { scheduleCardReview } from "../shared/srs";
import { LIFE_MINER_BRIDGE_BASE_URL } from "../shared/lifeLogCapture";
import { getWritingPracticePumpPrompts } from "../shared/pumpPrompts";
import {
  filterInputListeningComparisons,
  filterInputListeningVocabularyItems,
  getListeningProsodyLabel as getSharedListeningProsodyLabel
} from "../shared/listeningVocabularyPolicy";
import type {
  AppSettings,
  ConfusingComparisonKind,
  HighlightMapping,
  PumpPrompt,
  ReadingSentenceStructure,
  ReviewRating,
  StudyCard,
  StudyCardListeningAnnotation
} from "../shared/types";
import { playCardTts, playTextTts } from "../utils/cardTts";
import { resolveBundledAssetUrl } from "../shared/bundledAssetUrl";

type CardPreviewProps = {
  card: StudyCard;
  settings?: AppSettings;
  defaultShowBack?: boolean;
  reviewActions?: boolean;
  answerToggleClassName?: string;
  answerToggleTargetId?: string;
  onReview?: (rating: ReviewRating) => void;
  onToggleBack?: (showBack: boolean) => void;
  reviewActionsClassName?: string;
  reviewActionsTargetId?: string;
  onStartWritingPractice?: (card: StudyCard, promptIndex?: number) => void;
};

type CardYouTubePlayer = {
  getCurrentTime(): number;
  getPlayerState(): number;
  playVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  destroy(): void;
};

type CardYouTubePlayerCommand =
  | {
      source: typeof CARD_YOUTUBE_HOST_SOURCE;
      type: "load";
      videoId: string;
      startSeconds: number;
      endSeconds?: number;
      loopEnabled: boolean;
    }
  | {
      source: typeof CARD_YOUTUBE_HOST_SOURCE;
      type: "seek";
      seconds: number;
      allowSeekAhead: boolean;
    }
  | {
      source: typeof CARD_YOUTUBE_HOST_SOURCE;
      type: "play" | "destroy";
    };

type CardYouTubePlayerMessage = {
  source?: string;
  type?: string;
  state?: number;
  currentTime?: number;
};

type LifeSpeakerColorStyle = CSSProperties & {
  "--life-speaker-avatar-bg"?: string;
  "--life-speaker-avatar-border"?: string;
  "--life-speaker-avatar-color"?: string;
  "--life-speaker-name-color"?: string;
  "--life-speaker-bubble-bg"?: string;
  "--life-speaker-bubble-border"?: string;
};

const YOUTUBE_PLAYER_STATE_ENDED = 0;
const YOUTUBE_PLAYER_STATE_PLAYING = 1;
const CARD_YOUTUBE_HOST_SOURCE = "lem-listening-youtube-host";
const CARD_YOUTUBE_PLAYER_SOURCE = "lem-listening-youtube-player";
const LIFE_SPEAKER_COLOR_PALETTE = [
  {
    avatarBg: "#e0f2fe",
    avatarBorder: "#7dd3fc",
    avatarColor: "#075985",
    nameColor: "#0369a1",
    bubbleBg: "#f0f9ff",
    bubbleBorder: "#bae6fd"
  },
  {
    avatarBg: "#fef3c7",
    avatarBorder: "#fbbf24",
    avatarColor: "#92400e",
    nameColor: "#b45309",
    bubbleBg: "#fffbeb",
    bubbleBorder: "#fde68a"
  },
  {
    avatarBg: "#dcfce7",
    avatarBorder: "#86efac",
    avatarColor: "#166534",
    nameColor: "#15803d",
    bubbleBg: "#f0fdf4",
    bubbleBorder: "#bbf7d0"
  },
  {
    avatarBg: "#f3e8ff",
    avatarBorder: "#c084fc",
    avatarColor: "#6b21a8",
    nameColor: "#7e22ce",
    bubbleBg: "#faf5ff",
    bubbleBorder: "#e9d5ff"
  },
  {
    avatarBg: "#ffe4e6",
    avatarBorder: "#fb7185",
    avatarColor: "#9f1239",
    nameColor: "#be123c",
    bubbleBg: "#fff1f2",
    bubbleBorder: "#fecdd3"
  }
];

export function CardPreview({
  card,
  settings,
  defaultShowBack = false,
  reviewActions = false,
  answerToggleClassName,
  answerToggleTargetId,
  onReview,
  onToggleBack,
  reviewActionsClassName,
  reviewActionsTargetId,
  onStartWritingPractice
}: CardPreviewProps) {
  const { i18n, t } = useTranslation();
  const appLocale = i18n.resolvedLanguage?.startsWith("en") ? "en" : "ko";
  const [showBack, setShowBack] = useState(defaultShowBack);
  const [isPlayingTts, setIsPlayingTts] = useState(false);
  const [playingSentenceText, setPlayingSentenceText] = useState("");
  const [ttsStatus, setTtsStatus] = useState("");

  useEffect(() => {
    setShowBack(defaultShowBack);
  }, [card.id, defaultShowBack]);

  async function handlePlayTts() {
    if (isPlayingTts) {
      return;
    }
    setIsPlayingTts(true);
    setTtsStatus("");
    try {
      setTtsStatus(await playCardTts(card, settings));
    } catch {
      setTtsStatus(t("cardPreview.errors.tts"));
    } finally {
      setIsPlayingTts(false);
    }
  }

  async function handlePlaySentence(text: string) {
    if (isPlayingTts) {
      return;
    }
    setIsPlayingTts(true);
    setPlayingSentenceText(text);
    setTtsStatus("");
    try {
      setTtsStatus(await playTextTts(card, text, settings));
    } catch {
      setTtsStatus(t("cardPreview.errors.tts"));
    } finally {
      setIsPlayingTts(false);
      setPlayingSentenceText("");
    }
  }

  const cardClassName = [
    "study-card",
    card.cardType === "life_expression" ? "life-expression-card" : "",
    card.cardType === "reading" && card.deckType === "input" ? "input-reading-card" : "",
    card.cardType === "reading" && card.deckType === "input-listening"
      ? "input-listening-card"
      : ""
  ]
    .filter(Boolean)
    .join(" ");
  const answerPanelId = `card-preview-answer-${card.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  return (
    <article
      aria-label={t("cardPreview.cardAria", {
        deck: getCardDeckLabel(card, appLocale)
      })}
      className={cardClassName}
    >
      {card.cardType === "life_expression" ? (
        <LifeExpressionFront card={card} />
      ) : card.deckType === "input-listening" ? (
        <InputListeningCardFront
          card={card}
          isPlayingTts={isPlayingTts}
          onPlayTts={handlePlayTts}
        />
      ) : (
        <ReadingCardFront card={card} isPlayingTts={isPlayingTts} onPlayTts={handlePlayTts} />
      )}

      <div className="card-preview-actions">
        <button
          aria-controls={answerPanelId}
          aria-expanded={showBack}
          className={`button secondary ${answerToggleClassName ?? ""}`}
          data-tutorial-target-id={answerToggleTargetId}
          type="button"
          onClick={() => {
            setShowBack((value) => {
              const nextShowBack = !value;
              onToggleBack?.(nextShowBack);
              return nextShowBack;
            });
          }}
        >
          <BookOpenCheck size={18} />
          {showBack
            ? t("cardPreview.actions.collapse")
            : t("cardPreview.actions.showAnswer")}
        </button>
      </div>

      {showBack ? (
        <section className="card-face card-back" id={answerPanelId}>
          <div className="card-face-label">{t("cardPreview.face.back")}</div>
          {card.cardType === "life_expression" ? (
            <LifeExpressionBack
              card={card}
              isPlayingTts={isPlayingTts}
              playingSentenceText={playingSentenceText}
              onPlayTts={handlePlayTts}
              onPlaySentence={(text) => void handlePlaySentence(text)}
              showInlinePronunciationRecorder={!reviewActions}
              onStartWritingPractice={onStartWritingPractice}
            />
          ) : (
            <ReadingCardBack
              card={card}
              playingSentenceText={playingSentenceText}
              onPlaySentence={(text) => void handlePlaySentence(text)}
            />
          )}
          {reviewActions ? (
            <ReviewButtons
              card={card}
              className={reviewActionsClassName}
              onReview={onReview}
              targetId={reviewActionsTargetId}
            />
          ) : null}
        </section>
      ) : null}
      {ttsStatus ? (
        <p className="tts-status compact" aria-live="polite" role="status">
          {ttsStatus}
        </p>
      ) : null}
    </article>
  );
}

function ReadingCardFront({
  card,
  isPlayingTts,
  onPlayTts
}: {
  card: StudyCard;
  isPlayingTts: boolean;
  onPlayTts: () => void;
}) {
  const { t } = useTranslation();
  if (card.cardType === "reading" && card.deckType === "input") {
    return (
      <section className="card-face card-front input-reading-front">
        <CardFaceHeader card={card} label={t("cardPreview.face.front")} />
        <div className="reading-front-hero">
          <span className="reading-front-kicker">
            <BookOpenCheck size={15} />
            {t("cardPreview.reading.readFirst")}
          </span>
          <p className="front-sentence reading-front-sentence">
            <HighlightedText
              text={card.frontText || card.sourceSentence}
              mappings={card.highlightMappings}
              target="source"
            />
          </p>
          <div className="reading-front-actionbar">
            <p>{t("cardPreview.reading.inferRole")}</p>
            <button
              className="button ghost reading-listen-button"
              disabled={isPlayingTts}
              title={t("cardPreview.actions.listenSentenceTitle")}
              type="button"
              onClick={onPlayTts}
            >
              <Volume2 size={17} />
              {isPlayingTts
                ? t("cardPreview.actions.playing")
                : t("cardPreview.actions.listenSentence")}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="card-face card-front">
      <CardFaceHeader card={card} label={t("cardPreview.face.front")} />
      <p className="front-sentence">
        <HighlightedText
          text={card.frontText || card.sourceSentence}
          mappings={card.highlightMappings}
          target="source"
        />
      </p>
      <button
        className="button ghost center-button"
        disabled={isPlayingTts}
        title={t("cardPreview.actions.listenSentenceTitle")}
        type="button"
        onClick={onPlayTts}
      >
        <Volume2 size={18} />
        {isPlayingTts
          ? t("cardPreview.actions.playing")
          : t("cardPreview.actions.listenSentence")}
      </button>
    </section>
  );
}

function ReadingCardBack({
  card,
  onPlaySentence,
  playingSentenceText
}: {
  card: StudyCard;
  onPlaySentence: (text: string) => void;
  playingSentenceText: string;
}) {
  const { t } = useTranslation();
  if (card.cardType === "reading" && card.deckType === "input-listening") {
    return (
      <InputListeningCardBack
        card={card}
        onPlaySentence={onPlaySentence}
        playingSentenceText={playingSentenceText}
      />
    );
  }

  if (card.cardType === "reading" && card.deckType === "input") {
    return <InputReadingCardBack card={card} />;
  }

  return (
    <>
      <div className="card-section">
        <h3>
          <Languages size={18} />
          {t("cardPreview.sections.literal")}
        </h3>
        <p>
          <HighlightedText
            text={card.literalTranslationKo}
            mappings={card.highlightMappings}
            target="literal"
          />
        </p>
      </div>
      <div className="card-section">
        <h3>
          <MessageSquareText size={18} />
          {t("cardPreview.sections.naturalMeaning")}
        </h3>
        <p>
          <HighlightedText
            text={card.naturalTranslationKo}
            mappings={card.highlightMappings}
            target="natural"
          />
        </p>
      </div>
      <VocabularySections card={card} />
      {card.deckType !== "input" && card.structureNote ? (
        <LifeCardSection
          icon={<ListChecks size={18} />}
          title={t("cardPreview.sections.sentenceStructure")}
          text={card.structureNote}
        />
      ) : null}
      <ComparisonSections card={card} />
    </>
  );
}

function InputListeningCardFront({
  card,
  isPlayingTts,
  onPlayTts
}: {
  card: StudyCard;
  isPlayingTts: boolean;
  onPlayTts: () => void;
}) {
  const { t } = useTranslation();
  const [playbackKey, setPlaybackKey] = useState(0);
  const [videoUnavailable, setVideoUnavailable] = useState(false);
  const [audioUnavailable, setAudioUnavailable] = useState(false);
  const [playbackWarning, setPlaybackWarning] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const playerRef = useRef<CardYouTubePlayer | null>(null);
  const pendingAutoplayRef = useRef(false);
  const source = getInputListeningSource(card);
  const videoClip = card.listeningMedia?.videoClip;
  const audioClip = card.listeningMedia?.audioClip;
  const frameImage = card.listeningMedia?.frameImage;
  const videoClipUrl = resolveBundledAssetUrl(videoClip?.fileUrl);
  const audioClipUrl = resolveBundledAssetUrl(audioClip?.fileUrl);
  const frameImageUrl = resolveBundledAssetUrl(frameImage?.fileUrl);
  const runtimeTts = card.listeningMedia?.runtimeTts;
  const hasStoredVideoClip = Boolean(videoClipUrl && !videoUnavailable);
  const hasStoredAudioClip = Boolean(audioClipUrl && !audioUnavailable);
  const hasOriginalPlayback = hasStoredVideoClip || hasStoredAudioClip || Boolean(source);
  const hasRuntimeTts = Boolean(runtimeTts?.generatedOnDevice && runtimeTts.text.trim());
  const formatRange = (start: number, end?: number) =>
    typeof end === "number" && end > start
      ? `${formatListeningTime(start)} - ${formatListeningTime(end)}`
      : t("cardPreview.listening.startsAt", { time: formatListeningTime(start) });

  useEffect(() => {
    setPlaybackKey(0);
    setVideoUnavailable(false);
    setAudioUnavailable(false);
    setPlaybackWarning("");
    pendingAutoplayRef.current = false;
  }, [audioClip?.fileUrl, card.id, videoClip?.fileUrl]);

  useEffect(() => {
    playerRef.current = null;
    if (!source || !iframeRef.current) {
      return;
    }

    let cancelled = false;
    let player: CardYouTubePlayer | null = null;

    player = createCardYouTubePlayerBridge(iframeRef.current, source, () => {
      if (cancelled || !player) {
        return;
      }
      playerRef.current = player;
      if (pendingAutoplayRef.current) {
        pendingAutoplayRef.current = false;
        player.seekTo(source.start, true);
        player.playVideo();
      }
    });
    playerRef.current = player;

    return () => {
      cancelled = true;
      if (playerRef.current === player) {
        playerRef.current = null;
      }
      try {
        player?.destroy();
      } catch {
        // The local player iframe may already be gone during React remounts.
      }
    };
  }, [card.id, playbackKey, source?.end, source?.start, source?.videoId]);

  function playOriginalSegment() {
    if (hasStoredVideoClip && videoRef.current) {
      videoRef.current.currentTime = 0;
      void videoRef.current.play().catch(() => {
        setVideoUnavailable(true);
        setPlaybackWarning(t("cardPreview.listening.cannotPlayVideo"));
      });
      return;
    }

    if (hasStoredAudioClip && audioRef.current) {
      audioRef.current.currentTime = 0;
      void audioRef.current.play().catch(() => {
        setAudioUnavailable(true);
        setPlaybackWarning(t("cardPreview.listening.cannotPlayAudio"));
      });
      return;
    }

    if (!source && hasRuntimeTts) {
      setPlaybackWarning("");
      onPlayTts();
      return;
    }

    if (!source) {
      setPlaybackWarning(t("cardPreview.listening.noAudioHint"));
      return;
    }

    pendingAutoplayRef.current = true;
    const player = playerRef.current;
    if (player) {
      try {
        player.seekTo(source.start, true);
        player.playVideo();
        pendingAutoplayRef.current = false;
        return;
      } catch {
        playerRef.current = null;
      }
    }
    setPlaybackKey((value) => value + 1);
  }

  return (
    <section className="card-face card-front input-listening-front">
      <CardFaceHeader card={card} label={t("cardPreview.face.front")} />
      {hasStoredVideoClip && videoClip ? (
        <div className="input-listening-video-card">
          <video
            className="input-listening-embed"
            controls
            onError={() => setVideoUnavailable(true)}
            poster={frameImageUrl || undefined}
            preload="metadata"
            ref={videoRef}
            src={videoClipUrl}
          />
          <div className="input-listening-video-meta">
            <span>{t("cardPreview.listening.originalVideo")}</span>
            <strong>{formatRange(videoClip.start, videoClip.end)}</strong>
          </div>
        </div>
      ) : hasStoredAudioClip && audioClip ? (
        <div className="input-listening-audio-card">
          {frameImageUrl ? (
            <img
              alt={t("cardPreview.listening.sceneAlt")}
              className="input-listening-frame-image"
              src={frameImageUrl}
            />
          ) : null}
          <div className="input-listening-audio-panel">
            <Volume2 size={24} />
            <div>
              <strong>
                {frameImageUrl
                  ? t("cardPreview.listening.savedVideoSegment")
                  : t("cardPreview.listening.originalAudio")}
              </strong>
              <span>{formatRange(audioClip.start, audioClip.end)}</span>
            </div>
          </div>
          <audio
            className="input-listening-audio-control"
            controls
            onError={() => setAudioUnavailable(true)}
            preload="metadata"
            ref={audioRef}
            src={audioClipUrl}
          />
        </div>
      ) : source ? (
        <div className="input-listening-video-card">
          <iframe
            key={`${card.id}-${playbackKey}`}
            ref={iframeRef}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="input-listening-embed"
            src={buildInputListeningPlayerUrl(source)}
            title={t("cardPreview.listening.originalPlayerTitle")}
          />
          <div className="input-listening-video-meta">
            <span>{t("cardPreview.listening.originalSegment")}</span>
            <strong>{formatRange(source.start, source.end)}</strong>
          </div>
        </div>
      ) : hasRuntimeTts ? (
        <div className="input-listening-audio-card">
          {frameImageUrl ? (
            <img
              alt={t("cardPreview.listening.sceneAlt")}
              className="input-listening-frame-image"
              src={frameImageUrl}
            />
          ) : null}
          <div className="input-listening-audio-panel">
            <Volume2 size={24} />
            <div>
              <strong>{t("cardPreview.listening.deviceTtsSample")}</strong>
              <span>{t("cardPreview.listening.deviceTtsDescription")}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="input-listening-audio-panel">
          <Volume2 size={24} />
          <div>
            <strong>{t("cardPreview.listening.originalSegment")}</strong>
            <span>{t("cardPreview.listening.noOriginalAudio")}</span>
          </div>
        </div>
      )}
      {audioClip && audioUnavailable ? (
        <div className="input-listening-media-warning" role="alert">
          {t("cardPreview.listening.missingAudioFile")}
        </div>
      ) : null}
      {videoClip && videoUnavailable ? (
        <div className="input-listening-media-warning" role="alert">
          {t("cardPreview.listening.missingVideoFile")}
        </div>
      ) : null}
      {(!hasOriginalPlayback && !hasRuntimeTts) || playbackWarning ? (
        <div className="input-listening-media-warning" role="alert">
          {playbackWarning || t("cardPreview.listening.noMediaHint")}
        </div>
      ) : null}
      <button
        className="button ghost center-button"
        disabled={(!hasOriginalPlayback && !hasRuntimeTts) || isPlayingTts}
        title={
          hasOriginalPlayback
            ? t("cardPreview.listening.listenOriginal")
            : hasRuntimeTts
              ? t("cardPreview.listening.listenDeviceTts")
              : t("cardPreview.listening.noStoredMedia")
        }
        type="button"
        onClick={playOriginalSegment}
      >
        <Volume2 size={18} />
        {hasOriginalPlayback
          ? hasStoredVideoClip
            ? t("cardPreview.listening.replayVideo")
            : t("cardPreview.listening.replayAudio")
          : hasRuntimeTts
            ? isPlayingTts
              ? t("cardPreview.actions.playing")
              : t("cardPreview.listening.playDeviceTts")
            : t("cardPreview.listening.noOriginalButton")}
      </button>
    </section>
  );
}

function InputListeningCardBack({
  card,
  onPlaySentence,
  playingSentenceText
}: {
  card: StudyCard;
  onPlaySentence: (text: string) => void;
  playingSentenceText: string;
}) {
  const { t } = useTranslation();
  const annotations = getInputListeningAnnotations(card);
  const meaningText = card.naturalTranslationKo || card.literalTranslationKo || "";
  const translationMappings = getInputListeningTranslationHighlightMappings(card, meaningText);
  const usesAdaptiveListeningTemplate = Boolean(card.listeningStudyGuide);

  return (
    <>
      <div className="card-section input-listening-source-section">
        <h3>
          <Mic2 size={18} />
          {t("cardPreview.sections.sentence")}
        </h3>
        <p className="listening-prosody-line">
          <AnnotatedListeningText
            text={card.sourceSentence || card.frontText}
            mappings={card.highlightMappings}
            annotations={annotations}
          />
        </p>
      </div>
      <div className="card-section input-listening-meaning-section">
        <h3>
          <MessageSquareText size={18} />
          {t("cardPreview.sections.meaning")}
        </h3>
        <p>
          <HighlightedText
            text={meaningText}
            mappings={translationMappings}
            target="natural"
          />
        </p>
      </div>
      {card.listeningStudyGuide ? (
        <ListeningAdaptiveGuide
          guide={card.listeningStudyGuide}
          sentence={card.sourceSentence || card.frontText}
          onPlaySentence={onPlaySentence}
          playingSentenceText={playingSentenceText}
        />
      ) : null}
      {!usesAdaptiveListeningTemplate ? <ListeningSoundPointsSection annotations={annotations} /> : null}
      {!usesAdaptiveListeningTemplate ? <VocabularySections card={card} /> : null}
      {!usesAdaptiveListeningTemplate ? <ComparisonSections card={card} /> : null}
      {!usesAdaptiveListeningTemplate && card.structureNote ? (
        <LifeCardSection
          icon={<ListChecks size={18} />}
          title={t("cardPreview.sections.source")}
          text={card.structureNote}
        />
      ) : null}
      {!usesAdaptiveListeningTemplate && annotations.length ? (
        <p className="listening-ai-note listening-ai-note-footer">
          {t("cardPreview.listening.aiProsodyNote")}
        </p>
      ) : null}
    </>
  );
}

type AnnotatedListeningTextMatch = {
  start: number;
  end: number;
  colorKey?: HighlightMapping["colorKey"];
  annotation?: StudyCardListeningAnnotation;
};

function AnnotatedListeningText({
  text = "",
  mappings,
  annotations
}: {
  text?: string;
  mappings: HighlightMapping[];
  annotations: StudyCardListeningAnnotation[];
}) {
  const matches = findAnnotatedListeningTextMatches(text, mappings, annotations);
  if (!matches.length) {
    return <span>{text}</span>;
  }

  const parts: ReactNode[] = [];
  let cursor = 0;
  matches.forEach((match, index) => {
    if (match.start > cursor) {
      parts.push(text.slice(cursor, match.start));
    }
    const value = text.slice(match.start, match.end);
    const markClass = match.annotation ? ` listening-mark-${match.annotation.mark}` : "";
    const title = match.annotation?.label || value;
    const className = [
      match.colorKey ? `highlight highlight-${match.colorKey}` : "",
      "listening-prosody-token",
      markClass.trim()
    ]
      .filter(Boolean)
      .join(" ");
    const content = match.colorKey ? (
      <mark className={className} key={`${match.start}-${match.end}-${index}`} title={title}>
        {value}
      </mark>
    ) : (
      <span className={className} key={`${match.start}-${match.end}-${index}`} title={title}>
        {value}
      </span>
    );
    parts.push(content);
    cursor = match.end;
  });

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }
  return <span>{parts}</span>;
}

function ListeningSoundPointsSection({
  annotations
}: {
  annotations: StudyCardListeningAnnotation[];
}) {
  const { t } = useTranslation();
  const points = annotations
    .map((annotation) => annotation.label?.trim())
    .filter((label): label is string => Boolean(label))
    .slice(0, 3);
  const legendItems = getListeningProsodyLegendItems(annotations);
  if (!points.length && !legendItems.length) {
    return null;
  }
  return (
    <div className="card-section input-listening-sound-points">
      <h3>
        <Mic2 size={18} />
        {t("cardPreview.listening.soundPoints")}
      </h3>
      {legendItems.length ? (
        <div
          className="listening-prosody-legend"
          aria-label={t("cardPreview.listening.prosodyLegendAria")}
        >
          {legendItems.map((item) => (
            <span className="listening-prosody-legend-item" key={item.mark}>
              <strong>
                {item.mark === "reduced"
                  ? t("cardPreview.listening.prosody.reducedSymbol")
                  : item.symbol}
              </strong>
              {t(item.labelKey)}
            </span>
          ))}
        </div>
      ) : null}
      {points.length ? (
        <ul>
          {points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function getListeningProsodyLegendItems(annotations: StudyCardListeningAnnotation[]) {
  const usedMarks = new Set(annotations.map((annotation) => annotation.mark));
  return listeningProsodyLegendItems.filter((item) => usedMarks.has(item.mark));
}

const listeningProsodyLegendItems = [
  { mark: "stress-dot", symbol: "•", labelKey: "cardPreview.listening.prosody.stress" },
  {
    mark: "strong-stress-dot",
    symbol: "••",
    labelKey: "cardPreview.listening.prosody.strongStress"
  },
  { mark: "rising-curve", symbol: "↗", labelKey: "cardPreview.listening.prosody.rising" },
  { mark: "falling-curve", symbol: "↘", labelKey: "cardPreview.listening.prosody.falling" },
  {
    mark: "continuing-curve",
    symbol: "⌒",
    labelKey: "cardPreview.listening.prosody.continuing"
  },
  { mark: "linking-bridge", symbol: "⌒", labelKey: "cardPreview.listening.prosody.linking" },
  { mark: "reduced", symbol: "weak", labelKey: "cardPreview.listening.prosody.reduced" }
] as const satisfies ReadonlyArray<{
  mark: StudyCardListeningAnnotation["mark"];
  symbol: string;
  labelKey: string;
}>;

function getInputListeningAnnotations(card: StudyCard): StudyCardListeningAnnotation[] {
  const sourceSentence = card.sourceSentence || card.frontText;
  if (card.listeningAnnotations?.length) {
    return card.listeningAnnotations
      .filter((annotation) => annotation.anchorText.trim())
      .map((annotation) => ({
        ...annotation,
        label: getSharedListeningProsodyLabel(
          annotation.anchorText,
          annotation.mark,
          sourceSentence
        )
      }))
      .slice(0, 5);
  }
  return card.highlightMappings.slice(0, 5).map((mapping) => {
    const mark = inferDisplayListeningProsodyMark(mapping.sourceText);
    return {
      anchorText: mapping.sourceText,
      mark,
      label: getSharedListeningProsodyLabel(mapping.sourceText, mark, sourceSentence),
      confidence: 0.6
    };
  });
}

function getInputListeningTranslationHighlightMappings(
  card: StudyCard,
  meaningText: string
): HighlightMapping[] {
  return card.highlightMappings.map((mapping) => {
    const anchor =
      findMeaningHighlightAnchor(meaningText, mapping.naturalKo) ||
      findMeaningHighlightAnchor(meaningText, mapping.literalKo) ||
      findMeaningHighlightAnchorFromSource(meaningText, mapping.sourceText);
    return {
      ...mapping,
      literalKo: anchor || mapping.literalKo || mapping.naturalKo,
      naturalKo: anchor || mapping.naturalKo || mapping.literalKo
    };
  });
}

function findMeaningHighlightAnchor(meaningText: string, candidate?: string) {
  const normalized = candidate?.trim();
  if (!normalized) {
    return undefined;
  }
  if (meaningText.includes(normalized)) {
    return normalized;
  }
  for (const anchor of getKoreanHighlightAnchorCandidates(normalized)) {
    if (meaningText.includes(anchor)) {
      return anchor;
    }
  }
  return undefined;
}

function getKoreanHighlightAnchorCandidates(value: string) {
  const candidates: string[] = [];
  const tokens = value
    .replace(/[()[\]{}"'“”‘’.,!?;:·•]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  for (const token of tokens) {
    const cleaned = token.replace(/[^\p{Script=Hangul}]/gu, "");
    if (cleaned.length < 2) {
      continue;
    }
    const stems = [
      cleaned.replace(/들$/u, ""),
      cleaned.replace(/(은|는|이|가|을|를|에|에서|으로|로|와|과|도|만|부터|까지|보다|처럼)$/u, ""),
      cleaned
        .replace(/들$/u, "")
        .replace(/(은|는|이|가|을|를|에|에서|으로|로|와|과|도|만|부터|까지|보다|처럼)$/u, "")
    ];
    stems
      .map((stem) => stem.trim())
      .filter((stem) => stem.length >= 2)
      .forEach((stem) => candidates.push(stem));
  }

  return Array.from(new Set(candidates)).sort((left, right) => right.length - left.length);
}

function findMeaningHighlightAnchorFromSource(meaningText: string, sourceText: string) {
  const normalized = normalizeListeningAnchor(sourceText);
  for (const candidate of getSourceMeaningAnchorCandidates(normalized)) {
    if (meaningText.includes(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function getSourceMeaningAnchorCandidates(sourceText: string) {
  const candidates: string[] = [];
  const add = (...values: string[]) => values.forEach((value) => candidates.push(value));

  if (/big|important|major|key/.test(sourceText) && /moments?/.test(sourceText)) {
    add("중요한 순간", "큰 순간");
  }
  if (/first/.test(sourceText) && /(things?|moments?|time)/.test(sourceText)) {
    add("처음의 순간", "처음");
  }
  if (/moments?/.test(sourceText)) {
    add("순간");
  }
  if (/\bsecond\b|\bminute\b/.test(sourceText)) {
    add("잠시", "잠깐", "시간");
  }
  if (/figure.*out|work.*out/.test(sourceText)) {
    add("파악", "알아내", "이해");
  }
  if (/head.*out|leave|go out/.test(sourceText)) {
    add("출발", "나가");
  }
  if (/packed|crowded/.test(sourceText)) {
    add("붐비", "꽉 찬");
  }
  if (/slipped?.*mind|forgot|forget/.test(sourceText)) {
    add("깜빡", "잊");
  }
  if (/walk.*through|explain|guide/.test(sourceText)) {
    add("설명", "안내");
  }
  if (/step.*by.*step/.test(sourceText)) {
    add("단계별", "차근차근");
  }
  if (/go.*over|received|landed/.test(sourceText)) {
    add("받아들여", "반응");
  }
  if (/date/.test(sourceText)) {
    add("데이트");
  }
  if (/thing/.test(sourceText)) {
    add("일", "것", "경험");
  }

  return Array.from(new Set(candidates)).sort((left, right) => right.length - left.length);
}

function findAnnotatedListeningTextMatches(
  text: string,
  mappings: HighlightMapping[],
  annotations: StudyCardListeningAnnotation[]
): AnnotatedListeningTextMatch[] {
  const annotationsByAnchor = new Map(
    annotations.map((annotation) => [
      normalizeListeningAnchor(annotation.anchorText),
      annotation
    ])
  );
  const matches: AnnotatedListeningTextMatch[] = [];
  for (const mapping of mappings) {
    const sourceText = mapping.sourceText.trim();
    if (!sourceText) {
      continue;
    }
    const annotation = annotationsByAnchor.get(normalizeListeningAnchor(sourceText));
    matches.push(
      ...findListeningAnchorRanges(text, sourceText).map((range) => ({
        ...range,
        colorKey: mapping.colorKey,
        annotation
      }))
    );
  }

  for (const annotation of annotations) {
    const alreadyCovered = matches.some(
      (match) => normalizeListeningAnchor(text.slice(match.start, match.end)) ===
        normalizeListeningAnchor(annotation.anchorText)
    );
    if (alreadyCovered) {
      continue;
    }
    matches.push(
      ...findListeningAnchorRanges(text, annotation.anchorText).map((range) => ({
        ...range,
        annotation
      }))
    );
  }

  return matches
    .sort((left, right) => left.start - right.start || right.end - right.start - (left.end - left.start))
    .reduce<AnnotatedListeningTextMatch[]>((accepted, match) => {
      const overlaps = accepted.some(
        (existing) => match.start < existing.end && match.end > existing.start
      );
      return overlaps ? accepted : [...accepted, match];
    }, []);
}

function findListeningAnchorRanges(text: string, anchorText: string) {
  const escaped = escapeRegExp(anchorText.trim());
  if (!escaped) {
    return [];
  }
  const regex = new RegExp(escaped, "gi");
  const ranges: Array<{ start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    ranges.push({
      start: match.index,
      end: match.index + match[0].length
    });
    if (match[0].length === 0) {
      regex.lastIndex += 1;
    }
  }
  return ranges;
}

function inferDisplayListeningProsodyMark(
  sourceText: string
): StudyCardListeningAnnotation["mark"] {
  const normalized = normalizeListeningAnchor(sourceText);
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

function normalizeListeningAnchor(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function InputReadingCardBack({ card }: { card: StudyCard }) {
  const { t } = useTranslation();
  const translationMappings = getInputTranslationHighlightMappings(card);
  const sentenceStructure = card.readingStructure;

  return (
    <div className="input-reading-back-layout">
      <header className="reading-back-intro">
        <span>{t("cardPreview.reading.meaningStep")}</span>
        <div>
          <h2>{t("cardPreview.reading.meaningTitle")}</h2>
          <p>{t("cardPreview.reading.meaningDescription")}</p>
        </div>
      </header>
      <div className="input-translation-grid">
        <section className="input-translation-card input-translation-literal">
          <h3>
            <Languages size={18} />
            {t("cardPreview.sections.literal")}
          </h3>
          <p>
            <HighlightedText
              text={card.literalTranslationKo}
              mappings={translationMappings}
              target="literal"
            />
          </p>
        </section>
        <section className="input-translation-card input-translation-natural">
          <h3>
            <MessageSquareText size={18} />
            {t("cardPreview.sections.naturalMeaning")}
          </h3>
          <p>
            <HighlightedText
              text={card.naturalTranslationKo}
              mappings={translationMappings}
              target="natural"
            />
          </p>
        </section>
      </div>
      <section className="reading-vocabulary-stage">
        <header className="reading-flow-stage-header">
          <span>{t("cardPreview.reading.vocabularyStep")}</span>
          <h3>{t("cardPreview.reading.vocabularyTitle")}</h3>
          <p>{t("cardPreview.reading.vocabularyDescription")}</p>
        </header>
        <VocabularySections card={card} />
      </section>
      {sentenceStructure ? (
        <ReadingSentenceStructurePanel structure={sentenceStructure} />
      ) : null}
      <ComparisonSections card={card} />
      {card.structureNote ? (
        <LifeCardSection
          icon={<Link2 size={18} />}
          title={t("cardPreview.sections.source")}
          text={card.structureNote}
        />
      ) : null}
    </div>
  );
}

function ReadingSentenceStructurePanel({
  structure
}: {
  structure: ReadingSentenceStructure;
}) {
  const { t } = useTranslation();
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const segments = Array.isArray(structure?.segments) ? structure.segments : [];
  const groups = Array.isArray(structure?.groups) ? structure.groups : [];

  return (
    <section className="reading-structure-section reading-structure-primary">
      <header className="reading-structure-header">
        <div>
          <span>{t("cardPreview.reading.structureStep")}</span>
          <h3><Target size={17} />{t("cardPreview.sections.sentenceStructure")}</h3>
        </div>
        <p>{t("cardPreview.reading.structureDescription")}</p>
      </header>
      <div
        className="reading-segmented-sentence"
        aria-label={t("cardPreview.reading.structureAria")}
        onMouseLeave={() => setActiveGroupId(null)}
      >
        {segments.map((segment) => (
          <button
            aria-pressed={activeGroupId === segment.groupId}
            className={`reading-sentence-segment tone-${segment.tone} ${
              activeGroupId && activeGroupId !== segment.groupId ? "is-dimmed" : ""
            }`}
            key={segment.id}
            type="button"
            onBlur={() => setActiveGroupId(null)}
            onFocus={() => setActiveGroupId(segment.groupId)}
            onMouseEnter={() => setActiveGroupId(segment.groupId)}
          >
            <strong>{segment.text}</strong>
            <span>{segment.labelKo}</span>
          </button>
        ))}
      </div>

      <div
        className="reading-meaning-flow"
        aria-label={t("cardPreview.reading.meaningFlowAria")}
      >
        {groups.map((group) => {
          const groupSegments = segments.filter((segment) =>
            group.segmentIds.includes(segment.id)
          );
          return (
            <article
              className={`reading-meaning-group is-${group.kind} ${
                activeGroupId && activeGroupId !== group.id ? "is-dimmed" : ""
              } ${activeGroupId === group.id ? "is-active" : ""}`}
              key={group.id}
              tabIndex={0}
              onBlur={() => setActiveGroupId(null)}
              onFocus={() => setActiveGroupId(group.id)}
              onMouseEnter={() => setActiveGroupId(group.id)}
              onMouseLeave={() => setActiveGroupId(null)}
            >
              <span>{group.titleKo}</span>
              <div>
                {groupSegments.map((segment) => (
                  <p key={segment.id}>
                    <code>{segment.text}</code>
                    <small>{segment.labelKo}</small>
                  </p>
                ))}
              </div>
              <strong>{group.summaryKo}</strong>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ListeningAdaptiveGuide({
  guide,
  sentence,
  onPlaySentence,
  playingSentenceText
}: {
  guide: NonNullable<StudyCard["listeningStudyGuide"]>;
  sentence: string;
  onPlaySentence: (text: string) => void;
  playingSentenceText: string;
}) {
  const { i18n, t } = useTranslation();
  const numberFormatter = new Intl.NumberFormat(
    i18n.resolvedLanguage?.startsWith("en") ? "en-US" : "ko-KR"
  );
  return (
    <section className="listening-clean-guide">
      <header className="listening-clean-header">
        <div className="listening-clean-title">
          <span className="listening-clean-icon"><Headphones size={18} /></span>
          <div>
            <small>{t("cardPreview.listening.focusKicker")}</small>
            <strong>{t("cardPreview.listening.chunksTitle")}</strong>
          </div>
        </div>
        <button
          className="listening-replay-button"
          disabled={Boolean(playingSentenceText)}
          type="button"
          onClick={() => onPlaySentence(sentence)}
        >
          <Volume2 size={15} />
          {playingSentenceText === sentence
            ? t("cardPreview.actions.playing")
            : t("cardPreview.listening.listenAll")}
        </button>
      </header>

      <ol
        className="listening-flow-track"
        aria-label={t("cardPreview.listening.soundChunksAria")}
      >
        {guide.chunks.map((chunk, index) => (
          <li key={`${chunk.en}-${index}`}>
            <div className="listening-flow-heading">
              <span className="listening-flow-number">{numberFormatter.format(index + 1)}</span>
              <strong>{chunk.en}</strong>
              <button
                disabled={Boolean(playingSentenceText)}
                aria-label={t("cardPreview.listening.listenChunkAria", { text: chunk.en })}
                title={t("cardPreview.listening.listenChunkAria", { text: chunk.en })}
                type="button"
                onClick={() => onPlaySentence(chunk.en)}
              >
                <Volume2 size={14} />
              </button>
            </div>
            <p className="listening-flow-pronunciation">
              <b>{chunk.pronunciationKo}</b>
              <span>{chunk.ipa}</span>
            </p>
            <p className="listening-flow-reason">{chunk.reasonKo}</p>
          </li>
        ))}
      </ol>

      <div className="listening-clean-insight">
        <span>{t("cardPreview.listening.missedReason")}</span>
        <div>
          <strong>{guide.listeningIssue.title}</strong>
          <p>{guide.listeningIssue.bodyKo}</p>
        </div>
      </div>

      <details className="listening-clean-dictation">
        <summary>
          <span><Pencil size={15} />{t("cardPreview.listening.quickCheck")}</span>
          <small>{t("cardPreview.listening.dictation")}</small>
        </summary>
        <div className="listening-dictation-content">
          <p>{guide.dictation.prompt}</p>
          <strong>{t("cardPreview.listening.answer", { answer: guide.dictation.answer })}</strong>
          <small>{guide.dictation.explanationKo}</small>
        </div>
      </details>
    </section>
  );
}

function LifeExpressionFront({ card }: { card: StudyCard }) {
  const { t } = useTranslation();
  if (card.outputStudyGuide) {
    return (
      <section className="card-face card-front adaptive-output-card-face">
        <CardFaceHeader card={card} label={t("cardPreview.face.front")} />
        <AdaptiveOutputFront card={card} />
      </section>
    );
  }
  const preview = getLifeExpressionPreview(card);

  return (
    <section className="card-face card-front">
      <CardFaceHeader card={card} label={t("cardPreview.face.front")} />
      <div className="life-conversation-preview">
        {preview.summary ? (
          <div className="life-context-summary">
            <span>{t("cardPreview.life.context")}</span>
            <p>{preview.summary}</p>
          </div>
        ) : null}
        {preview.messages.length ? <LifeConversationThread messages={preview.messages} /> : null}
        <div className="life-target-reply">
          <span>{t("cardPreview.life.writingPrompt")}</span>
          <p>{preview.targetText}</p>
        </div>
      </div>
    </section>
  );
}

function LifeExpressionBack({
  card,
  isPlayingTts,
  playingSentenceText,
  onPlayTts,
  onPlaySentence,
  showInlinePronunciationRecorder,
  onStartWritingPractice
}: {
  card: StudyCard;
  isPlayingTts: boolean;
  playingSentenceText: string;
  onPlayTts: () => void;
  onPlaySentence: (text: string) => void;
  showInlinePronunciationRecorder: boolean;
  onStartWritingPractice?: (card: StudyCard, promptIndex?: number) => void;
}) {
  const { t } = useTranslation();
  if (card.outputStudyGuide) {
    return (
      <>
        <AdaptiveOutputBack
          card={card}
          playingSentenceText={playingSentenceText}
          onPlaySentence={(sentence) => onPlaySentence(sentence.en)}
        />
        {getWritingPracticePumpPrompts(card).length ? (
          <PumpActions
            card={card}
            prompts={getWritingPracticePumpPrompts(card)}
            onStartWritingPractice={onStartWritingPractice}
          />
        ) : null}
      </>
    );
  }
  const englishConversation = stripSectionHeading(card.literalTranslationKo, "영어 대화");
  const variants = stripSectionHeading(card.naturalTranslationKo, "내 답변 변형");
  const englishMessages = parseLifeConversationMessages(englishConversation);
  const targetEnglishReply = getLifeTargetEnglishReply(card, englishMessages, variants);
  const writingPracticePrompts = getWritingPracticePumpPrompts(card);

  return (
    <>
      <button
        className="button ghost center-button"
        disabled={isPlayingTts}
        title={t("cardPreview.life.listenReplyTitle")}
        type="button"
        onClick={onPlayTts}
      >
        <Volume2 size={18} />
        {isPlayingTts
          ? t("cardPreview.actions.playing")
          : t("cardPreview.life.listenReply")}
      </button>
      {showInlinePronunciationRecorder ? (
        <PronunciationRecorderSection targetText={targetEnglishReply} />
      ) : null}
      <LifeDialogueSection
        icon={<Languages size={18} />}
        title={t("cardPreview.life.targetDialogue")}
        messages={englishMessages}
        fallbackText={englishConversation}
      />
      <LifeReplyVariantsSection variantsText={variants} />
      {card.structureNote ? (
        <LifeCardSection
          icon={<ListChecks size={18} />}
          title={t("cardPreview.life.learningPoints")}
          text={card.structureNote}
        />
      ) : null}
      <VocabularySections card={card} />
      <ComparisonSections card={card} />
      {writingPracticePrompts.length ? (
        <PumpActions
          card={card}
          prompts={writingPracticePrompts}
          onStartWritingPractice={onStartWritingPractice}
        />
      ) : null}
    </>
  );
}

function LifeReplyVariantsSection({ variantsText }: { variantsText: string }) {
  const { t } = useTranslation();
  const variants = parseLifeReplyVariants(variantsText);
  if (!variants.length) {
    return null;
  }

  return (
    <div className="card-section life-card-section life-reply-variants-section">
      <h3>
        <MessageSquareText size={18} />
        {t("cardPreview.life.replyVariants")}
      </h3>
      <div className="life-reply-variant-list">
        {variants.map((variant, index) => (
          <div className="life-reply-variant" key={`${variant.text}-${index}`}>
            <div className="life-reply-variant-main">
              {variant.label ? <span>{variant.label}</span> : null}
              <strong>{variant.text}</strong>
            </div>
            {variant.translation ? (
              <p className="life-reply-variant-translation">{variant.translation}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

type LifeReplyVariant = {
  label?: string;
  text: string;
  translation?: string;
};

function parseLifeReplyVariants(value: string): LifeReplyVariant[] {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const variants: LifeReplyVariant[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const translationOnly = parseLifeReplyTranslationLine(line);
    if (translationOnly) {
      const lastVariant = variants[variants.length - 1];
      if (lastVariant && !lastVariant.translation) {
        lastVariant.translation = translationOnly;
      }
      continue;
    }

    const labelled = line.match(/^([^:：]{1,18})[:：]\s*(.+)$/);
    const variant: LifeReplyVariant = labelled
      ? { label: labelled[1].trim(), text: labelled[2].trim() }
      : { text: line };
    const nextTranslation = parseLifeReplyTranslationLine(lines[index + 1] ?? "");
    if (nextTranslation) {
      variant.translation = nextTranslation;
      index += 1;
    } else if (looksLikeTargetLanguageLine(variant.text) && looksLikeKoreanLine(lines[index + 1])) {
      variant.translation = lines[index + 1].trim();
      index += 1;
    }
    variants.push(variant);
  }

  return variants.filter((variant) => variant.text);
}

function parseLifeReplyTranslationLine(value: string) {
  return /^(?:뜻|의미|번역|한국어|한글)\s*[:：]\s*(.+)$/.exec(value.trim())?.[1]?.trim() ?? "";
}

function looksLikeTargetLanguageLine(value: string) {
  return /[A-Za-z]/.test(value);
}

function looksLikeKoreanLine(value: string | undefined) {
  return /[가-힣]/.test(value ?? "");
}

export function PronunciationRecorderSection({
  compact = false,
  isPlayingReference = false,
  onPlayReference,
  showTarget = true,
  targetText,
  title
}: {
  compact?: boolean;
  isPlayingReference?: boolean;
  onPlayReference?: () => void;
  showTarget?: boolean;
  targetText: string;
  title?: string;
}) {
  const { t } = useTranslation();
  const resolvedTitle = title || t("cardPreview.recorder.defaultTitle");
  const isSupported = canUseMicrophoneRecorder();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "processing" | "ready">(
    "idle"
  );
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onerror = null;
        recorder.onstop = null;
      }
      stopRecorderQuietly(recorder);
      stopStreamTracks(streamRef.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  async function startRecording() {
    if (!isSupported) {
      setErrorMessage(t("cardPreview.recorder.unavailable"));
      return;
    }

    setErrorMessage("");
    setAudioUrl(null);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);

      streamRef.current = stream;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        setErrorMessage(t("cardPreview.recorder.recordingError"));
        setRecordingState("idle");
        stopStreamTracks(streamRef.current);
        streamRef.current = null;
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm"
        });
        chunksRef.current = [];
        stopStreamTracks(streamRef.current);
        streamRef.current = null;
        recorderRef.current = null;

        if (blob.size === 0) {
          setErrorMessage(t("cardPreview.recorder.emptyRecording"));
          setRecordingState("idle");
          return;
        }

        setAudioUrl(URL.createObjectURL(blob));
        setRecordingState("ready");
      };

      recorder.start();
      setRecordingState("recording");
    } catch {
      setErrorMessage(t("cardPreview.recorder.permissionError"));
      setRecordingState("idle");
      stopStreamTracks(streamRef.current);
      streamRef.current = null;
      recorderRef.current = null;
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }
    setRecordingState("processing");
    recorder.stop();
  }

  return (
    <div
      className={`card-section life-card-section pronunciation-recorder-section ${compact ? "is-compact" : ""}`}
    >
      <h3>
        <Mic2 size={18} />
        {resolvedTitle}
      </h3>
      <p className="pronunciation-recorder-guide">
        {t("cardPreview.recorder.guide")}
      </p>
      {showTarget && targetText ? <p className="pronunciation-recorder-target">{targetText}</p> : null}
      {!isSupported ? (
        <p className="pronunciation-recorder-warning">
          {t("cardPreview.recorder.unsupportedHint")}
        </p>
      ) : (
        <>
          <div className="pronunciation-recorder-actions">
            {onPlayReference ? (
              <button
                className="button ghost"
                disabled={isPlayingReference}
                type="button"
                onClick={onPlayReference}
              >
                <Volume2 size={17} />
                {isPlayingReference
                  ? t("cardPreview.actions.playing")
                  : t("cardPreview.recorder.listenReference")}
              </button>
            ) : null}
            {recordingState === "recording" ? (
              <button className="button secondary" type="button" onClick={stopRecording}>
                <Mic2 size={17} />
                {t("cardPreview.recorder.stop")}
              </button>
            ) : (
              <button
                className="button ghost"
                disabled={recordingState === "processing"}
                type="button"
                onClick={() => void startRecording()}
              >
                <Mic2 size={17} />
                {recordingState === "ready"
                  ? t("cardPreview.recorder.retry")
                  : t("cardPreview.recorder.start")}
              </button>
            )}
          </div>
          {recordingState === "recording" ? (
            <p className="pronunciation-recorder-status" aria-live="polite" role="status">
              {t("cardPreview.recorder.recording")}
            </p>
          ) : null}
          {recordingState === "processing" ? (
            <p className="pronunciation-recorder-status" aria-live="polite" role="status">
              {t("cardPreview.recorder.processing")}
            </p>
          ) : null}
          {audioUrl ? (
            <div className="pronunciation-playback">
              <span>
                <Volume2 size={16} />
                {t("cardPreview.recorder.playback")}
              </span>
              <audio
                aria-label={t("cardPreview.recorder.playbackAria")}
                controls
                src={audioUrl}
              />
            </div>
          ) : null}
        </>
      )}
      {errorMessage ? (
        <p className="pronunciation-recorder-warning" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

function getLifeTargetEnglishReply(
  card: StudyCard,
  englishMessages: LifeConversationMessage[],
  variants: string
) {
  const meMessage = findLast(englishMessages, (message) => message.role === "me");
  return (
    card.targetText?.trim() ||
    meMessage?.text.trim() ||
    parseLifeReplyVariants(variants)[0]?.text ||
    ""
  );
}

function canUseMicrophoneRecorder() {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined"
  );
}

function stopRecorderQuietly(recorder: MediaRecorder | null) {
  if (!recorder || recorder.state === "inactive") {
    return;
  }
  try {
    recorder.stop();
  } catch {
    // The browser may already be tearing down the recorder.
  }
}

function stopStreamTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function LifeConversationThread({ messages }: { messages: LifeConversationMessage[] }) {
  const { t } = useTranslation();
  const [expandedIndexes, setExpandedIndexes] = useState<Set<number>>(() => new Set());
  const speakerColorIndexes = getLifeSpeakerColorIndexes(messages);

  function toggleExpanded(index: number) {
    setExpandedIndexes((current) => {
      const next = new Set(current);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  return (
    <div className="life-chat-thread">
      {messages.map((message, index) => {
        const isCollapsible = shouldCollapseLifeMessage(message);
        const isExpanded = expandedIndexes.has(index);
        const shouldClamp = isCollapsible && !isExpanded;
        const speakerStyle =
          message.role === "other"
            ? getLifeSpeakerColorStyle(message.speaker, speakerColorIndexes)
            : undefined;
        return (
          <div
            className={`life-chat-row life-chat-row-${message.role}`}
            key={`${message.speaker}-${message.text.slice(0, 32)}-${index}`}
            style={speakerStyle}
          >
            {message.role === "other" ? (
              <span className="life-chat-avatar" title={message.speaker}>
                {getSpeakerInitials(message.speaker)}
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
                  aria-expanded={isExpanded}
                  onClick={() => toggleExpanded(index)}
                >
                  {isExpanded
                    ? t("cardPreview.life.collapse")
                    : t("cardPreview.life.expand")}
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LifeDialogueSection({
  icon,
  title,
  messages,
  fallbackText
}: {
  icon: ReactNode;
  title: string;
  messages: LifeConversationMessage[];
  fallbackText?: string;
}) {
  if (!messages.length && !fallbackText?.trim()) {
    return null;
  }

  return (
    <div className="card-section life-card-section life-dialogue-section">
      <h3>
        {icon}
        {title}
      </h3>
      {messages.length ? (
        <LifeConversationThread messages={messages} />
      ) : (
        fallbackText?.split("\n").map((line, index) => (
          <p className={line.trim() ? undefined : "compact"} key={`${line}-${index}`}>
            {line}
          </p>
        ))
      )}
    </div>
  );
}

function getSpeakerInitials(value: string) {
  const normalized = normalizeSpeaker(value);
  if (!normalized) {
    return "?";
  }
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return normalized.slice(0, 2).toUpperCase();
}

function normalizeSpeaker(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function getLifeSpeakerColorIndexes(messages: LifeConversationMessage[]) {
  const colorIndexes = new Map<string, number>();
  for (const message of messages) {
    if (message.role !== "other") {
      continue;
    }
    const key = getLifeSpeakerColorKey(message.speaker);
    if (!key || colorIndexes.has(key)) {
      continue;
    }
    colorIndexes.set(key, colorIndexes.size % LIFE_SPEAKER_COLOR_PALETTE.length);
  }
  return colorIndexes;
}

function getLifeSpeakerColorStyle(
  speaker: string,
  speakerColorIndexes: Map<string, number>
): LifeSpeakerColorStyle {
  const key = getLifeSpeakerColorKey(speaker);
  const color =
    LIFE_SPEAKER_COLOR_PALETTE[
      speakerColorIndexes.get(key) ?? getStableSpeakerColorIndex(speaker)
    ];
  return {
    "--life-speaker-avatar-bg": color.avatarBg,
    "--life-speaker-avatar-border": color.avatarBorder,
    "--life-speaker-avatar-color": color.avatarColor,
    "--life-speaker-name-color": color.nameColor,
    "--life-speaker-bubble-bg": color.bubbleBg,
    "--life-speaker-bubble-border": color.bubbleBorder
  };
}

function getLifeSpeakerColorKey(speaker: string) {
  return normalizeSpeaker(speaker).toLowerCase();
}

function getStableSpeakerColorIndex(speaker: string) {
  const key = getLifeSpeakerColorKey(speaker);
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) % LIFE_SPEAKER_COLOR_PALETTE.length;
  }
  return hash;
}

function findLast<T>(items: T[], predicate: (item: T) => boolean) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) {
      return items[index];
    }
  }
  return undefined;
}

function CardFaceHeader({ card, label }: { card: StudyCard; label: string }) {
  const { i18n } = useTranslation();
  const appLocale = i18n.resolvedLanguage?.startsWith("en") ? "en" : "ko";
  return (
    <div className="card-face-header">
      <div className="card-face-label">{label}</div>
      <span
        className={`deck-pill deck-${card.deckType}`}
        title={getCardDeckLabel(card, appLocale)}
      >
        {getCardDeckShortLabel(card, appLocale)}
      </span>
    </div>
  );
}

function LifeCardSection({
  icon,
  title,
  text
}: {
  icon: ReactNode;
  title: string;
  text?: string;
}) {
  if (!text?.trim()) {
    return null;
  }

  return (
    <div className="card-section life-card-section">
      <h3>
        {icon}
        {title}
      </h3>
      {text.split("\n").map((line, index) => (
        <p className={line.trim() ? undefined : "compact"} key={`${line}-${index}`}>
          {line}
        </p>
      ))}
    </div>
  );
}

function VocabularySections({ card }: { card: StudyCard }) {
  const vocabularyItems =
    card.cardType === "reading" && card.deckType === "input-listening"
      ? filterInputListeningVocabularyItems(card.vocabularyItems)
      : card.vocabularyItems;
  if (vocabularyItems.length === 0) {
    return null;
  }

  if (card.cardType === "reading" && card.deckType === "input") {
    return <InputVocabularySections card={card} />;
  }

  return (
    <>
      <div className="legend-row">
        {vocabularyItems.map((item) => (
          <span key={item.term} className={`legend-item legend-${item.colorKey}`}>
            <span aria-hidden="true" className="legend-swatch" />
            {item.term} = {item.basicMeaningKo}
          </span>
        ))}
      </div>
      <div className="vocab-grid">
        {vocabularyItems.map((item) => (
          <section className="vocab-item" key={item.term}>
            <h4 className={`vocab-title text-${item.colorKey}`}>{item.term}</h4>
            <p className="muted compact">
              {item.ipa ? `${item.ipa} · ` : ""}
              {item.partOfSpeech}
            </p>
            <p>{item.basicMeaningKo}</p>
            {item.meaningInContextKo ? (
              <p className="muted">{item.meaningInContextKo}</p>
            ) : null}
            {item.examples.length ? (
              <VocabularyExampleList item={item} />
            ) : null}
          </section>
        ))}
      </div>
    </>
  );
}

function InputVocabularySections({ card }: { card: StudyCard }) {
  const { t } = useTranslation();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const items = getInputDisplayVocabularyItems(card);
  const safeSelectedIndex = Math.min(selectedIndex, items.length - 1);
  const selectedItem = items[safeSelectedIndex] ?? items[0];

  if (items.length === 1) {
    return (
      <div className="input-vocab-section input-vocab-section-single">
        <VocabularyDetailCard item={items[0]} badge={t("cardPreview.vocabulary.singleBadge")} />
      </div>
    );
  }

  if (items.length === 2) {
    return (
      <div className="input-vocab-section input-vocab-grid-two">
        {items.map((item) => (
          <VocabularyDetailCard item={item} key={item.term} />
        ))}
      </div>
    );
  }

  return (
    <div className="input-vocab-section input-vocab-master-detail">
      <div className="input-vocab-list" aria-label={t("cardPreview.vocabulary.listAria")}>
        {items.map((item, index) => (
          <button
            className={`input-vocab-list-item ${index === safeSelectedIndex ? "active" : ""}`}
            key={`${item.term}-${index}`}
            type="button"
            onClick={() => setSelectedIndex(index)}
          >
            <strong>{item.term}</strong>
            <span>{item.basicMeaningKo}</span>
          </button>
        ))}
      </div>
      <VocabularyDetailCard
        item={selectedItem}
        badge={t("cardPreview.vocabulary.selectedBadge")}
      />
    </div>
  );
}

function getInputTranslationHighlightMappings(card: StudyCard): HighlightMapping[] {
  const mappingsBySource = new Map<string, HighlightMapping>();

  for (const mapping of card.highlightMappings) {
    const key = normalizeHighlightSourceKey(mapping.sourceText);
    if (!key) {
      continue;
    }
    mappingsBySource.set(key, {
      ...mapping,
      sourceText: mapping.sourceText.trim()
    });
  }

  for (const item of getInputDisplayVocabularyItems(card)) {
    const key = normalizeHighlightSourceKey(item.term);
    if (!key) {
      continue;
    }
    const existing = mappingsBySource.get(key);
    const canSupplementFromVocabulary =
      Boolean(existing) || isVocabularyTermPresentInSource(card, item.term);
    if (!canSupplementFromVocabulary) {
      continue;
    }
    const next: HighlightMapping = {
      sourceText: existing?.sourceText || item.term,
      literalKo: existing?.literalKo || item.basicMeaningKo || item.meaningInContextKo,
      naturalKo: existing?.naturalKo || item.meaningInContextKo || item.basicMeaningKo,
      colorKey: existing?.colorKey || item.colorKey
    };
    mappingsBySource.set(key, next);
  }

  return Array.from(mappingsBySource.values());
}

function isVocabularyTermPresentInSource(card: StudyCard, term: string) {
  const normalizedTerm = term.replace(/\s+/g, " ").trim();
  if (!normalizedTerm) {
    return false;
  }
  const escaped = escapeRegExp(normalizedTerm).replace(/\\ /g, "\\s+");
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "iu");
  return [card.sourceSentence, card.frontText].some((text) => pattern.test(text ?? ""));
}

function getInputDisplayVocabularyItems(card: StudyCard) {
  return card.vocabularyItems.map((item) => completeInputVocabularyItem(item, card));
}

type InputListeningSource = {
  videoId: string;
  start: number;
  end?: number;
};

function getInputListeningSource(card: StudyCard): InputListeningSource | null {
  const targetMatch = /^listening:([^:]+):/.exec(card.targetText ?? "");
  const videoId = targetMatch?.[1];
  if (!videoId) {
    return null;
  }

  const range = parseListeningRange(card.structureNote ?? "");
  return {
    videoId,
    start: range?.start ?? 0,
    end: range?.end
  };
}

function parseListeningRange(value: string) {
  const match = /(\d+):(\d{2})\s*-\s*(\d+):(\d{2})/.exec(value);
  if (!match) {
    return null;
  }

  return {
    start: Number(match[1]) * 60 + Number(match[2]),
    end: Number(match[3]) * 60 + Number(match[4])
  };
}

function buildInputListeningPlayerUrl(source: InputListeningSource) {
  const url = new URL("/listening-youtube-player", LIFE_MINER_BRIDGE_BASE_URL);
  url.searchParams.set("videoId", source.videoId);
  url.searchParams.set("start", String(Math.max(0, Math.floor(source.start))));
  if (typeof source.end === "number" && source.end > source.start) {
    url.searchParams.set("end", String(Math.max(0, Math.ceil(source.end))));
    url.searchParams.set("loop", "1");
  } else {
    url.searchParams.set("loop", "0");
  }
  url.searchParams.set("controls", "1");
  return url.toString();
}

function createCardYouTubePlayerBridge(
  frame: HTMLIFrameElement,
  source: InputListeningSource,
  onReady: () => void
): CardYouTubePlayer {
  let isReady = false;
  let destroyed = false;
  let currentTime = source.start;
  let playerState = 0;
  const playerOrigin = new URL(LIFE_MINER_BRIDGE_BASE_URL).origin;
  const pendingCommands: CardYouTubePlayerCommand[] = [];

  function postCommand(command: CardYouTubePlayerCommand) {
    if (destroyed) {
      return;
    }
    if (!isReady || !frame.contentWindow) {
      pendingCommands.push(command);
      return;
    }
    frame.contentWindow.postMessage(command, playerOrigin);
  }

  function flushPendingCommands() {
    const commands = pendingCommands.splice(0);
    for (const command of commands) {
      frame.contentWindow?.postMessage(command, playerOrigin);
    }
  }

  function handleMessage(event: MessageEvent<CardYouTubePlayerMessage>) {
    if (event.origin !== playerOrigin || event.data?.source !== CARD_YOUTUBE_PLAYER_SOURCE) {
      return;
    }
    if (destroyed) {
      return;
    }

    if (event.data.type === "ready") {
      isReady = true;
      onReady();
      flushPendingCommands();
      return;
    }

    if (event.data.type === "time" && typeof event.data.currentTime === "number") {
      currentTime = event.data.currentTime;
      return;
    }

    if (event.data.type === "state" && typeof event.data.state === "number") {
      playerState = event.data.state;
    }
  }

  window.addEventListener("message", handleMessage);
  frame.src = buildInputListeningPlayerUrl(source);

  return {
    getCurrentTime() {
      return currentTime;
    },
    getPlayerState() {
      return playerState;
    },
    playVideo() {
      postCommand({ source: CARD_YOUTUBE_HOST_SOURCE, type: "play" });
    },
    seekTo(seconds, allowSeekAhead) {
      currentTime = seconds;
      postCommand({
        source: CARD_YOUTUBE_HOST_SOURCE,
        type: "seek",
        seconds,
        allowSeekAhead
      });
    },
    destroy() {
      destroyed = true;
      window.removeEventListener("message", handleMessage);
      try {
        frame.contentWindow?.postMessage(
          { source: CARD_YOUTUBE_HOST_SOURCE, type: "destroy" },
          playerOrigin
        );
      } catch {
        // The iframe may already be gone during Electron shutdown.
      }
      frame.removeAttribute("src");
    }
  };
}

function formatListeningTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const rest = String(safeSeconds % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function normalizeHighlightSourceKey(value: string) {
  return value.trim().toLowerCase();
}

function VocabularyDetailCard({ item, badge }: { item: StudyCard["vocabularyItems"][number]; badge?: string }) {
  const { t } = useTranslation();
  return (
    <section className={`input-vocab-detail-card border-${item.colorKey}`}>
      <div className="input-vocab-detail-header">
        <div>
          <h4 className={`input-vocab-term text-${item.colorKey}`}>{item.term}</h4>
          {item.ipa || item.partOfSpeech ? (
            <p className="muted compact">
              {item.ipa ? `${item.ipa} · ` : ""}
              {item.partOfSpeech}
            </p>
          ) : null}
        </div>
        {badge ? <span className="input-vocab-badge">{badge}</span> : null}
      </div>

      <div className="input-vocab-meaning-grid">
        <div className="input-vocab-meaning-card">
          <span>{t("cardPreview.vocabulary.basicMeaning")}</span>
          <p>{item.basicMeaningKo}</p>
        </div>
        {item.meaningInContextKo ? (
          <div className="input-vocab-meaning-card">
            <span>{t("cardPreview.vocabulary.contextMeaning")}</span>
            <p>{item.meaningInContextKo}</p>
          </div>
        ) : null}
      </div>

      {item.etymologyKo ? (
        <VocabularyDetailSubsection title={t("cardPreview.vocabulary.etymology")}>
          <p>{item.etymologyKo}</p>
        </VocabularyDetailSubsection>
      ) : null}

      {item.usagePatterns?.length ? (
        <VocabularyDetailSubsection title={t("cardPreview.vocabulary.patterns")}>
          <div className="input-vocab-patterns">
            {item.usagePatterns.map((pattern) => (
              <code key={pattern}>{pattern}</code>
            ))}
          </div>
        </VocabularyDetailSubsection>
      ) : null}

      {item.examples.length ? (
        <VocabularyDetailSubsection title={t("cardPreview.vocabulary.examples")}>
          <VocabularyExampleList item={item} />
        </VocabularyDetailSubsection>
      ) : null}
    </section>
  );
}

function VocabularyExampleList({ item }: { item: StudyCard["vocabularyItems"][number] }) {
  return (
    <ul className="vocab-example-list">
      {item.examples.map((example, index) => {
        const translation = item.exampleTranslationsKo?.[index]?.trim();
        return (
          <li key={`${example}-${index}`}>
            <span className="vocab-example-text">{example}</span>
            {translation ? <small className="vocab-example-translation">{translation}</small> : null}
          </li>
        );
      })}
    </ul>
  );
}

function VocabularyDetailSubsection({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="input-vocab-subsection">
      <h5>{title}</h5>
      {children}
    </div>
  );
}

function completeInputVocabularyItem(
  item: StudyCard["vocabularyItems"][number],
  card: StudyCard
): StudyCard["vocabularyItems"][number] {
  const fallback = createFallbackVocabularyItem(
    item.term,
    card.sourceSentence || card.frontText,
    item.colorKey
  );
  const examples = mergeDisplayExamples(item.examples, fallback.examples, card);
  return {
    ...item,
    basicMeaningKo: isPlaceholderMeaning(item.basicMeaningKo)
      ? fallback.basicMeaningKo
      : item.basicMeaningKo,
    meaningInContextKo: isPlaceholderContext(item.meaningInContextKo, card)
      ? fallback.meaningInContextKo
      : item.meaningInContextKo,
    etymologyKo: item.etymologyKo?.trim() || fallback.etymologyKo,
    usagePatterns: mergeUsagePatterns(item.usagePatterns, fallback.usagePatterns),
    examples,
    exampleTranslationsKo: mergeExampleTranslations(
      item.examples,
      item.exampleTranslationsKo,
      fallback.examples,
      fallback.exampleTranslationsKo,
      examples
    )
  };
}

function mergeExampleTranslations(
  examples: string[] | undefined,
  translations: string[] | undefined,
  fallbackExamples: string[] | undefined,
  fallbackTranslations: string[] | undefined,
  mergedExamples: string[]
) {
  const translationByExample = new Map<string, string>();
  registerExampleTranslations(translationByExample, examples, translations);
  registerExampleTranslations(translationByExample, fallbackExamples, fallbackTranslations);
  return mergedExamples.map((example) => translationByExample.get(normalizeDisplayFingerprint(example)) ?? "");
}

function registerExampleTranslations(
  translationByExample: Map<string, string>,
  examples: string[] | undefined,
  translations: string[] | undefined
) {
  examples?.forEach((example, index) => {
    const key = normalizeDisplayFingerprint(example);
    const translation = String(translations?.[index] ?? "").trim();
    if (key && translation && !translationByExample.has(key)) {
      translationByExample.set(key, translation);
    }
  });
}

function isPlaceholderMeaning(value?: string) {
  const normalized = normalizeDisplayText(value);
  return !normalized || normalized === "선택 표현";
}

function isPlaceholderContext(value: string | undefined, card: StudyCard) {
  const normalized = normalizeDisplayText(value);
  if (!normalized) {
    return true;
  }
  return [
    card.sourceSentence,
    card.frontText,
    card.literalTranslationKo,
    card.naturalTranslationKo,
    card.targetText
  ]
    .map(normalizeDisplayText)
    .filter(Boolean)
    .includes(normalized);
}

function mergeDisplayExamples(
  examples: string[] | undefined,
  fallbackExamples: string[],
  card: StudyCard
) {
  const sourceFingerprints = new Set(
    [card.sourceSentence, card.frontText].map(normalizeDisplayFingerprint).filter(Boolean)
  );
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of [...(examples ?? []), ...fallbackExamples]) {
    const normalized = String(value ?? "").trim();
    const fingerprint = normalizeDisplayFingerprint(normalized);
    if (!normalized || sourceFingerprints.has(fingerprint) || seen.has(fingerprint)) {
      continue;
    }
    seen.add(fingerprint);
    result.push(normalized);
    if (result.length >= 3) {
      break;
    }
  }
  return result;
}

function mergeDisplayStrings(
  values: string[] | undefined,
  fallbackValues: string[] | undefined,
  limit: number
) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of [...(values ?? []), ...(fallbackValues ?? [])]) {
    const normalized = String(value ?? "").trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

function mergeUsagePatterns(values: string[] | undefined, fallbackValues: string[] | undefined) {
  const merged = mergeDisplayStrings(values, fallbackValues, 8);
  const collocation = merged.find((value) => /collocation/i.test(value));
  const ordered = collocation
    ? [collocation, ...merged.filter((value) => value !== collocation)]
    : merged;
  return ordered.slice(0, 4);
}

function normalizeDisplayText(value?: string) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDisplayFingerprint(value?: string) {
  return normalizeDisplayText(value).toLowerCase();
}

function ComparisonSections({ card }: { card: StudyCard }) {
  const { i18n, t } = useTranslation();
  const numberFormatter = new Intl.NumberFormat(
    i18n.resolvedLanguage?.startsWith("en") ? "en-US" : "ko-KR"
  );
  const comparisons =
    card.cardType === "reading" && card.deckType === "input-listening"
      ? filterInputListeningComparisons(card.confusingComparisons)
      : card.confusingComparisons ?? [];
  if (!comparisons.length) {
    return null;
  }

  if (card.cardType === "reading" && card.deckType === "input") {
    return (
      <section className="input-comparison-section">
        <div className="input-section-header reading-comparison-header">
          <div>
            <small>{t("cardPreview.reading.comparisonStep")}</small>
            <h3>{t("cardPreview.comparison.title")}</h3>
          </div>
          <span>
            {t("cardPreview.comparison.count", {
              formattedCount: numberFormatter.format(comparisons.length)
            })}
          </span>
        </div>
        <div className="comparison-list input-comparison-list">
          {comparisons.map((comparison) => (
            <div className="comparison-item" key={comparison.title}>
              <div className="comparison-title-row">
                {comparison.kind ? (
                  <span className={`comparison-kind-badge kind-${comparison.kind}`}>
                    {t(getComparisonKindKey(comparison.kind))}
                  </span>
                ) : null}
                <strong>{comparison.title}</strong>
              </div>
              <p>{comparison.explanationKo}</p>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="comparison-list">
      {comparisons.map((comparison) => (
        <div className="comparison-item" key={comparison.title}>
          <div className="comparison-title-row">
            {comparison.kind ? (
              <span className={`comparison-kind-badge kind-${comparison.kind}`}>
                {t(getComparisonKindKey(comparison.kind))}
              </span>
            ) : null}
            <strong>{comparison.title}</strong>
          </div>
          <p>{comparison.explanationKo}</p>
        </div>
      ))}
    </div>
  );
}

function getComparisonKindKey(kind: ConfusingComparisonKind) {
  switch (kind) {
    case "similar":
      return "cardPreview.comparison.similar" as const;
    case "contrast":
      return "cardPreview.comparison.contrast" as const;
    case "nuance":
      return "cardPreview.comparison.nuance" as const;
    default:
      return "cardPreview.comparison.generic" as const;
  }
}

function PumpActions({
  card,
  prompts,
  onStartWritingPractice
}: {
  card: StudyCard;
  prompts: PumpPrompt[];
  onStartWritingPractice?: (card: StudyCard, promptIndex?: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="pump-actions">
      {prompts.map((prompt, index) => (
        <button
          className="button ghost"
          disabled={!onStartWritingPractice}
          key={`${prompt.type}-${prompt.promptKo}-${index}`}
          title={
            onStartWritingPractice
              ? t("cardPreview.actions.startWritingTitle")
              : t("cardPreview.actions.writingUnavailable")
          }
          type="button"
          onClick={() => onStartWritingPractice?.(card, index)}
        >
          <Pencil size={17} />
          {t("cardPreview.actions.startWriting")}
        </button>
      ))}
    </div>
  );
}

function ReviewButtons({
  card,
  className,
  onReview,
  targetId
}: {
  card: StudyCard;
  className?: string;
  onReview?: (rating: ReviewRating) => void;
  targetId?: string;
}) {
  const { i18n, t } = useTranslation();
  const appLocale = i18n.resolvedLanguage?.startsWith("en") ? "en" : "ko";
  const numberFormatter = new Intl.NumberFormat(appLocale === "en" ? "en-US" : "ko-KR");
  const ratings: Array<{ rating: ReviewRating; className: string }> = [
    { rating: "again", className: "danger" },
    { rating: "hard", className: "neutral" },
    { rating: "good", className: "success" },
    { rating: "easy", className: "info" }
  ];

  function formatReviewInterval(rating: ReviewRating, now = new Date()) {
    const next = scheduleCardReview(card.srs, rating, now);
    const dueTime = new Date(next.dueAt).getTime();
    const diffMs = Math.max(0, dueTime - now.getTime());
    const minutes = Math.max(1, Math.round(diffMs / 60_000));
    if (minutes < 60) {
      return t("cardPreview.review.minutes", {
        formattedCount: numberFormatter.format(minutes)
      });
    }
    const hours = Math.round(minutes / 60);
    if (hours < 24) {
      return t("cardPreview.review.hours", {
        formattedCount: numberFormatter.format(hours)
      });
    }
    const days = Math.round(hours / 24);
    if (days < 31) {
      return t("cardPreview.review.days", {
        formattedCount: numberFormatter.format(days)
      });
    }
    const months = Math.round(days / 30);
    return t("cardPreview.review.months", {
      formattedCount: numberFormatter.format(months)
    });
  }

  return (
    <div className={`review-actions ${className ?? ""}`} data-tutorial-target-id={targetId}>
      {ratings.map(({ rating, className }) => (
        <button
          className={`button ${className}`}
          key={rating}
          type="button"
          onClick={() => onReview?.(rating)}
        >
          <strong>{t(getReviewRatingKey(rating))}</strong>
          <small>{formatReviewInterval(rating)}</small>
        </button>
      ))}
    </div>
  );
}

function getReviewRatingKey(rating: ReviewRating) {
  if (rating === "again") {
    return "cardPreview.review.again" as const;
  }
  if (rating === "hard") {
    return "cardPreview.review.hard" as const;
  }
  if (rating === "good") {
    return "cardPreview.review.good" as const;
  }
  return "cardPreview.review.easy" as const;
}

function stripSectionHeading(text: string | undefined, heading: string) {
  return String(text || "")
    .replace(new RegExp(`^\\s*${escapeRegExp(heading)}\\s*\\n?`, "i"), "")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
