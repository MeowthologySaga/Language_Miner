export type AppLocale = "ko" | "en";

export const APP_LOCALE_STORAGE_KEY = "lem:appLocale";
export const APP_LOCALE_CHANGED_EVENT = "lem:app-locale-changed";

export function normalizeAppLocale(value: unknown): AppLocale | null {
  if (typeof value !== "string") {
    return null;
  }
  const language = value.trim().toLowerCase().split(/[-_]/)[0];
  if (language === "ko" || language === "en") {
    return language;
  }
  return null;
}

export function detectAppLocale(languages: readonly string[] = []): AppLocale {
  for (const language of languages) {
    const normalized = normalizeAppLocale(language);
    if (normalized) {
      return normalized;
    }
  }
  return "ko";
}

export function readAppLocale(): AppLocale {
  if (typeof window !== "undefined") {
    const stored = normalizeAppLocale(window.localStorage.getItem(APP_LOCALE_STORAGE_KEY));
    if (stored) {
      return stored;
    }
  }
  if (typeof navigator !== "undefined") {
    const languages = navigator.languages?.length
      ? navigator.languages
      : navigator.language
        ? [navigator.language]
        : [];
    return detectAppLocale(languages);
  }
  return "ko";
}

export function persistAppLocale(locale: AppLocale) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, locale);
  window.dispatchEvent(new CustomEvent<AppLocale>(APP_LOCALE_CHANGED_EVENT, { detail: locale }));
}
