import { CheckCircle2, Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AppSettings, ProviderName } from "../shared/types";
import { getSettingsStatusClassName } from "./settingsPageUtils";
import { ollamaModelPresets } from "./settingsPageOptions";

type SettingsCardEnginePanelProps = {
  className: string;
  connectionStatus: string;
  isTestingConnection: boolean;
  showOllamaSettings?: boolean;
  settings: AppSettings;
  onSettingsChange: (next: Partial<AppSettings>) => void;
  onTestConnection: () => void;
};

const cardProviderPresets: Array<{
  value: ProviderName;
  labelKey:
    | "settings.cardEngine.providers.gemini.label"
    | "settings.cardEngine.providers.ollama.label"
    | "manualChatGptBridge.providerLabel"
    | "settings.cardEngine.providers.mock.label";
  descriptionKey:
    | "settings.cardEngine.providers.gemini.description"
    | "settings.cardEngine.providers.ollama.description"
    | "manualChatGptBridge.providerDescription"
    | "settings.cardEngine.providers.mock.description";
}> = [
  {
    value: "gemini",
    labelKey: "settings.cardEngine.providers.gemini.label",
    descriptionKey: "settings.cardEngine.providers.gemini.description"
  },
  {
    value: "ollama",
    labelKey: "settings.cardEngine.providers.ollama.label",
    descriptionKey: "settings.cardEngine.providers.ollama.description"
  },
  {
    value: "chatgptWeb",
    labelKey: "manualChatGptBridge.providerLabel",
    descriptionKey: "manualChatGptBridge.providerDescription"
  },
  {
    value: "mock",
    labelKey: "settings.cardEngine.providers.mock.label",
    descriptionKey: "settings.cardEngine.providers.mock.description"
  }
];

export function SettingsCardEnginePanel({
  className,
  connectionStatus,
  isTestingConnection,
  showOllamaSettings = false,
  settings,
  onSettingsChange,
  onTestConnection
}: SettingsCardEnginePanelProps) {
  const { t } = useTranslation();
  const ollamaIsLoopback = isLoopbackOllamaUrl(settings.ollamaBaseUrl);
  return (
    <section className={className}>
      <div className="settings-ai-section-heading">
        <span className="settings-ai-step">1</span>
        <div>
          <h2>{t("settings.cardEngine.title")}</h2>
          <p>{t("settings.cardEngine.description")}</p>
        </div>
      </div>
      <div
        aria-label={t("settings.cardEngine.providerLabel")}
        className="settings-provider-grid four"
        role="group"
      >
        {cardProviderPresets.map((preset) => (
          <button
            aria-pressed={settings.providerName === preset.value}
            className={settings.providerName === preset.value ? "active" : ""}
            key={preset.value}
            type="button"
            onClick={() => onSettingsChange({ providerName: preset.value })}
          >
            <span>
              <strong>{t(preset.labelKey)}</strong>
              <small>
                {preset.value === "ollama" && !ollamaIsLoopback
                  ? t("settings.cardEngine.providers.ollama.remoteDescription")
                  : t(preset.descriptionKey)}
              </small>
            </span>
            {settings.providerName === preset.value ? <CheckCircle2 size={17} /> : null}
          </button>
        ))}
      </div>

      {settings.providerName === "gemini" ? (
        <div className="settings-ai-config-block">
          <div className="settings-selected-provider-note" role="status">
            <Settings size={16} />
            <span>{t("settings.cardEngine.geminiSharedSettings")}</span>
          </div>
          <button
            className="button secondary settings-connection-button"
            data-qa="settings-card-engine-gemini-test"
            disabled={isTestingConnection}
            type="button"
            onClick={onTestConnection}
          >
            <CheckCircle2 size={18} />
            {isTestingConnection
              ? t("settings.connection.testing")
              : t("settings.connection.test")}
          </button>
        </div>
      ) : null}

      {settings.providerName === "mock" ? (
        <div className="settings-selected-provider-note" role="status">
          <Settings size={16} />
          <span>{t("settings.cardEngine.mockNoCost")}</span>
        </div>
      ) : null}

      {settings.providerName === "chatgptWeb" ? (
        <div className="settings-selected-provider-note" role="status">
          <Settings size={16} />
          <span>{t("manualChatGptBridge.settingsNote")}</span>
        </div>
      ) : null}

      {settings.providerName === "ollama" || showOllamaSettings ? (
        <div className="settings-ai-config-block">
          <div className="settings-two-column">
            <label className="field-label">
              {t("settings.cardEngine.ollamaUrl")}
              <input
                className="text-input"
                data-qa="settings-ollama-url"
                value={settings.ollamaBaseUrl}
                onChange={(event) => onSettingsChange({ ollamaBaseUrl: event.target.value })}
              />
            </label>
            <label className="field-label">
              {t("settings.cardEngine.ollamaModel")}
              <input
                className="text-input"
                data-qa="settings-ollama-model"
                value={settings.ollamaModel}
                onChange={(event) => onSettingsChange({ ollamaModel: event.target.value })}
              />
            </label>
          </div>
          <div
            aria-label={t("settings.cardEngine.ollamaPresets")}
            className="model-preset-grid settings-preset-grid ollama"
          >
            {ollamaModelPresets.map((preset) => (
              <button
                aria-pressed={settings.ollamaModel === preset.value}
                className={
                  settings.ollamaModel === preset.value
                    ? "model-preset-button active"
                    : "model-preset-button"
                }
                key={preset.value}
                type="button"
                onClick={() => onSettingsChange({ ollamaModel: preset.value })}
              >
                <strong>{t(preset.labelKey)}</strong>
                <span>{preset.value}</span>
                <small>{t(preset.descriptionKey)}</small>
              </button>
            ))}
          </div>
          {!ollamaIsLoopback ? (
            <p className="selection-warning" role="alert">
              {t("settings.cardEngine.remoteOllamaWarning")}
            </p>
          ) : null}
          <button
            className="button secondary settings-connection-button"
            data-qa="settings-card-engine-test"
            disabled={isTestingConnection || settings.providerName !== "ollama"}
            type="button"
            onClick={onTestConnection}
          >
            <CheckCircle2 size={18} />
            {settings.providerName !== "ollama"
              ? t("settings.cardEngine.selectOllamaToTest")
              : isTestingConnection
                ? t("settings.connection.testing")
                : ollamaIsLoopback
                  ? t("settings.connection.launchAndConnect")
                  : t("settings.connection.test")}
          </button>
        </div>
      ) : null}

      {connectionStatus ? (
        <p
          aria-live="polite"
          className={getSettingsStatusClassName(connectionStatus)}
          data-qa="settings-card-engine-status"
          role="status"
        >
          {connectionStatus}
        </p>
      ) : null}
    </section>
  );
}

function isLoopbackOllamaUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}
