const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const AdmZip = require("adm-zip");
const officialGames = require("./official-game-assets.cjs");
const {
  isExpectedArchive,
  verifyExtractedPack
} = require("./hydrate-official-games.cjs");

const repoRoot = path.resolve(__dirname, "..", "..");
const outputRoot = path.join(repoRoot, "artifacts", "release");
process.on("uncaughtException", (error) => {
  process.stderr.write(`Official game packaging failed: ${safeError(error)}\n`);
  process.exitCode = 1;
});
const packs = officialGames;
const requestedFolder = parsePackOption(process.argv.slice(2));
const selectedPacks = requestedFolder ? packs.filter((pack) => pack.folder === requestedFolder) : packs;
if (requestedFolder && selectedPacks.length !== 1) {
  throw new Error(`Unknown official game pack: ${requestedFolder}`);
}

fs.mkdirSync(outputRoot, { recursive: true });
const outputRootStat = fs.lstatSync(outputRoot);
if (!outputRootStat.isDirectory() || outputRootStat.isSymbolicLink()) {
  throw new Error("Official game package output must be a real directory.");
}

const results = selectedPacks.map((pack) => {
  const sourceRoot = path.join(repoRoot, "cartridges", pack.folder);
  if (!fs.existsSync(sourceRoot)) {
    throw new Error(
      `Official game source is missing: ${pack.folder}. Run games:hydrate-official first.`
    );
  }
  verifyExtractedPack(sourceRoot, pack);
  const manifest = JSON.parse(fs.readFileSync(path.join(sourceRoot, "manifest.json"), "utf8"));
  if (manifest.id !== pack.id || manifest.version !== pack.version) {
    throw new Error(`Official game identity mismatch: ${pack.folder}`);
  }

  const zip = new AdmZip();
  const files = listFiles(sourceRoot);
  // AdmZip serializes DOS timestamps through local-time getters. Use an explicit local
  // clock value so packaging stays byte-identical in UTC and Asia/Seoul.
  const lockedArchiveTime = new Date(1980, 0, 1, 9, 0, 0, 0);
  for (const relativePath of files) {
    const absolutePath = path.join(sourceRoot, ...relativePath.split("/"));
    zip.addFile(relativePath, fs.readFileSync(absolutePath));
    const entry = zip.getEntry(relativePath);
    if (entry) entry.header.time = lockedArchiveTime;
  }

  const fileName = pack.fileName;
  const outputPath = path.join(outputRoot, fileName);
  const contents = zip.toBuffer();
  const sha256 = crypto.createHash("sha256").update(contents).digest("hex");
  if (contents.length !== pack.bytes || sha256 !== pack.archiveSha256) {
    throw new Error(`Official game archive no longer matches the locked release: ${fileName}`);
  }
  if (!isExpectedArchive(outputPath, pack)) {
    replaceFileSafely(outputPath, contents);
  }
  if (!isExpectedArchive(outputPath, pack)) {
    throw new Error(`Official game archive failed its final verification: ${fileName}`);
  }
  return {
    id: manifest.id,
    version: manifest.version,
    fileName,
    bytes: contents.length,
    sha256,
    fileCount: files.length
  };
});

console.log(JSON.stringify(results, null, 2));

function listFiles(rootPath) {
  const files = [];
  walk(rootPath, "", files);
  return files.sort((left, right) => left.localeCompare(right, "en"));
}

function parsePackOption(args) {
  if (args.length === 0) return undefined;
  if (args.length === 1 && args[0].startsWith("--pack=")) {
    const value = args[0].slice("--pack=".length);
    if (value) return value;
  }
  if (args.length === 2 && args[0] === "--pack" && args[1] && !args[1].startsWith("-")) {
    return args[1];
  }
  throw new Error("Usage: node package-official-games.cjs [--pack <official-game-folder>]");
}

function walk(rootPath, relativeRoot, files) {
  const directoryPath = relativeRoot
    ? path.join(rootPath, ...relativeRoot.split("/"))
    : rootPath;
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Official game contains a symbolic link: ${entry.name}`);
    const relativePath = relativeRoot ? `${relativeRoot}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      walk(rootPath, relativePath, files);
    } else if (entry.isFile()) {
      files.push(relativePath.replace(/\\/g, "/"));
    }
  }
}

function replaceFileSafely(outputPath, contents) {
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  const backupPath = `${outputPath}.backup-${process.pid}`;
  fs.rmSync(temporaryPath, { force: true });
  fs.rmSync(backupPath, { force: true });
  fs.writeFileSync(temporaryPath, contents, { flag: "wx" });
  if (!fs.existsSync(outputPath)) {
    fs.renameSync(temporaryPath, outputPath);
    return;
  }
  const outputStat = fs.lstatSync(outputPath);
  if (!outputStat.isFile() && !outputStat.isSymbolicLink()) {
    fs.rmSync(temporaryPath, { force: true });
    throw new Error("Refusing to replace a non-file official game archive path.");
  }
  fs.renameSync(outputPath, backupPath);
  try {
    fs.renameSync(temporaryPath, outputPath);
  } catch (error) {
    fs.renameSync(backupPath, outputPath);
    throw error;
  } finally {
    fs.rmSync(temporaryPath, { force: true });
  }
  fs.rmSync(backupPath, { force: true });
}

function safeError(error) {
  const message = error instanceof Error && error.message
    ? error.message
    : "Official game packaging failed.";
  const sensitiveRoots = [repoRoot, process.env.USERPROFILE, process.env.HOME]
    .filter((value) => typeof value === "string" && value.length >= 6)
    .flatMap((value) => [value, value.replace(/\\/g, "/"), value.replace(/\//g, "\\")]);
  return sensitiveRoots.reduce(
    (safeMessage, sensitiveRoot) => safeMessage.replaceAll(sensitiveRoot, "[LOCAL PATH REDACTED]"),
    message
  );
}
