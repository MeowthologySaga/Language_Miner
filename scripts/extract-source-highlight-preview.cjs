const fs = require("node:fs");
const path = require("node:path");

const [, , htmlPathArg, metaPathArg, outDirArg, prefixArg] = process.argv;

if (!htmlPathArg || !metaPathArg || !outDirArg || !prefixArg) {
  throw new Error(
    "Usage: node scripts/extract-source-highlight-preview.cjs <htmlPath> <metaPath> <outDir> <prefix>"
  );
}

const htmlPath = path.resolve(htmlPathArg);
const metaPath = path.resolve(metaPathArg);
const outDir = path.resolve(outDirArg);
const prefix = prefixArg.replace(/[^a-z0-9_-]+/gi, "-");

const html = fs.readFileSync(htmlPath, "utf8");
const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
fs.mkdirSync(outDir, { recursive: true });

const sections = html
  .split(/<section class="page"[^>]*>/)
  .slice(1)
  .map((section) => section.split("</section>")[0]);

const outputs = sections.flatMap((section, sectionIndex) => {
  const pageNumber = meta.pages?.[sectionIndex]?.pageNumber ?? sectionIndex + 1;
  const sourceFrameStart = section.indexOf('<div class="source-page-frame');
  const translatedColumnStart = section.indexOf('<div class="translated-page-column"', sourceFrameStart);
  if (sourceFrameStart < 0 || translatedColumnStart < 0) {
    return [];
  }

  const pageStyle = section.match(/style="([^"]*--source-page-width:[^"]+)"/)?.[1] ?? "";
  const pageWidth = parseStylePt(pageStyle, "--source-page-width") ?? 612;
  const pageHeight = parseStylePt(pageStyle, "--source-page-height") ?? 792;
  const sourceBlock = section.slice(sourceFrameStart, translatedColumnStart);
  const imageSource = sourceBlock.match(/<img src="([^"]+)"/)?.[1];
  if (!imageSource) {
    return [];
  }

  const highlights = [...sourceBlock.matchAll(/<span class="source-highlight" title="([^"]*)" style="([^"]*)"><\/span>/g)]
    .map((match, index) => {
      const style = parseInlineStyle(match[2]);
      const color = style["--segment-color"] ?? "#ec4899";
      return {
        id: decodeHtml(match[1]),
        index,
        color,
        left: parsePercent(style.left, pageWidth),
        top: parsePercent(style.top, pageHeight),
        width: parsePercent(style.width, pageWidth),
        height: parsePercent(style.height, pageHeight)
      };
    })
    .filter((highlight) =>
      [highlight.left, highlight.top, highlight.width, highlight.height].every(Number.isFinite)
    );

  const svg = buildSourcePreviewSvg({
    pageNumber,
    pageWidth,
    pageHeight,
    imageSource,
    highlights
  });
  const fileName = `${prefix}-page-${String(pageNumber).padStart(3, "0")}-source.svg`;
  const filePath = path.join(outDir, fileName);
  fs.writeFileSync(filePath, svg);
  return [filePath];
});

console.log(JSON.stringify({ count: outputs.length, outputs }, null, 2));

function buildSourcePreviewSvg(input) {
  const labelHeight = 28;
  const totalHeight = input.pageHeight + labelHeight;
  const rects = input.highlights
    .map(
      (highlight) => `<g>
  <rect x="${fmt(highlight.left)}" y="${fmt(highlight.top + labelHeight)}" width="${fmt(
    highlight.width
  )}" height="${fmt(highlight.height)}" rx="2" fill="${highlight.color}" fill-opacity="0.12" stroke="${
    highlight.color
  }" stroke-width="1.2" />
</g>`
    )
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(input.pageWidth)}" height="${fmt(
    totalHeight
  )}" viewBox="0 0 ${fmt(input.pageWidth)} ${fmt(totalHeight)}">
  <rect x="0" y="0" width="${fmt(input.pageWidth)}" height="${fmt(totalHeight)}" fill="#f3f4f6" />
  <text x="8" y="18" font-family="Arial, sans-serif" font-size="12" font-weight="700" fill="#111827">Source page ${
    input.pageNumber
  } - highlight preview</text>
  <image href="${input.imageSource}" x="0" y="${labelHeight}" width="${fmt(
    input.pageWidth
  )}" height="${fmt(input.pageHeight)}" preserveAspectRatio="none" />
${rects}
</svg>`;
}

function parseStylePt(style, name) {
  const match = style.match(new RegExp(`${escapeRegExp(name)}:([0-9.]+)pt`));
  return match ? Number(match[1]) : undefined;
}

function parseInlineStyle(style) {
  return Object.fromEntries(
    style
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf(":");
        if (separator < 0) {
          return [part, ""];
        }

        return [part.slice(0, separator), part.slice(separator + 1)];
      })
  );
}

function parsePercent(value, size) {
  const percent = Number(String(value ?? "").replace("%", ""));
  return (percent / 100) * size;
}

function decodeHtml(value) {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fmt(value) {
  return String(Math.round(value * 1000) / 1000);
}
