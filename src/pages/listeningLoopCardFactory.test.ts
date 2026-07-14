import { describe, expect, it, vi } from "vitest";
import { defaultLearningProfile } from "../shared/languages";
import type { AppSettings, GeneratedCardData } from "../shared/types";
import type { LLMProvider } from "../services/llm/types";
import {
  createListeningLoopInputCard,
  getListeningCardSelectedText,
  mergeListeningGeneratedHighlightMappings
} from "./listeningLoopCardFactory";

const minimalSettings = {
  learningProfile: defaultLearningProfile
} as AppSettings;

describe("listening loop card factory", () => {
  it("builds a generated input-listening card with meaning and vocabulary details", async () => {
    const generated: GeneratedCardData = {
      cardType: "reading",
      deckType: "input",
      direction: "target_to_native",
      sourceSentence:
        "The mayor is not just the King of New York politically, but he's someone who is on the left.",
      frontText:
        "The mayor is not just the King of New York politically, but he's someone who is on the left.",
      literalTranslationKo:
        "그 시장은 정치적으로 뉴욕의 왕일 뿐 아니라 좌파 쪽에 있는 사람입니다.",
      naturalTranslationKo:
        "그 시장은 뉴욕 정치권에서 매우 영향력 있고, 좌파 성향의 인물입니다.",
      highlightMappings: [
        {
          sourceText: "on the",
          literalKo: "쪽에 있는",
          naturalKo: "성향의",
          colorKey: "red"
        }
      ],
      vocabularyItems: [
        {
          term: "on the left",
          partOfSpeech: "phrase",
          basicMeaningKo: "좌파 성향이다",
          meaningInContextKo: "정치적으로 진보 또는 좌파 쪽에 속한다는 뜻",
          etymologyKo:
            "on the + side/left/right 구조로, 어떤 편이나 위치에 속해 있다는 이미지를 만듭니다.",
          usagePatterns: ["Collocation: on the left", "on the right", "on the side of ..."],
          colorKey: "red",
          examples: ["The candidate is on the left."],
          exampleTranslationsKo: ["그 후보는 좌파 성향입니다."]
        }
      ],
      structureNote: "",
      confusingComparisons: [
        {
          kind: "nuance",
          title: "on the left vs left",
          explanationKo: "on the left는 정치적 위치나 편을 말할 때 더 자연스럽습니다."
        }
      ],
      pumpPrompts: []
    };
    const generateReadingCard = vi.fn(async () => generated);
    const provider = {
      name: "fake",
      testConnection: async () => true,
      generateReadingCard,
      generateLifeExpressionCard: async () => generated,
      generateCharacterChatReply: async () => ""
    } satisfies LLMProvider;

    const card = await createListeningLoopInputCard({
      provider,
      profileId: "default",
      settings: minimalSettings,
      segment: {
        id: "s1",
        speaker: "Speaker",
        start: 11,
        end: 15,
        text:
          "The mayor is not just the King of New York politically, but he's someone who is on the left.",
        translationKo: "",
        sourceVideoId: "XGPubqi7GIY"
      },
      sourceKey: "listening:XGPubqi7GIY:s1",
      sourceLanguageCode: "en",
      targetLanguageCode: "en",
      nativeLanguageCode: "ko",
      videoTitle: "Why the Mamdani-backed NY primary wins are not a fluke",
      channelName: "Vox",
      highlightMappings: [{ sourceText: "on the", colorKey: "yellow" }],
      structureNote: "영상: Vox\n구간: 0:11 - 0:15",
      now: new Date("2026-07-04T00:00:00.000Z")
    });

    expect(generateReadingCard).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedText: "on the",
        generationMode: "listening",
        sourceSentence:
          "The mayor is not just the King of New York politically, but he's someone who is on the left."
      })
    );
    expect(card.deckType).toBe("input-listening");
    expect(card.naturalTranslationKo).toContain("좌파 성향");
    expect(card.vocabularyItems[0]?.basicMeaningKo).toBe("좌파 성향이다");
    expect(card.highlightMappings[0]).toMatchObject({
      sourceText: "on the",
      colorKey: "yellow",
      naturalKo: "성향의"
    });
    expect(card.structureNote).toContain("구간: 0:11 - 0:15");
    expect(card.pumpPrompts).toEqual([]);
    expect(card.listeningStudyGuide).toMatchObject({
      templateVersion: "listening-adaptive-v1",
      listeningIssue: {
        title: expect.stringContaining("on the")
      },
      dictation: {
        answer: "on the"
      }
    });
    expect(card.listeningStudyGuide?.chunks.length).toBeGreaterThanOrEqual(2);
  });

  it("uses the full sentence as the selected text when no sound point is selected", () => {
    expect(getListeningCardSelectedText([], "A full sentence.")).toBe("A full sentence.");
  });

  it("filters placeholder function-word vocabulary while keeping listening sound points", async () => {
    const generated: GeneratedCardData = {
      cardType: "reading",
      deckType: "input",
      direction: "target_to_native",
      sourceSentence: "I've had this shirt for nearly six years.",
      frontText: "I've had this shirt for nearly six years.",
      literalTranslationKo: "나는 이 셔츠를 거의 6년 동안 가지고 있었다.",
      naturalTranslationKo: "이 셔츠를 거의 6년 동안 입었어요.",
      highlightMappings: [
        { sourceText: "I've", colorKey: "red" },
        { sourceText: "had", colorKey: "orange" },
        { sourceText: "shirt", colorKey: "blue" }
      ],
      vocabularyItems: [
        {
          term: "I've",
          partOfSpeech: "word",
          basicMeaningKo: "문맥 기반 의미 확인 필요",
          meaningInContextKo: "선택한 표현을 원문 안에서 확인해야 합니다.",
          colorKey: "red",
          examples: []
        },
        {
          term: "had",
          partOfSpeech: "word",
          basicMeaningKo: "문맥 기반 의미 확인 필요",
          meaningInContextKo: "선택한 표현을 원문 안에서 확인해야 합니다.",
          colorKey: "orange",
          examples: []
        },
        {
          term: "shirt",
          partOfSpeech: "noun",
          basicMeaningKo: "셔츠",
          meaningInContextKo: "화자가 오래 가지고 있던 옷",
          colorKey: "blue",
          examples: ["I bought a new shirt."],
          exampleTranslationsKo: ["나는 새 셔츠를 샀다."]
        }
      ],
      structureNote: "",
      confusingComparisons: [
        {
          kind: "nuance",
          title: "there's a vs direct translation",
          explanationKo:
            '"there\'s a"은 원문 문장에서의 역할을 기준으로 익히세요. "direct translation"은 비슷해 보여도 표현 단위와 자연스러운 뜻이 달라질 수 있습니다. 예: I noticed "there\'s a" in context. / I used "direct translation" in a simpler sentence.'
        },
        {
          kind: "nuance",
          title: "had vs have had",
          explanationKo: "have had는 과거부터 현재까지 이어지는 소유나 경험을 나타냅니다."
        }
      ],
      pumpPrompts: []
    };
    const provider = {
      name: "fake",
      testConnection: async () => true,
      generateReadingCard: vi.fn(async () => generated),
      generateLifeExpressionCard: async () => generated,
      generateCharacterChatReply: async () => ""
    } satisfies LLMProvider;

    const card = await createListeningLoopInputCard({
      provider,
      profileId: "default",
      settings: minimalSettings,
      segment: {
        id: "s2",
        speaker: "Speaker",
        start: 47,
        end: 48,
        text: "I've had this shirt for nearly six years.",
        translationKo: "이 셔츠를 거의 6년 동안 가지고 있었어.",
        sourceVideoId: "himym"
      },
      sourceKey: "listening:himym:s2",
      sourceLanguageCode: "en",
      targetLanguageCode: "en",
      nativeLanguageCode: "ko",
      videoTitle: "How I Met Your Mother",
      channelName: "Speaker",
      highlightMappings: [
        { sourceText: "I've", colorKey: "yellow" },
        { sourceText: "had", colorKey: "orange" },
        { sourceText: "shirt", colorKey: "blue" }
      ],
      structureNote: "영상: How I Met Your Mother\n구간: 0:47 - 0:48",
      now: new Date("2026-07-04T00:00:00.000Z")
    });

    expect(card.vocabularyItems.map((item) => item.term)).toEqual(["shirt"]);
    expect(card.highlightMappings.map((mapping) => mapping.sourceText)).toEqual([
      "I've",
      "had",
      "shirt"
    ]);
    expect(card.confusingComparisons?.map((comparison) => comparison.title)).toEqual([
      "had vs have had"
    ]);
  });

  it("keeps sound-point colors while supplementing generated translation anchors", () => {
    const merged = mergeListeningGeneratedHighlightMappings(
      [{ sourceText: "on the", literalKo: "쪽에 있는", naturalKo: "성향의", colorKey: "red" }],
      [{ sourceText: "on the", colorKey: "yellow" }]
    );

    expect(merged).toEqual([
      {
        sourceText: "on the",
        literalKo: "쪽에 있는",
        naturalKo: "성향의",
        colorKey: "yellow"
      }
    ]);
  });
});
