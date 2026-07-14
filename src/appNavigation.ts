import {
  BookMarked,
  BookOpen,
  Bot,
  CreditCard,
  Film,
  Gamepad2,
  Gem,
  GraduationCap,
  Globe2,
  Headphones,
  Home,
  Inbox,
  Languages,
  Lightbulb,
  ListChecks,
  Pencil,
  RotateCcw,
  Send,
  Settings as SettingsIcon,
  SlidersHorizontal,
  type LucideIcon
} from "lucide-react";
import type { NavSectionId } from "./appSidebarState";

export type TabKey =
  | "pdfHub"
  | "pdfReader"
  | "webReader"
  | "documentLibrary"
  | "bookmarks"
  | "bookMaker"
  | "exportHistory"
  | "cards"
  | "playZone"
  | "listeningLoop"
  | "videoReader"
  | "writingPractice"
  | "characterChat"
  | "review"
  | "life"
  | "glossary"
  | "tutorial"
  | "settings";

export type NavItem = {
  key: TabKey;
  label?: string;
  labelKey?: RouteTranslationKey;
  icon?: LucideIcon;
};

export type NavGroup = {
  title: string;
  titleKey: RouteTranslationKey;
  items: NavItem[];
};

export type NavSection = {
  id: NavSectionId;
  title: string;
  titleKey: RouteTranslationKey;
  icon: LucideIcon;
  directKey?: TabKey;
  items?: NavItem[];
  groups?: NavGroup[];
};

export type RouteTranslationKey =
  | "nav.today"
  | "nav.documentReader"
  | "nav.webReader"
  | "nav.bookMaker"
  | "nav.cards"
  | "nav.playZone"
  | "nav.listeningLoop"
  | "nav.videoReader"
  | "nav.writingPractice"
  | "nav.characterChat"
  | "nav.review"
  | "nav.lifeMining"
  | "nav.glossary"
  | "nav.tutorial"
  | "nav.settings"
  | "nav.sections.input"
  | "nav.sections.output"
  | "nav.sections.review"
  | "nav.sections.playZone"
  | "nav.sections.manage"
  | "nav.sections.reading"
  | "nav.sections.listening";

export const routeMeta: Record<
  TabKey,
  {
    label: string;
    labelKey: RouteTranslationKey;
    icon: LucideIcon;
  }
> = {
  pdfHub: { label: "오늘", labelKey: "nav.today", icon: Home },
  pdfReader: { label: "문서 리더기", labelKey: "nav.documentReader", icon: BookOpen },
  webReader: { label: "웹 리더", labelKey: "nav.webReader", icon: Globe2 },
  documentLibrary: { label: "문서 리더기", labelKey: "nav.documentReader", icon: BookOpen },
  bookmarks: { label: "문서 리더기", labelKey: "nav.documentReader", icon: BookOpen },
  bookMaker: { label: "이중언어 책 만들기", labelKey: "nav.bookMaker", icon: Languages },
  exportHistory: { label: "이중언어 책 만들기", labelKey: "nav.bookMaker", icon: Languages },
  cards: { label: "카드", labelKey: "nav.cards", icon: CreditCard },
  playZone: { label: "플레이존", labelKey: "nav.playZone", icon: Gamepad2 },
  listeningLoop: { label: "듣기 루프", labelKey: "nav.listeningLoop", icon: Headphones },
  videoReader: { label: "영상 리더", labelKey: "nav.videoReader", icon: Film },
  writingPractice: { label: "영작 훈련", labelKey: "nav.writingPractice", icon: Pencil },
  characterChat: { label: "캐릭터챗", labelKey: "nav.characterChat", icon: Bot },
  review: { label: "복습", labelKey: "nav.review", icon: RotateCcw },
  life: { label: "라이프 마이닝", labelKey: "nav.lifeMining", icon: Lightbulb },
  glossary: { label: "용어집", labelKey: "nav.glossary", icon: BookMarked },
  tutorial: { label: "튜토리얼", labelKey: "nav.tutorial", icon: GraduationCap },
  settings: { label: "설정", labelKey: "nav.settings", icon: SettingsIcon }
};

export const homeNavItem: NavItem = {
  key: "pdfHub",
  label: "오늘",
  labelKey: "nav.today",
  icon: Home
};

export function getPrimaryNavTab(tab: TabKey): TabKey {
  if (tab === "documentLibrary" || tab === "bookmarks") {
    return "pdfReader";
  }
  if (tab === "exportHistory") {
    return "bookMaker";
  }
  return tab;
}

export const navSections: NavSection[] = [
  {
    id: "input",
    title: "읽고 듣기 · Input",
    titleKey: "nav.sections.input",
    icon: Inbox,
    groups: [
      {
        title: "읽기",
        titleKey: "nav.sections.reading",
        items: [{ key: "pdfReader" }, { key: "webReader" }]
      },
      {
        title: "듣기",
        titleKey: "nav.sections.listening",
        items: [{ key: "listeningLoop" }, { key: "videoReader" }]
      }
    ]
  },
  {
    id: "output",
    title: "말하고 쓰기 · Output",
    titleKey: "nav.sections.output",
    icon: Send,
    items: [{ key: "life" }, { key: "writingPractice" }, { key: "characterChat" }]
  },
  {
    id: "review",
    title: "복습",
    titleKey: "nav.sections.review",
    icon: ListChecks,
    directKey: "review"
  },
  {
    id: "playZone",
    title: "플레이존",
    titleKey: "nav.sections.playZone",
    icon: Gem,
    directKey: "playZone"
  },
  {
    id: "manage",
    title: "관리",
    titleKey: "nav.sections.manage",
    icon: SlidersHorizontal,
    items: [
      { key: "cards" },
      { key: "bookMaker" },
      { key: "glossary" },
      { key: "tutorial" },
      { key: "settings" }
    ]
  }
];

export function navSectionHasTab(section: NavSection, tab: TabKey) {
  const primaryTab = getPrimaryNavTab(tab);
  return Boolean(
    section.directKey === primaryTab ||
      section.items?.some((item) => item.key === primaryTab) ||
      section.groups?.some((group) => group.items.some((item) => item.key === primaryTab))
  );
}

export function getNavSectionIdForTab(tab: TabKey): NavSectionId | null {
  const section = navSections.find((candidate) => navSectionHasTab(candidate, tab));
  return section?.id ?? null;
}
