import { describe, expect, it } from "vitest";
import { defaultSettings } from "../appSettings";
import { buildCloudTranslationPreflight } from "./cloudTranslationPreflight";

describe("cloud translation preflight", () => {
  it.each([
    { providerName: "localMt" as const, ollamaBaseUrl: "http://localhost:11434" },
    { providerName: "browser" as const, ollamaBaseUrl: "http://localhost:11434" },
    { providerName: "local" as const, ollamaBaseUrl: "http://127.0.0.1:11434" }
  ])("does not warn for local-only provider $providerName", ({ providerName, ollamaBaseUrl }) => {
    expect(
      buildCloudTranslationPreflight(
        {
          settings: {
            ...defaultSettings,
            translationProviderName: providerName,
            ollamaBaseUrl
          },
          operation: "text",
          textGroups: [["Local text"]],
          scopeLabel: "local",
          dataCategories: ["text"]
        },
        0
      )
    ).toBeNull();
  });

  it("counts every Gemini text task and its retry ceiling", () => {
    const details = buildCloudTranslationPreflight(
      {
        settings: { ...defaultSettings, translationProviderName: "gemini" },
        operation: "text",
        textGroups: [["First subtitle"], ["Second subtitle"]],
        scopeLabel: "two subtitles",
        dataCategories: ["subtitle text"]
      },
      125
    );

    expect(details).toMatchObject({
      providerName: "gemini",
      estimatedCalls: 2,
      maximumCalls: 8,
      currentMonthAppEstimateKrw: 125,
      textCount: 2
    });
    expect(details?.projectedMonthAppEstimateKrw).toBeGreaterThanOrEqual(125);
  });

  it("still requires an external-transfer preflight when cost confirmations are disabled", () => {
    const details = buildCloudTranslationPreflight(
      {
        settings: {
          ...defaultSettings,
          translationProviderName: "gemini",
          confirmEstimatedCostBeforeRun: false
        },
        operation: "text",
        textGroups: [["This text leaves the device."]],
        scopeLabel: "one card",
        dataCategories: ["card text"]
      },
      0
    );

    expect(details?.providerName).toBe("gemini");
  });

  it("uses one Google call per eight-item PDF batch", () => {
    const details = buildCloudTranslationPreflight(
      {
        settings: { ...defaultSettings, translationProviderName: "google" },
        operation: "pdf",
        textGroups: [Array.from({ length: 17 }, (_, index) => `Segment ${index}`)],
        scopeLabel: "one PDF page",
        dataCategories: ["PDF text"]
      },
      0
    );

    expect(details).toMatchObject({
      providerName: "google",
      estimatedCalls: 3,
      maximumCalls: 3,
      textCount: 17
    });
  });

  it("warns for remote Ollama and marks server cost as unknown", () => {
    const details = buildCloudTranslationPreflight(
      {
        settings: {
          ...defaultSettings,
          translationProviderName: "local",
          ollamaBaseUrl: "https://ollama.example.net"
        },
        operation: "pdf",
        textGroups: [["one", "two", "three", "four", "five"]],
        scopeLabel: "remote PDF",
        dataCategories: ["PDF text"]
      },
      20
    );

    expect(details).toMatchObject({
      providerName: "remoteOllama",
      endpointLabel: "https://ollama.example.net",
      estimatedCalls: 2,
      maximumCalls: 16,
      remoteCostUnknown: true,
      estimatedCostKrw: { min: 0, max: 0 }
    });
  });
});
