import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const PLAY_ZONE_ENTRY_PROTOCOL = "lem-playzone";
export const PLAY_ZONE_MAX_PROTOCOL_MOUNTS = 512;

const PLAY_ZONE_MOUNT_TTL_MS = 12 * 60 * 60 * 1000;
const PLAY_ZONE_FORBIDDEN_PATH_SEGMENTS = new Set([
  "__macosx",
  ".git",
  ".vscode",
  "node_modules",
  "source",
  "coverage"
]);
const PLAY_ZONE_FORBIDDEN_FILE_NAMES = new Set([
  ".lem-archive-cache.json",
  ".lem-snapshot.json",
  "manifest.json",
  "lem.json"
]);
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export type PlayZoneProtocolFile = {
  relativePath: string;
  sha256: string;
  size: number;
};

export type PlayZoneEntryProtocolMount = {
  rootPath: string;
  files: Map<string, PlayZoneProtocolFile>;
  createdAt: number;
  lastUsedAt: number;
};

export type PlayZoneEntryProtocolMounts = Map<string, PlayZoneEntryProtocolMount>;

export const playZoneEntryProtocolMounts: PlayZoneEntryProtocolMounts = new Map();

export function registerPlayZoneEntryProtocolMount(
  rootPath: string,
  runtimeFiles: PlayZoneProtocolFile[],
  mounts: PlayZoneEntryProtocolMounts = playZoneEntryProtocolMounts,
  now = Date.now()
) {
  cleanupPlayZoneEntryProtocolMounts(mounts, now);
  const normalizedRootPath = normalizeSnapshotRoot(rootPath);
  const files = new Map<string, PlayZoneProtocolFile>();
  for (const input of runtimeFiles) {
    const relativePath = normalizePlayZoneEntryRelativePath(input.relativePath);
    if (
      !relativePath ||
      !SHA256_PATTERN.test(input.sha256) ||
      !Number.isSafeInteger(input.size) ||
      input.size < 0
    ) {
      throw new Error("Invalid PlayZone protocol mount file contract.");
    }
    const key = relativePath.toLowerCase();
    if (files.has(key)) throw new Error("Duplicate PlayZone protocol mount file path.");
    files.set(key, { relativePath, sha256: input.sha256, size: input.size });
  }
  if (!files.size) throw new Error("A PlayZone protocol mount cannot be empty.");

  const mountId = `mount-${randomUUID()}`;
  mounts.set(mountId, {
    rootPath: normalizedRootPath,
    files,
    createdAt: now,
    lastUsedAt: now
  });
  while (mounts.size > PLAY_ZONE_MAX_PROTOCOL_MOUNTS) {
    const oldest = Array.from(mounts.entries()).sort(
      (left, right) => left[1].lastUsedAt - right[1].lastUsedAt
    )[0]?.[0];
    if (!oldest) break;
    mounts.delete(oldest);
  }
  return mountId;
}

export function createPlayZoneEntryProtocolUrl(
  mountId: string,
  relativeEntryPath: string,
  mounts: PlayZoneEntryProtocolMounts = playZoneEntryProtocolMounts
) {
  const mount = mounts.get(mountId);
  const normalizedRelativePath = normalizePlayZoneEntryRelativePath(relativeEntryPath);
  if (!mount || !normalizedRelativePath || !mount.files.has(normalizedRelativePath.toLowerCase())) {
    return null;
  }
  return `${PLAY_ZONE_ENTRY_PROTOCOL}://pack/${encodeURIComponent(mountId)}/${normalizedRelativePath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

export function readPlayZoneEntryProtocolFile(
  rawUrl: string,
  mounts: PlayZoneEntryProtocolMounts = playZoneEntryProtocolMounts,
  now = Date.now()
) {
  const resolved = resolveMountedFile(rawUrl, mounts);
  const stat = fs.lstatSync(resolved.filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== resolved.expected.size) {
    throw new Error("The PlayZone snapshot file changed after authorization.");
  }
  const contents = fs.readFileSync(resolved.filePath);
  const actualSha256 = createHash("sha256").update(contents).digest("hex");
  if (actualSha256 !== resolved.expected.sha256) {
    throw new Error("The PlayZone snapshot file failed its per-response SHA-256 check.");
  }
  resolved.mount.lastUsedAt = now;
  return {
    filePath: resolved.filePath,
    relativePath: resolved.expected.relativePath,
    contents,
    sha256: actualSha256
  };
}

export function resolvePlayZoneEntryProtocolFilePath(
  rawUrl: string,
  mounts: PlayZoneEntryProtocolMounts = playZoneEntryProtocolMounts
) {
  return readPlayZoneEntryProtocolFile(rawUrl, mounts).filePath;
}

export function cleanupPlayZoneEntryProtocolMounts(
  mounts: PlayZoneEntryProtocolMounts = playZoneEntryProtocolMounts,
  now = Date.now()
) {
  let removed = 0;
  for (const [mountId, mount] of mounts) {
    if (now - mount.lastUsedAt >= PLAY_ZONE_MOUNT_TTL_MS) {
      mounts.delete(mountId);
      removed += 1;
    }
  }
  return removed;
}

export function clearPlayZoneEntryProtocolMounts(
  mounts: PlayZoneEntryProtocolMounts = playZoneEntryProtocolMounts
) {
  const count = mounts.size;
  mounts.clear();
  return count;
}

export function normalizePlayZoneEntryRelativePath(value: string) {
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("\0") || normalized.includes("//")) {
    return "";
  }
  const segments = normalized.split("/");
  if (
    path.isAbsolute(normalized) ||
    segments.includes("..") ||
    segments.includes(".") ||
    segments.some((segment) => !segment || PLAY_ZONE_FORBIDDEN_PATH_SEGMENTS.has(segment.toLowerCase())) ||
    PLAY_ZONE_FORBIDDEN_FILE_NAMES.has(segments[segments.length - 1]?.toLowerCase() ?? "")
  ) {
    return "";
  }
  return normalized;
}

function resolveMountedFile(rawUrl: string, mounts: PlayZoneEntryProtocolMounts) {
  const parsedUrl = new URL(rawUrl);
  if (parsedUrl.protocol !== `${PLAY_ZONE_ENTRY_PROTOCOL}:` || parsedUrl.hostname !== "pack") {
    throw new Error("Invalid PlayZone cartridge URL.");
  }
  const pathParts = parsedUrl.pathname
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));
  const mountId = pathParts.shift();
  if (!mountId) throw new Error("Missing PlayZone cartridge mount identifier.");
  const mount = mounts.get(mountId);
  if (!mount) throw new Error("The PlayZone cartridge mount is no longer authorized.");

  const relativePath = normalizePlayZoneEntryRelativePath(pathParts.join("/"));
  if (!relativePath) throw new Error("Missing PlayZone cartridge file path.");
  const expected = mount.files.get(relativePath.toLowerCase());
  if (!expected || expected.relativePath !== relativePath) {
    throw new Error("The requested file is not in the authorized snapshot manifest.");
  }
  const filePath = path.resolve(mount.rootPath, expected.relativePath);
  if (!isPathInside(filePath, mount.rootPath)) {
    throw new Error("PlayZone cartridge path escaped its snapshot root.");
  }
  return { mount, expected, filePath };
}

function normalizeSnapshotRoot(rootPath: string) {
  const normalized = path.resolve(rootPath);
  const stat = fs.lstatSync(normalized);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("PlayZone protocol mounts require a regular snapshot directory.");
  }
  return normalized;
}

function isPathInside(candidatePath: string, rootPath: string) {
  const relativePath = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return Boolean(relativePath) && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}
