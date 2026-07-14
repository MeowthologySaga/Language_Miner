import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

describe("renderer translation cancellation boundaries", () => {
  const surfaces = [
    "src/components/PDFSelectionReader.tsx",
    "src/pages/VideoReaderPage.tsx",
    "src/pages/WebReaderPage.tsx"
  ];

  it.each(surfaces)("wires stable request ids and an explicit cancel call in %s", (surface) => {
    const source = readSource(surface);
    expect(source).toContain("crypto.randomUUID()");
    expect(source).toContain("api.translations.cancel");
    expect(source).toContain("requestId");
    expect(source).toContain("cancelRequested");
    if (surface.endsWith("WebReaderPage.tsx")) {
      expect(source).toContain('t("webReader.translation.stop")');
    } else if (surface.endsWith("PDFSelectionReader.tsx")) {
      expect(source).toContain('t("pdfAuthoring.reader.stop")');
    } else {
      expect(source).toContain("TRANSLATION_CANCEL_COPY.stop");
    }
  });

  it.each(surfaces)("requires the shared external-transfer preflight in %s", (surface) => {
    const source = readSource(surface);
    expect(source).toContain("useCloudTranslationPreflight");
    expect(source).toContain("confirmCloudTranslation");
    expect(source).toContain("cloudTranslationPreflightDialog");
  });

  it("keeps the preflight accessible and explicit", () => {
    const source = readSource("src/components/CloudTranslationPreflightDialog.tsx");
    expect(source).toContain("<Dialog");
    expect(source).toContain("initialFocusRef={cancelButtonRef}");
    expect(source).toContain('t("cloudTranslationPreflight.continue")');
    expect(source).toContain('t("cloudTranslationPreflight.disclaimer")');
    expect(source).toContain('ariaDescribedBy={`${descriptionId} ${warningId}`}');
    expect(source).toContain("<dl className=\"cloud-preflight-grid\">");
    expect(source).not.toMatch(/[가-힣]/);
    expect(source).toContain('data-qa="cloud-translation-preflight"');
  });
});
