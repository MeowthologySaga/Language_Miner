import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(join(process.cwd(), "src", "App.tsx"), "utf8");
const bookMakerPageSource = readFileSync(
  join(process.cwd(), "src", "pages", "BilingualBookMakerPage.tsx"),
  "utf8"
);
const pdfSelectionReaderSource = readFileSync(
  join(process.cwd(), "src", "components", "PDFSelectionReader.tsx"),
  "utf8"
);
const pdfReaderWorkflowStateSource = readFileSync(
  join(process.cwd(), "src", "components", "pdfReaderWorkflowState.ts"),
  "utf8"
);
const pdfMakerWorkflowSource = readFileSync(
  join(process.cwd(), "src", "components", "PdfMakerWorkflow.tsx"),
  "utf8"
);

describe("Book Maker keepalive policy", () => {
  it("keeps Book Maker mounted only while active work asks for it", () => {
    expect(appSource).not.toContain("hasOpenedBookMaker");
    expect(appSource).toContain("shouldKeepBookMakerMounted");
    expect(appSource).toContain("handleBookMakerKeepAliveChange");
    expect(appSource).toContain(
      'activeTab === "bookMaker" || activeTab === "exportHistory" || shouldKeepBookMakerMounted'
    );
  });

  it("passes the keepalive signal from the maker page to the PDF reader", () => {
    expect(bookMakerPageSource).toContain("onKeepAliveChange");
    expect(bookMakerPageSource).toContain("onMakerKeepAliveChange={onKeepAliveChange}");

    expect(pdfSelectionReaderSource).toContain("onMakerKeepAliveChange");
    expect(pdfSelectionReaderSource).toContain("getPdfReaderWorkflowState");
    expect(pdfReaderWorkflowStateSource).toContain(
      "shouldKeepMakerAlive: isMakerMode && (isOpening || isMakerBusy || isMakerJobActive)"
    );
    expect(pdfSelectionReaderSource).toContain("onMakerKeepAliveChange?.(shouldKeepMakerAlive);");
    expect(pdfSelectionReaderSource).toContain("onMakerKeepAliveChange?.(false);");
  });

  it("offers a visible way to release the selected PDF without leaving the page", () => {
    expect(pdfSelectionReaderSource).toContain("onResetPdfReaderToEmpty={resetPdfReaderToEmpty}");
    expect(pdfMakerWorkflowSource).toContain('data-qa="book-maker-clear-button"');
    expect(pdfMakerWorkflowSource).toContain("onClick={onResetPdfReaderToEmpty}");
  });
});
