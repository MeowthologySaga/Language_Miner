import { describe, expect, it } from "vitest";
import {
  clearPrivacyRendererStorage,
  isLearningContentStorageKey,
  type PrivacyStorage
} from "./privacyRendererStorage";

describe("renderer privacy storage cleanup", () => {
  it("removes only learning and content keys for learning deletion", () => {
    const storage = createStorage({
      "lem:settings": "keep",
      "lem:appLocale": "en",
      "lem:recentDocuments:profile-a": "private path",
      "lem:fallback:cards": "private cards",
      "lem:characterChat:sessions": "private chat",
      "lem:playZone:save:pack-a": "private save",
      "lem:cloudConsent:v1:gemini": "keep consent"
    });

    const report = clearPrivacyRendererStorage(storage, "learning");

    expect(report).toEqual({
      scope: "learning",
      attemptedKeys: 4,
      removedKeys: 4,
      remainingKeys: 0,
      failedKeys: 0,
      verified: true
    });
    expect(storage.getItem("lem:settings")).toBe("keep");
    expect(storage.getItem("lem:appLocale")).toBe("en");
    expect(storage.getItem("lem:cloudConsent:v1:gemini")).toBe("keep consent");
  });

  it("removes and verifies every key for full local deletion", () => {
    const storage = createStorage({
      "lem:settings": "private settings",
      "lem:profiles": "private profiles",
      unrelated: "same-origin residue"
    });

    expect(clearPrivacyRendererStorage(storage, "all")).toEqual({
      scope: "all",
      attemptedKeys: 3,
      removedKeys: 3,
      remainingKeys: 0,
      failedKeys: 0,
      verified: true
    });
    expect(storage.length).toBe(0);
  });

  it("reports a renderer failure and residual instead of claiming success", () => {
    const storage = createStorage(
      {
        "lem:fallback:cards": "private cards",
        "lem:settings": "keep"
      },
      "lem:fallback:cards"
    );

    expect(clearPrivacyRendererStorage(storage, "learning")).toEqual({
      scope: "learning",
      attemptedKeys: 1,
      removedKeys: 0,
      remainingKeys: 1,
      failedKeys: 1,
      verified: false
    });
  });

  it("recognizes all app-owned learning key families without treating preferences as content", () => {
    expect(isLearningContentStorageKey("lem:listeningLoop:heardSentences:p:en:today")).toBe(true);
    expect(isLearningContentStorageKey("lem:videoReader:fullscreenSubtitleRail")).toBe(false);
    expect(isLearningContentStorageKey("lem:settings")).toBe(false);
  });
});

function createStorage(
  entries: Record<string, string>,
  failingKey?: string
): PrivacyStorage & { getItem(key: string): string | null } {
  const values = new Map(Object.entries(entries));
  return {
    get length() {
      return values.size;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    removeItem(key) {
      if (key === failingKey) throw new Error("simulated renderer storage failure");
      values.delete(key);
    }
  };
}
