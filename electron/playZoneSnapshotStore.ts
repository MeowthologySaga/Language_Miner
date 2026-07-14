import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  PlayZoneLibraryEntry,
  PlayZoneLibraryEntrySourceType,
  PlayZoneRuntimeAuthorization
} from "../src/shared/types";
import { isRetiredPlayZonePackId } from "../src/shared/playZoneRetiredPacks";
import {
  inspectPlayZonePack,
  isExecutablePlayZoneStatus,
  type InspectedPlayZonePack
} from "./playZoneManifest";

export const PLAY_ZONE_INSTALLED_ENTRY_PROTOCOL = "lem-playzone-install";
export const PLAY_ZONE_MAX_INSTALLED_PACKS = 128;
export const PLAY_ZONE_MAX_SNAPSHOT_BYTES = 512 * 1024 * 1024;
export const PLAY_ZONE_MAX_TOTAL_SNAPSHOT_BYTES = 1024 * 1024 * 1024;

const SNAPSHOT_METADATA_FILE = ".lem-snapshot.json";
const SNAPSHOT_TEMP_PREFIX = ".tmp-";
const SNAPSHOT_TEMP_TTL_MS = 24 * 60 * 60 * 1000;
const INSTALLATION_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{7,127}$/;
const PACK_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,127}$/;
const MAX_METADATA_BYTES = 64 * 1024;

type SnapshotMetadata = {
  formatVersion: 1;
  installationId: string;
  createdAt: string;
  sourceType: PlayZoneLibraryEntrySourceType;
  fileName: string;
  packId: string;
  packSha256: string;
  totalBytes: number;
  bundled: boolean;
};

export type PlayZoneSnapshotSource = {
  packRootPath: string;
  sourceType: PlayZoneLibraryEntrySourceType;
  fileName: string;
};

export type InstallPlayZoneSnapshotOptions = {
  replaceInstallationId?: string;
  requestedInstallationId?: string;
  trustedOfficial?: boolean;
  bundled?: boolean;
  limits?: Partial<PlayZoneSnapshotLimits>;
  verifiedInspection?: InspectedPlayZonePack;
};

export type PlayZoneSnapshotLimits = {
  maxInstalledPacks: number;
  maxSnapshotBytes: number;
  maxTotalBytes: number;
};

export type AuthorizedPlayZoneSnapshot = {
  authorization: PlayZoneRuntimeAuthorization;
  snapshotRootPath: string;
  relativeEntryPath: string;
  runtimeFiles: Array<{ relativePath: string; sha256: string; size: number }>;
};

const trustedOfficialInstallationIds = new Set<string>();

export function installPlayZoneSnapshot(
  installedRootPath: string,
  source: PlayZoneSnapshotSource,
  options: InstallPlayZoneSnapshotOptions = {}
): PlayZoneLibraryEntry {
  const rootPath = ensureInstalledRoot(installedRootPath);
  cleanupPlayZoneSnapshotTemps(rootPath);
  const trustedOfficial = options.trustedOfficial === true;
  const sourceRootPath = normalizeExistingSnapshotSource(source.packRootPath);
  const inspection = options.verifiedInspection
    ?? inspectPlayZonePack(sourceRootPath, { trustedOfficial });
  assertInstallableInspection(inspection);
  if (!options.replaceInstallationId && !options.requestedInstallationId) {
    const duplicate = findInstalledSnapshotByPackHash(
      rootPath,
      inspection.id,
      inspection.securityReport.packSha256
    );
    if (duplicate) return duplicate;
  }
  const existingSamePack = findSnapshotMetadataByPackId(rootPath, inspection.id);
  if (
    existingSamePack &&
    existingSamePack.installationId !== options.replaceInstallationId &&
    existingSamePack.installationId !== options.requestedInstallationId &&
    !(trustedOfficial && options.bundled && existingSamePack.bundled)
  ) {
    throw new Error("This PlayZone pack is already installed. Use the verified update flow to replace it.");
  }

  const installationId = normalizeRequestedInstallationId(options.requestedInstallationId)
    ?? `pack-${randomUUID()}`;
  if (options.replaceInstallationId) {
    if (!INSTALLATION_ID_PATTERN.test(options.replaceInstallationId)) {
      throw new Error("Invalid replacement PlayZone installation identifier.");
    }
    const replacedMetadata = readSnapshotMetadata(
      resolveInstallationPath(rootPath, options.replaceInstallationId)
    );
    if (!replacedMetadata) {
      throw new Error("The PlayZone snapshot selected for update is no longer installed.");
    }
    if (replacedMetadata?.bundled) {
      throw new Error("Bundled PlayZone packs can only be replaced by an app update.");
    }
  }
  const finalPath = resolveInstallationPath(rootPath, installationId);
  const existing = readInstalledSnapshot(rootPath, installationId, trustedOfficial);
  if (
    existing &&
    existing.entry.securityReport?.packSha256 === inspection.securityReport.packSha256
  ) {
    if (trustedOfficial) trustedOfficialInstallationIds.add(installationId);
    return existing.entry;
  }
  if (fs.existsSync(finalPath)) {
    if (!options.requestedInstallationId || !trustedOfficial) {
      throw new Error("The requested PlayZone installation identifier is already in use.");
    }
    removeSnapshotDirectory(rootPath, finalPath);
  }

  const manifestPath = inspection.manifestPath;
  if (!manifestPath || !inspection.securityReport.packSha256 || !inspection.id) {
    throw new Error("The inspected PlayZone pack is missing snapshot metadata.");
  }
  const manifestBytes = readVerifiedSourceFile(manifestPath);
  const snapshotBytes = manifestBytes.length + inspection.runtimeFiles.reduce(
    (total, file) => total + file.size,
    0
  );
  enforceSnapshotQuotas(rootPath, snapshotBytes, options.replaceInstallationId, options.limits);

  const stagingPath = resolveInstallationPath(
    rootPath,
    `${SNAPSHOT_TEMP_PREFIX}${installationId}-${randomUUID()}`
  );
  fs.mkdirSync(stagingPath, { recursive: false, mode: 0o700 });
  try {
    writeSnapshotFile(stagingPath, path.basename(manifestPath), manifestBytes);
    for (const runtimeFile of inspection.runtimeFiles) {
      const sourceFilePath = resolveRuntimeFile(sourceRootPath, runtimeFile.relativePath);
      const contents = readVerifiedSourceFile(sourceFilePath, runtimeFile.sha256, runtimeFile.size);
      writeSnapshotFile(stagingPath, runtimeFile.relativePath, contents);
    }

    const snapshotInspection = inspectPlayZonePack(stagingPath, { trustedOfficial });
    if (
      !isExecutablePlayZoneStatus(snapshotInspection.securityReport.status) ||
      snapshotInspection.securityReport.packSha256 !== inspection.securityReport.packSha256
    ) {
      throw new Error("The immutable PlayZone snapshot did not match the inspected source pack.");
    }

    const metadata: SnapshotMetadata = {
      formatVersion: 1,
      installationId,
      createdAt: new Date().toISOString(),
      sourceType: source.sourceType,
      fileName: sanitizeFileName(source.fileName),
      packId: inspection.id,
      packSha256: inspection.securityReport.packSha256,
      totalBytes: snapshotBytes,
      bundled: options.bundled === true
    };
    writeSnapshotMetadata(stagingPath, metadata);
    promoteSnapshotDirectory(stagingPath, finalPath);
  } catch (error) {
    removeSnapshotDirectory(rootPath, stagingPath);
    throw error;
  }

  if (trustedOfficial) trustedOfficialInstallationIds.add(installationId);

  const installed = readInstalledSnapshot(rootPath, installationId, trustedOfficial);
  if (!installed) {
    removePlayZoneSnapshot(rootPath, installationId);
    throw new Error("The installed PlayZone snapshot failed its final verification.");
  }
  if (options.replaceInstallationId && options.replaceInstallationId !== installationId) {
    removePlayZoneSnapshot(rootPath, options.replaceInstallationId);
  }
  return installed.entry;
}

export function ensureBundledPlayZoneSnapshot(
  installedRootPath: string,
  source: PlayZoneSnapshotSource,
  expectedPackId?: string
): PlayZoneLibraryEntry {
  const sourceRootPath = normalizeExistingSnapshotSource(source.packRootPath);
  const sourceInspection = inspectPlayZonePack(sourceRootPath, { trustedOfficial: true });
  assertInstallableInspection(sourceInspection);
  const digest = sourceInspection.securityReport.packSha256;
  const packId = sourceInspection.id;
  if (!digest || !packId) throw new Error("The bundled PlayZone pack is missing an identity hash.");
  if (expectedPackId && packId !== expectedPackId) {
    throw new Error("The bundled PlayZone pack identity does not match the app registry.");
  }
  const installationId = `official-${sanitizeIdPart(packId)}-${digest.slice(0, 20)}`;
  const entry = installPlayZoneSnapshot(installedRootPath, { ...source, packRootPath: sourceRootPath }, {
    requestedInstallationId: installationId,
    trustedOfficial: true,
    bundled: true,
    verifiedInspection: sourceInspection
  });
  cleanupSupersededBundledSnapshots(installedRootPath, packId, installationId);
  trustedOfficialInstallationIds.add(installationId);
  return entry;
}

export function listInstalledPlayZoneSnapshots(
  installedRootPath: string,
  options: { excludedInstallationIds?: ReadonlySet<string> } = {}
) {
  const rootPath = ensureInstalledRoot(installedRootPath);
  cleanupPlayZoneSnapshotTemps(rootPath);
  const entries: PlayZoneLibraryEntry[] = [];
  for (const dirent of fs.readdirSync(rootPath, { withFileTypes: true })) {
    if (!dirent.isDirectory() || dirent.isSymbolicLink() || dirent.name.startsWith(".")) continue;
    if (options.excludedInstallationIds?.has(dirent.name)) continue;
    const installed = readInstalledSnapshot(
      rootPath,
      dirent.name,
      trustedOfficialInstallationIds.has(dirent.name)
    );
    if (installed) {
      entries.push(installed.entry);
    } else {
      const blocked = createBlockedSnapshotEntry(rootPath, dirent.name);
      if (blocked) entries.push(blocked);
    }
  }
  return entries.sort((left, right) => {
    if (left.bundled !== right.bundled) return left.bundled ? -1 : 1;
    return left.title.localeCompare(right.title, undefined, { numeric: true, sensitivity: "base" });
  });
}

export function authorizeInstalledPlayZoneSnapshot(
  installedRootPath: string,
  rawEntryUrl: string
): AuthorizedPlayZoneSnapshot | null {
  const installationId = parseInstalledEntryUrl(rawEntryUrl);
  if (!installationId) return null;
  const existingRootPath = resolveInstalledRootWithoutCreating(installedRootPath);
  if (!existingRootPath) return null;
  const installed = readInstalledSnapshot(
    existingRootPath,
    installationId,
    trustedOfficialInstallationIds.has(installationId)
  );
  if (!installed?.inspection.entryPath || isRetiredPlayZonePackId(installed.entry.id)) return null;
  return {
    authorization: {
      cartridgeId: installed.entry.id,
      title: installed.entry.title,
      entryUrl: installed.entry.entryUrl ?? "",
      status: installed.inspection.securityReport.status === "trusted_official"
        ? "trusted_official"
        : "ready",
      permissions: installed.inspection.permissions,
      diamondActions: installed.inspection.diamondActions
    },
    snapshotRootPath: installed.snapshotRootPath,
    relativeEntryPath: installed.inspection.entryPath,
    runtimeFiles: installed.inspection.runtimeFiles
  };
}

export function removePlayZoneSnapshot(installedRootPath: string, installationId: string) {
  if (!INSTALLATION_ID_PATTERN.test(installationId)) return false;
  const rootPath = ensureInstalledRoot(installedRootPath);
  const snapshotPath = resolveInstallationPath(rootPath, installationId);
  if (!fs.existsSync(snapshotPath)) return false;
  removeSnapshotDirectory(rootPath, snapshotPath);
  trustedOfficialInstallationIds.delete(installationId);
  return true;
}

export function createInstalledPlayZoneEntryUrl(installationId: string) {
  if (!INSTALLATION_ID_PATTERN.test(installationId)) {
    throw new Error("Invalid PlayZone installation identifier.");
  }
  return `${PLAY_ZONE_INSTALLED_ENTRY_PROTOCOL}://pack/${installationId}`;
}

export function parseInstalledEntryUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    if (
      parsed.protocol !== `${PLAY_ZONE_INSTALLED_ENTRY_PROTOCOL}:` ||
      parsed.hostname !== "pack" ||
      parsed.search ||
      parsed.hash
    ) return null;
    const parts = parsed.pathname.replace(/^\/+/, "").split("/").filter(Boolean);
    return parts.length === 1 && INSTALLATION_ID_PATTERN.test(parts[0]) ? parts[0] : null;
  } catch {
    return null;
  }
}

export function cleanupPlayZoneSnapshotTemps(installedRootPath: string, now = Date.now()) {
  const rootPath = ensureInstalledRoot(installedRootPath);
  let removed = 0;
  for (const dirent of fs.readdirSync(rootPath, { withFileTypes: true })) {
    if (!dirent.isDirectory() || dirent.isSymbolicLink() || !dirent.name.startsWith(SNAPSHOT_TEMP_PREFIX)) {
      continue;
    }
    const candidatePath = resolveInstallationPath(rootPath, dirent.name);
    const ageMs = now - fs.statSync(candidatePath).mtimeMs;
    if (ageMs >= SNAPSHOT_TEMP_TTL_MS) {
      removeSnapshotDirectory(rootPath, candidatePath);
      removed += 1;
    }
  }
  return removed;
}

function readInstalledSnapshot(rootPath: string, installationId: string, trustedOfficial: boolean) {
  if (!INSTALLATION_ID_PATTERN.test(installationId)) return null;
  const snapshotRootPath = resolveInstallationPath(rootPath, installationId);
  const metadata = readSnapshotMetadata(snapshotRootPath);
  if (!metadata || metadata.installationId !== installationId) return null;
  let inspection: InspectedPlayZonePack;
  try {
    inspection = inspectPlayZonePack(snapshotRootPath, { trustedOfficial });
  } catch {
    return null;
  }
  if (
    !isExecutablePlayZoneStatus(inspection.securityReport.status) ||
    inspection.securityReport.packSha256 !== metadata.packSha256 ||
    inspection.id !== metadata.packId ||
    !inspection.entryPath
  ) return null;
  const entry = createInstalledLibraryEntry(metadata, inspection);
  return { entry, inspection, snapshotRootPath };
}

function findInstalledSnapshotByPackHash(
  rootPath: string,
  packId: string | undefined,
  packSha256: string | undefined
) {
  if (!packId || !packSha256) return null;
  for (const dirent of fs.readdirSync(rootPath, { withFileTypes: true })) {
    if (!dirent.isDirectory() || dirent.isSymbolicLink() || dirent.name.startsWith(".")) continue;
    const metadata = readSnapshotMetadata(path.join(rootPath, dirent.name));
    if (metadata?.packId !== packId || metadata.packSha256 !== packSha256) continue;
    const installed = readInstalledSnapshot(
      rootPath,
      dirent.name,
      trustedOfficialInstallationIds.has(dirent.name)
    );
    if (installed) return installed.entry;
  }
  return null;
}

function findSnapshotMetadataByPackId(rootPath: string, packId: string | undefined) {
  if (!packId) return null;
  for (const dirent of fs.readdirSync(rootPath, { withFileTypes: true })) {
    if (!dirent.isDirectory() || dirent.isSymbolicLink() || dirent.name.startsWith(".")) continue;
    const metadata = readSnapshotMetadata(path.join(rootPath, dirent.name));
    if (metadata?.packId === packId) return metadata;
  }
  return null;
}

function createInstalledLibraryEntry(
  metadata: SnapshotMetadata,
  inspection: InspectedPlayZonePack
): PlayZoneLibraryEntry {
  const status = inspection.securityReport.status === "trusted_official" ? "trusted_official" : "ready";
  return {
    id: inspection.id ?? metadata.packId,
    title: inspection.title ?? metadata.fileName,
    creator: inspection.creator ?? "Unknown creator",
    version: inspection.version,
    lineageId: inspection.lineageId,
    minPlayZoneVersion: inspection.minPlayZoneVersion,
    saveSchemaVersion: inspection.saveSchemaVersion,
    releaseNotes: inspection.releaseNotes,
    summary: inspection.summary ?? "Installed PlayZone UGC pack.",
    tags: inspection.tags.length ? inspection.tags : [metadata.bundled ? "Official" : "Installed"],
    category: inspection.category,
    license: inspection.license,
    sourceUrl: inspection.sourceUrl,
    permissions: inspection.permissions,
    diamondActions: inspection.diamondActions,
    securityReport: { ...inspection.securityReport, status },
    installationId: metadata.installationId,
    installed: true,
    bundled: metadata.bundled,
    sourceType: metadata.sourceType,
    sourcePath: createInstalledPlayZoneEntryUrl(metadata.installationId),
    fileName: metadata.fileName,
    entryUrl: createInstalledPlayZoneEntryUrl(metadata.installationId),
    status,
    message: "This app-managed immutable snapshot passed its SHA-256 security inspection.",
    discoveredAt: metadata.createdAt
  };
}

function createBlockedSnapshotEntry(rootPath: string, installationId: string): PlayZoneLibraryEntry | null {
  const metadata = readSnapshotMetadata(resolveInstallationPath(rootPath, installationId));
  if (!metadata) return null;
  const permissions = {
    walletSpend: false,
    storage: false,
    network: false,
    externalLinks: false,
    cardRead: false
  };
  const checkedAt = new Date().toISOString();
  return {
    id: metadata.packId,
    title: metadata.fileName,
    creator: "Unknown creator",
    summary: "This installed snapshot failed its SHA-256 revalidation and cannot run.",
    tags: ["Blocked", "Snapshot"],
    permissions,
    diamondActions: [],
    securityReport: {
      status: "blocked",
      packSha256: metadata.packSha256,
      permissions,
      checkedAt,
      issues: [{
        code: "snapshot_integrity_failed",
        severity: "error",
        message: "The app-managed snapshot no longer matches its verified SHA-256 manifest."
      }]
    },
    installationId,
    installed: true,
    bundled: metadata.bundled,
    sourceType: metadata.sourceType,
    sourcePath: createInstalledPlayZoneEntryUrl(installationId),
    fileName: metadata.fileName,
    status: "blocked",
    message: "The installed snapshot failed integrity revalidation.",
    discoveredAt: metadata.createdAt
  };
}

function enforceSnapshotQuotas(
  rootPath: string,
  incomingBytes: number,
  replaceInstallationId: string | undefined,
  overrides: Partial<PlayZoneSnapshotLimits> | undefined
) {
  const limits: PlayZoneSnapshotLimits = {
    maxInstalledPacks: overrides?.maxInstalledPacks ?? PLAY_ZONE_MAX_INSTALLED_PACKS,
    maxSnapshotBytes: overrides?.maxSnapshotBytes ?? PLAY_ZONE_MAX_SNAPSHOT_BYTES,
    maxTotalBytes: overrides?.maxTotalBytes ?? PLAY_ZONE_MAX_TOTAL_SNAPSHOT_BYTES
  };
  if (incomingBytes <= 0 || incomingBytes > limits.maxSnapshotBytes) {
    throw new Error("The PlayZone snapshot exceeds the per-pack storage quota.");
  }
  let count = 0;
  let totalBytes = 0;
  for (const dirent of fs.readdirSync(rootPath, { withFileTypes: true })) {
    if (!dirent.isDirectory() || dirent.isSymbolicLink() || dirent.name.startsWith(".")) continue;
    if (dirent.name === replaceInstallationId) continue;
    count += 1;
    totalBytes += measureDirectoryBytes(path.join(rootPath, dirent.name), limits.maxTotalBytes + 1);
  }
  if (count + 1 > limits.maxInstalledPacks) {
    throw new Error("The PlayZone installed-pack count quota has been reached.");
  }
  if (totalBytes + incomingBytes > limits.maxTotalBytes) {
    throw new Error("The PlayZone installed-pack storage quota has been reached.");
  }
}

function cleanupSupersededBundledSnapshots(rootPath: string, packId: string, currentId: string) {
  const normalizedRoot = ensureInstalledRoot(rootPath);
  for (const dirent of fs.readdirSync(normalizedRoot, { withFileTypes: true })) {
    if (!dirent.isDirectory() || dirent.isSymbolicLink() || dirent.name === currentId) continue;
    const metadata = readSnapshotMetadata(path.join(normalizedRoot, dirent.name));
    if (metadata?.bundled && metadata.packId === packId) {
      removePlayZoneSnapshot(normalizedRoot, dirent.name);
    }
  }
}

function assertInstallableInspection(inspection: InspectedPlayZonePack) {
  if (!isExecutablePlayZoneStatus(inspection.securityReport.status)) {
    throw new Error("Only ready or trusted_official PlayZone packs can be installed.");
  }
  if (!inspection.entryPath || !inspection.runtimeFiles.length) {
    throw new Error("The PlayZone pack has no verified executable snapshot files.");
  }
}

function normalizeExistingSnapshotSource(folderPath: string) {
  const normalized = path.resolve(folderPath);
  const stat = fs.lstatSync(normalized);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("The PlayZone snapshot source must be a regular directory.");
  }
  return normalized;
}

function ensureInstalledRoot(installedRootPath: string) {
  const rootPath = path.resolve(installedRootPath);
  fs.mkdirSync(rootPath, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(rootPath);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("The PlayZone installation root is unsafe.");
  }
  return rootPath;
}

function resolveInstalledRootWithoutCreating(installedRootPath: string) {
  const rootPath = path.resolve(installedRootPath);
  if (!fs.existsSync(rootPath)) return null;
  const stat = fs.lstatSync(rootPath);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("The PlayZone installation root is unsafe.");
  }
  return rootPath;
}

function resolveInstallationPath(rootPath: string, installationId: string) {
  const candidate = path.resolve(rootPath, installationId);
  const relative = path.relative(rootPath, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("The PlayZone installation path escaped its managed root.");
  }
  return candidate;
}

function resolveRuntimeFile(rootPath: string, relativePath: string) {
  const filePath = path.resolve(rootPath, relativePath);
  const relative = path.relative(rootPath, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("A PlayZone runtime file escaped its pack root.");
  }
  return filePath;
}

function readVerifiedSourceFile(filePath: string, expectedSha256?: string, expectedSize?: number) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("A PlayZone snapshot source file is not a regular file.");
  }
  if (expectedSize !== undefined && stat.size !== expectedSize) {
    throw new Error("A PlayZone source file changed after security inspection.");
  }
  const contents = fs.readFileSync(filePath);
  if (expectedSha256 && sha256(contents) !== expectedSha256) {
    throw new Error("A PlayZone source file changed after security inspection.");
  }
  return contents;
}

function writeSnapshotFile(rootPath: string, relativePath: string, contents: Buffer) {
  const filePath = resolveRuntimeFile(rootPath, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, contents, { flag: "wx", mode: 0o600 });
}

function writeSnapshotMetadata(rootPath: string, metadata: SnapshotMetadata) {
  const bytes = Buffer.from(JSON.stringify(metadata), "utf8");
  if (bytes.length > MAX_METADATA_BYTES) throw new Error("PlayZone snapshot metadata is too large.");
  fs.writeFileSync(path.join(rootPath, SNAPSHOT_METADATA_FILE), bytes, { flag: "wx", mode: 0o600 });
}

function readSnapshotMetadata(snapshotRootPath: string): SnapshotMetadata | null {
  try {
    const metadataPath = path.join(snapshotRootPath, SNAPSHOT_METADATA_FILE);
    const stat = fs.lstatSync(metadataPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_METADATA_BYTES) return null;
    const raw = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as Partial<SnapshotMetadata>;
    if (
      raw.formatVersion !== 1 ||
      typeof raw.installationId !== "string" ||
      !INSTALLATION_ID_PATTERN.test(raw.installationId) ||
      typeof raw.createdAt !== "string" ||
      raw.createdAt.length > 40 ||
      !Number.isFinite(Date.parse(raw.createdAt)) ||
      (raw.sourceType !== "file" && raw.sourceType !== "folder") ||
      typeof raw.fileName !== "string" ||
      raw.fileName.length > 180 ||
      /[\u0000-\u001f]/.test(raw.fileName) ||
      typeof raw.packId !== "string" ||
      !PACK_ID_PATTERN.test(raw.packId) ||
      typeof raw.packSha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(raw.packSha256) ||
      !Number.isSafeInteger(raw.totalBytes) ||
      Number(raw.totalBytes) <= 0 ||
      typeof raw.bundled !== "boolean"
    ) return null;
    return raw as SnapshotMetadata;
  } catch {
    return null;
  }
}

function removeSnapshotDirectory(rootPath: string, snapshotPath: string) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(snapshotPath));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Refusing to remove a PlayZone snapshot outside the managed root.");
  }
  fs.rmSync(snapshotPath, { recursive: true, force: true });
}

function promoteSnapshotDirectory(stagingPath: string, finalPath: string) {
  try {
    fs.renameSync(stagingPath, finalPath);
    return;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
    if (code !== "EPERM" && code !== "EACCES" && code !== "EXDEV") throw error;
  }

  // Some Windows security products temporarily deny directory renames. The
  // copied fallback is still unusable until final full-pack verification below.
  if (fs.existsSync(finalPath)) {
    throw new Error("The PlayZone snapshot destination became unavailable during installation.");
  }
  try {
    fs.cpSync(stagingPath, finalPath, {
      recursive: true,
      force: false,
      errorOnExist: true,
      dereference: false
    });
  } catch (error) {
    if (fs.existsSync(finalPath)) fs.rmSync(finalPath, { recursive: true, force: true });
    throw error;
  }
  fs.rmSync(stagingPath, { recursive: true, force: true });
}

function measureDirectoryBytes(folderPath: string, stopAfter: number) {
  let total = 0;
  const visit = (currentPath: string) => {
    for (const dirent of fs.readdirSync(currentPath, { withFileTypes: true })) {
      if (dirent.isSymbolicLink()) continue;
      const candidate = path.join(currentPath, dirent.name);
      if (dirent.isDirectory()) visit(candidate);
      else if (dirent.isFile()) total += fs.statSync(candidate).size;
      if (total > stopAfter) return;
    }
  };
  visit(folderPath);
  return total;
}

function normalizeRequestedInstallationId(value: string | undefined) {
  if (value === undefined) return undefined;
  if (!INSTALLATION_ID_PATTERN.test(value)) {
    throw new Error("Invalid requested PlayZone installation identifier.");
  }
  return value;
}

function sanitizeFileName(value: string) {
  const fileName = path.basename(value).replace(/[\u0000-\u001f<>:"/\\|?*]/g, "_").slice(0, 180);
  return fileName || "PlayZone Pack";
}

function sanitizeIdPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "pack";
}

function sha256(contents: Buffer) {
  return createHash("sha256").update(contents).digest("hex");
}
