"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const tag = (process.argv[2] || process.env.GITHUB_REF_NAME || "").trim();
const expectedTag = `v${packageJson.version}`;

if (!tag) {
  throw new Error(`Release tag is required; expected ${expectedTag}.`);
}
if (tag !== expectedTag) {
  throw new Error(`Release tag ${tag} does not match package version ${expectedTag}.`);
}
if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) {
  throw new Error(`Release tag is not a supported semantic version: ${tag}`);
}

process.stdout.write(`Release tag verified: ${tag}.\n`);
