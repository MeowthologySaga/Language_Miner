(function registerDiscordLifeMinerAdapter(globalScope) {
  const inputSelector = [
    '[role="textbox"][contenteditable="true"][data-slate-editor="true"]',
    '[role="textbox"][contenteditable="true"]'
  ].join(",");
  const sendButtonSelector = [
    'button[aria-label*="Send" i]',
    'button[aria-label*="전송" i]',
    'button[aria-label*="보내기" i]'
  ].join(",");

  const adapter = {
    id: "discord",
    appName: "Discord",
    contextBlockLimit: 8,
    contextSelectors: [
      '[data-list-item-id^="chat-messages___"]',
      'li[id^="chat-messages-"]',
      'li[class*="messageListItem"]',
      '[class*="messageListItem"]'
    ],
    matches: () => location.hostname === "discord.com",
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
      return input?.innerText || input?.textContent || "";
    },
    getCurrentUserSpeaker() {
      return Array.from(getCurrentDiscordUserSpeakers())[0] || "";
    },
    isOwnSpeaker(speaker) {
      return isCurrentDiscordUserSpeaker(speaker);
    },
    getContextBlock(element) {
      const speaker = getDiscordSpeaker(element);
      const rawContent = getDiscordMessageText(element, speaker);
      if (isDiscordSystemMessageText(rawContent)) {
        return null;
      }
      const own = isOwnDiscordMessage(element, speaker) || isCurrentDiscordUserSpeaker(speaker);
      const resolvedSpeaker = isUsefulSpeaker(speaker)
        ? own
          ? "Me"
          : speaker
        : own
          ? "Me"
          : "";
      if (!resolvedSpeaker && !own) {
        return null;
      }
      return rawContent
        ? {
            role: own ? "user" : "other",
            speaker: resolvedSpeaker,
            raw_content: rawContent,
            text: rawContent
          }
        : null;
    }
  };

  globalScope.LifeMinerAdapters = [...(globalScope.LifeMinerAdapters || []), adapter];

  function toElement(target) {
    return target instanceof Element ? target : target?.parentElement;
  }

  function getDiscordSpeaker(element) {
    const directSpeaker = getDirectDiscordSpeaker(element);
    if (directSpeaker) {
      return directSpeaker;
    }

    const inheritedSpeaker = getPreviousDiscordSpeaker(element);
    if (inheritedSpeaker) {
      return inheritedSpeaker;
    }

    return getAriaDiscordSpeaker(element);
  }

  function getDirectDiscordSpeaker(element) {
    const candidates = [
      '[id^="message-username-"]',
      '[class*="username"]',
      '[data-testid="message-author-username"]',
      "h3 span"
    ];
    for (const selector of candidates) {
      const match = element.querySelector(selector);
      const text = normalizeText(match?.textContent || "");
      if (isUsefulSpeaker(text)) {
        return text;
      }
    }

    return "";
  }

  function getPreviousDiscordSpeaker(element) {
    let sibling = element.previousElementSibling;
    let checked = 0;
    while (sibling && checked < 20) {
      const speaker = getDirectDiscordSpeaker(sibling);
      if (speaker) {
        return speaker;
      }
      sibling = sibling.previousElementSibling;
      checked += 1;
    }
    return "";
  }

  function getAriaDiscordSpeaker(element) {
    const aria = normalizeText(element.getAttribute("aria-label") || "");
    const ariaSpeaker = aria.split(/[,:]/)[0]?.trim();
    return isUsefulSpeaker(ariaSpeaker) ? ariaSpeaker : "";
  }

  function getDiscordMessageText(element, speaker) {
    const candidates = [
      '[id^="message-content-"]',
      '[class*="messageContent"]',
      '[class*="markup"]'
    ];
    const parts = [];
    const seen = new Set();
    for (const selector of candidates) {
      for (const match of element.querySelectorAll(selector)) {
        const text = normalizeDiscordMessageText(match.innerText || match.textContent || "");
        if (!text || seen.has(text)) {
          continue;
        }
        seen.add(text);
        parts.push(text);
      }
    }

    const raw = parts.length ? parts.join("\n") : "";
    return cleanDiscordText(raw, speaker);
  }

  function isDiscordSystemMessageText(text) {
    const normalized = normalizeDiscordMessageText(text);
    if (!normalized) {
      return true;
    }
    const compact = normalized.replace(/\s+/g, " ").trim();
    if (/^\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일$/u.test(compact)) {
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
    if (/^(?:message\s+#|메시지\s+#)/i.test(compact)) {
      return true;
    }
    return /(?:님을 환영해요|서버에 오신 것을 환영|손을 흔들어|친구 초대하기|첫 메시지 보내기|Discord 앱 다운로드|계정 선택하기|로그인할 계정)/u.test(compact);
  }

  function cleanDiscordText(value, speaker) {
    let text = normalizeDiscordMessageText(value);
    if (speaker) {
      text = text.replace(new RegExp(`^${escapeRegExp(speaker)}\\s*`), "");
    }
    return text
      .replace(/\b(?:Today|Yesterday)\s+at\s+\d{1,2}:\d{2}\s*(?:AM|PM)?/gi, " ")
      .replace(/\b\d{1,2}:\d{2}\s*(?:AM|PM)?\b/gi, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeDiscordMessageText(value) {
    return String(value || "")
      .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function getCurrentDiscordUserSpeakers() {
    const speakers = new Set();
    const roots = Array.from(
      document.querySelectorAll(
        '[class*="panels"], [aria-label*="User Settings"], [aria-label*="사용자 상태"]'
      )
    );
    const selectors = [
      '[class*="panelTitleContainer"]',
      '[class*="nameTag"] [class*="title"]',
      '[class*="nameTag"] > div:first-child',
      '[class*="account"] [class*="title"]',
      '[class*="username"]',
      '[class*="displayName"]',
      '[class*="userTag"]',
      '[class*="name"]'
    ];

    for (const root of roots) {
      for (const selector of selectors) {
        for (const match of root.querySelectorAll(selector)) {
          const speaker = normalizeDiscordUserSpeaker(match.textContent || "");
          if (isUsefulSpeaker(speaker)) {
            speakers.add(speaker);
          }
        }
      }
    }

    return speakers;
  }

  function normalizeDiscordUserSpeaker(value) {
    return normalizeText(value)
      .replace(/\b(?:Online|Idle|Do Not Disturb|Invisible|Offline)\b/gi, "")
      .replace(/(?:온라인|자리 비움|다른 용무 중|오프라인|숨기)/g, "")
      .trim();
  }

  function isCurrentDiscordUserSpeaker(speaker) {
    const normalizedSpeaker = normalizeSpeakerKey(speaker);
    if (!normalizedSpeaker) {
      return false;
    }
    return Array.from(getCurrentDiscordUserSpeakers()).some(
      (currentUserSpeaker) => normalizeSpeakerKey(currentUserSpeaker) === normalizedSpeaker
    );
  }

  function normalizeSpeakerKey(value) {
    return normalizeText(value).toLocaleLowerCase();
  }

  function isOwnDiscordMessage(element, speaker) {
    return (
      element.getAttribute("data-is-self") === "true" ||
      element.querySelector('[class*="isSending"]') !== null ||
      hasOwnMessageAction(element) ||
      isCurrentDiscordUserSpeaker(speaker)
    );
  }

  function hasOwnMessageAction(element) {
    const actions = Array.from(
      element.querySelectorAll('button, [role="button"], [aria-label], [title]')
    );
    return actions.some((action) => {
      const label = normalizeText(
        [
          action.getAttribute("aria-label"),
          action.getAttribute("title"),
          action.textContent
        ].join(" ")
      );
      return /^(?:Edit|수정)(?:\b|$)/i.test(label);
    });
  }

  function isUsefulSpeaker(value) {
    return Boolean(value && value.length <= 40 && !/^\d{1,2}:\d{2}/.test(value));
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
})(globalThis);
