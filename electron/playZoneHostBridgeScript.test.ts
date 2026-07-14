import { describe, expect, it } from "vitest";
import { injectPlayZoneHostBridge, PLAY_ZONE_HOST_BRIDGE_SCRIPT } from "./playZoneHostBridgeScript";

describe("playZoneHostBridgeScript", () => {
  it("injects the host API bridge before cartridge scripts run", () => {
    const html = [
      "<!doctype html>",
      "<html>",
      "<head><title>Game</title></head>",
      "<body><script src=\"./mock-host.js\"></script></body>",
      "</html>"
    ].join("");

    const injected = injectPlayZoneHostBridge(html);

    expect(injected.indexOf("window.LEM_GAME_HOST_API")).toBeGreaterThan(-1);
    expect(injected.indexOf("window.LEM_GAME_HOST_API")).toBeLessThan(
      injected.indexOf("./mock-host.js")
    );
    expect(PLAY_ZONE_HOST_BRIDGE_SCRIPT).toContain("lem.game.host.request");
    expect(PLAY_ZONE_HOST_BRIDGE_SCRIPT).toContain("wallet.spend");
    expect(PLAY_ZONE_HOST_BRIDGE_SCRIPT).toContain("flushLatestSave");
    expect(PLAY_ZONE_HOST_BRIDGE_SCRIPT).toContain("pagehide");
  });
});
