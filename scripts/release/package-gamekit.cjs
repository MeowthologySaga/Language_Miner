"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createZip } = require("./zip-utils.cjs");

const repoRoot = path.resolve(__dirname, "..", "..");
const sourceRoot = path.join(repoRoot, "gamekit");
const runtimeContractPath = path.join(
  repoRoot,
  "docs",
  "ugc",
  "playzone-current-runtime-contract.md"
);
const packageJson = readJson(path.join(repoRoot, "package.json"));
const artifactOutput = path.join(
  repoRoot,
  "artifacts",
  "release",
  `Language-Miner-GameKit-${packageJson.version}.zip`
);
const appOutput = path.join(repoRoot, "public", "playzone", "LanguageMinerGameKit.zip");

if (!fs.existsSync(runtimeContractPath)) {
  throw new Error("Current PlayZone runtime contract is missing.");
}

const entries = walkFiles(sourceRoot).map((absolutePath) => ({
  name: path.relative(sourceRoot, absolutePath).replace(/\\/g, "/"),
  data: fs.readFileSync(absolutePath)
}));
entries.push({
  name: "13_CURRENT_RUNTIME_CONTRACT.md",
  data: fs.readFileSync(runtimeContractPath)
});
entries.push({
  name: "BUILD_INFO.json",
  data: Buffer.from(
    `${JSON.stringify(
      {
        schemaVersion: 1,
        languageMinerVersion: packageJson.version,
        generatedFrom: "gamekit/",
        runtimeContractSource: "docs/ugc/playzone-current-runtime-contract.md"
      },
      null,
      2
    )}\n`,
    "utf8"
  )
});

if (entries.length < 3) throw new Error("GameKit source directory is unexpectedly empty.");
const archive = createZip(entries);
fs.mkdirSync(path.dirname(artifactOutput), { recursive: true });
fs.writeFileSync(artifactOutput, archive);

if (!process.argv.includes("--artifact-only")) {
  fs.mkdirSync(path.dirname(appOutput), { recursive: true });
  fs.writeFileSync(appOutput, archive);
}

process.stdout.write(
  `GameKit package created from audited source: ${path.relative(repoRoot, artifactOutput)} (${entries.length} files).\n`
);

function walkFiles(directory) {
  const results = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    const stats = fs.lstatSync(absolutePath);
    if (stats.isSymbolicLink()) {
      throw new Error(`GameKit source cannot contain symbolic links: ${absolutePath}`);
    }
    if (entry.isDirectory()) results.push(...walkFiles(absolutePath));
    else if (entry.isFile()) {
      if (!/\.(?:json|md)$/i.test(entry.name)) {
        throw new Error(`Unsupported GameKit source file: ${absolutePath}`);
      }
      results.push(absolutePath);
    }
  }
  return results.sort((left, right) => left.localeCompare(right, "en"));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}
