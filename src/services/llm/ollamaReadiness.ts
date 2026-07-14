import { fetchWithTimeout } from "../../shared/fetchTimeout";
import { isLoopbackHttpUrl } from "../../shared/localEndpointPolicy";
import { OllamaReadinessError } from "../../shared/ollamaReadinessError";
import type {
  EnsureOllamaRuntimeResult,
  OllamaModelInput,
  OllamaModelStatusResult
} from "../../shared/types";

type OllamaReadinessApi = {
  ensureOllamaRunning(baseUrl?: string): Promise<EnsureOllamaRuntimeResult>;
  getOllamaModelStatus(input: OllamaModelInput): Promise<OllamaModelStatusResult>;
};

export async function ensureOllamaReadyForGeneration(input: {
  baseUrl: string;
  model: string;
  signal?: AbortSignal;
  api?: OllamaReadinessApi;
}) {
  throwIfAborted(input.signal);
  const baseUrl = input.baseUrl.trim() || "http://127.0.0.1:11434";
  const model = input.model.trim();
  if (!model) {
    throw new OllamaReadinessError("model_required", { baseUrl });
  }

  const api = input.api ?? getDesktopOllamaApi();
  if (api) {
    if (isLoopbackHttpUrl(baseUrl)) {
      const runtime = await api.ensureOllamaRunning(baseUrl);
      assertRuntimeCanContinue(runtime);
    }
    throwIfAborted(input.signal);
    const status = await api.getOllamaModelStatus({ baseUrl, model });
    throwIfAborted(input.signal);
    assertModelInstalled(status);
    return status;
  }

  const status = await getBrowserOllamaModelStatus({ baseUrl, model }, input.signal);
  assertModelInstalled(status);
  return status;
}

function getDesktopOllamaApi(): OllamaReadinessApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { localEnglishMiner?: { translations: OllamaReadinessApi } })
    .localEnglishMiner?.translations;
}

function assertRuntimeCanContinue(runtime: EnsureOllamaRuntimeResult) {
  if (runtime.status === "not_installed") {
    throw new OllamaReadinessError("runtime_not_installed", {
      baseUrl: runtime.baseUrl
    });
  }
  if (runtime.status === "start_failed") {
    throw new OllamaReadinessError("runtime_start_failed", {
      baseUrl: runtime.baseUrl
    });
  }
}

function assertModelInstalled(status: OllamaModelStatusResult) {
  if (!status.installed) {
    throw new OllamaReadinessError("model_missing", {
      baseUrl: status.baseUrl,
      model: status.model
    });
  }
}

async function getBrowserOllamaModelStatus(
  input: OllamaModelInput,
  signal?: AbortSignal
): Promise<OllamaModelStatusResult> {
  const baseUrl = (input.baseUrl?.trim() || "http://127.0.0.1:11434").replace(/\/$/, "");
  let response: Response;
  try {
    response = await fetchWithTimeout(`${baseUrl}/api/tags`, {}, {
      signal,
      timeoutMs: 10_000,
      timeoutMessage: "OLLAMA_MODEL_STATUS_TIMEOUT"
    });
  } catch {
    if (signal?.aborted) throw signal.reason;
    throw new OllamaReadinessError("server_unreachable", { baseUrl });
  }
  if (!response.ok) {
    throw new OllamaReadinessError("model_list_failed", {
      baseUrl,
      model: input.model.trim(),
      httpStatus: response.status
    });
  }
  const payload = (await response.json()) as {
    models?: Array<{ name?: string; model?: string }>;
  };
  const installedModels = (payload.models ?? [])
    .flatMap((entry) => [entry.name, entry.model])
    .filter((value): value is string => Boolean(value));
  const requested = input.model.trim().toLowerCase();
  const aliases = requested.includes(":") ? [requested] : [requested, `${requested}:latest`];
  return {
    baseUrl,
    model: input.model.trim(),
    installed: installedModels.some((installed) => aliases.includes(installed.toLowerCase())),
    installedModels
  };
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("Ollama request was canceled.", "AbortError");
  }
}
