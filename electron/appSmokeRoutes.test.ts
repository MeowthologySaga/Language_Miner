import { describe, expect, it } from "vitest";
import { appSmokeRouteActionProbes, appSmokeRoutes } from "./appSmokeRoutes";

describe("app smoke route coverage", () => {
  it("follows the current top-level navigation instead of removed hidden routes", () => {
    expect(appSmokeRoutes).toEqual([
      "pdfHub",
      "pdfReader",
      "webReader",
      "bookMaker",
      "cards",
      "playZone",
      "listeningLoop",
      "videoReader",
      "writingPractice",
      "characterChat",
      "review",
      "life",
      "glossary",
      "tutorial",
      "settings"
    ]);
    expect(appSmokeRoutes).not.toContain("documentLibrary");
    expect(appSmokeRoutes).not.toContain("bookmarks");
    expect(appSmokeRoutes).not.toContain("exportHistory");
  });

  it("checks consolidated workspace navigation from the visible parent routes", () => {
    const readerSelectors = flattenSelectors("pdfReader");
    const makerSelectors = flattenSelectors("bookMaker");

    expect(readerSelectors).toEqual(
      expect.arrayContaining([
        '[data-qa="pdf-reader-pane-reader"]',
        '[data-qa="pdf-reader-pane-library"]',
        '[data-qa="pdf-reader-pane-bookmarks"]'
      ])
    );
    expect(makerSelectors).toEqual(
      expect.arrayContaining([
        '[data-qa="book-maker-pane-maker"]',
        '[data-qa="book-maker-pane-history"]'
      ])
    );
  });

  it("probes the default listening and settings surfaces without assuming hidden panels", () => {
    expect(flattenSelectors("cards")).toEqual(
      expect.arrayContaining([
        '[data-qa="cards-empty-open-reader"]',
        '[data-card-list-item="true"]',
        '[data-qa="cards-filter-toggle"]'
      ])
    );
    expect(flattenSelectors("cards")).not.toContain('[data-qa="cards-sync-status-button"]');
    expect(flattenSelectors("listeningLoop")).toEqual(
      expect.arrayContaining([
        '[data-qa="listening-create-routine"]',
        '[data-qa="listening-direct-youtube"]'
      ])
    );
    expect(flattenSelectors("settings")).toEqual(
      expect.arrayContaining([
        '[data-qa="settings-search"]',
        ".settings-navigation-list button",
        ".settings-overview-panel"
      ])
    );
    expect(flattenSelectors("settings")).not.toContain('[data-qa="settings-gemini-api-key"]');
    expect(flattenSelectors("settings")).not.toContain(
      '[data-qa="settings-capture-site-discord"]'
    );
    expect(flattenSelectors("settings")).not.toContain(
      '[data-qa="settings-launch-at-login"]'
    );
  });
});

function flattenSelectors(route: string) {
  return (appSmokeRouteActionProbes[route] ?? []).flatMap((probe) => probe.selectors);
}
