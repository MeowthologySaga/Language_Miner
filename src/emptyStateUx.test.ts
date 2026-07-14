import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const emptyStateSource = readFileSync(join(process.cwd(), "src", "components", "EmptyState.tsx"), "utf8");
const bookmarkSource = readFileSync(join(process.cwd(), "src", "pages", "BookmarksPage.tsx"), "utf8");
const exportHistorySource = readFileSync(
  join(process.cwd(), "src", "pages", "ExportHistoryPage.tsx"),
  "utf8"
);
const lifeMiningSource = readFileSync(join(process.cwd(), "src", "pages", "LifeMiningPage.tsx"), "utf8");
const i18nSource = readFileSync(join(process.cwd(), "src", "i18n.ts"), "utf8");
const appEntrySource = readFileSync(join(process.cwd(), "src", "main.tsx"), "utf8");
const globalStyles = readFileSync(join(process.cwd(), "src", "styles.css"), "utf8");
const emptyStateStyles = readFileSync(join(process.cwd(), "src", "styles", "emptyState.css"), "utf8");

describe("empty state UX", () => {
  it("provides a shared empty-state component with copy and actions", () => {
    expect(emptyStateSource).toContain("type EmptyStateProps");
    expect(emptyStateSource).toContain("empty-state-icon");
    expect(emptyStateSource).toContain("empty-state-copy");
    expect(emptyStateSource).toContain("empty-state-actions");
  });

  it("uses richer empty states on document pages", () => {
    expect(bookmarkSource).toContain("<EmptyState");
    expect(bookmarkSource).toContain('data-qa="bookmarks-empty-state"');
    expect(bookmarkSource).toContain('t("bookmarks.empty.title")');
    expect(bookmarkSource).toContain('t("bookmarks.actions.openLibrary")');

    expect(exportHistorySource).toContain("<EmptyState");
    expect(exportHistorySource).toContain('data-qa="export-history-empty-state"');
    expect(exportHistorySource).toContain('t("exportHistory.states.empty")');
    expect(exportHistorySource).toContain('t("exportHistory.actions.create")');
  });

  it("gives Life Mining one clear next action without duplicate empty-panel buttons", () => {
    expect(lifeMiningSource).toContain("<EmptyState");
    expect(lifeMiningSource).toContain('data-qa="life-empty-state"');
    expect(lifeMiningSource).toContain('data-qa="life-detail-empty-state"');
    expect(lifeMiningSource).toContain('data-qa="life-manual-add"');
    expect(lifeMiningSource).not.toContain('data-qa="life-empty-manual-add"');
    expect(lifeMiningSource).toContain('t("lifeMining.empty.listTitle")');
    expect(lifeMiningSource).toContain('t("lifeMining.empty.listDescription")');
    expect(lifeMiningSource).toContain('t("lifeMining.empty.noneTitle")');
    expect(i18nSource).toContain('listTitle: "No card candidates are waiting"');
    expect(i18nSource).toContain(
      'listDescription: "Use Add manually above, or enable automatic capture for sites you approved in Settings."'
    );
  });

  it("styles empty states with stable spacing and action layout", () => {
    expect(appEntrySource).toContain('import "./styles/emptyState.css";');
    expect(emptyStateStyles).toContain(".empty-state-icon");
    expect(emptyStateStyles).toContain(".empty-state-copy");
    expect(emptyStateStyles).toContain(".empty-state.document-empty-state");
    expect(emptyStateStyles).toContain(".empty-state-actions");
    expect(globalStyles).not.toContain(".empty-state-icon");
  });
});
