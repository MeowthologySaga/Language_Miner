import { describe, expect, it } from "vitest";
import {
  areSameLanguage,
  defaultLearningProfile,
  normalizeLearningProfile,
  normalizeProfileLanguage
} from "./languages";

describe("learning profile language helpers", () => {
  it("fills missing saved settings with the default English to Korean profile", () => {
    expect(normalizeLearningProfile(undefined)).toEqual(defaultLearningProfile);
    expect(normalizeLearningProfile({}).targetLanguage.code).toBe("en");
    expect(normalizeLearningProfile({}).nativeLanguage.code).toBe("ko");
  });

  it("normalizes direct language input while preserving labels", () => {
    expect(
      normalizeProfileLanguage(
        {
          code: " JA ",
          nameKo: " 일본어 ",
          nameEn: " Japanese "
        },
        defaultLearningProfile.targetLanguage
      )
    ).toEqual({
      code: "ja",
      nameKo: "일본어",
      nameEn: "Japanese"
    });
  });

  it("compares language codes case-insensitively", () => {
    expect(
      areSameLanguage(
        { code: "EN", nameKo: "영어", nameEn: "English" },
        { code: "en", nameKo: "영어", nameEn: "English" }
      )
    ).toBe(true);
  });
});
