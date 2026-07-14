import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  PlayZoneDiamondAction,
  PlayZoneLibraryEntryStatus,
  PlayZonePermissions,
  PlayZoneSecurityIssue,
  PlayZoneSecurityReport
} from "../src/shared/types";
import { PLAY_ZONE_CURRENT_APP_VERSION } from "../src/shared/playZoneContract";

export const PLAY_ZONE_MANIFEST_FILE_NAMES = ["manifest.json", "lem.json"] as const;
export const PLAY_ZONE_CURRENT_FORMAT_VERSION = 1;
export { PLAY_ZONE_CURRENT_APP_VERSION };

const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_PACK_FILES = 4_096;
const MAX_PACK_BYTES = 512 * 1024 * 1024;
const MAX_SINGLE_FILE_BYTES = 128 * 1024 * 1024;
const IGNORED_SEGMENTS = new Set([".git", ".vscode", "node_modules", "source", "coverage"]);
const IGNORED_FILES = new Set([".lem-archive-cache.json", ".lem-snapshot.json"]);
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,127}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SPDX_PATTERN = /^[A-Za-z0-9.+-]+(?:\s+(?:AND|OR|WITH)\s+[A-Za-z0-9.+-]+)*$/;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);

const NO_PERMISSIONS: PlayZonePermissions = {
  walletSpend: false,
  storage: false,
  network: false,
  externalLinks: false,
  cardRead: false
};

type ManifestRecord = Record<string, unknown>;

export type InspectedPlayZonePack = {
  manifestPath?: string;
  id?: string;
  lineageId?: string;
  version?: string;
  minPlayZoneVersion?: string;
  saveSchemaVersion?: string;
  releaseNotes?: string;
  title?: string;
  creator?: string;
  summary?: string;
  tags: string[];
  category?: string;
  license?: string;
  sourceUrl?: string;
  entryPath?: string;
  thumbnailPath?: string;
  permissions: PlayZonePermissions;
  diamondActions: PlayZoneDiamondAction[];
  runtimeFiles: Array<{ relativePath: string; sha256: string; size: number }>;
  securityReport: PlayZoneSecurityReport;
};

export type InspectPlayZonePackOptions = {
  archiveSha256?: string;
  trustedOfficial?: boolean;
  appVersion?: string;
};

export function inspectPlayZonePack(
  folderPath: string,
  options: InspectPlayZonePackOptions = {}
): InspectedPlayZonePack {
  const checkedAt = new Date().toISOString();
  const rootPath = path.resolve(folderPath);
  const issues: PlayZoneSecurityIssue[] = [];
  const manifestPaths = PLAY_ZONE_MANIFEST_FILE_NAMES
    .map((name) => path.join(rootPath, name))
    .filter(isRegularFileWithoutSymlink);

  if (!manifestPaths.length) {
    return emptyInspection({
      status: "quarantined",
      archiveSha256: options.archiveSha256,
      permissions: { ...NO_PERMISSIONS },
      checkedAt,
      issues: [issue("manifest_missing", "error", "A root manifest.json is required before this pack can run.")]
    });
  }
  if (manifestPaths.length > 1) {
    issues.push(issue("manifest_ambiguous", "error", "A pack cannot contain both manifest.json and lem.json."));
  }

  const manifestPath = manifestPaths[0];
  let manifestBytes: Buffer;
  let manifest: ManifestRecord;
  try {
    const stat = fs.statSync(manifestPath);
    if (stat.size > MAX_MANIFEST_BYTES) {
      throw new Error("The manifest is larger than 256 KiB.");
    }
    manifestBytes = fs.readFileSync(manifestPath);
    const parsed = JSON.parse(manifestBytes.toString("utf8")) as unknown;
    if (!isRecord(parsed)) {
      throw new Error("The manifest root must be a JSON object.");
    }
    manifest = parsed;
  } catch (error) {
    return emptyInspection({
      status: "blocked",
      archiveSha256: options.archiveSha256,
      permissions: { ...NO_PERMISSIONS },
      checkedAt,
      issues: [
        ...issues,
        issue("manifest_invalid", "error", error instanceof Error ? error.message : "The manifest could not be read.")
      ]
    }, manifestPath);
  }

  const schemaVersion = readSchemaVersion(manifest, issues);
  const contentType = readRequiredString(manifest.contentType, "content_type_missing", "contentType is required.", issues);
  if (contentType && contentType !== "game_pack") {
    issues.push(issue("content_type_unsupported", "error", "Only contentType game_pack is executable in PlayZone."));
  }

  const id = readRequiredString(manifest.id, "id_missing", "A stable pack id is required.", issues);
  if (id && !ID_PATTERN.test(id)) {
    issues.push(issue("id_invalid", "error", "Pack id must use 2-128 lowercase letters, digits, dots, underscores, or hyphens."));
  }
  const lineageId = readRequiredString(manifest.lineageId, "lineage_id_missing", "lineageId is required for safe updates.", issues);
  if (lineageId && !UUID_PATTERN.test(lineageId)) {
    issues.push(issue("lineage_id_invalid", "error", "lineageId must be a valid UUID."));
  }
  const version = readSemver(manifest.version, "version", true, issues);
  const minPlayZoneVersion = readSemver(
    manifest.minPlayZoneVersion ?? asRecord(manifest.metadata).minAppVersion,
    "minPlayZoneVersion",
    true,
    issues
  );
  if (minPlayZoneVersion && compareSemver(minPlayZoneVersion, options.appVersion ?? PLAY_ZONE_CURRENT_APP_VERSION) > 0) {
    issues.push(issue("app_version_too_old", "warning", `This pack requires Language Miner ${minPlayZoneVersion} or newer.`));
  }

  const title = readRequiredString(manifest.title, "title_missing", "A title is required.", issues).slice(0, 120);
  const creator = readCreator(manifest.creator);
  if (!creator) {
    issues.push(issue("creator_missing", "warning", "Creator name is required for publishable UGC."));
  }
  const license = readRequiredString(
    manifest.license ?? asRecord(manifest.metadata).license,
    "license_missing",
    "An SPDX license identifier is required.",
    issues
  );
  if (license && !SPDX_PATTERN.test(license)) {
    issues.push(issue("license_invalid", "error", "license must be a simple SPDX identifier or expression."));
  }
  const sourceUrl = readRequiredString(
    manifest.sourceUrl ?? asRecord(manifest.metadata).sourceUrl,
    "source_url_missing",
    "An HTTPS sourceUrl is required.",
    issues
  );
  if (sourceUrl && !isSafeSourceUrl(sourceUrl)) {
    issues.push(issue("source_url_invalid", "error", "sourceUrl must be an HTTPS URL."));
  }

  const permissions = readPermissions(manifest.permissions, issues);
  const diamondActions = readDiamondActions(manifest.economy, permissions, issues);
  const entryPath = readEntryPath(manifest.entry, issues);
  const thumbnailPath = readThumbnailPath(manifest, issues);
  const fileInspection = inspectPackFiles(rootPath, manifestPath, manifest, issues);

  if (entryPath && !fileInspection.files.has(entryPath.toLowerCase())) {
    issues.push(issue("entry_missing", "error", "The declared HTML entry file does not exist or is not a regular file.", entryPath));
  }
  if (thumbnailPath && !fileInspection.files.has(thumbnailPath.toLowerCase())) {
    issues.push(issue("thumbnail_missing", "error", "The declared thumbnail file does not exist.", thumbnailPath));
  }

  const hasErrors = issues.some((item) => item.severity === "error");
  const hasWarnings = issues.some((item) => item.severity === "warning");
  const status: PlayZoneLibraryEntryStatus = hasErrors
    ? "blocked"
    : hasWarnings
      ? "warning"
      : options.trustedOfficial
        ? "trusted_official"
        : "ready";
  const packSha256 = createHash("sha256")
    .update(manifestBytes)
    .update(fileInspection.fingerprint)
    .digest("hex");
  const securityReport: PlayZoneSecurityReport = {
    status,
    archiveSha256: options.archiveSha256,
    packSha256,
    schemaVersion,
    license: license || undefined,
    sourceUrl: sourceUrl || undefined,
    permissions,
    checkedAt,
    issues
  };

  return {
    manifestPath,
    id: id || undefined,
    lineageId: lineageId || undefined,
    version: version || undefined,
    minPlayZoneVersion: minPlayZoneVersion || undefined,
    saveSchemaVersion: readSaveSchemaVersion(manifest),
    releaseNotes: readReleaseNotes(manifest),
    title: title || undefined,
    creator: creator || undefined,
    summary: cleanText(manifest.description ?? manifest.summary, 2_000) || undefined,
    tags: readTags(manifest.tags),
    category: cleanText(manifest.category, 80) || undefined,
    license: license || undefined,
    sourceUrl: sourceUrl || undefined,
    entryPath: entryPath || undefined,
    thumbnailPath: thumbnailPath || undefined,
    permissions,
    diamondActions,
    runtimeFiles: Array.from(fileInspection.files.values()).map((file) => ({
      relativePath: file.relativePath,
      sha256: file.sha256,
      size: file.size
    })),
    securityReport
  };
}

export function isExecutablePlayZoneStatus(
  status: PlayZoneLibraryEntryStatus
): status is "ready" | "trusted_official" {
  return status === "ready" || status === "trusted_official";
}

function inspectPackFiles(
  rootPath: string,
  manifestPath: string,
  manifest: ManifestRecord,
  issues: PlayZoneSecurityIssue[]
) {
  const actualFiles = collectPackFiles(rootPath, manifestPath, issues);
  const files = new Map<string, { relativePath: string; sha256: string; size: number }>();
  let totalBytes = 0;
  for (const file of actualFiles) {
    totalBytes += file.size;
    if (file.size > MAX_SINGLE_FILE_BYTES) {
      issues.push(issue("file_too_large", "error", "A single pack file cannot exceed 128 MiB.", file.relativePath));
      continue;
    }
    if (totalBytes > MAX_PACK_BYTES) {
      issues.push(issue("pack_too_large", "error", "Unpacked game files cannot exceed 512 MiB."));
      break;
    }
    const sha256 = createHash("sha256").update(fs.readFileSync(file.absolutePath)).digest("hex");
    files.set(file.relativePath.toLowerCase(), { relativePath: file.relativePath, sha256, size: file.size });
  }

  const integrity = asRecord(manifest.integrity);
  const declared = asRecord(integrity.files);
  if (!Object.keys(declared).length) {
    issues.push(issue("integrity_missing", "warning", "integrity.files must contain a SHA-256 hash for every runtime file."));
  } else if (Object.keys(declared).length > MAX_PACK_FILES) {
    issues.push(issue("integrity_too_many_files", "error", "integrity.files exceeds the file limit."));
  } else {
    const declaredKeys = new Set<string>();
    for (const [rawPath, rawDigest] of Object.entries(declared)) {
      const relativePath = normalizePackRelativePath(rawPath);
      if (!relativePath || relativePath !== rawPath.replace(/\\/g, "/")) {
        issues.push(issue("integrity_path_invalid", "error", "An integrity path is unsafe or non-canonical.", rawPath));
        continue;
      }
      const key = relativePath.toLowerCase();
      if (declaredKeys.has(key)) {
        issues.push(issue("integrity_path_duplicate", "error", "Integrity paths must be unique ignoring case.", relativePath));
        continue;
      }
      declaredKeys.add(key);
      const expected = normalizeSha256(rawDigest);
      if (!expected) {
        issues.push(issue("integrity_hash_invalid", "error", "Integrity values must be SHA-256 hex digests.", relativePath));
        continue;
      }
      const actual = files.get(key);
      if (!actual) {
        issues.push(issue("integrity_file_missing", "error", "A declared integrity file is missing.", relativePath));
      } else if (actual.sha256 !== expected) {
        issues.push(issue("integrity_mismatch", "error", "A runtime file does not match its declared SHA-256 hash.", relativePath));
      }
    }
    for (const file of files.values()) {
      if (!declaredKeys.has(file.relativePath.toLowerCase())) {
        issues.push(issue("integrity_file_unlisted", "error", "Every runtime file must be listed in integrity.files.", file.relativePath));
      }
    }
  }

  const fingerprint = Array.from(files.values())
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
    .map((file) => `${file.relativePath}\0${file.sha256}\n`)
    .join("");
  return { files, fingerprint };
}

function collectPackFiles(rootPath: string, manifestPath: string, issues: PlayZoneSecurityIssue[]) {
  const files: Array<{ absolutePath: string; relativePath: string; size: number }> = [];
  const seen = new Set<string>();
  const visit = (folderPath: string) => {
    for (const entry of fs.readdirSync(folderPath, { withFileTypes: true })) {
      const absolutePath = path.join(folderPath, entry.name);
      const relativePath = path.relative(rootPath, absolutePath).replace(/\\/g, "/");
      if (entry.isSymbolicLink()) {
        issues.push(issue("symlink_forbidden", "error", "Symbolic links are not allowed in UGC packs.", relativePath));
        continue;
      }
      if (entry.isDirectory()) {
        if (!IGNORED_SEGMENTS.has(entry.name)) visit(absolutePath);
        continue;
      }
      if (!entry.isFile() || absolutePath === manifestPath || IGNORED_FILES.has(entry.name)) continue;
      const normalized = normalizePackRelativePath(relativePath);
      if (!normalized) {
        issues.push(issue("file_path_invalid", "error", "A pack file has an unsafe path.", relativePath));
        continue;
      }
      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        issues.push(issue("file_path_collision", "error", "Pack file paths must be unique ignoring case.", normalized));
        continue;
      }
      seen.add(key);
      files.push({ absolutePath, relativePath: normalized, size: fs.statSync(absolutePath).size });
      if (files.length > MAX_PACK_FILES) {
        issues.push(issue("too_many_files", "error", `A pack cannot contain more than ${MAX_PACK_FILES} runtime files.`));
        return;
      }
    }
  };
  visit(rootPath);
  return files;
}

function readSchemaVersion(manifest: ManifestRecord, issues: PlayZoneSecurityIssue[]) {
  const raw = manifest.formatVersion ?? manifest.schemaVersion;
  const value = typeof raw === "number" && Number.isInteger(raw) ? raw : Number.NaN;
  if (!Number.isFinite(value)) {
    issues.push(issue("schema_version_missing", "warning", `schemaVersion ${PLAY_ZONE_CURRENT_FORMAT_VERSION} is required.`));
    return undefined;
  }
  if (value !== PLAY_ZONE_CURRENT_FORMAT_VERSION) {
    issues.push(issue("schema_version_unsupported", "error", `Only schemaVersion ${PLAY_ZONE_CURRENT_FORMAT_VERSION} is supported.`));
  }
  return value;
}

function readEntryPath(value: unknown, issues: PlayZoneSecurityIssue[]) {
  if (!isRecord(value)) {
    issues.push(issue("entry_invalid", "error", "entry must be an object with type and path."));
    return "";
  }
  if (value.type !== "html" && value.type !== "iframe") {
    issues.push(issue("entry_type_invalid", "error", "entry.type must be html or iframe."));
  }
  const rawPath = typeof value.path === "string" ? value.path.trim().replace(/\\/g, "/") : "";
  const entryPath = normalizePackRelativePath(rawPath);
  if (!entryPath || entryPath !== rawPath || path.posix.extname(entryPath).toLowerCase() !== ".html") {
    issues.push(issue("entry_path_invalid", "error", "entry.path must be a canonical relative .html file path."));
    return "";
  }
  return entryPath;
}

function readThumbnailPath(manifest: ManifestRecord, issues: PlayZoneSecurityIssue[]) {
  const raw = cleanText(manifest.thumbnail ?? asRecord(manifest.metadata).thumbnail, 512).replace(/\\/g, "/");
  if (!raw) return "";
  const normalized = normalizePackRelativePath(raw);
  if (!normalized || normalized !== raw || !IMAGE_EXTENSIONS.has(path.posix.extname(normalized).toLowerCase())) {
    issues.push(issue("thumbnail_path_invalid", "error", "thumbnail must be a safe local raster image path."));
    return "";
  }
  return normalized;
}

function readPermissions(value: unknown, issues: PlayZoneSecurityIssue[]) {
  const raw = asRecord(value);
  if (!isRecord(value)) {
    issues.push(issue("permissions_missing", "warning", "permissions must explicitly declare every Host API capability."));
  }
  const keys = ["walletSpend", "storage", "network", "externalLinks", "cardRead"] as const;
  const knownKeys = new Set<string>(keys);
  for (const key of Object.keys(raw)) {
    if (!knownKeys.has(key)) {
      issues.push(issue(
        "permissions_missing",
        "error",
        `permissions contains an unsupported capability: ${key}.`
      ));
    }
  }
  const permissions = { ...NO_PERMISSIONS };
  for (const key of keys) {
    if (typeof raw[key] !== "boolean") {
      issues.push(issue(`permission_${key}_missing`, "warning", `permissions.${key} must be true or false.`));
    } else {
      permissions[key] = raw[key] as boolean;
    }
  }
  for (const key of ["network", "externalLinks", "cardRead"] as const) {
    if (permissions[key]) {
      issues.push(issue(`permission_${key}_unsupported`, "error", `permissions.${key} is not supported in this release and remains denied.`));
    }
  }
  return permissions;
}

function readDiamondActions(value: unknown, permissions: PlayZonePermissions, issues: PlayZoneSecurityIssue[]) {
  const rawActions = asRecord(value).diamondActions;
  if (rawActions === undefined) return [];
  if (!Array.isArray(rawActions) || rawActions.length > 64) {
    issues.push(issue("diamond_actions_invalid", "error", "economy.diamondActions must contain at most 64 actions."));
    return [];
  }
  if (!permissions.walletSpend && rawActions.length) {
    issues.push(issue("wallet_permission_missing", "error", "Diamond actions require permissions.walletSpend=true."));
  }
  const seen = new Set<string>();
  const actions: PlayZoneDiamondAction[] = [];
  for (const value of rawActions) {
    const raw = asRecord(value);
    const id = cleanText(raw.id, 80);
    const amount = Math.floor(Number(raw.amount));
    const reason = cleanText(raw.reason, 160);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(id) || seen.has(id) || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000 || !reason) {
      issues.push(issue("diamond_action_invalid", "error", "Each diamond action needs a unique safe id, amount, and reason."));
      continue;
    }
    seen.add(id);
    actions.push({ id, amount, reason, requiresConfirm: true, repeatable: raw.repeatable === true });
  }
  return actions;
}

export function normalizePackRelativePath(value: string) {
  const normalized = value.trim().replace(/\\/g, "/");
  if (!normalized || normalized.includes("\0") || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) return "";
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes(":") || /[. ]$/.test(segment))) return "";
  return normalized;
}

function readSemver(value: unknown, field: string, required: boolean, issues: PlayZoneSecurityIssue[]) {
  const normalized = cleanText(value, 80);
  if (!normalized) {
    if (required) issues.push(issue(`${field}_missing`, "warning", `${field} is required.`));
    return "";
  }
  if (!SEMVER_PATTERN.test(normalized)) {
    issues.push(issue(`${field}_invalid`, "error", `${field} must be semantic versioning (for example, 1.2.3).`));
    return "";
  }
  return normalized;
}

function compareSemver(left: string, right: string) {
  const [leftWithoutBuild, rightWithoutBuild] = [left, right].map((value) => value.split("+", 1)[0]);
  const [leftCore, leftPrerelease = ""] = splitSemverPrerelease(leftWithoutBuild);
  const [rightCore, rightPrerelease = ""] = splitSemverPrerelease(rightWithoutBuild);
  const a = leftCore.split(".").map(Number);
  const b = rightCore.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  if (!leftPrerelease && !rightPrerelease) return 0;
  if (!leftPrerelease) return 1;
  if (!rightPrerelease) return -1;

  const leftParts = leftPrerelease.split(".");
  const rightParts = rightPrerelease.split(".");
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) return Number(leftPart) - Number(rightPart);
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart.localeCompare(rightPart, "en");
  }
  return 0;
}

function splitSemverPrerelease(value: string): [string, string?] {
  const separatorIndex = value.indexOf("-");
  return separatorIndex < 0
    ? [value]
    : [value.slice(0, separatorIndex), value.slice(separatorIndex + 1)];
}

function readSaveSchemaVersion(manifest: ManifestRecord) {
  const raw = manifest.saveSchemaVersion ?? asRecord(manifest.save).schemaVersion;
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  return cleanText(raw, 40) || undefined;
}

function readReleaseNotes(manifest: ManifestRecord) {
  if (Array.isArray(manifest.releaseNotes)) {
    return manifest.releaseNotes.map((item) => cleanText(item, 500)).filter(Boolean).join("\n") || undefined;
  }
  return cleanText(manifest.releaseNotes ?? asRecord(manifest.metadata).releaseNotes, 2_000) || undefined;
}

function readTags(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => cleanText(item, 40)).filter(Boolean).slice(0, 12)
    : [];
}

function readCreator(value: unknown) {
  return cleanText(typeof value === "string" ? value : asRecord(value).name, 120);
}

function readRequiredString(value: unknown, code: string, message: string, issues: PlayZoneSecurityIssue[]) {
  const normalized = cleanText(value, 2_000);
  if (!normalized) issues.push(issue(code, "warning", message));
  return normalized;
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function normalizeSha256(value: unknown) {
  if (typeof value !== "string") return "";
  const normalized = value.trim().toLowerCase().replace(/^sha256:/, "").replace(/^sha256-/, "");
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : "";
}

function isSafeSourceUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function isRegularFileWithoutSymlink(filePath: string) {
  try {
    const stat = fs.lstatSync(filePath);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function issue(code: string, severity: "warning" | "error", message: string, file?: string): PlayZoneSecurityIssue {
  return { code, severity, message, file };
}

function emptyInspection(securityReport: PlayZoneSecurityReport, manifestPath?: string): InspectedPlayZonePack {
  return {
    manifestPath,
    tags: [],
    permissions: { ...NO_PERMISSIONS },
    diamondActions: [],
    runtimeFiles: [],
    securityReport
  };
}

function isRecord(value: unknown): value is ManifestRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): ManifestRecord {
  return isRecord(value) ? value : {};
}
