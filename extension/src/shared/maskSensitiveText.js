(function setupLifeMinerMasking(globalScope) {
  function normalizeLifeLogText(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n?/g, "\n")
      .trim();
  }

  function maskSensitiveText(text) {
    return normalizeLifeLogText(text)
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
      .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, "[token]")
      .replace(/\bgh[pousr]_[0-9A-Za-z_]{20,}\b/g, "[token]")
      .replace(/\bxox[baprs]-[0-9A-Za-z-]{20,}\b/g, "[token]")
      .replace(/\bsk(?:-proj)?-[0-9A-Za-z_-]{16,}\b/g, "[token]")
      .replace(/\beyJ[0-9A-Za-z_-]{20,}\.[0-9A-Za-z_-]{10,}\.[0-9A-Za-z_-]{10,}\b/g, "[token]")
      .replace(
        /\b(api[_-]?key|access[_-]?token|auth[_-]?token|secret|password)\s*[:=]\s*["']?[0-9A-Za-z._~+/=-]{12,}["']?/gi,
        "$1=[secret]"
      )
      .replace(
        /(?<!\w)(?:\+?\d{1,3}[-.\s]?)?(?:\(?0?\d{1,3}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{4}(?!\w)/g,
        "[phone]"
      )
      .replace(/\b\d{9,}\b/g, "[number]");
  }

  globalScope.LifeMinerShared = {
    ...(globalScope.LifeMinerShared || {}),
    normalizeLifeLogText,
    maskSensitiveText
  };
})(globalThis);
