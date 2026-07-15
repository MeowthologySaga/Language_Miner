param(
  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Speech

$directory = Split-Path -Parent $OutputPath
if ($directory) {
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
}

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $voices = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled })
  $synth.SetOutputToWaveFile($OutputPath)
  $synth.Rate = 0
  if ($voices.Count -gt 0) {
    $synth.SelectVoice($voices[0].VoiceInfo.Name)
  }
  $synth.Speak("I'm running a little late.")
  $synth.Rate = 1
  if ($voices.Count -gt 1) {
    $synth.SelectVoice($voices[1].VoiceInfo.Name)
  }
  $synth.Speak("No problem. I'll save you a seat.")
}
finally {
  $synth.Dispose()
}
