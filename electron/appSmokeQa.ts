import { BrowserWindow, type BrowserView } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { AppSettings, WebReaderLifeMiningState } from "../src/shared/types";
import {
  captureAppSmokeScreenshot,
  captureDesktopWindowScreenshot,
  captureWebReaderViewProofScreenshot
} from "./appSmokeScreenshots";
import {
  appSmokeRouteActionProbes,
  appSmokeRoutes,
  LISTENING_RSS_MAX_DURATION_SECONDS,
  type AppSmokeActionProbeResult,
  type AppSmokeRouteReport,
  type AppSmokeRouteSnapshot
} from "./appSmokeRoutes";
import { parseAppSmokeLocale, type AppSmokeLocale } from "./appSmokeLocale";
import {
  parseAppSmokeScaleFactor,
  type AppSmokeScaleFactor
} from "./appSmokeScale";
import { parseAppSmokeViewport } from "./appSmokeViewport";
import { serializeSafeDebugLogEntry } from "./safeDebugLog";

export type WebReaderViewState = {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  innerHeight: number;
  innerWidth: number;
};

type WebReaderLifeMiningCaptureResult = {
  state: WebReaderLifeMiningState;
  savedCount: number;
  queued: boolean;
  debug: unknown;
};

export type AppSmokeQaWebReaderAccess = {
  getView: () => BrowserView | null;
  getPopupWindows: () => Set<BrowserWindow>;
  canExecuteScript: (view: BrowserView) => boolean;
  getState: () => Promise<WebReaderViewState>;
  injectSelectionPopover: () => Promise<boolean>;
  testSelectionPopover: (preferredTextInput?: unknown, expectedContextInput?: unknown) => Promise<unknown>;
  testShadowTitleSelectionPopover: () => Promise<unknown>;
  injectLifeMining: () => Promise<boolean>;
  captureLifeMiningNow: () => Promise<WebReaderLifeMiningCaptureResult>;
};

type AppSmokeSecret = {
  field: string;
  value: string;
};

type AppSmokeLocaleEvidence = {
  requestedLocale: AppSmokeLocale;
  storedLocale: string | null;
  documentLanguage: string;
  reloadPerformed: boolean;
};

type AppSmokeScaleEvidence = {
  requestedScaleFactor: AppSmokeScaleFactor;
  rendererDevicePixelRatio: number | null;
  tolerance: number;
  matches: boolean;
};

type OfficialPlayZoneQaResult = {
  mode: "catalog" | "download-install-runtime";
  games: Array<Record<string, unknown>>;
};

type UpgradeLifecyclePhase = "baseline" | "upgraded" | "repair";

type UpgradeLifecycleEvidence = {
  phase: UpgradeLifecyclePhase;
  onboardingInitiallyVisible: boolean;
  hostCompletedBefore: boolean;
  hostCompletedAfter: boolean;
  rendererCompletedAfter: boolean;
  settingsMarkerPreserved: boolean;
  cardMarkerPreserved: boolean;
  cardCount: number;
};

type PlayZoneGameSurfaceState = {
  ready: boolean;
  canvasCount: number;
  imageCount: number;
  pendingImageCount: number;
  failedImageCount: number;
};

export async function runAppSmokeQa(
  window: BrowserWindow,
  reportPath: string,
  webReader: AppSmokeQaWebReaderAccess
) {
  const startedAt = new Date();
  const localeInput = process.env.LM_QA_APP_LOCALE ?? "ko";
  const requestedLocale = parseAppSmokeLocale(localeInput);
  if (!requestedLocale) {
    throw new Error(`Invalid LM_QA_APP_LOCALE: ${localeInput}. Expected ko or en.`);
  }
  const scaleInput = process.env.LM_QA_DEVICE_SCALE_FACTOR ?? "1";
  const requestedScaleFactor = parseAppSmokeScaleFactor(scaleInput);
  if (!requestedScaleFactor) {
    throw new Error(
      `Invalid LM_QA_DEVICE_SCALE_FACTOR: ${scaleInput}. Expected 1, 1.25, or 1.5.`
    );
  }
  const consoleMessages: string[] = [];
  const routeReports: AppSmokeRouteReport[] = [];
  const qaSecrets = getAppSmokeQaSecrets();
  let localeEvidence: AppSmokeLocaleEvidence | null = null;
  let scaleEvidence: AppSmokeScaleEvidence | null = null;
  let playZoneOfficialGamesCheck: OfficialPlayZoneQaResult | null = null;
  let upgradeLifecycleEvidence: UpgradeLifecycleEvidence | null = null;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });

  const consoleListener = (
    _event: Electron.Event,
    level: number,
    message: string,
    line: number,
    sourceId: string
  ) => {
    if (level >= 3 || /\b(error|uncaught|exception)\b/i.test(message)) {
      consoleMessages.push(`${sourceId}:${line} ${message}`.slice(0, 500));
    }
  };
  window.webContents.on("console-message", consoleListener);

  let originalSidebarNavSections: string | null = null;
  try {
    await waitForWindowLoad(window);
    localeEvidence = await ensureAppSmokeRendererLocale(window, requestedLocale);
    scaleEvidence = await readAppSmokeScaleEvidence(window, requestedScaleFactor);
    const requestedViewport = parseAppSmokeViewport(process.env.LM_QA_VIEWPORT);
    if (process.env.LM_QA_VIEWPORT && !requestedViewport) {
      throw new Error(`Invalid LM_QA_VIEWPORT: ${process.env.LM_QA_VIEWPORT}`);
    }
    if (requestedViewport) {
      window.setSize(requestedViewport.width, requestedViewport.height);
      await delay(350);
    }
    await waitForQaSelector(window, '[data-qa="nav-pdfHub"]', 30_000);
    upgradeLifecycleEvidence = await runUpgradeLifecycleQa(window);
    await executeQaScript(
      window,
      `
(async () => {
  const skip = document.querySelector('[data-qa="onboarding-skip"]');
  if (skip instanceof HTMLButtonElement) {
    skip.click();
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
})()
`
    );
    originalSidebarNavSections = await executeQaScript<string | null>(
      window,
      `localStorage.getItem("lem:sidebarNavSections:v3")`
    );

    for (const route of appSmokeRoutes) {
      const routeStartedAt = Date.now();
      try {
        const snapshot = await smokeNavigateToRoute(
          window,
          route,
          qaSecrets,
          requestedLocale
        );
        if (route === "playZone") {
          playZoneOfficialGamesCheck = await runOfficialPlayZoneCatalogQa(window);
        }
        if (route === "webReader") {
          snapshot.webReaderWindowOpenCheck = await runWebReaderWindowOpenQa(webReader);
          if (!snapshot.webReaderWindowOpenCheck?.passed) {
            throw new Error(
              `Web Reader window.open did not create an in-app popup: ${JSON.stringify(
                snapshot.webReaderWindowOpenCheck
              )}`
            );
          }
        }
        const screenshotPath =
          route === "pdfHub" || route === "webReader" || route === "listeningLoop"
            ? await captureAppSmokeScreenshot(window, reportPath, route, webReader)
            : undefined;
        routeReports.push({
          route,
          status: "passed",
          titleText: snapshot.titleText,
          mainTextLength: snapshot.mainText.length,
        loadingIndicatorCount: snapshot.loadingIndicators.length,
        actionProbeCount: snapshot.actionProbes.length,
        actionProbes: snapshot.actionProbes,
        viewportWidth: snapshot.viewportWidth,
        viewportHeight: snapshot.viewportHeight,
        horizontalOverflowPx: snapshot.horizontalOverflowPx,
        webReaderPageHeight: snapshot.webReaderPageHeight,
        webReaderSurfaceHeight: snapshot.webReaderSurfaceHeight,
        webReaderWebviewHeight: snapshot.webReaderWebviewHeight,
        webReaderGuestInnerHeight: snapshot.webReaderGuestInnerHeight,
        webReaderWebviewDebug: snapshot.webReaderWebviewDebug,
        ...(snapshot.webReaderPopoverDebug
          ? { webReaderPopoverDebug: snapshot.webReaderPopoverDebug }
          : {}),
        ...(snapshot.webReaderWindowOpenCheck
          ? { webReaderWindowOpenCheck: snapshot.webReaderWindowOpenCheck }
          : {}),
        ...(snapshot.webReaderSidebarMoreCheck
          ? { webReaderSidebarMoreCheck: snapshot.webReaderSidebarMoreCheck }
          : {}),
        ...(snapshot.webReaderLifeMiningCheck
          ? { webReaderLifeMiningCheck: snapshot.webReaderLifeMiningCheck }
          : {}),
        ...(snapshot.strayWebReaderState ? { strayWebReaderState: snapshot.strayWebReaderState } : {}),
        ...(snapshot.listeningRssDurationCheck
          ? { listeningRssDurationCheck: snapshot.listeningRssDurationCheck }
          : {}),
        ...(snapshot.lifeAutoCaptureStatusText
          ? { lifeAutoCaptureStatusText: snapshot.lifeAutoCaptureStatusText }
          : {}),
        elapsedMs: Date.now() - routeStartedAt,
        ...(screenshotPath ? { screenshotPath } : {})
      });
      } catch (caught) {
        const errorCode =
          caught instanceof Error && typeof (caught as NodeJS.ErrnoException).code === "string"
            ? (caught as NodeJS.ErrnoException).code
            : undefined;
        routeReports.push({
          route,
          status: "failed",
          elapsedMs: Date.now() - routeStartedAt,
          ...(errorCode ? { errorCode } : {}),
          error: caught instanceof Error ? caught.message : String(caught)
        });
      }
    }
  } finally {
    await executeQaScript(
      window,
      originalSidebarNavSections === null
        ? `localStorage.removeItem("lem:sidebarNavSections:v3")`
        : `localStorage.setItem("lem:sidebarNavSections:v3", ${JSON.stringify(originalSidebarNavSections)})`
    ).catch(() => {
      // QA state cleanup is best-effort and must not hide the actual test result.
    });
    window.webContents.off("console-message", consoleListener);
  }

  const finishedAt = new Date();
  const failedRoutes = routeReports.filter((routeReport) => routeReport.status === "failed");
  const uncaughtConsoleMessages = consoleMessages.filter((message) =>
    /\b(uncaught|exception|referenceerror|typeerror)\b/i.test(message)
  );
  const scaleMatches = scaleEvidence?.matches === true;
  const report = {
    status:
      failedRoutes.length === 0 && uncaughtConsoleMessages.length === 0 && scaleMatches
        ? "passed"
        : "failed",
    locale: requestedLocale,
    localeEvidence,
    requestedScaleFactor,
    scaleEvidence,
    ...(scaleMatches
      ? {}
      : {
          scaleFailure: `Renderer devicePixelRatio ${String(
            scaleEvidence?.rendererDevicePixelRatio ?? "missing"
          )} did not match requested scale factor ${requestedScaleFactor}.`
        }),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    elapsedMs: finishedAt.getTime() - startedAt.getTime(),
    routes: routeReports,
    screenshots: routeReports
      .filter((routeReport) => routeReport.screenshotPath)
      .map((routeReport) => ({
        route: routeReport.route,
        path: routeReport.screenshotPath
      })),
    playZoneOfficialGamesCheck,
    upgradeLifecycleEvidence,
    consoleMessages: consoleMessages.slice(-20)
  };
  writeSafeQaJson(reportPath, report);

  if (report.status === "failed") {
    throw new Error(`App smoke QA failed. Report: ${reportPath}`);
  }
}

async function runUpgradeLifecycleQa(
  window: BrowserWindow
): Promise<UpgradeLifecycleEvidence | null> {
  const phase = parseUpgradeLifecyclePhase(process.env.LM_QA_UPGRADE_PHASE);
  if (!phase) return null;

  const initial = await readUpgradeLifecycleRendererState(window);
  if (phase === "baseline") {
    if (initial.hostCompleted || initial.rendererCompleted) {
      throw new Error("Synthetic baseline did not start with fresh onboarding state.");
    }
    await waitForQaSelector(window, '[data-qa="app-onboarding"]', 15_000);
  } else {
    await delay(1_000);
    const settled = await readUpgradeLifecycleRendererState(window);
    if (!settled.hostCompleted || !settled.rendererCompleted || settled.onboardingVisible) {
      throw new Error(
        `${phase} launch did not preserve onboarding completion: ${JSON.stringify(settled)}`
      );
    }
  }

  const onboardingInitiallyVisible =
    phase === "baseline"
      ? true
      : (await readUpgradeLifecycleRendererState(window)).onboardingVisible;

  if (phase === "baseline") {
    const skipped = await executeQaScript<boolean>(
      window,
      `
(() => {
  const skip = document.querySelector('[data-qa="onboarding-skip"]');
  if (!(skip instanceof HTMLButtonElement)) return false;
  skip.click();
  return true;
})()
`
    );
    if (!skipped) {
      throw new Error("Synthetic baseline could not complete onboarding.");
    }
    await waitForUpgradeLifecycleCompletion(window, 15_000);
    await writeUpgradeLifecycleCardMarker(window);
  }

  const finalState = await readUpgradeLifecycleRendererState(window);
  if (
    !finalState.hostCompleted ||
    !finalState.rendererCompleted ||
    !finalState.settingsMarkerPreserved ||
    !finalState.cardMarkerPreserved
  ) {
    throw new Error(
      `${phase} launch did not preserve all upgrade markers: ${JSON.stringify(finalState)}`
    );
  }

  return {
    phase,
    onboardingInitiallyVisible,
    hostCompletedBefore: initial.hostCompleted,
    hostCompletedAfter: finalState.hostCompleted,
    rendererCompletedAfter: finalState.rendererCompleted,
    settingsMarkerPreserved: finalState.settingsMarkerPreserved,
    cardMarkerPreserved: finalState.cardMarkerPreserved,
    cardCount: finalState.cardCount
  };
}

function parseUpgradeLifecyclePhase(value: string | undefined): UpgradeLifecyclePhase | null {
  if (!value) return null;
  if (value === "baseline" || value === "upgraded" || value === "repair") return value;
  throw new Error(`Invalid LM_QA_UPGRADE_PHASE: ${value}`);
}

async function writeUpgradeLifecycleCardMarker(window: BrowserWindow) {
  const saved = await executeQaScript<boolean>(
    window,
    `
(async () => {
  const api = window.localEnglishMiner;
  if (!api?.cards?.save) return false;
  const now = new Date().toISOString();
  await api.cards.save({
    id: "qa:upgrade:0.1.0-beta.0",
    profileId: "default",
    cardType: "reading",
    deckType: "input",
    direction: "target_to_native",
    sourceSentence: "I am running a little late.",
    frontText: "I am running a little late.",
    naturalTranslationKo: "조금 늦고 있어요.",
    highlightMappings: [],
    vocabularyItems: [],
    tags: ["qa-upgrade-marker"],
    srs: {
      dueAt: now,
      intervalDays: 0,
      easeFactor: 2.5,
      reviewCount: 0,
      lapseCount: 0
    },
    createdAt: now,
    updatedAt: now
  }, "default");
  return true;
})()
`
  );
  if (!saved) {
    throw new Error("Synthetic baseline could not create the upgrade card marker.");
  }
}

async function readUpgradeLifecycleRendererState(window: BrowserWindow) {
  return executeQaScript<{
    onboardingVisible: boolean;
    hostCompleted: boolean;
    rendererCompleted: boolean;
    settingsMarkerPreserved: boolean;
    cardMarkerPreserved: boolean;
    cardCount: number;
  }>(
    window,
    `
(async () => {
  const api = window.localEnglishMiner;
  const hostCompleted = api?.app?.getAppOnboardingCompleted
    ? await api.app.getAppOnboardingCompleted()
    : false;
  let settings = {};
  try {
    settings = JSON.parse(localStorage.getItem("lem:settings") || "{}");
  } catch {}
  const cards = api?.cards?.list ? await api.cards.list("default") : [];
  return {
    onboardingVisible: document.querySelector('[data-qa="app-onboarding"]') instanceof HTMLElement,
    hostCompleted: hostCompleted === true,
    rendererCompleted:
      localStorage.getItem("lem:onboarding:v2:completed") === "1" ||
      localStorage.getItem("lem:onboarding:v1:completed") === "1",
    settingsMarkerPreserved:
      settings.providerName === "mock" && settings.translationProviderName === "localMt",
    cardMarkerPreserved: cards.some((card) => card?.id === "qa:upgrade:0.1.0-beta.0"),
    cardCount: cards.length
  };
})()
`
  );
}

async function waitForUpgradeLifecycleCompletion(window: BrowserWindow, timeoutMs: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const state = await readUpgradeLifecycleRendererState(window);
    if (state.hostCompleted && state.rendererCompleted && !state.onboardingVisible) return;
    await delay(200);
  }
  throw new Error("Timed out waiting for durable onboarding completion markers.");
}

async function readAppSmokeScaleEvidence(
  window: BrowserWindow,
  requestedScaleFactor: AppSmokeScaleFactor
): Promise<AppSmokeScaleEvidence> {
  const tolerance = 0.02;
  let rawDevicePixelRatio: unknown;
  try {
    rawDevicePixelRatio = await executeQaScript<unknown>(window, "window.devicePixelRatio");
  } catch {
    return {
      requestedScaleFactor,
      rendererDevicePixelRatio: null,
      tolerance,
      matches: false
    };
  }
  const rendererDevicePixelRatio = Number(rawDevicePixelRatio);
  const matches =
    Number.isFinite(rendererDevicePixelRatio) &&
    Math.abs(rendererDevicePixelRatio - requestedScaleFactor) <= tolerance;
  return {
    requestedScaleFactor,
    rendererDevicePixelRatio: Number.isFinite(rendererDevicePixelRatio)
      ? rendererDevicePixelRatio
      : null,
    tolerance,
    matches
  };
}

async function ensureAppSmokeRendererLocale(
  window: BrowserWindow,
  requestedLocale: AppSmokeLocale
): Promise<AppSmokeLocaleEvidence> {
  const before = await readAppSmokeRendererLocale(window);
  const reloadPerformed =
    before.storedLocale !== requestedLocale || before.documentLanguage !== requestedLocale;

  if (reloadPerformed) {
    await executeQaScript(
      window,
      `localStorage.setItem("lem:appLocale", ${JSON.stringify(requestedLocale)})`
    );
    await reloadQaWindow(window);
  }

  const after = await readAppSmokeRendererLocale(window);
  if (after.storedLocale !== requestedLocale || after.documentLanguage !== requestedLocale) {
    throw new Error(
      `Renderer locale mismatch: requested=${requestedLocale}, stored=${String(
        after.storedLocale
      )}, document=${after.documentLanguage || "missing"}`
    );
  }

  return {
    requestedLocale,
    storedLocale: after.storedLocale,
    documentLanguage: after.documentLanguage,
    reloadPerformed
  };
}

async function readAppSmokeRendererLocale(window: BrowserWindow) {
  return executeQaScript<{ storedLocale: string | null; documentLanguage: string }>(
    window,
    `
(() => ({
  storedLocale: localStorage.getItem("lem:appLocale"),
  documentLanguage: String(document.documentElement.lang || "")
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0]
}))()
`
  );
}

async function reloadQaWindow(window: BrowserWindow) {
  if (window.isDestroyed() || window.webContents.isDestroyed()) {
    throw new Error("Cannot apply QA locale after the renderer window was destroyed.");
  }
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(
      () => finish(new Error("Timed out reloading renderer locale.")),
      30_000
    );
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      window.webContents.off("did-finish-load", handleFinished);
      window.webContents.off("did-fail-load", handleFailed);
      window.webContents.off("render-process-gone", handleRendererGone);
      if (error) reject(error);
      else resolve();
    };
    const handleFinished = () => finish();
    const handleFailed = (
      _event: Electron.Event,
      errorCode: number,
      _errorDescription: string,
      _validatedUrl: string,
      isMainFrame: boolean
    ) => {
      if (isMainFrame) {
        finish(new Error(`Renderer locale reload failed (${errorCode}).`));
      }
    };
    const handleRendererGone = () => finish(new Error("Renderer exited while applying QA locale."));
    window.webContents.once("did-finish-load", handleFinished);
    window.webContents.on("did-fail-load", handleFailed);
    window.webContents.once("render-process-gone", handleRendererGone);
    window.webContents.reload();
  });
  await delay(250);
}

async function smokeNavigateToRoute(
  window: BrowserWindow,
  route: string,
  qaSecrets: AppSmokeSecret[],
  requestedLocale: AppSmokeLocale
) {
  const snapshot = await executeQaScript<AppSmokeRouteSnapshot>(
    window,
    `
(async () => {
  const route = ${JSON.stringify(route)};
  const qaSecrets = ${JSON.stringify(qaSecrets)};
  const actionProbeDefinitions = ${JSON.stringify(appSmokeRouteActionProbes[route] ?? [])};
  const shouldFetchListeningRss = ${JSON.stringify(process.env.LM_QA_APP_SMOKE_FETCH_RSS === "1")};
  const navRouteSections = {
    pdfReader: "input",
    webReader: "input",
    listeningLoop: "input",
    videoReader: "input",
    writingPractice: "output",
    characterChat: "output",
    life: "output",
    cards: "manage",
    bookMaker: "manage",
    glossary: "manage",
    tutorial: "manage",
    settings: "manage"
  };
  const navSectionId = navRouteSections[route];
  if (navSectionId) {
    const sectionButton = document.querySelector('[data-qa="nav-section-' + navSectionId + '"]');
    if (
      sectionButton instanceof HTMLButtonElement &&
      sectionButton.getAttribute("aria-expanded") !== "true"
    ) {
      sectionButton.click();
      await new Promise((resolve) => setTimeout(resolve, 180));
    }
  }
  const button = document.querySelector('[data-qa="nav-' + route + '"]');
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("Missing nav button: " + route);
  }
  button.click();
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (route === "tutorial") {
    const confirmButton = document.querySelector(
      ".tutorial-start-confirm-dialog .button.primary"
    );
    if (!(confirmButton instanceof HTMLButtonElement)) {
      throw new Error("Missing tutorial start confirmation action");
    }
    confirmButton.click();
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (route === "webReader") {
    const hubDefaultButton = document.querySelector('[data-qa="web-reader-open-default"]');
    if (hubDefaultButton instanceof HTMLButtonElement) {
      hubDefaultButton.click();
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (document.querySelector(".web-reader-web-surface")) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
  }
  function collectActionProbes() {
    const isVisible = (element) => {
      if (!(element instanceof Element) || element.closest("[hidden], [inert], [aria-hidden='true']")) {
        return false;
      }
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    return actionProbeDefinitions.map((probe) => {
      let matched = null;
      let matchedSelector = "";
      for (const selector of probe.selectors) {
        const candidate = Array.from(document.querySelectorAll(selector)).find(isVisible) ?? null;
        if (candidate) {
          matched = candidate;
          matchedSelector = selector;
          break;
        }
      }
      const disabled = Boolean(
        matched &&
        (("disabled" in matched && matched.disabled) || matched.getAttribute("aria-disabled") === "true")
      );
      return {
        label: probe.label,
        selector: matchedSelector || probe.selectors.join(", "),
        found: Boolean(matched),
        enabled: Boolean(matched) && !disabled,
        text: matched ? (matched.textContent ?? "").replace(/\\s+/g, " ").trim() : ""
      };
    });
  }
  let actionProbes = collectActionProbes();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const missing = actionProbes.filter((probe, index) => {
      const definition = actionProbeDefinitions[index];
      return !probe.found || (definition?.requireEnabled && !probe.enabled);
    });
    if (missing.length === 0) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
    actionProbes = collectActionProbes();
  }
  if (route === "settings") {
    const aiSettingsButton = Array.from(
      document.querySelectorAll(".settings-navigation-list button")
    ).find((candidate) => (candidate.textContent ?? "").includes("AI"));
    if (!(aiSettingsButton instanceof HTMLButtonElement)) {
      throw new Error("Missing AI settings category action");
    }
    aiSettingsButton.click();
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  let listeningRssDurationCheck = null;
  if (route === "listeningLoop" && shouldFetchListeningRss) {
    const routineButton = document.querySelector('[data-qa="listening-create-routine"]');
    if (routineButton instanceof HTMLButtonElement) {
      routineButton.click();
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (document.querySelector('[data-qa="listening-entrance-refresh"]')) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    }
    const refreshButton =
      document.querySelector('[data-qa="listening-entrance-refresh"]') ||
      document.querySelector('[data-qa="listening-refresh-candidates"]');
    if (!(refreshButton instanceof HTMLButtonElement)) {
      throw new Error("Missing listening RSS refresh button");
    }
    refreshButton.click();
    const deadline = Date.now() + 90_000;
    let rssCards = [];
    let durationCards = [];
    let overLimitCards = [];
    let statusText = "";
    while (Date.now() < deadline) {
      statusText = (document.querySelector(".listening-candidate-status")?.textContent ?? "")
        .replace(/\\s+/g, " ")
        .trim();
      rssCards = Array.from(
        document.querySelectorAll(
          '[data-qa="listening-video-card"][data-candidate-source="youtube_rss"], ' +
          '[data-qa="listening-routine-source"][data-candidate-source="youtube_rss"]'
        )
      );
      durationCards = rssCards.filter(
        (card) => Number(card.getAttribute("data-duration-seconds") ?? 0) > 0
      );
      overLimitCards = rssCards.filter(
        (card) =>
          Number(card.getAttribute("data-duration-seconds") ?? 0) >
          ${JSON.stringify(LISTENING_RSS_MAX_DURATION_SECONDS)}
      );
      if (
        rssCards.length > 0 &&
        durationCards.length === rssCards.length &&
        overLimitCards.length === 0
      ) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    listeningRssDurationCheck = {
      enabled: true,
      candidateCount: rssCards.length,
      durationCount: durationCards.length,
      missingDurationCount: Math.max(0, rssCards.length - durationCards.length),
      overLimitCount: overLimitCards.length,
      statusText,
      samples: durationCards.slice(0, 3).map((card) => ({
        videoId: card.getAttribute("data-video-id") ?? "",
        durationSeconds: Number(card.getAttribute("data-duration-seconds") ?? 0),
        text: (card.textContent ?? "").replace(/\\s+/g, " ").trim().slice(0, 120)
      }))
    };
  }
  const main = document.querySelector(".app-main");
  const title = document.querySelector(".topbar-title");
  const webReaderPageRect = document.querySelector(".web-reader-page")?.getBoundingClientRect();
  const webReaderSurfaceRect = document
    .querySelector(".web-reader-web-surface")
    ?.getBoundingClientRect();
  const webReaderWebviewRect = document
    .querySelector(".web-reader-webview")
    ?.getBoundingClientRect();
  let webReaderGuestInnerHeight = 0;
  const webReaderWebview = document.querySelector(".web-reader-webview");
  let webReaderWebviewDebug = "";
  if (route === "webReader" && webReaderWebview instanceof HTMLElement) {
    const computedStyle = window.getComputedStyle(webReaderWebview);
    const rect = webReaderWebview.getBoundingClientRect();
    webReaderWebviewDebug = JSON.stringify({
      attrHeight: webReaderWebview.getAttribute("height"),
      attrWidth: webReaderWebview.getAttribute("width"),
      attrAutosize: webReaderWebview.getAttribute("autosize"),
      attrMinHeight: webReaderWebview.getAttribute("minheight"),
      attrMaxHeight: webReaderWebview.getAttribute("maxheight"),
      clientHeight: webReaderWebview.clientHeight,
      offsetHeight: webReaderWebview.offsetHeight,
      rectHeight: rect.height,
      styleHeight: webReaderWebview.style.height,
      computedHeight: computedStyle.height
    });
  }
  if (route === "webReader" && window.localEnglishMiner?.webReader?.getState) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      try {
        const browserState = await window.localEnglishMiner.webReader.getState();
        webReaderGuestInnerHeight = Math.max(
          0,
          Number(browserState?.innerHeight) || 0
        );
        webReaderWebviewDebug = JSON.stringify({
          ...JSON.parse(webReaderWebviewDebug || "{}"),
          browserViewInnerHeight: browserState?.innerHeight,
          browserViewInnerWidth: browserState?.innerWidth,
          browserViewUrl: browserState?.url
        });
        if (webReaderGuestInnerHeight >= 360) {
          break;
        }
      } catch {
        // The BrowserView may still be attaching.
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  } else if (
    route === "webReader" &&
    webReaderWebview &&
    typeof webReaderWebview.executeJavaScript === "function"
  ) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      try {
        const guestMetrics = await webReaderWebview.executeJavaScript(
          "(() => ({ innerHeight: window.innerHeight, clientHeight: document.documentElement.clientHeight, bodyClientHeight: document.body ? document.body.clientHeight : 0 }))()"
        );
        webReaderGuestInnerHeight = Math.max(
          0,
          Number(guestMetrics?.innerHeight) || 0,
          Number(guestMetrics?.clientHeight) || 0,
          Number(guestMetrics?.bodyClientHeight) || 0
        );
        if (webReaderGuestInnerHeight >= 360) {
          break;
        }
      } catch {
        // The guest page may not have emitted dom-ready yet.
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  let webReaderPopoverDebug = null;
  if (route === "webReader" && window.localEnglishMiner?.webReader?.testSelectionPopover) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        webReaderPopoverDebug = await window.localEnglishMiner.webReader.testSelectionPopover(
          "widely",
          "It is the most widely"
        );
        if (webReaderPopoverDebug?.visible) {
          break;
        }
      } catch {
        // The BrowserView page may still be initializing.
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  let webReaderSidebarMoreCheck = null;
  if (route === "webReader") {
    webReaderSidebarMoreCheck = {
      panelVisible: Boolean(document.querySelector(".sidebar-more-panel")),
      overlapWidth: 0,
      sectionToggleCount: document.querySelectorAll('[data-qa^="nav-section-"]').length,
      passed: !document.querySelector(".sidebar-more-panel"),
      reason: "sidebar_more_replaced_by_collapsible_sections"
    };
  }
  let webReaderLifeMiningCheck = null;
  if (route === "webReader" && window.localEnglishMiner?.webReader?.testLifeMiningCapture) {
    try {
      const beforeState = window.localEnglishMiner.webReader.getLifeMiningState
        ? await window.localEnglishMiner.webReader.getLifeMiningState()
        : null;
      const state = await window.localEnglishMiner.webReader.testLifeMiningCapture();
      const enabled = Boolean(state?.enabled);
      const beforeLastCaptureAt = beforeState?.lastCaptureAt || "";
      const lastCaptureAt = state?.lastCaptureAt || "";
      const capturedWhileEnabled =
        enabled &&
        Boolean(lastCaptureAt) &&
        lastCaptureAt !== beforeLastCaptureAt;
      const stayedOffWithoutCapture = !enabled && lastCaptureAt === beforeLastCaptureAt;
      webReaderLifeMiningCheck = {
        enabled,
        mode: state?.mode || "",
        siteKey: state?.siteKey || "",
        beforeLastCaptureAt,
        lastCaptureAt,
        message: state?.message || "",
        passed: capturedWhileEnabled || stayedOffWithoutCapture,
        reason: enabled ? "enabled_capture_completed" : "default_off_preserved"
      };
    } catch (error) {
      webReaderLifeMiningCheck = {
        passed: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  let strayWebReaderState = null;
  if (route !== "webReader" && window.localEnglishMiner?.webReader?.getState) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        const state = await window.localEnglishMiner.webReader.getState();
        strayWebReaderState = {
          url: state?.url || "",
          innerHeight: Number(state?.innerHeight) || 0,
          innerWidth: Number(state?.innerWidth) || 0
        };
        if (!strayWebReaderState.url) {
          break;
        }
      } catch {
        strayWebReaderState = null;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  const mainText = (main?.textContent ?? "").replace(/\\s+/g, " ").trim();
  const bodyText = (document.body?.innerText ?? "").replace(/\\s+/g, " ").trim();
  const loadingIndicators = Array.from(document.querySelectorAll(".route-loading"))
    .map((element) => (element.textContent ?? "").replace(/\\s+/g, " ").trim())
    .filter(Boolean);
  const lifeAutoCaptureStatusText =
    route === "life"
      ? (document.querySelector('[data-qa="life-auto-status"]')?.textContent ?? "")
          .replace(/\\s+/g, " ")
          .trim()
      : "";
  const leakedQaSecretFields = qaSecrets
    .filter((secret) => secret.value && bodyText.includes(secret.value))
    .map((secret) => secret.field);
  const secretInputIssues = [];
  for (const input of Array.from(document.querySelectorAll("input"))) {
    for (const secret of qaSecrets) {
      if (secret.value && input.value === secret.value && input.type !== "password") {
        secretInputIssues.push(secret.field + " input is " + input.type);
      }
    }
  }
  const appMain = document.querySelector("#app-main-content");
  const documentOverflow = Math.max(
    0,
    document.documentElement.scrollWidth - window.innerWidth,
    document.body.scrollWidth - window.innerWidth
  );
  const mainOverflow = appMain instanceof HTMLElement
    ? Math.max(0, appMain.scrollWidth - appMain.clientWidth)
    : 0;
  return {
    route,
    active: button.classList.contains("active"),
    titleText: (title?.textContent ?? "").replace(/\\s+/g, " ").trim(),
    mainText,
    bodyText,
    loadingIndicators,
    leakedQaSecretFields,
    secretInputIssues,
    actionProbes,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    horizontalOverflowPx: Math.max(documentOverflow, mainOverflow),
    webReaderPageHeight: webReaderPageRect?.height ?? 0,
    webReaderSurfaceHeight: webReaderSurfaceRect?.height ?? 0,
    webReaderWebviewHeight: webReaderWebviewRect?.height ?? 0,
    webReaderGuestInnerHeight,
    webReaderWebviewDebug,
    webReaderPopoverDebug,
    webReaderSidebarMoreCheck,
    webReaderLifeMiningCheck,
    strayWebReaderState,
    listeningRssDurationCheck,
    lifeAutoCaptureStatusText
  };
})()
`
  );

  if (!snapshot.active) {
    throw new Error(`Route did not become active: ${route}`);
  }
  if (snapshot.mainText.length < 20) {
    throw new Error(`Route rendered too little content: ${route}`);
  }
  if (snapshot.loadingIndicators.length > 0) {
    throw new Error(`Route still shows loading indicator: ${route}`);
  }
  if (hasAppCrashText(snapshot.bodyText)) {
    throw new Error(`Route rendered crash text: ${route}`);
  }
  if (snapshot.leakedQaSecretFields.length > 0) {
    throw new Error(
      `Route rendered QA secret values: ${route} ${snapshot.leakedQaSecretFields.join(", ")}`
    );
  }
  if (snapshot.secretInputIssues.length > 0) {
    throw new Error(
      `Route has unmasked QA secret inputs: ${route} ${snapshot.secretInputIssues.join(", ")}`
    );
  }
  const failedActionProbes = snapshot.actionProbes.filter((probe, index) => {
    const definition = appSmokeRouteActionProbes[route]?.[index];
    return !probe.found || (definition?.requireEnabled && !probe.enabled);
  });
  if (failedActionProbes.length > 0) {
    throw new Error(
      `Route is missing first action probes: ${route} ${failedActionProbes
        .map((probe) => `${probe.label} (${probe.selector})`)
        .join(", ")}`
    );
  }
  if (
    route === "webReader" &&
    snapshot.webReaderSurfaceHeight < Math.max(360, snapshot.viewportHeight * 0.55)
  ) {
    throw new Error(
      `Web Reader surface is too short: ${Math.round(snapshot.webReaderSurfaceHeight)}px of ${Math.round(
        snapshot.viewportHeight
      )}px viewport`
    );
  }
  if (
    route === "webReader" &&
    snapshot.webReaderWebviewHeight < Math.max(360, snapshot.viewportHeight * 0.55)
  ) {
    throw new Error(
      `Web Reader webview is too short: ${Math.round(snapshot.webReaderWebviewHeight)}px of ${Math.round(
        snapshot.viewportHeight
      )}px viewport`
    );
  }
  if (
    route === "webReader" &&
    snapshot.webReaderGuestInnerHeight < Math.max(360, snapshot.viewportHeight * 0.55)
  ) {
    throw new Error(
      `Web Reader guest viewport is too short: ${Math.round(
        snapshot.webReaderGuestInnerHeight
      )}px of ${Math.round(snapshot.viewportHeight)}px viewport ${snapshot.webReaderWebviewDebug}`
    );
  }
  if (route === "webReader") {
    const popoverDebug = snapshot.webReaderPopoverDebug;
    const popoverText = typeof popoverDebug?.text === "string" ? popoverDebug.text : "";
    const expectedPopoverLabel = requestedLocale === "en" ? "Sentence Card" : "문장카드";
    if (
      !popoverDebug?.visible ||
      popoverDebug.locale !== requestedLocale ||
      !popoverText.includes(expectedPopoverLabel)
    ) {
      throw new Error(
        `Web Reader selection popover did not render like browser plugin: ${JSON.stringify(
          popoverDebug ?? {}
        )}`
      );
    }
    if (popoverDebug.actionScrollStable !== true) {
      throw new Error(
        `Web Reader action popover moved or reset during wheel scroll: ${JSON.stringify(
          popoverDebug ?? {}
        )}`
      );
    }
    if (popoverDebug.scrollStable !== true) {
      throw new Error(
        `Web Reader selection popover did not survive multi-word scroll interaction: ${JSON.stringify(
          popoverDebug ?? {}
        )}`
      );
    }
    if (popoverDebug.previewHasVocabularyDetails !== true) {
      throw new Error(
        `Web Reader card preview did not render vocabulary detail cards: ${JSON.stringify(
          popoverDebug ?? {}
        )}`
      );
    }
    if (popoverDebug.previewSurvivesOutsideClick !== true) {
      throw new Error(
        `Web Reader card preview dismissed on outside click: ${JSON.stringify(popoverDebug ?? {})}`
      );
    }
    if (popoverDebug.previewSurvivesEscape !== true) {
      throw new Error(
        `Web Reader card preview dismissed on Escape instead of explicit close: ${JSON.stringify(
          popoverDebug ?? {}
        )}`
      );
    }
    if (popoverDebug.previewCloseButtonPresent !== true) {
      throw new Error(
        `Web Reader card preview close button is missing: ${JSON.stringify(popoverDebug ?? {})}`
      );
    }
    if (!snapshot.webReaderSidebarMoreCheck?.passed) {
      throw new Error(
        `Web Reader sidebar navigation overlay regressed: ${JSON.stringify(
          snapshot.webReaderSidebarMoreCheck ?? {}
        )}`
      );
    }
    if (!snapshot.webReaderLifeMiningCheck?.passed) {
      throw new Error(
        `Web Reader Life Mining default-state check failed: ${JSON.stringify(
          snapshot.webReaderLifeMiningCheck ?? {}
        )}`
      );
    }
  }
  if (route !== "webReader" && snapshot.strayWebReaderState?.url) {
    throw new Error(
      `Web Reader BrowserView is still attached on ${route}: ${JSON.stringify(
        snapshot.strayWebReaderState
      )}`
    );
  }
  if (route === "life") {
    const expectsEnabled = getAppSmokeQaLifeMiningExpectation();
    const statusText = snapshot.lifeAutoCaptureStatusText ?? "";
    const matchesExpectation = expectsEnabled
      ? /(?:켜짐|on)/i.test(statusText)
      : /(?:꺼짐|off)/i.test(statusText);
    if (!matchesExpectation) {
      throw new Error(
        `Life Mining automatic capture state did not match the QA settings (expected ${
          expectsEnabled ? "on" : "off"
        }): ${statusText}`
      );
    }
  }
  if (snapshot.horizontalOverflowPx > 2) {
    throw new Error(
      `Route overflows horizontally by ${snapshot.horizontalOverflowPx}px at ${snapshot.viewportWidth}x${snapshot.viewportHeight}: ${route}`
    );
  }
  if (route === "listeningLoop" && process.env.LM_QA_APP_SMOKE_FETCH_RSS === "1") {
    if (!snapshot.listeningRssDurationCheck) {
      throw new Error("Listening RSS duration check did not run");
    }
    if (snapshot.listeningRssDurationCheck.candidateCount === 0) {
      throw new Error(
        `Listening RSS duration check fetched no cards: ${snapshot.listeningRssDurationCheck.statusText}`
      );
    }
    if (snapshot.listeningRssDurationCheck.durationCount === 0) {
      throw new Error(
        `Listening RSS cards rendered without duration chips: ${snapshot.listeningRssDurationCheck.statusText}`
      );
    }
    if (
      snapshot.listeningRssDurationCheck.durationCount <
      snapshot.listeningRssDurationCheck.candidateCount
    ) {
      throw new Error(
        `Listening RSS cards still have missing duration chips: ${JSON.stringify(
          snapshot.listeningRssDurationCheck
        )}`
      );
    }
    if (snapshot.listeningRssDurationCheck.overLimitCount > 0) {
      throw new Error(
        `Listening RSS cards include videos over 10 minutes: ${JSON.stringify(
          snapshot.listeningRssDurationCheck
        )}`
      );
    }
  }
  return snapshot;
}

async function runWebReaderWindowOpenQa(webReader: AppSmokeQaWebReaderAccess) {
  const view = webReader.getView();
  if (!view || view.webContents.isDestroyed()) {
    return {
      passed: false,
      reason: "web_reader_view_unavailable"
    };
  }

  const beforeWindows = new Set(BrowserWindow.getAllWindows());
  const popupWindows = webReader.getPopupWindows();
  const beforePopupWindows = new Set(popupWindows);
  const targetUrl = `https://example.com/?lem-web-reader-popup-qa=${Date.now()}`;
  try {
    await view.webContents.executeJavaScript(
      `window.open(${JSON.stringify(targetUrl)}, "_blank", "width=420,height=520"); true`
    );
  } catch (error) {
    return {
      passed: false,
      reason: "execute_window_open_failed",
      error: error instanceof Error ? error.message : String(error)
    };
  }

  let openedPopups: BrowserWindow[] = [];
  for (let attempt = 0; attempt < 20; attempt += 1) {
    openedPopups = Array.from(popupWindows).filter(
      (popup) => !beforePopupWindows.has(popup) && !popup.isDestroyed()
    );
    if (openedPopups.length > 0) {
      break;
    }
    await delay(100);
  }

  const popupUserAgents = openedPopups.map((popup) => popup.webContents.getUserAgent());
  const popupUrls = openedPopups.map((popup) => popup.webContents.getURL());
  const createdWindowCount = BrowserWindow.getAllWindows().filter(
    (candidate) => !beforeWindows.has(candidate)
  ).length;
  for (const popup of openedPopups) {
    popupWindows.delete(popup);
    if (!popup.isDestroyed()) {
      popup.close();
    }
  }

  return {
    passed:
      openedPopups.length > 0 &&
      createdWindowCount > 0 &&
      popupUserAgents.every((userAgent) => !/\sElectron\/\S+/i.test(userAgent)),
    targetUrl,
    openedPopupCount: openedPopups.length,
    createdWindowCount,
    beforeWindowCount: beforeWindows.size,
    afterWindowCount: BrowserWindow.getAllWindows().length,
    popupUrls,
    popupUserAgentHasElectron: popupUserAgents.some((userAgent) => /\sElectron\/\S+/i.test(userAgent))
  };
}

export async function runWebReaderPopoverVisualQa(
  window: BrowserWindow,
  reportPath: string,
  webReader: AppSmokeQaWebReaderAccess
) {
  const startedAt = new Date();
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  await waitForWindowLoad(window);
  window.setTitle("Language Miner - Web Reader Popover QA");
  await waitForQaSelector(window, '[data-qa="nav-webReader"]', 30_000);

  const routeSnapshot = await executeQaScript<{
    active: boolean;
    webReaderSurfaceHeight: number;
  }>(
    window,
    `
(async () => {
  const button = document.querySelector('[data-qa="nav-webReader"]');
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("Missing Web Reader nav button");
  }
  button.click();
  await new Promise((resolve) => setTimeout(resolve, 600));
  const defaultOpenButton = document.querySelector('[data-qa="web-reader-open-default"]');
  if (defaultOpenButton instanceof HTMLButtonElement) {
    defaultOpenButton.click();
    await new Promise((resolve) => setTimeout(resolve, 900));
  }
  const surfaceRect = document
    .querySelector(".web-reader-web-surface")
    ?.getBoundingClientRect();
  return {
    active: button.classList.contains("active"),
    webReaderSurfaceHeight: surfaceRect?.height ?? 0
  };
})()
`
  );

  let browserState: WebReaderViewState | null = null;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    browserState = await webReader.getState();
    if (browserState.url && browserState.innerHeight >= 360) {
      break;
    }
    await delay(250);
  }

  let popoverDebug: Record<string, unknown> | null = null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    popoverDebug = (await webReader.testSelectionPopover(
      "widely",
      "It is the most widely"
    )) as Record<string, unknown> | null;
    if (popoverDebug?.visible && popoverDebug?.selectedText) {
      break;
    }
    await delay(400);
  }

  const snapshot = {
    active: routeSnapshot.active,
    browserState,
    webReaderSurfaceHeight: routeSnapshot.webReaderSurfaceHeight,
    webReaderGuestInnerHeight: browserState?.innerHeight ?? 0,
    popoverDebug,
    redditTitleDebug: null as Record<string, unknown> | null
  };

  const popoverText =
    typeof snapshot.popoverDebug?.text === "string" ? snapshot.popoverDebug.text : "";
  const selectedText =
    typeof snapshot.popoverDebug?.selectedText === "string"
      ? snapshot.popoverDebug.selectedText
      : "";
  const popoverLocale = snapshot.popoverDebug?.locale === "en" ? "en" : "ko";
  const expectedPopoverLabel = popoverLocale === "en" ? "Sentence Card" : "문장카드";

  if (!snapshot.active) {
    throw new Error("Web Reader route did not become active.");
  }
  if (snapshot.webReaderGuestInnerHeight < 360) {
    throw new Error(
      `Web Reader BrowserView is too short for visual QA: ${snapshot.webReaderGuestInnerHeight}px`
    );
  }
  if (
    !snapshot.popoverDebug?.visible ||
    !popoverText.includes(expectedPopoverLabel) ||
    !selectedText
  ) {
    throw new Error(
      `Web Reader popover was not visible after mouse-drag selection: ${JSON.stringify(
        snapshot.popoverDebug ?? {}
      )}`
    );
  }

  const sourceSentence =
    typeof snapshot.popoverDebug?.sourceSentence === "string"
      ? snapshot.popoverDebug.sourceSentence
      : "";
  if (!sourceSentence.includes("It is the most widely")) {
    throw new Error(
      `Web Reader selected-source sentence is wrong for widely: ${JSON.stringify(
        snapshot.popoverDebug ?? {}
      )}`
    );
  }

  const redditTitleDebug = (await webReader.testShadowTitleSelectionPopover()) as
    | Record<string, unknown>
    | null;
  snapshot.redditTitleDebug = redditTitleDebug;
  const redditTitleSentence =
    typeof redditTitleDebug?.sourceSentence === "string" ? redditTitleDebug.sourceSentence : "";
  if (
    !redditTitleDebug?.visible ||
    !redditTitleSentence.includes("Character weapons and summons not adapted into the remakes") ||
    redditTitleSentence.includes("Gilgamesh has been an actual character")
  ) {
    throw new Error(
      `Web Reader Reddit title source sentence is wrong: ${JSON.stringify(redditTitleDebug ?? {})}`
    );
  }

  const screenshotPath = reportPath.replace(/\.json$/i, ".png");
  if (process.env.LM_QA_WEB_READER_POPOVER_HOLD === "1") {
    const readyAt = new Date();
    writeSafeQaJson(reportPath, {
      status: "ready",
      startedAt: startedAt.toISOString(),
      readyAt: readyAt.toISOString(),
      elapsedMs: readyAt.getTime() - startedAt.getTime(),
      screenshotPath,
      snapshot
    });
    await new Promise(() => {
      // Keep the verified popover visible for an external OS-level screenshot.
    });
    return;
  }

  let screenshotError: string | undefined;
  try {
    await captureDesktopWindowScreenshot(window, screenshotPath);
  } catch (error) {
    screenshotError = error instanceof Error ? error.message : String(error);
    try {
      await captureWebReaderViewProofScreenshot(screenshotPath, webReader);
    } catch (fallbackError) {
      screenshotError = `${screenshotError}; BrowserView fallback failed: ${
        fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
      }`;
    }
  }

  const finishedAt = new Date();
  writeSafeQaJson(reportPath, {
    status: "passed",
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    elapsedMs: finishedAt.getTime() - startedAt.getTime(),
    screenshotPath: fs.existsSync(screenshotPath) ? screenshotPath : undefined,
    screenshotError,
    snapshot
  });
}

export async function runWebReaderLifeMiningProofQa(
  window: BrowserWindow,
  reportPath: string,
  webReader: AppSmokeQaWebReaderAccess
) {
  const startedAt = new Date();
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  await waitForWindowLoad(window);
  window.setTitle("Language Miner - Web Reader Life Mining QA");
  await waitForQaSelector(window, '[data-qa="nav-webReader"]', 30_000);

  const allTargets = [
    { siteKey: "chatgpt", label: "ChatGPT", url: "https://chatgpt.com/" },
    {
      siteKey: "discord",
      label: "Discord",
      url: process.env.LM_QA_DISCORD_URL || "https://discord.com/channels/@me"
    }
  ];
  const requestedTargets = String(process.env.LM_QA_WEB_READER_LIFE_TARGETS || "")
    .split(",")
    .map((target) => target.trim().toLowerCase())
    .filter(Boolean);
  const targets = requestedTargets.length
    ? allTargets.filter((target) => requestedTargets.includes(target.siteKey))
    : allTargets;
  const results = [];

  for (const target of targets) {
    await openWebReaderUrlForLifeMiningQa(window, target.url);
    await waitForWebReaderHost(target.url, 45_000, webReader);
    const openConversationResult = await openRecentConversationForLifeMiningQa(target.siteKey, webReader);
    await delay(3_000);
    await webReader.injectLifeMining();
    const prepareDraftResult =
      target.siteKey === "discord" ? await prepareDiscordDraftForLifeMiningQa(webReader) : null;
    const beforeDebug = await readWebReaderLifeMiningDebug(webReader);
    const captureResult = await webReader.captureLifeMiningNow();
    const afterDebug = await readWebReaderLifeMiningDebug(webReader);
    const screenshotPath = reportPath.replace(/\.json$/i, `.${target.siteKey}.png`);
    let screenshotError: string | undefined;
    try {
      await captureWebReaderViewProofScreenshot(screenshotPath, webReader);
    } catch (error) {
      screenshotError = error instanceof Error ? error.message : String(error);
      try {
        await captureDesktopWindowScreenshot(window, screenshotPath);
      } catch (fallbackError) {
        screenshotError = `${screenshotError}; desktop fallback failed: ${
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        }`;
      }
    }

    const passed = captureResult.savedCount > 0 && Boolean(captureResult.state.lastCaptureAt);
    results.push({
      ...target,
      passed,
      screenshotPath: fs.existsSync(screenshotPath) ? screenshotPath : undefined,
      screenshotError,
      openConversationResult,
      prepareDraftResult,
      beforeDebug,
      captureResult,
      afterDebug,
      state: await webReader.getState()
    });
  }

  const failed = results.filter((result) => !result.passed);
  const finishedAt = new Date();
  const report = {
    status: failed.length === 0 ? "passed" : "failed",
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    elapsedMs: finishedAt.getTime() - startedAt.getTime(),
    results
  };
  writeSafeQaJson(reportPath, report);
  if (failed.length > 0) {
    throw new Error(
      `Web Reader Life Mining proof failed for: ${failed
        .map((result) => result.label)
        .join(", ")}. Report: ${reportPath}`
    );
  }
}

async function openWebReaderUrlForLifeMiningQa(window: BrowserWindow, url: string) {
  await executeQaScript(
    window,
    `
(async () => {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const nav = document.querySelector('[data-qa="nav-webReader"]');
  if (!(nav instanceof HTMLButtonElement)) {
    throw new Error("Missing Web Reader nav button");
  }
  nav.click();
  await delay(700);
  const input =
    document.querySelector('[data-qa="web-reader-hub-search"]') ||
    document.querySelector('[data-qa="web-reader-address"]');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Missing Web Reader URL input");
  }
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (valueSetter) {
    valueSetter.call(input, ${JSON.stringify(url)});
  } else {
    input.value = ${JSON.stringify(url)};
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  const form = input.closest("form");
  if (form instanceof HTMLFormElement) {
    form.requestSubmit();
  } else {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  }
})()
`
  );
}

async function waitForWebReaderHost(
  url: string,
  timeoutMs: number,
  webReader: AppSmokeQaWebReaderAccess
) {
  const expectedHost = new URL(url).hostname.replace(/^www\./i, "");
  const deadline = Date.now() + timeoutMs;
  let lastState: WebReaderViewState | null = null;
  while (Date.now() < deadline) {
    lastState = await webReader.getState();
    const currentUrl = lastState.url || "";
    let currentHost = "";
    try {
      currentHost = new URL(currentUrl).hostname.replace(/^www\./i, "");
    } catch {
      currentHost = "";
    }
    const view = webReader.getView();
    if (
      currentHost.endsWith(expectedHost) &&
      lastState.innerHeight >= 360 &&
      view &&
      !view.webContents.isLoading()
    ) {
      return lastState;
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for Web Reader host ${expectedHost}: ${JSON.stringify(lastState)}`);
}

async function openRecentConversationForLifeMiningQa(
  siteKey: string,
  webReader: AppSmokeQaWebReaderAccess
) {
  const view = webReader.getView();
  if (!view || view.webContents.isDestroyed()) {
    return false;
  }
  if (siteKey === "chatgpt") {
    return Boolean(
      await view.webContents.executeJavaScript(`
(() => {
  const isVisible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };
  const link = Array.from(document.querySelectorAll('a[href*="/c/"], a[href*="/g/"]')).find(isVisible);
  if (link instanceof HTMLElement) {
    link.click();
    return true;
  }
  return false;
})()
`)
    );
  }
  if (siteKey === "discord") {
    const serverLabel = process.env.LM_QA_DISCORD_SERVER_LABEL?.trim();
    if (serverLabel) {
      return openDiscordServerForLifeMiningQa(serverLabel, webReader);
    }
    return (await view.webContents.executeJavaScript(`
(() => {
  const isVisible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };
  const normalize = (value) => String(value || "").replace(/\\s+/g, " ").trim();
  const rejectText = /^(?:친구|온라인|모두|친구 추가하기|상점|퀘스트|대화 찾기|대화 찾기 또는 시작하기|Friends|Online|All|Add Friend|Shop|Quests|Find or start a conversation)$/i;
  const candidates = [
    ...Array.from(document.querySelectorAll('a[href*="/channels/@me/"]')),
    ...Array.from(document.querySelectorAll('[data-list-item-id*="private-channels"] a[href*="/channels/"]')),
    ...Array.from(document.querySelectorAll('[aria-label*="다이렉트 메시지"] a[href*="/channels/"], [aria-label*="Direct Messages"] a[href*="/channels/"]'))
  ].filter((element, index, array) => element instanceof HTMLElement && array.indexOf(element) === index && isVisible(element));
  const link = candidates.find((candidate) => {
    const href = String(candidate.href || "");
    const text = normalize(candidate.innerText || candidate.textContent || candidate.getAttribute("aria-label"));
    return /\\/channels\\/@me\\//.test(href) && text && !rejectText.test(text);
  }) || candidates.find((candidate) => /\\/channels\\/@me\\//.test(String(candidate.href || "")));
  if (link instanceof HTMLElement) {
    link.click();
    return {
      clicked: true,
      href: link.href || "",
      text: normalize(link.innerText || link.textContent || link.getAttribute("aria-label"))
    };
  }
  return {
    clicked: false,
    href: "",
    text: "",
    visibleCandidateCount: candidates.length,
    pageText: normalize(document.body?.innerText || "").slice(0, 500)
  };
})()
`));
  }
  return false;
}

async function openDiscordServerForLifeMiningQa(
  serverLabel: string,
  webReader: AppSmokeQaWebReaderAccess
) {
  const view = webReader.getView();
  if (!view || view.webContents.isDestroyed()) {
    return { clicked: false, reason: "missing_web_reader_view" };
  }
  return (await view.webContents.executeJavaScript(`
(async () => {
  const wanted = ${JSON.stringify(serverLabel)}.toLowerCase();
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const normalize = (value) => String(value || "").replace(/\\s+/g, " ").trim();
  const readDirectLabel = (element) => normalize([
    element.getAttribute?.("aria-label"),
    element.getAttribute?.("title")
  ].filter(Boolean).join(" "));
  const readLabel = (element) => normalize([
    readDirectLabel(element),
    element.innerText,
    element.textContent
  ].filter(Boolean).join(" "));
  const isVisible = (element) => {
    if (!element || !element.getBoundingClientRect) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };
  const clickElement = (element) => {
    element.scrollIntoView?.({ block: "center", inline: "center" });
    const rect = element.getBoundingClientRect();
    const init = {
      bubbles: true,
      cancelable: true,
      clientX: Math.round(rect.left + rect.width / 2),
      clientY: Math.round(rect.top + rect.height / 2)
    };
    element.dispatchEvent(new PointerEvent("pointerdown", init));
    element.dispatchEvent(new MouseEvent("mousedown", init));
    element.dispatchEvent(new PointerEvent("pointerup", init));
    element.dispatchEvent(new MouseEvent("mouseup", init));
    element.dispatchEvent(new MouseEvent("click", init));
  };
  const inputSelector = [
    "[role='textbox'][contenteditable='true'][data-slate-editor='true']",
    "[role='textbox'][contenteditable='true']"
  ].join(",");
  const hasInput = () => Array.from(document.querySelectorAll(inputSelector)).some(isVisible);
  if (/\\/channels\\/(?!@me(?:\\/|$))[^/]+\\/[^/]+/.test(location.pathname) && hasInput()) {
    return {
      clicked: true,
      alreadyOpen: true,
      inputPresent: true,
      url: location.href,
      title: document.title,
      pageText: normalize(document.body?.innerText || "").slice(0, 500)
    };
  }
  if (/\\/login(?:\\?|$)/.test(location.pathname + location.search)) {
    const accountCandidates = Array.from(document.querySelectorAll("button,[role='button'],[tabindex]"))
      .filter((element) => element instanceof HTMLElement && isVisible(element))
      .filter((element) => readLabel(element).toLowerCase().includes(wanted));
    const loginButton =
      Array.from(document.querySelectorAll("button,[role='button']"))
        .filter((element) => element instanceof HTMLElement && isVisible(element))
        .find((element) => /로그인|login/i.test(readLabel(element))) ||
      accountCandidates
        .map((element) => element.querySelector?.("button,[role='button']"))
        .find((element) => element instanceof HTMLElement && /로그인|login/i.test(readLabel(element)));
    if (loginButton instanceof HTMLElement) {
      clickElement(loginButton);
      for (let attempt = 0; attempt < 20 && /\\/login(?:\\?|$)/.test(location.pathname + location.search); attempt += 1) {
        await delay(500);
      }
    }
    if (/\\/login(?:\\?|$)/.test(location.pathname + location.search)) {
      return {
        clicked: false,
        reason: "discord_login_required",
        wanted: ${JSON.stringify(serverLabel)},
        accountCandidateCount: accountCandidates.length,
        url: location.href,
        title: document.title,
        pageText: normalize(document.body?.innerText || "").slice(0, 500)
      };
    }
  }
  const collectServerCandidates = () => Array.from(document.querySelectorAll([
    "[data-list-item-id^='guildsnav___']",
    "[data-list-item-id*='guildsnav']",
    "[role='treeitem']",
    "a[href*='/channels/']:not([href*='/channels/@me'])",
    "[aria-label]",
    "[title]"
  ].join(","))).filter((element, index, array) => {
    if (!(element instanceof HTMLElement) || array.indexOf(element) !== index || !isVisible(element)) {
      return false;
    }
    const direct = readDirectLabel(element).toLowerCase();
    const label = readLabel(element).toLowerCase();
    const listId = String(element.getAttribute("data-list-item-id") || "").toLowerCase();
    const href = String(element.getAttribute("href") || "");
    const isGuildNav = listId.includes("guildsnav");
    const isGuildLink = /\\/channels\\/(?!@me(?:\\/|$))[^/]+/.test(href);
    if (
      listId.includes("private-channels") ||
      /channels\\/@me(?:\\/|$)/.test(href) ||
      (!isGuildNav && !isGuildLink)
    ) {
      return false;
    }
    return direct.includes(wanted) || label.includes(wanted);
  }).map((element) => {
    const direct = readDirectLabel(element);
    const label = readLabel(element);
    const listId = String(element.getAttribute("data-list-item-id") || "");
    const href = element instanceof HTMLAnchorElement ? element.href : "";
    const score =
      (listId.includes("guildsnav___") ? 0 : 100) +
      (direct.toLowerCase().includes(wanted) ? 0 : 50) +
      (href && !href.includes("/channels/@me") ? 0 : 25) +
      Math.min(label.length, 500) / 100;
    return { element, direct, label, listId, href, score };
  }).sort((a, b) => a.score - b.score);
  let serverCandidates = collectServerCandidates();
  for (let attempt = 0; attempt < 20 && serverCandidates.length === 0; attempt += 1) {
    await delay(500);
    serverCandidates = collectServerCandidates();
  }
  if (serverCandidates.length === 0 && /\\/login(?:\\?|$)/.test(location.pathname + location.search)) {
    const loginButton = Array.from(document.querySelectorAll("button,[role='button']"))
      .filter((element) => element instanceof HTMLElement && isVisible(element))
      .find((element) => /로그인|login/i.test(readLabel(element)));
    if (loginButton instanceof HTMLElement) {
      clickElement(loginButton);
      for (let attempt = 0; attempt < 30 && /\\/login(?:\\?|$)/.test(location.pathname + location.search); attempt += 1) {
        await delay(500);
      }
      if (/\\/channels\\/(?!@me(?:\\/|$))[^/]+\\/[^/]+/.test(location.pathname) && hasInput()) {
        return {
          clicked: true,
          accountLoginClicked: true,
          alreadyOpen: true,
          inputPresent: true,
          url: location.href,
          title: document.title,
          pageText: normalize(document.body?.innerText || "").slice(0, 500)
        };
      }
      serverCandidates = collectServerCandidates();
    }
    if (serverCandidates.length === 0 && /\\/login(?:\\?|$)/.test(location.pathname + location.search)) {
      return {
        clicked: false,
        reason: "discord_login_required",
        wanted: ${JSON.stringify(serverLabel)},
        loginButtonFound: Boolean(loginButton),
        url: location.href,
        title: document.title,
        pageText: normalize(document.body?.innerText || "").slice(0, 500)
      };
    }
  }
  const serverMatch = serverCandidates[0];
  const server = serverMatch?.element;
  if (!(server instanceof HTMLElement)) {
    return {
      clicked: false,
      reason: "server_not_found",
      wanted: ${JSON.stringify(serverLabel)},
      candidates: Array.from(document.querySelectorAll("[data-list-item-id],[aria-label],[title],a[href*='/channels/']"))
        .filter((element) => element instanceof HTMLElement && isVisible(element))
        .slice(0, 30)
        .map((element) => ({
          direct: readDirectLabel(element),
          label: readLabel(element).slice(0, 160),
          listId: element.getAttribute?.("data-list-item-id") || "",
          href: element.getAttribute?.("href") || ""
        }))
        .filter(Boolean)
    };
  }
  const serverTarget =
    (server instanceof HTMLAnchorElement && !String(server.href || "").includes("/channels/@me") ? server : null) ||
    server.querySelector?.("a[href*='/channels/']:not([href*='/channels/@me'])") ||
    server.closest?.("a[href*='/channels/']:not([href*='/channels/@me'])") ||
    server;
  clickElement(serverTarget);
  await delay(1800);
  const channelCandidates = Array.from(document.querySelectorAll([
    "a[href*='/channels/']:not([href*='/channels/@me'])",
    "[role='link'][href*='/channels/']",
    "[data-list-item-id*='channels'] a[href*='/channels/']"
  ].join(","))).filter((element, index, array) => {
    if (!(element instanceof HTMLElement) || array.indexOf(element) !== index || !isVisible(element)) {
      return false;
    }
    const href = String(element.href || "");
    const label = readLabel(element);
    return /\\/channels\\//.test(href) && !/\\/channels\\/@me(?:\\/|$)/.test(href) && !/voice|음성|category/i.test(label);
  });
  let channel = channelCandidates.find((element) => /#|일반|general|채팅|chat/i.test(readLabel(element))) || channelCandidates[0];
  if (channel instanceof HTMLElement) {
    clickElement(channel);
    await delay(2400);
  }
  return {
    clicked: true,
    serverLabel: serverMatch.label,
    serverDirectLabel: serverMatch.direct,
    serverListId: serverMatch.listId,
    serverHref: serverMatch.href || serverTarget.href || "",
    channelClicked: Boolean(channel),
    channelLabel: channel instanceof HTMLElement ? readLabel(channel) : "",
    inputPresent: hasInput(),
    url: location.href,
    title: document.title,
    pageText: normalize(document.body?.innerText || "").slice(0, 500)
  };
})()
`)) as Record<string, unknown>;
}

async function prepareDiscordDraftForLifeMiningQa(webReader: AppSmokeQaWebReaderAccess) {
  const view = webReader.getView();
  if (!view || view.webContents.isDestroyed()) {
    return { prepared: false, reason: "missing_web_reader_view" };
  }
  return (await view.webContents.executeJavaScript(`
(() => {
  const normalize = (value) => String(value || "").replace(/\\s+/g, " ").trim();
  const isVisible = (element) => {
    if (!element || !element.getBoundingClientRect) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };
  const input = Array.from(document.querySelectorAll([
    "[role='textbox'][contenteditable='true'][data-slate-editor='true']",
    "[role='textbox'][contenteditable='true']"
  ].join(","))).filter(isVisible).pop();
  if (!(input instanceof HTMLElement)) {
    return {
      prepared: false,
      reason: "missing_discord_textbox",
      pageText: normalize(document.body?.innerText || "").slice(0, 500)
    };
  }
  const text = "LEM Discord life mining QA draft " + new Date().toISOString();
  input.focus();
  input.textContent = text;
  input.dispatchEvent(new InputEvent("beforeinput", {
    bubbles: true,
    cancelable: true,
    inputType: "insertText",
    data: text
  }));
  input.dispatchEvent(new InputEvent("input", {
    bubbles: true,
    cancelable: true,
    inputType: "insertText",
    data: text
  }));
  input.dispatchEvent(new KeyboardEvent("keyup", {
    bubbles: true,
    key: "a"
  }));
  return {
    prepared: true,
    text,
    inputText: normalize(input.innerText || input.textContent || ""),
    url: location.href,
    title: document.title
  };
})()
`)) as Record<string, unknown>;
}

async function readWebReaderLifeMiningDebug(webReader: AppSmokeQaWebReaderAccess) {
  const view = webReader.getView();
  if (!view || !webReader.canExecuteScript(view)) {
    return null;
  }
  try {
    return await view.webContents.executeJavaScript(
      "window.__LEM_WEB_READER_LIFE_MINER && typeof window.__LEM_WEB_READER_LIFE_MINER.debug === 'function' ? window.__LEM_WEB_READER_LIFE_MINER.debug() : null"
    );
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function getAppSmokeQaSecrets(): AppSmokeSecret[] {
  const settingsJson = process.env.LM_QA_APP_SETTINGS_JSON;
  if (!settingsJson) {
    return [];
  }

  try {
    const settings = JSON.parse(settingsJson) as Partial<AppSettings>;
    return [
      { field: "geminiApiKey", value: settings.geminiApiKey?.trim() ?? "" },
      {
        field: "googleTranslateApiKey",
        value: settings.googleTranslateApiKey?.trim() ?? ""
      }
    ].filter((secret) => secret.value.length > 0);
  } catch {
    return [];
  }
}

function getAppSmokeQaLifeMiningExpectation() {
  const settingsJson = process.env.LM_QA_APP_SETTINGS_JSON;
  if (!settingsJson) {
    return false;
  }

  try {
    const settings = JSON.parse(settingsJson) as Partial<AppSettings>;
    return settings.lifeMiningCaptureSettings?.enabled === true;
  } catch {
    return false;
  }
}

function hasAppCrashText(text: string) {
  return /\b(Uncaught|ReferenceError|TypeError|Cannot read properties|Maximum update depth|Minified React error)\b/i.test(
    text
  );
}

async function waitForQaSelector(
  window: BrowserWindow,
  selector: string,
  timeoutMs: number
) {
  const startedAt = Date.now();
  let lastSnapshot: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    const found = await executeQaScript<boolean>(
      window,
      `Boolean(document.querySelector(${JSON.stringify(selector)}))`
    );
    if (found) {
      return;
    }
    lastSnapshot = await getQaPageSnapshot(window).catch(() => undefined);
    await delay(250);
  }
  throw new Error(
    `Timed out waiting for selector: ${selector}. Snapshot: ${JSON.stringify(lastSnapshot)}`
  );
}

async function runOfficialPlayZoneCatalogQa(
  mainWindow: BrowserWindow
): Promise<OfficialPlayZoneQaResult> {
  const officialGameIds = [
    "meowthology.abyss-summoner",
    "meowthology.drillheart-defense",
    "meowthology.cat-odyssey"
  ];
  const verifyDownloadInstallRuntime = process.env.LM_QA_PLAYZONE_OFFICIAL_GAMES === "1";
  const games: Array<Record<string, unknown>> = [];

  for (const cartridgeId of officialGameIds) {
    const catalogResult = await executeQaScript<{ found: boolean; enabled: boolean; confirmation: boolean }>(
      mainWindow,
      `
(async () => {
  const pack = document.querySelector(
    '[data-qa="play-zone-official-pack"][data-pack-id=${JSON.stringify(cartridgeId)}]'
  );
  if (!(pack instanceof HTMLButtonElement)) {
    return { found: false, enabled: false };
  }
  pack.click();
  await new Promise((resolve) => setTimeout(resolve, 350));
  const play = document.querySelector('[data-qa="play-zone-play-selected"]');
  const enabled = play instanceof HTMLButtonElement && !play.disabled;
  if (enabled) {
    play.click();
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const confirmation = document.querySelector('[data-qa="play-zone-install-confirmation"]') instanceof HTMLElement;
  return { found: true, enabled, confirmation };
})()
`
    );
    if (!catalogResult.found || !catalogResult.enabled || !catalogResult.confirmation) {
      throw createQaError(
        "PLAYZONE_OFFICIAL_GAME_UNAVAILABLE",
        `Official PlayZone game is unavailable or does not offer installation: ${cartridgeId} ${JSON.stringify(catalogResult)}`
      );
    }
    if (!verifyDownloadInstallRuntime) {
      await executeQaScript(
        mainWindow,
        `document.querySelector('[data-qa="play-zone-install-confirmation"] .icon-button')?.click()`
      );
      games.push({ cartridgeId, catalogAvailable: true, confirmationShown: true });
      continue;
    }

    const existingWindowIds = new Set(BrowserWindow.getAllWindows().map((window) => window.id));
    const confirmClicked = await executeQaScript<boolean>(
      mainWindow,
      `
(() => {
  const dialog = document.querySelector('[data-qa="play-zone-install-confirmation"]');
  const confirm = dialog?.querySelector('.play-zone-install-actions .button.primary');
  if (!(confirm instanceof HTMLButtonElement) || confirm.disabled) return false;
  confirm.click();
  return true;
})()
`
    );
    if (!confirmClicked) {
      throw createQaError(
        "PLAYZONE_OFFICIAL_INSTALL_CONFIRM_UNAVAILABLE",
        `Official PlayZone install confirmation could not be submitted: ${cartridgeId}`
      );
    }

    const runtimeWindow = await waitForNewBrowserWindow(
      existingWindowIds,
      mainWindow,
      cartridgeId,
      16 * 60_000
    );
    try {
      const frameLoadState = await waitForPlayZoneRuntimeFrame(runtimeWindow, 45_000);
      if (frameLoadState !== "loaded") {
        throw createQaError(
          "PLAYZONE_RUNTIME_FRAME_FAILED",
          `Official PlayZone runtime frame did not load: ${cartridgeId} (${frameLoadState})`
        );
      }
      const surface = await waitForPlayZoneGameSurface(runtimeWindow, cartridgeId, 90_000);
      const installed = await readInstalledOfficialPlayZoneQa(mainWindow, cartridgeId);
      if (
        !installed.installed ||
        installed.status !== "trusted_official" ||
        installed.securityIssueCount !== 0 ||
        !/^[a-f0-9]{64}$/.test(installed.expectedArchiveSha256) ||
        !/^[a-f0-9]{64}$/.test(installed.packSha256) ||
        installed.packSha256 !== installed.expectedPackSha256
      ) {
        throw createQaError(
          "PLAYZONE_OFFICIAL_INSTALL_UNVERIFIED",
          `Official PlayZone install did not retain its verified identity: ${cartridgeId} ${JSON.stringify(installed)}`
        );
      }
      games.push({ cartridgeId, frameLoadState, ...surface, ...installed });
    } finally {
      if (!runtimeWindow.isDestroyed()) runtimeWindow.destroy();
      await delay(250);
    }
  }

  return {
    mode: verifyDownloadInstallRuntime ? "download-install-runtime" : "catalog",
    games
  };
}

async function waitForNewBrowserWindow(
  existingWindowIds: Set<number>,
  mainWindow: BrowserWindow,
  cartridgeId: string,
  timeoutMs: number
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const runtimeWindow = BrowserWindow.getAllWindows().find(
      (candidate) => !candidate.isDestroyed() && !existingWindowIds.has(candidate.id)
    );
    if (runtimeWindow) {
      return runtimeWindow;
    }
    const installError = await executeQaScript<string>(
      mainWindow,
      `document.querySelector('[data-qa="play-zone-install-error"]')?.textContent?.trim() ?? ''`
    ).catch(() => "");
    if (installError) {
      throw createQaError(
        "PLAYZONE_OFFICIAL_INSTALL_FAILED",
        `Official PlayZone install failed before launch: ${cartridgeId} ${installError.slice(0, 300)}`
      );
    }
    await delay(500);
  }
  throw createQaError(
    "PLAYZONE_RUNTIME_WINDOW_TIMEOUT",
    "Timed out waiting for the PlayZone runtime window."
  );
}

async function waitForPlayZoneRuntimeFrame(runtimeWindow: BrowserWindow, timeoutMs: number) {
  const startedAt = Date.now();
  let lastState = "missing";
  while (Date.now() - startedAt < timeoutMs) {
    lastState = await executeQaScript<string>(
      runtimeWindow,
      `document.querySelector('[data-qa="play-zone-runtime-window"]')?.getAttribute('data-frame-load-state') ?? 'missing'`
    ).catch(() => "unavailable");
    if (lastState === "loaded" || lastState === "error") {
      return lastState;
    }
    await delay(150);
  }
  return lastState;
}

async function waitForPlayZoneGameSurface(
  runtimeWindow: BrowserWindow,
  cartridgeId: string,
  timeoutMs: number
) {
  const startedAt = Date.now();
  let childFrameFound = false;
  let lastState: PlayZoneGameSurfaceState | null = null;
  let healthySamples = 0;
  while (Date.now() - startedAt < timeoutMs) {
    const childFrame = runtimeWindow.webContents.mainFrame.framesInSubtree.find(
      (frame) => frame !== runtimeWindow.webContents.mainFrame && frame.url.startsWith("lem-playzone:")
    );
    childFrameFound = Boolean(childFrame);
    if (childFrame) {
      const state = await childFrame.executeJavaScript(`
(() => ({
  ready: document.readyState === "complete",
  canvasCount: document.querySelectorAll("canvas").length,
  imageCount: document.images.length,
  pendingImageCount: Array.from(document.images).filter((image) => !image.complete).length,
  failedImageCount: Array.from(document.images).filter(
    (image) => image.complete && image.naturalWidth === 0
  ).length
}))()
`).catch(() => null) as PlayZoneGameSurfaceState | null;
      lastState = state;
      if (
        state?.ready &&
        state.canvasCount > 0 &&
        state.pendingImageCount === 0 &&
        state.failedImageCount === 0
      ) {
        healthySamples += 1;
        if (healthySamples >= 10) return state;
      } else {
        healthySamples = 0;
      }
    }
    await delay(200);
  }
  throw createQaError(
    childFrameFound ? "PLAYZONE_GAME_SURFACE_MISSING" : "PLAYZONE_GAME_FRAME_MISSING",
    `Official PlayZone game did not create a healthy rendered surface: ${cartridgeId} ${JSON.stringify(lastState)}`
  );
}

async function readInstalledOfficialPlayZoneQa(
  mainWindow: BrowserWindow,
  cartridgeId: string
) {
  return executeQaScript<{
    installed: boolean;
    status: string;
    securityIssueCount: number;
    expectedArchiveSha256: string;
    packSha256: string;
    expectedPackSha256: string;
  }>(
    mainWindow,
    `
(async () => {
  const entries = await window.localEnglishMiner?.playZone?.listInstalledPacks?.() ?? [];
  const entry = entries.find((candidate) => candidate.id === ${JSON.stringify(cartridgeId)});
  return {
    installed: entry?.installed === true,
    status: String(entry?.securityReport?.status ?? entry?.status ?? ""),
    securityIssueCount: Array.isArray(entry?.securityReport?.issues)
      ? entry.securityReport.issues.length
      : -1,
    expectedArchiveSha256: String(entry?.officialDownload?.archiveSha256 ?? ""),
    packSha256: String(entry?.securityReport?.packSha256 ?? ""),
    expectedPackSha256: String(entry?.officialDownload?.packSha256 ?? "")
  };
})()
`
  );
}

function createQaError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

async function getQaPageSnapshot(window: BrowserWindow) {
  return executeQaScript(window, `
(() => ({
  location: window.location.href,
  readyState: document.readyState,
  title: document.title,
  bodyText: (document.body?.innerText ?? "").replace(/\\s+/g, " ").trim().slice(0, 1000),
  bodyHtml: (document.body?.innerHTML ?? "").replace(/\\s+/g, " ").trim().slice(0, 1000)
}))()
`);
}

async function executeQaScript<T = unknown>(window: BrowserWindow, script: string): Promise<T> {
  return window.webContents.executeJavaScript(script, true) as Promise<T>;
}

async function waitForWindowLoad(window: BrowserWindow) {
  if (!window.webContents.isLoading()) {
    await delay(1_000);
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => resolve(), 30_000);
    window.webContents.once("did-finish-load", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
  await delay(250);
}

function writeSafeQaJson(reportPath: string, report: unknown) {
  const safeReport = JSON.parse(serializeSafeDebugLogEntry(report));
  fs.writeFileSync(reportPath, `${JSON.stringify(safeReport, null, 2)}\n`, "utf8");
}

function delay(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
