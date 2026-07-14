import { CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AppSettings } from "../shared/types";
import { ttsModelPresets, ttsProviderPresets } from "./settingsPageOptions";

type SettingsTtsPanelProps = {
  className: string;
  settings: AppSettings;
  showUnavailableDetails?: boolean;
  onSettingsChange: (next: Partial<AppSettings>) => void;
};

export function SettingsTtsPanel({
  className,
  settings,
  showUnavailableDetails = false,
  onSettingsChange
}: SettingsTtsPanelProps) {
  const { t } = useTranslation();
  return (
    <section className={className}>
      <div className="settings-ai-section-heading">
        <span className="settings-ai-step">3</span>
        <div>
          <h2>{t("settings.tts.title")}</h2>
          <p>{t("settings.tts.description")}</p>
        </div>
      </div>

      <div aria-label={t("settings.tts.engineLabel")} className="settings-provider-grid three" role="group">
        {ttsProviderPresets.map((preset) => (
          <button
            aria-pressed={settings.ttsProviderName === preset.value}
            className={settings.ttsProviderName === preset.value ? "active" : ""}
            disabled={preset.value === "piper"}
            key={preset.value}
            type="button"
            onClick={() => onSettingsChange({ ttsProviderName: preset.value })}
          >
            <span>
              <strong>{t(preset.labelKey)}</strong>
              <small>{t(preset.descriptionKey)}</small>
            </span>
            {settings.ttsProviderName === preset.value ? <CheckCircle2 size={17} /> : null}
          </button>
        ))}
      </div>

      {settings.ttsProviderName === "piper" || showUnavailableDetails ? (
        <div className="settings-unavailable-option" role="status">
          <strong>{t("settings.tts.piperUnavailableTitle")}</strong>
          <span>{t("settings.tts.piperUnavailableDescription")}</span>
          <label className="field-label">
            {t("settings.tts.model")}
            <input className="text-input" disabled readOnly value={settings.ttsModel} />
          </label>
          <div
            aria-label={t("settings.tts.modelPresets")}
            className="model-preset-grid settings-preset-grid"
          >
            {ttsModelPresets
              .filter((preset) => preset.value.startsWith("piper-"))
              .map((preset) => (
                <button className="model-preset-button" disabled key={preset.value} type="button">
                  <strong>{t(preset.labelKey)}</strong>
                  <span>{preset.value}</span>
                  <small>{t(preset.descriptionKey)}</small>
                </button>
              ))}
          </div>
        </div>
      ) : null}

      <div className="settings-ai-config-block compact">
        <div className="settings-two-column">
          <label className="field-label">
            {t("settings.tts.voiceName")}
            <input
              className="text-input"
              placeholder={t("settings.tts.voicePlaceholder")}
              value={settings.ttsVoiceName}
              onChange={(event) => onSettingsChange({ ttsVoiceName: event.target.value })}
            />
          </label>
          <label className="field-label">
            {t("settings.tts.rate")}
            <input
              className="text-input"
              max={10}
              min={-10}
              type="number"
              value={settings.ttsRate}
              onChange={(event) => onSettingsChange({ ttsRate: Number(event.target.value) || 0 })}
            />
            <small>{t("settings.tts.rateHint")}</small>
          </label>
        </div>
        <label className="toggle-field">
          <input
            checked={settings.ttsProviderName !== "browser" && settings.preGenerateCardTts}
            disabled={settings.ttsProviderName === "browser"}
            type="checkbox"
            onChange={(event) => onSettingsChange({ preGenerateCardTts: event.target.checked })}
          />
          <span>
            <strong>{t("settings.tts.preGenerateTitle")}</strong>
            <small>
              {settings.ttsProviderName === "browser"
                ? t("settings.tts.preGenerateBrowserUnavailable")
                : t("settings.tts.preGenerateDescription")}
            </small>
          </span>
        </label>
      </div>
    </section>
  );
}
