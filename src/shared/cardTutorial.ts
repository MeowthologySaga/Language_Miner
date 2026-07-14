import { createDefaultSampleCards, getDefaultSampleCardIds } from "./defaultSampleCards";
import type { ProfileId, StudyCard } from "./types";

export const CARD_TUTORIAL_COMPLETED_KEY = "lem:cardTutorial:v2:completed";
export const CARD_TUTORIAL_STEP_KEY = "lem:cardTutorial:v2:step";
export const CARD_TUTORIAL_MODULES_KEY = "lem:cardTutorial:v2:modules";

export type CardTutorialModuleId = "inputReading" | "inputListening" | "output" | "review";

export type CardTutorialModule = {
  id: CardTutorialModuleId;
  title: string;
  description: string;
  goalLabel: string;
  stepIds: string[];
  lockedUntilPreviousComplete: boolean;
};

export const CARD_TUTORIAL_MODULES: CardTutorialModule[] = [
  {
    id: "inputReading",
    title: "인풋-리딩 카드",
    description: "번역·어휘·문장 구조·비슷한 표현을 순서대로 익히는 연습",
    goalLabel: "해석이 막힌 문장 기록",
    stepIds: ["web-reading", "pdf-etymology"],
    lockedUntilPreviousComplete: false
  },
  {
    id: "inputListening",
    title: "인풋-리스닝 카드",
    description: "문장을 소리 덩어리로 나누고 놓친 이유와 받아쓰기를 확인하는 연습",
    goalLabel: "안 들린 구간 기록",
    stepIds: ["listening-loop", "video-reader"],
    lockedUntilPreviousComplete: true
  },
  {
    id: "output",
    title: "아웃풋 카드",
    description: "대화 맥락에서 내가 쓸 문장·발음·변형 표현을 함께 익히는 연습",
    goalLabel: "나중에 쓸 표현 수집",
    stepIds: ["life-capture", "life-output"],
    lockedUntilPreviousComplete: true
  },
  {
    id: "review",
    title: "카드함과 복습",
    description: "만든 카드를 확인하고 자동 복습 주기와 오늘 미션까지 보는 마무리",
    goalLabel: "저장된 카드와 복습 흐름 확인",
    stepIds: ["cards-overview", "review-intro", "today-mission"],
    lockedUntilPreviousComplete: true
  }
];

export type CardTutorialTab =
  | "pdfHub"
  | "webReader"
  | "pdfReader"
  | "listeningLoop"
  | "videoReader"
  | "life"
  | "cards"
  | "review"
  | "playZone";

export type CardTutorialSceneKind =
  | "webReader"
  | "pdfReader"
  | "listeningLoop"
  | "videoReader"
  | "lifeCapture"
  | "lifeMining"
  | "cardsOverview"
  | "reviewIntro"
  | "todayMission"
  | "finish";

export type CardTutorialAction = {
  id: string;
  label: string;
  doneLabel?: string;
  targetLabel: string;
  hint: string;
  dependsOn?: string[];
  navTargetTab?: CardTutorialTab;
  revealsPreview?: boolean;
  revealsSoundPoints?: boolean;
  virtualSave?: boolean;
};

export type CardTutorialStep = {
  id: string;
  moduleId: CardTutorialModuleId;
  navLabel: string;
  title: string;
  sceneKind: CardTutorialSceneKind;
  goal: string;
  coach: string;
  appLocation: string;
  previewCardId?: string;
  actions: CardTutorialAction[];
  progressLabels: string[];
  completionText: string;
};

export type CardTutorialRuntimeState = Record<string, string[]>;

export function readCardTutorialCompleted() {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(CARD_TUTORIAL_COMPLETED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeCardTutorialCompleted() {
  try {
    localStorage.setItem(CARD_TUTORIAL_COMPLETED_KEY, "1");
  } catch {
    // Restricted previews can block localStorage. The in-memory completion state still works.
  }
}

export function readCardTutorialCompletedModuleIds(): CardTutorialModuleId[] {
  try {
    if (typeof localStorage === "undefined") {
      return [];
    }
    const rawValue = localStorage.getItem(CARD_TUTORIAL_MODULES_KEY);
    if (!rawValue) {
      return [];
    }
    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) {
      return [];
    }
    const validModuleIds = new Set(CARD_TUTORIAL_MODULES.map((module) => module.id));
    return parsedValue.filter((moduleId): moduleId is CardTutorialModuleId => validModuleIds.has(moduleId));
  } catch {
    return [];
  }
}

export function writeCardTutorialCompletedModuleIds(moduleIds: CardTutorialModuleId[]) {
  try {
    const validModuleIds = CARD_TUTORIAL_MODULES.map((module) => module.id);
    const nextModuleIds = validModuleIds.filter((moduleId) => moduleIds.includes(moduleId));
    localStorage.setItem(CARD_TUTORIAL_MODULES_KEY, JSON.stringify(nextModuleIds));
  } catch {
    // Restricted previews can block localStorage. Module completion still works in memory.
  }
}

export function resetCardTutorialProgress(stepId?: string) {
  try {
    localStorage.removeItem(CARD_TUTORIAL_COMPLETED_KEY);
    localStorage.removeItem(CARD_TUTORIAL_MODULES_KEY);
    if (stepId) {
      localStorage.setItem(CARD_TUTORIAL_STEP_KEY, stepId);
    } else {
      localStorage.removeItem(CARD_TUTORIAL_STEP_KEY);
    }
  } catch {
    // The tutorial still works in memory if localStorage is blocked.
  }
}

export function readCardTutorialStepId() {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(CARD_TUTORIAL_STEP_KEY) : null;
  } catch {
    return null;
  }
}

export function writeCardTutorialStepId(stepId: string) {
  try {
    localStorage.setItem(CARD_TUTORIAL_STEP_KEY, stepId);
  } catch {
    // The tutorial still works in memory if localStorage is blocked.
  }
}

export function createCardTutorialCards(profileId: ProfileId): StudyCard[] {
  return createDefaultSampleCards(profileId);
}

export function createCardTutorialSteps(profileId: ProfileId): CardTutorialStep[] {
  const ids = getDefaultSampleCardIds(profileId);

  return [
    {
      id: "web-reading",
      moduleId: "inputReading",
      navLabel: "웹리더",
      title: "웹리더로 인풋-리딩 카드 만들기",
      sceneKind: "webReader",
      goal: "웹리더는 웹페이지를 앱 안에서 읽으면서 모르는 표현을 바로 선택해 카드 후보로 바꾸는 곳입니다. 왼쪽 네비에서 웹리더를 열고, I’m running a little late.에서 표현을 선택해 문장카드를 만들어 보세요.",
      coach:
        "첫 연습은 인풋-리딩 카드입니다. 새 리딩 카드는 번역을 먼저 확인하고, 어휘 상세와 색상 문장 구조, 비슷한 표현 비교 순서로 학습합니다.",
      appLocation: "인풋 > 웹리더",
      previewCardId: ids.reading,
      actions: [
        {
          id: "intro-language-loop",
          label: "학습 흐름 보기",
          doneLabel: "학습 흐름 확인",
          targetLabel: "언어 학습 흐름",
          hint: "나중에 공부하려고 노트에 적어둬도, 다시 찾아보지 않으면 금방 묻히기 쉽습니다. Language Miner에서는 문장을 카드로 저장해 복습하기 좋은 형태로 남깁니다."
        },
        {
          id: "intro-card-types",
          label: "카드 종류 보기",
          doneLabel: "카드 종류 확인",
          targetLabel: "카드 3종",
          hint: "인풋 카드는 독해가 안 되거나 잘 안 들린 것을 기록하고, 아웃풋 카드는 나중에 쓰고 싶거나 자주 쓰는 표현을 모아두는 카드입니다.",
          dependsOn: ["intro-language-loop"]
        },
        {
          id: "open-web-reader",
          label: "웹리더 열기",
          doneLabel: "웹리더 열림",
          targetLabel: "웹리더",
          hint: "웹리더는 웹페이지를 앱 안에서 읽으면서 모르는 표현을 바로 선택해 카드 후보로 바꾸는 곳입니다. 이제 첫 실습으로, 왼쪽 인풋 섹션의 웹리더를 눌러 원문에서 막힌 표현을 인풋-리딩 카드로 담아봅니다.",
          dependsOn: ["intro-card-types"],
          navTargetTab: "webReader"
        },
        {
          id: "select-running-late",
          label: "running a little late 드래그",
          doneLabel: "running a little late 선택됨",
          targetLabel: "running a little late",
          hint: "웹페이지에서 쓰고 싶은 표현을 드래그해 보세요. 이번 연습에서는 I’m running a little late. 안의 running a little late를 선택합니다.",
          dependsOn: ["open-web-reader"]
        },
        {
          id: "build-reading-card",
          label: "문장카드 만들기",
          doneLabel: "리딩 카드 미리보기 생성됨",
          targetLabel: "문장카드",
          hint: "선택 도구에서 문장카드를 누르면 I’m running a little late. 전체가 카드 미리보기에 들어갑니다.",
          dependsOn: ["select-running-late"],
          revealsPreview: true
        },
        {
          id: "save-reading-card",
          label: "카드 담기",
          doneLabel: "카드 담김",
          targetLabel: "카드 담기",
          hint: "미리보기를 확인했으면 카드 담기를 누르세요. 다음에는 PDF 문장으로 카드를 만들어봅니다.",
          dependsOn: ["build-reading-card"],
          virtualSave: true
        }
      ],
      progressLabels: ["네비 클릭", "표현 드래그", "카드 만들기", "카드 담기"],
      completionText: "웹리더에서 I’m running a little late.를 읽기 카드로 만들고 저장하는 흐름을 확인했습니다."
    },
    {
      id: "pdf-etymology",
      moduleId: "inputReading",
      navLabel: "문서 리더",
      title: "PDF 리더로 인풋-리딩 카드 만들기",
      sceneKind: "pdfReader",
      goal: "문서 리더는 PDF처럼 긴 문서를 앱 안에서 읽고, 모르는 단어나 표현을 선택해 카드 후보로 넘기는 곳입니다. 왼쪽 네비에서 문서 리더를 열고, PDF 문장에서 모르는 단어를 선택해 인풋-리딩 카드를 만들어 보세요.",
      coach:
        "문서 리더에서 만든 카드도 같은 확정 리딩 템플릿을 사용합니다. 번역 다음에 선택 어휘를 보고, 문장 구조와 비슷한 표현 비교로 이어집니다.",
      appLocation: "인풋 > 문서 리더",
      previewCardId: ids.reading,
      actions: [
        {
          id: "open-pdf-reader",
          label: "문서 리더 열기",
          doneLabel: "문서 리더 열림",
          targetLabel: "문서 리더",
          hint: "문서 리더는 PDF를 앱 안에서 읽으면서 모르는 단어나 표현을 바로 카드 후보로 넘기는 곳입니다. 왼쪽 네비의 인풋 섹션에서 문서 리더를 누르세요.",
          navTargetTab: "pdfReader"
        },
        {
          id: "select-inanimate",
          label: "inanimate 선택",
          doneLabel: "inanimate 선택됨",
          targetLabel: "inanimate",
          hint: "PDF를 읽다가 모르는 단어를 고르면 됩니다. 이번에는 inanimate를 선택해 보세요. AI가 문맥을 보고 뜻, 구조, 어원 같은 필요한 설명을 골라 카드에 붙입니다.",
          dependsOn: ["open-pdf-reader"]
        },
        {
          id: "build-etymology-card",
          label: "카드 만들기",
          doneLabel: "리딩 카드 미리보기 생성됨",
          targetLabel: "카드 만들기",
          hint: "선택한 단어 옆에 뜬 팝오버에서 문장카드를 누르세요. 결과도 이 선택 위치 근처에 뜹니다.",
          dependsOn: ["select-inanimate"],
          revealsPreview: true
        },
        {
          id: "save-etymology-card",
          label: "카드 담기",
          doneLabel: "카드 담김",
          targetLabel: "카드 담기",
          hint: "미리보기를 확인했으면 카드 담기를 누르세요.",
          dependsOn: ["build-etymology-card"],
          virtualSave: true
        }
      ],
      progressLabels: ["네비 클릭", "선택", "카드 만들기", "카드 담기"],
      completionText: "PDF 리더에서 모르는 단어를 골라 인풋-리딩 카드를 만드는 흐름을 확인했습니다."
    },
    {
      id: "listening-loop",
      moduleId: "inputListening",
      navLabel: "듣기 루프",
      title: "듣기 루프로 인풋-리스닝 카드 만들기",
      sceneKind: "listeningLoop",
      goal: "왼쪽 네비에서 듣기 루프를 열고, 잘 안 들리는 표현을 표시한 뒤 R로 인풋-리스닝 카드를 저장해 보세요.",
      coach:
        "새 리스닝 카드는 문장 전체와 각 말 덩어리를 따로 들을 수 있고, 한글 발음·IPA·놓친 이유·짧은 받아쓰기를 한 흐름으로 보여줍니다.",
      appLocation: "인풋 > 듣기 루프",
      previewCardId: ids.listening,
      actions: [
        {
          id: "intro-listening-reading-sources",
          label: "리딩 카드 위치 확인",
          doneLabel: "리딩 카드 위치 확인",
          targetLabel: "인풋-리딩 카드",
          hint:
            "웹리더는 웹페이지를 앱 안에서 읽는 곳이고, 문서 리더는 PDF나 긴 문서를 읽는 곳입니다. 둘 다 읽다가 모르는 단어, 헷갈리는 표현을 인풋-리딩 카드로 남길 수 있어요."
        },
        {
          id: "intro-listening-purpose",
          label: "리스닝 카드 소개",
          doneLabel: "리스닝 카드 소개 완료",
          targetLabel: "인풋-리스닝 카드",
          hint:
            "다음은 확정 인풋-리스닝 카드예요. 전체 듣기와 말 덩어리별 듣기, 한글 발음·IPA, 놓친 이유, 빈칸 받아쓰기로 실제 소리를 단계적으로 복습합니다.",
          dependsOn: ["intro-listening-reading-sources"]
        },
        {
          id: "intro-listening-tools",
          label: "리스닝 카드 위치 확인",
          doneLabel: "리스닝 카드 위치 확인",
          targetLabel: "듣기 루프와 영상 리더",
          hint:
            "인풋-리스닝 카드는 듣기 루프와 영상 리더에서 만들 수 있어요. 듣기 루프는 매일 랜덤한 짧은 영상을 듣는 곳이고, 영상 리더는 내 컴퓨터의 영상이나 원하는 영상으로 리스닝 카드와 쉐도잉을 하는 공간입니다.",
          dependsOn: ["intro-listening-purpose"]
        },
        {
          id: "open-listening-loop",
          label: "듣기 루프 열기",
          doneLabel: "듣기 루프 열림",
          targetLabel: "듣기 루프",
          hint: "이제 왼쪽 네비의 인풋 섹션에서 듣기 루프를 누르세요.",
          dependsOn: ["intro-listening-tools"],
          navTargetTab: "listeningLoop"
        },
        {
          id: "select-listening-segment",
          label: "going to 선택",
          doneLabel: "going to 선택됨",
          targetLabel: "going to",
          hint: "여기서부터는 인풋-리스닝 카드입니다. 잘 안 들리는 문장은 R 키로 저장할 수 있고, 특정 단어가 안 들리면 먼저 그 부분을 드래그해 선택합니다. 연습으로 going to를 선택해 보세요.",
          dependsOn: ["open-listening-loop"]
        },
        {
          id: "mark-sound-points",
          label: "F 형광펜",
          doneLabel: "안 들리는 부분 표시됨",
          targetLabel: "F 형광펜",
          hint: "선택한 단어가 잘 안 들리는 부분이면 F 키를 눌러 형광펜 표시를 남깁니다. 하이라이트는 필수는 아니고, 나중에 복습할 때 어디가 안 들렸는지 기억하게 해 줍니다.",
          dependsOn: ["select-listening-segment"],
          revealsSoundPoints: true
        },
        {
          id: "build-listening-card",
          label: "R 문장 저장",
          doneLabel: "리스닝 카드 미리보기 생성됨",
          targetLabel: "R 문장 저장",
          hint: "이제 R 키를 눌러 현재 문장을 인풋-리스닝 카드로 저장합니다. 실제 앱에서는 미리보기 없이 바로 저장되지만, 튜토리얼에서는 한 번만 결과를 보여드릴게요.",
          dependsOn: ["select-listening-segment", "mark-sound-points"],
          revealsPreview: true
        },
        {
          id: "continue-after-listening-card",
          label: "리스닝 카드 확인",
          doneLabel: "리스닝 카드 확인 완료",
          targetLabel: "리스닝 카드 확인",
          hint: "튜토리얼용 미리보기를 확인했으면 다음으로 넘어가세요. 실제 듣기 루프에서는 카드 후보 팝오버가 뜨지 않고 R 저장으로 바로 기록됩니다.",
          dependsOn: ["build-listening-card"],
          virtualSave: true
        }
      ],
      progressLabels: ["네비 클릭", "부분 선택", "F 형광펜", "R 저장", "미리보기"],
      completionText: "듣기 루프에서 소리 덩어리·놓친 이유·받아쓰기가 포함된 리스닝 카드를 만드는 흐름을 확인했습니다."
    },
    {
      id: "video-reader",
      moduleId: "inputListening",
      navLabel: "영상 리더",
      title: "영상 리더로 리스닝 카드 만들기",
      sceneKind: "videoReader",
      goal: "왼쪽 네비에서 영상 리더를 열고, 영상 자막의 was going to, shortcut, had already started running을 골라 카드로 만들어 보세요.",
      coach:
        "영상 리더에서 만든 카드도 확정 리스닝 템플릿을 사용합니다. 영상 구간과 함께 전체 문장과 소리 덩어리를 반복해서 들을 수 있습니다.",
      appLocation: "인풋 > 영상 리더",
      previewCardId: ids.listening,
      actions: [
        {
          id: "open-video-reader",
          label: "영상 리더 열기",
          doneLabel: "영상 리더 열림",
          targetLabel: "영상 리더",
          hint: "왼쪽 네비의 인풋 섹션에서 영상 리더를 누르세요.",
          navTargetTab: "videoReader"
        },
        {
          id: "select-video-was-going-to",
          label: "was going to 선택",
          doneLabel: "was going to 선택됨",
          targetLabel: "was going to",
          hint: "생성될 카드에는 이 구간에서 잘 안 들릴 수 있는 표현 3개가 들어갑니다. 먼저 영상 자막의 was going to를 누르세요.",
          dependsOn: ["open-video-reader"]
        },
        {
          id: "select-video-shortcut",
          label: "shortcut 선택",
          doneLabel: "shortcut 선택됨",
          targetLabel: "shortcut",
          hint: "다음으로 shortcut을 누르세요. 첫 음절 short에 강세가 크게 실리는 단어라 함께 표시해둘 표현입니다.",
          dependsOn: ["select-video-was-going-to"]
        },
        {
          id: "select-video-running",
          label: "had already started running 선택",
          doneLabel: "had already started running 선택됨",
          targetLabel: "had already started running",
          hint: "마지막으로 had already started running을 누르세요. 이미 행동이 먼저 시작된 상태를 문장째로 남깁니다.",
          dependsOn: ["select-video-shortcut"]
        },
        {
          id: "build-video-card",
          label: "이 구간 카드 만들기",
          doneLabel: "영상 리스닝 카드 생성됨",
          targetLabel: "이 구간 카드 만들기",
          hint:
            "선택한 3개 표현이 카드의 소리 포인트와 표현 목록으로 들어갑니다. 영상 리더에서는 잘 안 들리는 부분을 형광펜으로 표시하고 R로 현재 구간을 저장할 수 있습니다. 튜토리얼에서는 이 구간 카드 만들기를 눌러 결과를 확인해봅니다.",
          dependsOn: ["select-video-was-going-to", "select-video-shortcut", "select-video-running"],
          revealsSoundPoints: true,
          revealsPreview: true
        },
        {
          id: "continue-after-video-card",
          label: "영상 카드 확인",
          doneLabel: "영상 리스닝 카드 확인 완료",
          targetLabel: "확인하고 다음으로",
          hint: "생성된 영상 리스닝 카드 미리보기를 확인한 뒤 다음으로 넘어가세요.",
          dependsOn: ["build-video-card"],
          virtualSave: true
        }
      ],
      progressLabels: ["네비 클릭", "표현 1", "표현 2", "표현 3", "카드 만들기", "확인"],
      completionText: "영상 리더에서 자막 구간을 리스닝 카드로 만드는 흐름을 확인했습니다."
    },
    {
      id: "life-capture",
      moduleId: "output",
      navLabel: "대화 수집",
      title: "실제 대화가 라이프 마이닝 후보로 모이는 방식",
      sceneKind: "lifeCapture",
      goal: "웹리더 LLM 대화와 Discord 대화에서 내가 입력한 말을 라이프 마이닝 후보로 모으는 과정을 확인하세요.",
      coach:
        "자주 하는 말도 막상 카드로 만들려고 하면 잘 생각나지 않습니다. 그래서 실제 대화 중 내가 입력한 말을 후보로 모아두고, 나중에 아웃풋 카드로 바꿉니다.",
      appLocation: "웹리더 LLM / Discord > 라이프 마이닝 후보",
      actions: [
        {
          id: "intro-output-transition",
          label: "아웃풋 카드 소개",
          doneLabel: "아웃풋 카드 소개 완료",
          targetLabel: "아웃풋 카드 소개",
          hint: "이제부터는 아웃풋 카드로 넘어갑니다. 읽기와 듣기로 표현을 받아들이는 것도 중요하지만, 내가 모국어로 자주 쓰는 말을 학습 언어로 어떻게 말하는지 아는 것도 매우 도움이 됩니다."
        },
        {
          id: "intro-life-mining-purpose",
          label: "라이프 마이닝 소개",
          doneLabel: "라이프 마이닝 소개 완료",
          targetLabel: "라이프 마이닝 소개",
          hint: "그런데 막상 카드를 만들려고 하면 '내가 평소에 무슨 말을 자주 했더라?' 하고 떠오르지 않을 때가 많습니다. 그래서 랭귀지 마이너는 내가 실제로 입력한 말을 라이프 마이닝 후보로 모아둘 수 있습니다.",
          dependsOn: ["intro-output-transition"]
        },
        {
          id: "intro-life-mining-sources",
          label: "수집 위치 소개",
          doneLabel: "수집 위치 소개 완료",
          targetLabel: "수집 위치 소개",
          hint: "현재는 웹버전 ChatGPT나 Discord에서 입력한 표현을 모으는 흐름을 연습합니다. 후보 중 외우고 싶은 표현이 있으면 아웃풋 카드로 만들면 됩니다. 먼저 웹리더 안의 대화 예시로 가서 평소처럼 대화해볼게요.",
          dependsOn: ["intro-life-mining-purpose"]
        },
        {
          id: "open-life-capture-source",
          label: "웹리더 대화 열기",
          doneLabel: "대화 화면 열림",
          targetLabel: "웹리더",
          hint: "왼쪽 네비의 인풋 섹션에서 웹리더를 눌러, 웹리더 안의 LLM 대화 예시를 확인하세요.",
          dependsOn: ["intro-life-mining-sources"],
          navTargetTab: "webReader"
        },
        {
          id: "send-life-capture-message",
          label: "Enter로 입력 저장",
          doneLabel: "웹리더 LLM 입력 후보 수집됨",
          targetLabel: "Enter",
          hint: "샘플 입력창에서 Enter를 누르세요. 내가 입력한 한국어 문장이 라이프 마이닝 후보로 들어온 것처럼 표시됩니다.",
          dependsOn: ["open-life-capture-source"]
        },
        {
          id: "send-discord-capture-message",
          label: "Discord Enter로 입력 저장",
          doneLabel: "Discord 입력 후보 수집됨",
          targetLabel: "Discord Enter",
          hint: "Discord 예시에서도 Enter를 눌러보세요. 실제 대화에서 입력한 말도 라이프 마이닝 후보로 모을 수 있다는 흐름을 보여줍니다.",
          dependsOn: ["send-life-capture-message"]
        },
        {
          id: "confirm-life-capture",
          label: "후보 확인",
          doneLabel: "수집 흐름 확인됨",
          targetLabel: "라이프 마이닝 후보 확인",
          hint: "오른쪽 후보 미리보기에 방금 입력한 말이 들어온 것을 확인하고 다음으로 넘어가세요.",
          dependsOn: ["send-discord-capture-message"],
          virtualSave: true
        }
      ],
      progressLabels: ["아웃풋 소개", "대화 열기", "LLM 입력", "Discord 입력", "후보 확인"],
      completionText: "실제 대화 중 내가 입력한 말이 라이프 마이닝 후보로 모이는 이유와 흐름을 확인했습니다."
    },
    {
      id: "life-output",
      moduleId: "output",
      navLabel: "라이프 마이닝",
      title: "라이프 마이닝으로 아웃풋 카드 만들기",
      sceneKind: "lifeMining",
      goal: "왼쪽 네비에서 라이프 마이닝을 열고, 한국어로 남긴 내 답변을 영어 아웃풋 카드로 만들어 보세요.",
      coach:
        "확정 아웃풋 카드는 메신저형 대화 맥락, 말풍선별 듣기, 핵심 청크, 적응형 인사이트, 문장 구조, 대체 표현과 말하기 연습을 함께 보여줍니다.",
      appLocation: "아웃풋 > 라이프 마이닝",
      previewCardId: ids.output,
      actions: [
        {
          id: "open-life-mining",
          label: "라이프 마이닝 열기",
          doneLabel: "라이프 마이닝 열림",
          targetLabel: "라이프 마이닝",
          hint: "왼쪽 네비의 아웃풋 섹션에서 라이프 마이닝을 누르세요. 여기서는 내가 실제로 쓰고 싶었던 말을 영어 카드로 바꾸는 흐름을 연습합니다.",
          navTargetTab: "life"
        },
        {
          id: "select-life-reply",
          label: "내 한국어 답변 선택",
          doneLabel: "내 답변 선택됨",
          targetLabel: "금방 갈게...",
          hint: "왼쪽 후보 목록에서 아까 대화 중 입력했던 내 한국어 답변을 선택하세요.",
          dependsOn: ["open-life-mining"]
        },
        {
          id: "build-output-card",
          label: "영어 카드 만들기",
          doneLabel: "아웃풋 카드 미리보기 생성됨",
          targetLabel: "영어 카드 만들기",
          hint: "아까 웹리더 안의 LLM 대화와 Discord 예시에서 내가 입력한 말이 후보로 모였어요. 여기서 자주 쓰는 말을 골라 영어 아웃풋 카드로 만들 수 있습니다.",
          dependsOn: ["select-life-reply"],
          revealsPreview: true
        },
        {
          id: "save-output-card",
          label: "카드 목록에서 확인",
          doneLabel: "아웃풋 카드 확인 완료",
          targetLabel: "카드 목록에서 확인",
          hint: "아웃풋 카드 미리보기를 확인했으면 카드 목록으로 넘어가세요.",
          dependsOn: ["build-output-card"],
          virtualSave: true
        }
      ],
      progressLabels: ["네비 클릭", "후보 선택", "카드 만들기", "확인"],
      completionText: "라이프 마이닝에서 실제 대화 기반 아웃풋 카드를 만드는 흐름을 확인했습니다."
    },
    {
      id: "cards-overview",
      moduleId: "review",
      navLabel: "카드",
      title: "카드 화면에서 만든 카드 확인",
      sceneKind: "cardsOverview",
      goal: "왼쪽 네비에서 카드 화면을 열고, 지금까지 만든 카드가 어디에 쌓이는지 확인하세요.",
      coach:
        "리더, 듣기, 라이프 마이닝에서 만든 카드가 카드 화면에 쌓입니다. 이 목록에서 카드를 열어보고 복습 덱으로 이어갈 수 있습니다.",
      appLocation: "관리 > 카드",
      previewCardId: ids.reading,
      actions: [
        {
          id: "open-cards",
          label: "카드 화면 열기",
          doneLabel: "카드 화면 열림",
          targetLabel: "카드",
          hint: "왼쪽 네비의 관리 섹션에서 카드를 누르세요.",
          navTargetTab: "cards"
        },
        {
          id: "inspect-first-card",
          label: "카드 하나 확인",
          doneLabel: "카드 확인됨",
          targetLabel: "I’m running a little late. 카드",
          hint:
            "왼쪽 카드 목록에서 방금 만든 인풋-리딩 카드를 눌러보세요. 실제 앱에서도 목록에서 카드를 고르면 오른쪽에 전체 카드가 열립니다.",
          dependsOn: ["open-cards"]
        },
        {
          id: "confirm-cards-overview",
          label: "복습으로 이동",
          doneLabel: "카드 목록 확인 완료",
          targetLabel: "복습으로 이동",
          hint: "오른쪽 실제 카드 화면을 확인했으면 복습 단계로 넘어가세요.",
          dependsOn: ["inspect-first-card"],
          virtualSave: true
        }
      ],
      progressLabels: ["네비 클릭", "카드 선택", "카드 확인"],
      completionText: "만든 카드가 카드 화면에 쌓이고, 이후 복습 덱으로 이어진다는 점을 확인했습니다."
    },
    {
      id: "review-intro",
      moduleId: "review",
      navLabel: "복습",
      title: "복습으로 카드 다시 보기",
      sceneKind: "reviewIntro",
      goal: "왼쪽 네비에서 복습을 열고, 카드가 덱별 복습 큐로 이어지는 흐름을 확인하세요.",
      coach:
        "복습 화면에서는 만든 카드가 인풋-리딩, 인풋-리스닝, 아웃풋 덱으로 나뉘어 쌓입니다. 앞면을 보고 떠올린 뒤 뒷면을 확인하고 평가합니다.",
      appLocation: "복습",
      previewCardId: ids.reading,
      actions: [
        {
          id: "open-review",
          label: "복습 열기",
          doneLabel: "복습 열림",
          targetLabel: "복습",
          hint: "왼쪽 네비에서 복습을 누르세요.",
          navTargetTab: "review"
        },
        {
          id: "start-review-session",
          label: "복습하기",
          doneLabel: "복습 세션 시작됨",
          targetLabel: "복습하기",
          hint: "인풋-리딩덱의 복습하기 버튼을 눌러 샘플 카드를 확인하세요.",
          dependsOn: ["open-review"]
        },
        {
          id: "show-review-back",
          label: "답 보기",
          doneLabel: "뒷면 확인됨",
          targetLabel: "답 보기",
          hint: "앞면을 보고 뜻을 떠올린 뒤 카드 안의 답 보기 버튼을 누르세요.",
          dependsOn: ["start-review-session"]
        },
        {
          id: "rate-review-card",
          label: "기억 정도 선택",
          doneLabel: "복습 평가 완료",
          targetLabel: "복습 평가 버튼",
          hint: "답을 확인한 뒤 다시, 어려움, 보통, 쉬움 중 하나를 골라 다음 복습 간격을 정합니다.",
          dependsOn: ["show-review-back"],
          virtualSave: true
        }
      ],
      progressLabels: ["네비 클릭", "복습 시작", "답 보기", "평가"],
      completionText: "카드가 복습 덱으로 이어지고, 앞면/뒷면 확인 후 평가하는 흐름을 확인했습니다."
    },
    {
      id: "today-mission",
      moduleId: "review",
      navLabel: "오늘",
      title: "오늘의 미션과 다이아 확인",
      sceneKind: "todayMission",
      goal: "왼쪽 네비에서 오늘을 열고, 학습 활동이 오늘의 미션과 다이아 보상으로 이어지는 구조를 확인하세요.",
      coach:
        "오늘 화면은 지금 할 일을 모아 보여주는 작업대입니다. 인풋, 아웃풋, 복습 활동을 하면 오늘의 미션이 채워지고 다이아를 받을 수 있습니다.",
      appLocation: "오늘",
      actions: [
        {
          id: "open-today",
          label: "오늘 열기",
          doneLabel: "오늘 화면 열림",
          targetLabel: "오늘",
          hint: "왼쪽 네비 맨 위의 오늘을 누르세요.",
          navTargetTab: "pdfHub"
        },
        {
          id: "inspect-daily-missions",
          label: "오늘의 미션 보기",
          doneLabel: "오늘의 미션 확인됨",
          targetLabel: "오늘의 미션",
          hint: "오늘의 미션 영역을 확인하세요. 카드 만들기, 듣기, 라이프 마이닝, 복습 같은 활동으로 다이아를 벌 수 있습니다.",
          dependsOn: ["open-today"]
        },
        {
          id: "finish",
          label: "가이드 완료",
          doneLabel: "가이드 완료",
          targetLabel: "가이드 완료",
          hint: "가이드를 마치고 카드 화면으로 돌아갑니다.",
          dependsOn: ["inspect-daily-missions"]
        }
      ],
      progressLabels: ["네비 클릭", "미션 확인", "완료"],
      completionText: "학습 활동이 오늘의 미션과 다이아 보상으로 이어지는 구조를 확인했습니다."
    }
  ];
}
