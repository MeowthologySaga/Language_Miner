import "./shared/i18n.js";
import {
  shouldRepairBridgeAuthentication,
  shouldRetainQueuedBridgeItem
} from "./bridgeRetryPolicy.js";
import { createAsyncMutationQueue } from "./asyncMutationQueue.js";
import {
  PRIVACY_QUEUE_BARRIER_STORAGE_KEY,
  acknowledgePrivacyQueueBarrier,
  activatePrivacyQueueBarrier,
  createPrivacyQueueClearAcknowledgement,
  getPrivacyQueueWriteEpoch,
  isPrivacyQueueWriteEpochCurrent,
  normalizePrivacyQueueBarrierState,
  isPrivacyQueueClearRequestId,
  shouldHandlePrivacyQueueClearRequest
} from "./privacyQueueClear.js";
import {
  PRIVACY_QUEUE_RELEASE_ACK_STORAGE_KEY,
  normalizePrivacyQueueBarrierReleaseAcknowledgement,
  normalizePrivacyQueueBarrierReleaseAcknowledgements,
  releasePrivacyQueueBarrierAndPersistAcknowledgement,
  retryPrivacyQueueBarrierReleaseAcknowledgement
} from "./privacyQueueReleaseHandshake.js";

const { t } = globalThis.LanguageMinerExtensionI18n;

const LIFE_LOG_BRIDGE_URL = "http://127.0.0.1:17345/life-logs";
const SENTENCE_CARD_BRIDGE_URL = "http://127.0.0.1:17345/sentence-cards";
const SETTINGS_BRIDGE_URL = "http://127.0.0.1:17345/settings";
const PAIR_BRIDGE_URL = "http://127.0.0.1:17345/pair";
const TRANSLATE_BRIDGE_URL = "http://127.0.0.1:17345/translate";
const YOUTUBE_WATCH_BRIDGE_URL = "http://127.0.0.1:17345/youtube-watch";
const PRIVACY_QUEUE_ACK_BRIDGE_URL = "http://127.0.0.1:17345/privacy/queue-clear-ack";
const PRIVACY_QUEUE_RELEASE_ACK_BRIDGE_URL =
  "http://127.0.0.1:17345/privacy/queue-barrier-release-ack";
const QUEUE_KEY = "lifeMinerCaptureQueue";
const CARD_QUEUE_KEY = "lifeMinerSentenceCardQueue";
const YOUTUBE_WATCH_QUEUE_KEY = "lifeMinerYoutubeWatchQueue";
const SETTINGS_KEY = "lifeMinerBridgeSettings";
const MAX_QUEUE_SIZE = 200;
const MAX_QUEUE_ITEM_BYTES = 128 * 1024;
const MAX_QUEUE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_QUEUE_BYTES = 5 * 1024 * 1024;
const QUEUE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const QUEUE_KEYS = [QUEUE_KEY, CARD_QUEUE_KEY, YOUTUBE_WATCH_QUEUE_KEY];
const DEDUPE_WINDOW_MS = 10_000;
const BRIDGE_REQUEST_TIMEOUT_MS = 5_000;
const BRIDGE_EXTENSION_HEADER = "life-miner-extension";
const MESSAGE_CONTENT_SCRIPT_TARGETS = [
  {
    urlPatterns: ["https://discord.com/*"],
    files: [
      "src/shared/i18n.js",
      "src/shared/maskSensitiveText.js",
      "src/shared/filterLifeLogText.js",
      "src/content/adapters/discord.js",
      "src/content/index.js"
    ]
  },
  {
    urlPatterns: ["https://chatgpt.com/*", "https://chat.openai.com/*"],
    files: [
      "src/shared/i18n.js",
      "src/shared/maskSensitiveText.js",
      "src/shared/filterLifeLogText.js",
      "src/content/adapters/chatgpt.js",
      "src/content/index.js"
    ]
  },
  {
    urlPatterns: ["https://claude.ai/*"],
    files: [
      "src/shared/i18n.js",
      "src/shared/maskSensitiveText.js",
      "src/shared/filterLifeLogText.js",
      "src/content/adapters/claude.js",
      "src/content/index.js"
    ]
  }
];
const DEFAULT_BROWSER_CAPTURE_SITE_SETTINGS = {
  discord: false,
  chatgpt: false,
  claude: false,
  youtube: false,
  reddit: false,
  genericWeb: false
};
const DEFAULT_LIFE_MINING_CAPTURE_SETTINGS = {
  enabled: false,
  target: "own_with_reply",
  scope: "new_only",
  contextMode: "previous_and_next",
  contextBeforeCount: 6,
  contextAfterCount: 2,
  maxMessageChars: 1500,
  longMessageMode: "truncate",
  filterLowSignalTargets: true,
  dedupeEnabled: true
};

let flushPromise = null;
let pairingPromise = null;
let privacyQueueBarrierState = null;
let privacyQueueBarrierLoadPromise = null;
const runQueueMutation = createAsyncMutationQueue();
const runPrivacySettingsMutation = createAsyncMutationQueue();
const recentCaptures = new Map();
const recentCardCaptures = new Map();
const recentYoutubeWatchCaptures = new Map();

class BridgeHttpError extends Error {
  constructor(status, body) {
    super(
      body?.error ||
        t(
          "bridgeRequestFailedStatus",
          "The local app bridge returned status $1.",
          String(status)
        )
    );
    this.name = "BridgeHttpError";
    this.status = status;
    this.body = body;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("life-miner-flush", { periodInMinutes: 1 });
  void syncBridgeAndFlushQueue();
  void injectLifeMinerContentScriptsIntoOpenTabs();
});

chrome.runtime.onStartup.addListener(() => {
  void syncBridgeAndFlushQueue();
  void injectLifeMinerContentScriptsIntoOpenTabs();
});

void injectLifeMinerContentScriptsIntoOpenTabs();

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "life-miner-flush") {
    void syncBridgeAndFlushQueue();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "LEM_LIFE_LOG_CAPTURE") {
    void handleCapture(message.payload)
      .then((result) => sendResponse(result))
      .catch(() =>
        sendResponse({
          ok: false,
          queued: false
        })
      );
    return true;
  }

  if (message?.type === "LEM_SENTENCE_CARD_CAPTURE") {
    void handleSentenceCardCapture(message.payload)
      .then((result) => sendResponse(result))
      .catch(() =>
        sendResponse({
          ok: false,
          queued: false
        })
      );
    return true;
  }

  if (message?.type === "LEM_GET_BRIDGE_SETTINGS") {
    void getBridgeSettings()
      .then((result) => sendResponse(result))
      .catch(() =>
        sendResponse({
          ok: false,
          browserCaptureSiteSettings: DEFAULT_BROWSER_CAPTURE_SITE_SETTINGS,
          browserSelectionCardMode: "preview"
        })
      );
    return true;
  }

  if (message?.type === "LEM_TRANSLATE_TEXT") {
    void postTranslate(message.payload)
      .then((result) => sendResponse(result))
      .catch(() =>
        sendResponse({
          ok: false
        })
      );
    return true;
  }

  if (message?.type === "LEM_YOUTUBE_WATCH_CAPTURE") {
    void handleYoutubeWatchCapture(message.payload)
      .then((result) => sendResponse(result))
      .catch(() =>
        sendResponse({
          ok: false,
          queued: false
        })
      );
    return true;
  }

  if (message?.type === "LEM_GET_QUEUE_STATUS") {
    void getBridgeSettings()
      .then(() => getQueueStatus())
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type === "LEM_CLEAR_PENDING_QUEUES") {
    void clearPendingQueues()
      .then(async (summary) => {
        const bridgeResult = await getBridgeSettings(summary);
        sendResponse({
          ok: true,
          ...summary,
          appAcknowledged: bridgeResult.extensionQueueAcknowledged === true
        });
      })
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  return false;
});

async function handleCapture(payload) {
  const privacyEpoch = await beginPrivacyQueueWrite();
  if (privacyEpoch === null) return getPrivacyBlockedResult();
  if (!payload?.text || isRecentDuplicate(payload)) {
    return { ok: true, duplicate: true };
  }

  await flushQueue(privacyEpoch);
  if (!(await isPrivacyQueueWriteStillAllowed(privacyEpoch))) {
    return getPrivacyBlockedResult();
  }
  try {
    const result = await postJson(LIFE_LOG_BRIDGE_URL, payload);
    if (shouldRetryLifeLogWithoutStructuredMetadata(payload, result)) {
      if (!(await isPrivacyQueueWriteStillAllowed(privacyEpoch))) {
        return getPrivacyBlockedResult();
      }
      return await postLegacyLifeLogCapture(payload);
    }
    return result;
  } catch (error) {
    if (shouldRetryLifeLogWithoutStructuredMetadata(payload, error)) {
      try {
        if (!(await isPrivacyQueueWriteStillAllowed(privacyEpoch))) {
          return getPrivacyBlockedResult();
        }
        return await postLegacyLifeLogCapture(payload);
      } catch {
        // Queue the original structured payload so a newer bridge can preserve it later.
      }
    }
    const queued = await enqueuePayload(QUEUE_KEY, payload, getCaptureKey, privacyEpoch);
    return queued ? { ok: true, queued: true } : getPrivacyBlockedResult();
  }
}

async function handleSentenceCardCapture(payload) {
  const privacyEpoch = await beginPrivacyQueueWrite();
  if (privacyEpoch === null) return getPrivacyBlockedResult();
  if (!payload?.selectedText) {
    return { ok: true, duplicate: true };
  }
  if (payload.action !== "preview" && isRecentDuplicateCard(payload)) {
    return { ok: true, duplicate: true };
  }

  await flushQueue(privacyEpoch);
  if (!(await isPrivacyQueueWriteStillAllowed(privacyEpoch))) {
    return getPrivacyBlockedResult();
  }
  try {
    return await postJson(SENTENCE_CARD_BRIDGE_URL, payload);
  } catch {
    if (!(await isPrivacyQueueWriteStillAllowed(privacyEpoch))) {
      return getPrivacyBlockedResult();
    }
    if (payload?.action === "preview") {
      return {
        ok: false,
        queued: false,
        error: t(
          "appRequiredForPreview",
          "Open Language Miner to view the generated card."
        )
      };
    }
    const queued = await enqueuePayload(CARD_QUEUE_KEY, payload, getSentenceCardKey, privacyEpoch);
    return queued ? { ok: true, queued: true } : getPrivacyBlockedResult();
  }
}

async function handleYoutubeWatchCapture(payload) {
  const privacyEpoch = await beginPrivacyQueueWrite();
  if (privacyEpoch === null) return getPrivacyBlockedResult();
  if (!payload?.videoId || !payload?.title || isRecentDuplicateYoutubeWatch(payload)) {
    return { ok: true, duplicate: true };
  }

  await flushQueue(privacyEpoch);
  if (!(await isPrivacyQueueWriteStillAllowed(privacyEpoch))) {
    return getPrivacyBlockedResult();
  }
  try {
    return await postJson(YOUTUBE_WATCH_BRIDGE_URL, payload);
  } catch {
    const queued = await enqueuePayload(
      YOUTUBE_WATCH_QUEUE_KEY,
      payload,
      getYoutubeWatchKey,
      privacyEpoch
    );
    return queued ? { ok: true, queued: true } : getPrivacyBlockedResult();
  }
}

async function flushQueue(expectedPrivacyEpoch) {
  if (flushPromise) {
    return flushPromise;
  }

  flushPromise = (async () => {
    await flushPayloadQueue(QUEUE_KEY, LIFE_LOG_BRIDGE_URL, expectedPrivacyEpoch);
    await flushPayloadQueue(CARD_QUEUE_KEY, SENTENCE_CARD_BRIDGE_URL, expectedPrivacyEpoch);
    await flushPayloadQueue(
      YOUTUBE_WATCH_QUEUE_KEY,
      YOUTUBE_WATCH_BRIDGE_URL,
      expectedPrivacyEpoch
    );
  })().finally(() => {
    flushPromise = null;
  });

  return flushPromise;
}

async function syncBridgeAndFlushQueue() {
  const settings = await getBridgeSettings();
  if (settings.privacyBlocked === true) return;
  const privacyEpoch = await beginPrivacyQueueWrite();
  if (privacyEpoch === null) return;
  await flushQueue(privacyEpoch);
}

async function flushPayloadQueue(queueKey, bridgeUrl, expectedPrivacyEpoch) {
  return runQueueMutation(async () => {
    if (!(await isPrivacyQueueWriteStillAllowed(expectedPrivacyEpoch))) return;
    const queue = await readQueueUnlocked(queueKey);
    if (queue.length === 0) {
      return;
    }

    const remaining = [];
    for (const item of queue) {
      try {
        const result = await postJson(bridgeUrl, item.payload);
        if (shouldRetainQueuedBridgeItem(result)) {
          remaining.push(item);
        }
      } catch {
        remaining.push(item);
      }
    }
    await writeQueueUnlocked(queueKey, remaining.slice(-MAX_QUEUE_SIZE));
  });
}

async function postTranslate(payload) {
  const privacyEpoch = await beginPrivacyQueueWrite();
  if (privacyEpoch === null) return getPrivacyBlockedResult();
  return postJson(TRANSLATE_BRIDGE_URL, payload);
}

async function getBridgeSettings(queueClearSummary) {
  try {
    if (!(await getStoredBridgeToken())) {
      await pairBridge();
    }
    await retryPendingPrivacyQueueBarrierReleaseAcknowledgement();
    const result = await getJson(SETTINGS_BRIDGE_URL);
    if (result?.ok) {
      const releaseRequestId = isPrivacyQueueClearRequestId(
        result.extensionQueueBarrierReleaseRequestId
      )
        ? result.extensionQueueBarrierReleaseRequestId
        : null;
      const barrierReleaseHandled = releaseRequestId
        ? await releasePrivacyQueueBarrierFromAuthenticatedSettings(releaseRequestId)
        : false;
      if (barrierReleaseHandled) {
        await retryPendingPrivacyQueueBarrierReleaseAcknowledgement();
      }

      let currentBarrier = await getPrivacyQueueBarrierState();
      const clearRequestId = isPrivacyQueueClearRequestId(
        result.extensionQueueClearRequestId
      )
        ? result.extensionQueueClearRequestId
        : null;
      const shouldHandleClearRequest = shouldHandlePrivacyQueueClearRequest(
        currentBarrier,
        clearRequestId,
        releaseRequestId
      );
      const extensionQueueAcknowledged = shouldHandleClearRequest
        ? await handleExtensionQueueClearCommand(clearRequestId, queueClearSummary)
        : false;
      if (shouldHandleClearRequest) {
        currentBarrier = await getPrivacyQueueBarrierState();
      }
      if (currentBarrier.active) {
        return await getPrivacyBlockedBridgeSettings(
          extensionQueueAcknowledged || currentBarrier.acknowledged
        );
      }
      const settings = {
        browserCaptureSiteSettings: normalizeBrowserCaptureSiteSettings(
          result.browserCaptureSiteSettings
        ),
        browserSelectionCardMode:
          result.browserSelectionCardMode === "autoSave" ? "autoSave" : "preview",
        browserCardProvider: result.browserCardProvider || null,
        bridgeToken: await getStoredBridgeToken(),
        lifeMiningCaptureSettings: normalizeLifeMiningCaptureSettings(
          result.lifeMiningCaptureSettings
        ),
        bridgeTokenRequired: result.bridgeTokenRequired === true
      };
      const persisted = await persistBridgeSettingsIfPrivacyAllowed(settings);
      if (!persisted) {
        return await getPrivacyBlockedBridgeSettings(extensionQueueAcknowledged);
      }
      return {
        ok: true,
        extensionQueueAcknowledged,
        privacyBlocked: false,
        ...getPublicBridgeSettings(settings)
      };
    }
  } catch {
    // Fall back to the last known bridge setting below.
  }

  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const settings = stored[SETTINGS_KEY] || {};
  const currentBarrier = await getPrivacyQueueBarrierState();
  if (currentBarrier.active) {
    return getPrivacyBlockedBridgeSettingsFromStored(
      settings,
      currentBarrier.acknowledged
    );
  }
  return {
    ok: false,
    extensionQueueAcknowledged: false,
    privacyBlocked: false,
    ...getPublicBridgeSettings(settings)
  };
}

async function getPrivacyBlockedBridgeSettings(extensionQueueAcknowledged) {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return getPrivacyBlockedBridgeSettingsFromStored(
    stored[SETTINGS_KEY] || {},
    extensionQueueAcknowledged
  );
}

function getPrivacyBlockedBridgeSettingsFromStored(settings, extensionQueueAcknowledged) {
  return {
    ok: true,
    extensionQueueAcknowledged,
    privacyBlocked: true,
    ...getPublicBridgeSettings(createPrivacyDisabledBridgeSettings(settings))
  };
}

async function persistBridgeSettingsIfPrivacyAllowed(settings) {
  return runPrivacySettingsMutation(async () => {
    const barrier = await getPrivacyQueueBarrierState();
    if (barrier.active) return false;
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
    return true;
  });
}

function getPublicBridgeSettings(settings = {}) {
  return {
    browserCaptureSiteSettings: normalizeBrowserCaptureSiteSettings(
      settings.browserCaptureSiteSettings
    ),
    browserSelectionCardMode:
      settings.browserSelectionCardMode === "autoSave" ? "autoSave" : "preview",
    browserCardProvider: settings.browserCardProvider || null,
    lifeMiningEnabled:
      settings.lifeMiningCaptureSettings?.enabled === true || settings.lifeMiningEnabled === true,
    lifeMiningCaptureSettings: normalizeLifeMiningCaptureSettings({
      ...(settings.lifeMiningCaptureSettings || {}),
      enabled:
        settings.lifeMiningCaptureSettings?.enabled === true || settings.lifeMiningEnabled === true
    }),
    bridgeTokenRequired: settings.bridgeTokenRequired === true
  };
}

function normalizeBrowserCaptureSiteSettings(settings = {}) {
  return {
    discord: settings.discord === true,
    chatgpt: settings.chatgpt === true,
    claude: settings.claude === true,
    youtube: settings.youtube === true,
    reddit: settings.reddit === true,
    genericWeb: settings.genericWeb === true
  };
}

function createPrivacyDisabledBridgeSettings(settings = {}) {
  return {
    browserCaptureSiteSettings: { ...DEFAULT_BROWSER_CAPTURE_SITE_SETTINGS },
    browserSelectionCardMode: "preview",
    browserCardProvider: null,
    lifeMiningEnabled: false,
    lifeMiningCaptureSettings: { ...DEFAULT_LIFE_MINING_CAPTURE_SETTINGS },
    bridgeTokenRequired: settings.bridgeTokenRequired === true
  };
}

function normalizeLifeMiningCaptureSettings(settings = {}) {
  const contextModes = new Set([
    "none",
    "previous_1",
    "previous_2",
    "previous_and_next",
    "recent"
  ]);
  const targets = new Set(["own", "own_with_reply", "all"]);
  const scopes = new Set(["new_only", "visible", "recent", "manual_all"]);
  const longMessageModes = new Set(["truncate", "summarize", "skip"]);
  return {
    enabled: settings.enabled === true,
    target: targets.has(settings.target)
      ? settings.target
      : DEFAULT_LIFE_MINING_CAPTURE_SETTINGS.target,
    scope: scopes.has(settings.scope)
      ? settings.scope
      : DEFAULT_LIFE_MINING_CAPTURE_SETTINGS.scope,
    contextMode: contextModes.has(settings.contextMode)
      ? settings.contextMode
      : DEFAULT_LIFE_MINING_CAPTURE_SETTINGS.contextMode,
    contextBeforeCount: clampNumber(settings.contextBeforeCount, 0, 20, 6),
    contextAfterCount: clampNumber(settings.contextAfterCount, 0, 10, 2),
    maxMessageChars: clampNumber(settings.maxMessageChars, 300, 6000, 1500),
    longMessageMode: longMessageModes.has(settings.longMessageMode)
      ? settings.longMessageMode
      : DEFAULT_LIFE_MINING_CAPTURE_SETTINGS.longMessageMode,
    filterLowSignalTargets: settings.filterLowSignalTargets !== false,
    dedupeEnabled: settings.dedupeEnabled !== false
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
}

async function getJson(url) {
  let response = await fetchBridge(url, {
    method: "GET",
    headers: await getBridgeHeaders()
  });
  let body = await response.json().catch(() => ({}));
  if (shouldRepairBridgeAuthentication(response.status, body)) {
    await pairBridge();
    response = await fetchBridge(url, {
      method: "GET",
      headers: await getBridgeHeaders()
    });
    body = await response.json().catch(() => ({}));
  }
  if (!response.ok) {
    throw new BridgeHttpError(response.status, body);
  }
  return body;
}

async function injectLifeMinerContentScriptsIntoOpenTabs() {
  if (!chrome.tabs?.query || !chrome.scripting?.executeScript) {
    return;
  }

  for (const target of MESSAGE_CONTENT_SCRIPT_TARGETS) {
    let tabs = [];
    try {
      tabs = await chrome.tabs.query({ url: target.urlPatterns });
    } catch {
      continue;
    }

    for (const tab of tabs) {
      if (!Number.isInteger(tab.id)) {
        continue;
      }
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: target.files
        });
      } catch {
        // The tab may be loading, discarded, or on a restricted browser page.
      }
    }
  }
}

async function postJson(url, payload) {
  let response = await fetchBridge(url, {
    method: "POST",
    headers: await getBridgeHeaders({ json: true }),
    body: JSON.stringify(payload)
  });
  let body = await response.json().catch(() => ({}));

  if (shouldRepairBridgeAuthentication(response.status, body)) {
    await pairBridge();
    response = await fetchBridge(url, {
      method: "POST",
      headers: await getBridgeHeaders({ json: true }),
      body: JSON.stringify(payload)
    });
    body = await response.json().catch(() => ({}));
  }

  if (!response.ok) {
    throw new BridgeHttpError(response.status, body);
  }
  return body;
}

async function pairBridge() {
  if (pairingPromise) {
    return pairingPromise;
  }
  pairingPromise = pairBridgeOnce().finally(() => {
    pairingPromise = null;
  });
  return pairingPromise;
}

async function pairBridgeOnce() {
  const bridgeToken = await requestBridgePairingToken();
  return runPrivacySettingsMutation(async () => {
    const privacyBarrier = await getPrivacyQueueBarrierState();
    const stored = await chrome.storage.local.get(SETTINGS_KEY);
    const settings = privacyBarrier.active
      ? createPrivacyDisabledBridgeSettings(stored[SETTINGS_KEY] || {})
      : { ...(stored[SETTINGS_KEY] || {}) };
    await chrome.storage.local.set({
      [SETTINGS_KEY]: {
        ...settings,
        bridgeToken,
        bridgeTokenRequired: true
      }
    });
    return true;
  });
}

async function requestBridgePairingToken() {
  const response = await fetchBridge(PAIR_BRIDGE_URL, {
    method: "POST",
    headers: {
      "X-Local-English-Miner": BRIDGE_EXTENSION_HEADER,
      "Content-Type": "application/json"
    },
    body: "{}"
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.bridgeToken !== "string" || !body.bridgeToken) {
    throw new BridgeHttpError(response.status, body);
  }
  return body.bridgeToken;
}

async function fetchBridge(url, init = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BRIDGE_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(t("bridgeRequestTimedOut", "Language Miner connection timed out. Open the app and try again."));
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getBridgeHeaders(options = {}) {
  const headers = {
    "X-Local-English-Miner": BRIDGE_EXTENSION_HEADER
  };
  if (options.json) {
    headers["Content-Type"] = "application/json";
  }

  const token = await getStoredBridgeToken();
  if (token) {
    headers["X-Local-English-Miner-Token"] = token;
  }
  return headers;
}

async function getStoredBridgeToken() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const token = stored[SETTINGS_KEY]?.bridgeToken;
  return typeof token === "string" ? token : "";
}

async function postLegacyLifeLogCapture(payload) {
  const result = await postJson(LIFE_LOG_BRIDGE_URL, toLegacyLifeLogPayload(payload));
  return {
    ...result,
    legacyMetadataFallback: true
  };
}

function shouldRetryLifeLogWithoutStructuredMetadata(payload, resultOrError) {
  if (!hasStructuredLifeLogMessages(payload)) {
    return false;
  }

  const status = resultOrError?.status;
  const error = String(
    resultOrError?.error ||
      resultOrError?.message ||
      resultOrError?.body?.error ||
      ""
  );
  return status === 413 || error.includes("text.replace is not a function");
}

function hasStructuredLifeLogMessages(payload) {
  return Array.isArray(payload?.metadata?.messages) && payload.metadata.messages.length > 0;
}

function toLegacyLifeLogPayload(payload) {
  const metadata = {};
  for (const [key, value] of Object.entries(payload?.metadata || {})) {
    if (key === "messages") {
      continue;
    }
    if (typeof value === "string" && value.trim()) {
      metadata[key] = value;
    }
  }

  return {
    ...payload,
    metadata: Object.keys(metadata).length
      ? {
          ...metadata,
          legacyMetadataFallback: "true"
        }
      : {
          legacyMetadataFallback: "true"
        }
  };
}

async function enqueuePayload(
  queueKey,
  payload,
  getKey = getCaptureKey,
  expectedPrivacyEpoch
) {
  return runQueueMutation(async () => {
    if (!(await isPrivacyQueueWriteStillAllowed(expectedPrivacyEpoch))) return false;
    const queue = await readQueueUnlocked(queueKey);
    const key = getKey(payload);
    const withoutDuplicate = queue.filter((queued) => getKey(queued.payload) !== key);
    await writeQueueUnlocked(queueKey, [...withoutDuplicate, createPayloadQueueItem(payload)]);
    return true;
  });
}

async function readQueueUnlocked(queueKey) {
  const result = await chrome.storage.local.get(queueKey);
  const compacted = compactPayloadQueue(result[queueKey], getQueueLimits());
  if (JSON.stringify(compacted) !== JSON.stringify(result[queueKey] || [])) {
    await chrome.storage.local.set({ [queueKey]: compacted });
  }
  return compacted;
}

async function writeQueueUnlocked(queueKey, queue) {
  const stored = await chrome.storage.local.get(QUEUE_KEYS);
  const next = compactPayloadQueueMap(
    Object.fromEntries(
      QUEUE_KEYS.map((key) => [key, key === queueKey ? queue : stored[key]])
    ),
    getQueueLimits()
  );
  await chrome.storage.local.set(next);
}

async function getQueueStatus() {
  return runQueueMutation(async () => {
    const stored = await chrome.storage.local.get(QUEUE_KEYS);
    const compacted = compactPayloadQueueMap(
      Object.fromEntries(QUEUE_KEYS.map((key) => [key, stored[key]])),
      getQueueLimits()
    );
    await chrome.storage.local.set(compacted);
    return summarizePayloadQueueMap(compacted);
  });
}

async function clearPendingQueues() {
  return runQueueMutation(async () => {
    const before = await summarizeStoredQueuesUnlocked();
    await chrome.storage.local.remove(QUEUE_KEYS);
    const after = await summarizeStoredQueuesUnlocked();
    return {
      removedItems: Math.max(0, before.totalCount - after.totalCount),
      remainingItems: after.totalCount
    };
  });
}

async function summarizeStoredQueuesUnlocked() {
  const stored = await chrome.storage.local.get(QUEUE_KEYS);
  const compacted = compactPayloadQueueMap(
    Object.fromEntries(QUEUE_KEYS.map((key) => [key, stored[key]])),
    getQueueLimits()
  );
  return summarizePayloadQueueMap(compacted);
}

async function handleExtensionQueueClearCommand(requestId, existingSummary) {
  if (!isPrivacyQueueClearRequestId(requestId)) return false;
  const summary = await activatePrivacyQueueBarrierAndClearQueues(
    requestId,
    existingSummary
  );
  const acknowledgement = createPrivacyQueueClearAcknowledgement(requestId, summary);
  if (!acknowledgement) return false;
  await postJson(PRIVACY_QUEUE_ACK_BRIDGE_URL, acknowledgement);
  await acknowledgeAndScrubPrivacyQueueBarrier(requestId);
  return true;
}

async function activatePrivacyQueueBarrierAndClearQueues(requestId, existingSummary) {
  return runQueueMutation(async () => {
    const storedQueues = await chrome.storage.local.get(QUEUE_KEYS);
    const next = await runPrivacySettingsMutation(async () => {
      const current = await getPrivacyQueueBarrierState();
      const stored = await chrome.storage.local.get(SETTINGS_KEY);
      const storedSettings = stored[SETTINGS_KEY] || {};
      const bridgeToken = typeof storedSettings.bridgeToken === "string"
        ? storedSettings.bridgeToken
        : "";
      const activated = activatePrivacyQueueBarrier(current, requestId, {
        now: Date.now()
      });
      if (!activated) return null;

      const disabledSettings = createPrivacyDisabledBridgeSettings(storedSettings);
      if (bridgeToken) {
        disabledSettings.bridgeToken = bridgeToken;
      }
      privacyQueueBarrierState = activated;
      await chrome.storage.local.set({
        [PRIVACY_QUEUE_BARRIER_STORAGE_KEY]: activated,
        [SETTINGS_KEY]: disabledSettings
      });
      return activated;
    });
    if (!next) {
      return { removedItems: 0, remainingItems: 0 };
    }

    const before = summarizePayloadQueueMap(
      Object.fromEntries(QUEUE_KEYS.map((key) => [key, storedQueues[key]]))
    );
    await chrome.storage.local.remove(QUEUE_KEYS);
    const after = await summarizeStoredQueuesUnlocked();
    clearRecentCaptureMemory();
    const previouslyRemoved = Number.isSafeInteger(existingSummary?.removedItems)
      ? Math.max(0, existingSummary.removedItems)
      : 0;
    return {
      removedItems: Math.min(
        10_000,
        previouslyRemoved + Math.max(0, before.totalCount - after.totalCount)
      ),
      remainingItems: after.totalCount
    };
  });
}

async function acknowledgeAndScrubPrivacyQueueBarrier(requestId) {
  return runQueueMutation(async () => {
    return runPrivacySettingsMutation(async () => {
      const current = await getPrivacyQueueBarrierState();
      const next = acknowledgePrivacyQueueBarrier(current, requestId);
      if (!next.active || !next.acknowledged) return false;
      const stored = await chrome.storage.local.get(SETTINGS_KEY);
      privacyQueueBarrierState = next;
      await chrome.storage.local.set({
        [PRIVACY_QUEUE_BARRIER_STORAGE_KEY]: next,
        [SETTINGS_KEY]: createPrivacyDisabledBridgeSettings(stored[SETTINGS_KEY] || {})
      });
      return true;
    });
  });
}

async function getPrivacyQueueBarrierState() {
  if (privacyQueueBarrierState) return privacyQueueBarrierState;
  if (!privacyQueueBarrierLoadPromise) {
    privacyQueueBarrierLoadPromise = chrome.storage.local
      .get(PRIVACY_QUEUE_BARRIER_STORAGE_KEY)
      .then((stored) => {
        if (!privacyQueueBarrierState) {
          privacyQueueBarrierState = normalizePrivacyQueueBarrierState(
            stored[PRIVACY_QUEUE_BARRIER_STORAGE_KEY]
          );
        }
        return privacyQueueBarrierState;
      })
      .finally(() => {
        privacyQueueBarrierLoadPromise = null;
      });
  }
  return privacyQueueBarrierLoadPromise;
}

async function beginPrivacyQueueWrite() {
  return getPrivacyQueueWriteEpoch(await getPrivacyQueueBarrierState());
}

async function isPrivacyQueueWriteStillAllowed(expectedPrivacyEpoch) {
  return isPrivacyQueueWriteEpochCurrent(
    await getPrivacyQueueBarrierState(),
    expectedPrivacyEpoch
  );
}

async function releasePrivacyQueueBarrierFromAuthenticatedSettings(requestId) {
  if (!isPrivacyQueueClearRequestId(requestId)) return false;
  return runQueueMutation(async () => {
    return runPrivacySettingsMutation(async () => {
      const latest = await getPrivacyQueueBarrierState();
      const releaseResult = await releasePrivacyQueueBarrierAndPersistAcknowledgement({
        currentValue: latest,
        requestId,
        persist: async (nextState, pendingAcknowledgement) => {
          const stored = await chrome.storage.local.get(
            PRIVACY_QUEUE_RELEASE_ACK_STORAGE_KEY
          );
          const pending = normalizePrivacyQueueBarrierReleaseAcknowledgements(
            stored[PRIVACY_QUEUE_RELEASE_ACK_STORAGE_KEY]
          ).filter((entry) => entry.requestId !== pendingAcknowledgement.requestId);
          pending.push(pendingAcknowledgement);
          await chrome.storage.local.set({
            [PRIVACY_QUEUE_BARRIER_STORAGE_KEY]: nextState,
            [PRIVACY_QUEUE_RELEASE_ACK_STORAGE_KEY]: {
              schemaVersion: 1,
              entries: pending
            }
          });
        }
      });
      privacyQueueBarrierState = releaseResult.state;
      return releaseResult.acknowledgementPersisted;
    });
  });
}

async function retryPendingPrivacyQueueBarrierReleaseAcknowledgement() {
  const stored = await chrome.storage.local.get(PRIVACY_QUEUE_RELEASE_ACK_STORAGE_KEY);
  const pending = normalizePrivacyQueueBarrierReleaseAcknowledgements(
    stored[PRIVACY_QUEUE_RELEASE_ACK_STORAGE_KEY]
  );
  let acknowledged = false;
  for (const entry of pending) {
    const result = await retryPrivacyQueueBarrierReleaseAcknowledgement({
      pendingValue: entry,
      postAcknowledgement: (payload) =>
        postJson(PRIVACY_QUEUE_RELEASE_ACK_BRIDGE_URL, payload),
      clearAcknowledgement: clearPendingPrivacyQueueBarrierReleaseAcknowledgement
    });
    acknowledged = acknowledged || result.acknowledged;
  }
  return acknowledged;
}

async function clearPendingPrivacyQueueBarrierReleaseAcknowledgement(requestId) {
  return runQueueMutation(async () => {
    return runPrivacySettingsMutation(async () => {
      const stored = await chrome.storage.local.get(PRIVACY_QUEUE_RELEASE_ACK_STORAGE_KEY);
      const pending = normalizePrivacyQueueBarrierReleaseAcknowledgements(
        stored[PRIVACY_QUEUE_RELEASE_ACK_STORAGE_KEY]
      );
      const matching = normalizePrivacyQueueBarrierReleaseAcknowledgement(
        pending.find((entry) => entry.requestId === requestId)
      );
      if (!matching) {
        throw new Error("Privacy barrier release acknowledgement is no longer pending.");
      }

      const remaining = pending.filter((entry) => entry.requestId !== requestId);
      if (remaining.length > 0) {
        await chrome.storage.local.set({
          [PRIVACY_QUEUE_RELEASE_ACK_STORAGE_KEY]: {
            schemaVersion: 1,
            entries: remaining
          }
        });
      } else {
        await chrome.storage.local.remove(PRIVACY_QUEUE_RELEASE_ACK_STORAGE_KEY);
      }
      const currentBarrier = await getPrivacyQueueBarrierState();
      if (!currentBarrier.active) {
        await chrome.storage.local.remove(PRIVACY_QUEUE_BARRIER_STORAGE_KEY);
      }
    });
  });
}

function clearRecentCaptureMemory() {
  recentCaptures.clear();
  recentCardCaptures.clear();
  recentYoutubeWatchCaptures.clear();
}

function getPrivacyBlockedResult() {
  return {
    ok: false,
    queued: false,
    privacyBlocked: true,
    error: t(
      "privacyDeletionInProgress",
      "Local data deletion is still finishing. Captures and queue writes are temporarily paused."
    )
  };
}

function getQueueLimits() {
  return {
    now: Date.now(),
    maxAgeMs: QUEUE_TTL_MS,
    maxItems: MAX_QUEUE_SIZE,
    maxItemBytes: MAX_QUEUE_ITEM_BYTES,
    maxBytes: MAX_QUEUE_BYTES,
    maxTotalBytes: MAX_TOTAL_QUEUE_BYTES
  };
}

function isRecentDuplicate(payload) {
  const now = Date.now();
  for (const [key, capturedAt] of recentCaptures.entries()) {
    if (now - capturedAt > DEDUPE_WINDOW_MS) {
      recentCaptures.delete(key);
    }
  }

  const key = getCaptureKey(payload);
  const previous = recentCaptures.get(key);
  recentCaptures.set(key, now);
  return previous !== undefined && now - previous < DEDUPE_WINDOW_MS;
}

function isRecentDuplicateCard(payload) {
  const now = Date.now();
  for (const [key, capturedAt] of recentCardCaptures.entries()) {
    if (now - capturedAt > DEDUPE_WINDOW_MS) {
      recentCardCaptures.delete(key);
    }
  }

  const key = getSentenceCardKey(payload);
  const previous = recentCardCaptures.get(key);
  recentCardCaptures.set(key, now);
  return previous !== undefined && now - previous < DEDUPE_WINDOW_MS;
}

function isRecentDuplicateYoutubeWatch(payload) {
  const now = Date.now();
  for (const [key, capturedAt] of recentYoutubeWatchCaptures.entries()) {
    if (now - capturedAt > DEDUPE_WINDOW_MS) {
      recentYoutubeWatchCaptures.delete(key);
    }
  }

  const key = getYoutubeWatchKey(payload);
  const previous = recentYoutubeWatchCaptures.get(key);
  recentYoutubeWatchCaptures.set(key, now);
  return previous !== undefined && now - previous < DEDUPE_WINDOW_MS;
}

function getCaptureKey(payload) {
  return [payload.appName || "", payload.text || "", payload.metadata?.url || ""].join("\u001f");
}

function getYoutubeWatchKey(payload) {
  return [
    payload?.sourceType || "youtube_extension",
    payload?.videoId || "",
    payload?.title || ""
  ].join("\u001f");
}

function getSentenceCardKey(payload) {
  return [
    payload.appName || "",
    payload.selectedText || "",
    payload.sourceSentence || "",
    payload.metadata?.url || ""
  ].join("\u001f");
}
import {
  compactPayloadQueue,
  compactPayloadQueueMap,
  createPayloadQueueItem,
  summarizePayloadQueueMap
} from "./queuePolicy.js";
