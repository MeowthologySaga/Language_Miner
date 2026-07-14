"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const inputDir = path.join(repoRoot, "release");
const outputDir = path.join(repoRoot, "artifacts", "release");

if (!fs.existsSync(inputDir)) {
  throw new Error("electron-builder output directory does not exist: release");
}

const executableNames = fs
  .readdirSync(inputDir)
  .filter((name) => name.toLowerCase().endsWith(".exe"))
  .sort();
const installer = executableNames.find((name) => /\bSetup\b/i.test(name));
const portable = executableNames.find((name) => /\bPortable\b/i.test(name));

if (!installer || !portable) {
  throw new Error(
    `Expected both NSIS Setup and Portable executables; found: ${executableNames.join(", ") || "none"}`
  );
}

fs.mkdirSync(outputDir, { recursive: true });
for (const name of [installer, portable]) {
  fs.copyFileSync(path.join(inputDir, name), path.join(outputDir, name));
}

for (const diagnosticName of ["builder-debug.yml", "builder-effective-config.yaml"]) {
  const diagnosticPath = path.join(inputDir, diagnosticName);
  if (fs.existsSync(diagnosticPath)) {
    fs.rmSync(diagnosticPath, { force: true });
  }
}

process.stdout.write(`Collected Windows release artifacts: ${installer}, ${portable}.\n`);
