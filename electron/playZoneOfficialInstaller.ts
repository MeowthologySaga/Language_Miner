import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { PlayZoneLibraryEntry, PlayZoneOfficialDownloadProgress } from "../src/shared/types";
import { extractPlayZoneArchiveToCache } from "./playZoneArchive";
import { PLAY_ZONE_MANIFEST_FILE_NAMES, inspectPlayZonePack } from "./playZoneManifest";
import { getOfficialPlayZonePack } from "./playZoneOfficialCatalog";
import {
  installPlayZoneSnapshot,
  listInstalledPlayZoneSnapshots,
  removePlayZoneSnapshot
} from "./playZoneSnapshotStore";

const ALLOWED_DOWNLOAD_HOSTS = new Set([
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com"
]);
const MAX_OFFICIAL_DOWNLOAD_BYTES = 256 * 1024 * 1024;
export const OFFICIAL_DOWNLOAD_OVERALL_TIMEOUT_MS = 15 * 60 * 1000;
export const OFFICIAL_DOWNLOAD_NO_PROGRESS_TIMEOUT_MS = 30 * 1000;

export const OFFICIAL_DOWNLOAD_TIMEOUT_CODES = {
  overall: "PLAY_ZONE_DOWNLOAD_OVERALL_TIMEOUT",
  noProgress: "PLAY_ZONE_DOWNLOAD_NO_PROGRESS_TIMEOUT"
} as const;

export type OfficialPlayZoneDownloadTimeouts = {
  overallMs: number;
  noProgressMs: number;
};

export class OfficialPlayZoneDownloadError extends Error {
  readonly retryable = true;

  constructor(readonly code: typeof OFFICIAL_DOWNLOAD_TIMEOUT_CODES[keyof typeof OFFICIAL_DOWNLOAD_TIMEOUT_CODES]) {
    super(code === OFFICIAL_DOWNLOAD_TIMEOUT_CODES.overall
      ? `The official game download exceeded its time limit. Check the connection and retry. [${code}]`
      : `The official game download stopped making progress. Check the connection and retry. [${code}]`);
    this.name = "OfficialPlayZoneDownloadError";
  }
}

export type InstallOfficialPlayZonePackInput = {
  packId: string;
  requestId: string;
  downloadRootPath: string;
  archiveCacheRootPath: string;
  installedRootPath: string;
  signal: AbortSignal;
  onProgress: (progress: PlayZoneOfficialDownloadProgress) => void;
  fetchImpl?: typeof fetch;
  downloadTimeouts?: Partial<OfficialPlayZoneDownloadTimeouts>;
};

export async function downloadAndInstallOfficialPlayZonePack(
  input: InstallOfficialPlayZonePackInput
): Promise<PlayZoneLibraryEntry> {
  const pack = getOfficialPlayZonePack(input.packId);
  if (!pack) throw new Error("Unknown official PlayZone game.");
  if (!isAllowedOfficialPlayZoneDownloadUrl(pack.download.assetUrl)) {
    throw new Error("Official PlayZone download URL is not allowed.");
  }
  if (
    !Number.isSafeInteger(pack.download.downloadBytes) ||
    pack.download.downloadBytes <= 0 ||
    pack.download.downloadBytes > MAX_OFFICIAL_DOWNLOAD_BYTES
  ) {
    throw new Error("Official PlayZone download size is invalid.");
  }

  const downloadRoot = path.resolve(input.downloadRootPath);
  fs.mkdirSync(downloadRoot, { recursive: true, mode: 0o700 });
  const finalPath = path.join(downloadRoot, `${pack.id}-${pack.download.archiveSha256}.lemgame`);
  const partialPath = `${finalPath}.${input.requestId}.partial`;
  let extractedRootPath = "";
  try {
    if (!isCachedArchiveValid(finalPath, pack.download.archiveSha256, pack.download.downloadBytes)) {
      fs.rmSync(finalPath, { force: true });
      await downloadOfficialArchive(pack.download.assetUrl, partialPath, {
        expectedBytes: pack.download.downloadBytes,
        expectedSha256: pack.download.archiveSha256,
        signal: input.signal,
        fetchImpl: input.fetchImpl ?? fetch,
        timeouts: normalizeDownloadTimeouts(input.downloadTimeouts),
        onBytes: (receivedBytes) => input.onProgress(createProgress(input, "downloading", receivedBytes, pack.download.downloadBytes))
      });
      fs.renameSync(partialPath, finalPath);
    }

    input.onProgress(createProgress(input, "verifying", pack.download.downloadBytes, pack.download.downloadBytes));
    const extracted = extractPlayZoneArchiveToCache(finalPath, input.archiveCacheRootPath);
    extractedRootPath = extracted.rootPath;
    if (extracted.archiveSha256 !== pack.download.archiveSha256) {
      throw new Error("Official PlayZone archive hash did not match the catalog.");
    }
    const packRootPath = findOfficialPackRoot(extracted.rootPath);
    const inspection = inspectPlayZonePack(packRootPath, { trustedOfficial: true });
    if (
      inspection.id !== pack.id ||
      inspection.version !== pack.version ||
      inspection.securityReport.packSha256 !== pack.download.packSha256
    ) {
      throw new Error("Official PlayZone pack identity did not match the catalog.");
    }

    input.onProgress(createProgress(input, "installing", pack.download.downloadBytes, pack.download.downloadBytes));
    const installationId = `official-${pack.id}-${pack.download.packSha256.slice(0, 20)}`;
    const installed = installPlayZoneSnapshot(input.installedRootPath, {
      packRootPath,
      sourceType: "file",
      fileName: pack.fileName
    }, {
      requestedInstallationId: installationId,
      trustedOfficial: true,
      bundled: true,
      verifiedInspection: inspection
    });
    for (const previous of listInstalledPlayZoneSnapshots(input.installedRootPath)) {
      if (
        previous.id === pack.id &&
        previous.bundled &&
        previous.installationId &&
        previous.installationId !== installed.installationId
      ) {
        removePlayZoneSnapshot(input.installedRootPath, previous.installationId);
      }
    }
    input.onProgress(createProgress(input, "complete", pack.download.downloadBytes, pack.download.downloadBytes));
    return {
      ...installed,
      bundled: true,
      officialDownload: pack.download,
      status: "trusted_official",
      securityReport: installed.securityReport
        ? { ...installed.securityReport, status: "trusted_official" }
        : installed.securityReport
    };
  } catch (caught) {
    if (input.signal.aborted) {
      input.onProgress(createProgress(input, "cancelled", 0, pack.download.downloadBytes));
      throw new Error("Official PlayZone download was cancelled.");
    }
    throw caught;
  } finally {
    fs.rmSync(partialPath, { force: true });
    fs.rmSync(finalPath, { force: true });
    if (extractedRootPath) fs.rmSync(extractedRootPath, { recursive: true, force: true });
  }
}

export function isAllowedOfficialPlayZoneDownloadUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "https:" && ALLOWED_DOWNLOAD_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

async function downloadOfficialArchive(
  url: string,
  partialPath: string,
  options: {
    expectedBytes: number;
    expectedSha256: string;
    signal: AbortSignal;
    fetchImpl: typeof fetch;
    timeouts: OfficialPlayZoneDownloadTimeouts;
    onBytes: (receivedBytes: number) => void;
  }
) {
  fs.rmSync(partialPath, { force: true });
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(options.signal.reason);
  if (options.signal.aborted) abortFromCaller();
  else options.signal.addEventListener("abort", abortFromCaller, { once: true });
  const overallDeadline = Date.now() + options.timeouts.overallMs;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let file: number | null = null;
  let completed = false;
  try {
    const response = await waitForDownloadOperation(
      options.fetchImpl(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { Accept: "application/octet-stream" }
      }),
      controller,
      overallDeadline,
      options.timeouts.noProgressMs
    );
    if (!response.ok || !response.body) throw new Error(`Official PlayZone download failed with HTTP ${response.status}.`);
    if (!isAllowedOfficialPlayZoneDownloadUrl(response.url || url)) {
      throw new Error("Official PlayZone download redirected to an untrusted host.");
    }
    const declaredLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
    if (Number.isFinite(declaredLength) && declaredLength !== options.expectedBytes) {
      throw new Error("Official PlayZone download size did not match the catalog.");
    }

    file = fs.openSync(partialPath, "wx", 0o600);
    const hash = createHash("sha256");
    reader = response.body.getReader();
    let receivedBytes = 0;
    while (true) {
      const { done, value } = await waitForDownloadOperation(
        reader.read(),
        controller,
        overallDeadline,
        options.timeouts.noProgressMs
      );
      if (done) break;
      if (options.signal.aborted) throw new Error("Official PlayZone download was cancelled.");
      const chunk = Buffer.from(value);
      receivedBytes += chunk.length;
      if (receivedBytes > options.expectedBytes || receivedBytes > MAX_OFFICIAL_DOWNLOAD_BYTES) {
        throw new Error("Official PlayZone download exceeded its declared size.");
      }
      writeAllSync(file, chunk);
      hash.update(chunk);
      options.onBytes(receivedBytes);
    }
    if (receivedBytes !== options.expectedBytes || hash.digest("hex") !== options.expectedSha256) {
      throw new Error("Official PlayZone download failed SHA-256 verification.");
    }
    completed = true;
  } finally {
    options.signal.removeEventListener("abort", abortFromCaller);
    if (file !== null) fs.closeSync(file);
    if (reader && !completed) {
      if (!controller.signal.aborted) controller.abort();
      void reader.cancel().catch(() => undefined);
    }
  }
}

type SyncBufferWriter = (
  descriptor: number,
  buffer: Buffer,
  offset: number,
  length: number
) => number;

export function writeAllSync(
  descriptor: number,
  buffer: Buffer,
  writeImpl: SyncBufferWriter = (file, source, offset, length) =>
    fs.writeSync(file, source, offset, length)
) {
  let offset = 0;
  while (offset < buffer.length) {
    const remaining = buffer.length - offset;
    const written = writeImpl(descriptor, buffer, offset, remaining);
    if (!Number.isInteger(written) || written <= 0 || written > remaining) {
      throw new Error("Official PlayZone download could not finish writing its archive.");
    }
    offset += written;
  }
}

function normalizeDownloadTimeouts(
  overrides: Partial<OfficialPlayZoneDownloadTimeouts> | undefined
): OfficialPlayZoneDownloadTimeouts {
  return {
    overallMs: normalizePositiveTimeout(overrides?.overallMs, OFFICIAL_DOWNLOAD_OVERALL_TIMEOUT_MS),
    noProgressMs: normalizePositiveTimeout(
      overrides?.noProgressMs,
      OFFICIAL_DOWNLOAD_NO_PROGRESS_TIMEOUT_MS
    )
  };
}

function normalizePositiveTimeout(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && (value ?? 0) > 0 ? Math.floor(value as number) : fallback;
}

function waitForDownloadOperation<T>(
  operation: Promise<T>,
  controller: AbortController,
  overallDeadline: number,
  noProgressTimeoutMs: number
): Promise<T> {
  if (controller.signal.aborted) {
    return Promise.reject(controller.signal.reason ?? new Error("Official PlayZone download was cancelled."));
  }
  const overallRemainingMs = Math.max(1, overallDeadline - Date.now());
  const timeoutMs = Math.min(overallRemainingMs, noProgressTimeoutMs);
  const timeoutCode = overallRemainingMs <= noProgressTimeoutMs
    ? OFFICIAL_DOWNLOAD_TIMEOUT_CODES.overall
    : OFFICIAL_DOWNLOAD_TIMEOUT_CODES.noProgress;

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      controller.signal.removeEventListener("abort", handleAbort);
      callback();
    };
    const handleAbort = () => settle(() => reject(
      controller.signal.reason ?? new Error("Official PlayZone download was cancelled.")
    ));
    const timeoutId = setTimeout(() => {
      const error = new OfficialPlayZoneDownloadError(timeoutCode);
      settle(() => reject(error));
      controller.abort(error);
    }, timeoutMs);

    controller.signal.addEventListener("abort", handleAbort, { once: true });
    operation.then(
      (value) => settle(() => resolve(value)),
      (error) => settle(() => reject(error))
    );
  });
}

function isCachedArchiveValid(filePath: string, expectedSha256: string, expectedBytes: number) {
  try {
    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== expectedBytes) return false;
    return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex") === expectedSha256;
  } catch {
    return false;
  }
}

function findOfficialPackRoot(extractedRootPath: string) {
  if (PLAY_ZONE_MANIFEST_FILE_NAMES.some((name) => fs.existsSync(path.join(extractedRootPath, name)))) {
    return extractedRootPath;
  }
  const candidates = fs.readdirSync(extractedRootPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && !entry.name.startsWith("."))
    .map((entry) => path.join(extractedRootPath, entry.name))
    .filter((folderPath) => PLAY_ZONE_MANIFEST_FILE_NAMES.some((name) => fs.existsSync(path.join(folderPath, name))));
  if (candidates.length !== 1) throw new Error("Official PlayZone archive has an invalid root layout.");
  return candidates[0];
}

function createProgress(
  input: InstallOfficialPlayZonePackInput,
  state: PlayZoneOfficialDownloadProgress["state"],
  receivedBytes: number,
  totalBytes: number
): PlayZoneOfficialDownloadProgress {
  return { requestId: input.requestId, packId: input.packId, state, receivedBytes, totalBytes };
}
