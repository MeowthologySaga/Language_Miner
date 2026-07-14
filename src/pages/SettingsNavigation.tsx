import { CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { settingsTabOptions, type SettingsTabId } from "./settingsPageOptions";

type SettingsNavigationProps = {
  activeSettingsTab: SettingsTabId;
  isSearching: boolean;
  onSettingsSearchChange: (value: string) => void;
  onSettingsTabChange: (tab: SettingsTabId) => void;
};

export function SettingsNavigation({
  activeSettingsTab,
  isSearching,
  onSettingsSearchChange,
  onSettingsTabChange
}: SettingsNavigationProps) {
  const { t } = useTranslation();
  const tabCopy = {
    basic: { label: t("settings.tabs.basic.label"), description: t("settings.tabs.basic.description") },
    ai: { label: t("settings.tabs.ai.label"), description: t("settings.tabs.ai.description") },
    capture: { label: t("settings.tabs.capture.label"), description: t("settings.tabs.capture.description") },
    sync: { label: t("settings.tabs.sync.label"), description: t("settings.tabs.sync.description") },
    display: { label: t("settings.tabs.display.label"), description: t("settings.tabs.display.description") },
    labs: { label: t("settings.tabs.labs.label"), description: t("settings.tabs.labs.description") }
  };
  return (
    <aside aria-label={t("settings.navigationLabel")} className="panel settings-navigation">
      <div className="settings-navigation-heading">
        <strong>{t("settings.navigationTitle")}</strong>
        <span>{t("settings.navigationDescription")}</span>
      </div>
      <nav className="settings-navigation-list">
        {settingsTabOptions.map((tab) => {
          const TabIcon = tab.icon;
          const isActive = activeSettingsTab === tab.id && !isSearching;
          return (
            <button
              aria-current={isActive ? "page" : undefined}
              className={isActive ? "active" : ""}
              key={tab.id}
              type="button"
              onClick={() => {
                onSettingsTabChange(tab.id);
                onSettingsSearchChange("");
              }}
            >
              <TabIcon size={17} />
              <span>
                <strong>{tabCopy[tab.id].label}</strong>
                <small>{tabCopy[tab.id].description}</small>
              </span>
            </button>
          );
        })}
      </nav>
      <div className="settings-navigation-note">
        <CheckCircle2 size={15} />
        <span>
          <strong>{t("settings.autosaveTitle")}</strong>
          <small>{t("settings.autosaveDescription")}</small>
        </span>
      </div>
    </aside>
  );
}
