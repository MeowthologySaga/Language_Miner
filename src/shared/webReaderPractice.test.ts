import { describe, expect, it } from "vitest";
import {
  isWebReaderPracticeUrl,
  renderWebReaderPracticeHtml,
  WEB_READER_PRACTICE_URL
} from "./webReaderPractice";

describe("built-in Web Reader practice document", () => {
  it("accepts only its fixed local URL", () => {
    expect(isWebReaderPracticeUrl(WEB_READER_PRACTICE_URL)).toBe(true);
    expect(isWebReaderPracticeUrl("lem-practice://reader/getting-started#other")).toBe(false);
    expect(isWebReaderPracticeUrl("lem-practice://reader/getting-started?url=https://example.com")).toBe(
      false
    );
    expect(isWebReaderPracticeUrl("data:text/html,test")).toBe(false);
    expect(isWebReaderPracticeUrl("file:///practice.html")).toBe(false);
  });

  it.each(["ko", "en"] as const)("renders a self-contained %s practice page", (locale) => {
    const html = renderWebReaderPracticeHtml(locale);
    expect(html).toContain("I’m <span class=\"target\">running a little late</span>.");
    expect(html).toContain(`lang="${locale}"`);
    expect(html).not.toMatch(/<script|https?:\/\/|file:\/\//i);
  });
});
