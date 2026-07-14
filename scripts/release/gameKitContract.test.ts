import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { inspectPlayZonePack } from "../../electron/playZoneManifest";

const root = process.cwd();
const read = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");

type GameManifest = Record<string, any> & {
  integrity: { files: Record<string, string> };
};

function readManifestExample(relativePath: string): GameManifest {
  const blocks = read(relativePath).matchAll(/```json\s*([\s\S]*?)```/g);
  for (const block of blocks) {
    const parsed = JSON.parse(block[1]) as GameManifest;
    if (parsed.contentType === "game_pack") return parsed;
  }
  throw new Error(`No complete game_pack manifest example found in ${relativePath}.`);
}

function expectManifestReady(manifestInput: GameManifest, sourceLabel: string) {
  const manifest = JSON.parse(JSON.stringify(manifestInput)) as GameManifest;
  const packRoot = mkdtempSync(join(tmpdir(), "language-miner-gamekit-"));
  try {
    for (const relativePath of Object.keys(manifest.integrity.files)) {
      const absolutePath = join(packRoot, ...relativePath.split("/"));
      const contents = Buffer.from(`validator fixture for ${relativePath}\n`, "utf8");
      mkdirSync(dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, contents);
      manifest.integrity.files[relativePath] = createHash("sha256")
        .update(contents)
        .digest("hex");
    }
    writeFileSync(
      join(packRoot, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    );

    const inspection = inspectPlayZonePack(packRoot, {
      appVersion: "0.1.0-beta.1"
    });
    expect(inspection.securityReport.issues, sourceLabel).toEqual([]);
    expect(inspection.securityReport.status, sourceLabel).toBe("ready");
  } finally {
    rmSync(packRoot, { force: true, recursive: true });
  }
}

describe("public GameKit contract", () => {
  it("ships a validator-compatible manifest template", () => {
    const manifest = JSON.parse(
      read("gamekit/templates/manifest.example.json")
    ) as Record<string, any>;

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      contentType: "game_pack",
      minPlayZoneVersion: "0.1.0-beta.1",
      entry: { type: "html", path: "game/index.html" },
      permissions: {
        walletSpend: true,
        storage: true,
        network: false,
        externalLinks: false,
        cardRead: false
      }
    });
    expect(Object.keys(manifest.permissions).sort()).toEqual(
      ["cardRead", "externalLinks", "network", "storage", "walletSpend"].sort()
    );
    expect(manifest.license).toBeTruthy();
    expect(manifest.sourceUrl).toMatch(/^https:\/\//);
    expect(manifest.lineageId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(Object.keys(manifest.integrity.files).length).toBeGreaterThan(0);
    for (const digest of Object.values(manifest.integrity.files)) {
      expect(digest).toMatch(/^[0-9a-f]{64}$/i);
    }
    expectManifestReady(manifest as GameManifest, "gamekit manifest template");
  });

  it("keeps every public complete manifest example validator-ready", () => {
    const publicExamples = [
      "gamekit/07_MANIFEST_SCHEMA.md",
      "docs/ugc/playzone-current-runtime-contract.md",
      "docs/creator-guide.ko.md",
      "docs/creator-guide.en.md"
    ];

    for (const relativePath of publicExamples) {
      const manifest = readManifestExample(relativePath);
      expect(manifest.thumbnail, relativePath).toBeTruthy();
      expect(manifest.metadata, relativePath).toBeUndefined();
      expect(Object.keys(manifest.save ?? {}), relativePath).toEqual(["schemaVersion"]);
      for (const action of manifest.economy?.diamondActions ?? []) {
        expect(action.requiresConfirm, relativePath).toBeUndefined();
      }
      expectManifestReady(manifest, relativePath);
    }
  });

  it("teaches the current Host API instead of the retired draft API", () => {
    const currentGuides = [
      "gamekit/00_START_HERE.md",
      "gamekit/03_DIAMOND_ECONOMY_RULES.md",
      "gamekit/05_RUNTIME_SECURITY_RULES.md",
      "gamekit/templates/AI_PROMPT_TEMPLATE.md"
    ].map(read).join("\n");

    expect(currentGuides).toContain("window.LEM_GAME_HOST_API");
    expect(currentGuides).not.toMatch(/window\.LanguageMiner/);
    expect(currentGuides).not.toMatch(/LanguageMiner\.(?:saveGame|loadGame|requestSpendDiamonds)/);
    expect(currentGuides).toContain("wallet.spend({");
    expect(currentGuides).toContain("idempotencyKey");
  });

  it("states that unsupported permissions are denied and only ready packs run", () => {
    const security = read("gamekit/05_RUNTIME_SECURITY_RULES.md");
    const packageSpec = read("gamekit/04_LEM_PACKAGE_SPEC.md");

    expect(security).toContain("`network`, `externalLinks`, `cardRead`");
    expect(security).toContain("`true`로 선언하면 팩이 차단");
    expect(packageSpec).toContain("`ready`");
    expect(packageSpec).toContain("오류나 경고가 하나라도 남으면");
  });

  it("documents the actual Host failure, storage, diamond, and thumbnail contract", () => {
    const contract = read("docs/ugc/playzone-current-runtime-contract.md");
    const security = read("gamekit/05_RUNTIME_SECURITY_RULES.md");
    const koGuide = read("docs/creator-guide.ko.md");
    const enGuide = read("docs/creator-guide.en.md");

    expect(contract).toContain("type HostFailure");
    expect(contract).toContain("5 MiB");
    expect(contract).toContain("256 MiB");
    expect(contract).toContain("최대 64개 action");
    expect(contract).toContain("top-level `thumbnail`");
    expect(contract).not.toContain("save.diamondsSeen");
    expect(security).not.toContain('host.ui.toast("Saved")');
    expect(security).toContain("화면 표시를 보장하지 않는");
    expect(koGuide).toContain("괄호 없는 `AND`/`OR`/`WITH`");
    expect(enGuide).toContain("parenthesis-free `AND`, `OR`, or `WITH`");
  });
});
