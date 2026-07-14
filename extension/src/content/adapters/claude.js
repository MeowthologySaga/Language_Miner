(function registerClaudeLifeMinerAdapter(globalScope) {
  const t =
    globalScope.LanguageMinerExtensionI18n?.t || ((_key, fallback = "") => fallback || _key);
  const inputSelector = [
    'div[contenteditable="true"]',
    '.ProseMirror[contenteditable="true"]',
    'textarea[placeholder*="Claude" i]',
    'textarea[placeholder*="message" i]',
    "textarea"
  ].join(",");
  const sendButtonSelector = [
    'button[aria-label*="Send" i]',
    'button[aria-label*="전송" i]',
    'button[aria-label*="보내기" i]',
    'button[data-testid*="send" i]'
  ].join(",");

  const adapter = {
    id: "claude",
    appName: "Claude",
    contextBlockLimit: 1,
    contextSelectors: [
      '[data-testid*="user-message" i]',
      '[data-testid*="assistant-message" i]',
      '[data-testid*="message" i]',
      ".font-claude-message",
      "main article"
    ],
    matches: () => location.hostname === "claude.ai",
    getInputFromEventTarget(target) {
      const element = toElement(target);
      return element?.closest(inputSelector) || undefined;
    },
    findActiveInput() {
      return document.activeElement?.closest?.(inputSelector) || document.querySelector(inputSelector);
    },
    findInputForSendButton() {
      return document.activeElement?.closest?.(inputSelector) || document.querySelector(inputSelector);
    },
    isSendButton(target) {
      return Boolean(toElement(target)?.closest(sendButtonSelector));
    },
    isEditable(target) {
      return Boolean(toElement(target)?.closest(inputSelector));
    },
    getText(input) {
      if (!input) {
        return "";
      }
      if ("value" in input) {
        return input.value || "";
      }
      return input.innerText || input.textContent || "";
    },
    getContextBlock(element) {
      const role = getClaudeRole(element);
      const speaker = role === "user" ? t("speakerMe", "Me") : "Claude";
      const rawContent = getClaudeMessageText(element);
      return rawContent ? { role, speaker, raw_content: rawContent, text: rawContent } : null;
    }
  };

  globalScope.LifeMinerAdapters = [...(globalScope.LifeMinerAdapters || []), adapter];

  function toElement(target) {
    return target instanceof Element ? target : target?.parentElement;
  }

  function getClaudeSpeaker(element) {
    return getClaudeRole(element) === "user" ? t("speakerMe", "Me") : "Claude";
  }

  function getClaudeRole(element) {
    const testId =
      element.getAttribute?.("data-testid") ||
      element.closest?.("[data-testid]")?.getAttribute("data-testid") ||
      "";
    if (/user-message/i.test(testId)) {
      return "user";
    }
    if (/assistant-message|message/i.test(testId)) {
      return "assistant";
    }
    return "assistant";
  }

  function getClaudeMessageText(element) {
    const content =
      element.querySelector?.(".font-claude-message") ||
      element.querySelector?.("[data-testid*='message-content' i]") ||
      element;
    return normalizeText(content.innerText || content.textContent || "");
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
})(globalThis);
