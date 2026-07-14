import { describe, expect, it } from "vitest";
import { getLifeLogDisplayMessages } from "./lifeLogMessages";
import type { LifeLog } from "./types";

describe("lifeLogMessages Discord blocks", () => {
  it("keeps Discord speakers and does not split colon patterns inside message content", () => {
    const log = makeLifeLog({
      appName: "Discord",
      text: "This is my reply\n\nwith multiple enters.",
      metadata: {
        messages: [
          {
            role: "other",
            speaker: "Meowthology",
            raw_content:
              'Name: Mina\nJSON: {"host_permissions": ["https://discord.com/*"]}\nA: this stays in one Discord block'
          },
          {
            role: "other",
            speaker: "CodexQA",
            raw_content: "Example: one more message with Speaker: inside the content"
          },
          {
            role: "user",
            speaker: "Me",
            raw_content: "This is my reply\n\nwith multiple enters."
          }
        ]
      }
    });

    const messages = getLifeLogDisplayMessages(log, "Discord");

    expect(messages).toEqual([
      {
        role: "other",
        speaker: "Meowthology",
        text:
          'Name: Mina\nJSON: {"host_permissions": ["https://discord.com/*"]}\nA: this stays in one Discord block'
      },
      {
        role: "other",
        speaker: "CodexQA",
        text: "Example: one more message with Speaker: inside the content"
      },
      {
        role: "me",
        speaker: "나",
        text: "This is my reply\n\nwith multiple enters."
      }
    ]);
  });

  it("uses the captured Discord current user speaker to render previous own messages as mine", () => {
    const log = makeLifeLog({
      appName: "Discord",
      text: "current message",
      metadata: {
        currentUserSpeaker: "MeowMew",
        messages: [
          {
            role: "other",
            speaker: "MeowMew",
            raw_content: "previous own message"
          },
          {
            role: "other",
            speaker: "link",
            raw_content: "someone else"
          },
          {
            role: "user",
            speaker: "Me",
            raw_content: "current message"
          }
        ]
      }
    });

    const messages = getLifeLogDisplayMessages(log, "Discord");

    expect(messages).toEqual([
      {
        role: "me",
        speaker: "나",
        text: "previous own message"
      },
      {
        role: "other",
        speaker: "link",
        text: "someone else"
      },
      {
        role: "me",
        speaker: "나",
        text: "current message"
      }
    ]);
  });
});

function makeLifeLog(overrides: Partial<LifeLog> = {}): LifeLog {
  return {
    id: "life-log-discord-1",
    text: "fallback",
    sourceType: "browser_extension",
    processed: false,
    createdAt: new Date(0).toISOString(),
    ...overrides
  };
}
