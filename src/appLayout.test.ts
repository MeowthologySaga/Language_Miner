import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const styles = [
  readFileSync(join(process.cwd(), "src", "styles.css"), "utf8"),
  readFileSync(join(process.cwd(), "src", "styles", "appShell.css"), "utf8"),
  readFileSync(join(process.cwd(), "src", "styles", "webReader.css"), "utf8")
].join("\n");

function getRuleBody(pattern: RegExp) {
  const match = styles.match(pattern);
  if (!match?.[1]) {
    throw new Error(`Missing CSS rule matching ${pattern}`);
  }
  return match[1];
}

describe("app shell layout", () => {
  it("keeps browser document scrolling from exposing the area under the sidebar", () => {
    const viewportRootRule = getRuleBody(/html,\s*body,\s*#root\s*\{([^}]*)\}/s);
    expect(viewportRootRule).toContain("height: 100%;");
    expect(viewportRootRule).toContain("overflow: hidden;");

    const shellRule = getRuleBody(/\.app-shell\s*\{([^}]*)\}/s);
    expect(shellRule).toContain("height: 100vh;");
    expect(shellRule).toContain("height: 100dvh;");
    expect(shellRule).toContain("overflow: hidden;");

    const mainRule = getRuleBody(/\.app-main\s*\{([^}]*)\}/s);
    expect(mainRule).toContain("overflow: auto;");

    const topbarRule = getRuleBody(/\.topbar\s*\{([^}]*)\}/s);
    expect(topbarRule).toContain("position: sticky;");
    expect(topbarRule).toContain("top: 0;");
  });

  it("keeps the web reader surface in a flex-sized region for the Electron BrowserView slot", () => {
    const pageRule = getRuleBody(/\.web-reader-page\s*\{([^}]*)\}/s);
    expect(pageRule).toContain("display: flex;");
    expect(pageRule).toContain("flex-direction: column;");
    expect(pageRule).toContain("height: 100%;");

    const stageRule = getRuleBody(/\.web-reader-stage\s*\{([^}]*)\}/s);
    expect(stageRule).toContain("position: relative;");
    expect(stageRule).toContain("display: flex;");
    expect(stageRule).toContain("flex: 1 1 auto;");
    expect(stageRule).toContain("flex-direction: column;");
    expect(stageRule).toContain("height: 100%;");
    expect(stageRule).toContain("overflow: hidden;");

    const surfaceRule = getRuleBody(/\.web-reader-web-surface\s*\{([^}]*)\}/s);
    expect(surfaceRule).toContain("position: relative;");
    expect(surfaceRule).toContain("flex: 1 1 auto;");

    const webviewRule = getRuleBody(/\.web-reader-webview\s*\{([^}]*)\}/s);
    expect(webviewRule).toContain("position: relative;");
    expect(webviewRule).toContain("flex: 1 1 auto;");
    expect(webviewRule).toContain("width: 100%;");
    expect(webviewRule).toContain("height: 100%;");
    expect(webviewRule).toContain("min-height: 100%;");
  });

  it("supports a compact collapsed sidebar rail", () => {
    const collapsedShellRule = getRuleBody(/\.app-shell\.sidebar-collapsed\s*\{([^}]*)\}/s);
    expect(collapsedShellRule).toContain("grid-template-columns: 72px minmax(0, 1fr);");

    const navButtonRule = getRuleBody(
      /\.app-shell\.sidebar-collapsed\s+\.tab-nav button\s*\{([^}]*)\}/s
    );
    expect(navButtonRule).toContain("justify-content: center;");
    expect(navButtonRule).toContain("width: 48px;");

    const navRailRule = getRuleBody(/\.app-shell\.sidebar-collapsed\s+\.tab-nav\s*\{([^}]*)\}/s);
    expect(navRailRule).toContain("overflow-x: hidden;");
    expect(navRailRule).toContain("scrollbar-gutter: auto;");

    const hiddenTextRule = getRuleBody(
      /\.app-shell\.sidebar-collapsed\s+\.brand-copy,[\s\S]*?\.app-shell\.sidebar-collapsed\s+\.sidebar-usage-card\s*\{([^}]*)\}/s
    );
    expect(hiddenTextRule).toContain("display: none;");
  });

  it("keeps collapsed navigation categories visually distinct from route icons", () => {
    const collapsedSectionRule = getRuleBody(
      /\.app-shell\.sidebar-collapsed\s+\.nav-section-toggle\s*\{([^}]*)\}/s
    );
    expect(collapsedSectionRule).toContain("var(--nav-section-bg)");
    expect(collapsedSectionRule).toContain("var(--nav-section-accent)");

    const collapsedSectionMarkerRule = getRuleBody(
      /\.app-shell\.sidebar-collapsed\s+\.nav-section-toggle::before\s*\{([^}]*)\}/s
    );
    expect(collapsedSectionMarkerRule).toContain("background: var(--nav-section-accent);");

    const categoryTokens = ["input", "output", "review", "playZone", "manage"];
    for (const token of categoryTokens) {
      expect(styles).toContain(`.nav-section-${token}`);
    }
  });

  it("uses category color tokens for expanded navigation hierarchy", () => {
    const sectionRule = getRuleBody(/\.nav-section\s*\{([^}]*)\}/s);
    expect(sectionRule).toContain("--nav-section-accent: #1769e0;");
    expect(sectionRule).toContain("--nav-section-bg: #eff6ff;");
    expect(sectionRule).toContain("--nav-section-border: #bfdbfe;");

    const sectionToggleRule = getRuleBody(/\.nav-section-toggle\s*\{([^}]*)\}/s);
    expect(sectionToggleRule).toContain("position: relative;");
    expect(sectionToggleRule).toContain("border-color: var(--nav-section-border);");
    expect(sectionToggleRule).toContain("background: var(--nav-section-bg);");
    expect(sectionToggleRule).toContain("color: var(--nav-section-accent);");
    expect(sectionToggleRule).not.toMatch(/--nav-section-accent\s*:/);

    const tabSectionToggleRule = getRuleBody(/\.tab-nav\s+\.nav-section-toggle\s*\{([^}]*)\}/s);
    expect(tabSectionToggleRule).toContain("border-color: var(--nav-section-border);");
    expect(tabSectionToggleRule).toContain("background: var(--nav-section-bg);");
    expect(tabSectionToggleRule).toContain("color: var(--nav-section-accent);");

    const tabButtonFocusRule = getRuleBody(/\.tab-nav button:focus-visible\s*\{([^}]*)\}/s);
    expect(tabButtonFocusRule).toContain("outline: 2px solid #bfdbfe;");

    const categoryFocusRule = getRuleBody(
      /\.tab-nav\s+\.nav-section-toggle:focus-visible,[\s\S]*?\.tab-nav\s+\.nav-section-body button:focus-visible\s*\{([^}]*)\}/s
    );
    expect(categoryFocusRule).toContain("outline-color: var(--nav-section-border);");

    const sectionMarkerRule = getRuleBody(/\.nav-section-toggle::before\s*\{([^}]*)\}/s);
    expect(sectionMarkerRule).toContain("background: var(--nav-section-accent);");

    const sectionIconRule = getRuleBody(/\.nav-section-toggle\s*>\s*svg:first-child\s*\{([^}]*)\}/s);
    expect(sectionIconRule).toContain("background: var(--nav-section-accent);");
    expect(sectionIconRule).toContain("color: #ffffff;");

    const childActiveRule = getRuleBody(
      /\.tab-nav\s+\.nav-section-body button:hover,[\s\S]*?\.tab-nav\s+\.nav-section-body button\.active\s*\{([^}]*)\}/s
    );
    expect(childActiveRule).toContain("border-color: var(--nav-section-border);");
    expect(childActiveRule).toContain("background: var(--nav-section-bg);");
    expect(childActiveRule).toContain("color: var(--nav-section-accent);");

    const childMarkerRule = getRuleBody(/\.nav-section-body button\.active::before\s*\{([^}]*)\}/s);
    expect(childMarkerRule).toContain("background: var(--nav-section-accent);");
  });

  it("uses a dedicated active color for the today navigation item", () => {
    const homeRule = getRuleBody(/\.nav-home button\s*\{([^}]*)\}/s);
    expect(homeRule).toContain("--home-nav-accent: #be123c;");
    expect(homeRule).toContain("--home-nav-bg: #fff1f2;");
    expect(homeRule).toContain("--home-nav-border: #fecdd3;");
    expect(homeRule).not.toContain("#1769e0");

    const homeActiveRule = getRuleBody(
      /\.nav-home button:hover,[\s\S]*?\.nav-home button\.active\s*\{([^}]*)\}/s
    );
    expect(homeActiveRule).toContain("border-color: var(--home-nav-border);");
    expect(homeActiveRule).toContain("background: var(--home-nav-bg);");
    expect(homeActiveRule).toContain("color: var(--home-nav-accent);");

    const homeMarkerRule = getRuleBody(/\.nav-home button\.active::before\s*\{([^}]*)\}/s);
    expect(homeMarkerRule).toContain("background: var(--home-nav-accent);");
  });

  it("de-emphasizes expanded active parent navigation when a child route is active", () => {
    const expandedActiveRule = getRuleBody(
      /\.nav-section\.expanded\s*>\s*\.nav-section-toggle\.active\s*\{([^}]*)\}/s
    );
    expect(expandedActiveRule).toContain("background: #ffffff;");

    const expandedActiveIconRule = getRuleBody(
      /\.nav-section\.expanded\s*>\s*\.nav-section-toggle\.active\s*>\s*svg:first-child\s*\{([^}]*)\}/s
    );
    expect(expandedActiveIconRule).toContain("background: #ffffff;");
    expect(expandedActiveIconRule).toContain("color: var(--nav-section-accent);");
    expect(expandedActiveIconRule).toContain("box-shadow: inset 0 0 0 1px var(--nav-section-border);");
  });
});
