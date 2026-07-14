import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_FILE_SIGNATURE = 0x04034b50;
const ZIP_METHOD_STORE = 0;
const ZIP_METHOD_DEFLATE = 8;
const ZIP_MAX_EXTRACTED_FILES = 4_096;
const ZIP_MAX_EXTRACTED_BYTES = 512 * 1024 * 1024;
const ZIP_MAX_SINGLE_FILE_BYTES = 128 * 1024 * 1024;
const ZIP_MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
const ZIP_MAX_COMPRESSION_RATIO = 200;
const ZIP_IGNORED_PATH_SEGMENTS = new Set([
  "__MACOSX",
  ".git",
  ".vscode",
  "node_modules",
  "source",
  "coverage"
]);

type ZipEntry = {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  crc32: number;
  localHeaderOffset: number;
  flags: number;
  encrypted: boolean;
  directory: boolean;
  symbolicLink: boolean;
};

export type PlayZoneArchiveExtractionResult = {
  rootPath: string;
  fileCount: number;
  archiveSha256: string;
  extractedBytes: number;
};

export function extractPlayZoneArchiveToCache(
  archivePath: string,
  cacheRootPath: string
): PlayZoneArchiveExtractionResult {
  const normalizedArchivePath = path.resolve(archivePath);
  const archiveStats = fs.statSync(normalizedArchivePath);
  if (!archiveStats.isFile()) throw new Error("PlayZone archive file was not found.");
  if (archiveStats.size > ZIP_MAX_ARCHIVE_BYTES) {
    throw new Error("PlayZone archives larger than 256 MiB are not supported.");
  }

  const archiveBytes = fs.readFileSync(normalizedArchivePath);
  const archiveSha256 = createHash("sha256").update(archiveBytes).digest("hex");
  const cacheRoot = path.resolve(cacheRootPath);
  fs.mkdirSync(cacheRoot, { recursive: true });
  const cacheKey = createHash("sha256")
    .update(normalizedArchivePath)
    .update("\0")
    .update(archiveSha256)
    .digest("hex")
    .slice(0, 24);
  const targetRootPath = path.join(cacheRoot, cacheKey);
  const markerPath = path.join(targetRootPath, ".lem-archive-cache.json");
  const cached = readFreshArchiveCache(markerPath, normalizedArchivePath, archiveSha256);
  if (cached) return { rootPath: targetRootPath, archiveSha256, ...cached };

  const { entries: zipEntries, centralDirectoryOffset } = readZipEntries(archiveBytes);
  const seenPaths = new Set<string>();
  const extractableEntries = zipEntries.flatMap((entry) => {
    if (entry.directory) return [];
    if (entry.encrypted) throw new Error("Encrypted PlayZone archives are not supported.");
    if (entry.symbolicLink) throw new Error("PlayZone archives cannot contain symbolic links.");
    if (entry.compressionMethod !== ZIP_METHOD_STORE && entry.compressionMethod !== ZIP_METHOD_DEFLATE) {
      throw new Error("Unsupported PlayZone archive compression method.");
    }
    if (entry.uncompressedSize > ZIP_MAX_SINGLE_FILE_BYTES) {
      throw new Error("A PlayZone archive file exceeds the 128 MiB per-file limit.");
    }
    if (
      entry.uncompressedSize > 0 &&
      (entry.compressedSize === 0 || entry.uncompressedSize / entry.compressedSize > ZIP_MAX_COMPRESSION_RATIO)
    ) {
      throw new Error("PlayZone archive contains a suspicious compression ratio.");
    }
    const relativePath = normalizeArchiveEntryPath(entry.name);
    if (!relativePath) throw new Error("PlayZone archive contains an unsafe file path.");
    if (relativePath === ".lem-archive-cache.json") {
      throw new Error("PlayZone archive contains a reserved cache marker path.");
    }
    if (shouldSkipArchiveEntry(relativePath)) return [];
    const pathKey = relativePath.toLowerCase();
    if (seenPaths.has(pathKey)) {
      throw new Error("PlayZone archive contains duplicate or case-colliding file paths.");
    }
    seenPaths.add(pathKey);
    return [{ entry, relativePath }];
  });
  if (extractableEntries.length > ZIP_MAX_EXTRACTED_FILES) {
    throw new Error("PlayZone archive has too many runtime files.");
  }
  const declaredBytes = extractableEntries.reduce((total, item) => total + item.entry.uncompressedSize, 0);
  if (!Number.isSafeInteger(declaredBytes) || declaredBytes > ZIP_MAX_EXTRACTED_BYTES) {
    throw new Error("PlayZone archive is too large to extract.");
  }

  validateCompressedRanges(archiveBytes, extractableEntries.map((item) => item.entry), centralDirectoryOffset);
  const stagingRootPath = path.join(cacheRoot, `.${cacheKey}.${process.pid}.${Date.now()}.tmp`);
  if (!isPathInside(stagingRootPath, cacheRoot) || !isPathInside(targetRootPath, cacheRoot)) {
    throw new Error("Invalid PlayZone archive cache path.");
  }
  fs.rmSync(stagingRootPath, { recursive: true, force: true });
  fs.mkdirSync(stagingRootPath, { recursive: true });

  let fileCount = 0;
  let extractedBytes = 0;
  try {
    for (const { entry, relativePath } of extractableEntries) {
      const outputPath = path.resolve(stagingRootPath, relativePath);
      if (!isPathInside(outputPath, stagingRootPath)) {
        throw new Error("PlayZone archive entry escaped its extraction folder.");
      }
      const output = readZipEntryData(archiveBytes, entry, centralDirectoryOffset);
      extractedBytes += output.length;
      if (extractedBytes > ZIP_MAX_EXTRACTED_BYTES) {
        throw new Error("PlayZone archive exceeded its extraction limit.");
      }
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, output, { flag: "wx" });
      fileCount += 1;
    }

    fs.writeFileSync(
      path.join(stagingRootPath, ".lem-archive-cache.json"),
      JSON.stringify({
        version: 2,
        sourcePath: normalizedArchivePath,
        archiveSha256,
        fileCount,
        extractedBytes
      }),
      { encoding: "utf8", flag: "wx" }
    );
    fs.rmSync(targetRootPath, { recursive: true, force: true });
    fs.renameSync(stagingRootPath, targetRootPath);
  } catch (error) {
    fs.rmSync(stagingRootPath, { recursive: true, force: true });
    throw error;
  }

  return { rootPath: targetRootPath, fileCount, archiveSha256, extractedBytes };
}

function readZipEntries(buffer: Buffer) {
  const eocdOffset = findEndOfCentralDirectoryOffset(buffer);
  requireRange(buffer, eocdOffset, 22, "ZIP end record");
  const diskNumber = buffer.readUInt16LE(eocdOffset + 4);
  const centralDirectoryDisk = buffer.readUInt16LE(eocdOffset + 6);
  const entriesOnDisk = buffer.readUInt16LE(eocdOffset + 8);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const commentLength = buffer.readUInt16LE(eocdOffset + 20);
  if (eocdOffset + 22 + commentLength !== buffer.length) {
    throw new Error("Invalid PlayZone archive end record or trailing data.");
  }
  if (
    entriesOnDisk === 0xffff ||
    entryCount === 0xffff ||
    centralDirectorySize === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff ||
    hasZip64Marker(buffer, eocdOffset)
  ) {
    throw new Error("ZIP64 PlayZone archives are not supported.");
  }
  if (diskNumber !== 0 || centralDirectoryDisk !== 0 || entriesOnDisk !== entryCount) {
    throw new Error("Multi-disk PlayZone archives are not supported.");
  }
  if (entryCount > ZIP_MAX_EXTRACTED_FILES) throw new Error("PlayZone archive has too many files.");
  if (centralDirectoryOffset + centralDirectorySize !== eocdOffset) {
    throw new Error("Invalid PlayZone archive central directory bounds.");
  }

  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    requireRange(buffer, offset, 46, "central directory entry");
    if (buffer.readUInt32LE(offset) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error("Invalid PlayZone archive central directory.");
    }
    const madeBy = buffer.readUInt16LE(offset + 4);
    const flags = buffer.readUInt16LE(offset + 8);
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const crc32 = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraFieldLength = buffer.readUInt16LE(offset + 30);
    const fileCommentLength = buffer.readUInt16LE(offset + 32);
    const externalAttributes = buffer.readUInt32LE(offset + 38);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const totalLength = 46 + fileNameLength + extraFieldLength + fileCommentLength;
    requireRange(buffer, offset, totalLength, "central directory entry data");
    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff ||
      extraContainsZip64(buffer.subarray(offset + 46 + fileNameLength, offset + 46 + fileNameLength + extraFieldLength))
    ) {
      throw new Error("ZIP64 PlayZone archives are not supported.");
    }
    const nameStart = offset + 46;
    const nameBytes = buffer.subarray(nameStart, nameStart + fileNameLength);
    if (!(flags & 0x0800) && nameBytes.some((byte) => byte > 0x7f)) {
      throw new Error("Non-ASCII PlayZone archive file names must use UTF-8.");
    }
    const name = buffer.toString("utf8", nameStart, nameStart + fileNameLength).replace(/\\/g, "/");
    const hostSystem = madeBy >>> 8;
    const unixMode = (externalAttributes >>> 16) & 0xffff;
    entries.push({
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      crc32,
      localHeaderOffset,
      flags,
      encrypted: Boolean(flags & 0x41),
      directory: name.endsWith("/"),
      symbolicLink: hostSystem === 3 && (unixMode & 0xf000) === 0xa000
    });
    offset += totalLength;
  }
  if (offset !== eocdOffset) throw new Error("Invalid PlayZone archive central directory size.");
  return { entries, centralDirectoryOffset };
}

function readZipEntryData(buffer: Buffer, entry: ZipEntry, centralDirectoryOffset: number) {
  const range = readCompressedRange(buffer, entry, centralDirectoryOffset);
  const compressedData = buffer.subarray(range.start, range.end);
  let output: Buffer;
  if (entry.compressionMethod === ZIP_METHOD_STORE) {
    output = Buffer.from(compressedData);
  } else if (entry.compressionMethod === ZIP_METHOD_DEFLATE) {
    output = zlib.inflateRawSync(compressedData, { maxOutputLength: entry.uncompressedSize });
  } else {
    throw new Error("Unsupported PlayZone archive compression method.");
  }
  if (output.length !== entry.uncompressedSize) {
    throw new Error("PlayZone archive entry size does not match its central directory.");
  }
  if (crc32(output) !== entry.crc32) {
    throw new Error("PlayZone archive entry failed its CRC-32 integrity check.");
  }
  return output;
}

function readCompressedRange(buffer: Buffer, entry: ZipEntry, centralDirectoryOffset: number) {
  const offset = entry.localHeaderOffset;
  requireRange(buffer, offset, 30, "local file header");
  if (buffer.readUInt32LE(offset) !== ZIP_LOCAL_FILE_SIGNATURE) {
    throw new Error("Invalid PlayZone archive local file header.");
  }
  const localFlags = buffer.readUInt16LE(offset + 6);
  const localMethod = buffer.readUInt16LE(offset + 8);
  const fileNameLength = buffer.readUInt16LE(offset + 26);
  const extraFieldLength = buffer.readUInt16LE(offset + 28);
  const headerLength = 30 + fileNameLength + extraFieldLength;
  requireRange(buffer, offset, headerLength, "local file header data");
  const localName = buffer.toString("utf8", offset + 30, offset + 30 + fileNameLength).replace(/\\/g, "/");
  if (localName !== entry.name || localMethod !== entry.compressionMethod || (localFlags & 1) !== (entry.flags & 1)) {
    throw new Error("PlayZone archive local and central headers do not match.");
  }
  if (extraContainsZip64(buffer.subarray(offset + 30 + fileNameLength, offset + headerLength))) {
    throw new Error("ZIP64 PlayZone archives are not supported.");
  }
  const start = offset + headerLength;
  const end = start + entry.compressedSize;
  if (!Number.isSafeInteger(end) || end > centralDirectoryOffset || end > buffer.length) {
    throw new Error("PlayZone archive entry data is outside archive bounds.");
  }
  return { start, end };
}

function validateCompressedRanges(buffer: Buffer, entries: ZipEntry[], centralDirectoryOffset: number) {
  const ranges = entries
    .map((entry) => readCompressedRange(buffer, entry, centralDirectoryOffset))
    .sort((left, right) => left.start - right.start);
  for (let index = 1; index < ranges.length; index += 1) {
    if (ranges[index].start < ranges[index - 1].end) {
      throw new Error("PlayZone archive contains overlapping file data.");
    }
  }
}

function findEndOfCentralDirectoryOffset(buffer: Buffer) {
  if (buffer.length < 22) throw new Error("PlayZone archive is not a valid ZIP file.");
  const minimumOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === ZIP_EOCD_SIGNATURE) return offset;
  }
  throw new Error("PlayZone archive is not a valid ZIP file.");
}

function hasZip64Marker(buffer: Buffer, eocdOffset: number) {
  const start = Math.max(0, eocdOffset - 76);
  for (let offset = start; offset <= eocdOffset - 4; offset += 1) {
    const signature = buffer.readUInt32LE(offset);
    if (signature === ZIP64_EOCD_SIGNATURE || signature === ZIP64_LOCATOR_SIGNATURE) return true;
  }
  return false;
}

function extraContainsZip64(extra: Buffer) {
  let offset = 0;
  while (offset < extra.length) {
    if (offset + 4 > extra.length) throw new Error("Invalid PlayZone archive extra field.");
    const id = extra.readUInt16LE(offset);
    const size = extra.readUInt16LE(offset + 2);
    if (offset + 4 + size > extra.length) throw new Error("Invalid PlayZone archive extra field size.");
    if (id === 0x0001) return true;
    offset += 4 + size;
  }
  return false;
}

function normalizeArchiveEntryPath(value: string) {
  const normalized = value.trim().replace(/\\/g, "/");
  if (!normalized || normalized.includes("\0") || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) return "";
  const segments = normalized.split("/").filter((segment, index, all) => !(index === all.length - 1 && !segment));
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes(":") || /[. ]$/.test(segment))) return "";
  return segments.join("/");
}

function shouldSkipArchiveEntry(relativePath: string) {
  return relativePath.split("/").some((segment) => ZIP_IGNORED_PATH_SEGMENTS.has(segment));
}

function readFreshArchiveCache(markerPath: string, archivePath: string, archiveSha256: string) {
  try {
    const marker = JSON.parse(fs.readFileSync(markerPath, "utf8")) as Record<string, unknown>;
    const fileCount = Number(marker.fileCount);
    const extractedBytes = Number(marker.extractedBytes);
    if (
      marker.version !== 2 ||
      marker.sourcePath !== archivePath ||
      marker.archiveSha256 !== archiveSha256 ||
      !Number.isInteger(fileCount) || fileCount < 0 || fileCount > ZIP_MAX_EXTRACTED_FILES ||
      !Number.isInteger(extractedBytes) || extractedBytes < 0 || extractedBytes > ZIP_MAX_EXTRACTED_BYTES ||
      countCachedFiles(path.dirname(markerPath)) !== fileCount
    ) return null;
    return { fileCount, extractedBytes };
  } catch {
    return null;
  }
}

function countCachedFiles(folderPath: string) {
  let count = 0;
  for (const entry of fs.readdirSync(folderPath, { withFileTypes: true })) {
    if (entry.name === ".lem-archive-cache.json") continue;
    if (entry.isSymbolicLink()) return Number.POSITIVE_INFINITY;
    if (entry.isDirectory()) count += countCachedFiles(path.join(folderPath, entry.name));
    else if (entry.isFile()) count += 1;
  }
  return count;
}

function requireRange(buffer: Buffer, offset: number, length: number, label: string) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > buffer.length) {
    throw new Error(`Invalid PlayZone archive ${label} bounds.`);
  }
}

function isPathInside(candidatePath: string, rootPath: string) {
  const relativePath = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return Boolean(relativePath) && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

let crcTable: Uint32Array | undefined;
export function crc32(buffer: Buffer) {
  crcTable ??= createCrcTable();
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    table[value] = crc >>> 0;
  }
  return table;
}
