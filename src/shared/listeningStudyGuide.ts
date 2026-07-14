import type {
  HighlightMapping,
  ListeningStudyGuide,
  VocabularyItem
} from "./types";

type ListeningStudyGuideContext = {
  sentence: string;
  highlightMappings?: HighlightMapping[];
  vocabularyItems?: VocabularyItem[];
};

export function normalizeListeningStudyGuide(
  guide: ListeningStudyGuide | undefined,
  {
    sentence,
    highlightMappings = [],
    vocabularyItems = []
  }: ListeningStudyGuideContext
): ListeningStudyGuide {
  const fallback = createFallbackListeningStudyGuide({
    sentence,
    highlightMappings,
    vocabularyItems
  });
  if (!guide || guide.templateVersion !== "listening-adaptive-v1") {
    return fallback;
  }

  const chunks = Array.isArray(guide.chunks)
    ? guide.chunks
        .map((chunk) => ({
          en: cleanText(chunk?.en),
          pronunciationKo: cleanText(chunk?.pronunciationKo),
          ipa: normalizeIpa(chunk?.ipa),
          reasonKo: cleanText(chunk?.reasonKo)
        }))
        .filter((chunk) => chunk.en)
        .slice(0, 4)
    : [];

  return {
    templateVersion: "listening-adaptive-v1",
    ...(guide.prototype ? { prototype: true } : {}),
    listeningIssue: {
      title: cleanText(guide.listeningIssue?.title) || fallback.listeningIssue.title,
      bodyKo: cleanText(guide.listeningIssue?.bodyKo) || fallback.listeningIssue.bodyKo
    },
    chunks: chunks.length ? chunks : fallback.chunks,
    dictation: {
      prompt: cleanText(guide.dictation?.prompt) || fallback.dictation.prompt,
      answer: cleanText(guide.dictation?.answer) || fallback.dictation.answer,
      explanationKo:
        cleanText(guide.dictation?.explanationKo) || fallback.dictation.explanationKo
    }
  };
}

export function createFallbackListeningStudyGuide({
  sentence,
  highlightMappings = [],
  vocabularyItems = []
}: ListeningStudyGuideContext): ListeningStudyGuide {
  const normalizedSentence = cleanText(sentence);
  const focusExpression =
    highlightMappings.map((mapping) => cleanText(mapping.sourceText)).find(Boolean) ||
    vocabularyItems.map((item) => cleanText(item.term)).find(Boolean) ||
    pickMiddleWord(normalizedSentence);
  const chunks = splitListeningSentence(normalizedSentence).map((en) => {
    const vocabulary = vocabularyItems.find((item) =>
      includesExpression(en, cleanText(item.term))
    );
    const focusesSelectedExpression = includesExpression(en, focusExpression);
    return {
      en,
      pronunciationKo: "",
      ipa: normalizeIpa(vocabulary?.ipa),
      reasonKo: focusesSelectedExpression
        ? `${focusExpression} 앞뒤의 소리가 이어지는 구간입니다. 단어를 따로 떼지 말고 한 덩어리로 들어보세요.`
        : "의미 단위의 리듬을 먼저 잡고, 약하게 발음되는 기능어와 단어 경계를 확인하세요."
    };
  });
  const prompt = createDictationPrompt(normalizedSentence, focusExpression);

  return {
    templateVersion: "listening-adaptive-v1",
    listeningIssue: {
      title: focusExpression ? `${focusExpression}의 실제 소리 확인` : "단어 경계와 약한 소리 확인",
      bodyKo: focusExpression
        ? `문장 속 ${focusExpression}은 앞뒤 소리와 연결되거나 강세가 약해져 철자대로 또렷하게 들리지 않을 수 있습니다.`
        : "빠른 말에서는 단어 경계가 흐려지고 기능어가 약해져, 알고 있는 문장도 놓치기 쉽습니다."
    },
    chunks,
    dictation: {
      prompt,
      answer: focusExpression,
      explanationKo: focusExpression
        ? `빈칸에는 원문 표기인 ${focusExpression}을 적습니다. 먼저 소리 덩어리를 듣고 철자를 복원해 보세요.`
        : "문장을 의미 단위로 다시 듣고 빠진 표현을 원문 철자로 복원해 보세요."
    }
  };
}

function splitListeningSentence(sentence: string) {
  const words = sentence.split(/\s+/).filter(Boolean);
  if (words.length <= 4) {
    return sentence ? [sentence] : [];
  }
  const chunkCount = words.length >= 8 ? 3 : 2;
  const baseSize = Math.ceil(words.length / chunkCount);
  const chunks: string[] = [];
  for (let index = 0; index < words.length; index += baseSize) {
    chunks.push(words.slice(index, index + baseSize).join(" "));
  }
  if (chunks.length > 3) {
    chunks[2] = chunks.slice(2).join(" ");
    return chunks.slice(0, 3);
  }
  return chunks;
}

function createDictationPrompt(sentence: string, answer: string) {
  if (!sentence || !answer) {
    return sentence;
  }
  const expressionPattern = new RegExp(escapeRegExp(answer), "i");
  return expressionPattern.test(sentence)
    ? sentence.replace(expressionPattern, "____")
    : sentence;
}

function pickMiddleWord(sentence: string) {
  const words = sentence.match(/[\p{L}\p{N}'’-]+/gu) ?? [];
  return words[Math.floor(words.length / 2)] ?? "";
}

function includesExpression(text: string, expression: string) {
  return Boolean(expression) && text.toLocaleLowerCase().includes(expression.toLocaleLowerCase());
}

function normalizeIpa(value: unknown) {
  const text = cleanText(value);
  if (!text) {
    return "";
  }
  return text.startsWith("/") && text.endsWith("/") ? text : `/${text.replace(/^\/+|\/+$/g, "")}/`;
}

function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
