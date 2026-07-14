import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PRIVACY_ALL_LOCAL_DATA_CONFIRMATION,
  PRIVACY_LEARNING_DATA_CONFIRMATION,
  type PrivacyDatabaseDeleteCounts
} from "../src/shared/privacyData";
import {
  PrivacyDataService,
  type PrivacyDataServiceDependencies
} from "./privacyDataService";
import { AppOnboardingStateStore } from "./appOnboardingState";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function createTempDirectory(label: string) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `lem-privacy-${label}-`));
  tempDirectories.push(directory);
  return directory;
}

function emptyDatabaseCounts(totalRows = 0): PrivacyDatabaseDeleteCounts {
  return {
    cards: totalRows,
    vocabularyItems: 0,
    highlightMappings: 0,
    lifeLogs: 0,
    listeningVideoCandidates: 0,
    listeningTranscripts: 0,
    reviews: 0,
    translationCacheEntries: 0,
    exportRecords: 0,
    diamondWallets: 0,
    diamondTransactions: 0,
    missionEvents: 0,
    dailyMissionProgress: 0,
    totalRows
  };
}

function createDependencies(userDataPath: string) {
  return {
    userDataPath,
    legacyUserDataPath: null as string | null,
    database: {
      deleteAllLearningData: vi.fn(() => emptyDatabaseCounts(4)),
      verifyPrivacyDeletion: vi.fn(() => ({
        remainingRows: 0,
        freelistPages: 0,
        integrityOk: true,
        durableCopiesVerified: true
      }))
    },
    secureSettings: {
      clear: vi.fn(() => ({ removed: 2 })),
      verifyCleared: vi.fn(() => ({ verified: true, remainingKeys: 0, remainingFiles: 0 }))
    },
    quiesceManagedFileWriters: vi.fn(async () => {}),
    clearWebReaderLoginData: vi.fn(async () => ({
      removedItems: 3,
      remainingItems: 0,
      verified: true
    })),
    clearElectronCaches: vi.fn(async () => ({
      removedItems: 2,
      remainingItems: 0,
      verified: true
    }))
  } satisfies PrivacyDataServiceDependencies;
}

describe("PrivacyDataService", () => {
  it("does not touch data until an explicit delete call is made", () => {
    const userDataPath = createTempDirectory("construction");
    const savePath = path.join(userDataPath, "play-zone-saves", "save.json");
    fs.mkdirSync(path.dirname(savePath), { recursive: true });
    fs.writeFileSync(savePath, "private", "utf8");

    new PrivacyDataService(createDependencies(userDataPath));

    expect(fs.readFileSync(savePath, "utf8")).toBe("private");
  });

  it("requires the exact destructive confirmation before invoking dependencies", async () => {
    const userDataPath = createTempDirectory("confirmation");
    const dependencies = createDependencies(userDataPath);
    const service = new PrivacyDataService(dependencies);

    await expect(
      service.deleteData({ target: "learning_data", confirmation: "yes" })
    ).rejects.toThrow(/confirmation/i);
    await expect(
      service.deleteData({ target: "all_local_data", confirmation: PRIVACY_LEARNING_DATA_CONFIRMATION })
    ).rejects.toThrow(/confirmation/i);
    expect(dependencies.database.deleteAllLearningData).not.toHaveBeenCalled();
    expect(dependencies.secureSettings.clear).not.toHaveBeenCalled();
  });

  it("clears secrets, sessions, learning rows, and app-managed remnants for a full delete", async () => {
    const userDataPath = createTempDirectory("full");
    const privateFiles = [
      path.join("play-zone-saves", "pack.json"),
      path.join("play-zone-saves", "backups", "pack", "backup.json"),
      path.join("play-zone-installed", "pack", "snapshot.json"),
      path.join("play-zone-archives", "pack.zip"),
      path.join("play-zone-downloads", "official-pack.part"),
      path.join("backups", "safety.lembackup"),
      path.join("desktop-ocr", "capture.png"),
      path.join("tts-cache", "voice.wav"),
      path.join("local-mt-models", "model.onnx"),
      "translation-debug.log",
      path.join("listening-transcripts", "transcript.json"),
      path.join("media", "listening-card-clips", "clip.wav"),
      path.join("video-reader", "state.json"),
      path.join("card-sync-state", "last-sync.json"),
      "app-onboarding-state.json",
      ".local-english-miner.sqlite.1234.11111111-1111-4111-8111-111111111111.tmp",
      "local-english-miner.sqlite.bak.1234.tmp"
    ];
    for (const relativePath of privateFiles) {
      const filePath = path.join(userDataPath, relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, `private:${relativePath}`, "utf8");
    }
    const dependencies = createDependencies(userDataPath);
    const service = new PrivacyDataService(dependencies);

    const result = await service.deleteData({
      target: "all_local_data",
      confirmation: PRIVACY_ALL_LOCAL_DATA_CONFIRMATION
    });

    expect(result.ok).toBe(false);
    expect(result.phase).toBe("pending");
    expect(result.operations).toEqual({
      apiKeys: "cleared",
      webReaderLogin: "cleared",
      electronCache: "cleared",
      learningDatabase: "cleared",
      managedFiles: "cleared",
      rendererStorage: "pending",
      extensionQueue: "pending"
    });
    expect(result.counts).toMatchObject({
      apiKeys: 2,
      webReaderCookies: 3,
      cacheSessions: 2,
      databaseRows: 4,
      files: privateFiles.length
    });
    expect(result.counts.bytes).toBeGreaterThan(0);
    expect(result.rendererResetRequired).toBe(true);
    expect(result.extensionQueueManualClearRequired).toBe(true);
    expect(result.restartRecommended).toBe(true);
    expect(dependencies.database.deleteAllLearningData).toHaveBeenCalledOnce();
    expect(dependencies.secureSettings.clear).toHaveBeenCalledOnce();
    for (const relativePath of privateFiles) {
      expect(fs.existsSync(path.join(userDataPath, relativePath))).toBe(false);
    }
  });

  it("resets persisted onboarding only for a full local-data delete", async () => {
    const userDataPath = createTempDirectory("onboarding-reset");
    const onboardingState = new AppOnboardingStateStore(userDataPath);
    onboardingState.markCompleted();

    await new PrivacyDataService(createDependencies(userDataPath)).deleteData({
      target: "learning_data",
      confirmation: PRIVACY_LEARNING_DATA_CONFIRMATION
    });

    expect(onboardingState.isCompleted()).toBe(true);

    const result = await new PrivacyDataService(createDependencies(userDataPath)).deleteData({
      target: "all_local_data",
      confirmation: PRIVACY_ALL_LOCAL_DATA_CONFIRMATION
    });

    expect(result.verification.managedPathEntriesRemaining).toBe(0);
    expect(onboardingState.isCompleted()).toBe(false);
    expect(new AppOnboardingStateStore(userDataPath).isCompleted()).toBe(false);
    expect(fs.existsSync(path.join(userDataPath, "app-onboarding-state.json"))).toBe(false);
  });

  it("does not report success when post-delete verification finds a residual", async () => {
    const userDataPath = createTempDirectory("residual");
    const dependencies = createDependencies(userDataPath);
    dependencies.database.verifyPrivacyDeletion.mockReturnValue({
      remainingRows: 1,
      freelistPages: 2,
      integrityOk: true,
      durableCopiesVerified: false
    });
    dependencies.secureSettings.verifyCleared.mockReturnValue({
      verified: false,
      remainingKeys: 1,
      remainingFiles: 0
    });
    dependencies.clearWebReaderLoginData.mockResolvedValue({
      removedItems: 2,
      remainingItems: 1,
      verified: false
    });

    const result = await new PrivacyDataService(dependencies).deleteData({
      target: "all_local_data",
      confirmation: PRIVACY_ALL_LOCAL_DATA_CONFIRMATION
    });

    expect(result.ok).toBe(false);
    expect(result.operations).toMatchObject({
      apiKeys: "failed",
      webReaderLogin: "failed",
      learningDatabase: "failed"
    });
    expect(result.verification).toMatchObject({
      secureSettingsRemaining: 1,
      webReaderCookiesRemaining: 1,
      database: { remainingRows: 1, freelistPages: 2, durableCopiesVerified: false }
    });
  });

  it("waits for active managed-file writers to settle before deleting and verifying", async () => {
    const userDataPath = createTempDirectory("active-writer-race");
    const lateDownloadPath = path.join(
      userDataPath,
      "play-zone-downloads",
      "official-pack.part"
    );
    const dependencies = createDependencies(userDataPath);
    let finishWriter!: () => void;
    const writerSettled = new Promise<void>((resolve) => {
      finishWriter = () => {
        fs.mkdirSync(path.dirname(lateDownloadPath), { recursive: true });
        fs.writeFileSync(lateDownloadPath, "late download bytes", "utf8");
        resolve();
      };
    });
    dependencies.quiesceManagedFileWriters.mockImplementation(async () => {
      queueMicrotask(finishWriter);
      await writerSettled;
    });

    const result = await new PrivacyDataService(dependencies).deleteData({
      target: "learning_data",
      confirmation: PRIVACY_LEARNING_DATA_CONFIRMATION
    });

    expect(dependencies.quiesceManagedFileWriters).toHaveBeenCalledOnce();
    expect(result.verification.managedPathEntriesRemaining).toBe(0);
    expect(fs.existsSync(lateDownloadPath)).toBe(false);
    await writerSettled;
    expect(fs.existsSync(lateDownloadPath)).toBe(false);
  });

  it("quiesces writers before deleting or verifying the learning database", async () => {
    const userDataPath = createTempDirectory("quiesce-order");
    const dependencies = createDependencies(userDataPath);
    const order: string[] = [];
    let releaseQuiesce!: () => void;
    const quiesceReleased = new Promise<void>((resolve) => {
      releaseQuiesce = resolve;
    });
    dependencies.quiesceManagedFileWriters.mockImplementation(async () => {
      order.push("quiesce-start");
      await quiesceReleased;
      order.push("quiesce-settled");
    });
    dependencies.database.deleteAllLearningData.mockImplementation(() => {
      order.push("database-delete");
      return emptyDatabaseCounts(4);
    });
    dependencies.database.verifyPrivacyDeletion.mockImplementation(() => {
      order.push("database-verify");
      return {
        remainingRows: 0,
        freelistPages: 0,
        integrityOk: true,
        durableCopiesVerified: true
      };
    });

    const deletion = new PrivacyDataService(dependencies).deleteData({
      target: "learning_data",
      confirmation: PRIVACY_LEARNING_DATA_CONFIRMATION
    });
    await Promise.resolve();
    expect(order).toEqual(["quiesce-start"]);
    expect(dependencies.database.deleteAllLearningData).not.toHaveBeenCalled();

    releaseQuiesce();
    await deletion;
    expect(order).toEqual([
      "quiesce-start",
      "quiesce-settled",
      "database-delete",
      "database-verify"
    ]);
  });

  it("fails closed without deleting database or files when writer quiescence fails", async () => {
    const userDataPath = createTempDirectory("quiesce-failure");
    const managedPath = path.join(userDataPath, "listening-transcripts", "late.vtt");
    fs.mkdirSync(path.dirname(managedPath), { recursive: true });
    fs.writeFileSync(managedPath, "private", "utf8");
    const dependencies = createDependencies(userDataPath);
    dependencies.quiesceManagedFileWriters.mockRejectedValue(new Error("writer did not stop"));

    const result = await new PrivacyDataService(dependencies).deleteData({
      target: "learning_data",
      confirmation: PRIVACY_LEARNING_DATA_CONFIRMATION
    });

    expect(result.operations.learningDatabase).toBe("failed");
    expect(result.operations.managedFiles).toBe("failed");
    expect(dependencies.database.deleteAllLearningData).not.toHaveBeenCalled();
    expect(dependencies.database.verifyPrivacyDeletion).not.toHaveBeenCalled();
    expect(fs.existsSync(managedPath)).toBe(true);
  });

  it("precisely clears a recognized legacy Language Miner root without deleting generic Electron data", async () => {
    const userDataPath = createTempDirectory("legacy-current");
    const legacyUserDataPath = createTempDirectory("legacy-electron");
    const legacyFiles = [
      "local-english-miner.sqlite",
      "local-english-miner.sqlite.bak",
      "local-english-miner.sqlite-wal",
      path.join("play-zone-saves", "pack", "save.json"),
      path.join("listening-transcripts", "active", "result.vtt"),
      path.join("media", "listening-card-clips", "card", "audio.m4a"),
      "translation-debug.log"
    ];
    for (const relativePath of legacyFiles) {
      const filePath = path.join(legacyUserDataPath, relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, `legacy:${relativePath}`, "utf8");
    }
    const unrelatedFiles = [
      "unrelated-electron-app.json",
      path.join("logs", "other-app.log"),
      path.join("crash-reports", "other-app.dmp")
    ];
    for (const relativePath of unrelatedFiles) {
      const filePath = path.join(legacyUserDataPath, relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "keep", "utf8");
    }
    const dependencies = createDependencies(userDataPath);
    dependencies.legacyUserDataPath = legacyUserDataPath;

    const result = await new PrivacyDataService(dependencies).deleteData({
      target: "learning_data",
      confirmation: PRIVACY_LEARNING_DATA_CONFIRMATION
    });

    expect(result.verification.managedPathEntriesRemaining).toBe(0);
    for (const relativePath of legacyFiles) {
      expect(fs.existsSync(path.join(legacyUserDataPath, relativePath))).toBe(false);
    }
    for (const relativePath of unrelatedFiles) {
      expect(fs.readFileSync(path.join(legacyUserDataPath, relativePath), "utf8")).toBe("keep");
    }
    expect(fs.existsSync(legacyUserDataPath)).toBe(true);
  });

  it("fails closed when a supplied legacy root is a symbolic link", async () => {
    const userDataPath = createTempDirectory("legacy-link-current");
    const legacyTarget = createTempDirectory("legacy-link-target");
    fs.writeFileSync(path.join(legacyTarget, "local-english-miner.sqlite"), "private", "utf8");
    const legacyLink = path.join(createTempDirectory("legacy-link-parent"), "Electron");
    fs.symlinkSync(legacyTarget, legacyLink, "junction");
    const dependencies = createDependencies(userDataPath);
    dependencies.legacyUserDataPath = legacyLink;

    const result = await new PrivacyDataService(dependencies).deleteData({
      target: "learning_data",
      confirmation: PRIVACY_LEARNING_DATA_CONFIRMATION
    });

    expect(result.operations.managedFiles).toBe("partial");
    expect(result.warnings).toContainEqual({
      code: "unsafe_path_skipped",
      area: "managedFiles"
    });
    expect(fs.readFileSync(path.join(legacyTarget, "local-english-miner.sqlite"), "utf8")).toBe(
      "private"
    );
  });

  it("rejects symbolic links without traversing or deleting their targets", async () => {
    const userDataPath = createTempDirectory("symlink-root");
    const externalPath = createTempDirectory("symlink-target");
    const externalFile = path.join(externalPath, "keep.txt");
    fs.writeFileSync(externalFile, "keep me", "utf8");
    const installedRoot = path.join(userDataPath, "play-zone-installed");
    fs.mkdirSync(installedRoot, { recursive: true });
    fs.symlinkSync(externalPath, path.join(installedRoot, "external"), "junction");
    const dependencies = createDependencies(userDataPath);
    const service = new PrivacyDataService(dependencies);

    const result = await service.deleteData({
      target: "learning_data",
      confirmation: PRIVACY_LEARNING_DATA_CONFIRMATION
    });

    expect(result.ok).toBe(false);
    expect(result.operations.managedFiles).toBe("partial");
    expect(result.warnings).toContainEqual({
      code: "symbolic_link_skipped",
      area: "managedFiles"
    });
    expect(fs.readFileSync(externalFile, "utf8")).toBe("keep me");
  });

  it("runs only the requested granular operation", async () => {
    const userDataPath = createTempDirectory("granular");
    const savePath = path.join(userDataPath, "play-zone-saves", "save.json");
    fs.mkdirSync(path.dirname(savePath), { recursive: true });
    fs.writeFileSync(savePath, "private", "utf8");
    const dependencies = createDependencies(userDataPath);
    const service = new PrivacyDataService(dependencies);

    const result = await service.deleteData({ target: "electron_cache" });

    expect(result.ok).toBe(true);
    expect(result.operations.electronCache).toBe("cleared");
    expect(result.operations.learningDatabase).toBe("not_requested");
    expect(dependencies.clearElectronCaches).toHaveBeenCalledOnce();
    expect(dependencies.database.deleteAllLearningData).not.toHaveBeenCalled();
    expect(dependencies.secureSettings.clear).not.toHaveBeenCalled();
    expect(fs.existsSync(savePath)).toBe(true);
  });
});
