const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const requestedRoots = process.argv.slice(2);
const roots = (requestedRoots.length
  ? requestedRoots
  : ["dist", "dist-electron", "release", path.join("artifacts", "release")]
).map((value) => path.resolve(repoRoot, value));
const canary = String(process.env.LEM_BUILD_CANARY || "").trim();
const textLikeExtensions = new Set([
  ".bat", ".c", ".cc", ".cjs", ".cmd", ".conf", ".cpp", ".css", ".csv", ".env",
  ".go", ".h", ".hpp", ".htm", ".html", ".ini", ".java", ".js", ".json", ".jsx",
  ".log", ".map", ".md", ".mjs", ".properties", ".ps1", ".py", ".rb", ".rs", ".sh",
  ".srt", ".svg", ".toml", ".ts", ".tsx", ".txt", ".vtt", ".xml", ".yaml", ".yml"
]);
const exactSensitivePathNeedles = collectExactSensitivePathNeedles();
const findings = [];
const files = [];

for (const root of roots) {
  if (!fs.existsSync(root)) {
    findings.push({ file: relative(root), kind: "missing-scan-root", offset: 0 });
    continue;
  }
  collectFiles(root, files);
}
if (files.length === 0) {
  findings.push({
    file: roots.map(relative).join(", ") || "(none)",
    kind: "no-files-scanned",
    offset: 0
  });
}
for (const filePath of files) scanFile(filePath);

if (findings.length) {
  process.stderr.write(`Built-artifact secret scan failed with ${findings.length} finding(s):\n`);
  for (const finding of findings.slice(0, 50)) {
    process.stderr.write(`- ${finding.file} [${finding.kind}] at byte ${finding.offset}\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write(`Built-artifact secret scan passed (${files.length} files scanned).\n`);
}

function collectFiles(candidatePath, output) {
  if (!fs.existsSync(candidatePath)) return;
  const stat = fs.lstatSync(candidatePath);
  if (stat.isSymbolicLink()) {
    findings.push({ file: relative(candidatePath), kind: "symbolic-link", offset: 0 });
    return;
  }
  if (stat.isFile()) {
    output.push(candidatePath);
    return;
  }
  if (!stat.isDirectory()) return;
  for (const entry of fs.readdirSync(candidatePath, { withFileTypes: true })) {
    collectFiles(path.join(candidatePath, entry.name), output);
  }
}

function scanFile(filePath) {
  if (isForbiddenPackagedMetadata(filePath)) {
    addFinding(filePath, "forbidden-packaged-metadata", 0);
  }
  const handle = fs.openSync(filePath, "r");
  const chunkBytes = 1024 * 1024;
  const overlapBytes = 512;
  let previous = Buffer.alloc(0);
  let position = 0;
  try {
    while (true) {
      const buffer = Buffer.allocUnsafe(chunkBytes);
      const bytesRead = fs.readSync(handle, buffer, 0, chunkBytes, position);
      if (!bytesRead) break;
      const chunk = Buffer.concat([previous, buffer.subarray(0, bytesRead)]);
      const chunkStart = Math.max(0, position - previous.length);
      scanChunk(filePath, chunk, chunkStart, isTextLikeFile(filePath));
      previous = chunk.subarray(Math.max(0, chunk.length - overlapBytes));
      position += bytesRead;
    }
  } finally {
    fs.closeSync(handle);
  }
}

function scanChunk(filePath, chunk, chunkStart, textLike) {
  if (canary) {
    findBuffer(filePath, chunk, Buffer.from(canary, "utf8"), "build-canary", chunkStart);
    findBuffer(
      filePath,
      chunk,
      Buffer.from(canary, "utf16le"),
      "build-canary-utf16le",
      chunkStart
    );
  }
  scanText(filePath, chunk.toString("latin1"), chunkStart, 1, "", textLike);
  scanText(filePath, chunk.toString("utf16le"), chunkStart, 2, "-utf16le", textLike);
}

function scanText(filePath, text, chunkStart, bytesPerCodeUnit, kindSuffix, textLike) {
  const secretPatterns = [
    ["google-api-key", /AIza[0-9A-Za-z_-]{25,}/g],
    ["github-token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g],
    ["github-fine-grained-token", /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g],
    ["openai-api-key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/g],
    ["aws-access-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
    ["private-key", /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/g]
  ];
  scanPatterns(filePath, text, chunkStart, bytesPerCodeUnit, kindSuffix, secretPatterns);
  scanExactSensitivePaths(filePath, text, chunkStart, bytesPerCodeUnit, kindSuffix);
  if (!textLike) return;
  const broadPathPatterns = [
    ["local-windows-user-path", /[A-Za-z]:[\\/]Users[\\/][^\\/\s'"<>]+[\\/]/g],
    ["local-unix-user-path", /\/(?:Users|home)\/[^/\s'"<>]+\//g]
  ];
  scanPatterns(filePath, text, chunkStart, bytesPerCodeUnit, kindSuffix, broadPathPatterns);
}

function scanPatterns(filePath, text, chunkStart, bytesPerCodeUnit, kindSuffix, patterns) {
  for (const [kind, pattern] of patterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(text);
    if (match) {
      addFinding(filePath, `${kind}${kindSuffix}`, chunkStart + match.index * bytesPerCodeUnit);
    }
  }
}

function scanExactSensitivePaths(filePath, text, chunkStart, bytesPerCodeUnit, kindSuffix) {
  for (const needle of exactSensitivePathNeedles) {
    const pattern = new RegExp(`${escapeRegExp(needle)}(?=$|[\\\\/\\s'"<>\\0])`, "i");
    const match = pattern.exec(text);
    if (match) {
      addFinding(
        filePath,
        `exact-local-path${kindSuffix}`,
        chunkStart + match.index * bytesPerCodeUnit
      );
    }
  }
}

function collectExactSensitivePathNeedles() {
  const values = [
    repoRoot,
    process.env.USERPROFILE,
    process.env.HOME,
    process.env.GITHUB_WORKSPACE
  ];
  const publicBuildRoots = new Set([
    ["c:", "users", "runneradmin"].join("/"),
    ["", "home", "privacy"].join("/"),
    ["", "home", "runner"].join("/"),
    ["", "users", "cloudtest"].join("/")
  ]);
  const needles = new Set();
  for (const [index, rawValue] of values.entries()) {
    const value = typeof rawValue === "string" ? rawValue.trim().replace(/[\\/]+$/, "") : "";
    if (value.length < 6) continue;
    const forward = value.replace(/\\/g, "/");
    if (index > 0 && publicBuildRoots.has(forward.toLowerCase())) continue;
    const backward = value.replace(/\//g, "\\");
    needles.add(value);
    needles.add(forward);
    needles.add(backward);
    if (/^[A-Za-z]:\//.test(forward)) {
      needles.add(`file:///${forward}`);
    } else if (forward.startsWith("/")) {
      needles.add(`file://${forward}`);
    }
    if (backward.includes("\\")) {
      needles.add(backward.replace(/\\/g, "\\\\"));
    }
  }
  return [...needles].sort((left, right) => right.length - left.length);
}

function isTextLikeFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (textLikeExtensions.has(extension)) return true;
  return /^(?:license|notice|readme)(?:\.[^.]+)?$/i.test(path.basename(filePath));
}

function isForbiddenPackagedMetadata(filePath) {
  const normalized = relative(filePath).toLowerCase();
  return /(?:^|\/)node_modules\/.*\/\.(?:claude|devcontainer|github|idea|vscode)(?:\/|$)/.test(
    normalized
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findBuffer(filePath, haystack, needle, kind, chunkStart) {
  if (!needle.length) return;
  const index = haystack.indexOf(needle);
  if (index >= 0) addFinding(filePath, kind, chunkStart + index);
}

function addFinding(filePath, kind, offset) {
  const file = relative(filePath);
  if (findings.some((entry) => entry.file === file && entry.kind === kind && entry.offset === offset)) return;
  findings.push({ file, kind, offset });
}

function relative(filePath) {
  return path.relative(repoRoot, filePath).replaceAll(path.sep, "/");
}
