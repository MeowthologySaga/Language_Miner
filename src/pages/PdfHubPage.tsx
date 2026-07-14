import {
  BookOpen,
  Clock,
  Film,
  Headphones,
  Languages,
  Lightbulb,
  ListChecks,
  PlayCircle,
  RotateCcw
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { DailyRoutineRun, DailyRoutineStep } from "../shared/dailyRoutine";
import { DailyMissionPanel } from "../components/DailyMissionPanel";
import { getReviewDateKey } from "../shared/reviewStats";
import {
  buildStudyActivityHeatmap,
  buildTodayHubSummary,
  type StudyActivityHeatmap
} from "../shared/todayHub";
import type {
  DailyMissionBoard,
  DailyMissionId,
  DiamondWallet,
  LifeLog,
  ProfileId,
  StudyCard
} from "../shared/types";
import "../styles/pdfHub.css";

type PdfHubRoute =
  | "pdfReader"
  | "bookMaker"
  | "documentLibrary"
  | "review"
  | "life"
  | "listeningLoop"
  | "videoReader"
  | "writingPractice";

type PdfHubPageProps = {
  cards: StudyCard[];
  lifeLogs: LifeLog[];
  missionBoard: DailyMissionBoard;
  profileId: ProfileId;
  routineCurrentStep: DailyRoutineStep | null;
  routineProgress: {
    completedCount: number;
    totalCount: number;
    percent: number;
  };
  routineRun: DailyRoutineRun | null;
  wallet: DiamondWallet;
  onClaimMission: (missionId: DailyMissionId) => Promise<void>;
  onClaimDailyBonus: () => Promise<void>;
  onNavigate: (route: PdfHubRoute) => void;
  onResumeRoutine: () => void;
  onStartRoutine: () => void;
};

export function PdfHubPage({
  cards,
  lifeLogs,
  missionBoard,
  profileId,
  routineCurrentStep,
  routineProgress,
  routineRun,
  wallet,
  onClaimMission,
  onClaimDailyBonus,
  onNavigate,
  onResumeRoutine,
  onStartRoutine
}: PdfHubPageProps) {
  const { i18n, t } = useTranslation();
  const appLocale = (i18n.resolvedLanguage ?? i18n.language).startsWith("en") ? "en" : "ko";
  const todaySummary = buildTodayHubSummary({
    cards,
    lifeLogs,
    profileId
  });
  const reviewMissions = missionBoard.missions.filter((mission) => mission.category === "review");
  const cardMission = missionBoard.missions.find((mission) => mission.id === "card-2");
  const reviewGoal = reviewMissions.length || 3;
  const reviewProgress = reviewMissions.length
    ? reviewMissions.filter((mission) => mission.completed).length
    : Math.min(reviewGoal, todaySummary.review.doneTodayCount);
  const candidateGoal = Math.max(
    cardMission?.goal ?? 2,
    todaySummary.life.pendingCount + todaySummary.life.completedForProfileCount
  );
  const candidateProgress = Math.min(candidateGoal, todaySummary.life.pendingCount);
  const listeningGoal = Math.max(
    5,
    todaySummary.listening.savedTodayCount + todaySummary.listening.dueCount
  );
  const listeningProgress = Math.min(listeningGoal, todaySummary.listening.savedTodayCount);
  const weekSeries = buildTodayHubWeekSeries({
    cards,
    lifeLogs,
    locale: appLocale
  });
  const activityHeatmap = buildStudyActivityHeatmap({
    cards,
    lifeLogs,
    profileId,
    locale: appLocale
  });
  const routinePercent = Math.min(100, Math.max(0, Math.round(routineProgress.percent)));

  return (
    <div className="document-page pdf-hub-page">
      <section className="pdf-hub-shell">
        <section className="today-hub-panel" data-qa="today-hub">
          <div className="today-hub-command-row">
            <div className="today-hub-heading">
              <span className="today-hub-eyebrow">{t("today.eyebrow")}</span>
              <h1>{t("today.title")}</h1>
              <p>{t("today.description")}</p>
            </div>
          </div>
          <div className="today-hub-grid">
            <TodayHubCard
              accent="review"
              actionLabel={t("today.cards.review.action")}
              barHighlightIndex={weekSeries.todayIndex}
              barLabels={weekSeries.labels}
              barValues={weekSeries.review}
              current={reviewProgress}
              dataQa="today-hub-open-review"
              icon={<RotateCcw size={22} />}
              status={t("today.cards.review.status")}
              target={reviewGoal}
              title={t("today.cards.review.title")}
              onClick={() => onNavigate("review")}
            />
            <TodayHubCard
              accent="life"
              actionLabel={t("today.cards.candidates.action")}
              barHighlightIndex={weekSeries.todayIndex}
              barLabels={weekSeries.labels}
              barValues={weekSeries.life}
              current={candidateProgress}
              dataQa="today-hub-open-life"
              icon={<Lightbulb size={22} />}
              status={t("today.cards.candidates.status")}
              target={candidateGoal}
              title={t("today.cards.candidates.title")}
              onClick={() => onNavigate("life")}
            />
            <TodayHubCard
              accent="listening"
              actionLabel={t("today.cards.listening.action")}
              barHighlightIndex={weekSeries.todayIndex}
              barLabels={weekSeries.labels}
              barValues={weekSeries.listening}
              current={listeningProgress}
              dataQa="today-hub-open-listening"
              icon={<Headphones size={22} />}
              status={t("today.cards.listening.status")}
              target={listeningGoal}
              title={t("today.cards.listening.title")}
              onClick={() => onNavigate("listeningLoop")}
            />
          </div>
          <StudyActivityGrass heatmap={activityHeatmap} />
        </section>

        <section className={getRoutinePanelClassName(routineRun)}>
          <div className="daily-routine-panel-main">
            <span className="daily-routine-panel-icon">
              <ListChecks size={22} />
            </span>
            <div>
              <span className="daily-routine-eyebrow">{t("today.routine.eyebrow")}</span>
              <h2>{getRoutineTitle(t, routineRun)}</h2>
              <p>{getRoutineDescription(t, routineRun, routineCurrentStep)}</p>
            </div>
          </div>
          <div className="daily-routine-side">
            <span className="daily-routine-count">
              {formatInteger(routineProgress.completedCount, appLocale)} / {formatInteger(
                routineProgress.totalCount,
                appLocale
              )}
            </span>
            <span
              aria-label={t("today.routine.progressAria")}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={routinePercent}
              className="daily-routine-track"
              role="progressbar"
            >
              <span aria-hidden="true" style={{ width: `${routinePercent}%` }} />
            </span>
            <button
              className="button primary"
              type="button"
              onClick={routineRun?.status === "running" ? onResumeRoutine : routineRun?.status === "paused" ? onResumeRoutine : onStartRoutine}
            >
              <PlayCircle size={17} />
              {getRoutineButtonLabel(t, routineRun)}
            </button>
          </div>
        </section>

        <DailyMissionPanel
          missionBoard={missionBoard}
          wallet={wallet}
          onClaimDailyBonus={onClaimDailyBonus}
          onClaimMission={onClaimMission}
        />

        <details className="pdf-hub-toolbox">
          <summary>
            <span>
              <BookOpen size={18} />
              {t("today.tools.summary")}
            </span>
            <small>{t("today.tools.summaryDescription")}</small>
          </summary>
        <div className="pdf-hub-title">
          <h2>{t("today.tools.title")}</h2>
          <p>{t("today.tools.description")}</p>
        </div>

        <div className="mode-card-grid">
          <article className="mode-choice-card reader-choice">
            <div className="mode-card-icon">
              <BookOpen size={42} />
            </div>
            <h3>{t("today.tools.reader.title")}</h3>
            <p>{t("today.tools.reader.description")}</p>
            <button
              className="button primary reader-action"
              data-qa="pdf-hub-open-reader"
              type="button"
              onClick={() => onNavigate("pdfReader")}
            >
              {t("today.tools.reader.action")}
            </button>
            <ul>
              <li>{t("today.tools.reader.feature1")}</li>
              <li>{t("today.tools.reader.feature2")}</li>
              <li>{t("today.tools.reader.feature3")}</li>
            </ul>
          </article>

          <article className="mode-choice-card maker-choice">
            <div className="mode-card-icon">
              <Languages size={42} />
            </div>
            <h3>{t("today.tools.book.title")}</h3>
            <p>{t("today.tools.book.description")}</p>
            <button
              className="button primary maker-action"
              data-qa="pdf-hub-open-book-maker"
              type="button"
              onClick={() => onNavigate("bookMaker")}
            >
              {t("today.tools.book.action")}
            </button>
            <ul>
              <li>{t("today.tools.book.feature1")}</li>
              <li>{t("today.tools.book.feature2")}</li>
              <li>{t("today.tools.book.feature3")}</li>
            </ul>
          </article>

          <article className="mode-choice-card review-choice">
            <div className="mode-card-icon">
              <RotateCcw size={42} />
            </div>
            <h3>{t("today.tools.review.title")}</h3>
            <p>{t("today.tools.review.description")}</p>
            <button
              className="button primary review-action"
              data-qa="pdf-hub-open-review"
              type="button"
              onClick={() => onNavigate("review")}
            >
              {t("today.tools.review.action")}
            </button>
            <ul>
              <li>{t("today.tools.review.feature1")}</li>
              <li>{t("today.tools.review.feature2")}</li>
              <li>{t("today.tools.review.feature3")}</li>
            </ul>
          </article>

          <article className="mode-choice-card listening-choice">
            <div className="mode-card-icon">
              <Headphones size={42} />
            </div>
            <h3>{t("today.tools.listening.title")}</h3>
            <p>{t("today.tools.listening.description")}</p>
            <button
              className="button primary listening-action"
              data-qa="pdf-hub-open-listening"
              type="button"
              onClick={() => onNavigate("listeningLoop")}
            >
              {t("today.tools.listening.action")}
            </button>
            <ul>
              <li>{t("today.tools.listening.feature1")}</li>
              <li>{t("today.tools.listening.feature2")}</li>
              <li>{t("today.tools.listening.feature3")}</li>
            </ul>
          </article>

          <article className="mode-choice-card video-choice">
            <div className="mode-card-icon">
              <Film size={42} />
            </div>
            <h3>{t("today.tools.video.title")}</h3>
            <p>{t("today.tools.video.description")}</p>
            <button
              className="button primary video-action"
              data-qa="pdf-hub-open-video"
              type="button"
              onClick={() => onNavigate("videoReader")}
            >
              {t("today.tools.video.action")}
            </button>
            <ul>
              <li>{t("today.tools.video.feature1")}</li>
              <li>{t("today.tools.video.feature2")}</li>
              <li>{t("today.tools.video.feature3")}</li>
            </ul>
          </article>
        </div>

        <button
          className="button secondary recent-document-button"
          data-qa="pdf-hub-open-recent-documents"
          type="button"
          onClick={() => onNavigate("documentLibrary")}
        >
          <Clock size={17} />
          {t("today.tools.recentDocuments")}
        </button>
        </details>
      </section>
    </div>
  );
}

function StudyActivityGrass({ heatmap }: { heatmap: StudyActivityHeatmap }) {
  const { i18n, t } = useTranslation();
  const locale = (i18n.resolvedLanguage ?? i18n.language).startsWith("en") ? "en" : "ko";
  return (
    <section
      aria-label={t("today.activity.ariaLabel", {
        weeks: formatInteger(heatmap.weeks.length, locale),
        formattedCount: formatInteger(heatmap.totalCount, locale)
      })}
      className="study-activity-panel"
      data-qa="today-hub-activity-grass"
    >
      <p className="sr-only">
        {t("today.activity.screenReaderSummary", {
          total: formatInteger(heatmap.totalCount, locale),
          activeDays: formatInteger(heatmap.activeDayCount, locale),
          today: formatInteger(heatmap.todayCount, locale)
        })}
      </p>
      <div className="study-activity-header">
        <div>
          <span className="study-activity-eyebrow">
            {t("today.activity.recentWeeks", {
              formattedCount: formatInteger(heatmap.weeks.length, locale)
            })}
          </span>
          <h3>{t("today.activity.title")}</h3>
        </div>
        <div className="study-activity-stats">
          <span>
            <strong>{formatInteger(heatmap.totalCount, locale)}</strong>
            {t("today.activity.total")}
          </span>
          <span>
            <strong>{formatInteger(heatmap.activeDayCount, locale)}</strong>
            {t("today.activity.activeDays")}
          </span>
          <span>
            <strong>{formatInteger(heatmap.todayCount, locale)}</strong>
            {t("nav.today")}
          </span>
        </div>
      </div>
      <div className="study-activity-board">
        <div className="study-activity-weekday-labels" aria-hidden="true">
          <span>{t("today.activity.weekdays.monday")}</span>
          <span>{t("today.activity.weekdays.wednesday")}</span>
          <span>{t("today.activity.weekdays.friday")}</span>
        </div>
        <div className="study-activity-scroll">
          <div className="study-activity-months" aria-hidden="true">
            {heatmap.weeks.map((week, index) => (
              <span key={`${week.monthLabel}-${index}`}>{week.monthLabel}</span>
            ))}
          </div>
          <div aria-hidden="true" className="study-activity-weeks">
            {heatmap.weeks.map((week, weekIndex) => (
              <div className="study-activity-week" key={weekIndex}>
                {week.days.map((day) => (
                  <span
                    className={
                      day.isToday
                        ? `study-activity-cell level-${day.level} today`
                        : `study-activity-cell level-${day.level}`
                    }
                    key={day.dateKey}
                    title={t("today.activity.dayCount", {
                      date: formatActivityDate(day.dateKey, locale),
                      formattedCount: formatInteger(day.count, locale)
                    })}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="study-activity-footer">
        <span>{t("today.activity.sources")}</span>
        <div className="study-activity-legend" aria-hidden="true">
          <span>{t("today.activity.less")}</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <i className={`study-activity-cell level-${level}`} key={level} />
          ))}
          <span>{t("today.activity.more")}</span>
        </div>
      </div>
    </section>
  );
}

type TodayHubCardProps = {
  accent: "review" | "life" | "listening";
  actionLabel: string;
  barHighlightIndex: number;
  barLabels: string[];
  barValues: number[];
  current: number;
  dataQa: string;
  icon: ReactNode;
  status: string;
  target: number;
  title: string;
  onClick: () => void;
};

function TodayHubCard({
  accent,
  actionLabel,
  barHighlightIndex,
  barLabels,
  barValues,
  current,
  dataQa,
  icon,
  status,
  target,
  title,
  onClick
}: TodayHubCardProps) {
  const { i18n, t } = useTranslation();
  const locale = (i18n.resolvedLanguage ?? i18n.language).startsWith("en") ? "en" : "ko";
  const color = getTodayHubAccentColor(accent);
  const percent = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const maxBarValue = Math.max(1, ...barValues);

  return (
    <button
      aria-label={t("today.cardActionAria", {
        title,
        action: actionLabel,
        current: formatInteger(current, locale),
        target: formatInteger(target, locale)
      })}
      className={`today-hub-card ${accent}`}
      data-qa={dataQa}
      type="button"
      onClick={onClick}
    >
      <div className="today-hub-card-title">
        <span className="today-hub-card-icon">{icon}</span>
        <strong>{title}</strong>
      </div>
      <div className="today-hub-card-body">
        <span
          aria-hidden="true"
          className="today-hub-ring"
          style={{
            background: `conic-gradient(${color} ${percent}%, #edf2f7 0)`
          }}
        >
          <span />
        </span>
        <div className="today-hub-card-metric">
          <strong>
            {formatInteger(current, locale)}
            <span>/ {formatInteger(target, locale)}</span>
          </strong>
          <small>{status}</small>
        </div>
        <div className="today-hub-mini-chart" aria-hidden="true">
          {barValues.map((value, index) => (
            <span
              className={
                index === barHighlightIndex ? "today-hub-mini-bar today" : "today-hub-mini-bar"
              }
              key={`${barLabels[index] ?? index}-${index}`}
            >
              <i style={{ height: `${getTodayHubBarHeight(value, maxBarValue)}px` }} />
              <small>{barLabels[index] ?? ""}</small>
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}

type TodayHubWeekSeries = {
  labels: string[];
  todayIndex: number;
  review: number[];
  life: number[];
  listening: number[];
};

function buildTodayHubWeekSeries(input: {
  cards: StudyCard[];
  lifeLogs: LifeLog[];
  locale?: "ko" | "en";
  now?: Date;
}): TodayHubWeekSeries {
  const days = getCurrentWeekDays(input.now ?? new Date());
  const labels = days.map((day) => getWeekdayLabel(day.date, input.locale));
  const reviewCounts = countByDateKey(
    input.cards,
    (card) => card.srs.lastReviewedAt,
    days
  );
  const lifeCounts = countByDateKey(input.lifeLogs, (log) => log.createdAt, days);
  const listeningCounts = countByDateKey(
    input.cards.filter((card) => card.deckType === "input-listening"),
    (card) => card.createdAt,
    days
  );

  return {
    labels,
    todayIndex: days.findIndex((day) => day.isToday),
    review: reviewCounts,
    life: lifeCounts,
    listening: listeningCounts
  };
}

function getCurrentWeekDays(now: Date) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const mondayOffset = (today.getDay() + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - mondayOffset);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);

    return {
      date,
      isToday: getReviewDateKey(date) === getReviewDateKey(today),
      key: getReviewDateKey(date)
    };
  });
}

function countByDateKey<T>(
  items: T[],
  getDateValue: (item: T) => string | undefined,
  days: Array<{ key: string }>
) {
  const counts = new Map(days.map((day) => [day.key, 0]));

  for (const item of items) {
    const dateValue = getDateValue(item);
    if (!dateValue) {
      continue;
    }

    const time = Date.parse(dateValue);
    if (!Number.isFinite(time)) {
      continue;
    }

    const key = getReviewDateKey(new Date(time));
    if (counts.has(key)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return days.map((day) => counts.get(day.key) ?? 0);
}

function getWeekdayLabel(date: Date, locale: "ko" | "en" = "ko") {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
    weekday: "short"
  }).format(date);
}

function getTodayHubBarHeight(value: number, maxBarValue: number) {
  if (value <= 0) {
    return 7;
  }
  return Math.max(12, Math.round((value / maxBarValue) * 44));
}

function formatInteger(value: number, locale: "ko" | "en" = "ko") {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "ko-KR").format(
    Math.max(0, Math.floor(value))
  );
}

function formatActivityDate(dateKey: string, locale: "ko" | "en") {
  const date = new Date(`${dateKey}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? dateKey
    : new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
        dateStyle: "medium"
      }).format(date);
}

function getTodayHubAccentColor(accent: TodayHubCardProps["accent"]) {
  if (accent === "review") {
    return "#43b566";
  }
  if (accent === "life") {
    return "#2563eb";
  }
  return "#0891b2";
}

function getRoutinePanelClassName(run: DailyRoutineRun | null) {
  if (!run) {
    return "daily-routine-panel";
  }
  return `daily-routine-panel ${run.status}`;
}

function getRoutineTitle(t: TFunction, run: DailyRoutineRun | null) {
  if (!run) {
    return t("today.routine.notStartedTitle");
  }
  if (run.status === "completed") {
    return t("today.routine.completedTitle");
  }
  if (run.status === "paused") {
    return t("today.routine.pausedTitle");
  }
  return t("today.routine.runningTitle");
}

function getRoutineDescription(
  t: TFunction,
  run: DailyRoutineRun | null,
  step: DailyRoutineStep | null
) {
  if (!run) {
    return t("today.routine.notStartedDescription");
  }
  if (run.status === "completed") {
    return t("today.routine.completedDescription");
  }
  if (!step) {
    return t("today.routine.pausedDescription");
  }
  return t("today.routine.currentStep", {
    title: getLocalizedRoutineStepTitle(t, step),
    description: getLocalizedRoutineStepDescription(t, step)
  });
}

function getRoutineButtonLabel(t: TFunction, run: DailyRoutineRun | null) {
  if (!run) {
    return t("today.routine.start");
  }
  if (run.status === "completed") {
    return t("today.routine.restart");
  }
  if (run.status === "paused") {
    return t("today.routine.resume");
  }
  return t("today.routine.openCurrent");
}

function getLocalizedRoutineStepTitle(t: TFunction, step: DailyRoutineStep) {
  if (step.id === "review") return t("today.routine.steps.review.title");
  if (step.id === "listening-loop") return t("today.routine.steps.listening.title");
  if (step.id === "writing-practice") return t("today.routine.steps.writing.title");
  return t("today.routine.steps.rewards.title");
}

function getLocalizedRoutineStepDescription(t: TFunction, step: DailyRoutineStep) {
  if (step.id === "review") return t("today.routine.steps.review.description");
  if (step.id === "listening-loop") return t("today.routine.steps.listening.description");
  if (step.id === "writing-practice") return t("today.routine.steps.writing.description");
  return t("today.routine.steps.rewards.description");
}
