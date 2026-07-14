import type { LLMProvider } from "../services/llm/types";
import { createStudyCardFromGenerated } from "../shared/cardFactory";
import { randomId } from "../shared/ids";
import type { ListeningLoopSegment } from "../shared/listeningLoopSeeds";
import { normalizeInputListeningCardVocabulary } from "../shared/listeningVocabularyPolicy";
import { normalizeListeningStudyGuide } from "../shared/listeningStudyGuide";
import { createInitialSrs } from "../shared/srs";
import type {
  AppSettings,
  CardLanguageMetadata,
  HighlightMapping,
  InputLanguageCode,
  ProfileId,
  StudyCard
} from "../shared/types";

type CreateListeningLoopInputCardInput = {
  provider: LLMProvider;
  profileId: ProfileId;
  settings: AppSettings;
  segment: ListeningLoopSegment;
  sourceKey: string;
  sourceLanguageCode: string;
  targetLanguageCode: string;
  nativeLanguageCode: string;
  videoTitle: string;
  channelName: string;
  highlightMappings: HighlightMapping[];
  structureNote: string;
  beforeSentence?: string;
  afterSentence?: string;
  readerTextContext?: string;
  now?: Date;
};

export async function createListeningLoopInputCard({
  provider,
  profileId,
  settings,
  segment,
  sourceKey,
  sourceLanguageCode,
  targetLanguageCode,
  nativeLanguageCode,
  videoTitle,
  channelName,
  highlightMappings,
  structureNote,
  beforeSentence,
  afterSentence,
  readerTextContext,
  now = new Date()
}: CreateListeningLoopInputCardInput): Promise<StudyCard> {
  const languageMetadata: CardLanguageMetadata = {
    profileTargetLanguageCode: targetLanguageCode,
    profileNativeLanguageCode: normalizeListeningLanguageCode(nativeLanguageCode),
    detectedSourceLanguageCode: toInputLanguageCode(sourceLanguageCode || targetLanguageCode),
    actualSourceLanguageCode: normalizeListeningLanguageCode(sourceLanguageCode) || targetLanguageCode,
    confidence: 1,
    policyStatus: "match",
    sourceKind: "original"
  };
  const selectedText = getListeningCardSelectedText(highlightMappings, segment.text);
  const generated = await provider.generateReadingCard({
    selectedText,
    sourceSentence: segment.text,
    beforeSentence,
    afterSentence,
    readerTextContext: readerTextContext || segment.text,
    translationContext: buildListeningCardTranslationContext({
      segment,
      videoTitle,
      channelName
    }),
    learningProfile: settings.learningProfile,
    learnerLevel: "intermediate",
    generationMode: "listening"
  });
  const generatedCard = createStudyCardFromGenerated({
    ...generated,
    id: randomId(),
    profileId,
    languageMetadata
  });
  const timestamp = now.toISOString();

  const mergedHighlightMappings = mergeListeningGeneratedHighlightMappings(
    generatedCard.highlightMappings,
    highlightMappings
  );
  const listeningCard = normalizeInputListeningCardVocabulary({
    ...generatedCard,
    profileId,
    cardType: "reading",
    deckType: "input-listening",
    direction: "target_to_native",
    languageMetadata,
    sourceSentence: segment.text,
    targetText: sourceKey,
    frontText: segment.text,
    literalTranslationKo: firstNonEmpty(
      generatedCard.literalTranslationKo,
      segment.translationKo,
      generatedCard.naturalTranslationKo
    ),
    naturalTranslationKo: firstNonEmpty(
      generatedCard.naturalTranslationKo,
      segment.noteKo,
      segment.translationKo,
      generatedCard.literalTranslationKo
    ),
    highlightMappings: mergedHighlightMappings,
    listeningStudyGuide: normalizeListeningStudyGuide(generatedCard.listeningStudyGuide, {
      sentence: segment.text,
      highlightMappings: mergedHighlightMappings,
      vocabularyItems: generatedCard.vocabularyItems
    }),
    structureNote,
    pumpPrompts: [],
    srs: createInitialSrs(now),
    createdAt: timestamp,
    updatedAt: timestamp
  });
  return listeningCard;
}

export function getListeningCardSelectedText(
  highlightMappings: HighlightMapping[],
  sourceSentence: string
) {
  const selectedTerms = highlightMappings
    .map((mapping) => mapping.sourceText.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return selectedTerms.length ? selectedTerms.join(", ") : sourceSentence.trim();
}

export function mergeListeningGeneratedHighlightMappings(
  generatedMappings: HighlightMapping[],
  soundPointMappings: HighlightMapping[]
) {
  const generatedBySource = new Map(
    generatedMappings.map((mapping) => [normalizeHighlightKey(mapping.sourceText), mapping])
  );
  const merged: HighlightMapping[] = [];
  const usedKeys = new Set<string>();

  for (const mapping of soundPointMappings) {
    const key = normalizeHighlightKey(mapping.sourceText);
    if (!key) {
      continue;
    }
    const generated = generatedBySource.get(key);
    usedKeys.add(key);
    merged.push({
      ...generated,
      ...mapping,
      literalKo: mapping.literalKo || generated?.literalKo,
      naturalKo: mapping.naturalKo || generated?.naturalKo,
      colorKey: mapping.colorKey || generated?.colorKey || "yellow"
    });
  }

  for (const mapping of generatedMappings) {
    const key = normalizeHighlightKey(mapping.sourceText);
    if (!key || usedKeys.has(key)) {
      continue;
    }
    merged.push(mapping);
  }

  return merged;
}

function buildListeningCardTranslationContext({
  segment,
  videoTitle,
  channelName
}: {
  segment: ListeningLoopSegment;
  videoTitle: string;
  channelName: string;
}) {
  return [
    videoTitle ? `Video title: ${videoTitle}` : "",
    channelName ? `Channel: ${channelName}` : "",
    segment.translationKo ? `Existing Korean translation: ${segment.translationKo}` : "",
    segment.noteKo ? `Existing Korean note: ${segment.noteKo}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function firstNonEmpty(...values: Array<string | undefined>) {
  return values.map((value) => value?.trim()).find((value): value is string => Boolean(value)) ?? "";
}

function normalizeHighlightKey(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeListeningLanguageCode(languageCode: string | undefined) {
  return String(languageCode ?? "").trim().toLowerCase().split("-")[0];
}

function toInputLanguageCode(value: string | undefined): InputLanguageCode {
  const normalized = normalizeListeningLanguageCode(value);
  return normalized === "en" || normalized === "ja" || normalized === "ko"
    ? normalized
    : "unknown";
}
