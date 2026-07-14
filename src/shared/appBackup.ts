export const APP_BACKUP_FORMAT = "language-miner-backup" as const;
export const APP_BACKUP_SCHEMA_VERSION = 1 as const;
export const APP_BACKUP_MAX_BYTES = 64 * 1024 * 1024;
export const APP_BACKUP_MAX_RENDERER_ENTRY_BYTES = 5 * 1024 * 1024;
export const APP_BACKUP_MAX_PLAY_ZONE_SAVE_BYTES = 5 * 1024 * 1024;
export const APP_BACKUP_MAX_ROWS_PER_TABLE = 250_000;

export const appBackupTableNames = [
  "cards",
  "vocabulary_items",
  "highlight_mappings",
  "life_logs",
  "listening_video_candidates",
  "listening_transcripts",
  "reviews",
  "export_records",
  "diamond_wallet",
  "diamond_transactions",
  "mission_events",
  "daily_mission_progress"
] as const;

export type AppBackupTableName = (typeof appBackupTableNames)[number];
export type AppBackupScalar = string | number | null;
export type AppBackupRow = Record<string, AppBackupScalar>;

export type AppBackupDatabaseSnapshot = {
  schemaVersion: typeof APP_BACKUP_SCHEMA_VERSION;
  tables: Record<AppBackupTableName, AppBackupRow[]>;
};

export type AppBackupRendererSnapshot = {
  entries: Record<string, string>;
  excludedKeys: string[];
};

export type AppBackupPlayZoneSave = {
  cartridgeId: string;
  schemaVersion?: string;
  updatedAt: string;
  data: unknown;
};

export type AppBackupManifest = {
  format: typeof APP_BACKUP_FORMAT;
  schemaVersion: typeof APP_BACKUP_SCHEMA_VERSION;
  appVersion: string;
  createdAt: string;
  profileIds: string[];
  includedStores: string[];
  excludedStores: string[];
  redactions: string[];
};

export type AppBackupPayload = {
  database: AppBackupDatabaseSnapshot;
  renderer: AppBackupRendererSnapshot;
  playZoneSaves: AppBackupPlayZoneSave[];
};

export type AppBackupDocument = {
  manifest: AppBackupManifest;
  payload: AppBackupPayload;
  checksumSha256: string;
};

export type AppBackupRestoreMode = "merge" | "replace" | "new_profile";

export type AppBackupPreviewWarning =
  | "secrets-and-local-files-excluded"
  | "replace-removes-current-data"
  | "device-global-data-preserved";

export type AppBackupRestoreEstimate = {
  profileConflicts: number;
  profilesAdded: number;
  itemsAdded: number;
  itemsOverwritten: number;
  itemsSkipped: number;
};

export type AppBackupPreview = {
  handleId: string;
  expiresAt: number;
  manifest: AppBackupManifest;
  counts: Record<AppBackupTableName, number>;
  rendererEntryCount: number;
  playZoneSaveCount: number;
  warnings: AppBackupPreviewWarning[];
  estimates: Record<AppBackupRestoreMode, AppBackupRestoreEstimate>;
};

export type AppBackupRestoreResult = {
  restored: boolean;
  counts: Record<AppBackupTableName, number>;
  renderer: AppBackupRendererSnapshot;
  profileIdMap: Record<string, string>;
  rollbackHandle: string;
  safetyBackupPath?: string;
};

export function createEmptyAppBackupTables(): Record<AppBackupTableName, AppBackupRow[]> {
  return Object.fromEntries(appBackupTableNames.map((name) => [name, []])) as unknown as Record<
    AppBackupTableName,
    AppBackupRow[]
  >;
}

export function summarizeAppBackupTables(
  snapshot: AppBackupDatabaseSnapshot
): Record<AppBackupTableName, number> {
  return Object.fromEntries(
    appBackupTableNames.map((name) => [name, snapshot.tables[name]?.length ?? 0])
  ) as unknown as Record<AppBackupTableName, number>;
}

export function validateAppBackupDocumentShape(value: unknown): asserts value is AppBackupDocument {
  if (!isPlainRecord(value)) {
    throw new Error("백업 파일 형식이 올바르지 않습니다.");
  }
  const candidate = value as Partial<AppBackupDocument>;
  if (
    candidate.manifest?.format !== APP_BACKUP_FORMAT ||
    candidate.manifest.schemaVersion !== APP_BACKUP_SCHEMA_VERSION
  ) {
    throw new Error("지원하지 않는 Language Miner 백업 형식입니다.");
  }
  if (
    typeof candidate.manifest.appVersion !== "string" ||
    typeof candidate.manifest.createdAt !== "string" ||
    !Number.isFinite(Date.parse(candidate.manifest.createdAt)) ||
    !isShortStringArray(candidate.manifest.profileIds, 120) ||
    !isShortStringArray(candidate.manifest.includedStores, 120) ||
    !isShortStringArray(candidate.manifest.excludedStores, 120) ||
    !isShortStringArray(candidate.manifest.redactions, 240)
  ) {
    throw new Error("백업 manifest가 없거나 손상되었습니다.");
  }
  const declaredProfileIds = new Set(candidate.manifest.profileIds);
  if (
    declaredProfileIds.size !== candidate.manifest.profileIds.length ||
    candidate.manifest.profileIds.some((profileId) => !profileId || profileId !== profileId.trim())
  ) {
    throw new Error("Backup manifest profileIds must be unique, non-empty, trimmed strings.");
  }
  if (!candidate.payload || typeof candidate.payload !== "object") {
    throw new Error("백업 데이터가 비어 있습니다.");
  }
  if (
    candidate.payload.database?.schemaVersion !== APP_BACKUP_SCHEMA_VERSION ||
    !isPlainRecord(candidate.payload.database.tables)
  ) {
    throw new Error("지원하지 않는 데이터베이스 백업 버전입니다.");
  }
  for (const tableName of appBackupTableNames) {
    const rows = candidate.payload.database.tables?.[tableName];
    if (!Array.isArray(rows)) {
      throw new Error(`백업 테이블이 없거나 손상되었습니다: ${tableName}`);
    }
    if (rows.length > APP_BACKUP_MAX_ROWS_PER_TABLE) {
      throw new Error(`백업 테이블의 행 수가 허용 범위를 초과합니다: ${tableName}`);
    }
    for (const row of rows) {
      if (
        !isPlainRecord(row) ||
        Object.values(row).some(
          (entry) => entry !== null && typeof entry !== "string" && typeof entry !== "number"
        )
      ) {
        throw new Error(`백업 테이블 행이 손상되었습니다: ${tableName}`);
      }
    }
    for (const row of rows) {
      const rowProfileId = row.profile_id;
      if (
        typeof rowProfileId === "string" &&
        rowProfileId &&
        !declaredProfileIds.has(rowProfileId)
      ) {
        throw new Error(`Backup table row references an undeclared profile: ${tableName}`);
      }
    }
  }
  if (!candidate.payload.renderer || !isPlainRecord(candidate.payload.renderer.entries)) {
    throw new Error("앱 설정 백업이 없거나 손상되었습니다.");
  }
  if (!isShortStringArray(candidate.payload.renderer.excludedKeys, 240)) {
    throw new Error("앱 설정 제외 목록이 없거나 손상되었습니다.");
  }
  for (const [key, entry] of Object.entries(candidate.payload.renderer.entries)) {
    if (
      !key.startsWith("lem:") ||
      key.length > 240 ||
      typeof entry !== "string" ||
      new TextEncoder().encode(entry).byteLength > APP_BACKUP_MAX_RENDERER_ENTRY_BYTES
    ) {
      throw new Error("앱 설정 백업에 허용되지 않는 항목이 있습니다.");
    }
  }
  if (!Array.isArray(candidate.payload.playZoneSaves)) {
    throw new Error("PlayZone 저장 백업이 없거나 손상되었습니다.");
  }
  if (candidate.payload.playZoneSaves.length > 10_000) {
    throw new Error("PlayZone 저장 백업 항목 수가 허용 범위를 초과합니다.");
  }
  for (const save of candidate.payload.playZoneSaves) {
    if (
      !isPlainRecord(save) ||
      typeof save.cartridgeId !== "string" ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(save.cartridgeId) ||
      typeof save.updatedAt !== "string"
    ) {
      throw new Error("PlayZone 저장 백업 항목이 손상되었습니다.");
    }
    const serializedSave = JSON.stringify(save.data ?? null);
    if (
      typeof serializedSave !== "string" ||
      new TextEncoder().encode(serializedSave).byteLength > APP_BACKUP_MAX_PLAY_ZONE_SAVE_BYTES
    ) {
      throw new Error("PlayZone 저장 백업 항목이 허용 크기를 초과합니다.");
    }
  }
  if (typeof candidate.checksumSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(candidate.checksumSha256)) {
    throw new Error("백업 체크섬이 없거나 손상되었습니다.");
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isShortStringArray(value: unknown, maxLength: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 10_000 &&
    value.every((entry) => typeof entry === "string" && entry.length <= maxLength)
  );
}

const localPathPattern = /^(?:[a-z]:[\\/]|\\\\|file:|lem-video:)/i;
const pathKeyPattern = /(?:^|[_-])?(?:file|folder|directory|audio|video|media|debug|cache|model|source|sync)?[_-]?path$/i;
const credentialKeyPattern =
  /(?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|auth[_-]?token|oauth[_-]?token|password|passwd|credential|authorization|cookie|private[_-]?key|session[_-]?id)$/i;

export function sanitizeAppBackupValue(value: unknown, key = ""): unknown {
  if (pathKeyPattern.test(key) || credentialKeyPattern.test(key)) {
    return null;
  }
  if (typeof value === "string") {
    return localPathPattern.test(value.trim()) ? "" : value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAppBackupValue(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        sanitizeAppBackupValue(childValue, childKey)
      ])
    );
  }
  return value;
}

export function remapBackupProfileId(value: unknown, profileIdMap: Record<string, string>): unknown {
  if (typeof value === "string") {
    return readOwnProfileIdMapping(profileIdMap, value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => remapBackupProfileId(item, profileIdMap));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        childKey === "profileId" && typeof childValue === "string"
          ? readOwnProfileIdMapping(profileIdMap, childValue)
          : remapBackupProfileId(childValue, profileIdMap)
      ])
    );
  }
  return value;
}

function readOwnProfileIdMapping(profileIdMap: Record<string, string>, value: string) {
  return Object.prototype.hasOwnProperty.call(profileIdMap, value)
    ? profileIdMap[value]
    : value;
}
