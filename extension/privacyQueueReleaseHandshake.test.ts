import { describe, expect, it } from "vitest";
import {
  acknowledgePrivacyQueueBarrier,
  activatePrivacyQueueBarrier,
  getPrivacyQueueWriteEpoch
} from "./src/privacyQueueClear.js";
import {
  normalizePrivacyQueueBarrierReleaseAcknowledgements,
  releasePrivacyQueueBarrierAndPersistAcknowledgement,
  retryPrivacyQueueBarrierReleaseAcknowledgement
} from "./src/privacyQueueReleaseHandshake.js";

const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174020";
const NEWER_REQUEST_ID = "123e4567-e89b-42d3-a456-426614174021";

describe("durable privacy barrier release acknowledgement", () => {
  it("keeps the barrier released and retries the durable ACK after a network failure", async () => {
    const active = acknowledgePrivacyQueueBarrier(
      activatePrivacyQueueBarrier(undefined, REQUEST_ID, { now: 1 }),
      REQUEST_ID
    );
    let durableBarrier = active;
    let durableAcknowledgement: unknown = null;

    const released = await releasePrivacyQueueBarrierAndPersistAcknowledgement({
      currentValue: active,
      requestId: REQUEST_ID,
      now: 2,
      persist: async (nextState, pendingAcknowledgement) => {
        durableBarrier = nextState;
        durableAcknowledgement = pendingAcknowledgement;
      }
    });

    expect(released.released).toBe(true);
    expect(released.acknowledgementPersisted).toBe(true);
    expect(durableBarrier).toMatchObject({ active: false, epoch: 2 });
    expect(getPrivacyQueueWriteEpoch(durableBarrier)).toBe(2);
    expect(durableAcknowledgement).toMatchObject({ requestId: REQUEST_ID, releasedAt: 2 });

    const posted: string[] = [];
    let clearCount = 0;
    const failed = await retryPrivacyQueueBarrierReleaseAcknowledgement({
      pendingValue: durableAcknowledgement,
      postAcknowledgement: async ({ requestId }) => {
        posted.push(requestId);
        throw new Error("simulated response loss");
      },
      clearAcknowledgement: async () => {
        clearCount += 1;
        durableAcknowledgement = null;
      }
    });
    expect(failed).toEqual({ attempted: true, acknowledged: false, requestId: REQUEST_ID });
    expect(durableBarrier).toMatchObject({ active: false });
    expect(durableAcknowledgement).toMatchObject({ requestId: REQUEST_ID });
    expect(clearCount).toBe(0);

    const retried = await retryPrivacyQueueBarrierReleaseAcknowledgement({
      pendingValue: durableAcknowledgement,
      postAcknowledgement: async ({ requestId }) => {
        posted.push(requestId);
      },
      clearAcknowledgement: async (requestId) => {
        expect(requestId).toBe(REQUEST_ID);
        clearCount += 1;
        durableAcknowledgement = null;
      }
    });
    expect(retried).toEqual({ attempted: true, acknowledged: true, requestId: REQUEST_ID });
    expect(posted).toEqual([REQUEST_ID, REQUEST_ID]);
    expect(clearCount).toBe(1);
    expect(durableAcknowledgement).toBeNull();
  });

  it("persists a no-op ACK for an authenticated old proof when no barrier is active", async () => {
    const inactive = { schemaVersion: 2, active: false, epoch: 4 };
    let durableBarrier: unknown = null;
    let durableAcknowledgement: unknown = null;

    const result = await releasePrivacyQueueBarrierAndPersistAcknowledgement({
      currentValue: inactive,
      requestId: REQUEST_ID,
      now: 5,
      persist: async (nextState, pendingAcknowledgement) => {
        durableBarrier = nextState;
        durableAcknowledgement = pendingAcknowledgement;
      }
    });

    expect(result).toMatchObject({ released: false, acknowledgementPersisted: true });
    expect(durableBarrier).toMatchObject({ active: false, epoch: 4 });
    expect(durableAcknowledgement).toMatchObject({ requestId: REQUEST_ID, releasedAt: 5 });
  });

  it("ACKs an old FIFO proof without releasing a different newer active barrier", async () => {
    const newerBarrier = acknowledgePrivacyQueueBarrier(
      activatePrivacyQueueBarrier(undefined, NEWER_REQUEST_ID, { now: 10 }),
      NEWER_REQUEST_ID
    );
    let durableBarrier: unknown = null;
    let durableAcknowledgement: unknown = null;

    const result = await releasePrivacyQueueBarrierAndPersistAcknowledgement({
      currentValue: newerBarrier,
      requestId: REQUEST_ID,
      now: 11,
      persist: async (nextState, pendingAcknowledgement) => {
        durableBarrier = nextState;
        durableAcknowledgement = pendingAcknowledgement;
      }
    });

    expect(result).toMatchObject({ released: false, acknowledgementPersisted: true });
    expect(durableBarrier).toEqual(newerBarrier);
    expect(durableAcknowledgement).toMatchObject({ requestId: REQUEST_ID, releasedAt: 11 });
    expect(getPrivacyQueueWriteEpoch(durableBarrier)).toBeNull();
  });

  it("retains distinct pending release ACKs while deduplicating a repeated request", () => {
    const otherRequestId = NEWER_REQUEST_ID;
    expect(normalizePrivacyQueueBarrierReleaseAcknowledgements({
      schemaVersion: 1,
      entries: [
        { requestId: REQUEST_ID, releasedAt: 1 },
        { requestId: otherRequestId, releasedAt: 2 },
        { requestId: REQUEST_ID, releasedAt: 3 },
        { requestId: "invalid", releasedAt: 4 }
      ]
    })).toEqual([
      { schemaVersion: 1, requestId: REQUEST_ID, releasedAt: 3 },
      { schemaVersion: 1, requestId: otherRequestId, releasedAt: 2 }
    ]);
  });
});
