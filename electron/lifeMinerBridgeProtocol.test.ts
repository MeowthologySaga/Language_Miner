import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { IncomingMessage } from "node:http";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getLifeMinerBridgeBaseUrl,
  getSingleHeaderValue,
  isAllowedLifeMinerOrigin,
  LifeMinerBridgeRequestError,
  LIFE_MINER_CHROME_EXTENSION_ID,
  readLifeMinerJsonBody
} from "./lifeMinerBridgeProtocol";
import { LIFE_MINER_BRIDGE_PORT } from "../src/shared/lifeLogCapture";

describe("life miner bridge protocol", () => {
  it("pins the bridge origin to the extension ID derived from the packaged public key", () => {
    const manifest = JSON.parse(
      readFileSync(join(process.cwd(), "extension", "manifest.json"), "utf8")
    ) as { key?: string };
    const digest = createHash("sha256")
      .update(Buffer.from(manifest.key ?? "", "base64"))
      .digest()
      .subarray(0, 16);
    const derivedId = [...digest]
      .flatMap((byte) => [byte >> 4, byte & 0x0f])
      .map((nibble) => "abcdefghijklmnop"[nibble])
      .join("");

    expect(derivedId).toBe(LIFE_MINER_CHROME_EXTENSION_ID);
  });

  it("allows only the packaged extension origin", () => {
    expect(isAllowedLifeMinerOrigin(undefined)).toBe(false);
    expect(isAllowedLifeMinerOrigin(`chrome-extension://${LIFE_MINER_CHROME_EXTENSION_ID}`)).toBe(true);
    expect(isAllowedLifeMinerOrigin("chrome-extension://abc")).toBe(false);
    expect(isAllowedLifeMinerOrigin("moz-extension://abc")).toBe(false);
    expect(isAllowedLifeMinerOrigin("https://example.com")).toBe(false);
  });

  it("normalizes bridge header and base URL values", () => {
    expect(getSingleHeaderValue(["first", "second"])).toBe("first");
    expect(getSingleHeaderValue("single")).toBe("single");
    expect(getLifeMinerBridgeBaseUrl(undefined)).toBe(
      `http://127.0.0.1:${LIFE_MINER_BRIDGE_PORT}`
    );
    expect(getLifeMinerBridgeBaseUrl("127.0.0.1:1234")).toBe("http://127.0.0.1:1234");
  });

  it("parses JSON request bodies", async () => {
    const request = createMockRequest();
    const parsed = readLifeMinerJsonBody<{ ok: boolean }>(request);

    request.emit("data", Buffer.from('{"ok":true}'));
    request.emit("end");

    await expect(parsed).resolves.toEqual({ ok: true });
  });

  it("rejects invalid JSON request bodies with a bridge error", async () => {
    const request = createMockRequest();
    const parsed = readLifeMinerJsonBody(request);

    request.emit("data", Buffer.from("{"));
    request.emit("end");

    await expect(parsed).rejects.toMatchObject({
      name: "LifeMinerBridgeRequestError",
      statusCode: 400
    } satisfies Partial<LifeMinerBridgeRequestError>);
  });

  it("rejects aborted request bodies so privacy deletion cannot drain forever", async () => {
    const request = createMockRequest();
    const parsed = readLifeMinerJsonBody(request);

    request.emit("aborted");

    await expect(parsed).rejects.toMatchObject({
      name: "LifeMinerBridgeRequestError",
      statusCode: 408
    } satisfies Partial<LifeMinerBridgeRequestError>);
  });
});

function createMockRequest() {
  const request = new EventEmitter() as IncomingMessage;
  request.headers = {};
  return request;
}
