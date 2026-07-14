import { describe, expect, it } from "vitest";
import {
  assessTranslationUsageBudget,
  combineTranslationUsageBudgetRequests,
  createTranslationUsageEvent,
  estimateTranslationUsage,
  scaleTranslationUsageBudgetRequestForAttempts,
  scaleTranslationUsageTotalsForAttempts
} from "./translationUsage";

describe("translation usage estimates", () => {
  const sampleTexts = [
    { text: "In a hole in the ground there lived a hobbit.", cacheStatus: "miss" as const },
    { text: "Not a nasty, dirty, wet hole.", cacheStatus: "miss" as const }
  ];

  it("treats local translation as zero API cost", () => {
    const estimate = estimateTranslationUsage({
      texts: sampleTexts,
      providerName: "local",
      model: "gemma4:12b",
      targetLang: "ko"
    });

    expect(estimate.estimatedCostKrw).toEqual({ min: 0, max: 0 });
    expect(estimate.localOnly).toBe(true);
  });

  it("treats browser built-in translation as zero API cost", () => {
    const estimate = estimateTranslationUsage({
      texts: sampleTexts,
      providerName: "browser",
      model: "browser-translator",
      targetLang: "ko"
    });

    expect(estimate.estimatedCostKrw).toEqual({ min: 0, max: 0 });
    expect(estimate.localOnly).toBe(true);
  });

  it("treats Local MT as zero API cost without LLM prompt overhead", () => {
    const estimate = estimateTranslationUsage({
      texts: sampleTexts,
      providerName: "localMt",
      model: "Xenova/nllb-200-distilled-600M",
      targetLang: "ko"
    });

    expect(estimate.estimatedCostKrw).toEqual({ min: 0, max: 0 });
    expect(estimate.localOnly).toBe(true);
    expect(estimate.inputTokens.max).toBeLessThan(100);
  });

  it("uses a conservative paid-risk estimate even when free tier is selected", () => {
    const estimate = estimateTranslationUsage({
      texts: sampleTexts,
      providerName: "gemini",
      model: "gemini-2.5-flash",
      plan: "free",
      targetLang: "ko"
    });

    expect(estimate.totalTokens.max).toBeGreaterThan(0);
    expect(estimate.estimatedCostKrw.min).toBeGreaterThan(0);
    expect(estimate.estimatedCostKrw.max).toBeGreaterThanOrEqual(
      estimate.estimatedCostKrw.min
    );
    expect(estimate.freeTier).toBe(true);
  });

  it("calculates paid Gemini cost from input and output token ranges", () => {
    const estimate = estimateTranslationUsage({
      texts: sampleTexts,
      providerName: "gemini",
      model: "gemini-2.5-flash",
      plan: "paid",
      targetLang: "ko"
    });

    expect(estimate.estimatedCostKrw.max).toBeGreaterThan(0);
  });

  it("uses high long-context and unknown-model rates instead of a cheap fallback", () => {
    const usage = {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      totalTokens: 2_000_000,
      billableCharacters: 4_000_000,
      requestCount: 1,
      cacheHitCount: 0,
      cacheMissCount: 1
    };
    const pro = createTranslationUsageEvent({
      providerName: "gemini",
      model: "gemini-2.5-pro",
      plan: "free",
      targetLang: "ko",
      usage
    });
    const unknown = createTranslationUsageEvent({
      providerName: "gemini",
      model: "future-gemini-model",
      plan: "free",
      targetLang: "ko",
      usage
    });

    expect(pro.estimatedCostKrw.max).toBeGreaterThanOrEqual(30_000);
    expect(unknown.estimatedCostKrw.max).toBeGreaterThan(pro.estimatedCostKrw.max);
  });

  it("calculates Google Translate cost from uncached source characters", () => {
    const estimate = estimateTranslationUsage({
      texts: sampleTexts,
      providerName: "google",
      model: "google-translate-v2",
      targetLang: "ko"
    });

    expect(estimate.billableCharacters).toBe(
      sampleTexts.reduce((sum, item) => sum + item.text.length, 0)
    );
    expect(estimate.estimatedCostKrw.max).toBeGreaterThan(0);
  });

  it("excludes cache hits from billable usage and reports cache savings", () => {
    const estimate = estimateTranslationUsage({
      texts: [
        { text: "Cached paragraph.", cacheStatus: "hit" },
        { text: "New paragraph.", cacheStatus: "miss" }
      ],
      providerName: "gemini",
      model: "gemini-2.5-flash",
      plan: "paid",
      targetLang: "ko"
    });

    expect(estimate.cacheHitCount).toBe(1);
    expect(estimate.cacheMissCount).toBe(1);
    expect(estimate.billableCharacters).toBe("New paragraph.".length);
    expect(estimate.cacheSavingsPercent).toBeGreaterThan(0);
  });

  it("builds usage events without including secrets", () => {
    const event = createTranslationUsageEvent({
      providerName: "gemini",
      model: "gemini-2.5-flash",
      plan: "paid",
      targetLang: "ko",
      usage: {
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
        billableCharacters: 2000,
        requestCount: 1,
        cacheHitCount: 0,
        cacheMissCount: 1
      }
    });

    expect(JSON.stringify(event)).not.toContain("API");
    expect(event.estimatedCostKrw.max).toBeGreaterThan(0);
  });

  it("checks a whole task against cumulative daily and monthly usage", () => {
    const assessment = assessTranslationUsageBudget({
      request: { estimatedTokens: 250, estimatedCostKrw: 120 },
      current: { todayTokens: 800, monthCostKrw: 900 },
      settings: {
        dailyAppTokenLimit: 1_000,
        monthlySpendLimitKrw: 1_000,
        stopOnFreeTierLimit: true,
        stopOnMonthlyLimit: true
      }
    });

    expect(assessment.allowed).toBe(false);
    expect(assessment.projectedTodayTokens).toBe(1_050);
    expect(assessment.projectedMonthCostKrw).toBe(1_020);
    expect(assessment.dailyLimitExceeded).toBe(true);
    expect(assessment.monthlyLimitExceeded).toBe(true);
    expect(assessment.billingDisclaimer).toContain("실제 청구를 차단");
  });

  it("honors disabled stop toggles and sums bulk estimates", () => {
    const request = combineTranslationUsageBudgetRequests([
      { estimatedTokens: 100, estimatedCostKrw: 20 },
      { estimatedTokens: 200, estimatedCostKrw: 30 }
    ]);
    const assessment = assessTranslationUsageBudget({
      request,
      current: { todayTokens: 999, monthCostKrw: 999 },
      settings: {
        dailyAppTokenLimit: 1,
        monthlySpendLimitKrw: 0,
        stopOnFreeTierLimit: false,
        stopOnMonthlyLimit: false
      }
    });

    expect(request).toEqual({ estimatedTokens: 300, estimatedCostKrw: 50 });
    expect(assessment.allowed).toBe(true);
  });

  it("treats a zero monthly limit as not configured", () => {
    const assessment = assessTranslationUsageBudget({
      request: { estimatedTokens: 1, estimatedCostKrw: 10_000 },
      current: { todayTokens: 0, monthCostKrw: 0 },
      settings: {
        dailyAppTokenLimit: 100,
        monthlySpendLimitKrw: 0,
        stopOnFreeTierLimit: false,
        stopOnMonthlyLimit: true
      }
    });

    expect(assessment.allowed).toBe(true);
    expect(assessment.monthlyLimitExceeded).toBe(false);
  });

  it("scales both reservations and recorded totals to the remote-attempt ceiling", () => {
    expect(
      scaleTranslationUsageBudgetRequestForAttempts(
        { estimatedTokens: 125, estimatedCostKrw: 3 },
        4
      )
    ).toEqual({ estimatedTokens: 500, estimatedCostKrw: 12 });
    expect(
      scaleTranslationUsageTotalsForAttempts(
        {
          inputTokens: 100,
          outputTokens: 25,
          totalTokens: 125,
          billableCharacters: 20,
          requestCount: 1,
          cacheHitCount: 0,
          cacheMissCount: 1
        },
        4
      )
    ).toEqual({
      inputTokens: 400,
      outputTokens: 100,
      totalTokens: 500,
      billableCharacters: 80,
      requestCount: 4,
      cacheHitCount: 0,
      cacheMissCount: 4
    });
  });
});
