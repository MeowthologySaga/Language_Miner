const RETIRED_PLAY_ZONE_PACK_IDS = new Set([
  "lem.diamond-bistro"
]);

/**
 * Packs removed from Language Miner's public PlayZone catalog.
 *
 * This check intentionally does not delete per-game save data. It is used to
 * hide retired catalog entries and to deny stale runtime URLs after an app
 * upgrade.
 */
export function isRetiredPlayZonePackId(packId: string | undefined | null) {
  return typeof packId === "string" && RETIRED_PLAY_ZONE_PACK_IDS.has(packId.trim().toLowerCase());
}
