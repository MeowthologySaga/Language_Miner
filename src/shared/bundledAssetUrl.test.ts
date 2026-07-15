import { describe, expect, it } from "vitest";
import { resolveBundledAssetUrl } from "./bundledAssetUrl";

describe("resolveBundledAssetUrl", () => {
  it("keeps bundled public assets inside the packaged dist directory", () => {
    expect(resolveBundledAssetUrl("/samples/listening/example.png")).toBe(
      "./samples/listening/example.png"
    );
    expect(resolveBundledAssetUrl("/tutorial/molly.png")).toBe("./tutorial/molly.png");
    expect(resolveBundledAssetUrl("/playzone/LanguageMinerGameKit.zip")).toBe(
      "./playzone/LanguageMinerGameKit.zip"
    );
  });

  it("does not rewrite remote, data, local protocol, or user paths", () => {
    expect(resolveBundledAssetUrl("https://example.com/image.png")).toBe(
      "https://example.com/image.png"
    );
    expect(resolveBundledAssetUrl("data:image/png;base64,AAAA")).toBe(
      "data:image/png;base64,AAAA"
    );
    expect(resolveBundledAssetUrl("lem-video://media/frame.png")).toBe(
      "lem-video://media/frame.png"
    );
    expect(resolveBundledAssetUrl("/characters/imported.png")).toBe(
      "/characters/imported.png"
    );
  });
});
