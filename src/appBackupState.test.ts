import { describe, expect, it } from "vitest";
import {
  collectAppBackupRendererRollbackState,
  collectAppBackupRendererState,
  commitAppBackupRendererRestore,
  getBackupProfileIds,
  restoreAppBackupRendererState
} from "./appBackupState";

class TestStorage implements Storage {
  private readonly values = new Map<string, string>();
  private failingSetKey: string | null = null;
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) {
    if (this.failingSetKey === key) {
      this.failingSetKey = null;
      throw new Error("simulated renderer storage failure");
    }
    this.values.set(key, value);
  }
  failNextSet(key: string) { this.failingSetKey = key; }
}

describe("app backup renderer state", () => {
  it("excludes keys and paths that should never be exported", () => {
    const storage = new TestStorage();
    storage.setItem("lem:profiles", JSON.stringify([{ id: "profile-a" }]));
    storage.setItem("lem:settings", JSON.stringify({
      geminiApiKey: "secret",
      googleTranslateApiKey: "secret-2",
      cardSyncFolderPath: "C:\\Users\\me\\OneDrive",
      debugPdfPath: "C:\\private.pdf",
      providerName: "gemini"
    }));
    storage.setItem("lem:activeProfileId", "profile-a");
    storage.setItem("lem:characterChat:sessions", JSON.stringify({
      session: {
        attachment: { localPath: "C:\\Users\\me\\private.wav" },
        authorization: "Bearer must-not-be-exported",
        text: "Keep this learning sentence"
      }
    }));
    storage.setItem("lem:settings:malformed", "raw-secret-that-is-not-json");
    storage.setItem("lem:recentDocuments:profile-a", "private path");
    storage.setItem("lem:webReaderSession:v1", JSON.stringify({
      readerUrl: "https://example.com/private?token=do-not-export",
      pageTitle: "Private account"
    }));
    storage.setItem("lem:cloudConsent:v1:gemini", JSON.stringify({
      version: 1,
      provider: "gemini",
      externalTransferAcknowledged: true
    }));
    storage.setItem("unrelated", "ignored");

    const snapshot = collectAppBackupRendererState(storage);
    expect(snapshot.entries).not.toHaveProperty("lem:recentDocuments:profile-a");
    expect(snapshot.entries).not.toHaveProperty("lem:webReaderSession:v1");
    expect(snapshot.entries).not.toHaveProperty("lem:cloudConsent:v1:gemini");
    expect(snapshot.entries).not.toHaveProperty("lem:settings:malformed");
    expect(snapshot.entries).not.toHaveProperty("unrelated");
    expect(snapshot.excludedKeys).toEqual(expect.arrayContaining([
      "lem:webReaderSession:v1",
      "lem:cloudConsent:v1:gemini"
    ]));
    expect(JSON.parse(snapshot.entries["lem:settings"])).toMatchObject({
      geminiApiKey: "",
      googleTranslateApiKey: "",
      cardSyncFolderPath: "",
      debugPdfPath: ""
    });
    expect(snapshot.entries["lem:activeProfileId"]).toBe("profile-a");
    expect(JSON.parse(snapshot.entries["lem:characterChat:sessions"])).toEqual({
      session: {
        attachment: { localPath: null },
        authorization: null,
        text: "Keep this learning sentence"
      }
    });
    expect(getBackupProfileIds(snapshot)).toEqual(["profile-a"]);
  });

  it("restores a backup into remapped profile keys", () => {
    const storage = new TestStorage();
    restoreAppBackupRendererState(
      storage,
      {
        entries: {
          "lem:profiles": JSON.stringify([{ id: "profile-a", name: "A" }]),
          "lem:review:profile-a": JSON.stringify({ profileId: "profile-a", count: 3 })
        },
        excludedKeys: []
      },
      "new_profile",
      { "profile-a": "profile-imported" }
    );
    expect(storage.getItem("lem:review:profile-imported")).toContain("profile-imported");
    expect(storage.getItem("lem:profiles")).toContain("profile-imported");
  });

  it("adds a new profile without replacing existing profiles or device-wide settings", () => {
    const storage = new TestStorage();
    storage.setItem("lem:profiles", JSON.stringify([{ id: "profile-current", name: "Current" }]));
    storage.setItem("lem:settings", JSON.stringify({ providerName: "mock", profileId: "profile-current" }));
    storage.setItem("lem:review:profile-current", JSON.stringify({ count: 9 }));

    restoreAppBackupRendererState(
      storage,
      {
        entries: {
          "lem:profiles": JSON.stringify([{ id: "profile-source", name: "Imported" }]),
          "lem:settings": JSON.stringify({ providerName: "gemini", profileId: "profile-source" }),
          "lem:review:profile-source": JSON.stringify({ profileId: "profile-source", count: 3 })
        },
        excludedKeys: []
      },
      "new_profile",
      { "profile-source": "profile-imported" }
    );

    expect(JSON.parse(storage.getItem("lem:profiles") ?? "[]")).toEqual([
      { id: "profile-current", name: "Current" },
      { id: "profile-imported", name: "Imported" }
    ]);
    expect(JSON.parse(storage.getItem("lem:settings") ?? "{}")).toEqual({
      providerName: "mock",
      profileId: "profile-current"
    });
    expect(storage.getItem("lem:review:profile-current")).toBe(JSON.stringify({ count: 9 }));
    expect(storage.getItem("lem:review:profile-imported")).toBe(
      JSON.stringify({ profileId: "profile-imported", count: 3 })
    );
  });

  it("remaps only an exact profile-id segment in renderer storage keys", () => {
    const storage = new TestStorage();
    restoreAppBackupRendererState(
      storage,
      {
        entries: {
          "lem:characterChat:sessions": JSON.stringify({ profileId: "a" }),
          "lem:reviewSettings:team:a": JSON.stringify({ profileId: "team:a" })
        },
        excludedKeys: []
      },
      "new_profile",
      {
        a: "profile-imported-a",
        "team:a": "profile-imported-team-a"
      }
    );

    expect(storage.getItem("lem:characterChat:sessions")).toBe(
      JSON.stringify({ profileId: "profile-imported-a" })
    );
    expect(storage.getItem("lem:reviewSettings:profile-imported-team-a")).toBe(
      JSON.stringify({ profileId: "profile-imported-team-a" })
    );
    expect(storage.key(0)).not.toContain("chprofile-imported-a");
  });

  it("calls main rollback and restores exact prior renderer entries after a renderer failure", async () => {
    const storage = new TestStorage();
    const priorSettings = JSON.stringify({
      cardSyncFolderPath: "C:\\Users\\private\\OneDrive",
      legacySessionValue: "local-only"
    });
    storage.setItem("lem:profiles", JSON.stringify([{ id: "profile-current" }]));
    storage.setItem("lem:settings", priorSettings);
    storage.setItem("lem:recentDocuments:profile-current", "excluded-private-path");
    const previousSnapshot = collectAppBackupRendererRollbackState(storage);
    expect(previousSnapshot.entries["lem:settings"]).toBe(priorSettings);

    const rollbackCalls: string[] = [];
    const finalizeCalls: string[] = [];
    storage.failNextSet("lem:restore-will-fail");
    await expect(
      commitAppBackupRendererRestore({
        storage,
        previousSnapshot,
        incomingSnapshot: {
          entries: {
            "lem:profiles": JSON.stringify([{ id: "profile-imported" }]),
            "lem:restore-will-fail": "incoming"
          },
          excludedKeys: []
        },
        mode: "replace",
        profileIdMap: {},
        rollbackHandle: "rollback-handle",
        rollbackMain: async (handle) => {
          rollbackCalls.push(handle);
        },
        finalizeMain: async (handle) => {
          finalizeCalls.push(handle);
        }
      })
    ).rejects.toThrow("simulated renderer storage failure");

    expect(rollbackCalls).toEqual(["rollback-handle"]);
    expect(finalizeCalls).toEqual([]);
    expect(storage.getItem("lem:profiles")).toBe(
      JSON.stringify([{ id: "profile-current" }])
    );
    expect(storage.getItem("lem:settings")).toBe(priorSettings);
    expect(storage.getItem("lem:restore-will-fail")).toBeNull();
    expect(storage.getItem("lem:recentDocuments:profile-current")).toBe(
      "excluded-private-path"
    );
  });

  it("finalizes the main rollback handle only after renderer state commits", async () => {
    const storage = new TestStorage();
    storage.setItem("lem:profiles", "[]");
    const finalized: string[] = [];
    const rolledBack: string[] = [];

    await commitAppBackupRendererRestore({
      storage,
      previousSnapshot: collectAppBackupRendererRollbackState(storage),
      incomingSnapshot: {
        entries: { "lem:profiles": JSON.stringify([{ id: "profile-restored" }]) },
        excludedKeys: []
      },
      mode: "replace",
      profileIdMap: {},
      rollbackHandle: "commit-handle",
      rollbackMain: async (handle) => {
        rolledBack.push(handle);
      },
      finalizeMain: async (handle) => {
        finalized.push(handle);
      }
    });

    expect(finalized).toEqual(["commit-handle"]);
    expect(rolledBack).toEqual([]);
    expect(storage.getItem("lem:profiles")).toContain("profile-restored");
  });
});
