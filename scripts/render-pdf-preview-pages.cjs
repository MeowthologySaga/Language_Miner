const fs = require("node:fs");
const path = require("node:path");
const { createCanvas } = require("@napi-rs/canvas");

function parseArgs(argv) {
  const options = {
    pdfPath: "",
    outputDir: path.resolve("debug", "reports"),
    outputPrefix: "pdf-preview",
    maxPages: 8,
    scale: 1.35
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--pdf" && next) {
      options.pdfPath = next;
      index += 1;
    } else if (arg === "--out-dir" && next) {
      options.outputDir = next;
      index += 1;
    } else if (arg === "--prefix" && next) {
      options.outputPrefix = next;
      index += 1;
    } else if (arg === "--max-pages" && next) {
      options.maxPages = Math.max(1, Number.parseInt(next, 10) || options.maxPages);
      index += 1;
    } else if (arg === "--scale" && next) {
      options.scale = Math.max(0.5, Number.parseFloat(next) || options.scale);
      index += 1;
    }
  }

  if (!options.pdfPath && argv[0] && !argv[0].startsWith("--")) {
    options.pdfPath = argv[0];
  }

  return options;
}

function sampleNonWhiteRatio(canvas) {
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const stepX = Math.max(1, Math.floor(width / 160));
  const stepY = Math.max(1, Math.floor(height / 120));
  const data = context.getImageData(0, 0, width, height).data;
  let sampleCount = 0;
  let nonWhiteCount = 0;

  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const offset = (y * width + x) * 4;
      const red = data[offset];
      const green = data[offset + 1];
      const blue = data[offset + 2];
      const alpha = data[offset + 3];
      sampleCount += 1;
      if (alpha > 0 && (red < 248 || green < 248 || blue < 248)) {
        nonWhiteCount += 1;
      }
    }
  }

  return sampleCount > 0 ? nonWhiteCount / sampleCount : 0;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.pdfPath) {
    throw new Error("Usage: node scripts/render-pdf-preview-pages.cjs --pdf <pdfPath>");
  }
  if (!fs.existsSync(options.pdfPath)) {
    throw new Error(`PDF not found: ${options.pdfPath}`);
  }

  fs.mkdirSync(options.outputDir, { recursive: true });
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfData = new Uint8Array(fs.readFileSync(options.pdfPath));
  const pdfDocument = await pdfjsLib.getDocument({
    data: pdfData,
    disableWorker: true
  }).promise;
  const pageCount = Math.min(pdfDocument.numPages, options.maxPages);
  const previews = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: options.scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const canvasContext = canvas.getContext("2d");
    await page.render({ canvasContext, viewport }).promise;
    const pngPath = path.join(
      options.outputDir,
      `${options.outputPrefix}-page-${String(pageNumber).padStart(2, "0")}.png`
    );
    fs.writeFileSync(pngPath, canvas.toBuffer("image/png"));
    previews.push({
      pageNumber,
      pngPath,
      width: canvas.width,
      height: canvas.height,
      nonWhiteRatio: Math.round(sampleNonWhiteRatio(canvas) * 10000) / 10000
    });
  }

  const metaPath = path.join(options.outputDir, `${options.outputPrefix}-preview-meta.json`);
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        sourcePdf: path.resolve(options.pdfPath),
        renderedPageCount: pageCount,
        totalPdfPages: pdfDocument.numPages,
        scale: options.scale,
        previews
      },
      null,
      2
    ),
    "utf8"
  );

  console.log(JSON.stringify({ metaPath, previews }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
