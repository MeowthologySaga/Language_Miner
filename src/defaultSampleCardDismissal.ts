import type { ProfileId } from "./shared/types";

export function getDismissedDefaultSampleCardsKey(profileId: ProfileId) {
  return `lem:dismissedDefaultSampleCards:${profileId}`;
}

export function readDismissedDefaultSampleCardIds(storage: Storage, profileId: ProfileId) {
  try {
    const parsed = JSON.parse(storage.getItem(getDismissedDefaultSampleCardsKey(profileId)) ?? "[]");
    return new Set(
      Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []
    );
  } catch {
    return new Set<string>();
  }
}

export function dismissDefaultSampleCard(storage: Storage, profileId: ProfileId, cardId: string) {
  const dismissed = readDismissedDefaultSampleCardIds(storage, profileId);
  dismissed.add(cardId);
  storage.setItem(getDismissedDefaultSampleCardsKey(profileId), JSON.stringify([...dismissed].sort()));
}
