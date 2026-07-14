import { describe, expect, it, vi } from "vitest";
import { OllamaReadinessError } from "../../shared/ollamaReadinessError";
import { ensureOllamaReadyForGeneration } from "./ollamaReadiness";

describe("Ollama generation readiness", () => {
  it("auto-starts a loopback runtime and accepts an installed model", async () => {
    const ensureOllamaRunning = vi.fn().mockResolvedValue({
      status: "started",
      baseUrl: "http://127.0.0.1:11434"
    });
    const getOllamaModelStatus = vi.fn().mockResolvedValue({
      baseUrl: "http://127.0.0.1:11434",
      model: "gemma4:12b",
      installed: true,
      installedModels: ["gemma4:12b"]
    });

    await expect(
      ensureOllamaReadyForGeneration({
        baseUrl: "http://127.0.0.1:11434",
        model: "gemma4:12b",
        api: { ensureOllamaRunning, getOllamaModelStatus }
      })
    ).resolves.toMatchObject({ installed: true });
    expect(ensureOllamaRunning).toHaveBeenCalledOnce();
  });

  it("does not launch a remote endpoint and rejects a missing model", async () => {
    const ensureOllamaRunning = vi.fn();
    const getOllamaModelStatus = vi.fn().mockResolvedValue({
      baseUrl: "http://ollama.example:11434",
      model: "missing",
      installed: false,
      installedModels: ["other:latest"]
    });

    await expect(
      ensureOllamaReadyForGeneration({
        baseUrl: "http://ollama.example:11434",
        model: "missing",
        api: { ensureOllamaRunning, getOllamaModelStatus }
      })
    ).rejects.toMatchObject({
      name: "OllamaReadinessError",
      code: "model_missing",
      details: { model: "missing" }
    } satisfies Partial<OllamaReadinessError>);
    expect(ensureOllamaRunning).not.toHaveBeenCalled();
  });

  it.each([
    ["not_installed", "runtime_not_installed"],
    ["start_failed", "runtime_start_failed"]
  ] as const)("stops before the model probe when local startup reports %s", async (status, code) => {
    const ensureOllamaRunning = vi.fn().mockResolvedValue({
      status,
      baseUrl: "http://127.0.0.1:11434"
    });
    const getOllamaModelStatus = vi.fn();

    await expect(
      ensureOllamaReadyForGeneration({
        baseUrl: "http://127.0.0.1:11434",
        model: "gemma4:12b",
        api: { ensureOllamaRunning, getOllamaModelStatus }
      })
    ).rejects.toMatchObject({
      name: "OllamaReadinessError",
      code
    } satisfies Partial<OllamaReadinessError>);
    expect(getOllamaModelStatus).not.toHaveBeenCalled();
  });

  it("honors cancellation before starting Ollama", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("cancelled", "AbortError"));
    const ensureOllamaRunning = vi.fn();
    const getOllamaModelStatus = vi.fn();

    await expect(
      ensureOllamaReadyForGeneration({
        baseUrl: "http://127.0.0.1:11434",
        model: "gemma4:12b",
        signal: controller.signal,
        api: { ensureOllamaRunning, getOllamaModelStatus }
      })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(ensureOllamaRunning).not.toHaveBeenCalled();
    expect(getOllamaModelStatus).not.toHaveBeenCalled();
  });
});
