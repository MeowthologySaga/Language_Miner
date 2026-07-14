(function setupYoutubeDualSubtitles(globalScope) {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return;
  }

  const extensionI18n = globalScope.LanguageMinerExtensionI18n;
  const t = extensionI18n?.t || ((_key, fallback = "") => fallback || _key);
  const getUiLanguageTag = () =>
    (extensionI18n?.getLocale?.() || "en").toLowerCase().startsWith("ko") ? "ko" : "en";

  const STORAGE_KEY = "lemYoutubeDualSubtitlesEnabledV2";
  const CAPTION_SCAN_MS = 450;
  const translationCache = new Map();
  let overlay = null;
  let toggleButton = null;
  let lastCaptionText = "";
  let requestSerial = 0;
  let enabled = readEnabled();
  let siteEnabled = true;

  refreshSiteEnabled();
  ensureUi();
  window.setInterval(tick, CAPTION_SCAN_MS);
  window.setInterval(refreshSiteEnabled, 30_000);
  document.addEventListener("yt-navigate-finish", () => {
    lastCaptionText = "";
    refreshSiteEnabled();
    ensureUi();
  });

  function tick() {
    ensureUi();
    if (!overlay) {
      return;
    }

    if (toggleButton) {
      toggleButton.hidden = !siteEnabled;
    }
    overlay.hidden = !siteEnabled || !enabled;
    if (!siteEnabled || !enabled) {
      return;
    }

    const captionText = readYoutubeCaptionText();
    if (!captionText) {
      renderOverlay("", t("youtubeEnableCc", "Turn on YouTube CC to show dual subtitles."), "idle");
      lastCaptionText = "";
      return;
    }

    if (captionText === lastCaptionText) {
      return;
    }
    lastCaptionText = captionText;
    renderOverlay(captionText, t("youtubeTranslating", "Translating…"), "loading");
    void translateCaption(captionText);
  }

  async function translateCaption(captionText) {
    if (containsKorean(captionText)) {
      renderOverlay(captionText, captionText, "ok");
      return;
    }

    const cached = translationCache.get(captionText);
    if (cached) {
      renderOverlay(captionText, cached, "ok");
      return;
    }

    const serial = ++requestSerial;
    sendRuntimeMessage(
      {
        type: "LEM_TRANSLATE_TEXT",
        payload: {
          text: captionText,
          sourceLang: "en",
          targetLang: "ko"
        }
      },
      (response) => {
        if (serial !== requestSerial || captionText !== lastCaptionText) {
          return;
        }
        if (response?.ok && response.translatedText) {
          rememberTranslation(captionText, response.translatedText);
          renderOverlay(captionText, response.translatedText, "ok");
          return;
        }
        renderOverlay(
          captionText,
          response?.error ||
            t("youtubeLocalMtRequired", "Open the app and make sure Local MT is ready."),
          "error"
        );
      }
    );
  }

  function ensureUi() {
    const player = document.querySelector(".html5-video-player");
    if (!player) {
      return;
    }

    if (!overlay?.isConnected) {
      overlay = document.createElement("div");
      overlay.className = "lem-youtube-dual-subtitles";
      overlay.lang = getUiLanguageTag();
      overlay.innerHTML = `
        <div class="lem-youtube-caption-source"></div>
        <div class="lem-youtube-caption-translation"></div>
      `;
      player.appendChild(overlay);
    }

    if (!toggleButton?.isConnected) {
      toggleButton = document.createElement("button");
      toggleButton.className = "lem-youtube-dual-toggle";
      toggleButton.lang = getUiLanguageTag();
      toggleButton.type = "button";
      toggleButton.addEventListener("click", () => {
        enabled = !enabled;
        localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
        updateToggle();
        if (!enabled) {
          overlay.hidden = true;
        }
      });
      player.appendChild(toggleButton);
    }

    injectStyles();
    updateToggle();
  }

  function renderOverlay(sourceText, translatedText, state) {
    if (!overlay) {
      return;
    }
    overlay.dataset.state = state;
    overlay.querySelector(".lem-youtube-caption-source").textContent = sourceText;
    overlay.querySelector(".lem-youtube-caption-translation").textContent = translatedText;
  }

  function updateToggle() {
    if (!toggleButton) {
      return;
    }
    toggleButton.hidden = !siteEnabled;
    toggleButton.textContent = enabled
      ? t("youtubeSubtitlesOn", "LEM subtitles ON")
      : t("youtubeSubtitlesOff", "LEM subtitles OFF");
    toggleButton.setAttribute(
      "aria-label",
      enabled
        ? t("youtubeToggleOnAria", "Turn Language Miner dual subtitles off")
        : t("youtubeToggleOffAria", "Turn Language Miner dual subtitles on")
    );
    toggleButton.title = toggleButton.getAttribute("aria-label") || "";
    toggleButton.dataset.enabled = enabled ? "true" : "false";
  }

  function readYoutubeCaptionText() {
    const segments = Array.from(document.querySelectorAll(".ytp-caption-segment"))
      .map((segment) => normalizeText(segment.textContent))
      .filter(Boolean);
    return normalizeText(segments.join(" "));
  }

  function sendRuntimeMessage(message, callback) {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        try {
          void chrome.runtime.lastError;
        } catch {
          // Runtime was reloaded.
        }
        callback(response);
      });
    } catch {
      callback({
        ok: false,
        error: t(
          "runtimeContextReloaded",
          "The extension was reloaded. Reload this page and try again."
        )
      });
    }
  }

  function refreshSiteEnabled() {
    sendRuntimeMessage(
      {
        type: "LEM_GET_BRIDGE_SETTINGS"
      },
      (response) => {
        siteEnabled = response?.browserCaptureSiteSettings?.youtube !== false;
        if (!siteEnabled && overlay) {
          overlay.hidden = true;
        }
        updateToggle();
      }
    );
  }

  function rememberTranslation(sourceText, translatedText) {
    translationCache.set(sourceText, translatedText);
    if (translationCache.size > 160) {
      const firstKey = translationCache.keys().next().value;
      translationCache.delete(firstKey);
    }
  }

  function injectStyles() {
    if (document.getElementById("lem-youtube-dual-subtitle-style")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "lem-youtube-dual-subtitle-style";
    style.textContent = `
      .html5-video-player .lem-youtube-dual-subtitles {
        position: absolute;
        left: 50%;
        bottom: 78px;
        z-index: 2147483600;
        width: min(86%, 980px);
        transform: translateX(-50%);
        border: 1px solid rgba(219, 234, 254, .42);
        border-radius: 10px;
        background: rgba(8, 12, 22, .84);
        box-shadow: 0 12px 32px rgba(0, 0, 0, .32);
        color: #fff;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        padding: 10px 14px 12px;
        pointer-events: none;
        text-align: center;
      }
      .html5-video-player .lem-youtube-dual-subtitles[hidden] {
        display: none !important;
      }
      .lem-youtube-caption-source {
        color: #f8fafc;
        font-size: clamp(15px, 1.55vw, 24px);
        font-weight: 800;
        line-height: 1.25;
        text-shadow: 0 2px 4px rgba(0,0,0,.7);
      }
      .lem-youtube-caption-translation {
        margin-top: 5px;
        color: #bfdbfe;
        font-size: clamp(14px, 1.35vw, 21px);
        font-weight: 800;
        line-height: 1.28;
        text-shadow: 0 2px 4px rgba(0,0,0,.7);
      }
      .lem-youtube-dual-subtitles[data-state="error"] .lem-youtube-caption-translation {
        color: #fed7aa;
      }
      .lem-youtube-dual-subtitles[data-state="loading"] .lem-youtube-caption-translation {
        color: #dbeafe;
      }
      .html5-video-player .lem-youtube-dual-toggle {
        position: absolute;
        right: 14px;
        top: 58px;
        z-index: 2147483601;
        min-height: 28px;
        border: 1px solid rgba(219, 234, 254, .5);
        border-radius: 999px;
        background: rgba(15, 23, 42, .72);
        color: #fff;
        cursor: pointer;
        font: 800 12px/1 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        padding: 0 10px;
      }
      .html5-video-player .lem-youtube-dual-toggle[data-enabled="true"] {
        background: rgba(23, 105, 224, .86);
      }
    `;
    document.documentElement.appendChild(style);
  }

  function readEnabled() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === null ? false : saved === "1";
  }

  function containsKorean(text) {
    return /[\uac00-\ud7a3]/.test(text);
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
})(globalThis);
