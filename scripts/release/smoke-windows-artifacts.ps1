param(
  [string]$ReleaseDirectory = "release",
  [string]$BaselineReleaseDirectory = "release-baseline",
  [string]$WorkDirectory = "artifacts/windows-smoke",
  [string]$BaselineVersion = "0.1.0-beta.0",
  [string]$CurrentVersion = "",
  [switch]$OfficialGames
)

$ErrorActionPreference = "Stop"
$script:IsolatedProcessEnvironment = @{}
$script:StableQaUserDataRoot = ""

function Main {
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$releaseRoot = (Resolve-Path (Join-Path $repoRoot $ReleaseDirectory)).Path
$baselineReleaseRoot = (Resolve-Path (Join-Path $repoRoot $BaselineReleaseDirectory)).Path
$workRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot $WorkDirectory))
Assert-PathInside -Candidate $workRoot -Root $repoRoot
$packageJson = Get-Content -LiteralPath (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($CurrentVersion)) {
  $CurrentVersion = [string]$packageJson.version
}
if ($CurrentVersion -eq $BaselineVersion) {
  throw "Synthetic baseline and current release versions must be different."
}
if ([string]$packageJson.build.appId -ne "io.github.meowthologysaga.languageminer") {
  throw "The release appId changed, so the upgrade identity cannot be trusted."
}
$appDataRoot = [IO.Path]::GetFullPath((Join-Path $workRoot "isolated-appdata"))
$localAppDataRoot = [IO.Path]::GetFullPath((Join-Path $workRoot "isolated-localappdata"))
Assert-PathInside -Candidate $appDataRoot -Root $workRoot
Assert-PathInside -Candidate $localAppDataRoot -Root $workRoot

if (Test-Path -LiteralPath $workRoot) {
  Remove-Item -LiteralPath $workRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $workRoot -Force | Out-Null
New-Item -ItemType Directory -Path $appDataRoot -Force | Out-Null
New-Item -ItemType Directory -Path $localAppDataRoot -Force | Out-Null
$script:IsolatedProcessEnvironment = @{
  APPDATA = $appDataRoot
  LOCALAPPDATA = $localAppDataRoot
}

$baselineInstaller = Get-SingleArtifact `
  -Root $baselineReleaseRoot `
  -Pattern "*Setup*$BaselineVersion*x64*.exe" `
  -Label "synthetic baseline NSIS installer"
$installer = Get-SingleArtifact `
  -Root $releaseRoot `
  -Pattern "*Setup*$CurrentVersion*x64*.exe" `
  -Label "current NSIS installer"
$portable = Get-SingleArtifact `
  -Root $releaseRoot `
  -Pattern "*Portable*$CurrentVersion*x64*.exe" `
  -Label "current portable executable"

# The first public beta has no older public binary. Build beta.0 from the same
# audited source with electron-builder extraMetadata, then prove that beta.1
# upgrades the same app identity and preserves real renderer/database markers.
$upgradeInstallRoot = [IO.Path]::GetFullPath((Join-Path $workRoot "installed-upgrade"))
$upgradeUserDataRoot = [IO.Path]::GetFullPath((Join-Path $appDataRoot "Language Miner"))
Assert-PathInside -Candidate $upgradeInstallRoot -Root $workRoot
Assert-PathInside -Candidate $upgradeUserDataRoot -Root $workRoot
$script:StableQaUserDataRoot = $upgradeUserDataRoot

Invoke-ProcessAndWait `
  -FilePath $baselineInstaller.FullName `
  -Arguments @("/S", "/D=$upgradeInstallRoot") `
  -TimeoutMs 180000
$installedExe = Get-InstalledAppExecutable -InstallRoot $upgradeInstallRoot
$baselineInstalledExePath = $installedExe.FullName
Assert-NoUnexpectedDefaultInstall -LocalAppDataRoot $localAppDataRoot
$baselineRegistration = Get-LanguageMinerUninstallRegistration -InstallRoot $upgradeInstallRoot
$baselineAsarHash = Get-InstalledAsarHash -InstallRoot $upgradeInstallRoot
Invoke-AppSmoke `
  -Executable $installedExe.FullName `
  -Label "installed-baseline-lifecycle" `
  -UseDefaultUserData $true `
  -Locale "en" `
  -Viewport "1240x820" `
  -ScaleFactor "1.25" `
  -LifecyclePhase "baseline" `
  -InjectSettings $true
Assert-UpgradeDataMarkers -UserDataRoot $upgradeUserDataRoot
$sentinelPath = Join-Path $upgradeUserDataRoot "upgrade-sentinel.txt"
Set-Content -LiteralPath $sentinelPath -Value "preserve-across-upgrade-repair-uninstall" -Encoding UTF8

Invoke-ProcessAndWait `
  -FilePath $installer.FullName `
  -Arguments @("/S", "/D=$upgradeInstallRoot") `
  -TimeoutMs 180000
$installedExe = Get-InstalledAppExecutable -InstallRoot $upgradeInstallRoot
if (-not $installedExe.FullName.Equals($baselineInstalledExePath, [StringComparison]::OrdinalIgnoreCase)) {
  throw "The beta.1 upgrade installed to a second path instead of replacing beta.0 in place."
}
Assert-NoUnexpectedDefaultInstall -LocalAppDataRoot $localAppDataRoot
$upgradedRegistration = Get-LanguageMinerUninstallRegistration -InstallRoot $upgradeInstallRoot
if ($upgradedRegistration.KeyName -ne $baselineRegistration.KeyName) {
  throw "The beta.1 upgrade registered a second app identity instead of replacing beta.0."
}
$upgradedAsarHash = Get-InstalledAsarHash -InstallRoot $upgradeInstallRoot
if ($upgradedAsarHash -eq $baselineAsarHash) {
  throw "The beta.1 upgrade did not replace the synthetic beta.0 ASAR payload."
}
Invoke-AppSmoke `
  -Executable $installedExe.FullName `
  -Label "installed-upgraded-lifecycle" `
  -UseDefaultUserData $true `
  -Locale "en" `
  -Viewport "1240x820" `
  -ScaleFactor "1.25" `
  -LifecyclePhase "upgraded" `
  -InjectSettings $false
Assert-UpgradeDataMarkers -UserDataRoot $upgradeUserDataRoot

# Installing the exact same beta.1 artifact is a repair, not an update.
Invoke-ProcessAndWait `
  -FilePath $installer.FullName `
  -Arguments @("/S", "/D=$upgradeInstallRoot") `
  -TimeoutMs 180000
$installedExe = Get-InstalledAppExecutable -InstallRoot $upgradeInstallRoot
if (-not $installedExe.FullName.Equals($baselineInstalledExePath, [StringComparison]::OrdinalIgnoreCase)) {
  throw "The beta.1 repair installed to a second path."
}
Assert-NoUnexpectedDefaultInstall -LocalAppDataRoot $localAppDataRoot
$repairRegistration = Get-LanguageMinerUninstallRegistration -InstallRoot $upgradeInstallRoot
if ($repairRegistration.KeyName -ne $upgradedRegistration.KeyName) {
  throw "The beta.1 repair created a duplicate uninstall registration."
}
if ((Get-InstalledAsarHash -InstallRoot $upgradeInstallRoot) -ne $upgradedAsarHash) {
  throw "The beta.1 repair changed the installed beta.1 payload unexpectedly."
}
Invoke-AppSmoke `
  -Executable $installedExe.FullName `
  -Label "installed-repair-lifecycle" `
  -UseDefaultUserData $true `
  -Locale "en" `
  -Viewport "1240x820" `
  -ScaleFactor "1.25" `
  -LifecyclePhase "repair" `
  -InjectSettings $false
Assert-UpgradeDataMarkers -UserDataRoot $upgradeUserDataRoot

Invoke-SilentUninstall -InstallRoot $upgradeInstallRoot
Assert-Uninstalled -InstallRoot $upgradeInstallRoot -RegistrationKeyName $repairRegistration.KeyName
Assert-UpgradeDataMarkers -UserDataRoot $upgradeUserDataRoot
if (-not (Test-Path -LiteralPath $sentinelPath -PathType Leaf)) {
  throw "The uninstaller unexpectedly removed the user's upgrade sentinel."
}

# Independently prove a clean installation of the actual beta.1 artifact across
# the complete locale, viewport, and Windows scale matrix.
$cleanInstallRoot = [IO.Path]::GetFullPath((Join-Path $workRoot "installed-clean-current"))
$cleanUserDataRoot = [IO.Path]::GetFullPath((Join-Path $workRoot "user-data-clean-current"))
Assert-PathInside -Candidate $cleanInstallRoot -Root $workRoot
Assert-PathInside -Candidate $cleanUserDataRoot -Root $workRoot
$script:StableQaUserDataRoot = $cleanUserDataRoot
Invoke-ProcessAndWait `
  -FilePath $installer.FullName `
  -Arguments @("/S", "/D=$cleanInstallRoot") `
  -TimeoutMs 180000
$installedExe = Get-InstalledAppExecutable -InstallRoot $cleanInstallRoot
$cleanRegistration = Get-LanguageMinerUninstallRegistration -InstallRoot $cleanInstallRoot

$releaseMatrix = @(
  @{ Label = "ko-940x680-125"; Locale = "ko"; Viewport = "940x680"; Scale = "1.25" },
  @{ Label = "en-940x680-150"; Locale = "en"; Viewport = "940x680"; Scale = "1.5" },
  @{ Label = "ko-1240x820-150"; Locale = "ko"; Viewport = "1240x820"; Scale = "1.5" },
  @{ Label = "en-1240x820-125"; Locale = "en"; Viewport = "1240x820"; Scale = "1.25" },
  @{ Label = "ko-1920x1080-125"; Locale = "ko"; Viewport = "1920x1080"; Scale = "1.25" },
  @{ Label = "en-1920x1080-150"; Locale = "en"; Viewport = "1920x1080"; Scale = "1.5" }
)
foreach ($case in $releaseMatrix) {
  Invoke-AppSmoke `
    -Executable $installedExe.FullName `
    -Label "installed-clean-current-$($case.Label)" `
    -UseDefaultUserData $true `
    -Locale $case.Locale `
    -Viewport $case.Viewport `
    -ScaleFactor $case.Scale
}
# The large network-backed game check is opt-in for local runs. Release CI
# enables it explicitly after building the packaged installer.
if ($OfficialGames) {
  $officialGamesUserDataRoot = [IO.Path]::GetFullPath(
    (Join-Path $workRoot "user-data-official-games")
  )
  Assert-PathInside -Candidate $officialGamesUserDataRoot -Root $workRoot
  Invoke-AppSmoke `
    -Executable $installedExe.FullName `
    -Label "installed-clean-official-games" `
    -UserDataDirectory $officialGamesUserDataRoot `
    -Locale "en" `
    -Viewport "1240x820" `
    -ScaleFactor "1.25" `
    -VerifyOfficialGames $true `
    -TimeoutMs 3300000
  Remove-SmokeDirectory -Path $officialGamesUserDataRoot -Root $workRoot
}
Invoke-SilentUninstall -InstallRoot $cleanInstallRoot
Assert-Uninstalled -InstallRoot $cleanInstallRoot -RegistrationKeyName $cleanRegistration.KeyName

Invoke-AppSmoke `
  -Executable $portable.FullName `
  -Label "portable-ko-min" `
  -UserDataDirectory (Join-Path $workRoot "user-data-portable-ko") `
  -Locale "ko" `
  -Viewport "940x680" `
  -ScaleFactor "1.5"
Invoke-AppSmoke `
  -Executable $portable.FullName `
  -Label "portable-en-wide" `
  -UserDataDirectory (Join-Path $workRoot "user-data-portable-en") `
  -Locale "en" `
  -Viewport "1920x1080" `
  -ScaleFactor "1.25"

# Keep only the redacted JSON reports and QA screenshots as workflow
# evidence. Chromium profiles contain SQLite databases, cache files, local
# paths, and OS-encrypted state even when the test data itself is synthetic;
# none of those directories may be uploaded from a public repository.
foreach ($transientDataRoot in @(
  $appDataRoot,
  $localAppDataRoot,
  $cleanUserDataRoot,
  (Join-Path $workRoot "user-data-portable-ko"),
  (Join-Path $workRoot "user-data-portable-en")
)) {
  Remove-SmokeDirectory -Path $transientDataRoot -Root $workRoot
}

Write-Host "Windows clean install, synthetic upgrade, repair, uninstall, and portable smoke passed."
}

function Get-SingleArtifact {
  param([string]$Root, [string]$Pattern, [string]$Label)
  $matches = @(Get-ChildItem -LiteralPath $Root -File -Filter $Pattern)
  if ($matches.Count -ne 1) {
    throw "Expected exactly one $Label matching '$Pattern', found $($matches.Count)."
  }
  return $matches[0]
}

function Get-InstalledAppExecutable {
  param([string]$InstallRoot)
  $matches = @(
    Get-ChildItem -LiteralPath $InstallRoot -Recurse -File -Filter "Language Miner.exe" |
      Where-Object { $_.Name -notmatch "(?i)uninstall" }
  )
  if ($matches.Count -ne 1) {
    throw "Expected exactly one installed Language Miner executable, found $($matches.Count)."
  }
  return $matches[0]
}

function Get-InstalledAsarHash {
  param([string]$InstallRoot)
  $asarPath = Join-Path $InstallRoot "resources/app.asar"
  if (-not (Test-Path -LiteralPath $asarPath -PathType Leaf)) {
    throw "The installed application is missing resources/app.asar."
  }
  return (Get-FileHash -LiteralPath $asarPath -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Assert-NoUnexpectedDefaultInstall {
  param([string]$LocalAppDataRoot)
  $duplicates = @(
    Get-ChildItem -LiteralPath $LocalAppDataRoot -Recurse -File -Filter "Language Miner.exe" `
      -ErrorAction SilentlyContinue
  )
  if ($duplicates.Count -gt 0) {
    throw "The installer created an unexpected second application path under isolated LocalAppData."
  }
}

function Get-LanguageMinerUninstallRegistration {
  param([string]$InstallRoot)
  $uninstallRegistryRoot = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall"
  $escapedInstallRoot = [regex]::Escape([IO.Path]::GetFullPath($InstallRoot))
  $matches = @(
    Get-ChildItem -LiteralPath $uninstallRegistryRoot -ErrorAction SilentlyContinue |
      ForEach-Object {
        $entry = Get-ItemProperty -LiteralPath $_.PSPath
        if (
          [string]$entry.DisplayName -like "Language Miner*" -and
          [string]$entry.UninstallString -match $escapedInstallRoot
        ) {
          [PSCustomObject]@{
            KeyName = $_.PSChildName
            DisplayName = [string]$entry.DisplayName
            UninstallString = [string]$entry.UninstallString
          }
        }
      }
  )
  if ($matches.Count -ne 1) {
    throw "Expected one Language Miner uninstall registration for $InstallRoot, found $($matches.Count)."
  }
  return $matches[0]
}

function Invoke-SilentUninstall {
  param([string]$InstallRoot)
  $uninstallers = @(
    Get-ChildItem -LiteralPath $InstallRoot -File -Filter "*.exe" |
      Where-Object { $_.Name -match "(?i)uninstall" }
  )
  if ($uninstallers.Count -ne 1) {
    throw "Expected exactly one uninstaller in $InstallRoot, found $($uninstallers.Count)."
  }
  Invoke-ProcessAndWait -FilePath $uninstallers[0].FullName -Arguments @("/S") -TimeoutMs 180000
}

function Assert-Uninstalled {
  param([string]$InstallRoot, [string]$RegistrationKeyName)
  for ($attempt = 0; $attempt -lt 120 -and (Test-Path -LiteralPath $InstallRoot); $attempt += 1) {
    Start-Sleep -Milliseconds 500
  }
  if (Test-Path -LiteralPath $InstallRoot) {
    throw "The silent uninstaller left the installation folder behind: $InstallRoot"
  }
  $registrationPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$RegistrationKeyName"
  for ($attempt = 0; $attempt -lt 40 -and (Test-Path -LiteralPath $registrationPath); $attempt += 1) {
    Start-Sleep -Milliseconds 250
  }
  if (Test-Path -LiteralPath $registrationPath) {
    throw "The silent uninstaller left its uninstall registration behind."
  }
}

function Assert-UpgradeDataMarkers {
  param([string]$UserDataRoot)
  $requiredPaths = @(
    (Join-Path $UserDataRoot "app-onboarding-state.json"),
    (Join-Path $UserDataRoot "local-english-miner.sqlite"),
    (Join-Path $UserDataRoot "Local Storage/leveldb")
  )
  foreach ($requiredPath in $requiredPaths) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
      throw "An upgrade persistence marker is missing: $requiredPath"
    }
  }
  $onboardingState = Get-Content -LiteralPath $requiredPaths[0] -Raw | ConvertFrom-Json
  if ($onboardingState.schemaVersion -ne 1 -or $onboardingState.completed -ne $true) {
    throw "The durable onboarding marker is not complete."
  }
}

function Invoke-AppSmoke {
  param(
    [string]$Executable,
    [string]$Label,
    [string]$UserDataDirectory,
    [bool]$UseDefaultUserData = $false,
    [bool]$VerifyOfficialGames = $false,
    [ValidateSet("none", "baseline", "upgraded", "repair")][string]$LifecyclePhase = "none",
    [bool]$InjectSettings = $true,
    [int]$TimeoutMs = 240000,
    [ValidateSet("ko", "en")][string]$Locale = "ko",
    [ValidatePattern("^\d{3,4}x\d{3,4}$")][string]$Viewport = "1240x820",
    [ValidateSet("1", "1.25", "1.5")][string]$ScaleFactor = "1.25"
  )
  $effectiveUserDataDirectory = if ($UseDefaultUserData) {
    $script:StableQaUserDataRoot
  } else {
    $UserDataDirectory
  }
  if ([string]::IsNullOrWhiteSpace($effectiveUserDataDirectory)) {
    throw "$Label has no isolated QA user-data directory."
  }
  New-Item -ItemType Directory -Path $effectiveUserDataDirectory -Force | Out-Null
  $reportPath = Join-Path $workRoot "$Label-report.json"
  $settings = @{
    providerName = "mock"
    translationProviderName = "localMt"
  } | ConvertTo-Json -Compress

  $environment = @{
    LM_QA_APP_SMOKE = "1"
    LM_QA_APP_SMOKE_REPORT = $reportPath
    LM_QA_APP_LOCALE = $Locale
    LM_QA_DEVICE_SCALE_FACTOR = $ScaleFactor
    LM_QA_VIEWPORT = $Viewport
    LM_QA_USER_DATA_DIR = $effectiveUserDataDirectory
  }
  if ($InjectSettings) {
    $environment.LM_QA_APP_SETTINGS_JSON = $settings
  }
  if ($LifecyclePhase -ne "none") {
    $environment.LM_QA_UPGRADE_PHASE = $LifecyclePhase
  }
  if ($VerifyOfficialGames) {
    $environment.LM_QA_PLAYZONE_OFFICIAL_GAMES = "1"
  }
  Invoke-ProcessAndWait `
    -FilePath $Executable `
    -Arguments @("--lang=$Locale") `
    -TimeoutMs $TimeoutMs `
    -Environment $environment
  if (-not (Test-Path -LiteralPath $reportPath)) {
    throw "$Label did not produce an app-smoke report."
  }
  $report = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
  if (
    $report.locale -ne $Locale -or
    $report.localeEvidence.storedLocale -ne $Locale -or
    $report.localeEvidence.documentLanguage -ne $Locale
  ) {
    throw "$Label reported locale '$($report.locale)' instead of '$Locale'."
  }
  $expectedScale = [double]::Parse($ScaleFactor, [Globalization.CultureInfo]::InvariantCulture)
  $reportedScale = [double]$report.requestedScaleFactor
  $rendererScale = [double]$report.scaleEvidence.rendererDevicePixelRatio
  if (
    $report.scaleEvidence.matches -ne $true -or
    [Math]::Abs($reportedScale - $expectedScale) -gt 0.001 -or
    [Math]::Abs($rendererScale - $expectedScale) -gt 0.02
  ) {
    throw "$Label scale evidence did not match $ScaleFactor (requested=$reportedScale, renderer=$rendererScale)."
  }
  $failedRoutes = @($report.routes | Where-Object { $_.status -ne "passed" })
  if ($report.status -ne "passed" -or $failedRoutes.Count -gt 0) {
    throw "$Label app smoke failed for $($failedRoutes.Count) route(s)."
  }
  if ($LifecyclePhase -ne "none") {
    $lifecycle = $report.upgradeLifecycleEvidence
    $expectedOnboardingVisible = $LifecyclePhase -eq "baseline"
    if (
      $lifecycle.phase -ne $LifecyclePhase -or
      $lifecycle.onboardingInitiallyVisible -ne $expectedOnboardingVisible -or
      $lifecycle.hostCompletedAfter -ne $true -or
      $lifecycle.rendererCompletedAfter -ne $true -or
      $lifecycle.settingsMarkerPreserved -ne $true -or
      $lifecycle.cardMarkerPreserved -ne $true -or
      [int]$lifecycle.cardCount -lt 1
    ) {
      throw "$Label did not preserve the complete $LifecyclePhase lifecycle state."
    }
  }
  if ($VerifyOfficialGames) {
    $officialCheck = $report.playZoneOfficialGamesCheck
    $games = @($officialCheck.games)
    $failedGames = @($games | Where-Object {
      $_.installed -ne $true -or
      $_.status -ne "trusted_official" -or
      [int]$_.securityIssueCount -ne 0 -or
      [int]$_.canvasCount -lt 1 -or
      [int]$_.pendingImageCount -ne 0 -or
      [int]$_.failedImageCount -ne 0
    })
    if (
      $officialCheck.mode -ne "download-install-runtime" -or
      $games.Count -ne 3 -or
      $failedGames.Count -gt 0
    ) {
      throw "$Label did not verify all three official games through download, install, and runtime launch."
    }
  }
}

function Invoke-ProcessAndWait {
  param(
    [string]$FilePath,
    [string[]]$Arguments,
    [int]$TimeoutMs,
    [hashtable]$Environment = @{}
  )
  $startInfo = [Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $FilePath
  $startInfo.UseShellExecute = $false
  if ($null -ne $startInfo.ArgumentList) {
    foreach ($argument in $Arguments) {
      [void]$startInfo.ArgumentList.Add($argument)
    }
  } else {
    $startInfo.Arguments = ($Arguments | ForEach-Object { ConvertTo-NativeArgument $_ }) -join " "
  }
  foreach ($entry in $script:IsolatedProcessEnvironment.GetEnumerator()) {
    $startInfo.Environment[$entry.Key] = [string]$entry.Value
  }
  foreach ($entry in $Environment.GetEnumerator()) {
    $startInfo.Environment[$entry.Key] = [string]$entry.Value
  }
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  if (-not $process.Start()) {
    throw "Failed to start $FilePath"
  }
  if (-not $process.WaitForExit($TimeoutMs)) {
    $process.Kill($true)
    throw "$FilePath timed out after $TimeoutMs ms."
  }
  if ($process.ExitCode -ne 0) {
    throw "$FilePath exited with code $($process.ExitCode)."
  }
}

function ConvertTo-NativeArgument {
  param([AllowEmptyString()][string]$Value)
  if ($Value -notmatch '[\s"]') { return $Value }
  $escaped = [regex]::Replace($Value, '(\\*)"', '$1$1\"')
  $escaped = [regex]::Replace($escaped, '(\\+)$', '$1$1')
  return '"' + $escaped + '"'
}

function Assert-PathInside {
  param([string]$Candidate, [string]$Root)
  $normalizedRoot = [IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar)
  $normalizedCandidate = [IO.Path]::GetFullPath($Candidate)
  if (-not $normalizedCandidate.StartsWith(
    $normalizedRoot + [IO.Path]::DirectorySeparatorChar,
    [StringComparison]::OrdinalIgnoreCase
  )) {
    throw "Refusing to use a smoke-test path outside the repository: $normalizedCandidate"
  }
}

function Remove-SmokeDirectory {
  param([string]$Path, [string]$Root)
  $resolvedPath = [IO.Path]::GetFullPath($Path)
  Assert-PathInside -Candidate $resolvedPath -Root $Root
  for ($attempt = 0; $attempt -lt 20 -and (Test-Path -LiteralPath $resolvedPath); $attempt += 1) {
    try {
      Remove-Item -LiteralPath $resolvedPath -Recurse -Force -ErrorAction Stop
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }
  if (Test-Path -LiteralPath $resolvedPath) {
    throw "The disposable official-game QA profile could not be removed: $resolvedPath"
  }
}

Main
