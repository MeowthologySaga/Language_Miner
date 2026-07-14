import { describe, expect, it } from "vitest";
import {
  getSettingsPanelClassName,
  isSettingsPanelVisible,
  settingsTabOptions,
  translationProviderPresets
} from "./settingsPageOptions";

describe("settingsPageOptions", () => {
  it("defines the expected Settings tabs in display order", () => {
    expect(settingsTabOptions.map((tab) => tab.id)).toEqual([
      "basic",
      "ai",
      "capture",
      "sync",
      "display",
      "labs"
    ]);
  });

  it("keeps translation engines in a stable user-facing order", () => {
    expect(translationProviderPresets.map((preset) => preset.value)).toEqual([
      "localMt",
      "local",
      "gemini",
      "google",
      "browser"
    ]);
  });

  it("shows the profile and app-locale panels in the general category", () => {
    expect(
      isSettingsPanelVisible({
        activeSettingsTab: "basic",
        normalizedSettingsSearch: "",
        panelId: "profile"
      })
    ).toBe(true);
    expect(
      isSettingsPanelVisible({
        activeSettingsTab: "basic",
        normalizedSettingsSearch: "",
        panelId: "locale"
      })
    ).toBe(true);
    expect(
      isSettingsPanelVisible({
        activeSettingsTab: "basic",
        normalizedSettingsSearch: "",
        panelId: "apiUsage"
      })
    ).toBe(false);
  });

  it("assigns each advanced panel to one explicit category", () => {
    expect(
      isSettingsPanelVisible({
        activeSettingsTab: "display",
        normalizedSettingsSearch: "",
        panelId: "labs"
      })
    ).toBe(false);
    expect(
      isSettingsPanelVisible({
        activeSettingsTab: "labs",
        normalizedSettingsSearch: "",
        panelId: "privacy"
      })
    ).toBe(true);
  });

  it("uses search text instead of the active tab when searching", () => {
    expect(
      isSettingsPanelVisible({
        activeSettingsTab: "display",
        normalizedSettingsSearch: "ollama",
        panelId: "cardEngine"
      })
    ).toBe(true);
    expect(
      isSettingsPanelVisible({
        activeSettingsTab: "display",
        normalizedSettingsSearch: "ollama",
        panelId: "background"
      })
    ).toBe(false);

    expect(
      isSettingsPanelVisible({
        activeSettingsTab: "capture",
        normalizedSettingsSearch: "piper",
        panelId: "tts"
      })
    ).toBe(true);
  });

  it("marks hidden panels in the composed class name", () => {
    expect(
      getSettingsPanelClassName({
        activeSettingsTab: "ai",
        extraClassName: "api-usage-panel",
        normalizedSettingsSearch: "",
        panelId: "apiUsage"
      })
    ).toBe("panel settings-panel api-usage-panel");
    expect(
      getSettingsPanelClassName({
        activeSettingsTab: "ai",
        normalizedSettingsSearch: "",
        panelId: "capture"
      })
    ).toBe("panel settings-panel settings-panel-hidden");
  });
});
