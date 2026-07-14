import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("app locale Electron bridge", () => {
  it("sends the renderer locale with runtime settings", () => {
    const appSource = source("src/App.tsx");
    expect(appSource).toContain("appLocale:");
    expect(appSource).toContain("i18n.resolvedLanguage");
  });

  it("updates native UI copy and defaults to the OS locale", () => {
    const mainSource = source("electron/main.ts");
    expect(mainSource).toContain("currentAppLocale = normalizeElectronAppLocale(app.getLocale())");
    expect(mainSource).toContain('currentAppLocale = settings.appLocale === "en" ? "en" : "ko"');
    expect(mainSource).toContain("refreshAppTrayMenu()");
    expect(mainSource).toContain('electronText(currentAppLocale, "backupSaveTitle")');
    expect(mainSource).toContain('electronText(currentAppLocale, "webReaderLoginTitle")');
  });
});
