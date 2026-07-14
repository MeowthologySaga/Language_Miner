import type { StudyCard } from "./types";

export type GlossaryEntry = {
  term: string;
  meaningKo: string;
  partOfSpeech: string;
  sourcePreview: string;
  policy: "card_based";
  sourceCardCount: number;
  exampleCount: number;
};

type MutableGlossaryEntry = Omit<
  GlossaryEntry,
  "partOfSpeech" | "sourceCardCount" | "exampleCount"
> & {
  cardIds: Set<string>;
  examples: Set<string>;
  partsOfSpeech: Set<string>;
};

export function buildGlossaryEntries(cards: StudyCard[], query = ""): GlossaryEntry[] {
  const entriesByTerm = new Map<string, MutableGlossaryEntry>();

  for (const card of cards) {
    const vocabularyItems = Array.isArray(card.vocabularyItems) ? card.vocabularyItems : [];
    for (const item of vocabularyItems) {
      const term = normalizeGlossaryText(item.term);
      if (!term) {
        continue;
      }

      const key = term.toLocaleLowerCase();
      const existing = entriesByTerm.get(key);
      const examples = normalizeGlossaryExamples(item.examples);
      const meaningKo = normalizeGlossaryText(
        item.meaningInContextKo || item.basicMeaningKo || card.naturalTranslationKo
      );
      const sourcePreview = normalizeGlossaryText(card.sourceSentence || card.frontText);
      const partOfSpeech = normalizeGlossaryText(item.partOfSpeech);

      if (!existing) {
        entriesByTerm.set(key, {
          term,
          meaningKo,
          sourcePreview,
          policy: "card_based",
          cardIds: new Set([card.id || key]),
          examples: new Set(examples),
          partsOfSpeech: new Set(partOfSpeech ? [partOfSpeech] : [])
        });
        continue;
      }

      existing.cardIds.add(card.id || key);
      if (!existing.meaningKo && meaningKo) {
        existing.meaningKo = meaningKo;
      }
      if (!existing.sourcePreview && sourcePreview) {
        existing.sourcePreview = sourcePreview;
      }
      if (partOfSpeech) {
        existing.partsOfSpeech.add(partOfSpeech);
      }
      for (const example of examples) {
        existing.examples.add(example);
      }
    }
  }

  const entries = [...entriesByTerm.values()]
    .map((entry) => ({
      term: entry.term,
      meaningKo: entry.meaningKo,
      partOfSpeech: [...entry.partsOfSpeech].slice(0, 2).join(", ") || "-",
      sourcePreview: entry.sourcePreview,
      policy: entry.policy,
      sourceCardCount: entry.cardIds.size,
      exampleCount: entry.examples.size
    }))
    .sort((left, right) => left.term.localeCompare(right.term, "en"));
  return filterGlossaryEntries(entries, query);
}

export function filterGlossaryEntries(entries: GlossaryEntry[], query = "") {
  const normalizedQuery = normalizeGlossaryText(query).toLocaleLowerCase();
  if (!normalizedQuery) return entries;
  return entries.filter((entry) => matchesGlossaryQuery(entry, normalizedQuery));
}

function matchesGlossaryQuery(entry: GlossaryEntry, query: string) {
  if (!query) {
    return true;
  }

  return [
    entry.term,
    entry.meaningKo,
    entry.partOfSpeech,
    entry.sourcePreview,
    entry.policy,
    entry.policy === "card_based" ? "card based 카드 기반" : ""
  ]
    .join(" ")
    .toLocaleLowerCase()
    .includes(query);
}

function normalizeGlossaryText(value: string | undefined) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeGlossaryExamples(value: string[] | undefined) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(normalizeGlossaryText).filter(Boolean);
}
