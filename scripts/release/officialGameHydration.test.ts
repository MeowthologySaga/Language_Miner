import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const AdmZip = require("adm-zip") as new () => {
  addFile(name: string, contents: Buffer): void;
  getEntries(): Array<{ header: { time: Date } }>;
  toBuffer(): Buffer;
};
const {
  assertAllowedDownloadResponseUrl,
  downloadVerifiedArchive,
  extractVerifiedArchive,
  normalizeArchivePath,
  parseCliOptions,
  preflightArchiveEntries,
  verifyExtractedPack,
  verifyRemoteTagCommit
} = require("./hydrate-official-games.cjs") as {
  assertAllowedDownloadResponseUrl(value: string): void;
  downloadVerifiedArchive(
    definition: Record<string, unknown>,
    url: string,
    cachePath: string,
    fetchImpl: typeof fetch
  ): Promise<string>;
  extractVerifiedArchive(
    archivePath: string,
    destination: string,
    definition: Record<string, unknown>,
    options?: { replaceExisting?: boolean }
  ): { reusedExisting: boolean };
  normalizeArchivePath(value: unknown): string;
  parseCliOptions(args: string[]): Record<string, boolean>;
  preflightArchiveEntries(entries: unknown[], definition: Record<string, unknown>): unknown[];
  verifyExtractedPack(rootPath: string, definition: Record<string, unknown>): unknown;
  verifyRemoteTagCommit(definition: Record<string, unknown>, fetchImpl: typeof fetch): Promise<void>;
};

const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lem-official-hydration-"));

afterAll(() => {
  fs.rmSync(workRoot, { recursive: true, force: true });
});

describe("official game hydration release boundaries", () => {
  it("accepts only canonical Windows-safe archive paths", () => {
    expect(normalizeArchivePath("game/index.html")).toBe("game/index.html");
    for (const unsafePath of [
      "../outside.txt",
      "/absolute.txt",
      "C:/absolute.txt",
      "server\\share.txt",
      "game//index.html",
      "game/source/private.js",
      "game/CON.txt",
      "game/trailing. ",
      "game/name:stream",
      `game/${"e\u0301"}.txt`
    ]) {
      expect(normalizeArchivePath(unsafePath), unsafePath).toBe("");
    }
  });

  it("rejects symlinks and declared ZIP bombs before decompression", () => {
    const definition = { fileName: "fixture.lemgame" };
    const symlink = {
      entryName: "game/link",
      isDirectory: false,
      header: { attr: 0xa0000000, flags: 0, size: 4, compressedSize: 4, method: 0 }
    };
    expect(() => preflightArchiveEntries([symlink], definition)).toThrow(/symbolic link/);

    const ratioBomb = {
      entryName: "game/bomb.bin",
      isDirectory: false,
      header: { attr: 0, flags: 0, size: 201, compressedSize: 1, method: 8 }
    };
    expect(() => preflightArchiveEntries([ratioBomb], definition)).toThrow(/compression-ratio/);
  });

  it("streams an exact verified download while replacing only a corrupt cache file", async () => {
    const contents = Buffer.from("locked official game archive", "utf8");
    const definition = downloadDefinition(contents);
    const cachePath = path.join(workRoot, "downloads", definition.fileName as string);
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, "corrupt-cache");

    const result = await downloadVerifiedArchive(
      definition,
      "https://github.com/Example/Game/releases/download/v1.0.0/fixture.lemgame",
      cachePath,
      (async () => new Response(contents, {
        status: 200,
        headers: { "content-length": String(contents.length) }
      })) as typeof fetch
    );

    expect(result).toBe(cachePath);
    expect(fs.readFileSync(cachePath)).toEqual(contents);
  });

  it("stops a chunked response as soon as it exceeds the locked byte count", async () => {
    const expected = Buffer.from("exact", "utf8");
    const definition = downloadDefinition(expected);
    const cachePath = path.join(workRoot, "overflow", definition.fileName as string);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(expected);
        controller.enqueue(Buffer.from("overflow"));
        controller.close();
      }
    });

    await expect(downloadVerifiedArchive(
      definition,
      "https://github.com/Example/Game/releases/download/v1.0.0/fixture.lemgame",
      cachePath,
      (async () => new Response(body, { status: 200 })) as typeof fetch
    )).rejects.toThrow(/exceeded its locked size/);
    expect(fs.existsSync(cachePath)).toBe(false);
    expect(
      fs.existsSync(path.dirname(cachePath))
        ? fs.readdirSync(path.dirname(cachePath)).filter((name) => name.includes(".part-"))
        : []
    ).toEqual([]);
  });

  it("allows only GitHub-controlled HTTPS redirect targets", () => {
    expect(() => assertAllowedDownloadResponseUrl(
      "https://release-assets.githubusercontent.com/github-production-release-asset/file"
    )).not.toThrow();
    expect(() => assertAllowedDownloadResponseUrl("https://github.com.evil.example/file")).toThrow(
      /outside GitHub-controlled/
    );
    expect(() => assertAllowedDownloadResponseUrl("http://github.com/file")).toThrow(
      /outside GitHub-controlled/
    );
  });

  it("fails closed on mistyped CLI flags and verifies lightweight or annotated source tags", async () => {
    expect(() => parseCliOptions(["--offine"])).toThrow(/Unknown/);
    const commit = "a".repeat(40);
    const tagObject = "b".repeat(40);
    const definition = { repository: "Example/Game", tag: "v1.0.0", commit };

    await expect(verifyRemoteTagCommit(
      definition,
      (async (input) => {
        const url = String(input);
        const object = url.includes("/git/ref/")
          ? { type: "tag", sha: tagObject }
          : { type: "commit", sha: commit };
        return new Response(JSON.stringify({ object }), { status: 200 });
      }) as typeof fetch
    )).resolves.toBeUndefined();

    await expect(verifyRemoteTagCommit(
      definition,
      (async () => new Response(JSON.stringify({
        object: { type: "commit", sha: "c".repeat(40) }
      }), { status: 200 })) as typeof fetch
    )).rejects.toThrow(/no longer points to its locked commit/);
  });

  it("preserves an existing non-matching folder and reuses an already verified folder", () => {
    const fixture = createPackFixture(path.join(workRoot, "pack-fixture"));
    const occupied = path.join(workRoot, "occupied-game");
    fs.mkdirSync(occupied);
    fs.writeFileSync(path.join(occupied, "private-source.txt"), "keep me");

    expect(() => extractVerifiedArchive(fixture.archivePath, occupied, fixture.definition)).toThrow(
      /Refusing to replace/
    );
    expect(fs.readFileSync(path.join(occupied, "private-source.txt"), "utf8")).toBe("keep me");

    const hydrated = path.join(workRoot, "hydrated-game");
    expect(extractVerifiedArchive(fixture.archivePath, hydrated, fixture.definition)).toEqual({
      reusedExisting: false
    });
    expect(verifyExtractedPack(hydrated, fixture.definition)).toBeTruthy();
    expect(extractVerifiedArchive(fixture.archivePath, hydrated, fixture.definition)).toEqual({
      reusedExisting: true
    });
  });
});

function downloadDefinition(contents: Buffer) {
  return {
    repository: "Example/Game",
    tag: "v1.0.0",
    fileName: "fixture.lemgame",
    bytes: contents.length,
    archiveSha256: createHash("sha256").update(contents).digest("hex")
  };
}

function createPackFixture(rootPath: string) {
  fs.mkdirSync(rootPath, { recursive: true });
  const runtimePath = "game/index.html";
  const runtimeBytes = Buffer.from("<!doctype html><title>Fixture</title>", "utf8");
  const runtimeSha256 = createHash("sha256").update(runtimeBytes).digest("hex");
  const manifest = {
    schemaVersion: 1,
    contentType: "game_pack",
    id: "test.official-game",
    version: "1.0.0",
    minPlayZoneVersion: "0.1.0-beta.1",
    sourceUrl: "https://github.com/Example/Game",
    entry: { type: "iframe", path: runtimePath },
    integrity: { files: { [runtimePath]: runtimeSha256 } }
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const fingerprint = `${runtimePath}\0${runtimeSha256}\n`;
  const packSha256 = createHash("sha256").update(manifestBytes).update(fingerprint).digest("hex");

  const zip = new AdmZip();
  zip.addFile(runtimePath, runtimeBytes);
  zip.addFile("manifest.json", manifestBytes);
  const fixedTime = new Date("1980-01-01T00:00:00.000Z");
  for (const entry of zip.getEntries()) entry.header.time = fixedTime;
  const archiveBytes = zip.toBuffer();
  const archivePath = path.join(rootPath, "fixture.lemgame");
  fs.writeFileSync(archivePath, archiveBytes);
  return {
    archivePath,
    definition: {
      id: manifest.id,
      folder: "fixture",
      repository: "Example/Game",
      version: manifest.version,
      fileName: "fixture.lemgame",
      bytes: archiveBytes.length,
      archiveSha256: createHash("sha256").update(archiveBytes).digest("hex"),
      packSha256
    }
  };
}
