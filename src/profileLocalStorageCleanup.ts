import { DEFAULT_PROFILE_ID } from "./shared/profiles";
import type { ProfileId, TranslationUsageEvent } from "./shared/types";
import { usageUpdatedEventName } from "./utils/translationUsageLedger";

const TRANSLATION_USAGE_LEDGER_KEY = "lem:translationUsageEvents";

const exactProfileKeyPrefixes = [
  "lem:recentDocuments",
  "lem:lastReaderArtifact",
  "lem:dailyRoutine",
  "lem:reviewSettings",
  "lem:reviewDailyProgress",
  "lem:videoReader:folders",
  "lem:videoReader:resume"
] as const;

const nestedProfileKeyPatterns = [
  { prefix: "lem:listeningLoop:dailyRoutine", trailingSegments: 1 },
  { prefix: "lem:listeningLoop:dailySentenceTarget", trailingSegments: 1 },
  { prefix: "lem:listeningLoop:heardSentences", trailingSegments: 2 }
] as const;

const versionedSeedKeyPatterns = [
  /^lem:defaultSampleCards:v[^:]+:(.*)$/,
  /^lem:defaultOutputMockCards:v[^:]+:(.*)$/
] as const;

type ProfileStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem" | "key" | "length"
>;

export type ProfileLocalStorageCleanupResult = {
  removedKeys: string[];
  anonymizedTranslationUsageEvents: number;
};

export function cleanupProfileLocalStorage(
  profileIdInput: ProfileId,
  storage: ProfileStorage = localStorage
): ProfileLocalStorageCleanupResult {
  const profileId = profileIdInput.trim();
  if (!profileId) {
    throw new Error("삭제할 프로필 ID가 비어 있습니다.");
  }
  if (profileId === DEFAULT_PROFILE_ID) {
    throw new Error("기본 프로필은 삭제할 수 없습니다.");
  }

  const keys = snapshotStorageKeys(storage);
  const removedKeys: string[] = [];
  const failures: string[] = [];

  for (const key of keys) {
    if (!isProfileScopedStorageKey(key, profileId)) {
      continue;
    }
    try {
      storage.removeItem(key);
      removedKeys.push(key);
    } catch {
      failures.push(key);
    }
  }

  let anonymizedTranslationUsageEvents = 0;
  try {
    const rawLedger = storage.getItem(TRANSLATION_USAGE_LEDGER_KEY);
    if (rawLedger) {
      const parsed = JSON.parse(rawLedger) as unknown;
      if (Array.isArray(parsed)) {
        const events = parsed as TranslationUsageEvent[];
        const anonymizedEvents = events.map((event) => {
          if (event?.profileId !== profileId) {
            return event;
          }
          anonymizedTranslationUsageEvents += 1;
          return {
            profileDeleted: true,
            providerName: event.providerName,
            model: "",
            sourceLang: "",
            targetLang: "",
            usage: event.usage,
            estimatedCostKrw: event.estimatedCostKrw,
            createdAt: event.createdAt
          } satisfies TranslationUsageEvent;
        });
        if (anonymizedTranslationUsageEvents > 0) {
          storage.setItem(TRANSLATION_USAGE_LEDGER_KEY, JSON.stringify(anonymizedEvents));
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent(usageUpdatedEventName));
          }
        }
      }
    }
  } catch {
    failures.push(TRANSLATION_USAGE_LEDGER_KEY);
  }

  if (failures.length > 0) {
    throw new Error(`프로필의 로컬 데이터를 완전히 삭제하지 못했습니다: ${failures.join(", ")}`);
  }

  return { removedKeys, anonymizedTranslationUsageEvents };
}

export function isProfileScopedStorageKey(key: string, profileId: ProfileId) {
  if (exactProfileKeyPrefixes.some((prefix) => key === `${prefix}:${profileId}`)) {
    return true;
  }
  if (
    nestedProfileKeyPatterns.some(
      ({ prefix, trailingSegments }) =>
        getNestedKeyProfileId(key, prefix, trailingSegments) === profileId
    )
  ) {
    return true;
  }
  return versionedSeedKeyPatterns.some((pattern) => pattern.exec(key)?.[1] === profileId);
}

function getNestedKeyProfileId(key: string, prefix: string, trailingSegments: number) {
  const marker = `${prefix}:`;
  if (!key.startsWith(marker)) {
    return null;
  }
  const segments = key.slice(marker.length).split(":");
  if (segments.length <= trailingSegments) {
    return null;
  }
  return segments.slice(0, -trailingSegments).join(":");
}

function snapshotStorageKeys(storage: ProfileStorage) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key) {
      keys.push(key);
    }
  }
  return keys;
}
