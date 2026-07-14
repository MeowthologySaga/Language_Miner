import { describe, expect, it } from "vitest";
import { TranslationJobRegistry } from "./translationJobRegistry";

describe("TranslationJobRegistry", () => {
  it("cancels only the matching renderer request and cleans state in finish", () => {
    const registry = new TranslationJobRegistry();
    const first = registry.start(10, "pdf-job-1");
    const otherRenderer = registry.start(11, "pdf-job-1");

    expect(registry.cancel(10, "pdf-job-1")).toBe(true);
    expect(first.signal.aborted).toBe(true);
    expect(otherRenderer.signal.aborted).toBe(false);
    expect(registry.isActive(10, "pdf-job-1")).toBe(true);

    first.finish();
    expect(registry.isActive(10, "pdf-job-1")).toBe(false);
    expect(registry.cancel(10, "pdf-job-1")).toBe(false);
    otherRenderer.finish();
  });

  it("rejects duplicate active ids and allows reuse after finally cleanup", () => {
    const registry = new TranslationJobRegistry();
    const job = registry.start(1, "translate:42");
    expect(() => registry.start(1, "translate:42")).toThrow("already active");
    job.finish();
    expect(() => registry.start(1, "translate:42").finish()).not.toThrow();
  });

  it("rejects request ids that are unsafe or unbounded", () => {
    const registry = new TranslationJobRegistry();
    expect(() => registry.start(1, "has spaces")).toThrow("1-128 characters");
    expect(() => registry.cancel(1, "../job")).toThrow("1-128 characters");
    expect(() => registry.cancel(1, "")).toThrow("required");
  });
});
