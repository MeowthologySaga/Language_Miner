import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");

describe("manual ChatGPT bridge Electron boundary", () => {
  it("opens only the fixed ChatGPT URL from an authenticated main-window IPC call", () => {
    const mainSource = fs.readFileSync(path.join(repoRoot, "electron", "main.ts"), "utf8");
    const handlerStart = mainSource.indexOf('ipcMain.handle("app:openChatGpt"');
    const handlerEnd = mainSource.indexOf('ipcMain.handle("app:setPlayerFullscreen"', handlerStart);
    const handler = mainSource.slice(handlerStart, handlerEnd);

    expect(handlerStart).toBeGreaterThanOrEqual(0);
    expect(handler).toContain("assertMainWindowIpcSender(event)");
    expect(handler).toContain('shell.openExternal("https://chatgpt.com/")');
    expect(handler).not.toContain("rawUrl");
  });

  it("exposes a zero-argument preload method instead of a caller-selected URL", () => {
    const preloadSource = fs.readFileSync(path.join(repoRoot, "electron", "preload.ts"), "utf8");
    const apiSource = fs.readFileSync(path.join(repoRoot, "src", "data", "api.ts"), "utf8");

    expect(preloadSource).toContain(
      'openChatGpt: () => ipcRenderer.invoke("app:openChatGpt") as Promise<boolean>'
    );
    expect(apiSource).toContain("openChatGpt?(): Promise<boolean>");
  });
});
