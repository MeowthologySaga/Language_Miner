import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const extensionRoot = path.join(process.cwd(), "extension");
const localizedRuntimeFiles = [
  "options.html",
  "options.js",
  "src/background.js",
  "src/content/index.js",
  "src/content/selectionCards.js",
  "src/content/youtubeDualSubtitles.js"
];
const localizedAdapterFiles = [
  "src/content/adapters/chatgpt.js",
  "src/content/adapters/claude.js"
];

function read(relativePath: string) {
  return fs.readFileSync(path.join(extensionRoot, relativePath), "utf8");
}

describe("Chrome extension i18n source boundary", () => {
  it("keeps user-facing Korean text in the locale catalog", () => {
    for (const relativePath of localizedRuntimeFiles) {
      expect(read(relativePath), relativePath).not.toMatch(/[가-힣]/);
    }
    expect(read("_locales/ko/messages.json")).toMatch(/[가-힣]/);
  });

  it("backs every runtime and HTML key with both catalogs", () => {
    const catalogs = ["en", "ko"].map(
      (locale) =>
        JSON.parse(read(`_locales/${locale}/messages.json`)) as Record<string, { message: string }>
    );
    const keys = new Set<string>();
    for (const relativePath of [...localizedRuntimeFiles, ...localizedAdapterFiles]) {
      const source = read(relativePath);
      for (const match of source.matchAll(/\bt\(\s*["']([A-Za-z0-9_@]+)["']/g)) {
        keys.add(match[1]);
      }
      for (const match of source.matchAll(/data-i18n(?:-[a-z-]+)?="([A-Za-z0-9_@]+)"/g)) {
        keys.add(match[1]);
      }
    }

    expect(keys.size).toBeGreaterThan(50);
    for (const key of keys) {
      expect(catalogs[0][key]?.message, `${key} in English`).toBeTruthy();
      expect(catalogs[1][key]?.message, `${key} in Korean`).toBeTruthy();
    }
  });

  it("loads the shared helper before every localized content script", () => {
    const manifest = JSON.parse(read("manifest.json")) as {
      content_scripts: Array<{ js: string[] }>;
    };
    const localizedContentScripts = new Set([
      "src/content/index.js",
      "src/content/selectionCards.js",
      "src/content/youtubeDualSubtitles.js"
    ]);

    for (const entry of manifest.content_scripts) {
      const localizedIndex = entry.js.findIndex((file) => localizedContentScripts.has(file));
      if (localizedIndex < 0) continue;
      expect(entry.js.indexOf("src/shared/i18n.js"), entry.js.join(", ")).toBeGreaterThanOrEqual(0);
      expect(entry.js.indexOf("src/shared/i18n.js"), entry.js.join(", ")).toBeLessThan(
        localizedIndex
      );
    }

    const background = read("src/background.js");
    expect(background).toContain('import "./shared/i18n.js";');
    expect(background.match(/"src\/shared\/i18n\.js"/g)).toHaveLength(3);
    expect(read("options.js")).toContain('import "./src/shared/i18n.js";');
  });

  it("does not add remote locale or helper resources", () => {
    const localOnlySources = [
      "options.html",
      "options.js",
      "src/shared/i18n.js",
      "_locales/en/messages.json",
      "_locales/ko/messages.json"
    ];
    for (const relativePath of localOnlySources) {
      expect(read(relativePath), relativePath).not.toMatch(/https?:\/\//i);
    }
    for (const relativePath of localizedRuntimeFiles) {
      if (relativePath === "src/background.js") continue;
      expect(read(relativePath), relativePath).not.toContain("chrome.i18n.getMessage");
    }
  });

  it("uses an accessible options dialog instead of a browser-native confirmation", () => {
    expect(read("options.html")).toContain('id="clear-dialog"');
    expect(read("options.html")).toContain('aria-labelledby="clear-dialog-title"');
    expect(read("options.js")).toContain("clearDialog.showModal()");
    expect(read("options.js")).not.toContain("window.confirm");
  });

  it("does not forward raw runtime exception messages or captured payloads", () => {
    const background = read("src/background.js");
    const collector = read("src/content/youtubeWatchCollector.js");
    const lifeMiner = read("src/content/index.js");

    expect(background).not.toMatch(/error:\s*error\s+instanceof\s+Error/);
    expect(collector).not.toContain("chrome.runtime.lastError.message");
    expect(collector).not.toMatch(/error:\s*error\s+instanceof\s+Error/);
    expect(lifeMiner).not.toContain(
      'console[method]("[LifeMiner] capture response", response)'
    );
    expect(lifeMiner).not.toContain("speaker: message.speaker");
  });
});
