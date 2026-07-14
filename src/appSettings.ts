import { defaultLearningProfile, normalizeLearningProfile } from "./shared/languages";
import {
  defaultLifeMiningCaptureSettings,
  normalizeLifeMiningCaptureSettings
} from "./shared/lifeMiningSettings";
import { DEFAULT_PROFILE_ID } from "./shared/profiles";
import type { AppSettings, ProfileId } from "./shared/types";
import {
  DEFAULT_DAILY_APP_TOKEN_LIMIT,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_LOCAL_MT_MODEL,
  DEFAULT_MONTHLY_SPEND_LIMIT_KRW
} from "./shared/translationUsage";
import { getDefaultTtsSettings } from "./shared/tts";
import { disconnectLegacyCloudSettings } from "./shared/cloudProviderConsent";

const QWEN_14B_MIGRATION_KEY = "lem:migrations:qwen2.5-14b-vram16-default";
const GEMMA4_12B_MIGRATION_KEY = "lem:migrations:gemma4-12b-vram16-default";
const FINAL_CARD_TEMPLATE_SYNC_MIGRATION_KEY =
  "lem:migrations:final-card-templates-disable-startup-sync-v1";
const legacyDefaultModels = ["qwen2.5:7b", "qwen2.5:3b"];
const previousVram16DefaultModels = ["qwen2.5:14b"];
const webLocalGeminiModel = import.meta.env.VITE_GEMINI_MODEL?.trim() ?? "";
const webLocalProvider = import.meta.env.VITE_LM_WEB_PROVIDER;
const webLocalTranslationProvider = import.meta.env.VITE_LM_WEB_TRANSLATION_PROVIDER;

export const defaultSettings: AppSettings = {
  profileId: DEFAULT_PROFILE_ID,
  providerName: "mock",
  ollamaBaseUrl: "http://localhost:11434",
  ollamaModel: "gemma4:12b",
  localMtModel: DEFAULT_LOCAL_MT_MODEL,
  translationProviderName: "localMt",
  googleTranslateApiKey: "",
  geminiApiKey: "",
  geminiModel: DEFAULT_GEMINI_MODEL,
  geminiPlan: "free",
  ...getDefaultTtsSettings(),
  monthlySpendLimitKrw: DEFAULT_MONTHLY_SPEND_LIMIT_KRW,
  dailyAppTokenLimit: DEFAULT_DAILY_APP_TOKEN_LIMIT,
  confirmEstimatedCostBeforeRun: true,
  confirmLifeMiningCardCost: true,
  stopOnFreeTierLimit: true,
  stopOnMonthlyLimit: true,
  learningProfile: defaultLearningProfile,
  pdfExportMode: "reading",
  showPdfSourceHighlights: true,
  captureShortcut: "Ctrl+Q",
  browserSelectionCardMode: "preview",
  browserCaptureSiteSettings: {
    discord: false,
    chatgpt: false,
    claude: false,
    youtube: false,
    reddit: false,
    genericWeb: false
  },
  webReaderCustomSources: [],
  webReaderCustomCategories: [],
  listeningLoopBackgroundPrebuildEnabled: false,
  listeningLoopLongVideoPartialClipsEnabled: false,
  lifeMiningCaptureSettings: defaultLifeMiningCaptureSettings,
  cardSyncFolderPath: "",
  cardSyncOnStartup: true,
  cardSyncOnQuit: true,
  labsHideSidebarNavigation: false,
  labsHideGlossaryNavigation: false,
  debugMode: false,
  debugPdfPath: ""
};

export function normalizeBrowserCaptureSiteSettings(
  settings?: Partial<AppSettings["browserCaptureSiteSettings"]>
): AppSettings["browserCaptureSiteSettings"] {
  return {
    discord: settings?.discord === true,
    chatgpt: settings?.chatgpt === true,
    claude: settings?.claude === true,
    youtube: settings?.youtube === true,
    reddit: settings?.reddit === true,
    genericWeb: settings?.genericWeb === true
  };
}

export function normalizeWebReaderCustomSources(
  sources?: Partial<AppSettings["webReaderCustomSources"][number]>[]
): AppSettings["webReaderCustomSources"] {
  if (!Array.isArray(sources)) {
    return [];
  }
  const normalized = [];
  const seen = new Set<string>();
  for (const source of sources) {
    const label = source?.label?.trim();
    const url = source?.url?.trim();
    const languageCode = source?.languageCode?.trim().toLowerCase().split("-")[0] || "unknown";
    if (!label || !url) {
      continue;
    }
    const key = url.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const now = new Date().toISOString();
    normalized.push({
      id: source.id?.trim() || `custom:${key}`,
      label,
      url,
      languageCode,
      categoryId: source.categoryId?.trim() || undefined,
      description: source.description?.trim() || "사용자 추가 사이트",
      createdAt: source.createdAt || now,
      updatedAt: source.updatedAt || now
    });
  }
  return normalized.slice(0, 30);
}

export function normalizeWebReaderCustomCategories(
  categories?: Partial<NonNullable<AppSettings["webReaderCustomCategories"]>[number]>[]
): NonNullable<AppSettings["webReaderCustomCategories"]> {
  if (!Array.isArray(categories)) {
    return [];
  }
  const normalized = [];
  const seen = new Set<string>();
  for (const category of categories) {
    const label = category?.label?.trim();
    const languageCode =
      category?.languageCode?.trim().toLowerCase().split("-")[0] || "unknown";
    if (!label) {
      continue;
    }
    const key = `${languageCode}:${label.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const now = new Date().toISOString();
    const purpose =
      category.purpose === "input-reading" || category.purpose === "output-life"
        ? category.purpose
        : undefined;
    normalized.push({
      id: category.id?.trim() || `custom-category:${key}`,
      label,
      languageCode,
      purpose,
      createdAt: category.createdAt || now,
      updatedAt: category.updatedAt || now
    });
  }
  return normalized.slice(0, 24);
}

export function readAppSettings() {
  try {
    const saved = localStorage.getItem("lem:settings");
    if (!saved) {
      return defaultSettings;
    }

    const parsed = JSON.parse(saved) as Partial<AppSettings>;
    const merged = {
      ...defaultSettings,
      ...parsed,
      profileId: parsed.profileId || DEFAULT_PROFILE_ID,
      providerName: normalizeStoredProviderName(parsed.providerName),
      learningProfile: normalizeLearningProfile(parsed.learningProfile),
      browserCaptureSiteSettings: normalizeBrowserCaptureSiteSettings(
        parsed.browserCaptureSiteSettings
      ),
      webReaderCustomSources: normalizeWebReaderCustomSources(parsed.webReaderCustomSources),
      webReaderCustomCategories: normalizeWebReaderCustomCategories(
        parsed.webReaderCustomCategories
      ),
      lifeMiningCaptureSettings: normalizeLifeMiningCaptureSettings(
        parsed.lifeMiningCaptureSettings
      )
    } as AppSettings;
    const consentSafeSettings = disconnectLegacyCloudSettings(merged, localStorage);
    if (consentSafeSettings !== merged) {
      localStorage.setItem("lem:settings", JSON.stringify(consentSafeSettings));
    }
    if (!localStorage.getItem(FINAL_CARD_TEMPLATE_SYNC_MIGRATION_KEY)) {
      const migrated = { ...consentSafeSettings, cardSyncOnStartup: false };
      localStorage.setItem(FINAL_CARD_TEMPLATE_SYNC_MIGRATION_KEY, "1");
      localStorage.setItem("lem:settings", JSON.stringify(migrated));
      return migrated;
    }
    if (
      legacyDefaultModels.includes(consentSafeSettings.ollamaModel) &&
      !localStorage.getItem(QWEN_14B_MIGRATION_KEY)
    ) {
      const migrated = { ...consentSafeSettings, ollamaModel: defaultSettings.ollamaModel };
      localStorage.setItem(QWEN_14B_MIGRATION_KEY, "1");
      localStorage.setItem(GEMMA4_12B_MIGRATION_KEY, "1");
      localStorage.setItem("lem:settings", JSON.stringify(migrated));
      return migrated;
    }
    if (
      previousVram16DefaultModels.includes(consentSafeSettings.ollamaModel) &&
      !localStorage.getItem(GEMMA4_12B_MIGRATION_KEY)
    ) {
      const migrated = { ...consentSafeSettings, ollamaModel: defaultSettings.ollamaModel };
      localStorage.setItem(GEMMA4_12B_MIGRATION_KEY, "1");
      localStorage.setItem("lem:settings", JSON.stringify(migrated));
      return migrated;
    }
    return consentSafeSettings;
  } catch {
    return defaultSettings;
  }
}

export function normalizeAppSettingsForStorage(next: AppSettings, profileId: ProfileId) {
  return {
    ...next,
    profileId,
    providerName: normalizeStoredProviderName(next.providerName),
    learningProfile: normalizeLearningProfile(next.learningProfile),
    browserCaptureSiteSettings: normalizeBrowserCaptureSiteSettings(
      next.browserCaptureSiteSettings
    ),
    webReaderCustomSources: normalizeWebReaderCustomSources(next.webReaderCustomSources),
    webReaderCustomCategories: normalizeWebReaderCustomCategories(
      next.webReaderCustomCategories
    ),
    lifeMiningCaptureSettings: normalizeLifeMiningCaptureSettings(
      next.lifeMiningCaptureSettings
    )
  };
}

export function normalizeStoredProviderName(value: unknown): AppSettings["providerName"] {
  switch (typeof value === "string" ? value.trim().toLowerCase() : "") {
    case "gemini":
    case "geminiprovider":
      return "gemini";
    case "ollama":
    case "ollamaprovider":
      return "ollama";
    case "chatgptweb":
    case "manualchatgptwebprovider":
      return "chatgptWeb";
    case "mock":
    case "mockprovider":
    default:
      return "mock";
  }
}

export function applyWebLocalGeminiSettings(settings: AppSettings): AppSettings {
  if (!isWebFallbackRuntime()) {
    return settings;
  }

  const providerName = normalizeWebLocalProvider(webLocalProvider);
  const translationProviderName = normalizeWebLocalTranslationProvider(webLocalTranslationProvider);

  return {
    ...settings,
    geminiModel: webLocalGeminiModel || settings.geminiModel,
    providerName: providerName ?? settings.providerName,
    translationProviderName: translationProviderName ?? settings.translationProviderName
  };
}

function isWebFallbackRuntime() {
  return typeof window !== "undefined" && !window.localEnglishMiner;
}

function normalizeWebLocalProvider(value: string | undefined): AppSettings["providerName"] | undefined {
  switch (value) {
    case "mock":
    case "ollama":
    case "gemini":
    case "chatgptWeb":
      return value;
    default:
      return undefined;
  }
}

function normalizeWebLocalTranslationProvider(
  value: string | undefined
): AppSettings["translationProviderName"] | undefined {
  switch (value) {
    case "local":
    case "localMt":
    case "google":
    case "gemini":
    case "browser":
      return value;
    default:
      return undefined;
  }
}
