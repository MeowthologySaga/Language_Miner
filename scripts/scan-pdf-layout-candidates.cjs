const fs = require("node:fs");
const path = require("node:path");

const [, , pdfPathArg, outPathArg] = process.argv;

if (!pdfPathArg) {
  throw new Error("Usage: node scripts/scan-pdf-layout-candidates.cjs <pdfPath> [outJson]");
}

const pdfPath = path.resolve(pdfPathArg);
const outPath = outPathArg ? path.resolve(outPathArg) : "";

if (!fs.existsSync(pdfPath)) {
  throw new Error(`PDF not found: ${pdfPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfData = new Uint8Array(fs.readFileSync(pdfPath));
  const pdfDocument = await pdfjsLib.getDocument({
    data: pdfData,
    disableWorker: true
  }).promise;
  const OPS = pdfjsLib.OPS;
  const imageOps = new Set(
    [
      OPS.paintImageXObject,
      OPS.paintInlineImageXObject,
      OPS.paintJpegXObject,
      OPS.paintImageMaskXObject,
      OPS.paintImageMaskXObjectGroup,
      OPS.paintImageXObjectRepeat,
      OPS.paintImageMaskXObjectRepeat,
      OPS.paintInlineImageXObjectGroup
    ].filter(Number.isFinite)
  );
  const pageScores = [];

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber);
    const [operatorList, textContent] = await Promise.all([
      page.getOperatorList(),
      page.getTextContent()
    ]);
    let imageOpCount = 0;
    let pathOpCount = 0;
    let textOpCount = 0;
    operatorList.fnArray.forEach((fn) => {
      if (imageOps.has(fn)) {
        imageOpCount += 1;
      }
      if (
        fn === OPS.constructPath ||
        fn === OPS.stroke ||
        fn === OPS.fill ||
        fn === OPS.fillStroke ||
        fn === OPS.eoFill ||
        fn === OPS.eoFillStroke
      ) {
        pathOpCount += 1;
      }
      if (fn === OPS.showText || fn === OPS.showSpacedText) {
        textOpCount += 1;
      }
    });

    const text = textContent.items
      .map((item) => item.str ?? "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const tableKeywords = (text.match(/\b(Table|Tab\.|Algorithm|Dataset|AUC|FID|R-Precision|Accuracy|Ours)\b/gi) ?? [])
      .length;
    const figureKeywords = (text.match(/\b(Figure|Fig\.|Graph|Chart|Plot|Results?)\b/gi) ?? [])
      .length;
    const score =
      imageOpCount * 8 +
      Math.min(pathOpCount, 200) * 0.18 +
      tableKeywords * 3 +
      figureKeywords * 2 +
      Math.min(textContent.items.length, 120) * 0.02;

    pageScores.push({
      pageNumber,
      score: Math.round(score * 100) / 100,
      imageOpCount,
      pathOpCount,
      textOpCount,
      textItemCount: textContent.items.length,
      textLength: text.length,
      tableKeywords,
      figureKeywords,
      preview: text.slice(0, 180)
    });
  }

  const result = {
    sourcePdf: pdfPath,
    pageCount: pdfDocument.numPages,
    candidates: [...pageScores]
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.imageOpCount - left.imageOpCount ||
          right.pathOpCount - left.pathOpCount
      )
      .slice(0, 12),
    pages: pageScores
  };

  const text = JSON.stringify(result, null, 2);
  if (outPath) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, text, "utf8");
  }

  console.log(text);
}
