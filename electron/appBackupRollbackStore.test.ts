import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APP_BACKUP_SCHEMA_VERSION,
  createEmptyAppBackupTables
} from "../src/shared/appBackup";
import {
  AppBackupRollbackStore,
  disposeAppBackupRollbackSnapshot,
  type AppBackupRollbackSnapshot
} from "./appBackupRollbackStore";

afterEach(() => {
  vi.useRealTimers();
});

describe("AppBackupRollbackStore", () => {
  it("returns a rollback snapshot only once", () => {
    const contents = Buffer.from("private rollback contents", "utf8");
    const snapshot = createSnapshot(contents);
    const store = new AppBackupRollbackStore();
    const handle = store.add(snapshot);

    expect(store.take(handle)).toBe(snapshot);
    expect(() => store.take(handle)).toThrow(/expired or was already used/);
    disposeAppBackupRollbackSnapshot(snapshot);
    expect(contents.every((value) => value === 0)).toBe(true);
  });

  it("expires and clears snapshots while zeroing raw PlayZone bytes", () => {
    vi.useFakeTimers();
    const expiredContents = Buffer.from("expires", "utf8");
    const clearedContents = Buffer.from("clears", "utf8");
    const store = new AppBackupRollbackStore(100);
    const expiredHandle = store.add(createSnapshot(expiredContents));

    vi.advanceTimersByTime(101);
    expect(() => store.take(expiredHandle)).toThrow(/expired or was already used/);
    expect(expiredContents.every((value) => value === 0)).toBe(true);

    const clearedHandle = store.add(createSnapshot(clearedContents));
    store.clear();
    expect(() => store.take(clearedHandle)).toThrow(/expired or was already used/);
    expect(clearedContents.every((value) => value === 0)).toBe(true);
  });
});

function createSnapshot(contents: Buffer): AppBackupRollbackSnapshot {
  return {
    database: {
      schemaVersion: APP_BACKUP_SCHEMA_VERSION,
      tables: createEmptyAppBackupTables()
    },
    playZone: {
      files: [{ cartridgeId: "rollback-pack", contents }]
    }
  };
}
