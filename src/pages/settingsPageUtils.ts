import type {
  AppSettings,
  LearningProfileRecord
} from "../shared/types";

type BrowserTranslatorAvailability = "unavailable" | "downloadable" | "downloading" | "available";

type BrowserTranslatorStatic = {
  availability(options: {
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<BrowserTranslatorAvailability>;
};

export function getSettingsStatusClassName(message: string) {
  if (/실패|오류|없습니다|연결할 수 없습니다|지원하지 않습니다|unavailable|not installed|could not/i.test(message)) {
    return "status-text danger";
  }
  if (/확인 중|다운로드|downloading/i.test(message)) {
    return "status-text pending";
  }
  return "status-text";
}

export function getBrowserTranslatorApi() {
  const candidate = (globalThis as { Translator?: unknown }).Translator;
  if (!candidate || typeof candidate !== "object") {
    return undefined;
  }

  const translator = candidate as Partial<BrowserTranslatorStatic>;
  return typeof translator.availability === "function"
    ? (translator as BrowserTranslatorStatic)
    : undefined;
}

export function normalizeTranslatorLanguage(value: string, fallback: string) {
  return value.trim() || fallback;
}

const cardConnectionFields = new Set<keyof AppSettings>([
  "providerName",
  "ollamaBaseUrl",
  "ollamaModel",
  "geminiApiKey",
  "geminiModel"
]);

const translationConnectionFields = new Set<keyof AppSettings>([
  "translationProviderName",
  "ollamaBaseUrl",
  "ollamaModel",
  "geminiApiKey",
  "geminiModel",
  "googleTranslateApiKey",
  "localMtModel"
]);

export function shouldResetCardConnectionStatus(
  current: AppSettings,
  next: Partial<AppSettings>
) {
  return hasChangedConnectionField(current, next, cardConnectionFields);
}

export function shouldResetTranslationConnectionStatus(
  current: AppSettings,
  next: Partial<AppSettings>
) {
  return hasChangedConnectionField(current, next, translationConnectionFields);
}

export function hasConfiguredCardSyncFolder(path: string | undefined) {
  return Boolean(path?.trim());
}

export function normalizeCardSyncPrerequisites(
  current: AppSettings,
  next: Partial<AppSettings>
): Partial<AppSettings> {
  if (!("cardSyncFolderPath" in next)) {
    return next;
  }
  if (hasConfiguredCardSyncFolder(next.cardSyncFolderPath)) {
    return next;
  }
  return {
    ...next,
    cardSyncFolderPath: "",
    cardSyncOnStartup: false,
    cardSyncOnQuit: false
  };
}

function hasChangedConnectionField(
  current: AppSettings,
  next: Partial<AppSettings>,
  fields: ReadonlySet<keyof AppSettings>
) {
  return (Object.keys(next) as Array<keyof AppSettings>).some(
    (field) => fields.has(field) && next[field] !== current[field]
  );
}

export function createProfilePreset(
  index: number,
  settings: AppSettings,
  localizedName: string
): LearningProfileRecord {
  const now = new Date().toISOString();
  return {
    id: createProfileId(),
    name: localizedName,
    learningProfile: settings.learningProfile,
    createdAt: now,
    updatedAt: now
  };
}

export function createProfileId() {
  return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getProfileInitials(profile: LearningProfileRecord | undefined) {
  const code = profile?.learningProfile.targetLanguage.code.trim() || "??";
  return code.slice(0, 2).toUpperCase();
}
