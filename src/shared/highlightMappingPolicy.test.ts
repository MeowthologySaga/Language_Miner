import { describe, expect, it } from "vitest";
import { sanitizeInputHighlightMappings } from "./highlightMappingPolicy";

describe("sanitizeInputHighlightMappings", () => {
  it("keeps exact spans and removes invented translation spans", () => {
    const mappings = sanitizeInputHighlightMappings({
      deckType: "input",
      sourceSentence: "We decided to put off the meeting.",
      literalTranslationKo: "우리는 회의를 미루기로 결정했다.",
      naturalTranslationKo: "우리는 회의를 미루기로 했다.",
      highlightMappings: [
        {
          sourceText: "put off",
          literalKo: "미루기로",
          naturalKo: "~을 연기하다",
          colorKey: "orange"
        }
      ]
    });

    expect(mappings).toEqual([
      {
        sourceText: "put off",
        literalKo: "미루기로",
        naturalKo: undefined,
        colorKey: "orange"
      }
    ]);
  });

  it("drops a source highlight that does not exist verbatim", () => {
    expect(
      sanitizeInputHighlightMappings({
        deckType: "input",
        sourceSentence: "The result looked intimidating.",
        literalTranslationKo: "그 결과는 위협적으로 보였다.",
        naturalTranslationKo: "그 결과가 막막해 보였다.",
        highlightMappings: [
          { sourceText: "look intimidating", colorKey: "orange" }
        ]
      })
    ).toEqual([]);
  });

  it("matches selected source spans case-insensitively and preserves source casing", () => {
    expect(
      sanitizeInputHighlightMappings({
        deckType: "input",
        sourceSentence: "Keep going even when it feels slow.",
        literalTranslationKo: "계속 가라.",
        naturalTranslationKo: "계속해.",
        highlightMappings: [{ sourceText: "keep going", colorKey: "orange" }]
      })
    ).toEqual([{ sourceText: "Keep going", colorKey: "orange", literalKo: undefined, naturalKo: undefined }]);
  });
});
