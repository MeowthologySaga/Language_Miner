(function registerChatGptLifeMinerAdapter(globalScope) {
  const t =
    globalScope.LanguageMinerExtensionI18n?.t || ((_key, fallback = "") => fallback || _key);
  const inputSelector = [
    "#prompt-textarea",
    '[data-testid="composer-text-input"]',
    'textarea[data-testid*="prompt" i]',
    'textarea[name="prompt-textarea"]',
    'textarea[placeholder*="Message" i]',
    '[contenteditable="true"][id="prompt-textarea"]',
    '[contenteditable="true"][role="textbox"]',
    ".ProseMirror[contenteditable='true']",
    '[contenteditable="true"][data-lexical-editor="true"]',
    'div[contenteditable="true"]'
  ].join(",");
  const sendButtonSelector = [
    'button[data-testid="send-button"]',
    'button[data-testid="composer-submit-button"]',
    'button[data-testid="send-message-button"]',
    'button[aria-label*="Send" i]',
    'button[aria-label*="Submit" i]'
  ].join(",");

  const adapter = {
    id: "chatgpt",
    appName: "ChatGPT",
    contextBlockLimit: 1,
    contextSelectors: [
      '[data-message-author-role]',
      'article[data-testid*="conversation-turn" i]',
      "main article"
    ],
    matches: () =>
      location.hostname === "chatgpt.com" ||
      location.hostname.endsWith(".chatgpt.com") ||
      location.hostname === "chat.openai.com",
    getInputFromEventTarget(target) {
      const element = toElement(target);
      return element?.closest(inputSelector) || findInputNear(element) || undefined;
    },
    findActiveInput() {
      return (
        document.activeElement?.closest?.(inputSelector) ||
        findInputNear(document.activeElement) ||
        findComposerInput()
      );
    },
    findInputForSendButton(target) {
      return findInputNear(toElement(target)) || findComposerInput();
    },
    isSendButton(target) {
      const element = toElement(target);
      const button = element?.closest("button");
      if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") {
        return false;
      }
      if (button.matches(sendButtonSelector)) {
        return true;
      }
      if (button.type === "submit" && findInputNear(button)) {
        return true;
      }
      const label = `${button.getAttribute("aria-label") || ""} ${button.textContent || ""}`.trim();
      return /\b(send|submit)\b/i.test(label) && Boolean(findInputNear(button));
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
      const roleElement = element.closest("[data-message-author-role]") || element;
      const role = roleElement.getAttribute?.("data-message-author-role") || "";
      const messageRole = role === "user" ? "user" : role === "assistant" ? "assistant" : "assistant";
      const speaker = messageRole === "user" ? t("speakerMe", "Me") : "ChatGPT";
      const rawContent = getChatGptMessageText(roleElement);
      return rawContent ? { role: messageRole, speaker, raw_content: rawContent, text: rawContent } : null;
    }
  };

  globalScope.LifeMinerAdapters = [...(globalScope.LifeMinerAdapters || []), adapter];

  function toElement(target) {
    return target instanceof Element ? target : target?.parentElement;
  }

  function findComposerInput() {
    const activeInput = document.activeElement?.closest?.(inputSelector);
    if (activeInput) {
      return activeInput;
    }

    const candidates = Array.from(document.querySelectorAll(inputSelector)).filter(isVisible);
    if (candidates.length === 0) {
      return undefined;
    }

    return candidates[candidates.length - 1];
  }

  function findInputNear(element) {
    if (!element) {
      return undefined;
    }

    const directInput = element.closest?.(inputSelector);
    if (directInput) {
      return directInput;
    }

    const roots = [
      element.closest?.("form"),
      element.closest?.('[data-testid*="composer" i]'),
      element.closest?.('[class*="composer" i]'),
      element.closest?.("main")
    ].filter(Boolean);

    for (const root of roots) {
      const candidates = Array.from(root.querySelectorAll(inputSelector)).filter(isVisible);
      if (candidates.length > 0) {
        return candidates[candidates.length - 1];
      }
    }

    return undefined;
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

  function getChatGptMessageText(element) {
    const content =
      element.querySelector?.(".markdown") ||
      element.querySelector?.("[data-message-content]") ||
      element;
    return normalizeText(content.innerText || content.textContent || "")
      .replace(/^(?:ChatGPT said:|You said:)\s*/i, "")
      .trim();
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
