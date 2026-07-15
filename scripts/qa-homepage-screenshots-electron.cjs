const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const sharp = require("sharp");
const { createQaRedactedLogSink } = require("./qa-redacted-log-sink.cjs");

const repoRoot = path.resolve(__dirname, "..");
const docsImageRoot = path.join(repoRoot, "docs", "site", "assets", "app-images");
const codexSiteImageRoot = path.join(
  repoRoot,
  "artifacts",
  "codex-site",
  "public",
  "screens"
);
const expectedScreenshotNames = [
  "home-web-reader-live.webp",
  "home-document-alice.webp",
  "home-video-reader-sitcom.webp",
  "home-reading-card-front.webp",
  "home-reading-card-back.webp",
  "home-listening-card-front.webp",
  "home-listening-card-back.webp",
  "home-speaking-card-front.webp",
  "home-speaking-card-back.webp"
];
const liveWebReaderUrl = "https://www.gutenberg.org/files/11/11-0.txt";
const homepageSceneImage = path.join(
  repoRoot,
  "public",
  "samples",
  "listening",
  "onboarding-office-send.png"
);

function parseArgs(argv) {
  const result = {
    locales: ["ko", "en"],
    timeoutMs: 360_000,
    keepPng: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--locale" && next) {
      if (next !== "ko" && next !== "en") throw new Error("--locale must be ko or en.");
      result.locales = [next];
      index += 1;
    } else if (arg === "--timeout-ms" && next) {
      result.timeoutMs = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === "--keep-png") {
      result.keepPng = true;
    }
  }
  if (!Number.isFinite(result.timeoutMs) || result.timeoutMs < 60_000) {
    throw new Error("--timeout-ms must be at least 60000.");
  }
  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const electronMain = path.join(repoRoot, "dist-electron", "electron", "main.js");
  if (!fs.existsSync(electronMain)) {
    throw new Error("dist-electron/electron/main.js not found. Run npm.cmd run build first.");
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runRoot = path.join(repoRoot, "debug", "qa", "homepage-screenshots", timestamp);
  const fixtureRoot = path.join(runRoot, "fixtures");
  const fixturePdfPath = path.join(fixtureRoot, "alice-chapter-one.pdf");
  const fixtureVideoPath = path.join(fixtureRoot, "office-dialogue.mp4");
  fs.mkdirSync(fixtureRoot, { recursive: true });

  await createAlicePdf(fixturePdfPath);
  const dialogue = createOfficeDialogueVideo(fixtureRoot, fixtureVideoPath);
  fs.writeFileSync(
    path.join(fixtureRoot, "fixture-provenance.json"),
    `${JSON.stringify(
      {
        aliceSource: "Project Gutenberg eBook #11",
        imageSource: "public/samples/listening/onboarding-office-send.png",
        audioPolicy: "Temporary on-device Windows TTS fixture; never copied to public assets.",
        dialogue
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  const reports = [];
  for (const locale of options.locales) {
    const localeRoot = path.join(runRoot, locale);
    const pngOutput = path.join(localeRoot, "png");
    const reportPath = path.join(localeRoot, "report.json");
    const logPath = path.join(localeRoot, "electron.log");
    const userDataDir = path.join(localeRoot, "user-data");
    fs.mkdirSync(pngOutput, { recursive: true });
    fs.mkdirSync(userDataDir, { recursive: true });

    await runElectron({
      electronMain,
      locale,
      pngOutput,
      reportPath,
      logPath,
      userDataDir,
      fixturePdfPath,
      fixtureVideoPath,
      dialogue,
      timeoutMs: options.timeoutMs
    });
    if (!fs.existsSync(reportPath)) {
      throw new Error(`Homepage screenshot report was not written: ${reportPath}`);
    }
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    if (report.status !== "passed") {
      throw new Error(`Homepage screenshot QA failed for ${locale}: ${reportPath}`);
    }
    assertScreenshotCompleteness(locale, report);
    const converted = await convertScreenshots(
      locale,
      report.screenshots,
      options.keepPng
    );
    reports.push({ locale, reportPath, converted });
  }

  const summaryPath = path.join(runRoot, "summary.json");
  fs.writeFileSync(
    summaryPath,
    `${JSON.stringify({ status: "passed", liveWebReaderUrl, reports }, null, 2)}\n`,
    "utf8"
  );
  console.log(
    JSON.stringify(
      {
        status: "passed",
        summaryPath: path.relative(repoRoot, summaryPath),
        locales: reports.map((report) => ({
          locale: report.locale,
          screenshots: report.converted.length
        }))
      },
      null,
      2
    )
  );
}

async function createAlicePdf(filePath) {
  const sourcePath = path.join(
    repoRoot,
    "public",
    "samples",
    "reading",
    "alice-adventures-in-wonderland-gutenberg.txt"
  );
  const source = fs.readFileSync(sourcePath, "utf8").replace(/\s+/g, " ");
  if (!source.includes("Oh dear! I shall be late!")) {
    throw new Error("The tracked Alice source no longer contains the expected Chapter I line.");
  }

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([612, 792]);
  page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(0.965, 0.973, 0.988) });
  page.drawText("ALICE'S ADVENTURES IN WONDERLAND", {
    x: 52,
    y: 706,
    size: 21,
    font: bold,
    color: rgb(0.08, 0.15, 0.27)
  });
  page.drawText("Lewis Carroll", {
    x: 52,
    y: 676,
    size: 13,
    font: regular,
    color: rgb(0.32, 0.39, 0.5)
  });
  page.drawText("CHAPTER I - Down the Rabbit-Hole", {
    x: 52,
    y: 622,
    size: 16,
    font: bold,
    color: rgb(0.12, 0.29, 0.55)
  });
  const excerpt = [
    "Alice was beginning to get very tired of sitting by her sister on the bank,",
    "and of having nothing to do.",
    "",
    "A White Rabbit with pink eyes ran close by her.",
    "The Rabbit looked at its watch and said:",
    "",
    "Oh dear! I shall be late!",
    "",
    "Alice ran across the field after it, burning with curiosity."
  ];
  excerpt.forEach((line, index) => {
    page.drawText(line, {
      x: line === "Oh dear! I shall be late!" ? 74 : 62,
      y: 566 - index * 39,
      size: line === "Oh dear! I shall be late!" ? 19 : 13,
      font: line === "Oh dear! I shall be late!" ? bold : regular,
      color:
        line === "Oh dear! I shall be late!"
          ? rgb(0.06, 0.35, 0.7)
          : rgb(0.12, 0.17, 0.27)
    });
  });
  page.drawText("Public-domain reading sample - Project Gutenberg eBook #11", {
    x: 52,
    y: 44,
    size: 9,
    font: regular,
    color: rgb(0.38, 0.44, 0.54)
  });
  fs.writeFileSync(filePath, await pdf.save());
}

function createOfficeDialogueVideo(fixtureRoot, outputPath) {
  const imagePath = path.join(
    repoRoot,
    "public",
    "samples",
    "listening",
    "onboarding-office-send.png"
  );
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Rights-cleared listening scene is missing: ${imagePath}`);
  }
  const firstText = "Could you send it to me when you get a chance?";
  const secondText = "Sure. I'll send it right after lunch.";
  const firstWav = path.join(fixtureRoot, "office-dialogue-line-1.wav");
  const secondWav = path.join(fixtureRoot, "office-dialogue-line-2.wav");
  const combinedWav = path.join(fixtureRoot, "office-dialogue.wav");
  const firstVoice = synthesizeWindowsSpeech({
    text: firstText,
    outputPath: firstWav,
    preferredVoice: "Microsoft Zira Desktop",
    rate: -1
  });
  const secondVoice = synthesizeWindowsSpeech({
    text: secondText,
    outputPath: secondWav,
    preferredVoice: "Microsoft David Desktop",
    rate: 0
  });
  const gapSeconds = 0.45;
  runFfmpeg(
    [
      "-y",
      "-i",
      firstWav,
      "-f",
      "lavfi",
      "-t",
      String(gapSeconds),
      "-i",
      "anullsrc=r=48000:cl=mono",
      "-i",
      secondWav,
      "-filter_complex",
      "[0:a]aformat=sample_rates=48000:channel_layouts=mono[a0];" +
        "[1:a]aformat=sample_rates=48000:channel_layouts=mono[gap];" +
        "[2:a]aformat=sample_rates=48000:channel_layouts=mono[a2];" +
        "[a0][gap][a2]concat=n=3:v=0:a=1[out]",
      "-map",
      "[out]",
      "-c:a",
      "pcm_s16le",
      combinedWav
    ],
    "Could not assemble the temporary office dialogue audio."
  );
  runFfmpeg(
    [
      "-y",
      "-loop",
      "1",
      "-framerate",
      "30",
      "-i",
      imagePath,
      "-i",
      combinedWav,
      "-map_metadata",
      "-1",
      "-vf",
      "scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-tune",
      "stillimage",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-shortest",
      "-movflags",
      "+faststart",
      outputPath
    ],
    "Could not create the temporary office dialogue video."
  );

  const firstDuration = probeDuration(firstWav);
  const totalDuration = probeDuration(outputPath);
  return {
    title: "Office chat · Send it when you get a chance",
    firstVoice,
    secondVoice,
    segments: [
      {
        id: "office-dialogue-1",
        speaker: "Maya",
        start: 0,
        end: firstDuration,
        text: firstText,
        translationKo: "시간 될 때 그거 나한테 보내줄래?"
      },
      {
        id: "office-dialogue-2",
        speaker: "Alex",
        start: Math.min(totalDuration, firstDuration + gapSeconds),
        end: totalDuration,
        text: secondText,
        translationKo: "응. 점심 먹고 바로 보낼게."
      }
    ]
  };
}

function synthesizeWindowsSpeech(input) {
  const inputPath = `${input.outputPath}.txt`;
  fs.writeFileSync(inputPath, input.text, "utf8");
  const script = `
$inputPath = $env:LEM_TTS_INPUT_PATH
$outputPath = $env:LEM_TTS_OUTPUT_PATH
$preferredVoice = $env:LEM_TTS_VOICE_NAME
$rate = [int]$env:LEM_TTS_RATE
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$available = $synth.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like 'en-*' }
$preferred = $available | Where-Object { $_.VoiceInfo.Name -eq $preferredVoice } | Select-Object -First 1
if ($preferred) {
  $synth.SelectVoice($preferred.VoiceInfo.Name)
} elseif ($available) {
  $synth.SelectVoice(($available | Select-Object -First 1).VoiceInfo.Name)
} else {
  throw 'No installed English Windows speech voice was found.'
}
$synth.Rate = [Math]::Max(-10, [Math]::Min(10, $rate))
$text = [System.IO.File]::ReadAllText($inputPath, [System.Text.Encoding]::UTF8)
$synth.SetOutputToWaveFile($outputPath)
$synth.Speak($text)
$selectedVoice = $synth.Voice.Name
$synth.Dispose()
$selectedVoice
`;
  try {
    const result = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      {
        cwd: repoRoot,
        encoding: "utf8",
        windowsHide: true,
        timeout: 60_000,
        env: {
          ...process.env,
          __COMPAT_LAYER: "DisableWerDialog",
          LEM_TTS_INPUT_PATH: inputPath,
          LEM_TTS_OUTPUT_PATH: input.outputPath,
          LEM_TTS_VOICE_NAME: input.preferredVoice,
          LEM_TTS_RATE: String(input.rate)
        }
      }
    );
    if (result.status !== 0 || !fs.existsSync(input.outputPath)) {
      throw new Error(result.stderr || result.error?.message || "Windows TTS failed.");
    }
    return result.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1) || input.preferredVoice;
  } finally {
    fs.rmSync(inputPath, { force: true });
  }
}

function runFfmpeg(args, message) {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
    timeout: 120_000
  });
  if (result.status !== 0) {
    throw new Error(`${message} ${result.stderr || result.error?.message || "ffmpeg failed"}`);
  }
}

function probeDuration(filePath) {
  const result = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=nk=1:nw=1", filePath],
    { cwd: repoRoot, encoding: "utf8", windowsHide: true, timeout: 30_000 }
  );
  const duration = Number.parseFloat(result.stdout.trim());
  if (result.status !== 0 || !Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not read fixture duration: ${filePath}`);
  }
  return Math.round(duration * 1000) / 1000;
}

function getElectronBinary() {
  try {
    return require("electron");
  } catch {
    return path.join(
      repoRoot,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "electron.cmd" : "electron"
    );
  }
}

function runElectron(input) {
  return new Promise((resolve, reject) => {
    const logSink = createQaRedactedLogSink(input.logPath);
    const child = spawn(getElectronBinary(), [input.electronMain], {
      cwd: repoRoot,
      env: {
        ...process.env,
        __COMPAT_LAYER: "DisableWerDialog",
        LM_QA_HOMEPAGE_SCREENSHOTS: "1",
        LM_QA_HOMEPAGE_SCREENSHOTS_REPORT: input.reportPath,
        LM_QA_HOMEPAGE_SCREENSHOTS_OUTPUT: input.pngOutput,
        LM_QA_HOMEPAGE_FIXTURE_PDF: input.fixturePdfPath,
        LM_QA_HOMEPAGE_FIXTURE_VIDEO: input.fixtureVideoPath,
        LM_QA_HOMEPAGE_SCENE_IMAGE: homepageSceneImage,
        LM_QA_HOMEPAGE_DIALOGUE_JSON: JSON.stringify(input.dialogue),
        LM_QA_HOMEPAGE_LIVE_URL: liveWebReaderUrl,
        LM_QA_APP_LOCALE: input.locale,
        LM_QA_USER_DATA_DIR: input.userDataDir,
        LM_QA_APP_SETTINGS_JSON: JSON.stringify({
          providerName: "mock",
          translationProviderName: "localMt",
          geminiApiKey: "",
          googleTranslateApiKey: "",
          browserSelectionCardMode: "preview"
        })
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    const timeout = setTimeout(() => {
      terminateProcessTree(child.pid);
      logSink.finish();
      reject(new Error(`Homepage screenshot Electron QA timed out after ${input.timeoutMs}ms.`));
    }, input.timeoutMs);
    child.stdout.on("data", (chunk) => logSink.write(chunk));
    child.stderr.on("data", (chunk) => logSink.write(chunk));
    child.on("error", (error) => {
      clearTimeout(timeout);
      logSink.finish();
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      logSink.finish();
      if (code === 0) resolve();
      else reject(new Error(`Homepage screenshot Electron QA exited with code ${code}. Log: ${input.logPath}`));
    });
  });
}

function terminateProcessTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
      timeout: 10_000
    });
    return;
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // The bounded child may already have exited.
  }
}

function assertScreenshotCompleteness(locale, report) {
  const actual = (report.screenshots ?? []).map((shot) =>
    shot.fileName.replace(/\.png$/i, ".webp")
  );
  const missing = expectedScreenshotNames.filter((name) => !actual.includes(name));
  const unexpected = actual.filter((name) => !expectedScreenshotNames.includes(name));
  const duplicates = actual.filter((name, index) => actual.indexOf(name) !== index);
  if (missing.length || unexpected.length || duplicates.length) {
    throw new Error(
      `Homepage screenshot set is incomplete for ${locale}. ` +
        `Missing: ${missing.join(", ") || "none"}; ` +
        `unexpected: ${unexpected.join(", ") || "none"}; ` +
        `duplicates: ${duplicates.join(", ") || "none"}.`
    );
  }
}

async function convertScreenshots(locale, screenshots, keepPng) {
  const targetDirectories = [
    path.join(docsImageRoot, locale),
    path.join(codexSiteImageRoot, locale)
  ];
  for (const targetDirectory of targetDirectories) {
    fs.mkdirSync(targetDirectory, { recursive: true });
  }

  const converted = [];
  for (const shot of screenshots) {
    if (shot.textSafety?.findings?.length) {
      throw new Error(`Sensitive text finding in ${shot.fileName}: ${shot.textSafety.findings.join(", ")}`);
    }
    const sourcePath = path.resolve(shot.pngPath);
    const fileName = shot.fileName.replace(/\.png$/i, ".webp");
    const output = await sharp(sourcePath)
      .flatten({ background: "#f8fafc" })
      .webp({ quality: 88, effort: 5, smartSubsample: true })
      .toBuffer();
    const metadata = await sharp(output).metadata();
    if ((metadata.width ?? 0) < 940 || (metadata.height ?? 0) < 680) {
      throw new Error(
        `Published homepage screenshot is smaller than 940x680: ${fileName} (${metadata.width}x${metadata.height})`
      );
    }
    for (const targetDirectory of targetDirectories) {
      fs.writeFileSync(path.join(targetDirectory, fileName), output);
    }
    converted.push({
      slot: shot.slot,
      fileName,
      paths: targetDirectories.map((directory) => path.relative(repoRoot, path.join(directory, fileName))),
      width: metadata.width,
      height: metadata.height,
      bytes: output.length,
      sha256: crypto.createHash("sha256").update(output).digest("hex")
    });
    if (!keepPng) fs.rmSync(sourcePath, { force: true });
  }
  return converted;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = { expectedScreenshotNames, parseArgs };
