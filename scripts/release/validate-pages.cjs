"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const siteRoot = path.resolve(repoRoot, process.argv[2] || "docs/site");
const docsSiteRoot = path.join(repoRoot, "docs", "site");
const installerUrl = "https://github.com/MeowthologySaga/Language_Miner/releases/download/v0.1.0-beta.1/Language-Miner-Setup-0.1.0-beta.1-x64.exe";
const portableUrl = "https://github.com/MeowthologySaga/Language_Miner/releases/download/v0.1.0-beta.1/Language-Miner-Portable-0.1.0-beta.1-x64.exe";
const characterSubmissionUrl = "https://github.com/MeowthologySaga/Language_Miner/issues/new?template=ugc_character_submission.yml";
const gameSubmissionUrl = "https://github.com/MeowthologySaga/Language_Miner/issues/new?template=ugc_game_submission.yml";
const officialGameDownloads = [
  "https://github.com/MeowthologySaga/abyss-summoner/releases/download/v0.1.2/abyss-summoner-0.1.2.lemgame",
  "https://github.com/MeowthologySaga/Drillheart_Defense/releases/download/v0.2.0/drillheart-defense-0.2.0.lemgame",
  "https://github.com/MeowthologySaga/Cat_Odyssey/releases/download/v0.1.1/cat-odyssey-0.1.1.lemgame",
];
const directDownloadPages = new Set(["index.html", "en/index.html", "tutorial.html", "en/tutorial.html"]);
const communityPages = new Set(["community.html", "en/community.html"]);
const allowedExeUrls = new Set([installerUrl, portableUrl]);
const allowedExtensions = new Set([
  ".css", ".gif", ".html", ".ico", ".jpeg", ".jpg", ".js", ".json",
  ".md", ".png", ".svg", ".txt", ".webmanifest", ".webp", ".woff", ".woff2", ".xml"
]);
const visitorMetaPatterns = [
  [/SPAM\s*&amp;\s*ATTACK DEFENSE/i, "internal spam-defense copy"],
  [/도배와 공격은 공개 목록/i, "internal spam-defense copy"],
  [/사이트가 파일을 저장하거나 중계하지/i, "internal hosting-architecture copy"],
  [/The site does not store or proxy content files/i, "internal hosting-architecture copy"],
  [/정적 GitHub Pages\s*·\s*서버·DB·공용 API 키 없음/i, "internal hosting-architecture footer"],
  [/Static GitHub Pages\s*·\s*no server, database, or shared API key/i, "internal hosting-architecture footer"],
];

if (siteRoot !== docsSiteRoot) {
  throw new Error("GitHub Pages validation is restricted to docs/site.");
}
if (!fs.existsSync(path.join(siteRoot, "index.html"))) {
  throw new Error("docs/site/index.html is required.");
}
for (const communityPage of communityPages) {
  if (!fs.existsSync(path.join(siteRoot, communityPage))) {
    throw new Error(`docs/site/${communityPage} is required.`);
  }
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
  if (extension === ".html") {
    for (const [pattern, label] of visitorMetaPatterns) {
      if (pattern.test(text)) findings.push(`${relativePath}: ${label}`);
    }
    validateLocalReferences(filePath, text, findings);
    validateDownloadLinks(relativePath, text, findings);
    validateScreenshotLinks(relativePath, text, findings);
    validateCommunityPage(relativePath, text, findings);
  }
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

function validateDownloadLinks(relativePath, html, output) {
  if (directDownloadPages.has(relativePath)) {
    if (!html.includes(installerUrl)) output.push(`${relativePath}: missing fixed installer download`);
    if (!html.includes(portableUrl)) output.push(`${relativePath}: missing fixed portable download`);
  }
  if (/\/releases\/latest\/download\//i.test(html)) {
    output.push(`${relativePath}: mutable latest-release download URL`);
  }
  const exeLinkRegex = /href=["'](https:\/\/[^"']+\.exe)["']/gi;
  for (const match of html.matchAll(exeLinkRegex)) {
    if (!allowedExeUrls.has(match[1])) output.push(`${relativePath}: unexpected EXE download URL (${match[1]})`);
  }
}

function validateScreenshotLinks(relativePath, html, output) {
  const screenshotRegex = /<a\s+class=["']tutorial-shot-link["']\s+href=["']([^"']+)["'][^>]*>\s*<img\s+class=["']tutorial-shot["']\s+src=["']([^"']+)["']/gi;
  const screenshots = [...html.matchAll(screenshotRegex)];
  if (!relativePath.endsWith("tutorial.html")) return;
  if (screenshots.length < 10) {
    output.push(`${relativePath}: expected at least 10 linked tutorial screenshots`);
    return;
  }
  for (const [, href, src] of screenshots) {
    if (href !== src) output.push(`${relativePath}: screenshot link does not open its source (${src})`);
  }
}

function validateCommunityPage(relativePath, html, output) {
  if (!communityPages.has(relativePath)) return;
  if (!html.includes(characterSubmissionUrl)) output.push(`${relativePath}: missing character submission form`);
  if (!html.includes(gameSubmissionUrl)) output.push(`${relativePath}: missing Game Pack submission form`);
  if (!/Character (?:chat )?(?:card|Chat)|캐릭터(?:챗)?\s*카드/i.test(html)) {
    output.push(`${relativePath}: missing character-card sharing path`);
  }
  if (!/PlayZone (?:Game Pack|게임)|PlayZone[\s\S]{0,120}(?:Game Pack|게임팩)/i.test(html)) {
    output.push(`${relativePath}: missing Game Pack sharing path`);
  }
  for (const downloadUrl of officialGameDownloads) {
    if (!html.includes(downloadUrl)) output.push(`${relativePath}: missing official Game Pack download (${downloadUrl})`);
  }
  if (!/클릭해서 크게 보기|Open full-size image/i.test(html)) {
    output.push(`${relativePath}: missing full-size catalog or install image links`);
  }
  if (/<form\b|type=["']file["']|\bfetch\s*\(/i.test(html)) {
    output.push(`${relativePath}: direct upload or runtime network behavior is forbidden`);
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
