import { describe, expect, it } from "vitest";
import { createDefaultCharacterPreset } from "./characterCards";
import { createCharacterChatLifeLogInput } from "./characterChatLifeLog";
import type { CharacterChatMessage } from "./types";

describe("characterChatLifeLog", () => {
  it("stores the user message with previous character context and metadata", () => {
    const character = createDefaultCharacterPreset("2026-07-04T00:00:00.000Z");
    const previousCharacterMessage: CharacterChatMessage = {
      id: "m-character",
      role: "character",
      content: "Tell me what happened first.",
      createdAt: "2026-07-04T00:00:01.000Z",
      mode: "native_capture"
    };
    const userMessage: CharacterChatMessage = {
      id: "m-user",
      role: "user",
      content: "오늘 집중이 너무 안 됐어.",
      createdAt: "2026-07-04T00:00:02.000Z",
      mode: "native_capture"
    };

    const input = createCharacterChatLifeLogInput({
      character,
      chatMode: "native_capture",
      userMessage,
      previousCharacterMessage
    });

    expect(input).toMatchObject({
      text: userMessage.content,
      beforeContext: `${character.name}: ${previousCharacterMessage.content}`,
      appName: "Character Chat",
      sourceType: "manual",
      metadata: {
        source: "character_chat",
        characterId: character.id,
        characterName: character.name,
        chatMode: "native_capture",
        messageId: userMessage.id,
        currentUserSpeaker: "Me"
      }
    });
    expect(input.metadata?.messages).toEqual([
      {
        role: "assistant",
        speaker: character.name,
        raw_content: previousCharacterMessage.content,
        timestamp: previousCharacterMessage.createdAt
      },
      {
        role: "user",
        speaker: "Me",
        raw_content: userMessage.content,
        timestamp: userMessage.createdAt
      }
    ]);
  });
});
