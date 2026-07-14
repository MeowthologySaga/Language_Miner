import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import type { LifeLog } from "../src/shared/types";
import { LIFE_MINER_TOKEN_HEADER } from "./lifeMinerBridgeProtocol";
import { LIFE_MINER_CHROME_EXTENSION_ID } from "./lifeMinerBridgeProtocol";
import {
  getLifeLogRawContentLengths,
  isDuplicateLifeMinerCapture,
  isLifeMinerDebugEnabled,
  LifeMinerBridgePairing
} from "./lifeMinerBridgeState";

function requestWithToken(token?: string): IncomingMessage {
  return {
    headers: token ? { [LIFE_MINER_TOKEN_HEADER]: token } : {}
  } as IncomingMessage;
}

function lifeLogInput(overrides: Partial<LifeLog> = {}) {
  return {
    text: "Captured message",
    appName: "Chat",
    sourceType: "browser_extension",
    metadata: {},
    ...overrides
  } as Omit<LifeLog, "id" | "processed" | "createdAt">;
}

describe("life miner bridge state", () => {
  it("pairs one extension origin and validates the bridge token", () => {
    const pairing = new LifeMinerBridgePairing("token-1");

    const origin = `chrome-extension://${LIFE_MINER_CHROME_EXTENSION_ID}`;
    expect(pairing.pair(origin)).toEqual({
      origin,
      token: "token-1"
    });
    expectBridgeError(
      () => pairing.validateToken(requestWithToken("wrong"), origin),
      401
    );
    expect(() =>
      pairing.validateToken(requestWithToken("token-1"), origin)
    ).not.toThrow();
    expectBridgeError(() => pairing.pair("chrome-extension://other"), 403);
  });

  it("persists pairing history through the supplied durable history contract", () => {
    let everPaired = false;
    const pairing = new LifeMinerBridgePairing("token-1", () => "token-2", {
      hasEverPaired: () => everPaired,
      markPaired: () => {
        everPaired = true;
      }
    });

    expect(pairing.hasPairedHistory()).toBe(false);
    pairing.pair(`chrome-extension://${LIFE_MINER_CHROME_EXTENSION_ID}`);
    expect(pairing.hasPairedHistory()).toBe(true);
    pairing.revoke();
    expect(pairing.getStatus().paired).toBe(false);
    expect(pairing.hasPairedHistory()).toBe(true);
  });

  it("returns an authentication challenge after restart or revocation so the extension can repair", () => {
    const origin = `chrome-extension://${LIFE_MINER_CHROME_EXTENSION_ID}`;
    const restarted = new LifeMinerBridgePairing("token-after-restart");
    expectBridgeError(
      () => restarted.validateToken(requestWithToken("stale-token"), origin),
      401
    );
    expect(restarted.pair(origin).token).toBe("token-after-restart");
    expect(() => restarted.validateToken(requestWithToken("token-after-restart"), origin)).not.toThrow();

    let nextToken = "token-after-revoke";
    const revoked = new LifeMinerBridgePairing("token-before-revoke", () => nextToken);
    revoked.pair(origin);
    revoked.revoke();
    expectBridgeError(
      () => revoked.validateToken(requestWithToken("token-before-revoke"), origin),
      401
    );
    expect(revoked.pair(origin).token).toBe("token-after-revoke");
  });

  it("deduplicates repeated life log captures and expires old keys", () => {
    const recentCaptures = new Map<string, number>();

    expect(
      isDuplicateLifeMinerCapture(recentCaptures, lifeLogInput(), 100, 1_000)
    ).toBe(false);
    expect(
      isDuplicateLifeMinerCapture(recentCaptures, lifeLogInput(), 100, 1_050)
    ).toBe(true);
    expect(
      isDuplicateLifeMinerCapture(recentCaptures, lifeLogInput(), 100, 1_200)
    ).toBe(false);
  });

  it("detects debug mode and reports raw content lengths", () => {
    const input = lifeLogInput({
      metadata: {
        debugMode: true,
        messages: [
          { role: "user", speaker: "A", raw_content: "hello" },
          { role: "assistant", raw_content: "world!" }
        ]
      }
    });

    expect(isLifeMinerDebugEnabled(input, {})).toBe(true);
    expect(isLifeMinerDebugEnabled(lifeLogInput(), { LEM_LIFE_MINER_DEBUG: "1" })).toBe(true);
    expect(getLifeLogRawContentLengths(input)).toEqual([
      { index: 0, length: 5 },
      { index: 1, length: 6 }
    ]);
  });
});

function expectBridgeError(action: () => unknown, statusCode: number) {
  try {
    action();
  } catch (caught) {
    expect(caught).toMatchObject({
      name: "LifeMinerBridgeRequestError",
      statusCode
    });
    return;
  }
  throw new Error("Expected bridge action to throw.");
}
