import type { LLMProvider, LlmUsageObservation } from "./types";
import { sampleReadingCard } from "./mockProvider";
import { parseJsonWithLooseEscapes } from "../../shared/jsonParsing";
import {
  requestGeminiContent,
  testGeminiConnection,
  type GeminiUsageObserver
} from "../../shared/geminiTranslation";
import {
  assertCloudProviderConsent,
  readRendererCloudProviderConsent
} from "../../shared/cloudProviderConsent";
import type {
  GeneratedCardData,
  GenerateCharacterChatReplyInput,
  GenerateLifeExpressionCardInput,
  GenerateReadingCardInput,
  HighlightColorKey,
  LearningProfile,
  CloudProviderConsentRecord
} from "../../shared/types";
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
  ensureBrowserSentenceSelectedTerms,
  normalizeBrowserVocabularyIpa
} from "../../shared/browserSentenceFallbackCard";
import { normalizeWritingPracticePumpPrompts } from "../../shared/pumpPrompts";
import { sanitizeInputHighlightMappings } from "../../shared/highlightMappingPolicy";
import { defaultLearningProfile } from "../../shared/languages";
import {
  createVocabularyExampleLanguageRules,
  normalizeTargetLanguageVocabularyExamples
} from "../../shared/vocabularyExampleLanguage";

type GeminiProviderOptions = {
  apiKey: string;
  model: string;
  plan?: "free" | "paid";
  requestTimeoutMs?: number;
  cloudConsent?: CloudProviderConsentRecord;
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

export function createReadingCardPrompt(input: GenerateReadingCardInput): {
  systemPrompt: string;
  userPrompt: string;
  selectedTerms: string[];
} {
  const { targetLanguage, nativeLanguage } = input.learningProfile;
  const selectedTerms = parseSelectedTerms(input.selectedText);
  const isListeningCard = input.generationMode === "listening";
  const systemPrompt = [
    "You are a precise language-learning card generator.",
    "Return valid JSON only. Do not wrap JSON in Markdown.",
    "The card is for verifying a generated word/sentence card inside the app.",
    `The learner studies ${targetLanguage.nameEn} (${targetLanguage.code}).`,
    `Explain in the learner's native language: ${nativeLanguage.nameEn} (${nativeLanguage.code}).`,
    "Keep the source sentence in the target language exactly unless the user-provided edited sentence changes it.",
    "Focus vocabularyItems on the selected word(s) or phrase(s), not on unrelated words.",
    "Use concise learner-friendly explanations.",
    "Use highlight color keys only: red, orange, blue, purple, green, pink, cyan, yellow, lime, slate.",
    "Return exactly this JSON shape:",
    JSON.stringify(
      createCardJsonShape(
        isListeningCard ? { listeningStudyGuide: createListeningStudyGuideJsonShape() } : {}
      ),
      null,
      2
    )
  ].join("\n");

  const userPrompt = [
    `Selected ${targetLanguage.nameEn} word(s)/phrase(s): ${selectedTerms.join(", ") || input.selectedText}`,
    `Source sentence: ${input.sourceSentence}`,
    input.beforeSentence ? `Before sentence: ${input.beforeSentence}` : "",
    input.afterSentence ? `After sentence: ${input.afterSentence}` : "",
    input.readerTextContext ? `Reader context: ${input.readerTextContext.slice(0, 2200)}` : "",
    input.translationContext ? `Additional context: ${input.translationContext}` : "",
    "Rules:",
    "- cardType must be \"reading\".",
    "- deckType must be \"input\" and direction must be \"target_to_native\".",
    "- frontText should be the full source sentence, with selected term(s) learnable from context.",
    "- highlightMappings must include each selected term if it appears in the sentence.",
    "- Treat the user's selected span as authoritative: if one difficult word was selected, highlight only that exact word; if a phrasal verb, idiom, or fixed collocation was selected, keep the complete meaningful chunk together.",
    "- Do not expand a selected difficult word into nearby easy words, and do not split a selected phrasal verb into separate highlights.",
    "- Multiple highlightMappings are allowed only when the user selected multiple distinct spans. Never add unselected articles, connectors, pronouns, or other easy function words as extra highlights.",
    "- Keep the legacy field names literalTranslationKo, naturalTranslationKo, literalKo, naturalKo for app compatibility, but write their values in the learner's native language.",
    "- Each highlightMappings item must include literalKo and naturalKo as exact substrings that appear in literalTranslationKo and naturalTranslationKo, so the UI can color the chosen term in both native-language translations.",
    "- literalKo and naturalKo must contain the exact visible characters from the translations. Never use placeholders such as ~, paraphrases that do not occur verbatim, or a wider translation span than the selected source span requires.",
    "- literalTranslationKo must be a structure-following literal translation in the learner's native language; it may sound slightly awkward if that reveals the source structure.",
    "- naturalTranslationKo must be a natural meaning translation in the learner's native language, suitable as a native-to-target writing-practice prompt.",
    "- readingStructure is required. Split the full source sentence into ordered contiguous segments without omitting punctuation. Use only subject, action, object, or connector for tone. Every segment must reference one groupId, and groups must summarize the clause or connector in the learner's native language.",
    "- readingStructure.segments joined in order must reproduce the full source sentence exactly apart from whitespace before punctuation. Use 2-8 useful segments and keep segment and group ids unique.",
    "- vocabularyItems must include each selected term, with IPA, part of speech, basic meaning, context meaning, etymologyKo, usagePatterns, exactly 3 short examples, and exampleTranslationsKo. Legacy *Ko fields must still be written in the learner's native language.",
    ...createVocabularyExampleLanguageRules(input.learningProfile),
    "- vocabularyItems[].ipa must be real IPA only, wrapped in slashes like /ˈwɝːd/. Do not use English respelling such as \"en gee el\", Hangul, or explanatory text. For acronyms, use letter-name IPA like /en dʒiː el/. Leave ipa empty only if genuinely unknown.",
    "- For internet slang or acronyms such as NGL, TBH, IMO, or IDK, keep the selected acronym as vocabularyItems[].term, put the expanded form in etymologyKo and usagePatterns as \"Expanded form: ...\", and prefer nuance comparisons such as \"NGL vs TBH\" over generic synonym comparisons.",
    "- Do not reuse the source sentence as a vocabulary example. Each examples[] item must be a new sentence, and exampleTranslationsKo[] must give the Korean translation for each example in the same order.",
    "- Put only the selected term's origin, morphology, or memory-friendly word/phrase structure in vocabularyItems[].etymologyKo. Never put source URL, browser collection info, app metadata, or capture notes there.",
    "- Put common reusable forms and at least one collocation in vocabularyItems[].usagePatterns. Prefix collocation entries with \"Collocation:\".",
    "- confusingComparisons is required: include at least one comparison for each selected term.",
    "- Each confusingComparisons item must include kind, one of: \"similar\", \"contrast\", \"nuance\".",
    "- Pick the most useful kind for the term: similar = near-synonym usage difference, contrast = useful opposite/opposed state, nuance = strength/register/tone/context difference.",
    "- Do not use confusingComparisons for collocations; put collocation notes only in vocabularyItems[].usagePatterns with the \"Collocation:\" prefix.",
    "- Each confusingComparisons title must use a concrete alternative, e.g. \"encounter vs meet\". Never use placeholders like \"similar expression\", \"similar word\", or \"selected term\".",
    "- Each confusingComparisons explanationKo must explain when the selected term fits, when the alternative fits, and include one short target-language example for each side.",
    "- structureNote should be an empty string for input reading cards.",
    "- pumpPrompts must be an empty array for input reading cards; writing practice is derived from naturalTranslationKo.",
    ...(isListeningCard
      ? [
          "- listeningStudyGuide is required because this card comes from listening practice.",
          "- listeningStudyGuide.templateVersion must be \"listening-adaptive-v1\". Do not add prototype.",
          "- Split the complete source sentence into 2-4 ordered meaning-and-sound chunks. chunks[].en joined with spaces must cover the whole sentence without inventing words.",
          "- Every chunk must include a useful Hangul connected-speech guide in pronunciationKo, accurate full-chunk IPA with lexical stress marks in ipa, and a concise Korean explanation in reasonKo of linking, reduction, contraction, stress, or rhythm.",
          "- listeningIssue must name the single most important reason this sentence is easy to miss and explain the actual fast-speech sound in Korean.",
          "- dictation.prompt must replace one difficult expression from the exact source sentence with ____. dictation.answer must be that exact original expression, and explanationKo must contrast the heard sound with the written form."
        ]
      : [])
  ]
    .filter(Boolean)
    .join("\n");

  return { systemPrompt, userPrompt, selectedTerms };
}

export class GeminiProvider implements LLMProvider {
  name = "GeminiProvider";
  private usageObserver?: (observation: LlmUsageObservation) => void;

  constructor(private readonly options: GeminiProviderOptions) {}

  setUsageObserver(observer: (observation: LlmUsageObservation) => void) {
    this.usageObserver = observer;
  }

  private assertConsent() {
    const currentConsent =
      typeof window === "undefined"
        ? this.options.cloudConsent
        : readRendererCloudProviderConsent("gemini");
    assertCloudProviderConsent("gemini", currentConsent);
  }

  private createUsageObserver(sourceLang: string, targetLang: string): GeminiUsageObserver {
    return (observation) => {
      this.usageObserver?.({
        ...observation,
        providerName: "gemini",
        plan: this.options.plan,
        sourceLang,
        targetLang
      });
    };
  }

  async testConnection() {
    this.assertConsent();
    return testGeminiConnection({
      apiKey: this.options.apiKey,
      model: this.options.model,
      timeoutMs: this.options.requestTimeoutMs,
      onUsage: this.createUsageObserver("und", "und")
    });
  }

  async generateReadingCard(input: GenerateReadingCardInput): Promise<GeneratedCardData> {
    this.assertConsent();
    const { systemPrompt, userPrompt } = createReadingCardPrompt(input);
    const draft = await this.generateCardDraft(
      systemPrompt,
      userPrompt,
      input.learningProfile.targetLanguage.code,
      input.learningProfile.nativeLanguage.code,
      input.signal
    );
    return normalizeReadingCardDraft(draft, input);
  }

  async generateLifeExpressionCard(
    input: GenerateLifeExpressionCardInput
  ): Promise<GeneratedCardData> {
    this.assertConsent();
    const draft = await this.generateCardDraft(
      createLifeExpressionSystemPrompt(input),
      createLifeExpressionUserPrompt(input),
      input.learningProfile.nativeLanguage.code,
      input.learningProfile.targetLanguage.code,
      input.signal
    );
    return normalizeLifeExpressionCardDraft(draft, input);
  }

  async generateCharacterChatReply(input: GenerateCharacterChatReplyInput): Promise<string> {
    this.assertConsent();
    const learningProfile = input.learningProfile ?? defaultLearningProfile;
    const systemPrompt = buildCharacterChatSystemPrompt({
      character: input.character,
      ragHints: input.ragHints,
      chatMode: input.chatMode,
      correctionMode: input.correctionMode,
      learningProfile: input.learningProfile
    });
    const userPrompt = buildCharacterChatUserPrompt({
      character: input.character,
      messages: input.messages,
      userMessage: input.userMessage
    });
    const estimateTextLength = systemPrompt.length + userPrompt.length;
    const result = await requestGeminiContent({
      apiKey: this.options.apiKey,
      model: this.options.model,
      systemPrompt,
      userPrompt,
      signal: input.signal,
      timeoutMs: this.options.requestTimeoutMs,
      onUsage: this.createUsageObserver(
        learningProfile.nativeLanguage.code,
        learningProfile.targetLanguage.code
      ),
      fallbackUsage: {
        inputTokens: Math.ceil(estimateTextLength / 4),
        outputTokens: 360,
        totalTokens: Math.ceil(estimateTextLength / 4) + 360,
        billableCharacters: estimateTextLength,
        requestCount: 1,
        cacheHitCount: 0,
        cacheMissCount: 1
      }
    });
    const reply = result.text.trim();
    if (!reply) {
      throw new Error("Gemini returned an empty character reply.");
    }
    return stripCharacterPrefix(reply, input.character.name);
  }

  private async generateCardDraft(
    systemPrompt: string,
    userPrompt: string,
    sourceLang: string,
    targetLang: string,
    signal?: AbortSignal
  ): Promise<Partial<LifeExpressionCardDraft>> {
    const estimateTextLength = systemPrompt.length + userPrompt.length;
    const result = await requestGeminiContent({
      apiKey: this.options.apiKey,
      model: this.options.model,
      responseMimeType: "application/json",
      systemPrompt,
      userPrompt,
      signal,
      timeoutMs: this.options.requestTimeoutMs,
      onUsage: this.createUsageObserver(sourceLang, targetLang),
      fallbackUsage: {
        inputTokens: Math.ceil(estimateTextLength / 4),
        outputTokens: 900,
        totalTokens: Math.ceil(estimateTextLength / 4) + 900,
        billableCharacters: estimateTextLength,
        requestCount: 1,
        cacheHitCount: 0,
        cacheMissCount: 1
      }
    });

    return parseJsonFromText(result.text);
  }
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
    throw new Error("Gemini did not return parseable card JSON.");
  }
}

export function normalizeReadingCardDraft(
  draft: Partial<LifeExpressionCardDraft>,
  input: GenerateReadingCardInput
): GeneratedCardData {
  const selectedTerms = parseSelectedTerms(input.selectedText);
  const normalized = normalizeGeneratedCard(
    {
      ...sampleReadingCard(input.sourceSentence, selectedTerms, input.learningProfile),
      ...draft
    },
    input.learningProfile,
    selectedTerms
  );
  return ensureBrowserSentenceSelectedTerms(normalized, input.selectedText, cardColorKeys, {
    targetLanguageCode: input.learningProfile.targetLanguage.code
  });
}

export function normalizeLifeExpressionCardDraft(
  draft: Partial<LifeExpressionCardDraft>,
  input: GenerateLifeExpressionCardInput
): GeneratedCardData {
  return normalizeGeneratedCard({
    ...createLifeExpressionFallbackCard(input),
    ...draft
  });
}

function normalizeGeneratedCard(
  card: LifeExpressionCardDraft,
  learningProfile?: LearningProfile,
  selectedTerms?: string[]
): GeneratedCardData {
  const fallback =
    card.cardType === "life_expression"
      ? createLifeExpressionFallbackCard({
          koreanText: card.sourceSentence || card.targetText || card.frontText || "",
          learningProfile: learningProfile ?? defaultLearningProfile
        })
      : sampleReadingCard(card.sourceSentence || card.frontText || "", selectedTerms, learningProfile);
  const cardType = card.cardType ?? fallback.cardType;
  const deckType = card.deckType ?? fallback.deckType ?? (cardType === "life_expression" ? "output" : "input");
  const isInputReadingCard = cardType === "reading" && deckType === "input";
  const targetLanguageCode =
    learningProfile?.targetLanguage.code || card.languageMetadata?.profileTargetLanguageCode;
  const pumpPrompts = isInputReadingCard
    ? []
    : normalizeWritingPracticePumpPrompts(card.pumpPrompts);
  const fallbackPumpPrompts = isInputReadingCard
    ? []
    : normalizeWritingPracticePumpPrompts(fallback.pumpPrompts);
  const normalized: LifeExpressionCardDraft = {
    ...fallback,
    ...card,
    cardType,
    deckType,
    sourceSentence: card.sourceSentence?.trim() || fallback.sourceSentence,
    frontText: card.frontText?.trim() || card.sourceSentence?.trim() || fallback.frontText,
    literalTranslationKo: card.literalTranslationKo?.trim() || fallback.literalTranslationKo,
    naturalTranslationKo: card.naturalTranslationKo?.trim() || fallback.naturalTranslationKo,
    highlightMappings: Array.isArray(card.highlightMappings)
      ? card.highlightMappings.slice(0, cardColorKeys.length).map((mapping, index) => ({
          sourceText: String(mapping.sourceText ?? "").trim(),
          literalKo: mapping.literalKo ? String(mapping.literalKo) : undefined,
          naturalKo: mapping.naturalKo ? String(mapping.naturalKo) : undefined,
          colorKey: normalizeColorKey(mapping.colorKey, index)
        })).filter((mapping) => mapping.sourceText)
      : fallback.highlightMappings,
    vocabularyItems: Array.isArray(card.vocabularyItems)
      ? card.vocabularyItems.slice(0, cardColorKeys.length).map((item, index) => ({
          ...normalizeVocabularyItem(
            item,
            fallback.vocabularyItems[index],
            card,
            index,
            targetLanguageCode
          )
        })).filter((item) => item.term)
      : fallback.vocabularyItems,
    structureNote: isInputReadingCard ? "" : card.structureNote ?? fallback.structureNote,
    confusingComparisons: Array.isArray(card.confusingComparisons)
      ? card.confusingComparisons
      : fallback.confusingComparisons,
    pumpPrompts: pumpPrompts.length ? pumpPrompts : fallbackPumpPrompts,
    answerCandidates: card.answerCandidates
  };
  const consistent = repairLifeExpressionCardConsistency(normalized);
  return {
    ...consistent,
    highlightMappings: sanitizeInputHighlightMappings(consistent)
  };
}

function normalizeVocabularyItem(
  item: GeneratedCardData["vocabularyItems"][number],
  fallbackItem: GeneratedCardData["vocabularyItems"][number] | undefined,
  card: GeneratedCardData,
  index: number,
  targetLanguageCode?: string
) {
  const term = String(item.term ?? "").trim();
  const examples = normalizeVocabularyExamples(
    item.examples,
    fallbackItem?.examples,
    card,
    term,
    targetLanguageCode
  );
  return {
    term,
    ipa: normalizeBrowserVocabularyIpa(
      String(item.term ?? fallbackItem?.term ?? ""),
      item.ipa,
      fallbackItem?.ipa
    ),
    partOfSpeech: item.partOfSpeech ? String(item.partOfSpeech) : fallbackItem?.partOfSpeech,
    basicMeaningKo: String(item.basicMeaningKo ?? fallbackItem?.basicMeaningKo ?? "의미 확인 필요"),
    meaningInContextKo: item.meaningInContextKo
      ? String(item.meaningInContextKo)
      : fallbackItem?.meaningInContextKo,
    etymologyKo: normalizeLearningNote(item.etymologyKo, fallbackItem?.etymologyKo),
    usagePatterns: normalizeUsagePatterns(item.usagePatterns, fallbackItem?.usagePatterns, item.term),
    colorKey: normalizeColorKey(item.colorKey, index),
    examples,
    exampleTranslationsKo: normalizeExampleTranslationsKo(
      examples,
      item.examples,
      item.exampleTranslationsKo,
      fallbackItem?.examples,
      fallbackItem?.exampleTranslationsKo
    )
  };
}

function normalizeExampleTranslationsKo(
  examples: string[],
  valueExamples: unknown,
  valueTranslations: unknown,
  fallbackExamples: string[] | undefined,
  fallbackTranslations: string[] | undefined
) {
  const translationsByExample = new Map<string, string>();
  registerExampleTranslations(translationsByExample, valueExamples, valueTranslations);
  registerExampleTranslations(translationsByExample, fallbackExamples, fallbackTranslations);
  return examples.map((example) => translationsByExample.get(normalizeExampleFingerprint(example)) ?? "");
}

function registerExampleTranslations(
  translationsByExample: Map<string, string>,
  examples: unknown,
  translations: unknown
) {
  if (!Array.isArray(examples) || !Array.isArray(translations)) {
    return;
  }
  examples.forEach((example, index) => {
    const key = normalizeExampleFingerprint(example);
    const translation = String(translations[index] ?? "").trim();
    if (key && translation && !translationsByExample.has(key)) {
      translationsByExample.set(key, translation);
    }
  });
}

function normalizeExampleFingerprint(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUsagePatterns(value: unknown, fallbackValue: string[] | undefined, term: unknown) {
  const normalizedTerm = String(term ?? "").trim();
  const candidates = [
    ...(Array.isArray(value) ? value : []),
    normalizedTerm ? `Collocation: "${normalizedTerm}" + noun/verb` : "",
    ...(Array.isArray(fallbackValue) ? fallbackValue : [])
  ];
  const unique = uniqueNonEmptyStrings(candidates);
  const collocation = unique.find((pattern) => /collocation/i.test(pattern));
  const ordered = collocation
    ? [collocation, ...unique.filter((pattern) => pattern !== collocation)]
    : unique;
  return ordered.slice(0, 4);
}

function normalizeLearningNote(value: unknown, fallbackValue?: string) {
  const candidates = [value, fallbackValue];
  for (const candidate of candidates) {
    const normalized = String(candidate ?? "").trim();
    if (!normalized || isCollectionMetadataNote(normalized)) {
      continue;
    }
    return normalized;
  }
  return undefined;
}

function isCollectionMetadataNote(value: string) {
  return /수집|출처|브라우저|확장|URL|https?:\/\/|reddit|metadata|메타데이터|capture|captured|source page|selected text|문장카드입니다/i.test(
    value
  );
}

function normalizeVocabularyExamples(
  value: unknown,
  fallbackValue: string[] | undefined,
  card: GeneratedCardData,
  term: string,
  targetLanguageCode?: string
) {
  return normalizeTargetLanguageVocabularyExamples({
    values: value,
    fallbackValues: fallbackValue,
    term,
    sourceTexts: [card.sourceSentence, card.frontText],
    targetLanguageCode
  });
}

function uniqueNonEmptyStrings(values: unknown[]) {
  const seen = new Set<string>();
  const result: string[] = [];
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

function normalizeColorKey(value: unknown, index: number): HighlightColorKey {
  return cardColorKeys.includes(value as HighlightColorKey)
    ? (value as HighlightColorKey)
    : cardColorKeys[index % cardColorKeys.length];
}

function parseSelectedTerms(selectedText: string) {
  const terms = selectedText
    .split(",")
    .map((term) => term.trim())
    .filter(Boolean);
  return terms.length ? terms.slice(0, cardColorKeys.length) : [selectedText.trim()].filter(Boolean);
}

function createCardJsonShape(overrides: Partial<GeneratedCardData> = {}) {
  return {
    cardType: overrides.cardType ?? "reading",
    deckType: overrides.deckType ?? "input",
    direction: overrides.direction ?? "target_to_native",
    sourceSentence: "source sentence",
    targetText: "",
    frontText: "source sentence",
    literalTranslationKo: "literal explanation in native language",
    naturalTranslationKo: "natural translation/explanation in native language",
    highlightMappings: [
      {
        sourceText: "selected term",
        literalKo: "literal meaning",
        naturalKo: "context meaning",
        colorKey: "red"
      }
    ],
    vocabularyItems: [
      {
        term: "selected term",
        ipa: "",
        partOfSpeech: "noun/verb/adjective/etc.",
        basicMeaningKo: "basic meaning in native language",
        meaningInContextKo: "meaning in this sentence",
        etymologyKo: "term origin, morphology, or memory-friendly structure only; no source/capture metadata",
        usagePatterns: ["Collocation: selected term + noun", "common pattern 1", "common pattern 2"],
        colorKey: "red",
        examples: [
          "new short target-language example 1",
          "new short target-language example 2",
          "new short target-language example 3"
        ],
        exampleTranslationsKo: [
          "Korean translation of example 1",
          "Korean translation of example 2",
          "Korean translation of example 3"
        ]
      }
    ],
    readingStructure: {
      segments: [
        {
          id: "clause-1-subject",
          text: "exact contiguous source text",
          labelKo: "role label in native language",
          tone: "subject",
          groupId: "clause-1"
        },
        {
          id: "clause-1-action",
          text: "remaining exact source text including punctuation",
          labelKo: "role label in native language",
          tone: "action",
          groupId: "clause-1"
        }
      ],
      groups: [
        {
          id: "clause-1",
          kind: "clause",
          titleKo: "clause title in native language",
          summaryKo: "one-line natural meaning in native language",
          segmentIds: ["clause-1-subject", "clause-1-action"]
        }
      ]
    },
    structureNote: "",
    confusingComparisons: [
      {
        kind: "similar",
        title: "encounter vs meet",
        explanationKo: "short distinction in native language with one example sentence for each side"
      }
    ],
    pumpPrompts: [],
    ...(overrides.listeningStudyGuide
      ? { listeningStudyGuide: overrides.listeningStudyGuide }
      : {})
  };
}

function createListeningStudyGuideJsonShape(): NonNullable<GeneratedCardData["listeningStudyGuide"]> {
  return {
    templateVersion: "listening-adaptive-v1",
    listeningIssue: {
      title: "main connected-speech issue in Korean",
      bodyKo: "concise explanation of why the actual sound is easy to miss"
    },
    chunks: [
      {
        en: "exact ordered source-sentence chunk",
        pronunciationKo: "Hangul connected-speech guide",
        ipa: "/full chunk IPA with ˈ stress/",
        reasonKo: "specific linking, reduction, contraction, stress, or rhythm explanation in Korean"
      }
    ],
    dictation: {
      prompt: "source sentence with one difficult expression replaced by ____",
      answer: "exact omitted source expression",
      explanationKo: "heard sound versus written form explanation in Korean"
    }
  };
}
