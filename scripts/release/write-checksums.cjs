"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const requestedDir = process.argv[2] || "artifacts/release";
const targetDir = path.resolve(repoRoot, requestedDir);
const artifactsRoot = path.join(repoRoot, "artifacts");

if (targetDir !== artifactsRoot && !targetDir.startsWith(`${artifactsRoot}${path.sep}`)) {
  throw new Error("Checksum target must stay inside the artifacts directory.");
}
if (!fs.existsSync(targetDir)) {
  throw new Error(`Checksum target does not exist: ${requestedDir}`);
}

const files = fs
  .readdirSync(targetDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name !== "SHA256SUMS.txt")
  .map((entry) => entry.name)
  .sort();
if (files.length === 0) throw new Error("No release files were found for checksums.");

const lines = files.map((name) => {
  const digest = crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(targetDir, name)))
    .digest("hex");
  return `${digest} *${name}`;
});
fs.writeFileSync(path.join(targetDir, "SHA256SUMS.txt"), `${lines.join("\n")}\n`, "utf8");
process.stdout.write(`SHA-256 checksums written for ${files.length} release files.\n`);
