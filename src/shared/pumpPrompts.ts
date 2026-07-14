import type { PumpPrompt, StudyCard } from "./types";

export function getWritingPracticePumpPrompts(
  card: Pick<StudyCard, "pumpPrompts">
): PumpPrompt[] {
  return normalizeWritingPracticePumpPrompts(card.pumpPrompts);
}

export function normalizeWritingPracticePumpPrompts(value: unknown): PumpPrompt[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const prompts: PumpPrompt[] = [];
  for (const item of value) {
    const prompt = normalizeWritingPracticePumpPrompt(item);
    if (prompt) {
      prompts.push(prompt);
    }
  }
  return prompts;
}

function normalizeWritingPracticePumpPrompt(value: unknown): PumpPrompt | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (record.type !== "ko_to_en") {
    return null;
  }

  const promptKo = typeof record.promptKo === "string" ? record.promptKo.trim() : "";
  if (!promptKo) {
    return null;
  }

  return {
    type: "ko_to_en",
    promptKo,
    requiredTerms: normalizeRequiredTerms(record.requiredTerms)
  };
}

function normalizeRequiredTerms(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((term) => (typeof term === "string" ? term.trim() : ""))
    .filter(Boolean);
}
