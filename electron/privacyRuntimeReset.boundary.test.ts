import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const mainSource = fs.readFileSync(path.join(process.cwd(), "electron", "main.ts"), "utf8");

function getIpcHandlerSource(channel: string) {
  const channelIndex = mainSource.indexOf(`"${channel}"`);
  const handlerStart = mainSource.lastIndexOf("ipcMain.handle(", channelIndex);
  const handlerEnd = mainSource.indexOf("ipcMain.handle(", channelIndex + channel.length + 2);
  return {
    handlerStart,
    handler: mainSource.slice(
      handlerStart,
      handlerEnd > handlerStart ? handlerEnd : mainSource.length
    )
  };
}

describe("privacy deletion runtime reset boundary", () => {
  it("stops in-memory writers before deleting persisted learning data", () => {
    const handlerStart = mainSource.indexOf('ipcMain.handle("privacy:deleteData"');
    const handlerEnd = mainSource.indexOf('ipcMain.handle("playZone:openRuntimeWindow"', handlerStart);
    const handler = mainSource.slice(handlerStart, handlerEnd);
    expect(handlerStart).toBeGreaterThan(-1);
    expect(handler.indexOf("prepareRuntimeForPrivacyDeletion")).toBeGreaterThan(-1);
    expect(handler.indexOf("prepareRuntimeForPrivacyDeletion")).toBeLessThan(
      handler.indexOf("privacyDataService.deleteData")
    );
    expect(handler).toContain("privacyManagedDataWriters.blockNewWrites()");
    expect(handler).toContain("quiescePrivacyManagedDataWritersForDeletion");
    expect(handler.indexOf("privacyManagedDataWriters.blockNewWrites()")).toBeLessThan(
      handler.indexOf("privacyDataService.deleteData")
    );
    expect(handler).toContain('finalizedPending.phase === "pending"');
    expect(handler).toContain("privacyDeletionCoordinator.discardForRetry");
  });

  it("aborts every active official game download and waits for cleanup before file deletion", () => {
    const helperStart = mainSource.indexOf(
      "async function cancelOfficialPlayZoneDownloadsForPrivacyDeletion"
    );
    const helperEnd = mainSource.indexOf(
      "function prepareRuntimeForPrivacyDeletion",
      helperStart
    );
    const helper = mainSource.slice(helperStart, helperEnd);

    expect(helperStart).toBeGreaterThan(-1);
    expect(helper).toContain("active.controller.abort");
    expect(helper).toContain("await Promise.all(activeDownloads.map((active) => active.settled))");
    expect(helper).toContain("deletionBlock.drain({ timeoutMs: 30_000 })");
    expect(mainSource).toContain("privacyManagedFileDeletionInProgress");
    expect(mainSource).toContain("isPrivacyDeletionBlockingPlayZoneWrites()");
  });

  it("routes every PlayZone managed-file writer IPC through the common deletion gate", () => {
    const writerChannels = [
      "backups:export",
      "backups:previewImport",
      "backups:restore",
      "backups:rollbackRestore",
      "playZone:openRuntimeWindow",
      "playZone:pickPackFile",
      "playZone:listInstalledPacks",
      "playZone:installOfficialPack",
      "playZone:installPack",
      "playZone:scanPackFile",
      "playZone:pickLibraryFolder",
      "playZone:scanLibraryFolder",
      "playZone:loadSave",
      "playZone:writeSave",
      "playZone:clearSave",
      "playZone:backupSave"
    ];

    for (const channel of writerChannels) {
      const { handlerStart, handler } = getIpcHandlerSource(channel);
      expect(handlerStart, `${channel} handler`).toBeGreaterThan(-1);
      expect(handler, `${channel} writer gate`).toContain("runPlayZoneManagedFileWrite");
    }
  });

  it("routes database, listening, OCR, sync, local-model, and TTS writers through the privacy gate", () => {
    const writerChannels = [
      "app:completeOnboarding",
      "profiles:deleteData",
      "desktopCapture:startOcrCapture",
      "desktopCapture:finishOcrSelection",
      "desktopCapture:createInputCard",
      "cards:save",
      "cards:delete",
      "cards:review",
      "wallet:spend",
      "missions:recordEvent",
      "missions:claimReward",
      "missions:claimDailyBonus",
      "cardSync:connect",
      "cardSync:disconnect",
      "cardSync:upload",
      "cardSync:download",
      "cardSync:sync",
      "lifeLogs:save",
      "lifeLogs:markProcessed",
      "lifeLogs:delete",
      "listening:saveVideoCandidate",
      "listening:markVideoCandidatesLearned",
      "listening:fetchRssCandidates",
      "listening:refreshVideoCandidateMetadata",
      "listening:saveTranscript",
      "listening:pickLocalVideoFile",
      "listening:prepareLocalVideoFile",
      "listening:createListeningCardMediaClip",
      "listening:extractLocalEmbeddedSubtitle",
      "listening:generateTranscript",
      "listening:generateLocalTranscript",
      "documents:saveExportRecord",
      "translations:saveCached",
      "translations:testConnection",
      "tts:synthesize"
    ];

    for (const channel of writerChannels) {
      const { handlerStart, handler } = getIpcHandlerSource(channel);
      expect(handlerStart, `${channel} handler`).toBeGreaterThan(-1);
      expect(handler, `${channel} privacy writer gate`).toMatch(
        /run(?:Abortable)?PrivacyManagedDataWrite/
      );
    }

    const translationJobStart = mainSource.indexOf("async function runTranslationIpcJob");
    const translationJobEnd = mainSource.indexOf("function startLifeMinerBridge", translationJobStart);
    const translationJob = mainSource.slice(translationJobStart, translationJobEnd);
    expect(translationJob).toContain("runPrivacyManagedDataWrite");
    expect(translationJob).toContain("cancel: () => abortActiveJob?.()");
  });

  it("blocks stale secure-setting and bridge writes while API-key deletion is pending", () => {
    for (const channel of [
      "secureSettings:set",
      "secureSettings:migrateLegacy",
      "app:setBridgeSettings"
    ]) {
      const { handlerStart, handler } = getIpcHandlerSource(channel);
      expect(handlerStart, `${channel} handler`).toBeGreaterThan(-1);
      expect(handler, `${channel} secure-setting deletion gate`).toContain(
        "assertPrivacyDeletionAllowsSecureSettingsWrites"
      );
    }
    expect(mainSource).toContain("privacySecureSettingsDeletionInProgress");
    expect(mainSource).toContain('pending.target === "api_keys"');
  });

  it("uses side-effect-free deletion status peeks inside writer gates", () => {
    const gateStart = mainSource.indexOf("function isPrivacyDeletionBlockingManagedDataWrites");
    const gateEnd = mainSource.indexOf("function prepareRuntimeForPrivacyDeletion", gateStart);
    const gates = mainSource.slice(gateStart, gateEnd);
    expect(gates).toContain("privacyDeletionCoordinator.peekPendingStatus()");
    expect(gates).not.toContain("privacyDeletionCoordinator.getPendingStatus()");
  });

  it("closes OCR and Web Reader surfaces and blocks Web Reader navigation during deletion", () => {
    const helperStart = mainSource.indexOf("function prepareRuntimeForPrivacyDeletion");
    const helperEnd = mainSource.indexOf("function finalizePrivacyDeletionIfVerified", helperStart);
    const helper = mainSource.slice(helperStart, helperEnd);
    expect(helper).toContain("closeDesktopOcrWindowsForPrivacyDeletion()");
    expect(mainSource).toContain("await destroyWebReaderViewForPrivacyDeletion()");
    for (const channel of [
      "webReader:attach",
      "webReader:setVisible",
      "webReader:loadUrl",
      "webReader:goBack",
      "webReader:goForward",
      "webReader:reload"
    ]) {
      const { handlerStart, handler } = getIpcHandlerSource(channel);
      expect(handlerStart, `${channel} handler`).toBeGreaterThan(-1);
      expect(handler, `${channel} privacy navigation gate`).toContain(
        "assertPrivacyDeletionAllowsWebReaderSession"
      );
    }
  });

  it("clears PlayZone runtime session storage and disables quit-time card sync", () => {
    const cacheStart = mainSource.indexOf(
      "async function clearPlayZoneRuntimeStorageForPrivacyDeletion"
    );
    const cacheEnd = mainSource.indexOf(
      "function closePlayZoneRuntimeWindowsForPrivacyDeletion",
      cacheStart
    );
    const cache = mainSource.slice(cacheStart, cacheEnd);
    expect(cache).toContain("PLAY_ZONE_RUNTIME_PARTITION");
    expect(cache).toContain('"localstorage"');
    expect(cache).toContain('"indexdb"');
    const quiesceStart = mainSource.indexOf(
      "async function quiesceAndClearPlayZoneRuntimeForPrivacyDeletion"
    );
    const quiesceEnd = mainSource.indexOf(
      "function capturePrivacyManagedDataWriteIntent",
      quiesceStart
    );
    const quiesce = mainSource.slice(quiesceStart, quiesceEnd);
    expect(quiesce).toContain("quiescePrivacyManagedDataWritersForDeletion");
    expect(quiesce).toContain("closePlayZoneRuntimeWindowsForPrivacyDeletion");
    expect(quiesce).toContain("clearPlayZoneRuntimeStorageForPrivacyDeletion");

    const electronCacheStart = mainSource.indexOf("async function clearElectronCaches");
    const electronCacheEnd = mainSource.indexOf(
      "async function clearPlayZoneRuntimeStorageForPrivacyDeletion",
      electronCacheStart
    );
    const electronCache = mainSource.slice(electronCacheStart, electronCacheEnd);
    expect(electronCache).not.toContain('"localstorage"');
    expect(electronCache).not.toContain('"indexdb"');

    const syncStart = mainSource.indexOf("function syncCardsBeforeQuit");
    const syncEnd = mainSource.indexOf("async function createAndSaveDesktopOcrInputCard", syncStart);
    expect(mainSource.slice(syncStart, syncEnd)).toContain(
      "isPrivacyDeletionBlockingManagedDataWrites()"
    );
  });

  it("skips optional extension verification only when the extension has never paired", () => {
    const helperStart = mainSource.indexOf("function preparePrivacyResultForOptionalExtension");
    const helperEnd = mainSource.indexOf("function ensureDatabase", helperStart);
    const helper = mainSource.slice(helperStart, helperEnd);
    expect(helperStart).toBeGreaterThan(-1);
    expect(helper).toContain("lifeMinerBridgePairing.hasPairedHistory()");
    expect(helper).toContain('extensionQueue: "not_requested"');
    expect(helper).toContain("extensionQueueManualClearRequired: false");
  });

  it("finalizes a ready deletion from the extension acknowledgement path", () => {
    const routeStart = mainSource.indexOf('requestUrl.pathname === "/privacy/queue-clear-ack"');
    const routeEnd = mainSource.indexOf('requestUrl.pathname === "/life-logs"', routeStart);
    const route = mainSource.slice(routeStart, routeEnd);
    expect(routeStart).toBeGreaterThan(-1);
    expect(route).toContain("privacyDeletionCoordinator.peekPendingStatus()");
    expect(route).toContain("finalizePrivacyDeletionIfVerified(pending)");
  });

  it("publishes an exact durable barrier release and accepts an idempotent release ACK", () => {
    const settingsStart = mainSource.indexOf(
      'request.method === "GET" && requestUrl.pathname === "/settings"'
    );
    const settingsEnd = mainSource.indexOf('if (request.method !== "POST")', settingsStart);
    const settingsRoute = mainSource.slice(settingsStart, settingsEnd);
    expect(settingsRoute).toContain("extensionQueueBarrierReleaseRequestId");
    expect(settingsRoute).toContain("lifeMinerBridgeControlStore.getBarrierReleaseRequestId()");

    const ackStart = mainSource.indexOf(
      'requestUrl.pathname === "/privacy/queue-barrier-release-ack"'
    );
    const ackEnd = mainSource.indexOf(
      'requestUrl.pathname === "/privacy/queue-clear-ack"',
      ackStart
    );
    const ackRoute = mainSource.slice(ackStart, ackEnd);
    expect(ackRoute).toContain("lifeMinerBridgeControlStore.acknowledgeBarrierRelease(requestId)");
    expect(ackRoute).toContain("accepted ? 200 : 409");
  });

  it("keeps bridge credentials stable until the renderer acknowledges a terminal deletion", () => {
    for (const channel of ["lifeMinerBridge:rotateToken", "lifeMinerBridge:revoke"]) {
      const { handler } = getIpcHandlerSource(channel);
      expect(handler).toContain("assertPrivacyDeletionAllowsBridgeCredentialsMutation");
    }
    const acknowledgementStart = mainSource.indexOf(
      'ipcMain.handle("privacy:acknowledgeDeleteResult"'
    );
    const acknowledgementEnd = mainSource.indexOf(
      'ipcMain.handle("playZone:openRuntimeWindow"',
      acknowledgementStart
    );
    const acknowledgement = mainSource.slice(acknowledgementStart, acknowledgementEnd);
    expect(acknowledgement).toContain("privacyDeletionCoordinator.acknowledgeTerminal");
    expect(acknowledgement).toContain("finalizePrivacyDeletionIfVerified");
    const guardStart = mainSource.indexOf(
      "function assertPrivacyDeletionAllowsBridgeCredentialsMutation"
    );
    const guardEnd = mainSource.indexOf(
      "function assertPrivacyDeletionAllowsWebReaderSession",
      guardStart
    );
    const guard = mainSource.slice(guardStart, guardEnd);
    expect(guard).toContain("privacyManagedFileDeletionInProgress");
    expect(guard).toContain("privacyDeletionCoordinator.peekPendingStatus()");
  });

  it("forgets an uninstalled extension only through the typed, deletion-gated IPC", () => {
    const { handler: forgetHandler } = getIpcHandlerSource(
      "lifeMinerBridge:forgetUninstalledExtension"
    );
    expect(forgetHandler).toContain("assertMainWindowIpcSender");
    expect(forgetHandler).toContain("assertPrivacyDeletionAllowsBridgeCredentialsMutation");
    expect(forgetHandler).toContain("assertLifeMinerBridgeForgetConfirmation");
    expect(forgetHandler).toContain("lifeMinerBridgePairing.revoke()");
    expect(forgetHandler).toContain(
      "lifeMinerBridgeControlStore.forgetPairingHistoryAndReleaseProofs()"
    );
    expect(forgetHandler.indexOf("lifeMinerBridgePairing.revoke()"))
      .toBeLessThan(forgetHandler.indexOf("forgetPairingHistoryAndReleaseProofs"));

    const { handler: ordinaryRevokeHandler } = getIpcHandlerSource("lifeMinerBridge:revoke");
    expect(ordinaryRevokeHandler).not.toContain("forgetPairingHistoryAndReleaseProofs");

    const guardStart = mainSource.indexOf(
      "function assertPrivacyDeletionAllowsBridgeCredentialsMutation"
    );
    const guardEnd = mainSource.indexOf(
      "function assertLifeMinerBridgeForgetConfirmation",
      guardStart
    );
    const guard = mainSource.slice(guardStart, guardEnd);
    expect(guard).toContain("privacyManagedFileDeletionInProgress");
    expect(guard).toContain("privacySecureSettingsDeletionInProgress");
    expect(guard).toContain("privacyWebReaderDeletionInProgress");
    expect(guard).toContain("privacyDeletionCoordinator.peekPendingStatus()");
    expect(mainSource).toContain('"확장 프로그램을 제거했습니다"');
    expect(mainSource).toContain('"I UNINSTALLED THE EXTENSION"');
  });

  it("drops backup snapshots, active translations, runtime keys, and sync paths", () => {
    const helperStart = mainSource.indexOf("function prepareRuntimeForPrivacyDeletion");
    const helperEnd = mainSource.indexOf("function finalizePrivacyDeletionIfVerified", helperStart);
    const helper = mainSource.slice(helperStart, helperEnd);
    expect(helper).toContain("translationJobRegistry.cancelAll(senderId)");
    expect(helper).toContain("appBackupPreviewStore.clear()");
    expect(helper).toContain("appBackupRollbackStore.clear()");
    expect(helper).toContain('providerName: "mock"');
    expect(helper).toContain('geminiApiKey: ""');
    expect(helper).toContain('cardSyncFolderPath: ""');
  });

  it("revokes extension pairing only after full deletion is verified", () => {
    const helperStart = mainSource.indexOf("function finalizePrivacyDeletionIfVerified");
    const helper = mainSource.slice(helperStart, mainSource.indexOf("function ensureDatabase", helperStart));
    expect(helper).toContain('result.target === "all_local_data"');
    expect(helper).toContain("result.ok");
    expect(helper).toContain("lifeMinerBridgePairing.revoke()");
    expect(helper).toContain('result.target === "learning_data"');
    expect(helper).toContain("lifeMinerBridgePairing.rotateToken()");
  });

  it("finalizes a restored deletion when the pending status becomes verified", () => {
    const handlerStart = mainSource.indexOf(
      'ipcMain.handle("privacy:getPendingDeleteStatus"'
    );
    const handlerEnd = mainSource.indexOf(
      'ipcMain.handle("playZone:openRuntimeWindow"',
      handlerStart
    );
    const handler = mainSource.slice(handlerStart, handlerEnd);
    expect(handlerStart).toBeGreaterThan(-1);
    expect(handler).toContain("privacyDeletionCoordinator.getPendingStatus()");
    expect(handler).toContain("finalizePrivacyDeletionIfVerified(pending)");
  });

  it("clears current and recognized legacy key stores only through explicit privacy deletion", () => {
    const handlerStart = mainSource.indexOf('ipcMain.handle("privacy:deleteData"');
    const handlerEnd = mainSource.indexOf(
      'ipcMain.handle("playZone:openRuntimeWindow"',
      handlerStart
    );
    const handler = mainSource.slice(handlerStart, handlerEnd);
    expect(handler).toContain("secureSettings: createPrivacySecureSettingsScope()");
    expect(handler).toContain(
      "legacyUserDataPath: findPackagedLegacyDevelopmentUserDataPath()"
    );
    expect(mainSource).toContain("new SecureSettingsPrivacyScope(vaults)");
    expect(mainSource).toContain("if (!app.isPackaged || process.env.LM_QA_USER_DATA_DIR) return null");

    const migrationStart = mainSource.indexOf(
      "async function migrateLegacyDevelopmentSecureSettings"
    );
    const migrationEnd = mainSource.indexOf(
      "function requestLegacySecureSettingsFromHelper",
      migrationStart
    );
    const migration = mainSource.slice(migrationStart, migrationEnd);
    expect(migration).toContain("findPackagedLegacyDevelopmentUserDataPath()");
    expect(migration).not.toContain(".clear()");
  });
});
