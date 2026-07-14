import { isWebReaderPracticeUrl } from "../src/shared/webReaderPractice";

export function isAllowedWebReaderUrl(rawUrl: string) {
  if (isWebReaderPracticeUrl(rawUrl)) return true;
  try {
    const url = new URL(rawUrl);
    if (url.username || url.password) return false;
    if (url.protocol === "https:") return true;
    if (url.protocol !== "http:") return false;
    const hostname = url.hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

export function normalizeWebReaderHttpUrl(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  const fallback = "https://en.wikipedia.org/wiki/English_language";
  if (!raw) return fallback;
  if (!isAllowedWebReaderUrl(raw)) {
    throw new Error(
      "Web Reader requires HTTPS. HTTP is allowed only for localhost, and only the built-in practice page may use the local practice protocol."
    );
  }
  return new URL(raw).toString();
}
