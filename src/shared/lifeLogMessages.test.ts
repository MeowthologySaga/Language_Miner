import { describe, expect, it } from "vitest";
import { getLifeLogDisplayMessages } from "./lifeLogMessages";
import type { LifeLog } from "./types";

describe("lifeLogMessages", () => {
  it("keeps a ChatGPT answer with JSON, Markdown, code blocks, and colon labels as one assistant message", () => {
    const assistantAnswer = [
      "## 설정 방법",
      "",
      "JSON:",
      "```json",
      "{",
      '  "host_permissions": ["https://chatgpt.com/*"],',
      '  "permissions": ["storage"]',
      "}",
      "```",
      "",
      "예: 이 값은 manifest에 넣으면 됩니다.",
      "A: 이것도 답변 안의 예시일 뿐입니다."
    ].join("\n");
    const log = makeLifeLog({
      text: "내 프로그램에는 크롬 익스텐션도 필요해?",
      beforeContext: `ChatGPT: ${assistantAnswer}`,
      metadata: {
        messages: [
          {
            role: "assistant",
            speaker: "ChatGPT",
            raw_content: assistantAnswer,
            timestamp: "2026-06-11T00:00:00.000Z"
          },
          {
            role: "user",
            speaker: "나",
            raw_content: "내 프로그램에는 크롬 익스텐션도 필요해?",
            timestamp: "2026-06-11T00:00:01.000Z"
          }
        ]
      }
    });

    const messages = getLifeLogDisplayMessages(log, "ChatGPT");

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      role: "other",
      speaker: "ChatGPT",
      text: assistantAnswer
    });
    expect(messages[1]).toMatchObject({
      role: "me",
      speaker: "나",
      text: "내 프로그램에는 크롬 익스텐션도 필요해?"
    });
  });

  it("keeps a multi-enter user message as one user message", () => {
    const userMessage = ["첫 줄", "", "둘째 줄", "", "```ts", "const a = 1;", "```"].join("\n");
    const messages = getLifeLogDisplayMessages(
      makeLifeLog({
        text: userMessage,
        metadata: {
          messages: [
            {
              role: "user",
              speaker: "나",
              raw_content: userMessage
            }
          ]
        }
      })
    );

    expect(messages).toEqual([
      {
        role: "me",
        speaker: "나",
        text: userMessage
      }
    ]);
  });

  it("keeps Discord message blocks separate without treating colon patterns inside content as speakers", () => {
    const log = makeLifeLog({
      text: "난 아무때나 상관없다.",
      metadata: {
        messages: [
          {
            role: "other",
            speaker: "link",
            raw_content: "이름: 민희\n나 민희랑 밥먹는데 너도 같이 먹을래?"
          },
          {
            role: "other",
            speaker: "MeowMew",
            raw_content: "오 좋지"
          },
          {
            role: "user",
            speaker: "나",
            raw_content: "난 아무때나 상관없다."
          }
        ]
      }
    });

    const messages = getLifeLogDisplayMessages(log, "Discord");

    expect(messages).toHaveLength(3);
    expect(messages.map((message) => `${message.speaker}:${message.text}`)).toEqual([
      "link:이름: 민희\n나 민희랑 밥먹는데 너도 같이 먹을래?",
      "MeowMew:오 좋지",
      "나:난 아무때나 상관없다."
    ]);
  });
});

function makeLifeLog(overrides: Partial<LifeLog> = {}): LifeLog {
  return {
    id: "life-log-1",
    text: "내가 보낸 메시지",
    sourceType: "browser_extension",
    processed: false,
    createdAt: new Date(0).toISOString(),
    ...overrides
  };
}
