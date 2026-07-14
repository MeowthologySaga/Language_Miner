import { describe, expect, it } from "vitest";
import { parsePdfSegmentTranslations } from "./pdfSegmentTranslations";

describe("PDF segment translation parsing", () => {
  it("accepts matching id arrays", () => {
    expect(
      parsePdfSegmentTranslations(
        JSON.stringify([
          { id: "p1-s001", translationKo: "첫 번째" },
          { id: "p1-s002", translationKo: "두 번째" }
        ]),
        [{ id: "p1-s001" }, { id: "p1-s002" }]
      )
    ).toEqual([
      { id: "p1-s001", translationKo: "첫 번째" },
      { id: "p1-s002", translationKo: "두 번째" }
    ]);
  });

  it("rejects missing, duplicate, or extra ids", () => {
    expect(() =>
      parsePdfSegmentTranslations(
        JSON.stringify([
          { id: "p1-s001", translationKo: "첫 번째" },
          { id: "p1-s001", translationKo: "중복" },
          { id: "p1-s003", translationKo: "추가" }
        ]),
        [{ id: "p1-s001" }, { id: "p1-s002" }]
      )
    ).toThrow(/missing ids: p1-s002/);
  });
});
