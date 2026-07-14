import { randomUUID } from "node:crypto";
import type { PrivacyExtensionQueueClearStatus } from "../src/shared/privacyData";

export type ExtensionQueueClearStatus = PrivacyExtensionQueueClearStatus;

type QueueClearRecord = {
  requestId: string;
  requestedAtMs: number;
  expiresAtMs: number;
  acknowledgement?: {
    acknowledgedAtMs: number;
    removedItems: number;
    remainingItems: number;
  };
};

const DEFAULT_REQUEST_TTL_MS = 10 * 60 * 1000;
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ExtensionQueueClearCoordinator {
  private record: QueueClearRecord | null = null;

  constructor(
    private readonly createRequestId: () => string = randomUUID,
    private readonly requestTtlMs = DEFAULT_REQUEST_TTL_MS
  ) {}

  requestClear(nowMs = Date.now()) {
    if (
      this.record &&
      (!this.record.acknowledgement || this.record.acknowledgement.remainingItems > 0) &&
      this.record.expiresAtMs > nowMs
    ) {
      return this.toStatus(this.record, nowMs);
    }
    const requestId = this.createRequestId();
    if (!REQUEST_ID_PATTERN.test(requestId)) {
      throw new Error("Extension queue-clear request IDs must be UUID v4 values.");
    }
    this.record = {
      requestId,
      requestedAtMs: nowMs,
      expiresAtMs: nowMs + Math.max(1_000, this.requestTtlMs)
    };
    return this.toStatus(this.record, nowMs);
  }

  getPendingCommand(nowMs = Date.now()) {
    if (
      !this.record ||
      this.record.acknowledgement?.remainingItems === 0 ||
      this.record.expiresAtMs <= nowMs
    ) {
      return null;
    }
    return { requestId: this.record.requestId };
  }

  acknowledge(
    input: { requestId?: unknown; removedItems?: unknown; remainingItems?: unknown },
    nowMs = Date.now()
  ) {
    if (
      !this.record ||
      this.record.expiresAtMs <= nowMs ||
      input.requestId !== this.record.requestId
    ) {
      return false;
    }
    const removedItems = normalizeCount(input.removedItems);
    const remainingItems = normalizeCount(input.remainingItems);
    if (removedItems === null || remainingItems === null) return false;
    this.record.acknowledgement = {
      acknowledgedAtMs: nowMs,
      removedItems,
      remainingItems
    };
    return true;
  }

  getStatus(requestId: unknown, nowMs = Date.now()): ExtensionQueueClearStatus {
    if (!this.record || requestId !== this.record.requestId) return { status: "unknown" };
    return this.toStatus(this.record, nowMs);
  }

  clear() {
    this.record = null;
  }

  private toStatus(record: QueueClearRecord, nowMs: number): ExtensionQueueClearStatus {
    if (
      (!record.acknowledgement || record.acknowledgement.remainingItems > 0) &&
      record.expiresAtMs <= nowMs
    ) {
      return { status: "expired", requestId: record.requestId };
    }
    const requestedAt = new Date(record.requestedAtMs).toISOString();
    if (!record.acknowledgement) {
      return {
        status: "pending",
        requestId: record.requestId,
        requestedAt,
        expiresAt: new Date(record.expiresAtMs).toISOString()
      };
    }
    const common = {
      requestId: record.requestId,
      requestedAt,
      acknowledgedAt: new Date(record.acknowledgement.acknowledgedAtMs).toISOString(),
      removedItems: record.acknowledgement.removedItems
    };
    if (record.acknowledgement.remainingItems === 0) {
      return { status: "cleared", ...common, remainingItems: 0 };
    }
    return {
      status: "incomplete",
      ...common,
      remainingItems: record.acknowledgement.remainingItems
    };
  }
}

function normalizeCount(value: unknown) {
  const count = typeof value === "number" ? value : Number.NaN;
  return Number.isSafeInteger(count) && count >= 0 && count <= 10_000 ? count : null;
}
