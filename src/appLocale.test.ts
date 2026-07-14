import { afterEach, describe, expect, it, vi } from "vitest";
import { detectAppLocale, normalizeAppLocale, readAppLocale } from "./appLocale";

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it("ignores Node's global navigator when no browser window exists", () => {
    vi.stubGlobal("window", undefined);
    vi.stubGlobal("navigator", { languages: ["en-US"], language: "en-US" });

    expect(readAppLocale()).toBe("ko");
  });
});
