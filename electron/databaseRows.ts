import { createHash } from "node:crypto";
import { normalizeCardDeck } from "../src/shared/cardDeck";
import { normalizeLifeLogMessages } from "../src/shared/lifeLogMessages";
import { normalizeProcessedProfileIds } from "../src/shared/lifeLogProgress";
import { DEFAULT_PROFILE_ID } from "../src/shared/profiles";
import type {
  BilingualExportHistoryRecord,
  DailyMissionProgress,
  DiamondTransaction,
  DiamondWallet,
  LifeLog,
  LifeLogMetadata,
  ListeningTranscript,
  ListeningVideoCandidate,
  ListeningVideoCandidateInput,
  ProfileId,
  StudyCard,
  TranslationCacheEntry,
  TranslationCacheLookupInput,
  TranslationProviderName
} from "../src/shared/types";

export type SqlValue = string | number | null;

export type CardRow = {
  id: string;
  profile_id: string | null;
  card_type: string;
  source_sentence: string;
  target_text: string | null;
  front_text: string;
  literal_translation_ko: string | null;
  natural_translation_ko: string | null;
  structure_note: string | null;
  card_json: string;
  created_at: string;
  updated_at: string;
  due_at: string;
  interval_days: number;
  ease_factor: number;
  review_count: number;
  lapse_count: number;
  last_reviewed_at: string | null;
};

export type LifeLogRow = {
  id: string;
  text: string;
  before_context: string | null;
  after_context: string | null;
  app_name: string | null;
  metadata_json: string | null;
  source_type: LifeLog["sourceType"];
  processed: number;
  created_at: string;
};

export type ListeningVideoCandidateRow = {
  id: string;
  source_type: ListeningVideoCandidate["sourceType"];
  video_id: string;
  url: string;
  title: string;
  language_code: string | null;
  channel_name: string | null;
  channel_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  watched_seconds: number | null;
  progress_ratio: number | null;
  last_position_seconds: number | null;
  metadata_json: string | null;
  first_seen_at: string;
  last_seen_at: string;
  watch_count: number;
};

export type ListeningTranscriptRow = {
  id: string;
  candidate_id: string;
  video_id: string;
  title: string;
  channel_name: string | null;
  language_code: string | null;
  status: ListeningTranscript["status"];
  segments_json: string;
  error_message: string | null;
  audio_path: string | null;
  model_name: string;
  created_at: string;
  updated_at: string;
};

export type TranslationCacheRow = {
  id: string;
  profile_id: string | null;
  cache_key: string;
  provider_name: TranslationProviderName;
  source_lang: string;
  target_lang: string;
  source_hash: string;
  source_text: string;
  translated_text: string;
  model: string | null;
  prompt_version: string | null;
  context_hash: string | null;
  created_at: string;
  updated_at: string;
};

export type ExportRecordRow = {
  id: string;
  profile_id: string | null;
  title: string;
  file_path: string;
  file_type: BilingualExportHistoryRecord["fileType"];
  page_range: string;
  page_count: number;
  segment_count: number;
  provider_label: string;
  source_language_label: string;
  target_language_label: string;
  created_at: string;
};

export type DiamondWalletRow = {
  id: string;
  balance: number;
  total_earned: number;
  total_spent: number;
  updated_at: string;
};

export type DiamondTransactionRow = {
  id: string;
  transaction_type: DiamondTransaction["type"];
  amount: number;
  balance_after: number;
  reason: string;
  mission_id: string | null;
  profile_id: string | null;
  date_key: string;
  created_at: string;
};

export type MissionProgressRow = {
  date_key: string;
  mission_id: DailyMissionProgress["missionId"];
  progress: number;
  claimed: number;
  claimed_at: string | null;
  updated_at: string;
};

export function cardFromRow(row: CardRow): StudyCard {
  const parsed = JSON.parse(row.card_json) as StudyCard & {
    createdAt?: string;
    updatedAt?: string;
  };

  return {
    ...normalizeCardDeck(parsed),
    profileId: row.profile_id ?? parsed.profileId ?? DEFAULT_PROFILE_ID,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    srs: {
      dueAt: row.due_at,
      intervalDays: row.interval_days,
      easeFactor: row.ease_factor,
      reviewCount: row.review_count,
      lapseCount: row.lapse_count,
      lastReviewedAt: row.last_reviewed_at ?? undefined
    }
  };
}

export function lifeLogFromRow(row: LifeLogRow): LifeLog {
  return {
    id: row.id,
    text: row.text,
    beforeContext: row.before_context ?? undefined,
    afterContext: row.after_context ?? undefined,
    appName: row.app_name ?? undefined,
    metadata: parseLifeLogMetadata(row.metadata_json),
    sourceType: row.source_type,
    processed: row.processed === 1,
    createdAt: row.created_at
  };
}

export function translationCacheFromRow(row: TranslationCacheRow): TranslationCacheEntry {
  return {
    id: row.id,
    profileId: row.profile_id ?? DEFAULT_PROFILE_ID,
    providerName: row.provider_name,
    sourceLang: row.source_lang,
    targetLang: row.target_lang,
    sourceHash: row.source_hash,
    sourceText: row.source_text,
    translatedText: row.translated_text,
    model: row.model ?? undefined,
    promptVersion: row.prompt_version ?? undefined,
    contextHash: row.context_hash ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function exportRecordFromRow(row: ExportRecordRow): BilingualExportHistoryRecord {
  return {
    id: row.id,
    profileId: row.profile_id ?? DEFAULT_PROFILE_ID,
    title: row.title,
    filePath: row.file_path,
    fileType: row.file_type,
    pageRange: row.page_range,
    pageCount: row.page_count,
    segmentCount: row.segment_count,
    providerLabel: row.provider_label,
    sourceLanguageLabel: row.source_language_label,
    targetLanguageLabel: row.target_language_label,
    createdAt: row.created_at
  };
}

export function createDefaultWallet(): DiamondWallet {
  return {
    balance: 0,
    totalEarned: 0,
    totalSpent: 0,
    updatedAt: new Date().toISOString()
  };
}

export function walletFromRow(row: DiamondWalletRow): DiamondWallet {
  return {
    balance: row.balance,
    totalEarned: row.total_earned,
    totalSpent: row.total_spent,
    updatedAt: row.updated_at
  };
}

export function diamondTransactionFromRow(row: DiamondTransactionRow): DiamondTransaction {
  return {
    id: row.id,
    type: row.transaction_type,
    amount: row.amount,
    balanceAfter: row.balance_after,
    reason: row.reason,
    missionId: isMissionTransactionId(row.mission_id) ? row.mission_id : undefined,
    profileId: row.profile_id ?? undefined,
    dateKey: row.date_key,
    createdAt: row.created_at
  };
}

export function missionProgressFromRow(row: MissionProgressRow): DailyMissionProgress {
  return {
    dateKey: row.date_key,
    missionId: row.mission_id,
    progress: row.progress,
    claimed: row.claimed === 1,
    claimedAt: row.claimed_at ?? undefined,
    updatedAt: row.updated_at
  };
}

function isMissionTransactionId(
  value: string | null
): value is Exclude<DiamondTransaction["missionId"], undefined> {
  return (
    value === "review-10" ||
    value === "review-30" ||
    value === "review-input-reading-deck" ||
    value === "review-input-listening-deck" ||
    value === "review-output-deck" ||
    value === "card-2" ||
    value === "life-mining-card-5" ||
    value === "writing-3" ||
    value === "writing-10" ||
    value === "listening-30" ||
    value === "daily-bonus"
  );
}

export function normalizeMissionAmount(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.max(1, Math.floor(parsed));
}

export function parseLifeLogMetadata(value: string | null): LifeLogMetadata | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const metadata: LifeLogMetadata = {};
    for (const [key, entryValue] of Object.entries(parsed)) {
      if (key === "processedProfileIds") {
        const processedProfileIds = normalizeProcessedProfileIds(entryValue);
        if (processedProfileIds.length) {
          metadata.processedProfileIds = processedProfileIds;
        }
        continue;
      }

      if (key === "messages") {
        const messages = normalizeLifeLogMessages(entryValue);
        if (messages.length) {
          metadata.messages = messages;
        }
        continue;
      }

      if (typeof entryValue === "boolean") {
        metadata[key] = entryValue;
        continue;
      }

      if (typeof entryValue === "string" && entryValue.trim()) {
        metadata[key] = entryValue;
      }
    }

    return Object.keys(metadata).length ? metadata : undefined;
  } catch {
    return undefined;
  }
}

export function listeningVideoCandidateFromRow(
  row: ListeningVideoCandidateRow
): ListeningVideoCandidate {
  return {
    id: row.id,
    sourceType: row.source_type,
    videoId: row.video_id,
    url: row.url,
    title: row.title,
    languageCode: row.language_code ?? undefined,
    channelName: row.channel_name ?? undefined,
    channelUrl: row.channel_url ?? undefined,
    thumbnailUrl: row.thumbnail_url ?? undefined,
    durationSeconds: row.duration_seconds ?? undefined,
    watchedSeconds: row.watched_seconds ?? undefined,
    progressRatio: row.progress_ratio ?? undefined,
    lastPositionSeconds: row.last_position_seconds ?? undefined,
    metadata: parseListeningCandidateMetadata(row.metadata_json),
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    watchCount: row.watch_count
  };
}

export function listeningTranscriptFromRow(row: ListeningTranscriptRow): ListeningTranscript {
  return {
    id: row.id,
    candidateId: row.candidate_id,
    videoId: row.video_id,
    title: row.title,
    channelName: row.channel_name ?? undefined,
    languageCode: row.language_code ?? undefined,
    status: normalizeListeningTranscriptStatus(row.status),
    segments: parseListeningTranscriptSegments(row.segments_json),
    errorMessage: row.error_message ?? undefined,
    audioPath: row.audio_path ?? undefined,
    modelName: row.model_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeListeningTranscriptStatus(status: string): ListeningTranscript["status"] {
  if (status === "ready" || status === "processing" || status === "failed") {
    return status;
  }
  return "failed";
}

function parseListeningTranscriptSegments(value: string) {
  try {
    const parsed = JSON.parse(value) as ListeningTranscript["segments"];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getListeningVideoCandidateId(input: ListeningVideoCandidateInput) {
  return hashText(`${input.sourceType}:${input.videoId.trim()}`);
}

function parseListeningCandidateMetadata(value: string | null) {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const entries = Object.entries(parsed).filter((entry) => {
      const valueType = typeof entry[1];
      return valueType === "string" || valueType === "number" || valueType === "boolean";
    }) as [string, string | number | boolean][];
    return entries.length ? Object.fromEntries(entries) : undefined;
  } catch {
    return undefined;
  }
}

export function mergeListeningCandidateMetadata(
  existing: ListeningVideoCandidate["metadata"],
  next: ListeningVideoCandidateInput["metadata"]
) {
  const merged = {
    ...(existing ?? {}),
    ...(next ?? {})
  };
  const entries = Object.entries(merged).filter((entry) => {
    const valueType = typeof entry[1];
    return valueType === "string" || valueType === "number" || valueType === "boolean";
  }) as [string, string | number | boolean][];
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function normalizeOptionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function normalizeOptionalNumber(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, value);
}

export function getTranslationCacheKey(input: TranslationCacheLookupInput) {
  return [
    normalizeProfileId(input.profileId),
    input.providerName,
    normalizeSourceLang(input.sourceLang),
    normalizeTargetLang(input.targetLang),
    normalizeTranslationModel(input.model),
    normalizePromptVersion(input.promptVersion),
    normalizeContextHash(input.contextHash),
    hashText(normalizeTranslationText(input.text))
  ].join(":");
}

export function normalizeProfileId(profileId: ProfileId | undefined) {
  return profileId?.trim() || DEFAULT_PROFILE_ID;
}

export function normalizeTranslationText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function normalizeSourceLang(sourceLang?: string) {
  return sourceLang?.trim() || "auto";
}

export function normalizeTargetLang(targetLang: string) {
  return targetLang.trim() || "ko";
}

export function normalizeTranslationModel(model?: string) {
  return model?.trim() || "legacy-model";
}

export function normalizePromptVersion(promptVersion?: string) {
  return promptVersion?.trim() || "legacy-prompt";
}

export function normalizeContextHash(contextHash?: string) {
  return contextHash?.trim() || "no-context";
}

export function hashText(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
