import type {
  OutputStudyChunk,
  OutputStudyGuide,
  OutputStudySentence
} from "./types";

type PronunciationFields = {
  en: string;
  ko: string;
  pronunciationKo: string;
  ipa: string;
};

export function normalizeOutputStudyGuidePronunciations(
  guide: OutputStudyGuide | undefined
): OutputStudyGuide | undefined {
  if (!guide) {
    return guide;
  }

  const references = collectValidPronunciationReferences(guide);
  const normalizeSentence = (sentence: OutputStudySentence): OutputStudySentence =>
    normalizePronunciationFields(sentence, references);
  const normalizeChunk = (chunk: OutputStudyChunk): OutputStudyChunk =>
    normalizePronunciationFields(chunk, references);

  return {
    ...guide,
    dialogue: guide.dialogue.map(normalizeSentence),
    keyChunks: guide.keyChunks.map(normalizeChunk),
    alternatives: guide.alternatives.map(normalizeSentence),
    commonMistake: guide.commonMistake
      ? {
          ...guide.commonMistake,
          wrong: guide.commonMistake.wrong
            ? normalizeSentence(guide.commonMistake.wrong)
            : undefined,
          right: normalizeSentence(guide.commonMistake.right)
        }
      : undefined,
    miniDrills: guide.miniDrills.map(normalizeSentence)
  };
}

export function pronunciationMatchesNativeMeaning({
  en,
  ko,
  pronunciationKo
}: Pick<PronunciationFields, "en" | "ko" | "pronunciationKo">) {
  const targetText = normalizeComparableText(en);
  const nativeText = normalizeHangulText(ko);
  const pronunciation = normalizeHangulText(pronunciationKo);
  if (!targetText || !nativeText || !pronunciation || targetText === normalizeComparableText(ko)) {
    return false;
  }
  if (pronunciation === nativeText) {
    return true;
  }
  return nativeText.length >= 5 && pronunciation.length >= 5
    ? getBigramSimilarity(nativeText, pronunciation) >= 0.78
    : false;
}

function collectValidPronunciationReferences(guide: OutputStudyGuide) {
  const values: PronunciationFields[] = [
    ...guide.dialogue,
    ...guide.keyChunks,
    ...guide.alternatives,
    ...(guide.commonMistake?.wrong ? [guide.commonMistake.wrong] : []),
    ...(guide.commonMistake ? [guide.commonMistake.right] : []),
    ...guide.miniDrills
  ];
  const references = new Map<string, Pick<PronunciationFields, "pronunciationKo" | "ipa">>();
  for (const value of values) {
    const key = normalizeComparableText(value.en);
    if (
      key &&
      value.pronunciationKo.trim() &&
      value.ipa.trim() &&
      !pronunciationMatchesNativeMeaning(value)
    ) {
      references.set(key, {
        pronunciationKo: value.pronunciationKo.trim(),
        ipa: value.ipa.trim()
      });
    }
  }
  return references;
}

function normalizePronunciationFields<T extends PronunciationFields>(
  value: T,
  references: Map<string, Pick<PronunciationFields, "pronunciationKo" | "ipa">>
): T {
  if (!pronunciationMatchesNativeMeaning(value)) {
    return value;
  }
  const replacement = references.get(normalizeComparableText(value.en));
  return {
    ...value,
    pronunciationKo: replacement?.pronunciationKo ?? "",
    ipa: replacement?.ipa ?? ""
  };
}

function normalizeComparableText(value: unknown) {
  return String(value ?? "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function normalizeHangulText(value: unknown) {
  return (String(value ?? "").match(/[가-힣]+/g) ?? []).join("");
}

function getBigramSimilarity(left: string, right: string) {
  const leftPairs = createBigrams(left);
  const rightPairs = createBigrams(right);
  if (!leftPairs.length || !rightPairs.length) {
    return left === right ? 1 : 0;
  }
  const remaining = [...rightPairs];
  let overlap = 0;
  for (const pair of leftPairs) {
    const index = remaining.indexOf(pair);
    if (index >= 0) {
      overlap += 1;
      remaining.splice(index, 1);
    }
  }
  return (2 * overlap) / (leftPairs.length + rightPairs.length);
}

function createBigrams(value: string) {
  return Array.from({ length: Math.max(0, value.length - 1) }, (_, index) =>
    value.slice(index, index + 2)
  );
}
