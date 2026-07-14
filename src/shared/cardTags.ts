import type { StudyCard } from "./types";

export const CARD_TAG_UNTAGGED_FILTER = "__untagged__";
export const MAX_CARD_TAGS = 15;
export const MAX_CARD_TAG_LENGTH = 32;

export type CardTagCount = {
  tag: string;
  count: number;
};

export function normalizeCardTag(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s*:\s*/g, ":")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^#+/, "")
    .trim()
    .slice(0, MAX_CARD_TAG_LENGTH);
}

export function normalizeCardTags(values: unknown, limit = MAX_CARD_TAGS) {
  if (!Array.isArray(values)) {
    return [];
  }
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const tag = normalizeCardTag(value);
    const key = getCardTagKey(tag);
    if (!tag || seen.has(key)) {
      continue;
    }
    seen.add(key);
    tags.push(tag);
    if (tags.length >= limit) {
      break;
    }
  }
  return tags;
}

export function splitCardTagInput(value: string) {
  return normalizeCardTags(value.split(/[,\n]+/));
}

export function getCardTags(card: StudyCard) {
  if (Array.isArray(card.tags)) {
    return normalizeCardTags(card.tags);
  }
  return normalizeCardTags(card.outputStudyGuide?.tags);
}

export function withCardTags(card: StudyCard, values: unknown): StudyCard {
  const tags = normalizeCardTags(values);
  return {
    ...card,
    tags,
    outputStudyGuide: card.outputStudyGuide
      ? {
          ...card.outputStudyGuide,
          tags
        }
      : card.outputStudyGuide
  };
}

export function getCardTagCounts(cards: StudyCard[]): CardTagCount[] {
  const byKey = new Map<string, CardTagCount>();
  for (const card of cards) {
    for (const tag of getCardTags(card)) {
      const key = getCardTagKey(tag);
      const current = byKey.get(key);
      if (current) {
        current.count += 1;
      } else {
        byKey.set(key, { tag, count: 1 });
      }
    }
  }
  return Array.from(byKey.values()).sort(
    (left, right) => right.count - left.count || left.tag.localeCompare(right.tag, "ko")
  );
}

export function matchesCardTagFilters(card: StudyCard, selectedTags: string[]) {
  if (!selectedTags.length) {
    return true;
  }
  const cardTags = getCardTags(card);
  if (selectedTags.includes(CARD_TAG_UNTAGGED_FILTER) && cardTags.length === 0) {
    return true;
  }
  const cardTagKeys = new Set(cardTags.map(getCardTagKey));
  return selectedTags.some(
    (tag) => tag !== CARD_TAG_UNTAGGED_FILTER && cardTagKeys.has(getCardTagKey(tag))
  );
}

export function getCardTagKey(value: string) {
  return normalizeCardTag(value).toLocaleLowerCase();
}
