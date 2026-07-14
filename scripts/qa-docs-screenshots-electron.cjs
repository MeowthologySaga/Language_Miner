const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const sharp = require("sharp");
const { createQaRedactedLogSink } = require("./qa-redacted-log-sink.cjs");

const repoRoot = path.resolve(__dirname, "..");
const docsScreenshotRoot = path.join(repoRoot, "docs", "site", "assets", "screenshots");
const loopFrameNames = [
  "06-web-reader-select.webp",
  "07-reading-card-preview.webp",
  "09-review-front.webp",
  "10-review-answer.webp",
  "12-writing-result.webp"
];
const expectedScreenshotNames = [
  "01-onboarding-language.webp",
  "06-web-reader-select.webp",
  "07-reading-card-preview.webp",
  "09-review-front.webp",
  "10-review-answer.webp",
  "12-writing-result.webp",
  "14-character-chat.webp",
  "16-listening-loop.webp",
  "18-playzone-official-library.webp",
  "19-playzone-install-confirm.webp",
  "21-playzone-gameplay.webp",
  "22-ai-options.webp",
  "23-ollama-not-ready.webp",
  "24-cloud-connection-consent.webp",
  "25-backup-create.webp",
  "26-restore-preview.webp",
  "27-privacy-delete.webp",
  "28-app-capture-privacy.webp"
];

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
  if (!Number.isFinite(result.timeoutMs) || result.timeoutMs < 30_000) {
    throw new Error("--timeout-ms must be at least 30000.");
  }
  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const electronMain = path.join(repoRoot, "dist-electron", "electron", "main.js");
  if (!fs.existsSync(electronMain)) {
    throw new Error("dist-electron/electron/main.js not found. Run npm.cmd run build first.");
  }
  const gameArchive = path.join(
    repoRoot,
    "artifacts",
    "release",
    "abyss-summoner-0.1.2.lemgame"
  );
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runRoot = path.join(repoRoot, "debug", "qa", "docs-screenshots", timestamp);
  fs.mkdirSync(runRoot, { recursive: true });

  const reports = [];
  for (const locale of options.locales) {
    const localeRunRoot = path.join(runRoot, locale);
    const pngOutput = path.join(localeRunRoot, "png");
    const reportPath = path.join(localeRunRoot, "report.json");
    const logPath = path.join(localeRunRoot, "electron.log");
    const userDataDir = path.join(localeRunRoot, "user-data");
    fs.mkdirSync(pngOutput, { recursive: true });
    fs.mkdirSync(userDataDir, { recursive: true });
    await runElectron({
      electronMain,
      locale,
      pngOutput,
      reportPath,
      logPath,
      userDataDir,
      gameArchive: fs.existsSync(gameArchive) ? gameArchive : undefined,
      timeoutMs: options.timeoutMs
    });
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    if (report.status !== "passed") {
      throw new Error(`Docs screenshot QA failed for ${locale}: ${reportPath}`);
    }
    assertScreenshotCompleteness(locale, report);
    const converted = await convertScreenshots(locale, report.screenshots, options.keepPng);
    reports.push({ locale, reportPath, converted, skipped: report.skipped ?? [] });
  }

  for (const locale of options.locales) {
    const gifResult = createLearningLoopGif(locale);
    if (!gifResult.created) {
      throw new Error(`Learning-loop GIF is required for ${locale}: ${gifResult.reason}`);
    }
    const report = reports.find((item) => item.locale === locale);
    report.gif = gifResult;
  }
  syncTutorialMarkup(reports);
  syncUserGuideMarkup(reports);
  syncReadmeHeroMarkup(reports);
  validatePublishedAssets(reports);

  const summaryPath = path.join(runRoot, "summary.json");
  fs.writeFileSync(summaryPath, `${JSON.stringify({ status: "passed", reports }, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        status: "passed",
        summaryPath: path.relative(repoRoot, summaryPath),
        locales: reports.map((report) => ({
          locale: report.locale,
          screenshots: report.converted.length,
          skipped: report.skipped.length,
          gif: report.gif.created
        }))
      },
      null,
      2
    )
  );
}

function assertScreenshotCompleteness(locale, report) {
  const actual = (report.screenshots ?? []).map((shot) => shot.fileName.replace(/\.png$/i, ".webp"));
  const actualSet = new Set(actual);
  const missing = expectedScreenshotNames.filter((name) => !actualSet.has(name));
  const unexpected = actual.filter((name) => !expectedScreenshotNames.includes(name));
  const duplicates = actual.filter((name, index) => actual.indexOf(name) !== index);
  const skipped = report.skipped ?? [];
  if (missing.length || unexpected.length || duplicates.length || skipped.length) {
    throw new Error(
      `Docs screenshot set is incomplete for ${locale}. ` +
        `Missing: ${missing.join(", ") || "none"}; ` +
        `unexpected: ${unexpected.join(", ") || "none"}; ` +
        `duplicates: ${duplicates.join(", ") || "none"}; ` +
        `skipped: ${skipped.map((item) => item.fileName || item.slot).join(", ") || "none"}.`
    );
  }
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
        LM_QA_DOC_SCREENSHOTS: "1",
        LM_QA_DOC_SCREENSHOTS_REPORT: input.reportPath,
        LM_QA_DOC_SCREENSHOTS_OUTPUT: input.pngOutput,
        LM_QA_APP_LOCALE: input.locale,
        LM_QA_USER_DATA_DIR: input.userDataDir,
        LM_QA_APP_SETTINGS_JSON: JSON.stringify({
          providerName: "mock",
          translationProviderName: "localMt",
          geminiApiKey: "",
          googleTranslateApiKey: "",
          browserSelectionCardMode: "preview"
        }),
        ...(input.gameArchive ? { LM_QA_DOCS_GAME_ARCHIVE: input.gameArchive } : {})
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    const timeout = setTimeout(() => {
      terminateProcessTree(child.pid);
      logSink.finish();
      reject(new Error(`Docs screenshot Electron QA timed out after ${input.timeoutMs}ms.`));
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
      else reject(new Error(`Docs screenshot Electron QA exited with code ${code}. Log: ${input.logPath}`));
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
    // The bounded child may have exited between timeout and cleanup.
  }
}

async function convertScreenshots(locale, screenshots, keepPng) {
  const targetDirectory = path.join(docsScreenshotRoot, locale);
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
    if ((metadata.width ?? 0) < 940 || (metadata.height ?? 0) < 680) {
      throw new Error(
        `Published screenshot is smaller than 940x680: ${fileName} (${metadata.width}x${metadata.height})`
      );
    }
    const bytes = fs.readFileSync(targetPath);
    converted.push({
      slot: shot.slot,
      fileName,
      path: path.relative(repoRoot, targetPath),
      width: metadata.width,
      height: metadata.height,
      bytes: bytes.length,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex")
    });
    if (!keepPng) {
      // PNG files remain inside debug/qa only during the run and are not public documentation assets.
    }
  }
  return converted;
}

function createLearningLoopGif(locale) {
  const localeDirectory = path.join(docsScreenshotRoot, locale);
  const framePaths = loopFrameNames.map((name) => path.join(localeDirectory, name));
  const missing = framePaths.filter((filePath) => !fs.existsSync(filePath));
  const outputPath = path.join(localeDirectory, "00-learning-loop.gif");
  if (missing.length) {
    return {
      created: false,
      reason: `Missing actual UI frames: ${missing.map((item) => path.basename(item)).join(", ")}`
    };
  }
  const listPath = path.join(localeDirectory, `.learning-loop-${process.pid}.txt`);
  const lines = [];
  for (const framePath of framePaths) {
    lines.push(`file '${escapeFfmpegConcatPath(framePath)}'`);
    lines.push("duration 1.6");
  }
  lines.push(`file '${escapeFfmpegConcatPath(framePaths.at(-1))}'`);
  fs.writeFileSync(listPath, `${lines.join("\n")}\n`, "utf8");
  try {
    const result = spawnSync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        listPath,
        "-vf",
        "fps=2,scale=960:-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3",
        "-loop",
        "0",
        outputPath
      ],
      { cwd: repoRoot, encoding: "utf8", windowsHide: true, timeout: 120_000 }
    );
    if (result.status !== 0 || !fs.existsSync(outputPath)) {
      return {
        created: false,
        reason: `FFmpeg could not create the GIF: ${(result.stderr || result.error?.message || "unknown error").trim()}`
      };
    }
    const bytes = fs.readFileSync(outputPath);
    return {
      created: true,
      path: path.relative(repoRoot, outputPath),
      bytes: bytes.length,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex")
    };
  } finally {
    fs.rmSync(listPath, { force: true });
  }
}

function escapeFfmpegConcatPath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/'/g, "'\\''");
}

function syncTutorialMarkup(reports) {
  const tutorialPaths = [
    { locale: "ko", filePath: path.join(repoRoot, "docs", "site", "tutorial.html") },
    { locale: "en", filePath: path.join(repoRoot, "docs", "site", "en", "tutorial.html") }
  ];
  for (const tutorial of tutorialPaths) {
    const report = reports.find((item) => item.locale === tutorial.locale);
    if (!report) continue;
    const produced = new Set(report.converted.map((item) => item.fileName));
    const convertedByName = new Map(report.converted.map((item) => [item.fileName, item]));
    let html = fs.readFileSync(tutorial.filePath, "utf8");
    html = html.replace(
      /(<figure\b[^>]*\bdata-file="([^"]+)"[^>]*>)\s*<div class="shot-placeholder" role="img" aria-label="([^"]*)">[\s\S]*?<\/div>/g,
      (match, opening, reference, alt) => {
        const fileName = path.basename(reference);
        if (!produced.has(fileName)) return match;
        const absolute = path.resolve(path.dirname(tutorial.filePath), reference);
        if (!fs.existsSync(absolute)) return match;
        return `${opening}\n              <img class="tutorial-shot" src="${reference}" alt="${alt}">`;
      }
    );
    html = html.replace(
      /(<figure\b[^>]*\bdata-file="([^"]+)"[^>]*>)\s*((?:<a\b[^>]*>\s*)?<img\b[^>]*class="tutorial-shot"[^>]*>(?:\s*<\/a>)?)/g,
      (match, opening, reference, mediaMarkup) => {
        const converted = convertedByName.get(path.basename(reference));
        if (!converted) return match;
        const img = mediaMarkup.match(/<img\b[^>]*>/)?.[0] ?? "";
        const alt = getHtmlAttribute(img, "alt");
        return `${opening}\n              <a class="tutorial-shot-link" href="${reference}">\n                <img class="tutorial-shot" src="${reference}" alt="${escapeHtmlAttribute(alt)}" width="${converted.width}" height="${converted.height}" loading="lazy" decoding="async">\n              </a>`;
      }
    );
    fs.writeFileSync(tutorial.filePath, html, "utf8");
  }
}

function syncUserGuideMarkup(reports) {
  const guides = [
    { locale: "ko", filePath: path.join(repoRoot, "docs", "user-guide.ko.md") },
    { locale: "en", filePath: path.join(repoRoot, "docs", "user-guide.en.md") }
  ];
  for (const guide of guides) {
    const report = reports.find((item) => item.locale === guide.locale);
    if (!report) continue;
    const produced = new Set(report.converted.map((item) => item.fileName));
    let markdown = fs.readFileSync(guide.filePath, "utf8");
    markdown = markdown.replace(
      /<!-- SCREENSHOT_SLOT id=([^ ]+) src=([^ ]+) alt="([^"]*)" caption="([^"]*)" -->/g,
      (match, _slot, reference, alt, caption) => {
        if (!produced.has(path.basename(reference))) return match;
        const absolute = path.resolve(path.dirname(guide.filePath), reference);
        if (!fs.existsSync(absolute)) return match;
        return `![${alt}](${reference})\n\n*${caption}*`;
      }
    );
    fs.writeFileSync(guide.filePath, markdown, "utf8");
  }
}

function syncReadmeHeroMarkup(reports) {
  const readmes = [
    {
      locale: "ko",
      filePath: path.join(repoRoot, "README.md"),
      markdown:
        "![웹 리더에서 I’m running a little late를 문장카드로 담고, 복습한 뒤 영작에서 다시 쓰는 Language Miner 화면](docs/site/assets/app-images/ko/00-learning-loop.gif)\n\n*한 문장을 발견해서 카드로 만들고, 복습하고, 직접 쓰는 학습 루프*"
    },
    {
      locale: "en",
      filePath: path.join(repoRoot, "README.en.md"),
      markdown:
        "![Language Miner Web Reader adding I’m running a little late as a sentence card, reviewing it, and retrieving it in writing](docs/site/assets/app-images/en/00-learning-loop.gif)\n\n*Find one sentence, turn it into a card, review it, and use it*"
    }
  ];
  for (const readme of readmes) {
    const report = reports.find((item) => item.locale === readme.locale);
    if (!report?.gif?.created) continue;
    let source = fs.readFileSync(readme.filePath, "utf8");
    source = source.replace(/<!-- HERO_MEDIA_SLOT[^>]*-->/, readme.markdown);
    fs.writeFileSync(readme.filePath, source, "utf8");
  }
}

function validatePublishedAssets(reports) {
  for (const report of reports) {
    const tutorialPath =
      report.locale === "ko"
        ? path.join(repoRoot, "docs", "site", "tutorial.html")
        : path.join(repoRoot, "docs", "site", "en", "tutorial.html");
    const html = fs.readFileSync(tutorialPath, "utf8");
    if (/shot-placeholder|SCREENSHOT_SLOT|HERO_MEDIA_SLOT/.test(html)) {
      throw new Error(`Tutorial still contains a public media placeholder: ${tutorialPath}`);
    }
    const imageReferences = Array.from(html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)).map(
      (match) => match[1]
    );
    for (const reference of imageReferences) {
      if (/^(?:data:|https?:)/i.test(reference)) continue;
      const resolved = path.resolve(path.dirname(tutorialPath), reference);
      if (!fs.existsSync(resolved)) {
        throw new Error(`Tutorial references a missing image: ${reference}`);
      }
    }
    for (const converted of report.converted) {
      const count = countOccurrences(html, converted.fileName);
      if (count !== 3) {
        throw new Error(
          `Expected ${converted.fileName} in data-file, full-size link, and img src; found ${count}.`
        );
      }
    }
    const tutorialImages = Array.from(
      html.matchAll(
        /<a\b[^>]*\bhref="([^"]+)"[^>]*>\s*<img\b([^>]*)\bclass="tutorial-shot"([^>]*)>\s*<\/a>/g
      )
    );
    if (tutorialImages.length < report.converted.length) {
      throw new Error(
        `Expected at least ${report.converted.length} linked tutorial screenshots; found ${tutorialImages.length}.`
      );
    }
    for (const match of tutorialImages) {
      const attributes = `${match[2]} class="tutorial-shot" ${match[3]}`;
      const source = getHtmlAttribute(attributes, "src");
      if (
        source !== match[1] ||
        getHtmlAttribute(attributes, "loading") !== "lazy" ||
        getHtmlAttribute(attributes, "decoding") !== "async" ||
        !/^\d+$/.test(getHtmlAttribute(attributes, "width")) ||
        !/^\d+$/.test(getHtmlAttribute(attributes, "height"))
      ) {
        throw new Error(`Tutorial screenshot link or loading metadata is incomplete: ${source || match[1]}`);
      }
    }

    const guidePath =
      report.locale === "ko"
        ? path.join(repoRoot, "docs", "user-guide.ko.md")
        : path.join(repoRoot, "docs", "user-guide.en.md");
    const guide = fs.readFileSync(guidePath, "utf8");
    if (/SCREENSHOT_SLOT|HERO_MEDIA_SLOT/.test(guide)) {
      throw new Error(`User guide still contains a public media placeholder: ${guidePath}`);
    }
    for (const expected of expectedScreenshotNames) {
      const publishedPath = path.join(docsScreenshotRoot, report.locale, expected);
      if (!fs.existsSync(publishedPath) || !guide.includes(expected)) {
        throw new Error(`User guide is missing the required ${report.locale} screenshot: ${expected}`);
      }
    }
    const extensionQueueScreenshot = "29-extension-queue-clear.webp";
    const extensionQueuePath = path.join(
      docsScreenshotRoot,
      report.locale,
      extensionQueueScreenshot
    );
    if (!fs.existsSync(extensionQueuePath) || !guide.includes(extensionQueueScreenshot)) {
      throw new Error(
        `User guide is missing the isolated extension queue screenshot: ${extensionQueueScreenshot}`
      );
    }

    const readmePath =
      report.locale === "ko" ? path.join(repoRoot, "README.md") : path.join(repoRoot, "README.en.md");
    const readme = fs.readFileSync(readmePath, "utf8");
    if (/HERO_MEDIA_SLOT/.test(readme) || !readme.includes("00-learning-loop.gif")) {
      throw new Error(`README hero media was not published: ${readmePath}`);
    }
  }
}

function countOccurrences(source, needle) {
  let count = 0;
  let offset = 0;
  while ((offset = source.indexOf(needle, offset)) >= 0) {
    count += 1;
    offset += needle.length;
  }
  return count;
}

function getHtmlAttribute(markup, name) {
  const match = markup.match(new RegExp(`\\b${name}="([^"]*)"`, "i"));
  return match?.[1] ?? "";
}

function escapeHtmlAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Docs screenshot QA failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs };
