const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const sharp = require("sharp");
const { createQaRedactedLogSink } = require("./qa-redacted-log-sink.cjs");

const repoRoot = path.resolve(__dirname, "..");
const screenshotRoot = path.join(repoRoot, "docs", "site", "assets", "app-images");
const expectedNames = [
  "manual-01-tutorial-sandbox.webp",
  "manual-02-today-hub.webp",
  "manual-03-today-routine.webp",
  "manual-04-daily-missions.webp",
  "manual-05-profile-manager.webp",
  "manual-06-card-library.webp",
  "manual-07-card-delete.webp",
  "manual-08-document-reader.webp",
  "manual-09-document-library.webp",
  "manual-10-bookmarks.webp",
  "manual-11-video-reader.webp",
  "manual-12a-life-mining-add.webp",
  "manual-12b-life-mining-result.webp",
  "manual-13a-character-manager.webp",
  "manual-13b-character-remote-image.webp",
  "manual-13c-character-export.webp",
  "manual-14-diamond-confirm.webp",
  "manual-15-glossary.webp",
  "manual-16-book-maker.webp",
  "manual-17-export-history.webp",
  "manual-18a-translation-settings.webp",
  "manual-18b-tts-settings.webp",
  "manual-19-card-sync.webp",
  "manual-20-cloud-job-preflight.webp",
  "manual-21-manual-chatgpt.webp",
  "manual-25-ugc-security-report.webp"
];

function parseArgs(argv) {
  const result = { locales: ["ko", "en"], timeoutMs: 480_000, keepPng: false };
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
  const runRoot = path.join(repoRoot, "debug", "qa", "manual-screenshots", timestamp);
  const fixtureRoot = path.join(runRoot, "fixtures");
  const fixturePdfPath = path.join(fixtureRoot, "alice-adventures-in-wonderland.pdf");
  const fixtureVideoPath = path.join(fixtureRoot, "manual-docs-video.mp4");
  const syncFolderPath = path.join(fixtureRoot, "card-sync-folder");
  const gameArchivePath = path.join(
    repoRoot,
    "artifacts",
    "release",
    "drillheart-defense-0.2.0.lemgame"
  );
  if (!fs.existsSync(gameArchivePath)) {
    throw new Error(`Verified Game Pack fixture is missing: ${gameArchivePath}`);
  }
  fs.mkdirSync(syncFolderPath, { recursive: true });
  await createFixturePdf(fixturePdfPath);
  await createFixtureVideo(fixtureVideoPath);

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
      syncFolderPath,
      gameArchivePath,
      timeoutMs: options.timeoutMs
    });
    if (!fs.existsSync(reportPath)) {
      throw new Error(`Manual screenshot report was not written: ${reportPath}`);
    }
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    if (report.status !== "passed") {
      throw new Error(`Manual screenshot QA failed for ${locale}: ${reportPath}`);
    }
    assertComplete(locale, report);
    const converted = await convertScreenshots(locale, report.screenshots, options.keepPng);
    reports.push({ locale, reportPath, converted });
  }

  const summaryPath = path.join(runRoot, "summary.json");
  fs.writeFileSync(summaryPath, `${JSON.stringify({ status: "passed", reports }, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        status: "passed",
        summaryPath: path.relative(repoRoot, summaryPath),
        locales: reports.map((report) => ({ locale: report.locale, screenshots: report.converted.length }))
      },
      null,
      2
    )
  );
}

async function createFixturePdf(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = [
    {
      title: "Alice's Adventures in Wonderland",
      lines: [
        "CHAPTER I. Down the Rabbit-Hole",
        "Alice was beginning to get very tired of sitting by her sister on the bank,",
        "and of having nothing to do: once or twice she had peeped into the book her sister was reading."
      ]
    },
    {
      title: "A public-domain reading sample",
      lines: [
        "There was nothing so very remarkable in that; nor did Alice think it so very much out of the way",
        "to hear the Rabbit say to itself, 'Oh dear! Oh dear! I shall be late!'",
        "Source: Project Gutenberg eBook #11 · Lewis Carroll · public domain in the United States"
      ]
    }
  ];
  for (const pageData of pages) {
    const page = pdf.addPage([612, 792]);
    page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(0.965, 0.975, 0.99) });
    page.drawText(pageData.title, { x: 54, y: 710, size: 24, font: bold, color: rgb(0.08, 0.16, 0.3) });
    page.drawText("Project Gutenberg public-domain sample · Language Miner documentation", {
      x: 54,
      y: 680,
      size: 10,
      font,
      color: rgb(0.38, 0.45, 0.56)
    });
    pageData.lines.forEach((line, index) => {
      page.drawText(line, {
        x: 62,
        y: 610 - index * 64,
        size: index < 2 ? 17 : 13,
        font: index < 2 ? bold : font,
        color: index < 2 ? rgb(0.11, 0.18, 0.3) : rgb(0.32, 0.38, 0.48),
        maxWidth: 490,
        lineHeight: 20
      });
    });
  }
  fs.writeFileSync(filePath, await pdf.save());
}

async function createFixtureVideo(filePath) {
  const framePath = path.join(path.dirname(filePath), "manual-docs-video-frame.png");
  const audioPath = path.join(path.dirname(filePath), "manual-docs-video-dialogue.wav");
  const sceneSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
  <defs>
    <linearGradient id="wall" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#15253b"/>
      <stop offset="1" stop-color="#334b66"/>
    </linearGradient>
    <linearGradient id="window" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ef9f78"/>
      <stop offset="1" stop-color="#5d6da6"/>
    </linearGradient>
    <filter id="shadow"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-opacity=".28"/></filter>
  </defs>
  <rect width="960" height="540" fill="url(#wall)"/>
  <rect x="72" y="62" width="370" height="250" rx="16" fill="url(#window)" stroke="#d7e6ef" stroke-width="9"/>
  <path d="M72 218 C150 172 225 205 292 160 C350 121 392 136 442 112 V312 H72 Z" fill="#202c4f" opacity=".72"/>
  <circle cx="356" cy="115" r="34" fill="#ffe3a1" opacity=".9"/>
  <path d="M95 312 V432 M205 312 V432 M310 312 V432 M420 312 V432" stroke="#223247" stroke-width="9"/>
  <rect x="600" y="74" width="245" height="142" rx="14" fill="#203247" stroke="#526984" stroke-width="4"/>
  <text x="722" y="125" fill="#dce8f4" font-family="Segoe UI, sans-serif" font-size="20" text-anchor="middle">THE CORNER CAFÉ</text>
  <text x="722" y="166" fill="#8fe1c0" font-family="Segoe UI, sans-serif" font-size="16" text-anchor="middle">A Language Miner original scene</text>
  <ellipse cx="503" cy="463" rx="310" ry="42" fill="#101a29" opacity=".45"/>
  <g filter="url(#shadow)">
    <circle cx="357" cy="278" r="61" fill="#c87760"/>
    <path d="M292 282 Q357 179 422 282 V252 Q357 182 292 252 Z" fill="#311f2d"/>
    <path d="M280 443 Q292 328 357 328 Q422 328 438 443 Z" fill="#2b6e7b"/>
    <circle cx="647" cy="278" r="61" fill="#d7a678"/>
    <path d="M585 265 Q647 181 710 265 L699 226 Q647 185 592 226 Z" fill="#5a382c"/>
    <path d="M567 443 Q580 328 647 328 Q714 328 729 443 Z" fill="#7a4e8f"/>
    <rect x="375" y="386" width="250" height="24" rx="12" fill="#c18b55"/>
    <rect x="413" y="408" width="18" height="83" fill="#8a5e3b"/>
    <rect x="568" y="408" width="18" height="83" fill="#8a5e3b"/>
    <path d="M456 347 h42 a15 15 0 0 1 0 30 h-42 z" fill="#f3f0df"/>
    <path d="M565 347 h42 a15 15 0 0 1 0 30 h-42 z" fill="#f3f0df"/>
  </g>
  <rect x="36" y="28" width="190" height="38" rx="19" fill="#07111ddb"/>
  <text x="131" y="53" fill="#ffffff" font-family="Segoe UI, sans-serif" font-size="15" text-anchor="middle">ORIGINAL PRACTICE CLIP</text>
</svg>`;
  await sharp(Buffer.from(sceneSvg)).png().toFile(framePath);
  const speechScript = path.join(repoRoot, "scripts", "qa-synthesize-dialogue.ps1");
  const speech = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", speechScript, "-OutputPath", audioPath],
    { cwd: repoRoot, windowsHide: true, encoding: "utf8", timeout: 60_000 }
  );
  if (speech.status !== 0 || !fs.existsSync(audioPath)) {
    throw new Error(`Could not synthesize the local dialogue fixture: ${speech.stderr || speech.error || "speech synthesis failed"}`);
  }
  const result = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-loop",
      "1",
      "-i",
      framePath,
      "-i",
      audioPath,
      "-t",
      "8",
      "-r",
      "30",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-shortest",
      "-movflags",
      "+faststart",
      filePath
    ],
    { cwd: repoRoot, windowsHide: true, encoding: "utf8", timeout: 60_000 }
  );
  if (result.status !== 0 || !fs.existsSync(filePath)) {
    throw new Error(`Could not create the local video fixture: ${result.stderr || result.error || "ffmpeg failed"}`);
  }
}

function getElectronBinary() {
  try {
    return require("electron");
  } catch {
    return path.join(repoRoot, "node_modules", ".bin", process.platform === "win32" ? "electron.cmd" : "electron");
  }
}

function runElectron(input) {
  return new Promise((resolve, reject) => {
    const logSink = createQaRedactedLogSink(input.logPath);
    const child = spawn(getElectronBinary(), [input.electronMain], {
      cwd: repoRoot,
      env: {
        ...process.env,
        LM_QA_MANUAL_SCREENSHOTS: "1",
        LM_QA_MANUAL_SCREENSHOTS_REPORT: input.reportPath,
        LM_QA_MANUAL_SCREENSHOTS_OUTPUT: input.pngOutput,
        LM_QA_MANUAL_FIXTURE_PDF: input.fixturePdfPath,
        LM_QA_MANUAL_FIXTURE_VIDEO: input.fixtureVideoPath,
        LM_QA_MANUAL_SYNC_FOLDER: input.syncFolderPath,
        LM_QA_MANUAL_GAME_ARCHIVE: input.gameArchivePath,
        LM_QA_DOC_SCREENSHOTS: "1",
        LM_QA_DOC_SCREENSHOTS_REPORT: path.join(path.dirname(input.reportPath), "unused-docs-report.json"),
        LM_QA_DOC_SCREENSHOTS_OUTPUT: path.join(path.dirname(input.pngOutput), "unused-docs-output"),
        LM_QA_APP_LOCALE: input.locale,
        LM_QA_USER_DATA_DIR: input.userDataDir,
        LM_QA_APP_SETTINGS_JSON: JSON.stringify({
          providerName: "mock",
          translationProviderName: "gemini",
          geminiApiKey: ["qa", "placeholder", "not", "a", "real", "key"].join("-"),
          googleTranslateApiKey: "",
          confirmEstimatedCostBeforeRun: true,
          confirmLifeMiningCardCost: false,
          browserSelectionCardMode: "preview"
        })
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    const timeout = setTimeout(() => {
      terminateProcessTree(child.pid);
      logSink.finish();
      reject(new Error(`Manual screenshot Electron QA timed out after ${input.timeoutMs}ms.`));
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
      else reject(new Error(`Manual screenshot Electron QA exited with code ${code}. Log: ${input.logPath}`));
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

function assertComplete(locale, report) {
  const actual = (report.screenshots || []).map((shot) => shot.fileName.replace(/\.png$/i, ".webp"));
  const missing = expectedNames.filter((name) => !actual.includes(name));
  const unexpected = actual.filter((name) => !expectedNames.includes(name));
  const duplicates = actual.filter((name, index) => actual.indexOf(name) !== index);
  if (missing.length || unexpected.length || duplicates.length) {
    throw new Error(
      `Manual screenshot set is incomplete for ${locale}. ` +
        `Missing: ${missing.join(", ") || "none"}; ` +
        `unexpected: ${unexpected.join(", ") || "none"}; ` +
        `duplicates: ${duplicates.join(", ") || "none"}.`
    );
  }
}

async function convertScreenshots(locale, screenshots, keepPng) {
  const targetDirectory = path.join(screenshotRoot, locale);
  fs.mkdirSync(targetDirectory, { recursive: true });
  const converted = [];
  for (const shot of screenshots) {
    if (shot.textSafety?.findings?.length) {
      throw new Error(`Sensitive text finding in ${shot.fileName}: ${shot.textSafety.findings.join(", ")}`);
    }
    const sourcePath = path.resolve(shot.pngPath);
    const fileName = shot.fileName.replace(/\.png$/i, ".webp");
    const targetPath = path.join(targetDirectory, fileName);
    await sharp(sourcePath)
      .flatten({ background: "#f8fafc" })
      .webp({ quality: 84, effort: 5, smartSubsample: true })
      .toFile(targetPath);
    const metadata = await sharp(targetPath).metadata();
    if ((metadata.width || 0) < 940 || (metadata.height || 0) < 680) {
      throw new Error(`Published screenshot is too small: ${fileName} (${metadata.width}x${metadata.height})`);
    }
    converted.push({
      slot: shot.slot,
      fileName,
      path: path.relative(repoRoot, targetPath),
      width: metadata.width,
      height: metadata.height,
      bytes: fs.statSync(targetPath).size
    });
    if (!keepPng) fs.rmSync(sourcePath, { force: true });
  }
  return converted;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
