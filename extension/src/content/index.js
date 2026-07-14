(function setupLifeMinerContentScript(globalScope) {
  const READY_FLAG_KEY = "__LEM_LIFE_MINER_CONTENT_SCRIPT_READY__";
  const shared = globalScope.LifeMinerShared;
  const t =
    globalScope.LanguageMinerExtensionI18n?.t || ((_key, fallback = "") => fallback || _key);
  const adapters = globalScope.LifeMinerAdapters || [];
  const adapter = adapters.find((candidate) => candidate.matches());
  const recentCaptures = new Map();
  const DRAFT_CACHE_MAX_AGE_MS = 15_000;
  const DEBUG_FLAG_KEY = "LEM_LIFE_MINER_DEBUG";
  let isComposing = false;
  let lastEditable = null;
  let lastDraft = null;
  let siteEnabled = false;
  let captureSettings = getDefaultCaptureSettings();

  if (
    !shared ||
    !adapter ||
    typeof chrome === "undefined" ||
    !chrome.runtime?.sendMessage
  ) {
    return;
  }
  if (globalScope[READY_FLAG_KEY]) {
    return;
  }
  globalScope[READY_FLAG_KEY] = true;

  refreshSiteEnabled();
  window.setInterval(refreshSiteEnabled, 30_000);

  document.addEventListener(
    "compositionstart",
    () => {
      isComposing = true;
    },
    true
  );
  document.addEventListener(
    "compositionend",
    () => {
      isComposing = false;
    },
    true
  );
  document.addEventListener(
    "focusin",
    (event) => {
      if (adapter.isEditable(event.target)) {
        lastEditable = adapter.getInputFromEventTarget(event.target) || event.target;
        rememberDraft(lastEditable);
      }
    },
    true
  );
  document.addEventListener(
    "input",
    (event) => {
      if (!isComposing && adapter.isEditable(event.target)) {
        rememberDraft(adapter.getInputFromEventTarget(event.target) || event.target);
      }
    },
    true
  );
  document.addEventListener(
    "keyup",
    (event) => {
      if (!isComposing && !event.isComposing && adapter.isEditable(event.target)) {
        rememberDraft(adapter.getInputFromEventTarget(event.target) || event.target);
      }
    },
    true
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key !== "Enter" ||
        event.shiftKey ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.isComposing ||
        isComposing
      ) {
        return;
      }

      if (!adapter.isEditable(event.target) && !lastEditable) {
        return;
      }

      captureCurrentMessage("enter", event.target);
    },
    true
  );
  document.addEventListener(
    "submit",
    (event) => {
      if (event.isTrusted === false || isComposing) {
        return;
      }

      captureCurrentMessage("submit", event.target);
    },
    true
  );
  document.addEventListener(
    "click",
    (event) => {
      if (event.isTrusted === false || isComposing || !adapter.isSendButton(event.target)) {
        return;
      }

      captureCurrentMessage("send_button", event.target);
    },
    true
  );

  function captureCurrentMessage(trigger, eventTarget) {
    if (!siteEnabled || !isRuntimeAvailable()) {
      return;
    }

    const input =
      adapter.getInputFromEventTarget(eventTarget) ||
      adapter.findInputForSendButton(eventTarget) ||
      adapter.findActiveInput() ||
      lastEditable;
    const capturedText = getCurrentOrCachedText(input);
    const prepared = shared.prepareLifeLogText(capturedText, captureSettings);
    if (!prepared.accepted) {
      return;
    }

    const capturedAt = new Date().toISOString();
    const currentUserSpeaker =
      typeof adapter.getCurrentUserSpeaker === "function"
        ? normalizeSpeakerLabel(adapter.getCurrentUserSpeaker())
        : "";
    const beforeMessages = collectBeforeContextMessages(input, capturedText);
    const messages = [
      ...beforeMessages,
      {
        role: "user",
        speaker: t("speakerMe", "Me"),
        raw_content: prepared.text,
        timestamp: capturedAt
      }
    ];
    debugRawContentLengths("capture-before-send", messages);

    const payload = {
      text: prepared.text,
      beforeContext: formatCompatibilityContext(beforeMessages),
      appName: adapter.appName,
      metadata: {
        url: location.href,
        title: document.title,
        trigger,
        capturedAt,
        extensionVersion: getExtensionVersion(),
        messages,
        ...(currentUserSpeaker ? { currentUserSpeaker } : {}),
        ...(isDebugModeEnabled() ? { debugMode: true } : {})
      }
    };
    if (captureSettings.dedupeEnabled && isRecentDuplicate(payload)) {
      return;
    }

    sendRuntimeMessage(
      {
        type: "LEM_LIFE_LOG_CAPTURE",
        payload
      },
      (response) => {
        debugCaptureResponse(response);
      }
    );
  }

  function isRuntimeAvailable() {
    try {
      return Boolean(chrome?.runtime?.id && chrome.runtime.sendMessage);
    } catch {
      return false;
    }
  }

  function getExtensionVersion() {
    try {
      return chrome.runtime.getManifest().version;
    } catch {
      return "unknown";
    }
  }

  function refreshSiteEnabled() {
    if (!isRuntimeAvailable()) {
      return;
    }
    sendRuntimeMessage(
      {
        type: "LEM_GET_BRIDGE_SETTINGS"
      },
      (response) => {
        captureSettings = normalizeCaptureSettings(response?.lifeMiningCaptureSettings);
        siteEnabled =
          response?.lifeMiningEnabled === true &&
          captureSettings.enabled === true &&
          isMessageSiteEnabled(response?.browserCaptureSiteSettings);
      }
    );
  }

  function isMessageSiteEnabled(settings) {
    const key = getMessageSiteKey(adapter.appName);
    return settings?.[key] === true;
  }

  function getMessageSiteKey(appName) {
    const normalized = String(appName || "").toLowerCase();
    if (normalized.includes("discord")) {
      return "discord";
    }
    if (normalized.includes("chatgpt")) {
      return "chatgpt";
    }
    if (normalized.includes("claude")) {
      return "claude";
    }
    return "genericWeb";
  }

  function sendRuntimeMessage(message, callback) {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        try {
          // Reading lastError prevents noisy console output when the extension is reloaded.
          void chrome.runtime.lastError;
        } catch {
          // The extension was reloaded while this page still had the old content script.
        }
        callback?.(response);
      });
    } catch {
      // The extension context was invalidated. The next page reload injects the new script.
      callback?.({ ok: false });
    }
  }

  function rememberDraft(input) {
    const text = normalizeContextText(adapter.getText(input));
    if (!text) {
      return;
    }

    lastEditable = input || lastEditable;
    lastDraft = {
      input: input || null,
      text,
      capturedAt: Date.now()
    };
  }

  function getCurrentOrCachedText(input) {
    const currentText = normalizeContextText(adapter.getText(input));
    if (currentText) {
      rememberDraft(input);
      return currentText;
    }

    if (!lastDraft || Date.now() - lastDraft.capturedAt > DRAFT_CACHE_MAX_AGE_MS) {
      return "";
    }

    return lastDraft.text;
  }

  function isRecentDuplicate(payload) {
    const now = Date.now();
    for (const [key, capturedAt] of recentCaptures.entries()) {
      if (now - capturedAt > 5_000) {
        recentCaptures.delete(key);
      }
    }

    const key = [payload.appName, payload.text, location.origin].join("\u001f");
    const previous = recentCaptures.get(key);
    recentCaptures.set(key, now);
    return previous !== undefined && now - previous < 5_000;
  }

  function collectBeforeContextMessages(input, capturedText) {
    const configuredLimit = getBeforeContextLimit();
    if (configuredLimit <= 0) {
      return [];
    }
    if (typeof adapter.getBeforeContext === "function") {
      const rawContent = normalizeContextText(adapter.getBeforeContext(input));
      return rawContent
        ? [
            {
              role: "other",
              speaker: adapter.appName || t("speakerOther", "Other person"),
              raw_content: maskContextText(rawContent)
            }
          ]
        : [];
    }

    const selectors = adapter.contextSelectors || [
      "[data-message-author-role]",
      "article",
      '[role="listitem"]',
      "main p"
    ];
    const currentText = normalizeComparableContextText(capturedText || adapter.getText(input));
    const seen = new Set();
    const messages = [];
    let lastSpeaker = "";
    const blockLimit = configuredLimit;

    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        if (!(element instanceof HTMLElement)) {
          continue;
        }
        if (input && element.contains(input)) {
          continue;
        }
        if (!isVisible(element)) {
          continue;
        }

        const contextBlock =
          typeof adapter.getContextBlock === "function"
            ? adapter.getContextBlock(element)
            : { text: element.innerText || element.textContent || "" };
        const rawContent = normalizeContextText(
          contextBlock?.raw_content || contextBlock?.text || ""
        );
        if (
          !rawContent ||
          normalizeComparableContextText(rawContent) === currentText
        ) {
          continue;
        }
        const speaker = normalizeSpeakerLabel(contextBlock?.speaker || lastSpeaker);
        if (speaker) {
          lastSpeaker = speaker;
        }
        let role = normalizeMessageRole(contextBlock?.role);
        if (
          role !== "user" &&
          speaker &&
          typeof adapter.isOwnSpeaker === "function" &&
          adapter.isOwnSpeaker(speaker)
        ) {
          role = "user";
        }
        const maskedContent = maskContextText(rawContent);
        const dedupeKey = `${role}\u001f${speaker}\u001f${maskedContent}`;
        if (seen.has(dedupeKey)) {
          continue;
        }
        seen.add(dedupeKey);
        messages.push({
          role,
          speaker: speaker || defaultSpeakerForRole(role),
          raw_content: maskedContent,
          ...(contextBlock?.timestamp ? { timestamp: String(contextBlock.timestamp) } : {})
        });
      }
    }

    return messages.slice(-blockLimit);
  }

  function formatCompatibilityContext(messages) {
    if (!messages.length) {
      return undefined;
    }

    return limitContextText(
      messages
        .map((message) =>
          message.speaker ? `${message.speaker}: ${message.raw_content}` : message.raw_content
        )
        .join("\n")
    );
  }

  function maskContextText(value) {
    if (!value) {
      return undefined;
    }
    return shared.maskSensitiveText ? shared.maskSensitiveText(value) : value;
  }

  function normalizeContextText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n?/g, "\n")
      .trim();
  }

  function normalizeComparableContextText(value) {
    return normalizeContextText(value).replace(/\s+/g, " ").trim();
  }

  function normalizeSpeakerLabel(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[:\n\r]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40);
  }

  function limitContextText(value) {
    const normalized = normalizeContextText(value);
    const maxLength = Math.min(
      12_000,
      captureSettings.maxMessageChars * Math.max(1, getBeforeContextLimit())
    );
    if (normalized.length <= maxLength) {
      return normalized || undefined;
    }
    return `...${normalized.slice(normalized.length - maxLength)}`;
  }

  function getBeforeContextLimit() {
    if (captureSettings.target === "own" || captureSettings.contextMode === "none") return 0;
    if (captureSettings.contextMode === "previous_1") return 1;
    if (captureSettings.contextMode === "previous_2") return 2;
    return captureSettings.contextBeforeCount;
  }

  function getDefaultCaptureSettings() {
    return {
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
  }

  function normalizeCaptureSettings(value) {
    const fallback = getDefaultCaptureSettings();
    const settings = value && typeof value === "object" ? value : {};
    const contextModes = ["none", "previous_1", "previous_2", "previous_and_next", "recent"];
    const targets = ["own", "own_with_reply", "all"];
    const longMessageModes = ["truncate", "summarize", "skip"];
    return {
      ...fallback,
      enabled: settings.enabled === true,
      target: targets.includes(settings.target) ? settings.target : fallback.target,
      contextMode: contextModes.includes(settings.contextMode)
        ? settings.contextMode
        : fallback.contextMode,
      contextBeforeCount: clampNumber(settings.contextBeforeCount, 0, 20, 6),
      contextAfterCount: clampNumber(settings.contextAfterCount, 0, 10, 2),
      maxMessageChars: clampNumber(settings.maxMessageChars, 300, 6000, 1500),
      longMessageMode: longMessageModes.includes(settings.longMessageMode)
        ? settings.longMessageMode
        : fallback.longMessageMode,
      filterLowSignalTargets: settings.filterLowSignalTargets !== false,
      dedupeEnabled: settings.dedupeEnabled !== false
    };
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
  }

  function normalizeMessageRole(value) {
    const normalized = String(value || "").toLowerCase().trim();
    return ["user", "assistant", "other", "system"].includes(normalized) ? normalized : "other";
  }

  function defaultSpeakerForRole(role) {
    if (role === "user") {
      return t("speakerMe", "Me");
    }
    if (role === "assistant") {
      return adapter.appName || "Assistant";
    }
    if (role === "system") {
      return "System";
    }
    return t("speakerOther", "Other person");
  }

  function isDebugModeEnabled() {
    try {
      return (
        globalScope.__LEM_LIFE_MINER_DEBUG__ === true ||
        globalScope.localStorage?.getItem(DEBUG_FLAG_KEY) === "1"
      );
    } catch {
      return false;
    }
  }

  function debugRawContentLengths(label, messages) {
    if (!isDebugModeEnabled()) {
      return;
    }
    const lengths = messages.map((message, index) => ({
      index,
      length: message.raw_content.length
    }));
    console.info("[LifeMiner]", label, lengths);
  }

  function debugCaptureResponse(response) {
    if (!isDebugModeEnabled()) {
      return;
    }
    const method = response?.ok && !response?.queued ? "info" : "warn";
    console[method]("[LifeMiner] capture response", {
      ok: response?.ok === true,
      queued: response?.queued === true,
      duplicate: response?.duplicate === true,
      skipped: response?.skipped === true
    });
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none"
    );
  }
})(globalThis);
