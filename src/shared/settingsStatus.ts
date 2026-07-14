import type { AppSettings } from "./types";
import { documentTechnicalError } from "./documentPresentation";

type SensitiveSettings = Pick<AppSettings, "geminiApiKey" | "googleTranslateApiKey">;

const CONFIGURED_SECRET_REDACTION = "[secret redacted]";
const API_KEY_REDACTION = "[API key redacted]";
const REDACTED_ASSIGNMENT_PATTERN =
  /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|client[_-]?secret|secret|password)\s*[:=]\s*\[(?:secret|API key) redacted\]/gi;
const PRIVATE_USE_MARKER_START = 0xe000;
const PRIVATE_USE_MARKER_END = 0xf8ff;

export function sanitizeSettingsStatusMessage(message: string, settings: SensitiveSettings) {
  const secretSanitized = sanitizeSecretStatusMessage(message, [
    settings.geminiApiKey,
    settings.googleTranslateApiKey
  ]);
  const protectedAssignments = protectRedactedAssignments(secretSanitized);
  let sanitized = documentTechnicalError(protectedAssignments.message);
  for (const { marker, value } of protectedAssignments.values) {
    sanitized = sanitized.split(marker).join(value);
  }
  return sanitized;
}

function protectRedactedAssignments(message: string) {
  const values: Array<{ marker: string; value: string }> = [];
  let nextMarkerCode = PRIVATE_USE_MARKER_START;
  const protectedMessage = message.replace(REDACTED_ASSIGNMENT_PATTERN, (value) => {
    while (
      nextMarkerCode <= PRIVATE_USE_MARKER_END &&
      message.includes(String.fromCharCode(nextMarkerCode))
    ) {
      nextMarkerCode += 1;
    }
    if (nextMarkerCode > PRIVATE_USE_MARKER_END) {
      return value;
    }
    const marker = String.fromCharCode(nextMarkerCode);
    nextMarkerCode += 1;
    values.push({ marker, value });
    return marker;
  });
  return { message: protectedMessage, values };
}

export function sanitizeSecretStatusMessage(message: string, sensitiveValues: string[] = []) {
  const normalizedSensitiveValues = sensitiveValues
    .map((value) => value.trim())
    .filter((value) => value.length >= 6);

  let sanitized = message;
  for (const value of normalizedSensitiveValues) {
    sanitized = sanitized.split(value).join(CONFIGURED_SECRET_REDACTION);
  }

  return sanitized
    .replace(/\bAIza[0-9A-Za-z_-]{10,}\b/g, API_KEY_REDACTION)
    .replace(/\bsk-[0-9A-Za-z_-]{10,}\b/g, API_KEY_REDACTION)
    .replace(/\bya29\.[0-9A-Za-z_-]{10,}\b/g, API_KEY_REDACTION)
    .replace(/\bgh[pousr]_[0-9A-Za-z_]{10,}\b/g, API_KEY_REDACTION)
    .replace(
      /\b(api[_-]?key|access[_-]?token|auth[_-]?token|secret|password)\s*[:=]\s*["']?[0-9A-Za-z._~+/=-]{12,}["']?/gi,
      `$1=${CONFIGURED_SECRET_REDACTION}`
    );
}
