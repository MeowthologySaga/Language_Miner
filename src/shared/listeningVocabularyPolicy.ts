import type {
  ConfusingComparison,
  StudyCard,
  StudyCardListeningAnnotation,
  VocabularyItem
} from "./types";

const placeholderMeaningTexts = new Set([
  "문맥 기반 의미 확인 필요",
  "선택 표현",
  "선택한 표현",
  "원문 구조를 기준으로 다시 생성이 필요합니다"
]);

const placeholderContextTexts = new Set([
  "선택한 표현을 원문 안에서 확인해야 합니다.",
  "선택한 표현을 원문 안에서 확인해야 합니다",
  "원문 안에서 확인해야 합니다."
]);

const listeningFunctionWords = new Set([
  "a",
  "an",
  "the",
  "to",
  "for",
  "of",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "by",
  "with",
  "from",
  "as",
  "if",
  "that",
  "this",
  "it",
  "its",
  "is",
  "are",
  "am",
  "was",
  "were",
  "be",
  "been",
  "being",
  "do",
  "does",
  "did",
  "have",
  "has",
  "had"
]);

const listeningContractions = new Set([
  "i'm",
  "i've",
  "i'd",
  "i'll",
  "you're",
  "you've",
  "you'd",
  "you'll",
  "he's",
  "he'd",
  "he'll",
  "she's",
  "she'd",
  "she'll",
  "it's",
  "it'd",
  "it'll",
  "we're",
  "we've",
  "we'd",
  "we'll",
  "they're",
  "they've",
  "they'd",
  "they'll",
  "that's",
  "there's",
  "what's",
  "who's",
  "can't",
  "won't",
  "don't",
  "doesn't",
  "didn't",
  "isn't",
  "aren't",
  "wasn't",
  "weren't",
  "haven't",
  "hasn't",
  "hadn't"
]);

export function filterInputListeningVocabularyItems(
  vocabularyItems: VocabularyItem[] | undefined
) {
  return (vocabularyItems ?? []).filter(shouldKeepInputListeningVocabularyItem);
}

export function normalizeInputListeningCardVocabulary<T extends StudyCard>(card: T): T {
  if (card.cardType !== "reading" || card.deckType !== "input-listening") {
    return card;
  }
  const vocabularyItems = filterInputListeningVocabularyItems(card.vocabularyItems);
  const confusingComparisons = filterInputListeningComparisons(card.confusingComparisons);
  if (
    vocabularyItems.length === card.vocabularyItems.length &&
    confusingComparisons.length === (card.confusingComparisons ?? []).length
  ) {
    return card;
  }
  return {
    ...card,
    vocabularyItems,
    confusingComparisons
  };
}

export function shouldKeepInputListeningVocabularyItem(item: VocabularyItem) {
  if (!normalizeListeningVocabularyTerm(item.term)) {
    return false;
  }
  if (isListeningFunctionVocabularyTerm(item.term)) {
    return false;
  }
  return !isPlaceholderListeningVocabularyItem(item);
}

export function isListeningFunctionVocabularyTerm(term: string) {
  const normalized = normalizeListeningVocabularyTerm(term);
  if (!normalized) {
    return false;
  }
  if (listeningFunctionWords.has(normalized) || listeningContractions.has(normalized)) {
    return true;
  }
  const words = normalized.split(" ").filter(Boolean);
  return (
    words.length > 0 &&
    words.every((word) => listeningFunctionWords.has(word) || listeningContractions.has(word))
  );
}

export function filterInputListeningComparisons(
  comparisons: ConfusingComparison[] | undefined
) {
  return (comparisons ?? []).filter(shouldKeepInputListeningComparison);
}

export function shouldKeepInputListeningComparison(comparison: ConfusingComparison) {
  const title = normalizeComparisonText(comparison.title).toLowerCase();
  const explanation = normalizeComparisonText(comparison.explanationKo).toLowerCase();
  const text = `${title} ${explanation}`;
  if (!title || !explanation) {
    return false;
  }
  if (
    title.includes("direct translation") ||
    title.includes("near synonym") ||
    title.includes("selected term")
  ) {
    return false;
  }
  if (
    text.includes("원문 문장에서의 역할") ||
    text.includes("i noticed") ||
    text.includes("simpler sentence") ||
    text.includes("direct translation")
  ) {
    return false;
  }
  return true;
}

export function getListeningProsodyLabel(
  sourceText: string,
  mark: StudyCardListeningAnnotation["mark"],
  sourceSentence = ""
) {
  const normalizedSource = normalizeListeningVocabularyTerm(sourceText);
  const normalizedSentence = normalizeListeningVocabularyTerm(sourceSentence);
  if (isHaveContraction(normalizedSource)) {
    const expansion = normalizedSource === "i've" ? "I have" : "have";
    return `${sourceText}: ${expansion} 축약형, 뒤 단어와 붙어 들림`;
  }
  if (normalizedSource === "had" && /\b(i|you|we|they|he|she|it)?'?ve had\b/.test(normalizedSentence)) {
    return `${sourceText}: have had 구조 안에서 이어 들리는 핵심 동사`;
  }
  if (mark === "linking-bridge") {
    return `${sourceText}: 붙어 들림`;
  }
  if (mark === "reduced") {
    return `${sourceText}: 약하게 지나감`;
  }
  if (mark === "strong-stress-dot") {
    return `${sourceText}: 강하게 들리는 핵심어`;
  }
  return `${sourceText}: 강세 후보`;
}

function isPlaceholderListeningVocabularyItem(item: VocabularyItem) {
  const basic = normalizeMeaningText(item.basicMeaningKo);
  const context = normalizeMeaningText(item.meaningInContextKo);
  return (
    placeholderMeaningTexts.has(basic) ||
    placeholderContextTexts.has(context) ||
    (basic.includes("문맥 기반") && basic.includes("확인")) ||
    (context.includes("원문") && context.includes("확인"))
  );
}

function isHaveContraction(normalizedTerm: string) {
  return (
    normalizedTerm === "i've" ||
    normalizedTerm === "you've" ||
    normalizedTerm === "we've" ||
    normalizedTerm === "they've"
  );
}

function normalizeListeningVocabularyTerm(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "")
    .trim()
    .toLocaleLowerCase();
}

function normalizeMeaningText(value: string | undefined) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComparisonText(value: string | undefined) {
  return normalizeMeaningText(value).replace(/[’‘]/g, "'");
}
