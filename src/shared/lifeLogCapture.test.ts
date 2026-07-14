import { describe, expect, it } from "vitest";
import {
  getLifeLogTextRejectionReason,
  maskSensitiveText,
  prepareLifeLogCapture
} from "./lifeLogCapture";

describe("lifeLogCapture", () => {
  const fixtureEmail = `me${"@"}test.invalid`;

  it("rejects low-signal messages", () => {
    expect(getLifeLogTextRejectionReason("ㅋㅋ")).toBe("too_short");
    expect(getLifeLogTextRejectionReason("ㅋㅋㅋㅋ")).toBe("low_signal_reaction");
    expect(getLifeLogTextRejectionReason("ㅇㅇ!!")).toBe("low_signal_reaction");
    expect(getLifeLogTextRejectionReason("https://example.com")).toBe("url_only");
    expect(getLifeLogTextRejectionReason("🙂🙂🙂🙂")).toBe("emoji_only");
  });

  it("can keep short reactions as target text when low-signal filtering is disabled", () => {
    expect(
      getLifeLogTextRejectionReason("ㅋㅋ", {
        filterLowSignalTargets: false
      })
    ).toBeNull();
    expect(
      getLifeLogTextRejectionReason("🙂🙂🙂🙂", {
        filterLowSignalTargets: false
      })
    ).toBeNull();
    expect(
      getLifeLogTextRejectionReason("https://example.com", {
        filterLowSignalTargets: false
      })
    ).toBe("url_only");
  });

  it("accepts Korean, English, and mixed useful messages", () => {
    expect(getLifeLogTextRejectionReason("오늘 회의 조금 늦을 것 같아")).toBeNull();
    expect(getLifeLogTextRejectionReason("Can you send the file again?")).toBeNull();
    expect(getLifeLogTextRejectionReason("오늘 deploy 늦게 할게")).toBeNull();
  });

  it("masks sensitive text before saving", () => {
    const masked = maskSensitiveText(
      `mail ${fixtureEmail} phone 000-0000-0000 key sk-test-redacted token api_key=redacted-test-token`
    );
    expect(masked).toContain("[email]");
    expect(masked).toContain("[phone]");
    expect(masked).toContain("[token]");
    expect(masked).toContain("api_key=[secret]");
    expect(masked).not.toContain(fixtureEmail);
  });

  it("masks short OpenAI-shaped development keys", () => {
    expect(maskSensitiveText("key sk-test")).toBe("key [token]");
    expect(maskSensitiveText("key sk-proj-demo-key")).toBe("key [token]");
  });

  it("prepares browser extension life log input", () => {
    const prepared = prepareLifeLogCapture({
      text: "  오늘은 Discord에서 이 말을 썼어  ",
      beforeContext: `previous email ${fixtureEmail} and phone 000-0000-0000`,
      appName: "Discord",
      metadata: {
        url: "https://discord.com/channels/test",
        title: "Discord",
        empty: "   "
      }
    });

    expect(prepared.accepted).toBe(true);
    if (prepared.accepted) {
      expect(prepared.lifeLogInput.sourceType).toBe("browser_extension");
      expect(prepared.lifeLogInput.appName).toBe("Discord");
      expect(prepared.lifeLogInput.beforeContext).toContain("[email]");
      expect(prepared.lifeLogInput.beforeContext).toContain("[phone]");
      expect(prepared.lifeLogInput.metadata?.url).toBe("https://discord.com/channels/test");
      expect(prepared.lifeLogInput.metadata?.empty).toBeUndefined();
    }
  });

  it("rejects low-signal target text while preserving short context messages", () => {
    const rejected = prepareLifeLogCapture({
      text: "ㅋㅋㅋㅋ",
      beforeContext: "상대: ㅇㅇ",
      afterContext: "Me: ㅋㅋ",
      appName: "Discord",
      metadata: {
        messages: [
          {
            role: "other",
            speaker: "상대",
            raw_content: "ㅇㅇ"
          },
          {
            role: "user",
            speaker: "Me",
            raw_content: "ㅋㅋㅋㅋ"
          }
        ]
      }
    });

    expect(rejected.accepted).toBe(false);
    if (!rejected.accepted) {
      expect(rejected.reason).toBe("low_signal_reaction");
    }

    const accepted = prepareLifeLogCapture({
      text: "그 표현은 그냥 가볍게 동의하는 느낌이야.",
      beforeContext: "상대: ㅇㅇ\nMe: ㅋㅋ",
      afterContext: "상대: ok",
      appName: "Discord",
      metadata: {
        messages: [
          {
            role: "other",
            speaker: "상대",
            raw_content: "ㅇㅇ"
          },
          {
            role: "user",
            speaker: "Me",
            raw_content: "ㅋㅋ"
          },
          {
            role: "user",
            speaker: "Me",
            raw_content: "그 표현은 그냥 가볍게 동의하는 느낌이야."
          },
          {
            role: "other",
            speaker: "상대",
            raw_content: "ok"
          }
        ]
      }
    });

    expect(accepted.accepted).toBe(true);
    if (accepted.accepted) {
      expect(accepted.lifeLogInput.beforeContext).toContain("ㅇㅇ");
      expect(accepted.lifeLogInput.beforeContext).toContain("ㅋㅋ");
      expect(accepted.lifeLogInput.afterContext).toBe("상대: ok");
      expect(accepted.lifeLogInput.metadata?.messages?.map((message) => message.raw_content)).toEqual([
        "ㅇㅇ",
        "ㅋㅋ",
        "그 표현은 그냥 가볍게 동의하는 느낌이야.",
        "ok"
      ]);
    }
  });

  it("preserves metadata message raw content with Markdown, JSON, code blocks, and colon labels", () => {
    const assistantAnswer = [
      "JSON:",
      "```json",
      "{",
      '  "host_permissions": ["https://chatgpt.com/*"]',
      "}",
      "```",
      "예: 그대로 한 메시지입니다."
    ].join("\n");
    const prepared = prepareLifeLogCapture({
      text: "내 프로그램에는 크롬 익스텐션도 필요해?",
      appName: "ChatGPT",
      metadata: {
        messages: [
          {
            role: "assistant",
            speaker: "ChatGPT",
            raw_content: assistantAnswer
          },
          {
            role: "user",
            speaker: "나",
            raw_content: "내 프로그램에는 크롬 익스텐션도 필요해?"
          }
        ]
      }
    });

    expect(prepared.accepted).toBe(true);
    if (prepared.accepted) {
      expect(prepared.lifeLogInput.metadata?.messages).toHaveLength(2);
      expect(prepared.lifeLogInput.metadata?.messages?.[0].raw_content).toBe(assistantAnswer);
    }
  });

  it("keeps a multi-enter user message as one raw_content block", () => {
    const userMessage = ["첫 줄", "", "둘째 줄", "", "```ts", "const value = 1;", "```"].join("\n");
    const prepared = prepareLifeLogCapture({
      text: userMessage,
      appName: "ChatGPT",
      metadata: {
        messages: [
          {
            role: "user",
            speaker: "나",
            raw_content: userMessage
          }
        ]
      }
    });

    expect(prepared.accepted).toBe(true);
    if (prepared.accepted) {
      expect(prepared.lifeLogInput.text).toBe(userMessage);
      expect(prepared.lifeLogInput.metadata?.messages?.[0].raw_content).toBe(userMessage);
    }
  });
});
