import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createReadingCardPrompt,
  GeminiProvider,
  normalizeLifeExpressionCardDraft,
  normalizeReadingCardDraft
} from "./geminiProvider";
import { defaultLearningProfile } from "../../shared/languages";
import type { LearningProfile } from "../../shared/types";
import { createCloudProviderConsentRecord } from "../../shared/cloudProviderConsent";

const geminiConsent = createCloudProviderConsentRecord({
  provider: "gemini",
  keyStorage: "session",
  acceptedAt: "2026-07-14T00:00:00.000Z"
});

const japaneseProfile: LearningProfile = {
  targetLanguage: { code: "ja", nameKo: "일본어", nameEn: "Japanese" },
  nativeLanguage: { code: "ko", nameKo: "한국어", nameEn: "Korean" }
};

describe("Gemini card generation contract", () => {
  it("builds the existing reading prompt and selected-term contract", () => {
    const context = "x".repeat(2_300);
    const prompt = createReadingCardPrompt({
      selectedText: "run into, figure out",
      sourceSentence: "I ran into an old friend and figured out the answer.",
      beforeSentence: "It was a busy morning.",
      afterSentence: "Then I went home.",
      readerTextContext: context,
      translationContext: "Keep the conversational register.",
      generationMode: "listening",
      learningProfile: defaultLearningProfile
    });

    expect(prompt.selectedTerms).toEqual(["run into", "figure out"]);
    expect(prompt.systemPrompt).toContain("You are a precise language-learning card generator.");
    expect(prompt.systemPrompt).toContain('"templateVersion": "listening-adaptive-v1"');
    expect(prompt.userPrompt).toContain("Selected English word(s)/phrase(s): run into, figure out");
    expect(prompt.userPrompt).toContain(`Reader context: ${context.slice(0, 2_200)}`);
    expect(prompt.userPrompt).not.toContain(context);
  });

  it("normalizes a reading draft with the existing fallback and selected-term repair", () => {
    const input = {
      selectedText: "run into",
      sourceSentence: "I may run into an old friend.",
      learningProfile: defaultLearningProfile
    };
    const card = normalizeReadingCardDraft(
      {
        cardType: "reading",
        sourceSentence: input.sourceSentence,
        frontText: input.sourceSentence,
        literalTranslationKo: "나는 오랜 친구를 우연히 만났다.",
        naturalTranslationKo: "오랜 친구와 우연히 마주쳤다.",
        highlightMappings: [],
        vocabularyItems: [],
        structureNote: "must be removed",
        pumpPrompts: []
      },
      input
    );

    expect(card.cardType).toBe("reading");
    expect(card.deckType).toBe("input");
    expect(card.highlightMappings.some((mapping) => mapping.sourceText === "run into")).toBe(true);
    expect(card.vocabularyItems.some((item) => item.term === "run into")).toBe(true);
    expect(card.structureNote).toBe("");
    expect(card.pumpPrompts).toEqual([]);
  });

  it("normalizes a life-expression draft with fallback fields and consistency repair", () => {
    const card = normalizeLifeExpressionCardDraft(
      {
        cardType: "life_expression",
        targetText: "I will late a little.",
        answerCandidates: [
          {
            text: "I might be a little late.",
            kind: "recommended",
            register: "best"
          },
          {
            text: "I will late a little.",
            kind: "rejected",
            register: "neutral"
          }
        ]
      },
      {
        koreanText: "조금 늦을 것 같아.",
        beforeContext: "A: Are you close?",
        learningProfile: defaultLearningProfile
      }
    );

    expect(card.cardType).toBe("life_expression");
    expect(card.deckType).toBe("output");
    expect(card.sourceSentence).toBe("조금 늦을 것 같아.");
    expect(card.targetText).toBe("I might be a little late.");
    expect(card).not.toHaveProperty("answerCandidates");
  });
});

describe("GeminiProvider", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("blocks Gemini before fetch when versioned provider consent is missing", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const provider = new GeminiProvider({
      apiKey: "test-key",
      model: "gemini-2.5-flash-lite"
    });

    await expect(provider.testConnection()).rejects.toMatchObject({
      code: "CLOUD_PROVIDER_CONSENT_REQUIRED"
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records successful Gemini usage once before invalid card JSON is parsed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "not-json" }] } }],
          usageMetadata: {
            promptTokenCount: 7,
            candidatesTokenCount: 3,
            totalTokenCount: 10
          }
        }),
        { status: 200 }
      )
    );
    const observer = vi.fn();
    const provider = new GeminiProvider({
      apiKey: "test-key",
      model: "gemini-2.5-flash-lite",
      cloudConsent: geminiConsent
    });
    provider.setUsageObserver(observer);

    await expect(
      provider.generateReadingCard({
        selectedText: "word",
        sourceSentence: "A word appears here.",
        learningProfile: defaultLearningProfile
      })
    ).rejects.toThrow(/parseable card JSON/i);

    expect(observer).toHaveBeenCalledTimes(1);
    expect(observer.mock.calls[0][0]).toMatchObject({
      outcome: "success",
      exact: true,
      usage: { inputTokens: 7, outputTokens: 3, totalTokens: 10, requestCount: 1 }
    });
  });

  it("aborts a stalled Gemini request at the provider timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
          once: true
        });
      })
    );
    const provider = new GeminiProvider({
      apiKey: "test-key",
      model: "gemini-2.5-flash-lite",
      requestTimeoutMs: 20,
      cloudConsent: geminiConsent
    });

    const request = provider.testConnection();
    const assertion = expect(request).rejects.toThrow("요청 시간이 초과되었습니다");
    await vi.advanceTimersByTimeAsync(20);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("generates a reading card from Gemini JSON", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      cardType: "reading",
                      sourceSentence: "The runes are represented by English runes.",
                      frontText: "The runes are represented by English runes.",
                      literalTranslationKo: "runes는 문자/룬을 뜻하고 represented는 표시된다는 뜻입니다.",
                      naturalTranslationKo: "이 룬 문자는 영어식 룬으로 표시되어 있습니다.",
                      highlightMappings: [
                        {
                          sourceText: "runes",
                          literalKo: "룬 문자",
                          naturalKo: "룬 문자",
                          colorKey: "red"
                        }
                      ],
                      vocabularyItems: [
                        {
                          term: "runes",
                          ipa: "/ruːnz/",
                          partOfSpeech: "noun",
                          basicMeaningKo: "룬 문자",
                          meaningInContextKo: "지도나 비문에 쓰인 고대 문자",
                          etymologyKo: "고대 문자 체계에서 온 말로 기억합니다.",
                          usagePatterns: ["ancient runes", "carved runes", "read the runes"],
                          colorKey: "red",
                          examples: [
                            "The runes are represented by English runes.",
                            "The runes were carved into stone.",
                            "Scholars studied the ancient runes.",
                            "Each rune carried a symbolic meaning."
                          ],
                          exampleTranslationsKo: [
                            "룬은 영어 룬으로 표시됩니다.",
                            "룬은 돌에 새겨졌습니다.",
                            "학자들은 고대 룬을 연구했습니다.",
                            "각 룬은 상징적인 의미를 담고 있었습니다."
                          ]
                        }
                      ],
                      structureNote: "are represented by = ~로 표시되다",
                      confusingComparisons: [],
                      pumpPrompts: [
                        {
                          type: "make_sentence",
                          promptKo: "runes를 사용해 문장을 만들어 보세요.",
                          requiredTerms: ["runes"]
                        }
                      ]
                    })
                  }
                ]
              }
            }
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 20,
            totalTokenCount: 30
          }
        }),
        { status: 200 }
      )
    );

    const provider = new GeminiProvider({
      apiKey: "test-key",
      model: "gemini-2.5-flash-lite",
      cloudConsent: geminiConsent
    });
    const card = await provider.generateReadingCard({
      selectedText: "runes",
      sourceSentence: "The runes are represented by English runes.",
      readerTextContext: "The runes are represented by English runes.",
      learningProfile: defaultLearningProfile
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("gemini-2.5-flash-lite");
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? ""));
    const userPrompt = requestBody.contents[0].parts[0].text;
    expect(userPrompt).toContain(
      'Each confusingComparisons item must include kind, one of: "similar", "contrast", "nuance".'
    );
    expect(userPrompt).toContain("Do not use confusingComparisons for collocations");
    const legacyKindList = ["similar", "contrast", "nuance", "collocation"]
      .map((kind) => `"${kind}"`)
      .join(", ");
    expect(userPrompt).not.toContain(`one of: ${legacyKindList}`);
    expect(card.cardType).toBe("reading");
    expect(card.vocabularyItems[0].term).toBe("runes");
    expect(card.highlightMappings[0].sourceText).toBe("runes");
    expect(card.vocabularyItems[0].etymologyKo).toContain("고대 문자");
    expect(card.vocabularyItems[0].usagePatterns).toEqual([
      'Collocation: "runes" + noun/verb',
      "ancient runes",
      "carved runes",
      "read the runes"
    ]);
    expect(card.vocabularyItems[0].examples).toEqual([
      "The runes were carved into stone.",
      "Scholars studied the ancient runes.",
      "Each rune carried a symbolic meaning."
    ]);
    expect(card.vocabularyItems[0].exampleTranslationsKo).toEqual([
      "룬은 돌에 새겨졌습니다.",
      "학자들은 고대 룬을 연구했습니다.",
      "각 룬은 상징적인 의미를 담고 있었습니다."
    ]);
    expect(card.structureNote).toBe("");
    expect(card.pumpPrompts).toEqual([]);
  });

  it("repairs native-language vocabulary examples for a Japanese profile", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      cardType: "reading",
                      sourceSentence: "なお元来の古い大和言葉では、原則として",
                      frontText: "なお元来の古い大和言葉では、原則として",
                      literalTranslationKo: "더욱이 본래의 오래된 야마토 말에서는, 원칙으로서",
                      naturalTranslationKo: "더욱이 원래의 오래된 야마토 시대의 말에서는, 원칙적으로",
                      highlightMappings: [
                        {
                          sourceText: "元来",
                          literalKo: "본래",
                          naturalKo: "원래",
                          colorKey: "red"
                        }
                      ],
                      vocabularyItems: [
                        {
                          term: "元来",
                          ipa: "",
                          partOfSpeech: "noun",
                          basicMeaningKo: "원래, 본래",
                          meaningInContextKo: "처음부터 이어진 본래의 성격을 나타냄",
                          usagePatterns: ["元来の目的", "元来の姿"],
                          colorKey: "red",
                          examples: [
                            "이것은 元来의 의미와는 다릅니다.",
                            "그는 元来부터 온화한 성격이었다.",
                            "元来, 그 문제는 복잡했습니다."
                          ]
                        }
                      ],
                      structureNote: "ignore me",
                      confusingComparisons: [],
                      pumpPrompts: []
                    })
                  }
                ]
              }
            }
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 20,
            totalTokenCount: 30
          }
        }),
        { status: 200 }
      )
    );

    const provider = new GeminiProvider({
      apiKey: "test-key",
      model: "gemini-2.5-flash-lite",
      cloudConsent: geminiConsent
    });
    const card = await provider.generateReadingCard({
      selectedText: "元来",
      sourceSentence: "なお元来の古い大和言葉では、原則として",
      readerTextContext: "なお元来の古い大和言葉では、原則として",
      learningProfile: japaneseProfile
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(fetchMock.mock.calls[0][1])).toContain(
      "examples must be 3 short, new sentences written only in Japanese (ja)"
    );
    expect(card.vocabularyItems[0].examples).toEqual([
      "「元来」はこの文で自然に使えます。",
      "彼は「元来」という表現を使いました。",
      "この場面では「元来」が大切な意味を持ちます。"
    ]);
  });
});
