import { describe, expect, it } from "vitest";
import { detectAppLocale, normalizeAppLocale } from "./appLocale";

describe("appLocale", () => {
  it("normalizes only currently supported UI languages", () => {
    expect(normalizeAppLocale("ko-KR")).toBe("ko");
    expect(normalizeAppLocale("EN_us")).toBe("en");
    expect(normalizeAppLocale("ja-JP")).toBeNull();
  });

  it("uses the first supported OS language and falls back to Korean", () => {
    expect(detectAppLocale(["ja-JP", "en-US", "ko-KR"])).toBe("en");
    expect(detectAppLocale(["zh-CN", "ja-JP"])).toBe("ko");
  });
});
