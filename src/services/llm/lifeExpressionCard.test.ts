import { describe, expect, it } from "vitest";
import {
  createLifeExpressionFallbackCard,
  createLifeExpressionUserPrompt,
  repairLifeExpressionCardConsistency
} from "./lifeExpressionCard";
import { defaultLearningProfile } from "../../shared/languages";
import type { LifeExpressionCardDraft } from "./lifeExpressionCard";

describe("lifeExpressionCard", () => {
  it("formats life expression cards as context plus original and English dialogue", () => {
    const card = createLifeExpressionFallbackCard({
      koreanText: "나 좀 늦을 것 같아. 먼저 시작해도 돼.",
      beforeContext: "A: 지금 몇 시쯤 올 수 있어? 우리 먼저 시작해도 돼?",
      learningProfile: defaultLearningProfile
    });

    expect(card.cardType).toBe("life_expression");
    expect(card.frontText).toContain("맥락");
    expect(card.frontText).toContain("원문");
    expect(card.frontText).toContain("A: 지금 몇 시쯤 올 수 있어?");
    expect(card.frontText).toContain("Me: 나 좀 늦을 것 같아.");
    expect(card.literalTranslationKo).toContain("영어 대화");
    expect(card.literalTranslationKo).toContain("Me:");
    expect(card.naturalTranslationKo).toContain("내 답변 변형");
    expect(card.naturalTranslationKo).toContain("뜻:");
    expect(card.naturalTranslationKo).toContain("조금 늦을 것 같아");
    expect(card.structureNote).toContain("기억할 표현");
    expect(card.structureNote).toContain("주의할 표현");
    expect(card.outputStudyGuide?.templateVersion).toBe("adaptive-v1");
    expect(card.outputStudyGuide?.dialogue).toHaveLength(2);
    expect(card.outputStudyGuide?.alternatives).toHaveLength(2);
    expect(card.outputStudyGuide?.miniDrills).toHaveLength(2);
    expect(card.outputStudyGuide?.tags).toEqual(card.tags);
  });

  it("replaces a target reply that is structurally marked as rejected", () => {
    const rejectedReply = "Did this machine eat a bad setting?";
    const naturalReply = "What's wrong with this machine?";
    const card = makeLifeExpressionCard({
      targetText: rejectedReply,
      literalTranslationKo: [
        "English dialogue",
        "A: The machine is making strange noises.",
        `Me: ${rejectedReply}`
      ].join("\n"),
      naturalTranslationKo: [
        "Answer variants",
        `Short: ${naturalReply}`,
        "Casual: What is going on with this machine?",
        "Polite: Is there something wrong with this machine?"
      ].join("\n"),
      structureNote: "General learner-facing note without any special validation heading.",
      answerCandidates: [
        {
          text: naturalReply,
          kind: "recommended",
          register: "best",
          noteKo: "이 기계에 무슨 문제가 있는지 묻는 자연스러운 말."
        },
        {
          text: "What is going on with this machine?",
          kind: "recommended",
          register: "casual",
          noteKo: "이 기계가 왜 이러는지 캐주얼하게 묻는 말."
        },
        {
          text: "Is there something wrong with this machine?",
          kind: "recommended",
          register: "polite",
          noteKo: "기계에 문제가 있는지 더 공손하게 묻는 말."
        },
        {
          text: rejectedReply,
          kind: "rejected",
          register: "neutral"
        }
      ]
    });

    const repaired = repairLifeExpressionCardConsistency(card);

    expect(repaired.targetText).toBe(naturalReply);
    expect(repaired.literalTranslationKo).toContain(`Me: ${naturalReply}`);
    expect(repaired.naturalTranslationKo).toContain("뜻: 이 기계에 무슨 문제가 있는지 묻는 자연스러운 말.");
    expect((repaired as LifeExpressionCardDraft).answerCandidates).toBeUndefined();
  });

  it("keeps a target reply that is structurally marked as recommended", () => {
    const naturalReply = "Could you check whether this was saved correctly?";
    const repaired = repairLifeExpressionCardConsistency(
      makeLifeExpressionCard({
        targetText: naturalReply,
        naturalTranslationKo: `Short: ${naturalReply}`,
        answerCandidates: [
          {
            text: naturalReply,
            kind: "recommended",
            register: "best"
          },
          {
            text: "Please confirm whether saving became good.",
            kind: "rejected",
            register: "neutral"
          }
        ]
      })
    );

    expect(repaired.targetText).toBe(naturalReply);
  });

  it("does not infer from notes when structured answer candidates are missing", () => {
    const targetReply = "Did this machine eat a bad setting?";
    const repaired = repairLifeExpressionCardConsistency(
      makeLifeExpressionCard({
        targetText: targetReply,
        literalTranslationKo: `English dialogue\nMe: ${targetReply}`,
        naturalTranslationKo: "Answer variants\nShort: What's wrong with this machine?",
        structureNote: "This note may mention any wording, but it is not validation data."
      })
    );

    expect(repaired.targetText).toBe(targetReply);
  });

  it("removes native-language pronunciation accidentally attached to a target sentence", () => {
    const card = createLifeExpressionFallbackCard({
      koreanText: "두더지는 무엇을 좋아해?",
      beforeContext: "A: 그냥 떠오르는 대로 말해봐.",
      learningProfile: defaultLearningProfile
    });
    const guide = card.outputStudyGuide!;
    const repaired = repairLifeExpressionCardConsistency({
      ...card,
      outputStudyGuide: {
        ...guide,
        dialogue: guide.dialogue.map((sentence, index) =>
          index === 1
            ? {
                ...sentence,
                en: "What do moles like?",
                ko: "두더지는 무엇을 좋아하나요?",
                pronunciationKo: "두더지는 무엇을 좋아하나요?",
                ipa: "/du dʌdʌdʒinɯn muʌsɯl dʒoahanajo/"
              }
            : sentence
        )
      }
    });

    expect(repaired.outputStudyGuide?.dialogue[1]).toMatchObject({
      en: "What do moles like?",
      ko: "두더지는 무엇을 좋아하나요?",
      pronunciationKo: "",
      ipa: ""
    });
    expect(repaired.outputStudyGuide?.dialogue[0]?.pronunciationKo).toBeTruthy();
  });

  it("tells the model to transcribe the target-language field instead of its meaning", () => {
    const prompt = createLifeExpressionUserPrompt({
      koreanText: "두더지는 무엇을 좋아해?",
      learningProfile: defaultLearningProfile
    });

    expect(prompt).toContain("pronunciationKo and ipa must transcribe");
    expect(prompt).toContain("They must never pronounce or transcribe the item's ko value");
    expect(prompt).toContain('pronunciationKo "왓 두 몰즈 라이크?"');
  });
});

function makeLifeExpressionCard(overrides: Partial<LifeExpressionCardDraft>): LifeExpressionCardDraft {
  return {
    cardType: "life_expression",
    deckType: "output",
    direction: "native_to_target",
    sourceSentence: "기계가 이상하게 굴어.",
    targetText: "What's wrong with this machine?",
    frontText: "Context\nA machine is behaving strangely.\n\nOriginal\nMe: 기계가 이상하게 굴어.",
    literalTranslationKo: "English dialogue\nMe: What's wrong with this machine?",
    naturalTranslationKo: "Answer variants\nShort: What's wrong with this machine?",
    highlightMappings: [],
    vocabularyItems: [],
    structureNote: "",
    confusingComparisons: [],
    pumpPrompts: [],
    ...overrides
  };
}
