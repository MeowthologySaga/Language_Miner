import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createListeningYouTubePlayerHtml } from "./listeningYoutubePlayerPage";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("Electron generated-window localization", () => {
  it("renders the YouTube player document in the requested locale", () => {
    const url = new URL(
      "http://127.0.0.1:17345/listening-youtube-player?videoId=abc123&start=2&end=8"
    );
    const korean = createListeningYouTubePlayerHtml(url, "ko");
    const english = createListeningYouTubePlayerHtml(url, "en");

    expect(korean).toContain('<html lang="ko">');
    expect(korean).toContain("<title>YouTube 듣기 플레이어</title>");
    expect(korean).toContain("YouTube 플레이어 준비 중…");
    expect(english).toContain('<html lang="en">');
    expect(english).toContain("<title>YouTube listening player</title>");
    expect(english).toContain("Preparing the YouTube player…");
    expect(english).not.toMatch(/[가-힣]/);
  });

  it("passes the active app locale to native and generated Electron surfaces", () => {
    const main = source("electron/main.ts");
    const ocr = source("electron/desktopOcr.ts");
    const sync = source("electron/localFolderCardSync.ts");

    expect(main).toContain(
      "writeListeningYouTubePlayerPage(response, requestUrl, currentAppLocale)"
    );
    expect(main).toMatch(
      /registerDesktopOcrShortcut\(\s*\(\) => currentAppLocale,/
    );
    expect(main).toMatch(
      /finishDesktopOcrSelection\(\s*rect,\s*currentAppLocale(?:,\s*signal)?\s*\)/
    );
    expect(ocr).toContain('<html lang="${locale}">');
    expect(ocr).toContain('electronText(locale, "ocrCapturedImageAlt")');
    expect(ocr).toContain('id="languageMismatchDialog"');
    expect(ocr).toContain("await confirmLanguageMismatch(message)");
    expect(ocr).not.toContain("window.confirm");
    expect(ocr).not.toMatch(/"[^"\r\n]*[가-힣][^"\r\n]*"/);
    expect(sync).toContain('formatElectronText(locale, "cardSyncFolderMissing"');
    expect(sync).not.toMatch(/message:\s*`[^`]*\$\{folderPath\}/);
    expect(sync).not.toMatch(/new Error\(`[^`]*\$\{folderPath\}/);
  });
});
