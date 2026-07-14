import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import {
  COST_SAFETY_MULTIPLIER,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_USD_TO_KRW,
  GEMINI_PAID_TOKEN_PRICE_RULES,
  GEMINI_UNKNOWN_MODEL_TOKEN_PRICE,
  createTranslationUsageEvent,
  getGeminiPaidTokenPrice
} from "../src/shared/translationUsage";
import { GEMINI_MAX_ATTEMPTS_PER_REQUEST } from "../src/shared/translationRequestLimits";

const source = fs.readFileSync(
  path.join(process.cwd(), "extension", "src", "content", "selectionCards.js"),
  "utf8"
);
const pricingSource = fs.readFileSync(
  path.join(process.cwd(), "extension", "src", "shared", "geminiPricing.js"),
  "utf8"
);

type ExtensionPricingApi = {
  DEFAULT_GEMINI_MODEL: string;
  DEFAULT_USD_TO_KRW: number;
  COST_SAFETY_MULTIPLIER: number;
  pricingRules: Array<{
    modelIncludes: string;
    inputUsdPerMillion: number;
    outputUsdPerMillion: number;
  }>;
  unknownModelTokenPrice: {
    inputUsdPerMillion: number;
    outputUsdPerMillion: number;
  };
  getGeminiPaidTokenPrice(model: string): {
    inputUsdPerMillion: number;
    outputUsdPerMillion: number;
  };
  estimateConservativeGeminiCostKrw(input: {
    model: string;
    plan: "free" | "paid";
    inputTokens: number;
    outputTokens: number;
  }): number;
};

function loadExtensionPricing() {
  const context: Record<string, unknown> = {};
  vm.runInNewContext(pricingSource, context, { filename: "geminiPricing.js" });
  return context.LanguageMinerGeminiPricing as ExtensionPricingApi;
}

const extensionPricing = loadExtensionPricing();

describe("extension selection card cost boundary", () => {
  it("shows a conservative four-attempt Gemini estimate", () => {
    const retryCount = source.match(
      /providerName === "fallback" \? 0 : providerName === "gemini" \? (\d+) : 1/
    );
    expect(retryCount).not.toBeNull();
    expect(Number(retryCount?.[1])).toBe(GEMINI_MAX_ATTEMPTS_PER_REQUEST);
    expect(source).toContain("(inputRange.min + overhead.min) * requestCount");
    expect(source).toContain("(inputRange.max + overhead.max) * requestCount");
  });

  it("does not turn a user-selected free tier into a zero-cost promise", () => {
    expect(source).toContain('if (providerName !== "gemini")');
    expect(source).not.toContain('providerName !== "gemini" || plan === "free"');
  });

  it("loads the pricing helper before the selection-card content script", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "extension", "manifest.json"), "utf8")
    ) as { content_scripts: Array<{ js: string[] }> };
    const scripts = manifest.content_scripts.find((entry) =>
      entry.js.includes("src/content/selectionCards.js")
    )?.js;

    expect(scripts).toBeDefined();
    expect(scripts!.indexOf("src/shared/geminiPricing.js")).toBeGreaterThanOrEqual(0);
    expect(scripts!.indexOf("src/shared/geminiPricing.js")).toBeLessThan(
      scripts!.indexOf("src/content/selectionCards.js")
    );
  });

  it("keeps every extension pricing rule and safety constant equal to the app", () => {
    expect(extensionPricing.DEFAULT_GEMINI_MODEL).toBe(DEFAULT_GEMINI_MODEL);
    expect(extensionPricing.DEFAULT_USD_TO_KRW).toBe(DEFAULT_USD_TO_KRW);
    expect(extensionPricing.COST_SAFETY_MULTIPLIER).toBe(COST_SAFETY_MULTIPLIER);
    expect(Array.from(extensionPricing.pricingRules, (rule) => ({ ...rule }))).toEqual(
      GEMINI_PAID_TOKEN_PRICE_RULES.map((rule) => ({ ...rule }))
    );
    expect({ ...extensionPricing.unknownModelTokenPrice }).toEqual(
      GEMINI_UNKNOWN_MODEL_TOKEN_PRICE
    );
  });

  it.each([
    ["default model", ""],
    ["Flash-Lite", "gemini-2.5-flash-lite"],
    ["Flash", "gemini-2.5-flash"],
    ["2.5 Pro", "gemini-2.5-pro"],
    ["custom 2.5 Pro alias", "models/gemini-2.5-pro-custom"],
    ["3.1 Pro", "gemini-3.1-pro-preview"],
    ["future unknown model", "gemini-future-ultra"]
  ])("matches app pricing at runtime for %s", (_label, model) => {
    expect({ ...extensionPricing.getGeminiPaidTokenPrice(model) }).toEqual(
      getGeminiPaidTokenPrice(model)
    );

    for (const plan of ["free", "paid"] as const) {
      const inputTokens = 1_234_567;
      const outputTokens = 765_432;
      const appEvent = createTranslationUsageEvent({
        providerName: "gemini",
        model,
        plan,
        targetLang: "ko",
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          billableCharacters: 0,
          requestCount: 4,
          cacheHitCount: 0,
          cacheMissCount: 1
        }
      });

      expect(
        extensionPricing.estimateConservativeGeminiCostKrw({
          model,
          plan,
          inputTokens,
          outputTokens
        })
      ).toBe(appEvent.estimatedCostKrw.max);
    }
  });

  it("uses a high fail-closed fallback instead of a cheap price when the helper is absent", () => {
    expect(source).toContain("(inputTokens.max / 1_000_000) * 4");
    expect(source).toContain("(outputTokens.max / 1_000_000) * 18");
    expect(source).toContain("Math.ceil(costKrw * 1.25)");
  });
});
