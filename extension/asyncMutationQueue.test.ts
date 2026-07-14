import { describe, expect, it } from "vitest";
// @ts-ignore The extension ships native JavaScript modules without a TypeScript declaration file.
import { createAsyncMutationQueue } from "./src/asyncMutationQueue.js";

describe("extension async mutation queue", () => {
  it("serializes overlapping storage mutations and continues after a rejected mutation", async () => {
    const runMutation = createAsyncMutationQueue();
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = runMutation(async () => {
      events.push("first:start");
      await firstGate;
      events.push("first:end");
    });
    const second = runMutation(async () => {
      events.push("second");
      throw new Error("expected");
    });
    const third = runMutation(async () => {
      events.push("third");
    });

    await Promise.resolve();
    expect(events).toEqual(["first:start"]);
    releaseFirst();
    await first;
    await expect(second).rejects.toThrow("expected");
    await third;
    expect(events).toEqual(["first:start", "first:end", "second", "third"]);
  });
});
