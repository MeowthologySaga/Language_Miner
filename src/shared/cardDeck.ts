import type { CardDeckType, CardDirection, CardType, StudyCard } from "./types";
import {
  createFallbackReadingSentenceStructure,
  normalizeReadingSentenceStructure
} from "./readingStructure";
import { normalizeListeningStudyGuide } from "./listeningStudyGuide";
import { normalizeOutputStudyGuidePronunciations } from "./outputStudyGuide";

export type CardDeckFilter = "all" | CardDeckType;
export type CardDeckLabelLocale = "ko" | "en";

export function inferCardDeckType(cardType: CardType): CardDeckType {
  return cardType === "life_expression" ? "output" : "input";
}

export function inferCardDirection(cardType: CardType): CardDirection {
  return cardType === "life_expression" ? "native_to_target" : "target_to_native";
}

export function normalizeCardDeck<T extends { cardType: CardType }>(
  card: T & Partial<Pick<StudyCard, "deckType" | "direction">>
): T & Pick<StudyCard, "deckType" | "direction"> {
  const deckType = isCardDeckType(card.deckType)
    ? card.deckType
    : inferCardDeckType(card.cardType);
  const direction = isCardDirection(card.direction)
    ? card.direction
    : inferCardDirection(card.cardType);
  const readingCard = card as typeof card &
    Partial<Pick<StudyCard, "readingStructure" | "sourceSentence">>;
  const shouldNormalizeReadingStructure = card.cardType === "reading" && deckType === "input";
  const readingStructure = shouldNormalizeReadingStructure
    ? normalizeReadingSentenceStructure(readingCard.readingStructure, readingCard.sourceSentence) ??
      createFallbackReadingSentenceStructure(readingCard.sourceSentence)
    : readingCard.readingStructure;
  const listeningCard = card as typeof card &
    Partial<
      Pick<
        StudyCard,
        | "listeningStudyGuide"
        | "sourceSentence"
        | "frontText"
        | "highlightMappings"
        | "vocabularyItems"
      >
    >;
  const shouldNormalizeListeningGuide = deckType === "input-listening";
  const listeningStudyGuide = shouldNormalizeListeningGuide
    ? normalizeListeningStudyGuide(listeningCard.listeningStudyGuide, {
        sentence: listeningCard.sourceSentence || listeningCard.frontText || "",
        highlightMappings: listeningCard.highlightMappings,
        vocabularyItems: listeningCard.vocabularyItems
      })
    : listeningCard.listeningStudyGuide;
  const outputCard = card as typeof card & Partial<Pick<StudyCard, "outputStudyGuide">>;
  const outputStudyGuide = normalizeOutputStudyGuidePronunciations(outputCard.outputStudyGuide);

  return {
    ...card,
    deckType,
    direction,
    ...(shouldNormalizeReadingStructure ? { readingStructure } : {}),
    ...(shouldNormalizeListeningGuide ? { listeningStudyGuide } : {}),
    ...(outputStudyGuide ? { outputStudyGuide } : {})
  };
}

export function getCardDeckLabel(
  card: Pick<StudyCard, "deckType" | "direction">,
  locale: CardDeckLabelLocale = "ko"
) {
  if (card.deckType === "output") {
    return locale === "en" ? "Speaking Card" : "말하기 카드";
  }
  if (card.deckType === "input-listening") {
    return locale === "en" ? "Listening Card" : "듣기 카드";
  }
  return locale === "en" ? "Reading Card" : "읽기 카드";
}

export function getCardDeckShortLabel(
  card: Pick<StudyCard, "deckType" | "direction">,
  locale: CardDeckLabelLocale = "ko"
) {
  if (card.deckType === "output") {
    return locale === "en" ? "Speaking" : "말하기";
  }
  if (card.deckType === "input-listening") {
    return locale === "en" ? "Listening" : "듣기";
  }
  return locale === "en" ? "Reading" : "읽기";
}

export function getCardDeckFilterLabel(
  filter: CardDeckFilter,
  locale: CardDeckLabelLocale = "ko"
) {
  if (filter === "output") {
    return locale === "en" ? "Speaking Cards" : "말하기 카드";
  }
  if (filter === "input-listening") {
    return locale === "en" ? "Listening Cards" : "듣기 카드";
  }
  if (filter === "input") {
    return locale === "en" ? "Reading Cards" : "읽기 카드";
  }
  return locale === "en" ? "All" : "전체";
}

export function isInputReadingCard(card: Pick<StudyCard, "cardType" | "deckType">) {
  return card.cardType === "reading" && card.deckType === "input";
}

export function isLifeMiningOutputCard(card: Pick<StudyCard, "cardType" | "deckType">) {
  return card.cardType === "life_expression" && card.deckType === "output";
}

function isCardDeckType(value: unknown): value is CardDeckType {
  return value === "input" || value === "input-listening" || value === "output";
}

function isCardDirection(value: unknown): value is CardDirection {
  return (
    value === "en_to_ko" ||
    value === "ko_to_en" ||
    value === "target_to_native" ||
    value === "native_to_target"
  );
}

export function isInputToNativeDirection(value: CardDirection) {
  return value === "target_to_native" || value === "en_to_ko";
}

export function isNativeToTargetDirection(value: CardDirection) {
  return value === "native_to_target" || value === "ko_to_en";
}
