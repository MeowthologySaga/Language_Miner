import { describe, expect, it } from "vitest";
import {
  isNoisyDiscordLifeLogMetadataMessage,
  normalizeWebReaderLifeMiningMetadata
} from "./webReaderLifeMiningState";

describe("webReaderLifeMiningState", () => {
  it("normalizes primitive metadata fields and message payloads", () => {
    const metadata = normalizeWebReaderLifeMiningMetadata({
      url: "  https://example.com/thread  ",
      title: "  Study   Thread  ",
      siteKey: "discord",
      ignoredObject: { nope: true },
      messages: [
        { role: "unknown", raw_content: "   " },
        { role: "unknown", speaker: "  user  ", raw_content: "  hello\n\nworld  " },
        { role: "assistant", raw_content: "today" }
      ]
    });

    expect(metadata).toMatchObject({
      url: "https://example.com/thread",
      title: "Study Thread",
      siteKey: "discord",
      messages: [
        {
          role: "other",
          speaker: "user",
          raw_content: "hello\nworld"
        }
      ]
    });
    expect(metadata.ignoredObject).toBeUndefined();
  });

  it("keeps only the latest 36 messages", () => {
    const metadata = normalizeWebReaderLifeMiningMetadata({
      siteKey: "genericWeb",
      messages: Array.from({ length: 40 }, (_unused, index) => ({
        role: "user",
        raw_content: `message ${index}`
      }))
    });

    expect(metadata.messages).toHaveLength(36);
    expect(metadata.messages?.[0].raw_content).toBe("message 4");
    expect(metadata.messages?.[35].raw_content).toBe("message 39");
  });

  it("filters Discord chrome text without filtering other sites", () => {
    expect(isNoisyDiscordLifeLogMetadataMessage("discord", "today")).toBe(true);
    expect(isNoisyDiscordLifeLogMetadataMessage("discord", "message #general")).toBe(true);
    expect(isNoisyDiscordLifeLogMetadataMessage("discord", "actual learner sentence")).toBe(false);
    expect(isNoisyDiscordLifeLogMetadataMessage("genericWeb", "today")).toBe(false);
  });
});
