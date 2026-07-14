import { app, BrowserWindow, type BrowserView } from "electron";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createAppBackupDocument, writeAppBackupFile } from "./appBackupService";
import { createEmptyAppBackupTables } from "../src/shared/appBackup";
import {
  captureDesktopWindowScreenshot,
  captureWebReaderViewProofScreenshot
} from "./appSmokeScreenshots";
import type { AppSmokeQaWebReaderAccess } from "./appSmokeQa";
import { WEB_READER_PRACTICE_URL } from "../src/shared/webReaderPractice";

type DocsScreenshotLocale = "ko" | "en";

type DocsScreenshotRecord = {
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

type DocsScreenshotSkipped = {
  slot: string;
  fileName: string;
  reason: string;
};

const FIXED_SENTENCE = "I’m running a little late.";
const FIXED_SENTENCE_ASCII = "I'm running a little late.";
const FIXED_MEANING_KO = "조금 늦을 것 같아요.";
const DOCS_VIEWPORT = { width: 1240, height: 820 };
const DEFAULT_PROFILE_ID = "profile-english";

export async function runDocsScreenshotQa(
  window: BrowserWindow,
  reportPath: string,
  outputDirectory: string,
  locale: DocsScreenshotLocale,
  webReader: AppSmokeQaWebReaderAccess
) {
  const startedAt = new Date();
  const screenshots: DocsScreenshotRecord[] = [];
  const skipped: DocsScreenshotSkipped[] = [];
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });

  try {
    await waitForWindowLoad(window);
    window.setSize(DOCS_VIEWPORT.width, DOCS_VIEWPORT.height);
    window.center();
    await ensureRendererLocale(window, locale);
    await waitForSelector(window, '[data-qa="app-onboarding"]', 30_000);

    await captureRendererSlot({
      window,
      outputDirectory,
      screenshots,
      slot: "01",
      fileName: "01-onboarding-language.png",
      focusSelector: '[data-qa="app-onboarding"]'
    });

    await clickAndWait(window, '[data-qa="onboarding-skip"]', 250);
    await waitForSelector(window, '[data-qa="nav-pdfHub"]', 30_000);

    await captureWebReaderSequence(window, outputDirectory, screenshots, webReader);
    await replaceCardsWithDocsFixture(window);
    await captureReviewSequence(window, outputDirectory, screenshots);
    await captureWritingResult(window, outputDirectory, screenshots);
    await captureCharacterChat(window, outputDirectory, screenshots);
    await captureListeningLoop(window, outputDirectory, screenshots);
    await capturePlayZone(window, outputDirectory, screenshots, skipped);
    await captureSettingsSequence(window, outputDirectory, screenshots, locale);

    const report = {
      status: screenshots.every((shot) => shot.textSafety.findings.length === 0)
        ? "passed"
        : "failed",
      locale,
      fixedSentence: FIXED_SENTENCE,
      viewport: DOCS_VIEWPORT,
      userDataPolicy: "fresh temporary Electron userData",
      networkPolicy: "No cloud AI call and no third-party video are used by the fixture flow.",
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      screenshots,
      skipped
    };
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    if (report.status !== "passed") {
      throw new Error(`Docs screenshot safety scan failed: ${reportPath}`);
    }
  } catch (caught) {
    if (!fs.existsSync(reportPath)) {
      fs.writeFileSync(
        reportPath,
        `${JSON.stringify(
          {
            status: "failed",
            locale,
            fixedSentence: FIXED_SENTENCE,
            viewport: DOCS_VIEWPORT,
            startedAt: startedAt.toISOString(),
            finishedAt: new Date().toISOString(),
            screenshots,
            skipped,
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

async function captureWebReaderSequence(
  window: BrowserWindow,
  outputDirectory: string,
  screenshots: DocsScreenshotRecord[],
  webReader: AppSmokeQaWebReaderAccess
) {
  await navigateToRoute(window, "webReader", "input");
  await clickAndWait(window, '[data-qa="web-reader-open-practice"]', 350);
  const view = await waitForWebReaderView(webReader, 15_000);
  await waitForWebReaderUrl(view, WEB_READER_PRACTICE_URL, 15_000);
  const injected = await webReader.injectSelectionPopover();
  if (!injected) {
    throw new Error("Web Reader fixture selection popover could not be injected.");
  }
  const popover = await view.webContents.executeJavaScript(`
(async () => {
  const target = document.querySelector('.target');
  const api = window.__LEM_WEB_READER_POPOVER;
  if (!(target instanceof HTMLElement) || !api || typeof api.showFromSelection !== 'function') {
    return { visible: false, reason: 'practice target or popover API missing' };
  }
  target.scrollIntoView({ block: 'center', inline: 'nearest' });
  await new Promise((resolve) => window.setTimeout(resolve, 100));
  const range = document.createRange();
  range.selectNodeContents(target);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  api.showFromSelection({ allowReplaceLocked: true });
  return typeof api.debug === 'function' ? api.debug() : { visible: true, text: selection.toString() };
})()
`) as { visible?: boolean; text?: string; reason?: string };
  if (!popover || !(popover as { visible?: boolean }).visible) {
    throw new Error(`Web Reader fixture selection popover did not open: ${JSON.stringify(popover)}`);
  }
  const resetPopover = await view.webContents.executeJavaScript(`
(() => {
  const api = window.__LEM_WEB_READER_POPOVER;
  if (!api || typeof api.showFromSelection !== 'function') return { visible: false };
  if (typeof api.hide === 'function') api.hide();
  api.showFromSelection();
  return typeof api.debug === 'function' ? api.debug() : { visible: true };
})()
`) as { visible?: boolean; text?: string };
  if (!resetPopover.visible) {
    throw new Error(`Web Reader fixture action popover could not be restored: ${JSON.stringify(resetPopover)}`);
  }
  await delay(250);

  const selectPngPath = path.join(outputDirectory, "06-web-reader-select.png");
  // Windows desktop capture can omit BrowserView pixels and leave a blank white
  // content area. Capture the actual BrowserView surface so documentation never
  // publishes a misleading blank frame.
  await captureWebReaderViewProofScreenshot(selectPngPath, webReader);
  screenshots.push(
    await createScreenshotRecord(
      "06",
      "06-web-reader-select.png",
      selectPngPath,
      await collectSafetyText(window, webReader)
    )
  );

  const clicked = await view.webContents.executeJavaScript(`
(() => {
  const host = document.querySelector('#lem-selection-card-popover');
  const button = host?.shadowRoot?.querySelector('[data-action="card"]');
  if (!(button instanceof HTMLButtonElement)) return false;
  button.click();
  return true;
})()
`);
  if (!clicked) {
    throw new Error("Web Reader fixture could not click the real sentence-card action.");
  }
  await waitForSelector(window, '[data-qa="web-reader-card-preview"]', 30_000);
  await waitForText(window, "running a little late", 15_000);
  await captureRendererSlot({
    window,
    outputDirectory,
    screenshots,
    slot: "07",
    fileName: "07-reading-card-preview.png",
    focusSelector: '[data-qa="web-reader-card-preview"]'
  });
  await execute(window, `
(() => {
  const dialog = document.querySelector('[data-qa="web-reader-card-preview"]');
  const close = dialog?.querySelector('.icon-button');
  if (close instanceof HTMLButtonElement) close.click();
})()
`);
}

async function replaceCardsWithDocsFixture(window: BrowserWindow) {
  const cards = [createDocsReadingCard(), createDocsOutputCard()];
  await execute(
    window,
    `
(async () => {
  const api = window.localEnglishMiner;
  if (!api?.cards) throw new Error('Cards API is unavailable.');
  const current = await api.cards.list(${JSON.stringify(DEFAULT_PROFILE_ID)});
  for (const item of current) await api.cards.delete(item.id);
  for (const card of ${JSON.stringify(cards)}) {
    await api.cards.save(card, ${JSON.stringify(DEFAULT_PROFILE_ID)});
  }
  return true;
})()
`
  );
  await delay(650);
}

function createDocsReadingCard() {
  const now = "2026-07-14T00:00:00.000Z";
  return {
    id: "docs-fixture-running-late-reading",
    profileId: DEFAULT_PROFILE_ID,
    cardType: "reading",
    deckType: "input",
    direction: "en_to_ko",
    languageMetadata: {
      profileTargetLanguageCode: "en",
      profileNativeLanguageCode: "ko",
      detectedSourceLanguageCode: "en",
      actualSourceLanguageCode: "en",
      confidence: 1,
      policyStatus: "match",
      sourceKind: "original"
    },
    sourceSentence: FIXED_SENTENCE_ASCII,
    targetText: FIXED_MEANING_KO,
    frontText: FIXED_SENTENCE_ASCII,
    literalTranslationKo: "나는 조금 늦게 가고 있는 중입니다.",
    naturalTranslationKo: FIXED_MEANING_KO,
    highlightMappings: [
      {
        sourceText: "running a little late",
        literalKo: "조금 늦게 가는 중",
        naturalKo: "조금 늦을 것 같아요",
        colorKey: "cyan"
      }
    ],
    vocabularyItems: [],
    confusingComparisons: [],
    pumpPrompts: [],
    tags: ["docs-fixture", "일정", "약속"],
    srs: {
      dueAt: "2020-01-01T00:00:00.000Z",
      intervalDays: 0,
      easeFactor: 2.5,
      reviewCount: 0,
      lapseCount: 0
    },
    createdAt: now,
    updatedAt: now
  };
}

function createDocsOutputCard() {
  const now = "2026-07-14T00:00:00.000Z";
  return {
    id: "docs-fixture-running-late-output",
    profileId: DEFAULT_PROFILE_ID,
    cardType: "life_expression",
    deckType: "output",
    direction: "native_to_target",
    languageMetadata: {
      profileTargetLanguageCode: "en",
      profileNativeLanguageCode: "ko",
      detectedSourceLanguageCode: "ko",
      actualSourceLanguageCode: "ko",
      confidence: 1,
      policyStatus: "match",
      sourceKind: "original"
    },
    sourceSentence: "친구에게 조금 늦는다고 알려 주세요.",
    targetText: FIXED_SENTENCE_ASCII,
    frontText:
      `상황\n친구와 만나기로 했는데 교통이 지연되어 조금 늦는다고 알려 주는 상황입니다.\n\n내가 말할 문장\n친구에게 조금 늦는다고 알려 주세요.`,
    literalTranslationKo: `추천 영어\n${FIXED_SENTENCE_ASCII}`,
    naturalTranslationKo: `자연스러운 뜻\n${FIXED_MEANING_KO}`,
    highlightMappings: [
      {
        sourceText: "running a little late",
        literalKo: "조금 늦게 가는 중",
        naturalKo: "조금 늦을 것 같아요",
        colorKey: "cyan"
      }
    ],
    vocabularyItems: [],
    pumpPrompts: [
      {
        type: "ko_to_en",
        promptKo: "친구에게 조금 늦는다고 알려 주세요.",
        requiredTerms: ["running a little late"]
      }
    ],
    structureNote: "be running late는 약속 시간에 늦을 것 같다고 자연스럽게 알릴 때 씁니다.",
    tags: ["docs-fixture", "일정", "약속"],
    outputStudyGuide: {
      templateVersion: "adaptive-v1",
      contextKo: "교통이 지연되어 친구에게 조금 늦는다고 알리는 상황입니다.",
      dialogue: [
        {
          speaker: "Friend",
          role: "context",
          ko: "어디쯤이야?",
          en: "Where are you?",
          pronunciationKo: "웨어 아 유?",
          ipa: "/wer ɑːr juː/"
        },
        {
          speaker: "Me",
          role: "me",
          ko: FIXED_MEANING_KO,
          en: FIXED_SENTENCE_ASCII,
          pronunciationKo: "아임 러닝 어 리를 레이트.",
          ipa: "/aɪm ˈrʌnɪŋ ə ˈlɪtəl leɪt/",
          highlightKo: "조금 늦을 것 같아요",
          highlightEn: "running a little late"
        }
      ],
      keyChunks: [
        {
          label: "핵심 표현",
          en: "running a little late",
          ko: "조금 늦을 것 같다",
          pronunciationKo: "러닝 어 리를 레이트",
          ipa: "/ˈrʌnɪŋ ə ˈlɪtəl leɪt/",
          tone: "learner"
        }
      ],
      insight: {
        title: "늦는다는 말을 부드럽게 알리기",
        bodyKo: "late만 말하기보다 running a little late를 쓰면 현재 상황을 자연스럽게 설명할 수 있습니다."
      },
      literalMeaningKo: "나는 조금 늦게 가는 중입니다.",
      nuanceKo: "약속 상대에게 지연 상황을 짧고 자연스럽게 알리는 표현입니다.",
      breakdown: [
        { expression: "be running late", meaningKo: "예정보다 늦고 있다" },
        { expression: "a little", meaningKo: "조금" }
      ],
      alternatives: [
        {
          en: "I’ll be there a little late.",
          ko: "조금 늦게 도착할게요.",
          pronunciationKo: "아일 비 데어 어 리를 레이트.",
          ipa: "/aɪl biː ðer ə ˈlɪtəl leɪt/"
        }
      ],
      commonMistake: {
        wrong: {
          en: "I am late a little.",
          ko: "나는 늦다 조금.",
          pronunciationKo: "아이 앰 레이트 어 리를.",
          ipa: "/aɪ æm leɪt ə ˈlɪtəl/"
        },
        right: {
          en: FIXED_SENTENCE_ASCII,
          ko: FIXED_MEANING_KO,
          pronunciationKo: "아임 러닝 어 리를 레이트.",
          ipa: "/aɪm ˈrʌnɪŋ ə ˈlɪtəl leɪt/",
          highlightEn: "running a little late"
        },
        explanationKo: "a little은 late 앞에 두고, 진행 중인 지연은 be running late로 표현합니다."
      },
      miniDrills: [
        {
          en: "Sorry, I’m running late.",
          ko: "미안해요, 조금 늦고 있어요.",
          pronunciationKo: "쏘리, 아임 러닝 레이트.",
          ipa: "/ˈsɑːri aɪm ˈrʌnɪŋ leɪt/"
        }
      ],
      tags: ["일정", "약속"]
    },
    srs: {
      dueAt: "2020-01-01T00:00:00.000Z",
      intervalDays: 0,
      easeFactor: 2.5,
      reviewCount: 0,
      lapseCount: 0
    },
    createdAt: now,
    updatedAt: now
  };
}

async function captureReviewSequence(
  window: BrowserWindow,
  outputDirectory: string,
  screenshots: DocsScreenshotRecord[]
) {
  await navigateToRoute(window, "review");
  await waitForSelector(window, '[data-qa="review-start-input"]:not([disabled])', 20_000);
  await clickAndWait(window, '[data-qa="review-start-input"]', 350);
  await waitForSelector(window, ".review-session-modal .study-card", 15_000);
  await captureRendererSlot({
    window,
    outputDirectory,
    screenshots,
    slot: "09",
    fileName: "09-review-front.png",
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
  if (!revealed) throw new Error("Review fixture answer button was not available.");
  await waitForSelector(window, ".review-session-modal .card-face.card-back", 15_000);
  await execute(
    window,
    `document.querySelector('.review-session-modal .review-actions')?.scrollIntoView({ block: 'end', inline: 'nearest' })`
  );
  await delay(250);
  await captureRendererSlot({
    window,
    outputDirectory,
    screenshots,
    slot: "10",
    fileName: "10-review-answer.png",
    focusSelector: ".review-session-modal"
  });
  await execute(window, `document.querySelector('.review-session-modal .icon-button')?.click()`);
}

async function captureWritingResult(
  window: BrowserWindow,
  outputDirectory: string,
  screenshots: DocsScreenshotRecord[]
) {
  await navigateToRoute(window, "writingPractice", "output");
  await waitForSelector(window, "#writing-practice-answer", 15_000);
  const foundFixedPrompt = await execute<boolean>(
    window,
    `
(async () => {
  const expected = ${JSON.stringify(FIXED_MEANING_KO)};
  for (let attempt = 0; attempt < 1_100; attempt += 1) {
    const prompt = document.querySelector('.writing-prompt-card p')?.textContent?.trim() ?? '';
    if (prompt === expected) return true;
    const next = document.querySelector('[data-qa="writing-next-button"]');
    if (!(next instanceof HTMLButtonElement) || next.disabled) return false;
    next.click();
    await new Promise((resolve) => window.setTimeout(resolve, 12));
  }
  return false;
})()
`
  );
  if (!foundFixedPrompt) {
    throw new Error(`Writing fixture prompt was not found: ${FIXED_MEANING_KO}`);
  }
  await execute(
    window,
    `
(() => {
  const input = document.querySelector('#writing-practice-answer');
  if (!(input instanceof HTMLTextAreaElement)) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(input, ${JSON.stringify(FIXED_SENTENCE_ASCII)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()
`
  );
  await clickAndWait(window, '[data-qa="writing-check-button"]', 350);
  await waitForSelector(window, ".writing-score-card", 15_000);
  await captureRendererSlot({
    window,
    outputDirectory,
    screenshots,
    slot: "12",
    fileName: "12-writing-result.png",
    focusSelector: ".writing-practice-page"
  });
}

async function captureCharacterChat(
  window: BrowserWindow,
  outputDirectory: string,
  screenshots: DocsScreenshotRecord[]
) {
  await navigateToRoute(window, "characterChat", "output");
  await waitForSelector(window, ".character-chat-home", 15_000);
  const opened = await execute<boolean>(
    window,
    `
(() => {
  const buttons = document.querySelectorAll('.character-home-hero-actions button');
  const practice = buttons[2];
  if (!(practice instanceof HTMLButtonElement) || practice.disabled) return false;
  practice.click();
  return true;
})()
`
  );
  if (!opened) throw new Error("Character Chat practice mode could not be opened.");
  await waitForSelector(window, ".character-chat-composer textarea", 15_000);
  await execute(
    window,
    `
(() => {
  const input = document.querySelector('.character-chat-composer textarea');
  if (!(input instanceof HTMLTextAreaElement)) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(input, ${JSON.stringify(FIXED_SENTENCE_ASCII)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  const send = document.querySelector('.character-chat-composer-actions .button.primary');
  if (!(send instanceof HTMLButtonElement)) return false;
  send.click();
  return true;
})()
`
  );
  await waitForSelector(window, ".character-message.user", 15_000);
  await waitForSelector(window, ".character-message.character:not(.pending)", 30_000);
  await captureRendererSlot({
    window,
    outputDirectory,
    screenshots,
    slot: "14",
    fileName: "14-character-chat.png",
    focusSelector: ".character-message-list"
  });
}

async function captureListeningLoop(
  window: BrowserWindow,
  outputDirectory: string,
  screenshots: DocsScreenshotRecord[]
) {
  await execute(
    window,
    `
(() => {
  const date = new Date();
  const dateKey = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  const state = {
    version: 6,
    dateKey,
    targetLanguageCode: 'en',
    partialVideoClipsEnabled: false,
    sentenceTargetCount: 5,
    seed: {
      id: 'daily-routine:docs-fixture',
      title: 'Everyday schedule message',
      channelName: 'Language Miner local fixture',
      videoId: '',
      languageCode: 'en',
      levelLabel: 'A2-B1',
      topicLabel: 'Everyday English',
      recommendedReason: 'A short locally owned practice routine.',
      segments: [
        {
          id: 'docs-listening-1',
          speaker: 'Speaker',
          start: 0,
          end: 3.5,
          text: ${JSON.stringify(FIXED_SENTENCE_ASCII)},
          translationKo: ${JSON.stringify(FIXED_MEANING_KO)},
          noteKo: 'running late를 한 덩어리로 들어 보세요.'
        }
      ]
    },
    reserveSegments: [],
    selectedCandidateIds: [],
    createdAt: '2026-07-14T00:00:00.000Z'
  };
  localStorage.setItem('lem:listeningLoop:dailyRoutine:profile-english:en', JSON.stringify(state));
})()
`
  );
  await navigateToRoute(window, "listeningLoop", "input");
  await waitForSelector(window, '[data-qa="listening-resume-routine"]', 15_000);
  await clickAndWait(window, '[data-qa="listening-resume-routine"]', 400);
  await waitForSelector(window, ".listening-loop-main", 15_000);
  await clickAndWait(window, '[data-qa="listening-subtitle-toggle"]', 250);
  await waitForText(window, FIXED_SENTENCE_ASCII, 15_000);
  await execute(
    window,
    `
(() => {
  const loop = document.querySelector('[data-qa="listening-loop-toggle"]');
  if (loop instanceof HTMLButtonElement && loop.getAttribute('aria-pressed') !== 'true') {
    loop.click();
  }
  const source = document.querySelector('[data-qa="listening-subtitle-source"]');
  if (!(source instanceof HTMLElement)) return false;
  const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT);
  const needle = 'running a little late';
  let node = walker.nextNode();
  while (node) {
    const value = String(node.nodeValue || '');
    const start = value.toLowerCase().indexOf(needle);
    if (start >= 0) {
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + needle.length);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      const highlight = document.querySelector('[data-qa="listening-highlight-selection"]');
      if (highlight instanceof HTMLButtonElement) highlight.click();
      return true;
    }
    node = walker.nextNode();
  }
  return false;
})()
`
  );
  await delay(250);
  await captureRendererSlot({
    window,
    outputDirectory,
    screenshots,
    slot: "16",
    fileName: "16-listening-loop.png",
    focusSelector: ".listening-loop-main"
  });
}

async function capturePlayZone(
  window: BrowserWindow,
  outputDirectory: string,
  screenshots: DocsScreenshotRecord[],
  skipped: DocsScreenshotSkipped[]
) {
  await navigateToRoute(window, "playZone");
  await waitForSelector(window, '[data-qa="play-zone-official-pack"]', 20_000);
  await captureRendererSlot({
    window,
    outputDirectory,
    screenshots,
    slot: "18",
    fileName: "18-playzone-official-library.png",
    focusSelector: ".play-zone-grid"
  });

  const openedConfirmation = await execute<boolean>(
    window,
    `
(async () => {
  const pack = document.querySelector('[data-qa="play-zone-official-pack"][data-pack-id="meowthology.abyss-summoner"]') ||
    document.querySelector('[data-qa="play-zone-official-pack"]');
  if (!(pack instanceof HTMLButtonElement)) return false;
  pack.click();
  await new Promise((resolve) => setTimeout(resolve, 250));
  const play = document.querySelector('[data-qa="play-zone-play-selected"]');
  if (!(play instanceof HTMLButtonElement) || play.disabled) return false;
  play.click();
  return true;
})()
`
  );
  if (!openedConfirmation) throw new Error("Official PlayZone install confirmation did not open.");
  await waitForSelector(window, '[data-qa="play-zone-install-confirmation"]', 15_000);
  await captureRendererSlot({
    window,
    outputDirectory,
    screenshots,
    slot: "19",
    fileName: "19-playzone-install-confirm.png",
    focusSelector: '[data-qa="play-zone-install-confirmation"]'
  });
  await execute(
    window,
    `document.querySelector('[data-qa="play-zone-install-confirmation"] .icon-button')?.click()`
  );

  const archivePath = process.env.LM_QA_DOCS_GAME_ARCHIVE;
  if (!archivePath || !fs.existsSync(archivePath)) {
    skipped.push({
      slot: "21",
      fileName: "21-playzone-gameplay.png",
      reason: "A verified local official .lemgame archive was not supplied to the QA runner."
    });
    return;
  }

  await execute(
    window,
    `
(async () => {
  const api = window.localEnglishMiner?.playZone;
  if (!api?.installPack) throw new Error('PlayZone installer API is unavailable.');
  return api.installPack({ sourcePath: ${JSON.stringify(archivePath)} });
})()
`
  );
  await navigateToRoute(window, "pdfHub");
  await navigateToRoute(window, "playZone");
  await waitForSelector(window, '[data-qa="play-zone-play-selected"]:not([disabled])', 30_000);

  const existingIds = new Set(BrowserWindow.getAllWindows().map((candidate) => candidate.id));
  await clickAndWait(window, '[data-qa="play-zone-play-selected"]', 250);
  const runtimeWindow = await waitForNewWindow(existingIds, 30_000);
  await waitForSelector(runtimeWindow, '[data-qa="play-zone-runtime-window"]', 20_000);
  await waitForRuntimeGameFrame(runtimeWindow, 30_000);
  await captureRendererSlot({
    window: runtimeWindow,
    outputDirectory,
    screenshots,
    slot: "21",
    fileName: "21-playzone-gameplay.png",
    focusSelector: '[data-qa="play-zone-runtime-window"]'
  });
  runtimeWindow.close();
  window.show();
  window.focus();
}

async function captureSettingsSequence(
  window: BrowserWindow,
  outputDirectory: string,
  screenshots: DocsScreenshotRecord[],
  locale: DocsScreenshotLocale
) {
  await navigateToRoute(window, "settings", "manage");
  await selectSettingsTab(window, 1);
  await captureRendererSlot({
    window,
    outputDirectory,
    screenshots,
    slot: "22",
    fileName: "22-ai-options.png",
    focusSelector: ".settings-ai-panel"
  });

  await execute(
    window,
    `
(() => {
  const providers = document.querySelectorAll('.settings-provider-grid.four > button');
  const ollama = providers[1];
  if (!(ollama instanceof HTMLButtonElement)) return false;
  ollama.click();
  return true;
})()
`
  );
  await delay(250);
  await clickAndWait(window, '[data-qa="settings-card-engine-test"]:not([disabled])', 250);
  await waitForText(
    window,
    locale === "ko"
      ? "Ollama 실행 파일을 찾을 수 없습니다."
      : "Could not find the Ollama executable.",
    15_000
  );
  await captureRendererSlot({
    window,
    outputDirectory,
    screenshots,
    slot: "23",
    fileName: "23-ollama-not-ready.png",
    focusSelector: '[data-qa="settings-card-engine-test"]'
  });

  await execute(
    window,
    `
(() => {
  const providers = document.querySelectorAll('.settings-provider-grid.four > button');
  const gemini = providers[0];
  if (!(gemini instanceof HTMLButtonElement)) return false;
  gemini.click();
  return true;
})()
`
  );
  await waitForSelector(window, ".settings-confirm-dialog", 10_000);
  await captureRendererSlot({
    window,
    outputDirectory,
    screenshots,
    slot: "24",
    fileName: "24-cloud-connection-consent.png",
    focusSelector: ".settings-confirm-dialog"
  });
  await execute(window, `document.querySelector('.settings-confirm-dialog .button.secondary')?.click()`);

  await selectSettingsTab(window, 3);
  await captureRendererSlot({
    window,
    outputDirectory,
    screenshots,
    slot: "25",
    fileName: "25-backup-create.png",
    focusSelector: ".settings-backup-actions"
  });

  const backupFixturePath = createBackupFixture(locale);
  process.env.LM_QA_BACKUP_IMPORT_PATH = backupFixturePath;
  await clickAndWait(window, '[data-qa="settings-backup-import"]', 350);
  await waitForSelector(window, '[data-qa="settings-backup-preview"]', 15_000);
  await captureRendererSlot({
    window,
    outputDirectory,
    screenshots,
    slot: "26",
    fileName: "26-restore-preview.png",
    focusSelector: '[data-qa="settings-backup-preview"]'
  });

  await selectSettingsTab(window, 5);
  await captureRendererSlot({
    window,
    outputDirectory,
    screenshots,
    slot: "27",
    fileName: "27-privacy-delete.png",
    focusSelector: ".settings-privacy-controls-panel"
  });

  await selectSettingsTab(window, 2);
  await captureRendererSlot({
    window,
    outputDirectory,
    screenshots,
    slot: "28",
    fileName: "28-app-capture-privacy.png",
    focusSelector: '[data-qa="settings-life-mining-enabled"]'
  });
}

function createBackupFixture(locale: DocsScreenshotLocale) {
  const fixturePath = path.join(app.getPath("userData"), "qa", `docs-backup-${locale}.lembackup`);
  const tables = createEmptyAppBackupTables();
  tables.cards.push({ id: "docs-fixture-running-late", profile_id: DEFAULT_PROFILE_ID });
  tables.life_logs.push({ id: "docs-life-log", profile_id: DEFAULT_PROFILE_ID });
  const document = createAppBackupDocument({
    appVersion: app.getVersion(),
    profileIds: [DEFAULT_PROFILE_ID],
    payload: {
      database: { schemaVersion: 1, tables },
      renderer: {
        entries: {
          "lem:docsFixture": JSON.stringify({ sentence: FIXED_SENTENCE_ASCII })
        },
        excludedKeys: ["api-keys", "cookies", "local-file-paths"]
      },
      playZoneSaves: [
        {
          cartridgeId: "meowthology.abyss-summoner",
          updatedAt: "2026-07-14T00:00:00.000Z",
          data: { tutorialComplete: true }
        }
      ]
    }
  });
  document.manifest.createdAt = "2026-07-14T00:00:00.000Z";
  document.checksumSha256 = createHash("sha256")
    .update(JSON.stringify({ manifest: document.manifest, payload: document.payload }), "utf8")
    .digest("hex");
  return writeAppBackupFile(fixturePath, document);
}

async function captureRendererSlot(input: {
  window: BrowserWindow;
  outputDirectory: string;
  screenshots: DocsScreenshotRecord[];
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
  await delay(250);
  const pngPath = path.join(input.outputDirectory, input.fileName);
  await captureWindowPage(input.window, pngPath);
  input.screenshots.push(
    await createScreenshotRecord(
      input.slot,
      input.fileName,
      pngPath,
      await collectSafetyText(input.window)
    )
  );
}

async function captureWindowPage(window: BrowserWindow, pngPath: string) {
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  await delay(250);
  const bounds = window.getContentBounds();
  const image = await window.capturePage({
    x: 0,
    y: 0,
    width: Math.max(1, bounds.width),
    height: Math.max(1, bounds.height)
  });
  const png = image.toPNG();
  if (!png.length) throw new Error(`Empty screenshot: ${pngPath}`);
  fs.writeFileSync(pngPath, png);
}

async function createScreenshotRecord(
  slot: string,
  fileName: string,
  pngPath: string,
  scannedText: string
): Promise<DocsScreenshotRecord> {
  const image = await import("electron").then(({ nativeImage }) =>
    nativeImage.createFromPath(pngPath)
  );
  const size = image.getSize();
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

async function collectSafetyText(
  window: BrowserWindow,
  webReader?: AppSmokeQaWebReaderAccess
) {
  const rendererText = await execute<string>(
    window,
    `
(() => {
  const values = Array.from(document.querySelectorAll('input, textarea, select'))
    .map((element) => 'value' in element ? String(element.value || '') : '')
    .filter(Boolean);
  const links = Array.from(document.querySelectorAll('a[href]'))
    .map((element) => element.getAttribute('href') || '')
    .filter(Boolean);
  return [document.body?.innerText || '', ...values, ...links, document.title].join('\\n');
})()
`
  ).catch(() => "");
  const view = webReader?.getView();
  const viewText =
    view && !view.webContents.isDestroyed()
      ? await view.webContents
          .executeJavaScript(
            `(() => [document.body?.innerText || '', location.href, document.title].join('\\n'))()`
          )
          .catch(() => "")
      : "";
  const frameText: string[] = [];
  for (const frame of window.webContents.mainFrame.framesInSubtree) {
    if (frame === window.webContents.mainFrame) continue;
    const childText = await frame
      .executeJavaScript(`(() => [document.body?.innerText || '', location.href].join('\\n'))()`)
      .catch(() => "");
    frameText.push(typeof childText === "string" ? childText : "");
  }
  return [rendererText, viewText, ...frameText].join("\n");
}

async function ensureRendererLocale(window: BrowserWindow, locale: DocsScreenshotLocale) {
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
  await new Promise((resolve) => setTimeout(resolve, 300));
})()
`
  );
}

async function selectSettingsTab(window: BrowserWindow, index: number) {
  const selected = await execute<boolean>(
    window,
    `
(() => {
  const button = document.querySelectorAll('.settings-navigation-list button')[${index}];
  if (!(button instanceof HTMLButtonElement)) return false;
  button.click();
  return true;
})()
`
  );
  if (!selected) throw new Error(`Settings tab ${index} was not available.`);
  await delay(300);
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

async function waitForSelector(window: BrowserWindow, selector: string, timeoutMs: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const found = await execute<boolean>(
      window,
      `Boolean(document.querySelector(${JSON.stringify(selector)}))`
    ).catch(() => false);
    if (found) return;
    await delay(150);
  }
  throw new Error(`Timed out waiting for selector: ${selector}`);
}

async function waitForText(window: BrowserWindow, text: string, timeoutMs: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const found = await execute<boolean>(
      window,
      `(document.body?.innerText || '').includes(${JSON.stringify(text)})`
    ).catch(() => false);
    if (found) return;
    await delay(150);
  }
  throw new Error(`Timed out waiting for text: ${text}`);
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

async function waitForWebReaderUrl(
  view: BrowserView,
  expectedUrl: string,
  timeoutMs: number
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!view.webContents.isDestroyed() && view.webContents.getURL() === expectedUrl) return;
    await delay(150);
  }
  throw new Error(`Timed out waiting for the built-in Web Reader practice page.`);
}

async function waitForNewWindow(existingIds: Set<number>, timeoutMs: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const candidate = BrowserWindow.getAllWindows().find(
      (item) => !item.isDestroyed() && !existingIds.has(item.id)
    );
    if (candidate) return candidate;
    await delay(100);
  }
  throw new Error("Timed out waiting for the PlayZone runtime window.");
}

async function waitForRuntimeGameFrame(window: BrowserWindow, timeoutMs: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const frame = window.webContents.mainFrame.framesInSubtree.find(
      (candidate) => candidate !== window.webContents.mainFrame && candidate.url.startsWith("lem-playzone:")
    );
    if (frame) {
      const ready = await frame
        .executeJavaScript(
          `(() => ({ ready: document.readyState === 'complete', canvas: document.querySelectorAll('canvas').length, failed: Array.from(document.images).filter((image) => image.complete && image.naturalWidth === 0).length }))()`
        )
        .catch(() => null) as { ready?: boolean; canvas?: number; failed?: number } | null;
      if (ready?.ready && Number(ready.canvas) > 0 && Number(ready.failed) === 0) return;
    }
    await delay(200);
  }
  throw new Error("PlayZone runtime did not render a healthy game frame.");
}

async function reloadWindow(window: BrowserWindow) {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Renderer locale reload timed out.")), 30_000);
    const finish = () => {
      clearTimeout(timeout);
      resolve();
    };
    window.webContents.once("did-finish-load", finish);
    window.webContents.reload();
  });
  await delay(250);
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
