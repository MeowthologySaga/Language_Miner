import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import i18n from "../i18n";
import { CardGenerationUsageEstimate } from "./CardGenerationUsageEstimate";

describe("CardGenerationUsageEstimate", () => {
  afterEach(async () => {
    await i18n.changeLanguage("ko");
  });

  it("renders the compact cost badge with keyboard-linked tooltip details", () => {
    const html = renderToStaticMarkup(
      <CardGenerationUsageEstimate
        estimate={{
          costLabel: "2원",
          electricityLabel: "0원",
          tokenLabel: "4.5k tokens",
          requestLabel: "1회",
          note: "Gemini 기준"
        }}
        variant="badge"
      />
    );

    expect(html).toContain("예상 2원");
    expect(html).toContain("role=\"tooltip\"");
    expect(html).toContain("aria-describedby=");
    expect(html).toContain("예상 전기요금");
    expect(html).toContain("4.5k tokens");
    expect(html).toContain("Gemini 기준");
    expect(html).toContain("실제 청구를 차단하는 결제 한도");
  });

  it("formats raw counts and KRW estimates for the active English UI locale", async () => {
    await i18n.changeLanguage("en");

    const html = renderToStaticMarkup(
      <CardGenerationUsageEstimate
        estimate={{
          costLabel: "legacy",
          electricityLabel: "legacy",
          tokenLabel: "legacy",
          requestLabel: "legacy",
          costKrw: 1234.2,
          electricityKrw: 0.4,
          tokenCount: 12345.2,
          requestCount: 2,
          runtimeSeconds: 75,
          noteKey: "geminiFreeConservative"
        }}
        variant="badge"
      />
    );

    expect(html).toContain("Est. ₩1,235");
    expect(html).toContain("Less than ₩1");
    expect(html).toContain("12,346 tokens");
    expect(html).toContain("2 calls");
    expect(html).toContain("1.3 min local runtime");
    expect(html).not.toContain("does not call an LLM");
    expect(html).toContain("not a billing limit that blocks provider charges");
  });

  it("labels ChatGPT Web as a manual subscription workflow rather than an API call", async () => {
    await i18n.changeLanguage("en");
    const html = renderToStaticMarkup(
      <CardGenerationUsageEstimate
        estimate={{
          costLabel: "",
          electricityLabel: "",
          tokenLabel: "",
          requestLabel: "",
          noteKey: "chatgptWebManual"
        }}
      />
    );

    expect(html).toContain("No separate API charge");
    expect(html).toContain("Handled in ChatGPT Web");
    expect(html).toContain("ChatGPT message limits");
    expect(html).not.toContain("billing limit that blocks provider charges");
  });
});
