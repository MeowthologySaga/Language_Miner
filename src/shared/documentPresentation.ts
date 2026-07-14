import type { AppLocale } from "../appLocale";

const REDACTED_VALUE = "[REDACTED]";
const MAX_TECHNICAL_DETAIL_LENGTH = 2_000;

export function appLocaleFromLanguage(language: string | undefined): AppLocale {
  return language?.toLowerCase().startsWith("en") ? "en" : "ko";
}

export function documentLocaleTag(locale: AppLocale) {
  return locale === "en" ? "en-US" : "ko-KR";
}

export function documentBasename(filePath: string, fallback = "-") {
  const normalized = filePath.trim().replace(/[\\/]+$/, "");
  if (!normalized) {
    return fallback;
  }
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? fallback;
}

export function documentSafeTitle(title: string, filePath = "") {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) {
    return documentBasename(filePath);
  }
  if (
    normalizedTitle === filePath.trim() ||
    /^(?:file:\/{2,}|[a-z]:[\\/]|[\\/]{1,2})/i.test(normalizedTitle)
  ) {
    return documentBasename(normalizedTitle, documentBasename(filePath));
  }
  return normalizedTitle;
}

export function formatDocumentNumber(value: number, locale: AppLocale) {
  if (!Number.isFinite(value)) {
    return "-";
  }
  return new Intl.NumberFormat(documentLocaleTag(locale)).format(value);
}

export function formatDocumentDate(
  value: string,
  locale: AppLocale,
  includeTime = false
) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat(documentLocaleTag(locale), {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" as const } : {})
  }).format(date);
}

export function documentTechnicalError(error: unknown) {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const normalized = raw.trim();
  if (!normalized) {
    return "";
  }

  return normalized
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, `Bearer ${REDACTED_VALUE}`)
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, REDACTED_VALUE)
    .replace(
      /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*)[^\s,;]+/gi,
      `$1${REDACTED_VALUE}`
    )
    .replace(/file:\/{2,3}[^\s'"`<>]+/gi, "[LOCAL_PATH]")
    .replace(/[A-Za-z]:[\\/]Users[\\/][^\\/\r\n]+(?:[\\/][^\r\n]*)?/gi, "[LOCAL_PATH]")
    .replace(/\/(?:Users|home)\/[^/\r\n]+(?:\/[^\r\n]*)?/g, "[LOCAL_PATH]")
    .replace(/(?:^|\s)(?:[A-Za-z]:[\\/]|\\\\)[^\s,;)'"`<>]+/g, (match) =>
      match.startsWith(" ") ? " [LOCAL_PATH]" : "[LOCAL_PATH]"
    )
    .slice(0, MAX_TECHNICAL_DETAIL_LENGTH);
}
