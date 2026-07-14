import { describe, expect, it } from "vitest";
import {
  acknowledgePrivacyQueueBarrier,
  activatePrivacyQueueBarrier,
  normalizePrivacyQueueBarrierState,
  releasePrivacyQueueBarrierForRequest,
  shouldHandlePrivacyQueueClearRequest
} from "./src/privacyQueueClear.js";

const FIRST_REQUEST_ID = "123e4567-e89b-42d3-a456-426614174010";
const RETRY_REQUEST_ID = "123e4567-e89b-42d3-a456-426614174011";
const UNRELATED_REQUEST_ID = "123e4567-e89b-42d3-a456-426614174012";

describe("extension privacy barrier handshake", () => {
  it("releases a normally acknowledged barrier only for the authenticated matching request", () => {
    const activated = activatePrivacyQueueBarrier(undefined, FIRST_REQUEST_ID, { now: 1 });
    const acknowledged = acknowledgePrivacyQueueBarrier(activated, FIRST_REQUEST_ID);

    expect(releasePrivacyQueueBarrierForRequest(acknowledged, UNRELATED_REQUEST_ID)).toEqual(
      acknowledged
    );
    expect(releasePrivacyQueueBarrierForRequest(acknowledged, "b".repeat(64))).toEqual(
      acknowledged
    );
    expect(releasePrivacyQueueBarrierForRequest(acknowledged, FIRST_REQUEST_ID)).toMatchObject({
      active: false,
      requestId: null,
      epoch: 2
    });
  });

  it("accepts a replacement clear command after a failed operation and completes the retry", () => {
    const first = acknowledgePrivacyQueueBarrier(
      activatePrivacyQueueBarrier(undefined, FIRST_REQUEST_ID, { now: 1 }),
      FIRST_REQUEST_ID
    );
    expect(first).toMatchObject({ active: true, acknowledged: true, requestId: FIRST_REQUEST_ID });

    expect(
      shouldHandlePrivacyQueueClearRequest(first, RETRY_REQUEST_ID, null)
    ).toBe(true);
    const retry = activatePrivacyQueueBarrier(first, RETRY_REQUEST_ID, { now: 2 });
    expect(retry).toMatchObject({
      active: true,
      acknowledged: false,
      requestId: RETRY_REQUEST_ID,
      epoch: 2
    });
    expect(releasePrivacyQueueBarrierForRequest(retry, FIRST_REQUEST_ID)).toEqual(retry);

    const retryAcknowledged = acknowledgePrivacyQueueBarrier(retry, RETRY_REQUEST_ID);
    expect(
      shouldHandlePrivacyQueueClearRequest(retryAcknowledged, RETRY_REQUEST_ID, null)
    ).toBe(false);
    expect(
      releasePrivacyQueueBarrierForRequest(retryAcknowledged, RETRY_REQUEST_ID)
    ).toMatchObject({ active: false, epoch: 3 });
  });

  it("releases an unacknowledged expired command only after its matching terminal proof", () => {
    const expired = activatePrivacyQueueBarrier(undefined, FIRST_REQUEST_ID, { now: 1 });
    expect(expired).toMatchObject({ active: true, acknowledged: false });
    expect(releasePrivacyQueueBarrierForRequest(expired, RETRY_REQUEST_ID)).toEqual(expired);
    expect(releasePrivacyQueueBarrierForRequest(expired, FIRST_REQUEST_ID)).toMatchObject({
      active: false,
      requestId: null
    });
  });

  it("does not reactivate a terminal request when clear and release fields contain the same id", () => {
    const active = acknowledgePrivacyQueueBarrier(
      activatePrivacyQueueBarrier(undefined, FIRST_REQUEST_ID, { now: 1 }),
      FIRST_REQUEST_ID
    );
    expect(
      shouldHandlePrivacyQueueClearRequest(active, FIRST_REQUEST_ID, FIRST_REQUEST_ID)
    ).toBe(false);

    const released = releasePrivacyQueueBarrierForRequest(active, FIRST_REQUEST_ID);
    expect(released).toEqual(normalizePrivacyQueueBarrierState(released));
    expect(
      shouldHandlePrivacyQueueClearRequest(released, FIRST_REQUEST_ID, FIRST_REQUEST_ID)
    ).toBe(false);
  });
});
