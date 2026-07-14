const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createQaRedactedLogSink } = require("./qa-redacted-log-sink.cjs");

const repoRoot = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const options = {
    configPath: undefined,
    outputDir: path.join(repoRoot, "debug", "qa", "exports"),
    reportPath: path.join(repoRoot, "debug", "reports", `book-maker-electron-qa-${timestamp}.json`),
    logPath: path.join(repoRoot, "debug", "reports", `book-maker-electron-qa-${timestamp}.log`),
    documents: [],
    model: undefined,
    baseUrl: undefined,
    provider: undefined,
    localMtModel: undefined,
    timeoutMs: undefined,
    retryLimit: undefined,
    systemWatts: undefined,
    krwPerKwh: undefined,
    runnerTimeoutMs: undefined
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--config" && next) {
      options.configPath = resolvePath(next);
      index += 1;
    } else if (arg === "--pdf" && next) {
      options.documents.push({ pdfPath: resolvePath(next), pageRange: "1-30" });
      index += 1;
    } else if (arg === "--name" && next) {
      ensureLastDocument(options).name = next;
      index += 1;
    } else if (arg === "--pages" && next) {
      ensureLastDocument(options).pageRange = next;
      index += 1;
    } else if (arg === "--paper") {
      ensureLastDocument(options).exportMode = "paper";
    } else if (arg === "--reading") {
      ensureLastDocument(options).exportMode = "reading";
    } else if (arg === "--bypass-cache") {
      ensureLastDocument(options).bypassCache = true;
    } else if (arg === "--hide-source-highlights") {
      ensureLastDocument(options).showSourceHighlights = false;
    } else if (arg === "--output-dir" && next) {
      options.outputDir = resolvePath(next);
      index += 1;
    } else if (arg === "--report" && next) {
      options.reportPath = resolvePath(next);
      index += 1;
    } else if (arg === "--log" && next) {
      options.logPath = resolvePath(next);
      index += 1;
    } else if (arg === "--model" && next) {
      options.model = next;
      index += 1;
    } else if (arg === "--base-url" && next) {
      options.baseUrl = next;
      index += 1;
    } else if (arg === "--provider" && next) {
      options.provider = next;
      index += 1;
    } else if (arg === "--local-mt-model" && next) {
      options.localMtModel = next;
      index += 1;
    } else if (arg === "--timeout-ms" && next) {
      options.timeoutMs = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === "--runner-timeout-ms" && next) {
      options.runnerTimeoutMs = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === "--retry-limit" && next) {
      options.retryLimit = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === "--system-watts" && next) {
      options.systemWatts = Number.parseFloat(next);
      index += 1;
    } else if (arg === "--krw-per-kwh" && next) {
      options.krwPerKwh = Number.parseFloat(next);
      index += 1;
    }
  }

  return options;
}

function resolvePath(value) {
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

function ensureLastDocument(options) {
  const documentConfig = options.documents[options.documents.length - 1];
  if (!documentConfig) {
    throw new Error("Pass --pdf before document-specific options.");
  }
  return documentConfig;
}

function buildConfig(options) {
  if (options.configPath) {
    const parsed = JSON.parse(fs.readFileSync(options.configPath, "utf8"));
    return {
      config: parsed,
      configPath: options.configPath
    };
  }

  if (options.documents.length === 0) {
    throw new Error("Pass --config or at least one --pdf.");
  }

  const config = {
    documents: options.documents,
    outputDir: options.outputDir,
    reportPath: options.reportPath,
    model: options.model,
    baseUrl: options.baseUrl,
    translationProviderName: options.provider,
    localMtModel: options.localMtModel,
    timeoutMs: options.timeoutMs,
    retryLimit: options.retryLimit,
    systemWatts: options.systemWatts,
    krwPerKwh: options.krwPerKwh
  };
  const configPath = path.join(
    repoRoot,
    "debug",
    "qa",
    `book-maker-electron-qa-config-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return { config, configPath };
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
  const { config, configPath } = buildConfig(options);
  const outputDir = resolvePath(config.outputDir || options.outputDir);
  const reportPath = resolvePath(config.reportPath || options.reportPath);
  const logPath = resolvePath(options.logPath);
  const electronBinary = getElectronBinary();
  const electronMain = path.join(repoRoot, "dist-electron", "electron", "main.js");
  const runnerTimeoutMs =
    options.runnerTimeoutMs && (!config.timeoutMs || options.runnerTimeoutMs > config.timeoutMs)
      ? options.runnerTimeoutMs
      : Math.max(config.timeoutMs || 40 * 60 * 1000, options.timeoutMs || 0) + 60_000;

  if (!fs.existsSync(electronMain)) {
    throw new Error("dist-electron/electron/main.js not found. Run npm.cmd run build first.");
  }

  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.mkdirSync(path.dirname(logPath), { recursive: true });

  await runElectronQa({
    electronBinary,
    electronMain,
    configPath,
    outputDir,
    reportPath,
    logPath,
    timeoutMs: runnerTimeoutMs
  });

  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  console.log(JSON.stringify({
    status: report.status,
    reportPath: path.relative(repoRoot, reportPath),
    outputDir: path.relative(repoRoot, outputDir),
    totals: report.totals,
    energyEstimate: report.energyEstimate
  }, null, 2));
}

function runElectronQa(input) {
  return new Promise((resolve, reject) => {
    const logSink = createQaRedactedLogSink(input.logPath);
    const child = spawn(input.electronBinary, [input.electronMain], {
      cwd: repoRoot,
      env: {
        ...process.env,
        LM_QA_BOOK_MAKER: "1",
        LM_QA_BOOK_MAKER_CONFIG: input.configPath,
        LM_QA_BOOK_MAKER_REPORT: input.reportPath,
        LM_QA_EXPORT_DIR: input.outputDir
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    const timeout = setTimeout(() => {
      child.kill();
      logSink.finish();
      writeTimeoutReport(input);
      reject(new Error(`Electron Book Maker QA timed out after ${input.timeoutMs}ms.`));
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
      reject(new Error(`Electron Book Maker QA exited with code ${code}.`));
    });
  });
}

function writeTimeoutReport(input) {
  if (fs.existsSync(input.reportPath)) {
    return;
  }

  const heartbeatPath = input.reportPath.replace(/\.json$/i, ".heartbeat.json");
  let heartbeat;
  try {
    heartbeat = fs.existsSync(heartbeatPath)
      ? JSON.parse(fs.readFileSync(heartbeatPath, "utf8"))
      : undefined;
  } catch {
    heartbeat = undefined;
  }
  fs.writeFileSync(
    input.reportPath,
    `${JSON.stringify(
      {
        status: "failed",
        finishedAt: new Date().toISOString(),
        error: `Electron Book Maker QA timed out after ${input.timeoutMs}ms.`,
        lastHeartbeat: heartbeat
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

main().catch((error) => {
  console.error(
    `Electron Book Maker QA runner failed (${error instanceof Error ? error.name : "Error"}). See the local QA log.`
  );
  process.exitCode = 1;
});
