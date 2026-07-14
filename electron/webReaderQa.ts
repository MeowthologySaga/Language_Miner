import type { BrowserView } from "electron";
import type { WebReaderLifeMiningState } from "../src/shared/types";

export type WebReaderLifeMiningCaptureResult = {
  state: WebReaderLifeMiningState;
  savedCount: number;
  queued: boolean;
  debug: unknown;
};

export type WebReaderQaAccess = {
  getView: () => BrowserView | null;
  canExecuteScript: (view: BrowserView) => boolean;
  injectSelectionPopover: (view: BrowserView) => Promise<boolean>;
  injectLifeMining: (view: BrowserView) => Promise<boolean>;
  getLifeMiningState: () => Promise<WebReaderLifeMiningState>;
  consumeLifeMiningCaptures: () => Promise<unknown[]>;
  saveLifeMiningCapture: (payload: unknown) => Promise<unknown>;
};

let webReaderQaAccess: WebReaderQaAccess | null = null;

export function configureWebReaderQaAccess(access: WebReaderQaAccess) {
  webReaderQaAccess = access;
}

function getWebReaderQaAccess() {
  if (!webReaderQaAccess) {
    throw new Error("Web Reader QA access has not been configured.");
  }
  return webReaderQaAccess;
}

function normalizeWebReaderQaText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").trim();
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function testWebReaderLifeMiningCapture() {
  const access = getWebReaderQaAccess();
  const view = access.getView();
  if (!view || !access.canExecuteScript(view)) {
    return access.getLifeMiningState();
  }
  await access.injectLifeMining(view);
  try {
    await view.webContents.executeJavaScript(
      "window.__LEM_WEB_READER_LIFE_MINER && window.__LEM_WEB_READER_LIFE_MINER.enqueueTestCapture ? window.__LEM_WEB_READER_LIFE_MINER.enqueueTestCapture() : false"
    );
  } catch {
    await access.saveLifeMiningCapture({
      text: "Web Reader life mining synthetic capture for QA.",
      appName: "웹 리더 QA",
      metadata: {
        url: view.webContents.getURL(),
        title: view.webContents.getTitle(),
        trigger: "web_reader_qa",
        capturedAt: new Date().toISOString()
      }
    });
  }
  await access.consumeLifeMiningCaptures();
  return access.getLifeMiningState();
}

export async function captureWebReaderLifeMiningNow() {
  const access = getWebReaderQaAccess();
  const view = access.getView();
  if (!view || !access.canExecuteScript(view)) {
    return {
      state: await access.getLifeMiningState(),
      savedCount: 0,
      queued: false,
      debug: null
    };
  }
  await access.injectLifeMining(view);
  let queued = false;
  let debug: unknown = null;
  try {
    const result = await view.webContents.executeJavaScript(
      "(() => { const miner = window.__LEM_WEB_READER_LIFE_MINER; if (!miner) return { queued: false, debug: null }; const queued = typeof miner.forceCaptureVisible === 'function' ? miner.forceCaptureVisible('manual_qa') : false; return { queued, debug: typeof miner.debug === 'function' ? miner.debug() : null }; })()"
    );
    queued = Boolean(result?.queued);
    debug = result?.debug ?? null;
  } catch (error) {
    debug = { error: error instanceof Error ? error.message : String(error) };
  }
  const saved = await access.consumeLifeMiningCaptures();
  return {
    state: await access.getLifeMiningState(),
    savedCount: saved.length,
    queued,
    debug
  };
}

async function exerciseWebReaderPopoverStability(
  view: BrowserView,
  baseDebug: Record<string, unknown>
) {
  return (await view.webContents.executeJavaScript(`
    (async () => {
      const baseDebug = ${JSON.stringify(baseDebug).replace(/</g, "\\u003c")};
      const api = window.__LEM_WEB_READER_POPOVER;
      const host = document.getElementById("lem-selection-card-popover");
      const root = host && host.shadowRoot;
      if (!api || !root) {
        return { ...baseDebug, scrollStable: false, reason: "missing_popover_root" };
      }
      const before = api.debug();
      const multiButton = root.querySelector("[data-action='multi']");
      if (!multiButton) {
        return { ...before, inputMode: "popover-stability", scrollStable: false, reason: "missing_multi_button" };
      }
      const readHostDocumentPosition = () => ({
        left: Number.parseFloat(host.style.left || "0") || 0,
        top: Number.parseFloat(host.style.top || "0") || 0
      });
      const actionRectBeforeScroll = host.getBoundingClientRect();
      const actionDocumentPositionBeforeScroll = readHostDocumentPosition();
      const scrollTarget = document.scrollingElement || document.documentElement;
      const actionBeforeScrollTop = scrollTarget.scrollTop;
      scrollTarget.scrollBy({ top: 180, left: 0, behavior: "instant" });
      document.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 180 }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const actionAfterScroll = api.debug();
      const actionRectAfterScroll = host.getBoundingClientRect();
      const actionDocumentPositionAfterScroll = readHostDocumentPosition();
      const actionAfterScrollTop = scrollTarget.scrollTop;
      const actionScrollDelta = actionAfterScrollTop - actionBeforeScrollTop;
      const actionDocumentPositionStable =
        Math.abs(actionDocumentPositionAfterScroll.left - actionDocumentPositionBeforeScroll.left) <= 2 &&
        Math.abs(actionDocumentPositionAfterScroll.top - actionDocumentPositionBeforeScroll.top) <= 2;
      const actionViewportMovesWithDocument =
        actionScrollDelta <= 0 ||
        Math.abs((actionRectAfterScroll.top - actionRectBeforeScroll.top) + actionScrollDelta) <= 4;
      const actionSelectedStable = String(actionAfterScroll.selectedText || "") === String(before.selectedText || "");
      const actionScrollStable =
        Boolean(actionAfterScroll.visible) &&
        actionAfterScroll.mode === "action" &&
        actionSelectedStable &&
        actionDocumentPositionStable &&
        actionViewportMovesWithDocument &&
        String(actionAfterScroll.text || "").includes(
          actionAfterScroll.locale === "en" ? "Sentence Card" : "문장카드"
        );
      scrollTarget.scrollTo({ top: actionBeforeScrollTop, left: 0, behavior: "instant" });
      await new Promise((resolve) => setTimeout(resolve, 120));
      multiButton.click();
      await new Promise((resolve) => setTimeout(resolve, 120));
      const afterMulti = api.debug();
      const nextWord = root.querySelector("[data-word-index]:not(.selected)") || root.querySelector("[data-word-index]");
      if (nextWord) {
        nextWord.click();
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
      const afterWord = api.debug();
      const beforeScrollRect = host.getBoundingClientRect();
      const documentPositionBeforeScroll = readHostDocumentPosition();
      const beforeScrollTop = scrollTarget.scrollTop;
      scrollTarget.scrollBy({ top: 240, left: 0, behavior: "instant" });
      document.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 240 }));
      await new Promise((resolve) => setTimeout(resolve, 220));
      const afterScroll = api.debug();
      const afterScrollRect = host.getBoundingClientRect();
      const documentPositionAfterScroll = readHostDocumentPosition();
      const scrollDelta = scrollTarget.scrollTop - beforeScrollTop;
      const selectedStable = String(afterScroll.selectedText || "") === String(before.selectedText || "");
      const documentPositionStable =
        Math.abs(documentPositionAfterScroll.left - documentPositionBeforeScroll.left) <= 2 &&
        Math.abs(documentPositionAfterScroll.top - documentPositionBeforeScroll.top) <= 2;
      const viewportMovesWithDocument =
        scrollDelta <= 0 ||
        Math.abs((afterScrollRect.top - beforeScrollRect.top) + scrollDelta) <= 4;
      const text = String(afterScroll.text || "");
      api.showResult({
        frontText: "Preview sentence with previewword.",
        sourceSentence: "Preview sentence with previewword.",
        literalTranslationKo: "literal preview",
        naturalTranslationKo: "natural preview",
        structureNote: "structure preview",
        vocabularyItems: [
          {
            term: "previewword",
            ipa: "/ˈpriːvjuːwɝːd/",
            partOfSpeech: "noun",
            basicMeaningKo: "basic visible meaning",
            meaningInContextKo: "context visible meaning",
            etymologyKo: "preview etymology detail",
            usagePatterns: ["Collocation: previewword + noun"],
            colorKey: "orange",
            examples: ["Previewword appears in a fresh example."]
          }
        ],
        confusingComparisons: [
          {
            kind: "nuance",
            title: "previewword vs sampleword",
            explanationKo: "comparison preview detail"
          }
        ]
      });
      await new Promise((resolve) => setTimeout(resolve, 120));
      const previewAfterResult = api.debug();
      const previewText = String(previewAfterResult.text || "");
      const previewHasVocabularyDetails =
        previewText.includes("preview etymology detail") &&
        previewText.includes("Collocation: previewword + noun") &&
        previewText.includes("Previewword appears in a fresh example.");
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: 8, clientY: 8 }));
      document.body.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, clientX: 8, clientY: 8 }));
      await new Promise((resolve) => setTimeout(resolve, 160));
      const previewAfterOutsideClick = api.debug();
      const outsideClickText = String(previewAfterOutsideClick.text || "");
      const previewSurvivesOutsideClick =
        Boolean(previewAfterOutsideClick.visible) &&
        previewAfterOutsideClick.mode === "result" &&
        outsideClickText.includes("preview etymology detail") &&
        outsideClickText.includes("Collocation: previewword + noun");
      document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 160));
      const previewAfterEscape = api.debug();
      const escapeText = String(previewAfterEscape.text || "");
      const previewSurvivesEscape =
        Boolean(previewAfterEscape.visible) &&
        previewAfterEscape.mode === "result" &&
        escapeText.includes("preview etymology detail") &&
        escapeText.includes("Previewword appears in a fresh example.");
      const previewCloseButtonPresent = Boolean(root.querySelector("[data-action='close']"));
      return {
        ...afterScroll,
        inputMode: "popover-stability-scroll",
        before,
        actionAfterScroll,
        actionRectBeforeScroll: {
          left: Math.round(actionRectBeforeScroll.left),
          top: Math.round(actionRectBeforeScroll.top),
          right: Math.round(actionRectBeforeScroll.right),
          bottom: Math.round(actionRectBeforeScroll.bottom)
        },
        actionRectAfterScroll: {
          left: Math.round(actionRectAfterScroll.left),
          top: Math.round(actionRectAfterScroll.top),
          right: Math.round(actionRectAfterScroll.right),
          bottom: Math.round(actionRectAfterScroll.bottom)
        },
        actionDocumentPositionBeforeScroll,
        actionDocumentPositionAfterScroll,
        actionBeforeScrollTop,
        actionAfterScrollTop,
        actionScrollDelta,
        actionDocumentPositionStable,
        actionViewportMovesWithDocument,
        actionScrollStable,
        afterMulti,
        afterWord,
        beforeScrollRect: {
          left: Math.round(beforeScrollRect.left),
          top: Math.round(beforeScrollRect.top),
          right: Math.round(beforeScrollRect.right),
          bottom: Math.round(beforeScrollRect.bottom)
        },
        afterScrollRect: {
          left: Math.round(afterScrollRect.left),
          top: Math.round(afterScrollRect.top),
          right: Math.round(afterScrollRect.right),
          bottom: Math.round(afterScrollRect.bottom)
        },
        documentPositionBeforeScroll,
        documentPositionAfterScroll,
        beforeScrollTop,
        afterScrollTop: scrollTarget.scrollTop,
        scrollDelta,
        documentPositionStable,
        viewportMovesWithDocument,
        previewAfterResult,
        previewHasVocabularyDetails,
        previewAfterOutsideClick,
        previewSurvivesOutsideClick,
        previewAfterEscape,
        previewSurvivesEscape,
        previewCloseButtonPresent,
        scrollStable:
          actionScrollStable &&
          Boolean(afterScroll.visible) &&
          selectedStable &&
          documentPositionStable &&
          viewportMovesWithDocument &&
          afterScroll.locked === true &&
          afterScroll.dirty === true &&
          text.includes(afterScroll.locale === "en" ? "Multiple terms" : "여러단어")
      };
    })()
  `)) as Record<string, unknown>;
}

export async function testWebReaderSelectionPopover(
  preferredTextInput?: unknown,
  expectedContextInput?: unknown
) {
  const access = getWebReaderQaAccess();
  const view = access.getView();
  if (!view || !access.canExecuteScript(view)) {
    return null;
  }
  await access.injectSelectionPopover(view);
  const preferredText = normalizeWebReaderQaText(preferredTextInput).slice(0, 120);
  const expectedContext = normalizeWebReaderQaText(expectedContextInput).slice(0, 240);
  try {
    const dragPlan = (await view.webContents.executeJavaScript(`
      (async () => {
        const preferredText = ${JSON.stringify(preferredText)};
        const preferredLower = preferredText.toLowerCase();
        const expectedContext = ${JSON.stringify(expectedContext)};
        const expectedLower = expectedContext.toLowerCase();
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
          acceptNode(node) {
            const text = String(node.nodeValue || "").replace(/\\s+/g, " ").trim();
            const parent = node.parentElement;
            if (!parent || text.length < 30) {
              return NodeFilter.FILTER_REJECT;
            }
            if (preferredLower && !text.toLowerCase().includes(preferredLower)) {
              return NodeFilter.FILTER_REJECT;
            }
            const block = parent.closest("p, li, td, th, dd, blockquote, figcaption, caption, h1, h2, h3, h4, h5, h6, [slot='title'], [data-testid='post-title'], [data-adclicklocation='title'], [id^='post-title'], shreddit-title, shreddit-post, shreddit-comment");
            if (!block) {
              return NodeFilter.FILTER_REJECT;
            }
            const blockText = String(block.innerText || "").replace(/\\s+/g, " ").trim().toLowerCase();
            if (expectedLower && !blockText.includes(expectedLower)) {
              return NodeFilter.FILTER_REJECT;
            }
            const style = window.getComputedStyle(parent);
            if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
              return NodeFilter.FILTER_REJECT;
            }
            const rect = block.getBoundingClientRect();
            return rect.width >= 40 && rect.height >= 10
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT;
          }
        });
        const node = walker.nextNode();
        if (!node) {
          return { visible: false, text: "", reason: "no_text" };
        }
        node.parentElement?.scrollIntoView({ block: "center", inline: "nearest" });
        await new Promise((resolve) => setTimeout(resolve, 50));
        const rawText = String(node.nodeValue || "");
        const preferredIndex = preferredLower ? rawText.toLowerCase().indexOf(preferredLower) : -1;
        const start = preferredIndex >= 0 ? preferredIndex : Math.max(0, rawText.search(/\\S/));
        const end = Math.min(rawText.length, preferredIndex >= 0 ? start + preferredText.length : start + 42);
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, end);
        const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 2 && rect.height > 2);
        const firstRect = rects[0] || range.getBoundingClientRect();
        const lastRect = rects[rects.length - 1] || firstRect;
        if (!firstRect || !lastRect || firstRect.width <= 2 || firstRect.height <= 2) {
          return { visible: false, text: "", reason: "no_selection_rect" };
        }
        window.getSelection()?.removeAllRanges();
        return {
          startX: Math.max(2, Math.round(firstRect.left + 2)),
          startY: Math.max(2, Math.round(firstRect.top + firstRect.height / 2)),
          endX: Math.max(2, Math.round(lastRect.right - 2)),
          endY: Math.max(2, Math.round(lastRect.top + lastRect.height / 2)),
          plannedText: rawText.slice(start, end),
          sourceTag: node.parentElement?.tagName || ""
        };
      })()
    `)) as
      | {
          startX?: number;
          startY?: number;
          endX?: number;
          endY?: number;
          plannedText?: string;
          sourceTag?: string;
          reason?: string;
        }
      | null;

    if (
      !dragPlan ||
      typeof dragPlan.startX !== "number" ||
      typeof dragPlan.startY !== "number" ||
      typeof dragPlan.endX !== "number" ||
      typeof dragPlan.endY !== "number"
    ) {
      return {
        visible: false,
        text: "",
        reason: dragPlan?.reason || "drag_plan_failed"
      };
    }

    view.webContents.focus();
    view.webContents.sendInputEvent({
      type: "mouseDown",
      x: dragPlan.startX,
      y: dragPlan.startY,
      button: "left",
      clickCount: 1
    });
    const steps = 8;
    for (let step = 1; step <= steps; step += 1) {
      const ratio = step / steps;
      view.webContents.sendInputEvent({
        type: "mouseMove",
        x: Math.round(dragPlan.startX + (dragPlan.endX - dragPlan.startX) * ratio),
        y: Math.round(dragPlan.startY + (dragPlan.endY - dragPlan.startY) * ratio),
        button: "left"
      });
      await delay(18);
    }
    view.webContents.sendInputEvent({
      type: "mouseUp",
      x: dragPlan.endX,
      y: dragPlan.endY,
      button: "left",
      clickCount: 1
    });
    await delay(500);

    let debug = (await view.webContents.executeJavaScript(`
      (() => {
        const selection = window.getSelection();
        const debug = window.__LEM_WEB_READER_POPOVER?.debug
          ? window.__LEM_WEB_READER_POPOVER.debug()
          : { visible: false, text: "", reason: "missing_popover_api" };
        return {
          ...debug,
          selectedText: String(selection && selection.toString ? selection.toString() : "").replace(/\\s+/g, " ").trim(),
          inputMode: "mouse-drag",
          plannedText: ${JSON.stringify(dragPlan.plannedText || "")},
          sourceTag: ${JSON.stringify(dragPlan.sourceTag || "")}
        };
      })()
    `)) as Record<string, unknown>;
    if (debug.visible && debug.selectedText) {
      return exerciseWebReaderPopoverStability(view, debug);
    }

    const programmaticDebug = (await view.webContents.executeJavaScript(`
      (async () => {
        const preferredText = ${JSON.stringify(preferredText)};
        const preferredLower = preferredText.toLowerCase();
        const expectedContext = ${JSON.stringify(expectedContext)};
        const expectedLower = expectedContext.toLowerCase();
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
          acceptNode(node) {
            const text = String(node.nodeValue || "").replace(/\\s+/g, " ").trim();
            const parent = node.parentElement;
            if (!parent || text.length < 30) {
              return NodeFilter.FILTER_REJECT;
            }
            if (preferredLower && !text.toLowerCase().includes(preferredLower)) {
              return NodeFilter.FILTER_REJECT;
            }
            const block = parent.closest("p, li, td, th, dd, blockquote, figcaption, caption, h1, h2, h3, h4, h5, h6, [slot='title'], [data-testid='post-title'], [data-adclicklocation='title'], [id^='post-title'], shreddit-title, shreddit-post, shreddit-comment");
            if (!block) {
              return NodeFilter.FILTER_REJECT;
            }
            const blockText = String(block.innerText || "").replace(/\\s+/g, " ").trim().toLowerCase();
            if (expectedLower && !blockText.includes(expectedLower)) {
              return NodeFilter.FILTER_REJECT;
            }
            const style = window.getComputedStyle(parent);
            if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          }
        });
        const node = walker.nextNode();
        if (!node) {
          return { ...${JSON.stringify(debug)}, reason: "programmatic_no_text" };
        }
        node.parentElement?.scrollIntoView({ block: "center", inline: "nearest" });
        await new Promise((resolve) => setTimeout(resolve, 50));
        const rawText = String(node.nodeValue || "");
        const preferredIndex = preferredLower ? rawText.toLowerCase().indexOf(preferredLower) : -1;
        const start = preferredIndex >= 0 ? preferredIndex : Math.max(0, rawText.search(/\\S/));
        const end = Math.min(rawText.length, preferredIndex >= 0 ? start + preferredText.length : start + 80);
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, end);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        window.__LEM_WEB_READER_POPOVER.showFromSelection();
        return {
          ...window.__LEM_WEB_READER_POPOVER.debug(),
          selectedText: selection.toString(),
          inputMode: "programmatic-range-after-mouse-drag-failed",
          mouseDragDebug: ${JSON.stringify(debug)},
          sourceTag: node.parentElement?.tagName || ""
        };
      })()
    `)) as Record<string, unknown>;
    if (programmaticDebug.visible && programmaticDebug.selectedText) {
      return exerciseWebReaderPopoverStability(view, programmaticDebug);
    }
    return programmaticDebug;
  } catch (error) {
    return {
      visible: false,
      text: "",
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function testWebReaderShadowTitleSelectionPopover() {
  const access = getWebReaderQaAccess();
  const view = access.getView();
  if (!view || view.webContents.isDestroyed()) {
    return null;
  }

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Reddit title parser fixture</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; color: #172033; }
    main { max-width: 760px; margin: 60px auto; line-height: 1.55; }
    .decoy { margin-bottom: 24px; color: #334155; }
  </style>
</head>
<body>
  <main>
    <p class="decoy">Gilgamesh has been an actual character in a shitload of different titles across the main titles, its spinoffs, its sequels, and its expanded materials.</p>
    <reddit-post-card></reddit-post-card>
  </main>
  <script>
    customElements.define("reddit-post-card", class extends HTMLElement {
      connectedCallback() {
        const root = this.attachShadow({ mode: "open" });
        root.innerHTML = '<style>:host{display:block}article{display:grid;gap:18px}h1{font-size:28px;line-height:1.2;margin:0}p{font-size:15px;margin:0}</style><article><h1 data-testid="post-title">Character weapons and summons not adapted into the remakes</h1><p>Was going through all the weapons from the OG that have been remade to see what weapons we could expect to see in Revelation.</p></article>';
      }
    });
  </script>
</body>
</html>`;

  await view.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await access.injectSelectionPopover(view);
  return (await view.webContents.executeJavaScript(`
    (async () => {
      const host = document.querySelector("reddit-post-card");
      if (!host || !host.shadowRoot) {
        return { visible: false, reason: "missing_shadow_host" };
      }
      const title = host.shadowRoot.querySelector("h1");
      if (!title) {
        return { visible: false, reason: "missing_title" };
      }
      const textNode = Array.from(title.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
      if (!textNode) {
        return { visible: false, reason: "missing_title_text_node" };
      }
      const rawText = String(textNode.nodeValue || "");
      const start = rawText.indexOf("Character");
      if (start < 0) {
        return { visible: false, reason: "missing_selected_word", titleText: rawText };
      }
      title.scrollIntoView({ block: "center", inline: "nearest" });
      await new Promise((resolve) => setTimeout(resolve, 60));
      const range = document.createRange();
      range.setStart(textNode, start);
      range.setEnd(textNode, start + "Character".length);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      window.__LEM_WEB_READER_POPOVER.showFromSelection();
      await new Promise((resolve) => setTimeout(resolve, 180));
      const debug = window.__LEM_WEB_READER_POPOVER.debug();
      return {
        ...debug,
        selectedText: String(selection.toString() || "").replace(/\\s+/g, " ").trim(),
        titleText: String(title.textContent || "").replace(/\\s+/g, " ").trim(),
        bodyText: String(document.body.innerText || "").replace(/\\s+/g, " ").trim()
      };
    })()
  `)) as Record<string, unknown>;
}
