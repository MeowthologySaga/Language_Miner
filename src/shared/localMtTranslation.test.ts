import { describe, expect, it } from "vitest";
import {
  assessLocalMtOutput,
  sanitizeLocalMtOutput,
  splitLocalMtTextUnits
} from "./localMtTranslation";

describe("Local MT guardrails", () => {
  it("splits long multi-sentence PDF segments before translation", () => {
    const units = splitLocalMtTextUnits(
      [
        "The first sentence is short enough to translate alone.",
        "The second sentence should become another local MT unit.",
        "The third sentence keeps the original order."
      ].join(" ")
    );

    expect(units).toEqual([
      "The first sentence is short enough to translate alone.",
      "The second sentence should become another local MT unit.",
      "The third sentence keeps the original order."
    ]);
  });

  it("chunks oversized sentence-like units", () => {
    const units = splitLocalMtTextUnits(
      "This is a very long passage, " +
        "and it keeps adding clauses because PDF extraction can merge too much text, ".repeat(8) +
        "which should not be sent as one generation request."
    );

    expect(units.length).toBeGreaterThan(1);
    expect(Math.max(...units.map((unit) => unit.length))).toBeLessThanOrEqual(360);
  });

  it("rejects repeated decoder loops", () => {
    expect(
      assessLocalMtOutput({
        sourceText: "The dragon flew over the mountain.",
        translatedText: "날 날 날 날 날 날 날 날 날 날 날 날",
        targetLang: "ko"
      })
    ).toMatchObject({ ok: false, reason: "repetition" });
  });

  it("rejects obvious wrong-language drift for Korean output", () => {
    expect(
      assessLocalMtOutput({
        sourceText: "The toy market of Dale was the wonder of the North.",
        translatedText:
          "El mercado de juguetes de Dale fue una maravilla del Norte para los ninos.",
        targetLang: "ko"
      })
    ).toMatchObject({ ok: false, reason: "wrong-language" });
  });

  it("trims foreign-language drift after a usable Korean prefix", () => {
    expect(
      sanitizeLocalMtOutput(
        "오늘날 세상에는 그런 것들이 찾아볼 수 없는 것들입니다. Y De Leatherboy Sweetball O's a Night of the Day Το Heavy.",
        "ko"
      )
    ).toBe("오늘날 세상에는 그런 것들이 찾아볼 수 없는 것들입니다.");
  });

  it("removes isolated diacritic drift and slash-dot noise inside Korean output", () => {
    expect(
      sanitizeLocalMtOutput(
        "그때까지 모든 종이 델에서 울렸다. Azóta... 왜들은 큰 문에서 달려나갔다. /... 그 후엔 아무도 없었다.",
        "ko"
      )
    ).toBe("그때까지 모든 종이 델에서 울렸다. 왜들은 큰 문에서 달려나갔다. 그 후엔 아무도 없었다.");
  });

  it("keeps normal Korean output with proper nouns", () => {
    expect(
      assessLocalMtOutput({
        sourceText: "The Men of Dale sent word to the Men of the Lake.",
        translatedText: "Dale의 사람들이 Lake의 사람들에게 소식을 보냈다.",
        targetLang: "ko"
      })
    ).toMatchObject({ ok: true });
  });
});
