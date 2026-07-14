import { describe, expect, it } from "vitest";
import { parseJsonWithLooseEscapes } from "./jsonParsing";

describe("JSON parsing", () => {
  it("keeps valid unicode escapes intact", () => {
    expect(parseJsonWithLooseEscapes('{"text":"\\uac00"}')).toEqual({ text: "가" });
  });

  it("repairs invalid backslash escapes from LLM JSON strings", () => {
    const text =
      '{"text":"Keep invalid escapes as text: ' +
      "\\" +
      "unknown and " +
      "\\" +
      'u12."}';

    expect(parseJsonWithLooseEscapes(text)).toEqual({
      text: "Keep invalid escapes as text: \\unknown and \\u12."
    });
  });
});
