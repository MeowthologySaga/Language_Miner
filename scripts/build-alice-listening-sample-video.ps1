param(
  [string]$AudioPath = "public/samples/listening/alice-chapter1-sample.mp3",
  [string]$ImagePath = "public/samples/listening/alice-chapter1-scene.png",
  [string]$OutputPath = "public/samples/listening/alice-chapter1-sample.mp4",
  [int]$DurationSeconds = 60
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  throw "ffmpeg is required to build the listening sample video."
}

if (-not (Test-Path -LiteralPath $AudioPath)) {
  throw "Audio file not found: $AudioPath"
}

if (-not (Test-Path -LiteralPath $ImagePath)) {
  throw "Scene image not found: $ImagePath"
}

$outputDirectory = Split-Path -Parent $OutputPath
if ($outputDirectory) {
  New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
}

ffmpeg `
  -y `
  -loop 1 `
  -framerate 30 `
  -i $ImagePath `
  -i $AudioPath `
  -t $DurationSeconds `
  -c:v libx264 `
  -pix_fmt yuv420p `
  -c:a aac `
  -b:a 128k `
  -shortest `
  -movflags +faststart `
  $OutputPath

Write-Host "Created listening sample video: $OutputPath"
