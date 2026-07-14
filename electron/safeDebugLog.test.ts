import { describe, expect, it } from "vitest";
import { serializeSafeDebugLogEntry } from "./safeDebugLog";

describe("serializeSafeDebugLogEntry", () => {
  it("redacts credentials, original content, and private paths", () => {
    const secret = ["secret", "fixture", "value", "123456"].join("-");
    const serialized = serializeSafeDebugLogEntry({
      type: "translation-failure",
      sourceText: "A private sentence from the learner",
      apiKey: secret,
      message: `authorization: Bearer ${secret} at C:\\Users\\test\\lesson.txt`,
      artifactPath: "C:\\Users\\test\\lesson.txt",
      nested: { prompt: "private prompt", contextHash: "safe-hash" }
    }, [secret]);

    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("private sentence");
    expect(serialized).not.toContain("private prompt");
    expect(serialized).not.toContain("Users");
    expect(serialized).toContain("[CONTENT REDACTED]");
    expect(serialized).toContain("[LOCAL PATH REDACTED]");
    expect(serialized).not.toContain("safe-hash");
  });

  it("bounds arrays and replaces circular structures", () => {
    const circular: { self?: unknown; values: number[] } = {
      values: Array.from({ length: 150 }, (_, index) => index)
    };
    circular.self = circular;

    const parsed = JSON.parse(serializeSafeDebugLogEntry(circular)) as {
      self: string;
      values: number[];
    };
    expect(parsed.self).toBe("[CIRCULAR REDACTED]");
    expect(parsed.values).toHaveLength(100);
  });

  it("does not persist arbitrary exception details or absolute paths", () => {
    const serialized = serializeSafeDebugLogEntry({
      error: Object.assign(
        new Error("The learner wrote a private sentence in D:\\Lessons\\private.txt"),
        { code: "E_PRIVATE" }
      ),
      reason: "The original document contained a private paragraph",
      fileUrl: ["file:///C:", "Users", "test", "private.pdf"].join("/"),
      uncPath: "\\\\server\\private-share\\lesson.pdf"
    });

    expect(serialized).not.toContain("private sentence");
    expect(serialized).not.toContain("private paragraph");
    expect(serialized).not.toContain("private.pdf");
    expect(serialized).not.toContain("private-share");
    expect(serialized).toContain("[ERROR DETAIL REDACTED]");
    expect(serialized).toContain("E_PRIVATE");
    expect(serialized).toContain("[LOCAL PATH REDACTED]");
  });

  it("redacts string-shaped errors collected by QA runners", () => {
    const serialized = serializeSafeDebugLogEntry({
      status: "failed",
      error: "The learner's original sentence caused the fixture to fail",
      screenshotError: "Could not open C:\\Users\\learner\\private.png"
    });

    expect(serialized).not.toContain("original sentence");
    expect(serialized).not.toContain("private.png");
    expect(serialized.match(/\[CONTENT REDACTED\]/g)).toHaveLength(2);
  });

  it("redacts compound content and location keys while preserving QA structure", () => {
    const originalValues = [
      "learner-source-sentence-unique",
      "learner-selected-text-unique",
      "learner-prompt-template-unique",
      "learner-context-window-unique",
      "learner-transcript-segment-unique",
      "learner-conversation-message-unique",
      "learner-response-body-unique",
      "learner-unknown-payload-unique",
      "https://private.example.test/profile?learner=unique",
      "custom-scheme://private-resource/unique",
      "C:\\Users\\learner\\private-unique.txt",
      ["learner.unique", "example.test"].join("@")
    ];
    const parsed = JSON.parse(
      serializeSafeDebugLogEntry({
        locale: "en",
        requestedLocale: "ko",
        storedLocale: "en",
        documentLanguage: "en",
        status: "failed",
        errorCode: "E_QA_SCALE",
        route: "webReader",
        phase: "renderer",
        startedAt: "2026-07-13T00:00:00.000Z",
        retryCount: 3,
        enabled: false,
        sourceSentence: originalValues[0],
        selected_text: originalValues[1],
        promptTemplate: originalValues[2],
        beforeContextWindow: originalValues[3],
        transcriptSegments: [originalValues[4]],
        conversationMessages: [{ role: "user", message: originalValues[5] }],
        responseBody: originalValues[6],
        arbitraryPayload: originalValues[7],
        targetUrl: originalValues[8],
        callbackURI: originalValues[9],
        outputPath: originalValues[10],
        accountEmail: originalValues[11],
        nested: {
          status: "ready",
          errorCode: "E_NESTED",
          count: 12,
          passed: true,
          sourceSentence: "nested-private-sentence-unique"
        },
        snapshot: {
          status: "captured",
          visible: true,
          sourceSentence: "snapshot-private-sentence-unique"
        },
        secretAttemptCount: 4
      })
    ) as Record<string, any>;

    expect(parsed.locale).toBe("en");
    expect(parsed.requestedLocale).toBe("ko");
    expect(parsed.storedLocale).toBe("en");
    expect(parsed.documentLanguage).toBe("en");
    expect(parsed.status).toBe("failed");
    expect(parsed.errorCode).toBe("E_QA_SCALE");
    expect(parsed.route).toBe("webReader");
    expect(parsed.phase).toBe("renderer");
    expect(parsed.startedAt).toBe("2026-07-13T00:00:00.000Z");
    expect(parsed.retryCount).toBe(3);
    expect(parsed.enabled).toBe(false);
    expect(parsed.nested.status).toBe("ready");
    expect(parsed.nested.errorCode).toBe("E_NESTED");
    expect(parsed.nested.count).toBe(12);
    expect(parsed.nested.passed).toBe(true);
    expect(parsed.secretAttemptCount).toBe(4);
    expect(parsed.sourceSentence).toBe("[CONTENT REDACTED]");
    expect(parsed.targetUrl).toBe("[URL REDACTED]");
    expect(parsed.callbackURI).toBe("[URL REDACTED]");
    expect(parsed.outputPath).toBe("[LOCAL PATH REDACTED]");
    expect(parsed.accountEmail).toBe("[EMAIL REDACTED]");
    expect(parsed.transcriptSegments).toEqual(["[CONTENT REDACTED]"]);
    expect(parsed.conversationMessages[0].role).toBe("user");
    expect(parsed.conversationMessages[0].message).toBe("[CONTENT REDACTED]");
    expect(parsed.snapshot.status).toBe("captured");
    expect(parsed.snapshot.visible).toBe(true);

    const serialized = JSON.stringify(parsed);
    for (const originalValue of originalValues) {
      expect(serialized).not.toContain(originalValue);
    }
    expect(serialized).not.toContain("nested-private-sentence-unique");
    expect(serialized).not.toContain("snapshot-private-sentence-unique");
  });

  it("redacts unkeyed root and array strings without losing nested evidence", () => {
    const parsed = JSON.parse(
      serializeSafeDebugLogEntry([
        "root-array-private-original",
        { status: "ready", errorCode: "E_SAFE", text: "nested-private-original" },
        7,
        true
      ])
    ) as [string, { status: string; errorCode: string; text: string }, number, boolean];

    expect(parsed).toEqual([
      "[CONTENT REDACTED]",
      { status: "ready", errorCode: "E_SAFE", text: "[CONTENT REDACTED]" },
      7,
      true
    ]);
  });
});
