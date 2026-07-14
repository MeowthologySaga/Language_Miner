import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { inspectPlayZonePack, normalizePackRelativePath } from "./playZoneManifest";

describe("playZoneManifest", () => {
  it("promotes a verified built-in pack only when trust is supplied by the host", () => {
    const packPath = createPack();
    expect(inspectPlayZonePack(packPath).securityReport.status).toBe("ready");
    expect(inspectPlayZonePack(packPath, { trustedOfficial: true }).securityReport.status).toBe(
      "trusted_official"
    );
  });

  it("blocks undeclared files and integrity mismatches", () => {
    const undeclared = createPack();
    fs.writeFileSync(path.join(undeclared, "game", "extra.js"), "surprise");
    expect(inspectPlayZonePack(undeclared).securityReport).toMatchObject({ status: "blocked" });
    expect(inspectPlayZonePack(undeclared).securityReport.issues.map((item) => item.code)).toContain(
      "integrity_file_unlisted"
    );

    const tampered = createPack();
    fs.writeFileSync(path.join(tampered, "game", "index.html"), "tampered");
    expect(inspectPlayZonePack(tampered).securityReport.issues.map((item) => item.code)).toContain(
      "integrity_mismatch"
    );
  });

  it("rejects absolute, traversal, alternate-stream, and non-canonical paths", () => {
    expect(normalizePackRelativePath("../outside.html")).toBe("");
    expect(normalizePackRelativePath("C:/outside.html")).toBe("");
    expect(normalizePackRelativePath("game/file.html:secret")).toBe("");
    expect(normalizePackRelativePath("game//index.html")).toBe("");
    expect(normalizePackRelativePath("game/index.html")).toBe("game/index.html");
  });

  it("blocks an SVG document declared as the executable entry", () => {
    const packPath = createPack();
    const manifestPath = path.join(packPath, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      entry: { type: string; path: string };
      integrity: { files: Record<string, string> };
    };
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
    fs.writeFileSync(path.join(packPath, "game", "entry.svg"), svg);
    manifest.entry = { type: "html", path: "game/entry.svg" };
    manifest.integrity.files["game/entry.svg"] = createHash("sha256").update(svg).digest("hex");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));

    const report = inspectPlayZonePack(packPath).securityReport;
    expect(report.status).toBe("blocked");
    expect(report.issues.map((item) => item.code)).toContain("entry_path_invalid");
  });

  it("blocks unknown permission capabilities instead of silently ignoring them", () => {
    const packPath = createPack();
    const manifestPath = path.join(packPath, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      permissions: Record<string, boolean>;
    };
    manifest.permissions.filesystem = true;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));

    const report = inspectPlayZonePack(packPath).securityReport;
    expect(report.status).toBe("blocked");
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: "permissions_missing",
      severity: "error"
    }));
  });

  it("treats a beta host as older than the matching stable release", () => {
    const packPath = createPack("0.1.0");
    const betaIssues = inspectPlayZonePack(packPath, { appVersion: "0.1.0-beta.1" })
      .securityReport.issues.map((item) => item.code);
    const stableIssues = inspectPlayZonePack(packPath, { appVersion: "0.1.0" })
      .securityReport.issues.map((item) => item.code);

    expect(betaIssues).toContain("app_version_too_old");
    expect(stableIssues).not.toContain("app_version_too_old");
  });
});

function createPack(minPlayZoneVersion = "0.1.0-beta.1") {
  const rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "lem-playzone-manifest-"));
  const files = {
    "game/index.html": "<!doctype html>",
    "game/main.js": "window.ok = true;"
  };
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(rootPath, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  fs.writeFileSync(path.join(rootPath, "manifest.json"), JSON.stringify({
    schemaVersion: 1,
    contentType: "game_pack",
    id: "creator.safe-pack",
    lineageId: "11111111-1111-4111-8111-111111111111",
    version: "1.0.0",
    minPlayZoneVersion,
    title: "Safe Pack",
    creator: { name: "Creator" },
    license: "CC-BY-4.0",
    sourceUrl: "https://github.com/example/safe-pack",
    permissions: {
      walletSpend: false,
      storage: false,
      network: false,
      externalLinks: false,
      cardRead: false
    },
    entry: { type: "html", path: "game/index.html" },
    integrity: {
      files: Object.fromEntries(
        Object.entries(files).map(([name, content]) => [
          name,
          createHash("sha256").update(content).digest("hex")
        ])
      )
    }
  }));
  return rootPath;
}
