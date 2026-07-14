import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WEB_READER_PRACTICE_URL } from "../shared/webReaderPractice";
import { normalizeWebReaderAddress, WEB_READER_DEFAULT_URL } from "./webReaderAddress";
import {
  getWebReaderHubModel,
  getWebReaderSourceStyle,
  readWebReaderSession,
  webReaderCollectionHubCategories,
  webReaderCollectionHubIntents,
  webReaderHubFeatured
} from "./webReaderHub";
import {
  formatSafeWebReaderAddress,
  formatSafeWebReaderTitle,
  localizeWebReaderHubModel
} from "./webReaderPresentation";

const webReaderPageSource = readFileSync(join(process.cwd(), "src", "pages", "WebReaderPage.tsx"), "utf8");
const webReaderHubSource = readFileSync(join(process.cwd(), "src", "pages", "webReaderHub.ts"), "utf8");

describe("web reader address normalization", () => {
  it("keeps explicit http URLs", () => {
    expect(normalizeWebReaderAddress("https://example.com/path")).toBe("https://example.com/path");
    expect(normalizeWebReaderAddress("http://example.com")).toBe("http://example.com");
  });

  it("adds https to bare domains", () => {
    expect(normalizeWebReaderAddress("example.com/article")).toBe("https://example.com/article");
  });

  it("turns plain text into a web search", () => {
    expect(normalizeWebReaderAddress("english reading practice")).toBe(
      "https://duckduckgo.com/?q=english%20reading%20practice"
    );
  });

  it("falls back to the default page for empty input", () => {
    expect(normalizeWebReaderAddress("   ")).toBe(WEB_READER_DEFAULT_URL);
  });

  it("opens only the exact built-in practice page without turning it into a search", () => {
    expect(normalizeWebReaderAddress(WEB_READER_PRACTICE_URL)).toBe(WEB_READER_PRACTICE_URL);
    expect(normalizeWebReaderAddress("lem-practice://reader/other")).toContain(
      "duckduckgo.com"
    );
  });
});

describe("web reader cloud card boundary", () => {
  it("returns on preflight cancellation before either card-generation entry point calls the provider", () => {
    const generatedCardStart = webReaderPageSource.indexOf(
      "async function generateCardFromSelection"
    );
    const generatedCardEnd = webReaderPageSource.indexOf(
      "function confirmReadingCardGeneration",
      generatedCardStart
    );
    const generatedCardBlock = webReaderPageSource.slice(generatedCardStart, generatedCardEnd);
    expect(generatedCardBlock.indexOf("await confirmReadingCardGeneration")).toBeGreaterThan(-1);
    expect(generatedCardBlock.indexOf("return null;")).toBeGreaterThan(
      generatedCardBlock.indexOf("await confirmReadingCardGeneration")
    );
    expect(generatedCardBlock.indexOf("provider.generateReadingCard")).toBeGreaterThan(
      generatedCardBlock.indexOf("return null;")
    );

    const saveStart = webReaderPageSource.indexOf("async function saveGeneratedReadingCard");
    const saveEnd = webReaderPageSource.indexOf("function goHome", saveStart);
    const saveBlock = webReaderPageSource.slice(saveStart, saveEnd);
    const savePreflightIndex = saveBlock.indexOf("await confirmReadingCardGeneration");
    const saveCancelReturnIndex = saveBlock.indexOf("return;", savePreflightIndex);
    expect(savePreflightIndex).toBeGreaterThan(-1);
    expect(saveCancelReturnIndex).toBeGreaterThan(savePreflightIndex);
    expect(saveBlock.indexOf("provider.generateReadingCard")).toBeGreaterThan(
      saveCancelReturnIndex
    );
  });
});

describe("web reader hub", () => {
  it("uses the shared card preview for generated web reader cards", () => {
    expect(webReaderPageSource).toContain('from "../components/CardPreview"');
    expect(webReaderPageSource).toContain('data-qa="web-reader-card-preview"');
    expect(webReaderPageSource).toContain(
      "<CardPreview card={cardPreview} settings={settings} defaultShowBack />"
    );
    expect(webReaderPageSource).toContain("await showUnifiedCardPreview(card)");
    expect(webReaderPageSource).toContain("isHubVisible || cardPreview");
    expect(webReaderPageSource).toContain("WEB_READER_HIDDEN_BOUNDS");
    expect(webReaderPageSource).toContain("setBounds(WEB_READER_HIDDEN_BOUNDS)");
    expect(webReaderPageSource).toContain("setVisible?.(shouldShowBrowserView)");
    expect(webReaderPageSource).not.toContain("showPopoverResult?.(card)");
  });

  it("keeps the learning hub source groups and first-run affordances wired", () => {
    expect(webReaderPageSource).toContain('data-qa="web-reader-hub"');
    expect(webReaderPageSource).toContain('from "./webReaderHub"');
    expect(webReaderPageSource).toContain("getWebReaderHubModel");
    expect(webReaderPageSource).toContain("web-reader-category-purpose");
    expect(webReaderPageSource).toContain("web-reader-source-badge");

    const sourceLabels = [
      ...webReaderCollectionHubCategories.flatMap((category) =>
        category.sources.map((source) => source.label)
      )
    ];
    expect(sourceLabels).toEqual(
      expect.arrayContaining([
        "Reddit",
        "ChatGPT",
        "Gemini",
        "Claude",
        "VOA Learning English",
        "Language Miner Practice",
        "Wikipedia"
      ])
    );
    expect(webReaderCollectionHubIntents.length).toBeGreaterThanOrEqual(4);
    expect(webReaderHubFeatured.map((source) => source.label)).toContain("Wikipedia");
    expect(webReaderHubFeatured.map((source) => source.url)).toContain(
      WEB_READER_PRACTICE_URL
    );
    expect(getWebReaderSourceStyle({ label: "Reddit", url: "", description: "" })).toMatchObject({
      initials: "R"
    });
  });

  it("switches default sources by profile target language and includes matching custom sources", () => {
    const japaneseModel = getWebReaderHubModel(
      "ja",
      [
        {
          id: "custom-ja",
          label: "My Japanese Forum",
          url: "https://example.jp/",
          languageCode: "ja",
          categoryId: "custom-category-ja",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        },
        {
          id: "custom-en",
          label: "My English Forum",
          url: "https://example.com/",
          languageCode: "en",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        }
      ],
      [
        {
          id: "custom-category-ja",
          label: "일본어 즐겨찾기",
          languageCode: "ja",
          purpose: "input-reading",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        },
        {
          id: "custom-category-ja-none",
          label: "목적 없는 폴더",
          languageCode: "ja",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        }
      ]
    );
    const labels = japaneseModel.categories.flatMap((category) =>
      category.sources.map((source) => source.label)
    );
    const categoryIds = japaneseModel.categories.map((category) => category.id);
    const lifeCategory = japaneseModel.categories.find((category) => category.id === "life-dialogue");
    const customCategory = japaneseModel.categories.find(
      (category) => category.id === "custom-category-ja"
    );
    const noPurposeCustomCategory = japaneseModel.categories.find(
      (category) => category.id === "custom-category-ja-none"
    );
    const readingCategories = japaneseModel.categories.filter(
      (category) => category.id !== "life-dialogue" && !category.isCustom
    );

    expect(labels).toContain("NHK NEWS WEB EASY");
    expect(categoryIds).toContain("life-dialogue");
    expect(customCategory).toMatchObject({
      label: "일본어 즐겨찾기",
      purpose: "input-reading",
      isCustom: true
    });
    expect(customCategory?.sources.map((source) => source.label)).toContain("My Japanese Forum");
    expect(customCategory?.sources[0]).toMatchObject({
      categoryId: "custom-category-ja",
      isCustom: true
    });
    expect(noPurposeCustomCategory).toMatchObject({
      label: "목적 없는 폴더",
      isCustom: true
    });
    expect(noPurposeCustomCategory?.purpose).toBeUndefined();
    expect(lifeCategory).toMatchObject({
      purpose: "output-life"
    });
    expect(readingCategories.every((category) => category.purpose === "input-reading")).toBe(true);
    expect(labels).toEqual(expect.arrayContaining(["ChatGPT", "Gemini", "Claude"]));
    expect(labels).toContain("My Japanese Forum");
    expect(labels).not.toContain("My English Forum");
    expect(labels).not.toContain("Reddit");
    expect(japaneseModel.intents.map((intent) => intent.url)).toContain("https://chatgpt.com/");
    expect(japaneseModel.otherLanguageSources.map((source) => source.label)).toContain(
      "My English Forum"
    );
  });

  it("keeps mismatched web reader saves behind explicit actions", () => {
    expect(webReaderPageSource).toContain("web-reader-language-mismatch");
    expect(webReaderPageSource).toContain("openTranslatedPageForMismatch");
    expect(webReaderPageSource).toContain("translateCurrentPage");
    expect(webReaderPageSource).toContain("getPageTextSegments");
    expect(webReaderPageSource).toContain("applyPageTranslations");
    expect(webReaderPageSource).toContain("restorePageTranslations");
    expect(webReaderPageSource).toContain("getTranslatedReaderSourceUrl");
    expect(webReaderPageSource).toContain('t("webReader.actions.translatePage")');
    expect(webReaderPageSource).toContain('t("webReader.actions.translateSelection")');
    expect(webReaderPageSource).toContain("saveMismatchOverride");
    expect(webReaderPageSource).toContain('sourceKind: override ? "manual_override" : getActiveCardSourceKind()');
    expect(webReaderPageSource).toContain('"translated_page"');
    expect(webReaderPageSource).toContain("web-reader-other-language-sources");
    expect(webReaderPageSource).toContain("customSourceCategoryId");
    expect(webReaderPageSource).toContain("webReaderCustomCategories");
    expect(webReaderPageSource).toContain('t("webReader.hub.custom.categoryTitle")');
    expect(webReaderPageSource).toContain('t("webReader.hub.purpose.none")');
    expect(webReaderPageSource).toContain("customCategoryPurpose");
    expect(webReaderPageSource).toContain("web-reader-category-rail-actions");
    expect(webReaderPageSource).toContain("web-reader-custom-modal");
    expect(webReaderPageSource).toContain("web-reader-custom-manager");
    expect(webReaderPageSource).toContain("closeCustomLibraryManager");
    expect(webReaderPageSource).toContain("web-reader-source-delete");
    expect(webReaderPageSource).toContain("deleteCustomCategory");
    expect(webReaderPageSource).toContain("deleteCustomSource");
    expect(webReaderPageSource).not.toContain("web-reader-custom-library");
    expect(webReaderPageSource).not.toContain("customSourceLanguageCode");
  });

  it("exposes WebReader life mining state in the app UI", () => {
    expect(webReaderPageSource).toContain("getLifeMiningState");
    expect(webReaderPageSource).toContain("web-reader-life-chip");
    expect(webReaderPageSource).toContain('t("webReader.life.on"');
  });

  it("uses typed localized copy and accessible dialogs for destructive actions", () => {
    expect(webReaderPageSource).toContain('useTranslation');
    expect(webReaderPageSource).toContain('className="web-reader-visually-hidden"');
    expect(webReaderPageSource).toContain('data-qa="web-reader-delete-dialog"');
    expect(webReaderPageSource).toContain("initialFocusRef={deleteCancelButtonRef}");
    expect(webReaderPageSource).not.toContain("window.confirm");
    expect(webReaderPageSource).not.toContain("error.message");
  });

  it("redacts credentials and local paths from the passive address label", () => {
    const exampleHost = "example.com";
    const credentialAddress =
      `https://user:password@${exampleHost}/article?token=secret&topic=reading#api-key`;
    const redactedAddress =
      `https://redacted:redacted@${exampleHost}/article?token=redacted&topic=reading`;
    const localFileUrl = ["file:///C:", "Users", "Alice", "private.html"].join("/");
    const localWindowsPath = ["C:", "Users", "Alice", "private.html"].join("\\");
    expect(
      formatSafeWebReaderAddress(credentialAddress, "Local content")
    ).toBe(redactedAddress);
    expect(formatSafeWebReaderAddress(localFileUrl, "Local content")).toBe(
      "Local content"
    );
    expect(formatSafeWebReaderAddress(localWindowsPath, "Local content")).toBe(
      "Local content"
    );
    expect(
      formatSafeWebReaderAddress("https://example.com/article?topic=reading#chapter-2", "Local content")
    ).toBe("https://example.com/article?topic=reading#chapter-2");
    expect(formatSafeWebReaderTitle(localWindowsPath, "Web reader")).toBe(
      "Web reader"
    );
    expect(formatSafeWebReaderTitle("Draft token=secret-value", "Web reader")).toBe(
      "Draft token=redacted"
    );
  });

  it("localizes built-in hub copy while preserving custom learning content and URLs", () => {
    const rawModel = getWebReaderHubModel("en", [
      {
        id: "custom-en",
        label: "My Forum",
        url: "https://example.com/",
        description: "My own note",
        languageCode: "en",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);
    const localized = localizeWebReaderHubModel(rawModel, {
      categoryLabels: { "community-expression": "Community expressions" },
      customCategoryLabel: "My sites",
      customSourceDescription: "User-added site",
      intentCopyByUrl: {},
      otherLanguageSourceDescription: "Other-language site",
      sourceDescriptionsByUrl: { "https://www.reddit.com/": "Read natural comments" }
    });

    expect(localized.categories.find((category) => category.id === "community-expression")?.label).toBe(
      "Community expressions"
    );
    expect(
      localized.categories
        .flatMap((category) => category.sources)
        .find((source) => source.url === "https://www.reddit.com/")?.description
    ).toBe("Read natural comments");
    expect(
      localized.categories
        .flatMap((category) => category.sources)
        .find((source) => source.url === "https://example.com/")
    ).toMatchObject({ label: "My Forum", description: "My own note", url: "https://example.com/" });
  });

  it("dismisses the selection popover after a card is saved", () => {
    expect(webReaderPageSource).toContain("dismissSelectionPopoverAfterSave");
    expect(webReaderPageSource).toContain("api.webReader?.hidePopover?.()");
    expect(webReaderPageSource).not.toContain('showPopoverStatus?.({ state: "ok"');
  });

  it("keeps hub data and session helpers outside the page component", () => {
    expect(webReaderPageSource).not.toContain("const webReaderHubCategories");
    expect(webReaderPageSource).not.toContain("function readWebReaderSession");
    expect(webReaderHubSource).toContain("export const webReaderCollectionHubCategories");
    expect(webReaderHubSource).toContain("export function readWebReaderSession");
    expect(readWebReaderSession()).toMatchObject({
      readerUrl: WEB_READER_DEFAULT_URL,
      addressValue: "",
      isHubVisible: true
    });
  });
});
