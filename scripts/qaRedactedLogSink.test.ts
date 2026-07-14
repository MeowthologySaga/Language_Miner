import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { afterAll, describe, expect, it } from "vitest";

type SinkResult = {
  observedBytes: number;
  capturedBytes: number;
  retainedBytes: number;
  truncated: boolean;
};

type QaLogSink = {
  write(chunk: string | Buffer): void;
  finish(): SinkResult;
};

type QaLogModule = {
  createQaRedactedLogSink(
    logPath: string,
    options?: { maxCaptureBytes?: number; truncationTailBytes?: number }
  ): QaLogSink;
  redactQaLog(value: string): string;
};

const require = createRequire(join(process.cwd(), "scripts", "qaRedactedLogSink.test.ts"));
const { createQaRedactedLogSink, redactQaLog } = require(
  "./qa-redacted-log-sink.cjs"
) as QaLogModule;
const workRoot = mkdtempSync(join(tmpdir(), "language-miner-qa-log-"));

afterAll(() => {
  rmSync(workRoot, { recursive: true, force: true });
});

describe("QA child log redaction", () => {
  it("masks credentials, emails, and local paths from every supported platform", () => {
    const googleKey = ["AI", "za", "A".repeat(35)].join("");
    const openAiKey = ["sk-proj-", "B".repeat(30)].join("");
    const bearer = `Bearer ${"C".repeat(30)}`;
    const fixturePassword = ["plain", "password", "123"].join("-");
    const fixtureEmail = ["private.person", "private-mail.test"].join("@");
    const unixPath = ["", "home", "private-name", "language-miner", "app.sqlite:20:4"].join("/");
    const fileUrl = ["file:///C:", "Users", "private-name", "Documents", "lesson.pdf"].join("/");
    const raw = [
      `api_key=${googleKey}`,
      `provider failed with ${openAiKey}`,
      `Authorization: ${bearer}`,
      "password=" + JSON.stringify(fixturePassword),
      `contact ${fixtureEmail}`,
      "Error opening C:\\Users\\private-name\\AppData\\Roaming\\Language Miner\\app.sqlite",
      "at open (\\\\private-server\\private-share\\app.sqlite:10:2)",
      `failed at ${unixPath}`,
      `loaded ${fileUrl}`
    ].join("\n");

    const sanitized = redactQaLog(raw);

    for (const sensitive of [
      googleKey,
      openAiKey,
      bearer,
      fixturePassword,
      fixtureEmail,
      "private-name",
      "private-server",
      "private-share"
    ]) {
      expect(sanitized).not.toContain(sensitive);
    }
    expect(sanitized).toContain("[REDACTED]");
    expect(sanitized).toContain("[EMAIL]");
    expect(sanitized.match(/\[LOCAL_PATH\]/g)?.length).toBe(4);
  });

  it("redacts values split across child stdout chunks before writing one final log", () => {
    const logPath = join(workRoot, "split.log");
    const googleKey = ["AI", "za", "D".repeat(35)].join("");
    const sink = createQaRedactedLogSink(logPath);
    sink.write("Electron error api_key=" + googleKey.slice(0, 8));
    sink.write(googleKey.slice(8) + " at C:\\Users\\private-name\\app.sqlite\n");
    const inProgressOutput = readFileSync(logPath, "utf8");
    expect(inProgressOutput).toContain("raw child output is held only in bounded memory");
    expect(inProgressOutput).not.toContain(googleKey);
    const result = sink.finish();
    const output = readFileSync(logPath, "utf8");

    expect(result.truncated).toBe(false);
    expect(output).not.toContain(googleKey);
    expect(output).not.toContain("private-name");
    expect(output).toContain("[REDACTED]");
    expect(output).toContain("[LOCAL_PATH]");
    expect(readdirSync(workRoot).filter((name) => name.startsWith("split"))).toEqual([
      "split.log"
    ]);
  });

  it("caps memory and announces truncation without emitting the unsafe tail", () => {
    const logPath = join(workRoot, "bounded.log");
    const sink = createQaRedactedLogSink(logPath, {
      maxCaptureBytes: 96,
      truncationTailBytes: 24
    });
    sink.write("x".repeat(70));
    sink.write(" password=super-secret-that-crosses-the-boundary " + "y".repeat(100));
    const result = sink.finish();
    const output = readFileSync(logPath, "utf8");

    expect(result.truncated).toBe(true);
    expect(result.capturedBytes).toBe(96);
    expect(result.retainedBytes).toBe(72);
    expect(result.observedBytes).toBeGreaterThan(96);
    expect(output).toContain("[QA LOG TRUNCATED:");
    expect(output).toContain("withheld to avoid exposing a partial secret or path");
    expect(output).not.toContain("super-secret");
  });
});

describe("Electron QA runner log boundary", () => {
  it("routes all three child logs through the shared sink", () => {
    for (const fileName of [
      "qa-app-smoke-electron.cjs",
      "qa-book-maker-electron.cjs",
      "qa-life-miner-bridge-electron.cjs"
    ]) {
      const source = readFileSync(join(process.cwd(), "scripts", fileName), "utf8");
      expect(source).toContain('require("./qa-redacted-log-sink.cjs")');
      expect(source).toContain("createQaRedactedLogSink(input.logPath)");
      expect(source).not.toContain("createWriteStream(input.logPath");
      expect(source).not.toContain("logStream.write(chunk)");
    }
  });
});
