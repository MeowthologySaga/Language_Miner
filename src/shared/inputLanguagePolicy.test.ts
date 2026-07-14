import { describe, expect, it } from "vitest";
import {
  assessInputLanguagePolicy,
  detectInputLanguage
} from "./inputLanguagePolicy";
import type { LearningProfile } from "./types";

const koreanToJapanese: LearningProfile = {
  targetLanguage: { code: "ja", nameKo: "일본어", nameEn: "Japanese" },
  nativeLanguage: { code: "ko", nameKo: "한국어", nameEn: "Korean" }
};

describe("inputLanguagePolicy", () => {
  it("detects English, Japanese, and Korean input", () => {
    expect(detectInputLanguage("This sentence is mostly English and easy to detect.").languageCode).toBe(
      "en"
    );
    expect(detectInputLanguage("これは日本語の文章です。今日のニュースを読みます。").languageCode).toBe(
      "ja"
    );
    expect(detectInputLanguage("이 문장은 한국어로 되어 있어서 쉽게 감지됩니다.").languageCode).toBe(
      "ko"
    );
  });

  it("treats mixed or too-short input as unknown", () => {
    expect(detectInputLanguage("OK").languageCode).toBe("unknown");
    expect(detectInputLanguage("This is English인데 한국어도 섞여 있습니다.").languageCode).toBe(
      "unknown"
    );
  });

  it("blocks high-confidence mismatches for the active profile target language", () => {
    const assessment = assessInputLanguagePolicy({
      text: "This English Reddit comment should not become a Japanese input card automatically.",
      learningProfile: koreanToJapanese
    });

    expect(assessment.policyStatus).toBe("mismatch");
    expect(assessment.shouldBlock).toBe(true);
  });

  it("allows matching and unknown language input", () => {
    expect(
      assessInputLanguagePolicy({
        text: "これは日本語の自然なコメントです。",
        learningProfile: koreanToJapanese
      }).policyStatus
    ).toBe("match");

    const unknown = assessInputLanguagePolicy({
      text: "OK",
      learningProfile: koreanToJapanese
    });
    expect(unknown.policyStatus).toBe("unknown");
    expect(unknown.shouldBlock).toBe(false);
  });

  it("records explicit override instead of blocking", () => {
    const assessment = assessInputLanguagePolicy({
      text: "This English sentence is intentionally saved in a Japanese profile.",
      learningProfile: koreanToJapanese,
      override: true
    });

    expect(assessment.policyStatus).toBe("override");
    expect(assessment.shouldBlock).toBe(false);
  });
});
