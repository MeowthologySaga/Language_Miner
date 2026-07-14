import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const readerSource = readFileSync(
  join(process.cwd(), "src", "components", "BilingualArtifactReader.tsx"),
  "utf8"
);
const utilsSource = readFileSync(
  join(process.cwd(), "src", "components", "bilingualArtifactReaderUtils.tsx"),
  "utf8"
);
const navigationSource = readFileSync(
  join(process.cwd(), "src", "components", "bilingualArtifactReaderNavigation.ts"),
  "utf8"
);
const cardsSource = readFileSync(
  join(process.cwd(), "src", "components", "bilingualArtifactReaderCards.ts"),
  "utf8"
);

describe("bilingual artifact reader boundaries", () => {
  it("keeps reader utility helpers outside the main reader component", () => {
    expect(readerSource).toContain('from "./bilingualArtifactReaderUtils"');
    expect(readerSource).toContain('from "./bilingualArtifactReaderNavigation"');
    expect(readerSource).toContain('from "./bilingualArtifactReaderCards"');
    expect(readerSource).not.toContain("function arrayBufferFromPdfFileData");
    expect(readerSource).not.toContain("function replaceSourceSentenceInContext");
    expect(readerSource).not.toContain("function findSentenceTermMatches");
    expect(readerSource).not.toContain("function positionSentencePopover");
    expect(readerSource).not.toContain("function matchesShortcut");
    expect(readerSource).not.toContain("function resolveWheelPageNavigation");
    expect(readerSource).not.toContain("function resolveReaderScale");
    expect(readerSource).not.toContain("type CardGenerationRequest =");
    expect(readerSource).not.toContain("type SentenceTermsSession =");
    expect(readerSource).not.toContain("const WHEEL_PAGE_DELTA_THRESHOLD");
    expect(readerSource).not.toContain("const MAX_SENTENCE_TERMS");

    expect(utilsSource).toContain("export function arrayBufferFromPdfFileData");
    expect(utilsSource).toContain("export function replaceSourceSentenceInContext");
    expect(utilsSource).toContain("export function findSentenceTermMatches");
    expect(utilsSource).not.toContain('from "./BilingualArtifactReader"');

    expect(navigationSource).toContain("export function resolveWheelPageNavigation");
    expect(navigationSource).toContain("export function resolveReaderScale");
    expect(navigationSource).not.toContain('from "./BilingualArtifactReader"');

    expect(cardsSource).toContain("export type CardGenerationRequest");
    expect(cardsSource).toContain("export function createCardRequestFromExtraction");
    expect(cardsSource).not.toContain('from "./BilingualArtifactReader"');
  });
});
