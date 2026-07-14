import { randomUUID } from "node:crypto";
import type {
  PrivacyDataDeleteResult,
  PrivacyDataOperationStatus,
  PrivacyDataWarning,
  PrivacyExtensionQueueClearStatus,
  PrivacyRendererCleanupReport,
  PrivacyRendererStorageScope
} from "../src/shared/privacyData";
import { ExtensionQueueClearCoordinator } from "./extensionQueueClearCoordinator";

type DeletionRecord = {
  baseResult: PrivacyDataDeleteResult;
  extensionRequestId: string;
  rendererScope: PrivacyRendererStorageScope;
  rendererReport?: PrivacyRendererCleanupReport;
};

type PersistedDeletionRecord = Omit<DeletionRecord, "extensionRequestId">;

export type PrivacyDeletionCoordinatorPersistence = {
  load(): unknown;
  save(value: { schemaVersion: 1; records: PersistedDeletionRecord[] }): void;
  clear(): void;
};

const OPERATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class PrivacyDeletionCoordinator {
  private readonly records = new Map<string, DeletionRecord>();
  private readonly acknowledgedResults = new Map<string, PrivacyDataDeleteResult>();

  constructor(
    private readonly extensionQueue: ExtensionQueueClearCoordinator,
    private readonly createOperationId: () => string = randomUUID,
    private readonly persistence?: PrivacyDeletionCoordinatorPersistence
  ) {}

  restore() {
    if (!this.persistence) return 0;
    const persisted = this.persistence.load();
    if (!persisted || typeof persisted !== "object") return 0;
    const candidate = persisted as { schemaVersion?: unknown; records?: unknown };
    if (candidate.schemaVersion !== 1 || !Array.isArray(candidate.records)) {
      this.persistence.clear();
      return 0;
    }
    this.records.clear();
    for (const value of candidate.records.slice(0, 1)) {
      const restored = normalizePersistedRecord(value);
      if (!restored) continue;
      let extensionRequestId = "";
      if (requiresExtensionQueueClear(restored.baseResult)) {
        const extensionStatus = this.extensionQueue.requestClear();
        if (extensionStatus.status !== "pending" && extensionStatus.status !== "incomplete") {
          continue;
        }
        extensionRequestId = extensionStatus.requestId;
      }
      this.records.set(restored.baseResult.operationId!, {
        ...restored,
        extensionRequestId
      });
    }
    if (this.records.size === 0) {
      this.persistence.clear();
      return 0;
    }
    this.persist();
    return this.records.size;
  }

  begin(result: PrivacyDataDeleteResult) {
    if (result.target !== "learning_data" && result.target !== "all_local_data") {
      return result;
    }
    if (this.records.size > 0) {
      throw new Error("A privacy deletion verification is already in progress.");
    }
    const operationId = this.createOperationId();
    if (!OPERATION_ID_PATTERN.test(operationId)) {
      throw new Error("Privacy deletion operation IDs must be UUID v4 values.");
    }
    let extensionRequestId = "";
    if (requiresExtensionQueueClear(result)) {
      const extensionStatus = this.extensionQueue.requestClear();
      if (extensionStatus.status !== "pending" && extensionStatus.status !== "incomplete") {
        throw new Error("The extension queue clear request could not be started.");
      }
      extensionRequestId = extensionStatus.requestId;
    }
    const record: DeletionRecord = {
      baseResult: { ...result, operationId },
      extensionRequestId,
      rendererScope: result.target === "all_local_data" ? "all" : "learning"
    };
    this.records.set(operationId, record);
    this.persist();
    return this.materializeAndPersist(record);
  }

  completeRendererCleanup(operationId: unknown, report: unknown) {
    const record = this.getRecord(operationId);
    record.rendererReport = normalizeRendererReport(report, record.rendererScope);
    this.persist();
    return this.materializeAndPersist(record);
  }

  getStatus(operationId: unknown) {
    const normalizedOperationId = normalizeOperationId(operationId);
    const acknowledged = this.acknowledgedResults.get(normalizedOperationId);
    if (acknowledged) return cloneDeleteResult(acknowledged);
    return this.materializeAndPersist(this.getRecord(normalizedOperationId));
  }

  getPendingStatus() {
    const record = this.records.values().next().value as DeletionRecord | undefined;
    return record ? this.materializeAndPersist(record) : null;
  }

  peekPendingStatus() {
    const record = this.records.values().next().value as DeletionRecord | undefined;
    return record ? this.materialize(record) : null;
  }

  discardForRetry(operationId: unknown) {
    const record = this.getRecord(operationId);
    const result = this.materialize(record);
    if (result.phase === "pending" || result.rendererResetRequired) {
      throw new Error("A pending privacy deletion verification cannot be discarded.");
    }
    this.records.delete(record.baseResult.operationId!);
    this.extensionQueue.clear();
    this.persist();
  }

  acknowledgeTerminal(operationId: unknown) {
    const normalizedOperationId = normalizeOperationId(operationId);
    const acknowledged = this.acknowledgedResults.get(normalizedOperationId);
    if (acknowledged) return cloneDeleteResult(acknowledged);

    const record = this.getRecord(normalizedOperationId);
    const result = this.materialize(record);
    if (result.phase === "pending" || result.rendererResetRequired) {
      throw new Error("Privacy deletion is not ready for renderer acknowledgement.");
    }
    this.records.delete(normalizedOperationId);
    this.extensionQueue.clear();
    this.rememberAcknowledgedResult(normalizedOperationId, result);
    this.persist();
    return cloneDeleteResult(result);
  }

  noteExtensionStatusChanged() {
    this.persist();
  }

  private getRecord(operationId: unknown) {
    const normalizedOperationId = normalizeOperationId(operationId);
    const record = this.records.get(normalizedOperationId);
    if (!record) {
      throw new Error("Privacy deletion verification is unavailable. Run the deletion again.");
    }
    return record;
  }

  private materialize(record: DeletionRecord): PrivacyDataDeleteResult {
    const result: PrivacyDataDeleteResult = {
      ...record.baseResult,
      operations: { ...record.baseResult.operations },
      counts: { ...record.baseResult.counts },
      verification: {
        ...record.baseResult.verification,
        database: record.baseResult.verification.database
          ? { ...record.baseResult.verification.database }
          : undefined
      },
      warnings: record.baseResult.warnings.filter(
        (warning) =>
          warning.code !== "extension_queue_verification_pending" &&
          warning.code !== "extension_queue_verification_failed" &&
          warning.code !== "renderer_storage_clear_failed"
      )
    };

    applyRendererStatus(result, record.rendererReport);
    if (record.extensionRequestId) {
      const extensionStatus = this.extensionQueue.getStatus(record.extensionRequestId);
      applyExtensionStatus(result, extensionStatus);
    }

    const requestedStatuses = Object.values(result.operations).filter(
      (status) => status !== "not_requested"
    );
    result.ok = requestedStatuses.every(isSuccessfulStatus);
    result.phase = result.ok
      ? "complete"
      : requestedStatuses.some((status) => status === "failed")
        ? "failed"
        : requestedStatuses.some((status) => status === "partial")
          ? "partial"
          : "pending";
    result.completedAt = new Date().toISOString();
    return result;
  }

  private materializeAndPersist(record: DeletionRecord) {
    const result = this.materialize(record);
    this.persist();
    return result;
  }

  private rememberAcknowledgedResult(operationId: string, result: PrivacyDataDeleteResult) {
    this.acknowledgedResults.delete(operationId);
    this.acknowledgedResults.set(operationId, cloneDeleteResult(result));
    while (this.acknowledgedResults.size > 32) {
      const oldest = this.acknowledgedResults.keys().next().value as string | undefined;
      if (!oldest) break;
      this.acknowledgedResults.delete(oldest);
    }
  }

  private persist() {
    if (!this.persistence) return;
    if (this.records.size === 0) {
      this.persistence.clear();
      return;
    }
    this.persistence.save({
      schemaVersion: 1,
      records: [...this.records.values()].map((record) => ({
        baseResult: record.baseResult,
        rendererScope: record.rendererScope,
        rendererReport: record.rendererReport
      }))
    });
  }
}

function normalizeOperationId(operationId: unknown) {
  if (typeof operationId !== "string" || !OPERATION_ID_PATTERN.test(operationId)) {
    throw new Error("Privacy deletion operation is invalid.");
  }
  return operationId;
}

function cloneDeleteResult(result: PrivacyDataDeleteResult): PrivacyDataDeleteResult {
  return {
    ...result,
    operations: { ...result.operations },
    counts: { ...result.counts },
    verification: {
      ...result.verification,
      database: result.verification.database ? { ...result.verification.database } : undefined
    },
    warnings: [...result.warnings],
    extensionQueueStatus: result.extensionQueueStatus
      ? { ...result.extensionQueueStatus }
      : undefined
  };
}

function normalizePersistedRecord(value: unknown): PersistedDeletionRecord | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<PersistedDeletionRecord>;
  const baseResult = candidate.baseResult;
  if (
    !baseResult ||
    (baseResult.target !== "learning_data" && baseResult.target !== "all_local_data") ||
    typeof baseResult.operationId !== "string" ||
    !OPERATION_ID_PATTERN.test(baseResult.operationId) ||
    candidate.rendererScope !== (baseResult.target === "all_local_data" ? "all" : "learning")
  ) {
    return null;
  }
  let rendererReport: PrivacyRendererCleanupReport | undefined;
  if (candidate.rendererReport !== undefined) {
    try {
      rendererReport = normalizeRendererReport(candidate.rendererReport, candidate.rendererScope);
    } catch {
      return null;
    }
  }
  const extensionRequired = requiresExtensionQueueClear(baseResult);
  return {
    baseResult: {
      ...baseResult,
      ok: false,
      phase: "pending",
      operations: {
        ...baseResult.operations,
        rendererStorage: rendererReport?.verified ? "cleared" : "pending",
        extensionQueue: extensionRequired
          ? "pending"
          : baseResult.operations.extensionQueue
      },
      warnings: Array.isArray(baseResult.warnings) ? [...baseResult.warnings] : [],
      rendererResetRequired: !rendererReport?.verified,
      extensionQueueManualClearRequired: extensionRequired
    },
    rendererScope: candidate.rendererScope,
    rendererReport
  };
}

function requiresExtensionQueueClear(result: PrivacyDataDeleteResult) {
  return (
    result.operations.extensionQueue === "pending" ||
    result.extensionQueueManualClearRequired
  );
}

function applyRendererStatus(
  result: PrivacyDataDeleteResult,
  report: PrivacyRendererCleanupReport | undefined
) {
  if (!report) {
    result.operations.rendererStorage = "pending";
    result.rendererResetRequired = true;
    return;
  }
  result.counts.rendererStorageKeys = report.removedKeys;
  result.rendererResetRequired = !report.verified;
  if (report.verified) {
    result.operations.rendererStorage = report.removedKeys > 0 ? "cleared" : "empty";
    return;
  }
  result.operations.rendererStorage = "failed";
  appendWarning(result.warnings, {
    code: "renderer_storage_clear_failed",
    area: "rendererStorage"
  });
}

function applyExtensionStatus(
  result: PrivacyDataDeleteResult,
  status: PrivacyExtensionQueueClearStatus
) {
  result.extensionQueueStatus = status;
  if (status.status === "cleared") {
    result.operations.extensionQueue = status.removedItems > 0 ? "cleared" : "empty";
    result.counts.extensionQueueItems = status.removedItems;
    result.extensionQueueManualClearRequired = false;
    return;
  }
  result.extensionQueueManualClearRequired = true;
  if (status.status === "pending") {
    result.operations.extensionQueue = "pending";
    appendWarning(result.warnings, {
      code: "extension_queue_verification_pending",
      area: "extensionQueue"
    });
    return;
  }
  if (status.status === "incomplete") {
    result.operations.extensionQueue = "partial";
    result.counts.extensionQueueItems = status.removedItems;
  } else {
    result.operations.extensionQueue = "failed";
  }
  appendWarning(result.warnings, {
    code: "extension_queue_verification_failed",
    area: "extensionQueue"
  });
}

function normalizeRendererReport(
  value: unknown,
  expectedScope: PrivacyRendererStorageScope
): PrivacyRendererCleanupReport {
  if (!value || typeof value !== "object") {
    throw new Error("Renderer storage cleanup report is invalid.");
  }
  const candidate = value as Partial<PrivacyRendererCleanupReport>;
  const counts = [
    candidate.attemptedKeys,
    candidate.removedKeys,
    candidate.remainingKeys,
    candidate.failedKeys
  ];
  if (
    candidate.scope !== expectedScope ||
    (candidate.verified !== true && candidate.verified !== false) ||
    counts.some(
      (count) =>
        !Number.isSafeInteger(count) ||
        (count ?? -1) < 0 ||
        (count ?? 0) > 1_000_000
    ) ||
    (candidate.removedKeys ?? 0) > (candidate.attemptedKeys ?? 0) ||
    (candidate.failedKeys ?? 0) > (candidate.attemptedKeys ?? 0) ||
    (candidate.verified === true && ((candidate.remainingKeys ?? 0) !== 0 || (candidate.failedKeys ?? 0) !== 0))
  ) {
    throw new Error("Renderer storage cleanup report is invalid.");
  }
  return candidate as PrivacyRendererCleanupReport;
}

function appendWarning(warnings: PrivacyDataWarning[], warning: PrivacyDataWarning) {
  if (!warnings.some((entry) => entry.code === warning.code && entry.area === warning.area)) {
    warnings.push(warning);
  }
}

function isSuccessfulStatus(status: PrivacyDataOperationStatus) {
  return status === "cleared" || status === "empty";
}
