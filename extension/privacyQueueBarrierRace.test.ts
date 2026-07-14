import { describe, expect, it } from "vitest";
import { createAsyncMutationQueue } from "./src/asyncMutationQueue.js";
import {
  acknowledgePrivacyQueueBarrier,
  activatePrivacyQueueBarrier,
  getPrivacyQueueWriteEpoch,
  isPrivacyQueueWriteEpochCurrent,
  normalizePrivacyQueueBarrierState,
  releasePrivacyQueueBarrierForRequest
} from "./src/privacyQueueClear.js";

const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";

describe("extension privacy queue barrier race", () => {
  it("clears an earlier write and rejects later or stale writes until release", async () => {
    const runMutation = createAsyncMutationQueue();
    let barrier = normalizePrivacyQueueBarrierState(undefined);
    let queue: string[] = [];
    const originalEpoch = getPrivacyQueueWriteEpoch(barrier);
    let allowFirstWrite = () => {};
    const firstWriteGate = new Promise<void>((resolve) => {
      allowFirstWrite = resolve;
    });

    const firstWrite = runMutation(async () => {
      await firstWriteGate;
      if (isPrivacyQueueWriteEpochCurrent(barrier, originalEpoch)) {
        queue.push("before-command");
      }
    });
    const activateAndClear = runMutation(async () => {
      barrier = activatePrivacyQueueBarrier(barrier, REQUEST_ID, {
        now: 1
      })!;
      queue = [];
    });
    const laterWrite = runMutation(async () => {
      if (isPrivacyQueueWriteEpochCurrent(barrier, originalEpoch)) {
        queue.push("after-command");
      }
    });

    allowFirstWrite();
    await Promise.all([firstWrite, activateAndClear, laterWrite]);
    expect(queue).toEqual([]);

    barrier = acknowledgePrivacyQueueBarrier(barrier, REQUEST_ID);
    expect(getPrivacyQueueWriteEpoch(barrier)).toBeNull();
    barrier = releasePrivacyQueueBarrierForRequest(
      barrier,
      "123e4567-e89b-42d3-a456-426614174099"
    );
    expect(getPrivacyQueueWriteEpoch(barrier)).toBeNull();

    barrier = releasePrivacyQueueBarrierForRequest(barrier, REQUEST_ID);
    expect(isPrivacyQueueWriteEpochCurrent(barrier, originalEpoch)).toBe(false);
    expect(isPrivacyQueueWriteEpochCurrent(barrier, getPrivacyQueueWriteEpoch(barrier))).toBe(true);
  });
});
