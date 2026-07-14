import { describe, expect, it } from "vitest";
import { getListeningRssSourcesForLanguage, listeningRssSources } from "./listeningRssSources";

describe("listening RSS sources", () => {
  it("keeps RSS source packs separated by learning language", () => {
    expect(getListeningRssSourcesForLanguage("en").every((source) => source.languageCode === "en")).toBe(
      true
    );
    expect(getListeningRssSourcesForLanguage("ja-JP").map((source) => source.languageCode)).toEqual(
      expect.arrayContaining(["ja"])
    );
    expect(getListeningRssSourcesForLanguage("ko-KR").map((source) => source.languageCode)).toEqual(
      expect.arrayContaining(["ko"])
    );
    expect(getListeningRssSourcesForLanguage("ja").some((source) => source.languageCode === "en")).toBe(
      false
    );
  });

  it("keeps the unfiltered source list available for neutral fallbacks", () => {
    expect(getListeningRssSourcesForLanguage()).toHaveLength(listeningRssSources.length);
    expect(new Set(listeningRssSources.map((source) => source.languageCode))).toEqual(
      new Set(["en", "ja", "ko"])
    );
  });
});
