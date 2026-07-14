import type { ListeningVideoCandidateInput } from "../src/shared/types";

export function normalizeBridgeNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.max(0, parsed);
}

export function normalizeBridgeText(value: unknown) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeBridgeMultilineText(value: unknown) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function sanitizeListeningMetadata(metadata: ListeningVideoCandidateInput["metadata"]) {
  if (!metadata) {
    return undefined;
  }
  const entries = Object.entries(metadata)
    .filter((entry) => {
      const valueType = typeof entry[1];
      return valueType === "string" || valueType === "number" || valueType === "boolean";
    })
    .slice(0, 20) as [string, string | number | boolean][];
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function normalizeYouTubeVideoId(value: unknown) {
  const normalized = normalizeBridgeText(value);
  return /^[A-Za-z0-9_-]{6,20}$/.test(normalized) ? normalized : "";
}

export function getYouTubeVideoId(value: unknown) {
  const normalized = normalizeBridgeText(value);
  if (!normalized) {
    return "";
  }
  try {
    const url = new URL(normalized);
    if (url.hostname.includes("youtu.be")) {
      return normalizeYouTubeVideoId(url.pathname.replace("/", ""));
    }
    return normalizeYouTubeVideoId(url.searchParams.get("v"));
  } catch {
    return "";
  }
}
