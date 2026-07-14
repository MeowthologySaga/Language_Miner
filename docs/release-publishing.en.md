# Publishing a verified GitHub Release

[한국어](release-publishing.ko.md) · [Windows installation](install-windows.en.md) · [Security policy](../SECURITY.md)

This runbook is only for a Language Miner maintainer performing the final publication of a **verified draft Release** created by a tag build. GitHub Actions builds, tests, attests, checks asset digests, and uploads the draft, but it never publishes automatically.

## Prepare

1. Install the official [GitHub CLI](https://cli.github.com/) version `2.93.0` or newer. Older versions have a security advisory affecting Release verification commands.
2. Do not create a long-lived PAT or store an administrator token in repository Secrets.
3. Clone the public repository into a new folder and sign in locally with the maintainer account.

```powershell
git clone https://github.com/MeowthologySaga/Language_Miner.git Language_Miner_release
Set-Location .\Language_Miner_release
gh auth login --hostname github.com
gh auth status --hostname github.com
```

The publisher stops if `GH_TOKEN` or `GITHUB_TOKEN` is present and uses only the GitHub CLI's interactive sign-in.

## Once per repository: enable immutable Releases

Run these commands with repository administrator access.

```powershell
gh api --hostname github.com --method PUT `
  -H "Accept: application/vnd.github+json" `
  -H "X-GitHub-Api-Version: 2026-03-10" `
  repos/MeowthologySaga/Language_Miner/immutable-releases

gh api --hostname github.com --method GET `
  -H "Accept: application/vnd.github+json" `
  -H "X-GitHub-Api-Version: 2026-03-10" `
  repos/MeowthologySaga/Language_Miner/immutable-releases
```

The second command must show `"enabled": true`. The publisher fails closed when it cannot confirm this setting.

## Check the tag build and draft

1. Push the version tag for the audited commit.
2. Wait for every job in the `Windows release` Actions run to succeed.
3. Download the run's `language-miner-<tag>-windows-x64` workflow artifact and extract it into an empty folder.
4. Confirm that the matching GitHub Release is still a **Draft**. Do not use the web UI's **Publish release** button.

The extracted folder must include at least this structure:

```text
artifacts/
  release/
    SHA256SUMS.txt
    ...installer, portable build, source, SBOM, and other Release assets...
  release-build-metadata.json
  release-notes.md
```

## Run the local preflight

From the repository root, use the exact 40-character commit SHA recorded by the build metadata.

```powershell
$metadata = Get-Content -Raw ".\artifacts\release-build-metadata.json" | ConvertFrom-Json

git fetch --tags origin
git switch --detach $metadata.commitSha
git status --porcelain

.\scripts\release\publish-verified-draft.ps1 `
  -Tag $metadata.tag `
  -ExpectedCommit $metadata.commitSha `
  -ReleaseDirectory ".\artifacts\release"
```

This does not publish. It rechecks all of the following:

- GitHub CLI version and interactive maintainer authentication;
- a clean public checkout whose local `HEAD` and local tag match the expected commit;
- the repository's immutable Release setting;
- the remote tag's exact target commit;
- every draft asset name, size, upload state, and SHA-256 digest;
- complete local coverage by `SHA256SUMS.txt`;
- provenance for every asset from the exact `release.yml`, tag ref, and source commit.

Running `gh attestation verify FILE --repo MeowthologySaga/Language_Miner` by itself proves only that a valid provenance claim associates the file with this repository. It does **not** by itself prove membership in a particular GitHub Release. The publisher therefore also constrains the signer workflow, source ref, and source digest; compares the complete draft asset list and digests; and, after publication, runs `gh release verify` plus `gh release verify-asset` to bind the files to the specific immutable Release.

## Publish

In the same folder after a successful preflight, add `-Publish`.

```powershell
.\scripts\release\publish-verified-draft.ps1 `
  -Tag $metadata.tag `
  -ExpectedCommit $metadata.commitSha `
  -ReleaseDirectory ".\artifacts\release" `
  -Publish
```

Approve the confirmation only when the repository, tag, and commit SHA are all correct. Immediately before the irreversible request, the script rechecks the remote setting, tag, and assets. After publication, it confirms `Immutable`, runs `gh release verify`, and verifies every local file with `gh release verify-asset`.

If an error says publication already occurred, do not retry or overwrite assets; stop and investigate. An immutable Release is not edited after publication. Create a new version tag whenever a correction is required.
