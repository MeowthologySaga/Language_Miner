import { isDefaultSampleCardId } from "./defaultSampleCards";
import type { StudyCard } from "./types";

function normalizeSentence(value: string | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

export function findReplaceableDefaultSampleCard(
  cards: readonly StudyCard[],
  incomingCard: StudyCard
) {
  const incomingSentence = normalizeSentence(incomingCard.sourceSentence || incomingCard.frontText);
  if (!incomingSentence) return null;
  return (
    cards.find(
      (candidate) =>
        candidate.id !== incomingCard.id &&
        isDefaultSampleCardId(candidate.id) &&
        candidate.profileId === incomingCard.profileId &&
        candidate.cardType === incomingCard.cardType &&
        normalizeSentence(candidate.sourceSentence || candidate.frontText) === incomingSentence
    ) ?? null
  );
}
