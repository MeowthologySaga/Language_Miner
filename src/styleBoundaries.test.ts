import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const appEntrySource = readFileSync(join(process.cwd(), "src", "main.tsx"), "utf8");
const readPageSource = (fileName: string) =>
  readFileSync(join(process.cwd(), "src", "pages", fileName), "utf8");
const pdfHubPageSource = readPageSource("PdfHubPage.tsx");
const pdfReaderPageSource = readPageSource("PdfReaderPage.tsx");
const bookMakerPageSource = readPageSource("BilingualBookMakerPage.tsx");
const webReaderPageSource = readPageSource("WebReaderPage.tsx");
const listeningLoopPageSource = readPageSource("ListeningLoopPage.tsx");
const lifeMiningPageSource = readPageSource("LifeMiningPage.tsx");
const writingPracticePageSource = readPageSource("WritingPracticePage.tsx");
const reviewPageSource = readPageSource("ReviewPage.tsx");
const videoReaderPageSource = readPageSource("VideoReaderPage.tsx");
const playZonePageSource = readPageSource("PlayZonePage.tsx");
const playZoneRuntimePageSource = readPageSource("PlayZoneRuntimePage.tsx");
const characterChatPageSource = readPageSource("CharacterChatPage.tsx");
const globalStyles = readFileSync(join(process.cwd(), "src", "styles.css"), "utf8");
const appShellStyles = readFileSync(join(process.cwd(), "src", "styles", "appShell.css"), "utf8");
const dailyProgressStyles = readFileSync(
  join(process.cwd(), "src", "styles", "dailyProgress.css"),
  "utf8"
);
const cardSurfacesStyles = readFileSync(
  join(process.cwd(), "src", "styles", "cardSurfaces.css"),
  "utf8"
);
const documentManagementStyles = readFileSync(
  join(process.cwd(), "src", "styles", "documentManagement.css"),
  "utf8"
);
const pdfHubStyles = readFileSync(join(process.cwd(), "src", "styles", "pdfHub.css"), "utf8");
const pdfReaderShellStyles = readFileSync(
  join(process.cwd(), "src", "styles", "pdfReaderShell.css"),
  "utf8"
);
const pdfToolsStyles = readFileSync(join(process.cwd(), "src", "styles", "pdfTools.css"), "utf8");
const pdfBookMakerStyles = readFileSync(
  join(process.cwd(), "src", "styles", "pdfBookMaker.css"),
  "utf8"
);
const webReaderStyles = readFileSync(join(process.cwd(), "src", "styles", "webReader.css"), "utf8");
const listeningLoopStyles = readFileSync(
  join(process.cwd(), "src", "styles", "listeningLoop.css"),
  "utf8"
);
const lifeMiningStyles = readFileSync(
  join(process.cwd(), "src", "styles", "lifeMining.css"),
  "utf8"
);
const writingPracticeStyles = readFileSync(
  join(process.cwd(), "src", "styles", "writingPractice.css"),
  "utf8"
);
const reviewStyles = readFileSync(join(process.cwd(), "src", "styles", "review.css"), "utf8");
const videoReaderStyles = readFileSync(
  join(process.cwd(), "src", "styles", "videoReader.css"),
  "utf8"
);
const playZoneStyles = readFileSync(join(process.cwd(), "src", "styles", "playZone.css"), "utf8");
const characterChatStyles = readFileSync(
  join(process.cwd(), "src", "styles", "characterChat.css"),
  "utf8"
);
const settingsProfileStyles = readFileSync(
  join(process.cwd(), "src", "styles", "settingsProfile.css"),
  "utf8"
);

describe("style boundaries", () => {
  it("loads app shell and navigation styles from a dedicated stylesheet", () => {
    expect(appEntrySource).toContain('import "./styles/appShell.css";');

    expect(appShellStyles).toContain(".app-shell");
    expect(appShellStyles).toContain(".app-sidebar");
    expect(appShellStyles).toContain(".tab-nav");
    expect(appShellStyles).toContain(".sidebar-usage-card");
    expect(appShellStyles).toContain(".topbar");
    expect(appShellStyles).toContain(".daily-reward-effect");

    expect(globalStyles).not.toContain(".app-shell {");
    expect(globalStyles).not.toContain(".app-sidebar");
    expect(globalStyles).not.toContain(".tab-nav");
    expect(globalStyles).not.toContain(".sidebar-usage-card");
    expect(globalStyles).not.toContain(".daily-reward-effect");
  });

  it("loads daily progress and mission styles from a dedicated stylesheet", () => {
    expect(appEntrySource).toContain('import "./styles/dailyProgress.css";');

    expect(dailyProgressStyles).toContain(".study-activity-panel");
    expect(dailyProgressStyles).toContain(".daily-routine-panel");
    expect(dailyProgressStyles).toContain(".daily-routine-runner");
    expect(dailyProgressStyles).toContain(".daily-mission-panel");
    expect(dailyProgressStyles).toContain(".diamond-wallet-card");
    expect(dailyProgressStyles).toContain(".daily-bonus-card");
    expect(dailyProgressStyles).toContain("@media (max-width: 1080px)");

    expect(globalStyles).not.toContain(".study-activity-panel");
    expect(globalStyles).not.toContain(".daily-routine-panel");
    expect(globalStyles).not.toContain(".daily-routine-runner");
    expect(globalStyles).not.toContain(".daily-mission-panel");
    expect(globalStyles).not.toContain(".diamond-wallet-card");
    expect(globalStyles).not.toContain(".daily-bonus-card");
  });

  it("loads card preview and generated card surface styles from a dedicated stylesheet", () => {
    expect(appEntrySource).toContain('import "./styles/cardSurfaces.css";');

    expect(cardSurfacesStyles).toContain(".study-card");
    expect(cardSurfacesStyles).toContain(".life-expression-card");
    expect(cardSurfacesStyles).toContain(".input-vocab-master-detail");
    expect(cardSurfacesStyles).toContain(".comparison-kind-badge");
    expect(cardSurfacesStyles).toContain(".sentence-card-popover");
    expect(cardSurfacesStyles).toContain("@container (max-width: 680px)");

    expect(globalStyles).not.toContain(".study-card {");
    expect(globalStyles).not.toContain(".life-expression-card .card-front");
    expect(globalStyles).not.toContain(".input-vocab-master-detail");
    expect(globalStyles).not.toContain(".sentence-card-popover {");
  });

  it("loads document management styles from a dedicated feature stylesheet", () => {
    expect(pdfReaderPageSource).toContain('import "../styles/documentManagement.css";');

    expect(documentManagementStyles).toContain(".document-library-layout");
    expect(documentManagementStyles).toContain(".document-filter-rail");
    expect(documentManagementStyles).toContain(".export-history-panel");
    expect(documentManagementStyles).toContain(".glossary-heading");
    expect(documentManagementStyles).toContain(".empty-document-state");
    expect(documentManagementStyles).toContain("@media (max-width: 1080px)");

    expect(globalStyles).not.toContain(".document-library-layout");
    expect(globalStyles).not.toContain(".glossary-heading");
    expect(globalStyles).not.toContain(".empty-document-state");
  });

  it("loads PDF and Book Maker styles from a dedicated feature stylesheet", () => {
    expect(pdfHubPageSource).toContain('import "../styles/pdfHub.css";');
    expect(pdfReaderPageSource).toContain('import "../styles/pdfReaderShell.css";');
    expect(pdfReaderPageSource).toContain('import "../styles/pdfTools.css";');
    expect(bookMakerPageSource).toContain('import "../styles/pdfBookMaker.css";');

    expect(pdfHubStyles).toContain(".pdf-hub-page");
    expect(pdfHubStyles).toContain(".today-hub-panel");
    expect(pdfHubStyles).toContain(".maker-choice");
    expect(pdfReaderShellStyles).toContain(".reader-mode-shell");
    expect(pdfReaderShellStyles).toContain(".finished-reader-shell");
    expect(pdfReaderShellStyles).toContain(".finished-reader-viewer");
    expect(pdfReaderShellStyles).toContain(".pdf-live-card-panel");
    expect(pdfToolsStyles).toContain(".pdf-panel");
    expect(pdfToolsStyles).toContain(".pdf-job-summary");
    expect(pdfToolsStyles).toContain(".pdf-reader-grid");
    expect(pdfToolsStyles).toContain("@media (max-width: 1080px)");
    expect(pdfBookMakerStyles).toContain(".maker-wizard-page");
    expect(pdfBookMakerStyles).toContain(".maker-workspace-shell");
    expect(pdfBookMakerStyles).toContain(".pdf-panel-maker .pdf-job-summary");
    expect(pdfBookMakerStyles).toContain(".pdf-maker-simple");
    expect(pdfBookMakerStyles).toContain(".pdf-maker-dropzone");

    expect(pdfToolsStyles).not.toContain(".pdf-hub-page");
    expect(pdfToolsStyles).not.toContain(".today-hub-panel");
    expect(pdfToolsStyles).not.toContain(".reader-mode-shell");
    expect(pdfToolsStyles).not.toContain(".finished-reader-shell");
    expect(pdfToolsStyles).not.toContain(".pdf-maker-simple");
    expect(pdfToolsStyles).not.toContain(".maker-wizard-page");
    expect(globalStyles).not.toContain(".pdf-panel");
    expect(globalStyles).not.toContain(".pdf-hub-page");
    expect(globalStyles).not.toContain(".today-hub-panel");
    expect(globalStyles).not.toContain(".pdf-job-summary");
    expect(globalStyles).not.toContain(".pdf-reader-grid");
    expect(globalStyles).not.toContain(".pdf-maker-simple");
    expect(globalStyles).not.toContain(".reader-mode-shell");
    expect(globalStyles).not.toContain(".finished-reader-shell");
  });

  it("loads Web Reader styles from a dedicated feature stylesheet", () => {
    expect(webReaderPageSource).toContain('import "../styles/webReader.css";');

    expect(webReaderStyles).toContain(".web-reader-page");
    expect(webReaderStyles).toContain(".web-reader-web-surface");
    expect(webReaderStyles).toContain(".web-reader-webview");
    expect(webReaderStyles).toContain(".web-reader-hub");
    expect(webReaderStyles).toContain(".web-reader-life-chip");
    expect(webReaderStyles).toContain("@media (max-width: 1180px)");

    expect(globalStyles).not.toContain(".web-reader-page");
    expect(globalStyles).not.toContain(".web-reader-web-surface");
    expect(globalStyles).not.toContain(".web-reader-webview");
    expect(globalStyles).not.toContain(".web-reader-life-chip");
  });

  it("loads Listening Loop styles from a dedicated feature stylesheet", () => {
    expect(listeningLoopPageSource).toContain('import "../styles/listeningLoop.css";');

    expect(listeningLoopStyles).toContain(".listening-loop-page");
    expect(listeningLoopStyles).toContain(".listening-player-shell");
    expect(listeningLoopStyles).toContain(".listening-subtitle-card");
    expect(listeningLoopStyles).toContain(".listening-candidate-panel");
    expect(listeningLoopStyles).toContain(".listening-batch-modal");
    expect(listeningLoopStyles).toContain("@media (max-width: 1080px)");
    expect(listeningLoopStyles).toContain(
      ".listening-loop-home-page,\n  .listening-routine-picker-page {\n    grid-template-columns: minmax(0, 1fr);"
    );

    expect(globalStyles).not.toContain(".listening-loop-page");
    expect(globalStyles).not.toContain(".listening-player-shell");
    expect(globalStyles).not.toContain(".listening-subtitle-card");
    expect(globalStyles).not.toContain(".listening-candidate-panel");
  });

  it("loads Life Mining page styles from a dedicated feature stylesheet", () => {
    expect(lifeMiningPageSource).toContain('import "../styles/lifeMining.css";');

    expect(lifeMiningStyles).toContain(".life-layout");
    expect(lifeMiningStyles).toContain(".life-candidate-panel");
    expect(lifeMiningStyles).toContain(".life-auto-status");
    expect(lifeMiningStyles).toContain(".life-log-detail");
    expect(lifeMiningStyles).toContain(".life-cost-modal");
    expect(lifeMiningStyles).toContain(".life-manual-modal");
    expect(lifeMiningStyles).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(lifeMiningStyles).toContain("@media (max-width: 1240px)");

    expect(globalStyles).not.toContain(".life-layout");
    expect(globalStyles).not.toContain(".life-candidate-panel");
    expect(globalStyles).not.toContain(".life-auto-status");
    expect(globalStyles).not.toContain(".life-cost-modal");
    expect(globalStyles).not.toContain(".life-manual-modal");
  });

  it("loads Writing Practice styles from a dedicated feature stylesheet", () => {
    expect(writingPracticePageSource).toContain('import "../styles/writingPractice.css";');

    expect(writingPracticeStyles).toContain(".writing-practice-page");
    expect(writingPracticeStyles).toContain(".writing-prompt-card");
    expect(writingPracticeStyles).toContain(".writing-answer-form");
    expect(writingPracticeStyles).toContain(".writing-feedback-panel");
    expect(writingPracticeStyles).toContain(".writing-score-card");

    expect(globalStyles).not.toContain(".writing-practice-page");
    expect(globalStyles).not.toContain(".writing-prompt-card");
    expect(globalStyles).not.toContain(".writing-answer-form");
    expect(globalStyles).not.toContain(".writing-feedback-panel");
    expect(globalStyles).not.toContain(".writing-score-card");
  });

  it("loads Review page styles from a dedicated feature stylesheet", () => {
    expect(reviewPageSource).toContain('import "../styles/review.css";');

    expect(reviewStyles).toContain(".review-panel");
    expect(reviewStyles).toContain(".review-deck-dashboard");
    expect(reviewStyles).toContain(".review-settings-panel");
    expect(reviewStyles).toContain(".review-session-modal");
    expect(reviewStyles).toContain(".review-session-empty");
    expect(reviewStyles).toContain("@media (max-width: 1080px)");

    expect(globalStyles).not.toContain(".review-panel");
    expect(globalStyles).not.toContain(".review-deck-dashboard");
    expect(globalStyles).not.toContain(".review-settings-panel");
    expect(globalStyles).not.toContain(".review-session-modal");
    expect(globalStyles).not.toContain(".review-session-empty");
  });

  it("loads Video Reader styles from a dedicated feature stylesheet", () => {
    expect(videoReaderPageSource).toContain('import "../styles/videoReader.css";');

    expect(videoReaderStyles).toContain(".video-reader-page");
    expect(videoReaderStyles).toContain(".video-reader-player-shell");
    expect(videoReaderStyles).toContain(".video-reader-subtitle-card");
    expect(videoReaderStyles).toContain(".video-reader-timeline");
    expect(videoReaderStyles).toContain(".video-reader-time-edit");
    expect(videoReaderStyles).toContain("@media (max-width: 1080px)");

    expect(globalStyles).not.toContain(".video-reader-page");
    expect(globalStyles).not.toContain(".video-reader-player-shell");
    expect(globalStyles).not.toContain(".video-reader-subtitle-card");
    expect(globalStyles).not.toContain(".video-reader-timeline");
    expect(globalStyles).not.toContain(".video-reader-time-edit");
  });

  it("loads Play Zone styles from a dedicated feature stylesheet", () => {
    expect(playZonePageSource).toContain('import "../styles/playZone.css";');
    expect(playZoneRuntimePageSource).toContain('import "../styles/playZone.css";');

    expect(playZoneStyles).toContain(".play-zone-page");
    expect(playZoneStyles).toContain(".play-zone-library");
    expect(playZoneStyles).toContain(".play-zone-hero");
    expect(playZoneStyles).toContain(".play-zone-card");
    expect(playZoneStyles).toContain(".play-zone-detail");
    expect(playZoneStyles).toContain(".cover-image");
    expect(playZoneStyles.indexOf(".cover-image")).toBeGreaterThan(
      playZoneStyles.indexOf(".cover-local-d")
    );

    expect(globalStyles).not.toContain(".play-zone-page");
    expect(globalStyles).not.toContain(".play-zone-library");
    expect(globalStyles).not.toContain(".play-zone-hero");
    expect(globalStyles).not.toContain(".play-zone-card");
    expect(globalStyles).not.toContain(".cover-image");
  });

  it("loads Character Chat styles from a dedicated feature stylesheet", () => {
    expect(characterChatPageSource).toContain('import "../styles/characterChat.css";');

    expect(characterChatStyles).toContain(".character-chat-page");
    expect(characterChatStyles).toContain(".character-preset-panel");
    expect(characterChatStyles).toContain(".character-chat-panel");
    expect(characterChatStyles).toContain(".character-message-list");
    expect(characterChatStyles).toContain(".character-chat-composer");

    expect(globalStyles).not.toContain(".character-chat-page");
    expect(globalStyles).not.toContain(".character-preset-panel");
    expect(globalStyles).not.toContain(".character-chat-panel");
    expect(globalStyles).not.toContain(".character-message-list");
    expect(globalStyles).not.toContain(".character-chat-composer");
  });

  it("loads Settings and Profile styles from a dedicated feature stylesheet", () => {
    expect(appEntrySource).toContain('import "./styles/settingsProfile.css";');

    expect(settingsProfileStyles).toContain(".settings-grid");
    expect(settingsProfileStyles).toContain(".settings-navigation");
    expect(settingsProfileStyles).toContain(".settings-content");
    expect(settingsProfileStyles).toContain(".settings-provider-grid");
    expect(settingsProfileStyles).toContain(".settings-ai-subsection");
    expect(settingsProfileStyles).toContain(".profile-switcher");
    expect(settingsProfileStyles).toContain(".profile-account-panel");
    expect(settingsProfileStyles).toContain(".profile-manager-panel");
    expect(settingsProfileStyles).toContain(".capture-site-grid");
    expect(settingsProfileStyles).toContain(".model-preset-button");
    expect(settingsProfileStyles).toContain(".language-profile-editor");

    expect(globalStyles).not.toContain(".settings-grid");
    expect(globalStyles).not.toContain(".settings-navigation");
    expect(globalStyles).not.toContain(".profile-switcher");
    expect(globalStyles).not.toContain(".profile-account-panel");
    expect(globalStyles).not.toContain(".profile-manager-panel");
    expect(globalStyles).not.toContain(".capture-site-grid");
    expect(globalStyles).not.toContain(".model-preset-button");
    expect(globalStyles).not.toContain(".language-profile-editor");
  });
});
