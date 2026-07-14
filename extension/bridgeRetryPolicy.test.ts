import { describe, expect, it } from "vitest";
// @ts-ignore The extension ships native JavaScript modules without a TypeScript declaration file.
import {
  shouldRepairBridgeAuthentication,
  shouldRetainQueuedBridgeItem
} from "./src/bridgeRetryPolicy.js";

describe("extension bridge retry policy", () => {
  it("repairs stale authentication after an app restart or token rotation", () => {
    expect(shouldRepairBridgeAuthentication(401, { bridgeTokenRequired: true })).toBe(true);
    expect(shouldRepairBridgeAuthentication(401, {})).toBe(true);
    expect(
      shouldRepairBridgeAuthentication(403, { error: "The extension has not been paired." })
    ).toBe(true);
    expect(shouldRepairBridgeAuthentication(403, { error: "Origin is not allowed." })).toBe(false);
  });

  it("keeps every non-successful queued capture instead of silently dropping it", () => {
    expect(shouldRetainQueuedBridgeItem({ ok: true })).toBe(false);
    expect(shouldRetainQueuedBridgeItem({ ok: false, status: 400 })).toBe(true);
    expect(shouldRetainQueuedBridgeItem(undefined)).toBe(true);
  });
});
