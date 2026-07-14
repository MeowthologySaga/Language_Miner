import { describe, expect, it } from "vitest";
import { sanitizeSecretStatusMessage, sanitizeSettingsStatusMessage } from "./settingsStatus";

describe("settings status sanitization", () => {
  const settings = {
    geminiApiKey: "gemini-configured-secret-123456",
    googleTranslateApiKey: "google-configured-secret-123456"
  };

  it("redacts configured API key values wherever they appear", () => {
    const message =
      "Gemini failed with gemini-configured-secret-123456 and Google failed with google-configured-secret-123456.";

    const sanitized = sanitizeSettingsStatusMessage(message, settings);

    expect(sanitized).toContain("[secret redacted]");
    expect(sanitized).not.toContain(settings.geminiApiKey);
    expect(sanitized).not.toContain(settings.googleTranslateApiKey);
  });

  it("redacts common provider key patterns even when they are not saved settings", () => {
    const googleKey = `AI${"za"}SyAReallyLongGoogleKey_123456`;
    const openAiKey = `sk-${"live"}_secret_123456789`;
    const oauthToken = `ya29.${"oauth"}_token_123456789`;
    const githubToken = `gh${"p"}_githubSecret123456789`;
    const message =
      `keys: ${googleKey} ${openAiKey} ${oauthToken} ${githubToken}`;

    const sanitized = sanitizeSettingsStatusMessage(message, settings);

    expect(sanitized).not.toContain(googleKey);
    expect(sanitized).not.toContain(openAiKey);
    expect(sanitized).not.toContain(oauthToken);
    expect(sanitized).not.toContain(githubToken);
    expect(sanitized.match(/\[API key redacted\]/g)?.length).toBe(4);
  });

  it("redacts token assignment patterns without removing the field name", () => {
    const sanitized = sanitizeSettingsStatusMessage(
      "request failed: access_token=verySensitiveToken123456 password:superSensitivePassword123",
      settings
    );

    expect(sanitized).toContain("access_token=[secret redacted]");
    expect(sanitized).toContain("password=[secret redacted]");
    expect(sanitized).not.toContain("verySensitiveToken");
    expect(sanitized).not.toContain("superSensitivePassword");
    expect(sanitized).not.toContain("[REDACTED] redacted]");
  });

  it("keeps configured and patterned assignment redactions stable across both sanitizers", () => {
    const googleKey = `AI${"za"}SyAReallyLongGoogleKey_123456`;
    const sanitized = sanitizeSettingsStatusMessage(
      `api_key=${googleKey} secret=${settings.geminiApiKey}`,
      settings
    );

    expect(sanitized).toContain("api_key=[API key redacted]");
    expect(sanitized).toContain("secret=[secret redacted]");
    expect(sanitized).not.toContain(googleKey);
    expect(sanitized).not.toContain(settings.geminiApiKey);
    expect(sanitized).not.toContain("[REDACTED] redacted]");
  });

  it("does not redact short ordinary words from settings", () => {
    const sanitized = sanitizeSettingsStatusMessage("mock provider selected", {
      geminiApiKey: "mock",
      googleTranslateApiKey: ""
    });

    expect(sanitized).toBe("mock provider selected");
  });

  it("redacts ad hoc UI secrets such as Google Drive client secrets", () => {
    const clientSecret = `drive-client-${"secret"}-123456789`;
    const sanitized = sanitizeSecretStatusMessage(
      `Google OAuth failed for client_secret=${clientSecret}`,
      [clientSecret]
    );

    expect(sanitized).toContain("client_secret=[secret redacted]");
    expect(sanitized).not.toContain(clientSecret);
  });
});
