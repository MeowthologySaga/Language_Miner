import type {
  PrivacyRendererCleanupReport,
  PrivacyRendererStorageScope
} from "./shared/privacyData";

export type PrivacyStorage = Pick<Storage, "getItem" | "key" | "length" | "removeItem">;

const learningStorageKeyPatterns = [
  /^lem:fallback:/,
  /^lem:recentDocuments(?::|$)/,
  /^lem:lastReaderArtifact(?::|$)/,
  /^lem:dailyRoutine(?::|$)/,
  /^lem:reviewSettings(?::|$)/,
  /^lem:reviewDailyProgress(?::|$)/,
  /^lem:readerBookmarks(?::|$)/,
  /^lem:listeningLoop:/,
  /^lem:videoReader:(?:manualTranscript|folders|resume)(?::|$)/,
  /^lem:defaultSampleCards:/,
  /^lem:defaultOutputMockCards:/,
  /^lem:dismissedDefaultSampleCards:/,
  /^lem:translationUsageEvents$/,
  /^lem:playZone:(?:library|save)(?::|$)/,
  /^lem:characterChat:/,
  /^lem:webReaderSession:/
] as const;

export function isLearningContentStorageKey(key: string) {
  return learningStorageKeyPatterns.some((pattern) => pattern.test(key));
}

export function clearPrivacyRendererStorage(
  storage: PrivacyStorage,
  scope: PrivacyRendererStorageScope
): PrivacyRendererCleanupReport {
  const initialKeys = listStorageKeys(storage);
  const targetedKeys =
    scope === "all" ? initialKeys : initialKeys.filter(isLearningContentStorageKey);
  let removedKeys = 0;
  let failedKeys = 0;

  for (const key of targetedKeys) {
    try {
      storage.removeItem(key);
      if (storage.getItem(key) === null) {
        removedKeys += 1;
      } else {
        failedKeys += 1;
      }
    } catch {
      failedKeys += 1;
    }
  }

  const remainingKeys = listStorageKeys(storage).filter((key) =>
    scope === "all" ? true : isLearningContentStorageKey(key)
  ).length;

  return {
    scope,
    attemptedKeys: targetedKeys.length,
    removedKeys,
    remainingKeys,
    failedKeys,
    verified: failedKeys === 0 && remainingKeys === 0 && removedKeys === targetedKeys.length
  };
}

function listStorageKeys(storage: PrivacyStorage) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (typeof key === "string") keys.push(key);
  }
  return keys;
}
