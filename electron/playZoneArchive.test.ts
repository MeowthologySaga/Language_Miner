import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { crc32, extractPlayZoneArchiveToCache } from "./playZoneArchive";

describe("playZoneArchive", () => {
  it("extracts bounded stored entries and records the archive digest", () => {
    const { archivePath, cachePath } = createArchive([{ name: "game/index.html", content: "safe" }]);
    const result = extractPlayZoneArchiveToCache(archivePath, cachePath);
    expect(result).toMatchObject({ fileCount: 1, extractedBytes: 4 });
    expect(result.archiveSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(fs.readFileSync(path.join(result.rootPath, "game", "index.html"), "utf8")).toBe("safe");
  });

  it("extracts ordinary deflated entries with exact size and CRC checks", () => {
    const content = "A moderately compressible PlayZone file. ".repeat(20);
    const { archivePath, cachePath } = createArchive([
      { name: "game/main.js", content, deflated: true }
    ]);
    const result = extractPlayZoneArchiveToCache(archivePath, cachePath);
    expect(fs.readFileSync(path.join(result.rootPath, "game", "main.js"), "utf8")).toBe(content);
  });

  it("rejects ZIP64 sentinels and out-of-bounds local offsets", () => {
    const zip64 = createArchive([{ name: "game/index.html", content: "safe" }]);
    const zip64Bytes = fs.readFileSync(zip64.archivePath);
    zip64Bytes.writeUInt16LE(0xffff, zip64Bytes.length - 12);
    fs.writeFileSync(zip64.archivePath, zip64Bytes);
    expect(() => extractPlayZoneArchiveToCache(zip64.archivePath, zip64.cachePath)).toThrow(/ZIP64/);

    const offset = createArchive([{ name: "game/index.html", content: "safe" }]);
    const offsetBytes = fs.readFileSync(offset.archivePath);
    const centralOffset = offsetBytes.readUInt32LE(offsetBytes.length - 6);
    offsetBytes.writeUInt32LE(offsetBytes.length + 100, centralOffset + 42);
    fs.writeFileSync(offset.archivePath, offsetBytes);
    expect(() => extractPlayZoneArchiveToCache(offset.archivePath, offset.cachePath)).toThrow(/bounds/);
  });

  it("rejects suspicious compression ratios, symlinks, and case-colliding paths", () => {
    const ratio = createArchive([{ name: "game/index.html", content: "safe" }]);
    const ratioBytes = fs.readFileSync(ratio.archivePath);
    const ratioCentral = ratioBytes.readUInt32LE(ratioBytes.length - 6);
    ratioBytes.writeUInt32LE(1, ratioCentral + 20);
    ratioBytes.writeUInt32LE(1_000, ratioCentral + 24);
    fs.writeFileSync(ratio.archivePath, ratioBytes);
    expect(() => extractPlayZoneArchiveToCache(ratio.archivePath, ratio.cachePath)).toThrow(/compression ratio/);

    const symlink = createArchive([{ name: "game/link", content: "../outside" }]);
    const symlinkBytes = fs.readFileSync(symlink.archivePath);
    const symlinkCentral = symlinkBytes.readUInt32LE(symlinkBytes.length - 6);
    symlinkBytes.writeUInt16LE((3 << 8) | 20, symlinkCentral + 4);
    symlinkBytes.writeUInt32LE((0xa000 * 0x10000) >>> 0, symlinkCentral + 38);
    fs.writeFileSync(symlink.archivePath, symlinkBytes);
    expect(() => extractPlayZoneArchiveToCache(symlink.archivePath, symlink.cachePath)).toThrow(/symbolic links/);

    const duplicate = createArchive([
      { name: "game/Main.js", content: "one" },
      { name: "game/main.js", content: "two" }
    ]);
    expect(() => extractPlayZoneArchiveToCache(duplicate.archivePath, duplicate.cachePath)).toThrow(/case-colliding/);
  });
});

function createArchive(entries: Array<{ name: string; content: string; deflated?: boolean }>) {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "lem-playzone-archive-test-"));
  const archivePath = path.join(rootPath, "pack.lemgame");
  const cachePath = path.join(rootPath, "cache");
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const content = Buffer.from(entry.content, "utf8");
    const compressed = entry.deflated ? zlib.deflateRawSync(content) : content;
    const method = entry.deflated ? 8 : 0;
    const checksum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, name);
    localOffset += local.length + name.length + compressed.length;
  }
  const localData = Buffer.concat(localParts);
  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localData.length, 16);
  fs.writeFileSync(archivePath, Buffer.concat([localData, centralDirectory, eocd]));
  return { archivePath, cachePath };
}
