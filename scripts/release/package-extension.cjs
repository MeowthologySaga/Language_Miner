"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createZip } = require("./zip-utils.cjs");

const repoRoot = path.resolve(__dirname, "..", "..");
const extensionRoot = path.join(repoRoot, "extension");
const packageJson = readJson(path.join(repoRoot, "package.json"));
const manifest = readJson(path.join(extensionRoot, "manifest.json"));
const outputDir = path.join(repoRoot, "artifacts", "release");
const outputPath = path.join(
  outputDir,
  `Language-Miner-Extension-${packageJson.version}.zip`
);
const rootFiles = [
  "manifest.json",
  "README.md",
  "options.css",
  "options.html",
  "options.js"
];
const files = [
  ...rootFiles,
  ...walkFiles(path.join(extensionRoot, "_locales"))
    .map((absolutePath) => path.relative(extensionRoot, absolutePath).replace(/\\/g, "/"))
    .filter((relativePath) => relativePath.endsWith("/messages.json")),
  ...walkFiles(path.join(extensionRoot, "src"))
    .map((absolutePath) => path.relative(extensionRoot, absolutePath).replace(/\\/g, "/"))
    .filter((relativePath) => relativePath.endsWith(".js"))
].sort();

validateManifestReferences(files, manifest);
validateLocaleCatalogs(files, manifest);
for (const relativePath of files) {
  if (!fs.existsSync(path.join(extensionRoot, relativePath))) {
    throw new Error(`Extension package input is missing: ${relativePath}`);
  }
}

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  outputPath,
  createZip(
    files.map((relativePath) => ({
      name: relativePath,
      data: fs.readFileSync(path.join(extensionRoot, relativePath))
    }))
  )
);

process.stdout.write(
  `Extension package created: ${path.relative(repoRoot, outputPath)} (${files.length} files).\n`
);

function validateManifestReferences(includedFiles, extensionManifest) {
  const included = new Set(includedFiles);
  const referenced = new Set();
  if (extensionManifest.background?.service_worker) {
    referenced.add(extensionManifest.background.service_worker);
  }
  if (extensionManifest.options_page) referenced.add(extensionManifest.options_page);
  for (const contentScript of extensionManifest.content_scripts ?? []) {
    for (const scriptPath of contentScript.js ?? []) referenced.add(scriptPath);
    for (const stylePath of contentScript.css ?? []) referenced.add(stylePath);
  }
  for (const referencedPath of referenced) {
    if (!included.has(referencedPath)) {
      throw new Error(`manifest.json references a file excluded from the ZIP: ${referencedPath}`);
    }
  }
}

function validateLocaleCatalogs(includedFiles, extensionManifest) {
  const defaultLocale = extensionManifest.default_locale;
  if (typeof defaultLocale !== "string" || !/^[a-z]{2}(?:_[A-Z]{2})?$/.test(defaultLocale)) {
    throw new Error("manifest.json must declare a valid default_locale.");
  }

  const requiredLocales = new Set([defaultLocale, "en", "ko"]);
  const catalogs = new Map();
  for (const locale of requiredLocales) {
    const relativePath = `_locales/${locale}/messages.json`;
    if (!includedFiles.includes(relativePath)) {
      throw new Error(`Extension locale catalog is missing from the ZIP: ${relativePath}`);
    }
    const catalog = readJson(path.join(extensionRoot, relativePath));
    for (const [key, entry] of Object.entries(catalog)) {
      if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key)) {
        throw new Error(`${relativePath} has an invalid message key: ${key}`);
      }
      if (!entry || typeof entry.message !== "string" || !entry.message.trim()) {
        throw new Error(`${relativePath} has an empty or invalid message: ${key}`);
      }
    }
    catalogs.set(locale, catalog);
  }

  const defaultKeys = Object.keys(catalogs.get(defaultLocale)).sort();
  for (const [locale, catalog] of catalogs) {
    const keys = Object.keys(catalog).sort();
    if (keys.length !== defaultKeys.length || keys.some((key, index) => key !== defaultKeys[index])) {
      throw new Error(`Extension locale catalog keys differ from ${defaultLocale}: ${locale}`);
    }
  }

  for (const value of [
    extensionManifest.name,
    extensionManifest.short_name,
    extensionManifest.description
  ]) {
    const match = typeof value === "string" ? /^__MSG_([A-Za-z][A-Za-z0-9_]*)__$/.exec(value) : null;
    if (!match || !catalogs.get(defaultLocale)[match[1]]) {
      throw new Error(`Manifest localization reference is invalid or missing: ${String(value)}`);
    }
  }
}

function walkFiles(directory) {
  const results = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Extension source must not contain symbolic links: ${absolutePath}`);
    }
    if (entry.isDirectory()) results.push(...walkFiles(absolutePath));
    else if (entry.isFile()) results.push(absolutePath);
  }
  return results;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}
