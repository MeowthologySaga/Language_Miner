import type { IncomingMessage, ServerResponse } from "node:http";
import { LIFE_MINER_BRIDGE_PORT } from "../src/shared/lifeLogCapture";

export const LIFE_MINER_BRIDGE_MAX_BODY_BYTES = 1024 * 1024;
export const LIFE_MINER_BRIDGE_BODY_TIMEOUT_MS = 10_000;
export const LIFE_MINER_EXTENSION_HEADER = "life-miner-extension";
export const LIFE_MINER_TOKEN_HEADER = "x-local-english-miner-token";
export const LIFE_MINER_CHROME_EXTENSION_ID = "ecenceehhpcodabiagkdacieghmhfoim";

export class LifeMinerBridgeRequestError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "LifeMinerBridgeRequestError";
  }
}

export function isAllowedLifeMinerOrigin(origin: string | undefined) {
  if (!origin) {
    return false;
  }

  return origin === `chrome-extension://${LIFE_MINER_CHROME_EXTENSION_ID}`;
}

export function getSingleHeaderValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function setLifeMinerCorsHeaders(response: ServerResponse, origin: string | undefined) {
  if (origin && isAllowedLifeMinerOrigin(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
  }
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Local-English-Miner, X-Local-English-Miner-Token"
  );
  response.setHeader("Access-Control-Max-Age", "600");
}

export function writeLifeMinerJson(
  response: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>
) {
  const responseWithRequest = response as ServerResponse & { req?: IncomingMessage };
  setLifeMinerCorsHeaders(response, responseWithRequest.req?.headers.origin);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

export function readLifeMinerJsonBody<T>(request: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bodySize = 0;
    let exceededMaxBodySize = false;
    let settled = false;

    const cleanup = () => {
      clearTimeout(timeout);
      request.off("data", handleData);
      request.off("error", handleError);
      request.off("aborted", handleAborted);
      request.off("close", handleClose);
      request.off("end", handleEnd);
    };
    const resolveOnce = (value: T) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const handleData = (chunk: Buffer) => {
      bodySize += chunk.byteLength;
      if (bodySize > LIFE_MINER_BRIDGE_MAX_BODY_BYTES) {
        exceededMaxBodySize = true;
        return;
      }
      chunks.push(chunk);
    };
    const handleError = (error: Error) => rejectOnce(error);
    const handleAborted = () => rejectOnce(
      new LifeMinerBridgeRequestError(408, "Life Miner request body was aborted.")
    );
    const handleClose = () => {
      if (!request.complete) {
        rejectOnce(new LifeMinerBridgeRequestError(408, "Life Miner request body closed early."));
      }
    };
    const handleEnd = () => {
      if (exceededMaxBodySize) {
        rejectOnce(
          new LifeMinerBridgeRequestError(
            413,
            `Life Miner payload is too large. Maximum is ${LIFE_MINER_BRIDGE_MAX_BODY_BYTES} bytes.`
          )
        );
        return;
      }

      try {
        resolveOnce(JSON.parse(Buffer.concat(chunks).toString("utf8")) as T);
      } catch {
        rejectOnce(new LifeMinerBridgeRequestError(400, "Invalid JSON payload."));
      }
    };
    const timeout = setTimeout(() => {
      rejectOnce(new LifeMinerBridgeRequestError(408, "Life Miner request body timed out."));
    }, LIFE_MINER_BRIDGE_BODY_TIMEOUT_MS);
    timeout.unref?.();

    request.on("data", handleData);
    request.once("error", handleError);
    request.once("aborted", handleAborted);
    request.once("close", handleClose);
    request.once("end", handleEnd);
  });
}

export function getLifeMinerBridgeBaseUrl(hostHeader: string | undefined) {
  return `http://${hostHeader ?? `127.0.0.1:${LIFE_MINER_BRIDGE_PORT}`}`;
}
