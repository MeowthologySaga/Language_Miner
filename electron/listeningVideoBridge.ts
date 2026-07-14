import {
  getYouTubeVideoId,
  normalizeBridgeNumber,
  normalizeBridgeText,
  normalizeYouTubeVideoId,
  sanitizeListeningMetadata
} from "./bridgeInputUtils";
import type { ListeningVideoCandidateInput } from "../src/shared/types";

const captureKeySeparator = "\u001f";

export function prepareListeningVideoCandidate(
  payload: ListeningVideoCandidateInput,
  sourceTypeOverride?: ListeningVideoCandidateInput["sourceType"]
): ListeningVideoCandidateInput | null {
  const videoId = normalizeYouTubeVideoId(payload.videoId) || getYouTubeVideoId(payload.url);
  const title = normalizeBridgeText(payload.title).slice(0, 240);
  if (!videoId || !title) {
    return null;
  }

  const url = normalizeBridgeText(payload.url) || `https://www.youtube.com/watch?v=${videoId}`;
  return {
    videoId,
    url,
    title,
    sourceType: sourceTypeOverride ?? payload.sourceType,
    languageCode: normalizeBridgeText(payload.languageCode).slice(0, 16) || undefined,
    channelName: normalizeBridgeText(payload.channelName).slice(0, 120) || undefined,
    channelUrl: normalizeBridgeText(payload.channelUrl).slice(0, 500) || undefined,
    thumbnailUrl:
      normalizeBridgeText(payload.thumbnailUrl).slice(0, 500) ||
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    durationSeconds: normalizeBridgeNumber(payload.durationSeconds),
    watchedSeconds: normalizeBridgeNumber(payload.watchedSeconds),
    progressRatio: normalizeBridgeNumber(payload.progressRatio),
    lastPositionSeconds: normalizeBridgeNumber(payload.lastPositionSeconds),
    collectedAt: payload.collectedAt || new Date().toISOString(),
    metadata: sanitizeListeningMetadata(payload.metadata)
  };
}

export function isDuplicateListeningVideoCapture(
  recentCaptures: Map<string, number>,
  input: ListeningVideoCandidateInput,
  dedupeMs: number,
  now = Date.now()
) {
  for (const [key, capturedAt] of recentCaptures.entries()) {
    if (now - capturedAt > dedupeMs) {
      recentCaptures.delete(key);
    }
  }

  const key = [input.sourceType, input.videoId].join(captureKeySeparator);
  const previous = recentCaptures.get(key);
  recentCaptures.set(key, now);
  return previous !== undefined && now - previous < dedupeMs;
}
