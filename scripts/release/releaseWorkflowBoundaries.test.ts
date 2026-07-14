import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..", "..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("public release workflow boundaries", () => {
  it("validates only documentation that is present in the selected public tree", () => {
    const verifier = read("scripts/release/verify-release-config.cjs");
    const staging = read("scripts/release/prepare-public-source.cjs");

    for (const stalePrivateDocument of [
      "docs/ugc/agent-authoring-guide.md",
      "docs/ugc/game-pack-spec.md",
      "docs/ugc/playzone-cartridge-system.md"
    ]) {
      expect(staging).toContain(`\"${stalePrivateDocument}\"`);
      expect(verifier).not.toContain(`\"${stalePrivateDocument}\"`);
    }

    for (const publicDocument of [
      "docs/creator-guide.en.md",
      "docs/creator-guide.ko.md",
      "docs/ugc/playzone-current-runtime-contract.md",
      "gamekit/07_MANIFEST_SCHEMA.md",
      "gamekit/11_MANUAL_LEM_UPDATE_FLOW.md"
    ]) {
      expect(verifier).toContain(`\"${publicDocument}\"`);
    }
  });

  it("keeps tag publication behind the exact public repository guard", () => {
    const workflow = read(".github/workflows/release.yml");

    expect(workflow).toContain("github.repository == 'MeowthologySaga/Language_Miner'");
    expect(workflow).toContain("github.event.repository.visibility == 'public'");
    expect(workflow.indexOf("release:verify-tag")).toBeLessThan(
      workflow.indexOf("games:hydrate-official")
    );
    expect(workflow).toContain("games:hydrate-official -- --offline --publish-to-release");
    expect(workflow).toContain(
      "audit:artifacts -- dist dist-electron release cartridges artifacts/release artifacts/release-secret-scan artifacts/windows-smoke"
    );
    expect(workflow.indexOf("Create complete source archives")).toBeLessThan(
      workflow.indexOf("release:checksums")
    );
    expect(workflow).toContain("artifacts/release/**");
    expect(workflow).toContain("artifacts/windows-smoke/*-report.json");
    expect(workflow).toContain("artifacts/windows-smoke/*-report*.png");
    expect(workflow).not.toContain("artifacts/windows-smoke/**");
    expect(workflow).toContain("& gh release create $env:RELEASE_TAG");
  });

  it("attests the complete release set and stops Actions at a tag-bound verified draft", () => {
    const workflow = read(".github/workflows/release.yml");
    const publisher = read("scripts/release/publish-verified-draft.ps1");
    const checksumStep = workflow.indexOf("Write release notes and SHA-256 checksums");
    const attestationStep = workflow.indexOf("Generate build provenance for every release file");
    const draftStep = workflow.indexOf("Create or refresh verified draft only");
    const buildBlock = workflow.slice(workflow.indexOf("  build:"), workflow.indexOf("  attest:"));
    const attestBlock = workflow.slice(workflow.indexOf("  attest:"), workflow.indexOf("  draft:"));
    const draftBlock = workflow.slice(workflow.indexOf("  draft:"));

    expect(buildBlock).toContain("contents: read");
    expect(buildBlock).not.toContain("contents: write");
    expect(buildBlock).not.toContain("id-token: write");
    expect(attestBlock).toContain("contents: read");
    expect(attestBlock).toContain("id-token: write");
    expect(attestBlock).toContain("attestations: write");
    expect(attestBlock).toContain("artifact-metadata: write");
    expect(attestBlock).not.toContain("contents: write");
    expect(draftBlock).toContain("contents: write");
    expect(draftBlock).not.toContain("id-token: write");
    expect(workflow).toContain(
      "uses: actions/attest@a1948c3f048ba23858d222213b7c278aabede763 # v4"
    );
    expect(workflow).toContain("subject-path: artifacts/release/*");
    expect(checksumStep).toBeGreaterThan(-1);
    expect(attestationStep).toBeGreaterThan(checksumStep);
    expect(draftStep).toBeGreaterThan(attestationStep);

    expect(workflow).toContain("--draft");
    expect(workflow).toContain("if (-not $draftRelease.draft)");
    expect(workflow).toContain("$remoteAsset.digest -ne $expectedDigest");
    expect(workflow).toContain("Get-RemoteTagCommit");
    expect(workflow).toContain("release-build-metadata.json");
    expect(workflow).toContain("Refusing to modify an already-published");
    expect(workflow).toContain(
      "Publication requires the local administrator-authenticated publisher script"
    );
    expect(workflow).not.toContain("--clobber");
    expect(workflow).not.toContain('"draft=false"');
    expect(workflow).not.toContain("--method PATCH");

    expect(publisher).toContain('[Version]"2.93.0"');
    expect(publisher).toContain("Test-Path Env:GH_TOKEN");
    expect(publisher).toContain("Assert-LocalGitCheckout");
    expect(publisher).toContain('rev-parse --verify "HEAD^{commit}"');
    expect(publisher).toContain('rev-parse --verify "${Tag}^{commit}"');
    expect(publisher).toContain("repos/$repository/immutable-releases");
    expect(publisher).toContain("Get-RemoteTagCommit");
    expect(publisher).toContain("Assert-DraftAssets");
    expect(publisher).toContain("Assert-BuildProvenance");
    expect(publisher).toContain("attestation verify $localFile.FullName");
    expect(publisher).toContain("--signer-workflow $signerWorkflow");
    expect(publisher).toContain('--source-ref "refs/tags/$Tag"');
    expect(publisher).toContain("--source-digest $expectedCommitLower");
    expect(publisher).toContain("ShouldProcess");
    expect(publisher).toContain('"draft=false"');
    expect(publisher).toContain("release verify $Tag");
    expect(publisher).toContain("release verify-asset $Tag");
    expect(publisher).not.toContain("git credential");
    expect(publisher).not.toContain("--clobber");
  });

  it("documents checksum, provenance, and immutable-release verification without absolute claims", () => {
    const releaseNotes = read("scripts/release/write-release-notes.cjs");
    const installKo = read("docs/install-windows.ko.md");
    const installEn = read("docs/install-windows.en.md");
    const publishKo = read("docs/release-publishing.ko.md");
    const publishEn = read("docs/release-publishing.en.md");
    const verifyCommand =
      "gh release verify-asset v${packageJson.version} FILE -R MeowthologySaga/Language_Miner";

    expect(releaseNotes).toContain(verifyCommand);
    expect(installKo).toContain(
      'gh release verify-asset v0.1.0-beta.1 ".\\Language Miner Setup 0.1.0-beta.1-x64.exe" -R MeowthologySaga/Language_Miner'
    );
    expect(installEn).toContain(
      'gh release verify-asset v0.1.0-beta.1 ".\\Language Miner Setup 0.1.0-beta.1-x64.exe" -R MeowthologySaga/Language_Miner'
    );
    expect(installKo).toContain("변경 불가 Release");
    expect(installEn).toContain("immutable Release");
    expect(installKo).toContain("취약점이 전혀 없다는 보증");
    expect(installEn).toContain("do not prove that the code has no vulnerabilities");
    expect(installKo).toContain("2.93.0");
    expect(installEn).toContain("2.93.0");
    expect(publishKo).toContain(
      "gh attestation verify FILE --repo MeowthologySaga/Language_Miner"
    );
    expect(publishEn).toContain(
      "gh attestation verify FILE --repo MeowthologySaga/Language_Miner"
    );
    expect(publishKo).toContain("특정 GitHub Release에 실제로 포함되었다는 뜻은 아닙니다");
    expect(publishEn).toContain("by itself prove membership in a particular GitHub Release");
    expect(publishKo).toContain("gh release verify-asset");
    expect(publishEn).toContain("gh release verify-asset");
  });

  it("pins official actions, disables checkout credentials, and narrows Pages permissions", () => {
    const ci = read(".github/workflows/ci.yml");
    const pages = read(".github/workflows/pages.yml");
    const release = read(".github/workflows/release.yml");
    const dependabot = read(".github/dependabot.yml");

    for (const workflow of [ci, pages, release]) {
      const actionRefs = [...workflow.matchAll(/uses:\s+actions\/[A-Za-z0-9_.-]+@([^\s#]+)/g)];
      expect(actionRefs.length).toBeGreaterThan(0);
      for (const actionRef of actionRefs) {
        expect(actionRef[1]).toMatch(/^[0-9a-f]{40}$/);
      }
      expect(workflow).not.toMatch(/uses:\s+actions\/[A-Za-z0-9_.-]+@v\d+/);
    }
    expect(ci).toContain("persist-credentials: false");
    expect(pages).toContain("persist-credentials: false");
    expect(release).toContain("persist-credentials: false");
    expect(pages).toContain("pages: write");
    expect(pages).toContain("id-token: write");
    expect(pages).toContain("github.event.repository.visibility == 'public'");
    const pagesBuild = pages.slice(pages.indexOf("  build:"), pages.indexOf("  deploy:"));
    const pagesDeploy = pages.slice(pages.indexOf("  deploy:"));
    expect(pagesBuild).toContain("contents: read");
    expect(pagesBuild).not.toContain("pages: write");
    expect(pagesDeploy).toContain("pages: write");
    expect(pagesDeploy).toContain("id-token: write");
    expect(dependabot).toContain("package-ecosystem: github-actions");
  });

  it("excludes generated audits and hydrated games without excluding release tests", () => {
    const vite = read("vite.config.ts");

    expect(vite).toContain('"artifacts/**"');
    expect(vite).toContain('"cartridges/**"');
    expect(vite).not.toContain('"scripts/release/**"');
  });
});
