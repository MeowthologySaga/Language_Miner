import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  AppBackupPlayZoneSave,
  AppBackupRestoreMode
} from "../src/shared/appBackup";

export const PLAY_ZONE_MAX_SAVE_BYTES = 5 * 1024 * 1024;
export const PLAY_ZONE_MAX_PACK_BACKUP_BYTES = 25 * 1024 * 1024;
export const PLAY_ZONE_MAX_PACK_BACKUPS = 10;
export const PLAY_ZONE_MAX_TOTAL_SAVE_BYTES = 256 * 1024 * 1024;

export type PlayZoneSaveStoreInput = {
  cartridgeId?: unknown;
  value?: unknown;
  fallback?: unknown;
};

/** Exact in-memory rollback bytes. This type must never be included in a public backup document. */
export type PlayZoneRollbackSnapshot = {
  files: Array<{
    cartridgeId: string;
    contents: Buffer;
  }>;
};

export function loadPlayZoneSave(rootPath: string, input: PlayZoneSaveStoreInput) {
  const savePath = getPlayZoneSavePath(rootPath, input.cartridgeId, false);
  try {
    assertRegularFileWithoutSymlink(savePath);
    const stat = fs.statSync(savePath);
    if (stat.size > PLAY_ZONE_MAX_SAVE_BYTES) return input.fallback;
    const parsed = JSON.parse(fs.readFileSync(savePath, "utf8")) as { value?: unknown };
    return Object.prototype.hasOwnProperty.call(parsed, "value") ? parsed.value : input.fallback;
  } catch (error) {
    if (error instanceof UnsafePlayZoneSavePathError) throw error;
    return input.fallback;
  }
}

export function writePlayZoneSave(rootPath: string, input: PlayZoneSaveStoreInput) {
  const saveRootPath = ensureSafeDirectory(rootPath);
  const cartridgeId = normalizePlayZoneSaveId(input.cartridgeId);
  const savePath = getPlayZoneSavePath(saveRootPath, cartridgeId);
  if (fs.existsSync(savePath)) assertRegularFileWithoutSymlink(savePath);
  const serialized = serializeSave(cartridgeId, input.value);
  const bytes = Buffer.byteLength(serialized, "utf8");
  if (bytes > PLAY_ZONE_MAX_SAVE_BYTES) {
    throw new Error("PlayZone save data exceeds the 5 MiB per-pack limit.");
  }

  const previousBytes = fs.existsSync(savePath) ? fs.statSync(savePath).size : 0;
  const currentTotal = measureSafeTreeBytes(saveRootPath);
  if (currentTotal - previousBytes + bytes > PLAY_ZONE_MAX_TOTAL_SAVE_BYTES) {
    throw new Error("PlayZone save storage exceeds the 256 MiB total limit.");
  }

  const tempPath = `${savePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tempPath, serialized, { encoding: "utf8", flag: "wx" });
    fs.renameSync(tempPath, savePath);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
  return true;
}

export function clearPlayZoneSave(rootPath: string, input: PlayZoneSaveStoreInput) {
  const savePath = getPlayZoneSavePath(rootPath, input.cartridgeId);
  if (fs.existsSync(savePath)) assertRegularFileWithoutSymlink(savePath);
  fs.rmSync(savePath, { force: true });
  return true;
}

export function backupPlayZoneSave(rootPath: string, input: PlayZoneSaveStoreInput) {
  const saveRootPath = ensureSafeDirectory(rootPath);
  const cartridgeId = normalizePlayZoneSaveId(input.cartridgeId);
  const savePath = getPlayZoneSavePath(saveRootPath, cartridgeId);
  const backedUpAt = new Date().toISOString();
  if (!fs.existsSync(savePath)) return { backedUp: false, backedUpAt };
  assertRegularFileWithoutSymlink(savePath);

  const backupRootPath = path.resolve(saveRootPath, "backups", cartridgeId);
  if (!isPathInsideOrEqual(backupRootPath, saveRootPath)) {
    throw new UnsafePlayZoneSavePathError("Invalid PlayZone save backup path.");
  }
  ensureSafeDirectory(backupRootPath);
  const saveBytes = fs.statSync(savePath).size;
  prunePackBackups(backupRootPath, saveBytes);
  if (measureSafeTreeBytes(saveRootPath) + saveBytes > PLAY_ZONE_MAX_TOTAL_SAVE_BYTES) {
    throw new Error("PlayZone save storage exceeds the 256 MiB total limit.");
  }

  const backupPath = path.resolve(
    backupRootPath,
    `${formatBackupTimestamp(backedUpAt)}-${randomUUID()}.json`
  );
  if (!isPathInsideOrEqual(backupPath, backupRootPath)) {
    throw new UnsafePlayZoneSavePathError("Invalid PlayZone save backup file path.");
  }
  fs.copyFileSync(savePath, backupPath, fs.constants.COPYFILE_EXCL);
  prunePackBackups(backupRootPath, 0);
  return { backedUp: true, backupPath, backedUpAt };
}

export function exportPlayZoneSaves(rootPath: string): AppBackupPlayZoneSave[] {
  const saveRootPath = ensureSafeDirectory(rootPath);
  const saves: AppBackupPlayZoneSave[] = [];
  for (const entry of fs.readdirSync(saveRootPath, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      throw new UnsafePlayZoneSavePathError(
        "Symbolic links are not allowed in PlayZone save storage."
      );
    }
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const cartridgeId = normalizePlayZoneSaveId(entry.name.slice(0, -5));
    const filePath = getPlayZoneSavePath(saveRootPath, cartridgeId);
    assertRegularFileWithoutSymlink(filePath);
    const stat = fs.statSync(filePath);
    if (stat.size > PLAY_ZONE_MAX_SAVE_BYTES) {
      throw new Error(`PlayZone save data exceeds the per-pack limit: ${cartridgeId}`);
    }
    let parsed: {
      schemaVersion?: unknown;
      cartridgeId?: unknown;
      value?: unknown;
      updatedAt?: unknown;
    };
    try {
      parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      throw new Error(`PlayZone save data is not valid JSON: ${cartridgeId}`);
    }
    if (parsed.cartridgeId !== cartridgeId) {
      throw new Error(`PlayZone save identity does not match its file name: ${cartridgeId}`);
    }
    saves.push({
      cartridgeId,
      schemaVersion:
        typeof parsed.schemaVersion === "string" || typeof parsed.schemaVersion === "number"
          ? String(parsed.schemaVersion)
          : undefined,
      updatedAt:
        typeof parsed.updatedAt === "string" && Number.isFinite(Date.parse(parsed.updatedAt))
          ? new Date(parsed.updatedAt).toISOString()
          : stat.mtime.toISOString(),
      data: Object.prototype.hasOwnProperty.call(parsed, "value") ? parsed.value : null
    });
  }
  return saves.sort((left, right) => left.cartridgeId.localeCompare(right.cartridgeId));
}

export function capturePlayZoneRollbackSnapshot(rootPath: string): PlayZoneRollbackSnapshot {
  const saveRootPath = ensureSafeDirectory(rootPath);
  const files: PlayZoneRollbackSnapshot["files"] = [];
  for (const entry of fs.readdirSync(saveRootPath, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      throw new UnsafePlayZoneSavePathError(
        "Symbolic links are not allowed in PlayZone save storage."
      );
    }
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const cartridgeId = normalizePlayZoneSaveId(entry.name.slice(0, -5));
    const filePath = getPlayZoneSavePath(saveRootPath, cartridgeId);
    assertRegularFileWithoutSymlink(filePath);
    const stat = fs.statSync(filePath);
    if (stat.size > PLAY_ZONE_MAX_SAVE_BYTES) {
      throw new Error(`PlayZone save data exceeds the per-pack limit: ${cartridgeId}`);
    }
    const contents = fs.readFileSync(filePath);
    assertRawPlayZoneSaveIdentity(cartridgeId, contents);
    files.push({ cartridgeId, contents });
  }
  files.sort((left, right) => left.cartridgeId.localeCompare(right.cartridgeId));
  return { files };
}

export function restorePlayZoneRollbackSnapshot(
  rootPath: string,
  snapshot: PlayZoneRollbackSnapshot
) {
  const saveRootPath = ensureSafeDirectory(rootPath);
  const seen = new Set<string>();
  let totalBytes = 0;
  const files = snapshot.files.map((file) => {
    const cartridgeId = normalizePlayZoneSaveId(file.cartridgeId);
    if (seen.has(cartridgeId)) {
      throw new Error(`Duplicate PlayZone rollback save: ${cartridgeId}`);
    }
    seen.add(cartridgeId);
    if (!Buffer.isBuffer(file.contents) || file.contents.byteLength > PLAY_ZONE_MAX_SAVE_BYTES) {
      throw new Error(`PlayZone rollback save exceeds the per-pack limit: ${cartridgeId}`);
    }
    assertRawPlayZoneSaveIdentity(cartridgeId, file.contents);
    totalBytes += file.contents.byteLength;
    return { cartridgeId, contents: file.contents };
  });
  if (totalBytes > PLAY_ZONE_MAX_TOTAL_SAVE_BYTES) {
    throw new Error("PlayZone rollback saves exceed the total storage limit.");
  }

  removeCurrentPlayZoneSaveFiles(saveRootPath);
  for (const file of files) {
    writeRawPlayZoneSave(saveRootPath, file.cartridgeId, file.contents);
  }
  return files.length;
}

export function restorePlayZoneSaves(
  rootPath: string,
  saves: AppBackupPlayZoneSave[],
  mode: AppBackupRestoreMode
) {
  const saveRootPath = ensureSafeDirectory(rootPath);
  if (mode === "replace") {
    removeCurrentPlayZoneSaveFiles(saveRootPath);
  }
  let restoredCount = 0;
  for (const save of saves) {
    const cartridgeId = normalizePlayZoneSaveId(save?.cartridgeId);
    const savePath = getPlayZoneSavePath(saveRootPath, cartridgeId);
    if (mode !== "replace" && fs.existsSync(savePath)) continue;
    writePlayZoneSave(saveRootPath, { cartridgeId, value: save.data });
    restoredCount += 1;
  }
  return restoredCount;
}

function serializeSave(cartridgeId: string, value: unknown) {
  try {
    const serialized = JSON.stringify({
      schemaVersion: 1,
      cartridgeId,
      value: value === undefined ? null : value,
      updatedAt: new Date().toISOString()
    });
    if (typeof serialized !== "string") throw new Error("Save value is not JSON serializable.");
    return serialized;
  } catch (error) {
    throw new Error(
      `PlayZone save data must be JSON serializable: ${error instanceof Error ? error.message : "invalid value"}`
    );
  }
}

function assertRawPlayZoneSaveIdentity(cartridgeId: string, contents: Buffer) {
  let parsed: { cartridgeId?: unknown };
  try {
    parsed = JSON.parse(contents.toString("utf8"));
  } catch {
    throw new Error(`PlayZone rollback save is not valid JSON: ${cartridgeId}`);
  }
  if (parsed.cartridgeId !== cartridgeId) {
    throw new Error(`PlayZone rollback save identity does not match: ${cartridgeId}`);
  }
}

function writeRawPlayZoneSave(rootPath: string, cartridgeId: string, contents: Buffer) {
  const savePath = getPlayZoneSavePath(rootPath, cartridgeId);
  const tempPath = `${savePath}.${process.pid}.${randomUUID()}.rollback.tmp`;
  try {
    fs.writeFileSync(tempPath, contents, { flag: "wx" });
    fs.renameSync(tempPath, savePath);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

function prunePackBackups(backupRootPath: string, incomingBytes: number) {
  const backups = fs.readdirSync(backupRootPath, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(backupRootPath, entry.name);
    if (entry.isSymbolicLink()) {
      throw new UnsafePlayZoneSavePathError("Symbolic links are not allowed in PlayZone save storage.");
    }
    if (!entry.isFile()) return [];
    const stat = fs.statSync(filePath);
    return [{ filePath, size: stat.size, mtimeMs: stat.mtimeMs }];
  }).sort((left, right) => left.mtimeMs - right.mtimeMs || left.filePath.localeCompare(right.filePath));

  let totalBytes = backups.reduce((total, backup) => total + backup.size, 0);
  const incomingCount = incomingBytes > 0 ? 1 : 0;
  while (
    backups.length + incomingCount > PLAY_ZONE_MAX_PACK_BACKUPS ||
    totalBytes + incomingBytes > PLAY_ZONE_MAX_PACK_BACKUP_BYTES
  ) {
    const oldest = backups.shift();
    if (!oldest) break;
    fs.rmSync(oldest.filePath, { force: true });
    totalBytes -= oldest.size;
  }
  if (incomingBytes > PLAY_ZONE_MAX_PACK_BACKUP_BYTES) {
    throw new Error("A PlayZone save is too large for the per-pack backup quota.");
  }
}

function removeCurrentPlayZoneSaveFiles(saveRootPath: string) {
  for (const entry of fs.readdirSync(saveRootPath, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      throw new UnsafePlayZoneSavePathError(
        "Symbolic links are not allowed in PlayZone save storage."
      );
    }
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const cartridgeId = normalizePlayZoneSaveId(entry.name.slice(0, -5));
    const filePath = getPlayZoneSavePath(saveRootPath, cartridgeId);
    assertRegularFileWithoutSymlink(filePath);
    fs.rmSync(filePath, { force: true });
  }
}

function getPlayZoneSavePath(rootPath: string, cartridgeId: unknown, createRoot = true) {
  const saveRootPath = createRoot
    ? ensureSafeDirectory(rootPath)
    : resolveSafeDirectoryWithoutCreating(rootPath);
  const savePath = path.resolve(saveRootPath, `${normalizePlayZoneSaveId(cartridgeId)}.json`);
  if (!isPathInsideOrEqual(savePath, saveRootPath)) {
    throw new UnsafePlayZoneSavePathError("Invalid PlayZone save path.");
  }
  return savePath;
}

function resolveSafeDirectoryWithoutCreating(folderPath: string) {
  const resolved = path.resolve(folderPath);
  const existingAncestor = findExistingAncestor(resolved);
  if (existingAncestor && fs.lstatSync(existingAncestor).isSymbolicLink()) {
    throw new UnsafePlayZoneSavePathError("Symbolic links are not allowed in PlayZone save storage.");
  }
  if (!fs.existsSync(resolved)) return resolved;
  const stat = fs.lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new UnsafePlayZoneSavePathError("PlayZone save root must be a regular directory.");
  }
  return resolved;
}

function normalizePlayZoneSaveId(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  const candidate = normalized || "external-cartridge";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(candidate)) {
    throw new UnsafePlayZoneSavePathError("Invalid PlayZone cartridge id for save storage.");
  }
  return candidate;
}

function ensureSafeDirectory(folderPath: string) {
  const resolved = path.resolve(folderPath);
  const existingAncestor = findExistingAncestor(resolved);
  if (existingAncestor && fs.lstatSync(existingAncestor).isSymbolicLink()) {
    throw new UnsafePlayZoneSavePathError("Symbolic links are not allowed in PlayZone save storage.");
  }
  fs.mkdirSync(resolved, { recursive: true });
  const stat = fs.lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new UnsafePlayZoneSavePathError("PlayZone save root must be a regular directory.");
  }
  return resolved;
}

function findExistingAncestor(candidatePath: string): string | null {
  let current = candidatePath;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return current;
}

function assertRegularFileWithoutSymlink(filePath: string) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new UnsafePlayZoneSavePathError("PlayZone save path is not a regular file.");
  }
}

function measureSafeTreeBytes(rootPath: string): number {
  let total = 0;
  for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isSymbolicLink()) {
      throw new UnsafePlayZoneSavePathError("Symbolic links are not allowed in PlayZone save storage.");
    }
    if (entry.isDirectory()) total += measureSafeTreeBytes(entryPath);
    else if (entry.isFile()) total += fs.statSync(entryPath).size;
  }
  return total;
}

function formatBackupTimestamp(value: string) {
  return value.replace(/[^0-9]/g, "").slice(0, 17) || String(Date.now());
}

function isPathInsideOrEqual(candidatePath: string, rootPath: string) {
  const relativePath = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return !relativePath || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

class UnsafePlayZoneSavePathError extends Error {}
