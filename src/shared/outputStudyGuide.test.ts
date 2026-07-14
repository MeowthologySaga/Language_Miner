import { describe, expect, it } from "vitest";
import {
  normalizeOutputStudyGuidePronunciations,
  pronunciationMatchesNativeMeaning
} from "./outputStudyGuide";
import type { OutputStudyGuide } from "./types";

describe("output study guide pronunciation", () => {
  it("detects when the pronunciation repeats the native-language meaning", () => {
    expect(
      pronunciationMatchesNativeMeaning({
        en: "What do moles like?",
        ko: "두더지는 무엇을 좋아하나요?",
        pronunciationKo: "두더지는 무엇을 좋아하나요?"
      })
    ).toBe(true);
    expect(
      pronunciationMatchesNativeMeaning({
        en: "What do moles like?",
        ko: "두더지는 무엇을 좋아하나요?",
        pronunciationKo: "왓 두 몰즈 라이크?"
      })
    ).toBe(false);
  });

  it("reuses a valid pronunciation for the same target sentence", () => {
    const guide = makeGuide();
    guide.alternatives = [
      {
        en: "What do moles like?",
        ko: "두더지는 무엇을 좋아하나요?",
        pronunciationKo: "왓 두 몰즈 라이크?",
        ipa: "/wʌt duː moʊlz laɪk/"
      }
    ];
    const normalized = normalizeOutputStudyGuidePronunciations(guide)!;

    expect(normalized.dialogue[0]).toMatchObject({
      pronunciationKo: "왓 두 몰즈 라이크?",
      ipa: "/wʌt duː moʊlz laɪk/"
    });
  });
});

function makeGuide(): OutputStudyGuide {
  return {
    templateVersion: "adaptive-v1",
    contextKo: "두더지에 관해 묻는 상황",
    dialogue: [
      {
        en: "What do moles like?",
        ko: "두더지는 무엇을 좋아하나요?",
        pronunciationKo: "두더지는 무엇을 좋아하나요?",
        ipa: "/du dʌdʌdʒinɯn muʌsɯl dʒoahanajo/"
      }
    ],
    keyChunks: [],
    insight: { title: "뉘앙스", bodyKo: "" },
    literalMeaningKo: "",
    nuanceKo: "",
    breakdown: [],
    alternatives: [],
    miniDrills: [],
    tags: []
  };
}
