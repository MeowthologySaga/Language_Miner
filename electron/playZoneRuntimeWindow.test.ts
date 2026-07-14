import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createYouTubeEmbedRequestHeaders,
  createPlayZoneRuntimeWindowOptions,
  isAllowedPlayZoneCartridgeUrl,
  isAllowedPlayZoneRuntimeWindowUrl,
  normalizePlayZoneRuntimeEntryUrl,
  normalizePlayZoneDiamondActions,
  openPlayZoneRuntimeWindow,
  type PlayZoneRuntimeWindowDependencies
} from "./playZoneRuntimeWindow";

function createDependencies(
  overrides: Partial<PlayZoneRuntimeWindowDependencies> = {}
): PlayZoneRuntimeWindowDependencies {
  return {
    additionalArguments: [],
    appLocale: "ko",
    createWindow: () => ({
      async loadURL() {},
      async loadFile() {},
      show() {},
      focus() {}
    }),
    devServerUrl: undefined,
    distIndexPath: join(process.cwd(), "dist", "index.html"),
    preloadPath: join(process.cwd(), "dist-electron", "preload.js"),
    resolveEntryAuthorization: (entryUrl) => ({
      cartridgeId: "external-cartridge",
      title: "PlayZone Game",
      entryUrl,
      status: "ready",
      permissions: {
        walletSpend: false,
        storage: false,
        network: false,
        externalLinks: false,
        cardRead: false
      },
      diamondActions: []
    }),
    ...overrides
  };
}

describe("playZoneRuntimeWindow", () => {
  it("allows only cartridge runtime URLs from the expected app origin or file path", () => {
    const devDependencies = createDependencies({ devServerUrl: "http://127.0.0.1:5173" });

    expect(
      isAllowedPlayZoneRuntimeWindowUrl(
        "http://127.0.0.1:5173/?playZoneRuntime=cartridge",
        devDependencies
      )
    ).toBe(true);
    expect(
      isAllowedPlayZoneRuntimeWindowUrl(
        "http://example.com/?playZoneRuntime=cartridge",
        devDependencies
      )
    ).toBe(false);
    expect(isAllowedPlayZoneRuntimeWindowUrl("http://127.0.0.1:5173/", devDependencies)).toBe(
      false
    );

    const distIndexPath = join(process.cwd(), "dist", "index.html");
    const runtimeUrl = pathToFileURL(distIndexPath);
    runtimeUrl.searchParams.set("playZoneRuntime", "cartridge");
    expect(
      isAllowedPlayZoneRuntimeWindowUrl(runtimeUrl.toString(), createDependencies({ distIndexPath }))
    ).toBe(true);
  });

  it("opens a sanitized runtime URL through injected window dependencies", async () => {
    let loadedUrl = "";
    let shown = false;
    let focused = false;

    const opened = await openPlayZoneRuntimeWindow(
      {
        runtimeId: "cartridge",
        cartridgeId: " demo-cartridge ",
        title: " Demo   Game ",
        entryUrl: "games/demo/index.html",
        walletBalance: 12.9
      },
      createDependencies({
        appLocale: "en",
        createWindow: () => ({
          async loadURL(url) {
            loadedUrl = url;
          },
          async loadFile() {
            throw new Error("Expected dev-server URL loading.");
          },
          show() {
            shown = true;
          },
          focus() {
            focused = true;
          }
        }),
        devServerUrl: "http://127.0.0.1:5173",
        resolveEntryAuthorization: (entryUrl) => ({
          cartridgeId: "demo-cartridge",
          title: "Demo Game",
          entryUrl,
          status: "ready",
          permissions: {
            walletSpend: false,
            storage: true,
            network: false,
            externalLinks: false,
            cardRead: false
          },
          diamondActions: []
        })
      })
    );

    const runtimeUrl = new URL(loadedUrl);
    expect(opened).toBe(true);
    expect(runtimeUrl.searchParams.get("playZoneRuntime")).toBe("cartridge");
    expect(runtimeUrl.searchParams.get("cartridgeId")).toBe("demo-cartridge");
    expect(runtimeUrl.searchParams.get("title")).toBe("Demo Game");
    expect(runtimeUrl.searchParams.get("entryUrl")).toBe("games/demo/index.html");
    expect(runtimeUrl.searchParams.get("walletBalance")).toBe("12");
    expect(runtimeUrl.searchParams.get("appLocale")).toBe("en");
    expect(shown).toBe(true);
    expect(focused).toBe(true);
  });

  it("lets the host rewrite local cartridge entries before loading the runtime", async () => {
    let loadedUrl = "";

    const opened = await openPlayZoneRuntimeWindow(
      {
        runtimeId: "cartridge",
        cartridgeId: "sample-game",
        title: "Sample Game",
        entryUrl: "cartridges/sample-game/game/index.html"
      },
      createDependencies({
        createWindow: () => ({
          async loadURL(url) {
            loadedUrl = url;
          },
          async loadFile() {
            throw new Error("Expected dev-server URL loading.");
          },
          show() {},
          focus() {}
        }),
        devServerUrl: "http://127.0.0.1:5173",
        resolveEntryAuthorization: () => ({
          cartridgeId: "sample-game",
          title: "Sample Game",
          entryUrl: "lem-playzone://pack/root/game/index.html",
          status: "ready",
          permissions: {
            walletSpend: false,
            storage: true,
            network: false,
            externalLinks: false,
            cardRead: false
          },
          diamondActions: []
        })
      })
    );

    const runtimeUrl = new URL(loadedUrl);
    expect(opened).toBe(true);
    expect(runtimeUrl.searchParams.get("entryUrl")).toBe(
      "lem-playzone://pack/root/game/index.html"
    );
  });

  it("notifies the host to refresh wallet state when the runtime window closes", async () => {
    let closedListener: (() => void) | undefined;
    let notifyCount = 0;

    const opened = await openPlayZoneRuntimeWindow(
      {
        runtimeId: "cartridge",
        cartridgeId: "diamond-game",
        title: "Diamond Game",
        entryUrl: "games/diamond/index.html"
      },
      createDependencies({
        createWindow: () => ({
          async loadURL() {},
          async loadFile() {},
          show() {},
          focus() {},
          on(event, listener) {
            if (event === "closed") {
              closedListener = listener;
            }
          }
        }),
        devServerUrl: "http://127.0.0.1:5173",
        notifyWalletChanged: () => {
          notifyCount += 1;
        }
      })
    );

    expect(opened).toBe(true);
    expect(closedListener).toBeTypeOf("function");

    closedListener?.();
    expect(notifyCount).toBe(1);
  });

  it("rejects unsafe runtime entry URLs", async () => {
    expect(normalizePlayZoneRuntimeEntryUrl("https://example.com/game.js")).toBeNull();
    expect(normalizePlayZoneRuntimeEntryUrl("../outside.js")).toBeNull();
    expect(normalizePlayZoneRuntimeEntryUrl("games/demo.js")).toBe("games/demo.js");

    const opened = await openPlayZoneRuntimeWindow(
      {
        runtimeId: "cartridge",
        entryUrl: "https://example.com/game.js"
      },
      createDependencies()
    );
    expect(opened).toBe(false);
  });

  it("rejects entries that were not authorized by the host scanner", async () => {
    const opened = await openPlayZoneRuntimeWindow(
      { runtimeId: "cartridge", entryUrl: "games/demo/index.html" },
      createDependencies({ resolveEntryAuthorization: () => null })
    );
    expect(opened).toBe(false);
  });

  it("destroys a runtime window when its app page does not finish loading", async () => {
    let destroyed = false;
    const opening = openPlayZoneRuntimeWindow(
      { runtimeId: "cartridge", entryUrl: "games/demo/index.html" },
      createDependencies({
        devServerUrl: "http://127.0.0.1:5173",
        runtimePageLoadTimeoutMs: 10,
        createWindow: () => ({
          loadURL: () => new Promise(() => undefined),
          async loadFile() {},
          show() {},
          focus() {},
          destroy() {
            destroyed = true;
          }
        })
      })
    );

    await expect(opening).rejects.toThrow("PLAY_ZONE_RUNTIME_PAGE_LOAD_TIMEOUT");
    expect(destroyed).toBe(true);
  });

  it("uses host-authorized wallet actions instead of renderer-provided actions", async () => {
    let loadedUrl = "";
    await openPlayZoneRuntimeWindow(
      {
        runtimeId: "cartridge",
        entryUrl: "games/demo/index.html",
        diamondActions: [{ id: "forged", amount: 1, reason: "Forged" }]
      },
      createDependencies({
        devServerUrl: "http://127.0.0.1:5173",
        createWindow: () => ({
          async loadURL(url) { loadedUrl = url; },
          async loadFile() {},
          show() {},
          focus() {}
        }),
        resolveEntryAuthorization: (entryUrl) => ({
          cartridgeId: "safe-pack",
          title: "Safe Pack",
          entryUrl,
          status: "ready",
          permissions: {
            walletSpend: true,
            storage: false,
            network: false,
            externalLinks: false,
            cardRead: false
          },
          diamondActions: [
            { id: "declared", amount: 10, reason: "Declared", requiresConfirm: true, repeatable: false }
          ]
        })
      })
    );
    const params = new URL(loadedUrl).searchParams;
    expect(JSON.parse(params.get("diamondActions") ?? "[]")).toEqual([
      { id: "declared", amount: 10, reason: "Declared", requiresConfirm: true, repeatable: false }
    ]);
    expect(JSON.parse(params.get("permissions") ?? "{}")).toMatchObject({ walletSpend: true });
  });

  it("uses an isolated web partition and restricts cartridge frame navigation to its mount", () => {
    const options = createPlayZoneRuntimeWindowOptions(createDependencies());
    expect(options.webPreferences).toMatchObject({
      partition: "playzone-runtime",
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    });
    const authorized = "lem-playzone://pack/root-token/game/index.html";
    expect(isAllowedPlayZoneCartridgeUrl("lem-playzone://pack/root-token/game/room.html", authorized)).toBe(true);
    expect(isAllowedPlayZoneCartridgeUrl("https://example.com/", authorized)).toBe(false);
    expect(isAllowedPlayZoneCartridgeUrl("lem-playzone://pack/other-token/game/index.html", authorized)).toBe(false);
  });

  it("cancels external runtime requests and frame navigation at the Electron boundary", async () => {
    let frameListener: ((details: {
      preventDefault(): void;
      url: string;
      isMainFrame: boolean;
    }) => void) | undefined;
    let requestListener:
      | ((details: { url: string }, callback: (response: { cancel: boolean }) => void) => void)
      | undefined;
    await openPlayZoneRuntimeWindow(
      { runtimeId: "cartridge", entryUrl: "games/demo/index.html" },
      createDependencies({
        devServerUrl: "http://127.0.0.1:5173",
        resolveEntryAuthorization: () => ({
          cartridgeId: "safe-pack",
          title: "Safe Pack",
          entryUrl: "lem-playzone://pack/root-token/game/index.html",
          status: "ready",
          permissions: {
            walletSpend: false,
            storage: false,
            network: false,
            externalLinks: false,
            cardRead: false
          },
          diamondActions: []
        }),
        createWindow: () => ({
          async loadURL() {},
          async loadFile() {},
          show() {},
          focus() {},
          webContents: {
            on(event: string, listener: unknown) {
              if (event === "will-frame-navigate") {
                frameListener = listener as typeof frameListener;
              }
            },
            setWindowOpenHandler() {},
            session: {
              webRequest: {
                onBeforeRequest(_filter, listener) {
                  requestListener = listener;
                }
              }
            }
          }
        })
      })
    );

    let cancelled = false;
    frameListener?.({
      url: "https://example.com/escape",
      isMainFrame: false,
      preventDefault: () => { cancelled = true; }
    });
    expect(cancelled).toBe(true);

    let externalResult: { cancel: boolean } | undefined;
    requestListener?.({ url: "https://example.com/data" }, (result) => { externalResult = result; });
    expect(externalResult).toEqual({ cancel: true });
    let appResult: { cancel: boolean } | undefined;
    requestListener?.({ url: "http://127.0.0.1:5173/src/main.tsx" }, (result) => { appResult = result; });
    expect(appResult).toEqual({ cancel: false });
  });

  it("normalizes manifest wallet actions and forces host confirmation", () => {
    expect(normalizePlayZoneDiamondActions([
      { id: "summon", amount: 30.9, reason: " Summon hero ", requiresConfirm: false, repeatable: true },
      { id: "summon", amount: 1, reason: "duplicate" },
      { id: "unsafe id", amount: 1, reason: "bad" }
    ])).toEqual([
      { id: "summon", amount: 30, reason: "Summon hero", requiresConfirm: true, repeatable: true }
    ]);
  });

  it("adds YouTube referer headers without overwriting existing referers", () => {
    expect(createYouTubeEmbedRequestHeaders({ Accept: "text/html" })).toEqual({
      Accept: "text/html",
      Referer: "https://www.youtube.com/"
    });

    expect(createYouTubeEmbedRequestHeaders({ referer: "https://local.test/" })).toEqual({
      referer: "https://local.test/"
    });
  });
});
