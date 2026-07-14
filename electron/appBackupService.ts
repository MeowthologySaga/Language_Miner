import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  APP_BACKUP_MAX_BYTES,
  APP_BACKUP_SCHEMA_VERSION,
  appBackupTableNames,
  createEmptyAppBackupTables,
  sanitizeAppBackupValue,
  summarizeAppBackupTables,
  validateAppBackupDocumentShape,
  type AppBackupDatabaseSnapshot,
  type AppBackupDocument,
  type AppBackupManifest,
  type AppBackupPayload,
  type AppBackupPreview,
  type AppBackupRestoreEstimate,
  type AppBackupRestoreMode,
  type AppBackupTableName
} from "../src/shared/appBackup";

const APP_BACKUP_SESSION_TTL_MS = 30 * 60 * 1000;

export function createAppBackupDocument(input: {
  appVersion: string;
  profileIds: string[];
  payload: AppBackupPayload;
}): AppBackupDocument {
  const manifest: AppBackupManifest = {
    format: "language-miner-backup",
    schemaVersion: APP_BACKUP_SCHEMA_VERSION,
    appVersion: normalizeText(input.appVersion, 64) || "0.0.0",
    createdAt: new Date().toISOString(),
    profileIds: Array.from(new Set(input.profileIds.map((id) => normalizeText(id, 120)).filter(Boolean))),
    includedStores: ["learning-database", "renderer-learning-state", "playzone-saves"],
    excludedStores: [
      "api-keys",
      "oauth-tokens",
      "browser-cookies",
      "web-reader-session-state",
      "cloud-provider-consent",
      "local-file-paths",
      "ocr-captures",
      "logs",
      "translation-cache",
      "models",
      "source-pdf-and-video-files"
    ],
    redactions: ["absolute paths", "credential values", "rebuildable caches"]
  };
  const payload = sanitizeAppBackupValue(input.payload) as AppBackupPayload;
  return {
    manifest,
    payload,
    checksumSha256: calculateAppBackupChecksum(manifest, payload)
  };
}

export function serializeAppBackupDocument(document: AppBackupDocument) {
  validateAndVerifyAppBackupDocument(document);
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function parseAppBackupDocument(source: string | Buffer): AppBackupDocument {
  const bytes = Buffer.isBuffer(source) ? source : Buffer.from(source, "utf8");
  if (bytes.byteLength > APP_BACKUP_MAX_BYTES) {
    throw new Error("백업 파일이 허용된 최대 크기(64MB)를 초과합니다.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("백업 파일이 JSON 형식이 아니거나 손상되었습니다.");
  }
  validateAndVerifyAppBackupDocument(parsed);
  return parsed;
}

export function writeAppBackupFile(filePath: string, document: AppBackupDocument) {
  const resolved = path.resolve(filePath);
  const serialized = serializeAppBackupDocument(document);
  if (Buffer.byteLength(serialized, "utf8") > APP_BACKUP_MAX_BYTES) {
    throw new Error("백업 데이터가 허용된 최대 크기(64MB)를 초과합니다.");
  }
  const tempPath = `${resolved}.${process.pid}.${randomUUID()}.tmp`;
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  try {
    fs.writeFileSync(tempPath, serialized, { encoding: "utf8", mode: 0o600, flag: "wx" });
    fs.renameSync(tempPath, resolved);
  } finally {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {
      // A stale temporary backup is never loaded automatically.
    }
  }
  return resolved;
}

export function readAppBackupFile(filePath: string) {
  const stats = fs.statSync(filePath);
  if (!stats.isFile() || stats.size > APP_BACKUP_MAX_BYTES) {
    throw new Error("선택한 백업 파일을 읽을 수 없거나 너무 큽니다.");
  }
  return parseAppBackupDocument(fs.readFileSync(filePath));
}

export function createImportedProfileIdMap(profileIds: string[], now = Date.now()) {
  const result: Record<string, string> = {};
  profileIds.forEach((profileId, index) => {
    const safe = normalizeText(profileId, 80).replace(/[^a-z0-9_-]/gi, "-") || "profile";
    Object.defineProperty(result, profileId, {
      value: `${safe}-imported-${now}-${index + 1}`,
      enumerable: true,
      configurable: true,
      writable: true
    });
  });
  return result;
}

export class AppBackupPreviewStore {
  private readonly items = new Map<string, { document: AppBackupDocument; expiresAt: number }>();

  add(
    document: AppBackupDocument,
    context: {
      currentProfileIds?: string[];
      currentPayload?: AppBackupPayload;
    } = {}
  ): AppBackupPreview {
    this.prune();
    const handleId = randomUUID();
    const expiresAt = Date.now() + APP_BACKUP_SESSION_TTL_MS;
    this.items.set(handleId, {
      document,
      expiresAt
    });
    return {
      handleId,
      expiresAt,
      manifest: document.manifest,
      counts: summarizeAppBackupTables(document.payload.database),
      rendererEntryCount: Object.keys(document.payload.renderer.entries).length,
      playZoneSaveCount: document.payload.playZoneSaves.length,
      warnings: [
        "secrets-and-local-files-excluded",
        "replace-removes-current-data",
        ...(countDeviceGlobalRows(document.payload.database) > 0
          ? (["device-global-data-preserved"] as const)
          : [])
      ],
      estimates: createAppBackupRestoreEstimates(document, context)
    };
  }

  take(handleId: string) {
    this.prune();
    const item = this.items.get(handleId);
    if (!item) {
      throw new Error("복원 미리보기가 만료되었습니다. 백업 파일을 다시 선택하세요.");
    }
    this.items.delete(handleId);
    return item.document;
  }

  clear() {
    const removed = this.items.size;
    this.items.clear();
    return removed;
  }

  private prune() {
    const now = Date.now();
    for (const [id, item] of this.items) {
      if (item.expiresAt <= now) this.items.delete(id);
    }
  }
}

const deviceGlobalTables = new Set<AppBackupTableName>([
  "diamond_wallet",
  "diamond_transactions",
  "mission_events",
  "daily_mission_progress"
]);

const backupPrimaryKeyColumns: Record<AppBackupTableName, string[]> = {
  cards: ["id"],
  vocabulary_items: ["id"],
  highlight_mappings: ["id"],
  life_logs: ["id"],
  listening_video_candidates: ["id"],
  listening_transcripts: ["id"],
  reviews: ["id"],
  export_records: ["id"],
  diamond_wallet: ["id"],
  diamond_transactions: ["id"],
  mission_events: ["id"],
  daily_mission_progress: ["date_key", "mission_id"]
};

export function createAppBackupRestoreEstimates(
  document: AppBackupDocument,
  context: {
    currentProfileIds?: string[];
    currentPayload?: AppBackupPayload;
  } = {}
): Record<AppBackupRestoreMode, AppBackupRestoreEstimate> {
  const currentProfileIds = new Set(
    (context.currentProfileIds ?? [])
      .map((profileId) => normalizeText(profileId, 120))
      .filter(Boolean)
  );
  const incomingProfileIds = document.manifest.profileIds;
  const profileConflicts = incomingProfileIds.filter((profileId) =>
    currentProfileIds.has(profileId)
  ).length;
  const currentPayload = context.currentPayload ?? createEmptyAppBackupPayload();

  return Object.fromEntries(
    (["new_profile", "merge", "replace"] as const).map((mode) => {
      const estimate: AppBackupRestoreEstimate = {
        profileConflicts,
        profilesAdded:
          mode === "new_profile"
            ? incomingProfileIds.length
            : Math.max(0, incomingProfileIds.length - profileConflicts),
        itemsAdded: 0,
        itemsOverwritten: 0,
        itemsSkipped: 0
      };
      estimateDatabaseRestore(document.payload.database, currentPayload.database, mode, estimate);
      estimateRendererRestore(
        document.payload.renderer.entries,
        currentPayload.renderer.entries,
        incomingProfileIds,
        mode,
        estimate
      );
      estimatePlayZoneRestore(
        document.payload.playZoneSaves.map((save) => save.cartridgeId),
        currentPayload.playZoneSaves.map((save) => save.cartridgeId),
        mode,
        estimate
      );
      return [mode, estimate];
    })
  ) as Record<AppBackupRestoreMode, AppBackupRestoreEstimate>;
}

function createEmptyAppBackupPayload(): AppBackupPayload {
  return {
    database: {
      schemaVersion: APP_BACKUP_SCHEMA_VERSION,
      tables: createEmptyAppBackupTables()
    },
    renderer: { entries: {}, excludedKeys: [] },
    playZoneSaves: []
  };
}

function estimateDatabaseRestore(
  incoming: AppBackupDatabaseSnapshot,
  current: AppBackupDatabaseSnapshot,
  mode: AppBackupRestoreMode,
  estimate: AppBackupRestoreEstimate
) {
  for (const tableName of appBackupTableNames) {
    const incomingRows = incoming.tables[tableName] ?? [];
    if (mode !== "replace" && deviceGlobalTables.has(tableName)) {
      estimate.itemsSkipped += incomingRows.length;
      continue;
    }
    if (mode === "new_profile") {
      estimate.itemsAdded += incomingRows.length;
      continue;
    }
    const currentIdentities = new Set(
      (current.tables[tableName] ?? []).map((row) => getBackupRowIdentity(tableName, row))
    );
    for (const row of incomingRows) {
      const collides = currentIdentities.has(getBackupRowIdentity(tableName, row));
      if (!collides) estimate.itemsAdded += 1;
      else if (mode === "replace") estimate.itemsOverwritten += 1;
      else estimate.itemsSkipped += 1;
    }
  }
}

function estimateRendererRestore(
  incoming: Record<string, string>,
  current: Record<string, string>,
  profileIds: string[],
  mode: AppBackupRestoreMode,
  estimate: AppBackupRestoreEstimate
) {
  const currentKeys = new Set(Object.keys(current));
  for (const key of Object.keys(incoming)) {
    // Profile creation/collision is reported separately, so do not double count the registry.
    if (key === "lem:profiles") continue;
    const profileScoped = profileIds.some((profileId) =>
      storageKeyContainsProfileId(key, profileId)
    );
    const collides = currentKeys.has(key);
    if (mode === "new_profile" && profileScoped) estimate.itemsAdded += 1;
    else if (!collides) estimate.itemsAdded += 1;
    else if (mode === "replace") estimate.itemsOverwritten += 1;
    else estimate.itemsSkipped += 1;
  }
}

function estimatePlayZoneRestore(
  incomingIds: string[],
  currentIds: string[],
  mode: AppBackupRestoreMode,
  estimate: AppBackupRestoreEstimate
) {
  const current = new Set(currentIds);
  for (const id of incomingIds) {
    if (!current.has(id)) estimate.itemsAdded += 1;
    else if (mode === "replace") estimate.itemsOverwritten += 1;
    else estimate.itemsSkipped += 1;
  }
}

function getBackupRowIdentity(
  tableName: AppBackupTableName,
  row: Record<string, string | number | null>
) {
  return backupPrimaryKeyColumns[tableName]
    .map((column) => `${column}:${typeof row[column]}:${String(row[column] ?? "")}`)
    .join("|");
}

function storageKeyContainsProfileId(key: string, profileId: string) {
  let offset = key.indexOf(profileId);
  while (offset >= 0) {
    const beforeIsBoundary = offset === 0 || key[offset - 1] === ":";
    const afterOffset = offset + profileId.length;
    const afterIsBoundary = afterOffset === key.length || key[afterOffset] === ":";
    if (beforeIsBoundary && afterIsBoundary) return true;
    offset = key.indexOf(profileId, offset + 1);
  }
  return false;
}

function countDeviceGlobalRows(snapshot: AppBackupDatabaseSnapshot) {
  return Array.from(deviceGlobalTables).reduce(
    (total, tableName) => total + (snapshot.tables[tableName]?.length ?? 0),
    0
  );
}

function validateAndVerifyAppBackupDocument(value: unknown): asserts value is AppBackupDocument {
  validateAppBackupDocumentShape(value);
  const expected = calculateAppBackupChecksum(value.manifest, value.payload);
  if (!timingSafeEqualText(expected, value.checksumSha256.toLowerCase())) {
    throw new Error("백업 체크섬이 일치하지 않습니다. 파일이 손상되었거나 변경되었습니다.");
  }
}

function calculateAppBackupChecksum(manifest: AppBackupManifest, payload: AppBackupPayload) {
  return createHash("sha256").update(JSON.stringify({ manifest, payload }), "utf8").digest("hex");
}

function timingSafeEqualText(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function normalizeText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
