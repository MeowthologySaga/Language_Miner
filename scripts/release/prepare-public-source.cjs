"use strict";

const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..", "..");
const artifactsRoot = path.join(repoRoot, "artifacts");
const defaultDestination = path.join(artifactsRoot, "public-source");
const auditScript = path.join(__dirname, "audit-public-tree.cjs");
const assetInventoryPath = path.join(repoRoot, "docs", "asset-inventory.md");

const allowedTopLevelFiles = new Set([
  ".gitattributes",
  ".gitignore",
  "CODE_OF_CONDUCT.md",
  "CONTRIBUTING.md",
  "LICENSE",
  "README.en.md",
  "README.md",
  "SECURITY.md",
  "THIRD_PARTY_NOTICES.md",
  "index.html",
  "package-lock.json",
  "package.json",
  "tsconfig.app.json",
  "tsconfig.json",
  "tsconfig.node.json",
  "vite.config.ts"
]);

const allowedTopLevelDirectories = new Set([
  ".github",
  "LICENSES",
  "cartridges",
  "docs",
  "electron",
  "extension",
  "gamekit",
  "public",
  "scripts",
  "src"
]);

const excludedPrefixes = [
  "cartridges/abyss-summoner/",
  "cartridges/cat-odyssey/",
  "cartridges/diamond-bistro/",
  "cartridges/drillheart-defense/",
  "docs/backlog/",
  "docs/assets/",
  "docs/character-chat/",
  "docs/economy/",
  "docs/en/",
  "docs/game-play/",
  "artifacts/",
  "debug/",
  "dist/",
  "dist-electron/",
  "exports/",
  "node_modules/",
  "release/"
];

const excludedExactPaths = new Set([
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
  "public/playzone/LanguageMinerGameKit.zip",
  "scripts/generate-hobbit-layout-fixtures.mjs"
]);

try {
  main();
} catch (error) {
  process.stderr.write(`${toSafeReleaseErrorMessage(error)}\n`);
  process.exitCode = 1;
}

function main() {
  const destination = readDestination(process.argv.slice(2));
  assertSafeDestination(destination);
  clearDestination(destination);
  assertAuditedGitBaseline();
  assertAssetInventoryReady();

  const files = listCandidateFiles().filter(isPublicSourcePath);
  if (files.length === 0) {
    throw new Error("No eligible public-source files were found.");
  }

  fs.mkdirSync(destination, { recursive: true });
  const manifestFiles = [];
  for (const relativePath of files) {
    const sourcePath = path.join(repoRoot, relativePath);
    const destinationPath = path.join(destination, relativePath);
    const sourceStat = fs.lstatSync(sourcePath);
    if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
      throw new Error(`Public staging accepts regular files only: ${relativePath}`);
    }
    const bytes = fs.readFileSync(sourcePath);
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.writeFileSync(destinationPath, bytes);
    manifestFiles.push({
      path: normalize(relativePath),
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex")
    });
  }

  const manifest = {
    schemaVersion: 1,
    appVersion: require(path.join(repoRoot, "package.json")).version,
    generatedAt: new Date().toISOString(),
    source: "audited working tree (private Git history excluded)",
    files: manifestFiles
  };
  fs.writeFileSync(
    path.join(destination, "PUBLIC_TREE_MANIFEST.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );

  try {
    runPublicTreeAudit(destination);
  } catch (error) {
    fs.rmSync(destination, { recursive: true, force: true });
    throw error;
  }

  process.stdout.write(
    `Prepared ${manifestFiles.length} audited file(s) in ${path.relative(repoRoot, destination)}.\n`
  );
}

function readDestination(args) {
  if (args.length === 0) return defaultDestination;
  if (args.length !== 2 || args[0] !== "--destination" || !args[1]) {
    throw new Error("Usage: node prepare-public-source.cjs [--destination <path-under-artifacts>]");
  }
  return path.resolve(repoRoot, args[1]);
}

function assertSafeDestination(destination) {
  const relative = path.relative(artifactsRoot, destination);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("The public staging destination must be a child of artifacts/.");
  }
  if (destination === repoRoot || destination === artifactsRoot) {
    throw new Error("Refusing to replace the repository or artifacts root.");
  }
}

function assertAssetInventoryReady() {
  const inventory = fs.readFileSync(assetInventoryPath, "utf8");
  const blockedRows = inventory
    .split(/\r?\n/)
    .filter(
      (line) =>
        line.startsWith("|") &&
        /\*\*(?:Block(?:ed)?|Review)\b/i.test(line)
    );
  if (blockedRows.length > 0) {
    throw new Error(
      `Public staging is blocked by ${blockedRows.length} unresolved Block/Review asset-inventory row(s). Confirm or exclude them first.`
    );
  }
}

function runPublicTreeAudit(destination) {
  const result = spawnSync(process.execPath, [auditScript, "--root", destination], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    throw new Error("The public-tree audit failed; no staging directory was created.");
  }
}

function listCandidateFiles() {
  const result = spawnSync(
    "git",
    ["ls-files", "--cached", "-z"],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  );
  if (result.status !== 0) {
    throw new Error(
      result.stderr || result.error?.message || "Unable to enumerate the Git worktree."
    );
  }
  return result.stdout
    .split("\0")
    .map((value) => normalize(value.trim()))
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

function assertAuditedGitBaseline() {
  const trackedStatus = spawnSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=no", "-z"],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  );
  if (trackedStatus.status !== 0) {
    throw new Error(
      trackedStatus.stderr || trackedStatus.error?.message || "Unable to inspect the Git baseline."
    );
  }
  if (trackedStatus.stdout) {
    throw new Error(
      "Public staging requires a clean tracked Git baseline. Commit and audit the private checkpoint first."
    );
  }

  const untracked = spawnSync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "-z"],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
  );
  if (untracked.status !== 0) {
    throw new Error(
      untracked.stderr || untracked.error?.message || "Unable to inspect untracked files."
    );
  }
  const publicCandidates = untracked.stdout
    .split("\0")
    .map((value) => normalize(value.trim()))
    .filter(Boolean)
    .filter(isPublicSourcePath);
  if (publicCandidates.length > 0) {
    throw new Error(
      `Public staging found ${publicCandidates.length} untracked public-source candidate(s). Audit and commit or exclude them first.`
    );
  }
}

function isPublicSourcePath(relativePath) {
  if (
    excludedExactPaths.has(relativePath) ||
    excludedPrefixes.some((prefix) => relativePath.startsWith(prefix))
  ) {
    return false;
  }
  const [topLevel, ...rest] = relativePath.split("/");
  if (rest.length === 0) {
    return allowedTopLevelFiles.has(topLevel);
  }
  return allowedTopLevelDirectories.has(topLevel);
}

function clearDestination(destination) {
  if (fs.existsSync(destination)) {
    const relative = path.relative(artifactsRoot, destination);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Refusing to clear a destination outside artifacts/.");
    }
    fs.rmSync(destination, { recursive: true, force: true });
  }
}

function normalize(value) {
  return value.replace(/\\/g, "/");
}

function toSafeReleaseErrorMessage(error) {
  const fallback = "Public source staging failed.";
  const message = error instanceof Error && error.message ? error.message : fallback;
  const sensitiveRoots = [repoRoot, process.env.USERPROFILE, process.env.HOME]
    .filter((value) => typeof value === "string" && value.length >= 6)
    .flatMap((value) => [value, value.replace(/\\/g, "/"), value.replace(/\//g, "\\")]);
  return sensitiveRoots.reduce(
    (safeMessage, sensitiveRoot) => safeMessage.replaceAll(sensitiveRoot, "[LOCAL PATH REDACTED]"),
    message
  );
}
