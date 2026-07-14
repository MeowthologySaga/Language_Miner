import { describe, expect, it } from "vitest";
import { defaultLifeMiningCaptureSettings } from "./lifeMiningSettings";
import {
  applyLifeMiningCapturePolicy,
  getBrowserCaptureSiteKey,
  isBrowserCaptureSiteAllowed
} from "./lifeMiningCapturePolicy";

describe("lifeMiningCapturePolicy", () => {
  it("enforces own-only capture and reconstructs the target as the only message", () => {
    const result = applyLifeMiningCapturePolicy(
      {
        text: "I need more practice.",
        appName: "Discord",
        metadata: {
          messages: [
            { role: "other", raw_content: "Try this.", speaker: "Tutor" },
            { role: "user", raw_content: "I need more practice.", speaker: "Me" }
          ]
        }
      },
      { ...defaultLifeMiningCaptureSettings, target: "own", enabled: true }
    );
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.input.beforeContext).toBeUndefined();
    expect(result.input.metadata?.messages).toHaveLength(1);
    expect(result.input.metadata?.messages?.[0]).toMatchObject({
      role: "user",
      raw_content: "I need more practice."
    });
  });

  it("applies context counts and the maximum message length", () => {
    const result = applyLifeMiningCapturePolicy(
      {
        text: "x".repeat(400),
        metadata: {
          messages: [
            { role: "other", raw_content: "first", speaker: "A" },
            { role: "other", raw_content: "second", speaker: "B" }
          ]
        }
      },
      {
        ...defaultLifeMiningCaptureSettings,
        enabled: true,
        preset: "custom",
        maxMessageChars: 300,
        contextMode: "previous_1",
        contextBeforeCount: 20,
        longMessageMode: "truncate"
      }
    );
    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.input.text).toHaveLength(300);
    expect(result.input.beforeContext).toBe("B: second");
  });

  it("rejects long messages when skip or unavailable summary was requested", () => {
    const base = {
      ...defaultLifeMiningCaptureSettings,
      enabled: true,
      preset: "custom" as const,
      maxMessageChars: 300
    };
    expect(
      applyLifeMiningCapturePolicy({ text: "x".repeat(301) }, { ...base, longMessageMode: "skip" })
    ).toEqual({ accepted: false, reason: "too_long" });
    expect(
      applyLifeMiningCapturePolicy(
        { text: "x".repeat(301) },
        { ...base, longMessageMode: "summarize" }
      )
    ).toEqual({ accepted: false, reason: "summary_not_available" });
  });

  it("maps and enforces site-specific permissions", () => {
    const capture = { appName: "Discord", metadata: { url: "https://discord.com/channels/1" } };
    expect(getBrowserCaptureSiteKey(capture)).toBe("discord");
    expect(
      isBrowserCaptureSiteAllowed(capture, {
        discord: false,
        chatgpt: true,
        claude: true,
        youtube: true,
        reddit: true,
        genericWeb: true
      })
    ).toBe(false);
  });
});
