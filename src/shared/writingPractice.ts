import type { PumpPrompt, StudyCard } from "./types";
import { isInputToNativeDirection } from "./cardDeck";
import { getWritingPracticePumpPrompts } from "./pumpPrompts";
import { conversationPracticePrompts } from "./conversationPracticeBank";

export type WritingPracticePrompt = {
  id: string;
  promptKo: string;
  targetEnglish: string;
  requiredTerms: string[];
  promptType: PumpPrompt["type"];
  source: "card" | "conversation-bank";
  cardId?: string;
  sourceLabel: string;
};

export type WritingPracticeEvaluation = {
  score: number;
  level: "great" | "good" | "try_again";
  matchedTerms: string[];
  missingTerms: string[];
  overlapPercent: number;
};

export function buildWritingPracticePrompts(cards: StudyCard[]): WritingPracticePrompt[] {
  const prompts: WritingPracticePrompt[] = [];
  for (const card of cards) {
    if (card.deckType === "input-listening") {
      continue;
    }

    if (card.deckType === "input" && isInputToNativeDirection(card.direction)) {
      const promptKo = getKoreanPromptFromReadingCard(card);
      const targetEnglish = getTargetEnglish(card);
      if (promptKo && targetEnglish) {
        prompts.push({
          id: `card-derived-${card.id}`,
          promptKo,
          targetEnglish,
          requiredTerms: normalizeTerms(getCardTerms(card).slice(0, 3)),
          promptType: "ko_to_en",
          source: "card",
          cardId: card.id,
          sourceLabel: getCardSourceLabel(card)
        });
      }
      continue;
    }

    for (const prompt of getWritingPracticePumpPrompts(card)) {
      if (!prompt.promptKo.trim()) {
        continue;
      }
      const targetEnglish = getTargetEnglish(card);
      if (!targetEnglish) {
        continue;
      }
      prompts.push({
        id: `card-pump-${card.id}-${prompts.length}`,
        promptKo: prompt.promptKo.trim(),
        targetEnglish,
        requiredTerms: normalizeTerms(prompt.requiredTerms ?? getCardTerms(card)),
        promptType: prompt.type,
        source: "card",
        cardId: card.id,
        sourceLabel: getCardSourceLabel(card)
      });
    }
  }

  return dedupePrompts([...prompts, ...conversationPracticePrompts]);
}

export function evaluateWritingPracticeAnswer(
  prompt: WritingPracticePrompt,
  answer: string
): WritingPracticeEvaluation {
  const normalizedAnswer = normalizeEnglish(answer);
  const matchedTerms = prompt.requiredTerms.filter((term) =>
    includesTerm(normalizedAnswer, term)
  );
  const missingTerms = prompt.requiredTerms.filter(
    (term) => !matchedTerms.includes(term)
  );
  const overlapPercent = getTokenOverlapPercent(prompt.targetEnglish, answer);
  const requiredPercent =
    prompt.requiredTerms.length > 0
      ? Math.round((matchedTerms.length / prompt.requiredTerms.length) * 100)
      : overlapPercent;
  const score = Math.round(requiredPercent * 0.58 + overlapPercent * 0.42);
  return {
    score,
    level: score >= 78 ? "great" : score >= 52 ? "good" : "try_again",
    matchedTerms,
    missingTerms,
    overlapPercent
  };
}

function getTargetEnglish(card: StudyCard) {
  if (card.cardType === "life_expression") {
    return (
      card.targetText?.trim() ||
      extractMeLineFromEnglishConversation(card.literalTranslationKo) ||
      card.sourceSentence ||
      card.frontText
    ).trim();
  }
  return (card.sourceSentence || card.frontText).trim();
}

function getKoreanPromptFromReadingCard(card: StudyCard) {
  const natural = stripSectionText(card.naturalTranslationKo);
  if (natural && /[가-힣]/.test(natural)) {
    return natural;
  }
  const literal = stripSectionText(card.literalTranslationKo);
  return /[가-힣]/.test(literal) ? literal : "";
}

function getCardTerms(card: StudyCard) {
  return [
    ...card.highlightMappings.map((mapping) => mapping.sourceText),
    ...card.vocabularyItems.map((item) => item.term)
  ].filter(Boolean);
}

function getCardSourceLabel(card: StudyCard) {
  if (card.deckType === "output") {
    return "아웃풋 카드";
  }
  if (card.deckType === "input-listening") {
    return "인풋-리스닝 카드";
  }
  return "인풋-리딩 카드";
}

function normalizeTerms(terms: string[]) {
  const uniqueTerms: string[] = [];
  for (const term of terms) {
    const normalized = term.trim();
    if (!normalized) {
      continue;
    }
    if (!uniqueTerms.some((candidate) => candidate.toLowerCase() === normalized.toLowerCase())) {
      uniqueTerms.push(normalized);
    }
  }
  return uniqueTerms.slice(0, 5);
}

function dedupePrompts(prompts: WritingPracticePrompt[]) {
  const seen = new Set<string>();
  const result: WritingPracticePrompt[] = [];
  for (const prompt of prompts) {
    const key = `${prompt.promptKo.toLowerCase()}\u001f${prompt.targetEnglish.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(prompt);
  }
  return result;
}

function extractMeLineFromEnglishConversation(value: string | undefined) {
  const lines = String(value || "").split(/\n+/);
  const meLine = lines.find((line) => /^me\s*:/i.test(line.trim()));
  return meLine?.replace(/^me\s*:\s*/i, "").trim() ?? "";
}

function stripSectionText(value: string | undefined) {
  return String(value || "")
    .replace(/^(직역|자연스러운 뜻|내 답변 변형|영어 대화)\s*/i, "")
    .split(/\n+/)
    .map((line) => line.replace(/^(짧게|캐주얼|공손하게)\s*:\s*/i, "").trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 220)
    .trim();
}

function includesTerm(normalizedAnswer: string, term: string) {
  const normalizedTerm = normalizeEnglish(term);
  if (!normalizedTerm) {
    return false;
  }
  if (normalizedAnswer.includes(normalizedTerm)) {
    return true;
  }
  const termTokens = tokenizeEnglish(normalizedTerm);
  const answerTokens = new Set(tokenizeEnglish(normalizedAnswer));
  return termTokens.length > 0 && termTokens.every((token) => answerTokens.has(token));
}

function getTokenOverlapPercent(targetEnglish: string, answer: string) {
  const targetTokens = new Set(tokenizeEnglish(targetEnglish));
  const answerTokens = new Set(tokenizeEnglish(answer));
  if (targetTokens.size === 0 || answerTokens.size === 0) {
    return 0;
  }
  let overlap = 0;
  for (const token of targetTokens) {
    if (answerTokens.has(token)) {
      overlap += 1;
    }
  }
  return Math.round((overlap / targetTokens.size) * 100);
}

function normalizeEnglish(value: string) {
  return value
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9가-힣\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeEnglish(value: string) {
  return normalizeEnglish(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !stopWords.has(token));
}

const stopWords = new Set([
  "a",
  "an",
  "the",
  "to",
  "of",
  "in",
  "on",
  "at",
  "and",
  "or",
  "is",
  "am",
  "are",
  "be",
  "it"
]);
