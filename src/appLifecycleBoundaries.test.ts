import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(join(process.cwd(), "src", "App.tsx"), "utf8");
const apiSource = readFileSync(join(process.cwd(), "src", "data", "api.ts"), "utf8");
const desktopOcrSource = readFileSync(join(process.cwd(), "electron", "desktopOcr.ts"), "utf8");
const electronMain = readFileSync(join(process.cwd(), "electron", "main.ts"), "utf8");
const preloadSource = readFileSync(join(process.cwd(), "electron", "preload.ts"), "utf8");
const indexSource = readFileSync(join(process.cwd(), "index.html"), "utf8");
const rendererMainSource = readFileSync(join(process.cwd(), "src", "main.tsx"), "utf8");
const startupLifecycleSource = readFileSync(
  join(process.cwd(), "src", "startupLifecycle.ts"),
  "utf8"
);

describe("desktop app lifecycle boundaries", () => {
  it("keeps repeated launches in one desktop instance", () => {
    expect(electronMain).toContain("app.requestSingleInstanceLock()");
    expect(electronMain).toContain('app.on("second-instance"');
    expect(electronMain).toContain("void showMainWindow()");
  });

  it("reveals a painted startup surface before the app finishes bootstrapping", () => {
    expect(electronMain).toMatch(/mainWindow = new BrowserWindow\(\{[\s\S]*?show: false,/);
    expect(electronMain).toContain('ipcMain.handle("app:rendererReady"');
    expect(electronMain).toContain("revealMainWindowWhenRendererReady?.()");
    expect(electronMain).toContain("assertCurrentMainWindowSender(event)");
    expect(electronMain).toContain("event.senderFrame === mainWindow.webContents.mainFrame");
    expect(electronMain).toContain('if (!isCurrentMainWindowSender(event)) return false;');
    expect(electronMain).toContain('path.resolve(app.getAppPath(), "dist", "index.html")');
    expect(electronMain).toContain('mainWindow.once("ready-to-show", revealMainWindow)');
    expect(preloadSource).toContain('ipcRenderer.invoke("app:rendererReady")');
    expect(electronMain).toContain("setTimeout(revealMainWindow, 8_000)");
    expect(indexSource).toContain('class="startup-paint"');
    expect(indexSource).toContain('id="startup-paint"');
    expect(indexSource).toContain('id="startup-paint" class="startup-paint" aria-hidden="true"');
    expect(indexSource).not.toContain('aria-label="Language Miner loading"');
    expect(indexSource).toContain("background: #f4f7fb");
    expect(indexSource).not.toMatch(/background:\s*#(?:000|000000)\b/i);
    expect(indexSource.indexOf('id="startup-paint"')).toBeLessThan(indexSource.indexOf('id="root"'));
    expect(rendererMainSource).toContain("markRendererReady()");
    expect(rendererMainSource).toContain("startupPaint.remove();");
    expect(rendererMainSource).toContain("void markRendererReady().catch(() => false)");
    expect(rendererMainSource).toContain("APP_STARTUP_PAINT_FALLBACK_MS");
    expect(rendererMainSource).toContain("window.setTimeout(finishStartup");
    expect(rendererMainSource).toContain("APP_RENDERER_READY_EVENT");
    expect(appSource).toContain('bootstrapState === "loading"');
    expect(appSource).toContain("announceAppRendererReady()");
    expect(startupLifecycleSource).toContain('"language-miner:renderer-ready"');
  });

  it("backs renderer onboarding completion with a packaged Electron store", () => {
    expect(apiSource).toContain("getAppOnboardingCompleted?(): Promise<boolean>");
    expect(preloadSource).toContain('ipcRenderer.invoke("app:getOnboardingCompleted")');
    expect(preloadSource).toContain('ipcRenderer.invoke("app:completeOnboarding")');
    expect(electronMain).toContain('ipcMain.handle("app:getOnboardingCompleted"');
    expect(electronMain).toContain('ipcMain.handle("app:completeOnboarding"');
    expect(appSource).toContain("readHostCompletion()");
    expect(appSource).toContain("resolveAppOnboardingCompletion");
  });

  it("surfaces failure to register the global OCR shortcut", () => {
    expect(desktopOcrSource).toContain("return registered;");
    expect(electronMain).toContain(
      "desktopOcrShortcutAvailable = registerDesktopOcrShortcut"
    );
    expect(electronMain).toContain("runtimeDesktopOcrShortcutUnavailable");
  });

  it("shows a localized provider label instead of an internal class name", () => {
    expect(appSource).toContain("providerDisplayName");
    expect(appSource).toContain("normalizeStoredProviderName(activeSettings.providerName)");
    expect(appSource).toContain(
      "app.providers.${normalizeStoredProviderName(activeSettings.providerName)}"
    );
    expect(appSource).not.toContain("<p>{provider.name}</p>");
  });
});
