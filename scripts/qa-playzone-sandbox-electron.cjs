"use strict";

const { app, BrowserWindow, protocol } = require("electron");

const PLAY_ZONE_PROTOCOL = "lem-playzone";
const QA_TIMEOUT_MS = 8_000;

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

function finish(code, message) {
  if (finished) return;
  finished = true;
  const output = code === 0 ? process.stdout : process.stderr;
  output.write(`${message}\n`);
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.destroy();
  }
  app.exit(code);
}

app.whenReady().then(async () => {
  protocol.handle(PLAY_ZONE_PROTOCOL, () => new Response(
    "<!doctype html><html><body data-play-zone-qa=\"loaded\">PlayZone QA loaded</body></html>",
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  ));

  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const timeout = setTimeout(() => {
    finish(1, "PlayZone sandbox QA timed out before the custom-protocol iframe loaded.");
  }, QA_TIMEOUT_MS);

  window.webContents.on("did-fail-load", (_event, code, description, url, isMainFrame) => {
    if (!isMainFrame) {
      clearTimeout(timeout);
      finish(1, `PlayZone sandbox QA child frame failed (${code}: ${description}; ${url}).`);
    }
  });

  window.webContents.on("did-frame-finish-load", (_event, isMainFrame) => {
    if (isMainFrame) return;
    clearTimeout(timeout);
    finish(0, "PlayZone sandbox QA passed: the custom-protocol iframe finished loading.");
  });

  const parentHtml = [
    "<!doctype html><html><body>",
    '<iframe sandbox="allow-scripts allow-pointer-lock allow-top-navigation-to-custom-protocols"',
    ' src="lem-playzone://pack/qa/game/index.html"></iframe>',
    "</body></html>"
  ].join("");

  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(parentHtml)}`);
}).catch((error) => {
  finish(1, `PlayZone sandbox QA failed to start (${error instanceof Error ? error.name : "Error"}).`);
});
