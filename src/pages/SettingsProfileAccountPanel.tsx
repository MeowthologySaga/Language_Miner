import { Settings, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AppSettings, LearningProfileRecord } from "../shared/types";
import { getProfileInitials } from "./settingsPageUtils";

type SettingsProfileAccountPanelProps = {
  activeProfile: LearningProfileRecord | undefined;
  activeProfileStat?: {
    cardCount: number;
    dueCount: number;
  };
  settings: AppSettings;
  onOpenManager: () => void;
  onOpenSwitcher: () => void;
};

export function SettingsProfileAccountPanel({
  activeProfile,
  activeProfileStat,
  settings,
  onOpenManager,
  onOpenSwitcher
}: SettingsProfileAccountPanelProps) {
  const { i18n, t } = useTranslation();
  const useEnglishNames = (i18n.resolvedLanguage ?? i18n.language).startsWith("en");
  return (
    <section className="settings-panel profile-account-panel">
      <div className="profile-account-main">
        <span className="profile-avatar large">{getProfileInitials(activeProfile)}</span>
        <div>
          <span className="profile-account-eyebrow">{t("settings.profile.current")}</span>
          <h2>{activeProfile?.name ?? t("app.profile.fallbackName")}</h2>
          <p>
            {useEnglishNames
              ? settings.learningProfile.targetLanguage.nameEn
              : settings.learningProfile.targetLanguage.nameKo}{" "}
            →{" "}
            {useEnglishNames
              ? settings.learningProfile.nativeLanguage.nameEn
              : settings.learningProfile.nativeLanguage.nameKo}
          </p>
        </div>
      </div>
      <div className="profile-account-stats" aria-label={t("settings.profile.statsLabel")}>
        <span>{t("settings.profile.cardsCount", { count: activeProfileStat?.cardCount ?? 0 })}</span>
        <span>{t("settings.profile.reviewsCount", { count: activeProfileStat?.dueCount ?? 0 })}</span>
        <span>{t("settings.profile.documentsSeparate")}</span>
        <span>{t("settings.profile.lifeLogShared")}</span>
      </div>
      <div className="profile-account-actions">
        <button
          className="button primary"
          data-qa="settings-profile-switch"
          type="button"
          onClick={onOpenSwitcher}
        >
          <Users size={17} />
          {t("settings.profile.switch")}
        </button>
        <button
          className="button secondary"
          data-qa="settings-profile-manage"
          type="button"
          onClick={onOpenManager}
        >
          <Settings size={17} />
          {t("settings.profile.manage")}
        </button>
      </div>
    </section>
  );
}
