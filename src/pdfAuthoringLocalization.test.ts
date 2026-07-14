import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import i18n from "./i18n";

const readSource = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

const localizedSources = [
  readSource("src", "pages", "WritingPracticePage.tsx"),
  readSource("src", "pages", "BilingualBookMakerPage.tsx"),
  readSource("src", "components", "PDFSelectionReader.tsx"),
  readSource("src", "components", "PdfMakerAdvancedSettings.tsx"),
  readSource("src", "components", "PdfMakerWorkflow.tsx"),
  readSource("src", "components", "PdfMakerJobSummary.tsx"),
  readSource("src", "components", "PdfMakerUsageEstimate.tsx"),
  readSource("src", "components", "PdfReaderToolbar.tsx"),
  readSource("src", "components", "PdfReaderEmptyState.tsx"),
  readSource("src", "components", "PdfReaderRuntimeDialogs.tsx"),
  readSource("src", "components", "pdfReaderDocument.ts"),
  readSource("src", "components", "SelectionPopover.tsx"),
  readSource("src", "components", "PdfTranslationSegmentList.tsx"),
  readSource("src", "components", "BilingualArtifactReader.tsx"),
  readSource("src", "components", "pdfBrowserTranslator.ts")
];

describe("writing and PDF authoring localization", () => {
  it("provides representative Korean and English copy", () => {
    const korean = i18n.getFixedT("ko");
    const english = i18n.getFixedT("en");

    expect(korean("writingPractice.title")).toBe("영작 훈련");
    expect(english("writingPractice.title")).toBe("Writing practice");
    expect(english("pdfAuthoring.bookMaker.title")).toBe("Create a bilingual book");
    expect(english("pdfAuthoring.artifactReader.toolbar.search")).toBe("Search document");
    expect(english("pdfAuthoring.reader.ui.translation")).toBe("Translation");
    expect(english("pdfAuthoring.workflow.doneTitle")).toBe("Your bilingual PDF is ready");
    expect(english("pdfAuthoring.usage.freeTier")).toBe("Free tier");
    expect(english("pdfAuthoring.dialogs.ollamaTitle")).toBe("Ollama is required");
  });

  it("keeps the scoped renderer copy in the typed catalogs", () => {
    localizedSources.slice(0, -1).forEach((source) => {
      expect(source).toContain("useTranslation");
      expect(source).not.toMatch(/>\s*[가-힣][^<{]*</);
      expect(source).not.toMatch(/(?:aria-label|placeholder|title)="[^"]*[가-힣]/);
      expect(source).not.toMatch(/window\.(?:alert|confirm|prompt)\s*\(/);
    });
    expect(localizedSources.at(-1)).not.toContain("Built-in translator ready");
  });

  it("exposes unique page headings and live error semantics", () => {
    const writing = localizedSources[0];
    const bookMaker = localizedSources[1];
    const pdfReader = localizedSources[2];

    expect(writing).toContain("<h1");
    expect(bookMaker).toContain("<h1");
    expect(pdfReader).toContain('<DocumentNotice kind="error" value={errorNotice} />');
    expect(localizedSources.at(-2)).not.toContain("<h1");
  });

  it("keeps raw exceptions and local paths behind redacted technical details", () => {
    const pdfReader = localizedSources[2];
    const artifactReader = localizedSources.at(-2) ?? "";

    [pdfReader, artifactReader].forEach((source) => {
      expect(source).toContain("documentTechnicalError");
      expect(source).toContain("DocumentNotice");
      expect(source).not.toMatch(/setError\(\s*caught instanceof Error/);
      expect(source).not.toMatch(/setCardStatus\(\s*caught instanceof Error/);
    });
    expect(pdfReader).not.toContain("detail: recordSaveError.message");
  });
});
