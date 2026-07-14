import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { serializeSafeDebugLogEntry } from "./safeDebugLog";

export function isQaRuntime() {
  return (
    process.env.LM_QA_BOOK_MAKER === "1" ||
    process.env.LM_QA_APP_SMOKE === "1" ||
    process.env.LM_QA_DOC_SCREENSHOTS === "1" ||
    process.env.LM_QA_WEB_READER_POPOVER === "1" ||
    process.env.LM_QA_WEB_READER_LIFE_PROOF === "1"
  );
}

export function qaTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function writeQaFailureReport(reportPath: string | undefined, caught: unknown) {
  if (!reportPath) {
    return;
  }

  const errorReport = JSON.parse(serializeSafeDebugLogEntry({
    status: "failed",
    finishedAt: new Date().toISOString(),
    error: caught
  })) as Record<string, unknown>;
  try {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    if (!fs.existsSync(reportPath)) {
      fs.writeFileSync(reportPath, `${JSON.stringify(errorReport, null, 2)}\n`, "utf8");
    }
  } catch {
    // The process exit code still communicates the QA failure.
  }
}

export function runQaTaskAndExit(input: {
  reportPath?: string;
  run: () => Promise<void>;
  resolveReportPath?: (reportPath: string) => string;
}) {
  void (async () => {
    try {
      await input.run();
      app.exit(0);
    } catch (caught) {
      const reportPath =
        input.reportPath && input.resolveReportPath
          ? input.resolveReportPath(input.reportPath)
          : input.reportPath;
      writeQaFailureReport(reportPath, caught);
      console.error("QA task failed.", serializeSafeDebugLogEntry({ error: caught }));
      app.exit(1);
    }
  })();
}
