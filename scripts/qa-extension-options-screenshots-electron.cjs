const { app, BrowserWindow, session } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const locale = process.env.LM_QA_EXTENSION_LOCALE === "en" ? "en" : "ko";
const outputPaths = {
  pending: path.resolve(
    process.env.LM_QA_EXTENSION_PENDING_SCREENSHOT ||
      process.env.LM_QA_EXTENSION_SCREENSHOT ||
      path.join(repoRoot, "debug", "qa", `extension-options-${locale}-pending.png`)
  ),
  confirm: path.resolve(
    process.env.LM_QA_EXTENSION_CONFIRM_SCREENSHOT ||
      path.join(repoRoot, "debug", "qa", `extension-options-${locale}-confirm.png`)
  ),
  cleared: path.resolve(
    process.env.LM_QA_EXTENSION_CLEARED_SCREENSHOT ||
      path.join(repoRoot, "debug", "qa", `extension-options-${locale}-cleared.png`)
  )
};
const reportPath = path.resolve(
  process.env.LM_QA_EXTENSION_REPORT || outputPaths.pending.replace(/\.png$/i, ".json")
);
const userDataPath = path.resolve(
  process.env.LM_QA_EXTENSION_USER_DATA ||
    path.join(repoRoot, "debug", "qa", `extension-options-user-data-${Date.now()}`)
);

app.commandLine.appendSwitch("lang", locale === "ko" ? "ko-KR" : "en-US");
app.commandLine.appendSwitch("disable-background-networking");
app.commandLine.appendSwitch("disable-component-update");
app.commandLine.appendSwitch("disable-sync");
app.commandLine.appendSwitch("metrics-recording-only");
app.disableHardwareAcceleration();
app.setPath("userData", userDataPath);

void app.whenReady().then(run).catch(fail);

async function run() {
  for (const outputPath of Object.values(outputPaths)) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  }
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const isolatedSession = session.fromPartition("persist:docs-extension-options", {
    cache: false
  });
  const extension = await isolatedSession.loadExtension(path.join(repoRoot, "extension"), {
    allowFileAccess: false
  });
  const window = new BrowserWindow({
    x: -10_000,
    y: -10_000,
    width: 1240,
    height: 820,
    show: false,
    skipTaskbar: true,
    backgroundColor: "#f8fafc",
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: "persist:docs-extension-options"
    }
  });

  await window.loadURL(`chrome-extension://${extension.id}/options.html`);
  await waitForOptionsReady(window, 15_000);
  await applyCaptureLocale(window, locale);
  await window.webContents.executeJavaScript(`
(() => {
  document.documentElement.style.colorScheme = 'light';
  document.body.dataset.docsScreenshot = 'true';
})()
`);
  await seedPendingQueues(window);
  const pendingQueue = await waitForQueueState(
    window,
    (state) => state.count > 0 && state.clearDisabled === false && state.dialogOpen === false,
    15_000
  );
  await applyCaptureLocale(window, locale);
  await delay(250);
  const localizedPendingQueue = await readQueueState(window);
  if (localizedPendingQueue.count !== pendingQueue.count) {
    throw new Error("Localized pending queue summary no longer matches the actual queue count.");
  }
  const pending = await captureState(
    window,
    "pending",
    outputPaths.pending,
    localizedPendingQueue
  );

  await window.webContents.executeJavaScript(
    "document.querySelector('#clear')?.click();"
  );
  const confirmQueue = await waitForQueueState(
    window,
    (state) => state.count > 0 && state.dialogOpen === true,
    5_000
  );
  await delay(180);
  const confirm = await captureState(window, "confirm", outputPaths.confirm, confirmQueue);

  await window.webContents.executeJavaScript(
    "document.querySelector('#clear-dialog button[value=\"confirm\"]')?.click();"
  );
  const clearedQueue = await waitForQueueState(
    window,
    (state) =>
      state.count === 0 &&
      state.clearDisabled === true &&
      state.dialogOpen === false &&
      Boolean(state.resultText),
    20_000
  );
  await applyCaptureLocale(window, locale);
  await delay(250);
  const localizedClearedQueue = await readQueueState(window);
  if (localizedClearedQueue.count !== clearedQueue.count || localizedClearedQueue.count !== 0) {
    throw new Error("Localized cleared queue summary does not show zero pending items.");
  }
  const cleared = await captureState(
    window,
    "cleared",
    outputPaths.cleared,
    localizedClearedQueue
  );
  const states = { pending, confirm, cleared };
  const findings = Object.values(states).flatMap((state) => state.textSafety.findings);
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        status: "passed",
        locale,
        source: "isolated temporary Electron extension session",
        extensionId: extension.id,
        states,
        textSafety: {
          findings,
          scannedCharacterCount: Object.values(states).reduce(
            (total, state) => total + state.textSafety.scannedCharacterCount,
            0
          )
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  window.destroy();
  await isolatedSession.removeExtension(extension.id);
  app.quit();
}

async function seedPendingQueues(window) {
  await window.webContents.executeJavaScript(`
(async () => {
  const now = Date.now();
  const sentence = 'I am running a little late. '.repeat(18);
  await chrome.storage.local.set({
    lifeMinerCaptureQueue: [
      { queuedAt: now - 40_000, payload: { id: 'qa-life-1', source: 'qa-fixture', text: sentence } },
      { queuedAt: now - 30_000, payload: { id: 'qa-life-2', source: 'qa-fixture', text: 'Could you send that again? '.repeat(14) } }
    ],
    lifeMinerSentenceCardQueue: [
      { queuedAt: now - 20_000, payload: { id: 'qa-card-1', source: 'qa-fixture', sentence, selectedTerms: ['running late'] } }
    ],
    lifeMinerYoutubeWatchQueue: [
      { queuedAt: now - 10_000, payload: { id: 'qa-watch-1', source: 'qa-fixture', videoId: 'qa-video', caption: 'Safe synthetic caption '.repeat(16) } }
    ]
  });
  document.querySelector('#refresh')?.click();
})()
`);
}

async function waitForQueueState(window, predicate, timeoutMs) {
  const startedAt = Date.now();
  let latest = null;
  while (Date.now() - startedAt < timeoutMs) {
    latest = await readQueueState(window);
    if (predicate(latest)) return latest;
    await delay(100);
  }
  throw new Error(`Extension options did not reach the requested queue state: ${JSON.stringify(latest)}`);
}

function readQueueState(window) {
  return window.webContents.executeJavaScript(`
(() => {
  const statusText = document.querySelector('#queue-status')?.textContent?.trim() || '';
  const countMatch = statusText.match(/(\\d+)/);
  return {
    statusText,
    count: countMatch ? Number(countMatch[1]) : -1,
    clearDisabled: document.querySelector('#clear')?.disabled === true,
    dialogOpen: document.querySelector('#clear-dialog')?.open === true,
    resultText: document.querySelector('#result')?.textContent?.trim() || ''
  };
})()
`);
}

async function captureState(window, stateName, outputPath, queueState) {
  const pageText = String(
    await window.webContents.executeJavaScript(
      "document.body?.innerText || document.documentElement?.innerText || ''"
    )
  );
  const findings = scanSensitiveText(pageText);
  if (findings.length) {
    throw new Error(
      `Extension options ${stateName} screenshot safety scan failed: ${findings.join(", ")}`
    );
  }
  window.showInactive();
  window.webContents.invalidate();
  await delay(300);
  await window.webContents.capturePage();
  await delay(120);
  const image = await window.webContents.capturePage();
  const png = image.toPNG();
  if (!png.length) {
    throw new Error(`Extension options ${stateName} capture returned an empty image.`);
  }
  fs.writeFileSync(outputPath, png);
  return {
    status: "passed",
    outputPath,
    sha256: crypto.createHash("sha256").update(png).digest("hex"),
    queueState,
    textSafety: { findings, scannedCharacterCount: pageText.length }
  };
}

async function applyCaptureLocale(window, requestedLocale) {
  const catalog = JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, "extension", "_locales", requestedLocale, "messages.json"),
      "utf8"
    )
  );
  await window.webContents.executeJavaScript(`
(() => {
  const locale = ${JSON.stringify(requestedLocale)};
  const catalog = ${JSON.stringify(catalog)};
  const getMessage = (key) => String(catalog[key]?.message || key);
  const status = document.querySelector('#queue-status');
  const result = document.querySelector('#result');
  const actualQueueSummary = status?.textContent?.trim() || '';
  const count = actualQueueSummary.match(/(\\d+)/)?.[1] || '0';
  const size = actualQueueSummary.match(/([0-9.]+\\s*(?:B|KB|MB|GB))\\s*$/i)?.[1] || '0 B';
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const key = element.getAttribute('data-i18n') || '';
    element.textContent = getMessage(key);
  });
  const summary = getMessage('optionsQueueSummary')
    .replace(/\\$COUNT\\$/g, count)
    .replace(/\\$SIZE\\$/g, size);
  if (status) status.textContent = summary;
  if (result?.textContent?.trim()) {
    result.textContent = getMessage('optionsClearedPendingAcknowledgement');
  }
  document.documentElement.lang = locale;
  document.title = getMessage('optionsTitle');
})()
`);
}

async function waitForOptionsReady(window, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const state = await window.webContents.executeJavaScript(`
(() => {
  const status = document.querySelector('#queue-status')?.textContent?.trim() || '';
  const clear = document.querySelector('#clear');
  return {
    ready: Boolean(status) && !/checking|확인 중/i.test(status) && clear instanceof HTMLButtonElement,
    status
  };
})()
`);
    if (state?.ready) return;
    await delay(100);
  }
  throw new Error("Extension options page did not finish reading the isolated queue.");
}

function scanSensitiveText(value) {
  const rules = [
    ["email", /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i],
    ["Windows user path", /[A-Z]:\\Users\\[^\\\s]+/i],
    ["OpenAI key", /sk-[A-Za-z0-9_-]{16,}/],
    ["Google API key", /AIza[0-9A-Za-z_-]{20,}/]
  ];
  return rules.filter(([, pattern]) => pattern.test(value)).map(([label]) => label);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fail(error) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        status: "failed",
        locale,
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  app.exitCode = 1;
  app.quit();
}
