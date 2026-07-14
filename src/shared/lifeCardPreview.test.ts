import { describe, expect, it } from "vitest";
import {
  getLifeExpressionPreview,
  parseLifeConversationMessages,
  shouldCollapseLifeMessage
} from "./lifeCardPreview";
import type { StudyCard } from "./types";

describe("lifeCardPreview", () => {
  it("splits Discord-style repeated speaker captures into separate bubbles", () => {
    const preview = getLifeExpressionPreview(
      makeLifeCard({
        sourceSentence: "고쳐졌냐?",
        frontText: [
          "맥락",
          "디스코드 수집 문제를 묻는 대화",
          "",
          "원문",
          "MeowMew: 안녕하시고?",
          "MeowMew: 이게뭐누",
          "MeowMew: 왜 안 돼? MeowMew: 왜 디코는 수집 안되누",
          "Me: 고쳐졌냐?"
        ].join("\n")
      })
    );

    expect(preview.summary).toBe("디스코드 수집 문제를 묻는 대화");
    expect(preview.messages.map((message) => `${message.speaker}:${message.text}`)).toEqual([
      "MeowMew:안녕하시고?",
      "MeowMew:이게뭐누",
      "MeowMew:왜 안 돼?",
      "MeowMew:왜 디코는 수집 안되누",
      "나:고쳐졌냐?"
    ]);
  });

  it("keeps ChatGPT context on the left and the learner reply on the right", () => {
    const longAnswer = "샤오미처럼 믿을 만한 중국산 제품을 찾는 질문입니다. ".repeat(8);
    const messages = parseLifeConversationMessages(`ChatGPT: ${longAnswer}\nMe: 중국산인데 괜찮은 브랜드 없나?`);

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ speaker: "ChatGPT", role: "other" });
    expect(messages[1]).toMatchObject({
      speaker: "나",
      role: "me",
      text: "중국산인데 괜찮은 브랜드 없나?"
    });
    expect(shouldCollapseLifeMessage(messages[0])).toBe(true);
    expect(shouldCollapseLifeMessage(messages[1])).toBe(false);
  });

  it("uses the current learner utterance as the preview target", () => {
    const preview = getLifeExpressionPreview(
      makeLifeCard({
        sourceSentence: "요즘 식기세척기 얼마정도해?",
        frontText: [
          "맥락",
          "어머니 생일 선물 추천",
          "",
          "원문",
          "ChatGPT: 예산과 설치 공간을 먼저 보면 좋아요.",
          "Me: 요즘 식기세척기 얼마정도해?"
        ].join("\n")
      })
    );

    expect(preview.targetText).toBe("요즘 식기세척기 얼마정도해?");
    expect(preview.messages.at(-1)).toMatchObject({ speaker: "나", role: "me" });
  });
});

function makeLifeCard(overrides: Partial<StudyCard>): StudyCard {
  return {
    id: "life-1",
    cardType: "life_expression",
    deckType: "output",
    direction: "ko_to_en",
    sourceSentence: "고쳐졌냐?",
    targetText: "Did it get fixed?",
    frontText: "",
    literalTranslationKo: "",
    naturalTranslationKo: "",
    highlightMappings: [],
    vocabularyItems: [],
    srs: {
      dueAt: new Date(0).toISOString(),
      intervalDays: 0,
      easeFactor: 2.5,
      reviewCount: 0,
      lapseCount: 0
    },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides
  };
}
