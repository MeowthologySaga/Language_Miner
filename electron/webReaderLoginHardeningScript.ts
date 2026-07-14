export function buildWebReaderLoginHardeningScript() {
  return `
(() => {
  if (window.__LEM_WEB_READER_LOGIN_HARDENING?.installed) {
    window.__LEM_WEB_READER_LOGIN_HARDENING.refresh?.();
    return true;
  }

  const passkeyTextPattern = /(?:passkey|security\\s*key|\\uD328\\uC2A4\\uD0A4|\\uBCF4\\uC548\\s*\\uD0A4|\\uC554\\uD638\\s*\\uD0A4)/i;

  function normalizeText(value) {
    return String(value || "").replace(/\\s+/g, " ").trim();
  }

  function removeWebAuthnAutocomplete(element) {
    const raw = element.getAttribute?.("autocomplete");
    if (!raw || !/webauthn/i.test(raw)) {
      return;
    }
    const next = raw
      .split(/\\s+/)
      .filter((token) => token && token.toLowerCase() !== "webauthn")
      .join(" ")
      .trim();
    if (next) {
      element.setAttribute("autocomplete", next);
    } else {
      element.removeAttribute("autocomplete");
    }
  }

  function improvePasswordFormAutocomplete() {
    const inputs = Array.from(document.querySelectorAll("input"));
    for (const input of inputs) {
      removeWebAuthnAutocomplete(input);
      const type = String(input.getAttribute("type") || "").toLowerCase();
      const name = String(input.getAttribute("name") || input.getAttribute("id") || "").toLowerCase();
      if ((type === "email" || name.includes("email") || name.includes("login")) && !input.getAttribute("autocomplete")) {
        input.setAttribute("autocomplete", "username");
      }
      if (type === "password" && !input.getAttribute("autocomplete")) {
        input.setAttribute("autocomplete", "current-password");
      }
    }
    for (const form of Array.from(document.querySelectorAll("form"))) {
      removeWebAuthnAutocomplete(form);
    }
  }

  function disablePasskeyControls() {
    const candidates = Array.from(
      document.querySelectorAll("button,a,[role='button'],[tabindex],label")
    );
    for (const element of candidates) {
      const text = normalizeText(
        [
          element.getAttribute?.("aria-label"),
          element.getAttribute?.("title"),
          element.textContent
        ]
          .filter(Boolean)
          .join(" ")
      );
      if (!passkeyTextPattern.test(text)) {
        continue;
      }
      element.setAttribute?.("aria-hidden", "true");
      element.setAttribute?.("aria-disabled", "true");
      if ("disabled" in element) {
        element.disabled = true;
      }
      element.style.pointerEvents = "none";
      element.style.display = "none";
    }
  }

  function continueDiscordInBrowser() {
    if (!/\\.discord\\.com$|^discord\\.com$/i.test(location.hostname)) {
      return;
    }
    const bodyText = normalizeText(document.body?.innerText || "");
    if (
      !/(?:Discord\\s*앱\\s*감지됨|Discord\\s*app\\s*detected|Open\\s*Discord)/i.test(bodyText) &&
      !/(?:브라우저에서\\s*계속하기|Continue\\s*in\\s*Browser)/i.test(bodyText)
    ) {
      return;
    }
    const candidates = Array.from(document.querySelectorAll("button,a,[role='button']"));
    const continueButton = candidates.find((element) =>
      /(?:브라우저에서\\s*계속하기|Continue\\s*in\\s*Browser)/i.test(
        normalizeText([element.getAttribute?.("aria-label"), element.textContent].filter(Boolean).join(" "))
      )
    );
    if (continueButton instanceof HTMLElement && !continueButton.dataset.lemClickedContinueBrowser) {
      continueButton.dataset.lemClickedContinueBrowser = "true";
      continueButton.click();
    }
  }

  function patchCredentialsApi() {
    try {
      const credentials = navigator.credentials;
      if (!credentials || credentials.__lemWebReaderPatched) {
        return;
      }
      const originalGet = typeof credentials.get === "function" ? credentials.get.bind(credentials) : null;
      if (originalGet) {
        Object.defineProperty(credentials, "get", {
          configurable: true,
          value(options) {
            if (options?.publicKey || options?.mediation === "conditional") {
              return Promise.reject(new DOMException("Passkey login is disabled inside Language Miner Web Reader.", "NotAllowedError"));
            }
            return originalGet(options);
          }
        });
      }
      Object.defineProperty(credentials, "__lemWebReaderPatched", {
        configurable: true,
        value: true
      });
    } catch {
      // Some pages lock down the credentials object. The UI cleanup still applies.
    }
  }

  function refresh() {
    patchCredentialsApi();
    improvePasswordFormAutocomplete();
    disablePasskeyControls();
    continueDiscordInBrowser();
  }

  const observer = new MutationObserver(refresh);
  observer.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["autocomplete", "aria-label", "title"]
  });
  refresh();

  window.__LEM_WEB_READER_LOGIN_HARDENING = {
    installed: true,
    refresh,
    destroy() {
      observer.disconnect();
    }
  };
  return true;
})()
`;
}
