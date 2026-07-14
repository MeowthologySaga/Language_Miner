import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pdfSelectionReader = readFileSync(
  join(process.cwd(), "src", "components", "PDFSelectionReader.tsx"),
  "utf8"
);
const pdfMakerWorkflow = readFileSync(
  join(process.cwd(), "src", "components", "PdfMakerWorkflow.tsx"),
  "utf8"
);
const pdfMakerJobSummary = readFileSync(
  join(process.cwd(), "src", "components", "PdfMakerJobSummary.tsx"),
  "utf8"
);
const pdfMakerAdvancedSettings = readFileSync(
  join(process.cwd(), "src", "components", "PdfMakerAdvancedSettings.tsx"),
  "utf8"
);
const pdfMakerUsageEstimate = readFileSync(
  join(process.cwd(), "src", "components", "PdfMakerUsageEstimate.tsx"),
  "utf8"
);
const pdfReaderToolbar = readFileSync(
  join(process.cwd(), "src", "components", "PdfReaderToolbar.tsx"),
  "utf8"
);
const pdfReaderEmptyState = readFileSync(
  join(process.cwd(), "src", "components", "PdfReaderEmptyState.tsx"),
  "utf8"
);
const pdfReaderRuntimeDialogs = readFileSync(
  join(process.cwd(), "src", "components", "PdfReaderRuntimeDialogs.tsx"),
  "utf8"
);
const pdfPageHighlights = readFileSync(
  join(process.cwd(), "src", "components", "PdfPageHighlights.tsx"),
  "utf8"
);
const pdfTranslationSegmentList = readFileSync(
  join(process.cwd(), "src", "components", "PdfTranslationSegmentList.tsx"),
  "utf8"
);
const pdfReaderDocument = readFileSync(
  join(process.cwd(), "src", "components", "pdfReaderDocument.ts"),
  "utf8"
);
const pdfReaderLiveCards = readFileSync(
  join(process.cwd(), "src", "components", "pdfReaderLiveCards.ts"),
  "utf8"
);
const pdfReaderTranslationRequest = readFileSync(
  join(process.cwd(), "src", "components", "pdfReaderTranslationRequest.ts"),
  "utf8"
);

describe("PDF reader component boundaries", () => {
  it("keeps Book Maker workflow surfaces outside the main reader component", () => {
    expect(pdfSelectionReader).toContain('from "./PdfMakerWorkflow"');
    expect(pdfSelectionReader).toContain('from "./PdfMakerJobSummary"');
    expect(pdfSelectionReader).not.toContain('from "./PdfMakerAdvancedSettings"');
    expect(pdfSelectionReader).not.toContain('from "./PdfMakerUsageEstimate"');
    expect(pdfSelectionReader).not.toContain("function renderMakerAdvancedSettings");
    expect(pdfSelectionReader).not.toContain("function renderMakerUsageEstimate");
    expect(pdfSelectionReader).not.toContain("function UsageMeter");
    expect(pdfSelectionReader).not.toContain("className=\"pdf-maker-simple\"");
    expect(pdfSelectionReader).not.toContain("className=\"pdf-job-summary\"");
    expect(pdfSelectionReader).not.toContain("data-qa=\"book-maker-start-button\"");

    expect(pdfMakerJobSummary).toContain("export function PdfMakerJobSummary");
    expect(pdfMakerJobSummary).toContain("className=\"pdf-job-summary\"");
    expect(pdfMakerJobSummary).not.toContain('from "./PDFSelectionReader"');

    expect(pdfMakerWorkflow).toContain("export function PdfMakerWorkflow");
    expect(pdfMakerWorkflow).toContain('from "./PdfMakerAdvancedSettings"');
    expect(pdfMakerWorkflow).toContain('from "./PdfMakerUsageEstimate"');
    expect(pdfMakerWorkflow).not.toContain('from "./PDFSelectionReader"');

    expect(pdfMakerAdvancedSettings).toContain("export function PdfMakerAdvancedSettings");
    expect(pdfMakerAdvancedSettings).not.toContain('from "./PDFSelectionReader"');

    expect(pdfMakerUsageEstimate).toContain("export function PdfMakerUsageEstimate");
    expect(pdfMakerUsageEstimate).toContain("function UsageMeter");
    expect(pdfMakerUsageEstimate).not.toContain('from "./PDFSelectionReader"');
  });

  it("keeps reader chrome and runtime dialogs outside the main reader component", () => {
    expect(pdfSelectionReader).toContain('from "./PdfReaderToolbar"');
    expect(pdfSelectionReader).toContain('from "./PdfReaderEmptyState"');
    expect(pdfSelectionReader).toContain('from "./PdfReaderRuntimeDialogs"');
    expect(pdfSelectionReader).not.toContain("aria-labelledby=\"model-download-title\"");
    expect(pdfSelectionReader).not.toContain("className=\"pdf-babeldoc-dropzone\"");
    expect(pdfSelectionReader).not.toContain("className=\"pdf-page-controls\"");

    expect(pdfReaderToolbar).toContain("export function PdfReaderToolbar");
    expect(pdfReaderToolbar).toContain("className=\"pdf-page-controls\"");
    expect(pdfReaderToolbar).not.toContain('from "./PDFSelectionReader"');

    expect(pdfReaderEmptyState).toContain("export function PdfReaderEmptyState");
    expect(pdfReaderEmptyState).toContain("className=\"pdf-babeldoc-dropzone\"");
    expect(pdfReaderEmptyState).not.toContain('from "./PDFSelectionReader"');

    expect(pdfReaderRuntimeDialogs).toContain("export function PdfReaderRuntimeDialogs");
    expect(pdfReaderRuntimeDialogs).toContain('ariaLabelledBy="model-download-title"');
    expect(pdfReaderRuntimeDialogs).toContain('from "./Dialog"');
    expect(pdfReaderRuntimeDialogs).not.toContain('from "./PDFSelectionReader"');
  });

  it("keeps page highlight and segment list rendering outside the main reader component", () => {
    expect(pdfSelectionReader).toContain('from "./PdfPageHighlights"');
    expect(pdfSelectionReader).toContain('from "./PdfTranslationSegmentList"');
    expect(pdfSelectionReader).not.toContain("getDebugSegmentHighlightBounds");
    expect(pdfSelectionReader).not.toContain("className=\"pdf-translation-segments\"");

    expect(pdfPageHighlights).toContain("export function PdfPageHighlights");
    expect(pdfPageHighlights).toContain("getDebugSegmentHighlightBounds");
    expect(pdfPageHighlights).not.toContain('from "./PDFSelectionReader"');

    expect(pdfTranslationSegmentList).toContain("export function PdfTranslationSegmentList");
    expect(pdfTranslationSegmentList).toContain("className=\"pdf-translation-segments\"");
    expect(pdfTranslationSegmentList).not.toContain('from "./PDFSelectionReader"');
  });

  it("keeps PDF.js document IO and canvas rendering outside the main reader component", () => {
    expect(pdfSelectionReader).toContain('from "./pdfReaderDocument"');
    expect(pdfSelectionReader).not.toContain('from "pdfjs-dist"');
    expect(pdfSelectionReader).not.toContain("GlobalWorkerOptions.workerSrc");
    expect(pdfSelectionReader).not.toContain("function loadPdfDocument");
    expect(pdfSelectionReader).not.toContain("buildTransformLayoutItems");
    expect(pdfSelectionReader).not.toContain("pageDataCacheRef");

    expect(pdfReaderDocument).toContain('from "pdfjs-dist"');
    expect(pdfReaderDocument).toContain("export async function loadPdfDocument");
    expect(pdfReaderDocument).toContain("export function usePdfPageDataReader");
    expect(pdfReaderDocument).toContain("export function usePdfPageRenderer");
    expect(pdfReaderDocument).not.toContain('from "./PDFSelectionReader"');
  });

  it("keeps live card request and usage helpers outside the main reader component", () => {
    expect(pdfSelectionReader).toContain('from "./pdfReaderLiveCards"');
    expect(pdfSelectionReader).not.toContain("estimateCardGenerationUsage");
    expect(pdfSelectionReader).not.toContain("function createPdfLiveCardRequest");
    expect(pdfSelectionReader).not.toContain("function estimatePdfLiveCardUsage");

    expect(pdfReaderLiveCards).toContain("export function createPdfLiveCardRequest");
    expect(pdfReaderLiveCards).toContain("export function estimatePdfLiveCardUsage");
    expect(pdfReaderLiveCards).not.toContain('from "./PDFSelectionReader"');
  });

  it("keeps PDF translation request assembly outside the main reader component", () => {
    expect(pdfSelectionReader).toContain('from "./pdfReaderTranslationRequest"');
    expect(pdfSelectionReader).not.toContain("buildPdfTranslationContext({");
    expect(pdfSelectionReader).not.toContain("PDF_SEGMENT_TRANSLATION_PROMPT_VERSION");
    expect(pdfSelectionReader).not.toContain("function createPdfSegmentTranslationRequest");

    expect(pdfReaderTranslationRequest).toContain(
      "export function createPdfSegmentTranslationRequest"
    );
    expect(pdfReaderTranslationRequest).toContain("PDF_SEGMENT_TRANSLATION_PROMPT_VERSION");
    expect(pdfReaderTranslationRequest).not.toContain('from "./PDFSelectionReader"');
  });
});
