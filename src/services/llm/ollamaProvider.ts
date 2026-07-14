import type { LLMProvider } from "./types";
import { fetchWithTimeout } from "../../shared/fetchTimeout";
import { sampleReadingCard } from "./mockProvider";
import { parseJsonWithLooseEscapes } from "../../shared/jsonParsing";
import type {
  GeneratedCardData,
  GenerateCharacterChatReplyInput,
  GenerateLifeExpressionCardInput,
  GenerateReadingCardInput,
  HighlightColorKey,
  LearningProfile
} from "../../shared/types";
import {
  ensureBrowserSentenceSelectedTerms,
  normalizeBrowserVocabularyIpa
} from "../../shared/browserSentenceFallbackCard";
import { normalizeWritingPracticePumpPrompts } from "../../shared/pumpPrompts";
import { sanitizeInputHighlightMappings } from "../../shared/highlightMappingPolicy";
import {
  createLifeExpressionFallbackCard,
  createLifeExpressionSystemPrompt,
  createLifeExpressionUserPrompt,
  repairLifeExpressionCardConsistency
} from "./lifeExpressionCard";
import type { LifeExpressionCardDraft } from "./lifeExpressionCard";
import {
  buildCharacterChatSystemPrompt,
  buildCharacterChatUserPrompt
} from "../../shared/characterCards";
import {
  createVocabularyExampleLanguageRules,
  normalizeTargetLanguageVocabularyExamples
} from "../../shared/vocabularyExampleLanguage";
import { ensureOllamaReadyForGeneration } from "./ollamaReadiness";

type OllamaProviderOptions = {
  baseUrl: string;
  model: string;
  requestTimeoutMs?: number;
  ensureReady?: typeof ensureOllamaReadyForGeneration;
};

const cardColorKeys: HighlightColorKey[] = [
  "red",
  "orange",
  "blue",
  "purple",
  "green",
  "pink",
  "cyan",
  "yellow",
  "lime",
  "slate"
];

export class OllamaProvider implements LLMProvider {
  name = "OllamaProvider";

  constructor(private readonly options: OllamaProviderOptions) {}

  async testConnection() {
    try {
      const readiness = await this.ensureReady();
      if (readiness.installed) {
        return true;
      }
      const response = await fetchWithTimeout(
        `${this.normalizedBaseUrl}/api/tags`,
        {},
        {
          timeoutMs: this.options.requestTimeoutMs,
          timeoutMessage: "Ollama 연결 확인 시간이 초과되었습니다."
        }
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  async generateReadingCard(input: GenerateReadingCardInput): Promise<GeneratedCardData> {
    const { targetLanguage, nativeLanguage } = input.learningProfile;
    const isListeningCard = input.generationMode === "listening";
    const prompt = [
      `You create study cards for learning ${targetLanguage.nameEn} reading.`,
      `Explain meanings, grammar, and prompts in the learner's native language: ${nativeLanguage.nameEn}.`,
      "Return the existing JSON field names exactly, including fields ending in Ko, for app compatibility.",
      "Return only JSON with keys matching this TypeScript-like shape:",
      isListeningCard
        ? "{ cardType, deckType, direction, sourceSentence, frontText, literalTranslationKo, naturalTranslationKo, highlightMappings, vocabularyItems, readingStructure, listeningStudyGuide, structureNote, confusingComparisons, pumpPrompts }."
        : "{ cardType, deckType, direction, sourceSentence, frontText, literalTranslationKo, naturalTranslationKo, highlightMappings, vocabularyItems, readingStructure, structureNote, confusingComparisons, pumpPrompts }.",
      "Each vocabularyItems item may include: term, ipa, partOfSpeech, basicMeaningKo, meaningInContextKo, etymologyKo, usagePatterns, colorKey, examples, exampleTranslationsKo.",
      ...createVocabularyExampleLanguageRules(input.learningProfile),
      "ipa must be real IPA only, wrapped in slashes like /ˈwɝːd/. Do not use English respelling such as \"en gee el\", Hangul, or explanatory text. For acronyms, use letter-name IPA like /en dʒiː el/. Leave ipa empty only if genuinely unknown.",
      "For internet slang or acronyms such as NGL, TBH, IMO, or IDK, keep the selected acronym as vocabularyItems[].term, put the expanded form in etymologyKo and usagePatterns as \"Expanded form: ...\", and prefer nuance comparisons such as \"NGL vs TBH\" over generic synonym comparisons.",
      "For reading cards, deckType must be input and direction must be target_to_native.",
      "Keep the legacy field names literalTranslationKo, naturalTranslationKo, literalKo, naturalKo for app compatibility, but write their values in the learner's native language.",
      "Each highlightMappings item must include literalKo and naturalKo as exact substrings that appear in literalTranslationKo and naturalTranslationKo, so the UI can color the chosen term in both native-language translations.",
      "Treat the user's selected span as authoritative: one selected difficult word stays one exact-word highlight; a selected phrasal verb, idiom, or fixed collocation stays one complete meaningful chunk; multiple highlights are used only for multiple selected spans.",
      "Do not add unselected articles, connectors, pronouns, or easy function words. Never put ~ placeholders or non-verbatim paraphrases in literalKo or naturalKo.",
      "For reading cards, literalTranslationKo must be a structure-following literal translation in the learner's native language.",
      "For reading cards, naturalTranslationKo must be a natural meaning translation in the learner's native language.",
      "For reading cards, readingStructure is required. It must contain segments and groups. Segments must reproduce the complete source sentence in order without dropping punctuation, use tone subject/action/object/connector, and reference a groupId. Groups use kind clause/connector and include native-language titleKo, summaryKo, and segmentIds.",
      "For reading cards, structureNote must be an empty string and pumpPrompts must be an empty array.",
      ...(isListeningCard
        ? [
            "listeningStudyGuide is required and must use templateVersion listening-adaptive-v1.",
            "listeningStudyGuide must contain listeningIssue, 2-4 ordered chunks covering the full source sentence, and dictation.",
            "Every chunk needs en, Hangul connected-speech pronunciationKo, accurate full-chunk ipa with lexical stress, and Korean reasonKo explaining linking, reduction, contraction, stress, or rhythm.",
            "dictation.prompt replaces one difficult exact source expression with ____, answer restores it, and explanationKo contrasts the heard sound with the written form."
          ]
        : []),
      "For each selected vocabulary item, include exactly 3 short new example sentences. Do not reuse the source sentence as an example. Add vocabularyItems[].exampleTranslationsKo with Korean translations in the same order.",
      "Put only the selected term's origin, morphology, or memory-friendly word/phrase structure in etymologyKo. Never put source URL, browser collection info, app metadata, or capture notes there.",
      "Put common reusable forms and at least one collocation in usagePatterns. Prefix collocation entries with \"Collocation:\".",
      "confusingComparisons is required and should include at least one comparison for each selected term.",
      "Each confusingComparisons item must include kind, one of: similar, contrast, nuance.",
      "Pick the most useful kind for the term: similar = near-synonym usage difference, contrast = useful opposite/opposed state, nuance = strength/register/tone/context difference.",
      "Do not use confusingComparisons for collocations; put collocation notes only in vocabularyItems[].usagePatterns with the Collocation: prefix.",
      "Each confusingComparisons title must use a concrete alternative, e.g. encounter vs meet. Never use placeholders like similar expression, similar word, or selected term.",
      "Each confusingComparisons explanationKo must explain when the selected term fits, when the alternative fits, and include one short target-language example for each side.",
      "Use highlight color keys only: red, orange, blue, purple, green, pink, cyan, yellow, lime, slate.",
      `Target language: ${targetLanguage.nameEn} (${targetLanguage.code})`,
      `Native language: ${nativeLanguage.nameEn} (${nativeLanguage.code})`,
      `Selected ${targetLanguage.nameEn} text: ${input.selectedText}`,
      `Source ${targetLanguage.nameEn} sentence: ${input.sourceSentence}`,
      input.beforeSentence ? `Before sentence: ${input.beforeSentence}` : "",
      input.afterSentence ? `After sentence: ${input.afterSentence}` : "",
      input.readerTextContext ? `Reader context: ${input.readerTextContext}` : ""
    ]
      .filter(Boolean)
      .join("\n");

    const generated = await this.generateCardJson(
      prompt,
      () => sampleReadingCard(input.sourceSentence, parseSelectedTerms(input.selectedText), input.learningProfile),
      { learningProfile: input.learningProfile, signal: input.signal }
    );
    return ensureBrowserSentenceSelectedTerms(generated, input.selectedText, cardColorKeys, {
      targetLanguageCode: targetLanguage.code
    });
  }

  async generateLifeExpressionCard(
    input: GenerateLifeExpressionCardInput
  ): Promise<GeneratedCardData> {
    const prompt = [
      createLifeExpressionSystemPrompt(input),
      createLifeExpressionUserPrompt(input)
    ]
      .filter(Boolean)
      .join("\n");

    return this.generateCardJson(prompt, () => createLifeExpressionFallbackCard(input), {
      signal: input.signal
    });
  }

  async generateCharacterChatReply(input: GenerateCharacterChatReplyInput): Promise<string> {
    await this.ensureReady(input.signal);
    const response = await fetchWithTimeout(
      `${this.normalizedBaseUrl}/api/chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.options.model,
          stream: false,
          think: false,
          messages: [
            {
              role: "system",
              content: buildCharacterChatSystemPrompt({
                character: input.character,
                ragHints: input.ragHints,
                chatMode: input.chatMode,
                correctionMode: input.correctionMode,
                learningProfile: input.learningProfile
              })
            },
            {
              role: "user",
              content: buildCharacterChatUserPrompt({
                character: input.character,
                messages: input.messages,
                userMessage: input.userMessage
              })
            }
          ]
        })
      },
      {
        signal: input.signal,
        timeoutMs: this.options.requestTimeoutMs,
        timeoutMessage: "Ollama 캐릭터 응답 시간이 초과되었습니다."
      }
    );

    if (!response.ok) {
      throw new Error(`Ollama character chat failed: ${response.status}`);
    }

    const payload = (await response.json()) as {
      message?: { content?: string };
      response?: string;
    };
    const reply = (payload.message?.content ?? payload.response ?? "").trim();
    if (!reply) {
      throw new Error("Ollama returned an empty character reply.");
    }
    return stripCharacterPrefix(reply, input.character.name);
  }

  private async generateCardJson(
    prompt: string,
    fallback: () => GeneratedCardData,
    options: { learningProfile?: LearningProfile; signal?: AbortSignal } = {}
  ): Promise<GeneratedCardData> {
    await this.ensureReady(options.signal);
    const response = await fetchWithTimeout(
      `${this.normalizedBaseUrl}/api/chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.options.model,
          stream: false,
          think: false,
          format: "json",
          messages: [
            {
              role: "system",
              content:
                "You are a precise language learning card generator. Return valid JSON only."
            },
            {
              role: "user",
              content: prompt
            }
          ]
        })
      },
      {
        signal: options.signal,
        timeoutMs: this.options.requestTimeoutMs,
        timeoutMessage: "Ollama 카드 생성 시간이 초과되었습니다."
      }
    );

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status}`);
    }

    const payload = (await response.json()) as {
      message?: { content?: string };
      response?: string;
    };
    const content = payload.message?.content ?? payload.response ?? "";
    const parsed = parseJsonFromText(content);
    return normalizeGeneratedCard({
      ...fallback(),
      ...parsed
    }, options.learningProfile);
  }

  private get normalizedBaseUrl() {
    return this.options.baseUrl.replace(/\/$/, "");
  }

  private ensureReady(signal?: AbortSignal) {
    return (this.options.ensureReady ?? ensureOllamaReadyForGeneration)({
      baseUrl: this.options.baseUrl,
      model: this.options.model,
      signal
    });
  }
}

function normalizeGeneratedCard(
  card: LifeExpressionCardDraft,
  learningProfile?: LearningProfile
): GeneratedCardData {
  const isInputReadingCard = card.cardType === "reading" && (card.deckType ?? "input") === "input";
  const sourceFingerprints = new Set(
    [card.sourceSentence, card.frontText].map(normalizeTextFingerprint).filter(Boolean)
  );
  const targetLanguageCode =
    learningProfile?.targetLanguage.code || card.languageMetadata?.profileTargetLanguageCode;

  const normalized: LifeExpressionCardDraft = {
    ...card,
    deckType: card.deckType ?? (card.cardType === "life_expression" ? "output" : "input"),
    direction:
      card.direction ?? (card.cardType === "life_expression" ? "native_to_target" : "target_to_native"),
    structureNote: isInputReadingCard ? "" : card.structureNote,
    vocabularyItems: Array.isArray(card.vocabularyItems)
      ? card.vocabularyItems.map((item) => {
          const examples = normalizeVocabularyExamples(
            item.examples,
            item.term,
            sourceFingerprints,
            targetLanguageCode
          );
          return {
            ...item,
            ipa: normalizeBrowserVocabularyIpa(item.term, item.ipa),
            etymologyKo: normalizeLearningNote(item.etymologyKo),
            usagePatterns: normalizeUsagePatterns(item.usagePatterns, item.term),
            examples,
            exampleTranslationsKo: normalizeExampleTranslationsKo(
              examples,
              item.examples,
              item.exampleTranslationsKo
            )
          };
        })
      : [],
    pumpPrompts: isInputReadingCard ? [] : normalizeWritingPracticePumpPrompts(card.pumpPrompts)
  };
  const consistent = repairLifeExpressionCardConsistency(normalized);
  return {
    ...consistent,
    highlightMappings: sanitizeInputHighlightMappings(consistent)
  };
}

function normalizeExampleTranslationsKo(
  examples: string[],
  valueExamples: unknown,
  valueTranslations: unknown
) {
  const translationsByExample = new Map<string, string>();
  if (Array.isArray(valueExamples) && Array.isArray(valueTranslations)) {
    valueExamples.forEach((example, index) => {
      const key = normalizeTextFingerprint(example);
      const translation = String(valueTranslations[index] ?? "").trim();
      if (key && translation && !translationsByExample.has(key)) {
        translationsByExample.set(key, translation);
      }
    });
  }
  return examples.map((example) => translationsByExample.get(normalizeTextFingerprint(example)) ?? "");
}

function parseSelectedTerms(selectedText: string) {
  return selectedText
    .split(",")
    .map((term) => term.trim())
    .filter(Boolean);
}

function normalizeLearningNote(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!normalized || isCollectionMetadataNote(normalized)) {
    return undefined;
  }
  return normalized;
}

function isCollectionMetadataNote(value: string) {
  return /수집|출처|브라우저|확장|URL|https?:\/\/|reddit|metadata|메타데이터|capture|captured|source page|selected text|문장카드입니다/i.test(
    value
  );
}

function normalizeUsagePatterns(values: unknown, term: unknown) {
  const patterns = normalizeStringList(values);
  const normalizedTerm = String(term ?? "").trim();
  if (normalizedTerm) {
    patterns.push(`Collocation: "${normalizedTerm}" + noun/verb`);
    patterns.push(`use "${normalizedTerm}"`);
    patterns.push(`"${normalizedTerm}" in context`);
    patterns.push(`"${normalizedTerm}" + sentence`);
  }
  const unique = uniqueStrings(patterns);
  const collocation = unique.find((pattern) => /collocation/i.test(pattern));
  const ordered = collocation
    ? [collocation, ...unique.filter((pattern) => pattern !== collocation)]
    : unique;
  return ordered.slice(0, 4);
}

function normalizeVocabularyExamples(
  values: unknown,
  term: unknown,
  sourceFingerprints: Set<string>,
  targetLanguageCode?: string
) {
  const normalizedTerm = String(term ?? "").trim();
  return normalizeTargetLanguageVocabularyExamples({
    values,
    term: normalizedTerm,
    sourceTexts: [...sourceFingerprints],
    targetLanguageCode
  });
}

function uniqueStrings(values: string[]) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
}

function normalizeStringList(values: unknown) {
  const result: string[] = [];
  const seen = new Set<string>();
  if (!Array.isArray(values)) {
    return result;
  }
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function normalizeTextFingerprint(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function stripCharacterPrefix(reply: string, characterName: string) {
  return reply.replace(new RegExp(`^\\s*${escapeRegExp(characterName)}\\s*:\\s*`, "i"), "").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseJsonFromText(text: string): Partial<LifeExpressionCardDraft> {
  try {
    return parseJsonWithLooseEscapes(text) as Partial<LifeExpressionCardDraft>;
  } catch {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return parseJsonWithLooseEscapes(text.slice(first, last + 1)) as Partial<LifeExpressionCardDraft>;
    }
    throw new Error("Ollama did not return parseable JSON.");
  }
}
