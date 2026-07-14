param(
  [string]$ReleaseDirectory = "release",
  [string]$OutputDirectory = "artifacts/release-secret-scan",
  [string]$ReleaseArtifactsDirectory = "artifacts/release"
)

$ErrorActionPreference = "Stop"

function Main {
  $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
  $releaseRoot = (Resolve-Path (Join-Path $repoRoot $ReleaseDirectory)).Path
  $releaseArtifactsRoot = (Resolve-Path (Join-Path $repoRoot $ReleaseArtifactsDirectory)).Path
  $outputRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot $OutputDirectory))
  Assert-PathInside -Candidate $releaseRoot -Root $repoRoot
  Assert-PathInside -Candidate $releaseArtifactsRoot -Root $repoRoot
  Assert-PathInside -Candidate $outputRoot -Root $repoRoot

  if (Test-Path -LiteralPath $outputRoot) {
    Remove-ManagedDirectory -Candidate $outputRoot -Root $repoRoot
  }
  New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null

  $sevenZip = Get-SevenZip
  $executables = @(Get-ChildItem -LiteralPath $releaseRoot -File -Filter "*.exe")
  if ($executables.Count -lt 2) {
    throw "Expected both installer and portable executables before the expanded secret scan."
  }

  foreach ($executable in $executables) {
    $safeName = [IO.Path]::GetFileNameWithoutExtension($executable.Name) -replace '[^A-Za-z0-9._-]', '_'
    $destination = Join-Path $outputRoot $safeName
    Expand-WithSevenZip -SevenZip $sevenZip -Archive $executable.FullName -Destination $destination
  }

  # NSIS payloads can contain a second compressed application archive. Expand
  # a bounded number of nested archive layers before extracting every ASAR.
  for ($depth = 0; $depth -lt 3; $depth += 1) {
    $nestedArchives = @(
      Get-ChildItem -LiteralPath $outputRoot -Recurse -File |
        Where-Object {
          $_.Extension -in @(".7z", ".zip", ".nupkg") -and
          -not (Test-Path -LiteralPath ($_.FullName + ".expanded"))
        }
    )
    if ($nestedArchives.Count -eq 0) { break }
    foreach ($archive in $nestedArchives) {
      Expand-WithSevenZip `
        -SevenZip $sevenZip `
        -Archive $archive.FullName `
        -Destination ($archive.FullName + ".expanded")
    }
  }

  $asarCli = Join-Path $repoRoot "node_modules/@electron/asar/bin/asar.js"
  if (-not (Test-Path -LiteralPath $asarCli -PathType Leaf)) {
    throw "The locked @electron/asar CLI is unavailable. Run npm ci before the release scan."
  }
  $asarFiles = @(Get-ChildItem -LiteralPath $outputRoot -Recurse -File -Filter "*.asar")
  if ($asarFiles.Count -eq 0) {
    throw "No ASAR payload was found after expanding the Windows release executables."
  }
  $asarExpansionRoots = @()
  foreach ($asar in $asarFiles) {
    $destination = $asar.FullName + ".expanded"
    Assert-PathInside -Candidate $destination -Root $outputRoot
    & node $asarCli extract $asar.FullName $destination
    if ($LASTEXITCODE -ne 0) {
      throw "ASAR extraction failed for $($asar.FullName)."
    }
    $asarExpansionRoots += $destination
  }

  $officialGameAssets = @(
    "abyss-summoner-0.1.2.lemgame",
    "cat-odyssey-0.1.1.lemgame",
    "drillheart-defense-0.2.0.lemgame"
  )
  foreach ($asarRoot in $asarExpansionRoots) {
    $forbiddenCartridges = @(
      Get-ChildItem -LiteralPath $asarRoot -Recurse -Directory -Filter "cartridges"
    )
    if ($forbiddenCartridges.Count -gt 0) {
      throw "PlayZone cartridges must not be included in a Windows artifact; official games are release assets downloaded on demand."
    }
  }

  foreach ($assetName in $officialGameAssets) {
    $assetPath = Join-Path $releaseArtifactsRoot $assetName
    if (-not (Test-Path -LiteralPath $assetPath -PathType Leaf)) {
      throw "Official on-demand PlayZone release asset is missing: $assetName"
    }
    if ((Get-Item -LiteralPath $assetPath).Length -le 0) {
      throw "Official on-demand PlayZone release asset is empty: $assetName"
    }
  }

  Write-Host "Expanded $($executables.Count) Windows executables and $($asarFiles.Count) ASAR payloads; verified cartridges are absent and $($officialGameAssets.Count) on-demand PlayZone release assets are present."
}

function Get-SevenZip {
  foreach ($commandName in @("7z.exe", "7z", "7za.exe", "7za")) {
    $command = Get-Command $commandName -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
  }
  throw "7-Zip is required to inspect the compressed installer and portable executable."
}

function Expand-WithSevenZip {
  param(
    [string]$SevenZip,
    [string]$Archive,
    [string]$Destination
  )
  Assert-PathInside -Candidate $Destination -Root $outputRoot
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  & $SevenZip x "-o$Destination" -y -- $Archive | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "7-Zip extraction failed for $Archive."
  }
}

function Assert-PathInside {
  param([string]$Candidate, [string]$Root)
  $normalizedRoot = [IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar)
  $normalizedCandidate = [IO.Path]::GetFullPath($Candidate)
  if (-not $normalizedCandidate.StartsWith(
    $normalizedRoot + [IO.Path]::DirectorySeparatorChar,
    [StringComparison]::OrdinalIgnoreCase
  )) {
    throw "Refusing to use a release-scan path outside its managed root: $normalizedCandidate"
  }
}

function Remove-ManagedDirectory {
  param([string]$Candidate, [string]$Root)
  Assert-PathInside -Candidate $Candidate -Root $Root
  $resolvedCandidate = [IO.Path]::GetFullPath($Candidate)
  if (-not (Test-Path -LiteralPath $resolvedCandidate)) { return }
  $extendedCandidate = if ($resolvedCandidate.StartsWith("\\?\")) {
    $resolvedCandidate
  } else {
    "\\?\$resolvedCandidate"
  }
  [IO.Directory]::Delete($extendedCandidate, $true)
}

Main
