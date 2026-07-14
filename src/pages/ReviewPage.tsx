import { BookOpen, Lightbulb, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CardPreview, PronunciationRecorderSection } from "../components/CardPreview";
import { Dialog } from "../components/Dialog";
import type { LocalEnglishMinerApi } from "../data/api";
import { getCardDeckFilterLabel, type CardDeckLabelLocale } from "../shared/cardDeck";
import { getReviewDeckCompletedEventType } from "../shared/dailyMissions";
import {
  buildReviewDeckStats,
  createEmptyReviewDailyProgress,
  filterReviewQueueByDeckAndLimits,
  getReviewDateKey,
  getReviewLimitBucket,
  normalizeReviewDailyProgress,
  normalizeReviewSettings,
  reviewDecks,
  type ReviewDailyProgress,
  type ReviewSettings
} from "../shared/reviewStats";
import { DEFAULT_PROFILE_ID } from "../shared/profiles";
import type { AppSettings, CardDeckType, ProfileId, ReviewRating, StudyCard } from "../shared/types";
import { playTextTts } from "../utils/cardTts";
import "../styles/review.css";

const REVIEW_SETTINGS_STORAGE_KEY = "lem:reviewSettings";
const REVIEW_PROGRESS_STORAGE_KEY = "lem:reviewDailyProgress";

type ReviewPageProps = {
  api: LocalEnglishMinerApi;
  cards: StudyCard[];
  onCardsChanged: () => Promise<void>;
  onMissionProgressChanged?: () => Promise<void>;
  onStartWritingPractice?: (card: StudyCard, promptIndex?: number) => void;
  onNavigate?: (route: "pdfReader" | "life") => void;
  profileId: ProfileId;
  settings: AppSettings;
};

type ReviewSettingField = keyof ReviewSettings[CardDeckType];

export function ReviewPage({
  api,
  cards,
  onCardsChanged,
  onMissionProgressChanged,
  onStartWritingPractice,
  onNavigate,
  profileId,
  settings
}: ReviewPageProps) {
  const { i18n, t } = useTranslation();
  const appLocale: CardDeckLabelLocale = (i18n.resolvedLanguage ?? i18n.language).startsWith(
    "en"
  )
    ? "en"
    : "ko";
  const getDeckName = (deck: CardDeckType) =>
    deck === "input-listening"
      ? t("review.decks.listening")
      : deck === "input"
        ? t("review.decks.reading")
        : t("review.decks.speaking");
  const [dueCards, setDueCards] = useState<StudyCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [activeDeck, setActiveDeck] = useState<CardDeckType>("input");
  const [isSessionOpen, setIsSessionOpen] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isLoadingDueCards, setIsLoadingDueCards] = useState(true);
  const [reviewLoadError, setReviewLoadError] = useState("");
  const [nowIso, setNowIso] = useState(() => new Date().toISOString());
  const [reviewSettings, setReviewSettings] = useState(() => loadReviewSettings(profileId));
  const [dailyProgress, setDailyProgress] = useState(() =>
    loadReviewDailyProgress(new Date(), profileId)
  );
  const [practiceSentence, setPracticeSentence] = useState("");
  const [isPlayingPracticeTts, setIsPlayingPracticeTts] = useState(false);
  const [practiceTtsStatus, setPracticeTtsStatus] = useState("");
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const deckStats = useMemo(() => buildReviewDeckStats(cards, now), [cards, now]);
  const reviewQueue = useMemo(
    () =>
      filterReviewQueueByDeckAndLimits(
        dueCards,
        activeDeck,
        reviewSettings,
        now,
        dailyProgress
      ),
    [activeDeck, dailyProgress, dueCards, now, reviewSettings]
  );
  const selectedDeckDueCount = useMemo(
    () => dueCards.filter((card) => card.deckType === activeDeck).length,
    [activeDeck, dueCards]
  );

  async function loadDueCards() {
    const loadNow = new Date();
    setIsLoadingDueCards(true);
    setReviewLoadError("");
    try {
      const due = await api.cards.listDue(loadNow.toISOString());
      setNowIso(loadNow.toISOString());
      setDailyProgress(loadReviewDailyProgress(loadNow, profileId));
      setDueCards(due);
      setCurrentIndex(0);
    } catch {
      setDueCards([]);
      setCurrentIndex(0);
      setReviewLoadError(t("review.loadFailed"));
    } finally {
      setIsLoadingDueCards(false);
    }
  }

  useEffect(() => {
    void loadDueCards();
  }, [profileId]);

  useEffect(() => {
    setReviewSettings(loadReviewSettings(profileId));
    setDailyProgress(loadReviewDailyProgress(new Date(), profileId));
    setCurrentIndex(0);
  }, [profileId]);

  useEffect(() => {
    setCurrentIndex(0);
  }, [activeDeck, reviewSettings]);

  function getDeckReviewQueue(deck: CardDeckType) {
    return filterReviewQueueByDeckAndLimits(
      dueCards,
      deck,
      reviewSettings,
      now,
      dailyProgress
    );
  }

  function startReviewSession(deck: CardDeckType) {
    setActiveDeck(deck);
    setCurrentIndex(0);
    setIsSessionOpen(true);
  }

  async function handleReview(rating: ReviewRating) {
    if (isReviewing) {
      return;
    }
    const current = reviewQueue[currentIndex];
    if (!current) {
      return;
    }
    const limitBucket = getReviewLimitBucket(current);
    setIsReviewing(true);
    try {
      await api.cards.review(current.id, rating);
      setDailyProgress((progress) => {
        const nextProgress = incrementDailyProgress(progress, activeDeck, limitBucket);
        saveReviewDailyProgress(nextProgress, new Date(), profileId);
        return nextProgress;
      });
      await onCardsChanged();
      const nextCards = dueCards.filter((card) => card.id !== current.id);
      const isDeckCompleted = nextCards.every((card) => card.deckType !== activeDeck);
      if (isDeckCompleted) {
        try {
          await api.missions.recordEvent({
            type: getReviewDeckCompletedEventType(activeDeck),
            amount: 1,
            metadata: {
              deckType: activeDeck
            }
          });
          await onMissionProgressChanged?.();
        } catch {
          // Mission rewards should not block the review flow.
        }
      }
      setDueCards(nextCards);
      const nextFilteredLength = nextCards.filter(
        (card) => card.deckType === activeDeck
      ).length;
      setCurrentIndex((index) => Math.min(index, Math.max(0, nextFilteredLength - 1)));
    } finally {
      setIsReviewing(false);
    }
  }

  function updateReviewSetting(deck: CardDeckType, field: ReviewSettingField, rawValue: string) {
    const value = Math.max(0, Math.floor(Number(rawValue) || 0));
    setReviewSettings((settings) => {
      const nextSettings = normalizeReviewSettings({
        ...settings,
        [deck]: {
          ...settings[deck],
          [field]: value
        }
      });
      saveReviewSettings(nextSettings, profileId);
      return nextSettings;
    });
  }

  const current = reviewQueue[currentIndex] ?? null;
  const isLimitedOut = selectedDeckDueCount > 0 && reviewQueue.length === 0;

  useEffect(() => {
    setPracticeSentence(getDefaultPracticeSentence(current));
    setPracticeTtsStatus("");
  }, [current?.id]);

  async function handlePlayPracticeSentence() {
    if (!current || !practiceSentence || isPlayingPracticeTts) {
      return;
    }
    setIsPlayingPracticeTts(true);
    setPracticeTtsStatus("");
    try {
      setPracticeTtsStatus(await playTextTts(current, practiceSentence, settings));
    } catch {
      setPracticeTtsStatus(t("review.ttsFailed"));
    } finally {
      setIsPlayingPracticeTts(false);
    }
  }

  return (
    <section className="panel review-panel">
      <div className="panel-heading">
        <RotateCcw size={19} />
        <h1>{t("review.title")}</h1>
        <span className="pill">
          {isLoadingDueCards
            ? t("review.checking")
            : t("review.waitingCount", { count: reviewQueue.length })}
        </span>
        <button
          className="button ghost small"
          data-qa="review-refresh-button"
          disabled={isLoadingDueCards}
          type="button"
          onClick={() => void loadDueCards()}
        >
          {isLoadingDueCards ? t("review.checking") : t("review.refresh")}
        </button>
      </div>
      {reviewLoadError ? (
        <div aria-live="assertive" className="review-status-banner danger" role="alert">
          <strong>{t("review.loadFailed")}</strong>
          <span>{reviewLoadError}</span>
        </div>
      ) : null}
      {!reviewLoadError && isLoadingDueCards ? (
        <div aria-live="polite" className="review-status-banner" role="status">
          <strong>{t("review.loadingTitle")}</strong>
          <span>{t("review.loadingDescription")}</span>
        </div>
      ) : null}
      {!reviewLoadError && !isLoadingDueCards && cards.length === 0 ? (
        <div className="review-status-banner" role="status">
          <strong>{t("review.noCardsTitle")}</strong>
          <span>{t("review.noCardsDescription")}</span>
          {onNavigate ? (
            <div className="empty-state-actions left">
              <button
                className="button primary small"
                data-qa="review-empty-open-reader"
                type="button"
                onClick={() => onNavigate("pdfReader")}
              >
                <BookOpen size={15} />
                {t("review.openReader")}
              </button>
              <button
                className="button secondary small"
                data-qa="review-empty-open-life"
                type="button"
                onClick={() => onNavigate("life")}
              >
                <Lightbulb size={15} />
                {t("nav.lifeMining")}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {!reviewLoadError && !isLoadingDueCards && cards.length > 0 && dueCards.length === 0 ? (
        <div className="review-status-banner success" role="status">
          <strong>{t("review.noneDueTitle")}</strong>
          <span>{t("review.noneDueDescription")}</span>
        </div>
      ) : null}
      {!reviewLoadError && !isLoadingDueCards && isLimitedOut ? (
        <div className="review-status-banner success" role="status">
          <strong>
            {t("review.limitComplete", { deck: getDeckName(activeDeck) })}
          </strong>
          <span>{t("review.limitCompleteDescription")}</span>
        </div>
      ) : null}
      <div className="review-deck-dashboard">
        {reviewDecks.map((deck) => {
          const stats = deckStats[deck];
          const deckQueueLength = getDeckReviewQueue(deck).length;
          return (
          <article
            key={deck}
            className={`review-deck-card ${activeDeck === deck ? "active" : ""}`}
          >
            <button
              className="review-deck-select"
              type="button"
              aria-pressed={activeDeck === deck}
              onClick={() => setActiveDeck(deck)}
            >
            <span className="review-deck-card-head">
              <span>
                <strong>{getDeckName(deck)}</strong>
                <small>{getCardDeckFilterLabel(deck, appLocale)}</small>
              </span>
              <span className="review-total-count">
                {t("review.cardsCount", { count: stats.totalCount })}
              </span>
            </span>
            <span className="review-count-row">
              <span className="review-count-badge new">
                <strong>{stats.newCount}</strong>
                <small>{t("review.newCards")}</small>
              </span>
              <span className="review-count-badge learning">
                <strong>{stats.learningCount}</strong>
                <small>{t("review.learning")}</small>
              </span>
              <span className="review-count-badge review">
                <strong>{stats.reviewCount}</strong>
                <small>{t("nav.review")}</small>
              </span>
            </span>
            <span className="review-deck-meta">
              {t("review.deckMeta", {
                overdue: stats.overdueCount,
                completed: stats.doneTodayCount
              })}
            </span>
            </button>
            <button
              className="button primary review-start-button"
              data-qa={`review-start-${deck}`}
              type="button"
              disabled={isLoadingDueCards || deckQueueLength === 0}
              onClick={() => startReviewSession(deck)}
            >
              {t("review.start")}
              <span>
                {isLoadingDueCards
                  ? t("review.checking")
                  : t("review.cardsCount", { count: deckQueueLength })}
              </span>
            </button>
          </article>
          );
        })}
      </div>
      <details className="review-settings-panel">
        <summary>
          <span>
            <SlidersHorizontal size={16} />
            {t("review.settings.title")}
          </span>
          <small>{t("review.settings.description")}</small>
        </summary>
        <div className="review-settings-grid">
          {reviewDecks.map((deck) => (
            <div className="review-settings-card" key={deck}>
              <strong>{getDeckName(deck)}</strong>
              <label className="review-setting-field">
                <span>{t("review.settings.newLimit")}</span>
                <input
                  min={0}
                  type="number"
                  value={reviewSettings[deck].newLimit}
                  onChange={(event) => updateReviewSetting(deck, "newLimit", event.target.value)}
                />
              </label>
              <label className="review-setting-field">
                <span>{t("review.settings.reviewLimit")}</span>
                <input
                  min={0}
                  type="number"
                  value={reviewSettings[deck].reviewLimit}
                  onChange={(event) =>
                    updateReviewSetting(deck, "reviewLimit", event.target.value)
                  }
                />
              </label>
            </div>
          ))}
        </div>
      </details>
      {isSessionOpen ? (
        <Dialog
          ariaLabel={t("review.session.ariaLabel", { deck: getDeckName(activeDeck) })}
          backdropClassName="review-session-backdrop"
          className="review-session-modal"
          onClose={() => setIsSessionOpen(false)}
        >
            <div className="review-session-modal-header">
              <div>
                <span>{t("review.session.eyebrow")}</span>
                <h2>{getDeckName(activeDeck)}</h2>
              </div>
              <div className="review-session-modal-actions">
                <span className="review-session-count">
                  {current
                    ? t("review.session.progress", {
                        current: currentIndex + 1,
                        total: reviewQueue.length
                      })
                    : t("review.session.complete")}
                </span>
                <button
                  aria-label={t("review.session.close")}
                  className="icon-button"
                  type="button"
                  onClick={() => setIsSessionOpen(false)}
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            {current ? (
              <div
                className={`review-session-workspace ${current.deckType === "output" ? "has-pronunciation-panel" : ""}`}
              >
                <div className="review-session-card-column">
                  <CardPreview
                    key={current.id}
                    card={current}
                    settings={settings}
                    reviewActions
                    onReview={(rating) => void handleReview(rating)}
                    onStartWritingPractice={onStartWritingPractice}
                  />
                </div>
                {current.deckType === "output" ? (
                  <aside
                    className="review-pronunciation-panel"
                    aria-label={t("review.pronunciation.panelLabel")}
                  >
                    <div className="review-pronunciation-panel-heading">
                      <span>{t("review.pronunciation.eyebrow")}</span>
                      <strong>{t("review.pronunciation.title")}</strong>
                      <p>{t("review.pronunciation.description")}</p>
                    </div>
                    <PronunciationRecorderSection
                      compact
                      isPlayingReference={isPlayingPracticeTts}
                      onPlayReference={() => void handlePlayPracticeSentence()}
                      targetText={practiceSentence}
                      title={t("review.pronunciation.selectedSentence")}
                    />
                    {practiceTtsStatus ? (
                      <p aria-live="polite" className="review-pronunciation-status" role="status">
                        {practiceTtsStatus}
                      </p>
                    ) : null}
                    <small className="review-pronunciation-privacy">
                      {t("review.pronunciation.privacy")}
                    </small>
                  </aside>
                ) : null}
              </div>
            ) : (
              <div className="empty-state review-session-empty">
                {isLimitedOut
                  ? t("review.session.todayComplete", {
                      deck: getDeckName(activeDeck)
                    })
                  : t("review.session.noCards", {
                      deck: getDeckName(activeDeck)
                    })}
              </div>
            )}
        </Dialog>
      ) : null}
    </section>
  );
}

function getDefaultPracticeSentence(card: StudyCard | null) {
  if (!card || card.deckType !== "output") {
    return "";
  }
  const guideSentence = card.outputStudyGuide?.dialogue.find((sentence) => sentence.role === "me")?.en;
  return guideSentence?.trim() || card.targetText?.trim() || "";
}

function loadReviewSettings(profileId: ProfileId = DEFAULT_PROFILE_ID) {
  if (typeof localStorage === "undefined") {
    return normalizeReviewSettings(null);
  }

  try {
    return normalizeReviewSettings(
      JSON.parse(localStorage.getItem(getReviewSettingsKey(profileId)) ?? "null")
    );
  } catch {
    return normalizeReviewSettings(null);
  }
}

function saveReviewSettings(settings: ReviewSettings, profileId: ProfileId = DEFAULT_PROFILE_ID) {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(getReviewSettingsKey(profileId), JSON.stringify(settings));
}

function loadReviewDailyProgress(now: Date, profileId: ProfileId = DEFAULT_PROFILE_ID) {
  if (typeof localStorage === "undefined") {
    return createEmptyReviewDailyProgress();
  }

  try {
    const stored = JSON.parse(localStorage.getItem(getReviewProgressKey(profileId)) ?? "null") as {
      dateKey?: string;
      progress?: unknown;
    } | null;
    if (stored?.dateKey !== getReviewDateKey(now)) {
      return createEmptyReviewDailyProgress();
    }
    return normalizeReviewDailyProgress(stored.progress);
  } catch {
    return createEmptyReviewDailyProgress();
  }
}

function saveReviewDailyProgress(
  progress: ReviewDailyProgress,
  now: Date,
  profileId: ProfileId = DEFAULT_PROFILE_ID
) {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(
    getReviewProgressKey(profileId),
    JSON.stringify({
      dateKey: getReviewDateKey(now),
      progress
    })
  );
}

function getReviewSettingsKey(profileId: ProfileId) {
  return `${REVIEW_SETTINGS_STORAGE_KEY}:${profileId || DEFAULT_PROFILE_ID}`;
}

function getReviewProgressKey(profileId: ProfileId) {
  return `${REVIEW_PROGRESS_STORAGE_KEY}:${profileId || DEFAULT_PROFILE_ID}`;
}

function incrementDailyProgress(
  progress: ReviewDailyProgress,
  deck: CardDeckType,
  bucket: "new" | "review"
): ReviewDailyProgress {
  return {
    ...progress,
    [deck]: {
      ...progress[deck],
      [bucket === "new" ? "newDone" : "reviewDone"]:
        progress[deck][bucket === "new" ? "newDone" : "reviewDone"] + 1
    }
  };
}
