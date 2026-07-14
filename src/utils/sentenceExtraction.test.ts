import { describe, expect, it } from "vitest";
import { extractSentenceContext } from "./sentenceExtraction";
import { normalizeText } from "./textNormalization";

const sample =
  "A first sentence appears here. Narrow, deserted streets wind through dilapidated buildings, their facades worn and battered by time and neglect. A final sentence follows.";

describe("sentence extraction", () => {
  it("extracts the sentence containing the selected expression", () => {
    const result = extractSentenceContext({
      fullText: sample,
      selectedText: "dilapidated"
    });

    expect(result.sourceSentence).toBe(
      "Narrow, deserted streets wind through dilapidated buildings, their facades worn and battered by time and neglect."
    );
    expect(result.beforeSentence).toBe("A first sentence appears here.");
    expect(result.afterSentence).toBe("A final sentence follows.");
    expect(result.extractionConfidence).toBe("high");
  });

  it("does not split on common English abbreviations", () => {
    const result = extractSentenceContext({
      fullText: "Dr. Smith moved to the U.S. in 2020. He restored a facade.",
      selectedText: "U.S."
    });

    expect(result.sourceSentence).toBe("Dr. Smith moved to the U.S. in 2020.");
  });

  it("normalizes PDF-like hyphenation and whitespace", () => {
    expect(normalizeText("dilapi-\n dated   buildings")).toBe(
      "dilapidated buildings"
    );
  });

  it("treats line breaks as sentence boundaries", () => {
    const result = extractSentenceContext({
      fullText: "First heading\nSecond line contains neglect\nThird line",
      selectedText: "neglect"
    });

    expect(result.sourceSentence).toBe("Second line contains neglect");
    expect(result.beforeSentence).toBe("First heading");
    expect(result.afterSentence).toBe("Third line");
  });

  it("falls back to local context when the selected text cannot be found", () => {
    const result = extractSentenceContext({
      fullText: "One clear sentence.",
      selectedText: "missing"
    });

    expect(result.extractionConfidence).toBe("fallback");
    expect(result.sourceSentence).toContain("One clear sentence.");
  });
});
