import { describe, expect, it, vi } from "vitest";
import { defaultLearningProfile } from "../../shared/languages";
import { defaultSettings } from "../../appSettings";
import { sampleReadingCard } from "./mockProvider";
import { ManualChatGptProvider } from "./manualChatGptProvider";
import { createProvider } from "./providerRegistry";

describe("ManualChatGptProvider", () => {
  it("is selected explicitly without an API key", () => {
    const provider = createProvider(
      { ...defaultSettings, providerName: "chatgptWeb", geminiApiKey: "" },
      { manualChatGptBridge: async () => "" }
    );

    expect(provider.name).toBe("ManualChatGptWebProvider");
  });

  it("round-trips a manually pasted reading-card envelope through the shared normalizer", async () => {
    const bridge = vi.fn(async (request) => {
      const card = {
        ...sampleReadingCard("We keep going.", ["keep going"], defaultLearningProfile),
        deckType: "input",
        direction: "target_to_native"
      };
      return JSON.stringify({
        schemaVersion: 1,
        kind: "language-miner.card-response",
        requestId: request.requestId,
        task: "reading_card",
        card
      });
    });
    const provider = new ManualChatGptProvider(bridge);

    const card = await provider.generateReadingCard({
      selectedText: "keep going",
      sourceSentence: "We keep going.",
      learningProfile: defaultLearningProfile
    });

    expect(card).toMatchObject({
      cardType: "reading",
      deckType: "input",
      direction: "target_to_native",
      sourceSentence: "We keep going."
    });
    expect(bridge).toHaveBeenCalledOnce();
    expect(bridge.mock.calls[0][0].prompt).toContain("language-miner.card-response");
  });

  it("validates a pasted response before returning it to the caller", async () => {
    const provider = new ManualChatGptProvider(async (request) => {
      expect(() => request.validateResponse("not json")).toThrow(/one valid JSON object/i);
      return "not json";
    });

    await expect(
      provider.generateReadingCard({
        selectedText: "keep going",
        sourceSentence: "We keep going.",
        learningProfile: defaultLearningProfile
      })
    ).rejects.toThrow(/one valid JSON object/i);
  });
});
