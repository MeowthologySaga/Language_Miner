const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const sharp = require("sharp");
const { createQaRedactedLogSink } = require("./qa-redacted-log-sink.cjs");

const repoRoot = path.resolve(__dirname, "..");
const screenshotRoot = path.join(repoRoot, "docs", "site", "assets", "screenshots");
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
  const fixturePdfPath = path.join(fixtureRoot, "everyday-english-practice.pdf");
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
  createFixtureVideo(fixtureVideoPath);

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
      title: "Everyday English Practice",
      lines: [
        "A: I'm running a little late.",
        "B: No problem. I'll save you a seat.",
        "Practice: Say the whole sentence, then change the time expression."
      ]
    },
    {
      title: "Use the sentence in context",
      lines: [
        "A: The train is delayed, so I'm running a little late.",
        "B: Take your time. We can begin when you arrive.",
        "Review: Read, listen, speak, and write the same useful expression."
      ]
    }
  ];
  for (const pageData of pages) {
    const page = pdf.addPage([612, 792]);
    page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: rgb(0.965, 0.975, 0.99) });
    page.drawText(pageData.title, { x: 54, y: 710, size: 24, font: bold, color: rgb(0.08, 0.16, 0.3) });
    page.drawText("Language Miner local documentation fixture", {
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

function createFixtureVideo(filePath) {
  const result = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=960x540:rate=30",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=48000",
      "-t",
      "6",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
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
