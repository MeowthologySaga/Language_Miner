import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { app } from "electron";
import { createTtsCacheId, normalizeTtsText } from "../src/shared/tts";
import type { TtsSynthesisInput, TtsSynthesisResult, TtsVoiceInfo } from "../src/shared/types";

const execFileAsync = promisify(execFile);
const POWERSHELL_EXE = "powershell.exe";

export async function synthesizeTts(
  input: TtsSynthesisInput,
  options: { signal?: AbortSignal } = {}
): Promise<TtsSynthesisResult> {
  throwIfTtsAborted(options.signal);
  const normalizedText = normalizeTtsText(input.text);
  if (!normalizedText) {
    return {
      providerName: input.providerName,
      model: input.model,
      voiceName: input.voiceName,
      message: "읽을 문장이 없습니다.",
      createdAt: new Date().toISOString()
    };
  }

  if (input.providerName === "piper") {
    return {
      providerName: input.providerName,
      model: input.model,
      voiceName: input.voiceName,
      message: "Piper 경량 TTS 모델은 아직 번들에 포함되지 않았습니다. 현재는 Windows 내장 TTS를 사용해 주세요.",
      createdAt: new Date().toISOString()
    };
  }

  const outputPath = getTtsOutputPath(input);
  throwIfTtsAborted(options.signal);
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  let selectedVoiceName = input.voiceName;
  if (!fs.existsSync(outputPath)) {
    selectedVoiceName = await synthesizeWithWindowsSpeech(
      {
        ...input,
        text: normalizedText
      },
      outputPath,
      options.signal
    );
  }

  throwIfTtsAborted(options.signal);
  const wav = await fs.promises.readFile(outputPath);
  throwIfTtsAborted(options.signal);
  return {
    audioDataUrl: `data:audio/wav;base64,${wav.toString("base64")}`,
    mimeType: "audio/wav",
    providerName: "system",
    model: input.model,
    voiceName: selectedVoiceName,
    createdAt: new Date().toISOString()
  };
}

export async function listTtsVoices(): Promise<TtsVoiceInfo[]> {
  if (process.platform !== "win32") {
    return [];
  }

  const script = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voices = $synth.GetInstalledVoices() | ForEach-Object {
  $info = $_.VoiceInfo
  [PSCustomObject]@{
    id = $info.Name
    name = $info.Name
    culture = $info.Culture.Name
    gender = [string]$info.Gender
    age = [string]$info.Age
  }
}
$synth.Dispose()
$voices | ConvertTo-Json -Compress
`;

  try {
    const { stdout } = await execFileAsync(POWERSHELL_EXE, [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      script
    ]);
    const parsed = JSON.parse(stdout.trim() || "[]") as TtsVoiceInfo | TtsVoiceInfo[];
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function getTtsOutputPath(input: TtsSynthesisInput) {
  const cacheId = createTtsCacheId(input).replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(getTtsCacheDir(), `${cacheId}.wav`);
}

function getTtsCacheDir() {
  const baseDir = app?.getPath ? app.getPath("userData") : os.tmpdir();
  return path.join(baseDir, "tts-cache");
}

async function synthesizeWithWindowsSpeech(
  input: TtsSynthesisInput,
  outputPath: string,
  signal?: AbortSignal
) {
  throwIfTtsAborted(signal);
  if (process.platform !== "win32") {
    throw new Error("Windows 내장 TTS는 Windows에서만 사용할 수 있습니다.");
  }

  const inputPath = path.join(getTtsCacheDir(), `${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
  await fs.promises.writeFile(inputPath, input.text, "utf8");
  const rate = Math.max(-10, Math.min(10, Math.round(input.rate ?? 0)));
  const script = `
$inputPath = $env:LEM_TTS_INPUT_PATH
$outputPath = $env:LEM_TTS_OUTPUT_PATH
$voiceName = $env:LEM_TTS_VOICE_NAME
$languageCode = $env:LEM_TTS_LANGUAGE_CODE
$rate = [int]$env:LEM_TTS_RATE
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$normalizedLanguage = ""
if ($languageCode) {
  $normalizedLanguage = $languageCode.Trim().ToLowerInvariant().Split("-")[0]
}
function Test-VoiceLanguage($voiceInfo, $lang) {
  if (-not $lang) { return $true }
  $culture = $voiceInfo.Culture.Name.ToLowerInvariant()
  return $culture -eq $lang -or $culture.StartsWith("$lang-")
}
$selectedMatchesLanguage = $false
if ($voiceName) {
  try {
    $synth.SelectVoice($voiceName)
    $selectedMatchesLanguage = Test-VoiceLanguage $synth.Voice $normalizedLanguage
  } catch {
    $selectedMatchesLanguage = $false
  }
}
if (-not $selectedMatchesLanguage -and $normalizedLanguage) {
  $matchingVoice = $synth.GetInstalledVoices() | Where-Object {
    $_.Enabled -and (Test-VoiceLanguage $_.VoiceInfo $normalizedLanguage)
  } | Select-Object -First 1
  if ($matchingVoice) {
    $synth.SelectVoice($matchingVoice.VoiceInfo.Name)
  }
}
$synth.Rate = [Math]::Max(-10, [Math]::Min(10, $rate))
$text = [System.IO.File]::ReadAllText($inputPath, [System.Text.Encoding]::UTF8)
$synth.SetOutputToWaveFile($outputPath)
$synth.Speak($text)
$selectedVoiceName = $synth.Voice.Name
$synth.Dispose()
$selectedVoiceName
`;

  try {
    const { stdout } = await execFileAsync(
      POWERSHELL_EXE,
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      {
        env: {
          ...process.env,
          LEM_TTS_INPUT_PATH: inputPath,
          LEM_TTS_OUTPUT_PATH: outputPath,
          LEM_TTS_VOICE_NAME: input.voiceName ?? "",
          LEM_TTS_LANGUAGE_CODE: input.languageCode,
          LEM_TTS_RATE: String(rate)
        },
        timeout: 60_000,
        signal,
        windowsHide: true
      }
    );
    throwIfTtsAborted(signal);
    return stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) || input.voiceName;
  } finally {
    await fs.promises.rm(inputPath, { force: true });
    if (signal?.aborted) {
      await fs.promises.rm(outputPath, { force: true }).catch(() => undefined);
    }
  }
}

function throwIfTtsAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  const error = new Error("TTS synthesis was canceled.");
  error.name = "AbortError";
  throw error;
}
