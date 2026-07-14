import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import "../i18n";
import { PdfMakerUsageEstimate } from "./PdfMakerUsageEstimate";

describe("PdfMakerUsageEstimate", () => {
  it("renders token, provider, usage, and limit warning details", () => {
    const html = renderToStaticMarkup(
      <PdfMakerUsageEstimate
        estimate={{
          billableCharacters: 900,
          cacheHitCount: 1,
          cacheMissCount: 2,
          cacheSavingsPercent: 25,
          dailyLimitUsagePercent: { min: 12, max: 48 },
          estimatedCostKrw: { min: 100, max: 250 },
          freeTier: false,
          inputTokens: { min: 1200, max: 2400 },
          localOnly: false,
          model: "gemini-test",
          monthlyLimitUsagePercent: { min: 10, max: 20 },
          outputTokens: { min: 400, max: 800 },
          providerName: "gemini",
          requestCount: 1,
          sourceLang: "en",
          targetLang: "ko",
          textCount: 3,
          totalCharacters: 1200,
          totalTokens: { min: 1600, max: 3200 }
        }}
        makerFreeTierLimitBlocked={false}
        makerMonthlyLimitBlocked={true}
        makerUsageStatus="test usage status"
        providerLabel="Gemini"
      />
    );

    expect(html).toContain("book-maker-usage-estimate");
    expect(html).toContain("Gemini");
    expect(html).toContain("25%");
    expect(html).toContain("48%");
    expect(html).toContain("style=\"width:48%\"");
    expect(html).toContain("test usage status");
    expect(html).toContain("selection-warning compact");
  });
});
