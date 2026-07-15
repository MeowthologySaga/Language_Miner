import { BrowserWindow, nativeImage, type BrowserView, type NativeImage } from "electron";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { createDefaultSampleCards } from "../src/shared/defaultSampleCards";
import type { CardDeckType, StudyCard } from "../src/shared/types";
import type { AppSmokeQaWebReaderAccess } from "./appSmokeQa";

type HomepageScreenshotLocale = "ko" | "en";

type HomepageScreenshotRecord = {
  slot: string;
  fileName: string;
  pngPath: string;
  width: number;
  height: number;
  sha256Source: "generated-by-electron";
  textSafety: {
    scannedCharacterCount: number;
    findings: string[];
  };
};

type DialogueSegment = {
  id: string;
  speaker: string;
  start: number;
  end: number;
  text: string;
  translationKo: string;
};

type DialogueFixture = {
  title: string;
  firstVoice?: string;
  secondVoice?: string;
  segments: DialogueSegment[];
};

const VIEWPORT = { width: 1240, height: 820 };
const PROFILE_ID = "profile-english";
const LIVE_SELECTION_TEXT = "Oh dear! I shall be late!";
const DEFAULT_LIVE_URL = "https://www.gutenberg.org/files/11/11-0.txt";

export async function runHomepageScreenshotQa(
  window: BrowserWindow,
  reportPath: string,
  outputDirectory: string,
  locale: HomepageScreenshotLocale,
  webReader: AppSmokeQaWebReaderAccess
) {
  const startedAt = new Date();
  const screenshots: HomepageScreenshotRecord[] = [];
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });

  try {
    const fixturePdfPath = requireFixtureFile("LM_QA_HOMEPAGE_FIXTURE_PDF");
    const fixtureVideoPath = requireFixtureFile("LM_QA_HOMEPAGE_FIXTURE_VIDEO");
    requireFixtureFile("LM_QA_HOMEPAGE_SCENE_IMAGE");
    const dialogue = readDialogueFixture();
    const liveUrl = readLiveUrl();

    await waitForWindowLoad(window);
    window.setSize(VIEWPORT.width, VIEWPORT.height);
    window.center();
    await ensureRendererLocale(window, locale);
    await finishOnboardingIfNeeded(window);
    await seedHomepageFixture(window, fixtureVideoPath, dialogue);
    await reloadWindow(window);
    await waitForSelector(window, '[data-qa="nav-pdfHub"]', 30_000);

    await captureLiveWebReader(window, outputDirectory, screenshots, webReader, liveUrl);
    await captureAliceDocument(window, outputDirectory, screenshots, fixturePdfPath);
    await captureOfficeVideo(window, outputDirectory, screenshots);
    await seedReviewCards(window, "./samples/listening/onboarding-office-send.png");
    await captureReviewDecks(window, outputDirectory, screenshots);

    const report = {
      status: screenshots.every((shot) => shot.textSafety.findings.length === 0)
        ? "passed"
        : "failed",
      locale,
      viewport: VIEWPORT,
      liveWebReaderUrl: liveUrl,
      fixturePolicy:
        "Fresh Electron userData, tracked public-domain Alice text, a rights-cleared generated scene, and temporary on-device Windows TTS media.",
      publicationPolicy:
        "Only screenshots are published. Temporary WAV and MP4 fixtures remain under ignored debug/qa output.",
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      screenshots
    };
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    if (report.status !== "passed") {
      throw new Error(`Homepage screenshot safety scan failed: ${reportPath}`);
    }
  } catch (caught) {
    if (!fs.existsSync(reportPath)) {
      fs.writeFileSync(
        reportPath,
        `${JSON.stringify(
          {
            status: "failed",
            locale,
            viewport: VIEWPORT,
            startedAt: startedAt.toISOString(),
            finishedAt: new Date().toISOString(),
            screenshots,
            error: caught instanceof Error ? caught.message : String(caught)
          },
          null,
          2
        )}\n`,
        "utf8"
      );
    }
    throw caught;
  }
}

function requireFixtureFile(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  const resolved = path.resolve(value);
  if (!fs.statSync(resolved).isFile()) {
    throw new Error(`${name} does not point to a file.`);
  }
  return resolved;
}

function readDialogueFixture(): DialogueFixture {
  const raw = process.env.LM_QA_HOMEPAGE_DIALOGUE_JSON;
  if (!raw) throw new Error("LM_QA_HOMEPAGE_DIALOGUE_JSON is required.");
  const parsed = JSON.parse(raw) as Partial<DialogueFixture>;
  if (
    typeof parsed.title !== "string" ||
    !parsed.title.trim() ||
    !Array.isArray(parsed.segments) ||
    parsed.segments.length < 2 ||
    parsed.segments.some(
      (segment) =>
        !segment ||
        typeof segment.text !== "string" ||
        typeof segment.start !== "number" ||
        typeof segment.end !== "number" ||
        segment.end <= segment.start
    )
  ) {
    throw new Error("Homepage dialogue fixture is invalid.");
  }
  return parsed as DialogueFixture;
}

function readLiveUrl() {
  const value = process.env.LM_QA_HOMEPAGE_LIVE_URL?.trim() || DEFAULT_LIVE_URL;
  if (value !== DEFAULT_LIVE_URL) {
    throw new Error(`Homepage Web Reader QA only permits ${DEFAULT_LIVE_URL}.`);
  }
  return value;
}

async function finishOnboardingIfNeeded(window: BrowserWindow) {
  if (await selectorExists(window, '[data-qa="app-onboarding"]')) {
    await clickAndWait(window, '[data-qa="onboarding-skip"]', 350);
  }
  await waitForSelector(window, '[data-qa="nav-pdfHub"]', 30_000);
}

async function seedHomepageFixture(
  window: BrowserWindow,
  fixtureVideoPath: string,
  dialogue: DialogueFixture
) {
  await execute(
    window,
    `
(() => {
  const profileId = ${JSON.stringify(PROFILE_ID)};
  const videoPath = ${JSON.stringify(fixtureVideoPath)};
  const dialogue = ${JSON.stringify(dialogue)};
  const now = '2026-07-15T03:00:00.000Z';
  localStorage.setItem('lem:activeProfileId', profileId);
  localStorage.setItem('lem:videoReader:resume:' + profileId, JSON.stringify({
    profileId,
    source: {
      mode: 'local',
      filePath: videoPath,
      fileName: 'office-dialogue.mp4',
      title: dialogue.title
    },
    transcript: {
      id: 'transcript:homepage-office-dialogue',
      candidateId: 'local-file:' + videoPath,
      videoId: 'local:office-dialogue.mp4',
      title: dialogue.title,
      channelName: 'Language Miner sample scene',
      languageCode: 'en',
      status: 'ready',
      segments: dialogue.segments.map((segment) => ({
        ...segment,
        noteKo: segment.id === 'office-dialogue-1'
          ? 'when you get a chance를 한 덩어리로 들어 보세요.'
          : 'right after lunch의 연결을 들어 보세요.'
      })),
      modelName: 'homepage-rights-cleared-fixture',
      createdAt: now,
      updatedAt: now
    },
    segmentIndex: 0,
    playbackTime: 0.35,
    subtitleMode: 'bilingual',
    videoCovered: false,
    loopEnabled: true,
    playbackSpeed: 1,
    updatedAt: now
  }));
  return true;
})()
`
  );
}

async function captureLiveWebReader(
  window: BrowserWindow,
  outputDirectory: string,
  screenshots: HomepageScreenshotRecord[],
  webReader: AppSmokeQaWebReaderAccess,
  liveUrl: string
) {
  await navigateToRoute(window, "webReader", "input");
  await waitForSelector(window, '[data-qa="web-reader-address"]', 15_000);
  const submitted = await execute<boolean>(
    window,
    `
(() => {
  const input = document.querySelector('[data-qa="web-reader-address"]');
  if (!(input instanceof HTMLInputElement)) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, ${JSON.stringify(liveUrl)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.closest('form')?.requestSubmit();
  return true;
})()
`
  );
  if (!submitted) throw new Error("Could not submit the live Web Reader URL.");

  const view = await waitForWebReaderView(webReader, 20_000);
  await waitForWebReaderUrl(view, liveUrl, 45_000);
  await waitForWebReaderReady(view, 30_000);
  if (!(await webReader.injectSelectionPopover())) {
    throw new Error("Could not inject the Web Reader selection controls.");
  }
  const selection = (await view.webContents.executeJavaScript(
    `
(() => {
  const needle = ${JSON.stringify(LIVE_SELECTION_TEXT)};
  const root = document.querySelector('pre') || document.body;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const value = String(node.nodeValue || '');
    const start = value.indexOf(needle);
    if (start >= 0) {
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + needle.length);
      const selected = window.getSelection();
      selected?.removeAllRanges();
      selected?.addRange(range);
      const rect = range.getBoundingClientRect();
      window.scrollTo({ top: Math.max(0, scrollY + rect.top - innerHeight * 0.38), behavior: 'instant' });
      const api = window.__LEM_WEB_READER_POPOVER;
      if (!api || typeof api.showFromSelection !== 'function') {
        return { visible: false, reason: 'popover API missing' };
      }
      api.showFromSelection({ allowReplaceLocked: true });
      return typeof api.debug === 'function'
        ? { ...api.debug(), selectedText: selected?.toString() || '' }
        : { visible: true, selectedText: selected?.toString() || '' };
    }
    node = walker.nextNode();
  }
  return { visible: false, reason: 'target text missing' };
})()
`
  )) as { visible?: boolean; selectedText?: string; reason?: string };
  if (!selection.visible || selection.selectedText !== LIVE_SELECTION_TEXT) {
    throw new Error(`Live Web Reader selection failed: ${JSON.stringify(selection)}`);
  }
  await delay(450);
  await captureCompositeWebReaderSlot({
    window,
    view,
    outputDirectory,
    screenshots,
    slot: "web-reader-live",
    fileName: "home-web-reader-live.png",
    safetyText: [
      await collectVisibleSafetyText(window),
      LIVE_SELECTION_TEXT,
      liveUrl,
      await view.webContents.getTitle()
    ].join("\n")
  });
}

async function captureAliceDocument(
  window: BrowserWindow,
  outputDirectory: string,
  screenshots: HomepageScreenshotRecord[],
  fixturePdfPath: string
) {
  await navigateToRoute(window, "pdfReader", "input");
  await clickAndWait(window, '[data-qa="pdf-reader-live-tab"]', 250);
  await waitForSelector(window, '[data-qa="pdf-reader-file-input"]', 15_000);
  await setFileInput(window, '[data-qa="pdf-reader-file-input"]', fixturePdfPath);
  await waitForSelector(window, ".pdf-visible-text-layer span", 30_000);
  const selected = await execute<string>(
    window,
    `
(() => {
  const spans = Array.from(document.querySelectorAll('.pdf-visible-text-layer span'));
  const target = spans.find((span) => (span.textContent || '').includes(${JSON.stringify(
    LIVE_SELECTION_TEXT
  )}));
  if (!(target instanceof HTMLElement)) return '';
    const range = document.createRange();
  range.selectNodeContents(target);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
  return selection?.toString() || '';
})()
`
  );
    if (!selected.includes("I shall be late")) {
      throw new Error(`Alice PDF text could not be selected: ${selected}`);
    }
    await delay(300);
    const documentVisible = await execute<boolean>(
      window,
      `
(() => {
  const viewer = document.querySelector('.pdf-viewer-pane');
  const stage = document.querySelector('.pdf-page-stage');
  const canvas = document.querySelector('.pdf-canvas');
  if (!(viewer instanceof HTMLElement) || !(stage instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    return false;
  }
  viewer.scrollLeft = 0;
  viewer.scrollTop = 0;
  stage.style.marginInline = 'auto';
  return canvas.width > 0 && canvas.height > 0;
})()
`
    );
    if (!documentVisible) throw new Error("Alice PDF canvas was not visible before capture.");
    await delay(250);
  await captureRendererSlot({
    window,
    outputDirectory,
    screenshots,
    slot: "document-alice",
    fileName: "home-document-alice.png",
    focusSelector: ".pdf-reader-grid"
  });
}

async function captureOfficeVideo(
  window: BrowserWindow,
  outputDirectory: string,
  screenshots: HomepageScreenshotRecord[]
) {
  await navigateToRoute(window, "videoReader", "input");
  await waitForSelector(window, ".video-reader-resume-strip", 15_000);
  const opened = await execute<boolean>(
    window,
    `
(() => {
  const buttons = document.querySelectorAll('.video-reader-resume-strip button');
  const bilingual = buttons[1];
  if (!(bilingual instanceof HTMLButtonElement) || bilingual.disabled) return false;
  bilingual.click();
  return true;
})()
`
  );
  if (!opened) throw new Error("Homepage Video Reader resume fixture was unavailable.");
  await waitForSelector(window, ".video-reader-player-shell video", 30_000);
  await waitForCondition(
    window,
    `(() => {
      const video = document.querySelector('.video-reader-player-shell video');
      return video instanceof HTMLVideoElement && video.readyState >= 2;
    })()`,
    30_000,
    "the local office video to load"
  );
  await execute(
    window,
    `
(async () => {
  const video = document.querySelector('.video-reader-player-shell video');
  if (!(video instanceof HTMLVideoElement)) return false;
  video.currentTime = 0.35;
  await new Promise((resolve) => window.setTimeout(resolve, 250));
  await video.play().catch(() => undefined);
  await new Promise((resolve) => window.setTimeout(resolve, 450));
  video.pause();
  return true;
})()
`
  );
  await captureRendererSlot({
    window,
    outputDirectory,
    screenshots,
    slot: "video-reader-sitcom",
    fileName: "home-video-reader-sitcom.png",
    focusSelector: ".video-reader-player-shell"
  });
}

async function seedReviewCards(window: BrowserWindow, sceneImageUrl: string) {
  const sampleCards = createDefaultSampleCards(PROFILE_ID, new Date("2026-07-15T03:00:00.000Z"));
  const selected = (["input", "input-listening", "output"] as CardDeckType[]).map(
    (deckType) => {
      const card = sampleCards.find((candidate) => candidate.deckType === deckType);
      if (!card) throw new Error(`Default ${deckType} card fixture is missing.`);
      const dueCard = makeCardDue({
        ...card,
        id: `homepage-qa:${PROFILE_ID}:${deckType}`
      });
      if (deckType !== "input-listening" || !dueCard.listeningMedia?.frameImage) {
        return dueCard;
      }
      return {
        ...dueCard,
        listeningMedia: {
          ...dueCard.listeningMedia,
          frameImage: {
            ...dueCard.listeningMedia.frameImage,
            fileUrl: sceneImageUrl
          }
        }
      };
    }
  );
  await execute(
    window,
    `
(async () => {
  const api = window.localEnglishMiner?.cards;
  if (!api) throw new Error('Cards API is unavailable.');
  const profileId = ${JSON.stringify(PROFILE_ID)};
  const current = await api.list(profileId);
  for (const item of current) await api.delete(item.id);
  for (const card of ${JSON.stringify(selected)}) await api.save(card, profileId);
  return true;
})()
`
  );
  await delay(500);
}

function makeCardDue(card: StudyCard): StudyCard {
  return {
    ...card,
    srs: {
      ...card.srs,
      dueAt: "2020-01-01T00:00:00.000Z",
      intervalDays: 0,
      reviewCount: 0,
      lapseCount: 0
    },
    updatedAt: "2026-07-15T03:00:00.000Z"
  };
}

async function captureReviewDecks(
  window: BrowserWindow,
  outputDirectory: string,
  screenshots: HomepageScreenshotRecord[]
) {
  await navigateToRoute(window, "review");
  const decks: Array<{
    deck: CardDeckType;
    label: string;
  }> = [
    { deck: "input", label: "reading" },
    { deck: "input-listening", label: "listening" },
    { deck: "output", label: "speaking" }
  ];

  for (const item of decks) {
    const startSelector = `[data-qa="review-start-${item.deck}"]:not([disabled])`;
    await waitForSelector(window, startSelector, 20_000);
    await clickAndWait(window, startSelector, 300);
    await waitForSelector(window, ".review-session-modal .study-card", 15_000);
    await captureRendererSlot({
      window,
      outputDirectory,
      screenshots,
      slot: `${item.label}-card-front`,
      fileName: `home-${item.label}-card-front.png`,
      focusSelector: ".review-session-modal"
    });
    const revealed = await execute<boolean>(
      window,
      `
(() => {
  const button = document.querySelector('.review-session-modal .card-preview-actions button[aria-expanded="false"]');
  if (!(button instanceof HTMLButtonElement)) return false;
  button.click();
  return true;
})()
`
    );
    if (!revealed) throw new Error(`Could not reveal the ${item.label} card answer.`);
    await waitForSelector(window, ".review-session-modal .card-face.card-back", 15_000);
    await execute(
      window,
      `document.querySelector('.review-session-modal .card-face.card-back')?.scrollIntoView({ block: 'start', inline: 'nearest' })`
    );
    await delay(250);
    await captureRendererSlot({
      window,
      outputDirectory,
      screenshots,
      slot: `${item.label}-card-back`,
      fileName: `home-${item.label}-card-back.png`,
      focusSelector: ".review-session-modal"
    });
    await execute(window, `document.querySelector('.review-session-modal .icon-button')?.click()`);
    await waitForSelectorAbsent(window, ".review-session-modal", 10_000);
  }
}

async function captureCompositeWebReaderSlot(input: {
  window: BrowserWindow;
  view: BrowserView;
  outputDirectory: string;
  screenshots: HomepageScreenshotRecord[];
  slot: string;
  fileName: string;
  safetyText: string;
}) {
  if (input.window.isMinimized()) input.window.restore();
  input.window.show();
  input.window.focus();
  await delay(300);
  const contentBounds = input.window.getContentBounds();
  const viewBounds = input.view.getBounds();
  const shellImage = await capturePageWithRetry("Web Reader app shell", () =>
    input.window.webContents.capturePage({
      x: 0,
      y: 0,
      width: Math.max(1, contentBounds.width),
      height: Math.max(1, contentBounds.height)
    })
  );
  const viewImage = await captureBrowserViewPage(input.view);
  const shellPng = shellImage.toPNG();
  const viewPng = viewImage.toPNG();
  if (!shellPng.length || !viewPng.length) {
    throw new Error(`Could not capture the composite Web Reader surfaces: ${input.fileName}`);
  }
  const shellMetadata = await sharp(shellPng).metadata();
  const shellWidth = shellMetadata.width ?? contentBounds.width;
  const shellHeight = shellMetadata.height ?? contentBounds.height;
  const scaleX = shellWidth / Math.max(1, contentBounds.width);
  const scaleY = shellHeight / Math.max(1, contentBounds.height);
  const left = Math.max(0, Math.round(viewBounds.x * scaleX));
  const top = Math.max(0, Math.round(viewBounds.y * scaleY));
  const width = Math.max(1, Math.min(shellWidth - left, Math.round(viewBounds.width * scaleX)));
  const height = Math.max(1, Math.min(shellHeight - top, Math.round(viewBounds.height * scaleY)));
  if (width <= 0 || height <= 0) {
    throw new Error(`Web Reader BrowserView bounds were outside the app surface: ${JSON.stringify(viewBounds)}`);
  }
  const overlay = await sharp(viewPng).resize(width, height, { fit: "fill" }).png().toBuffer();
  const pngPath = path.join(input.outputDirectory, input.fileName);
  await sharp(shellPng)
    .composite([{ input: overlay, left, top }])
    .png()
    .toFile(pngPath);
  input.screenshots.push(
    createScreenshotRecord(input.slot, input.fileName, pngPath, input.safetyText)
  );
}

async function captureRendererSlot(input: {
  window: BrowserWindow;
  outputDirectory: string;
  screenshots: HomepageScreenshotRecord[];
  slot: string;
  fileName: string;
  focusSelector?: string;
}) {
  if (input.focusSelector) {
    await execute(
      input.window,
      `
(() => {
  const target = document.querySelector(${JSON.stringify(input.focusSelector)});
  if (target instanceof HTMLElement) target.scrollIntoView({ block: 'center', inline: 'nearest' });
})()
`
    );
  }
  await delay(300);
  const pngPath = path.join(input.outputDirectory, input.fileName);
  if (input.window.isMinimized()) input.window.restore();
  input.window.show();
  input.window.focus();
  await delay(200);
  const bounds = input.window.getContentBounds();
  const image = await capturePageWithRetry(input.fileName, () =>
    input.window.webContents.capturePage({
      x: 0,
      y: 0,
      width: Math.max(1, bounds.width),
      height: Math.max(1, bounds.height)
    })
  );
  const png = image.toPNG();
  if (!png.length) throw new Error(`Empty screenshot: ${pngPath}`);
  fs.writeFileSync(pngPath, png);
  const scannedText = await collectVisibleSafetyText(input.window);
  input.screenshots.push(
    createScreenshotRecord(input.slot, input.fileName, pngPath, scannedText)
  );
}

async function capturePageWithRetry(
  label: string,
  capture: () => Promise<NativeImage>
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const image = await capture();
      if (!image.isEmpty()) return image;
      lastError = new Error(`${label} returned an empty image.`);
    } catch (caught) {
      lastError = caught;
    }
    await delay(attempt * 250);
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError ?? "unknown error");
  throw new Error(`Could not capture ${label}: ${detail}`);
}

async function captureBrowserViewPage(view: BrowserView) {
  try {
    return await capturePageWithRetry("Web Reader page", () =>
      view.webContents.capturePage()
    );
  } catch (surfaceError) {
    const debug = view.webContents.debugger;
    const attachedHere = !debug.isAttached();
    try {
      if (attachedHere) debug.attach("1.3");
      const result = (await debug.sendCommand("Page.captureScreenshot", {
        format: "png",
        fromSurface: false,
        captureBeyondViewport: false
      })) as { data?: string };
      const png = result.data ? Buffer.from(result.data, "base64") : Buffer.alloc(0);
      const image = nativeImage.createFromBuffer(png);
      if (!png.length || image.isEmpty()) {
        throw new Error("Chrome returned an empty BrowserView screenshot.");
      }
      return image;
    } catch (debuggerError) {
      const surfaceDetail =
        surfaceError instanceof Error ? surfaceError.message : String(surfaceError);
      const debuggerDetail =
        debuggerError instanceof Error ? debuggerError.message : String(debuggerError);
      throw new Error(
        `Could not capture Web Reader page. Electron: ${surfaceDetail}; CDP: ${debuggerDetail}`
      );
    } finally {
      if (attachedHere && debug.isAttached()) debug.detach();
    }
  }
}

function createScreenshotRecord(
  slot: string,
  fileName: string,
  pngPath: string,
  scannedText: string
): HomepageScreenshotRecord {
  const size = nativeImage.createFromPath(pngPath).getSize();
  return {
    slot,
    fileName,
    pngPath,
    width: size.width,
    height: size.height,
    sha256Source: "generated-by-electron",
    textSafety: {
      scannedCharacterCount: scannedText.length,
      findings: findSensitiveText(scannedText)
    }
  };
}

async function collectVisibleSafetyText(window: BrowserWindow) {
  const rendererText = await execute<string>(
    window,
    `
(() => {
  const intersectsViewport = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
  };
  const visibleText = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    const closedDetails = parent?.closest('details:not([open])');
    const insideVisibleSummary = closedDetails && parent?.closest('summary');
    if (parent && intersectsViewport(parent) && (!closedDetails || insideVisibleSummary)) {
      const value = String(node.nodeValue || '').trim();
      if (value) visibleText.push(value);
    }
    node = walker.nextNode();
  }
  const values = Array.from(document.querySelectorAll('input, textarea, select'))
    .filter((element) => !(element instanceof HTMLInputElement) || !['file', 'password'].includes(element.type))
    .filter(intersectsViewport)
    .map((element) => 'value' in element ? String(element.value || '') : '')
    .filter(Boolean);
  const links = Array.from(document.querySelectorAll('a[href]'))
    .filter(intersectsViewport)
    .map((element) => element.getAttribute('href') || '')
    .filter(Boolean);
  return [...visibleText, ...values, ...links, document.title].join('\n');
})()
`
  ).catch(() => "");
  const frameText: string[] = [];
  for (const frame of window.webContents.mainFrame.framesInSubtree) {
    if (frame === window.webContents.mainFrame) continue;
    const childText = await frame
      .executeJavaScript(
        `(() => {
          const body = document.body?.innerText || '';
          return [body.slice(0, 4000), location.href].join('\\n');
        })()`
      )
      .catch(() => "");
    frameText.push(typeof childText === "string" ? childText : "");
  }
  return [rendererText, ...frameText].join("\n");
}

function findSensitiveText(value: string) {
  const findings: string[] = [];
  const checks: Array<[string, RegExp]> = [
    ["email-address", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
    ["windows-absolute-path", /(?:^|\s)(?:[A-Z]:\\|\\\\)[^\s]+/i],
    ["user-profile-path", /\bUsers[\\/][^\s\\/]+/i],
    ["openai-style-key", /\bsk-[A-Za-z0-9_-]{12,}\b/],
    ["google-api-key", /\bAIza[0-9A-Za-z_-]{20,}\b/],
    ["credential-assignment", /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*[^\s]{8,}/i]
  ];
  for (const [label, pattern] of checks) {
    if (pattern.test(value)) findings.push(label);
  }
  return findings;
}

async function ensureRendererLocale(window: BrowserWindow, locale: HomepageScreenshotLocale) {
  const current = await execute<string | null>(window, `localStorage.getItem('lem:appLocale')`);
  const documentLanguage = await execute<string>(window, `document.documentElement.lang`);
  if (current === locale && documentLanguage === locale) return;
  await execute(window, `localStorage.setItem('lem:appLocale', ${JSON.stringify(locale)})`);
  await reloadWindow(window);
}

async function navigateToRoute(window: BrowserWindow, route: string, section?: string) {
  await execute(
    window,
    `
(async () => {
  const sectionId = ${JSON.stringify(section ?? "")};
  if (sectionId) {
    const sectionButton = document.querySelector('[data-qa="nav-section-' + sectionId + '"]');
    if (sectionButton instanceof HTMLButtonElement && sectionButton.getAttribute('aria-expanded') !== 'true') {
      sectionButton.click();
      await new Promise((resolve) => setTimeout(resolve, 160));
    }
  }
  const button = document.querySelector('[data-qa="nav-${route}"]');
  if (!(button instanceof HTMLButtonElement)) throw new Error('Missing navigation route: ${route}');
  button.click();
  await new Promise((resolve) => setTimeout(resolve, 350));
})()
`
  );
}

async function setFileInput(window: BrowserWindow, selector: string, filePath: string) {
  const debuggerApi = window.webContents.debugger;
  const attachedHere = !debuggerApi.isAttached();
  if (attachedHere) debuggerApi.attach("1.3");
  try {
    const root = (await debuggerApi.sendCommand("DOM.getDocument", { depth: -1 })) as {
      root: { nodeId: number };
    };
    const query = (await debuggerApi.sendCommand("DOM.querySelector", {
      nodeId: root.root.nodeId,
      selector
    })) as { nodeId: number };
    if (!query.nodeId) throw new Error(`Could not find file input: ${selector}`);
    await debuggerApi.sendCommand("DOM.setFileInputFiles", {
      files: [filePath],
      nodeId: query.nodeId
    });
  } finally {
    if (attachedHere && debuggerApi.isAttached()) debuggerApi.detach();
  }
  await delay(400);
}

async function clickAndWait(window: BrowserWindow, selector: string, waitMs: number) {
  const clicked = await execute<boolean>(
    window,
    `
(() => {
  const element = document.querySelector(${JSON.stringify(selector)});
  if (!(element instanceof HTMLElement)) return false;
  element.click();
  return true;
})()
`
  );
  if (!clicked) throw new Error(`Could not click selector: ${selector}`);
  await delay(waitMs);
}

async function waitForWebReaderView(webReader: AppSmokeQaWebReaderAccess, timeoutMs: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const view = webReader.getView();
    if (view && !view.webContents.isDestroyed()) return view;
    await delay(150);
  }
  throw new Error("Timed out waiting for the Web Reader BrowserView.");
}

async function waitForWebReaderUrl(view: BrowserView, expectedUrl: string, timeoutMs: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!view.webContents.isDestroyed() && view.webContents.getURL() === expectedUrl) return;
    await delay(150);
  }
  throw new Error(`Timed out waiting for the live Web Reader URL: ${expectedUrl}`);
}

async function waitForWebReaderReady(view: BrowserView, timeoutMs: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const ready = await view.webContents
      .executeJavaScript(`document.readyState === 'complete' && document.body?.innerText.includes('I shall be late')`)
      .catch(() => false);
    if (ready) return;
    await delay(200);
  }
  throw new Error("Live Web Reader page did not finish loading its Alice excerpt.");
}

async function waitForSelector(window: BrowserWindow, selector: string, timeoutMs: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await selectorExists(window, selector)) return;
    await delay(150);
  }
  throw new Error(`Timed out waiting for selector: ${selector}`);
}

async function waitForSelectorAbsent(window: BrowserWindow, selector: string, timeoutMs: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!(await selectorExists(window, selector))) return;
    await delay(120);
  }
  throw new Error(`Timed out waiting for selector to close: ${selector}`);
}

async function selectorExists(window: BrowserWindow, selector: string) {
  return execute<boolean>(
    window,
    `Boolean(document.querySelector(${JSON.stringify(selector)}))`
  ).catch(() => false);
}

async function waitForCondition(
  window: BrowserWindow,
  expression: string,
  timeoutMs: number,
  label: string
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const ready = await execute<boolean>(window, expression).catch(() => false);
    if (ready) return;
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function reloadWindow(window: BrowserWindow) {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Renderer reload timed out.")), 30_000);
    window.webContents.once("did-finish-load", () => {
      clearTimeout(timeout);
      resolve();
    });
    window.webContents.reload();
  });
  await delay(300);
}

async function waitForWindowLoad(window: BrowserWindow) {
  if (!window.webContents.isLoading()) {
    await delay(750);
    return;
  }
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, 30_000);
    window.webContents.once("did-finish-load", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
  await delay(250);
}

function execute<T = unknown>(window: BrowserWindow, script: string) {
  return window.webContents.executeJavaScript(script, true) as Promise<T>;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
