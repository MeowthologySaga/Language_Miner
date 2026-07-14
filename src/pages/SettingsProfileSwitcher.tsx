import { Plus, Settings, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog } from "../components/Dialog";
import type { LearningProfileRecord, ProfileId } from "../shared/types";
import { getProfileInitials } from "./settingsPageUtils";

type ProfileStats = Record<
  ProfileId,
  {
    cardCount: number;
    dueCount: number;
  }
>;

type SettingsProfileSwitcherProps = {
  activeProfileId: ProfileId;
  profileStats: ProfileStats;
  profiles: LearningProfileRecord[];
  onClose: () => void;
  onCreateProfile: () => void;
  onOpenManager: () => void;
  onSelectProfile: (profileId: ProfileId) => void;
};

export function SettingsProfileSwitcher({
  activeProfileId,
  profileStats,
  profiles,
  onClose,
  onCreateProfile,
  onOpenManager,
  onSelectProfile
}: SettingsProfileSwitcherProps) {
  const { i18n, t } = useTranslation();
  const useEnglishNames = (i18n.resolvedLanguage ?? i18n.language).startsWith("en");
  return (
    <Dialog
      ariaLabel={t("settings.profile.switch")}
      backdropClassName="profile-switch-modal-backdrop"
      className="profile-switch-modal"
      onClose={onClose}
    >
        <div className="profile-switch-modal-heading">
          <div>
            <span>{t("settings.profile.switchEyebrow")}</span>
            <h2>{t("settings.profile.switch")}</h2>
          </div>
          <button
            aria-label={t("settings.profile.closeSwitcher")}
            className="icon-button"
            type="button"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="profile-switch-list">
          {profiles.map((profile) => {
            const stat = profileStats[profile.id];
            const isActive = profile.id === activeProfileId;
            return (
              <button
                className={isActive ? "active" : ""}
                key={profile.id}
                type="button"
                onClick={() => onSelectProfile(profile.id)}
              >
                <span className="profile-avatar large">{getProfileInitials(profile)}</span>
                <span className="profile-switch-body">
                  <strong>{profile.name}</strong>
                  <small>
                    {useEnglishNames
                      ? profile.learningProfile.targetLanguage.nameEn
                      : profile.learningProfile.targetLanguage.nameKo}{" "}
                    →{" "}
                    {useEnglishNames
                      ? profile.learningProfile.nativeLanguage.nameEn
                      : profile.learningProfile.nativeLanguage.nameKo}
                  </small>
                  <small>
                    {t("settings.profile.cardsCount", { count: stat?.cardCount ?? 0 })} ·{" "}
                    {t("settings.profile.reviewsCount", { count: stat?.dueCount ?? 0 })}
                  </small>
                </span>
                {isActive ? (
                  <span className="active-profile-badge">{t("settings.profile.active")}</span>
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="profile-switch-actions">
          <button className="button secondary" type="button" onClick={onCreateProfile}>
            <Plus size={17} />
            {t("settings.profile.new")}
          </button>
          <button className="button primary" type="button" onClick={onOpenManager}>
            <Settings size={17} />
            {t("settings.profile.manage")}
          </button>
        </div>
    </Dialog>
  );
}
