import {
  FolderOpen,
  Monitor,
  MousePointer2,
  SlidersHorizontal,
  Sparkles
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AppSettings, LifeMiningCaptureSettings } from "../shared/types";

type SettingsOverviewPanelProps = {
  lifeMiningCaptureSettings: LifeMiningCaptureSettings;
  settings: AppSettings;
};

export function SettingsOverviewPanel({
  lifeMiningCaptureSettings,
  settings
}: SettingsOverviewPanelProps) {
  const { t } = useTranslation();
  const cardProvider =
    settings.providerName === "mock"
      ? t("settings.cardEngine.providers.mock.label")
      : settings.providerName === "ollama"
        ? "Ollama"
        : settings.providerName === "chatgptWeb"
          ? t("manualChatGptBridge.providerLabel")
          : "Gemini";
  const cardProviderModel =
    settings.providerName === "chatgptWeb"
      ? t("manualChatGptBridge.manualMode")
      : settings.providerName === "ollama"
        ? settings.ollamaModel
        : settings.providerName === "mock"
          ? t("manualChatGptBridge.noModel")
          : settings.geminiModel || t("settings.overview.modelUnset");
  const lifeMiningState = !lifeMiningCaptureSettings.enabled
    ? t("settings.overview.off")
    : lifeMiningCaptureSettings.preset === "balanced"
      ? t("settings.options.lifePreset.balanced.label")
      : lifeMiningCaptureSettings.preset === "light"
        ? t("settings.options.lifePreset.light.label")
        : lifeMiningCaptureSettings.preset === "deep"
          ? t("settings.options.lifePreset.deep.label")
          : t("settings.overview.custom");
  return (
    <section className="panel settings-overview-panel">
      <div className="panel-heading">
        <SlidersHorizontal size={19} />
        <h2>{t("settings.overview.title")}</h2>
      </div>
      <div className="settings-overview-grid">
        <div className="settings-overview-card">
          <Sparkles size={18} />
          <strong>{t("settings.overview.cardGeneration")}</strong>
          <span>
            {cardProvider} · {cardProviderModel}
          </span>
        </div>
        <div className="settings-overview-card">
          <MousePointer2 size={18} />
          <strong>{t("settings.overview.capture")}</strong>
          <span>
            {settings.captureShortcut || "Ctrl+Q"} · {t("nav.lifeMining")} {lifeMiningState}
          </span>
        </div>
        <div className="settings-overview-card">
          <FolderOpen size={18} />
          <strong>{t("settings.overview.sync")}</strong>
          <span>
            {settings.cardSyncFolderPath.trim()
              ? t("settings.overview.folderConnected")
              : t("settings.overview.folderUnset")}
          </span>
        </div>
        <div className="settings-overview-card">
          <Monitor size={18} />
          <strong>{t("settings.overview.displayStartup")}</strong>
          <span>{t("settings.overview.displayStartupSummary")}</span>
        </div>
      </div>
    </section>
  );
}
