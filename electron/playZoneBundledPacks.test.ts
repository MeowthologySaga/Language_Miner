import fs from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectPlayZonePack } from "./playZoneManifest";
import {
  listPlayZonePacksWithOfficialCatalog,
  OFFICIAL_PLAY_ZONE_PACKS
} from "./playZoneOfficialCatalog";
import {
  downloadAndInstallOfficialPlayZonePack,
  isAllowedOfficialPlayZoneDownloadUrl,
  OFFICIAL_DOWNLOAD_TIMEOUT_CODES,
  writeAllSync
} from "./playZoneOfficialInstaller";
import { installPlayZoneSnapshot } from "./playZoneSnapshotStore";

const officialGameAssets = require("../scripts/release/official-game-assets.cjs") as Array<{
  id: string;
  repository: string;
  tag: string;
  commit: string;
  version: string;
  fileName: string;
  bytes: number;
  archiveSha256: string;
  packSha256: string;
}>;

const temporaryRoots: string[] = [];
const officialSourceFolders = OFFICIAL_PLAY_ZONE_PACKS.map((pack) =>
  path.join(process.cwd(), "cartridges", pack.fileName.replace(/-\d+\.\d+\.\d+\.lemgame$/, ""))
);
const hasOfficialSources = officialSourceFolders.every((folderPath) =>
  fs.existsSync(path.join(folderPath, "manifest.json"))
);
const sourceIt = hasOfficialSources ? it : it.skip;
const hasOfficialArchives = OFFICIAL_PLAY_ZONE_PACKS.every((pack) =>
  fs.existsSync(path.join(process.cwd(), "artifacts", "official-game-downloads", pack.fileName))
);
const archiveIt = hasOfficialArchives ? it : it.skip;

afterEach(() => {
  for (const rootPath of temporaryRoots.splice(0)) {
    fs.rmSync(rootPath, { recursive: true, force: true });
  }
});

describe("official on-demand PlayZone games", () => {
  it("publishes all three developer-official games exactly once", () => {
    expect(OFFICIAL_PLAY_ZONE_PACKS.map((pack) => pack.id)).toEqual([
      "meowthology.abyss-summoner",
      "meowthology.cat-odyssey",
      "meowthology.drillheart-defense"
    ]);
    expect(new Set(OFFICIAL_PLAY_ZONE_PACKS.map((pack) => pack.fileName)).size).toBe(3);
    expect(new Set(OFFICIAL_PLAY_ZONE_PACKS.map((pack) => pack.download.archiveSha256)).size).toBe(3);
  });

  it("lists every official game as installable without putting it in the app bundle", () => {
    const installedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lem-official-catalog-"));
    temporaryRoots.push(installedRoot);
    const entries = listPlayZonePacksWithOfficialCatalog(installedRoot);
    expect(entries).toHaveLength(3);
    for (const entry of entries) {
      expect(entry.installed).toBe(false);
      expect(entry.status).toBe("quarantined");
      expect(entry.securityReport).toBeUndefined();
      expect(entry.bundled).toBe(false);
      expect(entry.officialDownload?.downloadBytes).toBeGreaterThan(0);
      expect(entry.sourcePath).toBe(`official-download:${entry.id}`);
    }

    const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
    expect(packageJson.build.files).not.toContain("cartridges/**/*");
  });

  it("allows only HTTPS GitHub release hosts for the official download chain", () => {
    const lockedAssets = new Map(officialGameAssets.map((asset) => [asset.id, asset]));
    for (const pack of OFFICIAL_PLAY_ZONE_PACKS) {
      const asset = lockedAssets.get(pack.id);
      expect(asset, pack.id).toBeDefined();
      expect(isAllowedOfficialPlayZoneDownloadUrl(pack.download.assetUrl)).toBe(true);
      expect(pack.download.assetUrl).toBe(
        `https://github.com/${asset?.repository}/releases/download/${asset?.tag}/${asset?.fileName}`
      );
      expect(pack.sourceUrl).toBe(`https://github.com/${asset?.repository}`);
      expect(pack.version).toBe(asset?.version);
      expect(pack.fileName).toBe(asset?.fileName);
      expect(pack.download.downloadBytes).toBe(asset?.bytes);
      expect(pack.download.archiveSha256).toBe(asset?.archiveSha256);
      expect(pack.download.packSha256).toBe(asset?.packSha256);
      expect(asset?.commit).toMatch(/^[a-f0-9]{40}$/);
      expect(pack.download.archiveSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(pack.download.packSha256).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(isAllowedOfficialPlayZoneDownloadUrl("http://github.com/owner/repo/file")).toBe(false);
    expect(isAllowedOfficialPlayZoneDownloadUrl("https://github.com.evil.example/file")).toBe(false);
    expect(isAllowedOfficialPlayZoneDownloadUrl("file:///C:/game.lemgame")).toBe(false);
  });

  it("finishes short synchronous writes without losing downloaded bytes", () => {
    const source = Buffer.from("verified official archive bytes", "utf8");
    const writtenChunks: Buffer[] = [];

    writeAllSync(123, source, (_descriptor, buffer, offset, length) => {
      const written = Math.min(3, length);
      writtenChunks.push(Buffer.from(buffer.subarray(offset, offset + written)));
      return written;
    });

    expect(Buffer.concat(writtenChunks)).toEqual(source);
    expect(() => writeAllSync(123, source, () => 0)).toThrow(/could not finish writing/);
  });

  archiveIt.each(OFFICIAL_PLAY_ZONE_PACKS.map((pack) => [pack.id, pack] as const))(
    "downloads, verifies, installs, and removes the temporary archive for %s",
    async (_packId, pack) => {
    const folderName = pack.fileName.replace(/-\d+\.\d+\.\d+\.lemgame$/, "");
    // Use the byte-exact archive already verified by the hydrator. Rebuilding a ZIP from
    // extracted files changes DOS timestamp bytes across time zones even when content is identical.
    const archive = fs.readFileSync(
      path.join(process.cwd(), "artifacts", "official-game-downloads", pack.fileName)
    );
    expect(archive.length).toBe(pack.download.downloadBytes);
    expect(createHash("sha256").update(archive).digest("hex")).toBe(pack.download.archiveSha256);

    const qaRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lem-official-install-"));
    temporaryRoots.push(qaRoot);
    const progressStates: string[] = [];
    const installed = await downloadAndInstallOfficialPlayZonePack({
      packId: pack.id,
      requestId: `qa-official-install-${folderName}`,
      downloadRootPath: path.join(qaRoot, "downloads"),
      archiveCacheRootPath: path.join(qaRoot, "cache"),
      installedRootPath: path.join(qaRoot, "installed"),
      signal: new AbortController().signal,
      fetchImpl: (async () => new Response(new Uint8Array(archive), {
        status: 200,
        headers: { "content-length": String(archive.length) }
      })) as typeof fetch,
      onProgress: (progress) => progressStates.push(progress.state)
    });

    expect(installed).toMatchObject({ id: pack.id, installed: true, status: "trusted_official" });
    expect(installed.entryUrl).toMatch(/^lem-playzone-install:/);
    expect(progressStates).toContain("downloading");
    expect(progressStates).toEqual(expect.arrayContaining(["verifying", "installing", "complete"]));
    expect(collectFiles(path.join(qaRoot, "downloads"))).toEqual([]);
    expect(
      listPlayZonePacksWithOfficialCatalog(path.join(qaRoot, "installed")).find(
        (entry) => entry.id === pack.id
      )
    ).toMatchObject({
      id: pack.id,
      installed: true,
      officialUpdateAvailable: false
    });
    },
    30_000
  );

  it.each([
    ["no progress", { overallMs: 100, noProgressMs: 10 }, OFFICIAL_DOWNLOAD_TIMEOUT_CODES.noProgress],
    ["overall", { overallMs: 10, noProgressMs: 100 }, OFFICIAL_DOWNLOAD_TIMEOUT_CODES.overall]
  ] as const)("stops a stalled %s download with a retryable timeout", async (_label, timeouts, code) => {
    const pack = OFFICIAL_PLAY_ZONE_PACKS[0];
    const qaRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lem-official-timeout-"));
    temporaryRoots.push(qaRoot);
    const stalledBody = new ReadableStream<Uint8Array>({ start() {} });

    const operation = downloadAndInstallOfficialPlayZonePack({
      packId: pack.id,
      requestId: `qa-timeout-${code.toLowerCase()}`,
      downloadRootPath: path.join(qaRoot, "downloads"),
      archiveCacheRootPath: path.join(qaRoot, "cache"),
      installedRootPath: path.join(qaRoot, "installed"),
      signal: new AbortController().signal,
      fetchImpl: (async () => new Response(stalledBody, {
        status: 200,
        headers: { "content-length": String(pack.download.downloadBytes) }
      })) as typeof fetch,
      downloadTimeouts: timeouts,
      onProgress() {}
    });

    await expect(operation).rejects.toMatchObject({ code, retryable: true });
    expect(collectFiles(path.join(qaRoot, "downloads"))).toEqual([]);
  });

  it("fails a missing GitHub release asset immediately and removes partial downloads", async () => {
    const pack = OFFICIAL_PLAY_ZONE_PACKS[0];
    const qaRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lem-official-404-"));
    temporaryRoots.push(qaRoot);

    const operation = downloadAndInstallOfficialPlayZonePack({
      packId: pack.id,
      requestId: "qa-http-404",
      downloadRootPath: path.join(qaRoot, "downloads"),
      archiveCacheRootPath: path.join(qaRoot, "cache"),
      installedRootPath: path.join(qaRoot, "installed"),
      signal: new AbortController().signal,
      fetchImpl: (async () => new Response("missing", { status: 404 })) as typeof fetch,
      onProgress() {}
    });

    await expect(operation).rejects.toThrow("HTTP 404");
    expect(collectFiles(path.join(qaRoot, "downloads"))).toEqual([]);
  });

  it("removes only a retired app-managed Diamond Bistro snapshot and preserves its save data", () => {
    const qaRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lem-retired-playzone-"));
    temporaryRoots.push(qaRoot);
    const packRoot = createStrictPackFixture(qaRoot, "lem.diamond-bistro", "Diamond Bistro");
    const installedRoot = path.join(qaRoot, "installed");
    const saveRoot = path.join(qaRoot, "saves", "lem.diamond-bistro");
    fs.mkdirSync(saveRoot, { recursive: true });
    const savePath = path.join(saveRoot, "save.json");
    fs.writeFileSync(savePath, JSON.stringify({ day: 12 }));
    const installed = installPlayZoneSnapshot(installedRoot, {
      packRootPath: packRoot,
      sourceType: "folder",
      fileName: "diamond-bistro"
    }, {
      requestedInstallationId: "official-lem.diamond-bistro-retired",
      trustedOfficial: true,
      bundled: true
    });
    expect(fs.existsSync(path.join(installedRoot, installed.installationId!))).toBe(true);

    const entries = listPlayZonePacksWithOfficialCatalog(installedRoot);

    expect(entries.some((entry) => entry.id === "lem.diamond-bistro")).toBe(false);
    expect(fs.existsSync(path.join(installedRoot, installed.installationId!))).toBe(false);
    expect(JSON.parse(fs.readFileSync(savePath, "utf8"))).toEqual({ day: 12 });
  });

  sourceIt("keeps every official source strict enough to become trusted_official", () => {
    for (const pack of OFFICIAL_PLAY_ZONE_PACKS) {
      const folderName = pack.fileName.replace(/-\d+\.\d+\.\d+\.lemgame$/, "");
      const result = inspectPlayZonePack(
        path.join(process.cwd(), "cartridges", folderName),
        { trustedOfficial: true }
      );
      expect(result.id).toBe(pack.id);
      expect(result.securityReport.status).toBe("trusted_official");
      expect(result.securityReport.packSha256).toBe(pack.download.packSha256);
      expect(result.securityReport.issues).toEqual([]);
      expect(result.permissions).toMatchObject({ network: false, externalLinks: false, cardRead: false });
    }
  });

  sourceIt("keeps optimized downloadable assets within the release size budgets", () => {
    const budgets = new Map([
      ["abyss-summoner", 65 * 1024 * 1024],
      ["cat-odyssey", 105 * 1024 * 1024],
      ["drillheart-defense", 20 * 1024 * 1024]
    ]);
    for (const [folderName, maxBytes] of budgets) {
      const files = collectFiles(path.join(process.cwd(), "cartridges", folderName));
      const totalBytes = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
      expect(totalBytes, folderName).toBeLessThanOrEqual(maxBytes);
      expect(files.some((file) => file.endsWith(".webp")), folderName).toBe(true);
      expect(files.filter((file) => /(?:\.png|\.wav|\.gif|\.map|\.log)$/i.test(file))).toEqual([]);
      expect(files.filter((file) => /(?:^|[\\/])(?:node_modules|source|raw|prompts?)(?:[\\/]|$)/i.test(file))).toEqual([]);
    }
  });
});

function collectFiles(rootPath: string) {
  const files: string[] = [];
  const visit = (folderPath: string) => {
    for (const entry of fs.readdirSync(folderPath, { withFileTypes: true })) {
      const candidate = path.join(folderPath, entry.name);
      if (entry.isDirectory()) visit(candidate);
      else if (entry.isFile()) files.push(candidate);
    }
  };
  visit(rootPath);
  return files;
}

function createStrictPackFixture(rootPath: string, id: string, title: string) {
  const packRoot = path.join(rootPath, "retired-source");
  const runtimeFiles = {
    "game/index.html": "<!doctype html><script src=\"./main.js\"></script>",
    "game/main.js": "window.retiredPackLoaded = true;"
  };
  for (const [relativePath, contents] of Object.entries(runtimeFiles)) {
    const filePath = path.join(packRoot, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
  }
  fs.writeFileSync(path.join(packRoot, "manifest.json"), JSON.stringify({
    schemaVersion: 1,
    contentType: "game_pack",
    id,
    lineageId: "11111111-1111-4111-8111-111111111111",
    version: "1.0.0",
    minPlayZoneVersion: "0.1.0-beta.1",
    title,
    creator: { name: "Language Miner" },
    license: "GPL-3.0-only",
    sourceUrl: "https://github.com/MeowthologySaga/Language_Miner",
    permissions: {
      walletSpend: false,
      storage: true,
      network: false,
      externalLinks: false,
      cardRead: false
    },
    entry: { type: "html", path: "game/index.html" },
    integrity: {
      files: Object.fromEntries(Object.entries(runtimeFiles).map(([name, contents]) => [
        name,
        createHash("sha256").update(contents).digest("hex")
      ]))
    }
  }));
  return packRoot;
}
