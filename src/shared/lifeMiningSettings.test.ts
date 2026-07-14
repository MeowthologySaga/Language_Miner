import { describe, expect, it } from "vitest";
import {
  defaultLifeMiningCaptureSettings,
  normalizeLifeMiningCaptureSettings,
  resolveLifeMiningPresetSettings
} from "./lifeMiningSettings";

describe("life mining capture settings", () => {
  it("uses balanced settings by default", () => {
    expect(normalizeLifeMiningCaptureSettings()).toEqual(defaultLifeMiningCaptureSettings);
    expect(defaultLifeMiningCaptureSettings.enabled).toBe(false);
  });

  it("requires an explicit master opt-in while preserving one already saved", () => {
    expect(normalizeLifeMiningCaptureSettings({ preset: "light" }).enabled).toBe(false);
    expect(normalizeLifeMiningCaptureSettings({ preset: "light", enabled: true }).enabled).toBe(true);
  });

  it("resolves presets to complete settings", () => {
    expect(resolveLifeMiningPresetSettings("light")).toMatchObject({
      preset: "light",
      target: "own",
      scope: "new_only",
      contextBeforeCount: 2,
      contextAfterCount: 0
    });
    expect(resolveLifeMiningPresetSettings("deep")).toMatchObject({
      enabled: false,
      preset: "deep",
      target: "own_with_reply",
      contextMode: "recent",
      contextBeforeCount: 10,
      contextAfterCount: 4
    });
    expect(resolveLifeMiningPresetSettings("light", true).enabled).toBe(true);
  });

  it("clamps custom message length and keeps custom edits", () => {
    expect(
      normalizeLifeMiningCaptureSettings({
        preset: "custom",
        target: "own",
        scope: "visible",
        contextBeforeCount: 999,
        contextAfterCount: -10,
        maxMessageChars: 50,
        filterLowSignalTargets: false,
        dedupeEnabled: false
      })
    ).toMatchObject({
      preset: "custom",
      target: "own",
      scope: "visible",
      contextBeforeCount: 20,
      contextAfterCount: 0,
      maxMessageChars: 300,
      filterLowSignalTargets: false,
      dedupeEnabled: false
    });
  });
});
