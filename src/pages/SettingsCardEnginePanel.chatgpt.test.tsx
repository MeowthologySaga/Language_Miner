import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import i18n from "../i18n";
import { defaultSettings } from "../appSettings";
import { SettingsCardEnginePanel } from "./SettingsCardEnginePanel";

describe("SettingsCardEnginePanel ChatGPT Web option", () => {
  afterEach(async () => {
    await i18n.changeLanguage("ko");
  });

  it("explains the manual no-API workflow in English", async () => {
    await i18n.changeLanguage("en");
    const html = renderToStaticMarkup(
      <SettingsCardEnginePanel
        className="panel"
        connectionStatus=""
        isTestingConnection={false}
        settings={{ ...defaultSettings, providerName: "chatgptWeb" }}
        onSettingsChange={() => undefined}
        onTestConnection={() => undefined}
      />
    );

    expect(html).toContain("ChatGPT Web");
    expect(html).toContain("copy and paste");
    expect(html).toContain("no API key or separate API billing");
    expect(html).toContain('aria-pressed="true"');
  });
});
