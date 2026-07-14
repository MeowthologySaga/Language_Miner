import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("backup preview expiry UI", () => {
  it("disables restore after the one-time preview expires and asks for the file again", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "pages", "SettingsBackupPanel.tsx"),
      "utf8"
    );
    expect(source).toContain("preview.expiresAt <= now");
    expect(source).toContain("disabled={isWorking || previewExpired}");
    expect(source).toContain("settings.backup.status.previewExpired");
  });

  it("shows localized warnings and the selected mode estimate before restore", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "pages", "SettingsBackupPanel.tsx"),
      "utf8"
    );
    expect(source).toContain("preview.warnings.map");
    expect(source).toContain("warningTranslationKeys[warning]");
    expect(source).toContain("preview?.estimates[restoreMode]");
    expect(source).toContain('data-qa="settings-backup-estimate"');
    expect(source).toContain("selectedEstimate.profileConflicts");
    expect(source).toContain("selectedEstimate.itemsAdded");
    expect(source).toContain("selectedEstimate.itemsOverwritten");
    expect(source).toContain("selectedEstimate.itemsSkipped");
  });
});
