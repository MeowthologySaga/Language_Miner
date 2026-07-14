import type { GeneratedCardData, GenerateLifeExpressionCardInput } from "../../shared/types";
import { defaultLearningProfile } from "../../shared/languages";
import { normalizeOutputStudyGuidePronunciations } from "../../shared/outputStudyGuide";

export type LifeExpressionAnswerCandidate = {
  text: string;
  kind: "recommended" | "rejected";
  register?: "best" | "short" | "casual" | "polite" | "neutral";
  noteKo?: string;
};

export type LifeExpressionCardDraft = GeneratedCardData & {
  answerCandidates?: LifeExpressionAnswerCandidate[];
};

export function createLifeExpressionJsonShape(input?: GenerateLifeExpressionCardInput) {
  const { targetLanguage, nativeLanguage } = input?.learningProfile ?? defaultLearningProfile;
  const targetPronunciationGuide =
    `Hangul pronunciation of this same object's en field (${targetLanguage.nameEn}); never pronounce its ko field`;
  const targetIpa =
    `IPA of this same object's en field (${targetLanguage.nameEn}) with primary stress marks; never transcribe its ko field`;
  return {
    cardType: "life_expression",
    deckType: "output",
    direction: "native_to_target",
    sourceSentence: `captured ${nativeLanguage.nameEn} Me text`,
    targetText: `best natural ${targetLanguage.nameEn} version of Me's reply`,
    frontText:
      `맥락\none short ${nativeLanguage.nameEn} context summary\n\n원문\nA: original previous message\nMe: captured ${nativeLanguage.nameEn} Me text`,
    literalTranslationKo:
      `${targetLanguage.nameKo} 대화\nA: previous message translated into ${targetLanguage.nameEn}\nMe: best natural ${targetLanguage.nameEn} reply`,
    naturalTranslationKo:
      `내 답변 변형\n짧게: shorter ${targetLanguage.nameEn} version\n뜻: native-language meaning of the short version\n캐주얼: casual ${targetLanguage.nameEn} version\n뜻: native-language meaning of the casual version\n공손하게: polite ${targetLanguage.nameEn} version\n뜻: native-language meaning of the polite version`,
    answerCandidates: [
      {
        text: `best natural ${targetLanguage.nameEn} reply`,
        kind: "recommended",
        register: "best",
        noteKo: `best answer to memorize, explained in ${nativeLanguage.nameEn}`
      },
      {
        text: `short natural ${targetLanguage.nameEn} reply`,
        kind: "recommended",
        register: "short",
        noteKo: `short answer variant, explained in ${nativeLanguage.nameEn}`
      },
      {
        text: `literal but unnatural ${targetLanguage.nameEn} wording`,
        kind: "rejected",
        register: "neutral",
        noteKo: `why this should not be memorized, explained in ${nativeLanguage.nameEn}`
      }
    ],
    tags: ["주제:일상", "의도:의사표현", "말투:중립"],
    outputStudyGuide: {
      templateVersion: "adaptive-v1",
      contextKo: `one concise situation summary in ${nativeLanguage.nameEn}`,
      dialogue: [
        {
          speaker: "A",
          role: "context",
          en: `previous speaker's natural ${targetLanguage.nameEn} sentence`,
          ko: `native-language meaning of the previous sentence`,
          pronunciationKo: targetPronunciationGuide,
          ipa: targetIpa,
          highlightEn: `reusable context chunk in ${targetLanguage.nameEn}`,
          highlightKo: `matching chunk in ${nativeLanguage.nameEn}`
        },
        {
          speaker: "Me",
          role: "me",
          en: `best natural ${targetLanguage.nameEn} version of Me's reply`,
          ko: `natural ${nativeLanguage.nameEn} meaning of Me's reply`,
          pronunciationKo: targetPronunciationGuide,
          ipa: targetIpa,
          highlightEn: `Me's key reusable chunk in ${targetLanguage.nameEn}`,
          highlightKo: `matching chunk in ${nativeLanguage.nameEn}`
        }
      ],
      keyChunks: [
        {
          label: "직전 문장 청크",
          en: `reusable context chunk in ${targetLanguage.nameEn}`,
          ko: `meaning in ${nativeLanguage.nameEn}`,
          pronunciationKo: targetPronunciationGuide,
          ipa: targetIpa,
          tone: "context"
        },
        {
          label: "내 답변 핵심 청크",
          en: `Me's key reusable chunk in ${targetLanguage.nameEn}`,
          ko: `meaning in ${nativeLanguage.nameEn}`,
          pronunciationKo: targetPronunciationGuide,
          ipa: targetIpa,
          tone: "learner"
        }
      ],
      insight: {
        title: "뉘앙스",
        bodyKo: `the most useful adaptive insight in ${nativeLanguage.nameEn}`
      },
      literalMeaningKo: `literal structural meaning in ${nativeLanguage.nameEn}`,
      nuanceKo: `natural conversational nuance in ${nativeLanguage.nameEn}`,
      breakdown: [
        {
          expression: `short ${targetLanguage.nameEn} phrase or pattern`,
          meaningKo: `structural explanation in ${nativeLanguage.nameEn}`
        }
      ],
      alternatives: [
        {
          en: `natural alternative ${targetLanguage.nameEn} sentence`,
          ko: `natural ${nativeLanguage.nameEn} translation`,
          pronunciationKo: targetPronunciationGuide,
          ipa: targetIpa
        }
      ],
      commonMistake: {
        wrong: {
          en: `tempting but awkward ${targetLanguage.nameEn} sentence`,
          ko: `intended or literal ${nativeLanguage.nameEn} meaning`,
          pronunciationKo: targetPronunciationGuide,
          ipa: targetIpa
        },
        right: {
          en: `recommended ${targetLanguage.nameEn} correction`,
          ko: `natural ${nativeLanguage.nameEn} translation`,
          pronunciationKo: targetPronunciationGuide,
          ipa: targetIpa
        },
        explanationKo: `short correction explanation in ${nativeLanguage.nameEn}`
      },
      miniDrills: [
        {
          en: `short transferable ${targetLanguage.nameEn} practice sentence`,
          ko: `natural ${nativeLanguage.nameEn} translation`,
          pronunciationKo: targetPronunciationGuide,
          ipa: targetIpa
        }
      ],
      tags: ["conversation", "adaptive-output"]
    },
    highlightMappings: [
      {
        sourceText: `key ${targetLanguage.nameEn} expression`,
        literalKo: `literal meaning in ${nativeLanguage.nameEn}`,
        naturalKo: `natural usage meaning in ${nativeLanguage.nameEn}`,
        colorKey: "red"
      }
    ],
    vocabularyItems: [
      {
        term: `key ${targetLanguage.nameEn} expression`,
        ipa: "",
        partOfSpeech: "phrase",
        basicMeaningKo: `basic meaning in ${nativeLanguage.nameEn}`,
        meaningInContextKo: "meaning in this conversation",
        colorKey: "red",
        examples: ["short natural example 1", "short natural example 2"],
        exampleTranslationsKo: [
          "Korean translation of short natural example 1",
          "Korean translation of short natural example 2"
        ]
      }
    ],
    structureNote:
      "기억할 표현\n- key expression 1\n- key expression 2\n\n주의할 표현\nwording that should not be memorized for this intent",
    confusingComparisons: [
      {
        title: "문맥에 안 맞는 표현",
        explanationKo: "why this wording should not be memorized for the intended meaning"
      }
    ],
    pumpPrompts: [
      {
        type: "ko_to_en",
        promptKo: "captured Korean Me text",
        requiredTerms: ["key English expression"]
      }
    ]
  };
}

export function createLifeExpressionSystemPrompt(input: GenerateLifeExpressionCardInput) {
  const { targetLanguage, nativeLanguage } = input.learningProfile;
  return [
    `You create natural ${targetLanguage.nameEn} conversation cards from ${nativeLanguage.nameEn} life-mining captures.`,
    "Return valid JSON only. Do not wrap JSON in Markdown.",
    "The captured message is always the learner's own message. Label it as Me.",
    "Use any previous context only as conversation context. Do not invent after-context.",
    "Preserve Me as the learner label, but normalize all other speaker names to A, B, C in output fields.",
    "Do not copy real usernames, account handles, emails, profile names, URLs, or local paths from context into the card.",
    `Explain learning notes in ${nativeLanguage.nameEn}.`,
    `Target output language: ${targetLanguage.nameEn} (${targetLanguage.code}).`,
    `Learner native language: ${nativeLanguage.nameEn} (${nativeLanguage.code}).`,
    "Return exactly this JSON shape and field names:",
    JSON.stringify(createLifeExpressionJsonShape(input), null, 2)
  ].join("\n");
}

export function createLifeExpressionUserPrompt(input: GenerateLifeExpressionCardInput) {
  const { targetLanguage, nativeLanguage } = input.learningProfile;
  return [
    `Captured Me text: ${input.koreanText}`,
    input.beforeContext ? `Previous speaker-labelled context:\n${input.beforeContext}` : "",
    input.afterContext ? `After context, if explicitly provided:\n${input.afterContext}` : "",
    "Rules:",
    "- cardType must be \"life_expression\".",
    "- deckType must be \"output\".",
    "- direction must be \"native_to_target\".",
    `- sourceSentence must be the captured ${nativeLanguage.nameEn} Me text.`,
    `- targetText must be the best natural ${targetLanguage.nameEn} version of Me's reply.`,
    "- frontText must use exactly these headings: 맥락, 원문.",
    `- frontText must include a short ${nativeLanguage.nameEn} context summary under 맥락.`,
    `- frontText's 원문 must show the previous speaker-labelled context followed by Me: captured ${nativeLanguage.nameEn} text.`,
    `- literalTranslationKo must use the heading ${targetLanguage.nameKo} 대화 and match the same speaker order as 원문, translated into natural ${targetLanguage.nameEn}.`,
    "- naturalTranslationKo must use the heading 내 답변 변형 and include 짧게, 캐주얼, 공손하게.",
    `- In naturalTranslationKo, every answer variant line must be immediately followed by a ${nativeLanguage.nameEn} meaning line that starts with 뜻:.`,
    "- Example format: 짧게: target-language answer\n뜻: learner-native meaning of that answer.",
    "- answerCandidates is required. Put natural answers in kind \"recommended\" and tempting but wrong or literal answers in kind \"rejected\".",
    "- Include at least three recommended answerCandidates with best, short, and casual or polite registers. Include a rejected candidate when there is a tempting word-for-word rendering.",
    "- structureNote must explain reusable expressions and any unnatural wording cautions in the learner's native language, but validation must come from answerCandidates.",
    "- First infer Me's intended meaning from the whole conversation, then write target-language replies for that intent. Do not translate the captured text word-by-word.",
    "- targetText must exactly equal one recommended answerCandidates[].text and must not equal any rejected answerCandidates[].text.",
    "- The Me line in literalTranslationKo must use the same recommended answer as targetText.",
    "- naturalTranslationKo should present the recommended answer variants for the learner, with a native-language meaning under each variant.",
    "- Rejected candidates are useful only as warnings in notes, never as the answer to memorize.",
    "- tags is required. Return 3 to 6 concise classification tags using category:value format, preferably 주제:, 의도:, 상황:, or 말투: prefixes in the learner's native language.",
    "- Do not duplicate deck type, language name, provider name, usernames, or one-off proper nouns as tags.",
    "- outputStudyGuide.tags must contain the same normalized values as the top-level tags field.",
    "- outputStudyGuide is required and templateVersion must be \"adaptive-v1\". This is the final default output-card template.",
    "- outputStudyGuide.dialogue must preserve the same conversation order as frontText, include the relevant previous speaker and Me, and translate both into the target language.",
    "- Every complete target-language sentence anywhere in outputStudyGuide must include its natural native-language translation in ko, a Hangul pronunciation in pronunciationKo, and full-sentence IPA in ipa.",
    `- CRITICAL FIELD ALIGNMENT: in every dialogue, keyChunks, alternatives, commonMistake, and miniDrills item, pronunciationKo and ipa must transcribe that exact same item's en value in ${targetLanguage.nameEn}. They must never pronounce or transcribe the item's ko value in ${nativeLanguage.nameEn}.`,
    "- Before returning JSON, verify each item as a triple: en = text being learned, ko = meaning only, pronunciationKo/ipa = pronunciation of en only.",
    ...(targetLanguage.code.trim().toLowerCase() === "en"
      ? [
          '- Example: en "What do moles like?", ko "두더지는 무엇을 좋아하나요?", pronunciationKo "왓 두 몰즈 라이크?", ipa "/wʌt duː moʊlz laɪk/".'
        ]
      : []),
    "- Every IPA value must mark lexical primary stress with ˈ where appropriate. Do not omit stress marks from multisyllabic content words.",
    "- Hangul pronunciation should reflect useful connected speech without pretending to be exact phonetics; IPA is the precise reference.",
    "- outputStudyGuide.keyChunks must include one context chunk with tone \"context\" and one Me chunk with tone \"learner\".",
    "- Set dialogue[].highlightEn and highlightKo to the exact substrings matching those key chunks so both sides can be highlighted.",
    "- Choose outputStudyGuide.insight.title adaptively from labels such as 직역, 뉘앙스, 더 자연스러운 변형, or 문법 포인트 according to the sentence's most useful lesson.",
    "- Include literalMeaningKo, nuanceKo, a compact breakdown, at least two alternatives, one useful commonMistake when applicable, and at least two miniDrills.",
    "- Never place an English example sentence in outputStudyGuide without the immediately associated ko, pronunciationKo, and ipa fields.",
    "- vocabularyItems[].examples must be short target-language example sentences, not translations.",
    "- vocabularyItems[].exampleTranslationsKo must contain Korean translations for examples[] in the same order.",
    "- pumpPrompts must contain only ko_to_en prompts for Korean-to-target-language writing practice. The only allowed pumpPrompts[].type value is \"ko_to_en\".",
    "- Do not include instructional text like 'say this in English' on the front."
  ]
    .filter(Boolean)
    .join("\n");
}

export function repairLifeExpressionCardConsistency(card: LifeExpressionCardDraft): GeneratedCardData {
  if (card.cardType !== "life_expression") {
    return stripLifeExpressionDraftFields(card);
  }

  card = {
    ...card,
    outputStudyGuide: normalizeOutputStudyGuidePronunciations(card.outputStudyGuide)
  };

  const targetText = normalizeLifeExpressionCandidate(card.targetText);
  const candidates = normalizeLifeExpressionAnswerCandidates(card.answerCandidates);
  if (candidates.length === 0) {
    return stripLifeExpressionDraftFields(card);
  }

  const recommended = candidates.filter((candidate) => candidate.kind === "recommended");
  const rejected = candidates.filter((candidate) => candidate.kind === "rejected");
  const targetIsRecommended = recommended.some((candidate) =>
    expressionsMatch(candidate.text, targetText)
  );
  const targetIsRejected = rejected.some((candidate) => expressionsMatch(candidate.text, targetText));

  if (targetText && targetIsRecommended && !targetIsRejected) {
    return stripLifeExpressionDraftFields({
      ...card,
      naturalTranslationKo: completeLifeExpressionVariantMeanings(
        card.naturalTranslationKo,
        recommended
      )
    });
  }

  const replacement = recommended.find(
    (candidate) =>
      !rejected.some((rejectedCandidate) =>
        expressionsMatch(rejectedCandidate.text, candidate.text)
      )
  )?.text;
  if (!replacement) {
    return stripLifeExpressionDraftFields(card);
  }

  return stripLifeExpressionDraftFields({
    ...card,
    targetText: replacement,
    literalTranslationKo: replaceStandaloneExpression(card.literalTranslationKo, targetText, replacement),
    naturalTranslationKo: completeLifeExpressionVariantMeanings(
      card.naturalTranslationKo,
      recommended
    )
  });
}

export function createLifeExpressionFallbackCard(
  input: GenerateLifeExpressionCardInput
): GeneratedCardData {
  const { targetLanguage } = input.learningProfile;
  const koreanText = input.koreanText.trim() || "나 좀 늦을 것 같아. 먼저 시작해도 돼.";
  const originalConversation = formatOriginalConversation(input.beforeContext, koreanText);
  const fallbackOutput = getFallbackOutput(targetLanguage.code);
  const fallbackTerms = getFallbackTerms(targetLanguage.code);
  const fallbackTags = ["주제:일상", "의도:도착알림", "상황:약속"];

  return {
    cardType: "life_expression",
    deckType: "output",
    direction: "native_to_target",
    sourceSentence: koreanText,
    targetText: fallbackOutput.best,
    frontText: [
      "맥락",
      "내가 실제 대화에서 쓴 한국어 답변을 영어로 자연스럽게 말하는 상황.",
      "",
      "원문",
      originalConversation
    ].join("\n"),
    literalTranslationKo: [
      `${targetLanguage.nameKo} 대화`,
      inferFallbackTargetConversation(input.beforeContext, targetLanguage.nameKo),
      `Me: ${fallbackOutput.best}`
    ]
      .filter(Boolean)
      .join("\n"),
    naturalTranslationKo: [
      "내 답변 변형",
      `짧게: ${fallbackOutput.short}`,
      `뜻: ${fallbackOutput.shortKo}`,
      `캐주얼: ${fallbackOutput.casual}`,
      `뜻: ${fallbackOutput.casualKo}`,
      `공손하게: ${fallbackOutput.polite}`,
      `뜻: ${fallbackOutput.politeKo}`
    ].join("\n"),
    highlightMappings: [
      {
        sourceText: fallbackTerms[0],
        literalKo: "조금 늦을 것 같다",
        naturalKo: "예정보다 살짝 늦어질 때 쓰는 표현",
        colorKey: "red"
      },
      {
        sourceText: fallbackTerms[1],
        literalKo: "나 없이 먼저 진행해",
        naturalKo: "나 기다리지 말고 먼저 시작해",
        colorKey: "blue"
      }
    ],
    vocabularyItems: [
      {
        term: fallbackTerms[0],
        ipa: "",
        partOfSpeech: "phrase",
        basicMeaningKo: "조금 늦을 것 같다",
        meaningInContextKo: "약속이나 대화 참여가 예정 시간보다 늦어질 때 쓰는 자연스러운 표현",
        colorKey: "red",
        examples: [
          "I'm running a little late, but I'll be there soon.",
          "Sorry, I'm running a little late."
        ],
        exampleTranslationsKo: [
          "조금 늦고 있지만 곧 도착할게요.",
          "미안해요, 조금 늦고 있어요."
        ]
      },
      {
        term: fallbackTerms[1],
        ipa: "",
        partOfSpeech: "phrase",
        basicMeaningKo: "나 없이 먼저 진행해",
        meaningInContextKo: "상대에게 기다리지 말고 먼저 시작하라고 할 때 쓰는 표현",
        colorKey: "blue",
        examples: [
          "Go ahead without me. I'll catch up later.",
          "If I'm not there by 7, go ahead without me."
        ],
        exampleTranslationsKo: [
          "나 없이 먼저 진행하세요. 나중에 따라갈게요.",
          "내가 7시까지 안 오면 나 없이 먼저 진행하세요."
        ]
      }
    ],
    structureNote: [
      "기억할 표현",
      `- ${fallbackTerms[0]}`,
      `- ${fallbackTerms[1]}`,
      `- ${fallbackOutput.polite}`,
      "",
      "주의할 표현",
      getFallbackAwkwardDirectTranslation(targetLanguage.code)
    ].join("\n"),
    tags: fallbackTags,
    outputStudyGuide: createFallbackOutputStudyGuide(
      targetLanguage.code,
      koreanText,
      fallbackOutput,
      fallbackTags
    ),
    confusingComparisons: [
      {
        title: "문맥에 안 맞는 표현",
        explanationKo:
          `${getFallbackAwkwardDirectTranslation(targetLanguage.code)}처럼 한국어 어순을 그대로 옮기면 어색합니다. 상황에 맞는 자연스러운 표현을 통째로 기억하는 편이 좋습니다.`
      }
    ],
    pumpPrompts: [
      {
        type: "ko_to_en",
        promptKo: koreanText,
        requiredTerms: fallbackTerms
      }
    ]
  };
}

function createFallbackOutputStudyGuide(
  targetLanguageCode: string,
  koreanText: string,
  fallbackOutput: ReturnType<typeof getFallbackOutput>,
  tags: string[]
): NonNullable<GeneratedCardData["outputStudyGuide"]> {
  if (targetLanguageCode.trim().toLowerCase() === "ja") {
    return {
      templateVersion: "adaptive-v1",
      contextKo: "약속 시간에 조금 늦을 것 같아 상대에게 먼저 시작해도 된다고 말하는 상황입니다.",
      dialogue: [
        {
          speaker: "A",
          role: "context",
          en: "時間どおりに来られそうですか。",
          ko: "시간에 맞춰 올 수 있을 것 같아요?",
          pronunciationKo: "지칸도오리니 코라레소오데스카.",
          ipa: "/dʑikaɴdoːɾi ni koɾaɾesoː desɯ ka/",
          highlightEn: "時間どおりに",
          highlightKo: "시간에 맞춰"
        },
        {
          speaker: "Me",
          role: "me",
          en: fallbackOutput.best,
          ko: koreanText,
          pronunciationKo: "스코시 오쿠레소오데스. 사키니 하지메테이테 다이조오부데스.",
          ipa: "/sɯkoɕi okɯɾesoː desɯ. saki ni hadʑimete ite daidʑoːbɯ desɯ/",
          highlightEn: "先に始めていて",
          highlightKo: "먼저 시작"
        }
      ],
      keyChunks: [
        {
          label: "직전 문장 청크",
          en: "時間どおりに",
          ko: "시간에 맞춰",
          pronunciationKo: "지칸도오리니",
          ipa: "/dʑikaɴdoːɾi ni/",
          tone: "context"
        },
        {
          label: "내 답변 핵심 청크",
          en: "先に始めていて",
          ko: "먼저 시작하고 있어",
          pronunciationKo: "사키니 하지메테이테",
          ipa: "/saki ni hadʑimete ite/",
          tone: "learner"
        }
      ],
      insight: {
        title: "뉘앙스",
        bodyKo: "遅れそうです는 늦을 가능성을 부드럽게 알리고, 大丈夫です는 상대가 먼저 시작해도 괜찮다고 안심시키는 표현입니다."
      },
      literalMeaningKo: "조금 늦을 것 같습니다. 먼저 시작하고 있어도 괜찮습니다.",
      nuanceKo: "지각을 알리면서 상대가 기다리지 않아도 된다는 배려를 함께 전합니다.",
      breakdown: [
        { expression: "少し遅れそうです", meaningKo: "조금 늦을 것 같습니다" },
        { expression: "先に始めていて", meaningKo: "먼저 시작하고 있어 주세요" }
      ],
      alternatives: [
        {
          en: fallbackOutput.short,
          ko: fallbackOutput.shortKo,
          pronunciationKo: "스코시 오쿠레마스. 사키니 하지메테 쿠다사이.",
          ipa: "/sɯkoɕi okɯɾemasɯ. saki ni hadʑimete kɯdasai/"
        },
        {
          en: fallbackOutput.casual,
          ko: fallbackOutput.casualKo,
          pronunciationKo: "촛토 오쿠레소오다카라, 사키니 하지메테테.",
          ipa: "/tɕotto okɯɾesoː dakara, saki ni hadʑimetete/"
        }
      ],
      commonMistake: {
        wrong: {
          en: "私は少し遅いです。",
          ko: "나는 조금 늦습니다.",
          pronunciationKo: "와타시와 스코시 오소이데스.",
          ipa: "/wataɕi wa sɯkoɕi osoi desɯ/"
        },
        right: {
          en: "少し遅れそうです。",
          ko: "조금 늦을 것 같아요.",
          pronunciationKo: "스코시 오쿠레소오데스.",
          ipa: "/sɯkoɕi okɯɾesoː desɯ/"
        },
        explanationKo: "사람이 약속에 늦는 상황에서는 遅い보다 遅れる를 쓰는 편이 자연스럽습니다."
      },
      miniDrills: [
        {
          en: "少し遅れそうです。",
          ko: "조금 늦을 것 같아요.",
          pronunciationKo: "스코시 오쿠레소오데스.",
          ipa: "/sɯkoɕi okɯɾesoː desɯ/"
        },
        {
          en: "先に始めてください。",
          ko: "먼저 시작해 주세요.",
          pronunciationKo: "사키니 하지메테 쿠다사이.",
          ipa: "/saki ni hadʑimete kɯdasai/"
        }
      ],
      tags
    };
  }

  return {
    templateVersion: "adaptive-v1",
    contextKo: "약속 시간에 조금 늦을 것 같아 상대에게 먼저 시작해도 된다고 말하는 상황입니다.",
    dialogue: [
      {
        speaker: "A",
        role: "context",
        en: "Are you going to be here on time?",
        ko: "시간에 맞춰 올 수 있어?",
        pronunciationKo: "아 유 고잉 투 비 히어 온 타임?",
        ipa: "/ɑːr juː ˈɡoʊɪŋ tə biː hɪr ɑːn taɪm/",
        highlightEn: "on time",
        highlightKo: "시간에 맞춰"
      },
      {
        speaker: "Me",
        role: "me",
        en: fallbackOutput.best,
        ko: koreanText,
        pronunciationKo: "아이 씽크 아임 고잉 투 비 어 빗 레이트. 유 캔 스타트 위다웃 미.",
        ipa: "/aɪ θɪŋk aɪm ˈɡoʊɪŋ tə biː ə bɪt leɪt. juː kən stɑːrt wɪˈðaʊt miː/",
        highlightEn: "start without me",
        highlightKo: "먼저 시작"
      }
    ],
    keyChunks: [
      {
        label: "직전 문장 청크",
        en: "on time",
        ko: "시간에 맞춰",
        pronunciationKo: "온 타임",
        ipa: "/ɑːn taɪm/",
        tone: "context"
      },
      {
        label: "내 답변 핵심 청크",
        en: "start without me",
        ko: "나 없이 먼저 시작하다",
        pronunciationKo: "스타트 위다웃 미",
        ipa: "/stɑːrt wɪˈðaʊt miː/",
        tone: "learner"
      }
    ],
    insight: {
      title: "뉘앙스",
      bodyKo: "be a bit late로 지각 가능성을 부드럽게 알리고, start without me로 상대가 기다리지 않아도 된다는 배려를 전합니다."
    },
    literalMeaningKo: "나는 조금 늦을 것 같아. 너는 나 없이 시작해도 돼.",
    nuanceKo: "늦는다는 사과성 안내와 상대에게 먼저 진행하라는 허락을 자연스럽게 연결합니다.",
    breakdown: [
      { expression: "be a bit late", meaningKo: "조금 늦다" },
      { expression: "start without me", meaningKo: "나 없이 먼저 시작하다" }
    ],
    alternatives: [
      {
        en: fallbackOutput.short,
        ko: fallbackOutput.shortKo,
        pronunciationKo: "아일 비 어 빗 레이트. 고 어헤드 위다웃 미.",
        ipa: "/aɪl biː ə bɪt leɪt. ɡoʊ əˈhed wɪˈðaʊt miː/"
      },
      {
        en: fallbackOutput.casual,
        ko: fallbackOutput.casualKo,
        pronunciationKo: "아임 러닝 어 리틀 레이트, 소 저스트 스타트 위다웃 미.",
        ipa: "/aɪm ˈrʌnɪŋ ə ˈlɪtl leɪt, soʊ dʒʌst stɑːrt wɪˈðaʊt miː/"
      }
    ],
    commonMistake: {
      wrong: {
        en: "I will be late a little.",
        ko: "나는 조금 늦을 것이다.",
        pronunciationKo: "아이 윌 비 레이트 어 리틀.",
        ipa: "/aɪ wɪl biː leɪt ə ˈlɪtl/"
      },
      right: {
        en: "I'm running a little late.",
        ko: "나 조금 늦고 있어.",
        pronunciationKo: "아임 러닝 어 리틀 레이트.",
        ipa: "/aɪm ˈrʌnɪŋ ə ˈlɪtl leɪt/"
      },
      explanationKo: "현재 늦어지고 있는 상황은 run late를 사용하면 훨씬 자연스럽습니다."
    },
    miniDrills: [
      {
        en: "I'm running a little late.",
        ko: "나 조금 늦고 있어.",
        pronunciationKo: "아임 러닝 어 리틀 레이트.",
        ipa: "/aɪm ˈrʌnɪŋ ə ˈlɪtl leɪt/"
      },
      {
        en: "Go ahead without me.",
        ko: "나 없이 먼저 시작해.",
        pronunciationKo: "고 어헤드 위다웃 미.",
        ipa: "/ɡoʊ əˈhed wɪˈðaʊt miː/"
      }
    ],
    tags
  };
}

function normalizeLifeExpressionAnswerCandidates(value: unknown): LifeExpressionAnswerCandidate[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: LifeExpressionAnswerCandidate[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const text = normalizeLifeExpressionCandidate(record.text);
    const kind = record.kind;
    if (!text || (kind !== "recommended" && kind !== "rejected")) {
      continue;
    }
    const key = `${kind}:${normalizeComparableText(text)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({
      text,
      kind,
      register: normalizeAnswerCandidateRegister(record.register),
      noteKo: typeof record.noteKo === "string" ? record.noteKo.trim() : undefined
    });
  }
  return result;
}

function completeLifeExpressionVariantMeanings(
  value: unknown,
  recommendedCandidates: LifeExpressionAnswerCandidate[]
) {
  const text = String(value ?? "").trim();
  if (!text) {
    return formatLifeExpressionVariantsFromCandidates(recommendedCandidates);
  }
  if (/(?:^|\n)\s*뜻\s*[:：]/.test(text)) {
    return text;
  }

  const lines = text.split(/\r?\n/);
  const completed: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    completed.push(line);
    const expression = extractLifeReplyVariantExpression(line);
    const nextLine = lines[index + 1] ?? "";
    if (!expression || parseLifeReplyMeaningLine(nextLine)) {
      continue;
    }
    const candidate = recommendedCandidates.find((item) =>
      expressionsMatch(item.text, expression)
    );
    completed.push(`뜻: ${candidate?.noteKo || "같은 의미를 자연스럽게 말하는 대체 표현입니다."}`);
  }
  return completed.join("\n").trim();
}

function formatLifeExpressionVariantsFromCandidates(
  recommendedCandidates: LifeExpressionAnswerCandidate[]
) {
  const lines = ["내 답변 변형"];
  for (const candidate of recommendedCandidates.slice(0, 4)) {
    lines.push(`${getAnswerCandidateRegisterLabel(candidate.register)}: ${candidate.text}`);
    lines.push(`뜻: ${candidate.noteKo || "같은 의미를 자연스럽게 말하는 대체 표현입니다."}`);
  }
  return lines.join("\n");
}

function extractLifeReplyVariantExpression(value: string) {
  const line = value.trim();
  if (!line || isLifeReplyVariantsHeading(line) || parseLifeReplyMeaningLine(line)) {
    return "";
  }
  return /^([^:：]{1,18})[:：]\s*(.+)$/.exec(line)?.[2]?.trim() || line;
}

function parseLifeReplyMeaningLine(value: string) {
  return /^(?:뜻|의미|번역|한국어|한글)\s*[:：]\s*(.+)$/.exec(value.trim())?.[1]?.trim() ?? "";
}

function isLifeReplyVariantsHeading(value: string) {
  return /^(?:내 답변 변형|answer variants)$/i.test(value.trim());
}

function getAnswerCandidateRegisterLabel(register: LifeExpressionAnswerCandidate["register"]) {
  switch (register) {
    case "best":
      return "추천";
    case "short":
      return "짧게";
    case "casual":
      return "캐주얼";
    case "polite":
      return "공손하게";
    default:
      return "대체";
  }
}

function normalizeAnswerCandidateRegister(
  value: unknown
): LifeExpressionAnswerCandidate["register"] | undefined {
  return value === "best" ||
    value === "short" ||
    value === "casual" ||
    value === "polite" ||
    value === "neutral"
    ? value
    : undefined;
}

function stripLifeExpressionDraftFields(card: LifeExpressionCardDraft): GeneratedCardData {
  const { answerCandidates: _answerCandidates, ...studyCardFields } = card;
  return studyCardFields;
}

function replaceStandaloneExpression(value: unknown, source: string, replacement: string) {
  const text = String(value ?? "");
  if (!text || !source.trim()) {
    return text;
  }
  return text
    .split(/\r?\n/)
    .map((line) => {
      const labelled = line.match(/^(\s*(?:Me|나|私|僕|俺|저)\s*[:：]\s*)(.+)$/i);
      if (labelled && expressionsMatch(labelled[2], source)) {
        return `${labelled[1]}${replacement}`;
      }
      return expressionsMatch(line, source) ? replacement : line;
    })
    .join("\n");
}

function expressionsMatch(left: unknown, right: unknown) {
  return normalizeComparableText(left) === normalizeComparableText(right);
}

function normalizeLifeExpressionCandidate(value: unknown) {
  return String(value ?? "")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComparableText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/["'“”‘’`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatOriginalConversation(beforeContext: string | undefined, koreanText: string) {
  const context = beforeContext?.trim();
  return [context, `Me: ${koreanText}`].filter(Boolean).join("\n");
}

function inferFallbackTargetConversation(beforeContext: string | undefined, targetLanguageKo: string) {
  if (!beforeContext?.trim()) {
    return "";
  }
  return beforeContext
    .split(/\n+/)
    .map((line) => {
      const [speaker] = line.split(":");
      const label = speaker?.trim() || "A";
      if (label === "Me") {
        return `Me: 이전 메시지를 자연스러운 ${targetLanguageKo}로 번역한 문장.`;
      }
      return `${label}: 이전 메시지를 자연스러운 ${targetLanguageKo}로 번역한 문장.`;
    })
    .join("\n");
}

function getFallbackOutput(targetLanguageCode: string) {
  if (targetLanguageCode.trim().toLowerCase() === "ja") {
    return {
      best: "少し遅れそうです。先に始めていて大丈夫です。",
      short: "少し遅れます。先に始めてください。",
      shortKo: "조금 늦을 것 같아요. 먼저 시작해 주세요.",
      casual: "ちょっと遅れそうだから、先に始めてて。",
      casualKo: "조금 늦을 것 같으니까 먼저 시작하고 있어.",
      polite: "少し遅れるかもしれませんので、先に始めていただいて大丈夫です。",
      politeKo: "조금 늦을지도 모르니 먼저 시작하셔도 괜찮습니다."
    };
  }

  return {
    best: "I think I'm going to be a bit late. You can start without me.",
    short: "I'll be a bit late. Go ahead without me.",
    shortKo: "조금 늦을 것 같아. 나 없이 먼저 시작해.",
    casual: "I'm running a little late, so just start without me.",
    casualKo: "나 조금 늦고 있으니까 그냥 나 없이 먼저 시작해.",
    polite: "I might be a bit late, so please feel free to start without me.",
    politeKo: "제가 조금 늦을 수도 있으니 편하게 먼저 시작하셔도 됩니다."
  };
}

function getFallbackTerms(targetLanguageCode: string) {
  if (targetLanguageCode.trim().toLowerCase() === "ja") {
    return ["少し遅れそう", "先に始めていて"];
  }
  return ["running a little late", "go ahead without me"];
}

function getFallbackAwkwardDirectTranslation(targetLanguageCode: string) {
  if (targetLanguageCode.trim().toLowerCase() === "ja") {
    return "私は少し遅いです。";
  }
  return "I will be late a little.";
}
