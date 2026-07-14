import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensureOllamaRuntime,
  findOllamaExecutable,
  normalizeAutoStartOllamaUrl
} from "./ollamaRuntimeService";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const rootPath of temporaryRoots.splice(0)) {
    fs.rmSync(rootPath, { recursive: true, force: true });
  }
});

describe("Ollama runtime startup", () => {
  it("auto-starts only the standard loopback Ollama endpoint", () => {
    expect(normalizeAutoStartOllamaUrl("http://localhost:11434/")).toBe("http://localhost:11434");
    expect(normalizeAutoStartOllamaUrl("http://127.0.0.1:11434")).toBe("http://127.0.0.1:11434");
    expect(normalizeAutoStartOllamaUrl("https://127.0.0.1:11434")).toBeNull();
    expect(normalizeAutoStartOllamaUrl("http://127.0.0.1:11435")).toBeNull();
    expect(normalizeAutoStartOllamaUrl("http://192.168.0.10:11434")).toBeNull();
    expect(normalizeAutoStartOllamaUrl("http://127.0.0.1:11434/proxy")).toBeNull();
  });

  it("does not launch another process when Ollama is already ready", async () => {
    const launch = vi.fn(async () => undefined);
    await expect(ensureOllamaRuntime("http://127.0.0.1:11434", {
      platform: "win32",
      probe: async () => true,
      launch
    })).resolves.toEqual({ status: "already_running", baseUrl: "http://127.0.0.1:11434" });
    expect(launch).not.toHaveBeenCalled();
  });

  it("launches the verified standard Windows executable and waits for readiness", async () => {
    const localAppData = fs.mkdtempSync(path.join(os.tmpdir(), "lem-ollama-runtime-"));
    temporaryRoots.push(localAppData);
    const executablePath = path.join(localAppData, "Programs", "Ollama", "ollama.exe");
    fs.mkdirSync(path.dirname(executablePath), { recursive: true });
    fs.writeFileSync(executablePath, "fixture");
    const launch = vi.fn(async () => undefined);
    const probe = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await expect(ensureOllamaRuntime("http://localhost:11434", {
      platform: "win32",
      env: { LOCALAPPDATA: localAppData },
      probe,
      launch,
      delay: async () => undefined
    })).resolves.toEqual({ status: "started", baseUrl: "http://localhost:11434" });
    expect(launch).toHaveBeenCalledWith(executablePath);
  });

  it("reports a missing installation without searching the working directory", async () => {
    const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lem-no-ollama-"));
    temporaryRoots.push(emptyRoot);
    expect(findOllamaExecutable({ LOCALAPPDATA: emptyRoot })).toBeNull();
    await expect(ensureOllamaRuntime("http://127.0.0.1:11434", {
      platform: "win32",
      env: { LOCALAPPDATA: emptyRoot },
      probe: async () => false
    })).resolves.toEqual({ status: "not_installed", baseUrl: "http://127.0.0.1:11434" });
  });
});
