import {
  isPrivacyQueueClearRequestId,
  normalizePrivacyQueueBarrierState,
  releasePrivacyQueueBarrierForRequest
} from "./privacyQueueClear.js";

export const PRIVACY_QUEUE_RELEASE_ACK_STORAGE_KEY =
  "lifeMinerPrivacyQueueBarrierReleaseAck";

export function normalizePrivacyQueueBarrierReleaseAcknowledgement(value) {
  if (
    !value ||
    typeof value !== "object" ||
    !isPrivacyQueueClearRequestId(value.requestId)
  ) {
    return null;
  }
  return {
    schemaVersion: 1,
    requestId: value.requestId,
    releasedAt:
      Number.isSafeInteger(value.releasedAt) && value.releasedAt >= 0
        ? value.releasedAt
        : 0
  };
}

export function normalizePrivacyQueueBarrierReleaseAcknowledgements(value) {
  const candidates = Array.isArray(value?.entries) ? value.entries : [value];
  const byRequestId = new Map();
  for (const candidate of candidates.slice(-50)) {
    const normalized = normalizePrivacyQueueBarrierReleaseAcknowledgement(candidate);
    if (normalized) byRequestId.set(normalized.requestId, normalized);
  }
  return [...byRequestId.values()];
}

export async function releasePrivacyQueueBarrierAndPersistAcknowledgement({
  currentValue,
  requestId,
  now = Date.now(),
  persist
}) {
  if (typeof persist !== "function") {
    throw new TypeError("A privacy barrier release persistence callback is required.");
  }
  const current = normalizePrivacyQueueBarrierState(currentValue);
  if (!isPrivacyQueueClearRequestId(requestId)) {
    return {
      released: false,
      acknowledgementPersisted: false,
      state: current,
      pendingAcknowledgement: null
    };
  }
  const next = releasePrivacyQueueBarrierForRequest(current, requestId);
  const released = current.active && !next.active;

  const pendingAcknowledgement = {
    schemaVersion: 1,
    requestId,
    releasedAt: Number.isSafeInteger(now) && now >= 0 ? now : 0
  };
  await persist(next, pendingAcknowledgement);
  return {
    released,
    acknowledgementPersisted: true,
    state: next,
    pendingAcknowledgement
  };
}

export async function retryPrivacyQueueBarrierReleaseAcknowledgement({
  pendingValue,
  postAcknowledgement,
  clearAcknowledgement
}) {
  const pending = normalizePrivacyQueueBarrierReleaseAcknowledgement(pendingValue);
  if (!pending) {
    return { attempted: false, acknowledged: false, requestId: null };
  }
  if (typeof postAcknowledgement !== "function" || typeof clearAcknowledgement !== "function") {
    throw new TypeError("Privacy barrier release acknowledgement callbacks are required.");
  }

  try {
    await postAcknowledgement({ requestId: pending.requestId });
    await clearAcknowledgement(pending.requestId);
    return { attempted: true, acknowledged: true, requestId: pending.requestId };
  } catch {
    return { attempted: true, acknowledged: false, requestId: pending.requestId };
  }
}
