import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LifeMinerBridgeControlStore } from "./lifeMinerBridgeControlStore";

const roots: string[] = [];
const REQUEST_A = "123e4567-e89b-42d3-a456-426614174001";
const REQUEST_B = "123e4567-e89b-42d3-a456-426614174002";

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function createStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lem-bridge-control-"));
  roots.push(root);
  return {
    root,
    store: new LifeMinerBridgeControlStore(() => root)
  };
}

describe("LifeMinerBridgeControlStore", () => {
  it("persists pairing history across store instances", () => {
    const { root, store } = createStore();
    expect(store.hasEverPaired()).toBe(false);
    store.markPaired();
    expect(new LifeMinerBridgeControlStore(() => root).hasEverPaired()).toBe(true);
  });

  it("keeps an exact barrier release durable until an idempotent acknowledgement", () => {
    const { root, store } = createStore();
    store.markPaired();
    store.setBarrierReleaseRequestId(REQUEST_A);

    const restarted = new LifeMinerBridgeControlStore(() => root);
    expect(restarted.getBarrierReleaseRequestId()).toBe(REQUEST_A);
    expect(restarted.acknowledgeBarrierRelease(REQUEST_B)).toBe(false);
    expect(restarted.getBarrierReleaseRequestId()).toBe(REQUEST_A);
    expect(restarted.acknowledgeBarrierRelease(REQUEST_A)).toBe(true);
    expect(restarted.getBarrierReleaseRequestId()).toBeNull();
    expect(new LifeMinerBridgeControlStore(() => root).acknowledgeBarrierRelease(REQUEST_A)).toBe(
      true
    );
  });

  it("delivers unacknowledged releases in FIFO order across restarts", () => {
    const { root, store } = createStore();
    store.setBarrierReleaseRequestId(REQUEST_A);
    store.setBarrierReleaseRequestId(REQUEST_B);

    const restarted = new LifeMinerBridgeControlStore(() => root);
    expect(restarted.getBarrierReleaseRequestId()).toBe(REQUEST_A);
    expect(restarted.acknowledgeBarrierRelease(REQUEST_B)).toBe(false);
    expect(restarted.getBarrierReleaseRequestId()).toBe(REQUEST_A);
    expect(restarted.acknowledgeBarrierRelease(REQUEST_A)).toBe(true);
    expect(restarted.getBarrierReleaseRequestId()).toBe(REQUEST_B);
    expect(new LifeMinerBridgeControlStore(() => root).getBarrierReleaseRequestId()).toBe(
      REQUEST_B
    );
    expect(restarted.acknowledgeBarrierRelease(REQUEST_B)).toBe(true);
    expect(restarted.getBarrierReleaseRequestId()).toBeNull();

    // Replaying terminal persistence after a lost response must not enqueue an
    // already acknowledged proof as a new operation.
    restarted.setBarrierReleaseRequestId(REQUEST_A);
    expect(restarted.getBarrierReleaseRequestId()).toBeNull();
    expect(restarted.acknowledgeBarrierRelease(REQUEST_A)).toBe(true);
    expect(restarted.getBarrierReleaseRequestId()).toBeNull();
  });

  it("fails closed instead of dropping an unacknowledged release when the FIFO is full", () => {
    const { store } = createStore();
    const requestIds = Array.from({ length: 33 }, (_, index) =>
      `123e4567-e89b-42d3-a456-${String(426614174100 + index).padStart(12, "0")}`
    );
    for (const requestId of requestIds.slice(0, 32)) {
      store.setBarrierReleaseRequestId(requestId);
    }

    expect(store.getBarrierReleaseRequestId()).toBe(requestIds[0]);
    expect(() => store.setBarrierReleaseRequestId(requestIds[32])).toThrow(
      /Too many unacknowledged/
    );
    expect(store.getBarrierReleaseRequestId()).toBe(requestIds[0]);
    for (const [index, requestId] of requestIds.slice(0, 32).entries()) {
      expect(store.getBarrierReleaseRequestId()).toBe(requestId);
      expect(store.acknowledgeBarrierRelease(requestId)).toBe(true);
      expect(store.getBarrierReleaseRequestId()).toBe(
        index + 1 < 32 ? requestIds[index + 1] : null
      );
    }
  });

  it("migrates the legacy single release slot into the pending FIFO", () => {
    const { root, store } = createStore();
    fs.writeFileSync(
      path.join(root, "life-miner-bridge-control.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        everPaired: true,
        barrierReleaseRequestId: REQUEST_A
      })}\n`,
      "utf8"
    );

    expect(store.getBarrierReleaseRequestId()).toBe(REQUEST_A);
    store.setBarrierReleaseRequestId(REQUEST_B);
    expect(store.getBarrierReleaseRequestId()).toBe(REQUEST_A);
    expect(store.acknowledgeBarrierRelease(REQUEST_A)).toBe(true);
    expect(store.getBarrierReleaseRequestId()).toBe(REQUEST_B);
  });

  it("fails closed for damaged existing pairing metadata", () => {
    const { root, store } = createStore();
    fs.writeFileSync(path.join(root, "life-miner-bridge-control.json"), "not-json", "utf8");
    expect(store.hasEverPaired()).toBe(true);
    store.markPaired();
    expect(new LifeMinerBridgeControlStore(() => root).hasEverPaired()).toBe(true);
    expect(
      JSON.parse(fs.readFileSync(path.join(root, "life-miner-bridge-control.json"), "utf8"))
    ).toMatchObject({ schemaVersion: 1, everPaired: true });
  });

  it("durably forgets pairing history and every remaining barrier release proof", () => {
    const { root, store } = createStore();
    store.markPaired();
    store.setBarrierReleaseRequestId(REQUEST_A);
    store.setBarrierReleaseRequestId(REQUEST_B);

    store.forgetPairingHistoryAndReleaseProofs();

    const restarted = new LifeMinerBridgeControlStore(() => root);
    expect(restarted.hasEverPaired()).toBe(false);
    expect(restarted.getBarrierReleaseRequestId()).toBeNull();
    expect(restarted.acknowledgeBarrierRelease(REQUEST_A)).toBe(false);
    expect(restarted.acknowledgeBarrierRelease(REQUEST_B)).toBe(false);
    expect(
      JSON.parse(fs.readFileSync(path.join(root, "life-miner-bridge-control.json"), "utf8"))
    ).toEqual({ schemaVersion: 1, everPaired: false });
  });
});
