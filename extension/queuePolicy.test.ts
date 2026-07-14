import { describe, expect, it } from "vitest";
// @ts-ignore The extension ships native JavaScript modules without a TypeScript declaration file.
import {
  compactPayloadQueue,
  compactPayloadQueueMap,
  createPayloadQueueItem,
  summarizePayloadQueueMap
} from "./src/queuePolicy.js";

const limits = {
  now: 1_000_000,
  maxAgeMs: 10_000,
  maxItems: 3,
  maxItemBytes: 500,
  maxBytes: 900,
  maxTotalBytes: 900
};

describe("extension queue policy", () => {
  it("drops expired, oversized, and oldest entries", () => {
    const queue = compactPayloadQueue(
      [
        createPayloadQueueItem({ id: "expired" }, 900_000),
        createPayloadQueueItem({ id: "one" }, 998_000),
        createPayloadQueueItem({ id: "two" }, 999_000),
        createPayloadQueueItem({ id: "three" }, 999_500),
        createPayloadQueueItem({ id: "four" }, 999_900),
        createPayloadQueueItem({ text: "x".repeat(1_000) }, 999_999)
      ],
      limits
    );
    expect(queue.map((item: { payload: { id?: string } }) => item.payload.id)).toEqual([
      "two",
      "three",
      "four"
    ]);
  });

  it("enforces one total byte budget across all pending queues", () => {
    const queueMap = compactPayloadQueueMap(
      {
        a: [createPayloadQueueItem({ text: "a".repeat(350) }, 999_000)],
        b: [createPayloadQueueItem({ text: "b".repeat(350) }, 999_900)],
        c: [createPayloadQueueItem({ text: "c".repeat(350) }, 999_800)]
      },
      limits
    );
    const summary = summarizePayloadQueueMap(queueMap);
    expect(summary.totalBytes).toBeLessThanOrEqual(limits.maxTotalBytes);
    expect(summary.totalCount).toBe(2);
    expect(queueMap.a).toHaveLength(0);
  });
});
