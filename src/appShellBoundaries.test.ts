import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(join(process.cwd(), "src", "App.tsx"), "utf8");
const profiledApiSource = readFileSync(join(process.cwd(), "src", "profiledApi.ts"), "utf8");
const appDailyRoutineSource = readFileSync(
  join(process.cwd(), "src", "appDailyRoutine.ts"),
  "utf8"
);
const appSidebarStateSource = readFileSync(join(process.cwd(), "src", "appSidebarState.ts"), "utf8");
const appNavigationSource = readFileSync(join(process.cwd(), "src", "appNavigation.ts"), "utf8");
const appProfilesSource = readFileSync(join(process.cwd(), "src", "appProfiles.ts"), "utf8");
const appSettingsSource = readFileSync(join(process.cwd(), "src", "appSettings.ts"), "utf8");
const appUsageFormattingSource = readFileSync(
  join(process.cwd(), "src", "appUsageFormatting.ts"),
  "utf8"
);
const recentDocumentsSource = readFileSync(
  join(process.cwd(), "src", "recentDocuments.ts"),
  "utf8"
);

describe("app shell module boundaries", () => {
  it("keeps profiled API wrapping outside the app shell component", () => {
    expect(appSource).toContain('from "./profiledApi"');
    expect(appSource).not.toContain("function createProfiledApi");
    expect(appSource).not.toContain("prepareCardTtsAudio");

    expect(profiledApiSource).toContain("export function createProfiledApi");
    expect(profiledApiSource).toContain("prepareCardTtsAudio");
    expect(profiledApiSource).not.toContain('from "./App"');
  });

  it("keeps daily routine persistence helpers outside the app shell component", () => {
    expect(appSource).toContain('from "./appDailyRoutine"');
    expect(appSource).not.toContain("function readDailyRoutineRun");
    expect(appSource).not.toContain("function finishDailyRoutineStep");

    expect(appDailyRoutineSource).toContain("export function readDailyRoutineRun");
    expect(appDailyRoutineSource).toContain("export function finishDailyRoutineStep");
    expect(appDailyRoutineSource).not.toContain('from "./App"');
  });

  it("keeps recent document persistence helpers outside the app shell component", () => {
    expect(appSource).toContain('from "./recentDocuments"');
    expect(appSource).not.toContain("function readReaderArtifact");
    expect(appSource).not.toContain("function readRecentDocuments");
    expect(appSource).not.toContain("function normalizeRecentDocuments");
    expect(appSource).not.toContain("function recentDocumentFromArtifact");

    expect(recentDocumentsSource).toContain("export function readReaderArtifact");
    expect(recentDocumentsSource).toContain("export function normalizeRecentDocuments");
    expect(recentDocumentsSource).not.toContain('from "./App"');
  });

  it("keeps sidebar storage helpers outside the app shell component", () => {
    expect(appSource).toContain('from "./appSidebarState"');
    expect(appSource).not.toContain("function readSidebarCollapsed");
    expect(appSource).not.toContain("function readNavSectionExpandedState");
    expect(appSource).not.toContain("function writeNavSectionExpandedState");
    expect(appSource).not.toContain("SIDEBAR_NAV_SECTIONS_KEY");

    expect(appSidebarStateSource).toContain("export function readSidebarCollapsed");
    expect(appSidebarStateSource).toContain("export function writeSidebarCollapsed");
    expect(appSidebarStateSource).toContain("export function readNavSectionExpandedState");
    expect(appSidebarStateSource).not.toContain('from "./App"');
  });

  it("keeps navigation metadata outside the app shell component", () => {
    expect(appSource).toContain('from "./appNavigation"');
    expect(appSource).not.toContain("const routeMeta");
    expect(appSource).not.toContain("const navSections");
    expect(appSource).not.toContain("function navSectionHasTab");

    expect(appNavigationSource).toContain("export const routeMeta");
    expect(appNavigationSource).toContain("export const navSections");
    expect(appNavigationSource).toContain("export function getNavSectionIdForTab");
    expect(appNavigationSource).not.toContain('from "./App"');
  });

  it("keeps settings, profile, and usage helpers outside the app shell component", () => {
    expect(appSource).toContain('from "./appSettings"');
    expect(appSource).toContain('from "./appProfiles"');
    expect(appSource).toContain('from "./appUsageFormatting"');
    expect(appSource).not.toContain("const defaultSettings");
    expect(appSource).not.toContain("function readProfiles");
    expect(appSource).not.toContain("function formatUsageCost");

    expect(appSettingsSource).toContain("export const defaultSettings");
    expect(appSettingsSource).toContain("export function readAppSettings");
    expect(appProfilesSource).toContain("export function readProfiles");
    expect(appProfilesSource).toContain("export function normalizeProfileRecordForSave");
    expect(appUsageFormattingSource).toContain("export function formatUsageCost");
    expect(appSettingsSource).not.toContain('from "./App"');
    expect(appProfilesSource).not.toContain('from "./App"');
    expect(appUsageFormattingSource).not.toContain('from "./App"');
  });

  it("routes language mismatch choices through an accessible app dialog", () => {
    expect(appSource).toContain("InputLanguageMismatchDialog");
    expect(profiledApiSource).toContain("resolveInputLanguageMismatch");
    expect(profiledApiSource).not.toContain("window.prompt");
    expect(profiledApiSource).not.toContain("window.alert");
    expect(profiledApiSource).not.toContain("translate.google.com");
  });
});
