"use strict";

const { createHash, randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const AdmZip = require("adm-zip");
const officialGames = require("./official-game-assets.cjs");

const repoRoot = path.resolve(__dirname, "..", "..");
const cacheRoot = path.join(repoRoot, "artifacts", "official-game-downloads");
const releaseRoot = path.join(repoRoot, "artifacts", "release");
const cartridgesRoot = path.join(repoRoot, "cartridges");
const MAX_ARCHIVE_ENTRIES = 4_096;
const MAX_SINGLE_FILE_BYTES = 128 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 512 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_COMPRESSION_RATIO = 200;
const FORBIDDEN_SEGMENTS = new Set([".git", ".vscode", "node_modules", "source", "coverage"]);
const FORBIDDEN_FILES = new Set([".lem-archive-cache.json", ".lem-snapshot.json"]);
const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

if (require.main === module) {
  Promise.resolve()
    .then(() => main(parseCliOptions(process.argv.slice(2))))
    .catch((error) => {
      process.stderr.write(`Official game hydration failed: ${safeError(error)}\n`);
      process.exitCode = 1;
    });
}

async function main(options = {}) {
  fs.mkdirSync(cacheRoot, { recursive: true });
  fs.mkdirSync(cartridgesRoot, { recursive: true });
  if (options.publishToRelease) fs.mkdirSync(releaseRoot, { recursive: true });
  assertRealDirectory(cacheRoot, "official game cache");
  assertRealDirectory(cartridgesRoot, "official game cartridge root");
  if (options.publishToRelease) assertRealDirectory(releaseRoot, "release artifact root");
  const results = [];
  for (const definition of officialGames) {
    const archivePath = await obtainArchive(definition, options);
    const destination = path.join(cartridgesRoot, definition.folder);
    const extraction = extractVerifiedArchive(archivePath, destination, definition, options);
    if (options.publishToRelease) {
      const publishedPath = path.join(releaseRoot, definition.fileName);
      publishArchiveSafely(archivePath, publishedPath, definition);
    }
    results.push({
      id: definition.id,
      repository: definition.repository,
      tag: definition.tag,
      commit: definition.commit,
      fileName: definition.fileName,
      bytes: definition.bytes,
      archiveSha256: definition.archiveSha256,
      packSha256: definition.packSha256,
      reusedExistingPack: extraction.reusedExisting
    });
  }
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  return results;
}

async function obtainArchive(definition, options = {}) {
  if (!options.offline) {
    await verifyRemoteTagCommit(definition, options.fetchImpl ?? fetch);
  }
  const releaseCandidate = path.join(releaseRoot, definition.fileName);
  const cachePath = path.join(cacheRoot, definition.fileName);
  for (const candidate of [releaseCandidate, cachePath]) {
    if (isExpectedArchive(candidate, definition)) return candidate;
  }
  if (options.offline) {
    throw new Error(`Missing verified offline archive: ${definition.fileName}`);
  }

  const url = `https://github.com/${definition.repository}/releases/download/${definition.tag}/${definition.fileName}`;
  return downloadVerifiedArchive(definition, url, cachePath, options.fetchImpl ?? fetch);
}

async function downloadVerifiedArchive(definition, url, cachePath, fetchImpl = fetch) {
  if (isExpectedArchive(cachePath, definition)) return cachePath;
  removeInvalidCacheFile(cachePath, definition);

  const partialPath = `${cachePath}.part-${process.pid}-${randomUUID()}`;
  let descriptor;
  try {
    const response = await fetchImpl(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(180_000),
      headers: { "User-Agent": "Language-Miner-release-hydrator" }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while downloading ${definition.repository} ${definition.tag}`);
    }
    assertAllowedDownloadResponseUrl(response.url);
    const contentLengthHeader = response.headers?.get?.("content-length");
    if (contentLengthHeader !== null && contentLengthHeader !== undefined) {
      const contentLength = Number(contentLengthHeader);
      if (!Number.isSafeInteger(contentLength) || contentLength !== definition.bytes) {
        throw new Error(`Official archive Content-Length mismatch: ${definition.fileName}`);
      }
    }
    if (!response.body || typeof response.body.getReader !== "function") {
      throw new Error(`Official archive response body is unavailable: ${definition.fileName}`);
    }

    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    descriptor = fs.openSync(partialPath, "wx");
    const reader = response.body.getReader();
    const digest = createHash("sha256");
    let receivedBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array) || value.byteLength === 0) continue;
      receivedBytes += value.byteLength;
      if (receivedBytes > definition.bytes) {
        await reader.cancel("locked-size-exceeded").catch(() => {});
        throw new Error(`Official archive exceeded its locked size: ${definition.fileName}`);
      }
      const chunk = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
      writeAllSync(descriptor, chunk);
      digest.update(chunk);
    }
    if (receivedBytes !== definition.bytes) {
      throw new Error(`Official archive size mismatch: ${definition.fileName}`);
    }
    if (digest.digest("hex") !== definition.archiveSha256) {
      throw new Error(`Official archive SHA-256 mismatch: ${definition.fileName}`);
    }
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;

    if (isExpectedArchive(cachePath, definition)) {
      fs.rmSync(partialPath, { force: true });
      return cachePath;
    }
    removeInvalidCacheFile(cachePath, definition);
    fs.renameSync(partialPath, cachePath);
    if (!isExpectedArchive(cachePath, definition)) {
      fs.rmSync(cachePath, { force: true });
      throw new Error(`Downloaded official archive failed its final verification: ${definition.fileName}`);
    }
    return cachePath;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(partialPath, { force: true });
  }
}

async function verifyRemoteTagCommit(definition, fetchImpl = fetch) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "Language-Miner-release-hydrator",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  let url = `https://api.github.com/repos/${definition.repository}/git/ref/tags/${encodeURIComponent(definition.tag)}`;
  for (let depth = 0; depth < 5; depth += 1) {
    const response = await fetchImpl(url, {
      headers,
      signal: AbortSignal.timeout(30_000)
    });
    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} while verifying source tag ${definition.repository} ${definition.tag}`
      );
    }
    const payload = await response.json();
    const object = payload?.object;
    if (!object || !/^[0-9a-f]{40}$/.test(String(object.sha ?? ""))) {
      throw new Error(`GitHub returned an invalid source tag object: ${definition.repository}`);
    }
    if (object.type === "commit") {
      if (object.sha !== definition.commit) {
        throw new Error(`Official source tag no longer points to its locked commit: ${definition.repository}`);
      }
      return;
    }
    if (object.type !== "tag") {
      throw new Error(`Official source tag has an unsupported Git object type: ${definition.repository}`);
    }
    url = `https://api.github.com/repos/${definition.repository}/git/tags/${object.sha}`;
  }
  throw new Error(`Official source tag chain is too deep: ${definition.repository}`);
}

function assertAllowedDownloadResponseUrl(value) {
  // Synthetic Response objects used by unit tests have no URL. Real fetch
  // responses do, and redirects must remain on GitHub-controlled HTTPS hosts.
  if (!value) return;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Official game download returned an invalid final URL.");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (
    parsed.protocol !== "https:" ||
    (hostname !== "github.com" && !hostname.endsWith(".githubusercontent.com"))
  ) {
    throw new Error("Official game download redirected outside GitHub-controlled HTTPS hosts.");
  }
}

function removeInvalidCacheFile(filePath, definition) {
  if (!fs.existsSync(filePath) || isExpectedArchive(filePath, definition)) return;
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() && !stat.isSymbolicLink()) {
    throw new Error(`Official archive cache path is not a regular file: ${definition.fileName}`);
  }
  fs.rmSync(filePath, { force: true });
}

function publishArchiveSafely(sourcePath, destinationPath, definition) {
  if (isExpectedArchive(destinationPath, definition)) return;
  if (!isExpectedArchive(sourcePath, definition)) {
    throw new Error(`Refusing to publish an unverified archive: ${definition.fileName}`);
  }
  if (fs.existsSync(destinationPath)) {
    const stat = fs.lstatSync(destinationPath);
    if (!stat.isFile() && !stat.isSymbolicLink()) {
      throw new Error(`Release archive destination is not a regular file: ${definition.fileName}`);
    }
  }
  const temporaryPath = `${destinationPath}.tmp-${process.pid}-${randomUUID()}`;
  const backupPath = `${destinationPath}.backup-${process.pid}-${randomUUID()}`;
  let installed = false;
  let movedExistingToBackup = false;
  try {
    fs.copyFileSync(sourcePath, temporaryPath, fs.constants.COPYFILE_EXCL);
    if (!isExpectedArchive(temporaryPath, definition)) {
      throw new Error(`Copied release archive failed verification: ${definition.fileName}`);
    }
    if (!fs.existsSync(destinationPath)) {
      fs.renameSync(temporaryPath, destinationPath);
      installed = true;
    } else {
      fs.renameSync(destinationPath, backupPath);
      movedExistingToBackup = true;
      try {
        fs.renameSync(temporaryPath, destinationPath);
        installed = true;
      } catch (error) {
        fs.renameSync(backupPath, destinationPath);
        movedExistingToBackup = false;
        throw error;
      }
    }
    if (!isExpectedArchive(destinationPath, definition)) {
      throw new Error(`Published official archive failed its final verification: ${definition.fileName}`);
    }
    if (movedExistingToBackup) {
      fs.rmSync(backupPath, { force: true });
      movedExistingToBackup = false;
    }
  } catch (error) {
    if (movedExistingToBackup && fs.existsSync(backupPath)) {
      removeManagedRegularPath(destinationPath);
      fs.renameSync(backupPath, destinationPath);
      movedExistingToBackup = false;
    } else if (installed) {
      removeManagedRegularPath(destinationPath);
    }
    throw error;
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
}

function removeManagedRegularPath(filePath) {
  if (!fs.existsSync(filePath)) return;
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() && !stat.isSymbolicLink()) {
    throw new Error("Refusing to remove a non-file release archive path.");
  }
  fs.rmSync(filePath, { force: true });
}

function isExpectedArchive(filePath, definition) {
  try {
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== definition.bytes) return false;
    return hashFile(filePath) === definition.archiveSha256;
  } catch {
    return false;
  }
}

function extractVerifiedArchive(archivePath, destination, definition, options = {}) {
  if (!isExpectedArchive(archivePath, definition)) {
    throw new Error(`Refusing to extract an unverified archive: ${definition.fileName}`);
  }
  if (fs.existsSync(destination)) {
    const stat = fs.lstatSync(destination);
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing to hydrate through a symbolic-link destination: ${definition.folder}`);
    }
    try {
      verifyExtractedPack(destination, definition);
      return { reusedExisting: true };
    } catch (error) {
      if (!options.replaceExisting) {
        throw new Error(
          `Refusing to replace an existing non-matching game folder: ${definition.folder}. ` +
          "Use --replace-existing only after preserving local work."
        );
      }
    }
  }

  const uniqueSuffix = `${process.pid}-${randomUUID()}`;
  const staging = `${destination}.hydrate-${uniqueSuffix}`;
  fs.mkdirSync(staging, { recursive: false });
  try {
    const zip = new AdmZip(archivePath);
    const entries = zip.getEntries();
    const preparedEntries = preflightArchiveEntries(entries, definition);
    for (const item of preparedEntries) {
      const outputPath = path.join(staging, ...item.relativePath.split("/"));
      assertPathInside(outputPath, staging);
      if (item.entry.isDirectory) {
        fs.mkdirSync(outputPath, { recursive: true });
        continue;
      }
      const data = item.entry.getData();
      if (data.length !== item.uncompressedSize) {
        throw new Error(`Official archive entry size or CRC is invalid: ${definition.fileName}`);
      }
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, data, { flag: "wx" });
    }
    verifyExtractedPack(staging, definition);
    replaceDirectorySafely(staging, destination, Boolean(options.replaceExisting));
    return { reusedExisting: false };
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

function preflightArchiveEntries(entries, definition) {
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > MAX_ARCHIVE_ENTRIES) {
    throw new Error(`Official archive entry count is invalid: ${definition.fileName}`);
  }
  const seen = new Set();
  const prepared = [];
  let totalBytes = 0;
  for (const entry of entries) {
    const relativePath = normalizeArchivePath(entry.entryName);
    if (!relativePath) {
      throw new Error(`Official archive contains an unsafe path: ${definition.fileName}`);
    }
    const key = relativePath.toLowerCase();
    if (seen.has(key)) {
      throw new Error(`Official archive contains duplicate or case-colliding paths: ${definition.fileName}`);
    }
    seen.add(key);
    const unixType = (Number(entry.header?.attr) >>> 16) & 0xf000;
    if (unixType === 0xa000) {
      throw new Error(`Official archive contains a symbolic link: ${definition.fileName}`);
    }
    if ((Number(entry.header?.flags) & 1) !== 0) {
      throw new Error(`Official archive contains an encrypted entry: ${definition.fileName}`);
    }
    if (entry.isDirectory) {
      prepared.push({ entry, relativePath, uncompressedSize: 0 });
      continue;
    }
    const uncompressedSize = Number(entry.header?.size);
    const compressedSize = Number(entry.header?.compressedSize);
    const method = Number(entry.header?.method);
    if (
      !Number.isSafeInteger(uncompressedSize) ||
      !Number.isSafeInteger(compressedSize) ||
      uncompressedSize < 0 ||
      compressedSize < 0 ||
      ![0, 8].includes(method)
    ) {
      throw new Error(`Official archive contains an unsupported ZIP entry: ${definition.fileName}`);
    }
    if (uncompressedSize > MAX_SINGLE_FILE_BYTES) {
      throw new Error(`Official archive contains an oversized file: ${definition.fileName}`);
    }
    totalBytes += uncompressedSize;
    if (totalBytes > MAX_UNPACKED_BYTES) {
      throw new Error(`Official archive exceeds the unpacked-size limit: ${definition.fileName}`);
    }
    if (
      (uncompressedSize > 0 && compressedSize === 0) ||
      (compressedSize > 0 && uncompressedSize / compressedSize > MAX_COMPRESSION_RATIO)
    ) {
      throw new Error(`Official archive exceeds the compression-ratio limit: ${definition.fileName}`);
    }
    prepared.push({ entry, relativePath, uncompressedSize });
  }
  return prepared;
}

function verifyExtractedPack(rootPath, definition) {
  const rootStat = fs.lstatSync(rootPath);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(`Official pack root is not a regular directory: ${definition.fileName}`);
  }
  const manifestPath = path.join(rootPath, "manifest.json");
  const manifestStat = fs.lstatSync(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink() || manifestStat.size > MAX_MANIFEST_BYTES) {
    throw new Error(`Official pack manifest is missing or oversized: ${definition.fileName}`);
  }
  if (fs.existsSync(path.join(rootPath, "lem.json"))) {
    throw new Error(`Official pack contains an ambiguous second manifest: ${definition.fileName}`);
  }
  const manifestBytes = fs.readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8").replace(/^\uFEFF/, ""));
  const expectedSourceUrl = `https://github.com/${definition.repository}`;
  if (
    (manifest.schemaVersion ?? manifest.formatVersion) !== 1 ||
    manifest.contentType !== "game_pack" ||
    manifest.id !== definition.id ||
    manifest.version !== definition.version ||
    manifest.minPlayZoneVersion !== "0.1.0-beta.1" ||
    String(manifest.sourceUrl ?? "").replace(/\/$/, "") !== expectedSourceUrl
  ) {
    throw new Error(`Official pack identity or provenance mismatch: ${definition.fileName}`);
  }
  const entryPath = normalizeArchivePath(manifest.entry?.path);
  if (
    !["html", "iframe"].includes(manifest.entry?.type) ||
    !entryPath ||
    entryPath !== manifest.entry.path ||
    path.posix.extname(entryPath).toLowerCase() !== ".html"
  ) {
    throw new Error(`Official pack entry point is invalid: ${definition.fileName}`);
  }

  const declared = manifest.integrity?.files;
  if (!declared || typeof declared !== "object" || Array.isArray(declared)) {
    throw new Error(`Official pack integrity manifest is missing: ${definition.fileName}`);
  }
  const files = collectPackFiles(rootPath, manifestPath);
  const actualByKey = new Map(files.map((file) => [file.relativePath.toLowerCase(), file]));
  const declaredByKey = new Map();
  for (const [rawPath, rawDigest] of Object.entries(declared)) {
    const relativePath = normalizeArchivePath(rawPath);
    const key = relativePath.toLowerCase();
    if (!relativePath || relativePath !== rawPath || declaredByKey.has(key)) {
      throw new Error(`Official pack integrity path is unsafe or duplicated: ${definition.fileName}`);
    }
    const expectedDigest = String(rawDigest).toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(expectedDigest)) {
      throw new Error(`Official pack integrity digest is invalid: ${definition.fileName}`);
    }
    declaredByKey.set(key, expectedDigest);
    const actual = actualByKey.get(key);
    if (!actual || actual.sha256 !== expectedDigest) {
      throw new Error(`Official pack integrity mismatch: ${definition.fileName}`);
    }
  }
  if (declaredByKey.size !== actualByKey.size || !actualByKey.has(entryPath.toLowerCase())) {
    throw new Error(`Official pack integrity file count mismatch: ${definition.fileName}`);
  }

  const fingerprint = files
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
    .map((file) => `${file.relativePath}\0${file.sha256}\n`)
    .join("");
  const packSha256 = createHash("sha256").update(manifestBytes).update(fingerprint).digest("hex");
  if (packSha256 !== definition.packSha256) {
    throw new Error(`Official pack SHA-256 mismatch: ${definition.fileName}`);
  }
  return { fileCount: files.length, packSha256 };
}

function collectPackFiles(rootPath, manifestPath) {
  const files = [];
  const seen = new Set();
  let totalBytes = 0;
  const visit = (folderPath) => {
    for (const entry of fs.readdirSync(folderPath, { withFileTypes: true })) {
      const absolutePath = path.join(folderPath, entry.name);
      const relativePath = path.relative(rootPath, absolutePath).replace(/\\/g, "/");
      if (entry.isSymbolicLink()) {
        throw new Error("Symbolic links are not allowed in official packs.");
      }
      if (entry.isDirectory()) {
        if (!normalizeArchivePath(relativePath)) {
          throw new Error("Official packs contain a forbidden directory path.");
        }
        visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) throw new Error("Official packs may contain regular files only.");
      if (path.resolve(absolutePath) === path.resolve(manifestPath)) continue;
      const normalized = normalizeArchivePath(relativePath);
      const key = normalized.toLowerCase();
      if (!normalized || seen.has(key)) {
        throw new Error("Official packs contain an unsafe or case-colliding file path.");
      }
      seen.add(key);
      const stat = fs.statSync(absolutePath);
      if (stat.size > MAX_SINGLE_FILE_BYTES) {
        throw new Error("Official packs contain an oversized file.");
      }
      totalBytes += stat.size;
      if (files.length >= MAX_ARCHIVE_ENTRIES || totalBytes > MAX_UNPACKED_BYTES) {
        throw new Error("Official packs exceed their file-count or size limit.");
      }
      files.push({
        relativePath: normalized,
        sha256: hashFile(absolutePath)
      });
    }
  };
  visit(rootPath);
  return files;
}

function normalizeArchivePath(value) {
  if (typeof value !== "string" || !value || value.length > 1_024) return "";
  if (
    value !== value.normalize("NFC") ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.startsWith("/") ||
    /^[A-Za-z]:/.test(value) ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return "";
  }
  const normalized = value.endsWith("/") ? value.slice(0, -1) : value;
  if (!normalized || normalized.includes("//") || normalized.endsWith("/")) return "";
  const parts = normalized.split("/");
  if (
    parts.some((part) =>
      !part ||
      part.length > 240 ||
      part === "." ||
      part === ".." ||
      /[<>:"|?*]/.test(part) ||
      /[. ]$/.test(part) ||
      WINDOWS_DEVICE_NAME.test(part) ||
      FORBIDDEN_SEGMENTS.has(part.toLowerCase()) ||
      FORBIDDEN_FILES.has(part.toLowerCase())
    )
  ) {
    return "";
  }
  return normalized;
}

function replaceDirectorySafely(staging, destination, replaceExisting) {
  if (!fs.existsSync(destination)) {
    fs.renameSync(staging, destination);
    return;
  }
  if (!replaceExisting) {
    throw new Error("A destination appeared while the official pack was being hydrated.");
  }
  const backup = `${destination}.hydrate-backup-${process.pid}-${randomUUID()}`;
  fs.renameSync(destination, backup);
  try {
    fs.renameSync(staging, destination);
  } catch (error) {
    fs.renameSync(backup, destination);
    throw error;
  }
  fs.rmSync(backup, { recursive: true, force: true });
}

function assertPathInside(candidate, rootPath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidate));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Official archive entry escaped its extraction folder.");
  }
}

function assertRealDirectory(directoryPath, label) {
  const stat = fs.lstatSync(directoryPath);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`The ${label} must be a real directory.`);
  }
}

function parseCliOptions(args) {
  const allowed = new Set(["--offline", "--publish-to-release", "--replace-existing"]);
  const unknown = args.filter((value) => !allowed.has(value));
  if (unknown.length > 0) {
    throw new Error(`Unknown official game hydration option: ${unknown[0]}`);
  }
  return {
    offline: args.includes("--offline"),
    publishToRelease: args.includes("--publish-to-release"),
    replaceExisting: args.includes("--replace-existing")
  };
}

function writeAllSync(descriptor, buffer) {
  let offset = 0;
  while (offset < buffer.length) {
    const written = fs.writeSync(descriptor, buffer, offset, buffer.length - offset);
    if (!Number.isInteger(written) || written <= 0) {
      throw new Error("Unable to finish writing an official game archive.");
    }
    offset += written;
  }
}

function hashFile(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replaceAll(repoRoot, "[WORKSPACE]")
    .replaceAll(repoRoot.replace(/\\/g, "/"), "[WORKSPACE]");
}

module.exports = {
  assertAllowedDownloadResponseUrl,
  collectPackFiles,
  downloadVerifiedArchive,
  extractVerifiedArchive,
  isExpectedArchive,
  main,
  normalizeArchivePath,
  parseCliOptions,
  preflightArchiveEntries,
  verifyExtractedPack,
  verifyRemoteTagCommit
};
