"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_MAX_CAPTURE_BYTES = 1024 * 1024;
const DEFAULT_TRUNCATION_TAIL_BYTES = 4 * 1024;
const REDACTED = "[REDACTED]";
const LOCAL_PATH = "[LOCAL_PATH]";
const EMAIL = "[EMAIL]";

function redactQaLog(value) {
  return String(value ?? "")
    .replace(
      /((?:^|[\s,{])["']?[A-Za-z0-9_.-]*(?:api[_-]?key|secret|token|password)[A-Za-z0-9_.-]*["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}\]]+)/gim,
      `$1${REDACTED}`
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+/gi, `Bearer ${REDACTED}`)
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, REDACTED)
    .replace(/\bsk-(?:proj-)?[0-9A-Za-z_-]{20,}\b/g, REDACTED)
    .replace(/\bya29\.[0-9A-Za-z_-]{10,}\b/g, REDACTED)
    .replace(/\bgh[pousr]_[0-9A-Za-z_]{20,}\b/g, REDACTED)
    .replace(/\bgithub_pat_[0-9A-Za-z_]{20,}\b/g, REDACTED)
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, REDACTED)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, EMAIL)
    .replace(/file:\/{2,3}[^\r\n]+/gi, LOCAL_PATH)
    .replace(/[A-Za-z]:[\\/]+[^\r\n]+/g, LOCAL_PATH)
    .replace(/\\\\[^\r\n]+/g, LOCAL_PATH)
    .replace(
      /\/(?:Users|home|tmp|var|opt|usr|private|Applications|Volumes|workspace|workspaces|mnt|srv|data)\/[^\r\n]+/g,
      LOCAL_PATH
    );
}

function createQaRedactedLogSink(logPath, options = {}) {
  const maxCaptureBytes = options.maxCaptureBytes ?? DEFAULT_MAX_CAPTURE_BYTES;
  const truncationTailBytes =
    options.truncationTailBytes ?? DEFAULT_TRUNCATION_TAIL_BYTES;
  if (!Number.isSafeInteger(maxCaptureBytes) || maxCaptureBytes <= 0) {
    throw new Error("QA log maxCaptureBytes must be a positive safe integer.");
  }
  if (
    !Number.isSafeInteger(truncationTailBytes) ||
    truncationTailBytes < 0 ||
    truncationTailBytes >= maxCaptureBytes
  ) {
    throw new Error("QA log truncationTailBytes must be a non-negative integer below the cap.");
  }

  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(
    logPath,
    "[Language Miner QA child log capture in progress; raw child output is held only in bounded memory.]\n",
    "utf8"
  );

  const chunks = [];
  let capturedBytes = 0;
  let observedBytes = 0;
  let truncated = false;
  let finished = false;
  let result;

  return {
    write(chunk) {
      if (finished) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8");
      observedBytes += buffer.length;
      const remainingBytes = maxCaptureBytes - capturedBytes;
      if (remainingBytes > 0) {
        const accepted = buffer.subarray(0, remainingBytes);
        chunks.push(accepted);
        capturedBytes += accepted.length;
      }
      if (buffer.length > remainingBytes) {
        truncated = true;
      }
    },
    finish() {
      if (finished) return result;
      finished = true;
      const captured = Buffer.concat(chunks, capturedBytes);
      const safeLength = truncated
        ? Math.max(0, captured.length - truncationTailBytes)
        : captured.length;
      const safeText = captured.subarray(0, safeLength).toString("utf8");
      const header = [
        "[Language Miner QA child log: sensitive values and local paths are redacted]",
        `[Capture limit: ${maxCaptureBytes} bytes]`
      ];
      const footer = truncated
        ? [
            "",
            `[QA LOG TRUNCATED: observed at least ${observedBytes} bytes; retained ${safeLength} bytes before redaction.]`,
            `[The final ${captured.length - safeLength} captured bytes and all later output were withheld to avoid exposing a partial secret or path.]`
          ]
        : [];
      const output = `${[...header, redactQaLog(safeText), ...footer].join("\n")}\n`;
      fs.writeFileSync(logPath, output, "utf8");
      result = {
        logPath,
        maxCaptureBytes,
        observedBytes,
        capturedBytes,
        retainedBytes: safeLength,
        truncated
      };
      return result;
    }
  };
}

module.exports = {
  DEFAULT_MAX_CAPTURE_BYTES,
  DEFAULT_TRUNCATION_TAIL_BYTES,
  createQaRedactedLogSink,
  redactQaLog
};
