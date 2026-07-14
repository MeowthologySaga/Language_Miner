import type { LifeLogMetadata } from "../src/shared/types";
import {
  normalizeBridgeMultilineText,
  normalizeBridgeText
} from "./bridgeInputUtils";

export function normalizeWebReaderLifeMiningMetadata(value: unknown): LifeLogMetadata {
  const metadataInput = typeof value === "object" && value ? (value as Record<string, unknown>) : {};
  const metadata: LifeLogMetadata = {};
  for (const key of [
    "url",
    "title",
    "trigger",
    "capturedAt",
    "selectedText",
    "siteKey",
    "mode",
    "currentUserSpeaker",
    "contextMode",
    "contextBeforeCount",
    "contextAfterCount",
    "captureTarget",
    "captureScope",
    "filterLowSignalTargets"
  ]) {
    const normalized = normalizeBridgeText(metadataInput[key]).slice(0, 1000);
    if (normalized) {
      metadata[key] = normalized;
    }
  }
  const siteKey = normalizeBridgeText(metadataInput.siteKey);
  const messages = Array.isArray(metadataInput.messages)
    ? metadataInput.messages
        .slice(-36)
        .map((message) => {
          const messageInput = typeof message === "object" && message ? (message as Record<string, unknown>) : {};
          const role = normalizeBridgeText(messageInput.role);
          const rawContent = normalizeBridgeMultilineText(messageInput.raw_content).slice(0, 3000);
          if (!rawContent) {
            return null;
          }
          const normalizedRole: "user" | "assistant" | "system" | "other" =
            role === "user" || role === "assistant" || role === "system" || role === "other"
              ? role
              : "other";
          return {
            role: normalizedRole,
            speaker: normalizeBridgeText(messageInput.speaker).slice(0, 120) || undefined,
            raw_content: rawContent,
            timestamp: normalizeBridgeText(messageInput.timestamp).slice(0, 80) || undefined
          };
        })
        .filter((message): message is NonNullable<typeof message> => Boolean(message))
        .filter((message) => !isNoisyDiscordLifeLogMetadataMessage(siteKey, message.raw_content))
    : [];
  if (messages.length > 0) {
    metadata.messages = messages;
  }
  return metadata;
}

export function isNoisyDiscordLifeLogMetadataMessage(siteKey: string, text: string) {
  if (siteKey !== "discord") {
    return false;
  }
  const compact = normalizeBridgeText(text);
  if (!compact) {
    return true;
  }
  if (/^\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일$/u.test(compact)) {
    return true;
  }
  if (/^(?:today|yesterday)$/i.test(compact)) {
    return true;
  }
  if (/^(?:message\s+#|메시지\s+#)/i.test(compact)) {
    return true;
  }
  return /(?:님을 환영해요|서버에 오신 것을 환영|손을 흔들어|친구 초대하기|첫 메시지 보내기|Discord 앱 다운로드|계정 선택하기|로그인할 계정)/u.test(compact);
}