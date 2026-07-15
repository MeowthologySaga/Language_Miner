import { createInitialSrs } from "./srs";
import type {
  HighlightColorKey,
  ProfileId,
  ReadingSentenceStructure,
  StudyCard
} from "./types";

export const DEFAULT_SAMPLE_CARD_SEED_VERSION = 27;
export const DEFAULT_OUTPUT_MOCK_CARD_SEED_VERSION = 13;

export function getDefaultSampleCardIds(profileId: ProfileId) {
  return {
    reading: `sample:${profileId}:input-reading:final-template:v2`,
    readingContrast: `sample:${profileId}:input-reading:final-template-contrast:v2`,
    readingReason: `sample:${profileId}:input-reading:final-template-reason:v2`,
    listening: `sample:${profileId}:input-listening:final-template:v2`,
    listeningContraction: `sample:${profileId}:input-listening:final-template-contraction:v2`,
    listeningLinking: `sample:${profileId}:input-listening:final-template-linking:v2`,
    output: `sample:${profileId}:output:final-template:v2`,
    outputContext: `sample:${profileId}:output:final-template-context:v2`,
    outputHealth: `sample:${profileId}:output:final-template-clarification:v3`
  };
}

export function getLegacyReadingPrototypeCardId(profileId: ProfileId) {
  return `sample:${profileId}:input-reading:adaptive-prototype:v1`;
}

export function getLegacyOutputHealthCardId(profileId: ProfileId) {
  return `sample:${profileId}:output:final-template-health:v2`;
}

export function isDefaultSampleCardId(cardId: string) {
  return /^sample:[^:]+:(?:input-reading|input-listening|output):[^:]+:v\d+$/.test(cardId);
}

export function isDefaultOutputMockCardId(cardId: string) {
  return /^sample:[^:]+:output:(?:mock|prototype)-[^:]+:v\d+$/.test(cardId);
}

export function createDefaultSampleCards(
  profileId: ProfileId,
  createdAt = new Date()
): StudyCard[] {
  const now = createdAt.toISOString();
  const srs = createInitialSrs(createdAt);
  const ids = getDefaultSampleCardIds(profileId);

  return [
    createOnboardingReadingCard(profileId, ids.reading, now, srs),
    createFinalReadingContrastCard(profileId, ids.readingContrast, now, srs),
    createFinalReadingReasonCard(profileId, ids.readingReason, now, srs),
    createOnboardingListeningCard(profileId, ids.listening, now, srs),
    createFinalListeningContractionCard(profileId, ids.listeningContraction, now, srs),
    createFinalListeningLinkingCard(profileId, ids.listeningLinking, now, srs),
    createOnboardingOutputCard(profileId, ids.output, now, srs),
    createFinalOutputContextCard(profileId, ids.outputContext, now, srs),
    createOnboardingOutputClarificationCard(profileId, ids.outputHealth, now, srs)
  ];
}

function createFinalReadingCard(
  profileId: ProfileId,
  id: string,
  now: string,
  srs: StudyCard["srs"]
): StudyCard {
  const sourceSentence =
    "The cautious apprentice was going to unlock the ancient gate, but his reckless rival rushed ahead.";
  return {
    id,
    profileId,
    cardType: "reading",
    deckType: "input",
    direction: "target_to_native",
    languageMetadata: {
      profileTargetLanguageCode: "en",
      profileNativeLanguageCode: "ko",
      detectedSourceLanguageCode: "en",
      actualSourceLanguageCode: "en",
      confidence: 1,
      policyStatus: "match",
      sourceKind: "original"
    },
    sourceSentence,
    frontText: sourceSentence,
    literalTranslationKo:
      "그 신중한 견습생은 고대의 문을 열려고 했지만, 그의 무모한 경쟁자는 앞서 급히 달려갔다.",
    naturalTranslationKo:
      "신중한 견습생이 고대의 문을 열려고 하던 순간, 무모한 라이벌이 먼저 성급하게 뛰쳐나갔다.",
    highlightMappings: [
      {
        sourceText: "was going to",
        literalKo: "열려고 했지만",
        naturalKo: "열려고 하던 순간",
        colorKey: "cyan"
      },
      {
        sourceText: "cautious",
        literalKo: "신중한",
        naturalKo: "신중한",
        colorKey: "orange"
      },
      {
        sourceText: "reckless",
        literalKo: "무모한",
        naturalKo: "무모한",
        colorKey: "purple"
      }
    ],
    vocabularyItems: [
      {
        term: "was going to",
        ipa: "/wəz ˈɡoʊɪŋ tə/",
        partOfSpeech: "phrase",
        basicMeaningKo: "막 …하려고 했다, …할 예정이었다",
        meaningInContextKo: "문을 열려던 계획이나 직전의 움직임이 있었음을 보여줍니다.",
        etymologyKo:
          "be going to + 동사원형 구조입니다. 과거형 was going to는 과거의 계획이나 막 하려던 일을 나타냅니다.",
        usagePatterns: [
          "Collocation: be going to + verb",
          "was going to unlock/open/say",
          "going to + verb"
        ],
        colorKey: "cyan",
        examples: [
          "I was going to call you.",
          "She was going to open the box.",
          "They were going to leave early."
        ],
        exampleTranslationsKo: [
          "나는 너에게 전화하려고 했다.",
          "그녀는 그 상자를 열려고 했다.",
          "그들은 일찍 떠나려고 했다."
        ]
      },
      {
        term: "cautious",
        ipa: "/ˈkɔːʃəs/",
        partOfSpeech: "adjective",
        basicMeaningKo: "조심스러운, 신중한",
        meaningInContextKo: "위험할 수 있는 문 앞에서 서두르지 않는 태도를 나타냅니다.",
        etymologyKo:
          "cautious는 caution(주의, 조심)과 같은 뿌리를 가진 말로, 위험을 예상하고 확인하는 느낌을 줍니다.",
        usagePatterns: [
          "Collocation: cautious + noun",
          "be cautious about + noun/gerund",
          "take a cautious step"
        ],
        colorKey: "orange",
        examples: [
          "The cautious driver slowed down.",
          "Be cautious about sharing passwords.",
          "She took a cautious step forward."
        ],
        exampleTranslationsKo: [
          "신중한 운전자는 속도를 늦췄다.",
          "비밀번호를 공유할 때는 조심하세요.",
          "그녀는 조심스럽게 앞으로 한 걸음 내디뎠다."
        ]
      },
      {
        term: "reckless",
        ipa: "/ˈrekləs/",
        partOfSpeech: "adjective",
        basicMeaningKo: "무모한, 앞뒤를 가리지 않는",
        meaningInContextKo: "위험을 충분히 생각하지 않고 성급하게 앞서 나가는 태도입니다.",
        etymologyKo:
          "reckless는 reck(주의하다) + -less(…이 없는)에서 온 말로, 조심이나 고려가 부족한 상태를 뜻합니다.",
        usagePatterns: [
          "Collocation: reckless + driver/decision/risk",
          "reckless behavior",
          "a reckless mistake"
        ],
        colorKey: "purple",
        examples: [
          "The reckless driver ignored the sign.",
          "It was reckless to cross the ice.",
          "A brave choice is not always reckless."
        ],
        exampleTranslationsKo: [
          "그 무모한 운전자는 표지판을 무시했다.",
          "얼음 위를 건너는 것은 무모했다.",
          "용감한 선택이 항상 무모한 것은 아니다."
        ]
      }
    ],
    readingStructure: createFinalReadingStructure(),
    confusingComparisons: [
      {
        kind: "similar",
        title: "was going to vs planned to",
        explanationKo:
          "was going to는 막 하려던 흐름을 자연스럽게 보여주고, planned to는 계획했다는 사실을 더 명시적으로 말합니다."
      },
      {
        kind: "contrast",
        title: "cautious vs reckless",
        explanationKo:
          "cautious는 위험을 생각하고 조심하는 태도이고, reckless는 위험을 충분히 고려하지 않는 반대 태도입니다."
      },
      {
        kind: "nuance",
        title: "reckless vs brave",
        explanationKo:
          "brave는 위험을 알면서 용기 있게 행동하는 긍정적 표현이고, reckless는 숙고가 부족하다는 부정적 느낌입니다."
      }
    ],
    pumpPrompts: [],
    structureNote: "Language Miner 기본 카드 · 확정 인풋-리딩 템플릿",
    tags: ["기본카드", "리딩", "문장구조"],
    srs: { ...srs },
    createdAt: now,
    updatedAt: now
  };
}

function createFinalReadingStructure(): ReadingSentenceStructure {
  return {
    segments: [
      {
        id: "plan-subject",
        text: "The cautious apprentice",
        labelKo: "주어",
        tone: "subject",
        groupId: "original-plan"
      },
      {
        id: "plan-action",
        text: "was going to unlock",
        labelKo: "동사구 · 하려던 행동",
        tone: "action",
        groupId: "original-plan"
      },
      {
        id: "plan-object",
        text: "the ancient gate,",
        labelKo: "목적어",
        tone: "object",
        groupId: "original-plan"
      },
      {
        id: "contrast-connector",
        text: "but",
        labelKo: "반전 연결어",
        tone: "connector",
        groupId: "contrast"
      },
      {
        id: "event-subject",
        text: "his reckless rival",
        labelKo: "새로운 주어",
        tone: "subject",
        groupId: "actual-event"
      },
      {
        id: "event-action",
        text: "rushed ahead.",
        labelKo: "실제 행동",
        tone: "action",
        groupId: "actual-event"
      }
    ],
    groups: [
      {
        id: "original-plan",
        kind: "clause",
        titleKo: "절 1 · 원래 계획",
        summaryKo: "신중한 견습생이 고대의 문을 열려고 했습니다.",
        segmentIds: ["plan-subject", "plan-action", "plan-object"]
      },
      {
        id: "contrast",
        kind: "connector",
        titleKo: "but · 예상 뒤집기",
        summaryKo: "앞의 계획과 실제 사건이 달라집니다.",
        segmentIds: ["contrast-connector"]
      },
      {
        id: "actual-event",
        kind: "clause",
        titleKo: "절 2 · 실제 사건",
        summaryKo: "무모한 라이벌이 먼저 성급하게 뛰어나갔습니다.",
        segmentIds: ["event-subject", "event-action"]
      }
    ]
  };
}

function createOnboardingReadingCard(
  profileId: ProfileId,
  id: string,
  now: string,
  srs: StudyCard["srs"]
): StudyCard {
  const base = createFinalReadingCard(profileId, id, now, srs);
  const sourceSentence = "I’m running a little late.";
  return {
    ...base,
    sourceSentence,
    frontText: sourceSentence,
    literalTranslationKo: "나는 조금 늦게 가고 있어.",
    naturalTranslationKo: "조금 늦고 있어.",
    highlightMappings: [
      {
        sourceText: "running a little late",
        literalKo: "조금 늦게 가고 있어",
        naturalKo: "조금 늦고 있어",
        colorKey: "cyan"
      }
    ],
    vocabularyItems: [
      createReadingVocabulary(
        "run late",
        "/rʌn leɪt/",
        "phrase",
        "예정보다 늦다",
        "약속이나 일정에 맞춘 도착이 조금 늦어지고 있음을 자연스럽게 알립니다.",
        "cyan",
        ["Sorry, I’m running late.", "The meeting is running a little late."],
        ["미안, 나 늦고 있어.", "회의가 조금 늦어지고 있어요."]
      )
    ],
    readingStructure: {
      segments: [
        { id: "speaker", text: "I’m", labelKo: "주어 + be동사", tone: "subject", groupId: "current-situation" },
        { id: "progress", text: "running", labelKo: "진행 중인 상황", tone: "action", groupId: "current-situation" },
        { id: "degree", text: "a little", labelKo: "정도 · 조금", tone: "connector", groupId: "current-situation" },
        { id: "delay", text: "late.", labelKo: "늦은 상태", tone: "object", groupId: "current-situation" }
      ],
      groups: [
        {
          id: "current-situation",
          kind: "clause",
          titleKo: "한 문장 · 현재 늦어지는 상황",
          summaryKo: "지금 이동 중이며 도착이 조금 늦어지고 있음을 상대에게 알립니다.",
          segmentIds: ["speaker", "progress", "degree", "delay"]
        }
      ]
    },
    confusingComparisons: [
      {
        kind: "similar",
        title: "run late vs be late",
        explanationKo: "run late는 일정이 예상보다 늦어지고 있는 흐름을, be late는 이미 늦은 상태를 더 직접적으로 말합니다."
      },
      {
        kind: "nuance",
        title: "a little vs a bit",
        explanationKo: "둘 다 ‘조금’이라는 뜻이며 이 문장에서는 자연스럽게 바꿔 쓸 수 있습니다."
      }
    ],
    structureNote: "시작 가이드 1/3 · 실제로 보낼 수 있는 짧은 문장을 뜻, 표현과 구조까지 함께 복습해 보세요.",
    tags: ["기본카드", "시작가이드", "리딩", "일상표현", "약속"]
  };
}

function createFinalReadingContrastCard(
  profileId: ProfileId,
  id: string,
  now: string,
  srs: StudyCard["srs"]
): StudyCard {
  const base = createFinalReadingCard(profileId, id, now, srs);
  const sourceSentence =
    "Although the storm had passed, the hikers put off their trip because the narrow trail remained slippery.";
  return {
    ...base,
    sourceSentence,
    frontText: sourceSentence,
    literalTranslationKo:
      "폭풍이 지나갔지만, 등산객들은 좁은 산길이 계속 미끄러웠기 때문에 그들의 여행을 미뤘다.",
    naturalTranslationKo:
      "폭풍은 지나갔지만 좁은 길이 여전히 미끄러워서, 등산객들은 산행을 미뤘다.",
    highlightMappings: [
      {
        sourceText: "put off",
        literalKo: "미뤘다",
        naturalKo: "미뤘다",
        colorKey: "orange"
      }
    ],
    vocabularyItems: [
      createReadingVocabulary(
        "put off",
        "/pʊt ɔːf/",
        "phrasal verb",
        "미루다, 연기하다",
        "길이 안전하지 않아 예정했던 산행을 나중으로 미뤘다는 뜻입니다.",
        "orange",
        ["We put off the meeting.", "Don't put off your decision."],
        ["우리는 회의를 미뤘다.", "결정을 미루지 마세요."]
      )
    ],
    readingStructure: {
      segments: [
        { id: "concession", text: "Although", labelKo: "양보 연결어", tone: "connector", groupId: "background" },
        { id: "storm", text: "the storm had passed,", labelKo: "이미 끝난 배경", tone: "action", groupId: "background" },
        { id: "hikers", text: "the hikers", labelKo: "주어", tone: "subject", groupId: "decision" },
        { id: "postpone", text: "put off", labelKo: "구동사", tone: "action", groupId: "decision" },
        { id: "trip", text: "their trip", labelKo: "목적어", tone: "object", groupId: "decision" },
        { id: "reason-link", text: "because", labelKo: "이유 연결어", tone: "connector", groupId: "reason" },
        { id: "trail", text: "the narrow trail", labelKo: "이유절 주어", tone: "subject", groupId: "reason" },
        { id: "state", text: "remained slippery.", labelKo: "계속된 상태", tone: "action", groupId: "reason" }
      ],
      groups: [
        { id: "background", kind: "clause", titleKo: "절 1 · 인정하는 배경", summaryKo: "폭풍이 이미 지나갔다는 사실을 먼저 인정합니다.", segmentIds: ["concession", "storm"] },
        { id: "decision", kind: "clause", titleKo: "절 2 · 내린 결정", summaryKo: "등산객들이 산행을 미뤘습니다.", segmentIds: ["hikers", "postpone", "trip"] },
        { id: "reason", kind: "clause", titleKo: "절 3 · 결정한 이유", summaryKo: "좁은 길이 계속 미끄러웠기 때문입니다.", segmentIds: ["reason-link", "trail", "state"] }
      ]
    },
    confusingComparisons: [
      { kind: "similar", title: "put off vs postpone", explanationKo: "둘 다 미루다는 뜻이지만 put off는 일상 대화에서 더 자연스럽고, postpone은 일정 공지처럼 조금 더 격식 있습니다." },
      { kind: "contrast", title: "put off vs call off", explanationKo: "put off는 나중으로 연기하는 것이고, call off는 계획을 취소하는 것입니다." }
    ],
    structureNote: "시작 가이드 2/3 · 연결어가 문장의 방향을 어떻게 바꾸는지 확인해 보세요.",
    tags: ["기본카드", "시작가이드", "리딩", "양보절", "인과관계"]
  };
}

function createFinalReadingReasonCard(
  profileId: ProfileId,
  id: string,
  now: string,
  srs: StudyCard["srs"]
): StudyCard {
  const base = createFinalReadingCard(profileId, id, now, srs);
  const sourceSentence =
    "The researcher carefully compared the results before drawing a conclusion, because a small error could change the outcome.";
  return {
    ...base,
    sourceSentence,
    frontText: sourceSentence,
    literalTranslationKo:
      "연구자는 결론을 내리기 전에 결과들을 주의 깊게 비교했다. 작은 오류가 결과를 바꿀 수 있기 때문이다.",
    naturalTranslationKo:
      "작은 오류 하나가 결과를 바꿀 수도 있어서, 연구자는 결론을 내리기 전에 결과를 꼼꼼히 비교했다.",
    highlightMappings: [
      { sourceText: "carefully compared", literalKo: "주의 깊게 비교했다", naturalKo: "꼼꼼히 비교했다", colorKey: "cyan" },
      { sourceText: "drawing a conclusion", literalKo: "결론을 내리기", naturalKo: "결론을 내리기", colorKey: "orange" }
    ],
    vocabularyItems: [
      createReadingVocabulary("carefully compare", "/ˈkerfəli kəmˈper/", "verb phrase", "주의 깊게 비교하다", "작은 차이나 오류를 놓치지 않도록 결과를 꼼꼼하게 대조합니다.", "cyan", ["Carefully compare the two versions.", "She carefully compared the measurements."], ["두 버전을 주의 깊게 비교하세요.", "그녀는 측정값을 꼼꼼히 비교했다."]),
      createReadingVocabulary("draw a conclusion", "/drɔː ə kənˈkluːʒən/", "phrase", "결론을 내리다", "근거나 관찰을 바탕으로 판단에 도달한다는 표현입니다.", "orange", ["It is too early to draw a conclusion.", "What conclusion can we draw?"], ["결론을 내리기에는 너무 이르다.", "우리는 어떤 결론을 내릴 수 있을까?"])
    ],
    readingStructure: {
      segments: [
        { id: "researcher", text: "The researcher", labelKo: "주어", tone: "subject", groupId: "main" },
        { id: "compare", text: "carefully compared", labelKo: "핵심 행동", tone: "action", groupId: "main" },
        { id: "results", text: "the results", labelKo: "목적어", tone: "object", groupId: "main" },
        { id: "before", text: "before drawing a conclusion,", labelKo: "행동의 순서", tone: "connector", groupId: "sequence" },
        { id: "because", text: "because", labelKo: "이유 연결어", tone: "connector", groupId: "reason" },
        { id: "error", text: "a small error", labelKo: "새로운 주어", tone: "subject", groupId: "reason" },
        { id: "change", text: "could change the outcome.", labelKo: "가능한 영향", tone: "action", groupId: "reason" }
      ],
      groups: [
        { id: "main", kind: "clause", titleKo: "절 1 · 신중한 확인", summaryKo: "연구자가 결과를 꼼꼼히 비교했습니다.", segmentIds: ["researcher", "compare", "results"] },
        { id: "sequence", kind: "connector", titleKo: "before · 행동 순서", summaryKo: "비교가 결론보다 먼저 일어납니다.", segmentIds: ["before"] },
        { id: "reason", kind: "clause", titleKo: "절 2 · 그렇게 한 이유", summaryKo: "작은 오류도 최종 결과를 바꿀 수 있습니다.", segmentIds: ["because", "error", "change"] }
      ]
    },
    confusingComparisons: [
      { kind: "similar", title: "result vs outcome", explanationKo: "result는 개별 결과에도 널리 쓰이고, outcome은 과정 끝의 최종 귀결에 초점이 있습니다." },
      { kind: "contrast", title: "before doing vs before to do", explanationKo: "전치사 before 뒤에는 동명사(-ing)를 사용합니다. before to do는 쓰지 않습니다." }
    ],
    structureNote: "시작 가이드 3/3 · 행동의 순서와 이유가 구조도에서 어떻게 분리되는지 확인해 보세요.",
    tags: ["기본카드", "시작가이드", "리딩", "문장구조", "이유설명"]
  };
}

function createReadingVocabulary(
  term: string,
  ipa: string,
  partOfSpeech: string,
  basicMeaningKo: string,
  meaningInContextKo: string,
  colorKey: HighlightColorKey,
  examples: string[],
  exampleTranslationsKo: string[]
) {
  return {
    term,
    ipa,
    partOfSpeech,
    basicMeaningKo,
    meaningInContextKo,
    etymologyKo: `${term}의 형태와 문맥을 함께 보고 문장 안에서 의미를 익혀 보세요.`,
    usagePatterns: [`Collocation: ${term}`, `${term} in context`],
    colorKey,
    examples,
    exampleTranslationsKo
  };
}

function createFinalListeningCard(
  profileId: ProfileId,
  id: string,
  now: string,
  srs: StudyCard["srs"]
): StudyCard {
  const sourceSentence = "I am going to check the room, then I will come back.";
  return {
    id,
    profileId,
    cardType: "reading",
    deckType: "input-listening",
    direction: "target_to_native",
    languageMetadata: {
      profileTargetLanguageCode: "en",
      profileNativeLanguageCode: "ko",
      detectedSourceLanguageCode: "en",
      actualSourceLanguageCode: "en",
      confidence: 1,
      policyStatus: "match",
      sourceKind: "original"
    },
    sourceSentence,
    targetText: "sample-listening:final-template",
    frontText: sourceSentence,
    literalTranslationKo: "나는 방을 확인하러 갈 것이고, 그런 다음 돌아올 것이다.",
    naturalTranslationKo: "방 좀 확인하고 다시 올게.",
    highlightMappings: [
      {
        sourceText: "going to",
        literalKo: "…하러 갈 것이고",
        naturalKo: "…하고",
        colorKey: "yellow"
      }
    ],
    vocabularyItems: [],
    listeningMedia: {
      runtimeTts: {
        text: sourceSentence,
        languageCode: "en",
        generatedOnDevice: true
      },
      frameImage: {
        filePath: "public/samples/listening/tutorial-room-check-scene.png",
        fileUrl: "./samples/listening/tutorial-room-check-scene.png",
        mimeType: "image/png",
        capturedAt: 0,
        createdAt: now
      }
    },
    listeningAnnotations: [
      {
        anchorText: "going to",
        mark: "reduced",
        label: "going to가 빠른 말에서 gonna처럼 줄어듦",
        confidence: 0.8
      }
    ],
    listeningStudyGuide: {
      templateVersion: "listening-adaptive-v1",
      listeningIssue: {
        title: "going to가 gonna처럼 압축됨",
        bodyKo:
          "원문은 going to이지만 빠른 말에서는 /ˈɡənə/에 가까워져 여러 단어가 하나의 소리 덩어리처럼 들릴 수 있습니다."
      },
      chunks: [
        {
          en: "I am going to",
          pronunciationKo: "아임 거너",
          ipa: "/aɪm ˈɡənə/",
          reasonKo: "I am이 I'm으로 붙고 going to가 gonna처럼 약화됩니다."
        },
        {
          en: "check the room",
          pronunciationKo: "첵 더 룸",
          ipa: "/tʃek ðə ruːm/",
          reasonKo: "check 끝소리와 the가 끊기지 않고 짧게 이어집니다."
        },
        {
          en: "then I will come back",
          pronunciationKo: "덴 아일 컴 백",
          ipa: "/ðen aɪl kʌm bæk/",
          reasonKo: "I will이 I'll로 축약되어 하나의 강세 단위로 들립니다."
        }
      ],
      dictation: {
        prompt: "I am ____ check the room, then I will come back.",
        answer: "going to",
        explanationKo: "실제 소리는 gonna에 가깝지만 받아쓰기에는 원문의 going to를 적습니다."
      }
    },
    confusingComparisons: [],
    pumpPrompts: [],
    structureNote: "Language Miner 기본 카드 · 확정 인풋-리스닝 템플릿",
    tags: ["기본카드", "리스닝", "약화"],
    srs: { ...srs },
    createdAt: now,
    updatedAt: now
  };
}

function createOnboardingListeningMedia(
  now: string,
  assetName: string,
  text: string
): NonNullable<StudyCard["listeningMedia"]> {
  const assetRoot = `public/samples/listening/${assetName}`;
  const assetUrl = `./samples/listening/${assetName}`;
  return {
    runtimeTts: {
      text,
      languageCode: "en",
      generatedOnDevice: true
    },
    frameImage: {
      filePath: `${assetRoot}.png`,
      fileUrl: `${assetUrl}.png`,
      mimeType: "image/png",
      capturedAt: 0,
      createdAt: now
    }
  };
}

function createOnboardingListeningCard(
  profileId: ProfileId,
  id: string,
  now: string,
  srs: StudyCard["srs"]
): StudyCard {
  const base = createFinalListeningCard(profileId, id, now, srs);
  const sourceSentence = "Could you send it to me when you get a chance?";
  return {
    ...base,
    sourceSentence,
    frontText: sourceSentence,
    targetText: "onboarding-listening:linking-and-reduction",
    literalTranslationKo: "기회가 생길 때 그것을 나에게 보내줄 수 있나요?",
    naturalTranslationKo: "시간 될 때 그거 나한테 보내줄래?",
    listeningMedia: createOnboardingListeningMedia(
      now,
      "onboarding-office-send",
      sourceSentence
    ),
    highlightMappings: [
      { sourceText: "Could you", literalKo: "줄 수 있나요", naturalKo: "줄래", colorKey: "cyan" },
      { sourceText: "send it to me", literalKo: "그것을 나에게 보내", naturalKo: "그거 나한테 보내", colorKey: "yellow" },
      { sourceText: "when you get a chance", literalKo: "기회가 생길 때", naturalKo: "시간 될 때", colorKey: "purple" }
    ],
    listeningAnnotations: [
      { anchorText: "Could you", mark: "linking-bridge", label: "Could you가 /kədʒə/처럼 한 덩어리로 들립니다.", confidence: 0.97 },
      { anchorText: "send it", mark: "linking-bridge", label: "send의 끝소리와 it이 자연스럽게 이어집니다.", confidence: 0.94 },
      { anchorText: "to me", mark: "reduced", label: "to가 약한 /tə/로 발음됩니다.", confidence: 0.94 }
    ],
    listeningStudyGuide: {
      templateVersion: "listening-adaptive-v1",
      listeningIssue: {
        title: "단어는 알지만 문장에서는 경계가 안 들려요",
        bodyKo: "실제 영어에서는 Could you, send it, to me가 각각 붙거나 약해집니다. 먼저 세 덩어리로 나눠 듣고 다시 전체 문장으로 합쳐 보세요."
      },
      chunks: [
        { en: "Could you send it", pronunciationKo: "쿠쥬 센딧", ipa: "/kədʒə ˈsendɪt/", reasonKo: "Could you가 연결되고 send it도 자음과 모음이 붙어 들립니다." },
        { en: "to me", pronunciationKo: "터 미", ipa: "/tə miː/", reasonKo: "기능어 to는 강세를 받지 않아 /tə/로 약해집니다." },
        { en: "when you get a chance", pronunciationKo: "웬 유 게러 챈스", ipa: "/wen juː ɡeɾə tʃæns/", reasonKo: "get a가 자연스럽게 이어지고 chance에 핵심 강세가 옵니다." }
      ],
      dictation: {
        prompt: "Could you send it to me when you get a ____?",
        answer: "chance",
        explanationKo: "마지막 핵심 단어 chance를 기준으로 앞의 약한 소리 덩어리를 복원해 보세요."
      }
    },
    structureNote: "시작 가이드 1/3 · 소리 덩어리, 한글 발음, IPA와 받아쓰기를 순서대로 확인해 보세요.",
    tags: ["기본카드", "시작가이드", "리스닝", "연음", "약화"]
  };
}

function createFinalListeningContractionCard(
  profileId: ProfileId,
  id: string,
  now: string,
  srs: StudyCard["srs"]
): StudyCard {
  const base = createFinalListeningCard(profileId, id, now, srs);
  const sourceSentence = "Could you give me a minute? I've got to finish this first.";
  return {
    ...base,
    sourceSentence,
    frontText: sourceSentence,
    targetText: "sample-listening:contraction",
    literalTranslationKo: "나에게 잠깐 시간을 줄 수 있나요? 나는 이것을 먼저 끝내야 해요.",
    naturalTranslationKo: "잠깐만 기다려 줄래? 이것부터 마쳐야 해.",
    listeningMedia: createOnboardingListeningMedia(
      now,
      "onboarding-roommate-minute",
      sourceSentence
    ),
    highlightMappings: [
      { sourceText: "Could you give me", literalKo: "나에게 잠깐 시간을 줄 수 있나요", naturalKo: "잠깐만 기다려 줄래", colorKey: "cyan" },
      { sourceText: "I've got to", literalKo: "나는 이것을 먼저 끝내야 해요", naturalKo: "이것부터 마쳐야 해", colorKey: "yellow" }
    ],
    listeningAnnotations: [
      { anchorText: "Could you", mark: "linking-bridge", label: "빠른 말에서 Could you가 /kədʒə/처럼 연결됩니다.", confidence: 0.95 },
      { anchorText: "got to", mark: "reduced", label: "got to가 일상 발화에서 /ɡɑɾə/처럼 약화됩니다.", confidence: 0.92 }
    ],
    listeningStudyGuide: {
      templateVersion: "listening-adaptive-v1",
      listeningIssue: {
        title: "Could you와 got to가 한 덩어리처럼 들려요",
        bodyKo: "자음과 모음이 이어지고 기능어가 약해지면서 사전식 발음과 실제 소리 사이에 차이가 생깁니다."
      },
      chunks: [
        { en: "Could you give me", pronunciationKo: "쿠쥬 기미", ipa: "/kədʒə ɡɪmi/", reasonKo: "Could you가 /kədʒə/로 연결되고 give me도 빠르게 붙습니다." },
        { en: "a minute", pronunciationKo: "어 미닛", ipa: "/ə ˈmɪnɪt/", reasonKo: "a는 약하게, minute의 첫 음절은 또렷하게 들립니다." },
        { en: "I've got to finish this first", pronunciationKo: "아이브 가러 피니시 디스 퍼스트", ipa: "/aɪv ˈɡɑɾə ˈfɪnɪʃ ðɪs fɝːst/", reasonKo: "got to가 /ɡɑɾə/처럼 약해지고 finish와 first에 핵심 강세가 옵니다." }
      ],
      dictation: {
        prompt: "Could you give me a minute? I've ____ finish this first.",
        answer: "got to",
        explanationKo: "소리는 ‘가러’에 가깝지만 문장에는 got to로 적습니다."
      }
    },
    structureNote: "시작 가이드 2/3 · 축약된 실제 소리를 청크별 발음과 함께 비교해 보세요.",
    tags: ["기본카드", "시작가이드", "리스닝", "축약", "연음"]
  };
}

function createFinalListeningLinkingCard(
  profileId: ProfileId,
  id: string,
  now: string,
  srs: StudyCard["srs"]
): StudyCard {
  const base = createFinalListeningCard(profileId, id, now, srs);
  const sourceSentence = "Did you want to order now, or do you need a little more time?";
  return {
    ...base,
    sourceSentence,
    frontText: sourceSentence,
    targetText: "sample-listening:linking",
    literalTranslationKo: "지금 주문하고 싶으신가요, 아니면 조금 더 시간이 필요하신가요?",
    naturalTranslationKo: "지금 주문하시겠어요, 아니면 시간이 조금 더 필요하세요?",
    listeningMedia: createOnboardingListeningMedia(
      now,
      "onboarding-restaurant-order",
      sourceSentence
    ),
    highlightMappings: [
      { sourceText: "Did you want to", literalKo: "지금 주문하고 싶으신가요", naturalKo: "지금 주문하시겠어요", colorKey: "cyan" },
      { sourceText: "a little more time", literalKo: "조금 더 시간이 필요하신가요", naturalKo: "시간이 조금 더 필요하세요", colorKey: "yellow" }
    ],
    listeningAnnotations: [
      { anchorText: "Did you", mark: "linking-bridge", label: "Did you가 /dɪdʒə/처럼 연결됩니다.", confidence: 0.96 },
      { anchorText: "want to", mark: "reduced", label: "want to가 /wɑnə/처럼 줄어듭니다.", confidence: 0.95 },
      { anchorText: "little", mark: "linking-bridge", label: "미국식 발음에서 t가 빠른 ㄹ 소리처럼 들립니다.", confidence: 0.9 }
    ],
    listeningStudyGuide: {
      templateVersion: "listening-adaptive-v1",
      listeningIssue: {
        title: "Did you want to가 ‘디쥬 워너’처럼 들려요",
        bodyKo: "질문의 첫 부분에서 연음과 약화가 연달아 일어나 단어 경계가 거의 들리지 않습니다."
      },
      chunks: [
        { en: "Did you want to", pronunciationKo: "디쥬 워너", ipa: "/dɪdʒə ˈwɑnə/", reasonKo: "Did you의 /d/와 /j/가 합쳐지고 want to는 /wɑnə/로 줄어듭니다." },
        { en: "order now", pronunciationKo: "오더 나우", ipa: "/ˈɔːrdɚ naʊ/", reasonKo: "order에 강세를 주고 now까지 자연스럽게 이어 읽습니다." },
        { en: "or do you need a little more time", pronunciationKo: "어 듀 니더 리를 모어 타임", ipa: "/ɚ dəjə niːd ə ˈlɪɾəl mɔːr taɪm/", reasonKo: "need a가 붙고 little의 t가 탄음으로 바뀌며, time에 문장 강세가 옵니다." }
      ],
      dictation: {
        prompt: "Did you want to order now, or do you need a ____ more time?",
        answer: "little",
        explanationKo: "little의 t가 또렷한 /t/가 아니라 빠른 탄음으로 들릴 수 있습니다."
      }
    },
    structureNote: "시작 가이드 3/3 · 긴 질문을 세 덩어리로 나누고 받아쓰기로 마무리해 보세요.",
    tags: ["기본카드", "시작가이드", "리스닝", "연음", "탄음"]
  };
}

function createOnboardingOutputCard(
  profileId: ProfileId,
  id: string,
  now: string,
  srs: StudyCard["srs"]
): StudyCard {
  const base = createFinalOutputCard(profileId, id, now, srs);
  const tags = ["기본카드", "시작가이드", "아웃풋", "듣기요청"];
  const sourceSentence = "조금만 더 천천히 말해줄래?";
  const targetText = "Could you speak a little more slowly?";
  return {
    ...base,
    sourceSentence,
    targetText,
    frontText: `맥락\n상대의 영어가 너무 빨라서 속도를 낮춰 달라고 부탁하는 상황입니다.\n\n원문\nA: Sorry, was I speaking too fast?\nMe: ${sourceSentence}`,
    literalTranslationKo: "영어 대화\nA: Sorry, was I speaking too fast?\nMe: Could you speak a little more slowly?",
    naturalTranslationKo: `추천: ${targetText}\n뜻: 조금만 더 천천히 말해줄래?`,
    highlightMappings: [
      { sourceText: "speak a little more slowly", literalKo: "조금 더 천천히 말하다", naturalKo: "말을 조금만 더 천천히 하다", colorKey: "yellow" }
    ],
    pumpPrompts: [{ type: "ko_to_en", promptKo: sourceSentence, requiredTerms: ["a little more slowly"] }],
    structureNote: "시작 가이드 1/3 · 대화 맥락, 자연스러운 정답, 발음과 내 답변 변형을 확인해 보세요.",
    tags,
    outputStudyGuide: {
      templateVersion: "adaptive-v1",
      contextKo: "상대의 영어가 너무 빨라서 속도를 낮춰 달라고 부탁하는 상황입니다.",
      dialogue: [
        { speaker: "A", role: "context", ko: "미안, 내가 너무 빨리 말했어?", en: "Sorry, was I speaking too fast?", pronunciationKo: "쏘리, 워즈 아이 스피킹 투 패스트?", ipa: "/ˈsɑːri, wəz aɪ ˈspiːkɪŋ tuː fæst/", highlightKo: "너무 빨리", highlightEn: "too fast" },
        { speaker: "Me", role: "me", ko: sourceSentence, en: targetText, pronunciationKo: "쿠쥬 스피크 어 리를 모어 슬로울리?", ipa: "/kəd juː spiːk ə ˈlɪɾəl mɔːr ˈsloʊli/", highlightKo: "조금만 더 천천히", highlightEn: "a little more slowly" }
      ],
      keyChunks: [
        { label: "직전 문장 청크", en: "speaking too fast", ko: "너무 빨리 말하는", pronunciationKo: "스피킹 투 패스트", ipa: "/ˈspiːkɪŋ tuː fæst/", tone: "context" },
        { label: "내 답변 핵심 청크", en: "a little more slowly", ko: "조금 더 천천히", pronunciationKo: "어 리를 모어 슬로울리", ipa: "/ə ˈlɪɾəl mɔːr ˈsloʊli/", tone: "learner" }
      ],
      insight: { title: "부탁을 부드럽게 만드는 방법", bodyKo: "Could you와 a little을 함께 쓰면 직접적인 명령이 아니라 부담 없는 요청으로 들립니다." },
      literalMeaningKo: "조금 더 천천히 말해줄 수 있나요?",
      nuanceKo: "못 알아들었다고 자책하지 않고, 상대에게 말하는 속도만 조절해 달라고 정중하게 요청합니다.",
      breakdown: [
        { expression: "Could you + 동사", meaningKo: "~해줄 수 있나요?" },
        { expression: "speak slowly", meaningKo: "천천히 말하다" },
        { expression: "a little more", meaningKo: "조금만 더" }
      ],
      alternatives: [
        { en: "Could you slow down a little?", ko: "조금만 천천히 말해줄래?", pronunciationKo: "쿠쥬 슬로우 다운 어 리를?", ipa: "/kəd juː sloʊ daʊn ə ˈlɪɾəl/" },
        { en: "Would you mind speaking a bit more slowly?", ko: "조금 더 천천히 말씀해 주시겠어요?", pronunciationKo: "우쥬 마인드 스피킹 어 빗 모어 슬로울리?", ipa: "/wʊd juː maɪnd ˈspiːkɪŋ ə bɪt mɔːr ˈsloʊli/" }
      ],
      commonMistake: {
        wrong: { en: "Please speak more slow.", ko: "더 느리게 말해 주세요.", pronunciationKo: "플리즈 스피크 모어 슬로우.", ipa: "/pliːz spiːk mɔːr sloʊ/" },
        right: { en: targetText, ko: sourceSentence, pronunciationKo: "쿠쥬 스피크 어 리를 모어 슬로울리?", ipa: "/kəd juː spiːk ə ˈlɪɾəl mɔːr ˈsloʊli/", highlightEn: "more slowly" },
        explanationKo: "동사 speak를 꾸밀 때는 형용사 slow가 아니라 부사 slowly를 씁니다."
      },
      miniDrills: [
        { en: "Could you say that a little more slowly?", ko: "그 말을 조금 더 천천히 해줄래?", pronunciationKo: "쿠쥬 세이 댓 어 리를 모어 슬로울리?", ipa: "/kəd juː seɪ ðæt ə ˈlɪɾəl mɔːr ˈsloʊli/" },
        { en: "Could you explain that one more time?", ko: "그걸 한 번만 더 설명해줄래?", pronunciationKo: "쿠쥬 익스플레인 댓 원 모어 타임?", ipa: "/kəd juː ɪkˈspleɪn ðæt wʌn mɔːr taɪm/" }
      ],
      tags
    }
  };
}

function createFinalOutputCard(
  profileId: ProfileId,
  id: string,
  now: string,
  srs: StudyCard["srs"]
): StudyCard {
  const tags = ["기본카드", "의도:다시묻기", "말투:공손"];
  return {
    id,
    profileId,
    cardType: "life_expression",
    deckType: "output",
    direction: "native_to_target",
    languageMetadata: {
      profileTargetLanguageCode: "en",
      profileNativeLanguageCode: "ko",
      detectedSourceLanguageCode: "ko",
      actualSourceLanguageCode: "ko",
      confidence: 1,
      policyStatus: "match",
      sourceKind: "original"
    },
    sourceSentence: "다시 말해줄래?",
    targetText: "Could you say that again, please?",
    frontText:
      "맥락\n카페 영어 역할극에서 방금 들은 연습 지시를 다시 요청하는 상황입니다.\n\n원문\nA: 연습 삼아서 결제를 마무리하는 문장을 영어로 말해봐.\n나: 다시 말해줄래?",
    literalTranslationKo:
      "영어 대화\nA: For practice, try finishing the payment in one sentence in English.\nMe: Could you say that again, please?",
    naturalTranslationKo:
      "내 답변 변형\n추천: Could you say that again, please?\n뜻: 다시 말해줄래?\n다르게: Could you repeat that, please?\n뜻: 그 말을 다시 해줄래?",
    highlightMappings: [
      {
        sourceText: "say that again",
        literalKo: "그것을 다시 말하다",
        naturalKo: "다시 말해주다",
        colorKey: "yellow"
      }
    ],
    vocabularyItems: [],
    confusingComparisons: [],
    pumpPrompts: [
      {
        type: "ko_to_en",
        promptKo: "다시 말해줄래?",
        requiredTerms: ["say that again"]
      }
    ],
    structureNote: "Language Miner 기본 카드 · 확정 아웃풋 템플릿",
    tags,
    outputStudyGuide: {
      templateVersion: "adaptive-v1",
      contextKo: "카페 영어 역할극에서 방금 들은 연습 지시를 다시 요청하는 상황입니다.",
      dialogue: [
        {
          speaker: "A",
          role: "context",
          ko: "연습 삼아서 결제를 마무리하는 문장을 영어로 말해봐.",
          en: "For practice, try finishing the payment in one sentence in English.",
          pronunciationKo: "포 프랙티스, 트라이 피니싱 더 페이먼트 인 원 센턴스 인 잉글리시.",
          ipa: "/fɔːr ˈpræktɪs, traɪ ˈfɪnɪʃɪŋ ðə ˈpeɪmənt ɪn wʌn ˈsentəns ɪn ˈɪŋɡlɪʃ/",
          highlightKo: "연습 삼아서",
          highlightEn: "For practice"
        },
        {
          speaker: "Me",
          role: "me",
          ko: "다시 말해줄래?",
          en: "Could you say that again, please?",
          pronunciationKo: "쿠쥬 세이 댓 어겐, 플리즈?",
          ipa: "/kʊd juː seɪ ðæt əˈɡen, pliːz/",
          highlightKo: "다시 말해줄래",
          highlightEn: "say that again"
        }
      ],
      keyChunks: [
        {
          label: "직전 문장 청크",
          en: "For practice",
          ko: "연습 삼아서",
          pronunciationKo: "포 프랙티스",
          ipa: "/fɔːr ˈpræktɪs/",
          tone: "context"
        },
        {
          label: "내 답변 핵심 청크",
          en: "say that again",
          ko: "다시 말해주다",
          pronunciationKo: "세이 댓 어겐",
          ipa: "/seɪ ðæt əˈɡen/",
          tone: "learner"
        }
      ],
      insight: {
        title: "뉘앙스",
        bodyKo:
          "Could you …?와 please를 함께 쓰면 못 들었을 때 정중하면서도 자연스럽게 반복을 요청할 수 있습니다."
      },
      literalMeaningKo: "그것을 다시 말해줄 수 있나요?",
      nuanceKo: "상대의 말을 못 들었거나 이해하지 못했을 때 부담 없이 다시 부탁하는 표현입니다.",
      breakdown: [
        { expression: "Could you + 동사?", meaningKo: "상대에게 정중하게 부탁하는 틀" },
        { expression: "say that again", meaningKo: "방금 한 말을 다시 말하다" },
        { expression: "please", meaningKo: "부탁의 말투를 더 부드럽게 만듦" }
      ],
      alternatives: [
        {
          en: "Could you repeat that, please?",
          ko: "그 말을 다시 해줄래?",
          pronunciationKo: "쿠쥬 리피트 댓, 플리즈?",
          ipa: "/kʊd juː rɪˈpiːt ðæt, pliːz/"
        },
        {
          en: "Sorry, I didn't catch that.",
          ko: "미안해, 잘 못 들었어.",
          pronunciationKo: "쏘리, 아이 디든트 캐치 댓.",
          ipa: "/ˈsɑːri, aɪ ˈdɪdənt kætʃ ðæt/"
        }
      ],
      commonMistake: {
        wrong: {
          en: "Could you say again, please?",
          ko: "다시 말해줄래?라고 하려 한 문장",
          pronunciationKo: "쿠쥬 세이 어겐, 플리즈?",
          ipa: "/kʊd juː seɪ əˈɡen, pliːz/"
        },
        right: {
          en: "Could you say that again, please?",
          ko: "그 말을 다시 해줄래?",
          pronunciationKo: "쿠쥬 세이 댓 어겐, 플리즈?",
          ipa: "/kʊd juː seɪ ðæt əˈɡen, pliːz/",
          highlightEn: "say that again"
        },
        explanationKo: "say 뒤에 방금 한 말을 가리키는 that을 넣으면 더 자연스럽습니다."
      },
      miniDrills: [
        {
          en: "Could you explain that again, please?",
          ko: "그걸 다시 설명해줄래?",
          pronunciationKo: "쿠쥬 익스플레인 댓 어겐, 플리즈?",
          ipa: "/kʊd juː ɪkˈspleɪn ðæt əˈɡen, pliːz/"
        },
        {
          en: "Could you show me that again?",
          ko: "그걸 다시 보여줄래?",
          pronunciationKo: "쿠쥬 쇼우 미 댓 어겐?",
          ipa: "/kʊd juː ʃoʊ miː ðæt əˈɡen/"
        }
      ],
      tags
    },
    srs: { ...srs },
    createdAt: now,
    updatedAt: now
  };
}

function createFinalOutputContextCard(
  profileId: ProfileId,
  id: string,
  now: string,
  srs: StudyCard["srs"]
): StudyCard {
  const base = createFinalOutputCard(profileId, id, now, srs);
  const tags = ["기본카드", "시작가이드", "아웃풋", "맥락설명", "대화전환"];
  const sourceSentence = "맥락을 좀 더 줄게.";
  const targetText = "Let me give you a bit more context.";
  return {
    ...base,
    sourceSentence,
    targetText,
    frontText: `맥락\n상대가 더 자세한 설명을 원해서 배경 정보를 덧붙이는 상황입니다.\n\n원문\nA: 어느 부분이 가장 궁금해?\nMe: ${sourceSentence}`,
    literalTranslationKo: "영어 대화\nA: Which part are you most curious about?\nMe: Let me give you a bit more context.",
    naturalTranslationKo: "추천: Let me give you a bit more context.\n뜻: 맥락을 조금 더 설명해 줄게.",
    highlightMappings: [
      { sourceText: "give you a bit more context", literalKo: "너에게 맥락을 조금 더 주다", naturalKo: "맥락을 좀 더 설명해 주다", colorKey: "yellow" }
    ],
    pumpPrompts: [{ type: "ko_to_en", promptKo: sourceSentence, requiredTerms: ["give you a bit more context"] }],
    structureNote: "시작 가이드 2/3 · 맥락을 덧붙이는 핵심 청크와 자연스러운 변형을 확인해 보세요.",
    tags,
    outputStudyGuide: {
      templateVersion: "adaptive-v1",
      contextKo: "상대가 더 자세한 설명을 원해서 배경 정보를 덧붙이는 상황입니다.",
      dialogue: [
        { speaker: "A", role: "context", ko: "어느 부분이 가장 궁금해?", en: "Which part are you most curious about?", pronunciationKo: "위치 파트 아 유 모우스트 큐리어스 어바웃?", ipa: "/wɪtʃ pɑːrt ɑːr juː moʊst ˈkjʊriəs əˈbaʊt/", highlightKo: "가장 궁금해", highlightEn: "most curious about" },
        { speaker: "Me", role: "me", ko: sourceSentence, en: targetText, pronunciationKo: "렛 미 기뷰 어 빗 모어 칸텍스트.", ipa: "/let miː ɡɪv juː ə bɪt mɔːr ˈkɑːntekst/", highlightKo: "맥락을 좀 더 줄게", highlightEn: "give you a bit more context" }
      ],
      keyChunks: [
        { label: "직전 문장 청크", en: "most curious about", ko: "가장 궁금해하다", pronunciationKo: "모우스트 큐리어스 어바웃", ipa: "/moʊst ˈkjʊriəs əˈbaʊt/", tone: "context" },
        { label: "내 답변 핵심 청크", en: "give you a bit more context", ko: "맥락을 조금 더 설명해 주다", pronunciationKo: "기뷰 어 빗 모어 칸텍스트", ipa: "/ɡɪv juː ə bɪt mɔːr ˈkɑːntekst/", tone: "learner" }
      ],
      insight: { title: "자연스러운 전환", bodyKo: "Let me로 말을 시작하면 지금부터 설명을 덧붙이겠다는 신호를 부드럽게 줄 수 있습니다." },
      literalMeaningKo: "내가 너에게 맥락을 조금 더 주게 해 줘.",
      nuanceKo: "상대의 이해를 돕기 위해 배경이나 전후 사정을 자연스럽게 보충할 때 쓰는 표현입니다.",
      breakdown: [
        { expression: "Let me + 동사", meaningKo: "내가 ~할게 / ~하게 해 줘" },
        { expression: "give you", meaningKo: "너에게 주다, 알려 주다" },
        { expression: "a bit more context", meaningKo: "조금 더 많은 맥락과 배경" }
      ],
      alternatives: [
        { en: "Here's a bit more context.", ko: "맥락을 조금 더 설명할게.", pronunciationKo: "히어즈 어 빗 모어 칸텍스트.", ipa: "/hɪrz ə bɪt mɔːr ˈkɑːntekst/" },
        { en: "Let me give you some more background.", ko: "배경을 조금 더 말해 줄게.", pronunciationKo: "렛 미 기뷰 섬 모어 백그라운드.", ipa: "/let miː ɡɪv juː sʌm mɔːr ˈbækɡraʊnd/" }
      ],
      commonMistake: {
        wrong: { en: "I will give more context to you.", ko: "너에게 더 많은 맥락을 줄 것이다.", pronunciationKo: "아이 윌 기브 모어 칸텍스트 투 유.", ipa: "/aɪ wɪl ɡɪv mɔːr ˈkɑːntekst tə juː/" },
        right: { en: targetText, ko: sourceSentence, pronunciationKo: "렛 미 기뷰 어 빗 모어 칸텍스트.", ipa: "/let miː ɡɪv juː ə bɪt mɔːr ˈkɑːntekst/", highlightEn: "give you a bit more context" },
        explanationKo: "문법적으로는 가능하지만 대화에서는 Let me로 시작하는 쪽이 훨씬 부드럽습니다."
      },
      miniDrills: [
        { en: "Let me explain that a little more.", ko: "그걸 조금 더 설명할게.", pronunciationKo: "렛 미 익스플레인 댓 어 리를 모어.", ipa: "/let miː ɪkˈspleɪn ðæt ə ˈlɪɾəl mɔːr/" },
        { en: "Let me give you an example.", ko: "예를 하나 들어 줄게.", pronunciationKo: "렛 미 기뷰 언 이그잼플.", ipa: "/let miː ɡɪv juː ən ɪɡˈzæmpəl/" }
      ],
      tags
    }
  };
}

function createOnboardingOutputClarificationCard(
  profileId: ProfileId,
  id: string,
  now: string,
  srs: StudyCard["srs"]
): StudyCard {
  const base = createFinalOutputCard(profileId, id, now, srs);
  const tags = ["기본카드", "시작가이드", "아웃풋", "오해수정"];
  const sourceSentence = "내 말은 그게 아니라, 이 부분을 말한 거야.";
  const targetText = "That's not what I meant. I was talking about this part.";
  return {
    ...base,
    sourceSentence,
    targetText,
    frontText: `맥락\n상대가 내 의도를 다르게 이해해서 오해를 부드럽게 바로잡는 상황입니다.\n\n원문\nA: 그러니까 디자인 전체를 바꾸자는 거지?\nMe: ${sourceSentence}`,
    literalTranslationKo: "영어 대화\nA: So you want to change the whole design?\nMe: That's not what I meant. I was talking about this part.",
    naturalTranslationKo: `추천: ${targetText}\n뜻: 내 말은 그게 아니야. 나는 이 부분을 말한 거였어.`,
    highlightMappings: [
      { sourceText: "That's not what I meant", literalKo: "그것은 내가 의미한 것이 아니다", naturalKo: "내 말은 그게 아니야", colorKey: "yellow" },
      { sourceText: "talking about this part", literalKo: "이 부분에 관해 말하고 있었다", naturalKo: "이 부분을 말한 거였다", colorKey: "cyan" }
    ],
    pumpPrompts: [{ type: "ko_to_en", promptKo: sourceSentence, requiredTerms: ["not what I meant", "talking about this part"] }],
    structureNote: "시작 가이드 3/3 · 오해 교정, 비슷한 표현, 실수 교정과 미니 드릴을 확인해 보세요.",
    tags,
    outputStudyGuide: {
      templateVersion: "adaptive-v1",
      contextKo: "상대가 내 의도를 다르게 이해해서 오해를 부드럽게 바로잡는 상황입니다.",
      dialogue: [
        { speaker: "A", role: "context", ko: "그러니까 디자인 전체를 바꾸자는 거지?", en: "So you want to change the whole design?", pronunciationKo: "쏘 유 원트 투 체인지 더 홀 디자인?", ipa: "/soʊ juː wɑːnt tə tʃeɪndʒ ðə hoʊl dɪˈzaɪn/", highlightKo: "전체를 바꾸자", highlightEn: "change the whole design" },
        { speaker: "Me", role: "me", ko: sourceSentence, en: targetText, pronunciationKo: "댓츠 낫 왓 아이 멘트. 아이 워즈 토킹 어바웃 디스 파트.", ipa: "/ðæts nɑːt wʌt aɪ ment. aɪ wəz ˈtɔːkɪŋ əˈbaʊt ðɪs pɑːrt/", highlightKo: "내 말은 그게 아니라", highlightEn: "That's not what I meant" }
      ],
      keyChunks: [
        { label: "직전 문장 청크", en: "change the whole design", ko: "디자인 전체를 바꾸다", pronunciationKo: "체인지 더 홀 디자인", ipa: "/tʃeɪndʒ ðə hoʊl dɪˈzaɪn/", tone: "context" },
        { label: "내 답변 핵심 청크", en: "That's not what I meant", ko: "내 말은 그게 아니야", pronunciationKo: "댓츠 낫 왓 아이 멘트", ipa: "/ðæts nɑːt wʌt aɪ ment/", tone: "learner" }
      ],
      insight: { title: "오해를 부드럽게 바로잡기", bodyKo: "상대가 틀렸다고 지적하기보다 내가 의도한 것은 그게 아니라고 말하면 대화의 긴장을 낮출 수 있습니다." },
      literalMeaningKo: "그것은 내가 의미한 것이 아니다. 나는 이 부분에 관해 말하고 있었다.",
      nuanceKo: "상대를 탓하지 않고 내 의도를 다시 설명하는 차분한 교정 표현입니다.",
      breakdown: [
        { expression: "That's not what I meant", meaningKo: "내가 뜻한 건 그게 아니야" },
        { expression: "I was talking about", meaningKo: "나는 ~에 관해 말한 거였어" },
        { expression: "this part", meaningKo: "전체가 아닌 이 부분" }
      ],
      alternatives: [
        { en: "Let me clarify what I meant.", ko: "내가 무슨 뜻이었는지 분명히 말해볼게.", pronunciationKo: "렛 미 클래러파이 왓 아이 멘트.", ipa: "/let miː ˈklerəfaɪ wʌt aɪ ment/" },
        { en: "I meant this section, not the entire design.", ko: "전체 디자인이 아니라 이 부분을 말한 거야.", pronunciationKo: "아이 멘트 디스 섹션, 낫 디 인타이어 디자인.", ipa: "/aɪ ment ðɪs ˈsekʃən, nɑːt ði ɪnˈtaɪər dɪˈzaɪn/" }
      ],
      commonMistake: {
        wrong: { en: "My meaning is not that.", ko: "내 의미는 그것이 아니다.", pronunciationKo: "마이 미닝 이즈 낫 댓.", ipa: "/maɪ ˈmiːnɪŋ ɪz nɑːt ðæt/" },
        right: { en: "That's not what I meant.", ko: "내 말은 그게 아니야.", pronunciationKo: "댓츠 낫 왓 아이 멘트.", ipa: "/ðæts nɑːt wʌt aɪ ment/", highlightEn: "not what I meant" },
        explanationKo: "영어 대화에서는 my meaning보다 what I meant 구조가 훨씬 자연스럽습니다."
      },
      miniDrills: [
        { en: "That's not the part I was talking about.", ko: "내가 말한 건 그 부분이 아니야.", pronunciationKo: "댓츠 낫 더 파트 아이 워즈 토킹 어바웃.", ipa: "/ðæts nɑːt ðə pɑːrt aɪ wəz ˈtɔːkɪŋ əˈbaʊt/" },
        { en: "What I meant was this button.", ko: "내가 말한 건 이 버튼이었어.", pronunciationKo: "왓 아이 멘트 워즈 디스 버튼.", ipa: "/wʌt aɪ ment wəz ðɪs ˈbʌtən/" }
      ],
      tags
    }
  };
}

function createFinalOutputHealthCard(
  profileId: ProfileId,
  id: string,
  now: string,
  srs: StudyCard["srs"]
): StudyCard {
  const base = createFinalOutputCard(profileId, id, now, srs);
  const tags = ["기본카드", "아웃풋", "건강", "구체화"];
  const sourceSentence = "정확히는 목 근육이 뻣뻣해서 두통이 있어.";
  const targetText = "More specifically, my neck muscles are stiff, and I have a headache.";
  return {
    ...base,
    sourceSentence,
    targetText,
    frontText: `맥락\n게임 캐릭터의 목이 아니라 실제 몸 상태를 구체적으로 설명하는 상황입니다.\n\n원문\nA: 게임 속 목 말고 실제 목을 말하는 거야?\nMe: ${sourceSentence}`,
    literalTranslationKo: "영어 대화\nA: Do you mean your actual neck, not the one in the game?\nMe: More specifically, my neck muscles are stiff, and I have a headache.",
    naturalTranslationKo: `추천: ${targetText}\n뜻: 정확히 말하면 목 근육이 뻣뻣하고 두통이 있어.`,
    highlightMappings: [
      { sourceText: "my neck muscles are stiff", literalKo: "내 목 근육이 뻣뻣하다", naturalKo: "목 근육이 뻣뻣하다", colorKey: "yellow" }
    ],
    pumpPrompts: [{ type: "ko_to_en", promptKo: sourceSentence, requiredTerms: ["my neck muscles are stiff", "have a headache"] }],
    structureNote: "Language Miner 기본 카드 · 확정 아웃풋 템플릿 · 상태 구체화",
    tags,
    outputStudyGuide: {
      templateVersion: "adaptive-v1",
      contextKo: "게임 캐릭터의 목이 아니라 실제 몸 상태를 구체적으로 설명하는 상황입니다.",
      dialogue: [
        { speaker: "A", role: "context", ko: "게임 속 목 말고 실제 목을 말하는 거야?", en: "Do you mean your actual neck, not the one in the game?", pronunciationKo: "두 유 민 유어 액추얼 넥, 낫 디 원 인 더 게임?", ipa: "/duː juː miːn jʊr ˈæktʃuəl nek, nɑːt ðiː wʌn ɪn ðə ɡeɪm/", highlightKo: "실제 목", highlightEn: "your actual neck" },
        { speaker: "Me", role: "me", ko: sourceSentence, en: targetText, pronunciationKo: "모어 스퍼시피컬리, 마이 넥 머슬즈 아 스티프, 앤 아이 해브 어 헤데이크.", ipa: "/mɔːr spəˈsɪfɪkli, maɪ nek ˈmʌsəlz ɑːr stɪf, ænd aɪ hæv ə ˈhedeɪk/", highlightKo: "목 근육이 뻣뻣해서", highlightEn: "my neck muscles are stiff" }
      ],
      keyChunks: [
        { label: "직전 문장 청크", en: "your actual neck", ko: "네 실제 목", pronunciationKo: "유어 액추얼 넥", ipa: "/jʊr ˈæktʃuəl nek/", tone: "context" },
        { label: "내 답변 핵심 청크", en: "my neck muscles are stiff", ko: "내 목 근육이 뻣뻣하다", pronunciationKo: "마이 넥 머슬즈 아 스티프", ipa: "/maɪ nek ˈmʌsəlz ɑːr stɪf/", tone: "learner" }
      ],
      insight: { title: "직역과 실제 의미", bodyKo: "stiff는 근육이나 관절이 굳고 움직이기 불편한 상태를 말합니다. 한국어의 ‘뻣뻣하다’와 가깝습니다." },
      literalMeaningKo: "더 구체적으로는, 내 목 근육이 뻣뻣하고 나는 두통을 가지고 있다.",
      nuanceKo: "오해를 바로잡은 뒤 증상을 정확하고 차분하게 설명하는 말투입니다.",
      breakdown: [
        { expression: "More specifically", meaningKo: "더 구체적으로 말하면" },
        { expression: "be stiff", meaningKo: "근육이나 관절이 뻣뻣하다" },
        { expression: "have a headache", meaningKo: "두통이 있다" }
      ],
      alternatives: [
        { en: "My neck feels tight, and it's giving me a headache.", ko: "목이 뻐근해서 두통이 생겨.", pronunciationKo: "마이 넥 필즈 타이트, 앤 잇츠 기빙 미 어 헤데이크.", ipa: "/maɪ nek fiːlz taɪt, ænd ɪts ˈɡɪvɪŋ miː ə ˈhedeɪk/" },
        { en: "I have a stiff neck and a headache.", ko: "목이 뻣뻣하고 두통도 있어.", pronunciationKo: "아이 해브 어 스티프 넥 앤 어 헤데이크.", ipa: "/aɪ hæv ə stɪf nek ænd ə ˈhedeɪk/" }
      ],
      commonMistake: {
        wrong: { en: "My neck muscles are hard.", ko: "내 목 근육은 단단하다.", pronunciationKo: "마이 넥 머슬즈 아 하드.", ipa: "/maɪ nek ˈmʌsəlz ɑːr hɑːrd/" },
        right: { en: "My neck muscles are stiff.", ko: "내 목 근육이 뻣뻣하다.", pronunciationKo: "마이 넥 머슬즈 아 스티프.", ipa: "/maɪ nek ˈmʌsəlz ɑːr stɪf/", highlightEn: "are stiff" },
        explanationKo: "불편하게 굳은 상태에는 hard보다 stiff가 자연스럽습니다."
      },
      miniDrills: [
        { en: "My shoulders feel stiff today.", ko: "오늘 어깨가 뻣뻣해.", pronunciationKo: "마이 숄더즈 필 스티프 투데이.", ipa: "/maɪ ˈʃoʊldərz fiːl stɪf təˈdeɪ/" },
        { en: "This tension is giving me a headache.", ko: "이 긴장 때문에 두통이 생겨.", pronunciationKo: "디스 텐션 이즈 기빙 미 어 헤데이크.", ipa: "/ðɪs ˈtenʃən ɪz ˈɡɪvɪŋ miː ə ˈhedeɪk/" }
      ],
      tags
    }
  };
}
