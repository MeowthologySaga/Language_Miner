import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

describe("Life Miner bridge smoke boundaries", () => {
  it("uses the packaged extension origin and current pair-then-settings contract", () => {
    const manifest = JSON.parse(read("extension/manifest.json")) as { key?: string };
    const derivedExtensionId = [...createHash("sha256")
      .update(Buffer.from(manifest.key ?? "", "base64"))
      .digest()
      .subarray(0, 16)]
      .flatMap((byte) => [byte >> 4, byte & 0x0f])
      .map((nibble) => "abcdefghijklmnop"[nibble])
      .join("");
    const source = read("scripts/qa-life-miner-bridge-electron.cjs");
    const originMatch = source.match(
      /const extensionOrigin = "chrome-extension:\/\/([a-p]{32})";/
    );

    expect(originMatch?.[1]).toBe(derivedExtensionId);
    expect(source).not.toContain("chrome-extension://lem-bridge-smoke");
    expect(source.indexOf('fetchJson("/pair"')).toBeGreaterThan(-1);
    expect(source.indexOf('fetchJson("/pair"')).toBeLessThan(
      source.indexOf('fetchJson("/settings"')
    );
  });

  it("reaches a no-save handler without overriding the disabled-by-default capture policy", () => {
    const source = read("scripts/qa-life-miner-bridge-electron.cjs");
    const authenticatedHandlerCheck = source.slice(
      source.indexOf('recordCheck("post with token reaches handler'),
      source.indexOf('recordCheck("second extension origin')
    );

    expect(authenticatedHandlerCheck).toContain('fetchJson("/sentence-cards"');
    expect(authenticatedHandlerCheck).toContain('reason === "empty_selection"');
    expect(authenticatedHandlerCheck).not.toContain('fetchJson("/life-logs"');
  });
});
