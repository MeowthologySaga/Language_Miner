const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createQaRedactedLogSink } = require("./qa-redacted-log-sink.cjs");

const repoRoot = path.resolve(__dirname, "..");
const qaGeminiKeyName = ["gemini", "Api", "Key"].join("");
const qaGoogleKeyName = ["google", "Translate", "Api", "Key"].join("");

function parseAppSmokeLocale(value) {
  const candidate = typeof value === "string" ? value.trim() : "";
  return candidate === "ko" || candidate === "en" ? candidate : null;
}

function parseAppSmokeScaleFactor(value) {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (candidate === "1") return 1;
  if (candidate === "1.25") return 1.25;
  if (candidate === "1.5") return 1.5;
  return null;
}

function parseArgs(argv, env = process.env) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const options = {
    reportPath: path.join(repoRoot, "debug", "reports", `app-smoke-electron-qa-${timestamp}.json`),
    logPath: path.join(repoRoot, "debug", "reports", `app-smoke-electron-qa-${timestamp}.log`),
    userDataDir: path.join(repoRoot, "debug", "qa", "user-data", `app-smoke-${timestamp}`),
    settingsOverride: {
      providerName: "mock",
      translationProviderName: "localMt",
      [qaGeminiKeyName]: ["lem", "qa", "gemini", "secret", "should", "not", "render"].join("-"),
      [qaGoogleKeyName]: ["lem", "qa", "google", "secret", "should", "not", "render"].join("-")
    },
    fetchRssDurationCheck: false,
    locale: env.LM_QA_APP_LOCALE ?? "ko",
    scaleFactor: env.LM_QA_DEVICE_SCALE_FACTOR ?? "1",
    timeoutMs: 120_000
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--report" && next) {
      options.reportPath = resolvePath(next);
      index += 1;
    } else if (arg === "--log" && next) {
      options.logPath = resolvePath(next);
      index += 1;
    } else if (arg === "--user-data-dir" && next) {
      options.userDataDir = resolvePath(next);
      index += 1;
    } else if (arg === "--no-settings-override") {
      options.settingsOverride = undefined;
    } else if (arg === "--fetch-rss") {
      options.fetchRssDurationCheck = true;
    } else if (arg === "--locale") {
      if (!next) {
        throw new Error("--locale requires either ko or en.");
      }
      options.locale = next;
      index += 1;
    } else if (arg === "--scale") {
      if (!next) {
        throw new Error("--scale requires 1, 1.25, or 1.5.");
      }
      options.scaleFactor = next;
      index += 1;
    } else if (arg === "--timeout-ms" && next) {
      options.timeoutMs = Number.parseInt(next, 10);
      index += 1;
    }
  }

  const locale = parseAppSmokeLocale(options.locale);
  if (!locale) {
    throw new Error(`Invalid app smoke locale: ${String(options.locale)}. Expected ko or en.`);
  }
  options.locale = locale;

  const scaleFactor = parseAppSmokeScaleFactor(String(options.scaleFactor));
  if (!scaleFactor) {
    throw new Error(
      `Invalid app smoke scale factor: ${String(options.scaleFactor)}. Expected 1, 1.25, or 1.5.`
    );
  }
  options.scaleFactor = scaleFactor;

  return options;
}

function resolvePath(value) {
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

function getElectronBinary() {
  try {
    return require("electron");
  } catch {
    // Fall back to the package binary path if the Electron package export changes.
  }

  return path.join(
    repoRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "electron.cmd" : "electron"
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const electronMain = path.join(repoRoot, "dist-electron", "electron", "main.js");
  if (!fs.existsSync(electronMain)) {
    throw new Error("dist-electron/electron/main.js not found. Run npm.cmd run build first.");
  }

  fs.mkdirSync(path.dirname(options.reportPath), { recursive: true });
  fs.mkdirSync(path.dirname(options.logPath), { recursive: true });
  fs.mkdirSync(options.userDataDir, { recursive: true });

  await runElectronSmoke({
    electronBinary: getElectronBinary(),
    electronMain,
    reportPath: options.reportPath,
    logPath: options.logPath,
    userDataDir: options.userDataDir,
    settingsOverride: options.settingsOverride,
    fetchRssDurationCheck: options.fetchRssDurationCheck,
    locale: options.locale,
    scaleFactor: options.scaleFactor,
    timeoutMs: options.timeoutMs
  });

  const report = JSON.parse(fs.readFileSync(options.reportPath, "utf8"));
  console.log(JSON.stringify({
    status: report.status,
    locale: report.locale,
    scaleFactor: report.requestedScaleFactor,
    reportPath: path.relative(repoRoot, options.reportPath),
    totals: {
      routes: report.routes?.length ?? 0,
      passed: report.routes?.filter((route) => route.status === "passed").length ?? 0,
      failed: report.routes?.filter((route) => route.status === "failed").length ?? 0
    }
  }, null, 2));
}

function runElectronSmoke(input) {
  return new Promise((resolve, reject) => {
    const logSink = createQaRedactedLogSink(input.logPath);
    const child = spawn(input.electronBinary, [input.electronMain], {
      cwd: repoRoot,
      env: {
        ...process.env,
        LM_QA_APP_SMOKE: "1",
        LM_QA_APP_SMOKE_REPORT: input.reportPath,
        LM_QA_APP_LOCALE: input.locale,
        LM_QA_DEVICE_SCALE_FACTOR: String(input.scaleFactor),
        LM_QA_USER_DATA_DIR: input.userDataDir,
        ...(input.fetchRssDurationCheck ? { LM_QA_APP_SMOKE_FETCH_RSS: "1" } : {}),
        ...(input.settingsOverride
          ? { LM_QA_APP_SETTINGS_JSON: JSON.stringify(input.settingsOverride) }
          : {})
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    const timeout = setTimeout(() => {
      child.kill();
      logSink.finish();
      writeTimeoutReport(input);
      reject(new Error(`Electron app smoke QA timed out after ${input.timeoutMs}ms.`));
    }, input.timeoutMs);

    child.stdout.on("data", (chunk) => {
      logSink.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      logSink.write(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      logSink.finish();
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      logSink.finish();
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Electron app smoke QA exited with code ${code}.`));
    });
  });
}

function writeTimeoutReport(input) {
  if (fs.existsSync(input.reportPath)) {
    return;
  }
  fs.writeFileSync(
    input.reportPath,
    `${JSON.stringify(
      {
        status: "failed",
        locale: input.locale,
        requestedScaleFactor: input.scaleFactor,
        finishedAt: new Date().toISOString(),
        error: `Electron app smoke QA timed out after ${input.timeoutMs}ms.`
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      `Electron app smoke QA runner failed (${error instanceof Error ? error.name : "Error"}). See the local QA log.`
    );
    process.exitCode = 1;
  });
}

module.exports = {
  parseAppSmokeLocale,
  parseAppSmokeScaleFactor,
  parseArgs
};
