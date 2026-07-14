import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "scripts", "release", "package-extension.cjs"),
  "utf8"
);

describe("extension release package boundaries", () => {
  it("packages and validates the local Chrome message catalogs", () => {
    expect(source).toContain('path.join(extensionRoot, "_locales")');
    expect(source).toContain("validateLocaleCatalogs(files, manifest)");
    expect(source).toContain('new Set([defaultLocale, "en", "ko"])');
    expect(source).toContain("Extension locale catalog keys differ");
    expect(source).toContain("Manifest localization reference is invalid or missing");
  });
});
