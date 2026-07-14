import type { IncomingMessage } from "node:http";
import type { LifeLog } from "../src/shared/types";
import {
  getSingleHeaderValue,
  isAllowedLifeMinerOrigin,
  LifeMinerBridgeRequestError,
  LIFE_MINER_TOKEN_HEADER
} from "./lifeMinerBridgeProtocol";

export const LIFE_MINER_BRIDGE_DEDUPE_MS = 8_000;
export const LIFE_MINER_BRIDGE_RATE_WINDOW_MS = 60_000;
export const LIFE_MINER_BRIDGE_RATE_LIMIT = 120;

export type LifeMinerBridgePairingHistory = {
  hasEverPaired(): boolean;
  markPaired(): void;
};

export class LifeMinerBridgePairing {
  private pairedExtensionOrigin: string | null = null;
  private token: string;

  constructor(
    token: string,
    private readonly createToken: () => string = () => token,
    private readonly pairingHistory?: LifeMinerBridgePairingHistory
  ) {
    this.token = token;
  }

  pair(origin: string | undefined) {
    if (!origin || !isAllowedLifeMinerOrigin(origin)) {
      throw new LifeMinerBridgeRequestError(403, "Extension origin is required for pairing.");
    }

    if (!this.pairedExtensionOrigin) {
      this.pairedExtensionOrigin = origin;
    }

    if (this.pairedExtensionOrigin !== origin) {
      throw new LifeMinerBridgeRequestError(
        403,
        "Bridge is already paired with another extension origin."
      );
    }

    this.pairingHistory?.markPaired();

    return {
      origin: this.pairedExtensionOrigin,
      token: this.token
    };
  }

  validateToken(request: IncomingMessage, origin: string | undefined) {
    if (!origin || !isAllowedLifeMinerOrigin(origin)) {
      throw new LifeMinerBridgeRequestError(403, "A trusted extension origin is required.");
    }
    if (!this.pairedExtensionOrigin) {
      throw new LifeMinerBridgeRequestError(
        401,
        "The extension must pair again. Refresh bridge settings."
      );
    }
    if (origin !== this.pairedExtensionOrigin) {
      throw new LifeMinerBridgeRequestError(403, "The extension has not been paired.");
    }
    const token = getSingleHeaderValue(request.headers[LIFE_MINER_TOKEN_HEADER]);
    if (token !== this.token) {
      throw new LifeMinerBridgeRequestError(
        401,
        "Bridge token is required. Refresh bridge settings."
      );
    }
  }

  getStatus() {
    return { paired: Boolean(this.pairedExtensionOrigin), origin: this.pairedExtensionOrigin };
  }

  hasPairedHistory() {
    return Boolean(this.pairedExtensionOrigin) || Boolean(this.pairingHistory?.hasEverPaired());
  }

  rotateToken() {
    this.token = this.createToken();
    return this.getStatus();
  }

  revoke() {
    this.pairedExtensionOrigin = null;
    this.token = this.createToken();
    return this.getStatus();
  }
}

export function enforceLifeMinerRateLimit(
  requests: Map<string, number[]>,
  key: string,
  now = Date.now(),
  limit = LIFE_MINER_BRIDGE_RATE_LIMIT,
  windowMs = LIFE_MINER_BRIDGE_RATE_WINDOW_MS
) {
  const recent = (requests.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);
  if (recent.length >= limit) {
    throw new LifeMinerBridgeRequestError(429, "Too many Life Miner bridge requests.");
  }
  recent.push(now);
  requests.set(key, recent);
}

export function isDuplicateLifeMinerCapture(
  recentCaptures: Map<string, number>,
  lifeLogInput: Omit<LifeLog, "id" | "processed" | "createdAt">,
  dedupeMs = LIFE_MINER_BRIDGE_DEDUPE_MS,
  now = Date.now()
) {
  for (const [key, capturedAt] of recentCaptures.entries()) {
    if (now - capturedAt > dedupeMs) {
      recentCaptures.delete(key);
    }
  }

  const key = [
    lifeLogInput.sourceType,
    lifeLogInput.appName ?? "",
    lifeLogInput.text
  ].join("\u001f");
  const previous = recentCaptures.get(key);
  recentCaptures.set(key, now);
  return previous !== undefined && now - previous < dedupeMs;
}

export function isLifeMinerDebugEnabled(
  lifeLogInput: Pick<LifeLog, "metadata">,
  env: NodeJS.ProcessEnv = process.env
) {
  return (
    env.LEM_LIFE_MINER_DEBUG === "1" ||
    env.LIFE_MINER_DEBUG === "1" ||
    lifeLogInput.metadata?.debugMode === true
  );
}

export function getLifeLogRawContentLengths(lifeLogInput: Pick<LifeLog, "metadata">) {
  return (lifeLogInput.metadata?.messages ?? []).map((message, index) => ({
    index,
    length: message.raw_content.length
  }));
}
