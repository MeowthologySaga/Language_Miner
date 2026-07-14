import { describe, expect, it } from "vitest";
import type { PrivacyDataDeleteResult } from "../src/shared/privacyData";
import { ExtensionQueueClearCoordinator } from "./extensionQueueClearCoordinator";
import { PrivacyDeletionCoordinator } from "./privacyDeletionCoordinator";

const OPERATION_ID = "123e4567-e89b-42d3-a456-426614174001";
const EXTENSION_ID = "123e4567-e89b-42d3-a456-426614174002";

describe("PrivacyDeletionCoordinator", () => {
  it("does not report success before both renderer and extension verification", () => {
    const extension = new ExtensionQueueClearCoordinator(() => EXTENSION_ID, 60_000);
    const coordinator = new PrivacyDeletionCoordinator(extension, () => OPERATION_ID);
    const started = coordinator.begin(baseResult());
    expect(started).toMatchObject({ ok: false, phase: "pending" });
    expect(started.operations).toMatchObject({
      rendererStorage: "pending",
      extensionQueue: "pending"
    });

    const rendererComplete = coordinator.completeRendererCleanup(OPERATION_ID, {
      scope: "all",
      attemptedKeys: 3,
      removedKeys: 3,
      remainingKeys: 0,
      failedKeys: 0,
      verified: true
    });
    expect(rendererComplete).toMatchObject({ ok: false, phase: "pending" });
    expect(rendererComplete.operations.rendererStorage).toBe("cleared");

    expect(extension.acknowledge({
      requestId: EXTENSION_ID,
      removedItems: 2,
      remainingItems: 0
    })).toBe(true);
    expect(coordinator.getStatus(OPERATION_ID)).toMatchObject({
      ok: true,
      phase: "complete",
      operations: { rendererStorage: "cleared", extensionQueue: "cleared" },
      counts: { rendererStorageKeys: 3, extensionQueueItems: 2 }
    });
    expect(coordinator.peekPendingStatus()).toMatchObject({ ok: true, phase: "complete" });
    expect(coordinator.acknowledgeTerminal(OPERATION_ID)).toMatchObject({
      ok: true,
      phase: "complete"
    });
    expect(coordinator.peekPendingStatus()).toBeNull();
    expect(coordinator.getStatus(OPERATION_ID)).toMatchObject({ ok: true, phase: "complete" });
  });

  it("surfaces renderer failure and extension residuals", () => {
    const extension = new ExtensionQueueClearCoordinator(() => EXTENSION_ID, 60_000);
    const coordinator = new PrivacyDeletionCoordinator(extension, () => OPERATION_ID);
    coordinator.begin(baseResult());
    extension.acknowledge({
      requestId: EXTENSION_ID,
      removedItems: 1,
      remainingItems: 1
    });

    const result = coordinator.completeRendererCleanup(OPERATION_ID, {
      scope: "all",
      attemptedKeys: 2,
      removedKeys: 1,
      remainingKeys: 1,
      failedKeys: 1,
      verified: false
    });
    expect(result.ok).toBe(false);
    expect(result.phase).toBe("failed");
    expect(result.operations.rendererStorage).toBe("failed");
    expect(result.operations.extensionQueue).toBe("partial");
    expect(result.warnings).toEqual(expect.arrayContaining([
      { code: "renderer_storage_clear_failed", area: "rendererStorage" },
      { code: "extension_queue_verification_failed", area: "extensionQueue" }
    ]));
  });

  it("refuses a second destructive verification while one is pending", () => {
    const extension = new ExtensionQueueClearCoordinator(() => EXTENSION_ID, 60_000);
    const coordinator = new PrivacyDeletionCoordinator(extension, () => OPERATION_ID);
    coordinator.begin(baseResult());
    expect(() => coordinator.begin(baseResult())).toThrow(/already in progress/i);
  });

  it("restores an unfinished operation after restart and requires a fresh extension acknowledgement", () => {
    let persisted: unknown = null;
    const persistence = {
      load: () => persisted,
      save: (value: unknown) => {
        persisted = JSON.parse(JSON.stringify(value));
      },
      clear: () => {
        persisted = null;
      }
    };
    const beforeExtension = new ExtensionQueueClearCoordinator(() => EXTENSION_ID, 60_000);
    const beforeRestart = new PrivacyDeletionCoordinator(
      beforeExtension,
      () => OPERATION_ID,
      persistence
    );
    beforeRestart.begin(baseResult());
    beforeRestart.completeRendererCleanup(OPERATION_ID, {
      scope: "all",
      attemptedKeys: 2,
      removedKeys: 2,
      remainingKeys: 0,
      failedKeys: 0,
      verified: true
    });

    const afterExtension = new ExtensionQueueClearCoordinator(() => EXTENSION_ID, 60_000);
    const afterRestart = new PrivacyDeletionCoordinator(
      afterExtension,
      () => OPERATION_ID,
      persistence
    );
    expect(afterRestart.restore()).toBe(1);
    expect(afterRestart.getPendingStatus()).toMatchObject({
      ok: false,
      phase: "pending",
      operations: { rendererStorage: "cleared", extensionQueue: "pending" }
    });
    expect(afterExtension.getPendingCommand()).toEqual({ requestId: EXTENSION_ID });
    expect(afterExtension.acknowledge({
      requestId: EXTENSION_ID,
      removedItems: 0,
      remainingItems: 0
    })).toBe(true);
    afterRestart.noteExtensionStatusChanged();
    expect(afterRestart.getStatus(OPERATION_ID)).toMatchObject({ ok: true, phase: "complete" });
    expect(persisted).not.toBeNull();
    afterRestart.acknowledgeTerminal(OPERATION_ID);
    expect(persisted).toBeNull();
  });

  it("allows an explicitly re-confirmed deletion to replace a terminal failed verification", () => {
    let persisted: unknown = null;
    const persistence = {
      load: () => persisted,
      save: (value: unknown) => {
        persisted = JSON.parse(JSON.stringify(value));
      },
      clear: () => {
        persisted = null;
      }
    };
    const extension = new ExtensionQueueClearCoordinator(() => EXTENSION_ID, 60_000);
    const coordinator = new PrivacyDeletionCoordinator(extension, () => OPERATION_ID, persistence);
    const failedBase = baseResult();
    failedBase.operations.managedFiles = "failed";
    coordinator.begin(failedBase);
    coordinator.completeRendererCleanup(OPERATION_ID, {
      scope: "all",
      attemptedKeys: 0,
      removedKeys: 0,
      remainingKeys: 0,
      failedKeys: 0,
      verified: true
    });
    expect(extension.acknowledge({
      requestId: EXTENSION_ID,
      removedItems: 0,
      remainingItems: 0
    })).toBe(true);
    const failed = coordinator.getStatus(OPERATION_ID);
    expect(failed).toMatchObject({ ok: false, phase: "failed" });

    coordinator.discardForRetry(OPERATION_ID);
    expect(coordinator.getPendingStatus()).toBeNull();
    expect(persisted).toBeNull();
    expect(() => coordinator.begin(baseResult())).not.toThrow();
  });

  it("does not discard an operation while verification is still pending", () => {
    const extension = new ExtensionQueueClearCoordinator(() => EXTENSION_ID, 60_000);
    const coordinator = new PrivacyDeletionCoordinator(extension, () => OPERATION_ID);
    coordinator.begin(baseResult());
    expect(() => coordinator.discardForRetry(OPERATION_ID)).toThrow(/pending/i);
  });

  it("retains a ready result until the renderer explicitly acknowledges it", () => {
    const extension = new ExtensionQueueClearCoordinator(() => EXTENSION_ID, 60_000);
    const coordinator = new PrivacyDeletionCoordinator(extension, () => OPERATION_ID);
    coordinator.begin(baseResult());
    coordinator.completeRendererCleanup(OPERATION_ID, {
      scope: "all",
      attemptedKeys: 1,
      removedKeys: 1,
      remainingKeys: 0,
      failedKeys: 0,
      verified: true
    });
    expect(extension.acknowledge({
      requestId: EXTENSION_ID,
      removedItems: 0,
      remainingItems: 0
    })).toBe(true);
    coordinator.noteExtensionStatusChanged();

    expect(coordinator.peekPendingStatus()).toMatchObject({ ok: true, phase: "complete" });
    expect(coordinator.peekPendingStatus()).toMatchObject({ ok: true, phase: "complete" });
    expect(coordinator.getStatus(OPERATION_ID)).toMatchObject({ ok: true, phase: "complete" });
    expect(coordinator.peekPendingStatus()).toMatchObject({ ok: true, phase: "complete" });
    coordinator.acknowledgeTerminal(OPERATION_ID);
    expect(coordinator.peekPendingStatus()).toBeNull();
    expect(coordinator.acknowledgeTerminal(OPERATION_ID)).toMatchObject({
      ok: true,
      phase: "complete"
    });
  });

  it("does not wait for an optional extension queue when no extension is paired", () => {
    const extension = new ExtensionQueueClearCoordinator(() => EXTENSION_ID, 60_000);
    const coordinator = new PrivacyDeletionCoordinator(extension, () => OPERATION_ID);
    const withoutExtension = baseResult();
    withoutExtension.operations.extensionQueue = "not_requested";
    withoutExtension.extensionQueueManualClearRequired = false;

    const started = coordinator.begin(withoutExtension);
    expect(started.operations.extensionQueue).toBe("not_requested");
    expect(extension.getPendingCommand()).toBeNull();

    const completed = coordinator.completeRendererCleanup(OPERATION_ID, {
      scope: "all",
      attemptedKeys: 0,
      removedKeys: 0,
      remainingKeys: 0,
      failedKeys: 0,
      verified: true
    });
    expect(completed).toMatchObject({ ok: true, phase: "complete" });
    expect(coordinator.peekPendingStatus()).toMatchObject({ ok: true, phase: "complete" });
    coordinator.acknowledgeTerminal(OPERATION_ID);
    expect(coordinator.peekPendingStatus()).toBeNull();
  });

  it("does not acknowledge a terminal result while renderer cleanup still needs retry", () => {
    const extension = new ExtensionQueueClearCoordinator(() => EXTENSION_ID, 60_000);
    const coordinator = new PrivacyDeletionCoordinator(extension, () => OPERATION_ID);
    coordinator.begin(baseResult());
    extension.acknowledge({
      requestId: EXTENSION_ID,
      removedItems: 0,
      remainingItems: 0
    });
    coordinator.completeRendererCleanup(OPERATION_ID, {
      scope: "all",
      attemptedKeys: 1,
      removedKeys: 0,
      remainingKeys: 1,
      failedKeys: 1,
      verified: false
    });

    expect(() => coordinator.acknowledgeTerminal(OPERATION_ID)).toThrow(/not ready/i);
    expect(() => coordinator.discardForRetry(OPERATION_ID)).toThrow(/pending/i);
    expect(coordinator.peekPendingStatus()).toMatchObject({
      phase: "failed",
      rendererResetRequired: true
    });
  });

  it("does not wait for an extension timeout after a base deletion is already partial", () => {
    const extension = new ExtensionQueueClearCoordinator(() => EXTENSION_ID, 60_000);
    const coordinator = new PrivacyDeletionCoordinator(extension, () => OPERATION_ID);
    const partialBase = baseResult();
    partialBase.operations.managedFiles = "partial";

    expect(coordinator.begin(partialBase)).toMatchObject({
      phase: "partial",
      rendererResetRequired: true
    });
    const terminal = coordinator.completeRendererCleanup(OPERATION_ID, {
      scope: "all",
      attemptedKeys: 0,
      removedKeys: 0,
      remainingKeys: 0,
      failedKeys: 0,
      verified: true
    });
    expect(terminal).toMatchObject({
      phase: "partial",
      rendererResetRequired: false,
      operations: { managedFiles: "partial", extensionQueue: "pending" }
    });
    expect(coordinator.acknowledgeTerminal(OPERATION_ID)).toMatchObject({ phase: "partial" });
    expect(coordinator.peekPendingStatus()).toBeNull();
  });
});

function baseResult(): PrivacyDataDeleteResult {
  return {
    target: "all_local_data",
    ok: false,
    phase: "pending",
    completedAt: "2026-07-13T00:00:00.000Z",
    operations: {
      apiKeys: "cleared",
      webReaderLogin: "cleared",
      electronCache: "cleared",
      learningDatabase: "cleared",
      managedFiles: "cleared",
      rendererStorage: "pending",
      extensionQueue: "pending"
    },
    counts: {
      apiKeys: 2,
      webReaderCookies: 1,
      cacheSessions: 2,
      databaseRows: 4,
      files: 3,
      directories: 2,
      bytes: 100,
      rendererStorageKeys: 0,
      extensionQueueItems: 0
    },
    verification: {
      secureSettingsRemaining: 0,
      webReaderCookiesRemaining: 0,
      electronCacheBytesRemaining: 0,
      managedPathEntriesRemaining: 0
    },
    warnings: [],
    rendererResetRequired: true,
    extensionQueueManualClearRequired: true,
    restartRecommended: true
  };
}
