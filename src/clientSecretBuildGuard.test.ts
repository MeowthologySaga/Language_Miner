import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

type ClientSecretGuard = {
  assertNoClientSecretEnv(environment: Record<string, string | undefined>): void;
  findClientSecretEnvNames(environment: Record<string, string | undefined>): string[];
};

const require = createRequire(import.meta.url);
const guard = require("../scripts/client-secret-guard.cjs") as ClientSecretGuard;

describe("client secret production build guard", () => {
  it("rejects non-empty client-exposed credentials without printing their values", () => {
    const canary = "client-secret-canary-never-print-this";
    const viteGeminiKey = ["VITE", "GEMINI", "API", "KEY"].join("_");
    const viteServiceToken = ["VITE", "SERVICE", "TOKEN"].join("_");

    expect(() =>
      guard.assertNoClientSecretEnv({
        [viteGeminiKey]: canary,
        [viteServiceToken]: "token-canary"
      })
    ).toThrowError(new RegExp(`${viteGeminiKey}, ${viteServiceToken}`));

    try {
      guard.assertNoClientSecretEnv({ [viteGeminiKey]: canary });
    } catch (error) {
      expect(String(error)).not.toContain(canary);
    }
  });

  it("allows non-secret renderer configuration and empty legacy variables", () => {
    const viteGeminiKey = ["VITE", "GEMINI", "API", "KEY"].join("_");
    expect(
      guard.findClientSecretEnvNames({
        VITE_GEMINI_MODEL: "gemini-2.5-flash-lite",
        VITE_LM_WEB_PROVIDER: "mock",
        [viteGeminiKey]: ""
      })
    ).toEqual([]);
  });

  it("does not block server-only environment variables that Vite cannot expose", () => {
    expect(
      guard.findClientSecretEnvNames({
        GEMINI_API_KEY: "server-only",
        GITHUB_TOKEN: "ci-token"
      })
    ).toEqual([]);
  });
});
