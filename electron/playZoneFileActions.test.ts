import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { crc32 } from "./playZoneArchive";
import {
  authorizePlayZoneRuntimeEntry,
  installPlayZonePack,
  listInstalledPlayZonePacks,
  scanPlayZoneLibraryFolder,
  scanPlayZonePackFile
} from "./playZoneFileActions";

describe("playZoneFileActions", () => {
  it("marks only strict, integrity-checked manifests as executable", () => {
    const libraryPath = temporaryFolder("library");
    const packPath = path.join(libraryPath, "folder-pack.lem");
    writeStrictPack(packPath, {
      id: "creator.folder-pack",
      title: "Folder Pack",
      permissions: {
        walletSpend: true,
        storage: true,
        network: false,
        externalLinks: false,
        cardRead: false
      },
      economy: {
        diamondActions: [
          { id: "summon", amount: 30, reason: "Summon hero", requiresConfirm: false, repeatable: true }
        ]
      }
    });

    const entry = scanPlayZoneLibraryFolder(libraryPath).entries[0];
    expect(entry).toMatchObject({
      id: "creator.folder-pack",
      creator: "Creator",
      lineageId: "11111111-1111-4111-8111-111111111111",
      version: "1.2.3",
      minPlayZoneVersion: "0.1.0-beta.1",
      saveSchemaVersion: "2",
      status: "ready",
      sourceType: "folder",
      license: "CC-BY-4.0",
      sourceUrl: "https://github.com/example/folder-pack",
      permissions: {
        walletSpend: true,
        storage: true,
        network: false,
        externalLinks: false,
        cardRead: false
      },
      diamondActions: [
        { id: "summon", amount: 30, reason: "Summon hero", requiresConfirm: true, repeatable: true }
      ]
    });
    expect(entry.entryUrl).toBeUndefined();
    expect(entry.securityReport?.packSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps legacy manifests in warning state without an executable entry", () => {
    const libraryPath = temporaryFolder("legacy");
    const packPath = path.join(libraryPath, "legacy.lem");
    fs.mkdirSync(path.join(packPath, "game"), { recursive: true });
    fs.writeFileSync(path.join(packPath, "game", "index.html"), "<!doctype html>");
    fs.writeFileSync(path.join(packPath, "manifest.json"), JSON.stringify({
      contentType: "game_pack",
      id: "creator.legacy",
      title: "Legacy Pack",
      entry: { type: "iframe", path: "game/index.html" }
    }));

    const entry = scanPlayZoneLibraryFolder(libraryPath).entries[0];
    expect(entry.status).toBe("warning");
    expect(entry.entryUrl).toBeUndefined();
    expect(entry.securityReport?.issues.map((item) => item.code)).toContain("integrity_missing");
  });

  it("blocks path escapes, non-HTML entries, and unsupported network permissions", () => {
    const libraryPath = temporaryFolder("blocked");
    const packPath = path.join(libraryPath, "blocked.lem");
    writeStrictPack(packPath, {
      entry: { type: "iframe", path: "../outside.js" },
      permissions: {
        walletSpend: false,
        storage: false,
        network: true,
        externalLinks: true,
        cardRead: false
      }
    });

    const entry = scanPlayZoneLibraryFolder(libraryPath).entries[0];
    expect(entry.status).toBe("blocked");
    expect(entry.entryUrl).toBeUndefined();
    expect(entry.securityReport?.issues.map((item) => item.code)).toEqual(
      expect.arrayContaining(["entry_path_invalid", "permission_network_unsupported"])
    );
  });

  it("installs an archive only into an immutable snapshot and authorizes that snapshot", () => {
    const libraryPath = temporaryFolder("archive-library");
    const cachePath = temporaryFolder("archive-cache");
    const archivePath = path.join(libraryPath, "archive-game.lemgame");
    const files = strictPackFiles({ id: "creator.archive-game", title: "Archive Game" });
    writeStoredZip(archivePath, files);

    const entry = scanPlayZonePackFile(archivePath, cachePath);
    expect(entry.status).toBe("ready");
    expect(entry.securityReport?.archiveSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(entry.entryUrl).toBeUndefined();

    const installedRoot = temporaryFolder("archive-installed");
    const installed = installPlayZonePack(
      { sourcePath: archivePath },
      cachePath,
      installedRoot
    );
    const authorization = authorizePlayZoneRuntimeEntry(installed.entryUrl ?? "", installedRoot);
    expect(authorization?.authorization).toMatchObject({
      cartridgeId: "creator.archive-game",
      status: "ready"
    });

    fs.writeFileSync(archivePath, "tampered source after install");
    expect(authorizePlayZoneRuntimeEntry(installed.entryUrl ?? "", installedRoot)).not.toBeNull();

    const snapshotEntryPath = path.join(
      authorization?.snapshotRootPath ?? "",
      authorization?.relativeEntryPath ?? ""
    );
    fs.writeFileSync(snapshotEntryPath, "tampered snapshot");
    expect(authorizePlayZoneRuntimeEntry(installed.entryUrl ?? "", installedRoot)).toBeNull();
    const blocked = listInstalledPlayZonePacks(installedRoot)[0];
    expect(blocked).toMatchObject({
      installed: true,
      status: "blocked"
    });
    expect(blocked.entryUrl).toBeUndefined();
  });

  it("quarantines archives with traversal paths or invalid CRC values", () => {
    const cachePath = temporaryFolder("malicious-cache");
    const traversalPath = path.join(temporaryFolder("malicious"), "traversal.lemgame");
    writeStoredZip(traversalPath, { "../outside.html": "bad" });
    const traversal = scanPlayZonePackFile(traversalPath, cachePath);
    expect(traversal.status).toBe("quarantined");
    expect(traversal.message).toContain("unsafe file path");

    const crcPath = path.join(path.dirname(traversalPath), "crc.lemgame");
    writeStoredZip(crcPath, { "game/index.html": "content" }, { corruptCrc: true });
    const crc = scanPlayZonePackFile(crcPath, cachePath);
    expect(crc.status).toBe("quarantined");
    expect(crc.message).toContain("CRC-32");
  });

  it("does not echo a missing local source path from an installation failure", () => {
    const privatePath = "C:\\Users\\Alice\\Private\\secret-game.lem";
    let message = "";
    try {
      installPlayZonePack(
        { sourcePath: privatePath },
        temporaryFolder("redaction-cache"),
        temporaryFolder("redaction-installed")
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/source is no longer available|local file changed or became unavailable/);
    expect(message).not.toContain("Alice");
  });
});

function temporaryFolder(label: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `lem-playzone-${label}-`));
}

function writeStrictPack(folderPath: string, overrides: Record<string, unknown> = {}) {
  const files = strictPackFiles(overrides);
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(folderPath, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
}

function strictPackFiles(overrides: Record<string, unknown> = {}) {
  const runtimeFiles: Record<string, string> = {
    "game/index.html": "<!doctype html><script src=\"./main.js\"></script>",
    "game/main.js": "window.played = true;",
    "assets/thumbnail.png": "thumbnail"
  };
  const manifest = {
    schemaVersion: 1,
    contentType: "game_pack",
    id: "creator.folder-pack",
    lineageId: "11111111-1111-4111-8111-111111111111",
    version: "1.2.3",
    minPlayZoneVersion: "0.1.0-beta.1",
    title: "Folder Pack",
    creator: { name: "Creator" },
    description: "A local folder game.",
    license: "CC-BY-4.0",
    sourceUrl: "https://github.com/example/folder-pack",
    tags: ["local", "test"],
    metadata: { thumbnail: "assets/thumbnail.png" },
    save: { schemaVersion: 2 },
    permissions: {
      walletSpend: false,
      storage: true,
      network: false,
      externalLinks: false,
      cardRead: false
    },
    entry: { type: "iframe", path: "game/index.html" },
    integrity: {
      files: Object.fromEntries(
        Object.entries(runtimeFiles).map(([name, content]) => [name, sha256(content)])
      )
    },
    ...overrides
  };
  return { "manifest.json": JSON.stringify(manifest), ...runtimeFiles };
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function writeStoredZip(
  filePath: string,
  files: Record<string, string>,
  options: { corruptCrc?: boolean } = {}
) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = Buffer.from(name, "utf8");
    const contentBytes = Buffer.from(content, "utf8");
    const checksum = options.corruptCrc ? (crc32(contentBytes) ^ 0xffffffff) >>> 0 : crc32(contentBytes);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(contentBytes.length, 18);
    localHeader.writeUInt32LE(contentBytes.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localParts.push(localHeader, nameBytes, contentBytes);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(contentBytes.length, 20);
    centralHeader.writeUInt32LE(contentBytes.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + contentBytes.length;
  }
  const localData = Buffer.concat(localParts);
  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(localData.length, 16);
  fs.writeFileSync(filePath, Buffer.concat([localData, centralDirectory, eocd]));
}
