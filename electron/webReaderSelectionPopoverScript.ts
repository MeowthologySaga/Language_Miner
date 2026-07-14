export const WEB_READER_SELECTION_POPOVER_SCRIPT = String.raw`
(() => {
  const POPOVER_SCRIPT_VERSION = 14;
  const copy = __LEM_WEB_READER_POPOVER_COPY__;
  const POPOVER_ID = "lem-selection-card-popover";
  const api = window.__LEM_WEB_READER_POPOVER;
  if (api && api.version === POPOVER_SCRIPT_VERSION && api.locale === copy.locale) {
    return true;
  }
  if (api && typeof api.hide === "function") {
    try {
      api.hide();
    } catch {
      // Older injected popover APIs may have been torn down by page navigation.
    }
  }
  document.querySelectorAll("#" + POPOVER_ID).forEach((node) => node.remove());

  const MIN_SELECTION_LENGTH = 2;
  const MAX_SELECTION_LENGTH = 240;
  const MAX_MULTI_TERMS = 8;
  const queue = [];
  let host = null;
  let activeSnapshot = null;
  let activeRect = null;
  let pinnedPopoverPosition = null;
  let selectedTerms = [];
  let mode = "action";
  let resultReturnMode = "action";
  let statusTimer = 0;
  let selectionTimer = 0;
  let repositionTimer = 0;
  let suppressSelectionRefreshUntil = 0;
  let isDirtySession = false;

  function normalizeText(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getSelectionSnapshot() {
    const selection = window.getSelection && window.getSelection();
    const selectedText = normalizeText(selection && selection.toString ? selection.toString() : "");
    if (!selection || selection.rangeCount === 0 || selectedText.length < MIN_SELECTION_LENGTH || selectedText.length > MAX_SELECTION_LENGTH) {
      return null;
    }
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      return null;
    }
    const preSelectionRange = document.createRange();
    if (document.body) {
      preSelectionRange.selectNodeContents(document.body);
      preSelectionRange.setEnd(range.startContainer, range.startOffset);
    }
    const textContext = getSelectionTextContext(range, selectedText);
    const fullText = textContext.fullText;
    const selectionOffset = textContext.selectionOffset;
    const sourceSentence = extractSentence(fullText, selectionOffset, selectedText);
    return {
      selectedText,
      sourceSentence,
      fullText: fullText.slice(0, 80000),
      selectionOffset,
      title: document.title || "",
      url: location.href,
      rect: {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      }
    };
  }

  function getRangeElement(range) {
    const node = range && range.startContainer;
    if (!node) {
      return null;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      return node;
    }
    return node.parentElement || null;
  }

  const TEXT_BLOCK_SELECTOR = [
    "p",
    "li",
    "td",
    "th",
    "dd",
    "blockquote",
    "figcaption",
    "caption",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "[slot='title']",
    "[data-testid='post-title']",
    "[data-adclicklocation='title']",
    "[id^='post-title']",
    "shreddit-title",
    "shreddit-post",
    "shreddit-comment"
  ].join(",");

  function getElementText(element) {
    const ownText = normalizeText(element && (element.innerText || element.textContent));
    if (ownText) {
      return ownText;
    }
    return normalizeText(element && element.shadowRoot && element.shadowRoot.textContent);
  }

  function isUsableTextBlock(element, selectedText) {
    if (!element || element === document.body || element === document.documentElement) {
      return false;
    }
    const text = getElementText(element);
    if (!text || !text.toLowerCase().includes(normalizeText(selectedText).toLowerCase())) {
      return false;
    }
    const rect = element.getBoundingClientRect ? element.getBoundingClientRect() : null;
    return !rect || (rect.width > 0 && rect.height > 0);
  }

  function getComposedParentElement(element) {
    if (element && element.parentElement) {
      return element.parentElement;
    }
    const root = element && element.getRootNode ? element.getRootNode() : null;
    return root && root.host instanceof HTMLElement ? root.host : null;
  }

  function findSelectionTextBlock(range, selectedText) {
    const element = getRangeElement(range);
    if (!element) {
      return null;
    }
    const closestBlock = element.closest ? element.closest(TEXT_BLOCK_SELECTOR) : null;
    if (isUsableTextBlock(closestBlock, selectedText)) {
      return closestBlock;
    }

    let candidate = element;
    let fallback = null;
    while (candidate && candidate !== document.body && candidate !== document.documentElement) {
      if (isUsableTextBlock(candidate, selectedText)) {
        const tagName = String(candidate.tagName || "").toLowerCase();
        const text = getElementText(candidate);
        if (candidate.matches?.(TEXT_BLOCK_SELECTOR) || tagName.startsWith("shreddit-")) {
          return candidate;
        }
        if (!fallback && text.length <= 1200) {
          fallback = candidate;
        }
      }
      candidate = getComposedParentElement(candidate);
    }
    return fallback;
  }

  function getSelectionTextContext(range, selectedText) {
    const block = findSelectionTextBlock(range, selectedText);
    if (block) {
      const blockText = getElementText(block);
      let blockOffset = 0;
      try {
        const beforeRange = document.createRange();
        beforeRange.selectNodeContents(block);
        beforeRange.setEnd(range.startContainer, range.startOffset);
        blockOffset = normalizeText(beforeRange.toString()).length;
      } catch {
        blockOffset = 0;
      }
      const closestOffset = findClosestSelectionOffset(blockText, selectedText, blockOffset);
      return {
        fullText: blockText,
        selectionOffset: closestOffset >= 0 ? closestOffset : blockOffset
      };
    }

    const bodyText = normalizeText(document.body && document.body.innerText ? document.body.innerText : "");
    let bodyOffset = 0;
    try {
      const beforeRange = document.createRange();
      beforeRange.selectNodeContents(document.body);
      beforeRange.setEnd(range.startContainer, range.startOffset);
      bodyOffset = normalizeText(beforeRange.toString()).length;
    } catch {
      bodyOffset = 0;
    }
    const closestOffset = findClosestSelectionOffset(bodyText, selectedText, bodyOffset);
    return {
      fullText: bodyText,
      selectionOffset: closestOffset >= 0 ? closestOffset : bodyOffset
    };
  }

  function findClosestSelectionOffset(fullText, selectedText, preferredOffset) {
    const haystack = normalizeText(fullText).toLowerCase();
    const needle = normalizeText(selectedText).toLowerCase();
    if (!haystack || !needle) {
      return -1;
    }
    let bestIndex = -1;
    let bestDistance = Infinity;
    let index = haystack.indexOf(needle);
    while (index >= 0) {
      const distance = Math.abs(index - (Number(preferredOffset) || 0));
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
      index = haystack.indexOf(needle, index + Math.max(1, needle.length));
    }
    return bestIndex;
  }

  function extractSentence(fullText, selectionOffset, selectedText) {
    if (!fullText) {
      return selectedText;
    }
    const closestOffset = findClosestSelectionOffset(fullText, selectedText, selectionOffset);
    const safeOffset = Math.max(
      0,
      Math.min(fullText.length, closestOffset >= 0 ? closestOffset : Number(selectionOffset) || 0)
    );
    const left = fullText.slice(0, safeOffset);
    const right = fullText.slice(safeOffset + selectedText.length);
    const leftBoundary = Math.max(
      left.lastIndexOf("."),
      left.lastIndexOf("!"),
      left.lastIndexOf("?"),
      left.lastIndexOf("\n")
    );
    const rightCandidates = [right.indexOf("."), right.indexOf("!"), right.indexOf("?"), right.indexOf("\n")]
      .filter((index) => index >= 0);
    const rightBoundary = rightCandidates.length ? Math.min(...rightCandidates) : Math.min(220, right.length);
    return normalizeText(
      fullText.slice(leftBoundary + 1, safeOffset + selectedText.length + rightBoundary + 1)
    ) || selectedText;
  }

  function ensurePopover() {
    if (host && host.isConnected) {
      return host;
    }
    host = document.createElement("div");
    host.id = POPOVER_ID;
    host.style.position = "absolute";
    host.style.zIndex = "2147483647";
    host.style.display = "none";
    host.style.pointerEvents = "auto";
    host.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true });
    host.addEventListener("pointerdown", () => suppressSelectionRefresh(1200), true);
    host.addEventListener("pointerup", () => suppressSelectionRefresh(500), true);
    host.addEventListener("click", () => suppressSelectionRefresh(500), true);
    host.attachShadow({ mode: "open" });
    document.documentElement.appendChild(host);
    return host;
  }

  function suppressSelectionRefresh(durationMs) {
    suppressSelectionRefreshUntil = Math.max(
      suppressSelectionRefreshUntil,
      Date.now() + (Number(durationMs) || 500)
    );
  }

  function isPopoverVisible() {
    return Boolean(host && host.isConnected && host.style.display !== "none");
  }

  function isSessionLocked() {
    return Boolean(activeSnapshot && (mode !== "action" || isDirtySession));
  }

  function getCurrentPopoverMetrics() {
    const box = host && host.shadowRoot && host.shadowRoot.querySelector(".box");
    if (!box) {
      return { width: 320, height: 180, bottomSafe: 12 };
    }
    const rect = box.getBoundingClientRect();
    const isResult = box.classList.contains("result");
    return {
      width: Math.max(260, Math.ceil(rect.width) || (isResult ? 680 : mode === "multi" ? 364 : 284)),
      height: Math.max(140, Math.ceil(rect.height) || (isResult ? 600 : mode === "multi" ? 300 : 170)),
      bottomSafe: isResult ? 156 : 12
    };
  }

  function repositionActivePopover() {
    if (!activeSnapshot || !host || !isPopoverVisible()) {
      return false;
    }
    const metrics = getCurrentPopoverMetrics();
    clampPinnedPopover(host, metrics.width, metrics.height, {
      bottomSafe: metrics.bottomSafe
    });
    return true;
  }

  function scheduleRepositionPopover() {
    window.clearTimeout(repositionTimer);
    repositionTimer = window.setTimeout(repositionActivePopover, 40);
  }

  function isSameSnapshot(nextSnapshot) {
    return Boolean(
      activeSnapshot &&
        nextSnapshot &&
        normalizeText(activeSnapshot.selectedText) === normalizeText(nextSnapshot.selectedText) &&
        normalizeText(activeSnapshot.sourceSentence) === normalizeText(nextSnapshot.sourceSentence) &&
        normalizeText(activeSnapshot.url) === normalizeText(nextSnapshot.url)
    );
  }

  function showPopoverFromSelection(options) {
    const allowReplaceLocked = Boolean(options && options.allowReplaceLocked);
    if (isDirtySession) {
      return true;
    }
    if (activeSnapshot && isPopoverVisible() && !allowReplaceLocked) {
      return true;
    }
    const snapshot = getSelectionSnapshot();
    if (!snapshot) {
      const selectionText = normalizeText(window.getSelection && window.getSelection().toString());
      if (!selectionText && !activeSnapshot) {
        dismissPopover();
      }
      return false;
    }
    if (isSameSnapshot(snapshot) && isPopoverVisible()) {
      return true;
    }
    activeSnapshot = snapshot;
    activeRect = snapshot.rect;
    pinnedPopoverPosition = null;
    selectedTerms = [snapshot.selectedText];
    mode = "action";
    isDirtySession = false;
    renderActionPopover("ready");
    return true;
  }

  function scheduleSelectionPopover(allowReplaceLocked) {
    if (Date.now() < suppressSelectionRefreshUntil) {
      return;
    }
    if ((activeSnapshot && isPopoverVisible() && !allowReplaceLocked) || isDirtySession) {
      return;
    }
    window.clearTimeout(selectionTimer);
    selectionTimer = window.setTimeout(
      () => showPopoverFromSelection({ allowReplaceLocked: Boolean(allowReplaceLocked) }),
      120
    );
  }

  function renderActionPopover(state, message) {
    if (!activeSnapshot) {
      return;
    }
    const box = ensurePopover();
    positionPopover(box, activeRect, 284, 170);
    box.shadowRoot.innerHTML =
      baseStyles() +
      '<div class="box compact">' +
      '<span class="term">' + escapeHtml(activeSnapshot.selectedText) + '</span>' +
      '<div class="usage-action-row">' +
      '<span class="usage-badge">' + escapeHtml(copy.cards) + '</span>' +
      '<button class="primary" data-action="card" type="button"><span>' + escapeHtml(copy.sentenceCard) + '</span><span>' + escapeHtml(copy.generate) + '</span></button>' +
      '</div>' +
      '<button data-action="multi" type="button"><span>' + escapeHtml(copy.multipleTerms) + '</span><span>' + escapeHtml(copy.select) + '</span></button>' +
      '<button data-action="close" type="button"><span>' + escapeHtml(copy.close) + '</span><span>Esc</span></button>' +
      '<div class="status ' + statusClass(state) + '">' + escapeHtml(message || statusMessage(state)) + '</div>' +
      '</div>';
    bindAction("[data-action='card']", () => submitCreateCard("single"));
    bindAction("[data-action='multi']", startMultiTermFlow);
    bindAction("[data-action='close']", dismissPopover);
  }

  function startMultiTermFlow() {
    if (!activeSnapshot) {
      return;
    }
    suppressSelectionRefresh(1200);
    isDirtySession = true;
    mode = "multi";
    selectedTerms = normalizeTermList(selectedTerms.length ? selectedTerms : [activeSnapshot.selectedText]);
    renderMultiPopover("ready");
  }

  function renderMultiPopover(state, message) {
    if (!activeSnapshot) {
      return;
    }
    const box = ensurePopover();
    positionPopover(box, activeRect, 364, 300);
    const sentence = activeSnapshot.sourceSentence || activeSnapshot.selectedText;
    const tokens = tokenizeSentence(sentence);
    const termSet = new Set(selectedTerms.map((term) => term.toLowerCase()));
    const tokenHtml = tokens
      .map((token, index) => {
        if (!token.isWord) {
          return '<span class="punct">' + escapeHtml(token.text) + '</span>';
        }
        const selected = termSet.has(token.text.toLowerCase());
        return '<button class="word ' + (selected ? "selected" : "") + '" data-word-index="' + index + '" type="button">' + escapeHtml(token.text) + '</button>';
      })
      .join("");
    const chips = selectedTerms
      .map((term) => '<button class="chip" data-remove-term="' + escapeHtml(term) + '" type="button">' + escapeHtml(term) + '<span>×</span></button>')
      .join("");
    box.shadowRoot.innerHTML =
      baseStyles() +
      '<div class="box sentence">' +
      '<div class="sentence-head"><strong>' + escapeHtml(copy.multipleTerms) + '</strong><span>' + selectedTerms.length + '/' + MAX_MULTI_TERMS + '</span></div>' +
      '<div class="sentence-text">' + tokenHtml + '</div>' +
      '<div class="chips">' + chips + '</div>' +
      '<div class="sentence-actions">' +
      '<div class="usage-action-row"><span class="usage-badge">' + escapeHtml(copy.cards) + '</span><button class="primary" data-action="multi-card" type="button"><span>' + escapeHtml(copy.createSentenceCard) + '</span><span>' + escapeHtml(copy.generate) + '</span></button></div>' +
      '<button data-action="back" type="button"><span>' + escapeHtml(copy.back) + '</span><span></span></button>' +
      '</div>' +
      '<div class="status ' + statusClass(state) + '">' + escapeHtml(message || copy.addWordsHint) + '</div>' +
      '</div>';
    box.shadowRoot.querySelectorAll("[data-word-index]").forEach((button) => {
      button.addEventListener("click", () => {
        const token = tokens[Number(button.getAttribute("data-word-index"))];
        if (token && token.isWord) {
          toggleTerm(token.text);
        }
      });
    });
    box.shadowRoot.querySelectorAll("[data-remove-term]").forEach((button) => {
      button.addEventListener("click", () => removeTerm(button.getAttribute("data-remove-term") || ""));
    });
    bindAction("[data-action='multi-card']", () => submitCreateCard("multi"));
    bindAction("[data-action='back']", () => {
      mode = "action";
      renderActionPopover("ready");
    });
  }

  function renderResultPopover(card) {
    if (!activeSnapshot) {
      return;
    }
    suppressSelectionRefresh(1200);
    isDirtySession = true;
    resultReturnMode = mode === "multi" ? "multi" : "action";
    mode = "result";
    const box = ensurePopover();
    positionPopover(box, activeRect, 680, 600, { bottomSafe: 156 });
    box.shadowRoot.innerHTML =
      baseStyles() +
      '<div class="box result">' +
      '<div class="result-head"><div><span>' + escapeHtml(copy.generatedResult) + '</span><strong>' + escapeHtml(copy.reviewSentenceCard) + '</strong></div><button class="icon" data-action="close" type="button">×</button></div>' +
      '<div class="result-actions"><button class="primary" data-action="save" type="button"><span>' + escapeHtml(copy.save) + '</span><span>' + escapeHtml(copy.cardsDestination) + '</span></button><button data-action="back" type="button"><span>' + escapeHtml(copy.selectAgain) + '</span><span></span></button></div>' +
      '<div class="result-scroll">' +
      renderResultSection(copy.front, card.frontText || card.sourceSentence || "", "", card.highlightMappings, "source") +
      renderResultSection(copy.literalMeaning, card.literalTranslationKo || "", "literal", card.highlightMappings, "literal") +
      renderResultSection(copy.naturalMeaning, card.naturalTranslationKo || "", "natural", card.highlightMappings, "natural") +
      renderVocabulary(card) +
      renderResultSection(copy.sentenceStructure, card.structureNote || "", "note") +
      renderComparisons(card) +
      '</div>' +
      '<div class="status">' + escapeHtml(copy.reviewBeforeSave) + '</div>' +
      '</div>';
    bindAction("[data-action='save']", () => queueAction({ action: "save-preview" }));
    bindAction("[data-action='back']", () => {
      if (resultReturnMode === "multi") {
        mode = "multi";
        renderMultiPopover("ready");
      } else {
        mode = "action";
        renderActionPopover("ready");
      }
    });
    bindAction("[data-action='close']", dismissPopover);
  }

  function renderResultSection(title, text, variant, mappings, target) {
    const normalized = normalizeText(text);
    if (!normalized) {
      return "";
    }
    const content = target
      ? renderHighlightedResultText(normalized, mappings, target)
      : escapeHtml(normalized);
    return '<section class="result-card ' + (variant || "") + '"><small>' + escapeHtml(title) + '</small><p>' + content + '</p></section>';
  }

  function renderHighlightedResultText(text, mappings, target) {
    const items = Array.isArray(mappings) ? mappings : [];
    const candidates = items
      .map((mapping) => ({
        value: normalizeText(
          target === "literal"
            ? mapping && mapping.literalKo
            : target === "natural"
              ? mapping && mapping.naturalKo
              : mapping && mapping.sourceText
        ),
        colorKey: normalizeColorKey(mapping && mapping.colorKey)
      }))
      .filter((candidate) => candidate.value)
      .sort((left, right) => right.value.length - left.value.length);
    const matches = [];
    const comparableText = target === "source" ? text.toLowerCase() : text;
    candidates.forEach((candidate) => {
      const comparableValue = target === "source" ? candidate.value.toLowerCase() : candidate.value;
      let start = comparableText.indexOf(comparableValue);
      while (start >= 0) {
        const end = start + comparableValue.length;
        const overlaps = matches.some((match) => start < match.end && end > match.start);
        if (!overlaps) {
          matches.push({ start, end, colorKey: candidate.colorKey });
        }
        start = comparableText.indexOf(comparableValue, Math.max(end, start + 1));
      }
    });
    matches.sort((left, right) => left.start - right.start);
    if (!matches.length) {
      return escapeHtml(text);
    }
    let cursor = 0;
    let html = "";
    matches.forEach((match) => {
      html += escapeHtml(text.slice(cursor, match.start));
      html += '<mark class="highlight highlight-' + match.colorKey + '">' +
        escapeHtml(text.slice(match.start, match.end)) +
        '</mark>';
      cursor = match.end;
    });
    return html + escapeHtml(text.slice(cursor));
  }

  function renderVocabulary(card) {
    const items = Array.isArray(card.vocabularyItems) ? card.vocabularyItems : [];
    if (!items.length) {
      return "";
    }
    const visibleItems = items.slice(0, 8);
    return '<section class="result-vocab-section">' +
      '<div class="result-section-head"><strong>' + escapeHtml(copy.keyVocabulary) + '</strong><span>' + visibleItems.length + escapeHtml(copy.termCountSuffix) + '</span></div>' +
      '<div class="' + (visibleItems.length === 1 ? "result-vocab-detail-single" : "result-vocab-detail-grid") + '">' +
      visibleItems.map((item) => renderVocabularyDetail(item)).join("") +
      '</div>' +
      '</section>';
    return '<section class="result-card vocab"><small>' + escapeHtml(copy.keyVocabulary) + '</small><div class="result-vocab-list">' +
      items.slice(0, 8).map((item) =>
        '<div class="result-vocab-item"><strong>' + escapeHtml(item.term || "") + '</strong><span>' + escapeHtml(item.meaningInContextKo || item.basicMeaningKo || "") + '</span></div>'
      ).join("") +
      '</div></section>';
  }

  function renderVocabularyDetail(item) {
    const colorKey = normalizeColorKey(item && item.colorKey);
    const meta = [item && item.ipa, item && item.partOfSpeech].map(normalizeText).filter(Boolean).join(" · ");
    const basicMeaning = normalizeText(item && item.basicMeaningKo);
    const contextMeaning = normalizeText(item && item.meaningInContextKo);
    const etymology = normalizeText(item && item.etymologyKo);
    const patterns = Array.isArray(item && item.usagePatterns)
      ? item.usagePatterns.map(normalizeText).filter(Boolean).slice(0, 6)
      : [];
    const examples = Array.isArray(item && item.examples)
      ? item.examples.map(normalizeText).filter(Boolean).slice(0, 4)
      : [];
    return '<article class="result-vocab-detail border-' + colorKey + '">' +
      '<div class="result-vocab-detail-head">' +
      '<div><h4 class="text-' + colorKey + '">' + escapeHtml(item && item.term ? item.term : "term") + '</h4>' +
      (meta ? '<p>' + escapeHtml(meta) + '</p>' : '') +
      '</div>' +
      '</div>' +
      '<div class="result-vocab-meaning-grid">' +
      renderVocabularyMeaningCard(copy.basicMeaning, basicMeaning) +
      renderVocabularyMeaningCard(copy.contextMeaning, contextMeaning) +
      '</div>' +
      renderVocabularySubsection(copy.etymologyStructure, etymology) +
      renderVocabularyPatterns(patterns) +
      renderVocabularyExamples(examples) +
      '</article>';
  }

  function renderVocabularyMeaningCard(title, text) {
    const normalized = normalizeText(text);
    if (!normalized) {
      return "";
    }
    return '<div class="result-vocab-meaning-card"><span>' + escapeHtml(title) + '</span><p>' + escapeHtml(normalized) + '</p></div>';
  }

  function renderVocabularySubsection(title, text) {
    const normalized = normalizeText(text);
    if (!normalized) {
      return "";
    }
    return '<div class="result-vocab-subsection"><h5>' + escapeHtml(title) + '</h5><p>' + escapeHtml(normalized) + '</p></div>';
  }

  function renderVocabularyPatterns(patterns) {
    if (!patterns.length) {
      return "";
    }
    return '<div class="result-vocab-subsection"><h5>' + escapeHtml(copy.patternsCollocation) + '</h5><div class="result-vocab-patterns">' +
      patterns.map((pattern) => '<code>' + escapeHtml(pattern) + '</code>').join("") +
      '</div></div>';
  }

  function renderVocabularyExamples(examples) {
    if (!examples.length) {
      return "";
    }
    return '<div class="result-vocab-subsection"><h5>' + escapeHtml(copy.examples) + '</h5><ul>' +
      examples.map((example) => '<li>' + escapeHtml(example) + '</li>').join("") +
      '</ul></div>';
  }

  function normalizeColorKey(value) {
    const normalized = normalizeText(value);
    return /^(red|orange|blue|purple|green|pink|cyan|yellow|lime|slate)$/.test(normalized)
      ? normalized
      : "blue";
  }

  function renderComparisons(card) {
    const items = Array.isArray(card.confusingComparisons) ? card.confusingComparisons : [];
    if (!items.length) {
      return "";
    }
    return '<section class="result-card"><small>' + escapeHtml(copy.confusingExpressions) + '</small><div class="result-vocab-list">' +
      items.slice(0, 4).map((item) =>
        '<div class="result-vocab-item"><strong>' + escapeHtml(item.title || "") + '</strong><span>' + escapeHtml(item.explanationKo || "") + '</span></div>'
      ).join("") +
      '</div></section>';
  }

  function submitCreateCard(nextMode) {
    if (!activeSnapshot) {
      return;
    }
    suppressSelectionRefresh(2000);
    isDirtySession = true;
    mode = nextMode;
    const terms = nextMode === "multi" ? selectedTerms : [activeSnapshot.selectedText];
    queueAction({
      action: "create-card",
      mode: nextMode,
      payload: {
        ...activeSnapshot,
        selectedText: terms.join(", "),
        selectedTerms: terms
      }
    });
    if (nextMode === "multi") {
      renderMultiPopover("working", copy.creatingCard);
    } else {
      renderActionPopover("working", copy.creatingCard);
    }
  }

  function queueAction(action) {
    queue.push({
      id: String(Date.now()) + "-" + String(Math.random()).slice(2),
      ...action
    });
  }

  function consumeAction() {
    return queue.shift() || null;
  }

  function updateResultStatus(state, message) {
    const status = host && host.shadowRoot && host.shadowRoot.querySelector(".box.result .status");
    if (!status) {
      return false;
    }
    status.className = "status " + statusClass(state);
    status.textContent = message || statusMessage(state);
    return true;
  }

  function showStatus(state, message) {
    window.clearTimeout(statusTimer);
    if (state === "working" || state === "error") {
      isDirtySession = true;
    }
    if (mode === "result" && updateResultStatus(state, message)) {
      return;
    }
    if (mode === "multi") {
      renderMultiPopover(state, message);
    } else {
      renderActionPopover(state, message);
    }
    if (state === "ok") {
      statusTimer = window.setTimeout(dismissPopover, 900);
    }
  }

  function toggleTerm(term) {
    suppressSelectionRefresh(800);
    isDirtySession = true;
    const normalized = cleanTerm(term);
    if (!normalized) {
      return;
    }
    const exists = selectedTerms.some((candidate) => candidate.toLowerCase() === normalized.toLowerCase());
    if (exists) {
      selectedTerms = selectedTerms.filter((candidate) => candidate.toLowerCase() !== normalized.toLowerCase());
    } else if (selectedTerms.length < MAX_MULTI_TERMS) {
      selectedTerms = [...selectedTerms, normalized];
    }
    renderMultiPopover("ready");
  }

  function removeTerm(term) {
    suppressSelectionRefresh(800);
    isDirtySession = true;
    selectedTerms = selectedTerms.filter((candidate) => candidate.toLowerCase() !== String(term).toLowerCase());
    if (selectedTerms.length === 0 && activeSnapshot) {
      selectedTerms = [activeSnapshot.selectedText];
    }
    renderMultiPopover("ready");
  }

  function tokenizeSentence(sentence) {
    const tokens = [];
    const pattern = /([A-Za-z][A-Za-z'’-]*|[0-9]+(?:[.,][0-9]+)?)/g;
    let cursor = 0;
    let match;
    while ((match = pattern.exec(sentence))) {
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
    const seen = new Set();
    const result = [];
    for (const term of terms) {
      const normalized = cleanTerm(term);
      const key = normalized.toLowerCase();
      if (normalized && !seen.has(key)) {
        seen.add(key);
        result.push(normalized);
      }
    }
    return result.slice(0, MAX_MULTI_TERMS);
  }

  function cleanTerm(term) {
    return normalizeText(term).replace(/^[^\w가-힣]+|[^\w가-힣]+$/g, "");
  }

  function bindAction(selector, handler) {
    const button = host && host.shadowRoot && host.shadowRoot.querySelector(selector);
    if (button) {
      button.addEventListener("click", (event) => {
        suppressSelectionRefresh(900);
        handler(event);
      });
    }
  }

  function dismissPopover() {
    window.clearTimeout(statusTimer);
    window.clearTimeout(selectionTimer);
    window.clearTimeout(repositionTimer);
    if (host) {
      host.style.display = "none";
    }
    activeSnapshot = null;
    activeRect = null;
    pinnedPopoverPosition = null;
    selectedTerms = [];
    mode = "action";
    isDirtySession = false;
  }

  function positionPopover(target, rect, width, estimatedHeight, options) {
    if (!target || !rect) {
      return;
    }
    const bottomSafe = options && options.bottomSafe ? options.bottomSafe : 12;
    const margin = 12;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 800;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 600;
    const scrollX = window.scrollX || document.documentElement.scrollLeft || 0;
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    if (!pinnedPopoverPosition) {
      const rectBottom = Number.isFinite(rect.bottom) ? rect.bottom : rect.top + rect.height;
      let left = Number.isFinite(rect.left) ? rect.left : margin;
      let top = rectBottom + 10;
      if (top + estimatedHeight + bottomSafe > viewportHeight) {
        top = Number.isFinite(rect.top) ? rect.top - estimatedHeight - 10 : margin;
      }
      const clamped = clampPopoverPosition(
        left,
        top,
        width,
        estimatedHeight,
        bottomSafe,
        margin,
        viewportWidth,
        viewportHeight
      );
      pinnedPopoverPosition = {
        left: clamped.left + scrollX,
        top: clamped.top + scrollY,
        scrollX,
        scrollY
      };
    } else if (
      Math.abs((Number(pinnedPopoverPosition.scrollX) || 0) - scrollX) <= 2 &&
      Math.abs((Number(pinnedPopoverPosition.scrollY) || 0) - scrollY) <= 2
    ) {
      const viewportLeft = pinnedPopoverPosition.left - scrollX;
      const viewportTop = pinnedPopoverPosition.top - scrollY;
      const clamped = clampPopoverPosition(
        viewportLeft,
        viewportTop,
        width,
        estimatedHeight,
        bottomSafe,
        margin,
        viewportWidth,
        viewportHeight
      );
      pinnedPopoverPosition = {
        left: clamped.left + scrollX,
        top: clamped.top + scrollY,
        scrollX,
        scrollY
      };
    }
    target.style.left = Math.round(pinnedPopoverPosition.left) + "px";
    target.style.top = Math.round(pinnedPopoverPosition.top) + "px";
    target.style.display = "block";
  }

  function clampPinnedPopover(target, width, estimatedHeight, options) {
    if (!target || !pinnedPopoverPosition) {
      return;
    }
    const bottomSafe = options && options.bottomSafe ? options.bottomSafe : 12;
    const margin = 12;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 800;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 600;
    const scrollX = window.scrollX || document.documentElement.scrollLeft || 0;
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    const viewportLeft = pinnedPopoverPosition.left - scrollX;
    const viewportTop = pinnedPopoverPosition.top - scrollY;
    const clamped = clampPopoverPosition(
      viewportLeft,
      viewportTop,
      width,
      estimatedHeight,
      bottomSafe,
      margin,
      viewportWidth,
      viewportHeight
    );
    pinnedPopoverPosition = {
      left: clamped.left + scrollX,
      top: clamped.top + scrollY,
      scrollX,
      scrollY
    };
    target.style.left = Math.round(pinnedPopoverPosition.left) + "px";
    target.style.top = Math.round(pinnedPopoverPosition.top) + "px";
    target.style.display = "block";
  }

  function clampPopoverPosition(left, top, width, estimatedHeight, bottomSafe, margin, viewportWidth, viewportHeight) {
    const maxLeft = Math.max(margin, viewportWidth - Math.min(width, viewportWidth - margin * 2) - margin);
    const maxTop = Math.max(margin, viewportHeight - Math.min(estimatedHeight, viewportHeight - margin - bottomSafe) - bottomSafe);
    return {
      left: Math.min(Math.max(margin, Number(left) || margin), maxLeft),
      top: Math.min(Math.max(margin, Number(top) || margin), maxTop)
    };
  }

  function statusClass(state) {
    return state === "ok" ? "ok" : state === "error" ? "error" : state === "working" ? "working" : "";
  }

  function statusMessage(state) {
    if (state === "working") {
      return copy.creatingCard;
    }
    if (state === "ok") {
      return copy.cardSaved;
    }
    if (state === "error") {
      return copy.cardFailed;
    }
    return copy.readyToSave;
  }

  function baseStyles() {
    return '<style>' +
      ':host{all:initial}.box{box-sizing:border-box;border:1px solid #c8d7ea;border-radius:10px;background:#fff;box-shadow:0 18px 44px rgba(15,23,42,.18);color:#172033;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}.box *,.box *::before,.box *::after{box-sizing:border-box}.box.compact{width:268px}.box.sentence{display:grid;gap:9px;width:340px;padding:12px}.box.result{display:grid;gap:10px;grid-template-rows:auto auto minmax(0,1fr) auto;width:min(660px,calc(100vw - 24px));height:min(600px,calc(100vh - 168px));max-width:calc(100vw - 24px);max-height:calc(100vh - 168px);padding:12px}.term{display:block;padding:10px 12px 8px;border-bottom:1px solid #edf2f7;color:#0f172a;font-size:13px;font-weight:800;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}button{display:flex;width:100%;min-height:38px;align-items:center;justify-content:space-between;border:0;background:#fff;color:#172033;cursor:pointer;font:inherit;font-size:13px;font-weight:750;padding:0 12px;text-align:left}button:hover{background:#eff6ff;color:#1769e0}button.primary{color:#1769e0}.usage-action-row{position:relative;display:flex;align-items:center;min-width:0;gap:7px;padding:7px 8px}.box.compact .usage-action-row{border-bottom:1px solid #edf2f7}.usage-action-row button{flex:1 1 auto;min-width:0;border:1px solid #d8e3f0;border-radius:8px;padding:0 10px}.usage-action-row button.primary{border-color:#16a34a;background:#22c55e;color:#fff}.usage-action-row button.primary:hover{background:#16a34a;color:#fff}.usage-badge{display:inline-flex;align-items:center;min-height:28px;border:1px solid #bbf7d0;border-radius:999px;background:#ecfdf5;color:#15803d;padding:0 8px;font-size:12px;font-weight:850;white-space:nowrap}.status{border-top:1px solid #edf2f7;color:#526173;font-size:12px;line-height:1.35;padding:8px 12px 10px}.status.ok{color:#16813f}.status.error{color:#c2410c}.status.working{color:#1769e0}.sentence .status{margin:0 -12px -12px}.sentence-head,.result-head{display:flex;align-items:start;justify-content:space-between;gap:12px}.sentence-head strong{color:#0f172a;font-size:14px}.sentence-head span{border:1px solid #d8e3f0;border-radius:999px;background:#f8fbff;color:#526173;padding:3px 8px;font-size:12px;font-weight:800}.sentence-text{max-height:136px;overflow:auto;border:1px solid #d8e3f0;border-radius:8px;background:#f8fbff;color:#172033;font-size:13px;line-height:1.75;padding:9px}.word{display:inline-flex;width:auto;min-height:24px;margin:1px;border:1px solid transparent;border-radius:6px;background:transparent;color:#172033;padding:0 4px;font-size:inherit;font-weight:700;vertical-align:baseline}.word:hover{border-color:#bfdbfe;background:#eff6ff;color:#1769e0}.word.selected{border-color:#93c5fd;background:#dbeafe;color:#1d4ed8}.punct{white-space:pre-wrap}.chips{display:flex;flex-wrap:wrap;gap:5px;min-height:24px}.chip{display:inline-flex;width:auto;min-height:26px;gap:5px;border:1px solid #bfdbfe;border-radius:999px;background:#eff6ff;color:#1d4ed8;padding:0 8px;font-size:12px;font-weight:800}.sentence-actions{display:grid;grid-template-columns:minmax(0,1fr) 86px;gap:7px}.sentence-actions .usage-action-row{min-width:0;padding:0}.sentence-actions button{justify-content:center;gap:6px;border:1px solid #d8e3f0;border-radius:8px}.sentence-actions button.primary{border-color:#1769e0;background:#1769e0;color:#fff}.result-head span,.result-card small{display:block;color:#64748b;font-size:11px;font-weight:800;letter-spacing:.02em;text-transform:uppercase}.result-head strong{display:block;margin-top:2px;color:#0f172a;font-size:15px}button.icon{width:30px;min-height:30px;justify-content:center;border:1px solid #d8e3f0;border-radius:8px;color:#526173;font-size:18px;padding:0}.result-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}.result-actions button{justify-content:center;gap:6px;border:1px solid #d8e3f0;border-radius:8px}.result-actions button.primary{border-color:#1769e0;background:#1769e0;color:#fff}.result-scroll{display:grid;gap:9px;min-height:0;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;padding-right:3px}.result-card{min-width:0;border:1px solid #d8e3f0;border-radius:9px;background:#f8fbff;padding:9px}.result-card.natural{background:#f0fdf4;border-color:#bbf7d0}.result-card.literal{background:#fff7ed;border-color:#fed7aa}.result-card.vocab{background:#f8fafc}.result-card p{margin:4px 0 0;color:#172033;font-size:13px;line-height:1.5;overflow-wrap:anywhere;word-break:break-word}.result-vocab-list{display:grid;gap:7px;margin-top:8px}.result-vocab-item{border-top:1px solid #e2e8f0;padding-top:7px}.result-vocab-item strong{display:block;color:#0f172a;font-size:13px;overflow-wrap:anywhere;word-break:break-word}.result-vocab-item span{display:block;margin-top:2px;color:#64748b;font-size:12px;line-height:1.45;overflow-wrap:anywhere;word-break:break-word}.result-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.result-section-head strong{color:#0f172a;font-size:14px}.result-section-head span{border:1px solid #cfe0f3;border-radius:999px;background:#f7fbff;color:#245184;padding:3px 8px;font-size:12px;font-weight:800}.result-vocab-section{display:grid;gap:8px;min-width:0}.result-vocab-detail-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px}.result-vocab-detail-single{display:grid;grid-template-columns:1fr;gap:10px}.result-vocab-detail{min-width:0;border:1px solid #dbe4ee;border-radius:8px;background:#fff;color:#172033;padding:12px;overflow:hidden}.result-vocab-detail.border-red{box-shadow:inset 3px 0 0 #ef4444}.result-vocab-detail.border-orange{box-shadow:inset 3px 0 0 #f97316}.result-vocab-detail.border-blue{box-shadow:inset 3px 0 0 #2563eb}.result-vocab-detail.border-purple{box-shadow:inset 3px 0 0 #9333ea}.result-vocab-detail.border-green{box-shadow:inset 3px 0 0 #16a34a}.result-vocab-detail.border-pink{box-shadow:inset 3px 0 0 #db2777}.result-vocab-detail.border-cyan{box-shadow:inset 3px 0 0 #0891b2}.result-vocab-detail.border-yellow{box-shadow:inset 3px 0 0 #eab308}.result-vocab-detail.border-lime{box-shadow:inset 3px 0 0 #65a30d}.result-vocab-detail.border-slate{box-shadow:inset 3px 0 0 #64748b}.result-vocab-detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.result-vocab-detail h4{margin:0;font-size:20px;line-height:1.15;overflow-wrap:anywhere}.result-vocab-detail-head p{margin:3px 0 0;color:#64748b;font-size:12px}.text-red{color:#991b1b}.text-orange{color:#9a3412}.text-blue{color:#1d4ed8}.text-purple{color:#6b21a8}.text-green{color:#166534}.text-pink{color:#9d174d}.text-cyan{color:#155e75}.text-yellow{color:#854d0e}.text-lime{color:#3f6212}.text-slate{color:#334155}.result-vocab-meaning-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:10px}.result-vocab-meaning-card{min-width:0;border:1px solid #e2e8f0;border-radius:8px;background:#fbfdff;padding:8px}.result-vocab-meaning-card span,.result-vocab-subsection h5{display:block;margin:0 0 5px;color:#64748b;font-size:11px;font-weight:850}.result-vocab-meaning-card p,.result-vocab-subsection p,.result-vocab-subsection li{margin:0;color:#172033;font-size:12px;line-height:1.48;overflow-wrap:anywhere;word-break:break-word}.result-vocab-subsection{border-top:1px solid #e2e8f0;margin-top:10px;padding-top:10px}.result-vocab-subsection ul{margin:0;padding-left:18px}.result-vocab-patterns{display:flex;flex-wrap:wrap;gap:5px}.result-vocab-patterns code{max-width:100%;border:1px solid #d8e3f0;border-radius:6px;background:#f8fbff;color:#123866;padding:3px 6px;font-family:Consolas,\"SFMono-Regular\",monospace;font-size:11px;white-space:normal;overflow-wrap:anywhere;word-break:break-word}@media(max-width:560px){.result-vocab-detail-grid,.result-vocab-meaning-grid{grid-template-columns:1fr}}' +
      '.result-card mark.highlight{border-radius:4px;box-decoration-break:clone;-webkit-box-decoration-break:clone;font:inherit;font-weight:850;padding:0 .16em}.result-card mark.highlight-red{background:rgba(239,68,68,.16);color:#991b1b}.result-card mark.highlight-orange{background:rgba(249,115,22,.18);color:#9a3412}.result-card mark.highlight-blue{background:rgba(37,99,235,.15);color:#1d4ed8}.result-card mark.highlight-purple{background:rgba(147,51,234,.15);color:#6b21a8}.result-card mark.highlight-green{background:rgba(22,163,74,.16);color:#166534}.result-card mark.highlight-pink{background:rgba(219,39,119,.15);color:#9d174d}.result-card mark.highlight-cyan{background:rgba(8,145,178,.16);color:#155e75}.result-card mark.highlight-yellow{background:rgba(234,179,8,.25);color:#854d0e}.result-card mark.highlight-lime{background:rgba(101,163,13,.18);color:#3f6212}.result-card mark.highlight-slate{background:rgba(100,116,139,.16);color:#334155}' +
      '</style>';
  }

  document.addEventListener("mouseup", (event) => {
    if (host && event.composedPath && event.composedPath().includes(host)) {
      return;
    }
    if (mode === "result") {
      return;
    }
    scheduleSelectionPopover(true);
  }, true);
  document.addEventListener("keyup", (event) => {
    if (event.key === "Escape") {
      if (mode !== "result") {
        dismissPopover();
      }
      return;
    }
  }, true);
  window.addEventListener("resize", scheduleRepositionPopover, { passive: true });
  document.addEventListener("mousedown", (event) => {
    if (host && event.composedPath && event.composedPath().includes(host)) {
      return;
    }
    if (mode === "result") {
      return;
    }
    const selectionText = normalizeText(window.getSelection && window.getSelection().toString());
    if (!selectionText && !isDirtySession) {
      dismissPopover();
    }
  }, true);

  window.__LEM_WEB_READER_POPOVER = {
    version: POPOVER_SCRIPT_VERSION,
    locale: copy.locale,
    consumeAction,
    hide: dismissPopover,
    showStatus,
    showResult: renderResultPopover,
    showFromSelection: showPopoverFromSelection,
    debug() {
      const text = host && host.shadowRoot ? normalizeText(host.shadowRoot.textContent || "") : "";
      return {
        locale: copy.locale,
        visible: Boolean(host && host.style.display !== "none"),
        text,
        mode,
        selectedText: activeSnapshot && activeSnapshot.selectedText,
        sourceSentence: activeSnapshot && activeSnapshot.sourceSentence,
        selectionOffset: activeSnapshot && activeSnapshot.selectionOffset,
        locked: isSessionLocked(),
        dirty: isDirtySession,
        pinnedPosition: pinnedPopoverPosition,
        queueLength: queue.length
      };
    }
  };

  return true;
})()
`;

type WebReaderSelectionPopoverLocale = "ko" | "en";

type WebReaderSelectionPopoverCopy = {
  locale: WebReaderSelectionPopoverLocale;
  cards: string;
  sentenceCard: string;
  createSentenceCard: string;
  generate: string;
  multipleTerms: string;
  select: string;
  close: string;
  back: string;
  addWordsHint: string;
  generatedResult: string;
  reviewSentenceCard: string;
  save: string;
  cardsDestination: string;
  selectAgain: string;
  front: string;
  literalMeaning: string;
  naturalMeaning: string;
  sentenceStructure: string;
  reviewBeforeSave: string;
  keyVocabulary: string;
  termCountSuffix: string;
  basicMeaning: string;
  contextMeaning: string;
  etymologyStructure: string;
  patternsCollocation: string;
  examples: string;
  confusingExpressions: string;
  creatingCard: string;
  cardSaved: string;
  cardFailed: string;
  readyToSave: string;
};

const POPOVER_COPY_PLACEHOLDER = "__LEM_WEB_READER_POPOVER_COPY__";

const popoverCopy: Record<WebReaderSelectionPopoverLocale, WebReaderSelectionPopoverCopy> = {
  ko: {
    locale: "ko",
    cards: "카드",
    sentenceCard: "문장카드",
    createSentenceCard: "문장카드 만들기",
    generate: "생성",
    multipleTerms: "여러단어",
    select: "선택",
    close: "닫기",
    back: "뒤로",
    addWordsHint: "문장 안 단어를 눌러 추가하세요.",
    generatedResult: "생성 결과",
    reviewSentenceCard: "문장카드 전체 확인",
    save: "저장",
    cardsDestination: "카드",
    selectAgain: "다시 선택",
    front: "앞면",
    literalMeaning: "직역",
    naturalMeaning: "자연스러운 뜻",
    sentenceStructure: "문장 구조",
    reviewBeforeSave: "새 카드 전체를 확인한 뒤 저장하세요.",
    keyVocabulary: "핵심 단어",
    termCountSuffix: "개",
    basicMeaning: "기본 뜻",
    contextMeaning: "문맥 뜻",
    etymologyStructure: "어원 / 구조",
    patternsCollocation: "표현 패턴 / Collocation",
    examples: "예문",
    confusingExpressions: "비슷해서 헷갈리는 표현",
    creatingCard: "카드 생성 중...",
    cardSaved: "카드에 저장했습니다.",
    cardFailed: "카드 생성에 실패했습니다.",
    readyToSave: "선택 문장을 카드로 저장합니다."
  },
  en: {
    locale: "en",
    cards: "Cards",
    sentenceCard: "Sentence Card",
    createSentenceCard: "Create Sentence Card",
    generate: "Generate",
    multipleTerms: "Multiple terms",
    select: "Select",
    close: "Close",
    back: "Back",
    addWordsHint: "Choose words in the sentence to add them.",
    generatedResult: "Generated result",
    reviewSentenceCard: "Review the full Sentence Card",
    save: "Save",
    cardsDestination: "Cards",
    selectAgain: "Select again",
    front: "Front",
    literalMeaning: "Literal meaning",
    naturalMeaning: "Natural meaning",
    sentenceStructure: "Sentence structure",
    reviewBeforeSave: "Review the full card, then save it.",
    keyVocabulary: "Key vocabulary",
    termCountSuffix: " terms",
    basicMeaning: "Basic meaning",
    contextMeaning: "Meaning in context",
    etymologyStructure: "Origin / structure",
    patternsCollocation: "Usage patterns / collocations",
    examples: "Examples",
    confusingExpressions: "Similar or confusing expressions",
    creatingCard: "Creating card...",
    cardSaved: "Saved to Cards.",
    cardFailed: "Could not create the card.",
    readyToSave: "Save the selected sentence as a card."
  }
};

export function buildWebReaderSelectionPopoverScript(
  locale: WebReaderSelectionPopoverLocale
) {
  return WEB_READER_SELECTION_POPOVER_SCRIPT.replace(
    POPOVER_COPY_PLACEHOLDER,
    JSON.stringify(popoverCopy[locale])
  );
}
