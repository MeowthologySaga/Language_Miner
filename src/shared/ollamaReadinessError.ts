export type OllamaReadinessErrorCode =
  | "model_required"
  | "runtime_not_installed"
  | "runtime_start_failed"
  | "model_missing"
  | "server_unreachable"
  | "model_list_failed";

export type OllamaReadinessErrorDetails = {
  baseUrl?: string;
  model?: string;
  httpStatus?: number;
};

export class OllamaReadinessError extends Error {
  readonly code: OllamaReadinessErrorCode;
  readonly details: OllamaReadinessErrorDetails;

  constructor(
    code: OllamaReadinessErrorCode,
    details: OllamaReadinessErrorDetails = {}
  ) {
    super(`OLLAMA_READINESS:${code}`);
    this.name = "OllamaReadinessError";
    this.code = code;
    this.details = details;
  }
}

export function isOllamaReadinessError(error: unknown): error is OllamaReadinessError {
  return error instanceof OllamaReadinessError;
}
