import fs from "node:fs";
import path from "node:path";
import {
  PRIVACY_ALL_LOCAL_DATA_CONFIRMATION,
  PRIVACY_LEARNING_DATA_CONFIRMATION,
  privacyDataOperationNames,
  type PrivacyDatabaseDeleteCounts,
  type PrivacyDataDeleteCounts,
  type PrivacyDataDeleteRequest,
  type PrivacyDataDeleteResult,
  type PrivacyDataVerification,
  type PrivacyDatabaseDeleteVerification,
  type PrivacyDataOperationName,
  type PrivacyDataOperationStatus,
  type PrivacyDataWarning
} from "../src/shared/privacyData";

type PrivacyDatabase = {
  deleteAllLearningData(): PrivacyDatabaseDeleteCounts;
  verifyPrivacyDeletion(): PrivacyDatabaseDeleteVerification;
};

type PrivacySecureSettings = {
  clear(): { removed: number };
  verifyCleared(): { verified: boolean; remainingKeys: number; remainingFiles: number };
};

export type PrivacySessionClearResult = {
  removedItems: number;
  remainingItems: number;
  verified: boolean;
};

export type PrivacyDataServiceDependencies = {
  userDataPath: string;
  legacyUserDataPath?: string | null;
  database: PrivacyDatabase;
  secureSettings: PrivacySecureSettings;
  quiesceManagedFileWriters?(): Promise<void>;
  clearWebReaderLoginData(): Promise<PrivacySessionClearResult>;
  clearElectronCaches(): Promise<PrivacySessionClearResult>;
};

type ManagedPathDefinition = {
  relativePath: string;
};

const managedPrivacyPaths: ManagedPathDefinition[] = [
  { relativePath: "play-zone-saves" },
  { relativePath: "play-zone-archives" },
  { relativePath: "play-zone-installed" },
  { relativePath: "play-zone-downloads" },
  { relativePath: "backups" },
  { relativePath: "desktop-ocr" },
  { relativePath: "tts-cache" },
  { relativePath: "local-mt-models" },
  { relativePath: "translation-debug.log" },
  { relativePath: "listening-transcripts" },
  { relativePath: path.join("media", "listening-card-clips") },
  { relativePath: "video-reader" },
  { relativePath: "card-sync-state" },
  { relativePath: "logs" },
  { relativePath: "crash-reports" },
  { relativePath: "privacy-deletion" }
];

const allLocalOnlyManagedPrivacyPaths: ManagedPathDefinition[] = [
  { relativePath: "app-onboarding-state.json" }
];

const allLocalManagedPrivacyPaths = [
  ...managedPrivacyPaths,
  ...allLocalOnlyManagedPrivacyPaths
];

const legacyManagedPrivacyPaths = managedPrivacyPaths.filter(
  (definition) =>
    definition.relativePath !== "logs" && definition.relativePath !== "crash-reports"
);

const legacyAllLocalManagedPrivacyPaths = allLocalManagedPrivacyPaths.filter(
  (definition) =>
    definition.relativePath !== "logs" && definition.relativePath !== "crash-reports"
);

const managedPrivacyRootFilePatterns = [
  /^\.local-english-miner\.sqlite\.\d+\.[0-9a-f-]{36}\.tmp$/i,
  /^local-english-miner\.sqlite\.bak\.\d+\.tmp$/i
];

const legacyLanguageMinerRootFilePatterns = [
  ...managedPrivacyRootFilePatterns,
  /^local-english-miner\.sqlite$/i,
  /^local-english-miner\.sqlite\.bak$/i,
  /^local-english-miner\.sqlite-(?:wal|shm|journal)$/i
];

export class PrivacyDataService {
  private readonly userDataPath: string;

  constructor(private readonly dependencies: PrivacyDataServiceDependencies) {
    this.userDataPath = path.resolve(dependencies.userDataPath);
  }

  async deleteData(request: PrivacyDataDeleteRequest): Promise<PrivacyDataDeleteResult> {
    assertDeletionConfirmation(request);
    const operations = createInitialOperations();
    const counts = createInitialCounts();
    const warnings: PrivacyDataWarning[] = [];
    const verification = createInitialVerification();
    let databaseCounts: PrivacyDatabaseDeleteCounts | undefined;
    const requestedOperations = getRequestedOperations(request);
    const requestedManagedPrivacyPaths = request.target === "all_local_data"
      ? allLocalManagedPrivacyPaths
      : managedPrivacyPaths;
    const requestedLegacyManagedPrivacyPaths = request.target === "all_local_data"
      ? legacyAllLocalManagedPrivacyPaths
      : legacyManagedPrivacyPaths;
    let managedDataWritersQuiesced = true;

    if (
      requestedOperations.has("learningDatabase") ||
      requestedOperations.has("managedFiles")
    ) {
      try {
        await this.dependencies.quiesceManagedFileWriters?.();
      } catch {
        managedDataWritersQuiesced = false;
        if (requestedOperations.has("learningDatabase")) {
          operations.learningDatabase = "failed";
          warnings.push({ code: "learning_database_clear_failed", area: "learningDatabase" });
        }
        if (requestedOperations.has("managedFiles")) {
          operations.managedFiles = "failed";
          warnings.push({ code: "managed_file_clear_failed", area: "managedFiles" });
        }
      }
    }

    if (requestedOperations.has("apiKeys")) {
      try {
        counts.apiKeys = this.dependencies.secureSettings.clear().removed;
        const secureVerification = this.dependencies.secureSettings.verifyCleared();
        verification.secureSettingsRemaining =
          secureVerification.remainingKeys + secureVerification.remainingFiles;
        operations.apiKeys = secureVerification.verified
          ? counts.apiKeys > 0 ? "cleared" : "empty"
          : "failed";
        if (!secureVerification.verified) {
          warnings.push({ code: "secure_settings_verification_failed", area: "apiKeys" });
        }
      } catch {
        operations.apiKeys = "failed";
        warnings.push({ code: "secure_settings_clear_failed", area: "apiKeys" });
      }
    }

    if (requestedOperations.has("webReaderLogin")) {
      try {
        const cleared = await this.dependencies.clearWebReaderLoginData();
        counts.webReaderCookies = cleared.removedItems;
        verification.webReaderCookiesRemaining = cleared.remainingItems;
        operations.webReaderLogin = cleared.verified
          ? counts.webReaderCookies > 0 ? "cleared" : "empty"
          : "failed";
        if (!cleared.verified) {
          warnings.push({ code: "web_reader_login_verification_failed", area: "webReaderLogin" });
        }
      } catch {
        operations.webReaderLogin = "failed";
        warnings.push({ code: "web_reader_login_clear_failed", area: "webReaderLogin" });
      }
    }

    if (requestedOperations.has("electronCache")) {
      try {
        const cleared = await this.dependencies.clearElectronCaches();
        counts.cacheSessions = cleared.removedItems;
        verification.electronCacheBytesRemaining = cleared.remainingItems;
        operations.electronCache = cleared.verified
          ? counts.cacheSessions > 0 ? "cleared" : "empty"
          : "failed";
        if (!cleared.verified) {
          warnings.push({ code: "electron_cache_verification_failed", area: "electronCache" });
        }
      } catch {
        operations.electronCache = "failed";
        warnings.push({ code: "electron_cache_clear_failed", area: "electronCache" });
      }
    }

    if (requestedOperations.has("learningDatabase") && managedDataWritersQuiesced) {
      try {
        databaseCounts = this.dependencies.database.deleteAllLearningData();
        counts.databaseRows = databaseCounts.totalRows;
        verification.database = this.dependencies.database.verifyPrivacyDeletion();
        const databaseVerified =
          verification.database.remainingRows === 0 &&
          verification.database.freelistPages === 0 &&
          verification.database.integrityOk &&
          verification.database.durableCopiesVerified;
        operations.learningDatabase = databaseVerified
          ? counts.databaseRows > 0 ? "cleared" : "empty"
          : "failed";
        if (!databaseVerified) {
          warnings.push({
            code: "learning_database_verification_failed",
            area: "learningDatabase"
          });
        }
      } catch {
        operations.learningDatabase = "failed";
        warnings.push({ code: "learning_database_clear_failed", area: "learningDatabase" });
      }
    }

    if (requestedOperations.has("managedFiles") && managedDataWritersQuiesced) {
      const warningCountBefore = warnings.length;
      try {
        const roots: Array<{
          rootPath: string;
          definitions: ManagedPathDefinition[];
          rootFilePatterns: RegExp[];
        }> = [{
          rootPath: this.userDataPath,
          definitions: requestedManagedPrivacyPaths,
          rootFilePatterns: managedPrivacyRootFilePatterns
        }];
        let unsafeLegacyRoot = false;
        if (this.dependencies.legacyUserDataPath) {
          const legacyRoot = await validateLegacyLanguageMinerRoot(
            this.dependencies.legacyUserDataPath,
            this.userDataPath
          );
          if (legacyRoot) {
            roots.push({
              rootPath: legacyRoot,
              definitions: requestedLegacyManagedPrivacyPaths,
              rootFilePatterns: legacyLanguageMinerRootFilePatterns
            });
          } else {
            unsafeLegacyRoot = true;
            warnings.push({ code: "unsafe_path_skipped", area: "managedFiles" });
          }
        }
        for (const root of roots) {
          const removed = await removeManagedPrivacyFiles(
            root.rootPath,
            warnings,
            root.definitions,
            root.rootFilePatterns
          );
          counts.files += removed.files;
          counts.directories += removed.directories;
          counts.bytes += removed.bytes;
        }
        verification.managedPathEntriesRemaining = await countManagedPrivacyPathResiduals(
          this.userDataPath,
          requestedManagedPrivacyPaths,
          managedPrivacyRootFilePatterns
        );
        if (roots.length > 1) {
          verification.managedPathEntriesRemaining += await countManagedPrivacyPathResiduals(
            roots[1].rootPath,
            requestedLegacyManagedPrivacyPaths,
            legacyLanguageMinerRootFilePatterns
          );
        }
        if (unsafeLegacyRoot) verification.managedPathEntriesRemaining += 1;
        operations.managedFiles =
          verification.managedPathEntriesRemaining > 0 || warnings.length > warningCountBefore
            ? "partial"
            : counts.files + counts.directories > 0
              ? "cleared"
              : "empty";
        if (verification.managedPathEntriesRemaining > 0) {
          warnings.push({
            code: "managed_file_verification_failed",
            area: "managedFiles"
          });
        }
      } catch {
        operations.managedFiles = "failed";
        warnings.push({ code: "managed_file_clear_failed", area: "managedFiles" });
      }
    }

    const requiresRendererReset =
      request.target === "learning_data" || request.target === "all_local_data";
    if (requiresRendererReset) {
      operations.rendererStorage = "pending";
      operations.extensionQueue = "pending";
      warnings.push({
        code: "extension_queue_verification_pending",
        area: "extensionQueue"
      });
    }
    const requestedStatuses = Object.values(operations).filter(
      (status) => status !== "not_requested"
    );
    const ok = requestedStatuses.every((status) => status === "cleared" || status === "empty");
    return {
      target: request.target,
      ok,
      phase: ok
        ? "complete"
        : requestedStatuses.some((status) => status === "failed")
          ? "failed"
          : requestedStatuses.some((status) => status === "pending")
            ? "pending"
            : "partial",
      completedAt: new Date().toISOString(),
      operations,
      counts,
      databaseCounts,
      verification,
      warnings,
      rendererResetRequired: requiresRendererReset,
      extensionQueueManualClearRequired: requiresRendererReset,
      restartRecommended: request.target === "all_local_data"
    };
  }
}

function assertDeletionConfirmation(request: PrivacyDataDeleteRequest) {
  if (
    request.target === "learning_data" &&
    request.confirmation !== PRIVACY_LEARNING_DATA_CONFIRMATION
  ) {
    throw new Error("Learning-data deletion confirmation does not match.");
  }
  if (
    request.target === "all_local_data" &&
    request.confirmation !== PRIVACY_ALL_LOCAL_DATA_CONFIRMATION
  ) {
    throw new Error("Full local-data deletion confirmation does not match.");
  }
}

function getRequestedOperations(request: PrivacyDataDeleteRequest) {
  switch (request.target) {
    case "api_keys":
      return new Set<PrivacyDataOperationName>(["apiKeys"]);
    case "web_reader_login":
      return new Set<PrivacyDataOperationName>(["webReaderLogin"]);
    case "electron_cache":
      return new Set<PrivacyDataOperationName>(["electronCache"]);
    case "learning_data":
      return new Set<PrivacyDataOperationName>(["learningDatabase", "managedFiles"]);
    case "all_local_data":
      return new Set<PrivacyDataOperationName>(privacyDataOperationNames);
  }
}

function createInitialOperations(): Record<PrivacyDataOperationName, PrivacyDataOperationStatus> {
  return Object.fromEntries(
    privacyDataOperationNames.map((name) => [name, "not_requested"])
  ) as Record<PrivacyDataOperationName, PrivacyDataOperationStatus>;
}

function createInitialCounts(): PrivacyDataDeleteCounts {
  return {
    apiKeys: 0,
    webReaderCookies: 0,
    cacheSessions: 0,
    databaseRows: 0,
    files: 0,
    directories: 0,
    bytes: 0,
    rendererStorageKeys: 0,
    extensionQueueItems: 0
  };
}

function createInitialVerification(): PrivacyDataVerification {
  return {
    secureSettingsRemaining: 0,
    webReaderCookiesRemaining: 0,
    electronCacheBytesRemaining: 0,
    managedPathEntriesRemaining: 0
  };
}

async function countManagedPrivacyPathResiduals(
  userDataPath: string,
  definitions: ManagedPathDefinition[] = managedPrivacyPaths,
  rootFilePatterns: RegExp[] = managedPrivacyRootFilePatterns
) {
  let remaining = 0;
  for (const definition of definitions) {
    const candidatePath = path.resolve(userDataPath, definition.relativePath);
    if (!isPathInsideOrEqual(candidatePath, userDataPath)) {
      remaining += 1;
      continue;
    }
    try {
      await fs.promises.lstat(candidatePath);
      remaining += 1;
    } catch (error) {
      if (!isFileNotFoundError(error)) remaining += 1;
    }
  }
  try {
    for (const entry of await fs.promises.readdir(userDataPath, { withFileTypes: true })) {
      if (rootFilePatterns.some((pattern) => pattern.test(entry.name))) {
        remaining += 1;
      }
    }
  } catch (error) {
    if (!isFileNotFoundError(error)) remaining += 1;
  }
  return remaining;
}

async function removeManagedPrivacyFiles(
  userDataPath: string,
  warnings: PrivacyDataWarning[],
  definitions: ManagedPathDefinition[] = managedPrivacyPaths,
  rootFilePatterns: RegExp[] = managedPrivacyRootFilePatterns
) {
  const result = { files: 0, directories: 0, bytes: 0 };
  if (!fs.existsSync(userDataPath)) return result;

  const rootStat = await fs.promises.lstat(userDataPath);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    warnings.push({ code: "unsafe_path_skipped", area: "managedFiles" });
    return result;
  }

  const canonicalRoot = await fs.promises.realpath(userDataPath);
  for (const definition of definitions) {
    const candidatePath = path.resolve(userDataPath, definition.relativePath);
    if (!isPathInsideOrEqual(candidatePath, userDataPath)) {
      warnings.push({ code: "unsafe_path_skipped", area: "managedFiles" });
      continue;
    }

    try {
      const safe = await validateExistingPathChain(userDataPath, candidatePath, canonicalRoot);
      if (!safe.exists) continue;
      if (!safe.safe) {
        warnings.push({
          code: safe.symbolicLink ? "symbolic_link_skipped" : "unsafe_path_skipped",
          area: "managedFiles"
        });
        continue;
      }
      await removeSafeEntry(candidatePath, canonicalRoot, result, warnings);
    } catch {
      warnings.push({ code: "managed_file_clear_failed", area: "managedFiles" });
    }
  }
  for (const entry of await fs.promises.readdir(userDataPath, { withFileTypes: true })) {
    if (!rootFilePatterns.some((pattern) => pattern.test(entry.name))) continue;
    const candidatePath = path.resolve(userDataPath, entry.name);
    try {
      const safe = await validateExistingPathChain(userDataPath, candidatePath, canonicalRoot);
      if (!safe.exists) continue;
      if (!safe.safe) {
        warnings.push({
          code: safe.symbolicLink ? "symbolic_link_skipped" : "unsafe_path_skipped",
          area: "managedFiles"
        });
        continue;
      }
      await removeSafeEntry(candidatePath, canonicalRoot, result, warnings);
    } catch {
      warnings.push({ code: "managed_file_clear_failed", area: "managedFiles" });
    }
  }
  return result;
}

async function validateLegacyLanguageMinerRoot(
  legacyUserDataPath: string,
  currentUserDataPath: string
) {
  const legacyRoot = path.resolve(legacyUserDataPath);
  if (legacyRoot === path.resolve(currentUserDataPath)) return null;
  try {
    const rootStat = await fs.promises.lstat(legacyRoot);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) return null;
    const canonicalRoot = await fs.promises.realpath(legacyRoot);
    const canonicalCurrentRoot = await fs.promises.realpath(path.resolve(currentUserDataPath));
    const sameRoot = process.platform === "win32"
      ? canonicalRoot.toLowerCase() === canonicalCurrentRoot.toLowerCase()
      : canonicalRoot === canonicalCurrentRoot;
    if (sameRoot) return null;
    const markerPath = path.join(legacyRoot, "local-english-miner.sqlite");
    const markerStat = await fs.promises.lstat(markerPath);
    if (!markerStat.isFile() || markerStat.isSymbolicLink()) return null;
    const canonicalMarker = await fs.promises.realpath(markerPath);
    if (!isPathInsideOrEqual(canonicalMarker, canonicalRoot)) return null;
    return legacyRoot;
  } catch {
    return null;
  }
}

async function validateExistingPathChain(
  rootPath: string,
  candidatePath: string,
  canonicalRoot: string
): Promise<{ exists: boolean; safe: boolean; symbolicLink: boolean }> {
  const relative = path.relative(rootPath, candidatePath);
  const segments = relative ? relative.split(path.sep).filter(Boolean) : [];
  let currentPath = rootPath;
  for (const segment of segments) {
    currentPath = path.join(currentPath, segment);
    try {
      const stat = await fs.promises.lstat(currentPath);
      if (stat.isSymbolicLink()) {
        return { exists: true, safe: false, symbolicLink: true };
      }
      const canonicalPath = await fs.promises.realpath(currentPath);
      if (!isPathInsideOrEqual(canonicalPath, canonicalRoot)) {
        return { exists: true, safe: false, symbolicLink: false };
      }
    } catch (error) {
      if (isFileNotFoundError(error)) {
        return { exists: false, safe: true, symbolicLink: false };
      }
      throw error;
    }
  }
  return { exists: true, safe: true, symbolicLink: false };
}

async function removeSafeEntry(
  entryPath: string,
  canonicalRoot: string,
  result: { files: number; directories: number; bytes: number },
  warnings: PrivacyDataWarning[]
): Promise<boolean> {
  const stat = await fs.promises.lstat(entryPath);
  if (stat.isSymbolicLink()) {
    warnings.push({ code: "symbolic_link_skipped", area: "managedFiles" });
    return false;
  }

  const canonicalPath = await fs.promises.realpath(entryPath);
  if (!isPathInsideOrEqual(canonicalPath, canonicalRoot)) {
    warnings.push({ code: "unsafe_path_skipped", area: "managedFiles" });
    return false;
  }

  if (stat.isFile()) {
    await fs.promises.unlink(entryPath);
    result.files += 1;
    result.bytes += stat.size;
    return true;
  }
  if (!stat.isDirectory()) {
    warnings.push({ code: "unsafe_path_skipped", area: "managedFiles" });
    return false;
  }

  let allChildrenRemoved = true;
  for (const entry of await fs.promises.readdir(entryPath, { withFileTypes: true })) {
    try {
      const removed = await removeSafeEntry(
        path.join(entryPath, entry.name),
        canonicalRoot,
        result,
        warnings
      );
      allChildrenRemoved = allChildrenRemoved && removed;
    } catch {
      allChildrenRemoved = false;
      warnings.push({ code: "managed_file_clear_failed", area: "managedFiles" });
    }
  }
  if (!allChildrenRemoved) return false;

  await fs.promises.rmdir(entryPath);
  result.directories += 1;
  return true;
}

function isPathInsideOrEqual(candidatePath: string, rootPath: string) {
  const relativePath = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return !relativePath || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function isFileNotFoundError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
