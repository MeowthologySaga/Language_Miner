import type { ReadingSentenceStructure } from "./types";

const readingSegmentTones = new Set(["subject", "action", "object", "connector"]);
const readingGroupKinds = new Set(["clause", "connector"]);
const fallbackConnectors = new Set([
  "and",
  "although",
  "because",
  "but",
  "however",
  "if",
  "instead",
  "meanwhile",
  "moreover",
  "nevertheless",
  "or",
  "otherwise",
  "so",
  "therefore",
  "though",
  "when",
  "while",
  "yet"
]);
const fallbackVerbAnchors = new Set([
  "am",
  "are",
  "be",
  "been",
  "being",
  "can",
  "could",
  "did",
  "do",
  "does",
  "had",
  "has",
  "have",
  "is",
  "may",
  "might",
  "must",
  "need",
  "needs",
  "needed",
  "shall",
  "should",
  "was",
  "were",
  "will",
  "would"
]);

export function normalizeReadingSentenceStructure(
  value: unknown,
  sourceSentence?: string
): ReadingSentenceStructure | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Partial<ReadingSentenceStructure>;
  if (!Array.isArray(candidate.segments) || !Array.isArray(candidate.groups)) {
    return undefined;
  }

  const segmentIds = new Set<string>();
  const segments = candidate.segments
    .map((segment) => {
      const id = String(segment?.id ?? "").trim();
      const text = String(segment?.text ?? "").trim();
      const labelKo = String(segment?.labelKo ?? "").trim();
      const tone = String(segment?.tone ?? "").trim();
      const groupId = String(segment?.groupId ?? "").trim();
      if (
        !id ||
        !text ||
        !labelKo ||
        !groupId ||
        segmentIds.has(id) ||
        !readingSegmentTones.has(tone)
      ) {
        return null;
      }
      segmentIds.add(id);
      return {
        id,
        text,
        labelKo,
        tone: tone as ReadingSentenceStructure["segments"][number]["tone"],
        groupId
      };
    })
    .filter((segment): segment is ReadingSentenceStructure["segments"][number] => Boolean(segment));

  const groupIds = new Set<string>();
  const groups = candidate.groups
    .map((group) => {
      const id = String(group?.id ?? "").trim();
      const kind = String(group?.kind ?? "").trim();
      const titleKo = String(group?.titleKo ?? "").trim();
      const summaryKo = String(group?.summaryKo ?? "").trim();
      const normalizedSegmentIds = Array.isArray(group?.segmentIds)
        ? group.segmentIds.map((segmentId) => String(segmentId).trim()).filter((segmentId) => segmentIds.has(segmentId))
        : [];
      if (
        !id ||
        !titleKo ||
        !summaryKo ||
        groupIds.has(id) ||
        !readingGroupKinds.has(kind) ||
        !normalizedSegmentIds.length
      ) {
        return null;
      }
      groupIds.add(id);
      return {
        id,
        kind: kind as ReadingSentenceStructure["groups"][number]["kind"],
        titleKo,
        summaryKo,
        segmentIds: normalizedSegmentIds
      };
    })
    .filter((group): group is ReadingSentenceStructure["groups"][number] => Boolean(group));

  if (
    segments.length < 2 ||
    !groups.length ||
    segments.some((segment) => !groupIds.has(segment.groupId))
  ) {
    return undefined;
  }

  if (sourceSentence && normalizeSentenceText(segments.map((segment) => segment.text).join(" ")) !== normalizeSentenceText(sourceSentence)) {
    return undefined;
  }

  return { segments, groups };
}

export function createFallbackReadingSentenceStructure(
  sourceSentence?: string
): ReadingSentenceStructure | undefined {
  const source = String(sourceSentence ?? "").replace(/\s+/g, " ").trim();
  if (!source) {
    return undefined;
  }

  const words = source.split(" ").filter(Boolean);
  if (words.length < 2) {
    return createCompactFallbackStructure(source);
  }

  const segments: ReadingSentenceStructure["segments"] = [];
  const groups: ReadingSentenceStructure["groups"] = [];
  let clauseWords: string[] = [];
  let clauseIndex = 0;
  let connectorIndex = 0;

  const flushClause = () => {
    if (!clauseWords.length) {
      return;
    }
    clauseIndex += 1;
    const groupId = `fallback-clause-${clauseIndex}`;
    const verbIndex = findFallbackVerbIndex(clauseWords);
    const subjectWords = clauseWords.slice(0, verbIndex);
    const predicateWords = clauseWords.slice(verbIndex);
    const segmentIds: string[] = [];

    if (subjectWords.length) {
      const id = `${groupId}-subject`;
      segments.push({
        id,
        text: subjectWords.join(" "),
        labelKo: "주어·화제",
        tone: "subject",
        groupId
      });
      segmentIds.push(id);
    }
    if (predicateWords.length) {
      const id = `${groupId}-action`;
      segments.push({
        id,
        text: predicateWords.join(" "),
        labelKo: "서술부",
        tone: "action",
        groupId
      });
      segmentIds.push(id);
    }

    groups.push({
      id: groupId,
      kind: "clause",
      titleKo: `절 ${clauseIndex} · 의미 단위`,
      summaryKo: "주어 또는 화제와 그에 대한 설명이 이어지는 부분입니다.",
      segmentIds
    });
    clauseWords = [];
  };

  words.forEach((word) => {
    const connector = normalizeFallbackWord(word);
    if (fallbackConnectors.has(connector)) {
      flushClause();
      connectorIndex += 1;
      const groupId = `fallback-connector-${connectorIndex}`;
      const id = `${groupId}-segment`;
      segments.push({
        id,
        text: word,
        labelKo: "연결어",
        tone: "connector",
        groupId
      });
      groups.push({
        id: groupId,
        kind: "connector",
        titleKo: `${connector || "연결어"} · 흐름 연결`,
        summaryKo: "앞뒤 의미를 연결하거나 문장의 흐름을 전환합니다.",
        segmentIds: [id]
      });
      return;
    }

    clauseWords.push(word);
    if (/;$/u.test(word)) {
      flushClause();
    }
  });
  flushClause();

  if (segments.length < 2 || !groups.length) {
    return createCompactFallbackStructure(source);
  }
  return { segments, groups };
}

function findFallbackVerbIndex(words: string[]) {
  for (let index = 1; index < words.length; index += 1) {
    const word = normalizeFallbackWord(words[index]);
    if (
      fallbackVerbAnchors.has(word) ||
      /(?:ed|ing)$/u.test(word) ||
      (/(?:s|es)$/u.test(word) && !/(?:ss|us)$/u.test(word))
    ) {
      return index;
    }
  }
  return Math.min(Math.max(1, Math.ceil(words.length / 3)), words.length - 1);
}

function normalizeFallbackWord(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
}

function createCompactFallbackStructure(source: string): ReadingSentenceStructure | undefined {
  const characters = Array.from(source);
  if (characters.length < 2) {
    return undefined;
  }
  const splitAt = Math.max(1, Math.min(characters.length - 1, Math.ceil(characters.length / 2)));
  const first = characters.slice(0, splitAt).join("");
  const second = characters.slice(splitAt).join("");
  return {
    segments: [
      {
        id: "fallback-clause-1-topic",
        text: first,
        labelKo: "앞부분",
        tone: "subject",
        groupId: "fallback-clause-1"
      },
      {
        id: "fallback-clause-1-detail",
        text: second,
        labelKo: "뒷부분",
        tone: "action",
        groupId: "fallback-clause-1"
      }
    ],
    groups: [
      {
        id: "fallback-clause-1",
        kind: "clause",
        titleKo: "절 1 · 의미 단위",
        summaryKo: "문장을 앞부분과 뒷부분으로 나누어 전체 흐름을 확인합니다.",
        segmentIds: ["fallback-clause-1-topic", "fallback-clause-1-detail"]
      }
    ]
  };
}

function normalizeSentenceText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
