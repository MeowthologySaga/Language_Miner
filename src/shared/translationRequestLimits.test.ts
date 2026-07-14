import { describe, expect, it } from "vitest";
import {
  GEMINI_PDF_BATCH_MAX_REMOTE_CALLS,
  OLLAMA_PDF_BATCH_MAX_REMOTE_CALLS,
  RemoteRequestBudget,
  RemoteRequestBudgetExceededError,
  isTranslationCancellationError,
  throwIfTranslationAborted
} from "./translationRequestLimits";

describe("translation remote request limits", () => {
  it("counts retries, repair, and fallback calls against one finite task budget", () => {
    const budget = new RemoteRequestBudget(3, "test batch");
    budget.consume();
    budget.consume();
    budget.consume();
    expect(budget.remaining).toBe(0);
    expect(() => budget.consume()).toThrow(RemoteRequestBudgetExceededError);
  });

  it("documents finite per-batch ceilings that still allow chunked large PDFs", () => {
    expect(GEMINI_PDF_BATCH_MAX_REMOTE_CALLS).toBe(8);
    expect(OLLAMA_PDF_BATCH_MAX_REMOTE_CALLS).toBe(8);
  });

  it("throws the caller abort reason before another request starts", () => {
    const controller = new AbortController();
    controller.abort(new DOMException("user canceled", "AbortError"));
    expect(() => throwIfTranslationAborted(controller.signal)).toThrow("user canceled");
  });

  it("recognizes an AbortError serialized by Electron as a plain Error", () => {
    expect(
      isTranslationCancellationError(
        new Error("Error invoking remote method: Translation request was canceled.")
      )
    ).toBe(true);
    expect(isTranslationCancellationError(new Error("HTTP 500"))).toBe(false);
  });
});
