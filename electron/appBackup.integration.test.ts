import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalDatabase } from "./database";
import {
  AppBackupPreviewStore,
  createAppBackupDocument,
  readAppBackupFile,
  writeAppBackupFile
} from "./appBackupService";
import {
  capturePlayZoneRollbackSnapshot,
  exportPlayZoneSaves,
  loadPlayZoneSave,
  restorePlayZoneRollbackSnapshot,
  restorePlayZoneSaves,
  writePlayZoneSave
} from "./playZoneSaveStore";
import {
  APP_BACKUP_MAX_BYTES,
  APP_BACKUP_MAX_PLAY_ZONE_SAVE_BYTES,
  APP_BACKUP_SCHEMA_VERSION,
  createEmptyAppBackupTables
} from "../src/shared/appBackup";
import { createDefaultSampleCards } from "../src/shared/defaultSampleCards";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function createTempDirectory(label: string) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `language-miner-${label}-`));
  tempDirectories.push(directory);
  return directory;
}

async function createDatabase(root: string) {
  const database = new LocalDatabase(path.join(root, "database"));
  await database.init();
  return database;
}

describe(".lembackup Electron service integration", () => {
  it("round trips a real file through database, profile remapping, and PlayZone restore", async () => {
    const sourceRoot = createTempDirectory("backup-roundtrip-source");
    const sourceDatabase = await createDatabase(sourceRoot);
    sourceDatabase.saveCard(createDefaultSampleCards("profile-a")[0]);
    const sourcePlayZoneRoot = path.join(sourceRoot, "play-zone");
    writePlayZoneSave(sourcePlayZoneRoot, {
      cartridgeId: "official-pack",
      value: { chapter: 3 }
    });
    const document = createAppBackupDocument({
      appVersion: "0.1.0-beta.1",
      profileIds: ["profile-a"],
      payload: {
        database: sourceDatabase.exportAppBackupSnapshot(),
        renderer: {
          entries: { "lem:profiles": JSON.stringify([{ id: "profile-a" }]) },
          excludedKeys: []
        },
        playZoneSaves: exportPlayZoneSaves(sourcePlayZoneRoot)
      }
    });
    const backupPath = path.join(sourceRoot, "roundtrip.lembackup");
    writeAppBackupFile(backupPath, document);

    const targetRoot = createTempDirectory("backup-roundtrip-target");
    const targetDatabase = await createDatabase(targetRoot);
    const targetPlayZoneRoot = path.join(targetRoot, "play-zone");
    const imported = readAppBackupFile(backupPath);
    const preview = new AppBackupPreviewStore().add(imported, {
      currentProfileIds: ["profile-a"],
      currentPayload: {
        database: targetDatabase.exportAppBackupSnapshot(),
        renderer: { entries: {}, excludedKeys: [] },
        playZoneSaves: exportPlayZoneSaves(targetPlayZoneRoot)
      }
    });
    expect(preview.estimates.new_profile.profileConflicts).toBe(1);
    expect(preview.estimates.new_profile.profilesAdded).toBe(1);

    const counts = targetDatabase.restoreAppBackupSnapshot(imported.payload.database, "new_profile", {
      "profile-a": "profile-imported"
    });
    const restoredSaves = restorePlayZoneSaves(
      targetPlayZoneRoot,
      imported.payload.playZoneSaves,
      "new_profile"
    );

    expect(counts.cards).toBe(1);
    expect(targetDatabase.listCards("profile-imported")).toHaveLength(1);
    expect(restoredSaves).toBe(1);
    expect(loadPlayZoneSave(targetPlayZoneRoot, { cartridgeId: "official-pack" })).toEqual({
      chapter: 3
    });
  });

  it("rejects checksum damage and an unsupported older schema from real files", () => {
    const root = createTempDirectory("backup-invalid-files");
    const document = createAppBackupDocument({
      appVersion: "0.1.0-beta.1",
      profileIds: ["profile-a"],
      payload: {
        database: {
          schemaVersion: APP_BACKUP_SCHEMA_VERSION,
          tables: createEmptyAppBackupTables()
        },
        renderer: { entries: {}, excludedKeys: [] },
        playZoneSaves: []
      }
    });
    const damagedPath = path.join(root, "checksum-damaged.lembackup");
    writeAppBackupFile(damagedPath, document);
    fs.writeFileSync(
      damagedPath,
      fs.readFileSync(damagedPath, "utf8").replace("profile-a", "profile-b"),
      "utf8"
    );
    expect(() => readAppBackupFile(damagedPath)).toThrow();

    const oldVersionPath = path.join(root, "old-schema.lembackup");
    const oldVersion = JSON.parse(JSON.stringify(document)) as {
      manifest: { schemaVersion: number };
      payload: { database: { schemaVersion: number } };
    };
    oldVersion.manifest.schemaVersion = 0;
    oldVersion.payload.database.schemaVersion = 0;
    fs.writeFileSync(oldVersionPath, JSON.stringify(oldVersion), "utf8");
    expect(() => readAppBackupFile(oldVersionPath)).toThrow();
  });

  it("rejects a real file over the 64 MiB limit before JSON parsing", () => {
    const root = createTempDirectory("backup-size-limit");
    const oversizedPath = path.join(root, "oversized.lembackup");
    const handle = fs.openSync(oversizedPath, "w");
    try {
      fs.ftruncateSync(handle, APP_BACKUP_MAX_BYTES + 1);
    } finally {
      fs.closeSync(handle);
    }
    expect(() => readAppBackupFile(oversizedPath)).toThrow();
  });

  it("rolls back database and PlayZone completely when restore fails after database commit", async () => {
    const sourceRoot = createTempDirectory("backup-rollback-source");
    const sourceDatabase = await createDatabase(sourceRoot);
    sourceDatabase.saveCard(createDefaultSampleCards("profile-a")[0]);
    const oversizedButValidBackupValue = "x".repeat(APP_BACKUP_MAX_PLAY_ZONE_SAVE_BYTES - 2);
    const document = createAppBackupDocument({
      appVersion: "0.1.0-beta.1",
      profileIds: ["profile-a"],
      payload: {
        database: sourceDatabase.exportAppBackupSnapshot(),
        renderer: { entries: {}, excludedKeys: [] },
        playZoneSaves: [
          {
            cartridgeId: "oversized-on-restore",
            updatedAt: "2026-07-14T00:00:00.000Z",
            data: oversizedButValidBackupValue
          }
        ]
      }
    });
    const backupPath = path.join(sourceRoot, "restore-failure.lembackup");
    writeAppBackupFile(backupPath, document);

    const targetRoot = createTempDirectory("backup-rollback-target");
    const targetDatabase = await createDatabase(targetRoot);
    targetDatabase.saveCard(createDefaultSampleCards("profile-current")[1]);
    const targetPlayZoneRoot = path.join(targetRoot, "play-zone");
    writePlayZoneSave(targetPlayZoneRoot, {
      cartridgeId: "current-pack",
      value: { checkpoint: 9 }
    });
    const beforeDatabase = targetDatabase.exportAppBackupRollbackSnapshot();
    const beforePlayZone = capturePlayZoneRollbackSnapshot(targetPlayZoneRoot);
    const imported = readAppBackupFile(backupPath);

    expect(() => {
      try {
        targetDatabase.restoreAppBackupSnapshot(imported.payload.database, "replace");
        restorePlayZoneSaves(targetPlayZoneRoot, imported.payload.playZoneSaves, "replace");
      } catch (error) {
        targetDatabase.restoreAppBackupRollbackSnapshot(beforeDatabase);
        restorePlayZoneRollbackSnapshot(targetPlayZoneRoot, beforePlayZone);
        throw error;
      }
    }).toThrow(/5 MiB/);

    expect(targetDatabase.exportAppBackupRollbackSnapshot()).toEqual(beforeDatabase);
    expect(capturePlayZoneRollbackSnapshot(targetPlayZoneRoot)).toEqual(beforePlayZone);
    expect(loadPlayZoneSave(targetPlayZoneRoot, { cartridgeId: "current-pack" })).toEqual({
      checkpoint: 9
    });
    expect(
      loadPlayZoneSave(targetPlayZoneRoot, {
        cartridgeId: "oversized-on-restore",
        fallback: null
      })
    ).toBeNull();
  });
});
