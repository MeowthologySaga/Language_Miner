import { BrowserWindow, nativeImage } from "electron";
import fs from "node:fs";
import path from "node:path";

type ManualScreenshotLocale = "ko" | "en";

type ManualScreenshotRecord = {
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

const VIEWPORT = { width: 1240, height: 820 };
const PROFILE_ID = "profile-english";
const FIXED_SENTENCE = "I'm running a little late.";
const FIXED_MEANING = "조금 늦을 것 같아요.";

export async function runManualScreenshotQa(
  window: BrowserWindow,
  reportPath: string,
  outputDirectory: string,
  locale: ManualScreenshotLocale
) {
  const startedAt = new Date();
  const screenshots: ManualScreenshotRecord[] = [];
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });

  try {
    const fixturePdfPath = requireFixturePath("LM_QA_MANUAL_FIXTURE_PDF");
    const fixtureVideoPath = requireFixturePath("LM_QA_MANUAL_FIXTURE_VIDEO");
    const syncFolderPath = requireFixturePath("LM_QA_MANUAL_SYNC_FOLDER", true);

    await waitForWindowLoad(window);
    window.setSize(VIEWPORT.width, VIEWPORT.height);
    window.center();
    await ensureRendererLocale(window, locale);
    await finishOnboardingIfNeeded(window);
    await seedManualFixture(window, {
      fixturePdfPath,
      fixtureVideoPath,
      syncFolderPath,
      locale
    });
    await reloadWindow(window);
    await waitForSelector(window, '[data-qa="nav-pdfHub"]', 30_000);

    await captureTutorial(window, outputDirectory, screenshots);
    await captureToday(window, outputDirectory, screenshots);
    await captureProfileManager(window, outputDirectory, screenshots);
    await captureCards(window, outputDirectory, screenshots);
    await captureDocuments(window, outputDirectory, screenshots, fixturePdfPath);
    await captureVideoReader(window, outputDirectory, screenshots);
    await captureLifeMining(window, outputDirectory, screenshots);
    await captureCharacterManager(window, outputDirectory, screenshots);
    await captureGlossary(window, outputDirectory, screenshots);
    await captureBookMaker(window, outputDirectory, screenshots, fixturePdfPath);
    await captureSettings(window, outputDirectory, screenshots);
    await captureCardSync(window, outputDirectory, screenshots);
    await captureManualChatGpt(window, outputDirectory, screenshots);
    await capturePlayZoneSecurityReport(window, outputDirectory, screenshots);
    await captureDiamondConfirmation(window, outputDirectory, screenshots);

    const report = {
      status: screenshots.every((shot) => shot.textSafety.findings.length === 0)
        ? "passed"
        : "failed",
      locale,
      viewport: VIEWPORT,
      fixturePolicy:
        "Rights-cleared local PDF/video and synthetic learning records in a fresh temporary Electron profile.",
      networkPolicy:
        "No cloud request is confirmed. Cloud and ChatGPT dialogs stop before external transfer.",
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      screenshots
    };
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    if (report.status !== "passed") {
      throw new Error(`Manual screenshot safety scan failed: ${reportPath}`);
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

function requireFixturePath(name: string, directory = false) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  const resolved = path.resolve(value);
  const stat = fs.statSync(resolved);
  if (directory ? !stat.isDirectory() : !stat.isFile()) {
    throw new Error(`${name} does not point to the required ${directory ? "directory" : "file"}.`);
  }
  return resolved;
}

async function finishOnboardingIfNeeded(window: BrowserWindow) {
  const onboarding = await selectorExists(window, '[data-qa="app-onboarding"]');
  if (onboarding) {
    await clickAndWait(window, '[data-qa="onboarding-skip"]', 300);
  }
  await waitForSelector(window, '[data-qa="nav-pdfHub"]', 30_000);
}

async function seedManualFixture(
  window: BrowserWindow,
  input: {
    fixturePdfPath: string;
    fixtureVideoPath: string;
    syncFolderPath: string;
    locale: ManualScreenshotLocale;
  }
) {
  await execute(
    window,
    `
(async () => {
  const api = window.localEnglishMiner;
  if (!api?.cards || !api?.missions || !api?.lifeLogs || !api?.documents) {
    throw new Error('Manual QA APIs are unavailable.');
  }
  const profileId = ${JSON.stringify(PROFILE_ID)};
  const now = '2026-07-14T03:00:00.000Z';
  const today = new Date();
  const dateKey = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
  const pdfPath = ${JSON.stringify(input.fixturePdfPath)};
  const videoPath = ${JSON.stringify(input.fixtureVideoPath)};
  const syncFolder = ${JSON.stringify(input.syncFolderPath)};

  const savedProfiles = JSON.parse(localStorage.getItem('lem:profiles') || '[]');
  const base = savedProfiles.find((item) => item?.id === profileId) || savedProfiles[0] || {
    id: profileId,
    name: ${JSON.stringify(input.locale === "en" ? "English Basics" : "영어 기초")},
    learningProfile: {
      targetLanguage: { code: 'en', nameKo: '영어', nameEn: 'English' },
      nativeLanguage: { code: 'ko', nameKo: '한국어', nameEn: 'Korean' }
    },
    createdAt: now,
    updatedAt: now
  };
  const primary = {
    ...base,
    id: profileId,
    name: ${JSON.stringify(input.locale === "en" ? "English Basics" : "영어 기초")},
    createdAt: base.createdAt || now,
    updatedAt: now
  };
  const secondary = {
    ...primary,
    id: 'profile-travel',
    name: ${JSON.stringify(input.locale === "en" ? "Travel English" : "여행 영어")},
    createdAt: '2026-07-13T03:00:00.000Z',
    updatedAt: now
  };
  localStorage.setItem('lem:profiles', JSON.stringify([primary, secondary]));
  localStorage.setItem('lem:activeProfileId', profileId);

  const qaProviderPlaceholder = ['qa', 'placeholder', 'not', 'a', 'real', 'key'].join('-');
  const settings = JSON.parse(localStorage.getItem('lem:settings') || '{}');
  localStorage.setItem('lem:settings', JSON.stringify({
    ...settings,
    profileId,
    providerName: 'mock',
    translationProviderName: 'gemini',
    geminiApiKey: qaProviderPlaceholder,
    googleTranslateApiKey: '',
    confirmEstimatedCostBeforeRun: true,
    confirmLifeMiningCardCost: false,
    cardSyncFolderPath: syncFolder,
    cardSyncOnStartup: true,
    cardSyncOnQuit: true
  }));
  localStorage.setItem('lem:cloudConsent:v1:gemini', JSON.stringify({
    version: 1,
    provider: 'gemini',
    acceptedAt: now
  }));

  localStorage.setItem('lem:dailyRoutine:' + profileId, JSON.stringify({
    schemaVersion: 1,
    id: 'daily-routine:manual-docs',
    dateKey,
    profileId,
    status: 'running',
    currentStepId: 'listening-loop',
    steps: [
      { id: 'review', status: 'completed', startedAt: now, completedAt: now },
      { id: 'listening-loop', status: 'running', startedAt: now },
      { id: 'writing-practice', status: 'pending' },
      { id: 'claim-rewards', status: 'pending' }
    ],
    createdAt: now,
    updatedAt: now
  }));

  const recent = [
    {
      id: 'manual-docs-pdf', profileId,
      title: ${JSON.stringify(input.locale === "en" ? "Alice's Adventures in Wonderland" : "이상한 나라의 앨리스")},
      filePath: pdfPath, fileType: 'pdf', sourceLabel: 'English',
      translationLabel: ${JSON.stringify(input.locale === "en" ? "Korean" : "한국어")},
      pageCount: 2, source: 'reader', lastOpenedAt: now, createdAt: now
    }
  ];
  localStorage.setItem('lem:recentDocuments:' + profileId, JSON.stringify(recent));
  localStorage.setItem('lem:readerBookmarks:' + profileId, JSON.stringify([
    {
      id: 'manual-docs-pdf:1', profileId, documentId: 'manual-docs-pdf',
      title: recent[0].title, filePath: pdfPath, fileType: 'pdf',
      sourceLabel: 'English', translationLabel: recent[0].translationLabel,
      pageNumber: 1, pageCount: 2, createdAt: now, updatedAt: now
    },
    {
      id: 'manual-docs-pdf:2', profileId, documentId: 'manual-docs-pdf',
      title: recent[0].title, filePath: pdfPath, fileType: 'pdf',
      sourceLabel: 'English', translationLabel: recent[0].translationLabel,
      pageNumber: 2, pageCount: 2, createdAt: now, updatedAt: '2026-07-14T03:05:00.000Z'
    }
  ]));

  const transcript = {
    id: 'transcript:manual-docs-video', candidateId: 'local-file:' + videoPath,
    videoId: 'local:manual-docs-video.mp4',
    title: ${JSON.stringify(input.locale === "en" ? "The Corner Café — Original Listening Scene" : "코너 카페 — 자체 제작 듣기 장면")},
    channelName: ${JSON.stringify(input.locale === "en" ? "Language Miner original practice clip" : "Language Miner 자체 제작 예시")}, languageCode: 'en', status: 'ready',
    segments: [
      { id: 'segment-1', speaker: 'Alex', start: 0, end: 2.8, text: ${JSON.stringify(FIXED_SENTENCE)}, translationKo: ${JSON.stringify(FIXED_MEANING)}, noteKo: 'running late 표현을 소리 내어 따라 해 보세요.' },
      { id: 'segment-2', speaker: 'Mina', start: 2.8, end: 5.8, text: "No problem. I'll save you a seat.", translationKo: '괜찮아요. 자리를 맡아 둘게요.', noteKo: 'save someone a seat 표현도 함께 익혀 보세요.' }
    ],
    modelName: 'manual-rights-cleared-fixture', createdAt: now, updatedAt: now
  };
  localStorage.setItem('lem:videoReader:resume:' + profileId, JSON.stringify({
    profileId,
    source: { mode: 'local', filePath: videoPath, fileName: 'manual-docs-video.mp4', title: transcript.title },
    transcript, segmentIndex: 0, playbackTime: 0.4, subtitleMode: 'bilingual',
    videoCovered: false, loopEnabled: true, playbackSpeed: 1, updatedAt: now
  }));

  const currentLifeLogs = await api.lifeLogs.list();
  if (!currentLifeLogs.some((item) => item.text === ${JSON.stringify(FIXED_MEANING)})) {
    await api.lifeLogs.save({
      text: ${JSON.stringify(FIXED_MEANING)},
      beforeContext: '회의가 곧 시작돼요.',
      afterContext: '먼저 시작하고 있어 주세요.',
      appName: 'Manual QA fixture',
      sourceType: 'manual',
      metadata: {
        title: ${JSON.stringify(input.locale === "en" ? "Safe practice conversation" : "안전한 연습 대화")},
        trigger: 'manual-docs',
        messages: [
          { role: 'assistant', speaker: 'Friend', raw_content: '회의가 곧 시작돼요.' },
          { role: 'user', speaker: 'Me', raw_content: ${JSON.stringify(FIXED_MEANING)} },
          { role: 'assistant', speaker: 'Friend', raw_content: '먼저 시작하고 있어 주세요.' }
        ]
      }
    });
  }

  const missionTypes = [
    'review_completed', 'review_input_reading_deck_completed',
    'review_input_listening_deck_completed', 'review_output_deck_completed',
    'card_created', 'life_mining_card_created',
    'writing_practice_completed', 'listening_sentence_completed'
  ];
  for (const type of missionTypes) {
    await api.missions.recordEvent({ type, profileId, amount: 100, metadata: { source: 'manual-docs' } });
  }

  const existingExports = await api.documents.listExportRecords(profileId);
  if (!existingExports.some((record) => record.id === 'manual-docs-export')) {
    await api.documents.saveExportRecord({
      id: 'manual-docs-export', profileId,
      title: ${JSON.stringify(input.locale === "en" ? "Alice — Bilingual Reading Notes" : "이상한 나라의 앨리스 — 이중언어 읽기 노트")},
      filePath: '', fileType: 'pdf', pageRange: '1-2', pageCount: 2, segmentCount: 6,
      providerLabel: 'Local fixture', sourceLanguageLabel: 'English',
      targetLanguageLabel: ${JSON.stringify(input.locale === "en" ? "Korean" : "한국어")}, createdAt: now
    });
  }
  if (api.secureSettings?.set) {
    await api.secureSettings.set({ geminiApiKey: qaProviderPlaceholder });
  }
  return true;
})()
`
  );
}

async function captureTutorial(
  window: BrowserWindow,
  outputDirectory: string,
  screenshots: ManualScreenshotRecord[]
) {
  await navigateToRoute(window, "tutorial", "manage");
  if (await selectorExists(window, ".tutorial-start-confirm-dialog")) {
    await clickAndWait(window, ".tutorial-start-confirm-actions .button.primary", 250);
  }
  await waitForSelector(window, '[data-qa="tutorial-sandbox-shell"]', 20_000);
  await captureRendererSlot({
    window,
    outputDirectory,
    screenshots,
    slot: "01",
    fileName: "manual-01-tutorial-sandbox.png",
    focusSelector: '[data-qa="tutorial-home"]'
  });
  await clickAndWait(window, ".tutorial-mode-toolbar .button.primary", 300);
  await waitForSelector(window, '[data-qa="nav-pdfHub"]', 15_000);
}

async function captureToday(
  window: BrowserWindow,
  outputDirectory: string,
  screenshots: ManualScreenshotRecord[]
) {
  await navigateToRoute(window, "pdfHub");
  await waitForSelector(window, '[data-qa="today-hub"]', 20_000);
  await captureRendererSlot({
    window, outputDirectory, screenshots, slot: "02",
    fileName: "manual-02-today-hub.png", focusSelector: '[data-qa="today-hub"]'
  });
  await captureRendererSlot({
    window, outputDirectory, screenshots, slot: "03",
    fileName: "manual-03-today-routine.png", focusSelector: ".daily-routine-panel"
  });
  await captureRendererSlot({
    window, outputDirectory, screenshots, slot: "04",
    fileName: "manual-04-daily-missions.png", focusSelector: ".daily-mission-panel"
  });
}

async function captureProfileManager(
  window: BrowserWindow,
  outputDirectory: string,
  screenshots: ManualScreenshotRecord[]
) {
  await navigateToRoute(window, "settings", "manage");
  await selectSettingsTab(window, 0);
  await clickAndWait(window, '[data-qa="settings-profile-manage"]', 300);
  await waitForSelector(window, ".profile-manager-panel", 15_000);
  await captureRendererSlot({
    window, outputDirectory, screenshots, slot: "05",
    fileName: "manual-05-profile-manager.png", focusSelector: ".profile-manager-panel"
  });
  await pressEscape(window);
}

async function captureCards(
  window: BrowserWindow,
  outputDirectory: string,
  screenshots: ManualScreenshotRecord[]
) {
  await navigateToRoute(window, "cards", "manage");
  await waitForSelector(window, ".detail-toolbar", 20_000);
  await clickAndWait(window, '[data-qa="card-tag-edit-open"]', 250);
  await waitForSelector(window, '[data-qa="card-tag-editor"]', 10_000);
  await captureRendererSlot({
    window, outputDirectory, screenshots, slot: "06",
    fileName: "manual-06-card-library.png", focusSelector: '[data-qa="card-tag-editor"]'
  });
  await execute(window, `document.querySelector('.detail-toolbar .icon-button.danger')?.click()`);
  await waitForSelector(window, ".card-delete-modal", 10_000);
  await captureRendererSlot({
    window, outputDirectory, screenshots, slot: "07",
    fileName: "manual-07-card-delete.png", focusSelector: ".card-delete-modal"
  });
  await pressEscape(window);
}

async function captureDocuments(
  window: BrowserWindow,
  outputDirectory: string,
  screenshots: ManualScreenshotRecord[],
  fixturePdfPath: string
) {
  await navigateToRoute(window, "pdfReader", "input");
  await clickAndWait(window, '[data-qa="pdf-reader-live-tab"]', 250);
  await waitForSelector(window, '[data-qa="pdf-reader-file-input"]', 15_000);
  await setFileInput(window, '[data-qa="pdf-reader-file-input"]', fixturePdfPath);
  await waitForSelector(window, ".pdf-visible-text-layer span", 30_000);
  await execute(
    window,
    `
(() => {
  const layer = document.querySelector('.pdf-visible-text-layer');
  if (!(layer instanceof HTMLElement)) return '';
  const spans = Array.from(layer.querySelectorAll('span'));
  const target = spans.find((span) => (span.textContent || '').toLowerCase().includes('running a little late')) ||
    spans.find((span) => (span.textContent || '').trim().length > 12);
  if (!(target instanceof HTMLElement)) return '';
  const range = document.createRange();
  range.selectNodeContents(target);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
  return selection.toString();
})()
`
  );
  await execute(window, `document.querySelector('.pdf-live-card-panel button')?.click()`);
  await waitForSelector(window, ".pdf-live-card-panel .card-preview", 6_000).catch(() => undefined);
  await captureRendererSlot({
    window, outputDirectory, screenshots, slot: "08",
    fileName: "manual-08-document-reader.png", focusSelector: ".pdf-reader-grid"
  });

  await clickAndWait(window, '[data-qa="pdf-reader-pane-library"]', 300);
  await waitForSelector(window, ".document-library-layout", 15_000);
  await captureRendererSlot({
    window, outputDirectory, screenshots, slot: "09",
    fileName: "manual-09-document-library.png", focusSelector: ".document-library-layout"
  });
  await clickAndWait(window, '[data-qa="pdf-reader-pane-bookmarks"]', 300);
  await waitForSelector(window, '[data-qa="bookmarks-list"]', 15_000);
  await captureRendererSlot({
    window, outputDirectory, screenshots, slot: "10",
    fileName: "manual-10-bookmarks.png", focusSelector: '[data-qa="bookmarks-list"]'
  });
}

async function captureVideoReader(
  window: BrowserWindow,
  outputDirectory: string,
  screenshots: ManualScreenshotRecord[]
) {
  await navigateToRoute(window, "videoReader", "input");
  await waitForSelector(window, ".video-reader-resume-strip", 15_000);
  const clicked = await execute<boolean>(
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
  if (!clicked) throw new Error("Video Reader resume fixture was unavailable.");
  await waitForSelector(window, ".video-reader-player-shell", 30_000);
  await captureRendererSlot({
    window, outputDirectory, screenshots, slot: "11",
    fileName: "manual-11-video-reader.png", focusSelector: ".video-reader-player-shell"
  });
}

async function captureLifeMining(
  window: BrowserWindow,
  outputDirectory: string,
  screenshots: ManualScreenshotRecord[]
) {
  await navigateToRoute(window, "life", "output");
  await waitForSelector(window, '[data-qa="life-manual-add"]', 15_000);
  await clickAndWait(window, '[data-qa="life-manual-add"]', 200);
  await waitForSelector(window, ".life-manual-modal", 10_000);
  await setInputValue(window, '[data-qa="life-manual-text"]', FIXED_MEANING);
  const textareas = await execute<number>(window, `document.querySelectorAll('.life-manual-form textarea').length`);
  if (textareas >= 3) {
    await setInputValue(window, ".life-manual-form textarea:nth-of-type(1)", FIXED_MEANING).catch(() => undefined);
    await execute(
      window,
      `
(() => {
  const fields = document.querySelectorAll('.life-manual-form textarea');
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  const values = [${JSON.stringify(FIXED_MEANING)}, '회의가 곧 시작돼요.', '먼저 시작하고 있어 주세요.'];
  fields.forEach((field, index) => {
    setter.call(field, values[index] || '');
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
})()
`
    );
  }
  await captureRendererSlot({
    window, outputDirectory, screenshots, slot: "12a",
    fileName: "manual-12a-life-mining-add.png", focusSelector: ".life-manual-modal"
  });
  await clickAndWait(window, '[data-qa="life-manual-cancel"]', 200);
  await waitForSelector(window, '.life-log-list button', 15_000);
  await clickAndWait(window, '.life-log-list button', 150);
  await clickAndWait(window, '[data-qa="life-selected-generate"]', 200);
  await waitForSelector(window, '[data-qa="life-generated-result-summary"]', 30_000);
  await captureRendererSlot({
    window, outputDirectory, screenshots, slot: "12b",
    fileName: "manual-12b-life-mining-result.png", focusSelector: '[data-qa="life-generated-result-summary"]'
  });
}

async function captureCharacterManager(
  window: BrowserWindow,
  outputDirectory: string,
  screenshots: ManualScreenshotRecord[]
) {
  await navigateToRoute(window, "characterChat", "output");
  await waitForSelector(window, ".character-home-actions", 15_000);
  const opened = await execute<boolean>(
    window,
    `
(() => {
  const buttons = document.querySelectorAll('.character-home-actions > button');
  const manage = buttons[buttons.length - 1];
  if (!(manage instanceof HTMLButtonElement)) return false;
  manage.click();
  return true;
})()
`
  );
  if (!opened) throw new Error("Character manager action was unavailable.");
  await waitForSelector(window, ".character-editor", 15_000);
  await execute(
    window,
    `
(() => {
  const inputs = document.querySelectorAll('.character-editor input');
  const avatar = inputs[2];
  if (!(avatar instanceof HTMLInputElement)) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(avatar, 'https://images.example.com/language-tutor.webp');
  avatar.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()
`
  );
  await waitForSelector(window, ".character-remote-image-consent", 10_000);
  await captureRendererSlot({
    window, outputDirectory, screenshots, slot: "13a",
    fileName: "manual-13a-character-manager.png", focusSelector: ".character-remote-image-consent"
  });
  await clickAndWait(window, ".character-remote-image-consent button", 150);
  await waitForSelector(window, '[data-qa="character-remote-image-dialog"]', 10_000);
  await captureRendererSlot({
    window, outputDirectory, screenshots, slot: "13b",
    fileName: "manual-13b-character-remote-image.png", focusSelector: '[data-qa="character-remote-image-dialog"]'
  });
  await pressEscape(window);
  await execute(window, `document.querySelectorAll('.character-import-row button')[1]?.click()`);
  await waitForSelector(window, '[data-qa="character-export-pack-dialog"]', 10_000);
  await captureRendererSlot({
    window, outputDirectory, screenshots, slot: "13c",
    fileName: "manual-13c-character-export.png", focusSelector: '[data-qa="character-export-pack-dialog"]'
  });
  await pressEscape(window);
}

async function captureGlossary(
  window: BrowserWindow,
  outputDirectory: string,
  screenshots: ManualScreenshotRecord[]
) {
  await navigateToRoute(window, "glossary", "manage");
  await waitForSelector(window, '[data-qa="glossary-search"]', 15_000);
  await setInputValue(window, '[data-qa="glossary-search"]', "running late");
  await captureRendererSlot({
    window, outputDirectory, screenshots, slot: "15",
    fileName: "manual-15-glossary.png", focusSelector: '[data-qa="glossary-search"]'
  });
}

async function captureBookMaker(
  window: BrowserWindow,
  outputDirectory: string,
  screenshots: ManualScreenshotRecord[],
  fixturePdfPath: string
) {
  await navigateToRoute(window, "bookMaker", "manage");
  await waitForSelector(window, '[data-qa="book-maker-file-input"]', 15_000);
  await setFileInput(window, '[data-qa="book-maker-file-input"]', fixturePdfPath);
  await waitForSelector(window, '[data-qa="book-maker-start-button"]:not([disabled])', 30_000);
  await captureRendererSlot({
    window, outputDirectory, screenshots, slot: "16",
    fileName: "manual-16-book-maker.png", focusSelector: '[data-qa="book-maker-usage-estimate"]'
  });
  await clickAndWait(window, '[data-qa="book-maker-start-button"]', 250);
  await waitForSelector(window, '[data-qa="cloud-translation-preflight"]', 15_000);
  await captureRendererSlot({
    window, outputDirectory, screenshots, slot: "20",
    fileName: "manual-20-cloud-job-preflight.png", focusSelector: '[data-qa="cloud-translation-preflight"]'
  });
  await pressEscape(window);
  await clickAndWait(window, '[data-qa="book-maker-pane-history"]', 300);
  await waitForSelector(window, ".export-history-list", 15_000);
  await captureRendererSlot({
    window, outputDirectory, screenshots, slot: "17",
    fileName: "manual-17-export-history.png", focusSelector: ".export-history-list"
  });
}

async function captureSettings(
  window: BrowserWindow,
  outputDirectory: string,
  screenshots: ManualScreenshotRecord[]
) {
  await navigateToRoute(window, "settings", "manage");
  await selectSettingsTab(window, 1);
  await setInputValue(window, '[data-qa="settings-search"]', "API usage translation");
  await waitForSelector(window, ".api-usage-panel", 10_000);
  await captureRendererSlot({
    window, outputDirectory, screenshots, slot: "18a",
    fileName: "manual-18a-translation-settings.png", focusSelector: ".api-usage-panel"
  });
  await setInputValue(window, '[data-qa="settings-search"]', "TTS voice Piper");
  await waitForSelector(window, ".settings-ai-panel", 10_000);
  await captureRendererSlot({
    window, outputDirectory, screenshots, slot: "18b",
    fileName: "manual-18b-tts-settings.png", focusSelector: ".settings-ai-panel:not(.settings-panel-hidden)"
  });
  await setInputValue(window, '[data-qa="settings-search"]', "");
}

async function captureCardSync(
  window: BrowserWindow,
  outputDirectory: string,
  screenshots: ManualScreenshotRecord[]
) {
  await navigateToRoute(window, "cards", "manage");
  await waitForSelector(window, ".card-sync-panel", 20_000);
  await clickAndWait(window, '[data-qa="cards-sync-status-button"]', 350).catch(() => undefined);
  await captureRendererSlot({
    window, outputDirectory, screenshots, slot: "19",
    fileName: "manual-19-card-sync.png", focusSelector: ".card-sync-panel"
  });
}

async function captureManualChatGpt(
  window: BrowserWindow,
  outputDirectory: string,
  screenshots: ManualScreenshotRecord[]
) {
  await navigateToRoute(window, "settings", "manage");
  await selectSettingsTab(window, 1);
  const providerSelected = await execute<boolean>(
    window,
    `
(() => {
  const providers = document.querySelectorAll('.settings-provider-grid.four > button');
  const manual = providers[2];
  if (!(manual instanceof HTMLButtonElement)) return false;
  manual.click();
  return true;
})()
`
  );
  if (!providerSelected) throw new Error("Manual ChatGPT provider option was unavailable.");
  await delay(300);
  await navigateToRoute(window, "life", "output");
  await waitForSelector(window, '.life-log-list button', 15_000);
  await clickAndWait(window, '.life-log-list button', 150);
  await clickAndWait(window, '[data-qa="life-selected-generate"]', 250);
  if (await selectorExists(window, ".life-cost-modal")) {
    await clickAndWait(window, ".life-cost-actions .button.success", 250);
  }
  await waitForSelector(window, '[data-qa="manual-chatgpt-bridge-dialog"]', 15_000);
  await captureRendererSlot({
    window, outputDirectory, screenshots, slot: "21",
    fileName: "manual-21-manual-chatgpt.png", focusSelector: '[data-qa="manual-chatgpt-bridge-dialog"]'
  });
  await pressEscape(window);
}

async function capturePlayZoneSecurityReport(
  window: BrowserWindow,
  outputDirectory: string,
  screenshots: ManualScreenshotRecord[]
) {
  const archivePath = process.env.LM_QA_MANUAL_GAME_ARCHIVE;
  if (!archivePath || !fs.existsSync(archivePath)) {
    throw new Error("A verified local Game Pack archive is required for the UGC security report.");
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
  await navigateToRoute(window, "playZone");
  await waitForSelector(window, '[data-pack-id="meowthology.drillheart-defense"]', 30_000);
  await execute(
    window,
    `
(() => {
  const pack = document.querySelector('[data-pack-id="meowthology.drillheart-defense"]');
  if (pack instanceof HTMLElement) pack.click();
})()
`
  );
  await waitForSelector(window, '[data-qa="play-zone-security-report"]', 15_000);
  await captureRendererSlot({
    window, outputDirectory, screenshots, slot: "25",
    fileName: "manual-25-ugc-security-report.png", focusSelector: '[data-qa="play-zone-security-report"]'
  });
}

async function captureDiamondConfirmation(
  window: BrowserWindow,
  outputDirectory: string,
  screenshots: ManualScreenshotRecord[]
) {
  const launchData = await execute<{
    cartridgeId: string;
    diamondActions: unknown[];
    entryUrl: string;
    title: string;
    walletBalance: number;
  }>(
    window,
    `
(async () => {
  const api = window.localEnglishMiner;
  if (!api?.missions || !api?.wallet || !api?.playZone || !api?.app?.openPlayZoneRuntimeWindow) {
    throw new Error('PlayZone runtime documentation APIs are unavailable.');
  }
  let board = await api.missions.getToday(${JSON.stringify(PROFILE_ID)});
  for (const mission of board.missions.filter((candidate) => candidate.claimable)) {
    board = await api.missions.claimReward(mission.id, ${JSON.stringify(PROFILE_ID)});
  }
  const wallet = await api.wallet.get();
  const installed = await api.playZone.listInstalledPacks();
  const pack = installed.find((candidate) => candidate.id === 'meowthology.drillheart-defense');
  if (!pack?.entryUrl || !pack.diamondActions?.length) {
    throw new Error('The verified Drillheart Defense runtime is unavailable.');
  }
  return {
    cartridgeId: pack.id,
    diamondActions: pack.diamondActions,
    entryUrl: pack.entryUrl,
    title: pack.title,
    walletBalance: wallet.balance
  };
})()
`
  );

  const existingWindowIds = new Set(BrowserWindow.getAllWindows().map((candidate) => candidate.id));
  const opened = await execute<boolean>(
    window,
    `window.localEnglishMiner.app.openPlayZoneRuntimeWindow(${JSON.stringify({
      runtimeId: "cartridge",
      ...launchData
    })})`
  );
  if (!opened) throw new Error("The Drillheart Defense runtime window did not open.");

  const runtimeWindow = await waitForNewWindow(existingWindowIds, 30_000);
  try {
    await waitForSelector(runtimeWindow, '[data-qa="play-zone-runtime-window"]', 30_000);
    await waitForSelector(runtimeWindow, '.play-zone-runtime-frame', 30_000);
    const childFrame = await waitForPlayZoneChildFrame(runtimeWindow, 45_000);
    const bridgeReady = await childFrame.executeJavaScript(
      `Boolean(window.LEM_GAME_HOST_API?.wallet?.spend)`
    );
    if (!bridgeReady) throw new Error("The Drillheart Defense Host API bridge is unavailable.");
    await childFrame.executeJavaScript(`
(() => {
  void window.LEM_GAME_HOST_API.wallet.spend({
    id: 'revive-once',
    idempotencyKey: 'manual-docs-diamond-confirmation'
  });
  return true;
})()
`);
    await waitForSelector(runtimeWindow, ".play-zone-runtime-confirm-dialog", 15_000);
    await captureRendererSlot({
      window: runtimeWindow,
      outputDirectory,
      screenshots,
      slot: "14",
      fileName: "manual-14-diamond-confirm.png",
      focusSelector: ".play-zone-runtime-confirm-dialog"
    });
    await clickAndWait(
      runtimeWindow,
      ".play-zone-runtime-confirm-actions .button.secondary",
      150
    );
  } finally {
    if (!runtimeWindow.isDestroyed()) runtimeWindow.destroy();
    if (!window.isDestroyed()) {
      window.show();
      window.focus();
    }
    await delay(250);
  }
}

async function waitForNewWindow(existingWindowIds: Set<number>, timeoutMs: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const candidate = BrowserWindow.getAllWindows().find(
      (item) => !item.isDestroyed() && !existingWindowIds.has(item.id)
    );
    if (candidate) return candidate;
    await delay(150);
  }
  throw new Error("Timed out waiting for the PlayZone runtime window.");
}

async function waitForPlayZoneChildFrame(runtimeWindow: BrowserWindow, timeoutMs: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const childFrame = runtimeWindow.webContents.mainFrame.framesInSubtree.find(
      (frame) => frame !== runtimeWindow.webContents.mainFrame && frame.url.startsWith("lem-playzone:")
    );
    if (childFrame) return childFrame;
    await delay(150);
  }
  throw new Error("Timed out waiting for the verified PlayZone child frame.");
}

async function captureRendererSlot(input: {
  window: BrowserWindow;
  outputDirectory: string;
  screenshots: ManualScreenshotRecord[];
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
  const image = await input.window.capturePage({
    x: 0,
    y: 0,
    width: Math.max(1, bounds.width),
    height: Math.max(1, bounds.height)
  });
  const png = image.toPNG();
  if (!png.length) throw new Error(`Empty screenshot: ${pngPath}`);
  fs.writeFileSync(pngPath, png);
  const size = nativeImage.createFromPath(pngPath).getSize();
  const scannedText = await collectSafetyText(input.window);
  input.screenshots.push({
    slot: input.slot,
    fileName: input.fileName,
    pngPath,
    width: size.width,
    height: size.height,
    sha256Source: "generated-by-electron",
    textSafety: {
      scannedCharacterCount: scannedText.length,
      findings: findSensitiveText(scannedText)
    }
  });
}

async function collectSafetyText(window: BrowserWindow) {
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
  const visibleLinks = Array.from(document.querySelectorAll('a[href]'))
    .filter(intersectsViewport)
    .map((element) => element.getAttribute('href') || '')
    .filter(Boolean);
  return [...visibleText, ...values, ...visibleLinks, document.title].join('\\n');
})()
`
  ).catch(() => "");
  const frameText: string[] = [];
  for (const frame of window.webContents.mainFrame.framesInSubtree) {
    if (frame === window.webContents.mainFrame) continue;
    const childText = await frame
      .executeJavaScript(`(() => [document.body?.innerText || '', location.href].join('\\n'))()`)
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

async function ensureRendererLocale(window: BrowserWindow, locale: ManualScreenshotLocale) {
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

async function setFileInput(window: BrowserWindow, selector: string, filePath: string) {
  const debuggerApi = window.webContents.debugger;
  if (!debuggerApi.isAttached()) debuggerApi.attach("1.3");
  const root = (await debuggerApi.sendCommand("DOM.getDocument", { depth: -1 })) as { root: { nodeId: number } };
  const query = (await debuggerApi.sendCommand("DOM.querySelector", {
    nodeId: root.root.nodeId,
    selector
  })) as { nodeId: number };
  if (!query.nodeId) throw new Error(`Could not find file input: ${selector}`);
  await debuggerApi.sendCommand("DOM.setFileInputFiles", {
    files: [filePath],
    nodeId: query.nodeId
  });
  await delay(400);
}

async function setInputValue(window: BrowserWindow, selector: string, value: string) {
  const changed = await execute<boolean>(
    window,
    `
(() => {
  const element = document.querySelector(${JSON.stringify(selector)});
  if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLTextAreaElement)) return false;
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
  setter.call(element, ${JSON.stringify(value)});
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()
`
  );
  if (!changed) throw new Error(`Could not update input: ${selector}`);
  await delay(200);
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

async function pressEscape(window: BrowserWindow) {
  window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
  window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  await delay(200);
}

async function selectorExists(window: BrowserWindow, selector: string) {
  return execute<boolean>(window, `Boolean(document.querySelector(${JSON.stringify(selector)}))`).catch(
    () => false
  );
}

async function waitForSelector(window: BrowserWindow, selector: string, timeoutMs: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await selectorExists(window, selector)) return;
    await delay(150);
  }
  throw new Error(`Timed out waiting for selector: ${selector}`);
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
  await delay(350);
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
