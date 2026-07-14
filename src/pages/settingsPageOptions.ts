import {
  FlaskConical,
  FolderOpen,
  Monitor,
  MousePointer2,
  SlidersHorizontal,
  Sparkles,
  type LucideIcon
} from "lucide-react";
import type {
  AppSettings,
  LifeMiningCapturePreset,
  LifeMiningCaptureSettings,
  TranslationProviderName,
  TtsProviderName
} from "../shared/types";
export type SettingsTabId = "basic" | "ai" | "capture" | "sync" | "display" | "labs";

export type SettingsPanelId =
  | "profile"
  | "locale"
  | "cardEngine"
  | "apiUsage"
  | "tts"
  | "capture"
  | "sync"
  | "background"
  | "labs"
  | "developer"
  | "privacy"
  | "export";

export const settingsTabOptions: Array<{
  id: SettingsTabId;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { id: "basic", label: "일반", description: "프로필과 기본 상태", icon: SlidersHorizontal },
  { id: "ai", label: "AI · 음성", description: "카드, 번역, TTS", icon: Sparkles },
  { id: "capture", label: "캡처", description: "웹과 문장 수집", icon: MousePointer2 },
  { id: "sync", label: "동기화 · 데이터", description: "카드 파일과 백업", icon: FolderOpen },
  { id: "display", label: "화면 · 실행", description: "네비게이션과 시작", icon: Monitor },
  { id: "labs", label: "고급", description: "실험실과 개인정보", icon: FlaskConical }
];

export const settingsPanelSearchText: Record<SettingsPanelId, string> = {
  profile: "프로필 언어 계정 학습 영어 한국어 profile language account learning korean english",
  locale: "앱 표시 언어 한국어 영어 korean english language locale",
  cardEngine: "카드 생성 모델 provider ollama gemini mock card generation model",
  apiUsage: "api 사용량 번역 gemini google 비용 토큰 한도 usage translation cost token guard key",
  tts: "tts 음성 듣기 오디오 piper windows 브라우저 voice audio browser",
  capture: "캡처 단축키 웹 라이프 마이닝 문장카드 팝오버 capture shortcut web life mining sentence card",
  sync: "동기화 백업 폴더 시작 종료 카드 sync backup restore folder startup quit card",
  background: "백그라운드 트레이 자동 실행 windows 시작 듣기 루프 미리 준비 background tray launch startup listening loop",
  labs: "실험실 화면 네비 숨김 용어집 labs display navigation hide glossary",
  developer: "개발자 디버그 pdf developer debug",
  privacy: "개인정보 로컬 sqlite 브라우저 수집 privacy local browser capture plaintext",
  export: "내보내기 anki csv json 백업 export backup restore"
};

export const ollamaModelPresets = [
  {
    label: "16GB 기본",
    labelKey: "settings.options.ollama.default16.label",
    value: "gemma4:12b",
    description: "현재 PDF 번역/카드 JSON 기본 추천",
    descriptionKey: "settings.options.ollama.default16.description"
  },
  {
    label: "Gemma 4 Abliterated",
    labelKey: "settings.options.ollama.gemma4Abliterated.label",
    value: "huihui_ai/gemma-4-abliterated:12b",
    description: "성인 농담/비속어 대사 번역 대안",
    descriptionKey: "settings.options.ollama.gemma4Abliterated.description"
  },
  {
    label: "Qwen 3 14B",
    labelKey: "settings.options.ollama.qwen3.label",
    value: "qwen3:14b",
    description: "다국어 번역 대안",
    descriptionKey: "settings.options.ollama.qwen3.description"
  },
  {
    label: "Qwen 3 Abliterated",
    labelKey: "settings.options.ollama.qwen3Abliterated.label",
    value: "huihui_ai/qwen3-abliterated:14b",
    description: "검열 완화 Qwen 14B 대안",
    descriptionKey: "settings.options.ollama.qwen3Abliterated.description"
  },
  {
    label: "Qwen 2.5 14B",
    labelKey: "settings.options.ollama.qwen25.label",
    value: "qwen2.5:14b",
    description: "이전 안정 기본값",
    descriptionKey: "settings.options.ollama.qwen25.description"
  },
  {
    label: "Gemma 3 12B",
    labelKey: "settings.options.ollama.gemma3.label",
    value: "gemma3:12b",
    description: "이전 Gemma 12B",
    descriptionKey: "settings.options.ollama.gemma3.description"
  },
  {
    label: "빠른 균형",
    labelKey: "settings.options.ollama.fastBalanced.label",
    value: "qwen3:8b",
    description: "속도와 품질 절충",
    descriptionKey: "settings.options.ollama.fastBalanced.description"
  }
] as const;

export const geminiModelPresets = [
  {
    label: "Flash-Lite",
    labelKey: "settings.options.gemini.flashLite.label",
    value: "gemini-2.5-flash-lite",
    description: "반복 PDF 번역 테스트용 가장 빠른 옵션",
    descriptionKey: "settings.options.gemini.flashLite.description"
  },
  {
    label: "Flash",
    labelKey: "settings.options.gemini.flash.label",
    value: "gemini-2.5-flash",
    description: "품질과 속도의 균형",
    descriptionKey: "settings.options.gemini.flash.description"
  },
  {
    label: "Pro",
    labelKey: "settings.options.gemini.pro.label",
    value: "gemini-2.5-pro",
    description: "품질 우선. 느리고 수요 폭주에 걸릴 가능성이 높음",
    descriptionKey: "settings.options.gemini.pro.description"
  }
] as const;

export const ttsProviderPresets = [
  {
    label: "Windows 내장",
    labelKey: "settings.options.ttsProvider.system.label",
    value: "system",
    description: "가볍고 빠른 기본 로컬 TTS",
    descriptionKey: "settings.options.ttsProvider.system.description"
  },
  {
    label: "브라우저",
    labelKey: "settings.options.ttsProvider.browser.label",
    value: "browser",
    description: "웹 테스트용 즉시 대체 재생",
    descriptionKey: "settings.options.ttsProvider.browser.description"
  },
  {
    label: "Piper (준비 중)",
    labelKey: "settings.options.ttsProvider.piper.label",
    value: "piper",
    description: "아직 음성 모델이 포함되지 않아 선택할 수 없습니다.",
    descriptionKey: "settings.options.ttsProvider.piper.description"
  }
] as const satisfies ReadonlyArray<{
  label: string;
  labelKey: `settings.options.${string}`;
  value: TtsProviderName;
  description: string;
  descriptionKey: `settings.options.${string}`;
}>;

export const translationProviderPresets = [
  {
    value: "localMt",
    label: "로컬 번역기",
    labelKey: "settings.options.translationProvider.localMt.label",
    description: "PDF 번역에 맞춘 기기 내 모델",
    descriptionKey: "settings.options.translationProvider.localMt.description"
  },
  {
    value: "local",
    label: "Ollama LLM",
    labelKey: "settings.options.translationProvider.local.label",
    description: "카드 생성과 같은 로컬 LLM",
    descriptionKey: "settings.options.translationProvider.local.description"
  },
  {
    value: "gemini",
    label: "Gemini",
    labelKey: "settings.options.translationProvider.gemini.label",
    description: "속도와 품질이 균형 잡힌 클라우드 번역",
    descriptionKey: "settings.options.translationProvider.gemini.description"
  },
  {
    value: "google",
    label: "Google 번역",
    labelKey: "settings.options.translationProvider.google.label",
    description: "Cloud Translation API 사용",
    descriptionKey: "settings.options.translationProvider.google.description"
  },
  {
    value: "browser",
    label: "브라우저 내장",
    labelKey: "settings.options.translationProvider.browser.label",
    description: "웹 리더에서 API 키 없이 사용",
    descriptionKey: "settings.options.translationProvider.browser.description"
  }
] as const satisfies ReadonlyArray<{
  value: TranslationProviderName;
  label: string;
  labelKey: `settings.options.${string}`;
  description: string;
  descriptionKey: `settings.options.${string}`;
}>;

export const ttsModelPresets = [
  {
    label: "가벼운 기본",
    labelKey: "settings.options.ttsModel.default.label",
    value: "windows-system-default",
    description: "Windows 설치 음성 중 기본값 사용",
    descriptionKey: "settings.options.ttsModel.default.description"
  },
  {
    label: "Piper EN 소형",
    labelKey: "settings.options.ttsModel.piperSmall.label",
    value: "piper-en_US-lessac-low",
    description: "준비 중인 경량 영어 음성 모델 후보",
    descriptionKey: "settings.options.ttsModel.piperSmall.description"
  },
  {
    label: "Piper EN 중간",
    labelKey: "settings.options.ttsModel.piperMedium.label",
    value: "piper-en_US-lessac-medium",
    description: "준비 중인 품질 우선 경량 모델 후보",
    descriptionKey: "settings.options.ttsModel.piperMedium.description"
  }
] as const;

export const browserCaptureSiteOptions = [
  {
    key: "discord",
    label: "Discord",
    labelKey: "settings.options.captureSites.discord.label",
    description: "웹 Discord에서 내가 보낸 메시지와 선택 텍스트를 수집합니다.",
    descriptionKey: "settings.options.captureSites.discord.description"
  },
  {
    key: "chatgpt",
    label: "ChatGPT",
    labelKey: "settings.options.captureSites.chatgpt.label",
    description: "ChatGPT 웹 대화에서 내가 보낸 말과 선택 텍스트를 수집합니다.",
    descriptionKey: "settings.options.captureSites.chatgpt.description"
  },
  {
    key: "claude",
    label: "Claude",
    labelKey: "settings.options.captureSites.claude.label",
    description: "Claude 웹 대화에서 내가 보낸 말과 선택 텍스트를 수집합니다.",
    descriptionKey: "settings.options.captureSites.claude.description"
  },
  {
    key: "youtube",
    label: "YouTube",
    labelKey: "settings.options.captureSites.youtube.label",
    description: "시청 기록 추천, 이중자막, 선택 텍스트 카드를 사용합니다.",
    descriptionKey: "settings.options.captureSites.youtube.description"
  },
  {
    key: "reddit",
    label: "Reddit",
    labelKey: "settings.options.captureSites.reddit.label",
    description: "Reddit에서 드래그한 문장 카드 팝오버를 사용합니다.",
    descriptionKey: "settings.options.captureSites.reddit.description"
  },
  {
    key: "genericWeb",
    label: "그 외 웹",
    labelKey: "settings.options.captureSites.genericWeb.label",
    description: "위 사이트가 아닌 일반 웹페이지에서 드래그 카드 팝오버를 사용합니다.",
    descriptionKey: "settings.options.captureSites.genericWeb.description"
  }
] as const satisfies ReadonlyArray<{
  key: keyof AppSettings["browserCaptureSiteSettings"];
  label: string;
  labelKey: `settings.options.${string}`;
  description: string;
  descriptionKey: `settings.options.${string}`;
}>;

export const lifeMiningPresetOptions = [
  {
    value: "balanced",
    label: "균형",
    labelKey: "settings.options.lifePreset.balanced.label",
    description: "내 메시지 1개 + 앞 6개/뒤 2개 문맥. 기본 추천값입니다.",
    descriptionKey: "settings.options.lifePreset.balanced.description"
  },
  {
    value: "light",
    label: "가볍게",
    labelKey: "settings.options.lifePreset.light.label",
    description: "내 메시지와 앞 2개 문맥만 저장해서 중복과 비용을 줄입니다.",
    descriptionKey: "settings.options.lifePreset.light.description"
  },
  {
    value: "deep",
    label: "깊게",
    labelKey: "settings.options.lifePreset.deep.label",
    description: "앞 10개/뒤 4개 버블을 붙여 긴 대화 흐름을 남깁니다.",
    descriptionKey: "settings.options.lifePreset.deep.description"
  }
] as const satisfies ReadonlyArray<{
  value: Exclude<LifeMiningCapturePreset, "custom">;
  label: string;
  labelKey: `settings.options.${string}`;
  description: string;
  descriptionKey: `settings.options.${string}`;
}>;

export const lifeMiningTargetOptions = [
  {
    value: "own_with_reply",
    label: "내 말 + 답변 문맥",
    labelKey: "settings.options.lifeTarget.ownWithReply.label",
    description: "학습 대상은 내 메시지, 답변은 문맥으로만 저장합니다.",
    descriptionKey: "settings.options.lifeTarget.ownWithReply.description"
  },
  {
    value: "own",
    label: "내 말만",
    labelKey: "settings.options.lifeTarget.own.label",
    description: "내가 쓴 문장만 저장합니다.",
    descriptionKey: "settings.options.lifeTarget.own.description"
  },
  {
    value: "all",
    label: "전체",
    labelKey: "settings.options.lifeTarget.all.label",
    description: "자동 캡처가 마지막 메시지까지 대상으로 삼습니다.",
    descriptionKey: "settings.options.lifeTarget.all.description"
  }
] as const satisfies ReadonlyArray<{
  value: LifeMiningCaptureSettings["target"];
  label: string;
  labelKey: `settings.options.${string}`;
  description: string;
  descriptionKey: `settings.options.${string}`;
}>;

export const lifeMiningScopeOptions = [
  {
    value: "new_only",
    label: "새 메시지만",
    labelKey: "settings.options.lifeScope.newOnly.label",
    description: "방금 보낸 메시지를 찾지 못하면 저장하지 않습니다.",
    descriptionKey: "settings.options.lifeScope.newOnly.description"
  },
  {
    value: "visible",
    label: "보이는 범위",
    labelKey: "settings.options.lifeScope.visible.label",
    description: "수동 캡처 때 화면에 보이는 최근 메시지를 후보로 씁니다.",
    descriptionKey: "settings.options.lifeScope.visible.description"
  },
  {
    value: "recent",
    label: "최근 대화",
    labelKey: "settings.options.lifeScope.recent.label",
    description: "최근 대화 문맥을 조금 더 넓게 허용합니다.",
    descriptionKey: "settings.options.lifeScope.recent.description"
  }
] as const satisfies ReadonlyArray<{
  value: LifeMiningCaptureSettings["scope"];
  label: string;
  labelKey: `settings.options.${string}`;
  description: string;
  descriptionKey: `settings.options.${string}`;
}>;

export const lifeMiningContextOptions = [
  { value: "none", label: "없음", labelKey: "settings.options.lifeContext.none" },
  { value: "previous_1", label: "직전 1개", labelKey: "settings.options.lifeContext.previous1" },
  { value: "previous_2", label: "직전 2개", labelKey: "settings.options.lifeContext.previous2" },
  {
    value: "previous_and_next",
    label: "앞뒤 지정 수",
    labelKey: "settings.options.lifeContext.previousAndNext"
  },
  { value: "recent", label: "최근 넓게", labelKey: "settings.options.lifeContext.recent" }
] as const satisfies ReadonlyArray<{
  value: LifeMiningCaptureSettings["contextMode"];
  label: string;
  labelKey: `settings.options.${string}`;
}>;
type SettingsPanelVisibilityInput = {
  activeSettingsTab: SettingsTabId;
  normalizedSettingsSearch: string;
  panelId: SettingsPanelId;
};

type SettingsPanelClassNameInput = SettingsPanelVisibilityInput & {
  extraClassName?: string;
};

const panelIdsByTab: Record<SettingsTabId, SettingsPanelId[]> = {
  basic: ["profile", "locale"],
  ai: ["cardEngine", "apiUsage", "tts"],
  capture: ["capture"],
  sync: ["sync", "export"],
  display: ["background"],
  labs: ["labs", "developer", "privacy"]
};

export function isSettingsPanelVisible({
  activeSettingsTab,
  normalizedSettingsSearch,
  panelId
}: SettingsPanelVisibilityInput) {
  if (normalizedSettingsSearch) {
    return settingsPanelSearchText[panelId].toLowerCase().includes(normalizedSettingsSearch);
  }

  return panelIdsByTab[activeSettingsTab].includes(panelId);
}

export function getSettingsPanelClassName({
  activeSettingsTab,
  extraClassName = "",
  normalizedSettingsSearch,
  panelId
}: SettingsPanelClassNameInput) {
  return [
    "panel",
    "settings-panel",
    extraClassName,
    isSettingsPanelVisible({
      activeSettingsTab,
      normalizedSettingsSearch,
      panelId
    })
      ? ""
      : "settings-panel-hidden"
  ]
    .filter(Boolean)
    .join(" ");
}
