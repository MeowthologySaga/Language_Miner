"use strict";

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { app, BrowserWindow, ipcMain, protocol, session } = require("electron");
const {
  openPlayZoneRuntimeWindow
} = require("../dist-electron/electron/playZoneRuntimeWindow.js");
const {
  authorizePlayZoneRuntimeEntry
} = require("../dist-electron/electron/playZoneFileActions.js");
const {
  listInstalledPlayZoneSnapshots
} = require("../dist-electron/electron/playZoneSnapshotStore.js");
const {
  createPlayZoneEntryProtocolUrl,
  readPlayZoneEntryProtocolFile,
  registerPlayZoneEntryProtocolMount
} = require("../dist-electron/electron/playZoneEntryProtocol.js");

const PLAY_ZONE_PROTOCOL = "lem-playzone";
const PLAY_ZONE_PARTITION = "playzone-runtime";
const QA_TIMEOUT_MS = 45_000;

protocol.registerSchemesAsPrivileged([
  {
    scheme: PLAY_ZONE_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

let finished = false;
let qaUserDataPath = "";

function finish(code, message) {
  if (finished) return;
  finished = true;
  const output = code === 0 ? process.stdout : process.stderr;
  output.write(`${message}\n`);
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.destroy();
  }
  if (qaUserDataPath) {
    try {
      fs.rmSync(qaUserDataPath, { recursive: true, force: true });
    } catch {
      // A Windows cache file may remain locked until Electron exits. It is safe
      // to leave the disposable OS temp folder behind for the normal temp sweep.
    }
  }
  app.exit(code);
}

function contentTypeFor(relativePath) {
  switch (path.extname(relativePath).toLowerCase()) {
    case ".html": return "text/html; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    case ".svg": return "image/svg+xml";
    case ".mp3": return "audio/mpeg";
    case ".ogg": return "audio/ogg";
    case ".wav": return "audio/wav";
    default: return "application/octet-stream";
  }
}

async function waitForHealthyGameSurface(runtimeWindow) {
  const startedAt = Date.now();
  let lastState = { frameLoadState: "missing", childFrame: false, canvasCount: 0 };
  while (Date.now() - startedAt < QA_TIMEOUT_MS - 5_000) {
    const frameLoadState = await runtimeWindow.webContents.executeJavaScript(
      `document.querySelector('[data-qa="play-zone-runtime-window"]')?.getAttribute('data-frame-load-state') ?? 'missing'`,
      true
    ).catch(() => "unavailable");
    const childFrame = runtimeWindow.webContents.mainFrame.framesInSubtree.find(
      (frame) => frame !== runtimeWindow.webContents.mainFrame && frame.url.startsWith("lem-playzone:")
    );
    let surface = null;
    if (childFrame) {
      surface = await childFrame.executeJavaScript(`({
        ready: document.readyState === "complete",
        canvasCount: document.querySelectorAll("canvas").length,
        failedImageCount: Array.from(document.images).filter(
          (image) => image.complete && image.naturalWidth === 0
        ).length
      })`).catch(() => null);
    }
    lastState = {
      frameLoadState,
      childFrame: Boolean(childFrame),
      canvasCount: surface?.canvasCount ?? 0,
      failedImageCount: surface?.failedImageCount ?? 0
    };
    if (
      frameLoadState === "loaded" &&
      surface?.ready &&
      surface.canvasCount > 0 &&
      surface.failedImageCount === 0
    ) {
      return lastState;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`The real game surface did not become healthy: ${JSON.stringify(lastState)}`);
}

qaUserDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "lm-playzone-runtime-qa-"));
app.setPath("userData", qaUserDataPath);

app.whenReady().then(async () => {
  const installedRoot = path.join(
    process.env.APPDATA,
    "language-miner",
    "play-zone-installed"
  );
  const installedEntries = listInstalledPlayZoneSnapshots(installedRoot);
  const officialPackIds = [
    "meowthology.abyss-summoner",
    "meowthology.drillheart-defense",
    "meowthology.cat-odyssey"
  ];
  const protocolHandler = (request) => {
    try {
      const verified = readPlayZoneEntryProtocolFile(request.url);
      return new Response(verified.contents, {
        headers: { "Content-Type": contentTypeFor(verified.relativePath) }
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  };
  protocol.handle(PLAY_ZONE_PROTOCOL, protocolHandler);
  session.fromPartition(PLAY_ZONE_PARTITION).protocol.handle(PLAY_ZONE_PROTOCOL, protocolHandler);
  ipcMain.handle("app:rendererReady", () => true);
  ipcMain.handle("wallet:get", () => ({ balance: 10_000 }));
  ipcMain.handle("wallet:lookupSpend", () => null);
  ipcMain.handle("playZone:loadSave", (_event, input) => input?.fallback ?? null);
  ipcMain.handle("playZone:writeSave", () => true);
  ipcMain.handle("playZone:clearSave", () => true);

  const timeout = setTimeout(() => {
    finish(1, "PlayZone runtime-window QA timed out.");
  }, QA_TIMEOUT_MS);

  const distIndexPath = path.join(process.cwd(), "dist", "index.html");
  const keeperWindow = new BrowserWindow({ show: false });
  await keeperWindow.loadURL("about:blank");
  const results = [];
  for (const packId of officialPackIds) {
    const installedEntry = installedEntries.find((entry) => entry.id === packId);
    if (!installedEntry?.entryUrl) {
      throw new Error(`The installed official snapshot is unavailable for runtime QA: ${packId}`);
    }
    let runtimeWindow;
    const opened = await openPlayZoneRuntimeWindow(
      {
        runtimeId: "cartridge",
        cartridgeId: installedEntry.id,
        title: installedEntry.title,
        entryUrl: installedEntry.entryUrl,
        walletBalance: 10_000
      },
      {
        additionalArguments: [],
        createWindow: (options) => {
          runtimeWindow = new BrowserWindow({ ...options, show: false });
          return runtimeWindow;
        },
        distIndexPath,
        preloadPath: path.join(process.cwd(), "dist-electron", "electron", "preload.js"),
        resolveEntryAuthorization: (entryUrl) => {
          const snapshot = authorizePlayZoneRuntimeEntry(entryUrl, installedRoot);
          if (!snapshot) return null;
          const mountId = registerPlayZoneEntryProtocolMount(
            snapshot.snapshotRootPath,
            snapshot.runtimeFiles
          );
          const entryUrlForMount = createPlayZoneEntryProtocolUrl(
            mountId,
            snapshot.relativeEntryPath
          );
          return entryUrlForMount
            ? { ...snapshot.authorization, entryUrl: entryUrlForMount }
            : null;
        }
      }
    );
    if (!opened) throw new Error(`The runtime helper rejected a valid launch: ${packId}`);
    if (!runtimeWindow) throw new Error(`The runtime BrowserWindow was not created: ${packId}`);
    results.push({ packId, ...(await waitForHealthyGameSurface(runtimeWindow)) });
    runtimeWindow.destroy();
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  clearTimeout(timeout);
  finish(0, `PlayZone runtime-window QA passed: ${JSON.stringify(results)}`);
}).catch((error) => {
  finish(1, `PlayZone runtime-window QA failed (${error instanceof Error ? error.message : String(error)}).`);
});
