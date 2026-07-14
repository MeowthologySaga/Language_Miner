import { createHash } from "node:crypto";
import { dialog, type BrowserWindow, type OpenDialogOptions } from "electron";
import fs from "node:fs";
import path from "node:path";
import type {
  PlayZoneLibraryEntry,
  PlayZoneLibraryScanResult,
  PlayZoneSecurityReport
} from "../src/shared/types";
import { extractPlayZoneArchiveToCache } from "./playZoneArchive";
import {
  inspectPlayZonePack,
  isExecutablePlayZoneStatus,
  PLAY_ZONE_MANIFEST_FILE_NAMES,
  type InspectedPlayZonePack
} from "./playZoneManifest";
import {
  authorizeInstalledPlayZoneSnapshot,
  ensureBundledPlayZoneSnapshot,
  installPlayZoneSnapshot,
  listInstalledPlayZoneSnapshots
} from "./playZoneSnapshotStore";
import { electronText, type ElectronAppLocale } from "./appDialogLocalization";

const PLAY_ZONE_PACK_FILE_EXTENSIONS = new Set([".lem", ".lemgame", ".zip"]);
const PLAY_ZONE_PACK_FOLDER_EXTENSIONS = new Set([".lem", ".lemgame"]);
const MAX_HASHED_ARCHIVE_BYTES = 256 * 1024 * 1024;
const bundledEntryCache = new Map<string, PlayZoneLibraryEntry[]>();

export type BundledPlayZonePackSource = {
  packRootPath: string;
  expectedPackId: string;
  fileName: string;
};

export type PlayZoneManagedFileWriteRunner = <T>(operation: () => T | Promise<T>) => Promise<T>;

export async function pickPlayZonePackFile(
  ownerWindow: BrowserWindow | null,
  archiveCacheRootPath?: string,
  locale: ElectronAppLocale = "ko",
  runManagedFileWrite?: PlayZoneManagedFileWriteRunner
): Promise<PlayZoneLibraryEntry | null> {
  const options: OpenDialogOptions = {
    title: electronText(locale, "playZonePackTitle"),
    properties: ["openFile"],
    filters: [{ name: electronText(locale, "playZonePackFilter"), extensions: ["lem", "lemgame", "zip"] }]
  };
  const result = ownerWindow
    ? await dialog.showOpenDialog(ownerWindow, options)
    : await dialog.showOpenDialog(options);
  const filePath = result.filePaths[0];
  if (result.canceled || !filePath) return null;
  const inspectSelectedFile = () =>
    createPlayZoneEntryFromFile(filePath, new Date().toISOString(), archiveCacheRootPath);
  return runManagedFileWrite
    ? runManagedFileWrite(inspectSelectedFile)
    : inspectSelectedFile();
}

export async function pickPlayZoneLibraryFolder(
  ownerWindow: BrowserWindow | null,
  archiveCacheRootPath?: string,
  locale: ElectronAppLocale = "ko",
  runManagedFileWrite?: PlayZoneManagedFileWriteRunner
): Promise<PlayZoneLibraryScanResult | null> {
  const options: OpenDialogOptions = {
    title: electronText(locale, "playZoneFolderTitle"),
    properties: ["openDirectory"]
  };
  const result = ownerWindow
    ? await dialog.showOpenDialog(ownerWindow, options)
    : await dialog.showOpenDialog(options);
  const folderPath = result.filePaths[0];
  if (result.canceled || !folderPath) return null;
  const inspectSelectedFolder = () => scanPlayZoneLibraryFolder(folderPath, archiveCacheRootPath);
  return runManagedFileWrite
    ? runManagedFileWrite(inspectSelectedFolder)
    : inspectSelectedFolder();
}

export function scanPlayZoneLibraryFolder(
  folderPath: string,
  archiveCacheRootPath?: string
): PlayZoneLibraryScanResult {
  const normalizedPath = normalizeExistingDirectory(folderPath);
  if (!normalizedPath) throw new Error("PlayZone library folder was not found.");

  const scannedAt = new Date().toISOString();
  const entries = new Map<string, PlayZoneLibraryEntry>();
  const warnings: string[] = [];
  for (const candidatePath of collectPlayZoneCandidatePaths(normalizedPath)) {
    try {
      const stat = fs.lstatSync(candidatePath);
      const entry = stat.isDirectory() && !stat.isSymbolicLink()
        ? createPlayZoneEntryFromDirectory(candidatePath, scannedAt)
        : createPlayZoneEntryFromFile(candidatePath, scannedAt, archiveCacheRootPath);
      entries.set(path.resolve(entry.sourcePath).toLowerCase(), entry);
    } catch (error) {
      warnings.push(`${path.basename(candidatePath)}: ${error instanceof Error ? error.message : "The pack could not be inspected."}`);
    }
  }
  return {
    folderPath: normalizedPath,
    folderName: path.basename(normalizedPath) || normalizedPath,
    entries: Array.from(entries.values()).sort((left, right) =>
      left.title.localeCompare(right.title, undefined, { numeric: true, sensitivity: "base" })
    ),
    warnings,
    scannedAt
  };
}

export function scanPlayZonePackFile(filePath: string, archiveCacheRootPath?: string) {
  return createPlayZoneEntryFromFile(filePath, new Date().toISOString(), archiveCacheRootPath);
}

export function installPlayZonePack(
  input: { sourcePath: string; replaceInstallationId?: string },
  archiveCacheRootPath: string,
  installedRootPath: string
) {
  try {
    const source = resolveInstallablePlayZoneSource(input.sourcePath, archiveCacheRootPath);
    return installPlayZoneSnapshot(installedRootPath, {
      packRootPath: source.packRootPath,
      sourceType: source.sourceType,
      fileName: source.fileName
    }, {
      replaceInstallationId: input.replaceInstallationId
    });
  } catch (error) {
    throw new Error(createPublicPlayZoneInstallError(error));
  }
}

export function listInstalledPlayZonePacks(
  installedRootPath: string,
  bundledPacks: readonly BundledPlayZonePackSource[] = []
) {
  const cacheKey = path.resolve(installedRootPath);
  let bundledEntries = bundledEntryCache.get(cacheKey) ?? [];
  if (!isBundledEntryCacheUsable(cacheKey, bundledEntries, bundledPacks)) {
    assertUniqueBundledPackSources(bundledPacks);
    bundledEntries = bundledPacks.map((pack) =>
      ensureBundledPlayZoneSnapshot(installedRootPath, {
        packRootPath: pack.packRootPath,
        sourceType: "folder",
        fileName: pack.fileName
      }, pack.expectedPackId)
    );
    bundledEntryCache.set(cacheKey, bundledEntries);
  }
  const bundledInstallationIds = new Set(
    bundledEntries.map((entry) => entry.installationId).filter((value): value is string => Boolean(value))
  );
  return [...bundledEntries, ...listInstalledPlayZoneSnapshots(installedRootPath, {
    excludedInstallationIds: bundledInstallationIds
  })].sort((left, right) => {
    if (left.bundled !== right.bundled) return left.bundled ? -1 : 1;
    return left.title.localeCompare(right.title, undefined, { numeric: true, sensitivity: "base" });
  });
}

function isBundledEntryCacheUsable(
  installedRootPath: string,
  entries: PlayZoneLibraryEntry[],
  bundledPacks: readonly BundledPlayZonePackSource[]
) {
  if (entries.length !== bundledPacks.length) return false;
  const expectedIds = new Set(bundledPacks.map((pack) => pack.expectedPackId));
  return entries.every((entry) =>
    Boolean(entry.bundled && entry.installationId && expectedIds.has(entry.id)) &&
    fs.existsSync(path.join(installedRootPath, entry.installationId ?? "", ".lem-snapshot.json"))
  );
}

function assertUniqueBundledPackSources(packs: readonly BundledPlayZonePackSource[]) {
  const ids = new Set<string>();
  const roots = new Set<string>();
  for (const pack of packs) {
    const root = path.resolve(pack.packRootPath).toLowerCase();
    if (ids.has(pack.expectedPackId) || roots.has(root)) {
      throw new Error("Bundled PlayZone pack registry contains duplicate entries.");
    }
    ids.add(pack.expectedPackId);
    roots.add(root);
  }
}

export function authorizePlayZoneRuntimeEntry(entryUrl: string, installedRootPath: string) {
  return authorizeInstalledPlayZoneSnapshot(installedRootPath, entryUrl);
}

function collectPlayZoneCandidatePaths(libraryFolderPath: string) {
  const candidates = new Set<string>();
  for (const scanRoot of getPlayZoneScanRoots(libraryFolderPath)) {
    if (isPlayZonePackDirectory(scanRoot)) {
      candidates.add(scanRoot);
      continue;
    }
    for (const entry of fs.readdirSync(scanRoot, { withFileTypes: true })) {
      const entryPath = path.join(scanRoot, entry.name);
      if (entry.isFile() && PLAY_ZONE_PACK_FILE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        candidates.add(entryPath);
      } else if (entry.isDirectory() && isPlayZonePackDirectory(entryPath)) {
        candidates.add(entryPath);
      }
    }
  }
  return Array.from(candidates);
}

function getPlayZoneScanRoots(libraryFolderPath: string) {
  const roots = [libraryFolderPath];
  const nested = normalizeExistingDirectory(path.join(libraryFolderPath, "lem"));
  if (nested) roots.push(nested);
  return roots;
}

function isPlayZonePackDirectory(folderPath: string) {
  if (PLAY_ZONE_PACK_FOLDER_EXTENSIONS.has(path.extname(folderPath).toLowerCase())) return true;
  return PLAY_ZONE_MANIFEST_FILE_NAMES.some((fileName) => Boolean(normalizeExistingFile(path.join(folderPath, fileName))));
}

function createPlayZoneEntryFromFile(
  filePath: string,
  discoveredAt: string,
  archiveCacheRootPath?: string
): PlayZoneLibraryEntry {
  const normalizedPath = normalizeExistingFile(filePath);
  if (!normalizedPath) throw new Error("PlayZone LEM file was not found.");
  const extension = path.extname(normalizedPath).toLowerCase();
  if (!PLAY_ZONE_PACK_FILE_EXTENSIONS.has(extension)) {
    throw new Error("Only .lem, .lemgame, or .zip PlayZone files can be added.");
  }

  if (!archiveCacheRootPath) {
    return createQuarantinedArchiveEntry(
      normalizedPath,
      discoveredAt,
      "The archive is quarantined until an extraction cache is available.",
      calculateArchiveSha256(normalizedPath)
    );
  }
  try {
    const extracted = extractPlayZoneArchiveToCache(normalizedPath, archiveCacheRootPath);
    const packRootPath = findExtractedPlayZonePackRoot(extracted.rootPath);
    const inspection = inspectPlayZonePack(packRootPath, { archiveSha256: extracted.archiveSha256 });
    return createLibraryEntry({
      sourceType: "file",
      sourcePath: normalizedPath,
      folderPath: packRootPath,
      discoveredAt,
      inspection,
      fallbackTitle: path.basename(normalizedPath, extension),
      fallbackCreator: "Local file"
    });
  } catch (error) {
    return createQuarantinedArchiveEntry(
      normalizedPath,
      discoveredAt,
      error instanceof Error ? error.message : "The archive failed its security inspection.",
      calculateArchiveSha256(normalizedPath)
    );
  }
}

function resolveInstallablePlayZoneSource(sourcePath: string, archiveCacheRootPath: string) {
  const directoryPath = normalizeExistingDirectory(sourcePath);
  if (directoryPath) {
    const inspection = inspectPlayZonePack(directoryPath);
    if (!isExecutablePlayZoneStatus(inspection.securityReport.status)) {
      throw new Error(createStatusMessage(inspection.securityReport.status, inspection.securityReport.issues));
    }
    return {
      packRootPath: directoryPath,
      sourceType: "folder" as const,
      fileName: stripPlayZoneFolderExtension(path.basename(directoryPath))
    };
  }

  const filePath = normalizeExistingFile(sourcePath);
  if (!filePath || !PLAY_ZONE_PACK_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    throw new Error("The selected PlayZone pack source is no longer available.");
  }
  const extracted = extractPlayZoneArchiveToCache(filePath, archiveCacheRootPath);
  const packRootPath = findExtractedPlayZonePackRoot(extracted.rootPath);
  const inspection = inspectPlayZonePack(packRootPath, { archiveSha256: extracted.archiveSha256 });
  if (!isExecutablePlayZoneStatus(inspection.securityReport.status)) {
    throw new Error(createStatusMessage(inspection.securityReport.status, inspection.securityReport.issues));
  }
  return {
    packRootPath,
    sourceType: "file" as const,
    fileName: path.basename(filePath)
  };
}

function createQuarantinedArchiveEntry(
  sourcePath: string,
  discoveredAt: string,
  message: string,
  archiveSha256?: string
): PlayZoneLibraryEntry {
  const checkedAt = new Date().toISOString();
  const permissions = {
    walletSpend: false,
    storage: false,
    network: false,
    externalLinks: false,
    cardRead: false
  };
  const securityReport: PlayZoneSecurityReport = {
    status: "quarantined",
    archiveSha256,
    permissions,
    checkedAt,
    issues: [{ code: "archive_quarantined", severity: "error", message }]
  };
  return {
    id: createStablePlayZoneEntryId("file", sourcePath),
    title: path.basename(sourcePath, path.extname(sourcePath)),
    creator: "Local file",
    summary: "This archive is not executable until it passes the PlayZone security inspection.",
    tags: [path.extname(sourcePath).slice(1).toUpperCase(), "Quarantined"],
    permissions,
    diamondActions: [],
    securityReport,
    sourceType: "file",
    sourcePath,
    fileName: path.basename(sourcePath),
    folderPath: path.dirname(sourcePath),
    status: "quarantined",
    message,
    discoveredAt
  };
}

function findExtractedPlayZonePackRoot(extractedFolderPath: string) {
  if (PLAY_ZONE_MANIFEST_FILE_NAMES.some((name) => normalizeExistingFile(path.join(extractedFolderPath, name)))) {
    return extractedFolderPath;
  }
  const children = fs.readdirSync(extractedFolderPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && !entry.name.startsWith("."))
    .map((entry) => path.join(extractedFolderPath, entry.name))
    .filter((folder) => PLAY_ZONE_MANIFEST_FILE_NAMES.some((name) => normalizeExistingFile(path.join(folder, name))));
  return children.length === 1 ? children[0] : extractedFolderPath;
}

function createPlayZoneEntryFromDirectory(folderPath: string, discoveredAt: string) {
  const normalizedPath = normalizeExistingDirectory(folderPath);
  if (!normalizedPath) throw new Error("PlayZone game folder was not found.");
  const inspection = inspectPlayZonePack(normalizedPath);
  return createLibraryEntry({
    sourceType: "folder",
    sourcePath: normalizedPath,
    folderPath: normalizedPath,
    discoveredAt,
    inspection,
    fallbackTitle: stripPlayZoneFolderExtension(path.basename(normalizedPath)),
    fallbackCreator: "Local folder"
  });
}

function createLibraryEntry(input: {
  sourceType: "file" | "folder";
  sourcePath: string;
  folderPath: string;
  discoveredAt: string;
  inspection: InspectedPlayZonePack;
  fallbackTitle: string;
  fallbackCreator: string;
}): PlayZoneLibraryEntry {
  const { inspection } = input;
  const executable = isExecutablePlayZoneStatus(inspection.securityReport.status);
  const entryFilePath = executable && inspection.entryPath
    ? resolveSafePackFile(input.folderPath, inspection.entryPath)
    : null;
  const status = entryFilePath ? inspection.securityReport.status : executable ? "blocked" : inspection.securityReport.status;
  const entry: PlayZoneLibraryEntry = {
    id: inspection.id ?? createStablePlayZoneEntryId(input.sourceType, input.sourcePath),
    title: inspection.title ?? input.fallbackTitle,
    creator: inspection.creator ?? input.fallbackCreator,
    version: inspection.version,
    lineageId: inspection.lineageId,
    minPlayZoneVersion: inspection.minPlayZoneVersion,
    saveSchemaVersion: inspection.saveSchemaVersion,
    releaseNotes: inspection.releaseNotes,
    summary: inspection.summary ?? "Local PlayZone UGC pack.",
    tags: inspection.tags.length ? inspection.tags : ["Local"],
    category: inspection.category,
    license: inspection.license,
    sourceUrl: inspection.sourceUrl,
    permissions: inspection.permissions,
    diamondActions: inspection.diamondActions,
    securityReport: { ...inspection.securityReport, status },
    sourceType: input.sourceType,
    sourcePath: input.sourcePath,
    fileName: path.basename(input.sourcePath),
    status,
    message: createStatusMessage(status, inspection.securityReport.issues),
    discoveredAt: input.discoveredAt
  };
  return entry;
}

function resolveSafePackFile(folderPath: string, relativePath: string) {
  const rootPath = path.resolve(folderPath);
  const filePath = path.resolve(rootPath, relativePath);
  const relative = path.relative(rootPath, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return normalizeExistingFile(filePath);
}

function createStatusMessage(status: PlayZoneLibraryEntry["status"], issues: PlayZoneSecurityReport["issues"]) {
  if (status === "ready" || status === "trusted_official") {
    return "The manifest, permissions, entry file, and SHA-256 integrity list passed inspection.";
  }
  const first = issues[0]?.message;
  if (status === "warning") return first ?? "This pack needs publisher metadata before it can run.";
  if (status === "quarantined") return first ?? "This pack is quarantined and cannot run.";
  return first ?? "This pack failed its security inspection and cannot run.";
}

function normalizeExistingDirectory(folderPath: string | undefined) {
  const candidate = folderPath?.trim();
  if (!candidate) return null;
  try {
    const stat = fs.lstatSync(candidate);
    return stat.isDirectory() && !stat.isSymbolicLink() ? path.resolve(candidate) : null;
  } catch {
    return null;
  }
}

function normalizeExistingFile(filePath: string | undefined) {
  const candidate = filePath?.trim();
  if (!candidate) return null;
  try {
    const stat = fs.lstatSync(candidate);
    return stat.isFile() && !stat.isSymbolicLink() ? path.resolve(candidate) : null;
  } catch {
    return null;
  }
}

function stripPlayZoneFolderExtension(value: string) {
  const extension = path.extname(value).toLowerCase();
  return PLAY_ZONE_PACK_FOLDER_EXTENSIONS.has(extension) ? value.slice(0, -extension.length) : value;
}

function createStablePlayZoneEntryId(sourceType: "file" | "folder", sourcePath: string) {
  const digest = createHash("sha256").update(path.resolve(sourcePath)).digest("hex").slice(0, 20);
  return `local-${sourceType}-${digest}`;
}

function calculateArchiveSha256(filePath: string) {
  try {
    if (fs.statSync(filePath).size > MAX_HASHED_ARCHIVE_BYTES) return undefined;
    return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
  } catch {
    return undefined;
  }
}

function createPublicPlayZoneInstallError(error: unknown) {
  const message = error instanceof Error ? error.message.trim() : "";
  if (
    !message ||
    /(?:[a-zA-Z]:[\\/]|\\\\|\/(?:Users|home|tmp)\/)/.test(message) ||
    (error && typeof error === "object" && "code" in error)
  ) {
    return "PlayZone installation failed because a local file changed or became unavailable.";
  }
  return message.slice(0, 500);
}
