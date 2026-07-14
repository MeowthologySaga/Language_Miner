import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createDefaultSampleCards } from "../src/shared/defaultSampleCards";
import { LocalDatabase } from "./database";

describe("LocalDatabase durability", () => {
  it("persists a spend transaction and replays the same idempotency key once", async () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "lem-database-spend-"));
    const database = new LocalDatabase(userDataPath);
    await database.init();
    const unsafeDatabase = database as unknown as {
      run(sql: string, params?: Array<string | number | null>): void;
    };
    unsafeDatabase.run(
      "INSERT OR REPLACE INTO diamond_wallet (id, balance, total_earned, total_spent, updated_at) VALUES ('default', 100, 100, 0, ?)",
      [new Date().toISOString()]
    );

    const request = {
      amount: 30,
      reason: "Test action",
      profileId: "profile-test",
      idempotencyKey: "playzone:test:action:request-0001"
    };
    const first = database.spendDiamonds(request);
    const lookup = database.lookupDiamondSpend(request);
    const replay = database.spendDiamonds(request);

    expect(first).toMatchObject({ ok: true, balanceAfter: 70 });
    expect(lookup).toMatchObject({ ok: true, balanceAfter: 70, idempotentReplay: true });
    expect(replay).toMatchObject({ ok: true, balanceAfter: 70, idempotentReplay: true });
    expect(database.getDiamondWallet().balance).toBe(70);
    expect(database.listDiamondTransactions()).toHaveLength(1);

    const reopened = new LocalDatabase(userDataPath);
    await reopened.init();
    expect(reopened.getDiamondWallet().balance).toBe(70);
    expect(reopened.listDiamondTransactions()).toHaveLength(1);
    expect(reopened.lookupDiamondSpend(request)).toMatchObject({
      ok: true,
      balanceAfter: 70,
      idempotentReplay: true
    });
  });

  it("returns null before a spend and reports conflicts without charging", async () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "lem-database-spend-lookup-"));
    const database = new LocalDatabase(userDataPath);
    await database.init();
    const unsafeDatabase = database as unknown as {
      run(sql: string, params?: Array<string | number | null>): void;
    };
    unsafeDatabase.run(
      "INSERT OR REPLACE INTO diamond_wallet (id, balance, total_earned, total_spent, updated_at) VALUES ('default', 100, 100, 0, ?)",
      [new Date().toISOString()]
    );
    const request = {
      amount: 10,
      reason: "Recovery test",
      idempotencyKey: "playzone:test:recovery:request-0001"
    };

    expect(database.lookupDiamondSpend(request)).toBeNull();
    database.spendDiamonds(request);
    expect(database.lookupDiamondSpend({ ...request, amount: 11 })).toMatchObject({
      ok: false,
      code: "idempotency_conflict"
    });
    expect(database.listDiamondTransactions()).toHaveLength(1);
  });

  it("clears cards from both the primary database and durable backup", async () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "lem-database-clear-cards-"));
    const database = new LocalDatabase(userDataPath);
    await database.init();
    database.saveCard(createDefaultSampleCards("default")[0], "default");

    const result = database.clearAllCards();
    expect(result.before.cards).toBe(1);
    expect(database.listCards("default")).toHaveLength(0);

    fs.unlinkSync(path.join(userDataPath, "local-english-miner.sqlite"));
    const recovered = new LocalDatabase(userDataPath);
    await recovered.init();
    expect(recovered.listCards("default")).toHaveLength(0);
  });

  it("persists every finalized onboarding card", async () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "lem-database-onboarding-"));
    const database = new LocalDatabase(userDataPath);
    await database.init();
    const samples = createDefaultSampleCards("default");

    for (const sample of samples) {
      database.saveCard(sample, "default");
    }

    expect(database.listCards("default")).toHaveLength(9);
  });

  it("retries transient Windows rename failures and completes the atomic save", async () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "lem-database-rename-retry-"));
    const database = new LocalDatabase(userDataPath);
    await database.init();
    const databasePath = path.join(userDataPath, "local-english-miner.sqlite");
    const backupTempPath = `${databasePath}.bak.${process.pid}.tmp`;
    const backupPath = `${databasePath}.bak`;
    const transientCodes = ["EPERM", "EACCES", "EBUSY"];
    const originalRenameSync = fs.renameSync;
    let backupPromotionAttempts = 0;
    const renameSpy = vi.spyOn(fs, "renameSync").mockImplementation((sourcePath, destinationPath) => {
      if (String(sourcePath) === backupTempPath && String(destinationPath) === backupPath) {
        const attempt = backupPromotionAttempts;
        backupPromotionAttempts += 1;
        if (attempt < transientCodes.length) {
          throw createRenameFailure(transientCodes[attempt], sourcePath, destinationPath);
        }
      }
      originalRenameSync(sourcePath, destinationPath);
    });

    try {
      database.saveCard(createDefaultSampleCards("default")[0], "default");
    } finally {
      renameSpy.mockRestore();
    }

    expect(backupPromotionAttempts).toBe(4);
    const reopened = new LocalDatabase(userDataPath);
    await reopened.init();
    expect(reopened.listCards("default")).toHaveLength(1);
  });

  it("bounds transient rename retries, preserves the primary file, and redacts paths", async () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "lem-database-rename-bound-"));
    const database = new LocalDatabase(userDataPath);
    await database.init();
    const databasePath = path.join(userDataPath, "local-english-miner.sqlite");
    const backupTempPath = `${databasePath}.bak.${process.pid}.tmp`;
    const backupPath = `${databasePath}.bak`;
    const primaryBefore = fs.readFileSync(databasePath);
    const originalRenameSync = fs.renameSync;
    let backupPromotionAttempts = 0;
    const renameSpy = vi.spyOn(fs, "renameSync").mockImplementation((sourcePath, destinationPath) => {
      if (String(sourcePath) === backupTempPath && String(destinationPath) === backupPath) {
        backupPromotionAttempts += 1;
        throw createRenameFailure("EPERM", sourcePath, destinationPath);
      }
      originalRenameSync(sourcePath, destinationPath);
    });
    let caught: unknown;

    try {
      database.saveCard(createDefaultSampleCards("default")[0], "default");
    } catch (error) {
      caught = error;
    } finally {
      renameSpy.mockRestore();
    }

    const safeError = caught as NodeJS.ErrnoException & { dest?: unknown };
    expect(safeError).toBeInstanceOf(Error);
    expect(safeError.name).toBe("DatabasePersistenceError");
    expect(safeError.code).toBe("EPERM");
    expect(safeError.message).toBe("The local database could not be saved safely.");
    expect(safeError.stack).toBe(`${safeError.name}: ${safeError.message}`);
    expect(safeError.path).toBeUndefined();
    expect(safeError.dest).toBeUndefined();
    expect(String(safeError)).not.toContain(userDataPath);
    expect(backupPromotionAttempts).toBe(6);
    expect(fs.readFileSync(databasePath)).toEqual(primaryBefore);
    expect(fs.readdirSync(userDataPath).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("does not retry a non-transient rename error", async () => {
    const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "lem-database-rename-eio-"));
    const database = new LocalDatabase(userDataPath);
    await database.init();
    const databasePath = path.join(userDataPath, "local-english-miner.sqlite");
    const backupTempPath = `${databasePath}.bak.${process.pid}.tmp`;
    const backupPath = `${databasePath}.bak`;
    const originalRenameSync = fs.renameSync;
    let backupPromotionAttempts = 0;
    const renameSpy = vi.spyOn(fs, "renameSync").mockImplementation((sourcePath, destinationPath) => {
      if (String(sourcePath) === backupTempPath && String(destinationPath) === backupPath) {
        backupPromotionAttempts += 1;
        throw createRenameFailure("EIO", sourcePath, destinationPath);
      }
      originalRenameSync(sourcePath, destinationPath);
    });
    let caught: unknown;

    try {
      database.saveCard(createDefaultSampleCards("default")[0], "default");
    } catch (error) {
      caught = error;
    } finally {
      renameSpy.mockRestore();
    }

    expect(backupPromotionAttempts).toBe(1);
    expect(caught).toMatchObject({
      name: "DatabasePersistenceError",
      message: "The local database could not be saved safely.",
      code: "EIO"
    });
  });
});

function createRenameFailure(
  code: string,
  sourcePath: fs.PathLike,
  destinationPath: fs.PathLike
) {
  return Object.assign(
    new Error(`rename failed from '${String(sourcePath)}' to '${String(destinationPath)}'`),
    {
      code,
      syscall: "rename",
      path: sourcePath,
      dest: destinationPath
    }
  );
}
