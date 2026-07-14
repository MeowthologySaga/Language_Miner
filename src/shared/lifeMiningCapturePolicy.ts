import type { LifeMinerCaptureInput } from "./lifeLogCapture";
import { normalizeLifeLogMessages, normalizeRawLifeLogContent } from "./lifeLogMessages";
import { normalizeLifeMiningCaptureSettings } from "./lifeMiningSettings";
import type {
  BrowserCaptureSiteSettings,
  LifeLogMessage,
  LifeMiningCaptureSettings
} from "./types";

export type LifeMiningCapturePolicyResult =
  | { accepted: true; input: LifeMinerCaptureInput }
  | { accepted: false; reason: "too_long" | "summary_not_available" };

export function applyLifeMiningCapturePolicy(
  input: LifeMinerCaptureInput,
  rawSettings: Partial<LifeMiningCaptureSettings> | null | undefined
): LifeMiningCapturePolicyResult {
  const settings = normalizeLifeMiningCaptureSettings(rawSettings);
  const rawText = normalizeRawLifeLogContent(input.text);
  if (rawText.length > settings.maxMessageChars && settings.longMessageMode === "skip") {
    return { accepted: false, reason: "too_long" };
  }
  if (rawText.length > settings.maxMessageChars && settings.longMessageMode === "summarize") {
    return { accepted: false, reason: "summary_not_available" };
  }
  const text = rawText.slice(0, settings.maxMessageChars);
  const messages = normalizeLifeLogMessages(input.metadata?.messages);
  const targetIndex = findTargetMessageIndex(messages, rawText);
  const beforeMessages = targetIndex >= 0 ? messages.slice(0, targetIndex) : messages;
  const afterMessages = targetIndex >= 0 ? messages.slice(targetIndex + 1) : [];
  const includeContext = settings.target !== "own" && settings.contextMode !== "none";
  const beforeLimit = includeContext ? getBeforeContextLimit(settings) : 0;
  const afterLimit = includeContext ? getAfterContextLimit(settings) : 0;
  const selectedBefore = beforeLimit > 0
    ? beforeMessages
        .slice(-beforeLimit)
        .map((message) => truncateMessage(message, settings.maxMessageChars))
    : [];
  const selectedAfter = afterLimit > 0
    ? afterMessages
        .slice(0, afterLimit)
        .map((message) => truncateMessage(message, settings.maxMessageChars))
    : [];
  const currentUserMessage: LifeLogMessage = {
    role: "user",
    speaker:
      typeof input.metadata?.currentUserSpeaker === "string"
        ? input.metadata.currentUserSpeaker.slice(0, 80)
        : "나",
    raw_content: text,
    ...(typeof input.metadata?.capturedAt === "string"
      ? { timestamp: input.metadata.capturedAt }
      : {})
  };

  return {
    accepted: true,
    input: {
      ...input,
      text,
      beforeContext: formatContext(selectedBefore),
      afterContext: formatContext(selectedAfter),
      metadata: {
        ...input.metadata,
        messages: [...selectedBefore, currentUserMessage, ...selectedAfter],
        captureTarget: settings.target,
        captureScope: settings.scope,
        contextMode: settings.contextMode
      }
    }
  };
}

export function getBrowserCaptureSiteKey(
  input: Pick<LifeMinerCaptureInput, "appName" | "metadata">
): keyof BrowserCaptureSiteSettings {
  const appName = String(input.appName ?? "").toLowerCase();
  const hostname = getHostname(input.metadata?.url);
  if (appName.includes("discord") || hostname === "discord.com") return "discord";
  if (appName.includes("chatgpt") || hostname === "chatgpt.com" || hostname === "chat.openai.com") {
    return "chatgpt";
  }
  if (appName.includes("claude") || hostname === "claude.ai") return "claude";
  if (appName.includes("youtube") || hostname.endsWith("youtube.com")) return "youtube";
  if (appName.includes("reddit") || hostname.endsWith("reddit.com")) return "reddit";
  return "genericWeb";
}

export function isBrowserCaptureSiteAllowed(
  input: Pick<LifeMinerCaptureInput, "appName" | "metadata">,
  settings: BrowserCaptureSiteSettings
) {
  return settings[getBrowserCaptureSiteKey(input)] === true;
}

function findTargetMessageIndex(messages: LifeLogMessage[], rawText: string) {
  const target = normalizeComparableText(rawText);
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (normalizeComparableText(messages[index].raw_content) === target) return index;
  }
  return -1;
}

function normalizeComparableText(value: unknown) {
  return normalizeRawLifeLogContent(value).replace(/\s+/g, " ").toLocaleLowerCase();
}

function getBeforeContextLimit(settings: LifeMiningCaptureSettings) {
  if (settings.contextMode === "previous_1") return 1;
  if (settings.contextMode === "previous_2") return 2;
  return settings.contextBeforeCount;
}

function getAfterContextLimit(settings: LifeMiningCaptureSettings) {
  return settings.contextMode === "previous_and_next" || settings.contextMode === "recent"
    ? settings.contextAfterCount
    : 0;
}

function truncateMessage(message: LifeLogMessage, maxChars: number): LifeLogMessage {
  return { ...message, raw_content: message.raw_content.slice(0, maxChars) };
}

function formatContext(messages: LifeLogMessage[]) {
  if (!messages.length) return undefined;
  return messages
    .map((message) => `${message.speaker || "상대"}: ${message.raw_content}`)
    .join("\n");
}

function getHostname(value: unknown) {
  try {
    return new URL(typeof value === "string" ? value : "").hostname.toLowerCase();
  } catch {
    return "";
  }
}
