import { CheckCircle2, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

type SettingsPageHeaderProps = {
  normalizedSettingsSearch: string;
  settingsSearch: string;
  onSettingsSearchChange: (value: string) => void;
};

export function SettingsPageHeader({
  normalizedSettingsSearch,
  settingsSearch,
  onSettingsSearchChange
}: SettingsPageHeaderProps) {
  const { t } = useTranslation();
  return (
    <section className="panel settings-page-header">
      <div className="settings-page-title-row">
        <div>
          <span className="profile-account-eyebrow">{t("settings.eyebrow")}</span>
          <h1>{t("settings.title")}</h1>
          <p>{t("settings.description")}</p>
        </div>
        <div className="settings-header-actions">
          <label className="settings-search">
            <Search size={16} />
            <input
              aria-label={t("settings.searchLabel")}
              data-qa="settings-search"
              placeholder={t("settings.searchPlaceholder")}
              value={settingsSearch}
              onChange={(event) => onSettingsSearchChange(event.target.value)}
            />
          </label>
          <span className="settings-autosave-status">
            <CheckCircle2 size={15} />
            {t("settings.autosave")}
          </span>
        </div>
      </div>
      {normalizedSettingsSearch ? (
        <span aria-live="polite" className="settings-search-status" role="status">
          {t("settings.searchResult", { query: settingsSearch })}
        </span>
      ) : null}
    </section>
  );
}
