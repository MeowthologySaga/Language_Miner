"use strict";

(() => {
  const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";
  const DEFAULT_USD_TO_KRW = 1400;
  const COST_SAFETY_MULTIPLIER = 1.25;
  const pricingRules = Object.freeze([
    Object.freeze({ modelIncludes: "3.1-pro", inputUsdPerMillion: 4, outputUsdPerMillion: 18 }),
    Object.freeze({ modelIncludes: "2.5-pro", inputUsdPerMillion: 2.5, outputUsdPerMillion: 15 }),
    Object.freeze({ modelIncludes: "3.1-flash-lite", inputUsdPerMillion: 0.25, outputUsdPerMillion: 1.5 }),
    Object.freeze({ modelIncludes: "3.5-flash", inputUsdPerMillion: 1.5, outputUsdPerMillion: 9 }),
    Object.freeze({ modelIncludes: "2.5-flash-lite", inputUsdPerMillion: 0.1, outputUsdPerMillion: 0.4 }),
    Object.freeze({ modelIncludes: "2.5-flash", inputUsdPerMillion: 0.3, outputUsdPerMillion: 2.5 }),
    Object.freeze({ modelIncludes: "3-flash", inputUsdPerMillion: 0.5, outputUsdPerMillion: 3 })
  ]);
  const unknownModelTokenPrice = Object.freeze({
    inputUsdPerMillion: 4,
    outputUsdPerMillion: 18
  });

  function getGeminiPaidTokenPrice(model) {
    const normalized = (String(model || "").trim() || DEFAULT_GEMINI_MODEL).toLowerCase();
    const rule =
      pricingRules.find((rule) => normalized.includes(rule.modelIncludes)) ||
      unknownModelTokenPrice;
    return {
      inputUsdPerMillion: rule.inputUsdPerMillion,
      outputUsdPerMillion: rule.outputUsdPerMillion
    };
  }

  function estimateConservativeGeminiCostKrw({
    model,
    plan,
    inputTokens,
    outputTokens,
    usdToKrw = DEFAULT_USD_TO_KRW
  }) {
    // A free-tier selection is configuration metadata, not a zero-charge guarantee.
    void plan;
    const price = getGeminiPaidTokenPrice(model);
    const normalizedInputTokens = Math.max(0, Number(inputTokens) || 0);
    const normalizedOutputTokens = Math.max(0, Number(outputTokens) || 0);
    const costKrw =
      ((normalizedInputTokens / 1_000_000) * price.inputUsdPerMillion +
        (normalizedOutputTokens / 1_000_000) * price.outputUsdPerMillion) *
      Math.max(0, Number(usdToKrw) || 0);
    if (costKrw <= 0) {
      return 0;
    }
    return Math.max(1, Math.ceil(costKrw * COST_SAFETY_MULTIPLIER));
  }

  globalThis.LanguageMinerGeminiPricing = Object.freeze({
    DEFAULT_GEMINI_MODEL,
    DEFAULT_USD_TO_KRW,
    COST_SAFETY_MULTIPLIER,
    pricingRules,
    unknownModelTokenPrice,
    getGeminiPaidTokenPrice,
    estimateConservativeGeminiCostKrw
  });
})();
