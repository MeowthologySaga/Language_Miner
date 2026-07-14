import { describe, expect, it } from "vitest";
import {
  AppBackupPreviewStore,
  createAppBackupDocument,
  createAppBackupRestoreEstimates,
  createImportedProfileIdMap,
  parseAppBackupDocument,
  serializeAppBackupDocument
} from "./appBackupService";
import {
  APP_BACKUP_SCHEMA_VERSION,
  createEmptyAppBackupTables
} from "../src/shared/appBackup";

function createDocument() {
  return createAppBackupDocument({
    appVersion: "0.1.0-beta.1",
    profileIds: ["profile-a"],
    payload: {
      database: {
        schemaVersion: APP_BACKUP_SCHEMA_VERSION,
        tables: createEmptyAppBackupTables()
      },
      renderer: {
        entries: { "lem:profiles": "[]" },
        excludedKeys: ["lem:settings:geminiApiKey"]
      },
      playZoneSaves: []
    }
  });
}

describe("app backup service", () => {
  it("round trips a checksummed backup", () => {
    const document = createDocument();
    expect(document.manifest.excludedStores).toEqual(expect.arrayContaining([
      "api-keys",
      "oauth-tokens",
      "browser-cookies",
      "web-reader-session-state",
      "cloud-provider-consent"
    ]));
    expect(parseAppBackupDocument(serializeAppBackupDocument(document))).toEqual(document);
  });

  it("rejects a modified payload", () => {
    const document = createDocument();
    document.payload.renderer.entries["lem:profiles"] = "tampered";
    expect(() => parseAppBackupDocument(JSON.stringify(document))).toThrow(/체크섬/);
  });

  it("creates one-time previews and imported profile ids", () => {
    const store = new AppBackupPreviewStore();
    const preview = store.add(createDocument());
    expect(preview.expiresAt).toBeGreaterThan(Date.now());
    expect(store.take(preview.handleId).manifest.profileIds).toEqual(["profile-a"]);
    expect(() => store.take(preview.handleId)).toThrow(/만료/);
    const clearedPreview = store.add(createDocument());
    expect(store.clear()).toBe(1);
    expect(() => store.take(clearedPreview.handleId)).toThrow(/만료/);
    expect(createImportedProfileIdMap(["profile-a"], 123)).toEqual({
      "profile-a": "profile-a-imported-123-1"
    });
    const special = createImportedProfileIdMap(["__proto__"], 123);
    expect(Object.prototype.hasOwnProperty.call(special, "__proto__")).toBe(true);
    expect(special["__proto__"]).toBe("__proto__-imported-123-1");
  });

  it("previews profile conflicts and add, overwrite, and skip counts for every restore mode", () => {
    const incomingTables = createEmptyAppBackupTables();
    incomingTables.cards.push(
      { id: "same-card", profile_id: "profile-a" },
      { id: "new-card", profile_id: "profile-a" }
    );
    incomingTables.diamond_wallet.push({ id: "default", balance: 20 });
    const document = createAppBackupDocument({
      appVersion: "0.1.0-beta.1",
      profileIds: ["profile-a"],
      payload: {
        database: { schemaVersion: APP_BACKUP_SCHEMA_VERSION, tables: incomingTables },
        renderer: {
          entries: {
            "lem:profiles": JSON.stringify([{ id: "profile-a" }]),
            "lem:settings": "{}",
            "lem:deck:profile-a": "[]"
          },
          excludedKeys: []
        },
        playZoneSaves: [
          { cartridgeId: "same-pack", updatedAt: "2026-07-14T00:00:00.000Z", data: {} },
          { cartridgeId: "new-pack", updatedAt: "2026-07-14T00:00:00.000Z", data: {} }
        ]
      }
    });
    const currentTables = createEmptyAppBackupTables();
    currentTables.cards.push({ id: "same-card", profile_id: "profile-a" });
    currentTables.diamond_wallet.push({ id: "default", balance: 10 });

    const estimates = createAppBackupRestoreEstimates(document, {
      currentProfileIds: ["profile-a"],
      currentPayload: {
        database: { schemaVersion: APP_BACKUP_SCHEMA_VERSION, tables: currentTables },
        renderer: {
          entries: {
            "lem:profiles": JSON.stringify([{ id: "profile-a" }]),
            "lem:settings": "{}",
            "lem:deck:profile-a": "[]"
          },
          excludedKeys: []
        },
        playZoneSaves: [
          { cartridgeId: "same-pack", updatedAt: "2026-07-14T00:00:00.000Z", data: {} }
        ]
      }
    });

    expect(estimates.new_profile).toEqual({
      profileConflicts: 1,
      profilesAdded: 1,
      itemsAdded: 4,
      itemsOverwritten: 0,
      itemsSkipped: 3
    });
    expect(estimates.merge).toEqual({
      profileConflicts: 1,
      profilesAdded: 0,
      itemsAdded: 2,
      itemsOverwritten: 0,
      itemsSkipped: 5
    });
    expect(estimates.replace).toEqual({
      profileConflicts: 1,
      profilesAdded: 0,
      itemsAdded: 2,
      itemsOverwritten: 5,
      itemsSkipped: 0
    });

    const preview = new AppBackupPreviewStore().add(document, {
      currentProfileIds: ["profile-a"]
    });
    expect(preview.warnings).toEqual([
      "secrets-and-local-files-excluded",
      "replace-removes-current-data",
      "device-global-data-preserved"
    ]);
    expect(preview.estimates.new_profile.profileConflicts).toBe(1);
  });

  it("sanitizes raw-looking PlayZone values before public serialization", () => {
    const document = createAppBackupDocument({
      appVersion: "0.1.0-beta.1",
      profileIds: [],
      payload: {
        database: {
          schemaVersion: APP_BACKUP_SCHEMA_VERSION,
          tables: createEmptyAppBackupTables()
        },
        renderer: { entries: {}, excludedKeys: [] },
        playZoneSaves: [
          {
            cartridgeId: "private-pack",
            updatedAt: "2026-07-13T00:00:00.000Z",
            data: {
              localPath: "C:\\Users\\private\\save.json",
              apiKey: ["must", "not", "be", "serialized"].join("-")
            }
          }
        ]
      }
    });

    expect(document.payload.playZoneSaves[0].data).toEqual({
      localPath: null,
      apiKey: null
    });
    expect(serializeAppBackupDocument(document)).not.toContain("must-not-be-serialized");
    expect(serializeAppBackupDocument(document)).not.toContain("C:\\\\Users");
  });
});
