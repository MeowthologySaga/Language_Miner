import type { GeneratedCardData, HighlightMapping } from "./types";

type HighlightableInputCard = Pick<
  GeneratedCardData,
  | "deckType"
  | "sourceSentence"
  | "literalTranslationKo"
  | "naturalTranslationKo"
  | "highlightMappings"
>;

export function sanitizeInputHighlightMappings(
  card: HighlightableInputCard
): HighlightMapping[] {
  if (card.deckType === "output") {
    return card.highlightMappings;
  }

  return card.highlightMappings.reduce<HighlightMapping[]>((result, mapping) => {
      const sourceText = keepExactSourceSpan(mapping.sourceText, card.sourceSentence);
      if (!sourceText) {
        return result;
      }

      const literalKo = keepExactSpan(mapping.literalKo, card.literalTranslationKo);
      const naturalKo = keepExactSpan(mapping.naturalKo, card.naturalTranslationKo);
      result.push({
        ...mapping,
        sourceText,
        literalKo,
        naturalKo
      });
      return result;
    }, []);
}

function keepExactSourceSpan(candidate: string | undefined, fullText: string) {
  const span = candidate?.trim();
  if (!span) return undefined;
  const start = fullText.toLocaleLowerCase().indexOf(span.toLocaleLowerCase());
  return start >= 0 ? fullText.slice(start, start + span.length) : undefined;
}

function keepExactSpan(candidate: string | undefined, fullText: string | undefined) {
  const span = candidate?.trim();
  if (!span || !fullText?.includes(span)) {
    return undefined;
  }
  return span;
}
