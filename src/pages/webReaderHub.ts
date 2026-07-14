import {
  BookOpen,
  Bot,
  FileText,
  MessageCircle,
  Newspaper,
  Sparkles,
  type LucideIcon
} from "lucide-react";
import type {
  WebReaderCustomCategory,
  WebReaderCustomCategoryPurpose,
  WebReaderCustomSource
} from "../shared/types";
import { WEB_READER_PRACTICE_URL } from "../shared/webReaderPractice";
import { WEB_READER_DEFAULT_URL } from "./webReaderAddress";

const ALICE_GUTENBERG_TEXT_URL = "https://www.gutenberg.org/files/11/11-0.txt";

export const webReaderCardColorKeys = [
  "red",
  "orange",
  "blue",
  "purple",
  "green",
  "pink",
  "cyan",
  "yellow",
  "lime",
  "slate"
] as const;

export const WEB_READER_MIN_WEBVIEW_MOUNT_HEIGHT = 320;
export const WEB_READER_SESSION_STORAGE_KEY = "lem:webReaderSession:v1";
const LEGACY_WEB_READER_DEFAULT_TITLES = new Set([
  "웹 리더",
  "웹 리더 홈",
  "Web reader",
  "Web reader home"
]);

export type WebReaderHubSource = {
  id?: string;
  label: string;
  url: string;
  description: string;
  languageCode?: string;
  categoryId?: string;
  isCustom?: boolean;
};

export type WebReaderHubPurpose = WebReaderCustomCategoryPurpose;

export type WebReaderHubCategory = {
  id: string;
  label: string;
  icon: LucideIcon;
  purpose?: WebReaderHubPurpose;
  isCustom?: boolean;
  sources: WebReaderHubSource[];
};

export type WebReaderHubIntent = {
  label: string;
  description: string;
  url: string;
  icon: LucideIcon;
};

export type WebReaderHubModel = {
  categories: WebReaderHubCategory[];
  intents: WebReaderHubIntent[];
  featured: WebReaderHubSource[];
  otherLanguageSources: WebReaderHubSource[];
};

export type WebReaderSessionState = {
  readerUrl: string;
  addressValue: string;
  isHubVisible: boolean;
  pageTitle: string;
};

export function readWebReaderSession(): WebReaderSessionState {
  const fallback: WebReaderSessionState = {
    readerUrl: WEB_READER_DEFAULT_URL,
    addressValue: "",
    isHubVisible: true,
    pageTitle: ""
  };
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const saved = window.localStorage.getItem(WEB_READER_SESSION_STORAGE_KEY);
    if (!saved) {
      return fallback;
    }
    const parsed = JSON.parse(saved) as Partial<WebReaderSessionState>;
    const readerUrl =
      typeof parsed.readerUrl === "string" && parsed.readerUrl.trim()
        ? parsed.readerUrl
        : fallback.readerUrl;
    const isHubVisible =
      typeof parsed.isHubVisible === "boolean" ? parsed.isHubVisible : fallback.isHubVisible;
    return {
      readerUrl,
      addressValue:
        typeof parsed.addressValue === "string" && parsed.addressValue.trim()
          ? parsed.addressValue
          : isHubVisible
            ? ""
            : readerUrl,
      isHubVisible,
      pageTitle:
        typeof parsed.pageTitle === "string" &&
        parsed.pageTitle.trim() &&
        !LEGACY_WEB_READER_DEFAULT_TITLES.has(parsed.pageTitle.trim())
          ? parsed.pageTitle
          : fallback.pageTitle
    };
  } catch {
    return fallback;
  }
}

export function writeWebReaderSession(session: WebReaderSessionState) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(WEB_READER_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Session restore is a convenience feature; ignore storage failures.
  }
}

export const webReaderHubFeatured: WebReaderHubSource[] = [
  {
    label: "Language Miner Practice",
    url: WEB_READER_PRACTICE_URL,
    description: ""
  },
  {
    label: "VOA Learning English",
    url: "https://learningenglish.voanews.com/",
    description: ""
  },
  {
    label: "Wikipedia",
    url: WEB_READER_DEFAULT_URL,
    description: ""
  },
  {
    label: "ChatGPT",
    url: "https://chatgpt.com/",
    description: ""
  }
];

const commonLifeDialogueSources: WebReaderHubSource[] = [
  {
    label: "ChatGPT",
    url: "https://chatgpt.com/",
    description: ""
  },
  {
    label: "Gemini",
    url: "https://gemini.google.com/",
    description: ""
  },
  {
    label: "Claude",
    url: "https://claude.ai/",
    description: ""
  }
];

const commonLifeDialogueCategory: WebReaderHubCategory = {
  id: "life-dialogue",
  label: "",
  icon: Bot,
  purpose: "output-life",
  sources: commonLifeDialogueSources
};

const commonLifeMiningIntent: WebReaderHubIntent = {
  label: "",
  description: "",
  url: "https://chatgpt.com/",
  icon: Bot
};

const DEFAULT_CUSTOM_CATEGORY_ID = "custom";

export const webReaderCollectionHubCategories: WebReaderHubCategory[] = [
  {
    id: "life-dialogue",
    label: "",
    icon: Bot,
    purpose: "output-life",
    sources: [
      ...commonLifeDialogueSources,
      {
        label: "Discord",
        url: "https://discord.com/channels/@me",
        description: ""
      }
    ]
  },
  {
    id: "community-expression",
    label: "",
    icon: MessageCircle,
    purpose: "input-reading",
    sources: [
      {
        label: "Reddit",
        url: "https://www.reddit.com/",
        description: ""
      },
      {
        label: "X",
        url: "https://x.com/",
        description: ""
      },
      {
        label: "Hacker News",
        url: "https://news.ycombinator.com/",
        description: ""
      }
    ]
  },
  {
    id: "knowledge-reading",
    label: "",
    icon: BookOpen,
    purpose: "input-reading",
    sources: [
      {
        label: "Language Miner Practice",
        url: WEB_READER_PRACTICE_URL,
        description: ""
      },
      {
        label: "Wikipedia",
        url: WEB_READER_DEFAULT_URL,
        description: ""
      },
      {
        label: "Britannica",
        url: "https://www.britannica.com/",
        description: ""
      },
      {
        label: "MDN Web Docs",
        url: "https://developer.mozilla.org/en-US/",
        description: ""
      }
    ]
  },
  {
    id: "public-domain-books",
    label: "",
    icon: BookOpen,
    purpose: "input-reading",
    sources: [
      {
        label: "Alice's Adventures in Wonderland",
        url: ALICE_GUTENBERG_TEXT_URL,
        description: ""
      },
      {
        label: "Project Gutenberg",
        url: "https://www.gutenberg.org/",
        description: ""
      },
      {
        label: "Standard Ebooks",
        url: "https://standardebooks.org/",
        description: ""
      }
    ]
  },
  {
    id: "news-current",
    label: "",
    icon: Newspaper,
    purpose: "input-reading",
    sources: [
      {
        label: "VOA Learning English",
        url: "https://learningenglish.voanews.com/",
        description: ""
      },
      {
        label: "BBC",
        url: "https://www.bbc.com/news",
        description: ""
      },
      {
        label: "NPR",
        url: "https://www.npr.org/",
        description: ""
      },
      {
        label: "Reuters",
        url: "https://www.reuters.com/",
        description: ""
      }
    ]
  },
  {
    id: "work-context",
    label: "",
    icon: FileText,
    purpose: "input-reading",
    sources: [
      {
        label: "GitHub",
        url: "https://github.com/",
        description: ""
      },
      {
        label: "Stack Overflow",
        url: "https://stackoverflow.com/",
        description: ""
      },
      {
        label: "MDN Web Docs",
        url: "https://developer.mozilla.org/en-US/",
        description: ""
      }
    ]
  }
];

export const webReaderCollectionHubIntents: WebReaderHubIntent[] = [
  {
    label: "",
    description: "",
    url: WEB_READER_PRACTICE_URL,
    icon: Sparkles
  },
  commonLifeMiningIntent,
  {
    label: "",
    description: "",
    url: "https://www.reddit.com/",
    icon: MessageCircle
  },
  {
    label: "",
    description: "",
    url: WEB_READER_DEFAULT_URL,
    icon: BookOpen
  },
  {
    label: "",
    description: "",
    url: ALICE_GUTENBERG_TEXT_URL,
    icon: BookOpen
  },
  {
    label: "",
    description: "",
    url: "https://learningenglish.voanews.com/",
    icon: Newspaper
  },
  {
    label: "",
    description: "",
    url: "https://github.com/",
    icon: FileText
  }
];

const japaneseWebReaderHubCategories: WebReaderHubCategory[] = [
  {
    id: "community-expression",
    label: "",
    icon: MessageCircle,
    purpose: "input-reading",
    sources: [
      {
        label: "note",
        url: "https://note.com/",
        description: "",
        languageCode: "ja"
      },
      {
        label: "はてなブックマーク",
        url: "https://b.hatena.ne.jp/",
        description: "",
        languageCode: "ja"
      },
      {
        label: "Yahoo!知恵袋",
        url: "https://chiebukuro.yahoo.co.jp/",
        description: "",
        languageCode: "ja"
      }
    ]
  },
  {
    id: "news-current",
    label: "",
    icon: Newspaper,
    purpose: "input-reading",
    sources: [
      {
        label: "NHK NEWS WEB EASY",
        url: "https://www3.nhk.or.jp/news/easy/",
        description: "",
        languageCode: "ja"
      },
      {
        label: "NHKニュース",
        url: "https://www3.nhk.or.jp/news/",
        description: "",
        languageCode: "ja"
      },
      {
        label: "Yahoo!ニュース",
        url: "https://news.yahoo.co.jp/",
        description: "",
        languageCode: "ja"
      }
    ]
  },
  {
    id: "knowledge-reading",
    label: "",
    icon: BookOpen,
    purpose: "input-reading",
    sources: [
      {
        label: "日本語版Wikipedia",
        url: "https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E8%AA%9E",
        description: "",
        languageCode: "ja"
      },
      {
        label: "青空文庫",
        url: "https://www.aozora.gr.jp/",
        description: "",
        languageCode: "ja"
      }
    ]
  },
  commonLifeDialogueCategory
];

const japaneseWebReaderHubIntents: WebReaderHubIntent[] = [
  commonLifeMiningIntent,
  {
    label: "",
    description: "",
    url: "https://www3.nhk.or.jp/news/easy/",
    icon: Newspaper
  },
  {
    label: "",
    description: "",
    url: "https://note.com/",
    icon: MessageCircle
  },
  {
    label: "",
    description: "",
    url: "https://www.aozora.gr.jp/",
    icon: BookOpen
  }
];

const koreanWebReaderHubCategories: WebReaderHubCategory[] = [
  {
    id: "community-expression",
    label: "",
    icon: MessageCircle,
    purpose: "input-reading",
    sources: [
      {
        label: "네이버 블로그",
        url: "https://section.blog.naver.com/",
        description: "",
        languageCode: "ko"
      },
      {
        label: "브런치스토리",
        url: "https://brunch.co.kr/",
        description: "",
        languageCode: "ko"
      }
    ]
  },
  {
    id: "news-current",
    label: "",
    icon: Newspaper,
    purpose: "input-reading",
    sources: [
      {
        label: "네이버 뉴스",
        url: "https://news.naver.com/",
        description: "",
        languageCode: "ko"
      },
      {
        label: "다음 뉴스",
        url: "https://news.daum.net/",
        description: "",
        languageCode: "ko"
      }
    ]
  },
  {
    id: "knowledge-reading",
    label: "",
    icon: BookOpen,
    purpose: "input-reading",
    sources: [
      {
        label: "한국어 위키백과",
        url: "https://ko.wikipedia.org/wiki/%ED%95%9C%EA%B5%AD%EC%96%B4",
        description: "",
        languageCode: "ko"
      },
      {
        label: "YouTube",
        url: "https://www.youtube.com/",
        description: "",
        languageCode: "ko"
      }
    ]
  },
  commonLifeDialogueCategory
];

const koreanWebReaderHubIntents: WebReaderHubIntent[] = [
  commonLifeMiningIntent,
  {
    label: "",
    description: "",
    url: "https://news.naver.com/",
    icon: Newspaper
  },
  {
    label: "",
    description: "",
    url: "https://brunch.co.kr/",
    icon: FileText
  },
  {
    label: "",
    description: "",
    url: "https://www.youtube.com/",
    icon: MessageCircle
  }
];

export function getWebReaderHubModel(
  targetLanguageCode: string,
  customSources: WebReaderCustomSource[] = [],
  customCategories: WebReaderCustomCategory[] = []
): WebReaderHubModel {
  const languageCode = targetLanguageCode.trim().toLowerCase().split("-")[0];
  const base: WebReaderHubModel =
    languageCode === "ja"
        ? {
            categories: japaneseWebReaderHubCategories,
            intents: japaneseWebReaderHubIntents,
            featured: japaneseWebReaderHubCategories.flatMap((category) => category.sources).slice(0, 3),
            otherLanguageSources: []
          }
        : languageCode === "ko"
          ? {
              categories: koreanWebReaderHubCategories,
              intents: koreanWebReaderHubIntents,
              featured: koreanWebReaderHubCategories.flatMap((category) => category.sources).slice(0, 3),
              otherLanguageSources: []
            }
          : {
              categories: webReaderCollectionHubCategories,
              intents: webReaderCollectionHubIntents,
              featured: webReaderHubFeatured,
              otherLanguageSources: []
            };
  const matchingCustomSources = customSources
    .filter((source) => source.languageCode.trim().toLowerCase().split("-")[0] === languageCode)
    .map<WebReaderHubSource>((source) => ({
      id: source.id,
      label: source.label,
      url: source.url,
      description: source.description || "",
      languageCode: source.languageCode,
      categoryId: source.categoryId,
      isCustom: true
    }));
  const matchingCustomSourceRecords = customSources.filter(
    (source) => source.languageCode.trim().toLowerCase().split("-")[0] === languageCode
  );
  const matchingCustomCategories = customCategories.filter(
    (category) => category.languageCode.trim().toLowerCase().split("-")[0] === languageCode
  );
  const otherLanguageSources = customSources
    .filter((source) => source.languageCode.trim().toLowerCase().split("-")[0] !== languageCode)
    .map<WebReaderHubSource>((source) => ({
      label: source.label,
      url: source.url,
      description: source.description || "",
      languageCode: source.languageCode,
      isCustom: true
    }));

  if (matchingCustomSources.length === 0 && matchingCustomCategories.length === 0) {
    return {
      ...base,
      otherLanguageSources
    };
  }

  const baseCategoryIds = new Set(base.categories.map((category) => category.id));
  const customCategoryIds = new Set(
    matchingCustomCategories.map((category) => category.id.trim()).filter(Boolean)
  );
  const customSourcesByCategory = new Map<string, WebReaderHubSource[]>();
  const defaultCustomSources: WebReaderHubSource[] = [];

  matchingCustomSourceRecords.forEach((record, index) => {
    const source = matchingCustomSources[index];
    const categoryId = record.categoryId?.trim() || DEFAULT_CUSTOM_CATEGORY_ID;
    if (baseCategoryIds.has(categoryId) || customCategoryIds.has(categoryId)) {
      customSourcesByCategory.set(categoryId, [
        ...(customSourcesByCategory.get(categoryId) ?? []),
        source
      ]);
      return;
    }
    defaultCustomSources.push(source);
  });

  const customHubCategories: WebReaderHubCategory[] = matchingCustomCategories.map((category) => ({
    id: category.id,
    label: category.label,
    icon: Sparkles,
    purpose: category.purpose,
    isCustom: true,
    sources: customSourcesByCategory.get(category.id) ?? []
  }));

  const defaultCustomHubCategory: WebReaderHubCategory[] =
    defaultCustomSources.length > 0
      ? [
          {
            id: DEFAULT_CUSTOM_CATEGORY_ID,
            label: "",
            icon: Sparkles,
            isCustom: true,
            sources: defaultCustomSources
          }
        ]
      : [];

  const baseCategoriesWithCustomSources = base.categories.map((category) => {
    const sources = customSourcesByCategory.get(category.id);
    return sources?.length
      ? {
          ...category,
          sources: [...sources, ...category.sources]
        }
      : category;
  });

  return {
    categories: [...customHubCategories, ...defaultCustomHubCategory, ...baseCategoriesWithCustomSources],
    intents: base.intents,
    featured: [...matchingCustomSources.slice(0, 2), ...base.featured].slice(0, 4),
    otherLanguageSources
  };
}

export type WebReaderSourceTag =
  | "ai"
  | "article"
  | "book"
  | "community"
  | "conversation"
  | "discussion"
  | "documentation"
  | "easyNews"
  | "encyclopedia"
  | "essay"
  | "knowledge"
  | "literature"
  | "longform"
  | "news"
  | "qa"
  | "shortPost"
  | "studyNews"
  | "video"
  | "web"
  | "work";

const webReaderSourceStyleByLabel: Record<
  string,
  { initials: string; accent: string; tag: WebReaderSourceTag }
> = {
  "Language Miner Practice": { initials: "LM", accent: "#2563eb", tag: "studyNews" },
  Reddit: { initials: "R", accent: "#ff4500", tag: "community" },
  X: { initials: "X", accent: "#111827", tag: "shortPost" },
  Discord: { initials: "D", accent: "#5865f2", tag: "conversation" },
  "Hacker News": { initials: "HN", accent: "#ff6600", tag: "discussion" },
  Quora: { initials: "Q", accent: "#b92b27", tag: "qa" },
  ChatGPT: { initials: "G", accent: "#10a37f", tag: "ai" },
  Gemini: { initials: "Ge", accent: "#4f46e5", tag: "ai" },
  Claude: { initials: "C", accent: "#d97706", tag: "ai" },
  BBC: { initials: "B", accent: "#0f172a", tag: "news" },
  NPR: { initials: "N", accent: "#d62027", tag: "news" },
  "VOA Learning English": { initials: "VOA", accent: "#1d4ed8", tag: "studyNews" },
  Wikipedia: { initials: "W", accent: "#475569", tag: "knowledge" },
  Britannica: { initials: "Br", accent: "#0f766e", tag: "encyclopedia" },
  YouTube: { initials: "YT", accent: "#ff0033", tag: "video" },
  Medium: { initials: "M", accent: "#111827", tag: "essay" },
  Substack: { initials: "S", accent: "#ff6719", tag: "article" },
  Aeon: { initials: "A", accent: "#7c3aed", tag: "longform" },
  "Project Gutenberg": { initials: "PG", accent: "#795548", tag: "book" },
  "Standard Ebooks": { initials: "SE", accent: "#2563eb", tag: "book" }
};

const webReaderCollectionSourceStyleByLabel: Record<
  string,
  { initials: string; accent: string; tag: WebReaderSourceTag }
> = {
  ...webReaderSourceStyleByLabel,
  Reuters: { initials: "Re", accent: "#f59e0b", tag: "news" },
  "NHK NEWS WEB EASY": { initials: "NHK", accent: "#16a34a", tag: "easyNews" },
  "NHKニュース": { initials: "NHK", accent: "#dc2626", tag: "news" },
  "Yahoo!ニュース": { initials: "Y!", accent: "#ef4444", tag: "news" },
  note: { initials: "no", accent: "#10b981", tag: "essay" },
  "はてなブックマーク": { initials: "B!", accent: "#2563eb", tag: "community" },
  "Yahoo!知恵袋": { initials: "知", accent: "#f59e0b", tag: "qa" },
  "日本語版Wikipedia": { initials: "W", accent: "#475569", tag: "knowledge" },
  "青空文庫": { initials: "青", accent: "#0891b2", tag: "literature" },
  "네이버 뉴스": { initials: "N", accent: "#16a34a", tag: "news" },
  "다음 뉴스": { initials: "D", accent: "#2563eb", tag: "news" },
  "네이버 블로그": { initials: "NB", accent: "#22c55e", tag: "article" },
  브런치스토리: { initials: "Br", accent: "#111827", tag: "essay" },
  "한국어 위키백과": { initials: "W", accent: "#475569", tag: "knowledge" },
  "MDN Web Docs": { initials: "MDN", accent: "#2563eb", tag: "documentation" },
  GitHub: { initials: "GH", accent: "#111827", tag: "work" },
  "Stack Overflow": { initials: "SO", accent: "#f97316", tag: "qa" }
};

export function getWebReaderSourceStyle(source: WebReaderHubSource) {
  if (source.url === WEB_READER_PRACTICE_URL) {
    return { initials: "LM", accent: "#2563eb", tag: "studyNews" as const };
  }
  return (
    webReaderCollectionSourceStyleByLabel[source.label] ?? {
      initials: source.label.slice(0, 2).toUpperCase(),
      accent: "#1769e0",
      tag: "web"
    }
  );
}
