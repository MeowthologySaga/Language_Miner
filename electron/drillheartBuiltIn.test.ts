import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getOfficialPlayZonePack } from "./playZoneOfficialCatalog";

const packRoot = path.join(process.cwd(), "cartridges", "drillheart-defense");
const hasOfficialSource = fs.existsSync(path.join(packRoot, "manifest.json"));
const sourceIt = hasOfficialSource ? it : it.skip;

describe("Drillheart official on-demand economy", () => {
  it("publishes the three declared diamond actions in the official catalog", () => {
    expect(getOfficialPlayZonePack("meowthology.drillheart-defense")?.diamondActions.map(
      (action) => action.id
    ).sort()).toEqual(["appraisal-reroll", "pet-summon-1", "revive-once"]);
  });

  sourceIt("uses the current Host API without a free mock-wallet fallback", () => {
    const gameSource = fs.readFileSync(path.join(packRoot, "game", "src", "game.js"), "utf8");
    expect(gameSource).toContain("window.LEM_GAME_HOST_API");
    expect(gameSource).toContain("this.host.wallet.spend");
    expect(gameSource).toContain("return { balance: 0, code: \"host-unavailable\" }");
    expect(gameSource).not.toContain("mock: true");
  });

  sourceIt("persists purchase intent before spend and commits bounded receipts", () => {
    const gameSource = fs.readFileSync(path.join(packRoot, "game", "src", "game.js"), "utf8");
    expect(gameSource).toContain("pendingPremiumPurchases[intent.idempotencyKey] = intent");
    expect(gameSource.indexOf("pendingPremiumPurchases[intent.idempotencyKey] = intent"))
      .toBeLessThan(gameSource.indexOf("return settlePremiumPurchase(intent)"));
    expect(gameSource).toContain("existingIntent");
    expect(gameSource).toContain("return settlePremiumPurchase(existingIntent)");
    expect(gameSource).toContain("premiumPurchaseReceipts");
    expect(gameSource).toContain("PREMIUM_PURCHASE_RECEIPT_LIMIT");
    expect(gameSource).toContain("recoverPendingPremiumPurchases");
    expect(gameSource).toContain("pendingPremiumPurchases: { ...(saveData.pendingPremiumPurchases || {}) }");
    expect(gameSource).toContain("saveData.pendingPremiumPurchases = snapshot.pendingPremiumPurchases");
    expect(gameSource).toContain("구매 요청을 안전하게 저장하지 못해 다이아를 사용하지 않았습니다.");
  });

  sourceIt("keeps runtime action ids in parity with the manifest", () => {
    const gameSource = fs.readFileSync(path.join(packRoot, "game", "src", "game.js"), "utf8");
    const manifest = JSON.parse(fs.readFileSync(path.join(packRoot, "manifest.json"), "utf8"));
    const manifestActions = manifest.economy.diamondActions.map((action: { id: string }) => action.id).sort();
    expect(manifestActions).toEqual(["appraisal-reroll", "pet-summon-1", "revive-once"]);
    for (const actionId of manifestActions) {
      expect(gameSource).toContain(`"${actionId}"`);
    }
  });
});
