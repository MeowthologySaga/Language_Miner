"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const inputDir = path.join(repoRoot, "release");
const outputDir = path.join(repoRoot, "artifacts", "release");
const packageJsonPath = path.join(repoRoot, "package.json");

function readReleaseVersion() {
  let packageJson;
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read a valid package.json: ${error.message}`);
  }

  const version = packageJson.version;
  const safeSemverPattern =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?$/;
  if (
    typeof version !== "string" ||
    version.length === 0 ||
    version.length > 64 ||
    !safeSemverPattern.test(version)
  ) {
    throw new Error(
      "package.json version must be a safe SemVer value without build metadata"
    );
  }

  return version;
}

const version = readReleaseVersion();

if (!fs.existsSync(inputDir)) {
  throw new Error("electron-builder output directory does not exist: release");
}

const executableNames = fs
  .readdirSync(inputDir)
  .filter((name) => name.toLowerCase().endsWith(".exe"))
  .sort();
const artifacts = [
  {
    sourceName: `Language Miner Setup ${version}-x64.exe`,
    outputName: `Language-Miner-Setup-${version}-x64.exe`
  },
  {
    sourceName: `Language Miner Portable ${version}-x64.exe`,
    outputName: `Language-Miner-Portable-${version}-x64.exe`
  }
];
const expectedNames = new Set(artifacts.map(({ sourceName }) => sourceName));
const missingNames = artifacts
  .map(({ sourceName }) => sourceName)
  .filter((name) => !executableNames.includes(name));
const unexpectedNames = executableNames.filter((name) => !expectedNames.has(name));

if (missingNames.length > 0 || unexpectedNames.length > 0) {
  throw new Error(
    [
      `Expected exactly the NSIS Setup and Portable executables for version ${version}.`,
      `Missing: ${missingNames.join(", ") || "none"}.`,
      `Unexpected: ${unexpectedNames.join(", ") || "none"}.`
    ].join(" ")
  );
}

for (const { sourceName } of artifacts) {
  const sourcePath = path.join(inputDir, sourceName);
  const sourceStat = fs.lstatSync(sourcePath);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
    throw new Error(`Release executable must be a regular file: ${sourceName}`);
  }
}

fs.mkdirSync(outputDir, { recursive: true });
const expectedOutputNames = new Set(artifacts.map(({ outputName }) => outputName));
const unexpectedOutputNames = fs
  .readdirSync(outputDir)
  .filter((name) => name.toLowerCase().endsWith(".exe") && !expectedOutputNames.has(name))
  .sort();
if (unexpectedOutputNames.length > 0) {
  throw new Error(
    `Release output contains unexpected executable files: ${unexpectedOutputNames.join(", ")}`
  );
}
for (const { sourceName, outputName } of artifacts) {
  const outputPath = path.join(outputDir, outputName);
  if (fs.existsSync(outputPath)) {
    const outputStat = fs.lstatSync(outputPath);
    if (!outputStat.isFile() || outputStat.isSymbolicLink()) {
      throw new Error(`Release output executable must be a regular file: ${outputName}`);
    }
  }
  fs.copyFileSync(path.join(inputDir, sourceName), outputPath);
}

for (const diagnosticName of ["builder-debug.yml", "builder-effective-config.yaml"]) {
  const diagnosticPath = path.join(inputDir, diagnosticName);
  if (fs.existsSync(diagnosticPath)) {
    fs.rmSync(diagnosticPath, { force: true });
  }
}

process.stdout.write(
  `Collected Windows release artifacts: ${artifacts.map(({ outputName }) => outputName).join(", ")}.\n`
);
