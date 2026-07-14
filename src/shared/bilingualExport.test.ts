import { describe, expect, it } from "vitest";
import {
  buildBilingualDocumentHtml,
  getBilingualDocumentPageMap,
  getBilingualDocumentStats
} from "./bilingualExport";

describe("bilingual export HTML", () => {
  it("renders a source page image beside a reflowed translated page", () => {
    const html = buildBilingualDocumentHtml({
      title: "Sample",
      sourceLanguageLabel: "English",
      targetLanguageLabel: "Korean",
      pages: [
        {
          pageNumber: 3,
          sourcePageImageDataUrl: "data:image/png;base64,abc123",
          sourcePageWidth: 612,
          sourcePageHeight: 792,
          segments: [
            {
              id: "p3-s001-abcdef",
              sourceText: "Original <text>.",
              translationText: "Translated text.",
              sourceBounds: { left: 0.1, top: 0.2, width: 0.3, height: 0.04 }
            }
          ]
        }
      ]
    });

    expect(html).not.toContain("English / Korean");
    expect(html).not.toContain("translated layout");
    expect(html).not.toContain('class="cover"');
    expect(html).not.toContain("p3-s001-abcdef");
    expect(html).toContain('src="data:image/png;base64,abc123"');
    expect(html).not.toContain('class="source-highlight"');
    expect(html).toContain("translated-page-frame");
    expect(html).toContain("translated-flow-layer");
    expect(html).toContain("translated-flow-block");
    expect(html).toContain("--segment-color:#ec4899");
    expect(html).toContain("--segment-bg:rgba(236, 72, 153, 0.12)");
    expect(html).toContain("size: 1224pt 792pt");
    expect(html).toContain("--source-page-width:612pt");
    expect(html).toContain("--spread-page-width:1224pt");
    expect(html).toContain("aspect-ratio:612 / 792");
    expect(html).toContain("left:10%");
    expect(html).toContain("top:20%");
    expect(html).toContain("font-size:13.2pt");
    expect(html).not.toContain("Original &lt;text&gt;");
    expect(html).toContain("Translated text.");
  });

  it("reports the source page map used by selectable PDF composition", () => {
    const input = {
      title: "Sample",
      sourceLanguageLabel: "English",
      targetLanguageLabel: "Korean",
      includeCoverPage: true,
      pages: [
        {
          pageNumber: 3,
          sourcePageImageDataUrl: "data:image/png;base64,abc123",
          sourcePageWidth: 612,
          sourcePageHeight: 792,
          segments: [
            {
              id: "p3-s001-abcdef",
              sourceText: "Original text.",
              translationText: "Translated text.",
              sourceBounds: { left: 0.1, top: 0.2, width: 0.3, height: 0.04 }
            }
          ]
        }
      ]
    };

    expect(getBilingualDocumentPageMap(input)).toEqual([
      { kind: "cover" },
      { kind: "source", sourcePageNumber: 3 }
    ]);
    expect(getBilingualDocumentStats(input).pageCount).toBe(2);
  });

  it("can include page chrome when requested", () => {
    const html = buildBilingualDocumentHtml({
      title: "Sample",
      sourceLanguageLabel: "English",
      targetLanguageLabel: "Korean",
      showPageChrome: true,
      pages: [
        {
          pageNumber: 3,
          sourcePageImageDataUrl: "data:image/png;base64,abc123",
          sourcePageWidth: 612,
          sourcePageHeight: 792,
          segments: [
            {
              id: "p3-s001-abcdef",
              sourceText: "Original text",
              translationText: "Translated text",
              sourceBounds: { left: 0.1, top: 0.2, width: 0.3, height: 0.04 }
            }
          ]
        }
      ]
    });

    expect(html).toContain("Sample - Page 3");
    expect(html).toContain("English / Korean");
    expect(html).toContain("original");
    expect(html).toContain("translated layout");
    expect(html).toContain("p3-s001-abcdef");
    expect(html).toContain("Original text");
  });

  it("can include a cover page when requested", () => {
    const html = buildBilingualDocumentHtml({
      title: "Sample Cover",
      sourceLanguageLabel: "English",
      targetLanguageLabel: "Korean",
      includeCoverPage: true,
      pages: [
        {
          pageNumber: 1,
          segments: [
            {
              id: "p1-s001-abcdef",
              sourceText: "Source",
              translationText: "Translation"
            }
          ]
        }
      ]
    });

    expect(html).toContain('class="cover"');
    expect(html).toContain("Sample Cover");
    expect(html).toContain("1 pages");
    expect(html).toContain("1 segments");
  });

  it("falls back to text side-by-side rows when no page image is available", () => {
    const html = buildBilingualDocumentHtml({
      title: "Sample",
      sourceLanguageLabel: "English",
      targetLanguageLabel: "Korean",
      pages: [
        {
          pageNumber: 1,
          segments: [
            {
              id: "p1-s001-abcdef",
              sourceText: "Source",
              translationText: "Translation"
            }
          ]
        }
      ]
    });

    expect(html).toContain('class="segment"');
    expect(html).not.toContain("<img");
    expect(html).toContain("Source");
    expect(html).toContain("Translation");
  });

  it("keeps selected image pages even when they have no translated segments", () => {
    const html = buildBilingualDocumentHtml({
      title: "Sample",
      sourceLanguageLabel: "English",
      targetLanguageLabel: "Korean",
      pages: [
        {
          pageNumber: 2,
          sourcePageImageDataUrl: "data:image/png;base64,page2",
          sourcePageWidth: 612,
          sourcePageHeight: 792,
          segments: []
        }
      ]
    });

    expect(html).toContain("Original page 2");
    expect(html).toContain('src="data:image/png;base64,page2"');
    expect(html).not.toContain("0 segments");
    expect(html).not.toContain("No layout-positioned translations on this page.");
  });

  it("renders one source highlight box per segment when explicitly requested", () => {
    const html = buildBilingualDocumentHtml({
      title: "Sample",
      sourceLanguageLabel: "English",
      targetLanguageLabel: "Korean",
      showSourceHighlights: true,
      pages: [
        {
          pageNumber: 1,
          sourcePageImageDataUrl: "data:image/png;base64,abc123",
          sourcePageWidth: 612,
          sourcePageHeight: 792,
          segments: [
            {
              id: "p1-s001-aaaaaa",
              sourceText: "Two line source",
              translationText: "Two line translation",
              sourceBounds: { left: 0.1, top: 0.2, width: 0.3, height: 0.08 },
              sourceLineBounds: [
                { left: 0.1, top: 0.2, width: 0.18, height: 0.025 },
                { left: 0.1, top: 0.24, width: 0.3, height: 0.025 }
              ]
            }
          ]
        }
      ]
    });

    expect(html.match(/class="source-highlight"/g)).toHaveLength(1);
    expect(html).toContain("--segment-color:#ec4899");
    expect(html).toContain("left:9.65%");
    expect(html).toContain("top:19.7%");
    expect(html).toContain("width:30.7%");
    expect(html).toContain("height:7.1%");
  });

  it("splits source highlight boxes when adjacent segments share the same source line", () => {
    const html = buildBilingualDocumentHtml({
      title: "Sample",
      sourceLanguageLabel: "English",
      targetLanguageLabel: "Korean",
      showSourceHighlights: true,
      pages: [
        {
          pageNumber: 1,
          sourcePageImageDataUrl: "data:image/png;base64,abc123",
          sourcePageWidth: 612,
          sourcePageHeight: 792,
          segments: [
            {
              id: "p1-s001-aaaaaa",
              sourceText: "First segment ends on the shared line.",
              translationText: "First translation",
              sourceBounds: { left: 0.1, top: 0.2, width: 0.5, height: 0.055 },
              sourceLineBounds: [
                { left: 0.1, top: 0.2, width: 0.5, height: 0.018 },
                { left: 0.1, top: 0.232, width: 0.22, height: 0.018 }
              ]
            },
            {
              id: "p1-s002-bbbbbb",
              sourceText: "Second segment starts after it.",
              translationText: "Second translation",
              sourceBounds: { left: 0.33, top: 0.232, width: 0.27, height: 0.05 },
              sourceLineBounds: [
                { left: 0.33, top: 0.232, width: 0.27, height: 0.018 },
                { left: 0.1, top: 0.262, width: 0.5, height: 0.018 }
              ]
            }
          ]
        }
      ]
    });

    expect(html.match(/class="source-highlight"/g)).toHaveLength(4);
    expect(html).toContain("left:9.65%");
    expect(html).toContain("width:22.7%");
    expect(html).toContain("left:32.65%");
    expect(html).toContain("width:27.7%");
    expect(html).toContain("--segment-color:#ec4899");
    expect(html).toContain("--segment-color:#0ea5e9");
  });

  it("reflows overlapping translated blocks down within the same column", () => {
    const html = buildBilingualDocumentHtml({
      title: "Sample",
      sourceLanguageLabel: "English",
      targetLanguageLabel: "Korean",
      pages: [
        {
          pageNumber: 1,
          sourcePageImageDataUrl: "data:image/png;base64,abc123",
          sourcePageWidth: 612,
          sourcePageHeight: 792,
          segments: [
            {
              id: "p1-s001-aaaaaa",
              sourceText: "First",
              translationText: "First translation",
              sourceBounds: { left: 0.1, top: 0.1, width: 0.32, height: 0.04 }
            },
            {
              id: "p1-s002-bbbbbb",
              sourceText: "Second",
              translationText: "Second translation",
              sourceBounds: { left: 0.11, top: 0.12, width: 0.32, height: 0.04 }
            }
          ]
        }
      ]
    });

    expect(html).toContain("top:10%");
    expect(html).toContain("top:17.803%");
    expect(html).toContain("--segment-color:#ec4899");
    expect(html).toContain("--segment-color:#0ea5e9");
  });

  it("does not treat short list fragments or numeric runs as headings", () => {
    const html = buildBilingualDocumentHtml({
      title: "Sample",
      sourceLanguageLabel: "English",
      targetLanguageLabel: "Korean",
      pages: [
        {
          pageNumber: 1,
          sourcePageImageDataUrl: "data:image/png;base64,abc123",
          sourcePageWidth: 612,
          sourcePageHeight: 792,
          segments: [
            {
              id: "p1-s001-heading",
              sourceText: "Chapter III",
              translationText: "제3장",
              sourceBounds: { left: 0.1, top: 0.1, width: 0.15, height: 0.03 }
            },
            {
              id: "p1-s002-fragment",
              sourceText: "by Elrond were:",
              translationText: "엘론드가 쓴 것은 다음과 같았다.",
              sourceBounds: { left: 0.1, top: 0.2, width: 0.18, height: 0.025 }
            },
            {
              id: "p1-s003-numbers",
              sourceText: "1 3 5 7 9 8 6 4 2",
              translationText: "1 3 5 7 9 8 6 4 2",
              sourceBounds: { left: 0.1, top: 0.3, width: 0.18, height: 0.025 }
            },
            {
              id: "p1-s004-sentence",
              sourceText: "This new reset edition is based on the edition first published in 1995",
              translationText: "이 새 조판본은 1995년에 처음 출간된 판본을 바탕으로 한다.",
              sourceBounds: { left: 0.1, top: 0.4, width: 0.5, height: 0.035 }
            }
          ]
        }
      ]
    });

    expect(html.match(/translated-flow-block heading/g)).toHaveLength(1);
    expect(html.match(/translated-flow-block body/g)).toHaveLength(3);
  });

  it("applies paragraph first-line indentation in translated layout", () => {
    const html = buildBilingualDocumentHtml({
      title: "Sample",
      sourceLanguageLabel: "English",
      targetLanguageLabel: "Korean",
      pages: [
        {
          pageNumber: 1,
          sourcePageImageDataUrl: "data:image/png;base64,abc123",
          sourcePageWidth: 612,
          sourcePageHeight: 792,
          segments: [
            {
              id: "p1-s001-aaaaaa",
              sourceText: "First paragraph.",
              translationText: "첫 번째 문단입니다.",
              sourceBounds: { left: 0.1, top: 0.2, width: 0.62, height: 0.04 }
            },
            {
              id: "p1-s002-bbbbbb",
              sourceText: "Indented paragraph.",
              translationText: "들여쓰기된 새 문단입니다.",
              sourceBounds: { left: 0.13, top: 0.25, width: 0.59, height: 0.04 }
            }
          ]
        }
      ]
    });

    expect(html).toContain("text-indent:18.36pt");
  });

  it("moves severe page-overflow translations to a continuation page", () => {
    const longTranslation = "Long translated sentence. ".repeat(120);
    const html = buildBilingualDocumentHtml({
      title: "Sample",
      sourceLanguageLabel: "English",
      targetLanguageLabel: "Korean",
      pages: [
        {
          pageNumber: 1,
          sourcePageImageDataUrl: "data:image/png;base64,abc123",
          sourcePageWidth: 612,
          sourcePageHeight: 792,
          segments: [
            {
              id: "p1-s001-aaaaaa",
              sourceText: "Long source paragraph.",
              translationText: longTranslation,
              sourceBounds: { left: 0.1, top: 0.93, width: 0.32, height: 0.04 }
            }
          ]
        }
      ]
    });

    expect(html).not.toContain("translated-flow-block body");
    expect(html).not.toContain('class="translated-flow-block body overflowed"');
    expect(html).toContain('class="page continuation-page chromeless"');
    expect(html).toContain('class="continuation-translations chromeless"');
    expect(html).toContain('class="translation-row chromeless"');
    expect(html).not.toContain("p1-s001-aaaaaa");
    expect(html).not.toContain("Long source");
    expect(html).not.toContain("continued translations");
    expect(html).not.toContain("Translations continue below this page frame.");
    expect(html).not.toContain("Original page is shown on the previous spread.");
    expect(html.match(/Long translated sentence\./g)?.length).toBe(120);
  });

  it("keeps continuation diagnostics when page chrome is requested", () => {
    const longTranslation = "Long translated sentence. ".repeat(120);
    const html = buildBilingualDocumentHtml({
      title: "Sample",
      sourceLanguageLabel: "English",
      targetLanguageLabel: "Korean",
      showPageChrome: true,
      pages: [
        {
          pageNumber: 1,
          sourcePageImageDataUrl: "data:image/png;base64,abc123",
          sourcePageWidth: 612,
          sourcePageHeight: 792,
          segments: [
            {
              id: "p1-s001-aaaaaa",
              sourceText: "Long source paragraph.",
              translationText: longTranslation,
              sourceBounds: { left: 0.1, top: 0.93, width: 0.32, height: 0.04 }
            }
          ]
        }
      ]
    });

    expect(html).toContain("Sample - Page 1 continuation");
    expect(html).toContain("continued translations");
    expect(html).toContain("Original page is shown on the previous spread.");
    expect(html).toContain("p1-s001-aaaaaa");
    expect(html).toContain("Long source paragraph.");
  });

  it("counts generated document pages including cover and continuations", () => {
    const stats = getBilingualDocumentStats({
      title: "Sample",
      sourceLanguageLabel: "English",
      targetLanguageLabel: "Korean",
      includeCoverPage: true,
      pages: [
        {
          pageNumber: 1,
          sourcePageImageDataUrl: "data:image/png;base64,abc123",
          sourcePageWidth: 612,
          sourcePageHeight: 792,
          segments: [
            {
              id: "p1-s001-aaaaaa",
              sourceText: "Long source paragraph.",
              translationText: "Long translated sentence. ".repeat(120),
              sourceBounds: { left: 0.1, top: 0.93, width: 0.32, height: 0.04 }
            }
          ]
        },
        {
          pageNumber: 2,
          sourcePageImageDataUrl: "data:image/png;base64,page2",
          sourcePageWidth: 612,
          sourcePageHeight: 792,
          segments: [
            {
              id: "p2-s001-bbbbbb",
              sourceText: "Short source",
              translationText: "Short translation",
              sourceBounds: { left: 0.1, top: 0.2, width: 0.32, height: 0.04 }
            }
          ]
        }
      ]
    });

    expect(stats).toEqual({
      pageCount: 4,
      segmentCount: 2
    });
  });

  it("keeps numeric table-like segments in the default reading export mode", () => {
    const html = buildBilingualDocumentHtml({
      title: "Paper",
      sourceLanguageLabel: "English",
      targetLanguageLabel: "Korean",
      showSourceHighlights: true,
      pages: [
        {
          pageNumber: 1,
          sourcePageImageDataUrl: "data:image/png;base64,abc123",
          sourcePageWidth: 612,
          sourcePageHeight: 792,
          segments: [
            {
              id: "p1-table",
              sourceText:
                "Methods R-Precision Top-1 ↑ Top-2 ↑ Top-3 ↑ FID ↓ MM-Dist ↓ Diversity Ours 0.512 0.703 0.799 0.087 2.998 9.211 Baseline 0.421 0.601 0.702 0.211 3.421 8.877",
              translationText: "표 데이터 번역",
              sourceBounds: { left: 0.1, top: 0.2, width: 0.7, height: 0.12 }
            }
          ]
        }
      ]
    });

    expect(html).toContain("표 데이터 번역");
    expect(html).toContain('title="p1-table"');
  });

  it("renders numeric table-like segments as source-image snippets in paper mode", () => {
    const html = buildBilingualDocumentHtml({
      title: "Paper",
      sourceLanguageLabel: "English",
      targetLanguageLabel: "Korean",
      exportMode: "paper",
      showSourceHighlights: true,
      pages: [
        {
          pageNumber: 1,
          sourcePageImageDataUrl: "data:image/png;base64,abc123",
          sourcePageWidth: 612,
          sourcePageHeight: 792,
          segments: [
            {
              id: "p1-body",
              sourceText: "The model improves animation quality while keeping runtime practical.",
              translationText: "모델은 실행 시간을 실용적으로 유지하면서 애니메이션 품질을 개선한다.",
              sourceBounds: { left: 0.1, top: 0.1, width: 0.62, height: 0.05 }
            },
            {
              id: "p1-table",
              sourceText:
                "Methods R-Precision Top-1 ↑ Top-2 ↑ Top-3 ↑ FID ↓ MM-Dist ↓ Diversity Ours 0.512 0.703 0.799 0.087 2.998 9.211 Baseline 0.421 0.601 0.702 0.211 3.421 8.877",
              translationText: "표 데이터 번역",
              sourceBounds: { left: 0.1, top: 0.2, width: 0.7, height: 0.12 }
            }
          ]
        }
      ]
    });

    expect(html).toContain("애니메이션 품질을 개선한다");
    expect(html).toContain('title="p1-body"');
    expect(html).not.toContain("표 데이터 번역");
    expect(html).toContain('class="paper-source-snippet"');
    expect(html).toContain('title="p1-table"');
    expect(html).toContain("--clip-page-width:");
  });

  it("does not let short translated text inherit an oversized source block height", () => {
    const html = buildBilingualDocumentHtml({
      title: "Paper",
      sourceLanguageLabel: "English",
      targetLanguageLabel: "Korean",
      pages: [
        {
          pageNumber: 1,
          sourcePageImageDataUrl: "data:image/png;base64,abc123",
          sourcePageWidth: 612,
          sourcePageHeight: 792,
          segments: [
            {
              id: "p1-short-translation",
              sourceText:
                "This source paragraph is visually tall because it came from a loose layout area on the source page.",
              translationText: "짧은 번역.",
              sourceBounds: { left: 0.1, top: 0.1, width: 0.62, height: 0.35 }
            }
          ]
        }
      ]
    });

    expect(html).toContain("짧은 번역.");
    expect(html).not.toContain("height:35%");
  });

  it("does not let a full-width paper table collapse following two-column blocks", () => {
    const html = buildBilingualDocumentHtml({
      title: "Paper",
      sourceLanguageLabel: "English",
      targetLanguageLabel: "Korean",
      exportMode: "paper",
      showPageChrome: true,
      pages: [
        {
          pageNumber: 1,
          sourcePageImageDataUrl: "data:image/png;base64,abc123",
          sourcePageWidth: 612,
          sourcePageHeight: 792,
          segments: [
            {
              id: "wide-table",
              sourceText:
                "Rows Col A Col B Col C 0.512 0.703 0.799 0.087 2.998 9.211 0.421 0.601 0.702 0.211 3.421 8.877",
              translationText: "table translation should not render",
              sourceBounds: { left: 0.18, top: 0.08, width: 0.61, height: 0.12 }
            },
            {
              id: "wide-caption",
              sourceText: "Table 4. Ablation study of the proposed model.",
              translationText: "Table 4 caption translation.",
              sourceBounds: { left: 0.08, top: 0.22, width: 0.82, height: 0.035 }
            },
            {
              id: "left-heading",
              sourceText: "Appendix",
              translationText: "Appendix translation.",
              sourceBounds: { left: 0.08, top: 0.36, width: 0.14, height: 0.035 }
            },
            {
              id: "left-body",
              sourceText:
                "In this appendix, we present several additional ablation studies and implementation details for the proposed model.",
              translationText: "Left column appendix translation should stay inside the left column.",
              sourceBounds: { left: 0.08, top: 0.42, width: 0.34, height: 0.14 }
            },
            {
              id: "right-body",
              sourceText:
                "In this section, we describe the influence of the reconstruction loss and summarize the observed results.",
              translationText: "Right column translation should stay inside the right column.",
              sourceBounds: { left: 0.56, top: 0.42, width: 0.34, height: 0.14 }
            }
          ]
        }
      ]
    });

    expect(html).toContain('class="paper-source-snippet"');
    expect(html).not.toContain("table translation should not render");
    expect(html).toMatch(/data-segment-id="left-body"[^>]+width:34%/);
    expect(html).toMatch(/data-segment-id="right-body"[^>]+width:34%/);
  });

  it("still translates plain table captions in paper mode", () => {
    const html = buildBilingualDocumentHtml({
      title: "Paper",
      sourceLanguageLabel: "English",
      targetLanguageLabel: "Korean",
      exportMode: "paper",
      pages: [
        {
          pageNumber: 1,
          sourcePageImageDataUrl: "data:image/png;base64,abc123",
          sourcePageWidth: 612,
          sourcePageHeight: 792,
          segments: [
            {
              id: "p1-caption",
              sourceText: "Table 3. Analysis of quantizer choices in the proposed model.",
              translationText: "표 3. 제안 모델의 양자화 선택 분석.",
              sourceBounds: { left: 0.12, top: 0.32, width: 0.48, height: 0.035 }
            }
          ]
        }
      ]
    });

    expect(html).toContain("표 3. 제안 모델의 양자화 선택 분석.");
  });

  it("keeps figure captions with metrics translatable in paper mode", () => {
    const html = buildBilingualDocumentHtml({
      title: "Paper",
      sourceLanguageLabel: "English",
      targetLanguageLabel: "Korean",
      exportMode: "paper",
      pages: [
        {
          pageNumber: 1,
          sourcePageImageDataUrl: "data:image/png;base64,abc123",
          sourcePageWidth: 612,
          sourcePageHeight: 792,
          segments: [
            {
              id: "p1-figure-caption",
              sourceText:
                "Figure 5. Impact of dataset size. We report FID, MM-Dist, Top-1, and Top-3 accuracy for all models trained on 10%, 20%, 50%, and 100% subsets.",
              translationText: "그림 5. 데이터셋 크기의 영향.",
              sourceBounds: { left: 0.12, top: 0.32, width: 0.48, height: 0.08 }
            }
          ]
        }
      ]
    });

    expect(html).toContain("그림 5. 데이터셋 크기의 영향.");
  });

  it("keeps prose with equation symbols translatable in paper mode", () => {
    const html = buildBilingualDocumentHtml({
      title: "Paper",
      sourceLanguageLabel: "English",
      targetLanguageLabel: "Korean",
      exportMode: "paper",
      pages: [
        {
          pageNumber: 1,
          sourcePageImageDataUrl: "data:image/png;base64,abc123",
          sourcePageWidth: 612,
          sourcePageHeight: 792,
          segments: [
            {
              id: "p1-symbol-prose",
              sourceText:
                "Compared to τ ∈ U [0, 1], τ = 0.5 is preferable because it achieves comparable Top-1 accuracy but much better FID for this dataset.",
              translationText: "τ = 0.5가 더 적합하다.",
              sourceBounds: { left: 0.12, top: 0.32, width: 0.48, height: 0.08 }
            }
          ]
        }
      ]
    });

    expect(html).toContain("τ = 0.5가 더 적합하다.");
  });
});
