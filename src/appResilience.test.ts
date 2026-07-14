import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(join(process.cwd(), "src", "App.tsx"), "utf8");
const entrySource = readFileSync(join(process.cwd(), "src", "main.tsx"), "utf8");
const boundarySource = readFileSync(
  join(process.cwd(), "src", "components", "AppErrorBoundary.tsx"),
  "utf8"
);
const secureSettingsSource = readFileSync(
  join(process.cwd(), "src", "secureSettingsPersistence.ts"),
  "utf8"
);

describe("app resilience shell", () => {
  it("does not present empty learning data while bootstrap requests are unresolved", () => {
    expect(appSource).toContain('type BootstrapState = "loading" | "ready" | "error"');
    expect(appSource).toContain("Promise.all([loadCards(), loadLifeLogs(), loadEconomy()])");
    expect(appSource).toContain('bootstrapState === "error"');
    expect(appSource).toContain("setBootstrapRetryRequest");
  });

  it("does not remount the active settings route for ordinary settings changes", () => {
    const bootstrapLoadStart = appSource.indexOf(
      "void Promise.all([loadCards(), loadLifeLogs(), loadEconomy()])"
    );
    const bootstrapEffectEnd = appSource.indexOf("\n\n  useEffect", bootstrapLoadStart);
    const bootstrapEffect = appSource.slice(bootstrapLoadStart, bootstrapEffectEnd);

    expect(bootstrapLoadStart).toBeGreaterThan(-1);
    expect(bootstrapEffectEnd).toBeGreaterThan(bootstrapLoadStart);
    expect(bootstrapEffect).toMatch(
      /\},\s*\[\s*activeSettings\.profileId,\s*api,\s*bootstrapRetryRequest,\s*privacyStartupCheckComplete,\s*rendererPrivacyOperation\s*\]\);/
    );
    expect(bootstrapEffect).not.toMatch(/\bactiveSettings\s*,/);
    expect(bootstrapEffect).not.toContain("profiledApi");
    expect(appSource).toContain("onInitialTabConsumed={consumeSettingsInitialTab}");
    expect(appSource).toContain("if (!areLearningProfilesEquivalent(");
    expect(appSource).toContain(
      "areLearningProfilesEquivalent(activeProfile.learningProfile, learningProfile)"
    );
  });

  it("persists first-run completion through the Electron host bridge", () => {
    expect(appSource).toContain("getAppOnboardingCompleted");
    expect(appSource).toContain("completeAppOnboarding");
    expect(appSource).toContain("await closeOnboarding()");
  });

  it("contains global and route-level recoverable error boundaries", () => {
    expect(entrySource).toContain("<AppErrorBoundary");
    expect(appSource).toContain("<AppErrorBoundary resetKey={activeTab}");
    expect(boundarySource).toContain("getDerivedStateFromError");
    expect(boundarySource).toContain('i18n.t("common.retry")');
    expect(boundarySource).toContain("documentTechnicalError");
    expect(boundarySource).not.toContain("this.state.error.message");
  });

  it("moves keyboard users directly to the named main content", () => {
    expect(appSource).toContain('href="#app-main-content"');
    expect(appSource).toContain('id="app-main-content"');
    expect(appSource).toContain("mainContentRef.current?.focus");
    expect(appSource).toContain('aria-current={primaryActiveTab === item.key ? "page" : undefined}');
  });

  it("never persists API keys as a plaintext fallback", () => {
    expect(appSource).toContain("prepareSecureSettings(");
    expect(appSource).toContain("secureSettingsAvailableRef.current");
    expect(secureSettingsSource).toContain("await client.getStatus()");
    expect(secureSettingsSource).toContain("if (!status.available)");
    expect(secureSettingsSource).toContain("await client.migrateLegacy(legacyKeys)");
    expect(secureSettingsSource).toContain('geminiApiKey: ""');
    expect(secureSettingsSource).toContain('googleTranslateApiKey: ""');
    expect(secureSettingsSource).not.toContain("return value;");
    expect(appSource).toContain('t("app.secureStorageSessionOnly")');
    expect(appSource).toContain("secureSettingsAvailableRef.current || secureKeysChanged");
    expect(appSource).toContain("await secureSettingsWriteQueueRef.current");
    expect(appSource).toContain("await api.secureSettings!.getForSession()");
  });
});
