import type {
  CharacterChatMessage,
  CharacterChatMode,
  CharacterPreset,
  LifeLog,
  LifeLogMessage
} from "./types";

export type CharacterChatLifeLogInput = Omit<
  LifeLog,
  "id" | "processed" | "createdAt"
>;

export function createCharacterChatLifeLogInput(input: {
  character: CharacterPreset;
  chatMode: CharacterChatMode;
  userMessage: CharacterChatMessage;
  previousCharacterMessage?: CharacterChatMessage | null;
}): CharacterChatLifeLogInput {
  const messages: LifeLogMessage[] = [];
  const previousCharacterText = input.previousCharacterMessage?.content.trim();
  if (previousCharacterText) {
    messages.push({
      role: "assistant",
      speaker: input.character.name,
      raw_content: previousCharacterText,
      timestamp: input.previousCharacterMessage?.createdAt
    });
  }

  messages.push({
    role: "user",
    speaker: "Me",
    raw_content: input.userMessage.content,
    timestamp: input.userMessage.createdAt
  });

  return {
    text: input.userMessage.content,
    beforeContext: previousCharacterText
      ? `${input.character.name}: ${previousCharacterText}`
      : undefined,
    appName: "Character Chat",
    metadata: {
      source: "character_chat",
      characterId: input.character.id,
      characterName: input.character.name,
      chatMode: input.chatMode,
      messageId: input.userMessage.id,
      currentUserSpeaker: "Me",
      messages
    },
    sourceType: "manual"
  };
}
