const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const PRIVACY_QUEUE_BARRIER_STORAGE_KEY = "lifeMinerPrivacyQueueBarrier";

export function createPrivacyQueueClearAcknowledgement(requestId, summary) {
  if (!isPrivacyQueueClearRequestId(requestId)) return null;
  const removedItems = normalizeCount(summary?.removedItems);
  const remainingItems = normalizeCount(summary?.remainingItems);
  if (removedItems === null || remainingItems === null) return null;
  return { requestId, removedItems, remainingItems };
}

export function isPrivacyQueueClearRequestId(requestId) {
  return typeof requestId === "string" && REQUEST_ID_PATTERN.test(requestId);
}

export function normalizePrivacyQueueBarrierState(value) {
  const epoch = Number.isSafeInteger(value?.epoch) && value.epoch >= 0
    ? value.epoch
    : 0;
  const active = value?.active === true && isPrivacyQueueClearRequestId(value?.requestId);
  return {
    schemaVersion: 2,
    active,
    acknowledged: active && value?.acknowledged === true,
    requestId: active ? value.requestId : null,
    epoch,
    activatedAt:
      active && Number.isSafeInteger(value?.activatedAt) && value.activatedAt >= 0
        ? value.activatedAt
        : null
  };
}

export function activatePrivacyQueueBarrier(
  currentValue,
  requestId,
  { now = Date.now() } = {}
) {
  if (!isPrivacyQueueClearRequestId(requestId)) return null;
  const current = normalizePrivacyQueueBarrierState(currentValue);

  if (current.active && current.requestId === requestId) {
    return current;
  }

  return {
    schemaVersion: 2,
    active: true,
    acknowledged: false,
    requestId,
    epoch: current.epoch + 1,
    activatedAt: Number.isSafeInteger(now) && now >= 0 ? now : 0
  };
}

export function acknowledgePrivacyQueueBarrier(currentValue, requestId) {
  const current = normalizePrivacyQueueBarrierState(currentValue);
  if (!current.active || current.requestId !== requestId) return current;
  return {
    ...current,
    acknowledged: true
  };
}

export function releasePrivacyQueueBarrierForRequest(currentValue, releaseRequestId) {
  const current = normalizePrivacyQueueBarrierState(currentValue);
  if (
    !current.active ||
    !isPrivacyQueueClearRequestId(releaseRequestId) ||
    current.requestId !== releaseRequestId
  ) {
    return current;
  }

  return {
    schemaVersion: 2,
    active: false,
    acknowledged: false,
    requestId: null,
    epoch: current.epoch + 1,
    activatedAt: null
  };
}

export function shouldHandlePrivacyQueueClearRequest(
  currentValue,
  clearRequestId,
  releaseRequestId = null
) {
  if (
    !isPrivacyQueueClearRequestId(clearRequestId) ||
    (isPrivacyQueueClearRequestId(releaseRequestId) && clearRequestId === releaseRequestId)
  ) {
    return false;
  }
  const current = normalizePrivacyQueueBarrierState(currentValue);
  return (
    !current.active ||
    current.requestId !== clearRequestId ||
    !current.acknowledged
  );
}

export function getPrivacyQueueWriteEpoch(currentValue) {
  const current = normalizePrivacyQueueBarrierState(currentValue);
  return current.active ? null : current.epoch;
}

export function isPrivacyQueueWriteEpochCurrent(currentValue, expectedEpoch) {
  const current = normalizePrivacyQueueBarrierState(currentValue);
  return (
    !current.active &&
    Number.isSafeInteger(expectedEpoch) &&
    expectedEpoch >= 0 &&
    current.epoch === expectedEpoch
  );
}

function normalizeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 10_000 ? value : null;
}
