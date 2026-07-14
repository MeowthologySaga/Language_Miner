const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const sharp = require("sharp");
const { createQaRedactedLogSink } = require("./qa-redacted-log-sink.cjs");

const repoRoot = path.resolve(__dirname, "..");
const electronEntry = path.join(__dirname, "qa-extension-options-screenshots-electron.cjs");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const runRoot = path.join(repoRoot, "debug", "qa", "extension-options", timestamp);

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  const results = [];
  for (const locale of ["ko", "en"]) {
    const localeRoot = path.join(runRoot, locale);
    const captures = [
      {
        state: "pending",
        pngPath: path.join(localeRoot, "29-extension-queue-pending.png"),
        targetName: "29-extension-queue-clear.webp"
      },
      {
        state: "confirm",
        pngPath: path.join(localeRoot, "30-extension-queue-clear-confirm.png"),
        targetName: "30-extension-queue-clear-confirm.webp"
      },
      {
        state: "cleared",
        pngPath: path.join(localeRoot, "31-extension-queue-cleared.png"),
        targetName: "31-extension-queue-cleared.webp"
      }
    ];
    const reportPath = path.join(localeRoot, "report.json");
    const logPath = path.join(localeRoot, "electron.log");
    const userDataPath = path.join(localeRoot, "user-data");
    fs.mkdirSync(localeRoot, { recursive: true });
    await runElectron({ locale, captures, reportPath, logPath, userDataPath });
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    if (
      report.status !== "passed" ||
      report.textSafety?.findings?.length ||
      !captures.every((capture) => report.states?.[capture.state]?.status === "passed")
    ) {
      throw new Error(`Extension options QA failed for ${locale}: ${reportPath}`);
    }
    const screenshots = [];
    for (const capture of captures) {
      const targetPath = path.join(
        repoRoot,
        "docs",
        "site",
        "assets",
        "screenshots",
        locale,
        capture.targetName
      );
      await sharp(capture.pngPath)
        .flatten({ background: "#f8fafc" })
        .webp({ quality: 86, effort: 5, smartSubsample: true })
        .toFile(targetPath);
      const metadata = await sharp(targetPath).metadata();
      if ((metadata.width ?? 0) < 940 || (metadata.height ?? 0) < 680) {
        throw new Error(`Extension options screenshot is too small for ${locale}: ${targetPath}`);
      }
      screenshots.push({
        state: capture.state,
        screenshot: path.relative(repoRoot, targetPath),
        width: metadata.width,
        height: metadata.height
      });
    }
    results.push({
      locale,
      screenshots,
      reportPath: path.relative(repoRoot, reportPath)
    });
  }
  const summaryPath = path.join(runRoot, "summary.json");
  fs.writeFileSync(
    summaryPath,
    `${JSON.stringify({ status: "passed", results }, null, 2)}\n`,
    "utf8"
  );
  console.log(
    JSON.stringify(
      { status: "passed", summaryPath: path.relative(repoRoot, summaryPath), results },
      null,
      2
    )
  );
}

function runElectron(input) {
  return new Promise((resolve, reject) => {
    const logSink = createQaRedactedLogSink(input.logPath);
    const { ELECTRON_RUN_AS_NODE: _ignored, ...baseEnv } = process.env;
    const child = spawn(getElectronBinary(), [electronEntry], {
      cwd: repoRoot,
      env: {
        ...baseEnv,
        LM_QA_EXTENSION_LOCALE: input.locale,
        LM_QA_EXTENSION_PENDING_SCREENSHOT: input.captures.find(
          (capture) => capture.state === "pending"
        ).pngPath,
        LM_QA_EXTENSION_CONFIRM_SCREENSHOT: input.captures.find(
          (capture) => capture.state === "confirm"
        ).pngPath,
        LM_QA_EXTENSION_CLEARED_SCREENSHOT: input.captures.find(
          (capture) => capture.state === "cleared"
        ).pngPath,
        LM_QA_EXTENSION_REPORT: input.reportPath,
        LM_QA_EXTENSION_USER_DATA: input.userDataPath
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    const timeout = setTimeout(() => {
      terminateProcessTree(child.pid);
      logSink.finish();
      reject(new Error(`Extension options Electron QA timed out for ${input.locale}.`));
    }, 60_000);
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
      else reject(new Error(`Extension options Electron QA exited with code ${code}: ${input.logPath}`));
    });
  });
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
