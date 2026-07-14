import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const runtimePageSource = readFileSync(
  join(process.cwd(), "src", "pages", "PlayZoneRuntimePage.tsx"),
  "utf8"
);

describe("PlayZoneRuntimePage source boundaries", () => {
  it("uses only manifest-declared wallet actions and a restrictive iframe sandbox", () => {
    expect(runtimePageSource).toContain(
      'sandbox="allow-scripts allow-pointer-lock allow-top-navigation-to-custom-protocols"'
    );
    expect(runtimePageSource).not.toContain("allow-popups");
    expect(runtimePageSource).not.toContain("allow-modals");
    expect(runtimePageSource).not.toContain('sandbox="allow-scripts allow-pointer-lock allow-top-navigation"');
    expect(runtimePageSource).toContain("action_not_allowed");
    expect(runtimePageSource).toContain('permissionDenied("walletSpend", input.text)');
    expect(runtimePageSource).toContain('permissionDenied("storage", input.text)');
    expect(runtimePageSource).toContain("readRuntimePermissions");
    expect(runtimePageSource).not.toContain("export async function legacySpendHostDiamonds");
    expect(runtimePageSource).not.toContain("window.confirm");
    expect(runtimePageSource).toContain("requestConfirmation");
    expect(runtimePageSource).toContain("spendInflightRef");
    expect(runtimePageSource).toContain("input.spendInflight.get(idempotencyKey)");
    const lookupIndex = runtimePageSource.indexOf("wallet?.lookupSpend?.(spendRequest)");
    const confirmationIndex = runtimePageSource.indexOf("input.requestConfirmation({", lookupIndex);
    expect(lookupIndex).toBeGreaterThan(-1);
    expect(confirmationIndex).toBeGreaterThan(lookupIndex);
    expect(runtimePageSource).toContain('<h1 className="sr-only">{payload.title}</h1>');
    expect(runtimePageSource).toContain("PLAY_ZONE_FRAME_LOAD_TIMEOUT_MS");
    expect(runtimePageSource).toContain('frameLoadState === "error"');
  });

  it("keeps wallet balance updates from changing the cartridge iframe URL", () => {
    expect(runtimePageSource).toContain(
      "const initialWalletBalance = useMemo(() => readInitialWalletBalance(), []);"
    );
    expect(runtimePageSource).toContain(
      "initialWalletBalance,\n      frameRetryNonce"
    );
    expect(runtimePageSource).toContain(
      "}, [frameRetryNonce, initialWalletBalance, payload.cartridgeId, payload.entryUrl]);"
    );
    expect(runtimePageSource).not.toContain(
      "return createCartridgeFrameUrl(payload.entryUrl, payload.cartridgeId, walletBalance);"
    );
    expect(runtimePageSource).not.toContain(
      "}, [payload.cartridgeId, payload.entryUrl, walletBalance]);"
    );
  });

  it("uses the host-provided app locale inside the isolated runtime partition", () => {
    expect(runtimePageSource).toContain("const runtimeAppLocale = useMemo(readRuntimeAppLocale, []);");
    expect(runtimePageSource).toContain("i18n.changeLanguage(runtimeAppLocale)");
    expect(runtimePageSource).toContain('get("appLocale") === "en" ? "en" : "ko"');
  });
});
