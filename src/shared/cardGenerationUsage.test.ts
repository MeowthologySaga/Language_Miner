import { describe, expect, it } from "vitest";
import { estimateCardGenerationUsage } from "./cardGenerationUsage";
import { defaultLearningProfile } from "./languages";

const baseInput = {
  selectedText: "dilapidated",
  sourceSentence: "The street was lined with dilapidated houses.",
  readerTextContext: "The street was lined with dilapidated houses.",
  settings: {
    providerName: "gemini" as const,
    ollamaModel: "gemma3:12b",
    geminiModel: "gemini-2.5-flash-lite",
    geminiPlan: "free" as const,
    learningProfile: defaultLearningProfile,
    dailyAppTokenLimit: 500_000,
    monthlySpendLimitKrw: 5_000
  }
};

describe("card generation usage estimate", () => {
  it("shows a conservative paid-risk estimate for a selected Gemini free tier", () => {
    const estimate = estimateCardGenerationUsage(baseInput);

    expect(estimate.costLabel).not.toBe("0원");
    expect(estimate.electricityLabel).toBe("0원");
    expect(estimate.tokenLabel).toMatch(/tokens$/);
    expect(estimate.requestLabel).toBe("1회");
    expect(estimate.costKrw).toBeGreaterThan(0);
    expect(estimate.requestCount).toBe(1);
    expect(estimate.noteKey).toBe("geminiFreeConservative");
  });

  it("shows local electricity for Ollama card generation", () => {
    const estimate = estimateCardGenerationUsage({
      ...baseInput,
      settings: {
        ...baseInput.settings,
        providerName: "ollama"
      }
    });

    expect(estimate.costLabel).toBe("0원");
    expect(estimate.electricityLabel).not.toBe("");
    expect(estimate.runtimeLabel).toContain("로컬");
    expect(estimate.electricityKrw).toBeGreaterThanOrEqual(0);
    expect(estimate.runtimeSeconds).toBeGreaterThan(0);
    expect(estimate.noteKey).toBe("ollamaLocal");
  });

  it("does not present the manual ChatGPT Web bridge as metered API usage", () => {
    const estimate = estimateCardGenerationUsage({
      ...baseInput,
      settings: {
        ...baseInput.settings,
        providerName: "chatgptWeb"
      }
    });

    expect(estimate.noteKey).toBe("chatgptWebManual");
    expect(estimate.costKrw).toBeUndefined();
    expect(estimate.requestCount).toBeUndefined();
  });
});
