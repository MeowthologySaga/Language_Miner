import { describe, expect, it } from "vitest";
import { cleanupProfileLocalStorage, isProfileScopedStorageKey } from "./profileLocalStorageCleanup";

describe("profile localStorage cleanup", () => {
  it("removes every profile-scoped UI key and only that profile's usage events", () => {
    const storage = createStorage({
      "lem:recentDocuments:learner-a": "[]",
      "lem:lastReaderArtifact:learner-a": "{}",
      "lem:dailyRoutine:learner-a": "{}",
      "lem:reviewSettings:learner-a": "{}",
      "lem:reviewDailyProgress:learner-a": "{}",
      "lem:listeningLoop:dailyRoutine:learner-a:en": "{}",
      "lem:listeningLoop:dailySentenceTarget:learner-a:en": "10",
      "lem:listeningLoop:heardSentences:learner-a:en:2026-07-12": "[]",
      "lem:videoReader:folders:learner-a": "[]",
      "lem:videoReader:resume:learner-a": "{}",
      "lem:defaultSampleCards:v1:learner-a": "1",
      "lem:defaultSampleCards:v99:learner-a": "1",
      "lem:defaultOutputMockCards:v2:learner-a": "1",
      "lem:recentDocuments:learner-a-2": "keep",
      "lem:listeningLoop:dailyRoutine:learner-a-2:en": "keep",
      "lem:unrelated:learner-a": "keep",
      "lem:translationUsageEvents": JSON.stringify([
        { id: "a", profileId: "learner-a" },
        { id: "b", profileId: "learner-a-2" },
        { id: "legacy-default" }
      ])
    });

    const result = cleanupProfileLocalStorage("learner-a", storage);

    expect(result.removedKeys).toHaveLength(13);
    expect(result.anonymizedTranslationUsageEvents).toBe(1);
    expect(storage.getItem("lem:recentDocuments:learner-a")).toBeNull();
    expect(storage.getItem("lem:recentDocuments:learner-a-2")).toBe("keep");
    expect(storage.getItem("lem:listeningLoop:dailyRoutine:learner-a-2:en")).toBe("keep");
    expect(storage.getItem("lem:unrelated:learner-a")).toBe("keep");
    expect(JSON.parse(storage.getItem("lem:translationUsageEvents") ?? "[]")).toEqual([
      {
        profileDeleted: true,
        model: "",
        sourceLang: "",
        targetLang: ""
      },
      { id: "b", profileId: "learner-a-2" },
      { id: "legacy-default" }
    ]);
  });

  it("matches profile ids exactly, including ids containing colons", () => {
    expect(isProfileScopedStorageKey("lem:defaultSampleCards:v3:team:a", "team:a")).toBe(true);
    expect(isProfileScopedStorageKey("lem:defaultSampleCards:v3:team:a", "a")).toBe(false);
    expect(isProfileScopedStorageKey("lem:reviewSettings:team:a", "team:a")).toBe(true);
    expect(isProfileScopedStorageKey("lem:reviewSettings:team:a", "a")).toBe(false);
    expect(
      isProfileScopedStorageKey("lem:listeningLoop:dailyRoutine:team:a:en", "team:a")
    ).toBe(true);
    expect(isProfileScopedStorageKey("lem:listeningLoop:dailyRoutine:team:a:en", "team")).toBe(
      false
    );
  });

  it("refuses to delete the default profile", () => {
    const storage = createStorage({ "lem:reviewSettings:profile-english": "keep" });
    expect(() => cleanupProfileLocalStorage("profile-english", storage)).toThrow(
      "기본 프로필은 삭제할 수 없습니다."
    );
    expect(storage.getItem("lem:reviewSettings:profile-english")).toBe("keep");
  });

  it("leaves a malformed shared usage ledger untouched", () => {
    const storage = createStorage({ "lem:translationUsageEvents": "not-json" });
    expect(() => cleanupProfileLocalStorage("learner-a", storage)).toThrow(
      "lem:translationUsageEvents"
    );
    expect(storage.getItem("lem:translationUsageEvents")).toBe("not-json");
  });
});

function createStorage(initial: Record<string, string>): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    }
  };
}
