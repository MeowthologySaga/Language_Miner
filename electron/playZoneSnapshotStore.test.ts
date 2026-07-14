import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  authorizeInstalledPlayZoneSnapshot,
  cleanupPlayZoneSnapshotTemps,
  installPlayZoneSnapshot,
  listInstalledPlayZoneSnapshots
} from "./playZoneSnapshotStore";

describe("playZoneSnapshotStore", () => {
  it("does not create an installed root while authorizing a missing runtime entry", () => {
    const parentRoot = temporaryFolder("snapshot-read");
    const missingInstalledRoot = path.join(parentRoot, "play-zone-installed");

    expect(authorizeInstalledPlayZoneSnapshot(
      missingInstalledRoot,
      "lem-playzone-install://pack/missing-installation"
    )).toBeNull();
    expect(fs.existsSync(missingInstalledRoot)).toBe(false);
  });

  it("copies a ready directory into an app-managed snapshot before authorizing it", () => {
    const sourceRoot = createStrictPack("creator.immutable", "Immutable Pack");
    const installedRoot = temporaryFolder("snapshot-installed");
    const installed = installPlayZoneSnapshot(installedRoot, {
      packRootPath: sourceRoot,
      sourceType: "folder",
      fileName: "immutable.lem"
    });

    expect(installed).toMatchObject({ installed: true, bundled: false, status: "ready" });
    expect(installed.sourcePath).toMatch(/^lem-playzone-install:\/\/pack\/pack-/);
    expect(installed.sourcePath).not.toContain(sourceRoot);

    fs.writeFileSync(path.join(sourceRoot, "game", "index.html"), "changed original");
    const authorized = authorizeInstalledPlayZoneSnapshot(installedRoot, installed.entryUrl ?? "");
    expect(authorized).not.toBeNull();
    expect(
      fs.readFileSync(path.join(authorized?.snapshotRootPath ?? "", "game", "index.html"), "utf8")
    ).toContain("strict-pack");
  });

  it("denies stale runtime URLs for a retired Diamond Bistro snapshot", () => {
    const sourceRoot = createStrictPack("lem.diamond-bistro", "Diamond Bistro");
    const installedRoot = temporaryFolder("retired-snapshot-installed");
    const installed = installPlayZoneSnapshot(installedRoot, {
      packRootPath: sourceRoot,
      sourceType: "folder",
      fileName: "diamond-bistro.lem"
    });

    expect(authorizeInstalledPlayZoneSnapshot(installedRoot, installed.entryUrl ?? "")).toBeNull();
    expect(fs.existsSync(sourceRoot)).toBe(true);
  });

  it("removes the replaced snapshot only after the replacement is installed", () => {
    const installedRoot = temporaryFolder("snapshot-replace");
    const first = installPlayZoneSnapshot(installedRoot, {
      packRootPath: createStrictPack("creator.replace", "Replace Pack"),
      sourceType: "folder",
      fileName: "replace-v1.lem"
    });
    const second = installPlayZoneSnapshot(installedRoot, {
      packRootPath: createStrictPack("creator.replace", "Replace Pack", "1.1.0"),
      sourceType: "folder",
      fileName: "replace-v2.lem"
    }, { replaceInstallationId: first.installationId });

    expect(second.installationId).not.toBe(first.installationId);
    expect(listInstalledPlayZoneSnapshots(installedRoot).map((entry) => entry.installationId)).toEqual([
      second.installationId
    ]);
  });

  it("reuses an identical verified snapshot instead of consuming duplicate quota", () => {
    const sourceRoot = createStrictPack("creator.same-pack", "Same Pack");
    const installedRoot = temporaryFolder("snapshot-deduplicate");
    const first = installPlayZoneSnapshot(installedRoot, {
      packRootPath: sourceRoot,
      sourceType: "folder",
      fileName: "same.lem"
    });
    const second = installPlayZoneSnapshot(installedRoot, {
      packRootPath: sourceRoot,
      sourceType: "folder",
      fileName: "same.lem"
    });
    expect(second.installationId).toBe(first.installationId);
    expect(listInstalledPlayZoneSnapshots(installedRoot)).toHaveLength(1);
  });

  it("requires the update flow before installing a different snapshot with the same pack id", () => {
    const installedRoot = temporaryFolder("snapshot-update-required");
    installPlayZoneSnapshot(installedRoot, {
      packRootPath: createStrictPack("creator.update-required", "Update Required", "1.0.0"),
      sourceType: "folder",
      fileName: "v1.lem"
    });
    expect(() => installPlayZoneSnapshot(installedRoot, {
      packRootPath: createStrictPack("creator.update-required", "Update Required", "1.1.0"),
      sourceType: "folder",
      fileName: "v2.lem"
    })).toThrow(/verified update flow/);
  });

  it("enforces count and byte quotas and cleans abandoned staging snapshots", () => {
    const installedRoot = temporaryFolder("snapshot-quota");
    installPlayZoneSnapshot(installedRoot, {
      packRootPath: createStrictPack("creator.quota-one", "Quota One"),
      sourceType: "folder",
      fileName: "one.lem"
    }, { limits: { maxInstalledPacks: 1 } });

    expect(() => installPlayZoneSnapshot(installedRoot, {
      packRootPath: createStrictPack("creator.quota-two", "Quota Two"),
      sourceType: "folder",
      fileName: "two.lem"
    }, { limits: { maxInstalledPacks: 1 } })).toThrow(/count quota/);

    const staleTemp = path.join(installedRoot, ".tmp-abandoned-snapshot");
    fs.mkdirSync(staleTemp);
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    fs.utimesSync(staleTemp, old, old);
    expect(cleanupPlayZoneSnapshotTemps(installedRoot)).toBe(1);
    expect(fs.existsSync(staleTemp)).toBe(false);
  });

  it("refuses to snapshot packs that are warning, quarantined, or blocked", () => {
    const unsafeRoot = temporaryFolder("snapshot-unsafe-source");
    fs.mkdirSync(path.join(unsafeRoot, "game"));
    fs.writeFileSync(path.join(unsafeRoot, "game", "index.html"), "<!doctype html>");
    fs.writeFileSync(path.join(unsafeRoot, "manifest.json"), JSON.stringify({
      contentType: "game_pack",
      id: "creator.legacy",
      title: "Legacy",
      entry: { type: "html", path: "game/index.html" }
    }));
    expect(() => installPlayZoneSnapshot(temporaryFolder("snapshot-unsafe-installed"), {
      packRootPath: unsafeRoot,
      sourceType: "folder",
      fileName: "legacy.lem"
    })).toThrow(/ready or trusted_official/);
  });
});

function createStrictPack(id: string, title: string, version = "1.0.0") {
  const rootPath = temporaryFolder("snapshot-source");
  const runtimeFiles = {
    "game/index.html": "<!doctype html><script src=\"./main.js\"></script><p>strict-pack</p>",
    "game/main.js": "window.snapshotReady = true;"
  };
  for (const [relativePath, contents] of Object.entries(runtimeFiles)) {
    const filePath = path.join(rootPath, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
  }
  fs.writeFileSync(path.join(rootPath, "manifest.json"), JSON.stringify({
    schemaVersion: 1,
    contentType: "game_pack",
    id,
    lineageId: "11111111-1111-4111-8111-111111111111",
    version,
    minPlayZoneVersion: "0.1.0-beta.1",
    title,
    creator: { name: "Creator" },
    license: "CC-BY-4.0",
    sourceUrl: "https://github.com/example/playzone-pack",
    permissions: {
      walletSpend: false,
      storage: true,
      network: false,
      externalLinks: false,
      cardRead: false
    },
    entry: { type: "html", path: "game/index.html" },
    integrity: {
      files: Object.fromEntries(Object.entries(runtimeFiles).map(([name, contents]) => [
        name,
        createHash("sha256").update(contents).digest("hex")
      ]))
    }
  }));
  return rootPath;
}

function temporaryFolder(label: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `lem-playzone-${label}-`));
}
