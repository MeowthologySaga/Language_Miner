const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const findings = [];
const commits = runGit(["rev-list", "--all"]).trim().split(/\r?\n/).filter(Boolean);
const allowedEmailDomains = new Set([
  "example.com",
  "example.net",
  "example.org",
  "github.com",
  "npmjs.com",
  "users.noreply.github.com"
]);
const bannedPathPattern = /(^|\/)(?:\.npmrc$|[^/]*\.(?:7z|backup|bak|db|db3|jks|key|keystore|lembackup|log|p12|pem|pfx|rar|sqlite|sqlite3|sqlite-shm|sqlite-wal|zip)$|\.agents(?:\/|$)|\.codex(?:\/|$)|\.tmp(?:\/|$)|tmp(?:\/|$)|docs\/backlog(?:\/|$)|docs\/content\/open-card-sources\.md$|docs\/media-capture-plan\.md$|docs\/release\/(?:feature-matrix|name-and-trademark-check|name-clearance|public-promotion|SCREENSHOT_PLAN\.ko)\.md$|docs\/tutorial-outline\.ko\.md$|docs\/ugc\/(?:agent-authoring-guide|character-pack-spec|diamond-bistro-animoca-target|diamond-economy-contract|game-pack-spec|playzone-cartridge-system|ugc-package-spec|ugc-security-model)\.md$|docs\/youtube-script\.ko\.md$|private(?:\/|$)|secrets?(?:\/|$))/i;
const envFilePattern = /(^|\/)\.env(?:\.|$)/i;
const envExamplePattern = /(^|\/)\.env(?:\.[^/]+)?\.example$/i;
const contentPatterns = [
  ["google-api-key", "AIza[0-9A-Za-z_-]{25,}"],
  ["github-token", "(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}"],
  ["github-fine-grained-token", "github_pat_[A-Za-z0-9_]{40,}"],
  ["openai-api-key", "sk-(proj-)?[A-Za-z0-9_-]{32,}"],
  ["aws-access-key", "(AKIA|ASIA)[A-Z0-9]{16}"],
  ["private-key", "-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----"],
  ["local-windows-user-path", "[A-Za-z]:[\\\\/]Users[\\\\/][^\\\\/[:space:]'\"<>]+[\\\\/]"],
  ["local-unix-user-path", "/(Users|home)/[^/[:space:]'\"<>]+/"],
  ["email-address", "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b"]
];

for (const commit of commits) {
  const paths = runGit(["ls-tree", "-r", "--name-only", commit])
    .split(/\r?\n/)
    .filter(Boolean);
  for (const filePath of paths) {
    if (
      bannedPathPattern.test(filePath) ||
      (envFilePattern.test(filePath) && !envExamplePattern.test(filePath))
    ) {
      add(commit, filePath, "banned-history-path");
    }
  }
  for (const [kind, pattern] of contentPatterns) {
    const result = spawnSync(
      "git",
      ["grep", "-n", "-a", "-o", "-E", "-e", pattern, commit, "--"],
      { cwd: repoRoot, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
    );
    if (result.status !== 0 && result.status !== 1) {
      throw result.error || new Error(result.stderr || `git grep failed for ${kind}`);
    }
    for (const line of result.stdout.split(/\r?\n/).filter(Boolean)) {
      const withoutCommit = line.startsWith(`${commit}:`) ? line.slice(commit.length + 1) : line;
      const parsed = parseGrepLine(withoutCommit);
      const filePath = parsed.filePath;
      const location = `${filePath}:${parsed.lineNumber}`;
      if (kind === "email-address") {
        if (/(?:^|\/)package-lock\.json$/i.test(filePath)) continue;
        const emailRegex = /\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi;
        for (const match of parsed.content.matchAll(emailRegex)) {
          if (!isAllowedEmailDomain(match[1].toLowerCase())) {
            add(commit, location, "review-personal-email");
          }
        }
        continue;
      }
      if (
        (kind === "local-windows-user-path" || kind === "local-unix-user-path") &&
        /(?:^|\/)(?:[^/]+\.)?(?:test|spec)\.[cm]?[jt]sx?$/i.test(filePath)
      ) {
        continue;
      }
      add(commit, location, kind);
    }
  }
}

const githubNoreplyEmail = ["noreply", "github.com"].join("@");
const privateCommitMarkerAlternatives = [
  ["private", "note"].join(" "),
  ["do", "not", "publish"].join(" "),
  ["do", "not", "publish"].join("-")
].join("|");
const privateCommitMarkerPattern = new RegExp(
  `\\b(?:${privateCommitMarkerAlternatives})\\b`,
  "i"
);
const metadata = runGit(["log", "--all", "--format=%H%x09%ae%x09%B%x1e"]);
for (const record of metadata.split("\x1e")) {
  const [header = ""] = record.trim().split(/\r?\n/, 1);
  if (!header) continue;
  const [commit = "unknown", email = ""] = header.split("\t");
  if (
    email &&
    !email.endsWith("@users.noreply.github.com") &&
    email !== "codex@local" &&
    email !== githubNoreplyEmail
  ) {
    add(commit, "commit metadata", "personal-commit-email");
  }
  if (privateCommitMarkerPattern.test(record)) {
    add(commit, "commit metadata", "private-commit-marker");
  }
}

if (findings.length) {
  process.stderr.write(`Git history audit failed with ${findings.length} finding(s):\n`);
  for (const finding of findings.slice(0, 80)) {
    process.stderr.write(`- ${finding.commit.slice(0, 12)} ${finding.location} [${finding.kind}]\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write(`Git history audit passed (${commits.length} commits scanned).\n`);
}

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.status !== 0) throw result.error || new Error(result.stderr || `git ${args[0]} failed`);
  return result.stdout;
}

function add(commit, location, kind) {
  if (findings.some((item) => item.commit === commit && item.location === location && item.kind === kind)) return;
  findings.push({ commit, location, kind });
}

function parseGrepLine(value) {
  const first = value.indexOf(":");
  const second = first >= 0 ? value.indexOf(":", first + 1) : -1;
  if (first < 0 || second < 0) {
    return { filePath: value || "unknown", lineNumber: "?", content: "" };
  }
  return {
    filePath: value.slice(0, first) || "unknown",
    lineNumber: value.slice(first + 1, second) || "?",
    content: value.slice(second + 1)
  };
}

function isAllowedEmailDomain(domain) {
  return (
    allowedEmailDomains.has(domain) ||
    /(?:^|\.)(?:example|invalid|localhost|test)$/.test(domain)
  );
}
