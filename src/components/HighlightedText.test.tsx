import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HighlightedText } from "./HighlightedText";
import type { HighlightMapping } from "../shared/types";

describe("HighlightedText", () => {
  const mappings: HighlightMapping[] = [
    {
      sourceText: "neither",
      literalKo: "둘 중 어느 것도",
      naturalKo: "둘 다 아니다",
      colorKey: "blue"
    }
  ];

  it("highlights the closest literal translation fragment when the full mapping is not present", () => {
    const html = renderToStaticMarkup(
      <HighlightedText
        text="어느 선택지도 나에게 작동하지 않는다."
        mappings={mappings}
        target="literal"
      />
    );

    expect(html).toContain("highlight-blue");
    expect(html).toContain(">어느</mark>");
  });

  it("highlights the longest natural translation phrase present in the sentence", () => {
    const html = renderToStaticMarkup(
      <HighlightedText text="둘 다 나한테는 맞지 않아." mappings={mappings} target="natural" />
    );

    expect(html).toContain("highlight-blue");
    expect(html).toContain(">둘 다</mark>");
  });

  it("uses punctuation-separated Korean fallback fragments in translations", () => {
    const html = renderToStaticMarkup(
      <HighlightedText
        text="건물들이 다 허물어진 채로 서 있다."
        mappings={[
          {
            sourceText: "dilapidated",
            literalKo: "황폐한, 다 허물어진",
            naturalKo: "허름한 건물",
            colorKey: "green"
          }
        ]}
        target="literal"
      />
    );

    expect(html).toContain("highlight-green");
    expect(html).toContain(">다 허물어진</mark>");
  });
});
