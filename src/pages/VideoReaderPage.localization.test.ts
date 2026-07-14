import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import i18n from "../i18n";

const source = readFileSync(join(process.cwd(), "src", "pages", "VideoReaderPage.tsx"), "utf8");

describe("VideoReaderPage release localization and accessibility boundaries", () => {
  it("keeps user-facing copy in the symmetric translation catalog", () => {
    expect(source).not.toMatch(/[가-힣]/u);

    const korean = i18n.getFixedT("ko");
    const english = i18n.getFixedT("en");
    expect(korean("videoReader.homeTitle")).toBe("볼 영상을 먼저 고르세요");
    expect(english("videoReader.homeTitle")).toBe("Choose a video to begin");
    expect(english("videoReader.transcript.empty")).toBe("No subtitles");
    expect(english("videoReader.dialog.saveTitle")).toBe("Create a listening card?");
  });

  it("provides headings, live status, keyboard alternatives, and a shared modal dialog", () => {
    expect(source).toContain('<h1 className="sr-only">{t("videoReader.pageTitle")}</h1>');
    expect(source).toContain("isInteractiveShortcutTarget(event.target)");
    expect(source).toContain('aria-keyshortcuts="R"');
    expect(source).toContain('aria-keyshortcuts="Q"');
    expect(source).toContain('aria-keyshortcuts="Enter"');
    expect(source).toContain("<Dialog");
    expect(source).toContain("initialFocusRef={rKeyDialogCancelButtonRef}");
    expect(source).toContain('role="button"');
    expect(source).toContain("handleCaptionWordKeyDown");
  });

  it("redacts technical failures and keeps them in a collapsed disclosure", () => {
    expect(source).toContain("documentTechnicalError");
    expect(source).toContain('<details className="video-reader-technical-details">');
    expect(source).not.toMatch(/setStatus\(\s*(?:caught\.message|result\.message)/u);
    expect(source).not.toContain("console.log");
    expect(source).not.toContain("console.error");
  });

  it("passes locale-aware count and timestamp formatters into virtual transcript rows", () => {
    expect(source).toContain("new Intl.NumberFormat(appLocale)");
    expect(source).toContain("formatCount={formatCount}");
    expect(source).toContain("formatTimestamp={formatPlaybackTime}");
  });
});
