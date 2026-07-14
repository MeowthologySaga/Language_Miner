import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const scannerPath = join(repoRoot, "scripts", "release", "scan-build-artifacts.cjs");
const publicAuditPath = join(repoRoot, "scripts", "release", "audit-public-tree.cjs");
const publicStagingSource = readFileSync(
  join(repoRoot, "scripts", "release", "prepare-public-source.cjs"),
  "utf8"
);
const checksumPath = join(repoRoot, "scripts", "release", "write-checksums.cjs");
const expandedReleaseScanSource = readFileSync(
  join(repoRoot, "scripts", "release", "extract-release-for-scan.ps1"),
  "utf8"
);
const releaseWorkflowSource = readFileSync(
  join(repoRoot, ".github", "workflows", "release.yml"),
  "utf8"
);
const windowsArtifactSmokeSource = readFileSync(
  join(repoRoot, "scripts", "release", "smoke-windows-artifacts.ps1"),
  "utf8"
);
const appSmokeQaSource = readFileSync(
  join(repoRoot, "electron", "appSmokeQa.ts"),
  "utf8"
);
const workRoot = mkdtempSync(join(tmpdir(), "language-miner-release-gates-"));

afterAll(() => {
  rmSync(workRoot, { recursive: true, force: true });
});

describe("release artifact scan boundaries", () => {
  it("fails closed when a requested scan root does not exist", () => {
    const result = runScanner(join(workRoot, "missing"));

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("missing-scan-root");
    expect(result.stderr).toContain("no-files-scanned");
  });

  it("detects a build canary stored as a Windows UTF-16LE string", () => {
    const canary = "LEM-UTF16-CANARY-RELEASE-GATE";
    const fixturePath = join(workRoot, "wide-string.bin");
    writeFileSync(fixturePath, Buffer.from(canary, "utf16le"));

    const result = runScanner(fixturePath, { LEM_BUILD_CANARY: canary });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("build-canary-utf16le");
  });

  it("allows broad vendor build paths inside native binaries", () => {
    const fixtureRoot = join(workRoot, "vendor-binary-paths");
    const fixturePath = join(fixtureRoot, "chromium.exe");
    const vendorBinaryPaths = [
      ["", "home", "privacy", "chromium", "src"].join("/"),
      ["C:", "Users", "runneradmin", "work", "native"].join("\\"),
      ["", "Users", "cloudtest", "build"].join("/")
    ];
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(
      fixturePath,
      Buffer.from(`\0${vendorBinaryPaths.join("\0")}\0`, "utf8")
    );

    const result = runScanner(fixtureRoot, privatePathEnvironment());

    expect(result.status).toBe(0);
  });

  it("still rejects exact current profile and workspace paths inside binaries", () => {
    const fixtureRoot = join(workRoot, "exact-private-binary-path");
    const fixturePath = join(fixtureRoot, "vendor.node");
    const environment = privatePathEnvironment();
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(
      fixturePath,
      Buffer.from(
        `\0${environment.USERPROFILE}\\AppData\\private.db\0${environment.GITHUB_WORKSPACE}\\cache\0`,
        "utf8"
      )
    );

    const result = runScanner(fixtureRoot, environment);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("[exact-local-path]");
  });

  it("keeps real provider key detection enabled for native binaries", () => {
    const fixtureRoot = join(workRoot, "native-secret");
    const fixturePath = join(fixtureRoot, "provider.dll");
    const fakeGoogleKey = ["AI", "za", "S".repeat(35)].join("");
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(fixturePath, Buffer.from(`\0${fakeGoogleKey}\0`, "utf8"));

    const result = runScanner(fixtureRoot, privatePathEnvironment());

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("[google-api-key]");
  });

  it("rejects packaged dot-development metadata even when its contents are harmless", () => {
    const fixtureRoot = join(
      workRoot,
      "packaged-metadata",
      "node_modules",
      "i18next",
      ".claude"
    );
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(join(fixtureRoot, "settings.local.json"), "{}\n", "utf8");

    const result = runScanner(join(workRoot, "packaged-metadata"), privatePathEnvironment());

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("[forbidden-packaged-metadata]");
  });

  it("continues applying broad local path checks to expanded source files", () => {
    const fixtureRoot = join(workRoot, "expanded-source");
    const broadSourcePath = ["", "home", "privacy", "chromium", "src", ""].join("/");
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(
      join(fixtureRoot, "bundle.js"),
      `const buildRoot = "${broadSourcePath}";\n`,
      "utf8"
    );

    const result = runScanner(fixtureRoot, privatePathEnvironment());

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("[local-unix-user-path]");
  });
});

describe("Electron release payload boundaries", () => {
  it("excludes development metadata and non-Windows-x64 ONNX payloads", () => {
    const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
    const files = packageJson.build.files as string[];

    for (const exclusion of [
      "!node_modules/**/.claude/**",
      "!node_modules/**/.devcontainer/**",
      "!node_modules/**/.github/**",
      "!node_modules/**/.idea/**",
      "!node_modules/**/.vscode/**",
      "!node_modules/**/{__tests__,doc,docs,example,examples,test,tests}/**",
      "!node_modules/**/*.{d.ts,md,markdown,map,ts,tsx}",
      "!node_modules/**/onnxruntime-node/bin/**/darwin/**",
      "!node_modules/**/onnxruntime-node/bin/**/linux/**",
      "!node_modules/**/onnxruntime-node/bin/**/win32/arm64/**"
    ]) {
      expect(files).toContain(exclusion);
    }
    expect(
      files.some(
        (entry) => entry.startsWith("!") && /onnxruntime-node.*win32\/x64/i.test(entry)
      )
    ).toBe(false);
  });

  it("keeps on-demand PlayZone games out of ASAR while requiring their release assets", () => {
    expect(expandedReleaseScanSource).toContain(
      "PlayZone cartridges must not be included in a Windows artifact"
    );
    expect(expandedReleaseScanSource).toContain("abyss-summoner-0.1.2.lemgame");
    expect(expandedReleaseScanSource).toContain("cat-odyssey-0.1.1.lemgame");
    expect(expandedReleaseScanSource).toContain("drillheart-defense-0.2.0.lemgame");
    expect(expandedReleaseScanSource).not.toContain(
      "Bundled PlayZone file is missing from a Windows artifact"
    );
  });

  it("publishes only from the public repository and archives the audited staging tree", () => {
    expect(releaseWorkflowSource).toContain(
      "github.event.repository.visibility == 'public'"
    );
    expect(releaseWorkflowSource).toContain('Resolve-Path -LiteralPath "artifacts/public-source"');
    expect(releaseWorkflowSource).not.toContain("git archive");
  });

  it("attests every final release asset only after games, source, SBOM, and checksums are staged", () => {
    const attestationStep = releaseWorkflowSource.indexOf(
      "Generate build provenance for every release file"
    );

    expect(attestationStep).toBeGreaterThan(
      releaseWorkflowSource.indexOf("Generate release SBOM and license report")
    );
    expect(attestationStep).toBeGreaterThan(
      releaseWorkflowSource.indexOf("Package manual-install browser extension")
    );
    expect(attestationStep).toBeGreaterThan(
      releaseWorkflowSource.indexOf("Stage the already-verified official games")
    );
    expect(attestationStep).toBeGreaterThan(
      releaseWorkflowSource.indexOf("Create complete source archives")
    );
    expect(attestationStep).toBeGreaterThan(
      releaseWorkflowSource.indexOf("Write release notes and SHA-256 checksums")
    );
    expect(releaseWorkflowSource).toContain(
      "uses: actions/attest@a1948c3f048ba23858d222213b7c278aabede763 # v4"
    );
    expect(releaseWorkflowSource).toContain("subject-path: artifacts/release/*");
  });

  it("hydrates official games from their immutable public releases instead of duplicating them in the app source tree", () => {
    expect(releaseWorkflowSource).toMatch(
      /Verify and hydrate official games from their own locked releases[\s\S]*?run: npm run games:hydrate-official\r?\n/
    );
    expect(releaseWorkflowSource).toContain(
      "games:hydrate-official -- --offline --publish-to-release"
    );
    expect(releaseWorkflowSource).toContain("smoke-windows-artifacts.ps1");
    expect(releaseWorkflowSource).toContain("-BaselineReleaseDirectory release-baseline");
    expect(releaseWorkflowSource).toContain("-OfficialGames");
    expect(windowsArtifactSmokeSource).toContain(
      'LM_QA_PLAYZONE_OFFICIAL_GAMES = "1"'
    );
    expect(windowsArtifactSmokeSource).toContain(
      '$officialCheck.mode -ne "download-install-runtime"'
    );
    for (const folder of ["abyss-summoner", "cat-odyssey", "drillheart-defense"]) {
      expect(publicStagingSource).toContain(`\"cartridges/${folder}/\"`);
    }
  });

  it("tests a real synthetic-version upgrade separately from same-version repair", () => {
    expect(releaseWorkflowSource).toContain(
      "--config.directories.output=release-baseline --config.extraMetadata.version=0.1.0-beta.0"
    );
    expect(windowsArtifactSmokeSource).toContain('$BaselineVersion = "0.1.0-beta.0"');
    expect(windowsArtifactSmokeSource).toContain('-LifecyclePhase "baseline"');
    expect(windowsArtifactSmokeSource).toContain('-LifecyclePhase "upgraded"');
    expect(windowsArtifactSmokeSource).toContain('-LifecyclePhase "repair"');
    expect(windowsArtifactSmokeSource).toContain(
      "Installing the exact same beta.1 artifact is a repair, not an update."
    );
    expect(windowsArtifactSmokeSource).not.toContain("update/repair");
    expect(windowsArtifactSmokeSource).toContain(
      "The beta.1 upgrade did not replace the synthetic beta.0 ASAR payload."
    );
  });

  it("proves onboarding, settings, and a database card survive upgrade and repair", () => {
    expect(appSmokeQaSource).toContain('LM_QA_UPGRADE_PHASE');
    expect(appSmokeQaSource).toContain('id: "qa:upgrade:0.1.0-beta.0"');
    expect(appSmokeQaSource).toContain('settings.providerName === "mock"');
    expect(appSmokeQaSource).toContain('localStorage.getItem("lem:onboarding:v2:completed")');
    expect(windowsArtifactSmokeSource).toContain("Assert-UpgradeDataMarkers");
    expect(windowsArtifactSmokeSource).toContain('"app-onboarding-state.json"');
    expect(windowsArtifactSmokeSource).toContain('"local-english-miner.sqlite"');
    expect(windowsArtifactSmokeSource).toContain('"Local Storage/leveldb"');
    expect(windowsArtifactSmokeSource).toContain(
      '$lifecycle.onboardingInitiallyVisible -ne $expectedOnboardingVisible'
    );
  });

  it("requires one stable install identity and removes the full install folder on uninstall", () => {
    expect(windowsArtifactSmokeSource).toContain(
      'packageJson.build.appId -ne "io.github.meowthologysaga.languageminer"'
    );
    expect(windowsArtifactSmokeSource).toContain(
      "$upgradedRegistration.KeyName -ne $baselineRegistration.KeyName"
    );
    expect(windowsArtifactSmokeSource).toContain(
      "The beta.1 upgrade installed to a second path instead of replacing beta.0 in place."
    );
    expect(windowsArtifactSmokeSource).toContain("Assert-NoUnexpectedDefaultInstall");
    expect(windowsArtifactSmokeSource).toContain(
      "The beta.1 repair created a duplicate uninstall registration."
    );
    expect(windowsArtifactSmokeSource).toContain(
      "The silent uninstaller left the installation folder behind"
    );
    expect(windowsArtifactSmokeSource).toContain(
      "The uninstaller unexpectedly removed the user's upgrade sentinel."
    );
    expect(windowsArtifactSmokeSource).toContain('Label "portable-ko-min"');
    expect(windowsArtifactSmokeSource).toContain('Label "portable-en-wide"');
  });
});

describe("public source audit boundaries", () => {
  it("stages tracked files only and requires an audited clean baseline", () => {
    expect(publicStagingSource).toContain("assertAuditedGitBaseline();");
    expect(publicStagingSource).toContain('["ls-files", "--cached", "-z"]');
    expect(publicStagingSource).not.toContain(
      '["ls-files", "--cached", "--others", "--exclude-standard", "-z"]'
    );
    expect(publicStagingSource).toContain('"--untracked-files=no"');
  });

  it("blocks both Review rows and every Blocked spelling in the asset inventory", () => {
    expect(publicStagingSource).toContain("Block(?:ed)?|Review");
    expect(publicStagingSource).toContain(".test(line)");
  });

  it("publishes complete manuals while blocking any reintroduced screenshot slots", () => {
    for (const fileName of ["complete-user-manual.ko.md", "complete-user-manual.en.md"]) {
      expect(publicStagingSource).not.toContain(`"docs/${fileName}"`);
    }

    const fixtureRoot = join(workRoot, "unfinished-public-manual");
    mkdirSync(join(fixtureRoot, "docs"), { recursive: true });
    writeFileSync(
      join(fixtureRoot, "docs", "complete-user-manual.en.md"),
      "SCREENSHOT-ID: replace before publication\n",
      "utf8"
    );
    const blocked = runPublicAudit(fixtureRoot);
    expect(blocked.status).not.toBe(0);
    expect(blocked.stderr).toContain("[unfinished-public-document]");
  });

  it("rejects unfinished capture markers from any otherwise public document", () => {
    const fixtureRoot = join(workRoot, "unfinished-public-guide");
    mkdirSync(join(fixtureRoot, "docs"), { recursive: true });
    writeFileSync(
      join(fixtureRoot, "docs", "user-guide.en.md"),
      "# Guide\n\nSCREENSHOT-ID: replace before publication\n",
      "utf8"
    );
    const blocked = runPublicAudit(fixtureRoot);
    expect(blocked.status).not.toBe(0);
    expect(blocked.stderr).toContain("[unfinished-public-document]");
  });

  it("requires local Markdown images to exist inside the public tree", () => {
    const fixtureRoot = join(workRoot, "public-document-images");
    const docsRoot = join(fixtureRoot, "docs");
    mkdirSync(docsRoot, { recursive: true });
    writeFileSync(join(docsRoot, "guide.md"), "![Screen](images/screen.png)\n", "utf8");

    const missing = runPublicAudit(fixtureRoot);
    expect(missing.status).not.toBe(0);
    expect(missing.stderr).toContain("[missing-public-document-image]");

    mkdirSync(join(docsRoot, "images"), { recursive: true });
    writeFileSync(join(docsRoot, "images", "screen.png"), "safe fixture", "utf8");
    expect(runPublicAudit(fixtureRoot).status).toBe(0);

    writeFileSync(join(docsRoot, "guide.md"), "![Outside](../../outside.png)\n", "utf8");
    const escaped = runPublicAudit(fixtureRoot);
    expect(escaped.status).not.toBe(0);
    expect(escaped.stderr).toContain("[unsafe-public-document-image-link]");
  });

  it("rejects truncated tool output and missing local Markdown links", () => {
    const fixtureRoot = join(workRoot, "public-document-links");
    const docsRoot = join(fixtureRoot, "docs");
    mkdirSync(docsRoot, { recursive: true });
    writeFileSync(
      join(docsRoot, "guide.md"),
      "[Guide](missing.md)\n\n…17910 tokens truncated…\n",
      "utf8"
    );

    const blocked = runPublicAudit(fixtureRoot);
    expect(blocked.status).not.toBe(0);
    expect(blocked.stderr).toContain("[missing-public-document-link]");
    expect(blocked.stderr).toContain("[truncated-tool-output-marker]");

    writeFileSync(join(docsRoot, "target.md"), "# Target\n", "utf8");
    writeFileSync(join(docsRoot, "guide.md"), "[Guide](target.md)\n", "utf8");
    expect(runPublicAudit(fixtureRoot).status).toBe(0);

    writeFileSync(join(docsRoot, "guide.md"), "[Guide](Target.md)\n", "utf8");
    const wrongCase = runPublicAudit(fixtureRoot);
    expect(wrongCase.status).not.toBe(0);
    expect(wrongCase.stderr).toContain("[missing-public-document-link]");
  });

  it("allows only value-free .env example files", () => {
    const fixtureRoot = join(workRoot, "env-example-fixture");
    const fixturePath = join(fixtureRoot, ".env.production.example");
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(fixturePath, "# Configure providers inside the app.\n", "utf8");

    const allowed = runPublicAudit(fixtureRoot);
    expect(allowed.status).toBe(0);

    writeFileSync(
      fixturePath,
      `${["VITE", "PROVIDER", "TOKEN"].join("_")}=must-not-ship\n`,
      "utf8"
    );
    const blocked = runPublicAudit(fixtureRoot);
    expect(blocked.status).not.toBe(0);
    expect(blocked.stderr).toContain("[nonempty-env-example]");
  });

  it("scans large binary and UTF-16LE content instead of skipping it", () => {
    const fixtureRoot = join(workRoot, "public-binary-fixture");
    const fixturePath = join(fixtureRoot, "large.bin");
    const fakeGoogleKey = ["AI", "za", "A".repeat(35)].join("");
    const bytes = Buffer.alloc(6 * 1024 * 1024);
    Buffer.from(fakeGoogleKey, "utf16le").copy(bytes, 1024);
    mkdirSync(fixtureRoot, { recursive: true });
    writeFileSync(fixturePath, bytes, { flag: "wx" });

    const result = runPublicAudit(fixtureRoot);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("[google-api-key]");
  });

  it("does not treat compressed-media bytes as a user address but still detects provider keys", () => {
    const fixtureRoot = join(workRoot, "public-media-fixture");
    const fixturePath = join(fixtureRoot, "sample.mp3");
    mkdirSync(fixtureRoot, { recursive: true });
    const compressedEmailShape = ["random", "5.ll"].join("@");
    writeFileSync(
      fixturePath,
      Buffer.from(`ID3\0${compressedEmailShape}\0compressed-media`, "latin1")
    );

    const allowed = runPublicAudit(fixtureRoot);
    expect(allowed.status).toBe(0);

    const fakeGoogleKey = ["AI", "za", "B".repeat(35)].join("");
    writeFileSync(fixturePath, Buffer.from(`ID3\0${fakeGoogleKey}\0`, "latin1"));
    const blocked = runPublicAudit(fixtureRoot);

    expect(blocked.status).not.toBe(0);
    expect(blocked.stderr).toContain("[google-api-key-in-binary]");
  });

  it("allows upstream author emails only in third-party license notices", () => {
    const fixtureRoot = join(workRoot, "public-license-email-fixture");
    const licenseRoot = join(fixtureRoot, "licenses");
    const upstreamEmail = ["vendor.author", "gmail.com"].join("@");
    mkdirSync(licenseRoot, { recursive: true });
    writeFileSync(
      join(licenseRoot, "VENDOR-1.0.txt"),
      `Upstream maintainer: ${upstreamEmail}\n`,
      "utf8"
    );

    const allowed = runPublicAudit(fixtureRoot);
    expect(allowed.status).toBe(0);

    writeFileSync(
      join(fixtureRoot, "application-source.txt"),
      `Personal contact: ${upstreamEmail}\n`,
      "utf8"
    );
    const blocked = runPublicAudit(fixtureRoot);
    expect(blocked.status).not.toBe(0);
    expect(blocked.stderr).toContain("[review-personal-email]");
  });
});

describe("release checksum output", () => {
  it("writes SHA-256 entries for every release file except the checksum file itself", () => {
    const artifactsRoot = join(repoRoot, "artifacts");
    mkdirSync(artifactsRoot, { recursive: true });
    const fixtureRoot = mkdtempSync(join(artifactsRoot, "release-checksum-test-"));
    const relativeFixtureRoot = fixtureRoot.slice(repoRoot.length + 1);
    const files = new Map([
      ["Language Miner Setup.exe", "installer"],
      ["Language Miner Portable.exe", "portable"]
    ]);
    try {
      for (const [name, content] of files) {
        writeFileSync(join(fixtureRoot, name), content, "utf8");
      }

      const result = spawnSync(process.execPath, [checksumPath, relativeFixtureRoot], {
        cwd: repoRoot,
        encoding: "utf8"
      });

      expect(result.status).toBe(0);
      const checksums = readFileSync(join(fixtureRoot, "SHA256SUMS.txt"), "utf8");
      for (const [name, content] of files) {
        const expected = createHash("sha256").update(content).digest("hex");
        expect(checksums).toContain(`${expected} *${name}`);
      }
      expect(checksums).not.toContain("*SHA256SUMS.txt");
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});

function runScanner(target: string, environment: Record<string, string> = {}) {
  return spawnSync(process.execPath, [scannerPath, target], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...environment }
  });
}

function runPublicAudit(target: string) {
  return spawnSync(process.execPath, [publicAuditPath, "--root", target], {
    cwd: repoRoot,
    encoding: "utf8"
  });
}

function privatePathEnvironment() {
  return {
    USERPROFILE: ["C:", "Users", "actual-private-user"].join("\\"),
    HOME: ["", "home", "actual-private-user"].join("/"),
    GITHUB_WORKSPACE: ["D:", "a", "private-language-miner", "private-language-miner"].join("\\")
  };
}
