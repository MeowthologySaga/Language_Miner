import { describe, expect, it } from "vitest";
import { defaultLearningProfile } from "../shared/languages";
import type { AppSettings, PdfTextSegment } from "../shared/types";
import {
  buildPdfReaderTranslationContext,
  createPdfSegmentTranslationRequest,
  createPdfTranslationCacheLookupInput
} from "./pdfReaderTranslationRequest";

const segment: PdfTextSegment = {
  id: "p1-s1",
  index: 0,
  pageNumber: 1,
  text: "The intricate diagram explained the system."
};

const settings = {
  translationProviderName: "gemini",
  googleTranslateApiKey: "google-key",
  geminiApiKey: "gemini-key",
  geminiModel: "gemini-2.5-flash-lite",
  geminiPlan: "free",
  ollamaBaseUrl: "http://localhost:11434",
  ollamaModel: "gemma3:12b",
  learningProfile: defaultLearningProfile,
  pdfExportMode: "reading"
} satisfies Pick<
  AppSettings,
  | "translationProviderName"
  | "googleTranslateApiKey"
  | "geminiApiKey"
  | "geminiModel"
  | "geminiPlan"
  | "ollamaBaseUrl"
  | "ollamaModel"
  | "learningProfile"
  | "pdfExportMode"
>;

describe("pdf reader translation request", () => {
  it("builds translation context from the active learning profile", () => {
    const context = buildPdfReaderTranslationContext([segment], settings);

    expect(context.sourceLang).toBe(defaultLearningProfile.targetLanguage.code);
    expect(context.targetLang).toBe(defaultLearningProfile.nativeLanguage.code);
    expect(context.contextHash.length).toBeGreaterThan(0);
  });

  it("creates the translatePdfSegments request from reader state", () => {
    const translationContext = buildPdfReaderTranslationContext([segment], settings);
    const request = createPdfSegmentTranslationRequest({
      segments: [segment],
      translationContext,
      settings,
      selectedTranslationModel: "gemini-2.5-flash-lite",
      bypassTranslationCache: true
    });

    expect(request).toMatchObject({
      segments: [segment],
      sourceLang: defaultLearningProfile.targetLanguage.code,
      targetLang: defaultLearningProfile.nativeLanguage.code,
      providerName: "gemini",
      bypassCache: true,
      model: "gemini-2.5-flash-lite",
      contextHash: translationContext.contextHash,
      googleApiKey: "google-key",
      geminiApiKey: "gemini-key",
      ollamaBaseUrl: "http://localhost:11434",
      ollamaModel: "gemma3:12b",
      translationContext
    });
  });

  it("creates cache lookup input with optional browser language overrides", () => {
    const lookup = createPdfTranslationCacheLookupInput({
      segment,
      settings,
      selectedTranslationModel: "browser-native",
      contextHash: "hash-1",
      providerName: "browser",
      sourceLang: "en",
      targetLang: "ko"
    });

    expect(lookup).toMatchObject({
      text: segment.text,
      sourceLang: "en",
      targetLang: "ko",
      providerName: "browser",
      model: "browser-native",
      contextHash: "hash-1"
    });
    expect(lookup.promptVersion).toBeDefined();
    expect(lookup.promptVersion?.length).toBeGreaterThan(0);
  });
});
