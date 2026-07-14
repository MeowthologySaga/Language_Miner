const fs = require("node:fs");
const path = require("node:path");
const { createCanvas } = require("@napi-rs/canvas");
const {
  buildBilingualDocumentHtml,
  getBilingualDocumentStats,
  shouldPreservePaperPdfSegment
} = require("../dist-electron/src/shared/bilingualExport.js");
const {
  translatePdfSegmentsWithLocalOllama
} = require("../dist-electron/electron/translationService.js");
const {
  buildPdfTranslationContext
} = require("../dist-electron/src/shared/pdfTranslationContext.js");
const {
  PDF_SEGMENT_TRANSLATION_PROMPT_VERSION
} = require("../dist-electron/src/shared/translationPrompts.js");

const repoRoot = path.resolve(__dirname, "..");
const outputDir = path.join(repoRoot, "debug", "reports");
const defaultPdfPath = process.env.LM_SAMPLE_PDF_PATH || path.join(repoRoot, "fixtures", "sample.pdf");
const defaultPages = [3, 8, 12, 48, 85, 195];
const exportPageImageMinWidth = 1600;
const exportPageImageMaxScale = 2.6;

function parseArgs(argv) {
  const options = {
    pdfPath: defaultPdfPath,
    pages: defaultPages,
    baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    model: process.env.OLLAMA_MODEL || "gemma4:12b",
    outputBaseName: "bilingual-pdf-output-sample",
    showSourceHighlights: true,
    exportMode: "reading",
    translationFixturePath: undefined,
    useMockTranslations: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--pdf" && next) {
      options.pdfPath = next;
      index += 1;
    } else if (arg === "--pages" && next) {
      options.pages = next
        .split(",")
        .map((value) => Number.parseInt(value.trim(), 10))
        .filter((value) => Number.isInteger(value) && value > 0);
      index += 1;
    } else if (arg === "--base-url" && next) {
      options.baseUrl = next;
      index += 1;
    } else if (arg === "--model" && next) {
      options.model = next;
      index += 1;
    } else if (arg === "--output" && next) {
      options.outputBaseName = next;
      index += 1;
    } else if (arg === "--translation-fixture" && next) {
      options.translationFixturePath = next;
      index += 1;
    } else if (arg === "--hide-source-highlights") {
      options.showSourceHighlights = false;
    } else if (arg === "--paper") {
      options.exportMode = "paper";
    } else if (arg === "--mock") {
      options.useMockTranslations = true;
    }
  }

  return options;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundRectNumber(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function normalizeRect(rect) {
  const left = clamp(rect.left, 0, 1);
  const top = clamp(rect.top, 0, 1);
  const right = clamp(rect.left + rect.width, 0, 1);
  const bottom = clamp(rect.top + rect.height, 0, 1);

  return {
    left: roundRectNumber(left),
    top: roundRectNumber(top),
    width: roundRectNumber(Math.max(0, right - left)),
    height: roundRectNumber(Math.max(0, bottom - top))
  };
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function getTextItemBounds(pdfjsLib, item, viewport, style) {
  const transformed = pdfjsLib.Util.transform(viewport.transform, item.transform);
  const rawWidth = Math.abs(item.width) || Math.abs(transformed[0]) || 1;
  const fontHeight = Math.hypot(transformed[2], transformed[3]) || Math.abs(item.height) || 1;
  const rawHeight = getTextItemVisualHeight(fontHeight, style);
  const left = transformed[4] / viewport.width;
  const top = getTextItemTop(transformed[5], fontHeight, rawHeight, style) / viewport.height;
  const width = rawWidth / viewport.width;
  const height = rawHeight / viewport.height;

  if (![left, top, width, height].every(Number.isFinite)) {
    return undefined;
  }

  return normalizeRect({ left, top, width, height });
}

function getTextItemTop(baselineY, fontHeight, visualHeight, style) {
  if (style && style.vertical) {
    return baselineY - visualHeight;
  }

  if (isFiniteNumber(style && style.ascent)) {
    return baselineY - fontHeight * style.ascent;
  }

  if (isFiniteNumber(style && style.descent)) {
    return baselineY - fontHeight * (1 + style.descent);
  }

  return baselineY - visualHeight;
}

function getTextItemVisualHeight(fontHeight, style) {
  if (style && style.vertical) {
    return fontHeight;
  }

  if (isFiniteNumber(style && style.ascent) && isFiniteNumber(style && style.descent)) {
    return fontHeight * clamp(style.ascent - style.descent, 0.55, 1.25);
  }

  return fontHeight;
}

function buildTransformLayoutItems(pdfjsLib, textContent, viewport) {
  const textItems = [];
  textContent.items.forEach((item) => {
    if (
      !item ||
      typeof item.str !== "string" ||
      !Array.isArray(item.transform)
    ) {
      return;
    }

    const itemText = item.str.replace(/\s+/g, " ").trim();
    const bounds = getTextItemBounds(
      pdfjsLib,
      item,
      viewport,
      item.fontName ? textContent.styles[item.fontName] : undefined
    );
    if (!itemText || !bounds || bounds.width <= 0 || bounds.height <= 0) {
      return;
    }

    textItems.push({
      text: itemText,
      bounds
    });
  });

  return textItems;
}

function buildPdfPageTextFromLayoutItems(items) {
  const layoutItems = [];
  let text = "";
  let previous;
  let currentLineLeft;

  items.forEach((rawItem) => {
    const itemText = rawItem.text.replace(/\s+/g, " ").trim();
    const bounds = normalizeRect(rawItem.bounds);
    if (!itemText || bounds.width <= 0 || bounds.height <= 0) {
      return;
    }

    const item = { text: itemText, bounds };
    const sameLine = previous ? areItemsOnSameLine(previous.bounds, item.bounds) : false;
    const separator = getTextItemSeparator(previous, item, currentLineLeft);
    if (separator === "dehyphenate") {
      text = text.replace(/-\s*$/, "");
      const lastLayoutItem = layoutItems[layoutItems.length - 1];
      if (lastLayoutItem) {
        lastLayoutItem.endOffset = Math.min(lastLayoutItem.endOffset, text.length);
      }
    } else {
      text += separator;
    }

    const startOffset = text.length;
    text += item.text;
    layoutItems.push({
      startOffset,
      endOffset: text.length,
      bounds: item.bounds
    });

    if (!previous || !sameLine) {
      currentLineLeft = item.bounds.left;
    } else {
      currentLineLeft = Math.min(currentLineLeft || item.bounds.left, item.bounds.left);
    }
    previous = item;
  });

  return { text, layoutItems };
}

function segmentPdfPageText(input) {
  const normalizedText = normalizePdfPageText(input.text);
  if (!normalizedText) {
    return [];
  }

  const maxSegmentLength = input.maxSegmentLength || 900;
  const segmentTexts = splitIntoSegmentTexts(normalizedText, maxSegmentLength);
  return segmentTexts.map((text, index) => ({
    id: `p${input.pageNumber}-s${String(index + 1).padStart(3, "0")}-${hashText(text).slice(0, 6)}`,
    pageNumber: input.pageNumber,
    index,
    text
  }));
}

function attachSegmentBounds(input) {
  let searchStart = 0;

  return input.segments.map((segment) => {
    const segmentStart = input.pageText.indexOf(segment.text, searchStart);
    if (segmentStart < 0) {
      return segment;
    }

    const segmentEnd = segmentStart + segment.text.length;
    searchStart = segmentEnd;
    const overlappingBounds = input.layoutItems.flatMap((item) => {
      const bounds = getSegmentItemOverlapBounds(item, segmentStart, segmentEnd);
      return bounds ? [bounds] : [];
    });
    const sourceBounds = mergeBounds(overlappingBounds);
    const sourceLineBounds = mergeBoundsByLine(overlappingBounds);

    return sourceBounds ? { ...segment, sourceBounds, sourceLineBounds } : segment;
  });
}

function getSegmentItemOverlapBounds(item, segmentStart, segmentEnd) {
  const overlapStart = Math.max(item.startOffset, segmentStart);
  const overlapEnd = Math.min(item.endOffset, segmentEnd);
  if (overlapStart >= overlapEnd) {
    return undefined;
  }

  const itemLength = item.endOffset - item.startOffset;
  if (itemLength <= 0) {
    return undefined;
  }

  const startRatio = clamp((overlapStart - item.startOffset) / itemLength, 0, 1);
  const endRatio = clamp((overlapEnd - item.startOffset) / itemLength, startRatio, 1);
  return normalizeRect({
    left: item.bounds.left + item.bounds.width * startRatio,
    top: item.bounds.top,
    width: item.bounds.width * (endRatio - startRatio),
    height: item.bounds.height
  });
}

function mergeBounds(bounds) {
  if (bounds.length === 0) {
    return undefined;
  }

  const left = Math.min(...bounds.map((bound) => bound.left));
  const top = Math.min(...bounds.map((bound) => bound.top));
  const right = Math.max(...bounds.map((bound) => bound.left + bound.width));
  const bottom = Math.max(...bounds.map((bound) => bound.top + bound.height));
  return normalizeRect({ left, top, width: right - left, height: bottom - top });
}

function mergeBoundsByLine(bounds) {
  if (bounds.length === 0) {
    return undefined;
  }

  const sortedBounds = [...bounds].sort((left, right) => {
    const lineDelta = left.top - right.top;
    return Math.abs(lineDelta) > 0.004 ? lineDelta : left.left - right.left;
  });
  const lines = [];

  sortedBounds.forEach((bound) => {
    const currentLine = lines[lines.length - 1];
    const previousBound = currentLine && currentLine[currentLine.length - 1];
    if (currentLine && previousBound && areItemsOnSameLine(previousBound, bound)) {
      currentLine.push(bound);
      return;
    }

    lines.push([bound]);
  });

  return lines.flatMap((line) => {
    const merged = mergeBounds(line);
    return merged ? [merged] : [];
  });
}

function normalizePdfPageText(text) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/-\n\s*/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function splitIntoSegmentTexts(text, maxSegmentLength) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (paragraphs.length > 1) {
    return paragraphs.flatMap((paragraph) =>
      groupTextUnits(splitLongParagraph(paragraph, maxSegmentLength), maxSegmentLength)
    );
  }

  return groupTextUnits(
    splitLongParagraph(text.replace(/\s+/g, " ").trim(), maxSegmentLength),
    maxSegmentLength
  );
}

function splitLongParagraph(text, maxSegmentLength) {
  if (text.length <= maxSegmentLength) {
    return [text];
  }

  return text
    .split(/(?<=[.!?;:)"'\]])\s+(?=["'(\[]?[A-Z0-9])/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function groupTextUnits(units, maxSegmentLength) {
  const segments = [];
  let current = "";

  units.forEach((unit) => {
    if (!current) {
      current = unit;
      return;
    }

    if (`${current} ${unit}`.length <= maxSegmentLength) {
      current = `${current} ${unit}`;
      return;
    }

    segments.push(current);
    current = unit;
  });

  if (current) {
    segments.push(current);
  }

  return segments.flatMap((segment) => splitOversizedSegment(segment, maxSegmentLength));
}

function splitOversizedSegment(segment, maxSegmentLength) {
  if (segment.length <= maxSegmentLength) {
    return [segment];
  }

  const chunks = [];
  for (let start = 0; start < segment.length; start += maxSegmentLength) {
    chunks.push(segment.slice(start, start + maxSegmentLength).trim());
  }
  return chunks.filter(Boolean);
}

function hashText(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function getTextItemSeparator(previous, current, previousLineLeft) {
  if (!previous) {
    return "";
  }

  if (areItemsOnSameLine(previous.bounds, current.bounds)) {
    return shouldInsertTextSpace(previous.text, current.text) ? " " : "";
  }

  if (shouldDehyphenateLineBreak(previous.text, current.text)) {
    return "dehyphenate";
  }

  return isParagraphBreak(previous, current, previousLineLeft) ? "\n\n" : " ";
}

function areItemsOnSameLine(previous, current) {
  const previousCenter = previous.top + previous.height / 2;
  const currentCenter = current.top + current.height / 2;
  const tolerance = Math.max((previous.height + current.height) * 0.35, 0.006);
  return Math.abs(previousCenter - currentCenter) <= tolerance;
}

function isParagraphBreak(previous, current, previousLineLeft) {
  const verticalDelta = current.bounds.top - previous.bounds.top;
  if (verticalDelta < -0.04) {
    return true;
  }

  if (verticalDelta > Math.max(previous.bounds.height * 1.8, 0.026)) {
    return true;
  }

  return isIndentedParagraphStart(previous, current, previousLineLeft);
}

function isIndentedParagraphStart(previous, current, previousLineLeft) {
  if (previousLineLeft === undefined || !endsLikeParagraph(previous.text)) {
    return false;
  }

  const lineHeight = Math.max(previous.bounds.height, current.bounds.height);
  const verticalDelta = current.bounds.top - previous.bounds.top;
  if (verticalDelta < lineHeight * 0.55 || verticalDelta > lineHeight * 1.9) {
    return false;
  }

  return current.bounds.left - previousLineLeft > Math.max(0.018, lineHeight * 0.55);
}

function endsLikeParagraph(text) {
  return /[.!?;:)"']$/.test(text.trim());
}

function shouldDehyphenateLineBreak(previousText, currentText) {
  return /[A-Za-z]-$/.test(previousText) && /^[A-Za-z]/.test(currentText);
}

function shouldInsertTextSpace(previousText, currentText) {
  return !/^[,.;:!?)]/.test(currentText) && !/[(]$/.test(previousText);
}

function getExportPageImageScale(baseWidth) {
  if (!Number.isFinite(baseWidth) || baseWidth <= 0) {
    return 1.8;
  }

  return Math.min(exportPageImageMaxScale, Math.max(1.6, exportPageImageMinWidth / baseWidth));
}

async function renderPageImage(page) {
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = getExportPageImageScale(baseViewport.width);
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
  const canvasContext = canvas.getContext("2d");
  await page.render({ canvasContext, viewport }).promise;
  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: baseViewport.width,
    height: baseViewport.height
  };
}

async function extractPage(pdfjsLib, pdfDocument, pageNumber) {
  const page = await pdfDocument.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const textContent = await page.getTextContent();
  const transformItems = buildTransformLayoutItems(pdfjsLib, textContent, viewport);
  const { text, layoutItems } = buildPdfPageTextFromLayoutItems(transformItems);
  const segments = attachSegmentBounds({
    pageText: text,
    segments: segmentPdfPageText({ pageNumber, text }),
    layoutItems
  });
  const image = await renderPageImage(page);

  return {
    pageNumber,
    text,
    sourcePageImageDataUrl: image.dataUrl,
    sourcePageWidth: image.width,
    sourcePageHeight: image.height,
    segments
  };
}

function readTranslationCache(cachePath) {
  try {
    return JSON.parse(fs.readFileSync(cachePath, "utf8"));
  } catch {
    return { entries: {} };
  }
}

function writeTranslationCache(cachePath, cache) {
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), "utf8");
}

function readTranslationFixture(fixturePath) {
  if (!fixturePath) {
    return {};
  }

  const resolvedFixturePath = path.resolve(repoRoot, fixturePath);
  return JSON.parse(fs.readFileSync(resolvedFixturePath, "utf8"));
}

function getCacheKey(options, context, segment) {
  return [
    "bilingual-output-v1",
    options.model,
    PDF_SEGMENT_TRANSLATION_PROMPT_VERSION,
    context.contextHash,
    segment.id,
    hashText(segment.text)
  ].join(":");
}

function mockTranslate(segment) {
  const text = segment.text.replace(/\s+/g, " ").trim();
  if (text.length <= 96) {
    return text;
  }

  return `[SAMPLE] ${text.slice(0, 360)}`;
}

async function translatePages(pages, options) {
  const allSegments = pages.flatMap((page) =>
    getTranslationSegmentsForExportMode(page.segments, options)
  );
  const translationContext = buildPdfTranslationContext({
    segments: allSegments,
    sourceLang: "en",
    targetLang: "ko"
  });
  const cachePath = path.join(outputDir, `${options.outputBaseName}.translation-cache.json`);
  const cache = readTranslationCache(cachePath);
  const fixtureTranslations = readTranslationFixture(options.translationFixturePath);
  const translatedById = new Map();

  for (const segment of allSegments) {
    const fixtureTranslation = fixtureTranslations[segment.id];
    if (typeof fixtureTranslation === "string" && fixtureTranslation.trim()) {
      translatedById.set(segment.id, fixtureTranslation.trim());
      continue;
    }

    const cacheKey = getCacheKey(options, translationContext, segment);
    const cached = cache.entries[cacheKey];
    if (typeof cached === "string" && cached.trim()) {
      translatedById.set(segment.id, cached.trim());
    }
  }

  for (const page of pages) {
    const pending = getTranslationSegmentsForExportMode(page.segments, options).filter(
      (segment) => !translatedById.has(segment.id)
    );
    if (pending.length === 0) {
      continue;
    }

    if (options.useMockTranslations) {
      for (const segment of pending) {
        translatedById.set(segment.id, mockTranslate(segment));
      }
      continue;
    }

    console.log(`Translating page ${page.pageNumber}: ${pending.length} segments`);
    let translations = await translatePdfSegmentsWithLocalOllama({
      segments: pending,
      sourceLang: "en",
      targetLang: "ko",
      providerName: "local",
      model: options.model,
      promptVersion: PDF_SEGMENT_TRANSLATION_PROMPT_VERSION,
      contextHash: translationContext.contextHash,
      ollamaBaseUrl: options.baseUrl,
      ollamaModel: options.model,
      sourceLanguage: { code: "en", nameKo: "English", nameEn: "English" },
      outputLanguage: { code: "ko", nameKo: "Korean", nameEn: "Korean" },
      translationContext
    });

    let translatedIds = new Set(translations.map((translation) => translation.id));
    const missing = pending.filter((segment) => !translatedIds.has(segment.id));
    for (const segment of missing) {
      console.log(`Retrying missing segment ${segment.id}`);
      const retryTranslations = await translatePdfSegmentsWithLocalOllama({
        segments: [segment],
        sourceLang: "en",
        targetLang: "ko",
        providerName: "local",
        model: options.model,
        promptVersion: PDF_SEGMENT_TRANSLATION_PROMPT_VERSION,
        contextHash: translationContext.contextHash,
        ollamaBaseUrl: options.baseUrl,
        ollamaModel: options.model,
        sourceLanguage: { code: "en", nameKo: "English", nameEn: "English" },
        outputLanguage: { code: "ko", nameKo: "Korean", nameEn: "Korean" },
        translationContext
      });
      translations = translations.concat(retryTranslations);
      translatedIds = new Set(translations.map((translation) => translation.id));
    }

    for (const translation of translations) {
      if (!translation.translationKo || !translation.translationKo.trim()) {
        continue;
      }
      translatedById.set(translation.id, translation.translationKo.trim());
      const segment = pending.find((candidate) => candidate.id === translation.id);
      if (segment) {
        cache.entries[getCacheKey(options, translationContext, segment)] =
          translation.translationKo.trim();
      }
    }
    writeTranslationCache(cachePath, cache);
  }

  writeTranslationCache(cachePath, cache);

  return {
    translationContext,
    pages: pages.map((page) => ({
      pageNumber: page.pageNumber,
      sourcePageImageDataUrl: page.sourcePageImageDataUrl,
      sourcePageWidth: page.sourcePageWidth,
      sourcePageHeight: page.sourcePageHeight,
      segments: page.segments.flatMap((segment) => {
        if (options.exportMode === "paper" && shouldPreservePaperPdfSegment(segment)) {
          return [
            {
              id: segment.id,
              sourceText: segment.text,
              translationText: "",
              sourceBounds: segment.sourceBounds,
              sourceLineBounds: segment.sourceLineBounds
            }
          ];
        }

        const translationText = translatedById.get(segment.id);
        if (!translationText) {
          return [];
        }
        return [
          {
            id: segment.id,
            sourceText: segment.text,
            translationText,
            sourceBounds: segment.sourceBounds,
            sourceLineBounds: segment.sourceLineBounds
          }
        ];
      })
    }))
  };
}

function getTranslationSegmentsForExportMode(segments, options) {
  if (options.exportMode !== "paper") {
    return segments;
  }

  return segments.filter((segment) => !shouldPreservePaperPdfSegment(segment));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(options.pdfPath)) {
    throw new Error(`PDF not found: ${options.pdfPath}`);
  }
  if (!fs.existsSync(path.join(repoRoot, "dist-electron", "src", "shared", "bilingualExport.js"))) {
    throw new Error("Built Electron files are missing. Run npm.cmd run build first.");
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfData = new Uint8Array(fs.readFileSync(options.pdfPath));
  const pdfDocument = await pdfjsLib.getDocument({
    data: pdfData,
    disableWorker: true
  }).promise;

  const pages = [];
  for (const pageNumber of options.pages) {
    if (pageNumber > pdfDocument.numPages) {
      console.warn(`Skipping page ${pageNumber}; PDF has ${pdfDocument.numPages} pages.`);
      continue;
    }
    console.log(`Extracting page ${pageNumber}`);
    pages.push(await extractPage(pdfjsLib, pdfDocument, pageNumber));
  }

  const translated = await translatePages(pages, options);
  const exportInput = {
    title: "hobbit-bilingual-output-sample",
    sourceLanguageLabel: "English",
    targetLanguageLabel: "Korean",
    exportMode: options.exportMode,
    includeCoverPage: false,
    showPageChrome: false,
    showSourceHighlights: options.showSourceHighlights,
    pages: translated.pages
  };
  const html = buildBilingualDocumentHtml(exportInput);
  const stats = getBilingualDocumentStats(exportInput);
  const htmlPath = path.join(outputDir, `${options.outputBaseName}.html`);
  const metaPath = path.join(outputDir, `${options.outputBaseName}.meta.json`);

  fs.writeFileSync(htmlPath, html, "utf8");
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        sourcePdf: options.pdfPath,
        model: options.model,
        baseUrl: options.baseUrl,
        promptVersion: PDF_SEGMENT_TRANSLATION_PROMPT_VERSION,
        exportMode: options.exportMode,
        translationFixturePath: options.translationFixturePath,
        contextHash: translated.translationContext.contextHash,
        outputHtml: htmlPath,
        expectedPdfPath: path.join(outputDir, `${options.outputBaseName}.pdf`),
        stats,
        pages: pages.map((page, index) => {
          const translatedPage = translated.pages[index];
          const translatedIds = new Set(
            translatedPage ? translatedPage.segments.map((segment) => segment.id) : []
          );
          const mappedSegments = page.segments.filter((segment) => segment.sourceBounds).length;
          return {
            pageNumber: page.pageNumber,
            sourceSegmentCount: page.segments.length,
            mappedSegmentCount: mappedSegments,
            translatedSegmentCount: translatedPage ? translatedPage.segments.length : 0,
            unmappedSegmentIds: page.segments
              .filter((segment) => !segment.sourceBounds)
              .map((segment) => segment.id),
            missingTranslationSegments: page.segments
              .filter((segment) => !translatedIds.has(segment.id))
              .map((segment) => ({
                id: segment.id,
                sourceText: segment.text,
                sourcePreview: segment.text.slice(0, 260)
              })),
            segmentPreviews: page.segments.map((segment) => ({
              id: segment.id,
              hasBounds: Boolean(segment.sourceBounds),
              wasExported: translatedIds.has(segment.id),
              sourceText: segment.text,
              sourcePreview: segment.text.slice(0, 180)
            }))
          };
        })
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(`Generated ${htmlPath}`);
  console.log(`Generated ${metaPath}`);
  console.log(JSON.stringify({ stats, htmlPath, metaPath }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
