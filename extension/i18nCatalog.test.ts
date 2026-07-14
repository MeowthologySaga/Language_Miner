import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type ChromeMessage = {
  message: string;
  placeholders?: Record<string, { content: string }>;
};

const extensionRoot = path.join(process.cwd(), "extension");

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(extensionRoot, relativePath), "utf8")) as T;
}

function readCatalog(locale: "en" | "ko") {
  return readJson<Record<string, ChromeMessage>>(`_locales/${locale}/messages.json`);
}

function referencedPlaceholders(message: string) {
  return Array.from(message.matchAll(/\$([A-Za-z][A-Za-z0-9_]*)\$/g), (match) =>
    match[1].toLowerCase()
  ).sort();
}

describe("Chrome extension i18n catalogs", () => {
  it("keeps Korean and English keys and placeholders in parity", () => {
    const en = readCatalog("en");
    const ko = readCatalog("ko");
    expect(Object.keys(ko).sort()).toEqual(Object.keys(en).sort());

    for (const [key, englishEntry] of Object.entries(en)) {
      const koreanEntry = ko[key];
      expect(englishEntry.message.trim(), `${key} English message`).not.toBe("");
      expect(koreanEntry.message.trim(), `${key} Korean message`).not.toBe("");
      expect(Object.keys(koreanEntry.placeholders || {}).sort(), `${key} placeholder keys`).toEqual(
        Object.keys(englishEntry.placeholders || {}).sort()
      );
      for (const entry of [englishEntry, koreanEntry]) {
        expect(referencedPlaceholders(entry.message), `${key} placeholder references`).toEqual(
          Object.keys(entry.placeholders || {}).sort()
        );
        for (const placeholder of Object.values(entry.placeholders || {})) {
          expect(placeholder.content).toMatch(/^\$[1-9]$/);
        }
      }
    }
  });

  it("localizes every manifest message reference and declares a default locale", () => {
    const manifest = readJson<Record<string, unknown>>("manifest.json");
    const en = readCatalog("en");
    const serialized = JSON.stringify(manifest);
    const references = Array.from(serialized.matchAll(/__MSG_([A-Za-z0-9_@]+)__/g), (match) => match[1]);

    expect(manifest.default_locale).toBe("en");
    expect(manifest.name).toBe("__MSG_extensionName__");
    expect(manifest.short_name).toBe("__MSG_extensionShortName__");
    expect(manifest.description).toBe("__MSG_extensionDescription__");
    expect(references.length).toBeGreaterThan(0);
    expect(references.every((key) => key in en)).toBe(true);
  });

  it("uses a safe fallback when chrome.i18n is unavailable", () => {
    const source = fs.readFileSync(path.join(extensionRoot, "src/shared/i18n.js"), "utf8");
    const fakeGlobal: Record<string, unknown> = {};
    new Function("globalThis", source)(fakeGlobal);
    const api = fakeGlobal.LanguageMinerExtensionI18n as {
      getLocale: () => string;
      localizeDocument: (root?: unknown) => void;
      t: (key: string, fallback?: string, substitutions?: string[]) => string;
    };

    expect(api.t("missingKey", "Fallback $1", ["value"])).toBe("Fallback value");
    expect(api.t("missingKey")).toBe("missingKey");
    expect(api.getLocale()).toBe("en");
    expect(() => api.localizeDocument(undefined)).not.toThrow();

    const textElement = {
      textContent: "Readable fallback",
      getAttribute: (name: string) => (name === "data-i18n" ? "missingKey" : null)
    };
    const documentElement = { lang: "" };
    api.localizeDocument({
      documentElement,
      querySelectorAll: (selector: string) => (selector === "[data-i18n]" ? [textElement] : [])
    });
    expect(textElement.textContent).toBe("Readable fallback");
    expect(documentElement.lang).toBe("en");
  });

  it("prefers Chrome messages and the Chrome UI locale when available", () => {
    const source = fs.readFileSync(path.join(extensionRoot, "src/shared/i18n.js"), "utf8");
    const fakeGlobal = {
      chrome: {
        i18n: {
          getMessage: (key: string, values: string[]) =>
            key === "hello" ? `Chrome ${values[0]}` : "",
          getUILanguage: () => "ko-KR"
        }
      }
    } as Record<string, unknown>;
    new Function("globalThis", source)(fakeGlobal);
    const api = fakeGlobal.LanguageMinerExtensionI18n as {
      getLocale: () => string;
      t: (key: string, fallback?: string, substitutions?: string[]) => string;
    };

    expect(api.t("hello", "Fallback $1", ["message"])).toBe("Chrome message");
    expect(api.getLocale()).toBe("ko-KR");
  });
});
