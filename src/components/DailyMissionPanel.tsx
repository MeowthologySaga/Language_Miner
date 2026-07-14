import { CheckCircle2, Gem, Gift } from "lucide-react";
import { useTranslation } from "react-i18next";
import { normalizeDailyMissionBoard } from "../shared/dailyMissions";
import type {
  DailyMissionBoard,
  DailyMissionCategory,
  DailyMissionId,
  DailyMissionStatus,
  DiamondWallet
} from "../shared/types";

type DailyMissionPanelProps = {
  missionBoard: DailyMissionBoard;
  wallet: DiamondWallet;
  onClaimMission: (missionId: DailyMissionId) => Promise<void>;
  onClaimDailyBonus: () => Promise<void>;
};

type MissionCardProps = {
  mission: DailyMissionStatus;
  onClaim: () => Promise<void>;
};

const dailyMissionCategoryOrder: DailyMissionCategory[] = ["input", "output", "review"];

const dailyMissionCategoryKeys = {
  input: "dailyMissions.categories.input",
  output: "dailyMissions.categories.output",
  review: "dailyMissions.categories.review"
} as const satisfies Record<DailyMissionCategory, string>;

const dailyMissionCopyKeys = {
  "review-10": {
    title: "dailyMissions.definitions.reviewReading.title",
    description: "dailyMissions.definitions.reviewReading.description"
  },
  "review-30": {
    title: "dailyMissions.definitions.reviewReading.title",
    description: "dailyMissions.definitions.reviewReading.description"
  },
  "card-2": { title: "dailyMissions.definitions.card2.title", description: "dailyMissions.definitions.card2.description" },
  "listening-30": { title: "dailyMissions.definitions.listening30.title", description: "dailyMissions.definitions.listening30.description" },
  "writing-3": { title: "dailyMissions.definitions.writing3.title", description: "dailyMissions.definitions.writing3.description" },
  "life-mining-card-5": { title: "dailyMissions.definitions.lifeMining5.title", description: "dailyMissions.definitions.lifeMining5.description" },
  "review-input-reading-deck": { title: "dailyMissions.definitions.reviewReading.title", description: "dailyMissions.definitions.reviewReading.description" },
  "review-input-listening-deck": { title: "dailyMissions.definitions.reviewListening.title", description: "dailyMissions.definitions.reviewListening.description" },
  "review-output-deck": { title: "dailyMissions.definitions.reviewOutput.title", description: "dailyMissions.definitions.reviewOutput.description" },
  "writing-10": {
    title: "dailyMissions.definitions.writing3.title",
    description: "dailyMissions.definitions.writing3.description"
  }
} as const satisfies Record<DailyMissionId, { title: string; description: string }>;

export function DailyMissionPanel({
  missionBoard,
  wallet,
  onClaimMission,
  onClaimDailyBonus
}: DailyMissionPanelProps) {
  const { i18n, t } = useTranslation();
  const locale = (i18n.resolvedLanguage ?? i18n.language).startsWith("en") ? "en-US" : "ko-KR";
  const normalizedMissionBoard = normalizeDailyMissionBoard(missionBoard);
  const missionGroups = getDailyMissionGroups(normalizedMissionBoard.missions);

  return (
    <section className="daily-mission-panel">
      <div className="daily-mission-header">
        <div>
          <span className="daily-mission-eyebrow">{t("dailyMissions.eyebrow")}</span>
          <h2>{t("dailyMissions.title")}</h2>
          <p>{t("dailyMissions.description")}</p>
        </div>
        <div className="diamond-wallet-card">
          <Gem size={22} />
          <span>
            <strong>{formatInteger(wallet.balance, locale)}</strong>
            <small>{t("dailyMissions.diamondsToday", { count: normalizedMissionBoard.earnedToday })}</small>
          </span>
        </div>
      </div>
      <div className="daily-mission-category-list">
        {missionGroups.map((group) => (
          <section className="daily-mission-category" key={group.category}>
            <div className="daily-mission-category-head">
              <span>{t(dailyMissionCategoryKeys[group.category])}</span>
              <small>
                {group.claimedCount} / {group.totalCount}
              </small>
            </div>
            <div className="daily-mission-grid">
              {group.missions.length > 0 ? (
                group.missions.map((mission) => (
                  <MissionCard
                    key={mission.id}
                    mission={mission}
                    onClaim={() => onClaimMission(mission.id)}
                  />
                ))
              ) : (
                <div className="mission-empty-card">
                  <strong>{t("dailyMissions.empty.title", { category: t(dailyMissionCategoryKeys[group.category]) })}</strong>
                  <small>{t("dailyMissions.empty.description")}</small>
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
      <div className={getDailyBonusCardClassName(normalizedMissionBoard.bonus)}>
        <div>
          <Gift size={20} />
          <span>
            <strong>{t("dailyMissions.bonus.title")}</strong>
            <small>{t("dailyMissions.bonus.description")}</small>
          </span>
        </div>
        <div className="daily-bonus-side">
          <span className="mission-reward">
            <Gem size={14} />
            {normalizedMissionBoard.bonus.rewardDiamonds}
          </span>
          <button
            className="button primary small"
            disabled={!normalizedMissionBoard.bonus.claimable}
            type="button"
            onClick={() => void onClaimDailyBonus()}
          >
            {t(getDailyBonusButtonKey(normalizedMissionBoard.bonus))}
          </button>
        </div>
      </div>
    </section>
  );
}

function getDailyMissionGroups(missions: DailyMissionStatus[]) {
  return dailyMissionCategoryOrder.map((category) => {
    const categoryMissions = missions.filter((mission) => mission.category === category);
    return {
      category,
      missions: categoryMissions,
      totalCount: categoryMissions.length,
      claimedCount: categoryMissions.filter((mission) => mission.claimed).length
    };
  });
}

function MissionCard({ mission, onClaim }: MissionCardProps) {
  const { i18n, t } = useTranslation();
  const locale = (i18n.resolvedLanguage ?? i18n.language).startsWith("en") ? "en-US" : "ko-KR";
  const copyKeys = dailyMissionCopyKeys[mission.id];
  const progressPercent = Math.min(100, Math.round((mission.progress / mission.goal) * 100));
  return (
    <article className={mission.claimed ? "mission-card claimed" : "mission-card"}>
      <div className="mission-card-head">
        <span className="mission-icon">
          {mission.claimed ? <CheckCircle2 size={18} /> : <Gem size={18} />}
        </span>
        <span>
          <strong>{t(copyKeys.title)}</strong>
          <small>{t(copyKeys.description)}</small>
        </span>
      </div>
      <div className="mission-progress-row">
        <span>
          {formatInteger(mission.progress, locale)} / {formatInteger(mission.goal, locale)}
        </span>
        <span className="mission-reward">
          <Gem size={14} />
          {formatInteger(mission.rewardDiamonds, locale)}
        </span>
      </div>
      <span
        aria-label={t("dailyMissions.progress", { current: mission.progress, goal: mission.goal })}
        aria-valuemax={mission.goal}
        aria-valuemin={0}
        aria-valuenow={mission.progress}
        className="mission-progress-track"
        role="progressbar"
      >
        <span style={{ width: `${progressPercent}%` }} />
      </span>
      <button
        className="button primary small"
        disabled={!mission.claimable}
        type="button"
        onClick={() => void onClaim()}
      >
        {t(mission.claimed
          ? "dailyMissions.actions.completed"
          : mission.claimable
            ? "dailyMissions.actions.claim"
            : "dailyMissions.actions.inProgress")}
      </button>
    </article>
  );
}

function getDailyBonusCardClassName(bonus: DailyMissionBoard["bonus"]) {
  if (bonus.claimed) {
    return "daily-bonus-card claimed";
  }
  if (bonus.claimable) {
    return "daily-bonus-card claimable";
  }
  return "daily-bonus-card locked";
}

function getDailyBonusButtonKey(bonus: DailyMissionBoard["bonus"]) {
  if (bonus.claimed) {
    return "dailyMissions.actions.completed" as const;
  }
  if (bonus.claimable) {
    return "dailyMissions.actions.claim" as const;
  }
  return "dailyMissions.actions.locked" as const;
}

function formatInteger(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(Math.max(0, Math.floor(value)));
}
