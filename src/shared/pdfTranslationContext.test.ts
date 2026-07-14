import { describe, expect, it } from "vitest";
import { buildPdfTranslationContext } from "./pdfTranslationContext";

describe("PDF translation context", () => {
  it("extracts context terms only from source text", () => {
    const context = buildPdfTranslationContext({
      sourceLang: "en",
      targetLang: "ko",
      segments: [
        {
          text: "The Silver Road was edited by J. R. Smith at North River Books in 1995 for the second edition."
        },
        {
          text: "The travelers crossed the Silver Road again, and the travelers rested."
        }
      ]
    });

    const sources = context.terms.map((term) => term.source);
    expect(sources).toContain("J. R. Smith");
    expect(sources).toContain("North River Books");
    expect(sources).toContain("The Silver Road");
    expect(sources).toContain("second edition");
    expect(sources).toContain("travelers");
    expect(sources).not.toContain("The Hobbit");
    expect(sources).not.toContain("Tolkien");
    expect(context.contextHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("changes context hash when document context changes", () => {
    const first = buildPdfTranslationContext({
      sourceLang: "en",
      targetLang: "ko",
      segments: [{ text: "A. B. Smith wrote The Silver Road." }]
    });
    const second = buildPdfTranslationContext({
      sourceLang: "en",
      targetLang: "ko",
      segments: [{ text: "C. D. Jones wrote The Golden River." }]
    });

    expect(first.contextHash).not.toBe(second.contextHash);
  });

  it("does not promote obvious sentence fragments to proper-noun terms", () => {
    const context = buildPdfTranslationContext({
      sourceLang: "en",
      targetLang: "ko",
      segments: [
        {
          text: "Vegetable Stew Here is a great new way to use summer vegetables. Add carrots, remove the pot from heat, and return it to the stove."
        },
        {
          text: "Chapter 2 Report Style There is no satisfactory explanation of style."
        }
      ]
    });

    const sources = context.terms.map((term) => term.source);
    expect(sources).not.toContain("Vegetable Stew Here");
    expect(sources).not.toContain("Report Style There");
  });

  it("does not promote dialogue snippets or quote boundaries to title terms", () => {
    const context = buildPdfTranslationContext({
      sourceLang: "en",
      targetLang: "ko",
      segments: [
        {
          text: "“Drat the bird!” said Bilbo crossly. “Leave him alone!” said Thorin. “Do get on with your tale!” cried the dwarves."
        },
        {
          text: "Readers later referred to “Riddles in the Dark” as an important chapter title."
        }
      ]
    });

    const sources = context.terms.map((term) => term.source);
    expect(sources).toContain("Riddles in the Dark");
    expect(sources).not.toContain("Drat the bird");
    expect(sources).not.toContain("Leave him alone");
    expect(sources).not.toContain("Do get on with your tale");
    expect(sources).not.toContain("said Bilbo crossly");
  });

  it("does not preserve individual words from all-caps headings as acronyms", () => {
    const context = buildPdfTranslationContext({
      sourceLang: "en",
      targetLang: "ko",
      segments: [
        {
          text: "VI OUT OF THE FRYING-PAN INTO THE FIRE\nBilbo crossed the Misty Mountains."
        }
      ]
    });

    const sources = context.terms.map((term) => term.source);
    expect(sources).toContain("VI OUT OF THE FRYING-PAN INTO THE FIRE");
    expect(sources).not.toContain("THE");
    expect(sources).not.toContain("OF");
    expect(sources).not.toContain("OUT");
  });
});
