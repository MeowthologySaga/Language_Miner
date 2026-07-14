const REDACTED = "[REDACTED]";

/** Removes credentials before an external-service error is surfaced or logged. */
export function redactSecrets(value: unknown, secrets: Array<string | undefined> = []) {
  let redacted = value instanceof Error ? value.message : String(value ?? "");

  for (const candidate of secrets) {
    const secret = candidate?.trim();
    if (secret) {
      redacted = redacted.split(secret).join(REDACTED);
      try {
        redacted = redacted.split(encodeURIComponent(secret)).join(REDACTED);
      } catch {
        // Literal replacement above still covers malformed values.
      }
    }
  }

  return redacted
    .replace(
      /([?&](?:key|api_key|apikey|token|password)=)[^&\s]+/gi,
      `$1${REDACTED}`
    )
    .replace(
      /((?:x-goog-api-key|authorization)\s*[:=]\s*)(?:bearer\s+)?[^\s,;]+/gi,
      `$1${REDACTED}`
    );
}
