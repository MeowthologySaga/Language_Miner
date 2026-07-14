import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`encrypted:${value}`, "utf8"),
    decryptString: (value: Buffer) => value.toString("utf8").replace(/^encrypted:/, "")
  }
}));

import { createDefaultSampleCards } from "../src/shared/defaultSampleCards";
import {
  PRIVACY_ALL_LOCAL_DATA_CONFIRMATION,
  PRIVACY_LEARNING_DATA_CONFIRMATION
} from "../src/shared/privacyData";
import { LocalDatabase } from "./database";
import { ExtensionQueueClearCoordinator } from "./extensionQueueClearCoordinator";
import { PrivacyDataService } from "./privacyDataService";
import { PrivacyDeletionCoordinator } from "./privacyDeletionCoordinator";
import { PrivacyDeletionStateStore } from "./privacyDeletionStateStore";
import { PlayZoneManagedFileWriterCoordinator } from "./playZoneManagedFileWriterCoordinator";
import { writePlayZoneSave } from "./playZoneSaveStore";
import { SecureSettingsVault } from "./secureSettingsVault";

const roots: string[] = [];
const OPERATION_ID = "123e4567-e89b-42d3-a456-426614174010";
const EXTENSION_ID = "123e4567-e89b-42d3-a456-426614174011";

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("full local privacy deletion integration", () => {
  it("verifies database, secure settings, sessions, files, renderer storage, and extension queue are empty", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lem-privacy-e2e-"));
    roots.push(root);
    const database = new LocalDatabase(root);
    await database.init();
    database.saveCard(createDefaultSampleCards("default")[0]);
    const vault = new SecureSettingsVault(root);
    vault.set({ geminiApiKey: "test-gemini", googleTranslateApiKey: "test-google" });
    const managedFile = path.join(root, "play-zone-saves", "pack", "save.json");
    fs.mkdirSync(path.dirname(managedFile), { recursive: true });
    fs.writeFileSync(managedFile, "private-save", "utf8");
    let cookies = 2;
    let cacheEntries = 3;

    const base = await new PrivacyDataService({
      userDataPath: root,
      database,
      secureSettings: vault,
      clearWebReaderLoginData: async () => {
        const removedItems = cookies;
        cookies = 0;
        return { removedItems, remainingItems: cookies, verified: true };
      },
      clearElectronCaches: async () => {
        const removedItems = cacheEntries;
        cacheEntries = 0;
        return { removedItems, remainingItems: cacheEntries, verified: true };
      }
    }).deleteData({
      target: "all_local_data",
      confirmation: PRIVACY_ALL_LOCAL_DATA_CONFIRMATION
    });

    const extension = new ExtensionQueueClearCoordinator(() => EXTENSION_ID, 60_000);
    const stateStore = new PrivacyDeletionStateStore(() => root);
    const coordinator = new PrivacyDeletionCoordinator(
      extension,
      () => OPERATION_ID,
      stateStore
    );
    coordinator.begin(base);
    coordinator.completeRendererCleanup(OPERATION_ID, {
      scope: "all",
      attemptedKeys: 4,
      removedKeys: 4,
      remainingKeys: 0,
      failedKeys: 0,
      verified: true
    });
    expect(extension.acknowledge({
      requestId: EXTENSION_ID,
      removedItems: 5,
      remainingItems: 0
    })).toBe(true);
    coordinator.noteExtensionStatusChanged();
    const result = coordinator.getStatus(OPERATION_ID);

    expect(result).toMatchObject({
      ok: true,
      phase: "complete",
      verification: {
        secureSettingsRemaining: 0,
        webReaderCookiesRemaining: 0,
        electronCacheBytesRemaining: 0,
        managedPathEntriesRemaining: 0,
        database: { remainingRows: 0, durableCopiesVerified: true }
      },
      counts: { rendererStorageKeys: 4, extensionQueueItems: 5 }
    });
    expect(database.verifyPrivacyDeletion().remainingRows).toBe(0);
    expect(vault.verifyCleared()).toMatchObject({ verified: true, remainingKeys: 0 });
    expect(cookies).toBe(0);
    expect(cacheEntries).toBe(0);
    expect(fs.existsSync(managedFile)).toBe(false);
    expect(stateStore.load()).not.toBeNull();
    expect(coordinator.acknowledgeTerminal(OPERATION_ID)).toMatchObject({
      ok: true,
      phase: "complete"
    });
    expect(stateStore.load()).toBeNull();
  });

  it("blocks new scan/save/runtime writes, drains active writers, and leaves no deletion residual", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lem-privacy-writer-e2e-"));
    roots.push(root);
    const database = new LocalDatabase(root);
    await database.init();
    const vault = new SecureSettingsVault(root);
    const writerCoordinator = new PlayZoneManagedFileWriterCoordinator();
    const archivePath = path.join(root, "play-zone-archives", "scan", "entry.html");
    const saveRoot = path.join(root, "play-zone-saves");
    const runtimeAuthorizationPath = path.join(
      root,
      "play-zone-installed",
      "active-runtime",
      "snapshot.json"
    );
    let releaseWriters!: () => void;
    const writersMayFinish = new Promise<void>((resolve) => {
      releaseWriters = resolve;
    });

    const activeScan = writerCoordinator.run(async () => {
      await writersMayFinish;
      fs.mkdirSync(path.dirname(archivePath), { recursive: true });
      fs.writeFileSync(archivePath, "scanned pack", "utf8");
    });
    const activeSave = writerCoordinator.run(async () => {
      await writersMayFinish;
      writePlayZoneSave(saveRoot, { cartridgeId: "active-pack", value: { stage: 3 } });
    });
    const activeRuntimeAuthorization = writerCoordinator.run(async () => {
      await writersMayFinish;
      fs.mkdirSync(path.dirname(runtimeAuthorizationPath), { recursive: true });
      fs.writeFileSync(runtimeAuthorizationPath, "authorized runtime", "utf8");
    });
    expect(writerCoordinator.activeWriterCount).toBe(3);

    const deletionBlock = writerCoordinator.blockNewWrites();
    const forbiddenPath = path.join(root, "play-zone-saves", "blocked.json");
    await expect(
      writerCoordinator.run(() => {
        fs.mkdirSync(path.dirname(forbiddenPath), { recursive: true });
        fs.writeFileSync(forbiddenPath, "must not be written", "utf8");
      })
    ).rejects.toThrow(/local-data deletion/i);

    const result = await new PrivacyDataService({
      userDataPath: root,
      database,
      secureSettings: vault,
      quiesceManagedFileWriters: async () => {
        releaseWriters();
        await deletionBlock.drain();
      },
      clearWebReaderLoginData: async () => ({
        removedItems: 0,
        remainingItems: 0,
        verified: true
      }),
      clearElectronCaches: async () => ({
        removedItems: 0,
        remainingItems: 0,
        verified: true
      })
    }).deleteData({
      target: "learning_data",
      confirmation: PRIVACY_LEARNING_DATA_CONFIRMATION
    });

    await Promise.all([activeScan, activeSave, activeRuntimeAuthorization]);
    expect(result.verification.managedPathEntriesRemaining).toBe(0);
    expect(fs.existsSync(archivePath)).toBe(false);
    expect(fs.existsSync(saveRoot)).toBe(false);
    expect(fs.existsSync(runtimeAuthorizationPath)).toBe(false);
    expect(fs.existsSync(forbiddenPath)).toBe(false);
    deletionBlock.release();
  });

  it("cancels and drains listening media jobs before database and managed-path deletion", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lem-privacy-listening-race-"));
    roots.push(root);
    const database = new LocalDatabase(root);
    await database.init();
    const vault = new SecureSettingsVault(root);
    const writerCoordinator = new PlayZoneManagedFileWriterCoordinator();
    const transcriptPath = path.join(root, "listening-transcripts", "active", "result.vtt");
    const clipPath = path.join(root, "media", "listening-card-clips", "active", "audio.m4a");
    const playbackPath = path.join(root, "video-reader", "video-reader-playback", "active.mp4");
    const lateCard = createDefaultSampleCards("default")[0];

    const activeListeningJob = writerCoordinator.runAbortable(async (signal) => {
      for (const filePath of [transcriptPath, clipPath, playbackPath]) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, "partial", "utf8");
      }
      await new Promise<void>((resolve) => {
        signal.addEventListener(
          "abort",
          () => {
            fs.writeFileSync(transcriptPath, "settled after abort", "utf8");
            database.saveCard(lateCard);
            resolve();
          },
          { once: true }
        );
      });
    });
    expect(writerCoordinator.activeWriterCount).toBe(1);

    const deletionBlock = writerCoordinator.blockNewWrites();
    const result = await new PrivacyDataService({
      userDataPath: root,
      database,
      secureSettings: vault,
      quiesceManagedFileWriters: async () => {
        deletionBlock.cancelActive(new Error("privacy deletion"));
        await deletionBlock.drain();
      },
      clearWebReaderLoginData: async () => ({
        removedItems: 0,
        remainingItems: 0,
        verified: true
      }),
      clearElectronCaches: async () => ({
        removedItems: 0,
        remainingItems: 0,
        verified: true
      })
    }).deleteData({
      target: "learning_data",
      confirmation: PRIVACY_LEARNING_DATA_CONFIRMATION
    });

    await activeListeningJob;
    expect(result.verification.database.remainingRows).toBe(0);
    expect(result.verification.managedPathEntriesRemaining).toBe(0);
    expect(database.verifyPrivacyDeletion().remainingRows).toBe(0);
    expect(fs.existsSync(transcriptPath)).toBe(false);
    expect(fs.existsSync(clipPath)).toBe(false);
    expect(fs.existsSync(playbackPath)).toBe(false);
    deletionBlock.release();
  });

  it("fails closed on drain timeout, lets the writer settle, and succeeds on retry", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lem-privacy-timeout-retry-"));
    roots.push(root);
    const database = new LocalDatabase(root);
    await database.init();
    database.saveCard(createDefaultSampleCards("default")[0]);
    const vault = new SecureSettingsVault(root);
    const writerCoordinator = new PlayZoneManagedFileWriterCoordinator();
    const latePath = path.join(root, "listening-transcripts", "late", "result.vtt");
    let finishWriter!: () => void;
    const mayFinish = new Promise<void>((resolve) => {
      finishWriter = resolve;
    });
    const activeWriter = writerCoordinator.run(async () => {
      await mayFinish;
      fs.mkdirSync(path.dirname(latePath), { recursive: true });
      fs.writeFileSync(latePath, "late", "utf8");
    });

    const firstBlock = writerCoordinator.blockNewWrites();
    const failed = await new PrivacyDataService({
      userDataPath: root,
      database,
      secureSettings: vault,
      quiesceManagedFileWriters: () => firstBlock.drain({ timeoutMs: 10 }),
      clearWebReaderLoginData: async () => ({ removedItems: 0, remainingItems: 0, verified: true }),
      clearElectronCaches: async () => ({ removedItems: 0, remainingItems: 0, verified: true })
    }).deleteData({
      target: "learning_data",
      confirmation: PRIVACY_LEARNING_DATA_CONFIRMATION
    });

    expect(failed.operations.learningDatabase).toBe("failed");
    expect(failed.operations.managedFiles).toBe("failed");
    expect(database.verifyPrivacyDeletion().remainingRows).toBeGreaterThan(0);
    firstBlock.release();
    finishWriter();
    await activeWriter;
    expect(fs.existsSync(latePath)).toBe(true);

    const retryBlock = writerCoordinator.blockNewWrites();
    const retried = await new PrivacyDataService({
      userDataPath: root,
      database,
      secureSettings: vault,
      quiesceManagedFileWriters: () => retryBlock.drain({ timeoutMs: 10 }),
      clearWebReaderLoginData: async () => ({ removedItems: 0, remainingItems: 0, verified: true }),
      clearElectronCaches: async () => ({ removedItems: 0, remainingItems: 0, verified: true })
    }).deleteData({
      target: "learning_data",
      confirmation: PRIVACY_LEARNING_DATA_CONFIRMATION
    });

    expect(retried.operations.learningDatabase).toBe("cleared");
    expect(retried.verification.database.remainingRows).toBe(0);
    expect(retried.verification.managedPathEntriesRemaining).toBe(0);
    expect(fs.existsSync(latePath)).toBe(false);
    retryBlock.release();
  });
});
