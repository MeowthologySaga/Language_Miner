import { describe, expect, it } from "vitest";
import {
  acknowledgePrivacyQueueBarrier,
  activatePrivacyQueueBarrier,
  createPrivacyQueueClearAcknowledgement,
  getPrivacyQueueWriteEpoch,
  isPrivacyQueueClearRequestId,
  isPrivacyQueueWriteEpochCurrent,
  normalizePrivacyQueueBarrierState,
  releasePrivacyQueueBarrierForRequest
} from "./src/privacyQueueClear.js";

const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";
const OTHER_REQUEST_ID = "123e4567-e89b-42d3-a456-426614174001";

describe("extension privacy queue acknowledgement", () => {
  it("preserves the exact verified manual-clear counts", () => {
    expect(createPrivacyQueueClearAcknowledgement(REQUEST_ID, {
      removedItems: 17,
      remainingItems: 0
    })).toEqual({ requestId: REQUEST_ID, removedItems: 17, remainingItems: 0 });
  });

  it("rejects wrong request IDs and malformed counts", () => {
    expect(isPrivacyQueueClearRequestId("wrong")).toBe(false);
    expect(createPrivacyQueueClearAcknowledgement("wrong", {
      removedItems: 1,
      remainingItems: 0
    })).toBeNull();
    expect(createPrivacyQueueClearAcknowledgement(REQUEST_ID, {
      removedItems: -1,
      remainingItems: 0
    })).toBeNull();
  });

  it("keeps writes blocked until an exact operation-bound release proof arrives", () => {
    const initial = normalizePrivacyQueueBarrierState(undefined);
    const originalEpoch = getPrivacyQueueWriteEpoch(initial);
    const activated = activatePrivacyQueueBarrier(initial, REQUEST_ID, {
      now: 1234
    });

    expect(activated).toMatchObject({
      active: true,
      acknowledged: false,
      requestId: REQUEST_ID,
      epoch: 1,
      activatedAt: 1234
    });
    expect(getPrivacyQueueWriteEpoch(activated)).toBeNull();
    expect(isPrivacyQueueWriteEpochCurrent(activated, originalEpoch)).toBe(false);

    const acknowledged = acknowledgePrivacyQueueBarrier(activated, REQUEST_ID);
    expect(releasePrivacyQueueBarrierForRequest(acknowledged, OTHER_REQUEST_ID)).toEqual(
      acknowledged
    );
    expect(releasePrivacyQueueBarrierForRequest(acknowledged, "a".repeat(64))).toEqual(
      acknowledged
    );

    const released = releasePrivacyQueueBarrierForRequest(acknowledged, REQUEST_ID);
    expect(released).toMatchObject({ active: false, epoch: 2 });
    expect(isPrivacyQueueWriteEpochCurrent(released, originalEpoch)).toBe(false);
    expect(isPrivacyQueueWriteEpochCurrent(released, 2)).toBe(true);
  });

  it("accepts an exact authenticated terminal proof for an unacknowledged expired request", () => {
    const activated = activatePrivacyQueueBarrier(undefined, REQUEST_ID, { now: 100 });
    expect(activated).toMatchObject({ active: true, acknowledged: false });
    expect(releasePrivacyQueueBarrierForRequest(activated, OTHER_REQUEST_ID)).toEqual(activated);
    expect(releasePrivacyQueueBarrierForRequest(activated, REQUEST_ID)).toMatchObject({
      active: false,
      requestId: null,
      epoch: 2
    });
  });

  it("keeps activation idempotent for a retried command", () => {
    const activated = activatePrivacyQueueBarrier(undefined, REQUEST_ID, {
      now: 100
    });
    const retried = activatePrivacyQueueBarrier(activated, REQUEST_ID, {
      now: 200
    });
    expect(retried).toEqual(activated);
  });

  it("migrates the legacy token-hash state without treating the hash as release authority", () => {
    expect(normalizePrivacyQueueBarrierState({
      schemaVersion: 1,
      active: true,
      acknowledged: true,
      requestId: REQUEST_ID,
      epoch: 7,
      bridgeTokenHash: "a".repeat(64),
      activatedAt: 123
    })).toEqual({
      schemaVersion: 2,
      active: true,
      acknowledged: true,
      requestId: REQUEST_ID,
      epoch: 7,
      activatedAt: 123
    });
  });
});
