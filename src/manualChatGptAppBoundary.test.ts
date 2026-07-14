import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");

describe("manual ChatGPT app integration", () => {
  it("keeps one pending request, validates before resolving, and settles cancellation", () => {
    const source = fs.readFileSync(path.join(repoRoot, "src", "App.tsx"), "utf8");

    expect(source).toContain("if (pendingManualChatGptRequestRef.current)");
    expect(source).toContain("pending.request.validateResponse(response)");
    expect(source.indexOf("pending.request.validateResponse(response)")).toBeLessThan(
      source.indexOf("pending.resolve(response)")
    );
    expect(source).toContain('request.signal?.addEventListener("abort"');
    expect(source).toContain("pending.reject(createManualChatGptAbortError");
  });

  it("offers the manual provider as an explicit setting", () => {
    const source = fs.readFileSync(
      path.join(repoRoot, "src", "pages", "SettingsCardEnginePanel.tsx"),
      "utf8"
    );
    expect(source).toContain('value: "chatgptWeb"');
    expect(source).toContain('t("manualChatGptBridge.settingsNote")');
  });
});
