const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createQaRedactedLogSink } = require("./qa-redacted-log-sink.cjs");

const repoRoot = path.resolve(__dirname, "..");
const bridgeBaseUrl = "http://127.0.0.1:17345";
const extensionOrigin = "chrome-extension://ecenceehhpcodabiagkdacieghmhfoim";
const secondExtensionOrigin = "chrome-extension://lem-bridge-other";
const extensionHeaderValue = "life-miner-extension";

function parseArgs(argv) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const options = {
    reportPath: path.join(repoRoot, "debug", "reports", `life-miner-bridge-qa-${timestamp}.json`),
    logPath: path.join(repoRoot, "debug", "reports", `life-miner-bridge-qa-${timestamp}.log`),
    userDataDir: path.join(repoRoot, "debug", "qa", "user-data", `life-miner-bridge-${timestamp}`),
    timeoutMs: 60_000,
    allowExistingBridge: false
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
    } else if (arg === "--timeout-ms" && next) {
      options.timeoutMs = Number.parseInt(next, 10);
      index += 1;
    } else if (arg === "--allow-existing-bridge") {
      options.allowExistingBridge = true;
    }
  }

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

  if (!options.allowExistingBridge && (await isBridgeAlreadyRunning())) {
    throw new Error(
      "Life Miner bridge is already running on 127.0.0.1:17345. Close the existing app or pass --allow-existing-bridge."
    );
  }

  fs.mkdirSync(path.dirname(options.reportPath), { recursive: true });
  fs.mkdirSync(path.dirname(options.logPath), { recursive: true });
  fs.mkdirSync(options.userDataDir, { recursive: true });

  const report = await runBridgeSmoke({
    electronBinary: getElectronBinary(),
    electronMain,
    reportPath: options.reportPath,
    logPath: options.logPath,
    userDataDir: options.userDataDir,
    timeoutMs: options.timeoutMs
  });

  console.log(
    JSON.stringify(
      {
        status: report.status,
        reportPath: path.relative(repoRoot, options.reportPath),
        totals: report.totals
      },
      null,
      2
    )
  );
}

async function runBridgeSmoke(input) {
  const startedAt = new Date();
  const logSink = createQaRedactedLogSink(input.logPath);
  const child = spawn(input.electronBinary, [input.electronMain], {
    cwd: repoRoot,
    env: {
      ...process.env,
      LM_QA_BRIDGE_SMOKE: "1",
      LM_QA_USER_DATA_DIR: input.userDataDir
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (chunk) => logSink.write(chunk));
  child.stderr.on("data", (chunk) => logSink.write(chunk));

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, input.timeoutMs);

  try {
    await waitForBridgeReady(child, input.timeoutMs);
    const checks = await runBridgeChecks();
    const finishedAt = new Date();
    const failed = checks.filter((check) => check.status === "failed");
    const report = {
      status: failed.length === 0 ? "passed" : "failed",
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      elapsedMs: finishedAt.getTime() - startedAt.getTime(),
      bridgeBaseUrl,
      checks,
      totals: {
        checks: checks.length,
        passed: checks.length - failed.length,
        failed: failed.length
      }
    };
    fs.writeFileSync(input.reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    if (report.status === "failed") {
      throw new Error(`Life Miner bridge QA failed. Report: ${input.reportPath}`);
    }
    return report;
  } catch (error) {
    if (!fs.existsSync(input.reportPath)) {
      const finishedAt = new Date();
      fs.writeFileSync(
        input.reportPath,
        `${JSON.stringify(
          {
            status: "failed",
            startedAt: startedAt.toISOString(),
            finishedAt: finishedAt.toISOString(),
            elapsedMs: finishedAt.getTime() - startedAt.getTime(),
            error: timedOut
              ? `Life Miner bridge QA timed out after ${input.timeoutMs}ms.`
              : "Life Miner bridge QA failed. See the local QA log."
          },
          null,
          2
        )}\n`,
        "utf8"
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    await stopElectron(child);
    logSink.finish();
  }
}

async function runBridgeChecks() {
  const checks = [];
  checks.push(
    await recordCheck("health endpoint is public", async () => {
      const response = await fetchJson("/health");
      assertStatus(response, 200);
      assert(response.body.ok === true, "Expected health ok=true.");
      return { service: response.body.service };
    })
  );

  let bridgeToken = "";
  checks.push(
    await recordCheck("pair endpoint returns token and settings accepts it", async () => {
      const pairingResponse = await fetchJson("/pair", {
        method: "POST",
        headers: extensionHeaders({ origin: extensionOrigin, json: true }),
        body: "{}"
      });
      assertStatus(pairingResponse, 200);
      assert(pairingResponse.body.ok === true, "Expected pairing ok=true.");
      assert(
        typeof pairingResponse.body.bridgeToken === "string",
        "Expected bridgeToken string."
      );
      assert(
        pairingResponse.body.bridgeToken.length >= 20,
        "Expected non-trivial bridgeToken."
      );
      assert(
        pairingResponse.body.bridgeTokenRequired === true,
        "Expected bridgeTokenRequired=true."
      );
      bridgeToken = pairingResponse.body.bridgeToken;

      const settingsResponse = await fetchJson("/settings", {
        headers: extensionHeaders({ origin: extensionOrigin, token: bridgeToken })
      });
      assertStatus(settingsResponse, 200);
      assert(settingsResponse.body.ok === true, "Expected settings ok=true.");
      assert(
        settingsResponse.body.pairedExtensionOrigin === extensionOrigin,
        "Expected settings to report the paired extension origin."
      );
      return {
        bridgeTokenRequired: pairingResponse.body.bridgeTokenRequired,
        pairedExtensionOrigin: settingsResponse.body.pairedExtensionOrigin
      };
    })
  );

  checks.push(
    await recordCheck("settings without token is rejected", async () => {
      const response = await fetchJson("/settings", {
        headers: extensionHeaders({ origin: extensionOrigin })
      });
      assertStatus(response, 401);
      assert(response.body.bridgeTokenRequired === true, "Expected token-required error payload.");
      return { statusCode: response.status };
    })
  );

  checks.push(
    await recordCheck("post without token is rejected", async () => {
      const response = await fetchJson("/life-logs", {
        method: "POST",
        headers: extensionHeaders({ origin: extensionOrigin, json: true }),
        body: JSON.stringify({ text: "" })
      });
      assertStatus(response, 401);
      assert(response.body.bridgeTokenRequired === true, "Expected token-required error payload.");
      return { statusCode: response.status };
    })
  );

  checks.push(
    await recordCheck("post with token reaches handler without saving private data", async () => {
      const response = await fetchJson("/sentence-cards", {
        method: "POST",
        headers: extensionHeaders({ origin: extensionOrigin, json: true, token: bridgeToken }),
        body: JSON.stringify({ selectedText: "", sourceSentence: "" })
      });
      assertStatus(response, 202);
      assert(response.body.ok === true, "Expected accepted skipped response.");
      assert(response.body.skipped === true, "Expected skipped=true for empty selection.");
      assert(
        response.body.reason === "empty_selection",
        "Expected empty-selection rejection reason."
      );
      return { reason: response.body.reason };
    })
  );

  checks.push(
    await recordCheck("second extension origin is rejected after pairing", async () => {
      const response = await fetchJson("/settings", {
        headers: extensionHeaders({ origin: secondExtensionOrigin })
      });
      assertStatus(response, 403);
      return { statusCode: response.status };
    })
  );

  checks.push(
    await recordCheck("cors preflight allows bridge token header", async () => {
      const response = await fetchRaw("/life-logs", {
        method: "OPTIONS",
        headers: {
          Origin: extensionOrigin,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers":
            "Content-Type, X-Local-English-Miner, X-Local-English-Miner-Token"
        }
      });
      assertStatus(response, 204);
      const allowedHeaders = response.headers.get("access-control-allow-headers") || "";
      assert(
        /x-local-english-miner-token/i.test(allowedHeaders),
        "Expected CORS allow headers to include X-Local-English-Miner-Token."
      );
      return { allowedHeaders };
    })
  );

  return checks;
}

async function recordCheck(name, fn) {
  const startedAt = Date.now();
  try {
    const details = await fn();
    return {
      name,
      status: "passed",
      elapsedMs: Date.now() - startedAt,
      details
    };
  } catch (error) {
    return {
      name,
      status: "failed",
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function extensionHeaders(input = {}) {
  const headers = {
    "X-Local-English-Miner": extensionHeaderValue
  };
  if (input.origin) {
    headers.Origin = input.origin;
  }
  if (input.json) {
    headers["Content-Type"] = "application/json";
  }
  if (input.token) {
    headers["X-Local-English-Miner-Token"] = input.token;
  }
  return headers;
}

async function waitForBridgeReady(child, timeoutMs) {
  const startedAt = Date.now();
  let lastError = "";
  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`Electron exited before bridge became ready with code ${child.exitCode}.`);
    }
    try {
      const response = await fetchJson("/health", {}, 1_000);
      if (response.status === 200 && response.body?.ok === true) {
        return;
      }
      lastError = `status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for Life Miner bridge. Last error: ${lastError}`);
}

async function isBridgeAlreadyRunning() {
  try {
    const response = await fetchJson("/health", {}, 750);
    return response.status === 200 && response.body?.ok === true;
  } catch {
    return false;
  }
}

async function fetchJson(pathname, options = {}, timeoutMs = 5_000) {
  const response = await fetchRaw(pathname, options, timeoutMs);
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body: text ? JSON.parse(text) : {}
  };
}

async function fetchRaw(pathname, options = {}, timeoutMs = 5_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${bridgeBaseUrl}${pathname}`, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function assertStatus(response, expectedStatus) {
  assert(
    response.status === expectedStatus,
    `Expected status ${expectedStatus}, got ${response.status}.`
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function stopElectron(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  child.kill();
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 5_000);
    child.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(
    `Life Miner bridge QA runner failed (${error instanceof Error ? error.name : "Error"}). See the local QA log.`
  );
  process.exitCode = 1;
});
