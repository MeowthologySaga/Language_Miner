import { describe, expect, it } from "vitest";
import {
  buildWritingPracticePrompts,
  evaluateWritingPracticeAnswer
} from "./writingPractice";
import { conversationPracticePrompts } from "./conversationPracticeBank";
import type { StudyCard } from "./types";

describe("writingPractice", () => {
  it("bundles one thousand conversation prompts for open-ended writing practice", () => {
    const promptKeys = new Set(
      conversationPracticePrompts.map((prompt) => `${prompt.promptKo}\u001f${prompt.targetEnglish}`)
    );

    expect(conversationPracticePrompts).toHaveLength(1000);
    expect(promptKeys.size).toBe(1000);
    expect(conversationPracticePrompts.every((prompt) => prompt.source === "conversation-bank")).toBe(
      true
    );
    expect(
      conversationPracticePrompts.every(
        (prompt) =>
          prompt.promptType === "ko_to_en" &&
          prompt.promptKo.trim() &&
          prompt.targetEnglish.trim()
      )
    ).toBe(true);
  });

  it("builds Korean-to-English prompts from card pump prompts", () => {
    const prompts = buildWritingPracticePrompts([makeLifeCard()]);

    expect(prompts[0].promptKo).toBe("나 좀 늦을 것 같아.");
    expect(prompts[0].targetEnglish).toContain("running a little late");
    expect(prompts[0].requiredTerms).toContain("running a little late");
    expect(prompts[0].sourceLabel).toBe("아웃풋 카드");
  });

  it("ignores legacy non-writing pump prompts on output cards", () => {
    const card = makeLifeCard();
    card.pumpPrompts = [
      legacyPumpPrompt({
        type: "question_answer",
        promptKo: "방금 표현을 써서 자유롭게 답해보세요.",
        requiredTerms: ["running a little late"]
      }),
      {
        type: "ko_to_en",
        promptKo: "나 조금 늦을 것 같아.",
        requiredTerms: ["running a little late"]
      }
    ];

    const cardPrompts = buildWritingPracticePrompts([card]).filter(
      (prompt) => prompt.cardId === card.id
    );

    expect(cardPrompts).toHaveLength(1);
    expect(cardPrompts[0].promptType).toBe("ko_to_en");
    expect(cardPrompts[0].promptKo).toBe("나 조금 늦을 것 같아.");
  });

  it("builds input card prompts from the natural Korean translation", () => {
    const prompts = buildWritingPracticePrompts([makeInputCard()]);

    expect(prompts[0].promptKo).toBe("둘 다 나한테는 맞지 않아.");
    expect(prompts[0].targetEnglish).toBe("Neither option works for me.");
    expect(prompts[0].promptType).toBe("ko_to_en");
    expect(prompts[0].requiredTerms).toContain("Neither");
    expect(prompts.some((prompt) => prompt.promptKo === "neither를 사용해 비슷한 문장을 만들어 보세요.")).toBe(false);
  });

  it("scores answers by required term and target overlap", () => {
    const prompt = buildWritingPracticePrompts([makeLifeCard()])[0];
    const result = evaluateWritingPracticeAnswer(
      prompt,
      "I'm running a little late, so please start without me."
    );

    expect(result.matchedTerms).toContain("running a little late");
    expect(result.score).toBeGreaterThan(60);
  });

  it("does not mix listening cards into writing practice prompts", () => {
    const prompts = buildWritingPracticePrompts([makeListeningCard()]);

    expect(prompts.some((prompt) => prompt.cardId === "listening-1")).toBe(false);
  });
});

function makeLifeCard(): StudyCard {
  return {
    id: "life-1",
    cardType: "life_expression",
    deckType: "output",
    direction: "ko_to_en",
    sourceSentence: "나 좀 늦을 것 같아.",
    targetText: "I'm running a little late.",
    frontText: "원문\nMe: 나 좀 늦을 것 같아.",
    literalTranslationKo: "영어 대화\nMe: I'm running a little late.",
    naturalTranslationKo: "내 답변 변형\n짧게: I'm running late.",
    highlightMappings: [
      {
        sourceText: "running a little late",
        literalKo: "조금 늦고 있다",
        naturalKo: "조금 늦을 것 같다",
        colorKey: "red"
      }
    ],
    vocabularyItems: [],
    pumpPrompts: [
      {
        type: "ko_to_en",
        promptKo: "나 좀 늦을 것 같아.",
        requiredTerms: ["running a little late"]
      }
    ],
    srs: {
      dueAt: new Date(0).toISOString(),
      intervalDays: 0,
      easeFactor: 2.5,
      reviewCount: 0,
      lapseCount: 0
    },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString()
  };
}

function makeInputCard(): StudyCard {
  return {
    id: "input-1",
    cardType: "reading",
    deckType: "input",
    direction: "en_to_ko",
    sourceSentence: "Neither option works for me.",
    targetText: "",
    frontText: "Neither option works for me.",
    literalTranslationKo: "어느 쪽 선택지도 나에게 작동하지 않는다.",
    naturalTranslationKo: "둘 다 나한테는 맞지 않아.",
    highlightMappings: [
      {
        sourceText: "Neither",
        literalKo: "둘 중 어느 것도",
        naturalKo: "둘 다 아니다",
        colorKey: "red"
      }
    ],
    vocabularyItems: [
      {
        term: "neither",
        ipa: "/ˈniːðər/",
        partOfSpeech: "determiner",
        basicMeaningKo: "둘 중 어느 것도 아닌",
        meaningInContextKo: "두 선택지 모두 맞지 않는다는 뜻",
        colorKey: "red",
        examples: [
          "Neither answer is correct.",
          "Neither restaurant is open.",
          "Neither plan sounds realistic."
        ]
      }
    ],
    pumpPrompts: [
      legacyPumpPrompt({
        type: "make_sentence",
        promptKo: "neither를 사용해 비슷한 문장을 만들어 보세요.",
        requiredTerms: ["neither"]
      })
    ],
    srs: {
      dueAt: new Date(0).toISOString(),
      intervalDays: 0,
      easeFactor: 2.5,
      reviewCount: 0,
      lapseCount: 0
    },
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString()
  };
}

function legacyPumpPrompt(value: unknown): NonNullable<StudyCard["pumpPrompts"]>[number] {
  return value as NonNullable<StudyCard["pumpPrompts"]>[number];
}

function makeListeningCard(): StudyCard {
  return {
    ...makeLifeCard(),
    id: "listening-1",
    cardType: "reading",
    deckType: "input-listening",
    direction: "en_to_ko",
    sourceSentence: "We've been at it.",
    targetText: "listening:demo:segment-1",
    frontText: "We've been at it.",
    literalTranslationKo: "오랫동안 하고 있었어요.",
    naturalTranslationKo: "한동안 계속 해왔어요.",
    pumpPrompts: [
      {
        type: "ko_to_en",
        promptKo: "방금 들은 문장을 따라 말해보세요.",
        requiredTerms: ["we've been at it"]
      }
    ]
  };
}
