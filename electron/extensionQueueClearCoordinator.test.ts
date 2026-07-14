import { describe, expect, it } from "vitest";
import { ExtensionQueueClearCoordinator } from "./extensionQueueClearCoordinator";

const REQUEST_ID = "123e4567-e89b-42d3-a456-426614174000";

describe("ExtensionQueueClearCoordinator", () => {
  it("keeps one pending command until the extension acknowledges an empty queue", () => {
    const coordinator = new ExtensionQueueClearCoordinator(() => REQUEST_ID, 60_000);
    expect(coordinator.requestClear(1_000)).toMatchObject({
      status: "pending",
      requestId: REQUEST_ID
    });
    expect(coordinator.requestClear(2_000)).toMatchObject({ requestId: REQUEST_ID });
    expect(coordinator.getPendingCommand(2_000)).toEqual({ requestId: REQUEST_ID });
    expect(
      coordinator.acknowledge(
        { requestId: REQUEST_ID, removedItems: 12, remainingItems: 0 },
        3_000
      )
    ).toBe(true);
    expect(coordinator.getPendingCommand(3_000)).toBeNull();
    expect(coordinator.getStatus(REQUEST_ID, 3_000)).toMatchObject({
      status: "cleared",
      removedItems: 12,
      remainingItems: 0
    });
  });

  it("does not report success for a wrong, expired, malformed, or non-empty acknowledgement", () => {
    const coordinator = new ExtensionQueueClearCoordinator(() => REQUEST_ID, 1_000);
    coordinator.requestClear(10_000);
    expect(
      coordinator.acknowledge(
        { requestId: "wrong", removedItems: 1, remainingItems: 0 },
        10_100
      )
    ).toBe(false);
    expect(
      coordinator.acknowledge(
        { requestId: REQUEST_ID, removedItems: 1, remainingItems: 2 },
        10_200
      )
    ).toBe(true);
    expect(coordinator.getStatus(REQUEST_ID, 10_200)).toMatchObject({
      status: "incomplete",
      remainingItems: 2
    });
    expect(coordinator.getPendingCommand(10_200)).toEqual({ requestId: REQUEST_ID });
    expect(
      coordinator.acknowledge(
        { requestId: REQUEST_ID, removedItems: 2, remainingItems: 0 },
        10_300
      )
    ).toBe(true);
    expect(coordinator.getStatus(REQUEST_ID, 10_300)).toMatchObject({
      status: "cleared",
      remainingItems: 0
    });

    const expired = new ExtensionQueueClearCoordinator(() => REQUEST_ID, 1_000);
    expired.requestClear(20_000);
    expect(
      expired.acknowledge(
        { requestId: REQUEST_ID, removedItems: 1, remainingItems: 0 },
        22_000
      )
    ).toBe(false);
    expect(expired.getStatus(REQUEST_ID, 22_000)).toEqual({
      status: "expired",
      requestId: REQUEST_ID
    });
  });

  it("forgets an in-flight request after restart instead of treating it as cleared", () => {
    const beforeRestart = new ExtensionQueueClearCoordinator(() => REQUEST_ID, 60_000);
    beforeRestart.requestClear(1_000);

    const afterRestart = new ExtensionQueueClearCoordinator(() => REQUEST_ID, 60_000);
    expect(afterRestart.getStatus(REQUEST_ID, 2_000)).toEqual({ status: "unknown" });
    expect(afterRestart.getPendingCommand(2_000)).toBeNull();
  });
});
