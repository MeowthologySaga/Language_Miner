import { describe, expect, it } from "vitest";
import { isAllowedWebReaderUrl, normalizeWebReaderHttpUrl } from "./webReaderUrlPolicy";
import { WEB_READER_PRACTICE_URL } from "../src/shared/webReaderPractice";

describe("Web Reader URL policy", () => {
  it("requires HTTPS except for explicit loopback development URLs", () => {
    expect(isAllowedWebReaderUrl("https://example.com/article")).toBe(true);
    expect(isAllowedWebReaderUrl("http://example.com/article")).toBe(false);
    expect(isAllowedWebReaderUrl("http://localhost:4173/article")).toBe(true);
    expect(isAllowedWebReaderUrl("http://127.0.0.1:4173/article")).toBe(true);
  });

  it("rejects embedded credentials and non-web protocols", () => {
    expect(isAllowedWebReaderUrl(["https://user:pass", "example.com/"].join("@"))).toBe(false);
    expect(isAllowedWebReaderUrl("file:///tmp/page.html")).toBe(false);
    expect(() => normalizeWebReaderHttpUrl("http://example.com/")).toThrow(/HTTPS/);
  });

  it("allows only the exact built-in practice document URL", () => {
    expect(isAllowedWebReaderUrl(WEB_READER_PRACTICE_URL)).toBe(true);
    expect(normalizeWebReaderHttpUrl(WEB_READER_PRACTICE_URL)).toBe(WEB_READER_PRACTICE_URL);
    expect(isAllowedWebReaderUrl("lem-practice://reader/another-page")).toBe(false);
    expect(isAllowedWebReaderUrl(`${WEB_READER_PRACTICE_URL}?next=https://example.com`)).toBe(false);
    expect(isAllowedWebReaderUrl("lem-practice://other/getting-started")).toBe(false);
  });
});
