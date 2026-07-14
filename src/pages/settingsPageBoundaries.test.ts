import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const settingsPage = readFileSync(join(process.cwd(), "src", "pages", "SettingsPage.tsx"), "utf8");
const languageProfileEditor = readFileSync(
  join(process.cwd(), "src", "pages", "LanguageProfileEditor.tsx"),
  "utf8"
);
const profileAccountPanel = readFileSync(
  join(process.cwd(), "src", "pages", "SettingsProfileAccountPanel.tsx"),
  "utf8"
);
const profileSwitcher = readFileSync(
  join(process.cwd(), "src", "pages", "SettingsProfileSwitcher.tsx"),
  "utf8"
);
const settingsPageHeader = readFileSync(
  join(process.cwd(), "src", "pages", "SettingsPageHeader.tsx"),
  "utf8"
);
const settingsNavigation = readFileSync(
  join(process.cwd(), "src", "pages", "SettingsNavigation.tsx"),
  "utf8"
);
const settingsOverviewPanel = readFileSync(
  join(process.cwd(), "src", "pages", "SettingsOverviewPanel.tsx"),
  "utf8"
);
const settingsAiOverviewPanel = readFileSync(
  join(process.cwd(), "src", "pages", "SettingsAiOverviewPanel.tsx"),
  "utf8"
);
const settingsCardEnginePanel = readFileSync(
  join(process.cwd(), "src", "pages", "SettingsCardEnginePanel.tsx"),
  "utf8"
);
const settingsTtsPanel = readFileSync(
  join(process.cwd(), "src", "pages", "SettingsTtsPanel.tsx"),
  "utf8"
);
const settingsPageOptions = readFileSync(
  join(process.cwd(), "src", "pages", "settingsPageOptions.ts"),
  "utf8"
);
const settingsStyles = readFileSync(
  join(process.cwd(), "src", "styles", "settingsProfile.css"),
  "utf8"
);

describe("settings page boundaries", () => {
  it("keeps profile display components outside the main settings page", () => {
    expect(settingsPage).toContain('from "./LanguageProfileEditor"');
    expect(settingsPage).toContain('from "./SettingsProfileAccountPanel"');
    expect(settingsPage).toContain('from "./SettingsProfileSwitcher"');
    expect(settingsPage).not.toContain("function LanguageProfileEditor");
    expect(settingsPage).not.toContain("function SettingsProfileAccountPanel");
    expect(settingsPage).not.toContain("function SettingsProfileSwitcher");
    expect(settingsPage).not.toContain("className=\"profile-switch-modal\"");

    expect(languageProfileEditor).toContain("export function LanguageProfileEditor");
    expect(languageProfileEditor).not.toContain('from "./SettingsPage"');

    expect(profileAccountPanel).toContain("export function SettingsProfileAccountPanel");
    expect(profileAccountPanel).not.toContain('from "./SettingsPage"');

    expect(profileSwitcher).toContain("export function SettingsProfileSwitcher");
    expect(profileSwitcher).toContain("className=\"profile-switch-modal\"");
    expect(profileSwitcher).not.toContain('from "./SettingsPage"');
  });

  it("keeps settings header, navigation, and overview panels outside the main page", () => {
    expect(settingsPage).toContain('from "./SettingsPageHeader"');
    expect(settingsPage).toContain('from "./SettingsNavigation"');
    expect(settingsPage).toContain('from "./SettingsOverviewPanel"');
    expect(settingsPage).not.toContain("function SettingsPageHeader");
    expect(settingsPage).not.toContain("function SettingsOverviewPanel");
    expect(settingsPage).not.toContain("className=\"settings-page-header\"");
    expect(settingsPage).not.toContain("className=\"settings-overview-grid\"");

    expect(settingsPageHeader).toContain("export function SettingsPageHeader");
    expect(settingsNavigation).toContain("export function SettingsNavigation");
    expect(settingsNavigation).toContain('className="panel settings-navigation"');
    expect(settingsOverviewPanel).toContain("export function SettingsOverviewPanel");
    expect(settingsPageHeader).not.toContain('from "./SettingsPage"');
    expect(settingsOverviewPanel).not.toContain('from "./SettingsPage"');
  });

  it("keeps model and TTS settings panels outside the main page", () => {
    expect(settingsPage).toContain('from "./SettingsAiOverviewPanel"');
    expect(settingsPage).toContain('from "./SettingsCardEnginePanel"');
    expect(settingsPage).toContain('from "./SettingsTtsPanel"');
    expect(settingsPage).not.toContain("function SettingsCardEnginePanel");
    expect(settingsPage).not.toContain("function SettingsTtsPanel");
    expect(settingsPage).not.toContain("aria-label=\"Ollama 모델 프리셋\"");
    expect(settingsPage).not.toContain("aria-label=\"TTS 모델 프리셋\"");

    expect(settingsAiOverviewPanel).toContain("export function SettingsAiOverviewPanel");
    expect(settingsAiOverviewPanel).toContain('className="panel settings-ai-overview-panel"');
    expect(settingsAiOverviewPanel).not.toContain('from "./SettingsPage"');

    expect(settingsCardEnginePanel).toContain("export function SettingsCardEnginePanel");
    expect(settingsCardEnginePanel).toContain('import { useTranslation } from "react-i18next"');
    expect(settingsCardEnginePanel).toContain(
      'aria-label={t("settings.cardEngine.ollamaPresets")}'
    );
    expect(settingsCardEnginePanel).not.toContain('aria-label="Ollama');
    expect(settingsCardEnginePanel).not.toContain('from "./SettingsPage"');

    expect(settingsTtsPanel).toContain("export function SettingsTtsPanel");
    expect(settingsTtsPanel).toContain('import { useTranslation } from "react-i18next"');
    expect(settingsTtsPanel).toContain('aria-label={t("settings.tts.modelPresets")}');
    expect(settingsTtsPanel).not.toContain('aria-label="TTS');
    expect(settingsTtsPanel).not.toContain('from "./SettingsPage"');
  });

  it("keeps Settings tabs and preset option data outside the main page", () => {
    expect(settingsPage).toContain('from "./settingsPageOptions"');
    expect(settingsPage).not.toContain("const settingsTabOptions");
    expect(settingsPage).not.toContain("const ollamaModelPresets");
    expect(settingsPage).not.toContain("const browserCaptureSiteOptions");
    expect(settingsPage).not.toContain("const lifeMiningPresetOptions");

    expect(settingsPageOptions).toContain("export const settingsTabOptions");
    expect(settingsPageOptions).toContain("export const ollamaModelPresets");
    expect(settingsPageOptions).toContain("export const browserCaptureSiteOptions");
    expect(settingsPageOptions).toContain("export function isSettingsPanelVisible");
  });

  it("uses the accessible shared dialog for sensitive settings confirmations", () => {
    expect(settingsPage).toContain('from "../components/Dialog"');
    expect(settingsPage).toContain("pendingSettingsConfirmation");
    expect(settingsPage).not.toContain("window.confirm");
  });

  it("returns the settings workspace to the top when changing categories", () => {
    expect(settingsPage).toContain("settingsPageRef.current?.scrollIntoView");
    expect(settingsPage).toContain("onSettingsTabChange={selectSettingsTab}");
  });

  it("keeps ordinary settings interactions in React state without a document reload", () => {
    const settingsSources = [
      settingsPage,
      settingsPageHeader,
      settingsNavigation,
      settingsAiOverviewPanel,
      settingsCardEnginePanel,
      settingsTtsPanel
    ];
    for (const source of settingsSources) {
      expect(source).not.toMatch(/(?:window\.)?location\.reload\s*\(/);
      expect(source).not.toMatch(/window\.location\s*=/);
    }
    expect(settingsNavigation).toContain('type="button"');
    expect(settingsPageHeader).toContain("onSettingsSearchChange(event.target.value)");
  });

  it("exposes an automatable Ollama connection flow and wraps long localized copy", () => {
    expect(settingsCardEnginePanel).toContain('data-qa="settings-ollama-url"');
    expect(settingsCardEnginePanel).toContain('data-qa="settings-ollama-model"');
    expect(settingsCardEnginePanel).toContain('data-qa="settings-card-engine-test"');
    expect(settingsCardEnginePanel).toContain('data-qa="settings-card-engine-status"');
    expect(settingsStyles).toContain(".settings-page-title-row > *");
    expect(settingsStyles).toContain("overflow-wrap: anywhere");
  });
});
