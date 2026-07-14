import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import i18n, { translationResources } from "./i18n";

const readSource = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");
const publicCorePages = {
  bookmarks: readSource("src", "pages", "BookmarksPage.tsx"),
  cards: readSource("src", "pages", "CardsPage.tsx"),
  documentLibrary: readSource("src", "pages", "DocumentLibraryPage.tsx"),
  exportHistory: readSource("src", "pages", "ExportHistoryPage.tsx"),
  glossary: readSource("src", "pages", "GlossaryPage.tsx"),
  webReader: readSource("src", "pages", "WebReaderPage.tsx"),
  playZone: readSource("src", "pages", "PlayZonePage.tsx"),
  characterChat: readSource("src", "pages", "CharacterChatPage.tsx"),
  lifeMining: readSource("src", "pages", "LifeMiningPage.tsx")
};

function collectLeafKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [prefix];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    collectLeafKeys(child, prefix ? `${prefix}.${key}` : key)
  );
}

function collectLeafStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(collectLeafStrings);
}

describe("app translations", () => {
  it("keeps Korean and English catalogs structurally aligned", () => {
    const koreanKeys = collectLeafKeys(translationResources.ko.translation).sort();
    const englishKeys = collectLeafKeys(translationResources.en.translation).sort();
    expect(englishKeys).toEqual(koreanKeys);
  });

  it("keeps the complete English catalog free of accidental Korean UI copy", () => {
    const englishStrings = collectLeafStrings(translationResources.en.translation);
    const intentionalNativeLabels = new Set([
      "한국어",
      // The compatibility nameKo field sent to translation providers must remain Korean.
      "자동 감지"
    ]);
    expect(englishStrings.length).toBeGreaterThan(100);
    expect(
      englishStrings.filter(
        (value) => /[가-힣]/u.test(value) && !intentionalNativeLabels.has(value)
      )
    ).toEqual([]);
    expect(englishStrings.filter((value) => !value.trim())).toEqual([]);
  });

  it("translates the public shell and requested learning labels", () => {
    const korean = i18n.getFixedT("ko");
    const english = i18n.getFixedT("en");

    expect(korean("nav.sections.input")).toBe("읽고 듣기 · Input");
    expect(korean("nav.sections.output")).toBe("말하고 쓰기 · Output");
    expect(english("nav.sections.input")).toBe("Read & Listen · Input");
    expect(english("nav.sections.output")).toBe("Speak & Write · Output");
    expect(english("settings.usage.disclaimer")).toContain("does not block actual Google charges");
    expect(english("playZone.security.reportTitle")).toBe("Pre-launch security report");
    expect(english("characterChat.externalConfirm.payload")).toContain("character settings");
    expect(english("lifeMining.cost.geminiTransfer")).toContain("sent to Google Gemini");
    expect(english("lifeMining.estimate.geminiNote")).toContain("not treated as guaranteed zero cost");
    expect(english("documentLibrary.title")).toBe("Document library");
    expect(english("bookmarks.actions.openPage")).toBe("Open saved page");
    expect(english("exportHistory.actions.redownload")).toBe("Save again");
    expect(english("webReader.home.intentTitle")).toBe("Start with a goal");
    expect(korean("app.providers.mock")).toBe("AI 미연결");
    expect(english("app.providers.mock")).toBe("AI disconnected");
    expect(korean("onboarding.ai.ollamaDescription")).toContain("API 키도 필요 없습니다");
    expect(english("onboarding.ai.geminiStep1")).toContain("your account");
    expect(korean("playZone.help.kitRules.two")).toContain("`thumbnail`");
    expect(english("playZone.help.kitRules.two")).toContain("`thumbnail`");
    expect(korean("playZone.help.kitRules.two")).not.toContain("metadata.thumbnail");
    expect(english("playZone.help.kitRules.two")).not.toContain("metadata.thumbnail");
    expect(english("settings.status.googleTranslationConnected")).toBe(
      "Google Translation connected"
    );
    expect(english("settings.status.ollamaModelListFailed", { url: "http://127.0.0.1:11434" }))
      .not.toMatch(/[가-힣]/u);
    expect(english("listeningLoop.seedCatalog.shortEverydaySample.topicLabel")).toBe(
      "Everyday expressions"
    );
    expect(english("listeningLoop.seedCatalog.shortEverydaySample.recommendedReason"))
      .not.toMatch(/[가-힣]/u);
  });

  it("keeps public PlayZone, Character Chat, and Life Mining UI text in typed catalogs", () => {
    Object.values(publicCorePages).forEach((source) => {
      expect(source).toContain("useTranslation");
      expect(source).not.toMatch(/>\s*[가-힣][^<{]*</);
      expect(source).not.toMatch(/aria-(?:label|description)="[^"]*[가-힣]/);
    });
    expect(publicCorePages.playZone).toContain('t("playZone.security.reportTitle")');
    expect(publicCorePages.cards).toContain('t("cards.listTitle")');
    expect(publicCorePages.glossary).toContain('t("glossary.title")');
    expect(publicCorePages.characterChat).toContain('t("characterChat.externalConfirm.payload")');
    expect(publicCorePages.characterChat).toContain('t("characterChat.manage.remoteConfirm"');
    expect(publicCorePages.characterChat).not.toContain("!settings.confirmEstimatedCostBeforeRun");
    expect(publicCorePages.lifeMining).toContain('t("lifeMining.cost.geminiTransfer")');
    expect(publicCorePages.lifeMining).toContain("settings.confirmLifeMiningCardCost || Boolean(externalTransferNotice)");
    expect(publicCorePages.lifeMining).toContain('t("lifeMining.manual.dialogAria")');
    expect(publicCorePages.lifeMining).toContain('t("lifeMining.bulk.dialogAria")');
    expect(publicCorePages.documentLibrary).toContain('t("documentLibrary.title")');
    expect(publicCorePages.bookmarks).toContain('t("bookmarks.title")');
    expect(publicCorePages.exportHistory).toContain('t("exportHistory.title")');
    expect(publicCorePages.webReader).toContain('t("webReader.home.heading"');
    expect(publicCorePages.webReader).toContain('data-qa="web-reader-delete-dialog"');
    expect(publicCorePages.webReader).not.toContain("window.confirm(");
  });

  it("preserves PlayZone host security revalidation as a non-fallback boundary", () => {
    const hostBranchStart = publicCorePages.playZone.indexOf("if (hostOpenRuntimeWindow)");
    const staticPreviewBoundary = publicCorePages.playZone.indexOf(
      "Static web previews do not have the Electron bridge"
    );
    expect(hostBranchStart).toBeGreaterThan(-1);
    expect(staticPreviewBoundary).toBeGreaterThan(hostBranchStart);
    const hostBranch = publicCorePages.playZone.slice(hostBranchStart, staticPreviewBoundary);
    expect(hostBranch).toContain("await hostOpenRuntimeWindow");
    expect(hostBranch).toContain("return;");
    expect(hostBranch).toContain("manifest revalidation, CSP, network deny, and permission gates");
  });

  it("keeps PlayZone inspection separate from explicit accessible installation", () => {
    expect(publicCorePages.playZone).toContain("play-zone-install-confirmation");
    expect(publicCorePages.playZone).toContain("api.listInstalledPacks()");
    expect(publicCorePages.playZone).toContain("await api.installPack!({");
    expect(publicCorePages.playZone).toContain("await api.installOfficialPack!({");
    expect(publicCorePages.playZone).toContain("cancelOfficialPackDownload");
    expect(publicCorePages.playZone).toContain("importedEntries: []");
    expect(publicCorePages.playZone).not.toContain("window.confirm(");
    expect(publicCorePages.playZone).toContain(
      'const gameDeveloperAgentGuideAssetPath = "./playzone/LanguageMinerGameKit.zip"'
    );
    expect(publicCorePages.playZone).toContain("PLAY_ZONE_CURRENT_APP_VERSION");
  });
});
