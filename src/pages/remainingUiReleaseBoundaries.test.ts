import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(...segments: string[]) {
  return readFileSync(join(process.cwd(), "src", ...segments), "utf8");
}

describe("remaining public UI release boundaries", () => {
  const cards = readSource("pages", "CardsPage.tsx");
  const lifeMining = readSource("pages", "LifeMiningPage.tsx");
  const characterChat = readSource("pages", "CharacterChatPage.tsx");
  const today = readSource("pages", "PdfHubPage.tsx");
  const languageMismatch = readSource("components", "InputLanguageMismatchDialog.tsx");

  it("keeps native browser dialogs out of public learning screens", () => {
    for (const source of [cards, lifeMining, characterChat, today, languageMismatch]) {
      expect(source).not.toMatch(/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/);
    }
  });

  it("uses safe summaries for local paths, source URLs, and malformed dates", () => {
    expect(cards).toContain('t("cards.sync.locationHidden")');
    expect(cards).toContain("formatCardDateTime(");
    expect(lifeMining).toContain("getSafeLifeLogSourceLocation(log");
    expect(lifeMining).toContain("return invalidFallback;");
  });

  it("exposes one page heading and meaningful progress semantics", () => {
    expect(cards).toContain('<h1 className="sr-only">');
    expect(lifeMining).toContain('<h1>{t("lifeMining.title")}</h1>');
    expect(characterChat.match(/<h1/g)?.length).toBeGreaterThanOrEqual(2);
    expect(today).toContain('<h1>{t("today.title")}</h1>');
    expect(today).toContain('role="progressbar"');
    expect(today).toContain("aria-valuenow={routinePercent}");
  });

  it("canonicalizes detected language tags before exposing them to HTML", () => {
    expect(languageMismatch).toContain("Intl.getCanonicalLocales(languageCode)[0]");
    expect(languageMismatch).toContain("const detectedLanguageTag = toSafeLanguageTag(");
    expect(languageMismatch).toContain("<blockquote lang={detectedLanguageTag}>");
  });
});
