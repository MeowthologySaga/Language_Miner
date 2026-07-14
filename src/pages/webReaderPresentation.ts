import type { WebReaderHubModel, WebReaderHubSource } from "./webReaderHub";

export type WebReaderHubLocalization = {
  categoryLabels: Readonly<Record<string, string>>;
  customCategoryLabel: string;
  customSourceDescription: string;
  intentCopyByUrl: Readonly<Record<string, { label: string; description: string }>>;
  otherLanguageSourceDescription: string;
  sourceDescriptionsByUrl: Readonly<Record<string, string>>;
  sourceLabelsByUrl?: Readonly<Record<string, string>>;
};

export function localizeWebReaderHubModel(
  model: WebReaderHubModel,
  copy: WebReaderHubLocalization
): WebReaderHubModel {
  const localizeSource = (source: WebReaderHubSource, otherLanguage = false) => ({
    ...source,
    label: source.isCustom
      ? source.label
      : copy.sourceLabelsByUrl?.[source.url] ?? source.label,
    description: source.isCustom
      ? source.description ||
        (otherLanguage ? copy.otherLanguageSourceDescription : copy.customSourceDescription)
      : copy.sourceDescriptionsByUrl[source.url] ?? source.description
  });

  return {
    categories: model.categories.map((category) => ({
      ...category,
      label: category.isCustom
        ? category.label || copy.customCategoryLabel
        : copy.categoryLabels[category.id] ?? category.label,
      sources: category.sources.map((source) => localizeSource(source))
    })),
    intents: model.intents.map((intent) => ({
      ...intent,
      ...(copy.intentCopyByUrl[intent.url] ?? {})
    })),
    featured: model.featured.map((source) => localizeSource(source)),
    otherLanguageSources: model.otherLanguageSources.map((source) =>
      localizeSource(source, true)
    )
  };
}

const SENSITIVE_QUERY_PARAMETER =
  /(?:api[-_]?key|access[-_]?token|auth|authorization|credential|password|secret|session|signature|token)/i;
const REDACTED_CREDENTIAL = ["red", "acted"].join("");

export function formatSafeWebReaderAddress(value: string, localContentLabel: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return localContentLabel;
    }
    if (url.username) {
      url.username = REDACTED_CREDENTIAL;
    }
    if (url.password) {
      url.password = REDACTED_CREDENTIAL;
    }
    for (const [name] of url.searchParams) {
      if (SENSITIVE_QUERY_PARAMETER.test(name)) {
        url.searchParams.set(name, "redacted");
      }
    }
    if (
      SENSITIVE_QUERY_PARAMETER.test(url.hash) ||
      /^[A-Za-z0-9._~+\/-]{48,}$/.test(url.hash.slice(1))
    ) {
      url.hash = "";
    }
    return url.toString();
  } catch {
    return localContentLabel;
  }
}

const LOCAL_PATH_FRAGMENT = /(?:^|[\s"'`])(?:[a-z]:\\|\\\\|\/(?:users|home)\/)/i;

export function formatSafeWebReaderTitle(value: string, fallback: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || LOCAL_PATH_FRAGMENT.test(normalized) || /\bfile:\/\//i.test(normalized)) {
    return fallback;
  }
  if (/^https?:\/\//i.test(normalized)) {
    return formatSafeWebReaderAddress(normalized, fallback).slice(0, 180);
  }
  return normalized
    .replace(
      /\b(api[-_]?key|access[-_]?token|authorization|credential|password|secret|session|signature|token)(\s*[:=]\s*)[^\s&]+/gi,
      "$1$2redacted"
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer redacted")
    .slice(0, 180);
}
