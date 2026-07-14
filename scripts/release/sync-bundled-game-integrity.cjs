const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..", "..");
const packFolders = ["abyss-summoner", "cat-odyssey", "drillheart-defense"];
const ignoredDirectories = new Set([".git", ".vscode", "coverage", "node_modules", "source"]);
const ignoredFiles = new Set([".lem-archive-cache.json", ".lem-snapshot.json", "manifest.json"]);
const checkOnly = process.argv.includes("--check");

for (const folderName of packFolders) {
  const packRoot = path.join(projectRoot, "cartridges", folderName);
  const manifestPath = path.join(packRoot, "manifest.json");
  if (!fs.statSync(packRoot).isDirectory() || !fs.statSync(manifestPath).isFile()) {
    throw new Error(`Bundled game is incomplete: ${folderName}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const files = collectFiles(packRoot);
  const integrityFiles = Object.fromEntries(files.map((file) => [
    file.relativePath,
    createHash("sha256").update(fs.readFileSync(file.absolutePath)).digest("hex")
  ]));
  const nextManifest = {
    ...manifest,
    integrity: { files: integrityFiles }
  };
  const nextText = `${JSON.stringify(nextManifest, null, 2)}\n`;
  const currentIntegrityFiles = manifest.integrity?.files ?? {};
  const integrityMatches =
    Object.keys(currentIntegrityFiles).length === Object.keys(integrityFiles).length &&
    Object.entries(integrityFiles).every(
      ([relativePath, sha256]) => currentIntegrityFiles[relativePath] === sha256
    );

  if (checkOnly) {
    if (!integrityMatches) {
      throw new Error(`Bundled game integrity is stale: ${folderName}`);
    }
  } else if (!integrityMatches) {
    fs.writeFileSync(manifestPath, nextText, "utf8");
  }
}

console.log(`Bundled game integrity ${checkOnly ? "check" : "sync"} passed (${packFolders.length} packs).`);

function collectFiles(packRoot) {
  const files = [];
  visit(packRoot);
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  function visit(folderPath) {
    for (const entry of fs.readdirSync(folderPath, { withFileTypes: true })) {
      const absolutePath = path.join(folderPath, entry.name);
      const relativePath = path.relative(packRoot, absolutePath).replace(/\\/g, "/");
      if (entry.isSymbolicLink()) {
        throw new Error(`Bundled games cannot contain symbolic links: ${relativePath}`);
      }
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) visit(absolutePath);
        continue;
      }
      if (entry.isFile() && !ignoredFiles.has(entry.name)) {
        files.push({ absolutePath, relativePath });
      }
    }
  }
}
