import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

const dialogSource = readSource("src", "components", "Dialog.tsx");
const reviewSource = readSource("src", "pages", "ReviewPage.tsx");
const cardsSource = readSource("src", "pages", "CardsPage.tsx");
const profileSwitcherSource = readSource("src", "pages", "SettingsProfileSwitcher.tsx");
const bilingualReaderSource = readSource("src", "components", "BilingualArtifactReader.tsx");
const todaySource = readSource("src", "pages", "PdfHubPage.tsx");
const webReaderSource = readSource("src", "pages", "WebReaderPage.tsx");
const webReaderStyles = readSource("src", "styles", "webReader.css");
const globalStyles = readSource("src", "styles.css");
const accessibilityStyles = readSource("src", "styles", "accessibility.css");
const settingsTtsSource = readSource("src", "pages", "SettingsTtsPanel.tsx");
const onboardingSource = readSource("src", "AppOnboarding.tsx");
const appSource = readSource("src", "App.tsx");
const electronMainSource = readSource("electron", "main.ts");
const indexSource = readSource("index.html");

describe("shared dialog accessibility", () => {
  it("owns focus, Escape, background inertness, and focus restoration", () => {
    expect(dialogSource).toContain('aria-modal="true"');
    expect(dialogSource).toContain('event.key === "Escape"');
    expect(dialogSource).toContain('event.key !== "Tab"');
    expect(dialogSource).toContain('setAttribute("inert", "")');
    expect(dialogSource).toContain("previouslyFocused.focus");
  });

  it("is reused by review, cards, and profile switching", () => {
    expect(reviewSource).toContain('from "../components/Dialog"');
    expect(cardsSource).toContain('from "../components/Dialog"');
    expect(profileSwitcherSource).toContain('from "../components/Dialog"');
    expect(reviewSource).toContain('aria-label={t("review.session.close")}');
    expect(profileSwitcherSource).toContain(
      'aria-label={t("settings.profile.closeSwitcher")}'
    );
  });

  it("keeps first-run guidance modal, value-first, and cloud-AI optional", () => {
    expect(onboardingSource).toContain('from "./components/Dialog"');
    expect(onboardingSource).toContain('data-qa="onboarding-skip"');
    expect(onboardingSource).toContain('t("onboarding.steps.languages.title")');
    expect(onboardingSource).toContain('t("onboarding.steps.sentences.title")');
    expect(onboardingSource).toContain('t("onboarding.steps.loop.title")');
    expect(onboardingSource).toContain('t("onboarding.ai.disconnectedTitle")');
    expect(onboardingSource).toContain('data-qa={`onboarding-app-locale-${locale}`}');
    expect(onboardingSource).toContain('t("onboarding.ai.geminiStep1")');
    expect(onboardingSource).toContain('onSkip(draftSettings)');
    expect(onboardingSource).not.toContain("onboarding-gemini-api-key");
  });

  it("records a first-run decision and paints a light startup surface", () => {
    expect(appSource).toContain("getAppOnboardingCompleted");
    expect(appSource).toContain("completeAppOnboarding");
    expect(appSource).toContain("writeAppOnboardingCompleted();");
    expect(electronMainSource).toContain('show: false');
    expect(electronMainSource).toContain('ipcMain.handle("app:rendererReady"');
    expect(electronMainSource).toContain("revealMainWindowWhenRendererReady?.()");
    expect(electronMainSource).toContain('backgroundColor: "#f4f7fb"');
    expect(indexSource).toContain('class="startup-paint"');
    expect(indexSource).toContain("prefers-reduced-motion: reduce");
  });
});

describe("reader and responsive UI accessibility", () => {
  it("keeps finished-reader controls localized and explicitly labelled", () => {
    expect(bilingualReaderSource).toContain(
      'aria-label={t("pdfAuthoring.artifactReader.toolbar.search")}'
    );
    expect(bilingualReaderSource).toContain(
      't("pdfAuthoring.artifactReader.toolbar.fitWidth")'
    );
    expect(bilingualReaderSource).toContain(
      't("pdfAuthoring.artifactReader.toolbar.fitPage")'
    );
    expect(bilingualReaderSource).not.toContain(">Open file<");
    expect(bilingualReaderSource).not.toContain(">Make sentence card<");
  });

  it("hides visual heatmap cells from assistive technology and summarizes activity", () => {
    expect(todaySource).toContain('aria-hidden="true" className="study-activity-weeks"');
    expect(todaySource).toContain('className="sr-only"');
    expect(todaySource).toContain('className="pdf-hub-toolbox"');
  });

  it("uses bounded visibility-aware polling and a compact Web Reader rail", () => {
    expect(webReaderSource).toContain("useAdaptivePolling");
    expect(webReaderSource).not.toContain("setInterval");
    expect(webReaderStyles).toContain("@media (max-width: 1100px)");
    expect(webReaderStyles).toContain("grid-column: 1 / -1");
  });

  it("reserves usable workspace at the 940px Electron minimum", () => {
    expect(accessibilityStyles).toContain("@media (max-width: 1100px)");
    expect(accessibilityStyles).toContain("grid-template-columns: 72px minmax(0, 1fr)");
    expect(globalStyles).toContain("grid-template-columns: minmax(260px, 320px) minmax(0, 1fr)");
    expect(globalStyles).toContain(".cards-filter-panel.expanded .cards-filter-body");
  });

  it("provides global reduced-motion and Windows high-contrast fallbacks", () => {
    expect(accessibilityStyles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(accessibilityStyles).toContain("@media (forced-colors: active)");
    expect(accessibilityStyles).toContain("transition-duration: 0.01ms !important");
    expect(accessibilityStyles).toContain("background: Highlight");
    expect(globalStyles).toContain("--radius-md: 8px");
    expect(globalStyles).toContain("--elevation-2:");
  });

  it("marks unavailable Piper controls as disabled", () => {
    expect(settingsTtsSource).toContain('disabled={preset.value === "piper"}');
    expect(settingsTtsSource).toContain('t("settings.tts.piperUnavailableTitle")');
  });
});
