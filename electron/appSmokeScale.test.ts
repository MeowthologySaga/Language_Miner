import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appSmokeScaleFactors,
  parseAppSmokeScaleFactor,
  resolveQaDeviceScaleFactor
} from "./appSmokeScale";

const require = createRequire(import.meta.url);
const smokeRunner = require("../scripts/qa-app-smoke-electron.cjs") as {
  parseArgs: (
    argv: string[],
    env?: Record<string, string | undefined>
  ) => { scaleFactor: 1 | 1.25 | 1.5 };
};
const mainSource = readFileSync(join(process.cwd(), "electron", "main.ts"), "utf8");
const artifactSmokeSource = readFileSync(
  join(process.cwd(), "scripts", "release", "smoke-windows-artifacts.ps1"),
  "utf8"
);

describe("app smoke scale factor", () => {
  it("accepts only the three Windows release scale targets", () => {
    expect(appSmokeScaleFactors).toEqual([1, 1.25, 1.5]);
    expect(parseAppSmokeScaleFactor("1")).toBe(1);
    expect(parseAppSmokeScaleFactor(" 1.25 ")).toBe(1.25);
    expect(parseAppSmokeScaleFactor("1.5")).toBe(1.5);
    expect(parseAppSmokeScaleFactor(undefined)).toBeNull();
    expect(parseAppSmokeScaleFactor("1.0")).toBeNull();
    expect(parseAppSmokeScaleFactor("0")).toBeNull();
    expect(parseAppSmokeScaleFactor("2")).toBeNull();
  });

  it("never applies a scale override outside app smoke QA", () => {
    expect(resolveQaDeviceScaleFactor({})).toBeNull();
    expect(
      resolveQaDeviceScaleFactor({ LM_QA_DEVICE_SCALE_FACTOR: "invalid" })
    ).toBeNull();
    expect(mainSource).toContain("resolveQaDeviceScaleFactor(process.env)");
    expect(mainSource).toContain(
      'app.commandLine.appendSwitch("force-device-scale-factor", String(scaleFactor))'
    );
    expect(mainSource.indexOf("configureQaDeviceScaleFactor();")).toBeLessThan(
      mainSource.indexOf("app.whenReady()")
    );
  });

  it("defaults app smoke QA to 100% and rejects invalid direct-launch values", () => {
    expect(resolveQaDeviceScaleFactor({ LM_QA_APP_SMOKE: "1" })).toBe(1);
    expect(
      resolveQaDeviceScaleFactor({
        LM_QA_APP_SMOKE: "1",
        LM_QA_DEVICE_SCALE_FACTOR: "1.5"
      })
    ).toBe(1.5);
    expect(() =>
      resolveQaDeviceScaleFactor({
        LM_QA_APP_SMOKE: "1",
        LM_QA_DEVICE_SCALE_FACTOR: "1.1"
      })
    ).toThrow(/invalid LM_QA_DEVICE_SCALE_FACTOR/i);
  });

  it("supports environment input with CLI taking precedence", () => {
    expect(smokeRunner.parseArgs([], {}).scaleFactor).toBe(1);
    expect(
      smokeRunner.parseArgs([], { LM_QA_DEVICE_SCALE_FACTOR: "1.25" }).scaleFactor
    ).toBe(1.25);
    expect(
      smokeRunner.parseArgs(["--scale", "1.5"], {
        LM_QA_DEVICE_SCALE_FACTOR: "1.25"
      }).scaleFactor
    ).toBe(1.5);
  });

  it("fails before launch for missing and unsupported CLI or environment values", () => {
    expect(() => smokeRunner.parseArgs(["--scale"], {})).toThrow(
      /requires 1, 1.25, or 1.5/i
    );
    expect(() => smokeRunner.parseArgs(["--scale", "1.1"], {})).toThrow(
      /invalid app smoke scale factor/i
    );
    expect(() =>
      smokeRunner.parseArgs([], { LM_QA_DEVICE_SCALE_FACTOR: "" })
    ).toThrow(/invalid app smoke scale factor/i);
  });

  it("passes locale and scale through the packaged Windows artifact matrix", () => {
    expect(artifactSmokeSource).toContain("LM_QA_APP_LOCALE = $Locale");
    expect(artifactSmokeSource).toContain("LM_QA_DEVICE_SCALE_FACTOR = $ScaleFactor");
    expect(artifactSmokeSource).toContain("$report.locale -ne $Locale");
    expect(artifactSmokeSource).toContain("$report.scaleEvidence.matches -ne $true");
    expect(artifactSmokeSource).toContain("$report.scaleEvidence.rendererDevicePixelRatio");
    expect(artifactSmokeSource).not.toContain('"--force-device-scale-factor=$ScaleFactor"');
  });

  it("isolates packaged smoke data from the maintainer's real AppData", () => {
    expect(artifactSmokeSource).toContain('Join-Path $workRoot "isolated-appdata"');
    expect(artifactSmokeSource).toContain('Join-Path $workRoot "isolated-localappdata"');
    expect(artifactSmokeSource).toContain("APPDATA = $appDataRoot");
    expect(artifactSmokeSource).toContain("LOCALAPPDATA = $localAppDataRoot");
    expect(artifactSmokeSource).toContain(
      "$script:StableQaUserDataRoot = $upgradeUserDataRoot"
    );
    expect(artifactSmokeSource).toContain(
      "$script:StableQaUserDataRoot = $cleanUserDataRoot"
    );
    expect(artifactSmokeSource).toContain(
      "LM_QA_USER_DATA_DIR = $effectiveUserDataDirectory"
    );
    expect(artifactSmokeSource).not.toContain("GetFullPath($env:APPDATA)");
  });
});
