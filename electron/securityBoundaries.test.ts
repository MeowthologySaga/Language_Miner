import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("Electron security boundaries", () => {
  it("keeps the main renderer sandboxed and disables the unused webview tag", () => {
    const source = read("electron/main.ts");
    expect(source).toContain("webviewTag: false");
    expect(source).toContain("assertMainWindowIpcSender(event)");
    expect(source).toContain('setPermissionRequestHandler((_webContents, _permission, callback)');
  });

  it("keeps automatic extension capture behind the master Life Mining switch", () => {
    const mainSource = read("electron/main.ts");
    const contentSource = read("extension/src/content/index.js");
    const youtubeSource = read("extension/src/content/youtubeWatchCollector.js");
    expect(mainSource).toContain('requestUrl.pathname === "/life-logs"');
    expect(mainSource).toContain('requestUrl.pathname === "/youtube-watch"');
    expect(contentSource).toContain("response?.lifeMiningEnabled === true");
    expect(youtubeSource).toContain("response?.lifeMiningEnabled === true");
  });

  it("allows official extension pairing without enabling automatic capture", () => {
    const source = read("electron/main.ts");
    const pairBlock = source.slice(
      source.indexOf('requestUrl.pathname === "/pair"'),
      source.indexOf('requestUrl.pathname === "/settings"')
    );
    expect(pairBlock).toContain("lifeMinerBridgePairing.pair(origin)");
    expect(pairBlock).not.toContain("lifeMiningCaptureSettings.enabled");
  });

  it("does not expose callable legacy arbitrary wallet-spend helpers", () => {
    expect(read("electron/database.ts")).not.toContain("legacySpendDiamonds(");
    expect(read("src/pages/PlayZoneRuntimePage.tsx")).not.toContain(
      "legacySpendHostDiamonds("
    );
  });
});
