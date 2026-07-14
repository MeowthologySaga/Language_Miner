import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("extension bridge request timeout", () => {
  it("routes every loopback bridge request through the bounded fetch helper", () => {
    const source = readFileSync(join(process.cwd(), "extension", "src", "background.js"), "utf8");
    expect(source).toContain("const BRIDGE_REQUEST_TIMEOUT_MS = 5_000");
    expect(source).toContain("async function fetchBridge");
    expect(source.match(/await fetchBridge\(/g)?.length).toBe(5);
    expect(source.match(/await fetch\(/g) ?? []).toHaveLength(1);
    expect(source).toContain("signal: controller.signal");
  });
});
