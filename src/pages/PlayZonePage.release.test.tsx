import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import i18n from "../i18n";
import { PlayZonePage } from "./PlayZonePage";

const pageSource = readFileSync(
  join(process.cwd(), "src", "pages", "PlayZonePage.tsx"),
  "utf8"
);
const playZoneCss = readFileSync(
  join(process.cwd(), "src", "styles", "playZone.css"),
  "utf8"
);

describe("PlayZone public-beta UI boundaries", () => {
  afterEach(async () => {
    await i18n.changeLanguage("ko");
  });

  it("uses the shared accessible dialog and never exposes native prompts or raw caught messages", () => {
    expect(pageSource).toContain('data-qa="play-zone-help-dialog"');
    expect(pageSource).toContain("<Dialog");
    expect(pageSource).toContain("documentTechnicalError(caught)");
    expect(pageSource).toContain("DocumentTechnicalDetails");
    expect(pageSource).toContain('role="progressbar"');
    expect(pageSource).not.toContain('aria-modal="true"');
    expect(pageSource).not.toMatch(/window\.(?:alert|confirm|prompt)\s*\(/);
    expect(pageSource).not.toContain("error.message");
    expect(pageSource).not.toContain("caught.message");
    expect(pageSource).not.toContain("{selectedItem.sourcePath}</code>");
  });

  it.each([
    ["ko", "플레이존", "게임 라이브러리를 불러오는 중입니다."],
    ["en", "PlayZone", "Loading the game library."]
  ] as const)("renders the %s empty/loading state from the typed catalog", async (locale, title, loading) => {
    await i18n.changeLanguage(locale);
    const html = renderToStaticMarkup(<PlayZonePage />);

    expect(html).toContain(`<h1 class="sr-only" id="play-zone-page-title">${title}</h1>`);
    expect(html).toContain(loading);
    expect(html).toContain('aria-busy="true"');
  });

  it("keeps the selected Play action keyboard-associated and visible in compact desktop layouts", () => {
    expect(pageSource).toContain('aria-controls="play-zone-selected-game"');
    expect(pageSource).toContain('id="play-zone-selected-game"');
    expect(pageSource).toContain('aria-label={t("playZone.playAria", { title: selectedItem.title })}');
    expect(playZoneCss).toContain("@media (max-width: 1324px)");
    expect(playZoneCss).toMatch(/@media \(max-width: 1324px\)[\s\S]*?\.play-zone-title-line\s*\{[\s\S]*?flex-direction:\s*column;/);
    expect(playZoneCss).toMatch(/\.play-zone-actions\s*\{[\s\S]*?order:\s*-1;/);
    expect(playZoneCss).toMatch(/@media \(max-width: 1064px\)[\s\S]*?\.play-zone-content\s*\{[\s\S]*?overflow:\s*auto;/);
    expect(playZoneCss).toMatch(/\.play-zone-content\s*\{[\s\S]*?overflow:\s*auto;/);
  });

  it("labels official downloads as pending verification until installation", () => {
    expect(pageSource).toContain('t("playZone.status.downloadAvailable")');
    expect(pageSource).toContain('t("playZone.install.verificationPending")');
    expect(pageSource).toContain("!pendingInstall.entry.officialDownload");
  });

  it("keeps official download failures visible inside the retryable install dialog", () => {
    expect(pageSource).toContain('data-qa="play-zone-install-error"');
    expect(pageSource).toContain('message.includes("HTTP 404")');
    expect(pageSource).toContain('t("playZone.messages.downloadNotPublished")');
    expect(pageSource).toContain("setInstallNotice(null)");
    expect(pageSource).toContain("setInstallErrorMessage(");
  });

  it("does not mislabel a runtime-window failure as a security rejection", () => {
    expect(pageSource).toContain(
      'setErrorMessage(t("playZone.messages.runtimeOpenFailed"), caught)'
    );
  });
});
