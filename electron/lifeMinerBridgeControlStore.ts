import fs from "node:fs";
import path from "node:path";

const STATE_FILE_NAME = "life-miner-bridge-control.json";
const MAX_STATE_BYTES = 16 * 1024;
const MAX_PENDING_BARRIER_RELEASE_REQUESTS = 32;
const MAX_ACKNOWLEDGED_BARRIER_RELEASE_REQUESTS = 32;
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type LifeMinerBridgeControlState = {
  schemaVersion: 1;
  everPaired: boolean;
  pendingBarrierReleaseRequestIds?: string[];
  acknowledgedBarrierReleaseRequestIds?: string[];
};

const EMPTY_STATE: LifeMinerBridgeControlState = {
  schemaVersion: 1,
  everPaired: false
};

/**
 * Durable bridge security metadata. This intentionally lives outside the
 * privacy-deletion operation directory: a renderer result acknowledgement may
 * retire that operation before a sleeping extension receives its barrier
 * release command.
 */
export class LifeMinerBridgeControlStore {
  constructor(private readonly getUserDataPath: () => string) {}

  hasEverPaired() {
    const loaded = this.load();
    // A damaged or inaccessible existing record must not make extension cleanup
    // optional. Failing closed can only ask the user to reconnect the extension.
    return loaded.status === "invalid" || loaded.state.everPaired;
  }

  markPaired() {
    const loaded = this.load();
    if (loaded.status === "valid" && loaded.state.everPaired) return;
    const state = loaded.status === "valid"
      ? loaded.state
      : { ...EMPTY_STATE, everPaired: loaded.status === "invalid" };
    this.save({ ...state, everPaired: true });
  }

  forgetPairingHistoryAndReleaseProofs() {
    // This is intentionally different from revoking the in-memory bridge token.
    // A durable empty record is written only after the UI's explicit
    // "extension uninstalled" confirmation has been validated by main.
    this.save({ ...EMPTY_STATE });
  }

  setBarrierReleaseRequestId(requestId: string) {
    assertRequestId(requestId);
    const state = this.mutableState();
    if (
      state.pendingBarrierReleaseRequestIds?.includes(requestId) ||
      state.acknowledgedBarrierReleaseRequestIds?.includes(requestId)
    ) return;
    const pendingRequestIds = [
      ...(state.pendingBarrierReleaseRequestIds ?? []),
      requestId
    ];
    if (pendingRequestIds.length > MAX_PENDING_BARRIER_RELEASE_REQUESTS) {
      throw new Error(
        "Too many unacknowledged extension queue barrier releases. Reconnect the extension before retrying deletion."
      );
    }
    this.save({
      ...state,
      pendingBarrierReleaseRequestIds: pendingRequestIds
    });
  }

  getBarrierReleaseRequestId() {
    const loaded = this.load();
    return loaded.status === "valid"
      ? loaded.state.pendingBarrierReleaseRequestIds?.[0] ?? null
      : null;
  }

  acknowledgeBarrierRelease(requestId: string) {
    if (!REQUEST_ID_PATTERN.test(requestId)) return false;
    const loaded = this.load();
    if (loaded.status !== "valid") return false;
    if (loaded.state.acknowledgedBarrierReleaseRequestIds?.includes(requestId)) return true;
    const pendingRequestIds = loaded.state.pendingBarrierReleaseRequestIds ?? [];
    if (pendingRequestIds[0] !== requestId) return false;
    const next = { ...loaded.state };
    const remainingRequestIds = pendingRequestIds.slice(1);
    if (remainingRequestIds.length > 0) {
      next.pendingBarrierReleaseRequestIds = remainingRequestIds;
    } else {
      delete next.pendingBarrierReleaseRequestIds;
    }
    next.acknowledgedBarrierReleaseRequestIds = appendBoundedRequestId(
      next.acknowledgedBarrierReleaseRequestIds,
      requestId
    );
    this.save(next);
    return true;
  }

  private mutableState() {
    const loaded = this.load();
    if (loaded.status === "valid") return loaded.state;
    return {
      ...EMPTY_STATE,
      // Preserve the fail-closed interpretation when repairing a damaged file.
      everPaired: loaded.status === "invalid"
    };
  }

  private load():
    | { status: "missing"; state: LifeMinerBridgeControlState }
    | { status: "invalid"; state: LifeMinerBridgeControlState }
    | { status: "valid"; state: LifeMinerBridgeControlState } {
    const statePath = this.getStatePath();
    try {
      const stat = fs.lstatSync(statePath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > MAX_STATE_BYTES) {
        return { status: "invalid", state: { ...EMPTY_STATE } };
      }
      const parsed = JSON.parse(fs.readFileSync(statePath, "utf8")) as unknown;
      const state = normalizeState(parsed);
      return state
        ? { status: "valid", state }
        : { status: "invalid", state: { ...EMPTY_STATE } };
    } catch (error) {
      if (isMissing(error)) return { status: "missing", state: { ...EMPTY_STATE } };
      return { status: "invalid", state: { ...EMPTY_STATE } };
    }
  }

  private save(state: LifeMinerBridgeControlState) {
    const statePath = this.getStatePath();
    const directory = path.dirname(statePath);
    const temporaryPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
    const bytes = Buffer.from(`${JSON.stringify(state)}\n`, "utf8");
    if (bytes.length > MAX_STATE_BYTES) {
      throw new Error("Life Miner bridge control state exceeds the safe size limit.");
    }
    fs.mkdirSync(directory, { recursive: true });
    if (fs.existsSync(statePath)) {
      const stat = fs.lstatSync(statePath);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error("Life Miner bridge control state path must be a regular file.");
      }
    }
    try {
      fs.writeFileSync(temporaryPath, bytes, { flag: "wx", mode: 0o600 });
      try {
        fs.renameSync(temporaryPath, statePath);
      } catch (error) {
        if (!isReplaceConflict(error)) throw error;
        fs.copyFileSync(temporaryPath, statePath);
      }
    } finally {
      try {
        fs.unlinkSync(temporaryPath);
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
    }
  }

  private getStatePath() {
    const root = path.resolve(this.getUserDataPath());
    const statePath = path.resolve(root, STATE_FILE_NAME);
    const relative = path.relative(root, statePath);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Life Miner bridge control state path is unsafe.");
    }
    return statePath;
  }
}

function normalizeState(value: unknown): LifeMinerBridgeControlState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<LifeMinerBridgeControlState> & {
    barrierReleaseRequestId?: unknown;
    lastBarrierReleaseAckRequestId?: unknown;
  };
  if (candidate.schemaVersion !== 1 || typeof candidate.everPaired !== "boolean") return null;
  if (
    candidate.barrierReleaseRequestId !== undefined &&
    (typeof candidate.barrierReleaseRequestId !== "string" ||
      !REQUEST_ID_PATTERN.test(candidate.barrierReleaseRequestId))
  ) return null;
  if (
    candidate.pendingBarrierReleaseRequestIds !== undefined &&
    (!Array.isArray(candidate.pendingBarrierReleaseRequestIds) ||
      candidate.pendingBarrierReleaseRequestIds.length > MAX_PENDING_BARRIER_RELEASE_REQUESTS ||
      candidate.pendingBarrierReleaseRequestIds.some(
        (requestId) => typeof requestId !== "string" || !REQUEST_ID_PATTERN.test(requestId)
      ))
  ) return null;
  if (
    candidate.acknowledgedBarrierReleaseRequestIds !== undefined &&
    (!Array.isArray(candidate.acknowledgedBarrierReleaseRequestIds) ||
      candidate.acknowledgedBarrierReleaseRequestIds.length >
        MAX_ACKNOWLEDGED_BARRIER_RELEASE_REQUESTS ||
      candidate.acknowledgedBarrierReleaseRequestIds.some(
        (requestId) => typeof requestId !== "string" || !REQUEST_ID_PATTERN.test(requestId)
      ))
  ) return null;
  if (
    candidate.lastBarrierReleaseAckRequestId !== undefined &&
    (typeof candidate.lastBarrierReleaseAckRequestId !== "string" ||
      !REQUEST_ID_PATTERN.test(candidate.lastBarrierReleaseAckRequestId))
  ) return null;
  const acknowledgedRequestIds = [
    ...(candidate.acknowledgedBarrierReleaseRequestIds ?? []),
    ...(typeof candidate.lastBarrierReleaseAckRequestId === "string"
      ? [candidate.lastBarrierReleaseAckRequestId]
      : [])
  ];
  const pendingRequestIds = [
    ...(typeof candidate.barrierReleaseRequestId === "string"
      ? [candidate.barrierReleaseRequestId]
      : []),
    ...(candidate.pendingBarrierReleaseRequestIds ?? [])
  ].filter((requestId, index, requestIds) => requestIds.indexOf(requestId) === index);
  if (pendingRequestIds.length > MAX_PENDING_BARRIER_RELEASE_REQUESTS) return null;
  const pendingRequestIdSet = new Set(pendingRequestIds);
  const normalizedAcknowledgedRequestIds = [
    ...new Set(acknowledgedRequestIds)
  ]
    .filter((requestId) => !pendingRequestIdSet.has(requestId))
    .slice(-MAX_ACKNOWLEDGED_BARRIER_RELEASE_REQUESTS);
  return {
    schemaVersion: 1,
    everPaired: candidate.everPaired,
    ...(pendingRequestIds.length
      ? { pendingBarrierReleaseRequestIds: pendingRequestIds }
      : {}),
    ...(normalizedAcknowledgedRequestIds.length
      ? {
          acknowledgedBarrierReleaseRequestIds: normalizedAcknowledgedRequestIds
        }
      : {})
  };
}

function appendBoundedRequestId(requestIds: string[] | undefined, requestId: string) {
  return [...new Set([...(requestIds ?? []), requestId])].slice(
    -MAX_ACKNOWLEDGED_BARRIER_RELEASE_REQUESTS
  );
}

function assertRequestId(requestId: string) {
  if (!REQUEST_ID_PATTERN.test(requestId)) {
    throw new Error("Extension queue barrier release IDs must be UUID v4 values.");
  }
}

function isMissing(error: unknown) {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function isReplaceConflict(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    ["EACCES", "EEXIST", "EPERM"].includes((error as NodeJS.ErrnoException).code ?? "")
  );
}
