[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "High")]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$')]
  [string]$Tag,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-fA-F]{40}$')]
  [string]$ExpectedCommit,

  [Parameter(Mandatory = $true)]
  [string]$ReleaseDirectory,

  [switch]$Publish
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repository = "MeowthologySaga/Language_Miner"
$cliRepository = "github.com/$repository"
$minimumGhVersion = [Version]"2.93.0"
$apiVersion = "2026-03-10"
$expectedCommitLower = $ExpectedCommit.ToLowerInvariant()
$signerWorkflow = "$repository/.github/workflows/release.yml"

function Assert-GitHubCli {
  $ghCommand = Get-Command gh -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -eq $ghCommand) {
    throw "GitHub CLI is required. Install the current official release from https://cli.github.com/."
  }
  $script:ghPath = $ghCommand.Source

  $versionOutput = & $script:ghPath --version 2>$null | Select-Object -First 1
  if ($LASTEXITCODE -ne 0 -or $versionOutput -notmatch '^gh version (\d+\.\d+\.\d+)\b') {
    throw "The GitHub CLI version could not be verified."
  }
  $installedVersion = [Version]$Matches[1]
  if ($installedVersion -lt $minimumGhVersion) {
    throw "GitHub CLI $minimumGhVersion or newer is required because older verification commands have a security advisory. Update from https://cli.github.com/."
  }

  foreach ($helpArguments in @(
      @("api", "--help"),
      @("auth", "status", "--help"),
      @("attestation", "verify", "--help"),
      @("release", "verify", "--help"),
      @("release", "verify-asset", "--help")
    )) {
    & $script:ghPath @helpArguments 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) {
      throw "The installed GitHub CLI does not provide every command required for secure release verification."
    }
  }

  if ((Test-Path Env:GH_TOKEN) -or (Test-Path Env:GITHUB_TOKEN)) {
    throw "Unset GH_TOKEN and GITHUB_TOKEN before publishing. This script requires the maintainer's interactive GitHub CLI sign-in, not an environment token."
  }
  & $script:ghPath auth status --hostname github.com 1>$null 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "GitHub CLI is not interactively authenticated for github.com. Run 'gh auth login --hostname github.com' and try again."
  }
}

function Assert-LocalGitCheckout {
  $gitCommand = Get-Command git -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($null -eq $gitCommand) {
    throw "Git is required to verify the clean public checkout, local tag, and HEAD."
  }
  $script:gitPath = $gitCommand.Source
  $scriptRepositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path.TrimEnd('\', '/')
  $gitRootOutput = & $script:gitPath -c core.hooksPath=NUL -c core.fsmonitor= rev-parse --show-toplevel 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "Run this script from a clean checkout of the public Language Miner repository."
  }
  $gitRoot = ([string]($gitRootOutput | Select-Object -First 1)).Trim().TrimEnd('\', '/')
  if (-not [StringComparer]::OrdinalIgnoreCase.Equals($gitRoot, $scriptRepositoryRoot)) {
    throw "The script and current Git checkout do not belong to the same repository root."
  }

  $statusLines = @(& $script:gitPath -c core.hooksPath=NUL -c core.fsmonitor= status --porcelain=v1 --untracked-files=all 2>$null)
  if ($LASTEXITCODE -ne 0 -or $statusLines.Count -ne 0) {
    throw "The public checkout must be clean before publication. Commit, remove, or relocate every tracked and untracked change first."
  }
  $headCommit = [string](& $script:gitPath -c core.hooksPath=NUL -c core.fsmonitor= rev-parse --verify "HEAD^{commit}" 2>$null)
  if ($LASTEXITCODE -ne 0 -or $headCommit.Trim().ToLowerInvariant() -ne $expectedCommitLower) {
    throw "The clean checkout HEAD does not match ExpectedCommit."
  }
  $tagCommit = [string](& $script:gitPath -c core.hooksPath=NUL -c core.fsmonitor= rev-parse --verify "${Tag}^{commit}" 2>$null)
  if ($LASTEXITCODE -ne 0 -or $tagCommit.Trim().ToLowerInvariant() -ne $expectedCommitLower) {
    throw "The local release tag is missing or does not resolve to ExpectedCommit. Fetch the official tag and re-check the clean checkout."
  }
}

function Invoke-GitHubJson {
  param(
    [Parameter(Mandatory = $true)][ValidateSet("GET")][string]$Method,
    [Parameter(Mandatory = $true)][string]$Endpoint
  )
  $output = & $script:ghPath api `
    --hostname github.com `
    --method $Method `
    -H "Accept: application/vnd.github+json" `
    -H "X-GitHub-Api-Version: $apiVersion" `
    $Endpoint 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "A required GitHub API verification failed. No release was published."
  }
  $text = $output | Out-String
  if ([string]::IsNullOrWhiteSpace($text)) {
    throw "GitHub returned an empty response during release verification."
  }
  return ($text | ConvertFrom-Json)
}

function Assert-ImmutableReleasesEnabled {
  try {
    $setting = Invoke-GitHubJson -Method GET -Endpoint "repos/$repository/immutable-releases"
  } catch {
    throw "Could not confirm that immutable releases are enabled. The signed-in maintainer needs repository Administration read access, and Settings > Releases > Enable release immutability must be on."
  }
  if ($setting.enabled -ne $true) {
    throw "Immutable releases are not confirmed as enabled. No release was published."
  }
}

function Get-RemoteTagCommit {
  $tagRef = Invoke-GitHubJson -Method GET -Endpoint "repos/$repository/git/ref/tags/$Tag"
  $objectType = [string]$tagRef.object.type
  $objectSha = ([string]$tagRef.object.sha).ToLowerInvariant()
  $visited = @{}
  for ($depth = 0; $depth -lt 8; $depth++) {
    if ($objectType -eq "commit") {
      if ($objectSha -notmatch '^[0-9a-f]{40}$') {
        throw "The remote tag does not resolve to a full commit SHA."
      }
      return $objectSha
    }
    if ($objectType -ne "tag" -or $objectSha -notmatch '^[0-9a-f]{40}$' -or $visited.ContainsKey($objectSha)) {
      throw "The remote tag has an unsupported or cyclic object chain."
    }
    $visited[$objectSha] = $true
    $tagObject = Invoke-GitHubJson -Method GET -Endpoint "repos/$repository/git/tags/$objectSha"
    $objectType = [string]$tagObject.object.type
    $objectSha = ([string]$tagObject.object.sha).ToLowerInvariant()
  }
  throw "The remote tag has too many annotation levels."
}

function Assert-RemoteTag {
  $remoteCommit = Get-RemoteTagCommit
  if ($remoteCommit -ne $expectedCommitLower) {
    throw "The remote tag does not point to the expected 40-character commit SHA. No release was published."
  }
}

function Get-ReleaseByTag {
  param([switch]$AllowMissing)
  $output = & $script:ghPath api `
    --hostname github.com `
    --method GET `
    -H "Accept: application/vnd.github+json" `
    -H "X-GitHub-Api-Version: $apiVersion" `
    --paginate --slurp `
    "repos/$repository/releases?per_page=100" 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "The GitHub release list could not be verified. No release was published."
  }
  try {
    $pages = ($output | Out-String) | ConvertFrom-Json -ErrorAction Stop
  } catch {
    throw "GitHub returned invalid release-list JSON. No release was published."
  }
  $matches = @()
  foreach ($page in @($pages)) {
    foreach ($candidate in @($page)) {
      if ([string]$candidate.tag_name -ceq $Tag) {
        $matches += $candidate
      }
    }
  }
  if ($matches.Count -gt 1) {
    throw "GitHub returned more than one release for the exact tag. No release was published."
  }
  if ($matches.Count -eq 0) {
    if ($AllowMissing) { return $null }
    throw "GitHub did not return a release for the exact tag. No release was published."
  }
  $releaseId = [long]$matches[0].id
  if ($releaseId -le 0) {
    throw "GitHub returned an invalid release identifier. No release was published."
  }
  $release = Invoke-GitHubJson -Method GET -Endpoint "repos/$repository/releases/$releaseId"
  if ([string]$release.tag_name -cne $Tag) {
    throw "GitHub returned a release for a different tag."
  }
  return $release
}

function Get-LocalReleaseSet {
  if (-not (Test-Path -LiteralPath $ReleaseDirectory -PathType Container)) {
    throw "The release directory does not exist."
  }
  $directory = Get-Item -LiteralPath (Resolve-Path -LiteralPath $ReleaseDirectory).Path -Force
  if (($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "The release directory must not be a symbolic link or reparse point."
  }
  $nestedDirectories = @(Get-ChildItem -LiteralPath $directory.FullName -Force -Directory)
  if ($nestedDirectories.Count -ne 0) {
    throw "The release directory must contain files only, with no nested directories."
  }
  $files = @(Get-ChildItem -LiteralPath $directory.FullName -Force -File)
  if ($files.Count -eq 0) {
    throw "The release directory contains no files."
  }

  $byName = [Collections.Generic.Dictionary[string, object]]::new([StringComparer]::Ordinal)
  foreach ($file in $files) {
    if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Release files must not be symbolic links or reparse points."
    }
    if ($file.Name -match '[\x00-\x1f/\\]' -or $file.Name -in @('.', '..') -or $byName.ContainsKey($file.Name)) {
      throw "The release directory contains an unsafe or duplicate asset name."
    }
    $byName.Add($file.Name, $file)
  }

  if (-not $byName.ContainsKey("SHA256SUMS.txt")) {
    throw "SHA256SUMS.txt is missing from the release directory."
  }
  $checksumEntries = [Collections.Generic.Dictionary[string, string]]::new([StringComparer]::Ordinal)
  foreach ($line in Get-Content -LiteralPath $byName["SHA256SUMS.txt"].FullName) {
    if ($line -notmatch '^([0-9a-fA-F]{64}) \*(.+)$') {
      throw "SHA256SUMS.txt contains an invalid line."
    }
    $digest = $Matches[1].ToLowerInvariant()
    $name = $Matches[2]
    if ($name -match '[\x00-\x1f/\\]' -or $name -in @('.', '..', 'SHA256SUMS.txt') -or $checksumEntries.ContainsKey($name)) {
      throw "SHA256SUMS.txt contains an unsafe, self-referential, or duplicate entry."
    }
    if (-not $byName.ContainsKey($name)) {
      throw "SHA256SUMS.txt names a file that is not in the release directory."
    }
    $actualDigest = (Get-FileHash -Algorithm SHA256 -LiteralPath $byName[$name].FullName).Hash.ToLowerInvariant()
    if ($actualDigest -ne $digest) {
      throw "A local release file does not match SHA256SUMS.txt."
    }
    $checksumEntries.Add($name, $digest)
  }
  if ($checksumEntries.Count -ne ($files.Count - 1)) {
    throw "SHA256SUMS.txt does not cover every local release file exactly once."
  }
  foreach ($file in $files) {
    if ($file.Name -ne "SHA256SUMS.txt" -and -not $checksumEntries.ContainsKey($file.Name)) {
      throw "SHA256SUMS.txt does not cover every local release file exactly once."
    }
  }
  return $byName
}

function Test-DraftAssetsComplete {
  param(
    [Parameter(Mandatory = $true)]$Release,
    [Parameter(Mandatory = $true)]$LocalByName,
    [Parameter(Mandatory = $true)][long]$ExpectedReleaseId
  )
  $releaseId = [long]$Release.id
  if ($releaseId -le 0 -or `
      ($ExpectedReleaseId -gt 0 -and $releaseId -ne $ExpectedReleaseId) -or `
      [string]$Release.tag_name -cne $Tag) {
    throw "The expected GitHub draft release changed identity."
  }
  if (-not $Release.draft) {
    throw "The expected GitHub draft release no longer exists in the required state."
  }
  $remoteAssets = @($Release.assets)
  $remoteNames = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  $incomplete = $remoteAssets.Count -lt $LocalByName.Count
  foreach ($remoteAsset in $remoteAssets) {
    $name = [string]$remoteAsset.name
    if (-not $remoteNames.Add($name) -or -not $LocalByName.ContainsKey($name)) {
      throw "The draft contains a duplicate or unexpected asset."
    }
    $localFile = $LocalByName[$name]
    $expectedDigest = "sha256:$((Get-FileHash -Algorithm SHA256 -LiteralPath $localFile.FullName).Hash.ToLowerInvariant())"
    $remoteDigest = [string]$remoteAsset.digest
    if (-not [string]::IsNullOrWhiteSpace($remoteDigest) -and $remoteDigest -cne $expectedDigest) {
      throw "A draft asset SHA-256 digest does not match the local release set."
    }
    if ([string]$remoteAsset.state -ceq "uploaded") {
      if ([int64]$remoteAsset.size -ne [int64]$localFile.Length) {
        throw "A draft asset size does not match the local release set."
      }
      if ([string]::IsNullOrWhiteSpace($remoteDigest)) {
        $incomplete = $true
      }
    } else {
      $incomplete = $true
    }
  }
  return ($remoteAssets.Count -eq $LocalByName.Count -and -not $incomplete)
}

function Assert-DraftAssets {
  param(
    [Parameter(Mandatory = $true)]$Release,
    [Parameter(Mandatory = $true)]$LocalByName,
    [Parameter(Mandatory = $true)][long]$ExpectedReleaseId
  )
  if (-not (Test-DraftAssetsComplete `
      -Release $Release `
      -LocalByName $LocalByName `
      -ExpectedReleaseId $ExpectedReleaseId)) {
    throw "The draft asset set is not yet complete."
  }
}

function Wait-ForExactDraftAssets {
  param(
    [Parameter(Mandatory = $true)]$LocalByName,
    [long]$ExpectedReleaseId = 0,
    [int]$MaxAttempts = 10,
    [int]$DelaySeconds = 2
  )
  for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
    $candidate = Get-ReleaseByTag -AllowMissing
    if ($null -ne $candidate -and (Test-DraftAssetsComplete `
        -Release $candidate `
        -LocalByName $LocalByName `
        -ExpectedReleaseId $ExpectedReleaseId)) {
      return $candidate
    }
    if ($attempt -lt $MaxAttempts) {
      Start-Sleep -Seconds $DelaySeconds
    }
  }
  throw "GitHub did not expose one exact draft with the complete local asset set within the bounded verification window."
}

function Assert-BuildProvenance {
  param([Parameter(Mandatory = $true)]$LocalByName)
  foreach ($localFile in $LocalByName.Values) {
    & $script:ghPath attestation verify $localFile.FullName `
      --hostname github.com `
      --repo $repository `
      --signer-workflow $signerWorkflow `
      --source-ref "refs/tags/$Tag" `
      --source-digest $expectedCommitLower `
      --deny-self-hosted-runners 1>$null 2>$null
    if ($LASTEXITCODE -ne 0) {
      throw "A local release asset does not have valid build provenance from the exact release workflow, tag, and commit. No release was published."
    }
  }
}

Assert-GitHubCli
Assert-LocalGitCheckout
$localByName = Get-LocalReleaseSet
Assert-ImmutableReleasesEnabled
Assert-RemoteTag
$draftRelease = Wait-ForExactDraftAssets -LocalByName $localByName
$releaseId = [long]$draftRelease.id
Assert-DraftAssets -Release $draftRelease -LocalByName $localByName -ExpectedReleaseId $releaseId
Assert-BuildProvenance -LocalByName $localByName

if (-not $Publish) {
  Write-Host "Preflight passed. Re-run with -Publish to repeat every check, request confirmation, and publish the verified draft."
  return
}

$target = "$cliRepository release $Tag at commit $expectedCommitLower"
if (-not $PSCmdlet.ShouldProcess($target, "publish the verified draft as an immutable release")) {
  return
}

# Repeat all remotely mutable checks immediately before the irreversible API request.
Assert-LocalGitCheckout
Assert-ImmutableReleasesEnabled
Assert-RemoteTag
$draftRelease = Wait-ForExactDraftAssets `
  -LocalByName $localByName `
  -ExpectedReleaseId $releaseId
Assert-DraftAssets -Release $draftRelease -LocalByName $localByName -ExpectedReleaseId $releaseId
Assert-BuildProvenance -LocalByName $localByName

$prerelease = $Tag.Contains("-").ToString().ToLowerInvariant()
$publishedOutput = & $script:ghPath api `
  --hostname github.com `
  --method PATCH `
  -H "Accept: application/vnd.github+json" `
  -H "X-GitHub-Api-Version: $apiVersion" `
  "repos/$repository/releases/$releaseId" `
  -F "draft=false" `
  -F "prerelease=$prerelease" 2>$null
if ($LASTEXITCODE -ne 0) {
  throw "GitHub rejected the publication request. Re-check the draft without changing or overwriting assets."
}
$publishedRelease = ($publishedOutput | Out-String) | ConvertFrom-Json
if ($publishedRelease.draft -or $publishedRelease.prerelease -ne $Tag.Contains("-")) {
  throw "GitHub did not return the expected published/prerelease state."
}

$confirmedRelease = $null
for ($attempt = 1; $attempt -le 6; $attempt++) {
  $candidate = Get-ReleaseByTag -AllowMissing
  if ($null -ne $candidate) {
    if ([long]$candidate.id -ne $releaseId) {
      throw "The exact tag resolved to a different release identifier after publication."
    }
    if (-not $candidate.draft -and $candidate.prerelease -ne $Tag.Contains("-")) {
      throw "The published release has an unexpected prerelease state."
    }
    if (-not $candidate.draft -and $candidate.immutable) {
      $confirmedRelease = $candidate
      break
    }
  }
  if ($attempt -lt 6) {
    Start-Sleep -Seconds 2
  }
}
if ($null -eq $confirmedRelease) {
  throw "The release was published, but GitHub did not confirm immutable protection. Stop and investigate before making another release."
}
Assert-RemoteTag

$releaseVerified = $false
for ($attempt = 1; $attempt -le 6; $attempt++) {
  & $script:ghPath release verify $Tag --repo $cliRepository 1>$null 2>$null
  if ($LASTEXITCODE -eq 0) {
    $releaseVerified = $true
    break
  }
  if ($attempt -lt 6) {
    Start-Sleep -Seconds 2
  }
}
if (-not $releaseVerified) {
  throw "The immutable release was published, but 'gh release verify' did not validate its signed attestation. Stop and investigate."
}

foreach ($localFile in $localByName.Values) {
  & $script:ghPath release verify-asset $Tag $localFile.FullName --repo $cliRepository 1>$null 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "The immutable release was published, but an individual local asset did not verify against the release attestation. Stop and investigate."
  }
}

Write-Host "Published and verified immutable release $Tag for $expectedCommitLower."
