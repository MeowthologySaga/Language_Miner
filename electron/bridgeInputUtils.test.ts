import { describe, expect, it } from "vitest";
import {
  getYouTubeVideoId,
  normalizeBridgeMultilineText,
  normalizeBridgeNumber,
  normalizeBridgeText,
  normalizeYouTubeVideoId,
  sanitizeListeningMetadata
} from "./bridgeInputUtils";

describe("bridgeInputUtils", () => {
  it("normalizes bridge text and multiline payloads", () => {
    expect(normalizeBridgeText("  hello\u00a0   world  ")).toBe("hello world");
    expect(normalizeBridgeMultilineText(" one \r\n\r\n two\t\twords \n ")).toBe(
      "one\ntwo words"
    );
  });

  it("normalizes positive numeric inputs", () => {
    expect(normalizeBridgeNumber("12.5")).toBe(12.5);
    expect(normalizeBridgeNumber(-4)).toBe(0);
    expect(normalizeBridgeNumber("not-a-number")).toBeUndefined();
  });

  it("extracts valid YouTube video IDs from IDs and URLs", () => {
    expect(normalizeYouTubeVideoId("abcDEF_1234")).toBe("abcDEF_1234");
    expect(normalizeYouTubeVideoId("bad id")).toBe("");
    expect(getYouTubeVideoId("https://youtu.be/abcDEF_1234")).toBe("abcDEF_1234");
    expect(getYouTubeVideoId("https://www.youtube.com/watch?v=abcDEF_1234&t=5")).toBe(
      "abcDEF_1234"
    );
    expect(getYouTubeVideoId("not a url")).toBe("");
  });

  it("keeps only primitive listening metadata fields", () => {
    expect(
      sanitizeListeningMetadata({
        source: "youtube",
        durationSeconds: 120,
        seen: true,
        nested: { nope: true },
        list: ["nope"]
      })
    ).toEqual({
      source: "youtube",
      durationSeconds: 120,
      seen: true
    });
  });
});
