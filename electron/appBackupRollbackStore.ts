import { randomUUID } from "node:crypto";
import type { AppBackupDatabaseSnapshot } from "../src/shared/appBackup";
import type { PlayZoneRollbackSnapshot } from "./playZoneSaveStore";

const DEFAULT_ROLLBACK_TTL_MS = 5 * 60 * 1000;
const ROLLBACK_HANDLE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AppBackupRollbackSnapshot = {
  database: AppBackupDatabaseSnapshot;
  playZone: PlayZoneRollbackSnapshot;
};

type RollbackItem = {
  snapshot: AppBackupRollbackSnapshot;
  expiresAt: number;
  timeout: ReturnType<typeof setTimeout>;
};

export class AppBackupRollbackStore {
  private readonly items = new Map<string, RollbackItem>();

  constructor(private readonly ttlMs = DEFAULT_ROLLBACK_TTL_MS) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new Error("Backup rollback TTL must be a positive number.");
    }
  }

  add(snapshot: AppBackupRollbackSnapshot) {
    const handle = randomUUID();
    const timeout = setTimeout(() => {
      this.release(handle, true);
    }, this.ttlMs);
    if (typeof timeout === "object" && "unref" in timeout) timeout.unref();
    this.items.set(handle, {
      snapshot,
      expiresAt: Date.now() + this.ttlMs,
      timeout
    });
    return handle;
  }

  take(handleInput: string) {
    const handle = normalizeRollbackHandle(handleInput);
    const item = this.items.get(handle);
    if (!item || item.expiresAt <= Date.now()) {
      if (item) this.release(handle, true);
      throw new Error("Backup rollback handle has expired or was already used.");
    }
    this.items.delete(handle);
    clearTimeout(item.timeout);
    return item.snapshot;
  }

  discard(handleInput: string) {
    const handle = normalizeRollbackHandle(handleInput);
    return this.release(handle, true);
  }

  clear() {
    for (const handle of [...this.items.keys()]) this.release(handle, true);
  }

  private release(handle: string, dispose: boolean) {
    const item = this.items.get(handle);
    if (!item) return false;
    this.items.delete(handle);
    clearTimeout(item.timeout);
    if (dispose) disposeAppBackupRollbackSnapshot(item.snapshot);
    return true;
  }
}

export function disposeAppBackupRollbackSnapshot(snapshot: AppBackupRollbackSnapshot) {
  for (const file of snapshot.playZone.files) file.contents.fill(0);
}

function normalizeRollbackHandle(value: unknown) {
  const handle = typeof value === "string" ? value.trim() : "";
  if (!ROLLBACK_HANDLE_PATTERN.test(handle)) {
    throw new Error("Backup rollback handle is invalid.");
  }
  return handle;
}
