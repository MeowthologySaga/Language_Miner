import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  backupPlayZoneSave,
  capturePlayZoneRollbackSnapshot,
  clearPlayZoneSave,
  exportPlayZoneSaves,
  loadPlayZoneSave,
  PLAY_ZONE_MAX_PACK_BACKUPS,
  PLAY_ZONE_MAX_SAVE_BYTES,
  restorePlayZoneRollbackSnapshot,
  restorePlayZoneSaves,
  writePlayZoneSave
} from "./playZoneSaveStore";

describe("playZoneSaveStore", () => {
  it("does not create a save directory when loading a missing save", () => {
    const parentPath = fs.mkdtempSync(path.join(os.tmpdir(), "lem-playzone-read-"));
    const missingRootPath = path.join(parentPath, "play-zone-saves");

    expect(loadPlayZoneSave(missingRootPath, {
      cartridgeId: "missing-pack",
      fallback: { stage: 0 }
    })).toEqual({ stage: 0 });
    expect(fs.existsSync(missingRootPath)).toBe(false);
  });

  it("persists and reloads a cartridge save by id", () => {
    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "lem-playzone-save-"));
    const value = { floor: 42, gold: 1200 };

    expect(writePlayZoneSave(rootPath, { cartridgeId: "meowthology.abyss-summoner", value })).toBe(
      true
    );
    expect(loadPlayZoneSave(rootPath, { cartridgeId: "meowthology.abyss-summoner" })).toEqual(
      value
    );
    expect(writePlayZoneSave(rootPath, {
      cartridgeId: "meowthology.abyss-summoner",
      value: { floor: 43 }
    })).toBe(true);
    expect(loadPlayZoneSave(rootPath, { cartridgeId: "meowthology.abyss-summoner" })).toEqual({
      floor: 43
    });

    expect(clearPlayZoneSave(rootPath, { cartridgeId: "meowthology.abyss-summoner" })).toBe(true);
    expect(
      loadPlayZoneSave(rootPath, {
        cartridgeId: "meowthology.abyss-summoner",
        fallback: { floor: 1 }
      })
    ).toEqual({ floor: 1 });
  });

  it("backs up an existing cartridge save before updates", () => {
    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "lem-playzone-save-"));
    const value = { floor: 9, diamondsSpent: 30 };

    writePlayZoneSave(rootPath, { cartridgeId: "meowthology.abyss-summoner", value });
    const result = backupPlayZoneSave(rootPath, { cartridgeId: "meowthology.abyss-summoner" });

    expect(result.backedUp).toBe(true);
    expect(result.backupPath).toBeTruthy();
    expect(result.backupPath?.startsWith(path.resolve(rootPath))).toBe(true);
    const backedUp = JSON.parse(fs.readFileSync(result.backupPath ?? "", "utf8")) as {
      value?: unknown;
    };
    expect(backedUp.value).toEqual(value);
  });

  it("skips backup when a cartridge has no save yet", () => {
    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "lem-playzone-save-"));

    const result = backupPlayZoneSave(rootPath, { cartridgeId: "empty-game" });

    expect(result.backedUp).toBe(false);
    expect(result.backupPath).toBeUndefined();
  });

  it("rejects unsafe ids, cyclic values, and saves above the per-pack quota", () => {
    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "lem-playzone-save-"));
    expect(() => writePlayZoneSave(rootPath, { cartridgeId: "../outside", value: {} })).toThrow(
      /Invalid PlayZone cartridge id/
    );

    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => writePlayZoneSave(rootPath, { cartridgeId: "safe-pack", value: cyclic })).toThrow(
      /JSON serializable/
    );
    expect(() => writePlayZoneSave(rootPath, {
      cartridgeId: "safe-pack",
      value: "x".repeat(PLAY_ZONE_MAX_SAVE_BYTES)
    })).toThrow(/5 MiB/);
  });

  it("retains only the bounded number of backups per pack", () => {
    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "lem-playzone-save-"));
    const cartridgeId = "bounded-backups";
    writePlayZoneSave(rootPath, { cartridgeId, value: { level: 1 } });
    for (let index = 0; index < PLAY_ZONE_MAX_PACK_BACKUPS + 3; index += 1) {
      backupPlayZoneSave(rootPath, { cartridgeId });
    }
    const backupRoot = path.join(rootPath, "backups", cartridgeId);
    expect(fs.readdirSync(backupRoot)).toHaveLength(PLAY_ZONE_MAX_PACK_BACKUPS);
  });

  it("exports current saves and round-trips them without backup artifacts", () => {
    const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lem-playzone-save-"));
    const targetRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lem-playzone-save-"));
    writePlayZoneSave(sourceRoot, { cartridgeId: "pack-one", value: { stage: 4 } });
    writePlayZoneSave(sourceRoot, { cartridgeId: "pack-two", value: { score: 900 } });
    backupPlayZoneSave(sourceRoot, { cartridgeId: "pack-one" });

    const snapshot = exportPlayZoneSaves(sourceRoot);
    expect(snapshot.map((save) => save.cartridgeId)).toEqual(["pack-one", "pack-two"]);
    expect(snapshot[0].data).toEqual({ stage: 4 });

    expect(restorePlayZoneSaves(targetRoot, snapshot, "replace")).toBe(2);
    expect(loadPlayZoneSave(targetRoot, { cartridgeId: "pack-one" })).toEqual({ stage: 4 });
    expect(loadPlayZoneSave(targetRoot, { cartridgeId: "pack-two" })).toEqual({ score: 900 });
  });

  it("keeps existing saves in merge mode and removes stale saves in replace mode", () => {
    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "lem-playzone-save-"));
    writePlayZoneSave(rootPath, { cartridgeId: "existing", value: { source: "current" } });
    writePlayZoneSave(rootPath, { cartridgeId: "stale", value: { remove: true } });
    const incoming = [
      {
        cartridgeId: "existing",
        schemaVersion: "1",
        updatedAt: new Date().toISOString(),
        data: { source: "backup" }
      }
    ];

    expect(restorePlayZoneSaves(rootPath, incoming, "merge")).toBe(0);
    expect(loadPlayZoneSave(rootPath, { cartridgeId: "existing" })).toEqual({ source: "current" });
    expect(restorePlayZoneSaves(rootPath, incoming, "replace")).toBe(1);
    expect(loadPlayZoneSave(rootPath, { cartridgeId: "existing" })).toEqual({ source: "backup" });
    expect(loadPlayZoneSave(rootPath, { cartridgeId: "stale", fallback: null })).toBeNull();
  });

  it("preserves same-cartridge saves while importing non-conflicting saves in new-profile mode", () => {
    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "lem-playzone-save-"));
    writePlayZoneSave(rootPath, {
      cartridgeId: "existing",
      value: { source: "current-profile" }
    });
    const incoming = [
      {
        cartridgeId: "existing",
        schemaVersion: "1",
        updatedAt: new Date().toISOString(),
        data: { source: "imported-profile" }
      },
      {
        cartridgeId: "new-pack",
        schemaVersion: "1",
        updatedAt: new Date().toISOString(),
        data: { stage: 7 }
      }
    ];

    expect(restorePlayZoneSaves(rootPath, incoming, "new_profile")).toBe(1);
    expect(loadPlayZoneSave(rootPath, { cartridgeId: "existing" })).toEqual({
      source: "current-profile"
    });
    expect(loadPlayZoneSave(rootPath, { cartridgeId: "new-pack" })).toEqual({ stage: 7 });
  });

  it("restores the exact raw PlayZone save bytes for an in-memory rollback", () => {
    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "lem-playzone-save-"));
    const cartridgeId = "raw-rollback-pack";
    writePlayZoneSave(rootPath, {
      cartridgeId,
      value: { localPath: "C:\\Users\\private\\save.json", tokenLikeValue: "private-value" }
    });
    const savePath = path.join(rootPath, `${cartridgeId}.json`);
    const before = fs.readFileSync(savePath);
    const snapshot = capturePlayZoneRollbackSnapshot(rootPath);

    writePlayZoneSave(rootPath, { cartridgeId, value: { stage: 999 } });
    expect(fs.readFileSync(savePath).equals(before)).toBe(false);

    expect(restorePlayZoneRollbackSnapshot(rootPath, snapshot)).toBe(1);
    expect(fs.readFileSync(savePath).equals(before)).toBe(true);
  });
});
