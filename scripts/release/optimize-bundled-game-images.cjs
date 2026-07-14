const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..", "..");
const packRoots = ["abyss-summoner", "cat-odyssey", "drillheart-defense"]
  .map((folder) => path.join(projectRoot, "cartridges", folder));
const textExtensions = new Set([".css", ".html", ".js", ".json", ".md"]);
const apply = process.argv.includes("--apply");

if (!apply) {
  const pngFiles = packRoots.flatMap((root) => collectFiles(root, (file) => path.extname(file).toLowerCase() === ".png"));
  const staleReferences = packRoots.flatMap((root) =>
    collectFiles(root, (file) => textExtensions.has(path.extname(file).toLowerCase()))
      .filter((file) => fs.readFileSync(file, "utf8").toLowerCase().includes(".png"))
  );
  if (pngFiles.length || staleReferences.length) {
    throw new Error(`Bundled WebP optimization is stale (${pngFiles.length} PNG files, ${staleReferences.length} text references).`);
  }
  console.log("Bundled game WebP check passed.");
  process.exit(0);
}

const pngFiles = packRoots.flatMap((root) => collectFiles(
  root,
  (file) => path.extname(file).toLowerCase() === ".png"
));
const beforeBytes = pngFiles.reduce((sum, file) => sum + fs.statSync(file).size, 0);

for (const [index, sourcePath] of pngFiles.entries()) {
  const targetPath = sourcePath.slice(0, -4) + ".webp";
  const temporaryPath = sourcePath.slice(0, -4) + ".optimized.webp";
  const result = spawnSync("ffmpeg", [
    "-nostdin",
    "-hide_banner",
    "-loglevel", "error",
    "-y",
    "-i", sourcePath,
    "-c:v", "libwebp",
    "-q:v", "84",
    "-compression_level", "6",
    "-map_metadata", "-1",
    temporaryPath
  ], {
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true
  });
  if (result.status !== 0 || !fs.existsSync(temporaryPath)) {
    const detail = result.error?.message || result.stderr || "unknown error";
    throw new Error(`WebP conversion failed for ${path.relative(projectRoot, sourcePath)}: ${String(detail).trim()}`);
  }
  fs.renameSync(temporaryPath, targetPath);
  fs.rmSync(sourcePath);
  if ((index + 1) % 50 === 0 || index + 1 === pngFiles.length) {
    console.log(`Converted ${index + 1}/${pngFiles.length} bundled PNG files.`);
  }
}

for (const root of packRoots) {
  for (const filePath of collectFiles(root, (file) => textExtensions.has(path.extname(file).toLowerCase()))) {
    const current = fs.readFileSync(filePath, "utf8");
    const next = current.replace(/\.png\b/gi, ".webp");
    if (next !== current) fs.writeFileSync(filePath, next, "utf8");
  }
}

const webpFiles = packRoots.flatMap((root) => collectFiles(
  root,
  (file) => path.extname(file).toLowerCase() === ".webp"
));
const afterBytes = webpFiles.reduce((sum, file) => sum + fs.statSync(file).size, 0);
console.log(`Bundled image optimization passed: ${formatMiB(beforeBytes)} MiB PNG -> ${formatMiB(afterBytes)} MiB WebP.`);

function collectFiles(rootPath, predicate) {
  const files = [];
  visit(rootPath);
  return files;

  function visit(folderPath) {
    for (const entry of fs.readdirSync(folderPath, { withFileTypes: true })) {
      const filePath = path.join(folderPath, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not allowed: ${filePath}`);
      if (entry.isDirectory()) visit(filePath);
      else if (entry.isFile() && predicate(filePath)) files.push(filePath);
    }
  }
}

function formatMiB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2);
}
