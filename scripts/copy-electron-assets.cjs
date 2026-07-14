const fs = require("node:fs");
const path = require("node:path");

const sourceDir = path.join(__dirname, "..", "electron", "assets");
const targetDir = path.join(__dirname, "..", "dist-electron", "electron", "assets");

if (!fs.existsSync(sourceDir)) {
  process.exit(0);
}

fs.mkdirSync(targetDir, { recursive: true });

for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
  if (!entry.isFile()) {
    continue;
  }
  fs.copyFileSync(path.join(sourceDir, entry.name), path.join(targetDir, entry.name));
}
