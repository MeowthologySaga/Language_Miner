export const PRIVACY_LEARNING_DATA_CONFIRMATION = "DELETE LEARNING DATA";
export const PRIVACY_ALL_LOCAL_DATA_CONFIRMATION = "DELETE ALL LOCAL DATA";

export const privacyDataDeleteTargets = [
  "api_keys",
  "web_reader_login",
  "electron_cache",
  "learning_data",
  "all_local_data"
] as const;

export type PrivacyDataDeleteTarget = (typeof privacyDataDeleteTargets)[number];

export type PrivacyDataDeleteRequest = {
  target: PrivacyDataDeleteTarget;
  confirmation?: string;
};

export const privacyDataOperationNames = [
  "apiKeys",
  "webReaderLogin",
  "electronCache",
  "learningDatabase",
  "managedFiles",
  "rendererStorage",
  "extensionQueue"
] as const;

export type PrivacyDataOperationName = (typeof privacyDataOperationNames)[number];

export type PrivacyDataOperationStatus =
  | "not_requested"
  | "pending"
  | "empty"
  | "cleared"
  | "partial"
  | "failed";

export type PrivacyDataDeletePhase = "complete" | "pending" | "partial" | "failed";

export type PrivacyRendererStorageScope = "learning" | "all";

export type PrivacyRendererCleanupReport = {
  scope: PrivacyRendererStorageScope;
  attemptedKeys: number;
  removedKeys: number;
  remainingKeys: number;
  failedKeys: number;
  verified: boolean;
};

export type PrivacyExtensionQueueClearStatus =
  | { status: "unknown" }
  | { status: "pending"; requestId: string; requestedAt: string; expiresAt: string }
  | {
      status: "cleared";
      requestId: string;
      requestedAt: string;
      acknowledgedAt: string;
      removedItems: number;
      remainingItems: 0;
    }
  | {
      status: "incomplete";
      requestId: string;
      requestedAt: string;
      acknowledgedAt: string;
      removedItems: number;
      remainingItems: number;
    }
  | { status: "expired"; requestId: string };

export type PrivacyDatabaseDeleteVerification = {
  remainingRows: number;
  freelistPages: number;
  integrityOk: boolean;
  durableCopiesVerified: boolean;
};

export type PrivacyDataVerification = {
  secureSettingsRemaining: number;
  webReaderCookiesRemaining: number;
  electronCacheBytesRemaining: number;
  managedPathEntriesRemaining: number;
  database?: PrivacyDatabaseDeleteVerification;
};

export type PrivacyDatabaseDeleteCounts = {
  cards: number;
  vocabularyItems: number;
  highlightMappings: number;
  lifeLogs: number;
  listeningVideoCandidates: number;
  listeningTranscripts: number;
  reviews: number;
  translationCacheEntries: number;
  exportRecords: number;
  diamondWallets: number;
  diamondTransactions: number;
  missionEvents: number;
  dailyMissionProgress: number;
  totalRows: number;
};

export type PrivacyDataDeleteCounts = {
  apiKeys: number;
  webReaderCookies: number;
  cacheSessions: number;
  databaseRows: number;
  files: number;
  directories: number;
  bytes: number;
  rendererStorageKeys: number;
  extensionQueueItems: number;
};

export type PrivacyDataWarningCode =
  | "secure_settings_clear_failed"
  | "web_reader_login_clear_failed"
  | "electron_cache_clear_failed"
  | "learning_database_clear_failed"
  | "learning_database_verification_failed"
  | "managed_file_clear_failed"
  | "managed_file_verification_failed"
  | "secure_settings_verification_failed"
  | "web_reader_login_verification_failed"
  | "electron_cache_verification_failed"
  | "renderer_storage_clear_failed"
  | "extension_queue_verification_pending"
  | "extension_queue_verification_failed"
  | "symbolic_link_skipped"
  | "unsafe_path_skipped";

export type PrivacyDataWarning = {
  code: PrivacyDataWarningCode;
  area: PrivacyDataOperationName;
};

export type PrivacyDataDeleteResult = {
  target: PrivacyDataDeleteTarget;
  ok: boolean;
  phase: PrivacyDataDeletePhase;
  operationId?: string;
  completedAt: string;
  operations: Record<PrivacyDataOperationName, PrivacyDataOperationStatus>;
  counts: PrivacyDataDeleteCounts;
  databaseCounts?: PrivacyDatabaseDeleteCounts;
  verification: PrivacyDataVerification;
  extensionQueueStatus?: PrivacyExtensionQueueClearStatus;
  warnings: PrivacyDataWarning[];
  rendererResetRequired: boolean;
  extensionQueueManualClearRequired: boolean;
  restartRecommended: boolean;
};

export type PrivacyRendererCleanupRequest = {
  operationId: string;
  report: PrivacyRendererCleanupReport;
};

export function isPrivacyDataDeleteTarget(value: unknown): value is PrivacyDataDeleteTarget {
  return typeof value === "string" && privacyDataDeleteTargets.includes(value as PrivacyDataDeleteTarget);
}
