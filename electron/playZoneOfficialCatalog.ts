import type {
  PlayZoneDiamondAction,
  PlayZoneLibraryEntry,
  PlayZoneOfficialDownloadInfo,
  PlayZonePermissions
} from "../src/shared/types";
import { isRetiredPlayZonePackId } from "../src/shared/playZoneRetiredPacks";
import { listInstalledPlayZoneSnapshots, removePlayZoneSnapshot } from "./playZoneSnapshotStore";

export type OfficialPlayZonePackDefinition = {
  id: string;
  version: string;
  title: string;
  creator: string;
  summary: string;
  category: string;
  tags: string[];
  lineageId: string;
  minPlayZoneVersion: string;
  saveSchemaVersion: string;
  releaseNotes: string;
  license: string;
  sourceUrl: string;
  fileName: string;
  permissions: PlayZonePermissions;
  diamondActions: PlayZoneDiamondAction[];
  download: PlayZoneOfficialDownloadInfo;
};

const commonPermissions: PlayZonePermissions = {
  walletSpend: true,
  storage: true,
  network: false,
  externalLinks: false,
  cardRead: false
};

export const OFFICIAL_PLAY_ZONE_PACKS: readonly OfficialPlayZonePackDefinition[] = [
  {
    id: "meowthology.abyss-summoner",
    version: "0.1.2",
    title: "심연의 무명소환사",
    creator: "MeowthologySaga",
    summary: "자동전투, 강화, 소환과 환생으로 성장하는 다크 판타지 방치형 RPG입니다.",
    category: "idle-rpg",
    tags: ["official", "idle-rpg", "summon", "dark-fantasy", "growth"],
    lineageId: "0d81385e-9c3c-4aba-b379-14c2de4c7b08",
    minPlayZoneVersion: "0.1.0-beta.1",
    saveSchemaVersion: "2",
    releaseNotes: "Language Miner 공식 제공 게임팩입니다.",
    license: "GPL-3.0-only AND LicenseRef-Meowthology-Official-Builtin",
    sourceUrl: "https://github.com/MeowthologySaga/abyss-summoner",
    fileName: "abyss-summoner-0.1.2.lemgame",
    permissions: commonPermissions,
    diamondActions: [
      { id: "summon-hero-1", amount: 30, reason: "심연의 무명소환사 프리미엄 동료 1회 소환", requiresConfirm: true, repeatable: true },
      { id: "summon-hero-10", amount: 300, reason: "심연의 무명소환사 프리미엄 동료 10회 소환", requiresConfirm: true, repeatable: true },
      { id: "summon-gear-1", amount: 30, reason: "심연의 무명소환사 프리미엄 장비 1회 소환", requiresConfirm: true, repeatable: true },
      { id: "summon-gear-10", amount: 300, reason: "심연의 무명소환사 프리미엄 장비 10회 소환", requiresConfirm: true, repeatable: true },
      { id: "rush-offline-reward", amount: 50, reason: "심연의 무명소환사 방치 보상 3배 정산", requiresConfirm: true, repeatable: true },
      { id: "unlock-skin-abyss", amount: 100, reason: "심연의 무명소환사 스킨 해금", requiresConfirm: true, repeatable: false },
      { id: "unlock-skin-crimson", amount: 120, reason: "심연의 무명소환사 붉은 집행자 외형 해금", requiresConfirm: true, repeatable: false },
      { id: "unlock-skin-gilded", amount: 140, reason: "심연의 무명소환사 황금 세금관 외형 해금", requiresConfirm: true, repeatable: false },
      { id: "unlock-skin-eclipse", amount: 160, reason: "심연의 무명소환사 일식 순례자 외형 해금", requiresConfirm: true, repeatable: false },
      { id: "unlock-skin-soul", amount: 180, reason: "심연의 무명소환사 영혼 등불지기 외형 해금", requiresConfirm: true, repeatable: false },
      { id: "upgrade-void-brand", amount: 120, reason: "심연의 무명소환사 공허 각인 특수능력 강화", requiresConfirm: true, repeatable: true },
      { id: "upgrade-quick-ritual", amount: 90, reason: "심연의 무명소환사 가속 의식 특수능력 강화", requiresConfirm: true, repeatable: true },
      { id: "upgrade-gold-oath", amount: 80, reason: "심연의 무명소환사 황금 서약 특수능력 강화", requiresConfirm: true, repeatable: true },
      { id: "upgrade-soul-compass", amount: 100, reason: "심연의 무명소환사 영혼 나침반 특수능력 강화", requiresConfirm: true, repeatable: true },
      { id: "buy-battle-catalyst", amount: 50, reason: "심연의 무명소환사 전투 촉매 구매", requiresConfirm: true, repeatable: true },
      { id: "buy-gold-seal", amount: 40, reason: "심연의 무명소환사 금고 봉인서 구매", requiresConfirm: true, repeatable: true },
      { id: "buy-soul-candle", amount: 80, reason: "심연의 무명소환사 영혼 촛불 구매", requiresConfirm: true, repeatable: true }
    ],
    download: {
      assetUrl: "https://github.com/MeowthologySaga/abyss-summoner/releases/download/v0.1.2/abyss-summoner-0.1.2.lemgame",
      archiveSha256: "04d9694da80d5d42817f3d32c007a89faf4a5d7a35ed0bdb6df4dffc3b82c156",
      packSha256: "0bde7bec159d2675d6ed4a4214f96276c9066934ced725b0ddde4e69dc45c819",
      downloadBytes: 59_780_734
    }
  },
  {
    id: "meowthology.cat-odyssey",
    version: "0.1.1",
    title: "고양이 오디세이",
    creator: "MeowthologySaga",
    summary: "고양이 영웅을 당겨 쏘고 벽과 괴수 부위에 연쇄 반사하는 2D 리코셰 액션 RPG입니다.",
    category: "action-rpg",
    tags: ["official", "action", "ricochet", "rpg", "collector", "boss-hunt"],
    lineageId: "adb6ec88-2557-4fb2-857a-76e5c057f998",
    minPlayZoneVersion: "0.1.0-beta.1",
    saveSchemaVersion: "1",
    releaseNotes: "전체 항로·컷신·오디오를 포함한 Language Miner 공식 제공 게임팩입니다.",
    license: "MIT AND LicenseRef-Meowthology-Official-Builtin AND LicenseRef-Cat-Odyssey-ElevenLabs-NC-1.0",
    sourceUrl: "https://github.com/MeowthologySaga/Cat_Odyssey",
    fileName: "cat-odyssey-0.1.1.lemgame",
    permissions: commonPermissions,
    diamondActions: [
      { id: "oracle-summon-1", amount: 100, reason: "고양이 오디세이 신탁 소환 1회", requiresConfirm: true, repeatable: true },
      { id: "oracle-summon-10", amount: 900, reason: "고양이 오디세이 신탁 소환 10회", requiresConfirm: true, repeatable: true },
      { id: "battle-rescue", amount: 60, reason: "고양이 오디세이 구조 요청", requiresConfirm: true, repeatable: true },
      { id: "blessing-reroll", amount: 30, reason: "고양이 오디세이 가호 재선택", requiresConfirm: true, repeatable: true },
      { id: "storm-extra-run", amount: 40, reason: "고양이 오디세이 폭풍 항로 추가 출항", requiresConfirm: true, repeatable: true },
      { id: "raid-extra-key", amount: 50, reason: "고양이 오디세이 토벌 열쇠 보충", requiresConfirm: true, repeatable: true },
      { id: "awakening-materials", amount: 120, reason: "고양이 오디세이 각성 재료 보충", requiresConfirm: true, repeatable: true },
      { id: "vault-expansion", amount: 180, reason: "고양이 오디세이 보물고 확장", requiresConfirm: true, repeatable: false }
    ],
    download: {
      assetUrl: "https://github.com/MeowthologySaga/Cat_Odyssey/releases/download/v0.1.1/cat-odyssey-0.1.1.lemgame",
      archiveSha256: "a755ee3c74fe6f4d945969faf58b94f19ab4ab7f645ccf0ba7cab14686bbd5b3",
      packSha256: "6a5cbfa685061777f05ab17754e65e3bac19554387e810250ceb6bcc8a3ab0ad",
      downloadBytes: 99_372_443
    }
  },
  {
    id: "meowthology.drillheart-defense",
    version: "0.2.0",
    title: "드릴하트 디펜스",
    creator: "MeowthologySaga",
    summary: "광맥을 캐고 방벽과 터렛을 건설해 시추기를 지키는 탑뷰 액션 디펜스 게임입니다.",
    category: "action-defense",
    tags: ["official", "action", "defense", "survival", "mining"],
    lineageId: "5c7ff5c8-a181-4a54-a8d7-1fb45f444ca6",
    minPlayZoneVersion: "0.1.0-beta.1",
    saveSchemaVersion: "2",
    releaseNotes: "Host 저장과 복구형 다이아 기능을 포함한 Language Miner 공식 제공 게임팩입니다.",
    license: "GPL-3.0-only AND LicenseRef-Meowthology-Official-Builtin",
    sourceUrl: "https://github.com/MeowthologySaga/Drillheart_Defense",
    fileName: "drillheart-defense-0.2.0.lemgame",
    permissions: commonPermissions,
    diamondActions: [
      { id: "revive-once", amount: 30, reason: "드릴하트 디펜스 즉시 부활", requiresConfirm: true, repeatable: true },
      { id: "appraisal-reroll", amount: 20, reason: "드릴하트 디펜스 장비 재감정권", requiresConfirm: true, repeatable: true },
      { id: "pet-summon-1", amount: 100, reason: "드릴하트 디펜스 펫 뽑기 1회", requiresConfirm: true, repeatable: true }
    ],
    download: {
      assetUrl: "https://github.com/MeowthologySaga/Drillheart_Defense/releases/download/v0.2.0/drillheart-defense-0.2.0.lemgame",
      archiveSha256: "820b9c7447c897976bc3fa6d787647f7a3f0dc07c8e6d91b1e5291c55d39d423",
      packSha256: "d927ec4e0c7d1da8b095afc175ba705167667877ccb874d89ffb0d6ccc409576",
      downloadBytes: 14_853_468
    }
  }
] as const;

export function getOfficialPlayZonePack(packId: string) {
  return OFFICIAL_PLAY_ZONE_PACKS.find((pack) => pack.id === packId) ?? null;
}

export function listPlayZonePacksWithOfficialCatalog(installedRootPath: string) {
  const installedEntries = migrateRetiredOfficialPlayZoneSnapshots(
    installedRootPath,
    listInstalledPlayZoneSnapshots(installedRootPath)
  );
  const remainingEntries = new Map(installedEntries.map((entry) => [entry.installationId ?? entry.sourcePath, entry]));
  const officialEntries = OFFICIAL_PLAY_ZONE_PACKS.map((pack) => {
    const installed = installedEntries.find((entry) => entry.id === pack.id);
    if (!installed) return createOfficialCatalogEntry(pack);
    if (installed.installationId) remainingEntries.delete(installed.installationId);
    else remainingEntries.delete(installed.sourcePath);
    const current = installed.securityReport?.packSha256 === pack.download.packSha256;
    return {
      ...installed,
      releaseNotes: pack.releaseNotes,
      bundled: true,
      officialDownload: pack.download,
      officialUpdateAvailable: !current,
      ...(current
        ? {
            status: "trusted_official" as const,
            securityReport: installed.securityReport
              ? { ...installed.securityReport, status: "trusted_official" as const }
              : installed.securityReport
          }
        : {})
    };
  });
  return [...officialEntries, ...remainingEntries.values()];
}

function createOfficialCatalogEntry(pack: OfficialPlayZonePackDefinition): PlayZoneLibraryEntry {
  const checkedAt = new Date().toISOString();
  return {
    id: pack.id,
    title: pack.title,
    creator: pack.creator,
    version: pack.version,
    lineageId: pack.lineageId,
    minPlayZoneVersion: pack.minPlayZoneVersion,
    saveSchemaVersion: pack.saveSchemaVersion,
    releaseNotes: pack.releaseNotes,
    summary: pack.summary,
    tags: pack.tags,
    category: pack.category,
    license: pack.license,
    sourceUrl: pack.sourceUrl,
    permissions: pack.permissions,
    diamondActions: pack.diamondActions,
    installed: false,
    bundled: false,
    sourceType: "file",
    sourcePath: `official-download:${pack.id}`,
    fileName: pack.fileName,
    // The catalog supplies expected identity and hashes, but the pack itself
    // has not been downloaded or inspected yet. It must not look executable or
    // verified until the installer completes both SHA-256 checks.
    status: "quarantined",
    message: "Download available. Verification starts after the user confirms installation.",
    discoveredAt: checkedAt,
    officialDownload: pack.download
  };
}

function migrateRetiredOfficialPlayZoneSnapshots(
  installedRootPath: string,
  entries: PlayZoneLibraryEntry[]
) {
  const retained: PlayZoneLibraryEntry[] = [];
  for (const entry of entries) {
    if (!isRetiredPlayZonePackId(entry.id)) {
      retained.push(entry);
      continue;
    }

    // Only an app-managed legacy snapshot is removed. PlayZone save data lives
    // under a different root, and user-owned source files are never touched.
    if (entry.bundled && entry.installationId) {
      removePlayZoneSnapshot(installedRootPath, entry.installationId);
    }
  }
  return retained;
}
