import { afterEach, describe, expect, it, vi } from "vitest";
import { OllamaProvider } from "./ollamaProvider";
import { defaultLearningProfile } from "../../shared/languages";

describe("OllamaProvider", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns false after aborting a stalled connection probe", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
          once: true
        });
      })
    );
    const provider = new OllamaProvider({
      baseUrl: "http://127.0.0.1:11434",
      model: "test-model",
      requestTimeoutMs: 20,
      ensureReady: async () => {
        await fetch("http://127.0.0.1:11434/api/tags", {
          signal: AbortSignal.timeout(20)
        });
        return {
          baseUrl: "http://127.0.0.1:11434",
          model: "test-model",
          installed: true,
          installedModels: ["test-model"]
        };
      }
    });

    const request = provider.testConnection();
    await vi.advanceTimersByTimeAsync(20);
    await expect(request).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("normalizes sparse input reading cards without reusing the source as an example", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              cardType: "reading",
              deckType: "input",
              direction: "en_to_ko",
              sourceSentence: "Pawns better say the line.",
              frontText: "Pawns better say the line.",
              literalTranslationKo: "폰들은 그 말을 더 잘 해야 한다.",
              naturalTranslationKo: "폰들은 그 대사를 더 제대로 말해야 한다.",
              highlightMappings: [
                {
                  sourceText: "better",
                  literalKo: "더 잘",
                  naturalKo: "더 제대로",
                  colorKey: "red"
                }
              ],
              vocabularyItems: [
                {
                  term: "better",
                  ipa: "",
                  partOfSpeech: "word",
                  basicMeaningKo: "더 나은, 더 잘",
                  meaningInContextKo: "말을 더 제대로 해야 한다는 압박",
                  etymologyKo:
                    "브라우저 확장에서 선택한 문장카드입니다. 출처: Reddit URL: https://www.reddit.com/r/DragonsDogma/",
                  usagePatterns: ["had better"],
                  colorKey: "red",
                  examples: ["Pawns better say the line.", "This is better."],
                  exampleTranslationsKo: [
                    "폰들은 그 대사를 말하는 편이 낫습니다.",
                    "이것이 더 좋습니다."
                  ]
                }
              ],
              structureNote: "better = 더 잘",
              confusingComparisons: [],
              pumpPrompts: [
                {
                  type: "make_sentence",
                  promptKo: "better를 써서 문장을 만들어 보세요.",
                  requiredTerms: ["better"]
                }
              ]
            })
          }
        }),
        { status: 200 }
      )
    );

    const provider = new OllamaProvider({
      baseUrl: "http://127.0.0.1:11434",
      model: "test-model",
      ensureReady: async () => ({
        baseUrl: "http://127.0.0.1:11434",
        model: "test-model",
        installed: true,
        installedModels: ["test-model"]
      })
    });
    const card = await provider.generateReadingCard({
      selectedText: "better",
      sourceSentence: "Pawns better say the line.",
      learningProfile: defaultLearningProfile
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? ""));
    const userPrompt = requestBody.messages[1].content;
    expect(userPrompt).toContain(
      "Each confusingComparisons item must include kind, one of: similar, contrast, nuance."
    );
    expect(userPrompt).toContain("Do not use confusingComparisons for collocations");
    const legacyKindList = ["similar", "contrast", "nuance", "collocation"].join(", ");
    expect(userPrompt).not.toContain(`one of: ${legacyKindList}`);
    expect(card.structureNote).toBe("");
    expect(card.pumpPrompts).toEqual([]);
    expect(card.vocabularyItems[0].etymologyKo).toBeUndefined();
    expect(card.vocabularyItems[0].examples).toEqual([
      "This is better.",
      'I noticed "better" in the sentence.',
      'Try using "better" in a short reply.'
    ]);
    expect(card.vocabularyItems[0].exampleTranslationsKo).toEqual(["이것이 더 좋습니다.", "", ""]);
    expect(card.vocabularyItems[0].usagePatterns).toEqual([
      'Collocation: "better" + noun/verb',
      "had better",
      'use "better"',
      '"better" in context'
    ]);
  });
});
