import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createPlayZoneEntryProtocolUrl,
  normalizePlayZoneEntryRelativePath,
  readPlayZoneEntryProtocolFile,
  registerPlayZoneEntryProtocolMount,
  resolvePlayZoneEntryProtocolFilePath
} from "./playZoneEntryProtocol";

describe("playZoneEntryProtocol", () => {
  it("uses an opaque mount id and verifies the expected file before serving it", () => {
    const mounts = new Map();
    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "lem-playzone-protocol-mount-"));
    const relativePath = "game/index.html";
    fs.mkdirSync(path.join(rootPath, "game"));
    fs.writeFileSync(path.join(rootPath, relativePath), "<!doctype html><title>QA</title>");
    const contents = fs.readFileSync(path.join(rootPath, relativePath));
    try {
      const mountId = registerPlayZoneEntryProtocolMount(rootPath, [{
        relativePath,
        sha256: createHash("sha256").update(contents).digest("hex"),
        size: contents.length
      }], mounts);
      const url = createPlayZoneEntryProtocolUrl(mountId, relativePath, mounts);

      expect(url).toMatch(/^lem-playzone:\/\/pack\/mount-[0-9a-f-]+\//);
      expect(url).not.toContain(Buffer.from(path.resolve(rootPath), "utf8").toString("base64url"));
      expect(resolvePlayZoneEntryProtocolFilePath(url ?? "", mounts)).toBe(
        path.join(rootPath, relativePath)
      );
      expect(readPlayZoneEntryProtocolFile(url ?? "", mounts).contents).toEqual(contents);
    } finally {
      fs.rmSync(rootPath, { recursive: true, force: true });
    }
  });

  it("rejects a snapshot file changed after its mount was authorized", () => {
    const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "lem-playzone-protocol-"));
    fs.mkdirSync(path.join(rootPath, "game"));
    const filePath = path.join(rootPath, "game", "index.html");
    fs.writeFileSync(filePath, "original");
    const mounts = new Map();
    const mountId = registerPlayZoneEntryProtocolMount(rootPath, [{
      relativePath: "game/index.html",
      sha256: createHash("sha256").update("original").digest("hex"),
      size: Buffer.byteLength("original")
    }], mounts);
    const url = createPlayZoneEntryProtocolUrl(mountId, "game/index.html", mounts) ?? "";

    fs.writeFileSync(filePath, "tampered");
    expect(() => readPlayZoneEntryProtocolFile(url, mounts)).toThrow(/changed|SHA-256/);
  });

  it("rejects paths that try to escape the cartridge root", () => {
    expect(normalizePlayZoneEntryRelativePath("../outside.html")).toBe("");
    expect(normalizePlayZoneEntryRelativePath("game/../outside.html")).toBe("");
    expect(normalizePlayZoneEntryRelativePath("source/private.js")).toBe("");
    expect(normalizePlayZoneEntryRelativePath("manifest.json")).toBe("");
    expect(normalizePlayZoneEntryRelativePath("game/index.html")).toBe("game/index.html");
  });
});
