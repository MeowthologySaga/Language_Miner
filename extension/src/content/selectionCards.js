(function setupSelectionCardPopover(globalScope) {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return;
  }

  const extensionI18n = globalScope.LanguageMinerExtensionI18n;
  const t = (key, fallback = "", substitutions) =>
    extensionI18n?.t(key, fallback, substitutions) || fallback || key;
  const getUiLocale = () => extensionI18n?.getLocale?.() || "en";
  const getUiLanguageTag = () => (getUiLocale().toLowerCase().startsWith("ko") ? "ko" : "en");

  const POPOVER_ID = "lem-selection-card-popover";
  const MIN_SELECTION_LENGTH = 2;
  const MAX_SELECTION_LENGTH = 240;
  const MAX_CONTEXT_LENGTH = 2200;
  const MAX_MULTI_TERMS = 10;
  let popoverHost = null;
  let activePayload = null;
  let activeRect = null;
  let sentenceSession = null;
  let dismissTimer = 0;
  let siteEnabled = true;
  let latestBridgeSettings = null;

  refreshSiteEnabled();
  window.setInterval(refreshSiteEnabled, 30_000);

  document.addEventListener(
    "mouseup",
    (event) => {
      if (popoverHost?.contains(event.target)) {
        return;
      }
      window.setTimeout(showPopoverFromSelection, 0);
    },
    true
  );
  document.addEventListener(
    "keyup",
    (event) => {
      if (event.key === "Escape") {
        dismissPopover();
        return;
      }
      window.setTimeout(showPopoverFromSelection, 0);
    },
    true
  );
  document.addEventListener(
    "mousedown",
    (event) => {
      if (popoverHost?.contains(event.target)) {
        return;
      }
      window.clearTimeout(dismissTimer);
      dismissTimer = window.setTimeout(() => {
        const selectionText = globalScope.getSelection?.().toString().trim() || "";
        if (!selectionText) {
          dismissPopover();
        }
      }, 120);
    },
    true
  );

  function showPopoverFromSelection() {
    if (!siteEnabled) {
      dismissPopover();
      return;
    }

    const snapshot = getSelectionSnapshot();
    if (!snapshot) {
      return;
    }

    activePayload = snapshot.payload;
    activeRect = snapshot.rect;
    sentenceSession = null;
    const host = ensurePopover();
    positionPopover(host, snapshot.rect, 284, 170);
    host.style.display = "block";
    renderActionPopover("ready");
    refreshActiveBridgeSettings("single");
  }

  function getSelectionSnapshot() {
    const selection = globalScope.getSelection?.();
    const selectedText = normalizeText(selection?.toString() || "");
    if (
      !selection ||
      selection.rangeCount === 0 ||
      selectedText.length < MIN_SELECTION_LENGTH ||
      selectedText.length > MAX_SELECTION_LENGTH
    ) {
      return null;
    }

    const range = selection.getRangeAt(0);
    if (isEditableNode(range.commonAncestorContainer)) {
      return null;
    }

    const rect = getRangeRect(range);
    if (!rect) {
      return null;
    }

    const focusedText = getFocusedSelectionText(range, selectedText);
    const contextBlock = findContextBlock(range.commonAncestorContainer);
    const fullText = normalizeText(getElementText(contextBlock)).slice(0, MAX_CONTEXT_LENGTH);
    const sentenceContext = extractSentenceContext(
      focusedText || fullText || selectedText,
      selectedText
    );
    return {
      rect,
      payload: {
        selectedText,
        sourceSentence: sentenceContext.sourceSentence,
        beforeContext: sentenceContext.beforeSentence,
        afterContext: sentenceContext.afterSentence,
        pageTextContext: fullText || focusedText,
        appName: getAppName(),
        metadata: {
          url: location.href,
          title: document.title,
          trigger: "selection_popover",
          capturedAt: new Date().toISOString(),
          extensionVersion: getExtensionVersion()
        }
      }
    };
  }

  function ensurePopover() {
    if (popoverHost?.isConnected) {
      return popoverHost;
    }

    popoverHost = document.createElement("div");
    popoverHost.id = POPOVER_ID;
    popoverHost.lang = getUiLanguageTag();
    popoverHost.style.position = "fixed";
    popoverHost.style.zIndex = "2147483647";
    popoverHost.style.display = "none";
    popoverHost.addEventListener(
      "wheel",
      (event) => {
        event.stopPropagation();
      },
      { passive: true }
    );
    popoverHost.attachShadow({ mode: "open" });
    document.documentElement.appendChild(popoverHost);
    return popoverHost;
  }

  function renderActionPopover(state, message) {
    const shadow = popoverHost?.shadowRoot;
    if (!shadow || !activePayload) {
      return;
    }
    const usageEstimate = estimateBrowserSelectionCardUsage(activePayload, latestBridgeSettings);

    shadow.innerHTML = `
      ${baseStyles()}
      <div class="box compact" role="group" aria-label="${escapeAttribute(
        t("selectionCreateCard", "Sentence card")
      )}">
        <span class="term">${escapeHtml(activePayload.selectedText)}</span>
        <div class="usage-action-row">
          ${renderUsageEstimateBadge(usageEstimate)}
          <button class="primary" data-action="card" type="button">
            <span>${escapeHtml(t("selectionCreateCard", "Sentence card"))}</span><span>${escapeHtml(
              t("actionCreate", "Create")
            )}</span>
          </button>
        </div>
        <button data-action="multi" type="button">
          <span>${escapeHtml(t("selectionMultipleTerms", "Multiple terms"))}</span><span>${escapeHtml(
            t("actionSelect", "Select")
          )}</span>
        </button>
        <button data-action="close" type="button">
          <span>${escapeHtml(t("actionClose", "Close"))}</span><span>${escapeHtml(
            t("keyboardEscape", "Esc")
          )}</span>
        </button>
        <div class="status ${statusClass(state)}" role="status" aria-live="polite">${escapeHtml(
          message || statusMessage(state)
        )}</div>
      </div>
    `;
    shadow.querySelector('[data-action="card"]').addEventListener("click", () => {
      void createSentenceCard(activePayload, "single");
    });
    shadow.querySelector('[data-action="multi"]').addEventListener("click", startMultiTermFlow);
    shadow.querySelector('[data-action="close"]').addEventListener("click", dismissPopover);
  }

  function startMultiTermFlow() {
    if (!activePayload) {
      return;
    }

    sentenceSession = {
      payload: activePayload,
      terms: normalizeTermList([activePayload.selectedText]),
      warning: ""
    };
    if (activeRect && popoverHost) {
      positionPopover(popoverHost, activeRect, 364, 300);
    }
    renderSentencePopover();
    refreshActiveBridgeSettings("multi");
  }

  function renderSentencePopover(state = "ready", message = "") {
    const shadow = popoverHost?.shadowRoot;
    if (!shadow || !sentenceSession) {
      return;
    }

    const sentence = sentenceSession.payload.sourceSentence || sentenceSession.payload.selectedText;
    const tokens = tokenizeSentence(sentence);
    const termSet = new Set(sentenceSession.terms.map((term) => term.toLowerCase()));
    const tokenHtml = tokens
      .map((token, index) => {
        if (!token.isWord) {
          return `<span class="punct">${escapeHtml(token.text)}</span>`;
        }
        const selected = termSet.has(token.text.toLowerCase());
        return `<button class="word ${selected ? "selected" : ""}" data-word-index="${index}" type="button">${escapeHtml(
          token.text
        )}</button>`;
      })
      .join("");
    const chips = sentenceSession.terms
      .map(
        (term) =>
          `<button class="chip" data-remove-term="${escapeAttribute(
            term
          )}" type="button" aria-label="${escapeAttribute(
            t("selectionRemoveTermAria", "Remove $1", term)
          )}">${escapeHtml(term)}<span aria-hidden="true">×</span></button>`
      )
      .join("");
    const usageEstimate = estimateBrowserSelectionCardUsage(
      buildMultiTermPayload(),
      latestBridgeSettings
    );

    shadow.innerHTML = `
      ${baseStyles()}
      <div class="box sentence" role="group" aria-label="${escapeAttribute(
        t("selectionMultipleTerms", "Multiple terms")
      )}">
        <div class="sentence-head">
          <strong>${escapeHtml(t("selectionMultipleTerms", "Multiple terms"))}</strong>
          <span>${sentenceSession.terms.length}/${MAX_MULTI_TERMS}</span>
        </div>
        <div class="sentence-text">${tokenHtml}</div>
        <div class="chips">${chips}</div>
        <div class="sentence-actions">
          <div class="usage-action-row">
            ${renderUsageEstimateBadge(usageEstimate)}
            <button class="primary" data-action="multi-card" type="button">
              <span>${escapeHtml(
                t("selectionCreateSentenceCard", "Create sentence card")
              )}</span><span>${escapeHtml(t("actionCreate", "Create"))}</span>
            </button>
          </div>
          <button data-action="back" type="button">
            <span>${escapeHtml(t("actionBack", "Back"))}</span><span></span>
          </button>
        </div>
        <div class="status ${statusClass(state)}" role="status" aria-live="polite">${escapeHtml(
          message ||
            sentenceSession.warning ||
            t("selectionChooseTermsHint", "Select more terms in the sentence.")
        )}</div>
      </div>
    `;

    shadow.querySelectorAll("[data-word-index]").forEach((button) => {
      button.addEventListener("click", () => {
        const token = tokens[Number(button.getAttribute("data-word-index"))];
        if (token?.isWord) {
          toggleSentenceTerm(token.text);
        }
      });
    });
    shadow.querySelectorAll("[data-remove-term]").forEach((button) => {
      button.addEventListener("click", () => {
        removeSentenceTerm(button.getAttribute("data-remove-term") || "");
      });
    });
    shadow.querySelector('[data-action="multi-card"]').addEventListener("click", () => {
      void createSentenceCard(buildMultiTermPayload(), "multi");
    });
    shadow.querySelector('[data-action="back"]').addEventListener("click", () => {
      sentenceSession = null;
      renderActionPopover("ready");
    });
  }

  function toggleSentenceTerm(term) {
    if (!sentenceSession) {
      return;
    }
    const normalized = cleanTerm(term);
    if (!normalized) {
      return;
    }

    const exists = sentenceSession.terms.some(
      (candidate) => candidate.toLowerCase() === normalized.toLowerCase()
    );
    if (exists) {
      sentenceSession = {
        ...sentenceSession,
        terms: sentenceSession.terms.filter(
          (candidate) => candidate.toLowerCase() !== normalized.toLowerCase()
        ),
        warning: ""
      };
      renderSentencePopover();
      return;
    }

    if (sentenceSession.terms.length >= MAX_MULTI_TERMS) {
      sentenceSession = {
        ...sentenceSession,
        warning: t(
          "selectionMaxTermsWarning",
          "You can select up to $1 terms.",
          String(MAX_MULTI_TERMS)
        )
      };
      renderSentencePopover("error");
      return;
    }

    sentenceSession = {
      ...sentenceSession,
      terms: [...sentenceSession.terms, normalized],
      warning: ""
    };
    renderSentencePopover();
  }

  function removeSentenceTerm(term) {
    if (!sentenceSession) {
      return;
    }
    sentenceSession = {
      ...sentenceSession,
      terms: sentenceSession.terms.filter(
        (candidate) => candidate.toLowerCase() !== term.toLowerCase()
      ),
      warning: ""
    };
    renderSentencePopover();
  }

  function buildMultiTermPayload() {
    if (!sentenceSession) {
      return activePayload;
    }
    const terms = normalizeTermList(sentenceSession.terms).slice(0, MAX_MULTI_TERMS);
    return {
      ...sentenceSession.payload,
      selectedText: terms.join(", ")
    };
  }

  async function createSentenceCard(payload, mode) {
    if (!payload) {
      return;
    }

    getBridgeSettings((settings) => {
      if (!isSelectionSiteEnabled(settings.browserCaptureSiteSettings)) {
        const errorMessage = t(
          "selectionSiteDisabled",
          "Web selection cards are disabled for this site."
        );
        if (mode === "multi") {
          renderSentencePopover("error", errorMessage);
        } else {
          renderActionPopover("error", errorMessage);
        }
        return;
      }
      const action =
        settings.browserSelectionCardMode === "autoSave" ? "save" : "preview";
      submitSentenceCard(payload, mode, action);
    });
  }

  function submitSentenceCard(payload, mode, action) {
    if (mode === "multi") {
      renderSentencePopover(
        "saving",
        action === "save"
          ? t("cardSaving", "Saving card…")
          : t("cardCreating", "Creating card…")
      );
    } else {
      renderActionPopover(
        "saving",
        action === "save"
          ? t("cardSaving", "Saving card…")
          : t("cardCreating", "Creating card…")
      );
    }

    sendRuntimeMessage(
      {
        type: "LEM_SENTENCE_CARD_CAPTURE",
        payload: {
          ...payload,
          action
        }
      },
      (response) => {
        if (response?.ok && response?.preview && response?.card) {
          renderResultPopover(response.card, payload, mode, response.providerStatus);
          return;
        }

        const okMessage = response?.queued
          ? t("cardQueued", "The card will be saved automatically when the app opens.")
          : response?.duplicate
            ? t("cardDuplicate", "This card has already been saved.")
            : t("cardSaved", "Saved to Cards.");

        if (response?.ok) {
          if (mode === "multi") {
            renderSentencePopover("ok", okMessage);
          } else {
            renderActionPopover("ok", okMessage);
          }
          globalScope.getSelection?.().removeAllRanges();
          window.setTimeout(dismissPopover, 1000);
          return;
        }

        const errorMessage = response?.error || t("cardSaveFailed", "Could not save the card.");
        if (mode === "multi") {
          renderSentencePopover("error", errorMessage);
        } else {
          renderActionPopover("error", errorMessage);
        }
      }
    );
  }

  function renderResultPopover(card, payload, mode, providerStatus = null) {
    const shadow = popoverHost?.shadowRoot;
    if (!shadow) {
      return;
    }
    if (popoverHost && activeRect) {
      positionPopover(popoverHost, activeRect, 680, 600, { bottomSafe: 156 });
    }
    shadow.innerHTML = `
      ${baseStyles()}
      <div class="box result" role="group" aria-label="${escapeAttribute(
        t("cardReviewAll", "Review the complete sentence card")
      )}">
        <div class="result-head">
          <div>
            <span>${escapeHtml(t("cardResult", "Generated card"))}</span>
            <strong>${escapeHtml(
              t("cardReviewAll", "Review the complete sentence card")
            )}</strong>
          </div>
          <button class="icon" data-action="close" type="button" aria-label="${escapeAttribute(
            t("actionClose", "Close")
          )}"><span aria-hidden="true">×</span></button>
        </div>
        ${renderResultUsageEstimate(providerStatus?.usageEstimate)}
        <div class="result-actions">
          <button class="primary" data-action="save" type="button">
            <span>${escapeHtml(t("actionSave", "Save"))}</span><span>${escapeHtml(
              t("cardsLabel", "Cards")
            )}</span>
          </button>
          <button data-action="back" type="button">
            <span>${escapeHtml(t("actionChooseAgain", "Choose again"))}</span><span></span>
          </button>
        </div>
        <div class="result-scroll">
          ${renderResultSection(
            t("cardFront", "Front"),
            card.frontText || card.sourceSentence || payload.sourceSentence || "",
            "front",
            card,
            "source"
          )}
          ${renderResultSection(t("cardLiteralTranslation", "Literal translation"), card.literalTranslationKo || "", "literal", card, "literal")}
          ${renderResultSection(t("cardNaturalMeaning", "Natural meaning"), card.naturalTranslationKo || "", "natural", card, "natural")}
          ${renderResultVocabulary(card)}
          ${isInputReadingCard(card) ? "" : renderResultSection(t("cardSentenceStructure", "Sentence structure"), card.structureNote || "", "note")}
          ${renderResultComparisons(card)}
          ${isInputReadingCard(card) ? "" : renderResultPumpPrompts(card)}
          ${isInputReadingCard(card) ? renderResultSection(t("cardSource", "Source"), card.structureNote || "", "note") : ""}
        </div>
        <div class="status" role="status" aria-live="polite">${escapeHtml(
          getProviderStatusMessage(providerStatus)
        )}</div>
      </div>
    `;
    shadow.querySelector('[data-action="save"]').addEventListener("click", () => {
      submitSentenceCard(payload, mode, "save");
    });
    bindResultVocabularyInteractions(shadow, card);
    shadow.querySelector('[data-action="back"]').addEventListener("click", () => {
      if (mode === "multi") {
        renderSentencePopover("ready");
      } else {
        renderActionPopover("ready");
      }
    });
    shadow.querySelector('[data-action="close"]').addEventListener("click", dismissPopover);
  }

  function renderResultSection(title, text, variant = "", card = null, target = "") {
    const normalized = normalizeText(text);
    if (!normalized) {
      return "";
    }
    return `
      <section class="result-card ${escapeAttribute(variant)}">
        <small>${escapeHtml(title)}</small>
        ${renderResultParagraphs(normalized, card, target)}
      </section>
    `;
  }

  function renderResultParagraphs(text, card = null, target = "") {
    return String(text)
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `<p>${renderHighlightedText(line, card, target)}</p>`)
      .join("");
  }

  function renderResultVocabulary(card) {
    const items = Array.isArray(card.vocabularyItems) ? card.vocabularyItems : [];
    if (!items.length) {
      return "";
    }
    if (isInputReadingCard(card)) {
      return renderInputResultVocabulary(items);
    }
    const chips = items
      .map((item) => `<span class="result-chip">${escapeHtml(item.term || "")}</span>`)
      .join("");
    const details = items
      .map((item) => {
        const examples = Array.isArray(item.examples)
          ? item.examples
              .filter(Boolean)
              .map((example) => `<li>${escapeHtml(example)}</li>`)
              .join("")
          : "";
        return `
          <article class="result-vocab-item">
            <strong>${escapeHtml(item.term || "")}</strong>
            <span>${escapeHtml([item.ipa, item.partOfSpeech].filter(Boolean).join(" · "))}</span>
            ${item.basicMeaningKo ? `<p>${escapeHtml(item.basicMeaningKo)}</p>` : ""}
            ${item.meaningInContextKo ? `<p>${escapeHtml(item.meaningInContextKo)}</p>` : ""}
            ${item.etymologyKo ? `<p>${escapeHtml(item.etymologyKo)}</p>` : ""}
            ${renderUsagePatterns(item)}
            ${examples ? `<ul>${examples}</ul>` : ""}
          </article>
        `;
      })
      .join("");
    return `
      <section class="result-card vocab">
        <small>${escapeHtml(t("cardSelectedWords", "Selected terms"))}</small>
        <div class="result-terms">${chips}</div>
        <div class="result-vocab-list">${details}</div>
      </section>
    `;
  }

  function renderInputResultVocabulary(items) {
    if (items.length === 1) {
      return `
        <section class="result-input-vocab result-input-single">
          ${renderResultVocabularyDetail(items[0], t("cardOneExpression", "1 expression"))}
        </section>
      `;
    }
    if (items.length === 2) {
      return `
        <section class="result-input-vocab result-input-grid-two">
          ${items.map((item) => renderResultVocabularyDetail(item)).join("")}
        </section>
      `;
    }
    return `
      <section class="result-input-vocab result-input-master-detail">
        <div class="result-input-list" aria-label="${escapeAttribute(
          t("cardExpressionListAria", "Expression list")
        )}">
          ${items
            .map(
              (item, index) => `
                <button class="result-input-list-item ${index === 0 ? "active" : ""}" data-result-vocab-index="${index}" type="button" aria-pressed="${index === 0 ? "true" : "false"}">
                  <strong>${escapeHtml(item.term || "")}</strong>
                  <span>${escapeHtml(item.basicMeaningKo || "")}</span>
                </button>
              `
            )
            .join("")}
        </div>
        <div class="result-input-detail-list" data-result-vocab-detail>
          ${renderResultVocabularyDetail(
            items[0],
            t("cardSelectedDetails", "Selected expression details")
          )}
        </div>
      </section>
    `;
  }

  function renderResultVocabularyDetail(item, badge = "") {
    const examples = Array.isArray(item.examples)
      ? item.examples
          .filter(Boolean)
          .map((example) => `<li>${escapeHtml(example)}</li>`)
          .join("")
      : "";
    const meta = [item.ipa, item.partOfSpeech].filter(Boolean).join(" · ");
    return `
      <article class="result-input-detail-card border-${escapeAttribute(item.colorKey || "red")}">
        <div class="result-input-detail-head">
          <div>
            <strong class="result-input-term text-${escapeAttribute(item.colorKey || "red")}">${escapeHtml(item.term || "")}</strong>
            ${meta ? `<span>${escapeHtml(meta)}</span>` : ""}
          </div>
          ${badge ? `<em>${escapeHtml(badge)}</em>` : ""}
        </div>
        <div class="result-input-meaning-grid">
          <div>
            <small>${escapeHtml(t("cardBasicMeaning", "Basic meaning"))}</small>
            <p>${escapeHtml(item.basicMeaningKo || "")}</p>
          </div>
          ${
            item.meaningInContextKo
              ? `<div><small>${escapeHtml(
                  t("cardContextMeaning", "Meaning in context")
                )}</small><p>${escapeHtml(item.meaningInContextKo)}</p></div>`
              : ""
          }
        </div>
        ${renderInputSubsection(t("cardEtymologyStructure", "Etymology / structure"), item.etymologyKo ? `<p>${escapeHtml(item.etymologyKo)}</p>` : "")}
        ${renderInputSubsection(t("cardUsagePatterns", "Usage patterns / collocations"), renderUsagePatterns(item))}
        ${renderInputSubsection(t("cardExamples", "Examples"), examples ? `<ul>${examples}</ul>` : "")}
      </article>
    `;
  }

  function bindResultVocabularyInteractions(shadow, card) {
    if (!isInputReadingCard(card)) {
      return;
    }
    const items = Array.isArray(card.vocabularyItems) ? card.vocabularyItems : [];
    const detail = shadow.querySelector("[data-result-vocab-detail]");
    const buttons = Array.from(shadow.querySelectorAll("[data-result-vocab-index]"));
    if (!detail || buttons.length === 0) {
      return;
    }

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.getAttribute("data-result-vocab-index"));
        const item = Number.isFinite(index) ? items[index] : null;
        if (!item) {
          return;
        }
        buttons.forEach((candidate) => {
          const isActive = candidate === button;
          candidate.classList.toggle("active", isActive);
          candidate.setAttribute("aria-pressed", isActive ? "true" : "false");
        });
        detail.innerHTML = renderResultVocabularyDetail(
          item,
          t("cardSelectedDetails", "Selected expression details")
        );
      });
    });
  }

  function renderInputSubsection(title, body) {
    if (!body) {
      return "";
    }
    return `
      <div class="result-input-subsection">
        <h4>${escapeHtml(title)}</h4>
        ${body}
      </div>
    `;
  }

  function renderUsagePatterns(item) {
    const patterns = Array.isArray(item.usagePatterns) ? item.usagePatterns.filter(Boolean) : [];
    if (!patterns.length) {
      return "";
    }
    return `
      <div class="result-input-patterns">
        ${patterns.map((pattern) => `<code>${escapeHtml(pattern)}</code>`).join("")}
      </div>
    `;
  }

  function renderResultComparisons(card) {
    const comparisons = Array.isArray(card.confusingComparisons) ? card.confusingComparisons : [];
    if (!comparisons.length) {
      return "";
    }
    return `
      <section class="result-card">
        <small>${escapeHtml(
          t("cardConfusingExpressions", "Similar expressions to distinguish")
        )}</small>
        ${comparisons
          .map(
            (comparison) => `
              <article class="result-mini-item">
                <div class="result-comparison-title">
                  ${renderComparisonKindBadge(comparison.kind)}
                  <strong>${escapeHtml(comparison.title || "")}</strong>
                </div>
                <p>${escapeHtml(comparison.explanationKo || "")}</p>
              </article>
            `
          )
          .join("")}
      </section>
    `;
  }

  function renderComparisonKindBadge(kind) {
    const normalized = normalizeComparisonKind(kind);
    if (!normalized) {
      return "";
    }
    return `<span class="comparison-kind kind-${escapeAttribute(normalized)}">${escapeHtml(
      getComparisonKindLabel(normalized)
    )}</span>`;
  }

  function normalizeComparisonKind(kind) {
    return ["similar", "contrast", "nuance", "collocation"].includes(kind) ? kind : "";
  }

  function getComparisonKindLabel(kind) {
    if (kind === "similar") {
      return t("comparisonSimilar", "Similar");
    }
    if (kind === "contrast") {
      return t("comparisonContrast", "Contrast");
    }
    if (kind === "nuance") {
      return t("comparisonNuance", "Nuance");
    }
    if (kind === "collocation") {
      return t("comparisonCollocation", "Collocation");
    }
    return t("comparisonDefault", "Compare");
  }

  function renderResultPumpPrompts(card) {
    const prompts = Array.isArray(card.pumpPrompts) ? card.pumpPrompts : [];
    if (!prompts.length) {
      return "";
    }
    return `
      <section class="result-card">
        <small>${escapeHtml(t("cardWritingPrompts", "Writing practice prompts"))}</small>
        ${prompts
          .map(
            (prompt) => `
              <article class="result-mini-item">
                <strong>${escapeHtml(getPumpPromptLabel(prompt.type))}</strong>
                <p>${escapeHtml(prompt.promptKo || "")}</p>
                ${
                  Array.isArray(prompt.requiredTerms) && prompt.requiredTerms.length
                    ? `<div class="result-terms">${prompt.requiredTerms
                        .map((term) => `<span class="result-chip">${escapeHtml(term)}</span>`)
                        .join("")}</div>`
                    : ""
                }
              </article>
            `
          )
          .join("")}
      </section>
    `;
  }

  function renderResultUsageEstimate(estimate) {
    if (!estimate) {
      return "";
    }
    const items = [
      [t("usageEstimatedCost", "Estimated cost"), estimate.costLabel],
      [t("usageElectricity", "Electricity"), estimate.electricityLabel],
      [t("usageTokens", "Tokens"), estimate.tokenLabel],
      [t("usageRequests", "Requests"), estimate.requestLabel]
    ].filter((item) => item[1]);
    return `
      <div class="result-usage-estimate" aria-label="${escapeAttribute(
        t("usageEstimateAria", "Estimated generation usage")
      )}">
        ${items
          .map(
            ([label, value]) => `
              <div>
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(value)}</strong>
              </div>
            `
          )
          .join("")}
        ${
          estimate.runtimeLabel || estimate.note
            ? `<p>${escapeHtml([estimate.runtimeLabel, estimate.note].filter(Boolean).join(" · "))}</p>`
            : ""
        }
      </div>
    `;
  }

  function renderUsageEstimateBadge(estimate) {
    if (!estimate) {
      return "";
    }
    const rows = [
      [t("usageEstimatedCost", "Estimated cost"), estimate.costLabel],
      [t("usageElectricity", "Electricity"), estimate.electricityLabel],
      [t("usageTokens", "Tokens"), estimate.tokenLabel],
      [t("usageRequests", "Requests"), estimate.requestLabel]
    ].filter((item) => item[1]);
    return `
      <span class="usage-inline">
        <span class="usage-badge" aria-label="${escapeAttribute(
          t(
            "usageEstimateWithCostAria",
            "Estimated generation cost: $1",
            estimate.costLabel
          )
        )}" tabindex="0">
          ${escapeHtml(
            t("usageEstimatedInline", "Est. $1", estimate.costLabel)
          )}
          <span aria-hidden="true">ⓘ</span>
        </span>
        <span class="usage-tooltip" role="tooltip">
          <span class="usage-tooltip-title">${escapeHtml(
            t("usageEstimateTitle", "Generation estimate")
          )}</span>
          ${rows
            .map(
              ([label, value]) => `
                <span class="usage-tooltip-row">
                  <span>${escapeHtml(label)}</span>
                  <strong>${escapeHtml(value)}</strong>
                </span>
              `
            )
            .join("")}
          ${
            estimate.note
              ? `<span class="usage-tooltip-note">${escapeHtml(estimate.note)}</span>`
              : ""
          }
        </span>
      </span>
    `;
  }

  function refreshActiveBridgeSettings(mode) {
    getBridgeSettings((settings) => {
      latestBridgeSettings = settings;
      siteEnabled = isSelectionSiteEnabled(settings.browserCaptureSiteSettings);
      if (!siteEnabled) {
        dismissPopover();
        return;
      }
      if (mode === "multi" && sentenceSession) {
        renderSentencePopover();
        return;
      }
      if (mode === "single" && activePayload && !sentenceSession) {
        renderActionPopover("ready");
      }
    });
  }

  function estimateBrowserSelectionCardUsage(payload, settings) {
    if (!payload || !settings?.browserCardProvider) {
      return null;
    }

    const provider = settings.browserCardProvider;
    const providerName =
      provider.providerName === "ollama"
        ? "local"
        : provider.providerName === "gemini"
          ? "gemini"
          : "fallback";
    const requestCount =
      providerName === "fallback" ? 0 : providerName === "gemini" ? 4 : 1;
    const profile = provider.learningProfile || {};
    const sourceLang = profile.targetLanguage?.code || "en";
    const targetLang = profile.nativeLanguage?.code || "ko";
    const estimateText = [
      `Selected: ${payload.selectedText || ""}`,
      `Source: ${payload.sourceSentence || ""}`,
      payload.beforeContext ? `Before: ${payload.beforeContext}` : "",
      payload.afterContext ? `After: ${payload.afterContext}` : "",
      payload.pageTextContext ? `Context: ${String(payload.pageTextContext).slice(0, 2200)}` : ""
    ]
      .filter(Boolean)
      .join("\n");
    const inputRange = estimateExtensionTokenRange(estimateText);
    const overhead = requestCount > 0 ? { min: 450, max: 1100 } : { min: 0, max: 0 };
    const inputTokens =
      requestCount === 0
        ? { min: 0, max: 0 }
        : {
            min: (inputRange.min + overhead.min) * requestCount,
            max: (inputRange.max + overhead.max) * requestCount
          };
    const outputRatio = getExtensionOutputTokenRatio(sourceLang, targetLang);
    const outputTokens = {
      min: Math.ceil(inputTokens.min * outputRatio.min),
      max: Math.ceil(inputTokens.max * outputRatio.max)
    };
    const totalTokens = {
      min: inputTokens.min + outputTokens.min,
      max: inputTokens.max + outputTokens.max
    };
    const costKrw = estimateExtensionCostKrw({
      providerName,
      model: String(provider.model || ""),
      plan: provider.geminiPlan === "paid" ? "paid" : "free",
      inputTokens,
      outputTokens
    });
    const electricity = estimateExtensionElectricity(providerName, totalTokens.max, requestCount);

    return {
      costLabel: formatExtensionKrwValue(costKrw),
      electricityLabel: formatExtensionElectricityValue(electricity),
      tokenLabel: t(
        "usageTokenCount",
        "$1 tokens",
        requestCount > 0 ? formatExtensionCompactNumber(totalTokens.max) : "0"
      ),
      requestLabel: t("usageRequestCount", "$1 requests", String(requestCount)),
      note: getExtensionUsageProviderLabel(provider)
    };
  }

  function estimateExtensionTokenRange(text) {
    const compact = String(text || "").replace(/\s+/g, " ").trim();
    if (!compact) {
      return { min: 0, max: 0 };
    }
    let ascii = 0;
    let cjk = 0;
    let other = 0;
    for (const char of compact) {
      if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(char)) {
        cjk += 1;
      } else if (/[\x00-\x7f]/u.test(char)) {
        ascii += 1;
      } else {
        other += 1;
      }
    }
    return {
      min: Math.max(1, Math.ceil(ascii / 4.8 + cjk / 1.8 + other / 3.4)),
      max: Math.max(1, Math.ceil(ascii / 3.2 + cjk / 1.05 + other / 2.2))
    };
  }

  function getExtensionOutputTokenRatio(sourceLang, targetLang) {
    if (sourceLang === "en" && targetLang === "ko") {
      return { min: 0.65, max: 1.35 };
    }
    if (targetLang === "en") {
      return { min: 0.85, max: 1.65 };
    }
    return { min: 0.75, max: 1.5 };
  }

  function estimateExtensionCostKrw({ providerName, model, plan, inputTokens, outputTokens }) {
    if (providerName !== "gemini") {
      return 0;
    }
    const pricing = globalThis.LanguageMinerGeminiPricing;
    if (typeof pricing?.estimateConservativeGeminiCostKrw === "function") {
      return pricing.estimateConservativeGeminiCostKrw({
        model,
        plan,
        inputTokens: inputTokens.max,
        outputTokens: outputTokens.max
      });
    }

    // Fail closed with the high unknown/future-model rate if the shared helper
    // is unexpectedly unavailable. Never fall back to a cheap model price.
    const costKrw =
      ((inputTokens.max / 1_000_000) * 4 + (outputTokens.max / 1_000_000) * 18) * 1400;
    return costKrw <= 0 ? 0 : Math.max(1, Math.ceil(costKrw * 1.25));
  }

  function estimateExtensionElectricity(providerName, totalTokens, requestCount) {
    if (providerName !== "local") {
      return 0;
    }
    const runtimeSeconds = Math.max(0, totalTokens) / 18 + Math.max(0, requestCount) * 0.8;
    const kwh = (350 / 1000) * (runtimeSeconds / 3600);
    return Math.round(kwh * 200 * 10) / 10;
  }

  function formatExtensionKrwValue(value) {
    if (value <= 0) {
      return t("currencyKrwZero", "₩0");
    }
    if (value < 1) {
      return t("currencyKrwUnderOne", "Under ₩1");
    }
    return t(
      "currencyKrwAmount",
      "₩$1",
      Math.round(value).toLocaleString(getUiLocale())
    );
  }

  function formatExtensionElectricityValue(value) {
    if (value <= 0) {
      return t("currencyKrwZero", "₩0");
    }
    if (value < 1) {
      return t("currencyKrwUnderOne", "Under ₩1");
    }
    return t(
      "currencyKrwAmount",
      "₩$1",
      value.toLocaleString(getUiLocale(), { maximumFractionDigits: 1 })
    );
  }

  function formatExtensionCompactNumber(value) {
    if (value >= 1_000_000) {
      return `${trimExtensionTrailingZero(value / 1_000_000)}M`;
    }
    if (value >= 1_000) {
      return `${trimExtensionTrailingZero(value / 1_000)}k`;
    }
    return String(Math.round(value));
  }

  function trimExtensionTrailingZero(value) {
    return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
  }

  function getExtensionUsageProviderLabel(provider) {
    if (provider.providerName === "gemini") {
      return provider.geminiPlan === "paid"
        ? t("providerGeminiPaid", "Gemini paid-tier estimate")
        : t("providerGeminiFree", "Gemini free-tier setting");
    }
    if (provider.providerName === "ollama") {
      return t("providerOllamaLocal", "Ollama local-run estimate");
    }
    return t("providerDefault", "Basic card generation");
  }

  function getPumpPromptLabel(type) {
    if (type === "ko_to_en") {
      return t("promptSpeakFromCue", "Speak from the cue");
    }
    if (type === "make_sentence") {
      return t("promptMakeSentence", "Make a sentence");
    }
    return t("promptSituationQuestion", "Situation question");
  }

  function isInputReadingCard(card) {
    return card?.cardType === "reading" && (card.deckType || "input") === "input";
  }

  function getProviderStatusMessage(providerStatus) {
    if (!providerStatus) {
      return t("providerReviewBeforeSave", "Review the whole card before saving it.");
    }
    if (providerStatus.providerName === "gemini") {
      return t(
        "providerGeneratedGemini",
        "Generated with Gemini$1.",
        providerStatus.model ? ` (${providerStatus.model})` : ""
      );
    }
    if (providerStatus.providerName === "ollama") {
      return t(
        "providerGeneratedOllama",
        "Generated with Ollama$1.",
        providerStatus.model ? ` (${providerStatus.model})` : ""
      );
    }
    return providerStatus.reason
      ? t(
          "providerFallbackReason",
          "The provider failed, so a basic card was created: $1",
          providerStatus.reason
        )
      : t(
          "providerFallback",
          "The provider failed, so a basic card was created."
        );
  }

  function renderHighlightedText(text, card, target) {
    if (!card || !target) {
      return escapeHtml(text);
    }
    const matches = findHighlightMatches(text, getDisplayHighlightMappings(card), target);
    if (!matches.length) {
      return escapeHtml(text);
    }

    let cursor = 0;
    let html = "";
    for (const match of matches) {
      if (match.start > cursor) {
        html += escapeHtml(text.slice(cursor, match.start));
      }
      html += `<mark class="highlight highlight-${escapeAttribute(match.colorKey)}">${escapeHtml(
        text.slice(match.start, match.end)
      )}</mark>`;
      cursor = match.end;
    }
    if (cursor < text.length) {
      html += escapeHtml(text.slice(cursor));
    }
    return html;
  }

  function findHighlightMatches(text, mappings, target) {
    if (!Array.isArray(mappings)) {
      return [];
    }
    const matches = [];
    for (const mapping of mappings) {
      const value = getHighlightValue(mapping, target).trim();
      if (!value) {
        continue;
      }
      const exactMatches = findExactHighlightMatches(
        text,
        value,
        mapping.colorKey || "red",
        target
      );
      if (exactMatches.length) {
        matches.push(...exactMatches);
        continue;
      }
      if (target !== "source") {
        matches.push(
          ...findTranslationFallbackMatches(text, value, mapping.colorKey || "red")
        );
      }
    }
    return matches
      .sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))
      .reduce((accepted, match) => {
        const overlaps = accepted.some(
          (existing) => match.start < existing.end && match.end > existing.start
        );
        return overlaps ? accepted : [...accepted, match];
      }, []);
  }

  function getDisplayHighlightMappings(card) {
    const mappingsBySource = new Map();
    if (Array.isArray(card?.highlightMappings)) {
      for (const mapping of card.highlightMappings) {
        const key = normalizeHighlightSourceKey(mapping?.sourceText);
        if (!key) {
          continue;
        }
        mappingsBySource.set(key, {
          ...mapping,
          sourceText: String(mapping.sourceText || "").trim()
        });
      }
    }

    if (Array.isArray(card?.vocabularyItems)) {
      for (const item of card.vocabularyItems) {
        const key = normalizeHighlightSourceKey(item?.term);
        if (!key) {
          continue;
        }
        const existing = mappingsBySource.get(key);
        mappingsBySource.set(key, {
          sourceText: existing?.sourceText || item.term,
          literalKo: existing?.literalKo || item.basicMeaningKo || item.meaningInContextKo,
          naturalKo: existing?.naturalKo || item.meaningInContextKo || item.basicMeaningKo,
          colorKey: existing?.colorKey || item.colorKey || "red"
        });
      }
    }

    return Array.from(mappingsBySource.values());
  }

  function normalizeHighlightSourceKey(value) {
    return String(value || "").trim().toLowerCase();
  }

  function findExactHighlightMatches(text, value, colorKey, target) {
    const regex = new RegExp(escapeRegExp(value), target === "source" ? "gi" : "g");
    const matches = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        colorKey
      });
      if (match[0].length === 0) {
        regex.lastIndex += 1;
      }
    }
    return matches;
  }

  function findTranslationFallbackMatches(text, value, colorKey) {
    for (const fallbackValue of getTranslationFallbackValues(value)) {
      const index = text.indexOf(fallbackValue);
      if (index >= 0) {
        return [
          {
            start: index,
            end: index + fallbackValue.length,
            colorKey
          }
        ];
      }
    }
    return [];
  }

  function getTranslationFallbackValues(value) {
    const tokens = String(value || "")
      .replace(/[()[\]{}"'“”‘’.,!?;:·•/]+/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);
    const values = [];
    for (let size = Math.min(3, tokens.length); size >= 1; size -= 1) {
      for (let index = 0; index <= tokens.length - size; index += 1) {
        const phrase = tokens.slice(index, index + size).join(" ");
        if (isUsefulTranslationFallbackValue(phrase, size)) {
          values.push(phrase);
        }
      }
    }
    return Array.from(new Set(values)).sort((left, right) => right.length - left.length);
  }

  function isUsefulTranslationFallbackValue(value, tokenCount) {
    if (tokenCount === 1 && value.length < 2) {
      return false;
    }
    const compact = value.replace(/\s+/g, "");
    if (compact.length < 2) {
      return false;
    }
    return !/^(?:\uac83|\uac83\ub3c4|\uc218|\ub54c|\ub4ef|\ubc0f|\ub610\ub294|\uadf8\ub9ac\uace0|\ud558\uc9c0\ub9cc|\uc815\ub3c4|\uc0c1\ud0dc|\ud604\uc7ac|\uc120\ud0dd|\uae30\ubcf8|\ubb38\ub9e5|\uc758\ubbf8)$/.test(
      value
    );
  }

  function getHighlightValue(mapping, target) {
    if (target === "literal") {
      return String(mapping?.literalKo || "");
    }
    if (target === "natural") {
      return String(mapping?.naturalKo || "");
    }
    return String(mapping?.sourceText || "");
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function getBridgeSettings(callback) {
    sendRuntimeMessage(
      {
        type: "LEM_GET_BRIDGE_SETTINGS"
      },
      (response) => {
        callback({
          browserCaptureSiteSettings: response?.browserCaptureSiteSettings || {},
          browserSelectionCardMode:
            response?.browserSelectionCardMode === "autoSave" ? "autoSave" : "preview",
          browserCardProvider: response?.browserCardProvider || null
        });
      }
    );
  }

  function refreshSiteEnabled() {
    getBridgeSettings((settings) => {
      latestBridgeSettings = settings;
      siteEnabled = isSelectionSiteEnabled(settings.browserCaptureSiteSettings);
      if (!siteEnabled) {
        dismissPopover();
      }
    });
  }

  function isSelectionSiteEnabled(settings) {
    const key = getSelectionSiteKey();
    return settings?.[key] !== false;
  }

  function getSelectionSiteKey() {
    const host = location.hostname.replace(/^www\./, "").toLowerCase();
    if (host.includes("youtube.com")) {
      return "youtube";
    }
    if (host.includes("reddit.com")) {
      return "reddit";
    }
    if (host.includes("discord.com")) {
      return "discord";
    }
    if (host.includes("chatgpt.com")) {
      return "chatgpt";
    }
    if (host.includes("claude.ai")) {
      return "claude";
    }
    return "genericWeb";
  }

  function sendRuntimeMessage(message, callback) {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          callback({
            ok: false,
            error:
              runtimeError.message ||
              t(
                "runtimeContextReloaded",
                "The extension was reloaded. Reload this page and try again."
              )
          });
          return;
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

  function dismissPopover() {
    if (popoverHost) {
      popoverHost.style.display = "none";
    }
    activePayload = null;
    activeRect = null;
    sentenceSession = null;
  }

  function positionPopover(host, rect, width, estimatedHeight, options = {}) {
    const safeMargin = 12;
    const bottomSafe = Math.max(safeMargin, Number(options.bottomSafe) || safeMargin);
    const panelHeight = Math.min(estimatedHeight, Math.max(120, window.innerHeight - safeMargin - bottomSafe));
    const topAbove = rect.top - panelHeight - 8;
    const topBelow = rect.bottom + 8;
    const topLimit = Math.max(safeMargin, window.innerHeight - panelHeight - bottomSafe);
    const top = topAbove > safeMargin ? topAbove : Math.min(topLimit, topBelow);
    const left = Math.min(
      window.innerWidth - width - safeMargin,
      Math.max(safeMargin, rect.left + rect.width / 2 - width / 2)
    );
    host.style.top = `${Math.max(safeMargin, top)}px`;
    host.style.left = `${Math.max(safeMargin, left)}px`;
  }

  function getRangeRect(range) {
    const rects = Array.from(range.getClientRects()).filter(
      (rect) => rect.width > 0 && rect.height > 0
    );
    if (rects.length === 0) {
      const rect = range.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 ? rect : null;
    }
    return rects[rects.length - 1];
  }

  function getFocusedSelectionText(range, selectedText) {
    const normalizedSelectedText = normalizeText(selectedText);
    if (!normalizedSelectedText) {
      return "";
    }

    const focusedBlock = findFocusedTextBlock(range);
    const focusedText = normalizeText(getElementText(focusedBlock));
    if (textContainsSelection(focusedText, normalizedSelectedText)) {
      return focusedText;
    }

    const startText = normalizeText(getElementText(range.startContainer?.parentElement));
    if (textContainsSelection(startText, normalizedSelectedText)) {
      return startText;
    }

    return "";
  }

  function findFocusedTextBlock(range) {
    const selectors = [
      "h1",
      "h2",
      "h3",
      "h4",
      "p",
      "blockquote",
      "li",
      "figcaption",
      "caption",
      "[slot='title']",
      "[data-adclicklocation='title']",
      "[data-testid='post-title']",
      "[data-testid='tweetText']",
      "yt-formatted-string",
      "#content-text"
    ].join(", ");
    let element =
      range.startContainer?.nodeType === Node.ELEMENT_NODE
        ? range.startContainer
        : range.startContainer?.parentElement;
    while (element && element !== document.body) {
      if (element.matches?.(selectors)) {
        return element;
      }
      element = element.parentElement;
    }
    return null;
  }

  function textContainsSelection(text, selectedText) {
    return Boolean(
      text &&
        selectedText &&
        text.toLowerCase().includes(selectedText.toLowerCase()) &&
        text.length <= Math.max(280, selectedText.length * 12)
    );
  }

  function findContextBlock(node) {
    let element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    while (element && element !== document.body) {
      if (
        element.matches?.(
          [
            "p",
            "article",
            "section",
            "main",
            "blockquote",
            "li",
            "yt-formatted-string",
            "#content-text",
            "ytd-comment-thread-renderer",
            "[data-testid='comment']",
            "[data-testid='tweetText']",
            "[data-testid]",
            "[role='article']"
          ].join(", ")
        )
      ) {
        return element;
      }
      element = element.parentElement;
    }
    return document.body;
  }

  function getElementText(element) {
    if (!element) {
      return "";
    }
    if (element === document.body) {
      return globalScope.getSelection?.().toString() || "";
    }
    return element.innerText || element.textContent || "";
  }

  function extractSentenceContext(fullText, selectedText) {
    const normalizedFullText = normalizeText(fullText);
    const normalizedSelectedText = normalizeText(selectedText);
    const selectedIndex = normalizedFullText
      .toLowerCase()
      .indexOf(normalizedSelectedText.toLowerCase());
    const spans = splitSentences(normalizedFullText);
    const spanIndex = spans.findIndex(
      (span) => selectedIndex >= span.start && selectedIndex < span.end
    );
    if (spanIndex >= 0) {
      return {
        sourceSentence: spans[spanIndex].text,
        beforeSentence: spans[spanIndex - 1]?.text,
        afterSentence: spans[spanIndex + 1]?.text
      };
    }
    const focusedLine = findFocusedLine(normalizedFullText, normalizedSelectedText);
    if (focusedLine) {
      return {
        sourceSentence: focusedLine
      };
    }
    return {
      sourceSentence: normalizedFullText || normalizedSelectedText
    };
  }

  function findFocusedLine(fullText, selectedText) {
    if (!fullText || !selectedText) {
      return "";
    }
    return (
      fullText
        .split(/[\r\n]+| {2,}/)
        .map((line) => normalizeText(line))
        .filter(Boolean)
        .filter((line) => line.toLowerCase().includes(selectedText.toLowerCase()))
        .sort((a, b) => a.length - b.length)[0] || ""
    );
  }

  function splitSentences(text) {
    const spans = [];
    let start = 0;
    for (let index = 0; index < text.length; index += 1) {
      if (!/[.!?\n\r…。！？]/.test(text[index])) {
        continue;
      }
      const end = /[\n\r]/.test(text[index]) ? index : index + 1;
      const sentence = text.slice(start, end).trim();
      if (sentence) {
        spans.push({ text: sentence, start, end });
      }
      start = end;
      while (start < text.length && /\s/.test(text[start])) {
        start += 1;
      }
    }
    const remainder = text.slice(start).trim();
    if (remainder) {
      spans.push({ text: remainder, start, end: text.length });
    }
    return spans;
  }

  function tokenizeSentence(sentence) {
    const tokens = [];
    const matcher = /[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu;
    let cursor = 0;
    let match;
    while ((match = matcher.exec(sentence)) !== null) {
      if (match.index > cursor) {
        tokens.push({ text: sentence.slice(cursor, match.index), isWord: false });
      }
      tokens.push({ text: match[0], isWord: true });
      cursor = match.index + match[0].length;
    }
    if (cursor < sentence.length) {
      tokens.push({ text: sentence.slice(cursor), isWord: false });
    }
    return tokens;
  }

  function normalizeTermList(terms) {
    const normalizedTerms = [];
    for (const term of terms) {
      const normalized = cleanTerm(term);
      if (
        normalized &&
        !normalizedTerms.some((candidate) => candidate.toLowerCase() === normalized.toLowerCase())
      ) {
        normalizedTerms.push(normalized);
      }
    }
    return normalizedTerms.slice(0, MAX_MULTI_TERMS);
  }

  function cleanTerm(term) {
    return normalizeText(term).replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  }

  function isEditableNode(node) {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    if (!element) {
      return false;
    }
    return Boolean(
      element.closest?.("input, textarea, select, [contenteditable='true'], [contenteditable='']")
    );
  }

  function getAppName() {
    const host = location.hostname.replace(/^www\./, "");
    if (host.includes("youtube.com")) {
      return "YouTube";
    }
    if (host.includes("reddit.com")) {
      return "Reddit";
    }
    return host || "Browser";
  }

  function getExtensionVersion() {
    try {
      return chrome.runtime.getManifest().version;
    } catch {
      return "unknown";
    }
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  function statusClass(state) {
    return state === "ok" ? "ok" : state === "error" ? "error" : "";
  }

  function statusMessage(state) {
    if (state === "saving") {
      return t("cardSaving", "Saving card…");
    }
    if (state === "ok") {
      return t("cardSaved", "Saved to Cards.");
    }
    return t("selectionReady", "Save the selected sentence as a card.");
  }

  function baseStyles() {
    return `
      <style>
        :host { all: initial; }
        .box {
          box-sizing: border-box;
          border: 1px solid #c8d7ea;
          border-radius: 10px;
          background: #ffffff;
          box-shadow: 0 18px 44px rgba(15, 23, 42, .18);
          color: #172033;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          overflow: hidden;
        }
        .box *,
        .box *::before,
        .box *::after {
          box-sizing: border-box;
        }
        .box.compact { width: 268px; }
        .box.sentence { display: grid; gap: 9px; width: 340px; padding: 12px; }
        .box.result {
          display: grid;
          gap: 10px;
          grid-template-rows: auto auto auto minmax(0, 1fr) auto;
          height: min(600px, calc(100vh - 168px));
          width: min(660px, calc(100vw - 24px));
          max-width: calc(100vw - 24px);
          max-height: calc(100vh - 168px);
          overflow-x: hidden;
          padding: 12px;
        }
        .term {
          display: block;
          padding: 10px 12px 8px;
          border-bottom: 1px solid #edf2f7;
          color: #0f172a;
          font-size: 13px;
          font-weight: 800;
          line-height: 1.35;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        button {
          display: flex;
          width: 100%;
          min-height: 38px;
          align-items: center;
          justify-content: space-between;
          border: 0;
          background: #ffffff;
          color: #172033;
          cursor: pointer;
          font: inherit;
          font-size: 13px;
          font-weight: 750;
          padding: 0 12px;
          text-align: left;
        }
        button:hover { background: #eff6ff; color: #1769e0; }
        button.primary { color: #1769e0; }
        .usage-action-row {
          position: relative;
          display: flex;
          align-items: center;
          min-width: 0;
          gap: 7px;
          padding: 7px 8px;
        }
        .box.compact .usage-action-row {
          border-bottom: 1px solid #edf2f7;
        }
        .usage-action-row button {
          flex: 1 1 auto;
          min-width: 0;
          border: 1px solid #d8e3f0;
          border-radius: 8px;
          padding: 0 10px;
        }
        .usage-action-row button.primary {
          border-color: #16a34a;
          background: #22c55e;
          color: #ffffff;
        }
        .usage-action-row button.primary:hover {
          background: #16a34a;
          color: #ffffff;
        }
        .usage-inline {
          position: relative;
          display: inline-flex;
          flex: 0 0 auto;
          min-width: 0;
        }
        .usage-badge {
          display: inline-flex;
          align-items: center;
          min-height: 28px;
          gap: 4px;
          border: 1px solid #bbf7d0;
          border-radius: 999px;
          background: #ecfdf5;
          color: #15803d;
          cursor: help;
          padding: 0 8px;
          font-size: 12px;
          font-weight: 850;
          line-height: 1;
          white-space: nowrap;
        }
        .usage-badge:focus-visible {
          outline: 2px solid rgba(34, 197, 94, .45);
          outline-offset: 2px;
        }
        .usage-tooltip {
          position: absolute;
          left: 0;
          bottom: calc(100% + 8px);
          z-index: 3;
          display: grid;
          width: min(218px, calc(100vw - 28px));
          gap: 7px;
          border: 1px solid #d8e3f0;
          border-radius: 8px;
          background: #ffffff;
          box-shadow: 0 16px 34px rgba(15, 23, 42, .18);
          opacity: 0;
          padding: 10px;
          pointer-events: none;
          transform: translateY(4px);
          transition: opacity 120ms ease, transform 120ms ease;
        }
        .usage-tooltip::after {
          position: absolute;
          left: 18px;
          bottom: -6px;
          width: 10px;
          height: 10px;
          border-right: 1px solid #d8e3f0;
          border-bottom: 1px solid #d8e3f0;
          background: #ffffff;
          content: "";
          transform: rotate(45deg);
        }
        .usage-inline:hover .usage-tooltip,
        .usage-inline:focus-within .usage-tooltip,
        .usage-action-row:hover .usage-tooltip,
        .usage-action-row:focus-within .usage-tooltip {
          opacity: 1;
          transform: translateY(0);
        }
        .usage-tooltip-title {
          color: #0f172a;
          font-size: 12px;
          font-weight: 850;
        }
        .usage-tooltip-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          color: #64748b;
          font-size: 12px;
          line-height: 1.25;
        }
        .usage-tooltip-row strong {
          color: #0f172a;
          font-weight: 850;
          text-align: right;
        }
        .usage-tooltip-note {
          border-top: 1px solid #edf2f7;
          color: #64748b;
          padding-top: 7px;
          font-size: 11px;
          line-height: 1.35;
        }
        button.icon {
          width: 30px;
          min-height: 30px;
          justify-content: center;
          border: 1px solid #d8e3f0;
          border-radius: 8px;
          color: #526173;
          font-size: 18px;
          padding: 0;
        }
        .status {
          border-top: 1px solid #edf2f7;
          color: #526173;
          font-size: 12px;
          line-height: 1.35;
          padding: 8px 12px 10px;
        }
        .status.ok { color: #16813f; }
        .status.error { color: #c2410c; }
        .sentence .status {
          margin: 0 -12px -12px;
        }
        .sentence-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .sentence-head strong {
          color: #0f172a;
          font-size: 14px;
        }
        .sentence-head span {
          border: 1px solid #d8e3f0;
          border-radius: 999px;
          background: #f8fbff;
          color: #526173;
          padding: 3px 8px;
          font-size: 12px;
          font-weight: 800;
        }
        .sentence-text {
          max-height: 136px;
          overflow: auto;
          border: 1px solid #d8e3f0;
          border-radius: 8px;
          background: #f8fbff;
          color: #172033;
          font-size: 13px;
          line-height: 1.75;
          padding: 9px;
        }
        .word {
          display: inline-flex;
          width: auto;
          min-height: 24px;
          margin: 1px;
          border: 1px solid transparent;
          border-radius: 6px;
          background: transparent;
          color: #172033;
          padding: 0 4px;
          font-size: inherit;
          font-weight: 700;
          vertical-align: baseline;
        }
        .word:hover {
          border-color: #bfdbfe;
          background: #eff6ff;
          color: #1769e0;
        }
        .word.selected {
          border-color: #93c5fd;
          background: #dbeafe;
          color: #1d4ed8;
        }
        .punct { white-space: pre-wrap; }
        .chips {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          min-height: 24px;
        }
        .chip {
          display: inline-flex;
          width: auto;
          min-height: 26px;
          gap: 5px;
          border: 1px solid #bfdbfe;
          border-radius: 999px;
          background: #eff6ff;
          color: #1d4ed8;
          padding: 0 8px;
          font-size: 12px;
          font-weight: 800;
        }
        .chip span { color: #475569; }
        .sentence-actions {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 86px;
          gap: 7px;
        }
        .sentence-actions .usage-action-row {
          min-width: 0;
          padding: 0;
        }
        .sentence-actions button {
          justify-content: center;
          gap: 6px;
          border: 1px solid #d8e3f0;
          border-radius: 8px;
        }
        .sentence-actions button.primary {
          border-color: #1769e0;
          background: #1769e0;
          color: #ffffff;
        }
        .sentence-actions button.primary:hover {
          background: #155dc4;
          color: #ffffff;
        }
        .result-head {
          display: flex;
          align-items: start;
          justify-content: space-between;
          gap: 12px;
          flex-shrink: 0;
        }
        .result-head span,
        .result-card small,
        .result-terms small {
          display: block;
          color: #64748b;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .02em;
          text-transform: uppercase;
        }
        .result-head strong {
          display: block;
          margin-top: 2px;
          color: #0f172a;
          font-size: 15px;
        }
        .result-scroll {
          display: grid;
          gap: 9px;
          min-height: 0;
          overflow-x: hidden;
          overflow-y: auto;
          overscroll-behavior: contain;
          padding-right: 3px;
        }
        .result-card {
          min-width: 0;
          border: 1px solid #d8e3f0;
          border-radius: 9px;
          background: #f8fbff;
          padding: 9px;
        }
        .result-card.natural {
          background: #f0fdf4;
          border-color: #bbf7d0;
        }
        .result-card.literal {
          background: #fff7ed;
          border-color: #fed7aa;
        }
        .result-card.vocab {
          background: #f8fafc;
        }
        .result-card p {
          margin: 4px 0 0;
          color: #172033;
          font-size: 13px;
          line-height: 1.5;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .result-terms {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          margin-top: 5px;
        }
        .result-chip {
          border: 1px solid #bfdbfe;
          border-radius: 999px;
          background: #eff6ff;
          color: #1d4ed8;
          padding: 3px 8px;
          font-size: 12px;
          font-weight: 800;
        }
        .result-vocab-list {
          display: grid;
          gap: 7px;
          margin-top: 8px;
        }
        .result-vocab-item,
        .result-mini-item {
          border-top: 1px solid #e2e8f0;
          padding-top: 7px;
        }
        .result-vocab-item strong,
        .result-mini-item strong {
          display: block;
          color: #0f172a;
          font-size: 13px;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .result-comparison-title {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
        }
        .result-comparison-title strong {
          min-width: 0;
        }
        .comparison-kind {
          flex: 0 0 auto;
          border: 1px solid #cfe0f3;
          border-radius: 999px;
          background: #f7fbff;
          color: #245184;
          padding: 2px 6px;
          font-size: 10px;
          font-weight: 850;
          line-height: 1.35;
        }
        .comparison-kind.kind-contrast {
          border-color: #fed7aa;
          background: #fff7ed;
          color: #c2410c;
        }
        .comparison-kind.kind-nuance {
          border-color: #ddd6fe;
          background: #f5f3ff;
          color: #6d28d9;
        }
        .comparison-kind.kind-collocation {
          border-color: #bbf7d0;
          background: #f0fdf4;
          color: #15803d;
        }
        .result-vocab-item span {
          display: block;
          margin-top: 2px;
          color: #64748b;
          font-size: 12px;
        }
        .result-vocab-item ul {
          margin: 6px 0 0 16px;
          padding: 0;
          color: #334155;
          font-size: 12px;
          line-height: 1.45;
        }
        .highlight {
          border-radius: 4px;
          padding: 0 3px;
          font-weight: 850;
        }
        .highlight-red { background: #fee2e2; color: #991b1b; }
        .highlight-orange { background: #ffedd5; color: #9a3412; }
        .highlight-blue { background: #dbeafe; color: #1d4ed8; }
        .highlight-purple { background: #ede9fe; color: #6d28d9; }
        .highlight-green { background: #dcfce7; color: #15803d; }
        .highlight-pink { background: #fce7f3; color: #be185d; }
        .highlight-cyan { background: #cffafe; color: #0e7490; }
        .highlight-yellow { background: #fef9c3; color: #854d0e; }
        .highlight-lime { background: #ecfccb; color: #4d7c0f; }
        .highlight-slate { background: #e2e8f0; color: #334155; }
        .text-red { color: #b91c1c; }
        .text-orange { color: #c2410c; }
        .text-blue { color: #1d4ed8; }
        .text-purple { color: #7c3aed; }
        .text-green { color: #15803d; }
        .text-pink { color: #be185d; }
        .text-cyan { color: #0e7490; }
        .text-yellow { color: #a16207; }
        .text-lime { color: #4d7c0f; }
        .text-slate { color: #334155; }
        .border-red { border-left-color: #ef4444; }
        .border-orange { border-left-color: #f97316; }
        .border-blue { border-left-color: #3b82f6; }
        .border-purple { border-left-color: #8b5cf6; }
        .border-green { border-left-color: #22c55e; }
        .border-pink { border-left-color: #ec4899; }
        .border-cyan { border-left-color: #06b6d4; }
        .border-yellow { border-left-color: #eab308; }
        .border-lime { border-left-color: #84cc16; }
        .border-slate { border-left-color: #64748b; }
        .result-input-vocab {
          display: grid;
          gap: 8px;
          min-width: 0;
          border: 1px solid #d8e3f0;
          border-radius: 9px;
          background: #ffffff;
          padding: 9px;
        }
        .result-input-grid-two {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .result-input-master-detail {
          grid-template-columns: 150px minmax(0, 1fr);
          align-items: start;
        }
        .result-input-list,
        .result-input-detail-list {
          display: grid;
          gap: 7px;
          min-width: 0;
        }
        .result-input-list-item {
          display: grid;
          align-items: start;
          gap: 3px;
          justify-content: stretch;
          width: 100%;
          min-height: 0;
          border: 1px solid #d8e3f0;
          border-radius: 8px;
          background: #f8fbff;
          color: inherit;
          padding: 8px;
          text-align: left;
        }
        .result-input-list-item:hover {
          border-color: #bfdbfe;
          background: #eff6ff;
          color: inherit;
        }
        .result-input-list-item.active {
          border-color: #93c5fd;
          background: #eff6ff;
          box-shadow: inset 3px 0 0 #3b82f6;
        }
        .result-input-list-item strong {
          color: #0f172a;
          font-size: 12px;
          line-height: 1.25;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .result-input-list-item span {
          color: #64748b;
          font-size: 11px;
          line-height: 1.35;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .result-input-detail-card {
          display: grid;
          gap: 8px;
          min-width: 0;
          border: 1px solid #d8e3f0;
          border-left-width: 3px;
          border-radius: 8px;
          background: #ffffff;
          padding: 9px;
        }
        .result-input-detail-head {
          display: flex;
          align-items: start;
          justify-content: space-between;
          gap: 8px;
        }
        .result-input-detail-head > div {
          min-width: 0;
        }
        .result-input-detail-head span {
          display: block;
          margin-top: 2px;
          color: #64748b;
          font-size: 11px;
        }
        .result-input-detail-head em {
          border: 1px solid #bfdbfe;
          border-radius: 999px;
          background: #eff6ff;
          color: #1d4ed8;
          padding: 3px 7px;
          font-size: 11px;
          font-style: normal;
          font-weight: 850;
          white-space: nowrap;
        }
        .result-input-term {
          display: block;
          font-size: 16px;
          line-height: 1.2;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .result-input-meaning-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 7px;
        }
        .result-input-meaning-grid > div {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #f8fafc;
          padding: 8px;
        }
        .result-input-meaning-grid small,
        .result-input-subsection h4 {
          display: block;
          margin: 0 0 4px;
          color: #64748b;
          font-size: 11px;
          font-weight: 850;
        }
        .result-input-meaning-grid p,
        .result-input-subsection p {
          margin: 0;
          color: #172033;
          font-size: 12px;
          line-height: 1.45;
        }
        .result-input-subsection {
          border-top: 1px solid #e2e8f0;
          padding-top: 8px;
        }
        .result-input-patterns {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
        }
        .result-input-patterns code {
          min-width: 0;
          max-width: 100%;
          border: 1px solid #d8e3f0;
          border-radius: 6px;
          background: #f8fbff;
          color: #334155;
          padding: 3px 6px;
          font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
          font-size: 11px;
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .result-input-subsection ul {
          margin: 0 0 0 16px;
          padding: 0;
          color: #334155;
          font-size: 12px;
          line-height: 1.45;
        }
        .result-input-subsection li {
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        @media (max-width: 560px) {
          .result-input-grid-two,
          .result-input-master-detail,
          .result-input-meaning-grid {
            grid-template-columns: 1fr;
          }
        }
        .result-actions {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 96px;
          gap: 7px;
          flex-shrink: 0;
        }
        .result-actions button {
          justify-content: center;
          gap: 6px;
          border: 1px solid #d8e3f0;
          border-radius: 8px;
        }
        .result-actions button.primary {
          border-color: #16a34a;
          background: #22c55e;
          color: #ffffff;
        }
        .result-actions button.primary:hover {
          background: #16a34a;
          color: #ffffff;
        }
        .result-usage-estimate {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 6px;
          min-width: 0;
          border: 1px solid #d8e3f0;
          border-radius: 9px;
          background: #f8fbff;
          padding: 8px;
        }
        .result-usage-estimate div {
          min-width: 0;
        }
        .result-usage-estimate span {
          display: block;
          color: #64748b;
          font-size: 10px;
          font-weight: 850;
          line-height: 1.2;
        }
        .result-usage-estimate strong {
          display: block;
          margin-top: 2px;
          color: #0f172a;
          font-size: 12px;
          font-weight: 850;
          line-height: 1.25;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .result-usage-estimate p {
          grid-column: 1 / -1;
          margin: 0;
          color: #64748b;
          font-size: 11px;
          line-height: 1.35;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        @media (max-width: 420px) {
          .result-usage-estimate {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      </style>
    `;
  }
})(globalThis);
