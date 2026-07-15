import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { navSections, routeMeta } from "../appNavigation";
import { CardPreview } from "../components/CardPreview";
import i18n from "../i18n";
import {
  CARD_TUTORIAL_COMPLETED_KEY,
  CARD_TUTORIAL_MODULES_KEY,
  CARD_TUTORIAL_STEP_KEY,
  createCardTutorialCards,
  createCardTutorialSteps
} from "../shared/cardTutorial";
import { TutorialPage } from "./TutorialPage";

const LISTENING_LOOP_INTRO_ACTIONS = [
  "intro-listening-reading-sources",
  "intro-listening-purpose",
  "intro-listening-tools"
] as const;

afterEach(async () => {
  vi.unstubAllGlobals();
  await i18n.changeLanguage("ko");
});

describe("TutorialPage", () => {
  it("renders a full app sandbox shell with cloned sidebar navigation", () => {
    const ko = i18n.getFixedT("ko");
    const html = renderToStaticMarkup(<TutorialPage profileId="default" />);

    expect(html).toContain("tutorial-sandbox-overlay");
    expect(html).toContain("app-shell tutorial-sandbox-shell");
    expect(html).toContain("app-sidebar tutorial-sandbox-sidebar");
    expect(html).toContain("app-main tutorial-sandbox-main");
    expect(html).toContain("tab-nav");
    expect(html).toContain("data-qa=\"tutorial-debug-back\"");
    expect(html).toContain("data-qa=\"sandbox-nav-webReader\"");
    expect(html).toContain("data-qa=\"tutorial-home\"");
    expect(html).toContain(ko("tutorial.home.copy1"));
    expect(html).toContain(ko("tutorial.home.copy2"));
    expect(html).toContain(ko("tutorial.home.copy3"));
    expect(html).toContain(ko("tutorial.home.inputTitle"));
    expect(html).toContain(ko("tutorial.home.outputTitle"));
    expect(html).toContain(ko("tutorial.home.sentenceMiningTitle"));
    expect(html).toContain("tutorial-home-flow");
    expect(html).toContain("data-qa=\"tutorial-module-inputReading\"");
    expect(html).toContain("tutorial-module-card tone-input");
    expect(html).toContain("시작하기");
    expect(html).toContain("data-qa=\"tutorial-module-inputListening\"");
    expect(html).toContain("잠김");
    expect(html).toContain("tutorial-module-card tone-output locked");
    expect(html).not.toContain("data-qa=\"tutorial-intro-dialogue\"");
    expect(html).not.toContain("tutorial-spotlight-overlay");
    expect(html).not.toContain("tutorial-nav-target");
    expect(html).not.toContain("data-tutorial-target-id=\"open-web-reader\"");
    expect(html).not.toContain("tutorial-overview-guide");
    expect(html).not.toContain("tutorial-web-reader-scene");
  });

  it("starts from the first mission when a completed tutorial is reopened", () => {
    stubLocalStorage({
      [CARD_TUTORIAL_COMPLETED_KEY]: "1",
      [CARD_TUTORIAL_STEP_KEY]: "today-mission"
    });

    const html = renderToStaticMarkup(<TutorialPage profileId="default" />);

    expect(html).toContain("data-qa=\"tutorial-home\"");
    expect(html).toContain("data-qa=\"tutorial-module-inputReading\"");
    expect(html).toContain("시작하기");
    expect(html).not.toContain("data-tutorial-target-id=\"open-today\"");
    expect(html).not.toContain("data-tutorial-target-id=\"finish\"");
  });

  it("unlocks the next tutorial module after a module is completed", () => {
    stubLocalStorage({
      [CARD_TUTORIAL_MODULES_KEY]: JSON.stringify(["inputReading"]),
      [CARD_TUTORIAL_STEP_KEY]: "listening-loop"
    });

    const html = renderToStaticMarkup(<TutorialPage profileId="default" />);

    expect(html).toContain("data-qa=\"tutorial-home\"");
    expect(html).toContain("인풋-리딩 카드");
    expect(html).toContain("완료됨");
    expect(html).toContain("인풋-리스닝 카드");
    expect(html).toContain("시작하기");
    expect(html).toContain("아웃풋 카드");
    expect(html).toContain("잠김");
  });

  it("splits the first tutorial explanation before asking for web reader navigation", () => {
    const cardTypesHtml = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{ "web-reading": ["intro-language-loop"] }}
        profileId="default"
      />
    );
    const webReaderNavHtml = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{ "web-reading": ["intro-language-loop", "intro-card-types"] }}
        profileId="default"
      />
    );

    expect(cardTypesHtml).toContain("data-tutorial-target-id=\"intro-card-types\"");
    expect(cardTypesHtml).toContain("인풋 카드는 독해가 안 되거나 잘 안 들린 것을 기록하고");
    expect(cardTypesHtml).toContain("다음");
    expect(webReaderNavHtml).toContain("tutorial-nav-target");
    expect(webReaderNavHtml).toContain("data-tutorial-target-id=\"open-web-reader\"");
    expect(webReaderNavHtml).toContain("웹리더는 웹페이지를 앱 안에서 읽으면서");
    expect(webReaderNavHtml).toContain("모르는 표현을 바로 선택해 카드 후보로 바꾸는 곳");
    expect(webReaderNavHtml).toContain("이제 첫 실습으로");
    expect(webReaderNavHtml).toContain("왼쪽 인풋 섹션의 웹리더를 눌러");
  });

  it("explains the document reader purpose before asking users to open it", () => {
    const html = renderToStaticMarkup(<TutorialPage initialStepId="pdf-etymology" profileId="default" />);

    expect(html).toContain("data-tutorial-target-id=\"open-pdf-reader\"");
    expect(html).toContain("문서 리더는 PDF를 앱 안에서 읽으면서");
    expect(html).toContain("모르는 단어나 표현을 바로 카드 후보로 넘기는 곳");
    expect(html).toContain("왼쪽 네비의 인풋 섹션에서 문서 리더를 누르세요.");
  });

  it("explains the card categories before switching from reading to listening", () => {
    const readingSourcesHtml = renderToStaticMarkup(
      <TutorialPage initialStepId="listening-loop" initialTutorialTab="pdfReader" profileId="default" />
    );
    const listeningPurposeHtml = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{ "listening-loop": ["intro-listening-reading-sources"] }}
        initialStepId="listening-loop"
        initialTutorialTab="pdfReader"
        profileId="default"
      />
    );
    const listeningToolsHtml = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{
          "listening-loop": ["intro-listening-reading-sources", "intro-listening-purpose"]
        }}
        initialStepId="listening-loop"
        initialTutorialTab="pdfReader"
        profileId="default"
      />
    );
    const navHtml = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{ "listening-loop": [...LISTENING_LOOP_INTRO_ACTIONS] }}
        initialStepId="listening-loop"
        initialTutorialTab="pdfReader"
        profileId="default"
      />
    );

    expect(readingSourcesHtml).toContain("data-tutorial-target-id=\"intro-listening-reading-sources\"");
    expect(readingSourcesHtml).toContain("웹리더는 웹페이지를 앱 안에서 읽는 곳이고");
    expect(readingSourcesHtml).toContain("인풋-리딩 카드로 남길 수 있어요");
    expect(readingSourcesHtml).not.toContain("tutorial-category-bridge");
    expect(readingSourcesHtml).not.toContain("카드 담김");
    expect(listeningPurposeHtml).toContain("data-tutorial-target-id=\"intro-listening-purpose\"");
    expect(listeningPurposeHtml).toContain("다음은 확정 인풋-리스닝 카드예요");
    expect(listeningPurposeHtml).toContain("말 덩어리별 듣기");
    expect(listeningPurposeHtml).toContain("놓친 이유");
    expect(listeningPurposeHtml).toContain("빈칸 받아쓰기");
    expect(listeningToolsHtml).toContain("data-tutorial-target-id=\"intro-listening-tools\"");
    expect(listeningToolsHtml).toContain("듣기 루프와 영상 리더");
    expect(listeningToolsHtml).toContain("매일 랜덤한 짧은 영상");
    expect(listeningToolsHtml).toContain("쉐도잉");
    expect(navHtml).toContain("data-tutorial-target-id=\"open-listening-loop\"");
    expect(navHtml).toContain("이제 왼쪽 네비의 인풋 섹션에서 듣기 루프를 누르세요.");
  });

  it("shows the web reader practice only after the sandbox web reader nav is opened", () => {
    const ko = i18n.getFixedT("ko");
    const html = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{
          "web-reading": ["intro-language-loop", "intro-card-types", "open-web-reader"]
        }}
        initialStepId="web-reading"
        initialTutorialTab="webReader"
        profileId="default"
      />
    );

    expect(html).toContain("tutorial-web-reader-scene");
    expect(html).toContain("web-reader-command-rail");
    expect(html).toContain("페이지 번역");
    expect(html).toContain("선택 번역");
    expect(html).toContain("후보");
    expect(html).toContain(ko("tutorial.scene.sentenceCard"));
    expect(html).toContain("tutorial-web-reader-selection-guide");
    expect(html).toContain("웹페이지에서 모르는 표현을 드래그하세요");
    expect(html).toContain("tutorial-selection-arrow");
    expect(html).toContain("data-tutorial-target-id=\"select-running-late\"");
    expect(html).toContain("I’m");
    expect(html).toContain("running a little late");
    expect(html).toContain("tutorial-hotspot active tutorial-spotlight-target");
    expect(html).not.toContain("tutorial-drag-target");
    expect(html).not.toContain("web-reader-selection-popover");
    expect(html).not.toContain("tutorial-inline-preview");
  });

  it("keeps click as the tutorial fallback while teaching the web reader drag flow", () => {
    const source = readFileSync(join(process.cwd(), "src", "pages", "TutorialPage.tsx"), "utf8");
    const actionTextSource = source.slice(
      source.indexOf("function ActionText"),
      source.indexOf("function ActionPanelButton")
    );

    expect(source).not.toContain("function DragActionText");
    expect(source).not.toContain("TUTORIAL_DRAG_COMPLETE_DISTANCE_PX");
    expect(source).not.toContain("window.getSelection");
    expect(source).not.toContain("readTutorialSelectionText");
    expect(source).toContain('t("tutorial.scene.dragExpression")');
    expect(source).toContain('t("tutorial.scene.dragCoachDescription")');
    expect(actionTextSource).toContain("onClick");
    expect(actionTextSource).toContain("onAction(action)");
  });

  it("shows the first web reader popover only after selecting the expression", () => {
    const html = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{
          "web-reading": ["intro-language-loop", "intro-card-types", "open-web-reader", "select-running-late"]
        }}
        initialStepId="web-reading"
        initialTutorialTab="webReader"
        profileId="default"
      />
    );

    expect(html).toContain("web-reader-selection-popover");
    expect(html).toContain("running a little late");
    expect(html).toContain("문장카드");
    expect(html).toContain("생성");
    expect(html).toContain("data-qa=\"tutorial-create-sentence-card-button\"");
    expect(html).toContain("data-tutorial-target-id=\"build-reading-card\"");
    expect(html).toMatch(/class="[^"]*tutorial-webview-button[^"]*tutorial-webview-target-active[^"]*" data-qa="tutorial-create-sentence-card-button"/);
    expect(html).toContain("선택 도구에서 문장카드를 누르면 I’m running a little late. 전체가 카드 미리보기에 들어갑니다.");
    expect(html).toContain("tutorial-coach-bubble");
    expect(html).not.toContain("tutorial-web-reader-drag-guide");
    expect(html).not.toContain("tutorial-web-reader-selection-guide");
    expect(html).not.toContain("tutorial-inline-preview");
  });

  it("shows the reading card result in the selection popover after card generation", () => {
    const ko = i18n.getFixedT("ko");
    const html = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{
          "web-reading": [
            "intro-language-loop",
            "intro-card-types",
            "open-web-reader",
            "select-running-late",
            "build-reading-card"
          ]
        }}
        initialStepId="web-reading"
        initialTutorialTab="webReader"
        profileId="default"
      />
    );

    expect(html).toContain("tutorial-result-popover");
    expect(html).toContain("생성 결과");
    expect(html).toContain(ko("tutorial.scene.reviewSentenceCard"));
    expect(html).toContain("running a little late");
    expect(html).toContain("run late vs be late");
    expect(html).toContain("저장");
    expect(html).toContain("다시 선택");
    expect(html).not.toContain("tutorial-inline-preview");
  });

  it("renders feature-shaped practice scenes after their sandbox nav actions", () => {
    const pdfHtml = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{ "pdf-etymology": ["open-pdf-reader"] }}
        initialStepId="pdf-etymology"
        initialTutorialTab="pdfReader"
        profileId="default"
      />
    );
    const listeningHtml = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{ "listening-loop": [...LISTENING_LOOP_INTRO_ACTIONS, "open-listening-loop"] }}
        initialStepId="listening-loop"
        initialTutorialTab="listeningLoop"
        profileId="default"
      />
    );
    const videoHtml = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{ "video-reader": ["open-video-reader"] }}
        initialStepId="video-reader"
        initialTutorialTab="videoReader"
        profileId="default"
      />
    );
    const lifeHtml = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{ "life-output": ["open-life-mining"] }}
        initialStepId="life-output"
        initialTutorialTab="life"
        profileId="default"
      />
    );

    expect(pdfHtml).toContain("pdf-reader-grid");
    expect(pdfHtml).toContain("pdf-live-card-panel");
    expect(pdfHtml).toContain("pdf-translation-pane");
    expect(pdfHtml).not.toContain("tutorial-pdf-action-strip");
    expect(listeningHtml).toContain("listening-loop-page");
    expect(listeningHtml).toContain("listening-subtitle-card");
    expect(listeningHtml).toContain("tutorial-listening-video-player");
    expect(listeningHtml).toContain("./samples/listening/tutorial-room-check-scene.png");
    expect(listeningHtml).not.toContain(".mp4");
    expect(listeningHtml).toContain("형광펜");
    expect(listeningHtml).toContain("문장 저장");
    expect(listeningHtml).not.toContain("리스닝 카드 후보");
    expect(videoHtml).toContain("video-reader-page");
    expect(videoHtml).toContain("video-reader-player-shell");
    expect(videoHtml).toContain("튜토리얼 영상 리더 샘플 영상");
    expect(videoHtml).not.toContain(".mp4");
    expect(videoHtml).toContain("./samples/listening/tutorial-room-check-scene.png");
    expect(videoHtml).not.toContain("tutorial-coach-bubble");
    expect(lifeHtml).toContain("life-layout");
    expect(lifeHtml).toContain("life-candidate-panel");
  });

  it("explains how captured chat becomes an output card in life mining", () => {
    const html = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{ "life-output": ["open-life-mining", "select-life-reply"] }}
        initialStepId="life-output"
        initialTutorialTab="life"
        profileId="default"
      />
    );

    expect(html).toContain("tutorial-coach-bubble");
    const coachIndex = html.indexOf("data-tutorial-coach-for=\"build-output-card\"");
    const coachTargetIndex = html.indexOf("data-tutorial-target-id=\"build-output-card\"", coachIndex);
    expect(coachIndex).toBeGreaterThan(-1);
    expect(coachTargetIndex).toBeGreaterThan(coachIndex);
    expect(html).toContain("아까 웹리더 안의 LLM 대화와 Discord 예시에서 내가 입력한 말이 후보로 모였어요.");
    expect(html).toContain("여기서 자주 쓰는 말을 골라 영어 아웃풋 카드로 만들 수 있습니다.");
    expect(html).not.toContain(">내 답변 선택됨<");
  });

  it("keeps the listening loop tutorial focused on partial highlights without a fake save button", () => {
    const ko = i18n.getFixedT("ko");
    const source = readFileSync(join(process.cwd(), "src", "pages", "TutorialPage.tsx"), "utf8");
    const listeningTargetSource = source.slice(
      source.indexOf("function ListeningPhraseTarget"),
      source.indexOf("function ActionPanelButton")
    );
    const openHtml = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{ "listening-loop": [...LISTENING_LOOP_INTRO_ACTIONS, "open-listening-loop"] }}
        initialStepId="listening-loop"
        initialTutorialTab="listeningLoop"
        profileId="default"
      />
    );
    const selectedHtml = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{
          "listening-loop": [...LISTENING_LOOP_INTRO_ACTIONS, "open-listening-loop", "select-listening-segment"]
        }}
        initialStepId="listening-loop"
        initialTutorialTab="listeningLoop"
        profileId="default"
      />
    );
    const markedHtml = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{
          "listening-loop": [
            ...LISTENING_LOOP_INTRO_ACTIONS,
            "open-listening-loop",
            "select-listening-segment",
            "mark-sound-points"
          ]
        }}
        initialStepId="listening-loop"
        initialTutorialTab="listeningLoop"
        profileId="default"
      />
    );
    const previewHtml = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{
          "listening-loop": [
            ...LISTENING_LOOP_INTRO_ACTIONS,
            "open-listening-loop",
            "select-listening-segment",
            "mark-sound-points",
            "build-listening-card"
          ]
        }}
        initialStepId="listening-loop"
        initialTutorialTab="listeningLoop"
        profileId="default"
      />
    );

    expect(openHtml).toContain("data-qa=\"tutorial-listening-subtitle-source\"");
    expect(openHtml).toContain("tutorial-listening-video-player");
    expect(openHtml).toContain(ko("tutorial.listening.sampleVideoLabel"));
    expect(openHtml).toContain("./samples/listening/tutorial-room-check-scene.png");
    expect(openHtml).not.toContain(".mp4");
    expect(openHtml).not.toContain("<video");
    expect(openHtml).toContain("data-tutorial-target-id=\"select-listening-segment\"");
    expect(openHtml).toContain("여기서부터는 인풋-리스닝 카드입니다");
    expect(openHtml).toContain(ko("tutorial.listening.saveInstructionBeforeR"));
    expect(openHtml).toContain(ko("tutorial.listening.saveInstructionBetweenKeys"));
    expect(openHtml).toContain(ko("tutorial.listening.highlightShortcut"));
    expect(openHtml).toContain(ko("tutorial.listening.saveShortcut"));
    expect(openHtml).toContain("<kbd>F</kbd>");
    expect(openHtml).toContain("<kbd>R</kbd>");
    expect(listeningTargetSource).toContain(
      "onClick={(event) => {\n        event.stopPropagation();\n        completeSelection();"
    );
    expect(openHtml).not.toContain(">I am going to check the room, then I will come back.</button>");
    expect(openHtml).not.toContain("tutorial-virtual-save");
    expect(openHtml).not.toContain("리스닝 카드 후보");
    expect(selectedHtml).toContain("tutorial-listening-selected-phrase");
    expect(selectedHtml).not.toContain("tutorial-listening-selected-phrase highlight-yellow");
    expect(markedHtml).toContain("tutorial-listening-selected-phrase highlight-yellow");
    expect(markedHtml).not.toContain("tutorial-sound-token reduced");
    expect(markedHtml).not.toContain("약발음");
    expect(markedHtml).not.toContain("tutorial-virtual-save");
    expect(previewHtml).toContain("tutorial-listening-result-popover");
    expect(previewHtml).toContain(ko("tutorial.listening.previewTitle"));
    expect(previewHtml).toContain(ko("tutorial.listening.previewDescription"));
    expect(previewHtml).toContain("data-tutorial-target-id=\"continue-after-listening-card\"");
    expect(previewHtml).not.toContain("리스닝 카드 후보");
  });

  it("shows a video reader result popover after creating the card", () => {
    const ko = i18n.getFixedT("ko");
    const firstTargetHtml = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{ "video-reader": ["open-video-reader"] }}
        initialStepId="video-reader"
        initialTutorialTab="videoReader"
        profileId="default"
      />
    );
    const secondTargetHtml = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{ "video-reader": ["open-video-reader", "select-video-was-going-to"] }}
        initialStepId="video-reader"
        initialTutorialTab="videoReader"
        profileId="default"
      />
    );
    const thirdTargetHtml = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{
          "video-reader": ["open-video-reader", "select-video-was-going-to", "select-video-shortcut"]
        }}
        initialStepId="video-reader"
        initialTutorialTab="videoReader"
        profileId="default"
      />
    );
    const selectedHtml = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{
          "video-reader": [
            "open-video-reader",
            "select-video-was-going-to",
            "select-video-shortcut",
            "select-video-running"
          ]
        }}
        initialStepId="video-reader"
        initialTutorialTab="videoReader"
        profileId="default"
      />
    );
    const previewHtml = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{
          "video-reader": [
            "open-video-reader",
            "select-video-was-going-to",
            "select-video-shortcut",
            "select-video-running",
            "build-video-card"
          ]
        }}
        initialStepId="video-reader"
        initialTutorialTab="videoReader"
        profileId="default"
      />
    );

    expect(firstTargetHtml).toContain("data-tutorial-target-id=\"select-video-was-going-to\"");
    expect(firstTargetHtml).toContain("was going to");
    expect(firstTargetHtml).toContain("shortcut");
    expect(firstTargetHtml).toContain("had already started running");
    expect(firstTargetHtml).not.toContain("video-reader-key-confirm-popover tutorial-video-confirm");
    expect(secondTargetHtml).toContain("data-tutorial-target-id=\"select-video-shortcut\"");
    expect(secondTargetHtml).not.toContain("video-reader-key-confirm-popover tutorial-video-confirm");
    expect(thirdTargetHtml).toContain("data-tutorial-target-id=\"select-video-running\"");
    expect(thirdTargetHtml).not.toContain("video-reader-key-confirm-popover tutorial-video-confirm");
    expect(selectedHtml).toContain("video-reader-key-confirm-popover tutorial-video-confirm");
    expect(selectedHtml).toContain("data-tutorial-coach-for=\"build-video-card\"");
    expect(selectedHtml).toContain("<kbd>R</kbd>");
    expect(selectedHtml).toContain(ko("tutorial.video.confirmTitle"));
    expect(selectedHtml).toContain(ko("tutorial.video.confirmDescriptionBeforeKey"));
    expect(selectedHtml).toContain(ko("tutorial.video.saveSegment"));
    expect(selectedHtml).toContain(ko("tutorial.video.createSegmentCard"));
    expect(previewHtml).not.toContain("video-reader-key-confirm-popover tutorial-video-confirm");
    expect(previewHtml).not.toContain(ko("tutorial.video.confirmTitle"));
    expect(previewHtml).not.toContain("tutorial-virtual-save");
    expect(previewHtml).not.toContain("가상 저장");
    expect(previewHtml).toContain("tutorial-video-result-popover");
    expect(previewHtml).toContain(ko("tutorial.video.previewTitle"));
    expect(previewHtml).toContain("data-tutorial-target-id=\"continue-after-video-card\"");
    expect(previewHtml).toContain(ko("tutorial.common.confirmAndContinue"));
    expect(previewHtml).toContain("앞면");
    expect(previewHtml).toContain("기기 TTS 미리듣기");
  });

  it("extends the tutorial into capture, life mining, cards, review, and today missions", () => {
    const stepIds = createCardTutorialSteps("default").map((step) => step.id);
    const tailStart = stepIds.indexOf("life-capture");

    expect(tailStart).toBeGreaterThan(0);
    expect(stepIds.slice(tailStart)).toEqual([
      "life-capture",
      "life-output",
      "cards-overview",
      "review-intro",
      "today-mission"
    ]);
  });

  it("introduces output cards before opening the life capture practice", () => {
    const outputIntroHtml = renderToStaticMarkup(
      <TutorialPage initialStepId="life-capture" initialTutorialTab="pdfHub" profileId="default" />
    );
    const purposeHtml = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{ "life-capture": ["intro-output-transition"] }}
        initialStepId="life-capture"
        initialTutorialTab="pdfHub"
        profileId="default"
      />
    );
    const sourceHtml = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{
          "life-capture": ["intro-output-transition", "intro-life-mining-purpose"]
        }}
        initialStepId="life-capture"
        initialTutorialTab="pdfHub"
        profileId="default"
      />
    );
    const navHtml = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{
          "life-capture": [
            "intro-output-transition",
            "intro-life-mining-purpose",
            "intro-life-mining-sources"
          ]
        }}
        initialStepId="life-capture"
        initialTutorialTab="pdfHub"
        profileId="default"
      />
    );

    expect(outputIntroHtml).toContain("이제부터는 아웃풋 카드로 넘어갑니다.");
    expect(outputIntroHtml).toContain("내가 모국어로 자주 쓰는 말을 학습 언어로 어떻게 말하는지");
    expect(outputIntroHtml).not.toContain("data-tutorial-target-id=\"open-life-capture-source\"");
    expect(purposeHtml).toContain("내가 평소에 무슨 말을 자주 했더라?");
    expect(purposeHtml).toContain("라이프 마이닝 후보로 모아둘 수 있습니다.");
    expect(sourceHtml).toContain("웹버전 ChatGPT나 Discord에서 입력한 표현");
    expect(sourceHtml).toContain("아웃풋 카드로 만들면 됩니다.");
    expect(navHtml).toContain("data-tutorial-target-id=\"open-life-capture-source\"");
    expect(navHtml).toContain("왼쪽 네비의 인풋 섹션에서 웹리더를 눌러");
  });

  it("simulates life capture from chat input before the life mining card step", () => {
    const lifeCaptureIntroActions = [
      "intro-output-transition",
      "intro-life-mining-purpose",
      "intro-life-mining-sources"
    ];
    const openHtml = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{ "life-capture": [...lifeCaptureIntroActions, "open-life-capture-source"] }}
        initialStepId="life-capture"
        initialTutorialTab="webReader"
        profileId="default"
      />
    );
    const capturedHtml = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{
          "life-capture": [...lifeCaptureIntroActions, "open-life-capture-source", "send-life-capture-message"]
        }}
        initialStepId="life-capture"
        initialTutorialTab="webReader"
        profileId="default"
      />
    );
    const discordCapturedHtml = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{
          "life-capture": [
            ...lifeCaptureIntroActions,
            "open-life-capture-source",
            "send-life-capture-message",
            "send-discord-capture-message"
          ]
        }}
        initialStepId="life-capture"
        initialTutorialTab="webReader"
        profileId="default"
      />
    );

    expect(openHtml).toContain("tutorial-life-capture-scene");
    expect(openHtml).toContain("tutorial-chatgpt-app");
    expect(openHtml).toContain("ChatGPT");
    expect(openHtml).toContain("Strategy Guide 답변 연습");
    expect(openHtml).toContain("Discord 대화 예시");
    expect(openHtml).toContain("tutorial-discord-channel-list");
    expect(openHtml).toContain("tutorial-discord-chat");
    expect(openHtml).toContain("data-tutorial-target-id=\"send-life-capture-message\"");
    expect(openHtml.match(/data-tutorial-target-id="send-life-capture-message"/g)?.length).toBeGreaterThanOrEqual(2);
    expect(openHtml).toContain("tutorial-chatgpt-composer");
    expect(openHtml).toContain("tutorial-chatgpt-send-button");
    expect(openHtml).toContain("tutorial-discord-window");
    expect(openHtml).toContain("# boss-run");
    expect(openHtml).toContain("tutorial-coach-mascot");
    expect(openHtml).toContain("./tutorial/mole-guide-b-transparent.png");
    expect(openHtml).toContain("Enter");
    expect(openHtml).toContain("자주 하는 말도 막상 카드로 만들려고 하면");
    expect(capturedHtml).toContain("data-tutorial-target-id=\"send-discord-capture-message\"");
    expect(capturedHtml).toContain("tutorial-discord-composer");
    expect(capturedHtml).toContain("라이프 마이닝 후보");
    expect(capturedHtml).toContain("금방 갈게. 먼저 시작하지 말고 조금만 기다려줘.");
    expect(discordCapturedHtml).toContain("나 · Discord · 한국어 입력");
    expect(discordCapturedHtml).toContain("data-tutorial-target-id=\"confirm-life-capture\"");
  });

  it("renders cards, review, and today as real sandbox navigation targets", () => {
    const cardsHtml = renderToStaticMarkup(
      <TutorialPage initialStepId="cards-overview" initialTutorialTab="life" profileId="default" />
    );
    const reviewHtml = renderToStaticMarkup(
      <TutorialPage initialStepId="review-intro" initialTutorialTab="cards" profileId="default" />
    );
    const todayHtml = renderToStaticMarkup(
      <TutorialPage initialStepId="today-mission" initialTutorialTab="review" profileId="default" />
    );

    expect(cardsHtml).toContain("data-qa=\"sandbox-nav-cards\"");
    expect(cardsHtml).toContain("data-tutorial-target-id=\"open-cards\"");
    expect(reviewHtml).toContain("data-qa=\"sandbox-nav-review\"");
    expect(reviewHtml).toContain("data-tutorial-target-id=\"open-review\"");
    expect(todayHtml).toContain("data-qa=\"sandbox-nav-pdfHub\"");
    expect(todayHtml).toContain("data-tutorial-target-id=\"open-today\"");
  });

  it("renders the review and today mission practice scenes after their nav actions", () => {
    const reviewHtml = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{ "review-intro": ["open-review"] }}
        initialStepId="review-intro"
        initialTutorialTab="review"
        profileId="default"
      />
    );
    const todayHtml = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{ "today-mission": ["open-today"] }}
        initialStepId="today-mission"
        initialTutorialTab="pdfHub"
        profileId="default"
      />
    );

    expect(reviewHtml).toContain("tutorial-review-intro-scene");
    expect(reviewHtml).toContain("인풋-리딩덱");
    expect(reviewHtml).toContain("data-tutorial-target-id=\"start-review-session\"");
    expect(todayHtml).toContain("tutorial-today-mission-scene");
    expect(todayHtml).toContain("오늘의 미션");
    expect(todayHtml).toContain("다이아");
    expect(todayHtml).toContain("data-tutorial-target-id=\"inspect-daily-missions\"");
  });

  it("opens the tutorial review card in a modal like the real review session", () => {
    const html = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{ "review-intro": ["open-review", "start-review-session"] }}
        initialStepId="review-intro"
        initialTutorialTab="review"
        profileId="default"
      />
    );

    expect(html).toContain("tutorial-review-modal-layer");
    expect(html).toContain("role=\"dialog\"");
    expect(html).toContain("aria-label=\"튜토리얼 복습 세션\"");
    expect(html).toContain("tutorial-review-card-frame");
    expect(html).toContain("data-tutorial-target-id=\"show-review-back\"");
    expect(html).toContain("답 보기");
    expect(html).not.toContain("정답 확인");
  });

  it("shows the real review rating buttons after revealing the answer", () => {
    const html = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{ "review-intro": ["open-review", "start-review-session", "show-review-back"] }}
        initialStepId="review-intro"
        initialTutorialTab="review"
        profileId="default"
      />
    );

    expect(html).toContain("review-actions");
    expect(html).toContain("data-tutorial-target-id=\"rate-review-card\"");
    expect(html).toContain("답을 확인한 뒤 기억 정도를 고르면 다음 복습 간격이 달라집니다");
    expect(html).toContain("다시");
    expect(html).toContain("어려움");
    expect(html).toContain("좋음");
    expect(html).toContain("쉬움");
  });

  it("targets life mining under the output section without sidebar scroll instructions", () => {
    const html = renderToStaticMarkup(
      <TutorialPage
        initialStepId="life-output"
        initialTutorialTab="videoReader"
        profileId="default"
      />
    );

    expect(html).toContain("data-qa=\"sandbox-nav-life\"");
    expect(html).toContain("data-tutorial-target-id=\"open-life-mining\"");
    expect(html).toContain("왼쪽 네비의 아웃풋 섹션에서 라이프 마이닝을 누르세요.");
    expect(html).not.toContain("data-qa=\"tutorial-sidebar-scroll-hint\"");
    expect(html).not.toContain("마우스 휠로 아래로 스크롤");
  });

  it("keeps the PDF tutorial on the real selection popover and Sentence Card panel flow", () => {
    const ko = i18n.getFixedT("ko");
    const openHtml = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{ "pdf-etymology": ["open-pdf-reader"] }}
        initialStepId="pdf-etymology"
        initialTutorialTab="pdfReader"
        profileId="default"
      />
    );
    const selectedHtml = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{ "pdf-etymology": ["open-pdf-reader", "select-inanimate"] }}
        initialStepId="pdf-etymology"
        initialTutorialTab="pdfReader"
        profileId="default"
      />
    );
    const previewHtml = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{
          "pdf-etymology": ["open-pdf-reader", "select-inanimate", "build-etymology-card"]
        }}
        initialStepId="pdf-etymology"
        initialTutorialTab="pdfReader"
        profileId="default"
      />
    );

    expect(openHtml).toContain("tutorial-coach-bubble");
    expect(openHtml).toContain("PDF를 읽다가 모르는 단어를 고르면 됩니다.");
    expect(openHtml).toContain("AI가 문맥을 보고 뜻, 구조, 어원 같은 필요한 설명을 골라 카드에 붙입니다.");
    expect(openHtml).not.toContain(">문서 리더 열림<");
    expect(selectedHtml).toContain("selection-popover tutorial-pdf-selection-popover");
    expect(selectedHtml).toContain("selection-popover-actions");
    expect(selectedHtml).toContain("pdf-live-card-panel");
    expect(selectedHtml).toContain(ko("tutorial.document.selectionShortcut"));
    expect(selectedHtml).toContain("선택한 단어 옆에 뜬 팝오버에서 문장카드를 누르세요.");
    expect(previewHtml).toContain("pdf-live-card-panel");
    expect(previewHtml).toContain(ko("tutorial.document.statusGenerated"));
    expect(previewHtml).toContain("tutorial-pdf-result-popover");
    expect(previewHtml).toContain(ko("tutorial.document.previewTitle"));
    expect(previewHtml).toContain(ko("tutorial.document.addCard"));
  });

  it("renders the final cards screen inside the sandbox after opening cards", () => {
    const ko = i18n.getFixedT("ko");
    const html = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{ "cards-overview": ["open-cards"] }}
        initialStepId="cards-overview"
        initialTutorialTab="cards"
        profileId="default"
      />
    );

    expect(html).toContain("tutorial-cards-overview-scene");
    expect(html).toContain("카드 5장");
    expect(html).toContain("카드 상세");
    expect(html).toContain("왼쪽 목록에서 카드 하나를 선택하세요");
    expect(html).toContain("I’m running a little late.");
    expect(html).toContain(ko("tutorial.mock.startGuideStructure"));
    expect(html).toContain("data-tutorial-target-id=\"inspect-first-card\"");
    expect(html).toContain("왼쪽 카드 목록에서 방금 만든 인풋-리딩 카드를 눌러보세요.");
    expect(html).toContain("tutorial-spotlight-overlay");
    expect(html).not.toContain("data-tutorial-target-id=\"confirm-cards-overview\"");

    const selectedHtml = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{ "cards-overview": ["open-cards", "inspect-first-card"] }}
        initialStepId="cards-overview"
        initialTutorialTab="cards"
        profileId="default"
      />
    );

    expect(selectedHtml).toContain("선택됨");
    expect(selectedHtml).toContain("답 보기");
    expect(selectedHtml).toContain("data-tutorial-target-id=\"confirm-cards-overview\"");
    expect(selectedHtml).toContain("복습으로 이동");
  });

  it("renders the tutorial controls, headings, and counts in Korean and English", async () => {
    const koreanHome = renderToStaticMarkup(<TutorialPage profileId="default" />);
    expect(koreanHome).toContain(i18n.getFixedT("ko")("tutorial.home.title"));
    expect(koreanHome.match(/<h1(?:\s|>)/g)).toHaveLength(1);
    expect(koreanHome).toContain('aria-current="page"');

    await i18n.changeLanguage("en");
    const english = i18n.getFixedT("en");
    const englishHome = renderToStaticMarkup(<TutorialPage profileId="default" />);
    const englishPdf = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{ "pdf-etymology": ["open-pdf-reader", "select-inanimate"] }}
        initialStepId="pdf-etymology"
        initialTutorialTab="pdfReader"
        profileId="default"
      />
    );
    const englishListening = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{ "listening-loop": [...LISTENING_LOOP_INTRO_ACTIONS, "open-listening-loop"] }}
        initialStepId="listening-loop"
        initialTutorialTab="listeningLoop"
        profileId="default"
      />
    );
    const englishCapture = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{
          "life-capture": [
            "intro-output-transition",
            "intro-life-mining-purpose",
            "intro-life-mining-sources",
            "open-life-capture-source",
            "send-life-capture-message"
          ]
        }}
        initialStepId="life-capture"
        initialTutorialTab="webReader"
        profileId="default"
      />
    );
    const englishLifeMining = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{ "life-output": ["open-life-mining"] }}
        initialStepId="life-output"
        initialTutorialTab="life"
        profileId="default"
      />
    );
    const englishReview = renderToStaticMarkup(
      <TutorialPage
        initialActionState={{ "review-intro": ["open-review", "start-review-session"] }}
        initialStepId="review-intro"
        initialTutorialTab="review"
        profileId="default"
      />
    );

    expect(englishHome).toContain(english("tutorial.home.title"));
    expect(englishHome).toContain(english("tutorial.home.stepNumber", { number: 1 }));
    expect(englishPdf).toContain(english("tutorial.document.translationTitle"));
    expect(englishPdf).toContain(english("tutorial.document.selectionShortcut"));
    expect(englishListening).toContain(english("tutorial.listening.videoControls"));
    expect(englishListening).toContain(english("tutorial.common.position", { current: 1, total: 3 }));
    expect(englishListening).toContain(english("tutorial.common.deviceTtsNotice"));
    expect(englishListening).toContain('aria-busy="false"');
    expect(englishCapture).toContain(english("tutorial.lifeCapture.candidatesTitle"));
    expect(englishCapture).toContain("금방 갈게. 먼저 시작하지 말고 조금만 기다려줘.");
    expect(englishLifeMining).toContain(english("tutorial.lifeMining.candidateCount", { count: 3 }));
    expect(englishReview).toContain('role="dialog"');
    expect(englishReview).toContain(english("tutorial.mock.reviewSessionLabel"));
    [englishHome, englishPdf, englishListening, englishCapture, englishLifeMining, englishReview].forEach(
      (html) => expect(html.match(/<h1(?:\s|>)/g)).toHaveLength(1)
    );
    expect(englishPdf).toContain('aria-live="polite"');
    expect(englishListening).not.toContain("영상 조작");
    expect(englishCapture).not.toContain("라이프 마이닝 후보로 수집됨");
  });

  it("keeps tutorial interface copy in catalogs and uses the shared accessible dialog", () => {
    const source = readFileSync(join(process.cwd(), "src", "pages", "TutorialPage.tsx"), "utf8");
    const approvedPedagogicalSamples = [
      "방을 확인하고 다시 올게.",
      "가이드는 지름길을 설명하려던 참이었는데, 플레이어는 이미 뛰기 시작했다.",
      "금방 갈게. 먼저 시작하지 말고 조금만 기다려줘.",
      "지금 보스전 들어갈까?",
      "나도 준비됐어. 너만 오면 돼."
    ];
    const unapprovedKoreanInterfaceLines = source
      .split("\n")
      .filter((line) => /[가-힣]/.test(line))
      .filter((line) => !approvedPedagogicalSamples.some((sample) => line.includes(sample)));

    expect(source).toContain('import { Dialog } from "../components/Dialog"');
    expect(source).toContain("<Dialog");
    expect(source).not.toContain("window.confirm(");
    expect(source).not.toMatch(/aria-(?:label|description)="[^"]*[가-힣]/);
    expect(unapprovedKoreanInterfaceLines).toEqual([]);
    expect(source).toContain('t("tutorial.document.translationTitle")');
    expect(source).toContain('t("tutorial.listening.videoControls")');
    expect(source).toContain('t("tutorial.lifeCapture.candidatesTitle")');
    expect(source).toContain('t("tutorial.lifeMining.candidateCount"');
    expect(source).toContain('t("tutorial.common.ttsError")');
    expect(source).toContain('role="alert"');
  });

  it("does not wire the tutorial to real persistence or media APIs", () => {
    const source = readFileSync(join(process.cwd(), "src", "pages", "TutorialPage.tsx"), "utf8");

    expect(source).not.toContain("api.cards.save");
    expect(source).not.toContain("api.lifeLogs.save");
    expect(source).not.toContain("api.missions");
    expect(source).not.toContain("onCardsChanged");
    expect(source).not.toContain("createListeningCardMediaClip");
    expect(source).not.toContain("writeFile");
    expect(source).toContain('t("tutorial.document.addCard")');
  });

  it("uses a spotlight overlay for the current tutorial target", () => {
    const source = readFileSync(join(process.cwd(), "src", "pages", "TutorialPage.tsx"), "utf8");
    const scenarioSource = readFileSync(join(process.cwd(), "src", "shared", "cardTutorial.ts"), "utf8");
    const tutorialStyles = readFileSync(join(process.cwd(), "src", "styles", "tutorial.css"), "utf8");

    expect(source).toContain("function TutorialSpotlightOverlay");
    expect(source).toContain("function TutorialFloatingGuide");
    expect(source).toContain("function TutorialIntroDialogue");
    expect(source).toContain("isIntroDialogueAction");
    expect(source).toContain('t("tutorial.shell.firstMissionGuide")');
    expect(source).toContain("getTutorialGuideText");
    expect(scenarioSource).toContain("intro-language-loop");
    expect(scenarioSource).toContain("intro-card-types");
    expect(scenarioSource).toContain("나중에 공부하려고 노트에 적어둬도");
    expect(scenarioSource).toContain("인풋 카드는 독해가 안 되거나 잘 안 들린 것을 기록");
    expect(source).toContain("function TutorialHome");
    expect(source).toContain("CARD_TUTORIAL_MODULES");
    expect(source).toContain("getBoundingClientRect");
    expect(source).toContain("[data-tutorial-target-id=");
    expect(source).toContain("data-tutorial-coach-for");
    expect(source).toContain("includeInSpotlight ? action.id : undefined");
    expect(source).not.toContain("[data-tutorial-coach-for=");
    expect(source).toContain("tutorial-spotlight-hole");
    expect(source).toContain("window.addEventListener(\"resize\"");
    expect(source).toContain("window.addEventListener(\"scroll\", scheduleUpdate, true)");
    expect(tutorialStyles).toContain(".tutorial-spotlight-overlay");
    expect(tutorialStyles).toContain(".tutorial-spotlight-hole");
    expect(tutorialStyles).toContain(".tutorial-floating-guide");
    expect(tutorialStyles).toContain("box-shadow: 0 0 0 9999px");
    expect(tutorialStyles).toContain("pointer-events: none;");
    expect(tutorialStyles).toContain(".tutorial-spotlight-target");
    expect(tutorialStyles).toContain(".tutorial-coach-bubble.tutorial-spotlight-target");
    expect(tutorialStyles).toContain(".tutorial-module-card.complete");
    expect(tutorialStyles).toContain("border-color: #f59e0b");
    expect(tutorialStyles).toContain("background: #fef3c7");
    expect(tutorialStyles).toContain(".tutorial-intro-dialogue");
    expect(tutorialStyles).toContain(".tutorial-intro-speech");
  });

  it("keeps the PDF selection popover actions in a scoped grid layout", () => {
    const source = readFileSync(join(process.cwd(), "src", "styles.css"), "utf8");
    const tutorialStyles = readFileSync(join(process.cwd(), "src", "styles", "tutorial.css"), "utf8");

    expect(source).toContain("width: min(260px, calc(100vw - 24px));");
    expect(source).toContain(".selection-popover .selection-popover-actions");
    expect(source).toContain(".selection-popover .selection-card-generation-row");
    expect(tutorialStyles).toContain(".tutorial-webview-popover.compact .tutorial-coach-bubble");
    expect(tutorialStyles).toContain(".tutorial-web-article {\n  position: relative;");
    expect(tutorialStyles).toContain("user-select: none;");
    expect(tutorialStyles).toContain(".tutorial-inline-target.tutorial-hotspot.active");
    expect(tutorialStyles).toContain("background: transparent;");
    expect(tutorialStyles).toContain(".tutorial-article-static-term");
    expect(tutorialStyles).toContain(".tutorial-article-selected-term");
    expect(tutorialStyles).toContain(".tutorial-selection-coach");
    expect(tutorialStyles).toContain("z-index: 80;");
    expect(tutorialStyles).not.toContain(".tutorial-drag-target");
    expect(tutorialStyles).toContain(".tutorial-webview-button.tutorial-webview-target-active");
    expect(tutorialStyles).toContain(".tutorial-webview-popover.compact .tutorial-webview-button.tutorial-webview-target-active::after");
    expect(tutorialStyles).toContain("width: 78px;");
    expect(tutorialStyles).toContain(".tutorial-webview-popover.compact .tutorial-webview-button.tutorial-webview-target-active::before");
    expect(tutorialStyles).toContain("border-right: 9px solid #2563eb;");
    expect(tutorialStyles).toContain(".tutorial-result-popover {\n  position: fixed;");
    expect(tutorialStyles).toContain("width: min(920px, calc(100vw - 96px));");
    expect(tutorialStyles).toContain("height: min(860px, calc(100vh - 96px));");
    expect(tutorialStyles).toContain(".tutorial-pdf-selection-popover {\n  position: absolute;");
    expect(tutorialStyles).toContain("left: 330px;");
    expect(tutorialStyles).toContain("top: 138px;");
    expect(tutorialStyles).toContain(".tutorial-pdf-result-popover");
    expect(tutorialStyles).toContain(".tutorial-pdf-result-popover {\n  position: fixed;");
    expect(tutorialStyles).toContain("width: min(700px, calc(100vw - 48px));");
    expect(tutorialStyles).toContain("height: min(720px, calc(100vh - 160px));");
  });

  it("keeps tutorial result cards compatible with CardPreview", () => {
    const steps = createCardTutorialSteps("default").filter((step) => step.previewCardId);
    const cards = new Map(createCardTutorialCards("default").map((card) => [card.id, card]));

    for (const step of steps) {
      const card = cards.get(step.previewCardId!);
      expect(card).toBeTruthy();
      const html = renderToStaticMarkup(<CardPreview card={card!} defaultShowBack />);
      expect(stripTags(html)).toContain(card!.sourceSentence.slice(0, 8));
    }
  });

  it("exposes the tutorial route under the manage navigation section", () => {
    const manageSection = navSections.find((section) => section.id === "manage");
    const outputSection = navSections.find((section) => section.id === "output");

    expect(routeMeta.tutorial.label).toBe("튜토리얼");
    expect(outputSection?.items?.some((item) => item.key === "life")).toBe(true);
    expect(manageSection?.items?.some((item) => item.key === "life")).toBe(false);
    expect(manageSection?.items?.some((item) => item.key === "tutorial")).toBe(true);
  });
});

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, "");
}

function stubLocalStorage(initialValues: Record<string, string>) {
  const values = new Map(Object.entries(initialValues));
  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    }
  };
  vi.stubGlobal("localStorage", storage);
}
