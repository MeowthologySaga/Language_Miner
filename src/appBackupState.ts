import {
  remapBackupProfileId,
  sanitizeAppBackupValue,
  type AppBackupRendererSnapshot,
  type AppBackupRestoreMode
} from "./shared/appBackup";

const backupStoragePrefix = "lem:";
const excludedStoragePatterns = [
  /^lem:qa:/,
  /^lem:fallback:/,
  /^lem:recentDocuments:/,
  /^lem:lastReaderArtifact:/,
  /^lem:onboarding:/,
  /^lem:webReaderSession:/,
  /^lem:cloudConsent:/,
  /translationCache/i
];

export function collectAppBackupRendererState(storage: Storage): AppBackupRendererSnapshot {
  const entries: Record<string, string> = {};
  const excludedKeys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || !key.startsWith(backupStoragePrefix)) continue;
    if (excludedStoragePatterns.some((pattern) => pattern.test(key))) {
      excludedKeys.push(key);
      continue;
    }
    const value = storage.getItem(key);
    if (value === null) continue;
    const sanitizedValue = sanitizeStorageValue(key, value);
    if (sanitizedValue === null) {
      excludedKeys.push(key);
      continue;
    }
    entries[key] = sanitizedValue;
  }
  return {
    entries,
    excludedKeys: excludedKeys.sort()
  };
}

/** Exact renderer state held only in the renderer while a restore is provisional. */
export function collectAppBackupRendererRollbackState(
  storage: Storage
): AppBackupRendererSnapshot {
  const entries: Record<string, string> = {};
  const excludedKeys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || !key.startsWith(backupStoragePrefix)) continue;
    if (excludedStoragePatterns.some((pattern) => pattern.test(key))) {
      excludedKeys.push(key);
      continue;
    }
    const value = storage.getItem(key);
    if (value !== null) entries[key] = value;
  }
  return { entries, excludedKeys: excludedKeys.sort() };
}

export function restoreAppBackupRendererState(
  storage: Storage,
  snapshot: AppBackupRendererSnapshot,
  mode: AppBackupRestoreMode,
  profileIdMap: Record<string, string> = {}
) {
  const preserveExistingEntries = mode === "merge" || mode === "new_profile";
  if (mode === "replace") {
    const keysToRemove: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (
        key?.startsWith(backupStoragePrefix) &&
        !excludedStoragePatterns.some((pattern) => pattern.test(key))
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => storage.removeItem(key));
  }

  for (const [sourceKey, sourceValue] of Object.entries(snapshot.entries)) {
    if (
      !sourceKey.startsWith(backupStoragePrefix) ||
      excludedStoragePatterns.some((pattern) => pattern.test(sourceKey))
    ) {
      continue;
    }
    const key = remapStorageKey(sourceKey, profileIdMap);
    if (excludedStoragePatterns.some((pattern) => pattern.test(key))) continue;
    const value = remapStorageValue(sourceValue, profileIdMap);
    if (preserveExistingEntries && key === "lem:profiles") {
      storage.setItem(key, mergeProfileStorage(storage.getItem(key), value));
      continue;
    }
    if (preserveExistingEntries && storage.getItem(key) !== null) {
      continue;
    }
    storage.setItem(key, value);
  }
}

export function restoreAppBackupRendererRollbackState(
  storage: Storage,
  snapshot: AppBackupRendererSnapshot
) {
  const keysToRemove: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (
      key?.startsWith(backupStoragePrefix) &&
      !excludedStoragePatterns.some((pattern) => pattern.test(key))
    ) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => storage.removeItem(key));
  for (const [key, value] of Object.entries(snapshot.entries)) {
    if (
      key.startsWith(backupStoragePrefix) &&
      !excludedStoragePatterns.some((pattern) => pattern.test(key))
    ) {
      storage.setItem(key, value);
    }
  }
}

export async function commitAppBackupRendererRestore(input: {
  storage: Storage;
  previousSnapshot: AppBackupRendererSnapshot;
  incomingSnapshot: AppBackupRendererSnapshot;
  mode: AppBackupRestoreMode;
  profileIdMap: Record<string, string>;
  rollbackHandle: string;
  rollbackMain: (rollbackHandle: string) => Promise<unknown>;
  finalizeMain: (rollbackHandle: string) => Promise<unknown>;
}) {
  try {
    restoreAppBackupRendererState(
      input.storage,
      input.incomingSnapshot,
      input.mode,
      input.profileIdMap
    );
    await input.finalizeMain(input.rollbackHandle);
  } catch (error) {
    const rollbackFailures: string[] = [];
    try {
      await input.rollbackMain(input.rollbackHandle);
    } catch (rollbackError) {
      rollbackFailures.push(`main: ${getRollbackErrorMessage(rollbackError)}`);
    }
    try {
      restoreAppBackupRendererRollbackState(input.storage, input.previousSnapshot);
    } catch (rollbackError) {
      rollbackFailures.push(`renderer: ${getRollbackErrorMessage(rollbackError)}`);
    }
    if (rollbackFailures.length) {
      throw new Error(
        `${getRollbackErrorMessage(error)} / rollback failed: ${rollbackFailures.join(" / ")}`
      );
    }
    throw error;
  }
}

export function getBackupProfileIds(snapshot: AppBackupRendererSnapshot) {
  try {
    const profiles = JSON.parse(snapshot.entries["lem:profiles"] ?? "[]") as Array<{ id?: unknown }>;
    return profiles
      .map((profile) => (typeof profile.id === "string" ? profile.id : ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function sanitizeStorageValue(key: string, value: string): string | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    const sanitized = sanitizeAppBackupValue(parsed);
    if (key === "lem:settings" && sanitized && typeof sanitized === "object") {
      const settings = sanitized as Record<string, unknown>;
      settings.geminiApiKey = "";
      settings.googleTranslateApiKey = "";
      settings.cardSyncFolderPath = "";
      settings.debugPdfPath = "";
    }
    return JSON.stringify(sanitized);
  } catch {
    return sanitizeKnownPlainTextStorageValue(key, value);
  }
}

function sanitizeKnownPlainTextStorageValue(key: string, value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 240 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    return null;
  }
  if (key === "lem:appLocale") {
    return /^(?:ko|en)$/.test(normalized) ? normalized : null;
  }
  if (key === "lem:activeProfileId") {
    const sanitized = sanitizeAppBackupValue(normalized, key);
    return typeof sanitized === "string" && sanitized ? sanitized : null;
  }
  if (key === "lem:cardTutorial:v2:step") {
    return /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/.test(normalized) ? normalized : null;
  }
  if (key === "lem:characterChat:mode") {
    return normalized === "native_capture" || normalized === "target_practice"
      ? normalized
      : null;
  }
  if (key === "lem:characterChat:correctionMode") {
    return ["off", "instant", "turn_summary", "session_summary"].includes(normalized)
      ? normalized
      : null;
  }
  if (
    key === "lem:videoReader:fullscreenSubtitleRail" ||
    key === "lem:videoReader:rKeyConfirm" ||
    key === "lem:videoReader:saveFrameImage"
  ) {
    return normalized === "on" || normalized === "off" ? normalized : null;
  }
  if (key === "lem:listeningLoop:autoTranscribeLastRunDate") {
    return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
  }
  return null;
}

function remapStorageKey(key: string, profileIdMap: Record<string, string>) {
  const candidates = Object.entries(profileIdMap)
    .filter(([source, target]) => Boolean(source) && Boolean(target))
    .sort(([left], [right]) => right.length - left.length);
  for (const [source, target] of candidates) {
    let offset = key.indexOf(source);
    while (offset >= 0) {
      const beforeIsBoundary = offset === 0 || key[offset - 1] === ":";
      const afterOffset = offset + source.length;
      const afterIsBoundary = afterOffset === key.length || key[afterOffset] === ":";
      if (beforeIsBoundary && afterIsBoundary) {
        return `${key.slice(0, offset)}${target}${key.slice(afterOffset)}`;
      }
      offset = key.indexOf(source, offset + 1);
    }
  }
  return key;
}

function remapStorageValue(value: string, profileIdMap: Record<string, string>) {
  try {
    return JSON.stringify(remapBackupProfileId(JSON.parse(value), profileIdMap));
  } catch {
    return value;
  }
}

function mergeProfileStorage(currentValue: string | null, incomingValue: string) {
  try {
    const current = Array.isArray(JSON.parse(currentValue ?? "[]"))
      ? (JSON.parse(currentValue ?? "[]") as Array<{ id?: string }>)
      : [];
    const incoming = Array.isArray(JSON.parse(incomingValue))
      ? (JSON.parse(incomingValue) as Array<{ id?: string }>)
      : [];
    const byId = new Map<string, { id?: string }>();
    for (const profile of [...current, ...incoming]) {
      if (profile?.id) byId.set(profile.id, profile);
    }
    return JSON.stringify(Array.from(byId.values()));
  } catch {
    return incomingValue;
  }
}

function getRollbackErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
