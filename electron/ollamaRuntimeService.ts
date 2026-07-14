import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { EnsureOllamaRuntimeResult } from "../src/shared/types";

const DEFAULT_OLLAMA_ORIGIN = "http://127.0.0.1:11434";
const OLLAMA_READY_TIMEOUT_MS = 15_000;

type OllamaRuntimeDependencies = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  probe?: (baseUrl: string) => Promise<boolean>;
  launch?: (executablePath: string) => Promise<void>;
  delay?: (milliseconds: number) => Promise<void>;
};

let launchInFlight: Promise<EnsureOllamaRuntimeResult> | null = null;

export async function ensureOllamaRuntime(
  rawBaseUrl: string | undefined,
  dependencies: OllamaRuntimeDependencies = {}
): Promise<EnsureOllamaRuntimeResult> {
  const baseUrl = normalizeAutoStartOllamaUrl(rawBaseUrl);
  if (!baseUrl) {
    return { status: "unsupported_url", baseUrl: rawBaseUrl?.trim() || DEFAULT_OLLAMA_ORIGIN };
  }
  const probe = dependencies.probe ?? probeOllamaRuntime;
  if (await probe(baseUrl)) return { status: "already_running", baseUrl };
  if ((dependencies.platform ?? process.platform) !== "win32") {
    return { status: "unsupported_platform", baseUrl };
  }
  if (launchInFlight) return launchInFlight;

  launchInFlight = launchAndWaitForOllama(baseUrl, {
    ...dependencies,
    probe
  }).finally(() => {
    launchInFlight = null;
  });
  return launchInFlight;
}

async function launchAndWaitForOllama(
  baseUrl: string,
  dependencies: OllamaRuntimeDependencies
): Promise<EnsureOllamaRuntimeResult> {
  const executablePath = findOllamaExecutable(dependencies.env ?? process.env);
  if (!executablePath) return { status: "not_installed", baseUrl };
  try {
    await (dependencies.launch ?? launchOllamaDetached)(executablePath);
  } catch {
    return { status: "start_failed", baseUrl };
  }

  const probe = dependencies.probe ?? probeOllamaRuntime;
  const wait = dependencies.delay ?? delay;
  const deadline = Date.now() + OLLAMA_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await probe(baseUrl)) return { status: "started", baseUrl };
    await wait(300);
  }
  return { status: "start_failed", baseUrl };
}

export function normalizeAutoStartOllamaUrl(rawBaseUrl: string | undefined) {
  try {
    const parsed = new URL(rawBaseUrl?.trim() || DEFAULT_OLLAMA_ORIGIN);
    const hostname = parsed.hostname.toLowerCase();
    const isLoopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
    const port = parsed.port || (parsed.protocol === "http:" ? "80" : "443");
    if (parsed.protocol !== "http:" || !isLoopback || port !== "11434" || (parsed.pathname !== "/" && parsed.pathname !== "")) {
      return null;
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

export function findOllamaExecutable(env: NodeJS.ProcessEnv) {
  const candidates = [
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Programs", "Ollama", "ollama.exe"),
    env.ProgramFiles && path.join(env.ProgramFiles, "Ollama", "ollama.exe")
  ].filter((candidate): candidate is string => Boolean(candidate));
  return candidates.find((candidate) => {
    try {
      const stat = fs.lstatSync(candidate);
      return stat.isFile() && !stat.isSymbolicLink();
    } catch {
      return false;
    }
  }) ?? null;
}

async function probeOllamaRuntime(baseUrl: string) {
  try {
    const response = await fetch(`${baseUrl}/api/version`, {
      signal: AbortSignal.timeout(1_500)
    });
    return response.ok;
  } catch {
    return false;
  }
}

function launchOllamaDetached(executablePath: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(executablePath, ["serve"], {
      detached: true,
      windowsHide: true,
      stdio: "ignore",
      env: process.env
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
