import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const collectorSource = readFileSync(
  join(process.cwd(), "scripts", "release", "collect-release-artifacts.cjs"),
  "utf8"
);
const fixtureRoots: string[] = [];

afterEach(() => {
  for (const fixtureRoot of fixtureRoots.splice(0)) {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

function createFixture(
  version: unknown,
  executableNames: string[],
  outputExecutableNames: string[] = [],
  prepareFixture?: (fixtureRoot: string) => void
) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "language-miner-release-collector-"));
  fixtureRoots.push(fixtureRoot);
  const scriptDirectory = join(fixtureRoot, "scripts", "release");
  const releaseDirectory = join(fixtureRoot, "release");
  mkdirSync(scriptDirectory, { recursive: true });
  mkdirSync(releaseDirectory, { recursive: true });
  writeFileSync(join(scriptDirectory, "collect-release-artifacts.cjs"), collectorSource, "utf8");
  writeFileSync(join(fixtureRoot, "package.json"), JSON.stringify({ version }), "utf8");
  for (const executableName of executableNames) {
    writeFileSync(join(releaseDirectory, executableName), executableName, "utf8");
  }
  if (outputExecutableNames.length > 0) {
    const outputDirectory = join(fixtureRoot, "artifacts", "release");
    mkdirSync(outputDirectory, { recursive: true });
    for (const executableName of outputExecutableNames) {
      writeFileSync(join(outputDirectory, executableName), executableName, "utf8");
    }
  }
  prepareFixture?.(fixtureRoot);

  const result = spawnSync(process.execPath, [join(scriptDirectory, "collect-release-artifacts.cjs")], {
    cwd: fixtureRoot,
    encoding: "utf8"
  });
  return { fixtureRoot, result };
}

describe("release artifact collection", () => {
  it("renames the validated installer and portable executable to canonical GitHub-safe names", () => {
    const version = "0.1.0-beta.1";
    const sourceNames = [
      `Language Miner Setup ${version}-x64.exe`,
      `Language Miner Portable ${version}-x64.exe`
    ];
    const { fixtureRoot, result } = createFixture(version, sourceNames);
    const outputDirectory = join(fixtureRoot, "artifacts", "release");

    expect(result.status).toBe(0);
    expect(readdirSync(outputDirectory).sort()).toEqual([
      `Language-Miner-Portable-${version}-x64.exe`,
      `Language-Miner-Setup-${version}-x64.exe`
    ]);
    expect(
      readFileSync(join(outputDirectory, `Language-Miner-Setup-${version}-x64.exe`), "utf8")
    ).toBe(sourceNames[0]);
    expect(
      readFileSync(join(outputDirectory, `Language-Miner-Portable-${version}-x64.exe`), "utf8")
    ).toBe(sourceNames[1]);
  });

  it.each(["0.1.0+private", "01.0.0", "0.1", "0.1.0/unsafe", ""])(
    "rejects unsafe or unexpected package version %j",
    (version) => {
      const { result } = createFixture(version, []);

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        "package.json version must be a safe SemVer value without build metadata"
      );
    }
  );

  it("fails closed when stale or unexpected executables are present", () => {
    const version = "0.1.0-beta.1";
    const { result } = createFixture(version, [
      `Language Miner Setup ${version}-x64.exe`,
      `Language Miner Portable ${version}-x64.exe`,
      "Language Miner Setup 0.1.0-beta.0-x64.exe"
    ]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Unexpected: Language Miner Setup 0.1.0-beta.0-x64.exe");
  });

  it("fails closed instead of leaving a stale executable in release output", () => {
    const version = "0.1.0-beta.1";
    const { result } = createFixture(
      version,
      [
        `Language Miner Setup ${version}-x64.exe`,
        `Language Miner Portable ${version}-x64.exe`
      ],
      ["old-or-untrusted.exe"]
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Release output contains unexpected executable files: old-or-untrusted.exe"
    );
  });

  it("rejects a non-file at an expected canonical output path", () => {
    const version = "0.1.0-beta.1";
    const setupOutputName = `Language-Miner-Setup-${version}-x64.exe`;
    const { result } = createFixture(
      version,
      [
        `Language Miner Setup ${version}-x64.exe`,
        `Language Miner Portable ${version}-x64.exe`
      ],
      [],
      (fixtureRoot) => {
        mkdirSync(join(fixtureRoot, "artifacts", "release", setupOutputName), {
          recursive: true
        });
      }
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      `Release output executable must be a regular file: ${setupOutputName}`
    );
  });
});
