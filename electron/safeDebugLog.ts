import { redactSecrets } from "../src/shared/secretRedaction";

const REDACTED_CONTENT = "[CONTENT REDACTED]";
const REDACTED_LOCAL_PATH = "[LOCAL PATH REDACTED]";
const REDACTED_URL = "[URL REDACTED]";
const REDACTED_EMAIL = "[EMAIL REDACTED]";
const REDACTED_ERROR_DETAIL = "[ERROR DETAIL REDACTED]";
const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 100;
const MAX_OBJECT_KEYS = 100;
const MAX_STRING_LENGTH = 4_000;

const sensitiveKeyPattern = /(?:api.?key|secret|password|passwd|credential|authorization|cookie|session.?id|access.?token|refresh.?token|oauth.?token|private.?key)/i;

type RedactionKind = "secret" | "content" | "path" | "url" | "email";

const safeStructuralStringKeys = new Set([
  "action",
  "actionid",
  "code",
  "documentlanguage",
  "errorcode",
  "finishedat",
  "id",
  "kind",
  "label",
  "locale",
  "mode",
  "model",
  "modelname",
  "operationid",
  "phase",
  "provider",
  "providername",
  "readyat",
  "requestedlocale",
  "role",
  "route",
  "sitekey",
  "startedat",
  "state",
  "status",
  "storedlocale",
  "type",
  "updatedat"
]);

const contentKeyTokens = new Set([
  "answer",
  "body",
  "caption",
  "content",
  "context",
  "conversation",
  "debug",
  "description",
  "detail",
  "error",
  "example",
  "excerpt",
  "hint",
  "html",
  "input",
  "main",
  "markdown",
  "meaning",
  "message",
  "name",
  "note",
  "original",
  "output",
  "paragraph",
  "planned",
  "preferred",
  "prompt",
  "query",
  "question",
  "quote",
  "raw",
  "reason",
  "response",
  "selection",
  "sentence",
  "snapshot",
  "speech",
  "subtitle",
  "text",
  "title",
  "transcript",
  "transcription",
  "translation",
  "utterance"
]);

const urlKeyTokens = new Set([
  "endpoint",
  "endpoints",
  "host",
  "hostname",
  "href",
  "hrefs",
  "link",
  "links",
  "origin",
  "origins",
  "src",
  "uri",
  "uris",
  "url",
  "urls"
]);

/**
 * Produces a bounded JSON line that is safe to place in a local diagnostic log.
 * Credentials, original learning content, private paths, circular structures,
 * and unusually large values are removed before serialization.
 */
export function serializeSafeDebugLogEntry(
  input: unknown,
  explicitSecrets: Array<string | undefined> = []
) {
  const seen = new WeakSet<object>();
  const sanitized = sanitizeValue(input, explicitSecrets, seen, 0, "", "content");
  return JSON.stringify(sanitized);
}

function sanitizeValue(
  value: unknown,
  explicitSecrets: Array<string | undefined>,
  seen: WeakSet<object>,
  depth: number,
  key: string,
  inheritedRedaction: RedactionKind | null
): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Error) {
    const errorCode = (value as NodeJS.ErrnoException).code;
    return {
      name: sanitizeText(value.name, explicitSecrets),
      ...(typeof errorCode === "string" ? { code: sanitizeText(errorCode, explicitSecrets) } : {}),
      message: REDACTED_ERROR_DETAIL
    };
  }
  const normalizedKey = normalizeSemanticKey(key);
  const keyTokens = tokenizeSemanticKey(key);
  const safeStructuralKey = safeStructuralStringKeys.has(normalizedKey);
  const ownRedaction = safeStructuralKey ? null : classifyKeyRedaction(key, keyTokens);
  const effectiveRedaction = ownRedaction ?? inheritedRedaction;
  if (typeof value === "string") {
    const stringRedaction = safeStructuralKey ? null : effectiveRedaction;
    if (stringRedaction === "secret") return "[REDACTED]";
    if (stringRedaction === "content") return REDACTED_CONTENT;
    if (stringRedaction === "path") return REDACTED_LOCAL_PATH;
    if (stringRedaction === "url") return REDACTED_URL;
    if (stringRedaction === "email") return REDACTED_EMAIL;
    return sanitizeText(value, explicitSecrets);
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return String(value ?? "");
  if (depth >= MAX_DEPTH) return "[DEPTH REDACTED]";
  if (seen.has(value)) return "[CIRCULAR REDACTED]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) =>
      sanitizeValue(item, explicitSecrets, seen, depth + 1, "", effectiveRedaction)
    );
  }

  return Object.fromEntries(
    Object.entries(value)
      .slice(0, MAX_OBJECT_KEYS)
      .map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeValue(
          entryValue,
          explicitSecrets,
          seen,
          depth + 1,
          entryKey,
          effectiveRedaction
        )
      ])
  );
}

function classifyKeyRedaction(key: string, tokens: string[]): RedactionKind | null {
  if (sensitiveKeyPattern.test(key)) return "secret";
  if (tokens.some((token) => token === "email" || token === "emails")) return "email";
  if (tokens.some((token) => token === "path" || token === "paths")) return "path";
  if (tokens.some((token) => urlKeyTokens.has(token))) return "url";
  if (tokens.some((token) => contentKeyTokens.has(token))) return "content";
  return null;
}

function normalizeSemanticKey(key: string) {
  return key.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function tokenizeSemanticKey(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.toLowerCase())
    .filter(Boolean);
}

function sanitizeText(value: string, explicitSecrets: Array<string | undefined>) {
  return redactLocalPaths(redactSecrets(value, explicitSecrets)).slice(0, MAX_STRING_LENGTH);
}

function redactLocalPaths(value: string) {
  return value
    .replace(/file:\/\/{2,3}[^\s"'`<>]+/gi, REDACTED_LOCAL_PATH)
    .replace(/\\\\[^\\/\s"'`<>]+[\\/][^\s"'`<>]+/g, REDACTED_LOCAL_PATH)
    .replace(/\b[A-Za-z]:[\\/][^\s"'`<>]*/g, REDACTED_LOCAL_PATH)
    .replace(
      /\b[A-Za-z]:[\\/]Users[\\/][^\\/\s"'`<>]+(?:[\\/][^\s"'`<>]*)*/gi,
      REDACTED_LOCAL_PATH
    )
    .replace(
      /\/(?:Users|home)\/[^/\s"'`<>]+(?:\/[^\s"'`<>]*)*/g,
      REDACTED_LOCAL_PATH
    )
    .replace(/\b(?:https?|wss?|ftp):\/\/[^\s"'`<>]+/gi, REDACTED_URL)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, REDACTED_EMAIL);
}
