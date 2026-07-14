(function setupLanguageMinerExtensionI18n(globalScope) {
  function normalizeSubstitutions(substitutions) {
    if (substitutions === undefined || substitutions === null) {
      return [];
    }
    return (Array.isArray(substitutions) ? substitutions : [substitutions]).map((value) =>
      String(value ?? "")
    );
  }

  function formatFallback(message, substitutions) {
    const values = normalizeSubstitutions(substitutions);
    return String(message || "").replace(/\$(\d+)/g, (match, rawIndex) => {
      const index = Number(rawIndex) - 1;
      return index >= 0 && index < values.length ? values[index] : match;
    });
  }

  function getChromeI18n() {
    const candidate = globalScope.chrome?.i18n;
    return candidate && typeof candidate.getMessage === "function" ? candidate : null;
  }

  function t(key, fallback = "", substitutions) {
    const values = normalizeSubstitutions(substitutions);
    try {
      const chromeI18n = getChromeI18n();
      const message = values.length
        ? chromeI18n?.getMessage(key, values)
        : chromeI18n?.getMessage(key);
      if (message) {
        return message;
      }
    } catch {
      // Tests, reloaded extension contexts, and ordinary web pages may not expose chrome.i18n.
    }
    return formatFallback(fallback || key, values);
  }

  function getLocale() {
    try {
      const locale = getChromeI18n()?.getUILanguage?.();
      if (locale) {
        return locale;
      }
    } catch {
      // Fall through to a stable English locale outside a live extension context.
    }
    return "en";
  }

  function localizeDocument(root = globalScope.document) {
    if (!root?.querySelectorAll) {
      return;
    }
    root.querySelectorAll("[data-i18n]").forEach((element) => {
      const key = element.getAttribute("data-i18n") || "";
      element.textContent = t(key, element.textContent?.trim() || key);
    });
    for (const attribute of ["aria-label", "title", "placeholder"]) {
      root.querySelectorAll(`[data-i18n-${attribute}]`).forEach((element) => {
        const key = element.getAttribute(`data-i18n-${attribute}`) || "";
        element.setAttribute(attribute, t(key, element.getAttribute(attribute) || key));
      });
    }
    if (root.documentElement) {
      root.documentElement.lang = getLocale().toLowerCase().startsWith("ko") ? "ko" : "en";
    }
  }

  globalScope.LanguageMinerExtensionI18n = Object.freeze({
    formatFallback,
    getLocale,
    localizeDocument,
    t
  });
})(globalThis);
