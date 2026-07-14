import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src", "pages", "ListeningLoopPage.tsx"),
  "utf8"
);

describe("Listening Loop localization and accessibility boundaries", () => {
  it("uses the typed catalog and shared accessible dialog", () => {
    expect(source).toContain('import { useTranslation } from "react-i18next"');
    expect(source).toContain('import { Dialog } from "../components/Dialog"');
    expect(source).toContain('t("listeningLoop.entrance.homeTitle")');
    expect(source).toContain('t("listeningLoop.batch.dialogAria")');
    expect(source).not.toContain('role="dialog"');
    expect(source).not.toContain("window.confirm(");
    expect(source).not.toContain("window.prompt(");
    expect(source).not.toContain("window.alert(");
  });

  it("provides one page-level h1 for every entrance and practice branch", () => {
    expect(source.match(/<h1[>\s]/g)).toHaveLength(3);
    expect(source).toContain('aria-live="polite" role="status"');
    expect(source).toContain('aria-pressed={selectedOrder > 0}');
    expect(source).toContain('aria-label={t("listeningLoop.entrance.targetAria")}');
  });

  it("returns on cloud preflight cancellation before invoking the listening-card provider", () => {
    const start = source.indexOf("async function saveCurrentSegment");
    const end = source.indexOf("function removeCurrent", start);
    const block = source.slice(start, end > start ? end : undefined);
    const preflightIndex = block.indexOf("await confirmCloudTranslation");
    const cancelReturnIndex = block.indexOf("return;", preflightIndex);
    const providerIndex = block.indexOf("createListeningLoopInputCard", preflightIndex);

    expect(preflightIndex).toBeGreaterThan(-1);
    expect(cancelReturnIndex).toBeGreaterThan(preflightIndex);
    expect(providerIndex).toBeGreaterThan(cancelReturnIndex);
  });
});
