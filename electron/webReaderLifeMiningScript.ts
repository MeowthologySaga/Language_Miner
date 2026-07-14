import type { LifeMiningCaptureSettings, WebReaderLifeMiningState } from "../src/shared/types";

export function buildWebReaderLifeMiningScript(
  state: WebReaderLifeMiningState,
  input: { shortcut: string; captureSettings: LifeMiningCaptureSettings }
) {
  const config = {
    enabled: state.enabled,
    siteKey: state.siteKey ?? "unsupported",
    mode: state.mode,
    shortcut: input.shortcut || "Ctrl+Q",
    captureSettings: input.captureSettings
  };
  return `
(() => {
  const config = ${JSON.stringify(config)};
  const previous = window.__LEM_WEB_READER_LIFE_MINER;
  let queue = [];
  let capturedKeys = [];
  let recentSentMessages = [];
  if (previous && typeof previous.consumeCaptures === "function") {
    try {
      const previousQueue = previous.consumeCaptures();
      if (Array.isArray(previousQueue)) {
        queue = previousQueue;
      }
    } catch {}
  }
  if (previous && typeof previous.getCapturedKeys === "function") {
    try {
      const previousKeys = previous.getCapturedKeys();
      if (Array.isArray(previousKeys)) {
        capturedKeys = previousKeys;
      }
    } catch {}
  }
  if (previous && typeof previous.getRecentSentMessages === "function") {
    try {
      const previousRecentSentMessages = previous.getRecentSentMessages();
      if (Array.isArray(previousRecentSentMessages)) {
        recentSentMessages = previousRecentSentMessages;
      }
    } catch {}
  }
  if (previous && typeof previous.destroy === "function") {
    try { previous.destroy(); } catch {}
  }

  const listeners = [];
  let lastEditableText = "";
  let lastEditableAt = 0;
  let lastQueuedSignature = "";
  let seenCaptureKeys = new Set(capturedKeys);
  let mutationObserver = null;
  let mutationCaptureTimer = 0;
  const captureSettings = {
    preset: "balanced",
    target: "own_with_reply",
    scope: "new_only",
    contextMode: "previous_and_next",
    contextBeforeCount: 6,
    contextAfterCount: 2,
    maxMessageChars: 1500,
    longMessageMode: "truncate",
    filterLowSignalTargets: true,
    dedupeEnabled: true,
    ...(config.captureSettings || {})
  };

  function normalizeText(value) {
    return String(value || "")
      .replace(/[\\u200b\\u200c\\u200d\\ufeff]/g, "")
      .replace(/\\u00a0/g, " ")
      .replace(/\\s+/g, " ")
      .trim();
  }

  function normalizeForKey(value) {
    return normalizeText(value).toLowerCase().slice(0, 1800);
  }

  function getMaxMessageChars() {
    const max = Number(captureSettings.maxMessageChars);
    return Number.isFinite(max) ? Math.max(300, Math.min(6000, Math.round(max))) : 1500;
  }

  function getContextBeforeCount() {
    const count = Number(captureSettings.contextBeforeCount);
    return Number.isFinite(count) ? Math.max(0, Math.min(20, Math.round(count))) : 6;
  }

  function getContextAfterCount() {
    const count = Number(captureSettings.contextAfterCount);
    return Number.isFinite(count) ? Math.max(0, Math.min(10, Math.round(count))) : 2;
  }

  function getVisibleMessageLimit() {
    return Math.max(12, getContextBeforeCount() + getContextAfterCount() + 6);
  }

  function limitMessageText(text) {
    const normalized = normalizeMessageText(text);
    if (!normalized) {
      return "";
    }
    const max = getMaxMessageChars();
    if (normalized.length <= max) {
      return normalized;
    }
    if (captureSettings.longMessageMode === "skip") {
      return "";
    }
    return normalized.slice(0, max).trim() + " ...";
  }

  function formatContextMessages(messages) {
    return messages
      .map((message) => {
        const speaker = message.role === "user" ? "Me" : message.speaker || defaultSpeakerForRole(message.role);
        return normalizeText(speaker ? speaker + ": " + message.raw_content : message.raw_content);
      })
      .filter(Boolean)
      .join("\\n");
  }

  function normalizeCaptureMessage(message) {
    if (!message) {
      return message;
    }
    return {
      ...message,
      speaker: message.role === "user" ? "Me" : message.speaker || defaultSpeakerForRole(message.role)
    };
  }

  function rememberRecentSentMessage(text) {
    const raw = limitMessageText(text);
    if (!raw) {
      return null;
    }
    const message = {
      role: "user",
      speaker: "Me",
      raw_content: raw,
      timestamp: new Date().toISOString()
    };
    const key = normalizeForKey(raw);
    recentSentMessages = recentSentMessages
      .filter((item) => normalizeForKey(item?.raw_content || "") !== key)
      .concat(message)
      .slice(-24);
    return message;
  }

  function withRecentSentMessages(messages, currentMessage) {
    if (config.siteKey !== "discord") {
      return [...messages, currentMessage];
    }
    const visibleTail = messages.slice(-4);
    if (visibleTail.some((message) => message.role !== "user")) {
      return [...messages, currentMessage];
    }
    const visibleKeys = new Set(messages.map((message) => normalizeForKey(message?.raw_content || "")));
    const missingRecentSentMessages = recentSentMessages.filter((message) => {
      const key = normalizeForKey(message?.raw_content || "");
      return key && !visibleKeys.has(key);
    });
    return [...messages, ...missingRecentSentMessages, currentMessage];
  }

  function getContextBefore(messages, targetIndex) {
    if (captureSettings.contextMode === "none") {
      return [];
    }
    const beforeCount = getContextBeforeCount();
    if (captureSettings.contextMode === "previous_1") {
      return messages.slice(Math.max(0, targetIndex - beforeCount), targetIndex);
    }
    if (captureSettings.contextMode === "previous_2" || captureSettings.contextMode === "previous_and_next") {
      return messages.slice(Math.max(0, targetIndex - beforeCount), targetIndex);
    }
    return messages.slice(Math.max(0, targetIndex - beforeCount), targetIndex);
  }

  function getContextAfter(messages, targetIndex) {
    if (captureSettings.target === "own" || captureSettings.contextMode === "none") {
      return [];
    }
    const afterCount = getContextAfterCount();
    if (captureSettings.contextMode === "previous_and_next") {
      return messages.slice(targetIndex + 1, targetIndex + 1 + afterCount);
    }
    if (captureSettings.contextMode === "recent") {
      return messages.slice(targetIndex + 1, targetIndex + 1 + afterCount);
    }
    return [];
  }

  function buildMessageCapturePayload(messages, targetIndex, reason, triggerPrefix) {
    const target = messages[targetIndex];
    if (!target) {
      return null;
    }
    const beforeMessages = getContextBefore(messages, targetIndex);
    const afterMessages = getContextAfter(messages, targetIndex);
    const metadataMessages = [...beforeMessages, target, ...afterMessages].map(normalizeCaptureMessage);
    return {
      text: target.raw_content,
      beforeContext: formatContextMessages(beforeMessages),
      afterContext: formatContextMessages(afterMessages),
      appName: appNameForSite(),
      metadata: {
        trigger: (triggerPrefix || "web_reader_auto_") + reason,
        messageRole: target.role,
        messageKey: normalizeForKey(target.raw_content),
        contextMode: captureSettings.contextMode,
        contextBeforeCount: captureSettings.contextBeforeCount,
        contextAfterCount: captureSettings.contextAfterCount,
        captureTarget: captureSettings.target,
        captureScope: captureSettings.scope,
        filterLowSignalTargets: captureSettings.filterLowSignalTargets,
        messages: metadataMessages
      }
    };
  }

  function getPayloadCaptureKey(payload) {
    const metadata = payload?.metadata || {};
    return [
      location.origin + location.pathname,
      metadata.siteKey || config.siteKey,
      metadata.messageKey || "",
      normalizeForKey(payload?.text || "")
    ].join("\\u001f");
  }

  function addListener(target, type, listener, options) {
    target.addEventListener(type, listener, options);
    listeners.push([target, type, listener, options]);
  }

  function destroy() {
    for (const [target, type, listener, options] of listeners.splice(0)) {
      target.removeEventListener(type, listener, options);
    }
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
    if (mutationCaptureTimer) {
      window.clearTimeout(mutationCaptureTimer);
      mutationCaptureTimer = 0;
    }
  }

  function toElement(target) {
    return target && target.nodeType === Node.ELEMENT_NODE ? target : target?.parentElement;
  }

  function getInputSelector() {
    if (config.siteKey === "chatgpt") {
      return [
        "#prompt-textarea",
        "[data-testid='composer-text-input']",
        "textarea[data-testid*='prompt' i]",
        "textarea[name='prompt-textarea']",
        "textarea[placeholder*='Message' i]",
        "[contenteditable='true'][id='prompt-textarea']",
        "[contenteditable='true'][role='textbox']",
        ".ProseMirror[contenteditable='true']",
        "[contenteditable='true'][data-lexical-editor='true']",
        "div[contenteditable='true']"
      ].join(",");
    }
    if (config.siteKey === "discord") {
      return [
        "[role='textbox'][contenteditable='true'][data-slate-editor='true']",
        "[role='textbox'][contenteditable='true']"
      ].join(",");
    }
    return "textarea,input,[contenteditable='true'],[role='textbox']";
  }

  function getSendButtonSelector() {
    if (config.siteKey === "chatgpt") {
      return [
        "button[data-testid='send-button']",
        "button[data-testid='composer-submit-button']",
        "button[data-testid='send-message-button']",
        "button[aria-label*='Send' i]",
        "button[aria-label*='Submit' i]"
      ].join(",");
    }
    if (config.siteKey === "discord") {
      return "button[aria-label*='Send' i],button[aria-label*='send' i]";
    }
    return "button[type='submit'],button[aria-label*='Send' i],button[aria-label*='Submit' i],[role='button']";
  }

  function appNameForSite() {
    if (config.siteKey === "discord") {
      return "Discord";
    }
    if (config.siteKey === "claude") {
      return "Claude";
    }
    if (config.siteKey === "chatgpt") {
      return "ChatGPT";
    }
    return "Web Reader";
  }

  function isSensitiveAuthPage() {
    const host = location.hostname.replace(/^www\\./i, "").toLowerCase();
    const path = location.pathname.toLowerCase();
    return (
      (host.endsWith("discord.com") && /^\\/(?:login|register)(?:\\/|$)/.test(path)) ||
      (host.endsWith("chatgpt.com") && /^\\/(?:auth|login|sign-in|signin)(?:\\/|$)/.test(path))
    );
  }

  function isVisible(element) {
    if (!element || !element.getBoundingClientRect) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function queryVisible(selector, root = document) {
    try {
      return Array.from(root.querySelectorAll(selector)).filter((element) => element instanceof HTMLElement && isVisible(element));
    } catch {
      return [];
    }
  }

  function sortElementsByViewportPosition(elements) {
    return elements.slice().sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      const topDelta = rectA.top - rectB.top;
      if (Math.abs(topDelta) > 2) {
        return topDelta;
      }
      return rectA.left - rectB.left;
    });
  }

  function isEditableElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }
    const inputSelector = getInputSelector();
    if (element.matches?.(inputSelector) || element.closest?.(inputSelector)) {
      return true;
    }
    const tagName = element.tagName ? element.tagName.toLowerCase() : "";
    return (
      tagName === "textarea" ||
      tagName === "input" ||
      element.isContentEditable ||
      element.getAttribute("role") === "textbox"
    );
  }

  function findEditable(start) {
    const inputSelector = getInputSelector();
    const initialElement = toElement(start);
    const directInput = initialElement?.closest?.(inputSelector);
    if (directInput) {
      return directInput;
    }

    const roots = [
      initialElement?.closest?.("form"),
      initialElement?.closest?.("[data-testid*='composer' i]"),
      initialElement?.closest?.("[class*='composer' i]"),
      initialElement?.closest?.("main"),
      document
    ].filter(Boolean);
    for (const root of roots) {
      const candidates = queryVisible(inputSelector, root);
      if (candidates.length > 0) {
        return candidates[candidates.length - 1];
      }
    }

    let element = initialElement;
    for (let index = 0; element && index < 6; index += 1) {
      if (isEditableElement(element)) {
        return element;
      }
      element = element.parentElement;
    }
    return null;
  }

  function rememberEditableText(element, reason = "input") {
    const text = readEditableText(element);
    if (!text) {
      if (config.siteKey === "discord" && lastEditableText && Date.now() - lastEditableAt < 30_000) {
        scheduleLatestOwnMessageCapture(reason + "_cleared");
      }
      return;
    }
    lastEditableText = text;
    lastEditableAt = Date.now();
  }

  function readEditableText(element) {
    if (!element) {
      return "";
    }
    if ("value" in element) {
      return normalizeText(element.value);
    }
    const text = normalizeText(element.innerText || element.textContent || "");
    if (config.siteKey === "discord" && /^message\\s+#?[-\\w\\s]+$/i.test(text)) {
      return "";
    }
    return text;
  }

  function findBlockText(node) {
    let element = node && node.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    for (let index = 0; element && index < 8; index += 1) {
      const tagName = element.tagName ? element.tagName.toLowerCase() : "";
      const text = normalizeText(element.innerText || element.textContent || "");
      if (
        text &&
        (["p", "li", "article", "section", "blockquote", "td", "th", "div", "span"].includes(tagName) ||
          element.getAttribute("role") === "article")
      ) {
        return text;
      }
      element = element.parentElement;
    }
    return normalizeText(document.body ? document.body.innerText : "");
  }

  function extractSentence(blockText, selectedText) {
    const text = normalizeText(blockText);
    if (!text) {
      return selectedText;
    }
    const needle = normalizeText(selectedText);
    const offset = needle ? text.toLowerCase().indexOf(needle.toLowerCase()) : -1;
    if (offset < 0) {
      return text.slice(0, 900);
    }
    let start = offset;
    let end = offset + needle.length;
    const boundary = /[.!?。！？]\\s/;
    for (let index = offset - 1; index >= 0; index -= 1) {
      if (boundary.test(text.slice(index, index + 2))) {
        start = index + 1;
        break;
      }
      if (index === 0) {
        start = 0;
      }
    }
    for (let index = end; index < text.length; index += 1) {
      if (/[.!?。！？]/.test(text[index])) {
        end = index + 1;
        break;
      }
    }
    return normalizeText(text.slice(start, end)).slice(0, 1200) || needle;
  }

  function getSelectionPayload() {
    const selection = window.getSelection ? window.getSelection() : null;
    const selectedText = normalizeText(selection ? selection.toString() : "");
    if (!selection || !selectedText || selection.rangeCount === 0) {
      return null;
    }
    const range = selection.getRangeAt(0);
    const blockText = findBlockText(range.commonAncestorContainer);
    const sourceSentence = extractSentence(blockText, selectedText);
    return {
      text: sourceSentence,
      beforeContext: blockText.slice(0, 1800),
      afterContext: "",
      appName: "웹 리더",
      metadata: {
        url: location.href,
        title: document.title,
        trigger: "web_reader_selection_shortcut",
        selectedText,
        siteKey: config.siteKey,
        mode: config.mode,
        capturedAt: new Date().toISOString()
      }
    };
  }

  function normalizeMessageText(value) {
    return String(value || "")
      .replace(/[\\u200b\\u200c\\u200d\\ufeff]/g, "")
      .replace(/\\u00a0/g, " ")
      .replace(/\\r\\n?/g, "\\n")
      .replace(/[ \\t]+/g, " ")
      .replace(/\\n{3,}/g, "\\n\\n")
      .trim();
  }

  function normalizeSpeaker(value) {
    return normalizeText(value).replace(/[:\\n\\r]+/g, " ").slice(0, 60);
  }

  function normalizeDiscordSpeakerName(value) {
    return normalizeSpeaker(value)
      .replace(/\\s*(?:저\\s*새로\\s*들어왔어요.*|i['’]?m\\s*new\\s*here.*|say\\s*hi.*)$/i, "")
      .trim();
  }

  function defaultSpeakerForRole(role) {
    if (role === "user") {
      return "Me";
    }
    if (role === "assistant") {
      return appNameForSite();
    }
    return "Other";
  }

  function dedupeMessages(messages) {
    const seen = new Set();
    const filtered = [];
    for (const message of messages) {
      const raw = limitMessageText(message?.raw_content || "");
      if (!raw) {
        continue;
      }
      const key = [message.role || "other", message.speaker || "", raw].join("\\u001f");
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      filtered.push({ ...message, raw_content: raw });
    }
    return filtered;
  }

  function getChatGptMessageText(element) {
    const content =
      element.querySelector?.(".markdown") ||
      element.querySelector?.("[data-message-content]") ||
      element.querySelector?.("[data-testid*='message' i]") ||
      element;
    return normalizeMessageText(content.innerText || content.textContent || "")
      .replace(/^(?:ChatGPT said:|You said:)\\s*/i, "")
      .trim();
  }

  function readChatGptMessages() {
    const selectors = [
      "[data-message-author-role]",
      "article[data-testid*='conversation-turn' i]",
      "main article"
    ];
    const elements = [];
    for (const selector of selectors) {
      for (const element of queryVisible(selector)) {
        if (!elements.includes(element)) {
          elements.push(element);
        }
      }
    }
    return dedupeMessages(elements.map((element) => {
      const roleAttr = normalizeText(element.getAttribute("data-message-author-role"));
      const role = roleAttr === "user" || roleAttr === "assistant" ? roleAttr : "assistant";
      return {
        role,
        speaker: role === "user" ? "Me" : "ChatGPT",
        raw_content: getChatGptMessageText(element),
        timestamp: new Date().toISOString()
      };
    })).slice(-8);
  }

  function getDirectDiscordSpeaker(element) {
    const selectors = [
      "[id^='message-username-']",
      "[class*='username']",
      "[data-testid='message-author-username']",
      "h3 span"
    ];
    for (const selector of selectors) {
      const match = element.querySelector?.(selector);
      const text = normalizeDiscordSpeakerName(match?.textContent || "");
      if (text && text.length <= 60 && !/^\\d{1,2}:\\d{2}/.test(text)) {
        return text;
      }
    }
    return "";
  }

  function getPreviousDiscordSpeaker(element) {
    let sibling = element.previousElementSibling;
    for (let checked = 0; sibling && checked < 20; checked += 1) {
      const speaker = getDirectDiscordSpeaker(sibling);
      if (speaker) {
        return speaker;
      }
      sibling = sibling.previousElementSibling;
    }
    return "";
  }

  function getDiscordSpeaker(element) {
    const direct = getDirectDiscordSpeaker(element);
    if (direct) {
      return direct;
    }
    const inherited = getPreviousDiscordSpeaker(element);
    if (inherited) {
      return inherited;
    }
    const aria = normalizeDiscordSpeakerName(element.getAttribute?.("aria-label") || "");
    const ariaSpeaker = aria.split(/[,:]/)[0]?.trim() || "";
    return ariaSpeaker && ariaSpeaker.length <= 60 && !/^\\d{1,2}:\\d{2}/.test(ariaSpeaker) ? ariaSpeaker : "";
  }

  function getDiscordMessageText(element, speaker) {
    const selectors = [
      "[id^='message-content-']",
      "[class*='messageContent']",
      "[class*='markup']"
    ];
    const parts = [];
    const seen = new Set();
    for (const selector of selectors) {
      for (const match of Array.from(element.querySelectorAll?.(selector) || [])) {
        const text = normalizeMessageText(match.innerText || match.textContent || "");
        if (text && !seen.has(text)) {
          seen.add(text);
          parts.push(text);
        }
      }
    }
    let text = parts.length ? parts.join("\\n") : "";
    if (speaker && text.toLowerCase().startsWith(speaker.toLowerCase())) {
      text = text.slice(speaker.length).trim();
    }
    return text
      .replace(/\\b(?:Today|Yesterday)\\s+at\\s+\\d{1,2}:\\d{2}\\s*(?:AM|PM)?/gi, " ")
      .replace(/\\b\\d{1,2}:\\d{2}\\s*(?:AM|PM)?\\b/gi, " ")
      .replace(/[ \\t]+/g, " ")
      .replace(/\\n{3,}/g, "\\n\\n")
      .trim();
  }

  function isGenericDiscordSpeaker(speaker) {
    const text = normalizeText(speaker).toLowerCase();
    return !text || text === "discord" || text === "other" || text === "system";
  }

  function isDiscordSystemMessageText(text) {
    const normalized = normalizeMessageText(text);
    if (!normalized) {
      return true;
    }
    const compact = normalized.replace(/\\s+/g, " ").trim();
    if (/^\\d{4}\\s*년\\s*\\d{1,2}\\s*월\\s*\\d{1,2}\\s*일$/u.test(compact)) {
      return true;
    }
    if (/^(?:today|yesterday)$/i.test(compact)) {
      return true;
    }
    if (/(?:joined the server|new here|first message|send a message|select an account|log in)/i.test(compact)) {
      return true;
    }
    if (
      /(?:\uC0C8\uB85C\s*\uB4E4\uC5B4\uC654\uC5B4\uC694|\uCCAB\s*\uBA54\uC2DC\uC9C0|\uC11C\uBC84\uC5D0\s*\uC624\uC2E0|\uBA54\uC2DC\uC9C0\s*\uBCF4\uB0B4\uAE30|\uACC4\uC815\s*\uC120\uD0DD\uD558\uAE30|\uB85C\uADF8\uC778\uD560\s*\uACC4\uC815)/u.test(
        compact
      )
    ) {
      return true;
    }
    if (/^(?:message\\s+#|메시지\\s+#)/i.test(compact)) {
      return true;
    }
    return /(?:님을 환영해요|서버에 오신 것을 환영|손을 흔들어|친구 초대하기|첫 메시지 보내기|Discord 앱 다운로드|계정 선택하기|로그인할 계정)/u.test(compact);
  }

  function getCurrentDiscordUserSpeakers() {
    const speakers = new Set();
    const roots = queryVisible(
      [
        "[class*='panels']",
        "[class*='avatarWrapper']",
        "[aria-label*='User Settings']",
        "section[aria-label*='User']",
        "section[aria-label*='user']"
      ].join(",")
    );
    const selectors = [
      "[class*='panelTitleContainer']",
      "[class*='nameTag'] [class*='title']",
      "[class*='nameTag'] > div:first-child",
      "[class*='account'] [class*='title']",
      "[class*='username']",
      "[class*='displayName']",
      "[class*='userTag']",
      "[class*='name']"
    ];
    for (const root of roots) {
      for (const selector of selectors) {
        for (const match of Array.from(root.querySelectorAll?.(selector) || [])) {
          const speaker = normalizeSpeaker(match.textContent || "")
            .replace(/\\b(?:Online|Idle|Do Not Disturb|Invisible|Offline)\\b/gi, "")
            .trim();
          if (speaker && speaker.length <= 60) {
            speakers.add(speaker);
          }
        }
      }
    }
    return speakers;
  }

  function isCurrentDiscordUserSpeaker(speaker) {
    const key = normalizeText(speaker).toLowerCase();
    if (!key) {
      return false;
    }
    return Array.from(getCurrentDiscordUserSpeakers()).some((candidate) => normalizeText(candidate).toLowerCase() === key);
  }

  function isOwnDiscordMessage(element, speaker) {
    if (
      element.getAttribute?.("data-is-self") === "true" ||
      element.querySelector?.("[class*='isSending']") ||
      isCurrentDiscordUserSpeaker(speaker)
    ) {
      return true;
    }
    const actions = Array.from(element.querySelectorAll?.("button,[role='button'],[aria-label],[title]") || []);
    return actions.some((action) => {
      const label = normalizeText([action.getAttribute?.("aria-label"), action.getAttribute?.("title"), action.textContent].join(" "));
      return /^(?:Edit|수정)(?:\\b|$)/i.test(label);
    });
  }

  function readDiscordMessages() {
    const selectors = [
      "[data-list-item-id^='chat-messages___']",
      "li[id^='chat-messages-']",
      "article[id^='chat-messages-']",
      "[role='article'][id^='chat-messages-']",
      "[role='article'][id*='chat-messages']",
      "li[class*='messageListItem']",
      "[class*='messageListItem']"
    ];
    const elements = [];
    for (const selector of selectors) {
      for (const element of queryVisible(selector)) {
        if (!elements.includes(element)) {
          elements.push(element);
        }
      }
    }
    const currentUserSpeaker = Array.from(getCurrentDiscordUserSpeakers())[0] || "";
    return dedupeMessages(sortElementsByViewportPosition(elements).map((element) => {
      const speaker = getDiscordSpeaker(element);
      const own = isOwnDiscordMessage(element, speaker);
      const rawContent = getDiscordMessageText(element, speaker);
      if (isDiscordSystemMessageText(rawContent)) {
        return null;
      }
      const resolvedSpeaker =
        own
          ? "Me"
          : speaker && !isGenericDiscordSpeaker(speaker)
          ? speaker
          : "";
      if (!resolvedSpeaker && !own) {
        return null;
      }
      return {
        role: own ? "user" : "other",
        speaker: resolvedSpeaker || (own ? "Me" : "Discord"),
        raw_content: rawContent,
        timestamp: new Date().toISOString()
      };
    })).slice(-getVisibleMessageLimit());
  }

  function readGenericMessages() {
    const selectors = [
      "[data-message-author-role]",
      "[data-testid*=conversation-turn]",
      "[role=listitem]",
      "[class*=message]",
      "article"
    ];
    const elements = [];
    for (const selector of selectors) {
      for (const element of queryVisible(selector)) {
        if (!elements.includes(element)) {
          elements.push(element);
        }
      }
    }
    return dedupeMessages(elements.map((element) => {
      const roleAttr = normalizeText(element.getAttribute("data-message-author-role"));
      const role = roleAttr === "user" || roleAttr === "assistant" ? roleAttr : "other";
      return {
        role,
        speaker: defaultSpeakerForRole(role),
        raw_content: normalizeMessageText(element.innerText || element.textContent || ""),
        timestamp: new Date().toISOString()
      };
    })).slice(-getVisibleMessageLimit());
  }

  function readVisibleMessages() {
    if (config.siteKey === "chatgpt") {
      return readChatGptMessages();
    }
    if (config.siteKey === "discord") {
      return readDiscordMessages();
    }
    return readGenericMessages();
  }

  function queueCapture(payload, reason) {
    if (!config.enabled || isSensitiveAuthPage() || !payload || !normalizeText(payload.text)) {
      return false;
    }
    const signature = [payload.text, payload.metadata && payload.metadata.trigger].join("\\u001f");
    if (signature === lastQueuedSignature) {
      return false;
    }
    const captureKey = getPayloadCaptureKey(payload);
    if (captureSettings.dedupeEnabled && seenCaptureKeys.has(captureKey)) {
      return false;
    }
    lastQueuedSignature = signature;
    if (captureSettings.dedupeEnabled) {
      seenCaptureKeys.add(captureKey);
      if (seenCaptureKeys.size > 250) {
        seenCaptureKeys = new Set(Array.from(seenCaptureKeys).slice(-200));
      }
    }
    payload.metadata = {
      ...(payload.metadata || {}),
      url: location.href,
      title: document.title,
      trigger: payload.metadata?.trigger || reason || "web_reader",
      capturedAt: new Date().toISOString(),
      siteKey: config.siteKey,
      mode: config.mode
    };
    queue.push(payload);
    if (queue.length > 30) {
      queue.shift();
    }
    return true;
  }

  function queueEditableCapture(element, reason) {
    if (config.mode !== "auto") {
      return false;
    }
    const text = limitMessageText(readEditableText(element) || lastEditableText);
    if (!text) {
      return false;
    }
    const currentMessage = {
      role: "user",
      speaker: "Me",
      raw_content: text,
      timestamp: new Date().toISOString()
    };
    const messages = withRecentSentMessages(readVisibleMessages(), currentMessage);
    const targetIndex = messages.length - 1;
    const payload = buildMessageCapturePayload(messages, targetIndex, reason, "web_reader_auto_");
    if (!payload) {
      return false;
    }
    const currentUserSpeaker = config.siteKey === "discord" ? Array.from(getCurrentDiscordUserSpeakers())[0] || "" : "";
    payload.metadata = {
      ...(payload.metadata || {}),
      ...(currentUserSpeaker ? { currentUserSpeaker } : {})
    };
    const queued = queueCapture(payload, "web_reader_auto_" + reason);
    if (queued) {
      rememberRecentSentMessage(text);
    }
    return queued;
  }

  function normalizeDraftMatchText(value) {
    return normalizeText(value)
      .toLowerCase()
      .replace(/[^\\p{L}\\p{N}]+/gu, " ")
      .replace(/\\s+/g, " ")
      .trim();
  }

  function isLikelySameDraftMessage(messageText, draftText) {
    const message = normalizeDraftMatchText(messageText);
    const draft = normalizeDraftMatchText(draftText);
    if (!message || !draft) {
      return false;
    }
    if (message === draft || message.includes(draft) || draft.includes(message)) {
      return true;
    }
    const draftWords = draft.split(" ").filter((word) => word.length >= 2);
    if (draftWords.length < 3) {
      return false;
    }
    const messageWords = new Set(message.split(" "));
    const overlap = draftWords.filter((word) => messageWords.has(word)).length;
    return overlap / draftWords.length >= 0.72;
  }

  function markMessageAsOwn(message) {
    return {
      ...message,
      role: "user",
      speaker: "Me"
    };
  }

  function findLatestOwnMessageIndex(messages) {
    if (captureSettings.target === "all") {
      return messages.length - 1;
    }
    if (!lastEditableText || Date.now() - lastEditableAt > 30_000) {
      return -1;
    }
    const normalizedDraft = normalizeText(lastEditableText).toLowerCase();
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const messageText = normalizeText(messages[index].raw_content).toLowerCase();
      if (messages[index].role === "user" && (messageText.includes(normalizedDraft) || normalizedDraft.includes(messageText))) {
        return index;
      }
    }
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (isLikelySameDraftMessage(messages[index].raw_content, lastEditableText)) {
        messages[index] = markMessageAsOwn(messages[index]);
        return index;
      }
    }
    return -1;
  }

  function queueLatestOwnMessage(reason) {
    if (config.mode !== "auto") {
      return false;
    }
    const messages = readVisibleMessages();
    const targetIndex = findLatestOwnMessageIndex(messages);
    if (targetIndex < 0) {
      return false;
    }
    const payload = buildMessageCapturePayload(messages, targetIndex, reason, "web_reader_auto_");
    if (!payload) {
      return false;
    }
    const currentUserSpeaker = config.siteKey === "discord" ? Array.from(getCurrentDiscordUserSpeakers())[0] || "" : "";
    payload.metadata = {
      ...(payload.metadata || {}),
      ...(currentUserSpeaker ? { currentUserSpeaker } : {})
    };
    return queueCapture({
      ...payload,
      metadata: payload.metadata
    }, "web_reader_auto_" + reason);
  }

  function scheduleLatestOwnMessageCapture(reason) {
    if (config.mode !== "auto" || !lastEditableText || Date.now() - lastEditableAt > 30_000) {
      return;
    }
    [650, 1400, 2800].forEach((delay) => {
      window.setTimeout(() => {
        if (!lastEditableText || Date.now() - lastEditableAt > 30_000) {
          return;
        }
        queueLatestOwnMessage(reason);
      }, delay);
    });
  }

  function queueVisibleCapture(reason) {
    if (config.mode !== "auto") {
      return false;
    }
    if (queueLatestOwnMessage(reason)) {
      return true;
    }
    const isManualRequest = /manual|shortcut|qa/i.test(String(reason || ""));
    if (captureSettings.scope === "new_only" && !isManualRequest) {
      return false;
    }
    const messages = readVisibleMessages();
    const fallbackMessage =
      captureSettings.target === "all"
        ? messages[messages.length - 1]
        : [...messages].reverse().find((message) => message.role === "user");
    if (!fallbackMessage) {
      return false;
    }
    const targetIndex = Math.max(0, messages.lastIndexOf(fallbackMessage));
    const payload = buildMessageCapturePayload(messages, targetIndex, reason, "web_reader_visible_");
    if (!payload) {
      return false;
    }
    const currentUserSpeaker = config.siteKey === "discord" ? Array.from(getCurrentDiscordUserSpeakers())[0] || "" : "";
    payload.metadata = {
      ...(payload.metadata || {}),
      ...(currentUserSpeaker ? { currentUserSpeaker } : {})
    };
    return queueCapture(payload, "web_reader_visible_" + reason);
  }

  function scheduleMutationCapture() {
    if (config.mode !== "auto" || !lastEditableText || Date.now() - lastEditableAt > 30_000) {
      return;
    }
    if (mutationCaptureTimer) {
      window.clearTimeout(mutationCaptureTimer);
    }
    mutationCaptureTimer = window.setTimeout(() => {
      mutationCaptureTimer = 0;
      queueLatestOwnMessage("dom_mutation");
    }, 700);
  }

  function shortcutParts() {
    const raw = String(config.shortcut || "Ctrl+Q").toLowerCase();
    const key = raw.split("+").pop()?.trim() || "q";
    return {
      key,
      ctrl: raw.includes("ctrl") || raw.includes("control"),
      meta: raw.includes("meta") || raw.includes("cmd") || raw.includes("command"),
      alt: raw.includes("alt"),
      shift: raw.includes("shift")
    };
  }

  function matchesShortcut(event) {
    const shortcut = shortcutParts();
    return (
      event.key.toLowerCase() === shortcut.key &&
      Boolean(event.ctrlKey) === shortcut.ctrl &&
      Boolean(event.metaKey) === shortcut.meta &&
      Boolean(event.altKey) === shortcut.alt &&
      Boolean(event.shiftKey) === shortcut.shift
    );
  }

  addListener(document, "input", (event) => {
    const editable = findEditable(event.target);
    if (!editable) {
      return;
    }
    rememberEditableText(editable, "input");
  }, true);

  addListener(document, "beforeinput", (event) => {
    const editable = findEditable(event.target);
    if (!editable) {
      return;
    }
    window.setTimeout(() => rememberEditableText(editable, "beforeinput"), 0);
  }, true);

  addListener(document, "compositionend", (event) => {
    const editable = findEditable(event.target);
    if (!editable) {
      return;
    }
    window.setTimeout(() => rememberEditableText(editable, "compositionend"), 0);
  }, true);

  addListener(document, "paste", (event) => {
    const editable = findEditable(event.target);
    if (!editable) {
      return;
    }
    window.setTimeout(() => rememberEditableText(editable, "paste"), 0);
  }, true);

  addListener(document, "keyup", (event) => {
    const editable = findEditable(event.target);
    if (!editable) {
      return;
    }
    rememberEditableText(editable, "keyup");
  }, true);

  addListener(document, "submit", (event) => {
    if (config.mode !== "auto") {
      return;
    }
    const editable = findEditable(event.target) || findEditable(document.activeElement);
    if (editable || Date.now() - lastEditableAt < 15_000) {
      queueEditableCapture(editable, "submit");
    }
  }, true);

  addListener(document, "keydown", (event) => {
    if (event.isComposing || event.keyCode === 229) {
      return;
    }
    if (matchesShortcut(event)) {
      const selectionPayload = getSelectionPayload();
      if (selectionPayload && queueCapture(selectionPayload, "web_reader_selection_shortcut")) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      const editable = findEditable(event.target);
      if (editable && queueEditableCapture(editable, "shortcut")) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    if (
      config.mode === "auto" &&
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey
    ) {
      const editable = findEditable(event.target);
      if (editable) {
        rememberEditableText(editable);
        const queued = queueEditableCapture(editable, "enter");
        scheduleLatestOwnMessageCapture(queued ? "enter_dom_confirm" : "enter_dom");
      }
    }
  }, true);

  addListener(document, "click", (event) => {
    if (config.mode !== "auto") {
      return;
    }
    const target = toElement(event.target);
    const button = target?.closest?.("button,[role=button]");
    if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") {
      return;
    }
    const label = normalizeText(button.getAttribute("aria-label") || button.textContent || "");
    const sendSelector = getSendButtonSelector();
    if (button.matches?.(sendSelector) || /send|submit|arrow|보내기|전송/i.test(label)) {
      const editable = findEditable(button) || findEditable(document.activeElement);
      if (editable || Date.now() - lastEditableAt < 5000) {
        if (editable) {
          rememberEditableText(editable);
        }
        const queued = queueEditableCapture(editable, "send_button");
        scheduleLatestOwnMessageCapture(queued ? "send_button_dom_confirm" : "send_button_dom");
      }
      return;
    }
    if (!/(send|submit|전송|보내기|arrow|↑)/i.test(label)) {
      return;
    }
    const editable = findEditable(document.activeElement) || document.querySelector("textarea,[contenteditable=true],[role=textbox]");
    if (editable || Date.now() - lastEditableAt < 5000) {
      window.setTimeout(() => queueEditableCapture(editable, "send_button"), 0);
    }
  }, true);

  if (config.mode === "auto" && typeof MutationObserver !== "undefined") {
    mutationObserver = new MutationObserver(scheduleMutationCapture);
    mutationObserver.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  window.__LEM_WEB_READER_LIFE_MINER = {
    version: 1,
    config,
    consumeCaptures() {
      const captured = queue.slice();
      queue = [];
      return captured;
    },
    getCapturedKeys() {
      return Array.from(seenCaptureKeys).slice(-200);
    },
    getRecentSentMessages() {
      return recentSentMessages.slice(-12);
    },
    enqueueTestCapture() {
      return queueCapture({
        text: "Web Reader life mining synthetic capture for QA.",
        beforeContext: "",
        afterContext: "",
        appName: "웹 리더 QA",
        metadata: {
          trigger: "web_reader_qa",
          messages: [
            {
              role: "user",
              raw_content: "Web Reader life mining synthetic capture for QA.",
              timestamp: new Date().toISOString()
            }
          ]
        }
      }, "web_reader_qa");
    },
    forceCaptureVisible(reason = "manual") {
      const editable = findEditable(document.activeElement) || queryVisible(getInputSelector()).slice(-1)[0];
      if (editable && queueEditableCapture(editable, reason)) {
        return true;
      }
      return queueVisibleCapture(reason);
    },
    debug() {
      const visibleMessages = readVisibleMessages();
      const currentUserSpeakers = config.siteKey === "discord" ? Array.from(getCurrentDiscordUserSpeakers()) : [];
      return {
        enabled: config.enabled,
        siteKey: config.siteKey,
        mode: config.mode,
        captureSettings,
        queueLength: queue.length,
        lastEditableText,
        inputPresent: Boolean(findEditable(document.activeElement) || queryVisible(getInputSelector()).length),
        currentUserSpeakers,
        visibleMessageCount: visibleMessages.length,
        visibleMessages: visibleMessages.slice(-3).map((message) => ({
          role: message.role,
          speaker: message.speaker || "",
          text: String(message.raw_content || "").slice(0, 160)
        }))
      };
    },
    destroy
  };
  return true;
})()
`;
}
