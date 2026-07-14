"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const officialGameAssets = require("./official-game-assets.cjs");
const officialCatalogSource = fs.readFileSync(
  path.join(repoRoot, "electron", "playZoneOfficialCatalog.ts"),
  "utf8"
);
const officialHydratorSource = fs.readFileSync(
  path.join(repoRoot, "scripts", "release", "hydrate-official-games.cjs"),
  "utf8"
);
const playZoneManifestSource = fs.readFileSync(
  path.join(repoRoot, "electron", "playZoneManifest.ts"),
  "utf8"
);
const playZoneContractSource = fs.readFileSync(
  path.join(repoRoot, "src", "shared", "playZoneContract.ts"),
  "utf8"
);
const ciWorkflow = fs.readFileSync(path.join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");
const releaseWorkflow = fs.readFileSync(
  path.join(repoRoot, ".github", "workflows", "release.yml"),
  "utf8"
);
const appSmokeQaSource = fs.readFileSync(
  path.join(repoRoot, "electron", "appSmokeQa.ts"),
  "utf8"
);
const electronMainSource = fs.readFileSync(path.join(repoRoot, "electron", "main.ts"), "utf8");
const publicStagingSource = fs.readFileSync(
  path.join(repoRoot, "scripts", "release", "prepare-public-source.cjs"),
  "utf8"
);
const historyAuditSource = fs.readFileSync(
  path.join(repoRoot, "scripts", "release", "audit-git-history.cjs"),
  "utf8"
);
const artifactAuditSource = fs.readFileSync(
  path.join(repoRoot, "scripts", "release", "scan-build-artifacts.cjs"),
  "utf8"
);
const pagesValidatorSource = fs.readFileSync(
  path.join(repoRoot, "scripts", "release", "validate-pages.cjs"),
  "utf8"
);
const pagesWorkflow = fs.readFileSync(
  path.join(repoRoot, ".github", "workflows", "pages.yml"),
  "utf8"
);
const releaseNotesSource = fs.readFileSync(
  path.join(repoRoot, "scripts", "release", "write-release-notes.cjs"),
  "utf8"
);
const installWindowsKoSource = fs.readFileSync(
  path.join(repoRoot, "docs", "install-windows.ko.md"),
  "utf8"
);
const installWindowsEnSource = fs.readFileSync(
  path.join(repoRoot, "docs", "install-windows.en.md"),
  "utf8"
);
const releasePublisherSource = fs.readFileSync(
  path.join(repoRoot, "scripts", "release", "publish-verified-draft.ps1"),
  "utf8"
);
const releasePublishingKoSource = fs.readFileSync(
  path.join(repoRoot, "docs", "release-publishing.ko.md"),
  "utf8"
);
const releasePublishingEnSource = fs.readFileSync(
  path.join(repoRoot, "docs", "release-publishing.en.md"),
  "utf8"
);
const failures = [];

if (packageJson.version !== "0.1.0-beta.1") {
  failures.push(`version must remain 0.1.0-beta.1 for this beta (${packageJson.version})`);
}
if (packageJson.build?.appId !== "io.github.meowthologysaga.languageminer") {
  failures.push("build.appId must be io.github.meowthologysaga.languageminer");
}
if (packageJson.build?.productName !== "Language Miner") {
  failures.push("build.productName must remain Language Miner so the Windows user-data path stays stable");
}
const buildFiles = Array.isArray(packageJson.build?.files) ? packageJson.build.files : [];
if (buildFiles.some((entry) => !entry.startsWith("!") && /^cartridges(?:\/|$)/i.test(entry))) {
  failures.push("electron-builder must not bundle PlayZone cartridges; official games are downloaded on demand");
}
for (const required of ["dist/**/*", "dist-electron/**/*", "package.json"]) {
  if (!buildFiles.includes(required)) failures.push(`electron-builder files is missing ${required}`);
}
for (const requiredExclusion of [
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
  if (!buildFiles.includes(requiredExclusion)) {
    failures.push(`electron-builder files is missing release exclusion ${requiredExclusion}`);
  }
}
if (buildFiles.some((entry) => entry.startsWith("!") && /onnxruntime-node.*win32\/x64/i.test(entry))) {
  failures.push("electron-builder must retain the Windows x64 ONNX Runtime payload for local MT");
}
if (!String(packageJson.build?.nsis?.artifactName ?? "").includes("${version}")) {
  failures.push("NSIS artifact name must include the package version");
}
if (!String(packageJson.build?.portable?.artifactName ?? "").includes("${version}")) {
  failures.push("portable artifact name must include the package version");
}
if (packageJson.scripts?.["release:stage-public"] !== "node scripts/release/prepare-public-source.cjs") {
  failures.push("release:stage-public must use the audited public-source staging script");
}
if (
  publicStagingSource.indexOf("clearDestination(destination);") < 0 ||
  publicStagingSource.indexOf("clearDestination(destination);") >
    publicStagingSource.indexOf("assertAssetInventoryReady();")
) {
  failures.push("public staging must remove stale output before checking blocking assets");
}
if (!publicStagingSource.includes("Block(?:ed)?|Review")) {
  failures.push("public staging must reject both unresolved Block and Review asset rows");
}
if (!historyAuditSource.includes('["grep", "-n", "-a", "-o", "-E", "-e", pattern, commit, "--"]')) {
  failures.push("Git history audit must scan binary blobs and emit only matches while passing patterns with -e");
}
if (!historyAuditSource.includes('"review-personal-email"')) {
  failures.push("Git history audit must reject non-allowlisted email addresses in historical content");
}
for (const requiredBoundary of [
  "missing-scan-root",
  "no-files-scanned",
  "build-canary-utf16le",
  "exact-local-path",
  "forbidden-packaged-metadata",
  "isTextLikeFile"
]) {
  if (!artifactAuditSource.includes(requiredBoundary)) {
    failures.push(`artifact audit is missing the ${requiredBoundary} boundary`);
  }
}
for (const requiredBoundary of ["runtime network API", "remote executable or media resource", "form submission is outside the static-site boundary"]) {
  if (!pagesValidatorSource.includes(requiredBoundary)) {
    failures.push(`Pages validator is missing the ${requiredBoundary} boundary`);
  }
}
if (packageJson.license !== "GPL-3.0-only") {
  failures.push("package license must remain GPL-3.0-only");
}
if (!playZoneContractSource.includes(`PLAY_ZONE_CURRENT_APP_VERSION = "${packageJson.version}"`)) {
  failures.push("the shared PlayZone compatibility version must match package.json");
}
if (
  !playZoneManifestSource.includes('from "../src/shared/playZoneContract"') ||
  !playZoneManifestSource.includes("export { PLAY_ZONE_CURRENT_APP_VERSION }")
) {
  failures.push("the Electron PlayZone validator must use the shared compatibility contract");
}
for (const relativePath of ["gamekit/templates/manifest.example.json"]) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(repoRoot, relativePath), "utf8").replace(/^\uFEFF/, "")
  );
  if (manifest.minPlayZoneVersion !== packageJson.version) {
    failures.push(`${relativePath} must target the shared beta PlayZone version`);
  }
}
for (const definition of officialGameAssets) {
  for (const expectedValue of [
    definition.id,
    definition.version,
    definition.fileName,
    String(definition.bytes).replace(/\B(?=(\d{3})+(?!\d))/g, "_"),
    definition.archiveSha256,
    definition.packSha256,
    `https://github.com/${definition.repository}`
  ]) {
    if (!officialCatalogSource.includes(expectedValue)) {
      failures.push(`official catalog is not locked to ${definition.fileName}: ${expectedValue}`);
    }
  }
  if (!publicStagingSource.includes(`"cartridges/${definition.folder}/"`)) {
    failures.push(`public app source must exclude the duplicate official runtime: ${definition.folder}`);
  }
}
if (
  !officialHydratorSource.includes("Refusing to extract an unverified archive") ||
  !officialHydratorSource.includes("packSha256 !== definition.packSha256") ||
  !officialHydratorSource.includes("receivedBytes > definition.bytes") ||
  !officialHydratorSource.includes("MAX_COMPRESSION_RATIO") ||
  !officialHydratorSource.includes("Refusing to replace an existing non-matching game folder") ||
  !officialHydratorSource.includes("Official source tag no longer points to its locked commit") ||
  !officialHydratorSource.includes("githubusercontent.com")
) {
  failures.push(
    "official game hydration must bound downloads and ZIP expansion, preserve existing folders, and verify both SHA-256 layers"
  );
}
for (const scriptName of ["predev", "prebuild"]) {
  const command = String(packageJson.scripts?.[scriptName] ?? "");
  if (/optimize-bundled-game-images|sync-bundled-game-integrity/.test(command)) {
    failures.push(`${scriptName} must build the app without requiring duplicate official game sources`);
  }
}
for (const relativePath of [
  "docs/creator-guide.en.md",
  "docs/creator-guide.ko.md",
  "docs/ugc/playzone-current-runtime-contract.md",
  "gamekit/07_MANIFEST_SCHEMA.md",
  "gamekit/11_MANUAL_LEM_UPDATE_FLOW.md"
]) {
  const source = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
  if (!source.includes(`"minPlayZoneVersion": "${packageJson.version}"`)) {
    failures.push(`${relativePath} must document the shared beta PlayZone version`);
  }
}
for (const scriptName of [
  "audit:public",
  "audit:history",
  "audit:artifacts",
  "compliance",
  "guard:client-secrets:self-test"
]) {
  if (!packageJson.scripts?.[scriptName]) failures.push(`missing release guard script: ${scriptName}`);
}
if (
  !ciWorkflow.includes("guard:client-secrets:self-test") ||
  !releaseWorkflow.includes("guard:client-secrets:self-test")
) {
  failures.push("CI and release workflows must self-test the client-secret guard with a canary");
}
for (const requiredStep of ["audit:history", "audit:artifacts", "LEM_BUILD_CANARY"]) {
  if (!ciWorkflow.includes(requiredStep)) failures.push(`CI workflow is missing ${requiredStep}`);
  if (!releaseWorkflow.includes(requiredStep)) failures.push(`release workflow is missing ${requiredStep}`);
}
if (!ciWorkflow.includes("artifacts/canary-probe") || !releaseWorkflow.includes("artifacts/canary-probe")) {
  failures.push("CI and release workflows must prove that the artifact scanner detects its canary");
}
if (!releaseWorkflow.includes("smoke-windows-artifacts.ps1")) {
  failures.push(
    "release workflow must smoke test clean install, synthetic upgrade, repair, uninstall, and portable artifacts"
  );
}
if (!/\$scanStatus = \$LASTEXITCODE\s+\$global:LASTEXITCODE = 0/.test(releaseWorkflow)) {
  failures.push("release canary proof must clear the expected native scanner failure exit code");
}
if (
  !releaseWorkflow.includes("--config.directories.output=release-baseline") ||
  !releaseWorkflow.includes("--config.extraMetadata.version=0.1.0-beta.0") ||
  !releaseWorkflow.includes("-BaselineReleaseDirectory release-baseline")
) {
  failures.push("release workflow must build and install a separate synthetic beta.0 upgrade baseline");
}
const officialGameHydrationStep = releaseWorkflow.search(
  /run: npm run games:hydrate-official\r?\n/
);
if (officialGameHydrationStep < 0) {
  failures.push("release workflow must hydrate immutable game-release assets before tests and packaging");
}
if (!releaseWorkflow.includes("games:hydrate-official -- --offline --publish-to-release")) {
  failures.push("release workflow must stage only already-verified official game assets for publication");
}
if (!releaseWorkflow.includes("GITHUB_TOKEN: ${{ github.token }}")) {
  failures.push("release workflow must authenticate GitHub source-tag verification without embedding a token");
}
for (const permission of [
  "contents: write",
  "id-token: write",
  "attestations: write",
  "artifact-metadata: write"
]) {
  if (!releaseWorkflow.includes(permission)) {
    failures.push(`release workflow is missing required attestation permission ${permission}`);
  }
}
if (
  officialGameHydrationStep <
  releaseWorkflow.indexOf("release:verify-config")
) {
  failures.push("release workflow must run local release guards before downloading official game assets");
}
if (
  !releaseWorkflow.includes("extract-release-for-scan.ps1") ||
  !releaseWorkflow.includes("artifacts/release-secret-scan")
) {
  failures.push("release workflow must expand Windows executables and ASAR payloads before secret scanning");
}
const windowsSmoke = fs.readFileSync(
  path.join(repoRoot, "scripts", "release", "smoke-windows-artifacts.ps1"),
  "utf8"
);
const releaseCollector = fs.readFileSync(
  path.join(repoRoot, "scripts", "release", "collect-release-artifacts.cjs"),
  "utf8"
);
if (
  !releaseCollector.includes('"builder-debug.yml"') ||
  !releaseCollector.includes('"builder-effective-config.yaml"')
) {
  failures.push("Release collection must remove electron-builder diagnostic files");
}
if (!windowsSmoke.includes('Join-Path $appDataRoot "Language Miner"')) {
  failures.push("Windows release smoke must verify the default Language Miner user-data path");
}
if (
  !windowsSmoke.includes('Join-Path $workRoot "isolated-appdata"') ||
  !windowsSmoke.includes('Join-Path $workRoot "isolated-localappdata"') ||
  !windowsSmoke.includes("APPDATA = $appDataRoot") ||
  !windowsSmoke.includes("LOCALAPPDATA = $localAppDataRoot") ||
  !windowsSmoke.includes("$script:StableQaUserDataRoot = $upgradeUserDataRoot") ||
  !windowsSmoke.includes("LM_QA_USER_DATA_DIR = $effectiveUserDataDirectory") ||
  windowsSmoke.includes("GetFullPath($env:APPDATA)")
) {
  failures.push("Windows release smoke must isolate AppData inside its managed work directory");
}
if (
  !windowsSmoke.includes('-LifecyclePhase "baseline"') ||
  !windowsSmoke.includes('-LifecyclePhase "upgraded"') ||
  !windowsSmoke.includes('-LifecyclePhase "repair"') ||
  !windowsSmoke.includes('packageJson.build.appId -ne "io.github.meowthologysaga.languageminer"') ||
  !windowsSmoke.includes("$upgradedRegistration.KeyName -ne $baselineRegistration.KeyName") ||
  !windowsSmoke.includes("Assert-NoUnexpectedDefaultInstall") ||
  !windowsSmoke.includes("The silent uninstaller left the installation folder behind") ||
  windowsSmoke.includes("update/repair")
) {
  failures.push(
    "Windows release smoke must distinguish version upgrade from same-version repair and verify full uninstall"
  );
}
const transientCleanupStart = windowsSmoke.indexOf("foreach ($transientDataRoot in @(");
const transientCleanupEnd = windowsSmoke.indexOf(
  'Write-Host "Windows clean install, synthetic upgrade, repair, uninstall, and portable smoke passed."',
  transientCleanupStart
);
const transientCleanupSource =
  transientCleanupStart >= 0 && transientCleanupEnd > transientCleanupStart
    ? windowsSmoke.slice(transientCleanupStart, transientCleanupEnd)
    : "";
for (const transientDataRoot of [
  "$appDataRoot",
  "$localAppDataRoot",
  "$cleanUserDataRoot",
  'Join-Path $workRoot "user-data-portable-ko"',
  'Join-Path $workRoot "user-data-portable-en"'
]) {
  if (!transientCleanupSource.includes(transientDataRoot)) {
    failures.push(`Windows release smoke must remove transient public-artifact data: ${transientDataRoot}`);
  }
}
if (!transientCleanupSource.includes("Remove-SmokeDirectory -Path $transientDataRoot -Root $workRoot")) {
  failures.push("Windows release smoke must delete every transient QA data root before artifact upload");
}
if (
  !appSmokeQaSource.includes("LM_QA_UPGRADE_PHASE") ||
  !appSmokeQaSource.includes('qa:upgrade:0.1.0-beta.0') ||
  !appSmokeQaSource.includes("settingsMarkerPreserved") ||
  !appSmokeQaSource.includes("cardMarkerPreserved")
) {
  failures.push("Electron app smoke must prove onboarding, settings, and card persistence across upgrades");
}
for (const viewport of ["940x680", "1240x820", "1920x1080"]) {
  if (!windowsSmoke.includes(`Viewport = "${viewport}"`)) {
    failures.push(`Windows release smoke is missing the ${viewport} viewport`);
  }
}
for (const locale of ["ko", "en"]) {
  if (!windowsSmoke.includes(`Locale = "${locale}"`)) {
    failures.push(`Windows release smoke is missing the ${locale} locale`);
  }
}
for (const scaleFactor of ["1.25", "1.5"]) {
  if (!windowsSmoke.includes(`Scale = "${scaleFactor}"`)) {
    failures.push(`Windows release smoke is missing the ${scaleFactor} Windows scale factor`);
  }
}
if (
  !windowsSmoke.includes("LM_QA_APP_LOCALE = $Locale") ||
  !windowsSmoke.includes("LM_QA_DEVICE_SCALE_FACTOR = $ScaleFactor") ||
  !windowsSmoke.includes("$report.scaleEvidence.rendererDevicePixelRatio")
) {
  failures.push("Windows release smoke must pass and verify renderer locale and scale evidence");
}
if (windowsSmoke.includes('"--force-device-scale-factor=$ScaleFactor"')) {
  failures.push("Windows release smoke must let the QA-only main-process scale gate own the switch");
}
if (
  !electronMainSource.includes("resolveQaDeviceScaleFactor(process.env)") ||
  !electronMainSource.includes('appendSwitch("force-device-scale-factor"') ||
  !appSmokeQaSource.includes("rendererDevicePixelRatio") ||
  !appSmokeQaSource.includes("requestedScaleFactor")
) {
  failures.push("Electron app smoke must apply and report the QA-only device scale factor");
}
if (
  !appSmokeQaSource.includes("snapshot.horizontalOverflowPx > 2") ||
  !appSmokeQaSource.includes("snapshot.viewportWidth") ||
  !appSmokeQaSource.includes("snapshot.viewportHeight")
) {
  failures.push("Windows release smoke must reject renderer horizontal overflow");
}
if (!releaseWorkflow.includes("npm run release:stage-public")) {
  failures.push("release workflow must prove that the selected public tree passes the asset and source gates");
}
if (
  releaseWorkflow.includes("artifacts/windows-smoke/**") ||
  !releaseWorkflow.includes("artifacts/windows-smoke/*-report.json") ||
  !releaseWorkflow.includes("artifacts/windows-smoke/*-report*.png")
) {
  failures.push("release workflow may upload only redacted Windows smoke reports and screenshots");
}
for (const requiredArchive of [
  'Language-Miner-$version-source.zip',
  'Language-Miner-$version-source.tar.gz'
]) {
  if (!releaseWorkflow.includes(requiredArchive)) {
    failures.push(`release workflow is missing the complete source archive ${requiredArchive}`);
  }
}
const sourceArchiveStep = releaseWorkflow.indexOf("Create complete source archives");
const checksumStep = releaseWorkflow.indexOf("Write release notes and SHA-256 checksums");
if (sourceArchiveStep < 0 || checksumStep < sourceArchiveStep) {
  failures.push("release checksums must be written after both complete source archives are created");
}
const checksumBlock = releaseWorkflow.slice(
  checksumStep,
  releaseWorkflow.indexOf("Write immutable build metadata")
);
if (
  (checksumBlock.match(/if \(\$LASTEXITCODE -ne 0\) \{ exit \$LASTEXITCODE \}/g) ?? []).length !== 2
) {
  failures.push("release notes and checksum generation must each fail closed on a native exit code");
}
const attestationStep = releaseWorkflow.indexOf("Generate build provenance for every release file");
const draftStep = releaseWorkflow.indexOf("Create or refresh verified draft only");
if (
  attestationStep < checksumStep ||
  !releaseWorkflow.includes(
    "uses: actions/attest@a1948c3f048ba23858d222213b7c278aabede763 # v4"
  ) ||
  !releaseWorkflow.includes("subject-path: artifacts/release/*")
) {
  failures.push("release workflow must attest every checksummed release file with the pinned actions/attest v4 commit");
}
if (draftStep < attestationStep) {
  failures.push("release workflow must attest before it creates and verifies the draft");
}
if (
  releaseWorkflow.includes("--clobber") ||
  releaseWorkflow.includes('"draft=false"') ||
  releaseWorkflow.includes("--method PATCH") ||
  !releaseWorkflow.includes("Refusing to modify an already-published") ||
  !releaseWorkflow.includes("$remoteDigest -cne $expectedDigest") ||
  !releaseWorkflow.includes("Get-RemoteTagCommit") ||
  !releaseWorkflow.includes("Publication requires the local administrator-authenticated publisher script")
) {
  failures.push("release workflow must fail closed at a tag-bound verified draft and must never publish");
}
if (
  releaseWorkflow.includes("releases/tags/$env:RELEASE_TAG") ||
  !releaseWorkflow.includes("--paginate --slurp") ||
  !releaseWorkflow.includes("releases?per_page=100") ||
  !releaseWorkflow.includes("tag_name -ceq $env:RELEASE_TAG")
) {
  failures.push(
    "release workflow must discover drafts through the paginated release list and exact tag matching"
  );
}
const editDraftCall = releaseWorkflow.indexOf("& gh release edit $env:RELEASE_TAG");
const createDraftCall = releaseWorkflow.indexOf("& gh release create $env:RELEASE_TAG");
const waitForDraftCall = releaseWorkflow.indexOf(
  "$draftRelease = Wait-ForExactDraft -ExpectedReleaseId $expectedReleaseId",
  createDraftCall
);
const uploadDraftCall = releaseWorkflow.indexOf("& gh @uploadArguments", waitForDraftCall);
const waitForAssetsCall = releaseWorkflow.indexOf(
  "$verifiedDraft = Wait-ForCompleteDraftAssets",
  uploadDraftCall
);
if (
  !releaseWorkflow.includes("function Wait-ForExactDraft") ||
  !releaseWorkflow.includes("function Wait-ForCompleteDraftAssets") ||
  !releaseWorkflow.includes("[int]$MaxAttempts = 12") ||
  !releaseWorkflow.includes("[long]$listedRelease.id -ne $ExpectedReleaseId") ||
  !releaseWorkflow.includes("@($candidate.assets).Count -eq $LocalByName.Count") ||
  !releaseWorkflow.includes("The draft contains a duplicate or unexpected asset") ||
  !releaseWorkflow.includes("was published while its draft assets were being verified") ||
  editDraftCall < 0 ||
  createDraftCall < 0 ||
  waitForDraftCall < editDraftCall ||
  waitForDraftCall < createDraftCall ||
  uploadDraftCall < waitForDraftCall ||
  waitForAssetsCall < uploadDraftCall
) {
  failures.push(
    "release workflow must poll boundedly after draft creation/edit and upload while failing closed on identity, publication, duplicate, and digest mismatches"
  );
}
for (const requiredPublisherBoundary of [
  '[Version]"2.93.0"',
  "Test-Path Env:GH_TOKEN",
  "Assert-LocalGitCheckout",
  "$gitRootText = ([string]($gitRootOutput | Select-Object -First 1)).Trim()",
  "Resolve-Path -LiteralPath $gitRootText -ErrorAction Stop",
  "Git returned a repository root that cannot be resolved safely",
  'rev-parse --verify "HEAD^{commit}"',
  'rev-parse --verify "${Tag}^{commit}"',
  "repos/$repository/immutable-releases",
  "Get-RemoteTagCommit",
  "SHA256SUMS.txt",
  "Assert-DraftAssets",
  "Test-DraftAssetsComplete",
  "Wait-ForExactDraftAssets",
  "Get-ReleaseByTag -AllowMissing",
  "[int]$MaxAttempts = 10",
  "$remoteDigest -cne $expectedDigest",
  "more than one release for the exact tag",
  "no longer exists in the required state",
  "Assert-BuildProvenance",
  "attestation verify $localFile.FullName",
  "--signer-workflow $signerWorkflow",
  '--source-ref "refs/tags/$Tag"',
  "--source-digest $expectedCommitLower",
  '"draft=false"',
  "ShouldProcess",
  "release verify $Tag",
  "release verify-asset $Tag"
]) {
  if (!releasePublisherSource.includes(requiredPublisherBoundary)) {
    failures.push(`local release publisher is missing ${requiredPublisherBoundary}`);
  }
}
if (
  releasePublisherSource.includes("git credential") ||
  releasePublisherSource.includes("--clobber")
) {
  failures.push("local release publisher must not read Git credentials or overwrite assets");
}
if (
  releasePublisherSource.includes("releases/tags/$Tag") ||
  !releasePublisherSource.includes("--paginate --slurp") ||
  !releasePublisherSource.includes("releases?per_page=100") ||
  !releasePublisherSource.includes("tag_name -ceq $Tag")
) {
  failures.push(
    "local release publisher must discover drafts through the paginated release list and exact tag matching"
  );
}
for (const workflowSource of [ciWorkflow, pagesWorkflow, releaseWorkflow]) {
  for (const match of workflowSource.matchAll(/uses:\s+(actions\/[A-Za-z0-9_.-]+)@([^\s#]+)/g)) {
    if (!/^[0-9a-f]{40}$/.test(match[2])) {
      failures.push(`${match[1]} must be pinned to a full commit SHA`);
    }
  }
}
if (
  !ciWorkflow.includes("persist-credentials: false") ||
  !pagesWorkflow.includes("persist-credentials: false") ||
  !releaseWorkflow.includes("persist-credentials: false")
) {
  failures.push("every Actions checkout must disable persisted Git credentials");
}
for (const requiredReleaseScanRoot of [
  "dist dist-electron release cartridges artifacts/release artifacts/release-secret-scan artifacts/windows-smoke",
  "extract-release-for-scan.ps1"
]) {
  if (!releaseWorkflow.includes(requiredReleaseScanRoot)) {
    failures.push(`release artifact scan is missing ${requiredReleaseScanRoot}`);
  }
}
if (
  !pagesWorkflow.includes("node scripts/release/validate-pages.cjs docs/site") ||
  !pagesWorkflow.includes("path: docs/site")
) {
  failures.push("Pages workflow must validate and upload docs/site only");
}
for (const requiredNotice of ["SmartScreen", "SHA256SUMS.txt", "complete source", "전체 소스"]) {
  if (!releaseNotesSource.includes(requiredNotice)) {
    failures.push(`release notes must include ${requiredNotice}`);
  }
}
const releaseAssetVerifyCommand =
  "gh release verify-asset v${packageJson.version} FILE -R MeowthologySaga/Language_Miner";
if (!releaseNotesSource.includes(releaseAssetVerifyCommand)) {
  failures.push("release notes must document verification against the specific GitHub Release");
}
for (const [language, installSource] of [
  ["Korean", installWindowsKoSource],
  ["English", installWindowsEnSource]
]) {
  if (
    !installSource.includes("gh release verify-asset v0.1.0-beta.1") ||
    !installSource.includes("2.93.0") ||
    !installSource.includes("MeowthologySaga/Language_Miner") ||
    !installSource.toLowerCase().includes("immutable")
  ) {
    failures.push(`${language} Windows install guide must document release-bound verification and immutable releases`);
  }
}
for (const [language, publishingSource] of [
  ["Korean", releasePublishingKoSource],
  ["English", releasePublishingEnSource]
]) {
  if (
    !publishingSource.includes("publish-verified-draft.ps1") ||
    !publishingSource.includes("2.93.0") ||
    !publishingSource.includes("release-build-metadata.json") ||
    !publishingSource.includes("-Publish") ||
    !publishingSource.includes("gh attestation verify FILE --repo MeowthologySaga/Language_Miner") ||
    !publishingSource.includes("gh release verify-asset")
  ) {
    failures.push(`${language} maintainer guide must document the local verified-draft publisher`);
  }
}

if (failures.length > 0) {
  throw new Error(`Release configuration validation failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
}
process.stdout.write("Release configuration validation passed.\n");
