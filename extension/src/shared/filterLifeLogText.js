(function setupLifeMinerFiltering(globalScope) {
  const shared = globalScope.LifeMinerShared || {};

  function getLifeLogTextRejectionReason(text, options = {}) {
    const normalizedText = shared.normalizeLifeLogText
      ? shared.normalizeLifeLogText(text)
      : String(text || "").replace(/\u00a0/g, " ").replace(/\r\n?/g, "\n").trim();
    if (!normalizedText) {
      return "empty";
    }
    if (isUrlOnly(normalizedText)) {
      return "url_only";
    }
    if (options.filterLowSignalTargets !== false) {
      if (normalizedText.length < (options.minLength || 4)) {
        return "too_short";
      }
      if (isLowSignalReaction(normalizedText)) {
        return "low_signal_reaction";
      }
      if (isEmojiOnly(normalizedText)) {
        return "emoji_only";
      }
    }
    return null;
  }

  function prepareLifeLogText(text, options = {}) {
    let normalizedText = shared.normalizeLifeLogText
      ? shared.normalizeLifeLogText(text)
      : String(text || "").replace(/\u00a0/g, " ").replace(/\r\n?/g, "\n").trim();
    const maxMessageChars = Math.min(6000, Math.max(300, Number(options.maxMessageChars) || 1500));
    if (normalizedText.length > maxMessageChars) {
      if (options.longMessageMode === "skip" || options.longMessageMode === "summarize") {
        return {
          accepted: false,
          reason: options.longMessageMode === "skip" ? "too_long" : "summary_not_available",
          text: normalizedText
        };
      }
      normalizedText = normalizedText.slice(0, maxMessageChars);
    }
    const reason = getLifeLogTextRejectionReason(normalizedText, options);
    if (reason) {
      return { accepted: false, reason, text: normalizedText };
    }
    return {
      accepted: true,
      text: shared.maskSensitiveText ? shared.maskSensitiveText(normalizedText) : normalizedText
    };
  }

  function isLowSignalReaction(text) {
    const compact = text.replace(/[\s!?.,~…\-_/\\|()[\]{}'"]+/g, "");
    if (!compact || compact.length > 10) {
      return false;
    }
    return /^(ㅋ+|ㅎ+|ㅇ+|ㄱ+|ㄴ+|ㅜ+|ㅠ+)+$/u.test(compact);
  }

  function isEmojiOnly(text) {
    const withoutEmoji = text
      .replace(/\p{Extended_Pictographic}/gu, "")
      .replace(/[\s\p{P}\p{S}\uFE0F]/gu, "");
    return withoutEmoji.length === 0 && /\p{Extended_Pictographic}/u.test(text);
  }

  function isUrlOnly(text) {
    const tokens = text.split(/\s+/).filter(Boolean);
    return tokens.length > 0 && tokens.every((token) => /^https?:\/\/\S+$/i.test(token));
  }

  globalScope.LifeMinerShared = {
    ...shared,
    getLifeLogTextRejectionReason,
    prepareLifeLogText
  };
})(globalThis);
