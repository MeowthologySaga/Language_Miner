"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const siteRoot = path.resolve(repoRoot, process.argv[2] || "docs/site");
const docsSiteRoot = path.join(repoRoot, "docs", "site");
const allowedExtensions = new Set([
  ".css", ".gif", ".html", ".ico", ".jpeg", ".jpg", ".js", ".json",
  ".md", ".png", ".svg", ".txt", ".webmanifest", ".webp", ".woff", ".woff2", ".xml"
]);

if (siteRoot !== docsSiteRoot) {
  throw new Error("GitHub Pages validation is restricted to docs/site.");
}
if (!fs.existsSync(path.join(siteRoot, "index.html"))) {
  throw new Error("docs/site/index.html is required.");
}

const files = walkFiles(siteRoot);
const findings = [];
const remoteOrDynamicPatterns = [
  [/<(?:script|iframe|img|source|video|audio)\b[^>]*\bsrc=["']https?:\/\//i, "remote executable or media resource"],
  [/<link\b[^>]*\bhref=["']https?:\/\//i, "remote linked resource"],
  [/<form\b/i, "form submission is outside the static-site boundary"],
  [/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/i, "runtime network API"],
  [/navigator\.sendBeacon\s*\(/i, "telemetry-capable sendBeacon API"],
  [/url\(\s*["']?https?:\/\//i, "remote CSS resource"]
];
for (const filePath of files) {
  const relativePath = path.relative(siteRoot, filePath).replace(/\\/g, "/");
  const extension = path.extname(relativePath).toLowerCase();
  if (path.basename(relativePath) !== ".nojekyll" && !allowedExtensions.has(extension)) {
    findings.push(`${relativePath}: unsupported static-site file type`);
    continue;
  }
  const buffer = fs.readFileSync(filePath);
  if (buffer.includes(0) || buffer.length > 5 * 1024 * 1024) continue;
  const text = buffer.toString("utf8");
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) {
    findings.push(`${relativePath}: private key material`);
  }
  if (/\b(?:AIza[0-9A-Za-z_-]{30,}|gh[pousr]_[0-9A-Za-z]{30,}|sk-(?:proj-)?[0-9A-Za-z_-]{30,})\b/.test(text)) {
    findings.push(`${relativePath}: credential-shaped value`);
  }
  if (/\b[A-Z]:[\\/]Users[\\/][^\\/\s"'`]+/i.test(text) || /\/(?:Users|home)\/[^/\s"'`]+/.test(text)) {
    findings.push(`${relativePath}: local user path`);
  }
  for (const [pattern, label] of remoteOrDynamicPatterns) {
    if (pattern.test(text)) findings.push(`${relativePath}: ${label}`);
  }
  if (extension === ".html") validateLocalReferences(filePath, text, findings);
}

if (findings.length > 0) {
  throw new Error(`Pages validation failed:\n${findings.map((item) => `- ${item}`).join("\n")}`);
}
process.stdout.write(`Pages validation passed (${files.length} files in docs/site).\n`);

function validateLocalReferences(htmlPath, html, output) {
  const referenceRegex = /(?:href|src)=["']([^"']+)["']/gi;
  for (const match of html.matchAll(referenceRegex)) {
    const reference = match[1].trim();
    if (!reference || reference.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(reference)) continue;
    const withoutFragment = reference.split("#", 1)[0].split("?", 1)[0];
    if (!withoutFragment) continue;
    const target = path.resolve(path.dirname(htmlPath), decodeURIComponent(withoutFragment));
    if (target !== siteRoot && !target.startsWith(`${siteRoot}${path.sep}`)) {
      output.push(`${path.relative(siteRoot, htmlPath)}: reference escapes docs/site (${reference})`);
    } else if (!fs.existsSync(target)) {
      output.push(`${path.relative(siteRoot, htmlPath)}: missing local reference (${reference})`);
    }
  }
}

function walkFiles(directory) {
  const results = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    const stats = fs.lstatSync(absolutePath);
    if (stats.isSymbolicLink()) throw new Error(`Pages source cannot contain symlinks: ${absolutePath}`);
    if (entry.isDirectory()) results.push(...walkFiles(absolutePath));
    else if (entry.isFile()) results.push(absolutePath);
  }
  return results;
}
