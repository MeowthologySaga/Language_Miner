import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const lifeMiningStyles = readFileSync(
  join(process.cwd(), "src", "styles", "lifeMining.css"),
  "utf8"
);
const lifeMiningSource = readFileSync(
  join(process.cwd(), "src", "pages", "LifeMiningPage.tsx"),
  "utf8"
);

function getRuleBody(pattern: RegExp) {
  const match = lifeMiningStyles.match(pattern);
  if (!match?.[1]) {
    throw new Error(`Missing CSS rule matching ${pattern}`);
  }
  return match[1];
}

describe("life mining layout", () => {
  it("uses a two-column candidate grid while keeping the preview panel scrollable", () => {
    const layoutRule = getRuleBody(/\.life-layout\s*\{([^}]*)\}/s);
    expect(layoutRule).toContain(
      "grid-template-columns: minmax(640px, 0.92fr) minmax(340px, 0.68fr);"
    );

    const listRule = getRuleBody(/\.life-candidate-panel\s+\.life-log-list\s*\{([^}]*)\}/s);
    expect(listRule).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");

    const detailRule = getRuleBody(/\.life-layout\s+\.detail-panel\s*\{([^}]*)\}/s);
    expect(detailRule).toContain("min-width: 0;");
    expect(detailRule).toContain("max-height: calc(100dvh - 96px);");
    expect(detailRule).toContain("overflow: auto;");
  });

  it("falls back to a single candidate column on narrow screens", () => {
    expect(lifeMiningStyles).toContain("@media (max-width: 1240px)");

    const responsiveListRule = getRuleBody(
      /@media \(max-width: 1240px\)[\s\S]*?\.life-candidate-panel\s+\.life-log-list\s*\{([^}]*)\}/s
    );
    expect(responsiveListRule).toContain("grid-template-columns: 1fr;");
  });

  it("unmounts duplicate usage tooltips while any dialog is open", () => {
    expect(lifeMiningSource).toContain("const hasOpenOverlay = Boolean(");
    expect(lifeMiningSource).toContain("{!hasOpenOverlay ? (");
    expect(lifeMiningSource).toContain("<Dialog");
    expect(lifeMiningSource).toContain('className={`page-grid life-layout${hasOpenOverlay ? " is-overlay-open" : ""}`}');
    expect(lifeMiningSource).not.toContain("document.activeElement.blur()");
  });
});
