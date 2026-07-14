"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..", "..");
const scanRoot = readScanRoot(process.argv.slice(2));
const reportPath = path.join(repoRoot, "artifacts", "compliance", "public-tree-audit.json");

const bannedPrefixes = [
  ".agents/",
  ".codex/",
  ".codex_tmp/",
  "artifacts/",
  "cartridges/diamond-bistro/",
  "debug/",
  "dist/",
  "dist-electron/",
  "docs/assets/",
  "docs/backlog/",
  "docs/character-chat/",
  "docs/economy/",
  "docs/en/",
  "docs/game-play/",
  "exports/",
  "node_modules/",
  "release/",
  ".tmp/",
  "tmp/"
];
const bannedExactPaths = new Set([
  ".env",
  ".env.local",
  ".npmrc",
  ".DS_Store",
  "Thumbs.db",
  "desktop.ini",
  "docs/.nojekyll",
  "docs/content/open-card-sources.md",
  "docs/index.html",
  "docs/media-capture-plan.md",
  "docs/release/feature-matrix.md",
  "docs/release/name-and-trademark-check.md",
  "docs/release/name-clearance.md",
  "docs/release/public-promotion.md",
  "docs/release/SCREENSHOT_PLAN.ko.md",
  "docs/tutorial-outline.ko.md",
  "docs/ugc/agent-authoring-guide.md",
  "docs/ugc/character-pack-spec.md",
  "docs/ugc/diamond-bistro-animoca-target.md",
  "docs/ugc/diamond-economy-contract.md",
  "docs/ugc/game-pack-spec.md",
  "docs/ugc/playzone-cartridge-system.md",
  "docs/ugc/ugc-package-spec.md",
  "docs/ugc/ugc-security-model.md",
  "docs/youtube-script.ko.md",
  "scripts/generate-hobbit-layout-fixtures.mjs"
]);
const bannedFilePattern = /(?:^|\/)(?:\.env(?:\..+)?|[^/]+\.(?:7z|backup|bak|db|db3|jks|key|keystore|lembackup|log|p12|pem|pfx|rar|sqlite|sqlite3|sqlite-shm|sqlite-wal|zip))$/i;
const allowedEmailDomains = new Set([
  "example.com",
  "example.net",
  "example.org",
  "github.com",
  "npmjs.com",
  "users.noreply.github.com"
]);
const binaryMediaExtensions = new Set([
  ".aac",
  ".avif",
  ".eot",
  ".flac",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".m4a",
  ".mp3",
  ".mp4",
  ".ogg",
  ".otf",
  ".png",
  ".ttf",
  ".wav",
  ".webm",
  ".webp",
  ".woff",
  ".woff2"
]);
const highConfidenceBinaryCheckKinds = new Set([
  "private-key",
  "google-api-key",
  "github-token",
  "openai-token",
  "aws-access-key"
]);
const unfinishedPublicDocumentPattern =
  /SCREENSHOT-ID|Editor[’']s note\s*[—-]\s*do\x20not\x20publish this note|편집자 메모\s*[—-]\s*공개본에 포함하지 않음/g;

const contentChecks = [
  {
    kind: "private-key",
    regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g
  },
  {
    kind: "google-api-key",
    regex: /\bAIza[0-9A-Za-z_-]{30,}\b/g
  },
  {
    kind: "github-token",
    regex: /\bgh[pousr]_[0-9A-Za-z]{30,}\b/g
  },
  {
    kind: "openai-token",
    regex: /\bsk-(?:proj-)?[0-9A-Za-z_-]{30,}\b/g
  },
  {
    kind: "aws-access-key",
    regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g
  },
  {
    kind: "client-secret-assignment",
    regex: /\bVITE_[A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*\s*[:=]\s*["'`](?!\s*["'`])[^"'`\r\n]{8,}["'`]/gi
  },
  {
    kind: "literal-api-key-assignment",
    regex: /\b(?:apiKey|geminiApiKey|googleApiKey|googleTranslateApiKey)\s*[:=]\s*["'`](?!\s*["'`])[^"'`\r\n]{12,}["'`]/g
  },
  {
    kind: "personal-windows-path",
    regex: /\b[A-Z]:[\\/]Users[\\/](?!Public(?:[\\/]|$)|Default(?:[\\/]|$)|runneradmin(?:[\\/]|$)|test(?:er)?(?:[\\/]|$)|example(?:[\\/]|$))[^\\/\s"'`]+/gi
  },
  {
    kind: "personal-posix-path",
    regex: /(?:^|[\s"'`])\/(?:Users|home)\/(?!runner(?:\/|$)|test(?:er)?(?:\/|$)|example(?:\/|$))[^/\s"'`]+/g
  }
];

const files = listCandidateFiles(scanRoot);
const findings = [];

for (const relativePath of files) {
  const normalized = relativePath.replace(/\\/g, "/");
  const isValueFreeEnvExample = /(?:^|\/)\.env(?:\.[^/]+)?\.example$/i.test(normalized);
  if (
    bannedExactPaths.has(normalized) ||
    bannedPrefixes.some((prefix) => normalized.startsWith(prefix)) ||
    (!isValueFreeEnvExample && bannedFilePattern.test(normalized))
  ) {
    findings.push({ file: normalized, kind: "banned-public-file" });
    continue;
  }

  const absolutePath = path.join(scanRoot, relativePath);
  let buffer;
  try {
    buffer = fs.readFileSync(absolutePath);
  } catch (error) {
    findings.push({
      file: normalized,
      kind: "unreadable-file",
      detail: error instanceof Error ? error.message : String(error)
    });
    continue;
  }
  if (isValueFreeEnvExample && hasNonEmptyEnvAssignment(buffer.toString("utf8"))) {
    findings.push({ file: normalized, kind: "nonempty-env-example" });
    continue;
  }
  if (binaryMediaExtensions.has(path.extname(normalized).toLowerCase())) {
    scanBinaryForHighConfidenceSecrets(normalized, buffer);
    continue;
  }
  const isPlainText = !buffer.includes(0);
  scanContent(normalized, buffer.toString(isPlainText ? "utf8" : "latin1"), isPlainText);
  if (!isPlainText && buffer.length >= 2) {
    scanContent(normalized, buffer.toString("utf16le"), false);
  }
}

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  filesScanned: files.length,
  passed: findings.length === 0,
  findings
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (findings.length > 0) {
  process.stderr.write(`Public tree audit failed with ${findings.length} finding(s):\n`);
  for (const finding of findings.slice(0, 50)) {
    process.stderr.write(
      `- ${finding.file}${finding.line ? `:${finding.line}` : ""} [${finding.kind}]\n`
    );
  }
  if (findings.length > 50) {
    process.stderr.write(`- ...and ${findings.length - 50} more finding(s)\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write(`Public tree audit passed (${files.length} files scanned).\n`);
}

function readScanRoot(args) {
  if (args.length === 0) return repoRoot;
  if (args.length !== 2 || args[0] !== "--root" || !args[1]) {
    throw new Error("Usage: node audit-public-tree.cjs [--root <directory>]");
  }
  const candidate = path.resolve(repoRoot, args[1]);
  const stat = fs.lstatSync(candidate);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("The public-tree audit root must be a real directory.");
  }
  return candidate;
}

function listCandidateFiles(rootPath) {
  if (rootPath !== repoRoot) {
    return listDirectoryFiles(rootPath);
  }
  const result = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  );
  if (result.status !== 0) {
    throw new Error(
      result.stderr || result.error?.message || "Unable to enumerate the Git worktree."
    );
  }
  return result.stdout
    .split("\0")
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => {
      try {
        fs.lstatSync(path.join(repoRoot, value));
        return true;
      } catch (error) {
        if (error && error.code === "ENOENT") return false;
        throw error;
      }
    })
    .sort();
}

function scanContent(normalized, text, hasReliableLineNumbers) {
  const testSource = /(?:^|\/)[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(normalized);
  if (isPublicDocumentPath(normalized)) {
    unfinishedPublicDocumentPattern.lastIndex = 0;
    const draftMarker = unfinishedPublicDocumentPattern.exec(text);
    if (draftMarker) {
      findings.push({
        file: normalized,
        kind: "unfinished-public-document",
        ...(hasReliableLineNumbers ? { line: lineNumberAt(text, draftMarker.index) } : {})
      });
    }
    scanPublicDocumentImages(normalized, text, hasReliableLineNumbers);
  }
  for (const check of contentChecks) {
    if (
      testSource &&
      [
        "client-secret-assignment",
        "literal-api-key-assignment",
        "personal-windows-path",
        "personal-posix-path"
      ].includes(check.kind)
    ) {
      continue;
    }
    check.regex.lastIndex = 0;
    const match = check.regex.exec(text);
    if (match) {
      findings.push({
        file: normalized,
        kind: check.kind,
        ...(hasReliableLineNumbers ? { line: lineNumberAt(text, match.index) } : {})
      });
    }
  }

  if (
    normalized === "package-lock.json" ||
    isThirdPartyLicenseNoticePath(normalized)
  ) {
    return;
  }
  const emailRegex = /\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi;
  for (const match of text.matchAll(emailRegex)) {
    const domain = match[1].toLowerCase();
    if (!isAllowedEmailDomain(domain)) {
      findings.push({
        file: normalized,
        kind: "review-personal-email",
        ...(hasReliableLineNumbers ? { line: lineNumberAt(text, match.index ?? 0) } : {})
      });
    }
  }
}

function scanPublicDocumentImages(normalized, text, hasReliableLineNumbers) {
  if (!normalized.toLowerCase().endsWith(".md")) return;
  const withoutCodeFences = text.replace(/```[\s\S]*?```/g, "");
  const imagePattern = /!\[[^\]]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["'][^"']*["'])?\s*\)/g;
  for (const match of withoutCodeFences.matchAll(imagePattern)) {
    let target = match[1];
    if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1);
    if (/^(?:https?:|data:)/i.test(target)) continue;
    target = target.split(/[?#]/, 1)[0];
    try {
      target = decodeURIComponent(target);
    } catch {
      findings.push({
        file: normalized,
        kind: "invalid-public-document-image-link",
        ...(hasReliableLineNumbers ? { line: lineNumberAt(withoutCodeFences, match.index ?? 0) } : {})
      });
      continue;
    }
    const absoluteTarget = path.resolve(scanRoot, path.dirname(normalized), target);
    const relativeTarget = path.relative(scanRoot, absoluteTarget);
    const findingBase = {
      file: normalized,
      ...(hasReliableLineNumbers ? { line: lineNumberAt(withoutCodeFences, match.index ?? 0) } : {})
    };
    if (!relativeTarget || relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget)) {
      findings.push({ ...findingBase, kind: "unsafe-public-document-image-link" });
      continue;
    }
    try {
      const stat = fs.lstatSync(absoluteTarget);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        findings.push({ ...findingBase, kind: "unsafe-public-document-image-target" });
      }
    } catch {
      findings.push({ ...findingBase, kind: "missing-public-document-image" });
    }
  }
}

function isPublicDocumentPath(normalized) {
  return (
    /^(?:README(?:\.en)?\.md)$/i.test(normalized) ||
    /^docs\/.*\.(?:html|md)$/i.test(normalized)
  );
}

function scanBinaryForHighConfidenceSecrets(normalized, buffer) {
  const text = buffer.toString("latin1");
  for (const check of contentChecks) {
    if (!highConfidenceBinaryCheckKinds.has(check.kind)) continue;
    check.regex.lastIndex = 0;
    if (check.regex.test(text)) {
      findings.push({ file: normalized, kind: `${check.kind}-in-binary` });
    }
  }
}

function isAllowedEmailDomain(domain) {
  return (
    allowedEmailDomains.has(domain) ||
    /(?:^|\.)(?:example|invalid|localhost|test)$/.test(domain)
  );
}

function isThirdPartyLicenseNoticePath(normalized) {
  const segments = normalized.split("/");
  const fileName = segments.at(-1) ?? "";
  const insideLicenseDirectory = segments
    .slice(0, -1)
    .some((segment) => /^licenses?$/i.test(segment));
  const standardNoticeFile =
    /^(?:license|copying|notice|third[_-]party(?:[_-]notices?)?)(?:\.[^/]+)?$/i.test(
      fileName
    );
  return insideLicenseDirectory || standardNoticeFile;
}

function hasNonEmptyEnvAssignment(text) {
  return text.split(/\r?\n/).some((line) => {
    const candidate = line.trim();
    if (!candidate || candidate.startsWith("#")) return false;
    const match = /^(?:export\s+)?[A-Z_][A-Z0-9_]*\s*=\s*(.*)$/i.exec(candidate);
    if (!match) return false;
    const value = match[1].trim();
    return value !== "" && value !== '""' && value !== "''";
  });
}

function listDirectoryFiles(rootPath) {
  const files = [];
  const visit = (folderPath) => {
    for (const entry of fs.readdirSync(folderPath, { withFileTypes: true })) {
      const absolutePath = path.join(folderPath, entry.name);
      const relativePath = path.relative(rootPath, absolutePath).replace(/\\/g, "/");
      const stat = fs.lstatSync(absolutePath);
      if (stat.isSymbolicLink()) {
        throw new Error(`Public staging cannot contain symbolic links: ${relativePath}`);
      }
      if (stat.isDirectory()) {
        visit(absolutePath);
      } else if (stat.isFile()) {
        files.push(relativePath);
      }
    }
  };
  visit(rootPath);
  return files.sort();
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}
