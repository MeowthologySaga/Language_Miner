import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { appSmokeLocales, parseAppSmokeLocale } from "./appSmokeLocale";

const require = createRequire(import.meta.url);
const smokeRunner = require("../scripts/qa-app-smoke-electron.cjs") as {
  parseArgs: (
    argv: string[],
    env?: Record<string, string | undefined>
  ) => { locale: "ko" | "en" };
};

describe("parseAppSmokeLocale", () => {
  it("accepts every release UI locale", () => {
    expect(appSmokeLocales).toEqual(["ko", "en"]);
    expect(parseAppSmokeLocale("ko")).toBe("ko");
    expect(parseAppSmokeLocale(" en ")).toBe("en");
  });

  it("rejects missing, regional, and unsupported locale values", () => {
    expect(parseAppSmokeLocale(undefined)).toBeNull();
    expect(parseAppSmokeLocale("")).toBeNull();
    expect(parseAppSmokeLocale("ko-KR")).toBeNull();
    expect(parseAppSmokeLocale("EN")).toBeNull();
    expect(parseAppSmokeLocale("ja")).toBeNull();
  });
});

describe("app smoke CLI locale", () => {
  it("uses ko by default and accepts either the environment or CLI", () => {
    expect(smokeRunner.parseArgs([], {}).locale).toBe("ko");
    expect(smokeRunner.parseArgs([], { LM_QA_APP_LOCALE: "en" }).locale).toBe("en");
    expect(
      smokeRunner.parseArgs(["--locale", "ko"], { LM_QA_APP_LOCALE: "en" }).locale
    ).toBe("ko");
  });

  it("fails fast for missing or unsupported locale values", () => {
    expect(() => smokeRunner.parseArgs(["--locale"], {})).toThrow(/requires either ko or en/i);
    expect(() => smokeRunner.parseArgs(["--locale", "ja"], {})).toThrow(
      /invalid app smoke locale/i
    );
    expect(() => smokeRunner.parseArgs([], { LM_QA_APP_LOCALE: "ko-KR" })).toThrow(
      /invalid app smoke locale/i
    );
    expect(() => smokeRunner.parseArgs([], { LM_QA_APP_LOCALE: "" })).toThrow(
      /invalid app smoke locale/i
    );
  });
});
