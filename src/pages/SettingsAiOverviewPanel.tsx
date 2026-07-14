import { Languages, Sparkles, Volume2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AppSettings } from "../shared/types";
import { translationProviderPresets, ttsProviderPresets } from "./settingsPageOptions";

type SettingsAiOverviewPanelProps = {
  settings: AppSettings;
};

export function SettingsAiOverviewPanel({ settings }: SettingsAiOverviewPanelProps) {
  const { t } = useTranslation();
  const ttsPreset = ttsProviderPresets.find(
    (preset) => preset.value === settings.ttsProviderName
  );
  const translationPreset = translationProviderPresets.find(
    (preset) => preset.value === settings.translationProviderName
  );
  const cardProviderLabel =
    settings.providerName === "gemini"
      ? "Gemini"
      : settings.providerName === "ollama"
        ? "Ollama"
        : settings.providerName === "chatgptWeb"
          ? t("manualChatGptBridge.providerLabel")
          : t("settings.cardEngine.providers.mock.label");

  return (
    <section className="panel settings-ai-overview-panel">
      <div className="settings-ai-overview-heading">
        <div>
          <span className="profile-account-eyebrow">{t("settings.aiOverview.eyebrow")}</span>
          <h2>{t("settings.aiOverview.title")}</h2>
        </div>
        <p>{t("settings.aiOverview.description")}</p>
      </div>
      <div className="settings-ai-overview-grid">
        <div>
          <Sparkles size={17} />
          <span>
            <small>{t("settings.aiOverview.cardGeneration")}</small>
            <strong>{cardProviderLabel}</strong>
          </span>
        </div>
        <div>
          <Languages size={17} />
          <span>
            <small>{t("settings.aiOverview.documentTranslation")}</small>
            <strong>
              {translationPreset
                ? t(translationPreset.labelKey)
                : t("settings.aiOverview.defaultTranslation")}
            </strong>
          </span>
        </div>
        <div>
          <Volume2 size={17} />
          <span>
            <small>{t("settings.aiOverview.cardVoice")}</small>
            <strong>
              {ttsPreset ? t(ttsPreset.labelKey) : t("settings.aiOverview.defaultVoice")}
            </strong>
          </span>
        </div>
      </div>
    </section>
  );
}
