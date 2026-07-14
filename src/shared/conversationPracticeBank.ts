import type { WritingPracticePrompt } from "./writingPractice";

type ConversationVariant = Record<string, string>;

type ConversationPattern = {
  id: string;
  level: "easy" | "medium" | "hard";
  tone: "casual" | "polite" | "neutral";
  ko: string;
  en: string;
  requiredTerms: string[];
};

type ConversationCategory = {
  id: string;
  labelKo: string;
  variants: ConversationVariant[];
  patterns: ConversationPattern[];
};

function buildConversationPracticePrompts(): WritingPracticePrompt[] {
  return conversationCategories.flatMap((category) =>
    category.patterns.flatMap((pattern, patternIndex) =>
      getPatternVariants(category.variants, patternIndex).map((variant, index) => ({
        id: `conversation-${category.id}-${pattern.id}-${String(index + 1).padStart(2, "0")}`,
        promptKo: fillTemplate(pattern.ko, variant),
        targetEnglish: fillTemplate(pattern.en, variant),
        requiredTerms: pattern.requiredTerms
          .map((term) => fillTemplate(term, variant).trim())
          .filter(Boolean),
        promptType: "ko_to_en",
        source: "conversation-bank",
        sourceLabel: `회화 문장 · ${category.labelKo}`
      }))
    )
  );
}

function getPatternVariants(variants: ConversationVariant[], patternIndex: number) {
  const count = Math.min(5, variants.length);
  const start = (patternIndex * count) % variants.length;
  return Array.from({ length: count }, (_, offset) => variants[(start + offset) % variants.length]);
}

function fillTemplate(template: string, variant: ConversationVariant) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => variant[key] ?? "");
}

const conversationCategories: ConversationCategory[] = [
  {
    id: "schedule",
    labelKo: "일정/약속",
    variants: [
      { eventKo: "회의", eventEn: "the meeting" },
      { eventKo: "수업", eventEn: "class" },
      { eventKo: "약속", eventEn: "our appointment" },
      { eventKo: "면접", eventEn: "the interview" },
      { eventKo: "병원 예약", eventEn: "my doctor's appointment" },
      { eventKo: "온라인 모임", eventEn: "the online meetup" },
      { eventKo: "팀 콜", eventEn: "the team call" },
      { eventKo: "저녁 약속", eventEn: "dinner" },
      { eventKo: "스터디", eventEn: "the study session" },
      { eventKo: "가족 모임", eventEn: "the family gathering" }
    ],
    patterns: [
      {
        id: "late",
        level: "easy",
        tone: "casual",
        ko: "나 {eventKo}에 조금 늦을 것 같아.",
        en: "I think I'm going to be a little late for {eventEn}.",
        requiredTerms: ["going to be", "a little late"]
      },
      {
        id: "push-back",
        level: "medium",
        tone: "neutral",
        ko: "가능하면 {eventKo} 시간을 조금 미룰 수 있을까?",
        en: "Could we push {eventEn} back a little if possible?",
        requiredTerms: ["could we", "push back"]
      },
      {
        id: "double-check",
        level: "easy",
        tone: "neutral",
        ko: "나 {eventKo} 시간을 다시 확인하고 싶어.",
        en: "I want to double-check the time for {eventEn}.",
        requiredTerms: ["double-check", "the time"]
      },
      {
        id: "not-sure",
        level: "medium",
        tone: "casual",
        ko: "오늘 {eventKo}에 갈 수 있는지 아직 확실하지 않아.",
        en: "I'm still not sure if I can make it to {eventEn} today.",
        requiredTerms: ["not sure", "make it"]
      },
      {
        id: "after",
        level: "easy",
        tone: "casual",
        ko: "{eventKo} 끝나면 바로 연락할게.",
        en: "I'll message you as soon as {eventEn} is over.",
        requiredTerms: ["as soon as", "is over"]
      },
      {
        id: "can-we-keep",
        level: "medium",
        tone: "neutral",
        ko: "{eventKo}는 그대로 진행하는 거 맞지?",
        en: "Are we still going ahead with {eventEn} as planned?",
        requiredTerms: ["going ahead", "as planned"]
      },
      {
        id: "need-leave",
        level: "easy",
        tone: "casual",
        ko: "{eventKo} 중간에 먼저 나가야 할 수도 있어.",
        en: "I might have to leave {eventEn} early.",
        requiredTerms: ["might have to", "leave early"]
      },
      {
        id: "move-earlier",
        level: "medium",
        tone: "neutral",
        ko: "{eventKo}를 조금 더 이른 시간으로 옮길 수 있을까?",
        en: "Could we move {eventEn} to a slightly earlier time?",
        requiredTerms: ["move", "earlier time"]
      },
      {
        id: "reminder",
        level: "easy",
        tone: "casual",
        ko: "{eventKo} 전에 나한테 한 번만 알려줘.",
        en: "Please remind me once before {eventEn}.",
        requiredTerms: ["remind me", "before"]
      },
      {
        id: "just-confirming",
        level: "medium",
        tone: "neutral",
        ko: "{eventKo} 관련해서 내가 놓친 게 없는지 확인 중이야.",
        en: "I'm checking if I missed anything about {eventEn}.",
        requiredTerms: ["checking if", "missed anything"]
      }
    ]
  },
  {
    id: "request",
    labelKo: "부탁/요청",
    variants: [
      {
        itemKo: "이 파일",
        itemEn: "this file",
        taskKo: "이 설정 변경",
        taskEn: "changing this setting",
        detailKo: "마지막 문단",
        detailEn: "the last paragraph"
      },
      {
        itemKo: "그 링크",
        itemEn: "that link",
        taskKo: "계정 연결",
        taskEn: "connecting the account",
        detailKo: "두 번째 단계",
        detailEn: "the second step"
      },
      {
        itemKo: "회의 자료",
        itemEn: "the meeting notes",
        taskKo: "자료 정리",
        taskEn: "organizing the notes",
        detailKo: "핵심 요약",
        detailEn: "the main summary"
      },
      {
        itemKo: "오늘 일정",
        itemEn: "today's schedule",
        taskKo: "시간 조정",
        taskEn: "adjusting the time",
        detailKo: "겹치는 시간",
        detailEn: "the overlapping time"
      },
      {
        itemKo: "새 버전",
        itemEn: "the new version",
        taskKo: "새 버전 설치",
        taskEn: "installing the new version",
        detailKo: "설치 안내",
        detailEn: "the installation guide"
      },
      {
        itemKo: "그 사진",
        itemEn: "that photo",
        taskKo: "사진 업로드",
        taskEn: "uploading the photo",
        detailKo: "파일 이름",
        detailEn: "the file name"
      },
      {
        itemKo: "채팅 기록",
        itemEn: "the chat history",
        taskKo: "대화 내용 찾기",
        taskEn: "finding the conversation",
        detailKo: "내가 보낸 메시지",
        detailEn: "the message I sent"
      },
      {
        itemKo: "문제 화면",
        itemEn: "the error screen",
        taskKo: "오류 확인",
        taskEn: "checking the error",
        detailKo: "오류 메시지",
        detailEn: "the error message"
      },
      {
        itemKo: "결제 내역",
        itemEn: "the payment history",
        taskKo: "결제 확인",
        taskEn: "checking the payment",
        detailKo: "결제 날짜",
        detailEn: "the payment date"
      },
      {
        itemKo: "초대 링크",
        itemEn: "the invite link",
        taskKo: "초대 링크 만들기",
        taskEn: "creating an invite link",
        detailKo: "권한 설정",
        detailEn: "the permission settings"
      }
    ],
    patterns: [
      {
        id: "check-first",
        level: "easy",
        tone: "casual",
        ko: "혹시 {itemKo} 먼저 확인해줄 수 있어?",
        en: "Could you check {itemEn} first?",
        requiredTerms: ["could you", "check"]
      },
      {
        id: "send-again",
        level: "easy",
        tone: "casual",
        ko: "가능하면 {itemKo} 나한테 다시 보내줄래?",
        en: "Could you send {itemEn} to me again if possible?",
        requiredTerms: ["send", "again"]
      },
      {
        id: "explain",
        level: "medium",
        tone: "neutral",
        ko: "{taskKo}을 짧게 설명해줄 수 있어?",
        en: "Could you briefly explain {taskEn}?",
        requiredTerms: ["briefly explain"]
      },
      {
        id: "look-again",
        level: "easy",
        tone: "casual",
        ko: "{detailKo}만 한 번 더 봐줄래?",
        en: "Could you take one more look at {detailEn}?",
        requiredTerms: ["take one more look"]
      },
      {
        id: "help-with",
        level: "medium",
        tone: "neutral",
        ko: "내가 {taskKo} 할 때 조금 도와줄 수 있어?",
        en: "Could you help me a bit with {taskEn}?",
        requiredTerms: ["help me", "a bit"]
      },
      {
        id: "when-free",
        level: "easy",
        tone: "casual",
        ko: "시간 될 때 {itemKo}만 확인해줘.",
        en: "Please check {itemEn} when you have time.",
        requiredTerms: ["when you have time"]
      },
      {
        id: "show-me",
        level: "medium",
        tone: "neutral",
        ko: "{taskKo} 하는 과정을 한 번만 보여줄래?",
        en: "Could you show me how to do {taskEn} once?",
        requiredTerms: ["show me how to"]
      },
      {
        id: "need-before",
        level: "medium",
        tone: "neutral",
        ko: "가능하면 {detailKo}를 먼저 알아야 해.",
        en: "If possible, I need to know {detailEn} first.",
        requiredTerms: ["need to know", "first"]
      },
      {
        id: "quick-favor",
        level: "easy",
        tone: "casual",
        ko: "작은 부탁인데 {itemKo} 좀 봐줄래?",
        en: "Can I ask a quick favor? Could you look at {itemEn}?",
        requiredTerms: ["quick favor", "look at"]
      },
      {
        id: "not-urgent",
        level: "medium",
        tone: "casual",
        ko: "급한 건 아닌데 {taskKo} 관련해서 도움을 받고 싶어.",
        en: "It's not urgent, but I'd like some help with {taskEn}.",
        requiredTerms: ["not urgent", "help with"]
      }
    ]
  },
  {
    id: "refusal",
    labelKo: "거절/완곡한 말",
    variants: [
      { requestKo: "오늘 만나는 것", requestEn: "meet today", offeringKo: "저녁 약속", offeringEn: "dinner", reasonKo: "일이 밀려서", reasonEn: "I'm behind on work" },
      { requestKo: "지금 통화하는 것", requestEn: "talk on the phone right now", offeringKo: "긴 통화", offeringEn: "a long call", reasonKo: "집중해야 해서", reasonEn: "I need to focus" },
      { requestKo: "이번 주말에 나가는 것", requestEn: "go out this weekend", offeringKo: "주말 모임", offeringEn: "the weekend hangout", reasonKo: "몸이 좀 안 좋아서", reasonEn: "I'm not feeling well" },
      { requestKo: "그 일을 맡는 것", requestEn: "take that on", offeringKo: "추가 작업", offeringEn: "the extra task", reasonKo: "이미 할 일이 많아서", reasonEn: "I already have a lot to do" },
      { requestKo: "바로 결정하는 것", requestEn: "decide right away", offeringKo: "빠른 결정", offeringEn: "a quick decision", reasonKo: "생각할 시간이 필요해서", reasonEn: "I need time to think" },
      { requestKo: "돈을 빌려주는 것", requestEn: "lend money", offeringKo: "돈 관련 부탁", offeringEn: "the money request", reasonKo: "지금 여유가 없어서", reasonEn: "I don't have room for that right now" },
      { requestKo: "밤늦게 만나는 것", requestEn: "meet late at night", offeringKo: "늦은 약속", offeringEn: "the late plan", reasonKo: "내일 일찍 일어나야 해서", reasonEn: "I have to get up early tomorrow" },
      { requestKo: "내가 대신 해주는 것", requestEn: "do it for you", offeringKo: "대신 해주는 것", offeringEn: "doing it for you", reasonKo: "내 책임 범위를 넘어서", reasonEn: "it's outside my responsibility" },
      { requestKo: "새 프로젝트에 들어가는 것", requestEn: "join the new project", offeringKo: "새 프로젝트", offeringEn: "the new project", reasonKo: "지금 일정이 꽉 차서", reasonEn: "my schedule is full right now" },
      { requestKo: "당장 답하는 것", requestEn: "answer right away", offeringKo: "즉답", offeringEn: "an immediate answer", reasonKo: "정보가 부족해서", reasonEn: "I don't have enough information" }
    ],
    patterns: [
      {
        id: "hard-now",
        level: "medium",
        tone: "neutral",
        ko: "지금은 {requestKo} 하기는 좀 어려울 것 같아.",
        en: "I think it would be hard for me to {requestEn} right now.",
        requiredTerms: ["it would be hard", "right now"]
      },
      {
        id: "pass",
        level: "easy",
        tone: "polite",
        ko: "오늘은 {offeringKo}는 정중히 사양할게.",
        en: "I'll politely pass on {offeringEn} today.",
        requiredTerms: ["pass on"]
      },
      {
        id: "because",
        level: "easy",
        tone: "neutral",
        ko: "{reasonKo} 이번에는 어렵겠어.",
        en: "I can't this time because {reasonEn}.",
        requiredTerms: ["I can't", "this time"]
      },
      {
        id: "bandwidth",
        level: "medium",
        tone: "neutral",
        ko: "{offeringKo} 도와주고 싶은데 지금 여유가 별로 없어.",
        en: "I'd like to help with {offeringEn}, but I don't have much bandwidth right now.",
        requiredTerms: ["I'd like to", "bandwidth"]
      },
      {
        id: "next-time",
        level: "easy",
        tone: "casual",
        ko: "다음에 {offeringKo} 다시 이야기하자.",
        en: "Let's talk about {offeringEn} again next time.",
        requiredTerms: ["talk about", "next time"]
      },
      {
        id: "not-best-time",
        level: "medium",
        tone: "neutral",
        ko: "지금은 {requestKo} 하기에 좋은 타이밍이 아닌 것 같아.",
        en: "I don't think this is the best time for me to {requestEn}.",
        requiredTerms: ["best time", "for me to"]
      },
      {
        id: "need-to-pass",
        level: "easy",
        tone: "neutral",
        ko: "미안하지만 이번 {offeringKo}는 넘어가야 할 것 같아.",
        en: "Sorry, but I think I need to skip {offeringEn} this time.",
        requiredTerms: ["need to skip", "this time"]
      },
      {
        id: "cant-commit",
        level: "medium",
        tone: "neutral",
        ko: "{reasonKo} 확답하기가 어려워.",
        en: "It's hard for me to commit because {reasonEn}.",
        requiredTerms: ["hard for me", "commit"]
      },
      {
        id: "rather-not",
        level: "medium",
        tone: "neutral",
        ko: "솔직히 {offeringKo}는 오늘은 안 하는 쪽이 좋겠어.",
        en: "Honestly, I'd rather not do {offeringEn} today.",
        requiredTerms: ["honestly", "rather not"]
      },
      {
        id: "another-way",
        level: "medium",
        tone: "neutral",
        ko: "{requestKo} 대신 다른 방법을 찾아보면 좋겠어.",
        en: "I'd prefer to find another way instead of trying to {requestEn}.",
        requiredTerms: ["prefer to", "another way"]
      }
    ]
  },
  {
    id: "clarification",
    labelKo: "확인/되묻기",
    variants: [
      { pointKo: "그 기준", pointEn: "that standard", partKo: "마지막 설명", partEn: "the last explanation", exampleKo: "오늘 안에 끝내자는 뜻", exampleEn: "that we should finish it today" },
      { pointKo: "이 표현", pointEn: "this expression", partKo: "방금 말한 부분", partEn: "what you just said", exampleKo: "좀 더 기다리자는 뜻", exampleEn: "that we should wait a little longer" },
      { pointKo: "그 규칙", pointEn: "that rule", partKo: "첫 번째 조건", partEn: "the first condition", exampleKo: "내가 먼저 보내야 한다는 뜻", exampleEn: "that I should send it first" },
      { pointKo: "이번 목표", pointEn: "this goal", partKo: "숫자가 나온 부분", partEn: "the part with the numbers", exampleKo: "이번 주에 끝낸다는 뜻", exampleEn: "that we finish it this week" },
      { pointKo: "그 농담", pointEn: "that joke", partKo: "중간에 빠진 말", partEn: "the missing part in the middle", exampleKo: "진심이 아니라는 뜻", exampleEn: "that you didn't mean it seriously" },
      { pointKo: "이 선택지", pointEn: "this option", partKo: "두 번째 예시", partEn: "the second example", exampleKo: "이 방법이 더 낫다는 뜻", exampleEn: "that this way is better" },
      { pointKo: "그 일정", pointEn: "that schedule", partKo: "시간을 말한 부분", partEn: "the part where you mentioned the time", exampleKo: "내일로 미루자는 뜻", exampleEn: "that we should move it to tomorrow" },
      { pointKo: "그 피드백", pointEn: "that feedback", partKo: "고치라는 부분", partEn: "the part you want changed", exampleKo: "톤을 부드럽게 하라는 뜻", exampleEn: "that I should make the tone softer" },
      { pointKo: "이 기능", pointEn: "this feature", partKo: "작동 방식", partEn: "how it works", exampleKo: "자동으로 저장된다는 뜻", exampleEn: "that it gets saved automatically" },
      { pointKo: "그 차이", pointEn: "that difference", partKo: "비교한 부분", partEn: "the comparison part", exampleKo: "둘이 완전히 같지는 않다는 뜻", exampleEn: "that the two are not exactly the same" }
    ],
    patterns: [
      {
        id: "meaning",
        level: "easy",
        tone: "casual",
        ko: "{pointKo}이 무슨 뜻인지 잘 모르겠어.",
        en: "I'm not sure what {pointEn} means.",
        requiredTerms: ["not sure", "means"]
      },
      {
        id: "repeat",
        level: "easy",
        tone: "neutral",
        ko: "{partKo}를 한 번만 다시 말해줄래?",
        en: "Could you say {partEn} one more time?",
        requiredTerms: ["could you", "one more time"]
      },
      {
        id: "do-you-mean",
        level: "medium",
        tone: "neutral",
        ko: "네 말은 {exampleKo}이야?",
        en: "Do you mean {exampleEn}?",
        requiredTerms: ["do you mean"]
      },
      {
        id: "make-sure",
        level: "medium",
        tone: "neutral",
        ko: "내가 {pointKo}을 제대로 이해했는지 확인하고 싶어.",
        en: "I want to make sure I understood {pointEn} correctly.",
        requiredTerms: ["make sure", "understood"]
      },
      {
        id: "example",
        level: "easy",
        tone: "neutral",
        ko: "{pointKo}의 예시를 하나만 들어줄 수 있어?",
        en: "Could you give me an example of {pointEn}?",
        requiredTerms: ["give me an example"]
      },
      {
        id: "which-part",
        level: "easy",
        tone: "casual",
        ko: "{partKo}에서 어느 부분을 말하는 거야?",
        en: "Which part of {partEn} are you talking about?",
        requiredTerms: ["which part", "talking about"]
      },
      {
        id: "not-following",
        level: "medium",
        tone: "casual",
        ko: "{pointKo} 부분에서 내가 잘 못 따라가고 있어.",
        en: "I'm not quite following the part about {pointEn}.",
        requiredTerms: ["not quite following"]
      },
      {
        id: "say-another-way",
        level: "medium",
        tone: "neutral",
        ko: "{exampleKo}이라는 뜻인지 다른 말로 설명해줄래?",
        en: "Could you explain it another way if you mean {exampleEn}?",
        requiredTerms: ["explain it", "another way"]
      },
      {
        id: "check-assumption",
        level: "medium",
        tone: "neutral",
        ko: "내가 보기엔 {exampleKo} 같은데 맞아?",
        en: "It sounds to me like {exampleEn}. Is that right?",
        requiredTerms: ["sounds to me", "is that right"]
      },
      {
        id: "specific",
        level: "medium",
        tone: "neutral",
        ko: "{pointKo}을 조금 더 구체적으로 말해줄 수 있어?",
        en: "Could you be a little more specific about {pointEn}?",
        requiredTerms: ["more specific"]
      }
    ]
  },
  {
    id: "opinion",
    labelKo: "의견/판단",
    variants: [
      { topicKo: "이 방법", topicEn: "this approach", choiceKo: "첫 번째 안", choiceEn: "the first option", concernKo: "시간이 부족한 점", concernEn: "the lack of time" },
      { topicKo: "그 아이디어", topicEn: "that idea", choiceKo: "조금 단순한 버전", choiceEn: "a simpler version", concernKo: "비용이 커지는 점", concernEn: "the cost getting higher" },
      { topicKo: "새 디자인", topicEn: "the new design", choiceKo: "더 깔끔한 배치", choiceEn: "a cleaner layout", concernKo: "글자가 너무 많은 점", concernEn: "there being too much text" },
      { topicKo: "지금 계획", topicEn: "the current plan", choiceKo: "천천히 가는 방식", choiceEn: "a slower approach", concernKo: "준비가 덜 된 점", concernEn: "not being fully prepared" },
      { topicKo: "그 제안", topicEn: "that suggestion", choiceKo: "두 번째 제안", choiceEn: "the second suggestion", concernKo: "사람들이 헷갈릴 수 있는 점", concernEn: "people getting confused" },
      { topicKo: "이 기능", topicEn: "this feature", choiceKo: "자동화하는 방향", choiceEn: "automating it", concernKo: "설정이 복잡한 점", concernEn: "the settings being complicated" },
      { topicKo: "그 설명", topicEn: "that explanation", choiceKo: "예시를 더 넣는 쪽", choiceEn: "adding more examples", concernKo: "너무 갑작스러운 점", concernEn: "it feeling too abrupt" },
      { topicKo: "이번 선택", topicEn: "this choice", choiceKo: "안전한 선택", choiceEn: "the safer choice", concernKo: "나중에 바꾸기 어려운 점", concernEn: "it being hard to change later" },
      { topicKo: "그 문장", topicEn: "that sentence", choiceKo: "더 자연스러운 표현", choiceEn: "the more natural wording", concernKo: "너무 딱딱한 점", concernEn: "it sounding too stiff" },
      { topicKo: "현재 방식", topicEn: "the current way", choiceKo: "작게 실험하는 방식", choiceEn: "testing it on a small scale", concernKo: "효과를 확인하기 어려운 점", concernEn: "it being hard to measure the effect" }
    ],
    patterns: [
      {
        id: "pretty-good",
        level: "easy",
        tone: "casual",
        ko: "내 생각엔 {topicKo}이 꽤 괜찮은 것 같아.",
        en: "I think {topicEn} is pretty good.",
        requiredTerms: ["I think", "pretty good"]
      },
      {
        id: "worried",
        level: "medium",
        tone: "neutral",
        ko: "{topicKo}은 좋은데 {concernKo}이 조금 걱정돼.",
        en: "{topicEn} is good, but I'm a little worried about {concernEn}.",
        requiredTerms: ["worried about"]
      },
      {
        id: "better",
        level: "easy",
        tone: "neutral",
        ko: "나는 {choiceKo} 쪽이 더 나은 것 같아.",
        en: "I think {choiceEn} would be better.",
        requiredTerms: ["would be better"]
      },
      {
        id: "not-convinced",
        level: "medium",
        tone: "neutral",
        ko: "솔직히 {topicKo}에는 아직 확신이 없어.",
        en: "Honestly, I'm still not convinced about {topicEn}.",
        requiredTerms: ["honestly", "not convinced"]
      },
      {
        id: "realistic",
        level: "medium",
        tone: "neutral",
        ko: "지금은 {choiceKo}으로 가는 게 더 현실적일 것 같아.",
        en: "For now, I think going with {choiceEn} would be more realistic.",
        requiredTerms: ["for now", "more realistic"]
      },
      {
        id: "leaning",
        level: "medium",
        tone: "neutral",
        ko: "나는 지금 {choiceKo} 쪽으로 마음이 기울고 있어.",
        en: "I'm leaning toward {choiceEn} right now.",
        requiredTerms: ["leaning toward"]
      },
      {
        id: "depends",
        level: "medium",
        tone: "neutral",
        ko: "{topicKo}은 상황에 따라 달라질 것 같아.",
        en: "I think {topicEn} depends on the situation.",
        requiredTerms: ["depends on", "the situation"]
      },
      {
        id: "main-issue",
        level: "medium",
        tone: "neutral",
        ko: "내가 보는 핵심 문제는 {concernKo}이야.",
        en: "The main issue I see is {concernEn}.",
        requiredTerms: ["main issue", "I see"]
      },
      {
        id: "worth-trying",
        level: "easy",
        tone: "casual",
        ko: "{topicKo}은 한 번 시도해볼 만한 것 같아.",
        en: "I think {topicEn} is worth trying.",
        requiredTerms: ["worth trying"]
      },
      {
        id: "not-priority",
        level: "medium",
        tone: "neutral",
        ko: "{topicKo}은 좋지만 지금 최우선은 아닌 것 같아.",
        en: "{topicEn} is good, but I don't think it's the top priority right now.",
        requiredTerms: ["top priority", "right now"]
      }
    ]
  },
  {
    id: "feelings",
    labelKo: "감정/상태",
    variants: [
      { situationKo: "일이 계속 밀리는 것", situationEn: "work keeping piling up", thingKo: "내일 발표", thingEn: "tomorrow's presentation" },
      { situationKo: "잠을 잘 못 잔 것", situationEn: "not sleeping well", thingKo: "새로운 시작", thingEn: "the new start" },
      { situationKo: "연락이 안 되는 것", situationEn: "not being able to reach them", thingKo: "결과 발표", thingEn: "the announcement of the results" },
      { situationKo: "계획이 자꾸 바뀌는 것", situationEn: "the plan changing again and again", thingKo: "이번 여행", thingEn: "this trip" },
      { situationKo: "대답을 기다리는 것", situationEn: "waiting for an answer", thingKo: "첫 출근", thingEn: "my first day at work" },
      { situationKo: "할 일이 너무 많은 것", situationEn: "having too much to do", thingKo: "오랜만의 만남", thingEn: "meeting after a long time" },
      { situationKo: "같은 실수를 반복하는 것", situationEn: "making the same mistake again", thingKo: "시험이 끝난 것", thingEn: "the exam being over" },
      { situationKo: "혼자 결정해야 하는 것", situationEn: "having to decide by myself", thingKo: "새로운 기회", thingEn: "the new opportunity" },
      { situationKo: "시간이 부족한 것", situationEn: "not having enough time", thingKo: "좋은 소식", thingEn: "the good news" },
      { situationKo: "오해가 생긴 것", situationEn: "the misunderstanding", thingKo: "문제가 해결된 것", thingEn: "the problem being solved" }
    ],
    patterns: [
      {
        id: "worn-out",
        level: "medium",
        tone: "casual",
        ko: "요즘 {situationKo} 때문에 조금 지쳐.",
        en: "I've been a bit worn out because of {situationEn} lately.",
        requiredTerms: ["worn out", "lately"]
      },
      {
        id: "nervous",
        level: "easy",
        tone: "casual",
        ko: "{thingKo} 생각하면 좀 긴장돼.",
        en: "I feel a bit nervous when I think about {thingEn}.",
        requiredTerms: ["nervous", "think about"]
      },
      {
        id: "relieved",
        level: "easy",
        tone: "casual",
        ko: "{thingKo}이 끝나서 마음이 놓여.",
        en: "I'm relieved that {thingEn} is over.",
        requiredTerms: ["relieved", "is over"]
      },
      {
        id: "frustrated",
        level: "medium",
        tone: "casual",
        ko: "{situationKo} 때문에 살짝 답답해.",
        en: "I'm a little frustrated because of {situationEn}.",
        requiredTerms: ["frustrated", "because of"]
      },
      {
        id: "looking-forward",
        level: "easy",
        tone: "casual",
        ko: "{thingKo} 기대돼.",
        en: "I'm looking forward to {thingEn}.",
        requiredTerms: ["looking forward to"]
      },
      {
        id: "overwhelmed",
        level: "medium",
        tone: "casual",
        ko: "{situationKo} 때문에 요즘 좀 벅차.",
        en: "I've been feeling overwhelmed because of {situationEn}.",
        requiredTerms: ["feeling overwhelmed", "because of"]
      },
      {
        id: "cant-focus",
        level: "easy",
        tone: "casual",
        ko: "{situationKo} 때문에 집중이 잘 안 돼.",
        en: "It's hard to focus because of {situationEn}.",
        requiredTerms: ["hard to focus"]
      },
      {
        id: "mixed-feelings",
        level: "medium",
        tone: "casual",
        ko: "{thingKo}에 대해 기분이 좀 복잡해.",
        en: "I have mixed feelings about {thingEn}.",
        requiredTerms: ["mixed feelings"]
      },
      {
        id: "proud",
        level: "easy",
        tone: "casual",
        ko: "{thingKo}을 생각하면 좀 뿌듯해.",
        en: "I feel kind of proud when I think about {thingEn}.",
        requiredTerms: ["kind of proud"]
      },
      {
        id: "need-break",
        level: "easy",
        tone: "casual",
        ko: "{situationKo} 때문에 잠깐 쉬고 싶어.",
        en: "I want to take a short break because of {situationEn}.",
        requiredTerms: ["take a short break"]
      }
    ]
  },
  {
    id: "problem-help",
    labelKo: "문제 설명/도움",
    variants: [
      { itemKo: "앱", itemEn: "the app", actionKo: "로그인", actionEn: "log in", problemKo: "화면이 멈추는 문제", problemEn: "the screen freezing" },
      { itemKo: "마이크", itemEn: "the microphone", actionKo: "음성 녹음", actionEn: "record audio", problemKo: "소리가 안 들어가는 문제", problemEn: "the sound not going through" },
      { itemKo: "결제 페이지", itemEn: "the payment page", actionKo: "결제", actionEn: "pay", problemKo: "결제가 실패하는 문제", problemEn: "the payment failing" },
      { itemKo: "초대 링크", itemEn: "the invite link", actionKo: "방에 들어가기", actionEn: "join the room", problemKo: "링크가 만료되는 문제", problemEn: "the link expiring" },
      { itemKo: "파일 업로드", itemEn: "file upload", actionKo: "파일 올리기", actionEn: "upload the file", problemKo: "업로드가 멈추는 문제", problemEn: "the upload getting stuck" },
      { itemKo: "검색 기능", itemEn: "the search feature", actionKo: "예전 대화 찾기", actionEn: "find the old conversation", problemKo: "검색 결과가 안 나오는 문제", problemEn: "no search results showing up" },
      { itemKo: "영상", itemEn: "the video", actionKo: "구간 반복", actionEn: "loop the section", problemKo: "영상이 끊기는 문제", problemEn: "the video stuttering" },
      { itemKo: "문서", itemEn: "the document", actionKo: "PDF 열기", actionEn: "open the PDF", problemKo: "문서가 깨지는 문제", problemEn: "the document displaying incorrectly" },
      { itemKo: "알림", itemEn: "notifications", actionKo: "알림 켜기", actionEn: "turn on notifications", problemKo: "알림이 안 오는 문제", problemEn: "notifications not coming through" },
      { itemKo: "설정 화면", itemEn: "the settings screen", actionKo: "언어 바꾸기", actionEn: "change the language", problemKo: "설정이 저장되지 않는 문제", problemEn: "the settings not saving" }
    ],
    patterns: [
      {
        id: "not-working",
        level: "easy",
        tone: "neutral",
        ko: "{itemKo}이 제대로 작동하지 않아.",
        en: "{itemEn} isn't working properly.",
        requiredTerms: ["isn't working", "properly"]
      },
      {
        id: "stuck",
        level: "medium",
        tone: "casual",
        ko: "{actionKo} 하다가 막혔어.",
        en: "I'm stuck while trying to {actionEn}.",
        requiredTerms: ["stuck", "trying to"]
      },
      {
        id: "dont-know-why",
        level: "medium",
        tone: "neutral",
        ko: "{problemKo}이 왜 생기는지 모르겠어.",
        en: "I don't know why {problemEn} is happening.",
        requiredTerms: ["don't know why", "happening"]
      },
      {
        id: "look-at",
        level: "easy",
        tone: "casual",
        ko: "혹시 {itemKo} 문제 좀 봐줄 수 있어?",
        en: "Could you take a look at the problem with {itemEn}?",
        requiredTerms: ["take a look"]
      },
      {
        id: "missed",
        level: "medium",
        tone: "casual",
        ko: "내가 {actionKo} 할 때 뭘 놓친 것 같아.",
        en: "I think I missed something while trying to {actionEn}.",
        requiredTerms: ["missed something", "trying to"]
      },
      {
        id: "keeps-happening",
        level: "medium",
        tone: "neutral",
        ko: "{problemKo}이 계속 반복돼.",
        en: "{problemEn} keeps happening.",
        requiredTerms: ["keeps happening"]
      },
      {
        id: "worked-before",
        level: "medium",
        tone: "neutral",
        ko: "{itemKo}은 전에는 잘 됐는데 지금은 안 돼.",
        en: "{itemEn} used to work fine, but it doesn't now.",
        requiredTerms: ["used to work", "doesn't now"]
      },
      {
        id: "error-after",
        level: "medium",
        tone: "neutral",
        ko: "{actionKo} 하자마자 문제가 생겨.",
        en: "The problem happens as soon as I try to {actionEn}.",
        requiredTerms: ["as soon as", "try to"]
      },
      {
        id: "need-workaround",
        level: "hard",
        tone: "neutral",
        ko: "{problemKo}을 임시로 피할 방법이 필요해.",
        en: "I need a temporary workaround for {problemEn}.",
        requiredTerms: ["temporary workaround"]
      },
      {
        id: "can-reproduce",
        level: "hard",
        tone: "neutral",
        ko: "{problemKo}을 다시 재현할 수 있어.",
        en: "I can reproduce {problemEn} again.",
        requiredTerms: ["reproduce", "again"]
      }
    ]
  },
  {
    id: "thanks-apology",
    labelKo: "감사/사과",
    variants: [
      { helpKo: "자료 정리", helpEn: "the notes", mistakeKo: "파일을 잘못 보낸 것", mistakeEn: "sending the wrong file", situationKo: "그 일", situationEn: "that issue" },
      { helpKo: "길 알려준 것", helpEn: "the directions", mistakeKo: "시간을 헷갈린 것", mistakeEn: "mixing up the time", situationKo: "오늘 약속", situationEn: "today's plan" },
      { helpKo: "문제 찾아준 것", helpEn: "finding the problem", mistakeKo: "답장을 깜빡한 것", mistakeEn: "forgetting to reply", situationKo: "네 메시지", situationEn: "your message" },
      { helpKo: "설명해준 것", helpEn: "the explanation", mistakeKo: "이름을 잘못 쓴 것", mistakeEn: "writing the wrong name", situationKo: "그 질문", situationEn: "that question" },
      { helpKo: "기다려준 것", helpEn: "waiting for me", mistakeKo: "약속을 늦게 확인한 것", mistakeEn: "checking the plan too late", situationKo: "확인 메시지", situationEn: "the confirmation message" },
      { helpKo: "대신 처리해준 것", helpEn: "handling it for me", mistakeKo: "중요한 부분을 놓친 것", mistakeEn: "missing the important part", situationKo: "회의 내용", situationEn: "the meeting details" },
      { helpKo: "피드백 준 것", helpEn: "the feedback", mistakeKo: "너무 급하게 보낸 것", mistakeEn: "sending it too quickly", situationKo: "초안", situationEn: "the draft" },
      { helpKo: "자리 맡아준 것", helpEn: "saving me a seat", mistakeKo: "장소를 잘못 본 것", mistakeEn: "checking the wrong place", situationKo: "모임 장소", situationEn: "the meeting place" },
      { helpKo: "내 말 들어준 것", helpEn: "listening to me", mistakeKo: "말을 세게 한 것", mistakeEn: "sounding too harsh", situationKo: "아까 대화", situationEn: "the conversation earlier" },
      { helpKo: "같이 확인해준 것", helpEn: "checking it with me", mistakeKo: "계산을 잘못한 것", mistakeEn: "making a mistake in the calculation", situationKo: "결제 내역", situationEn: "the payment history" }
    ],
    patterns: [
      {
        id: "thanks",
        level: "easy",
        tone: "casual",
        ko: "{helpKo} 도와줘서 정말 고마워.",
        en: "Thanks so much for helping me with {helpEn}.",
        requiredTerms: ["thanks so much", "helping me"]
      },
      {
        id: "late-reply",
        level: "easy",
        tone: "neutral",
        ko: "{situationKo}에 늦게 답해서 미안해.",
        en: "Sorry for replying late about {situationEn}.",
        requiredTerms: ["sorry for", "replying late"]
      },
      {
        id: "my-mistake",
        level: "easy",
        tone: "neutral",
        ko: "{mistakeKo}은 내 실수였어.",
        en: "{mistakeEn} was my mistake.",
        requiredTerms: ["my mistake"]
      },
      {
        id: "helped",
        level: "medium",
        tone: "casual",
        ko: "네가 {helpKo} 챙겨줘서 정말 도움 됐어.",
        en: "It really helped that you took care of {helpEn}.",
        requiredTerms: ["really helped", "took care of"]
      },
      {
        id: "waiting",
        level: "easy",
        tone: "neutral",
        ko: "{situationKo} 때문에 기다리게 해서 미안해.",
        en: "Sorry for keeping you waiting because of {situationEn}.",
        requiredTerms: ["keeping you waiting"]
      },
      {
        id: "appreciate",
        level: "medium",
        tone: "neutral",
        ko: "{helpKo} 챙겨준 거 정말 고마워.",
        en: "I really appreciate you taking care of {helpEn}.",
        requiredTerms: ["appreciate", "taking care of"]
      },
      {
        id: "owe-you",
        level: "easy",
        tone: "casual",
        ko: "{helpKo} 도와준 거 내가 신세 졌어.",
        en: "I owe you one for helping me with {helpEn}.",
        requiredTerms: ["owe you one"]
      },
      {
        id: "should-have",
        level: "medium",
        tone: "neutral",
        ko: "{mistakeKo}은 내가 더 조심했어야 했어.",
        en: "I should have been more careful about {mistakeEn}.",
        requiredTerms: ["should have", "more careful"]
      },
      {
        id: "make-up",
        level: "medium",
        tone: "neutral",
        ko: "{situationKo}은 내가 나중에 보상할게.",
        en: "I'll make it up to you for {situationEn}.",
        requiredTerms: ["make it up to you"]
      },
      {
        id: "thanks-patience",
        level: "easy",
        tone: "neutral",
        ko: "{situationKo} 기다려줘서 고마워.",
        en: "Thanks for being patient with {situationEn}.",
        requiredTerms: ["being patient"]
      }
    ]
  },
  {
    id: "suggestion",
    labelKo: "제안/권유",
    variants: [
      { activityKo: "짧게 산책", activityEn: "a short walk", placeKo: "역 앞", placeEn: "the station", optionKo: "조용한 카페", optionEn: "a quiet cafe" },
      { activityKo: "한 판 더", activityEn: "one more round", placeKo: "디스코드 방", placeEn: "the Discord room", optionKo: "다른 맵", optionEn: "a different map" },
      { activityKo: "먼저 초안 작성", activityEn: "drafting it first", placeKo: "작업실", placeEn: "the workspace", optionKo: "간단한 버전", optionEn: "a simple version" },
      { activityKo: "같이 점심", activityEn: "having lunch together", placeKo: "회사 앞", placeEn: "the office entrance", optionKo: "근처 식당", optionEn: "a nearby restaurant" },
      { activityKo: "화면 공유", activityEn: "sharing the screen", placeKo: "온라인 회의방", placeEn: "the online meeting room", optionKo: "짧은 콜", optionEn: "a quick call" },
      { activityKo: "이번 주에 복습", activityEn: "reviewing it this week", placeKo: "스터디룸", placeEn: "the study room", optionKo: "요약 노트", optionEn: "summary notes" },
      { activityKo: "새 방식 테스트", activityEn: "testing the new method", placeKo: "테스트 서버", placeEn: "the test server", optionKo: "작은 실험", optionEn: "a small test" },
      { activityKo: "영화 보기", activityEn: "watching a movie", placeKo: "극장 앞", placeEn: "the theater", optionKo: "늦은 시간대", optionEn: "a later time" },
      { activityKo: "문제 같이 보기", activityEn: "looking at the problem together", placeKo: "채팅방", placeEn: "the chat room", optionKo: "체크리스트", optionEn: "a checklist" },
      { activityKo: "가볍게 연습", activityEn: "practicing lightly", placeKo: "연습방", placeEn: "the practice room", optionKo: "쉬운 단계", optionEn: "an easier level" }
    ],
    patterns: [
      {
        id: "how-about",
        level: "easy",
        tone: "casual",
        ko: "우리 {activityKo} 한번 해보는 건 어때?",
        en: "How about we try {activityEn}?",
        requiredTerms: ["how about", "try"]
      },
      {
        id: "meet-at",
        level: "easy",
        tone: "neutral",
        ko: "가능하면 {placeKo}에서 만나는 게 좋을 것 같아.",
        en: "If possible, I think meeting at {placeEn} would be good.",
        requiredTerms: ["if possible", "would be good"]
      },
      {
        id: "option",
        level: "medium",
        tone: "neutral",
        ko: "{optionKo}도 괜찮은 선택일 것 같아.",
        en: "{optionEn} might be a good option too.",
        requiredTerms: ["might be", "good option"]
      },
      {
        id: "start-with",
        level: "easy",
        tone: "casual",
        ko: "일단 {activityKo}부터 시작해보자.",
        en: "Let's start with {activityEn} first.",
        requiredTerms: ["start with", "first"]
      },
      {
        id: "do-together",
        level: "easy",
        tone: "casual",
        ko: "너도 괜찮으면 {activityKo} 같이 할래?",
        en: "If you're okay with it, do you want to do {activityEn} together?",
        requiredTerms: ["if you're okay", "together"]
      },
      {
        id: "try-instead",
        level: "medium",
        tone: "casual",
        ko: "그 대신 {optionKo}을 한번 해보면 어때?",
        en: "What if we try {optionEn} instead?",
        requiredTerms: ["what if", "instead"]
      },
      {
        id: "keep-simple",
        level: "medium",
        tone: "neutral",
        ko: "이번에는 {activityKo} 정도로 간단히 가자.",
        en: "Let's keep it simple and just do {activityEn} this time.",
        requiredTerms: ["keep it simple", "this time"]
      },
      {
        id: "meet-around",
        level: "easy",
        tone: "casual",
        ko: "{placeKo} 근처에서 보는 건 어때?",
        en: "How about meeting somewhere near {placeEn}?",
        requiredTerms: ["how about", "somewhere near"]
      },
      {
        id: "if-not",
        level: "medium",
        tone: "neutral",
        ko: "{activityKo}가 별로면 {optionKo}도 괜찮아.",
        en: "If {activityEn} doesn't sound good, {optionEn} is fine too.",
        requiredTerms: ["doesn't sound good", "fine too"]
      },
      {
        id: "worth-a-shot",
        level: "medium",
        tone: "casual",
        ko: "{activityKo}은 한 번 해볼 만하지 않아?",
        en: "Don't you think {activityEn} is worth a shot?",
        requiredTerms: ["worth a shot"]
      }
    ]
  },
  {
    id: "work-project",
    labelKo: "일/프로젝트",
    variants: [
      { taskKo: "초안", taskEn: "the draft", projectKo: "홈 화면 개편", projectEn: "the home screen redesign", blockerKo: "자료가 부족한 것", blockerEn: "the lack of materials" },
      { taskKo: "버그 수정", taskEn: "the bug fix", projectKo: "튜토리얼 개선", projectEn: "the tutorial improvements", blockerKo: "재현이 안 되는 것", blockerEn: "not being able to reproduce it" },
      { taskKo: "디자인 확인", taskEn: "the design review", projectKo: "새 카드 화면", projectEn: "the new card screen", blockerKo: "결정이 늦어지는 것", blockerEn: "the decision being delayed" },
      { taskKo: "문서 정리", taskEn: "organizing the document", projectKo: "릴리즈 준비", projectEn: "the release preparation", blockerKo: "요구사항이 바뀐 것", blockerEn: "the requirements changing" },
      { taskKo: "테스트 추가", taskEn: "adding the tests", projectKo: "영작 기능", projectEn: "the writing practice feature", blockerKo: "예시 데이터가 부족한 것", blockerEn: "not having enough sample data" },
      { taskKo: "회의록 작성", taskEn: "writing the meeting notes", projectKo: "팀 일정 조정", projectEn: "the team schedule adjustment", blockerKo: "시간이 겹치는 것", blockerEn: "the schedules overlapping" },
      { taskKo: "피드백 반영", taskEn: "applying the feedback", projectKo: "문장 은행", projectEn: "the sentence bank", blockerKo: "범위가 너무 넓은 것", blockerEn: "the scope being too broad" },
      { taskKo: "배포 확인", taskEn: "checking the deployment", projectKo: "데스크톱 앱", projectEn: "the desktop app", blockerKo: "빌드가 오래 걸리는 것", blockerEn: "the build taking too long" },
      { taskKo: "데이터 정리", taskEn: "cleaning up the data", projectKo: "복습 시스템", projectEn: "the review system", blockerKo: "기존 데이터가 섞인 것", blockerEn: "old data being mixed in" },
      { taskKo: "우선순위 목록", taskEn: "the priority list", projectKo: "다음 스프린트", projectEn: "the next sprint", blockerKo: "우선순위가 불분명한 것", blockerEn: "the priorities being unclear" }
    ],
    patterns: [
      {
        id: "almost-done",
        level: "easy",
        tone: "neutral",
        ko: "{taskKo}은 거의 끝났어.",
        en: "{taskEn} is almost done.",
        requiredTerms: ["almost done"]
      },
      {
        id: "prioritize",
        level: "medium",
        tone: "neutral",
        ko: "오늘은 {projectKo}를 우선순위로 두는 게 좋겠어.",
        en: "I think we should prioritize {projectEn} today.",
        requiredTerms: ["prioritize", "today"]
      },
      {
        id: "blocked",
        level: "medium",
        tone: "neutral",
        ko: "{blockerKo} 때문에 지금 조금 막혀 있어.",
        en: "I'm a bit blocked right now because of {blockerEn}.",
        requiredTerms: ["blocked", "because of"]
      },
      {
        id: "revise",
        level: "medium",
        tone: "neutral",
        ko: "{taskKo}은 피드백 받으면 바로 수정할게.",
        en: "I'll revise {taskEn} as soon as I get feedback.",
        requiredTerms: ["revise", "as soon as"]
      },
      {
        id: "update",
        level: "easy",
        tone: "neutral",
        ko: "{projectKo} 진행 상황을 짧게 공유할게.",
        en: "I'll give you a quick update on {projectEn}.",
        requiredTerms: ["quick update"]
      },
      {
        id: "next-step",
        level: "medium",
        tone: "neutral",
        ko: "{projectKo}의 다음 단계는 {taskKo}이야.",
        en: "The next step for {projectEn} is {taskEn}.",
        requiredTerms: ["next step"]
      },
      {
        id: "need-review",
        level: "easy",
        tone: "neutral",
        ko: "{taskKo}은 검토가 한 번 필요해.",
        en: "{taskEn} needs one round of review.",
        requiredTerms: ["needs", "review"]
      },
      {
        id: "scope-creep",
        level: "hard",
        tone: "neutral",
        ko: "{projectKo}는 범위가 조금씩 커지고 있어.",
        en: "The scope of {projectEn} is slowly getting bigger.",
        requiredTerms: ["scope", "getting bigger"]
      },
      {
        id: "ship-small",
        level: "medium",
        tone: "neutral",
        ko: "{projectKo}는 작게 먼저 내보내는 게 좋겠어.",
        en: "I think we should ship a smaller version of {projectEn} first.",
        requiredTerms: ["ship", "smaller version"]
      },
      {
        id: "blocked-until",
        level: "hard",
        tone: "neutral",
        ko: "{blockerKo}이 해결될 때까지 {taskKo}은 멈춰 있어.",
        en: "{taskEn} is blocked until we solve {blockerEn}.",
        requiredTerms: ["blocked until", "solve"]
      }
    ]
  },
  {
    id: "study-learning",
    labelKo: "공부/학습",
    variants: [
      { topicKo: "현재완료", topicEn: "the present perfect", skillKo: "듣기", skillEn: "listening", materialKo: "오늘 배운 표현", materialEn: "the expressions I learned today" },
      { topicKo: "관계대명사", topicEn: "relative pronouns", skillKo: "발음", skillEn: "pronunciation", materialKo: "어제 만든 카드", materialEn: "the cards I made yesterday" },
      { topicKo: "이 문장 구조", topicEn: "this sentence structure", skillKo: "영작", skillEn: "writing in English", materialKo: "틀린 문장", materialEn: "the sentence I got wrong" },
      { topicKo: "전치사 차이", topicEn: "the difference between prepositions", skillKo: "쉐도잉", skillEn: "shadowing", materialKo: "영상 구간", materialEn: "the video section" },
      { topicKo: "이 단어 뉘앙스", topicEn: "the nuance of this word", skillKo: "회화", skillEn: "speaking", materialKo: "예문 목록", materialEn: "the example list" },
      { topicKo: "조건문", topicEn: "conditionals", skillKo: "문장 채굴", skillEn: "sentence mining", materialKo: "오늘 읽은 글", materialEn: "the article I read today" },
      { topicKo: "약발음", topicEn: "reduced pronunciation", skillKo: "받아쓰기", skillEn: "dictation", materialKo: "듣기 카드", materialEn: "the listening card" },
      { topicKo: "어순", topicEn: "word order", skillKo: "말하기", skillEn: "speaking", materialKo: "복습 목록", materialEn: "the review list" },
      { topicKo: "시제", topicEn: "tenses", skillKo: "독해", skillEn: "reading", materialKo: "PDF 문장", materialEn: "the PDF sentence" },
      { topicKo: "관용 표현", topicEn: "idioms", skillKo: "반복 복습", skillEn: "repeated review", materialKo: "어려운 카드", materialEn: "the difficult cards" }
    ],
    patterns: [
      {
        id: "dont-understand",
        level: "easy",
        tone: "casual",
        ko: "{topicKo}이 아직 잘 이해가 안 돼.",
        en: "I still don't really understand {topicEn}.",
        requiredTerms: ["don't really understand"]
      },
      {
        id: "need-practice",
        level: "easy",
        tone: "neutral",
        ko: "{skillKo}은 연습이 더 필요해.",
        en: "I need more practice with {skillEn}.",
        requiredTerms: ["need more practice"]
      },
      {
        id: "review-later",
        level: "easy",
        tone: "casual",
        ko: "{materialKo}은 나중에 다시 복습해야겠어.",
        en: "I should review {materialEn} again later.",
        requiredTerms: ["review", "again later"]
      },
      {
        id: "explain-example",
        level: "medium",
        tone: "neutral",
        ko: "{topicKo}을 예문으로 설명해줄 수 있어?",
        en: "Could you explain {topicEn} with an example?",
        requiredTerms: ["explain", "with an example"]
      },
      {
        id: "getting-used",
        level: "medium",
        tone: "casual",
        ko: "{skillKo}이 조금씩 익숙해지고 있어.",
        en: "I'm slowly getting used to {skillEn}.",
        requiredTerms: ["getting used to"]
      },
      {
        id: "keep-mixing-up",
        level: "medium",
        tone: "casual",
        ko: "{topicKo}이랑 다른 개념을 자꾸 헷갈려.",
        en: "I keep mixing up {topicEn} with another concept.",
        requiredTerms: ["keep mixing up"]
      },
      {
        id: "clicked",
        level: "medium",
        tone: "casual",
        ko: "{materialKo}을 다시 보니까 이제 좀 이해됐어.",
        en: "After reviewing {materialEn}, it finally started to click.",
        requiredTerms: ["started to click"]
      },
      {
        id: "need-context",
        level: "medium",
        tone: "neutral",
        ko: "{topicKo}은 문맥이 있어야 이해가 잘 돼.",
        en: "{topicEn} is easier to understand with context.",
        requiredTerms: ["easier to understand", "with context"]
      },
      {
        id: "practice-out-loud",
        level: "easy",
        tone: "casual",
        ko: "{materialKo}은 소리 내서 연습해봐야겠어.",
        en: "I should practice {materialEn} out loud.",
        requiredTerms: ["practice", "out loud"]
      },
      {
        id: "weak-area",
        level: "medium",
        tone: "neutral",
        ko: "내 약점은 아직 {skillKo} 쪽이야.",
        en: "My weak area is still {skillEn}.",
        requiredTerms: ["weak area"]
      }
    ]
  },
  {
    id: "online-game",
    labelKo: "온라인/게임",
    variants: [
      { gameKo: "디스코드", gameEn: "Discord", actionKo: "큐", actionEn: "the queue", problemKo: "마이크 문제", problemEn: "a mic issue", roleKo: "힐러", roleEn: "healer" },
      { gameKo: "방", gameEn: "the room", actionKo: "매치", actionEn: "the match", problemKo: "인터넷 문제", problemEn: "an internet issue", roleKo: "탱커", roleEn: "tank" },
      { gameKo: "파티", gameEn: "the party", actionKo: "보스전", actionEn: "the boss fight", problemKo: "소리가 끊기는 문제", problemEn: "the audio cutting out", roleKo: "딜러", roleEn: "damage dealer" },
      { gameKo: "서버", gameEn: "the server", actionKo: "레이드", actionEn: "the raid", problemKo: "렉", problemEn: "lag", roleKo: "서포터", roleEn: "support" },
      { gameKo: "음성 채널", gameEn: "the voice channel", actionKo: "연습판", actionEn: "the practice round", problemKo: "헤드셋 문제", problemEn: "a headset issue", roleKo: "리더", roleEn: "leader" },
      { gameKo: "로비", gameEn: "the lobby", actionKo: "첫 판", actionEn: "the first round", problemKo: "업데이트", problemEn: "an update", roleKo: "정찰", roleEn: "scout" },
      { gameKo: "길드 채팅", gameEn: "guild chat", actionKo: "던전", actionEn: "the dungeon", problemKo: "키보드 문제", problemEn: "a keyboard issue", roleKo: "메인 캐릭터", roleEn: "my main character" },
      { gameKo: "스쿼드", gameEn: "the squad", actionKo: "랭크 게임", actionEn: "ranked", problemKo: "프레임 드랍", problemEn: "frame drops", roleKo: "백업", roleEn: "backup" },
      { gameKo: "채팅방", gameEn: "the chat room", actionKo: "커스텀 게임", actionEn: "the custom game", problemKo: "알림 문제", problemEn: "a notification issue", roleKo: "오더", roleEn: "shot caller" },
      { gameKo: "게임", gameEn: "the game", actionKo: "다음 판", actionEn: "the next round", problemKo: "컨트롤러 문제", problemEn: "a controller issue", roleKo: "원거리 캐릭터", roleEn: "ranged character" }
    ],
    patterns: [
      {
        id: "join-soon",
        level: "easy",
        tone: "casual",
        ko: "나 곧 {gameKo} 들어갈게.",
        en: "I'll join {gameEn} soon.",
        requiredTerms: ["join", "soon"]
      },
      {
        id: "start-without-me",
        level: "easy",
        tone: "casual",
        ko: "나 없으면 먼저 {actionKo} 시작하고 있어.",
        en: "You can start {actionEn} without me if I'm not there.",
        requiredTerms: ["start", "without me"]
      },
      {
        id: "cant-talk",
        level: "medium",
        tone: "casual",
        ko: "{problemKo} 때문에 지금 말이 잘 안 돼.",
        en: "I can't talk properly right now because of {problemEn}.",
        requiredTerms: ["can't talk", "properly"]
      },
      {
        id: "role",
        level: "easy",
        tone: "casual",
        ko: "이번 판은 내가 {roleKo} 할게.",
        en: "I'll play {roleEn} this round.",
        requiredTerms: ["this round"]
      },
      {
        id: "hold-on",
        level: "easy",
        tone: "casual",
        ko: "잠깐만, {actionKo} 전에 준비 좀 할게.",
        en: "Hold on, let me get ready before {actionEn}.",
        requiredTerms: ["hold on", "get ready"]
      },
      {
        id: "invite",
        level: "easy",
        tone: "casual",
        ko: "{gameKo} 초대 다시 보내줄래?",
        en: "Could you send me the invite to {gameEn} again?",
        requiredTerms: ["send me", "invite"]
      },
      {
        id: "lagging",
        level: "easy",
        tone: "casual",
        ko: "{problemKo} 때문에 반응이 좀 늦어.",
        en: "I'm responding a bit slowly because of {problemEn}.",
        requiredTerms: ["responding", "slowly"]
      },
      {
        id: "cover-me",
        level: "medium",
        tone: "casual",
        ko: "내가 {roleKo} 하는 동안 잠깐 커버해줘.",
        en: "Cover me for a second while I play {roleEn}.",
        requiredTerms: ["cover me", "for a second"]
      },
      {
        id: "one-more",
        level: "easy",
        tone: "casual",
        ko: "{actionKo} 한 번만 더 하고 쉴게.",
        en: "I'll do {actionEn} one more time and then take a break.",
        requiredTerms: ["one more time", "take a break"]
      },
      {
        id: "switch-role",
        level: "easy",
        tone: "casual",
        ko: "다음 판에는 {roleKo} 말고 다른 걸 해볼게.",
        en: "I'll try something other than {roleEn} next round.",
        requiredTerms: ["other than", "next round"]
      }
    ]
  },
  {
    id: "travel",
    labelKo: "여행/길찾기",
    variants: [
      { placeKo: "역", placeEn: "the station", transportKo: "지하철", transportEn: "the subway", issueKo: "길이 막혀서", issueEn: "traffic" },
      { placeKo: "호텔", placeEn: "the hotel", transportKo: "택시", transportEn: "a taxi", issueKo: "버스를 놓쳐서", issueEn: "missing the bus" },
      { placeKo: "공항", placeEn: "the airport", transportKo: "공항버스", transportEn: "the airport bus", issueKo: "짐이 늦게 나와서", issueEn: "my luggage coming out late" },
      { placeKo: "식당", placeEn: "the restaurant", transportKo: "걸어가는 것", transportEn: "walking", issueKo: "길을 잘못 들어서", issueEn: "taking the wrong road" },
      { placeKo: "박물관", placeEn: "the museum", transportKo: "버스", transportEn: "the bus", issueKo: "표를 사야 해서", issueEn: "having to buy tickets" },
      { placeKo: "회의장", placeEn: "the conference hall", transportKo: "기차", transportEn: "the train", issueKo: "기차가 지연돼서", issueEn: "the train delay" },
      { placeKo: "카페", placeEn: "the cafe", transportKo: "자전거", transportEn: "a bike", issueKo: "비가 와서", issueEn: "the rain" },
      { placeKo: "버스 정류장", placeEn: "the bus stop", transportKo: "환승", transportEn: "transferring", issueKo: "정류장을 지나쳐서", issueEn: "missing my stop" },
      { placeKo: "공원", placeEn: "the park", transportKo: "렌터카", transportEn: "a rental car", issueKo: "주차 자리를 못 찾아서", issueEn: "not finding a parking spot" },
      { placeKo: "친구 집", placeEn: "my friend's place", transportKo: "픽업", transportEn: "getting picked up", issueKo: "주소를 다시 확인해야 해서", issueEn: "having to check the address again" }
    ],
    patterns: [
      {
        id: "how-to-get",
        level: "easy",
        tone: "polite",
        ko: "{placeKo}까지 어떻게 가는지 알려줄래?",
        en: "Could you tell me how to get to {placeEn}?",
        requiredTerms: ["how to get to"]
      },
      {
        id: "faster",
        level: "easy",
        tone: "neutral",
        ko: "우리 {transportKo} 타는 게 더 빠를 것 같아.",
        en: "I think taking {transportEn} would be faster.",
        requiredTerms: ["taking", "faster"]
      },
      {
        id: "might-late",
        level: "easy",
        tone: "neutral",
        ko: "{issueKo} 조금 늦을 수도 있어.",
        en: "I might be a little late because of {issueEn}.",
        requiredTerms: ["might be", "a little late"]
      },
      {
        id: "meet-front",
        level: "easy",
        tone: "casual",
        ko: "{placeKo} 앞에서 만나자.",
        en: "Let's meet in front of {placeEn}.",
        requiredTerms: ["meet in front of"]
      },
      {
        id: "near",
        level: "easy",
        tone: "casual",
        ko: "{placeKo} 근처에 도착하면 연락할게.",
        en: "I'll message you when I get near {placeEn}.",
        requiredTerms: ["message you", "get near"]
      },
      {
        id: "wrong-way",
        level: "easy",
        tone: "casual",
        ko: "나 {placeKo} 가는 길을 잘못 든 것 같아.",
        en: "I think I took the wrong way to {placeEn}.",
        requiredTerms: ["wrong way"]
      },
      {
        id: "transfer",
        level: "medium",
        tone: "neutral",
        ko: "{transportKo}로 갈아타야 하는지 모르겠어.",
        en: "I'm not sure if I need to switch to {transportEn}.",
        requiredTerms: ["not sure", "switch to"]
      },
      {
        id: "wait-inside",
        level: "easy",
        tone: "casual",
        ko: "{placeKo} 안에서 기다리고 있을게.",
        en: "I'll be waiting inside {placeEn}.",
        requiredTerms: ["waiting inside"]
      },
      {
        id: "running-behind",
        level: "medium",
        tone: "casual",
        ko: "{issueKo} 예정보다 늦어지고 있어.",
        en: "I'm running behind schedule because of {issueEn}.",
        requiredTerms: ["running behind schedule"]
      },
      {
        id: "which-exit",
        level: "easy",
        tone: "polite",
        ko: "{placeKo}는 어느 출구로 나가야 해?",
        en: "Which exit should I take for {placeEn}?",
        requiredTerms: ["which exit", "should I take"]
      }
    ]
  },
  {
    id: "shopping",
    labelKo: "쇼핑/결제",
    variants: [
      { itemKo: "이 셔츠", itemEn: "this shirt", sizeKo: "M", sizeEn: "a medium", problemKo: "사이즈가 안 맞아서", problemEn: "the size doesn't fit" },
      { itemKo: "그 신발", itemEn: "those shoes", sizeKo: "한 치수 큰", sizeEn: "one size up", problemKo: "색상이 달라서", problemEn: "the color is different" },
      { itemKo: "이 가방", itemEn: "this bag", sizeKo: "작은", sizeEn: "a smaller size", problemKo: "끈이 망가져서", problemEn: "the strap is broken" },
      { itemKo: "그 책", itemEn: "that book", sizeKo: "새것", sizeEn: "a new copy", problemKo: "페이지가 찢어져서", problemEn: "a page is torn" },
      { itemKo: "이 충전기", itemEn: "this charger", sizeKo: "다른 모델", sizeEn: "a different model", problemKo: "작동하지 않아서", problemEn: "it doesn't work" },
      { itemKo: "그 이어폰", itemEn: "those earbuds", sizeKo: "검은색", sizeEn: "black", problemKo: "한쪽이 안 들려서", problemEn: "one side doesn't work" },
      { itemKo: "이 재킷", itemEn: "this jacket", sizeKo: "L", sizeEn: "a large", problemKo: "지퍼가 고장 나서", problemEn: "the zipper is broken" },
      { itemKo: "그 선물", itemEn: "that gift", sizeKo: "포장된", sizeEn: "a wrapped one", problemKo: "구성품이 빠져서", problemEn: "something is missing" },
      { itemKo: "이 티켓", itemEn: "this ticket", sizeKo: "두 장", sizeEn: "two tickets", problemKo: "날짜가 틀려서", problemEn: "the date is wrong" },
      { itemKo: "그 제품", itemEn: "that product", sizeKo: "할인된", sizeEn: "a discounted one", problemKo: "영수증이 안 맞아서", problemEn: "the receipt doesn't match" }
    ],
    patterns: [
      {
        id: "price",
        level: "easy",
        tone: "polite",
        ko: "{itemKo} 가격이 얼마인지 알고 싶어요.",
        en: "I'd like to know how much {itemEn} costs.",
        requiredTerms: ["I'd like to know", "costs"]
      },
      {
        id: "try-size",
        level: "easy",
        tone: "polite",
        ko: "{sizeKo} 사이즈로 입어봐도 될까요?",
        en: "Could I try this on in {sizeEn}?",
        requiredTerms: ["try this on"]
      },
      {
        id: "refund",
        level: "easy",
        tone: "polite",
        ko: "{itemKo} 환불할 수 있을까요?",
        en: "Could I get a refund for {itemEn}?",
        requiredTerms: ["get a refund"]
      },
      {
        id: "exchange",
        level: "medium",
        tone: "polite",
        ko: "{problemKo} 교환하고 싶어요.",
        en: "I'd like to exchange it because {problemEn}.",
        requiredTerms: ["I'd like to", "exchange"]
      },
      {
        id: "looking-for",
        level: "easy",
        tone: "polite",
        ko: "{itemKo} 찾고 있는데 어디에 있나요?",
        en: "I'm looking for {itemEn}. Where can I find it?",
        requiredTerms: ["looking for", "where can I find"]
      },
      {
        id: "do-you-have",
        level: "easy",
        tone: "polite",
        ko: "{itemKo} 아직 재고가 있나요?",
        en: "Do you still have {itemEn} in stock?",
        requiredTerms: ["in stock"]
      },
      {
        id: "too-expensive",
        level: "easy",
        tone: "neutral",
        ko: "{itemKo}은 생각보다 조금 비싸네요.",
        en: "{itemEn} is a little more expensive than I expected.",
        requiredTerms: ["more expensive", "expected"]
      },
      {
        id: "receipt",
        level: "easy",
        tone: "polite",
        ko: "{itemKo} 영수증 받을 수 있을까요?",
        en: "Could I get a receipt for {itemEn}?",
        requiredTerms: ["get a receipt"]
      },
      {
        id: "reserve",
        level: "medium",
        tone: "polite",
        ko: "{itemKo}을 잠깐 맡아둘 수 있나요?",
        en: "Could you hold {itemEn} for a little while?",
        requiredTerms: ["hold", "for a little while"]
      },
      {
        id: "not-what-ordered",
        level: "medium",
        tone: "polite",
        ko: "{problemKo} 제가 주문한 것과 달라요.",
        en: "Because {problemEn}, this is different from what I ordered.",
        requiredTerms: ["different from", "ordered"]
      }
    ]
  },
  {
    id: "food",
    labelKo: "음식/카페",
    variants: [
      { foodKo: "파스타", foodEn: "the pasta", drinkKo: "아이스 아메리카노", drinkEn: "an iced Americano", requestKo: "양파", requestEn: "onions" },
      { foodKo: "오늘의 메뉴", foodEn: "today's special", drinkKo: "따뜻한 라테", drinkEn: "a hot latte", requestKo: "치즈", requestEn: "cheese" },
      { foodKo: "매운 음식", foodEn: "something spicy", drinkKo: "물", drinkEn: "water", requestKo: "고수", requestEn: "cilantro" },
      { foodKo: "디저트", foodEn: "dessert", drinkKo: "녹차", drinkEn: "green tea", requestKo: "소스", requestEn: "the sauce" },
      { foodKo: "샐러드", foodEn: "the salad", drinkKo: "탄산수", drinkEn: "sparkling water", requestKo: "드레싱", requestEn: "dressing" },
      { foodKo: "치킨", foodEn: "the chicken", drinkKo: "콜라", drinkEn: "a Coke", requestKo: "매운 양념", requestEn: "the spicy sauce" },
      { foodKo: "수프", foodEn: "the soup", drinkKo: "레몬에이드", drinkEn: "lemonade", requestKo: "후추", requestEn: "pepper" },
      { foodKo: "추천 메뉴", foodEn: "your recommendation", drinkKo: "디카페인 커피", drinkEn: "decaf coffee", requestKo: "설탕", requestEn: "sugar" },
      { foodKo: "아침 세트", foodEn: "the breakfast set", drinkKo: "오렌지 주스", drinkEn: "orange juice", requestKo: "버터", requestEn: "butter" },
      { foodKo: "채식 메뉴", foodEn: "a vegetarian option", drinkKo: "허브티", drinkEn: "herbal tea", requestKo: "고기", requestEn: "meat" }
    ],
    patterns: [
      {
        id: "recommend",
        level: "easy",
        tone: "polite",
        ko: "{foodKo} 추천해줄 수 있어?",
        en: "Could you recommend {foodEn}?",
        requiredTerms: ["recommend"]
      },
      {
        id: "ill-have",
        level: "easy",
        tone: "polite",
        ko: "저는 {drinkKo}으로 할게요.",
        en: "I'll have {drinkEn}.",
        requiredTerms: ["I'll have"]
      },
      {
        id: "without",
        level: "easy",
        tone: "polite",
        ko: "{requestKo} 빼고 주문할 수 있을까요?",
        en: "Could I order it without {requestEn}?",
        requiredTerms: ["order it without"]
      },
      {
        id: "separately",
        level: "easy",
        tone: "polite",
        ko: "{foodKo} 계산은 따로 할 수 있을까요?",
        en: "Could I pay separately for {foodEn}?",
        requiredTerms: ["pay separately"]
      },
      {
        id: "to-go",
        level: "easy",
        tone: "polite",
        ko: "{foodKo} 포장해갈 수 있나요?",
        en: "Can I get {foodEn} to go?",
        requiredTerms: ["to go"]
      },
      {
        id: "less-spicy",
        level: "easy",
        tone: "polite",
        ko: "{foodKo} 덜 맵게 해주실 수 있나요?",
        en: "Could you make {foodEn} less spicy?",
        requiredTerms: ["less spicy"]
      },
      {
        id: "anything-good",
        level: "easy",
        tone: "casual",
        ko: "{drinkKo}랑 잘 어울리는 메뉴가 뭐야?",
        en: "What goes well with {drinkEn}?",
        requiredTerms: ["goes well with"]
      },
      {
        id: "still-waiting",
        level: "medium",
        tone: "polite",
        ko: "{foodKo} 아직 안 나왔어요.",
        en: "{foodEn} hasn't come out yet.",
        requiredTerms: ["hasn't", "yet"]
      },
      {
        id: "extra",
        level: "easy",
        tone: "polite",
        ko: "{requestKo} 조금 더 받을 수 있을까요?",
        en: "Could I get a little extra {requestEn}?",
        requiredTerms: ["a little extra"]
      },
      {
        id: "allergy",
        level: "medium",
        tone: "polite",
        ko: "{requestKo} 알레르기가 있어서 빼주세요.",
        en: "I'm allergic to {requestEn}, so please leave it out.",
        requiredTerms: ["allergic to", "leave it out"]
      }
    ]
  },
  {
    id: "health",
    labelKo: "건강/몸 상태",
    variants: [
      { symptomKo: "두통", symptomEn: "a headache", bodyKo: "목", bodyEn: "throat", actionKo: "진료", actionEn: "a doctor's visit" },
      { symptomKo: "감기 기운", symptomEn: "cold symptoms", bodyKo: "허리", bodyEn: "back", actionKo: "물리치료", actionEn: "physical therapy" },
      { symptomKo: "속이 안 좋은 느낌", symptomEn: "an upset stomach", bodyKo: "어깨", bodyEn: "shoulder", actionKo: "검사", actionEn: "a checkup" },
      { symptomKo: "피곤함", symptomEn: "fatigue", bodyKo: "무릎", bodyEn: "knee", actionKo: "상담", actionEn: "a consultation" },
      { symptomKo: "어지러움", symptomEn: "dizziness", bodyKo: "손목", bodyEn: "wrist", actionKo: "예약", actionEn: "an appointment" },
      { symptomKo: "기침", symptomEn: "a cough", bodyKo: "눈", bodyEn: "eyes", actionKo: "약 처방", actionEn: "a prescription" },
      { symptomKo: "알레르기", symptomEn: "allergies", bodyKo: "발목", bodyEn: "ankle", actionKo: "치료", actionEn: "treatment" },
      { symptomKo: "근육통", symptomEn: "muscle pain", bodyKo: "팔", bodyEn: "arm", actionKo: "검진", actionEn: "a medical checkup" },
      { symptomKo: "열", symptomEn: "a fever", bodyKo: "배", bodyEn: "stomach", actionKo: "병원 예약", actionEn: "a hospital appointment" },
      { symptomKo: "불면", symptomEn: "trouble sleeping", bodyKo: "다리", bodyEn: "leg", actionKo: "상담 예약", actionEn: "a counseling appointment" }
    ],
    patterns: [
      {
        id: "symptom",
        level: "easy",
        tone: "casual",
        ko: "오늘 {symptomKo}이 좀 있어.",
        en: "I have {symptomEn} today.",
        requiredTerms: ["I have"]
      },
      {
        id: "keeps-hurting",
        level: "easy",
        tone: "casual",
        ko: "{bodyKo}이 계속 아파.",
        en: "My {bodyEn} keeps hurting.",
        requiredTerms: ["keeps hurting"]
      },
      {
        id: "rest",
        level: "medium",
        tone: "casual",
        ko: "오늘은 {symptomKo} 때문에 좀 쉬어야 할 것 같아.",
        en: "I think I should rest today because of {symptomEn}.",
        requiredTerms: ["should rest", "because of"]
      },
      {
        id: "appointment",
        level: "medium",
        tone: "neutral",
        ko: "{actionKo} 예약을 잡아야겠어.",
        en: "I should make an appointment for {actionEn}.",
        requiredTerms: ["make an appointment"]
      },
      {
        id: "better",
        level: "easy",
        tone: "casual",
        ko: "어제보다 {symptomKo}이 조금 나아졌어.",
        en: "{symptomEn} is a little better than yesterday.",
        requiredTerms: ["a little better"]
      },
      {
        id: "getting-worse",
        level: "easy",
        tone: "casual",
        ko: "{symptomKo}이 오히려 더 심해지는 것 같아.",
        en: "I think {symptomEn} is actually getting worse.",
        requiredTerms: ["getting worse"]
      },
      {
        id: "need-medicine",
        level: "easy",
        tone: "neutral",
        ko: "{symptomKo}에 먹을 약이 필요해.",
        en: "I need some medicine for {symptomEn}.",
        requiredTerms: ["medicine for"]
      },
      {
        id: "avoid",
        level: "medium",
        tone: "neutral",
        ko: "{bodyKo}이 아파서 무리하면 안 될 것 같아.",
        en: "My {bodyEn} hurts, so I don't think I should push myself.",
        requiredTerms: ["push myself"]
      },
      {
        id: "reschedule-health",
        level: "medium",
        tone: "neutral",
        ko: "{symptomKo} 때문에 오늘 일정은 미뤄야 할 것 같아.",
        en: "I think I need to postpone today's plans because of {symptomEn}.",
        requiredTerms: ["postpone", "because of"]
      },
      {
        id: "follow-up",
        level: "medium",
        tone: "neutral",
        ko: "{actionKo} 후에 다시 상태를 확인해야 해.",
        en: "I need to check how I feel again after {actionEn}.",
        requiredTerms: ["check how I feel", "after"]
      }
    ]
  },
  {
    id: "daily-home",
    labelKo: "집/일상",
    variants: [
      { choreKo: "쓰레기 버리기", choreEn: "take out the trash", itemKo: "우유", itemEn: "milk", placeKo: "부엌", placeEn: "the kitchen" },
      { choreKo: "빨래 돌리기", choreEn: "do the laundry", itemKo: "건전지", itemEn: "batteries", placeKo: "거실", placeEn: "the living room" },
      { choreKo: "설거지", choreEn: "do the dishes", itemKo: "휴지", itemEn: "toilet paper", placeKo: "책상", placeEn: "the desk" },
      { choreKo: "청소기 돌리기", choreEn: "vacuum", itemKo: "커피", itemEn: "coffee", placeKo: "방", placeEn: "the room" },
      { choreKo: "분리수거", choreEn: "sort the recycling", itemKo: "세제", itemEn: "detergent", placeKo: "베란다", placeEn: "the balcony" },
      { choreKo: "침대 정리", choreEn: "make the bed", itemKo: "계란", itemEn: "eggs", placeKo: "옷장", placeEn: "the closet" },
      { choreKo: "화장실 청소", choreEn: "clean the bathroom", itemKo: "치약", itemEn: "toothpaste", placeKo: "화장실", placeEn: "the bathroom" },
      { choreKo: "장보기", choreEn: "go grocery shopping", itemKo: "빵", itemEn: "bread", placeKo: "현관", placeEn: "the entryway" },
      { choreKo: "택배 확인", choreEn: "check the package", itemKo: "고양이 사료", itemEn: "cat food", placeKo: "창고", placeEn: "the storage room" },
      { choreKo: "냉장고 정리", choreEn: "clean out the fridge", itemKo: "생수", itemEn: "bottled water", placeKo: "냉장고", placeEn: "the fridge" }
    ],
    patterns: [
      {
        id: "need-to",
        level: "easy",
        tone: "casual",
        ko: "오늘 {choreKo} 해야 해.",
        en: "I need to {choreEn} today.",
        requiredTerms: ["need to", "today"]
      },
      {
        id: "forgot-buy",
        level: "easy",
        tone: "casual",
        ko: "{itemKo} 사오는 걸 깜빡했어.",
        en: "I forgot to buy {itemEn}.",
        requiredTerms: ["forgot to buy"]
      },
      {
        id: "tidy-up",
        level: "easy",
        tone: "casual",
        ko: "{placeKo} 좀 정리해야겠어.",
        en: "I should tidy up {placeEn}.",
        requiredTerms: ["should", "tidy up"]
      },
      {
        id: "dont-remember",
        level: "easy",
        tone: "casual",
        ko: "{itemKo} 어디에 뒀는지 기억이 안 나.",
        en: "I don't remember where I put {itemEn}.",
        requiredTerms: ["don't remember", "where I put"]
      },
      {
        id: "ill-do",
        level: "easy",
        tone: "casual",
        ko: "내가 {choreKo} 할 테니까 너는 쉬어.",
        en: "I'll {choreEn}, so you can rest.",
        requiredTerms: ["I'll", "you can rest"]
      },
      {
        id: "out-of",
        level: "easy",
        tone: "casual",
        ko: "{itemKo}이 거의 다 떨어졌어.",
        en: "We're almost out of {itemEn}.",
        requiredTerms: ["almost out of"]
      },
      {
        id: "before-leaving",
        level: "easy",
        tone: "casual",
        ko: "나가기 전에 {choreKo}만 하고 갈게.",
        en: "I'll {choreEn} before I leave.",
        requiredTerms: ["before I leave"]
      },
      {
        id: "put-back",
        level: "easy",
        tone: "casual",
        ko: "{itemKo}은 {placeKo}에 다시 둬줘.",
        en: "Please put {itemEn} back in {placeEn}.",
        requiredTerms: ["put back"]
      },
      {
        id: "messy",
        level: "easy",
        tone: "casual",
        ko: "{placeKo}이 생각보다 많이 어질러졌어.",
        en: "{placeEn} is messier than I expected.",
        requiredTerms: ["messier than", "expected"]
      },
      {
        id: "split-chores",
        level: "medium",
        tone: "casual",
        ko: "우리 {choreKo}랑 다른 일들을 나눠서 하자.",
        en: "Let's split {choreEn} and the other chores.",
        requiredTerms: ["split", "chores"]
      }
    ]
  },
  {
    id: "small-talk",
    labelKo: "스몰토크",
    variants: [
      { topicKo: "새 직장", topicEn: "your new job", eventKo: "어제 모임", eventEn: "the meetup yesterday", timeKo: "이번 주말", timeEn: "this weekend" },
      { topicKo: "요즘 운동", topicEn: "working out lately", eventKo: "여행", eventEn: "the trip", timeKo: "퇴근 후", timeEn: "after work" },
      { topicKo: "새 게임", topicEn: "the new game", eventKo: "발표", eventEn: "the presentation", timeKo: "내일", timeEn: "tomorrow" },
      { topicKo: "요리", topicEn: "cooking", eventKo: "면접", eventEn: "the interview", timeKo: "방학 때", timeEn: "during the break" },
      { topicKo: "최근 프로젝트", topicEn: "your recent project", eventKo: "생일 파티", eventEn: "the birthday party", timeKo: "저녁에", timeEn: "tonight" },
      { topicKo: "새 취미", topicEn: "your new hobby", eventKo: "시험", eventEn: "the exam", timeKo: "다음 주", timeEn: "next week" },
      { topicKo: "가족 이야기", topicEn: "your family", eventKo: "콘서트", eventEn: "the concert", timeKo: "점심시간에", timeEn: "during lunch" },
      { topicKo: "요즘 보는 드라마", topicEn: "the show you're watching", eventKo: "회의", eventEn: "the meeting", timeKo: "연휴에", timeEn: "over the holiday" },
      { topicKo: "새로 이사한 집", topicEn: "your new place", eventKo: "첫 출근", eventEn: "your first day at work", timeKo: "이번 달", timeEn: "this month" },
      { topicKo: "주말 계획", topicEn: "your weekend plans", eventKo: "친구 결혼식", eventEn: "your friend's wedding", timeKo: "오늘 밤", timeEn: "tonight" }
    ],
    patterns: [
      {
        id: "how-was",
        level: "easy",
        tone: "casual",
        ko: "{eventKo} 어땠어?",
        en: "How was {eventEn}?",
        requiredTerms: ["how was"]
      },
      {
        id: "sounds-fun",
        level: "easy",
        tone: "casual",
        ko: "{topicKo} 이야기 들으니까 재밌다.",
        en: "It sounds fun hearing about {topicEn}.",
        requiredTerms: ["sounds fun", "hearing about"]
      },
      {
        id: "busy",
        level: "easy",
        tone: "casual",
        ko: "요즘 {topicKo} 때문에 바빴어.",
        en: "I've been busy with {topicEn} lately.",
        requiredTerms: ["been busy", "lately"]
      },
      {
        id: "plans",
        level: "easy",
        tone: "casual",
        ko: "{timeKo}에 뭐 할 계획이야?",
        en: "What are you planning to do {timeEn}?",
        requiredTerms: ["planning to do"]
      },
      {
        id: "glad",
        level: "easy",
        tone: "casual",
        ko: "{eventKo} 잘 됐다니 다행이야.",
        en: "I'm glad {eventEn} went well.",
        requiredTerms: ["I'm glad", "went well"]
      },
      {
        id: "tell-me-more",
        level: "easy",
        tone: "casual",
        ko: "{topicKo} 얘기 좀 더 해줘.",
        en: "Tell me more about {topicEn}.",
        requiredTerms: ["tell me more"]
      },
      {
        id: "long-time",
        level: "easy",
        tone: "casual",
        ko: "{timeKo}에 진짜 오랜만에 보는 거네.",
        en: "It'll be the first time in a while seeing you {timeEn}.",
        requiredTerms: ["first time", "in a while"]
      },
      {
        id: "didnt-expect",
        level: "medium",
        tone: "casual",
        ko: "{eventKo}이 그렇게 될 줄은 몰랐어.",
        en: "I didn't expect {eventEn} to turn out like that.",
        requiredTerms: ["didn't expect", "turn out"]
      },
      {
        id: "how-going",
        level: "easy",
        tone: "casual",
        ko: "{topicKo}은 요즘 어떻게 되어가?",
        en: "How is {topicEn} going these days?",
        requiredTerms: ["how is", "going"]
      },
      {
        id: "lets-catch-up",
        level: "easy",
        tone: "casual",
        ko: "{timeKo}에 밀린 이야기 좀 하자.",
        en: "Let's catch up {timeEn}.",
        requiredTerms: ["catch up"]
      }
    ]
  },
  {
    id: "boundaries",
    labelKo: "경계/취향",
    variants: [
      { thingKo: "시끄러운 곳", thingEn: "a loud place", behaviorKo: "갑자기 전화하는 것", behaviorEn: "sudden phone calls", timeKo: "잠깐", timeEn: "for a bit" },
      { thingKo: "복잡한 계획", thingEn: "a complicated plan", behaviorKo: "내 말을 끊는 것", behaviorEn: "being interrupted", timeKo: "오늘은", timeEn: "today" },
      { thingKo: "늦은 시간", thingEn: "a late time", behaviorKo: "사적인 질문", behaviorEn: "personal questions", timeKo: "조금만", timeEn: "for a little while" },
      { thingKo: "큰 모임", thingEn: "a big gathering", behaviorKo: "압박하는 분위기", behaviorEn: "being pressured", timeKo: "지금은", timeEn: "right now" },
      { thingKo: "급한 결정", thingEn: "a rushed decision", behaviorKo: "동의 없이 정하는 것", behaviorEn: "deciding without my agreement", timeKo: "한동안", timeEn: "for a while" },
      { thingKo: "긴 통화", thingEn: "a long phone call", behaviorKo: "내 일정을 묻는 것", behaviorEn: "asking about my schedule", timeKo: "몇 분만", timeEn: "for a few minutes" },
      { thingKo: "너무 밝은 화면", thingEn: "a screen that's too bright", behaviorKo: "큰 소리로 말하는 것", behaviorEn: "speaking loudly", timeKo: "잠시", timeEn: "for a moment" },
      { thingKo: "예고 없는 방문", thingEn: "an unplanned visit", behaviorKo: "내 물건을 만지는 것", behaviorEn: "touching my things", timeKo: "오늘 밤은", timeEn: "tonight" },
      { thingKo: "매운 음식", thingEn: "spicy food", behaviorKo: "농담처럼 넘기는 것", behaviorEn: "brushing it off as a joke", timeKo: "이번 주는", timeEn: "this week" },
      { thingKo: "너무 빠른 진행", thingEn: "moving too fast", behaviorKo: "계속 재촉하는 것", behaviorEn: "being rushed again and again", timeKo: "조금 더", timeEn: "a little longer" }
    ],
    patterns: [
      {
        id: "prefer",
        level: "easy",
        tone: "neutral",
        ko: "나는 {thingKo}보다 조용한 게 더 좋아.",
        en: "I prefer something quieter than {thingEn}.",
        requiredTerms: ["prefer", "quieter than"]
      },
      {
        id: "uncomfortable",
        level: "medium",
        tone: "neutral",
        ko: "{behaviorKo}는 조금 불편해.",
        en: "I'm a little uncomfortable with {behaviorEn}.",
        requiredTerms: ["uncomfortable with"]
      },
      {
        id: "alone",
        level: "easy",
        tone: "casual",
        ko: "지금은 {timeKo} 혼자 있고 싶어.",
        en: "I want to be alone {timeEn} right now.",
        requiredTerms: ["want to be alone"]
      },
      {
        id: "talk-later",
        level: "medium",
        tone: "neutral",
        ko: "{thingKo} 이야기는 나중에 하면 좋겠어.",
        en: "I'd rather talk about {thingEn} later.",
        requiredTerms: ["I'd rather", "later"]
      },
      {
        id: "without",
        level: "medium",
        tone: "neutral",
        ko: "나는 {behaviorKo} 없이 진행하는 게 편해.",
        en: "I'd feel more comfortable moving forward without {behaviorEn}.",
        requiredTerms: ["feel more comfortable", "without"]
      },
      {
        id: "not-ready",
        level: "medium",
        tone: "neutral",
        ko: "아직 {thingKo}을 받아들일 준비가 안 됐어.",
        en: "I'm not ready for {thingEn} yet.",
        requiredTerms: ["not ready", "yet"]
      },
      {
        id: "need-space",
        level: "easy",
        tone: "neutral",
        ko: "{timeKo} 거리를 좀 두고 싶어.",
        en: "I need some space {timeEn}.",
        requiredTerms: ["need some space"]
      },
      {
        id: "please-dont",
        level: "easy",
        tone: "neutral",
        ko: "{behaviorKo}는 하지 말아줬으면 해.",
        en: "I'd prefer it if you didn't do {behaviorEn}.",
        requiredTerms: ["prefer it if", "didn't"]
      },
      {
        id: "more-time",
        level: "easy",
        tone: "neutral",
        ko: "{thingKo}에 대해 생각할 시간이 더 필요해.",
        en: "I need more time to think about {thingEn}.",
        requiredTerms: ["need more time", "think about"]
      },
      {
        id: "works-better",
        level: "medium",
        tone: "neutral",
        ko: "나는 {thingKo}보다 다른 방식이 더 잘 맞아.",
        en: "A different way works better for me than {thingEn}.",
        requiredTerms: ["works better", "for me"]
      }
    ]
  },
  {
    id: "messages",
    labelKo: "전화/문자/이메일",
    variants: [
      { personKo: "너", personEn: "you", messageKo: "주소", messageEn: "the address", channelKo: "이메일", channelEn: "my email" },
      { personKo: "민수", personEn: "Minsu", messageKo: "사진", messageEn: "the photo", channelKo: "단체 채팅", channelEn: "the group chat" },
      { personKo: "담당자", personEn: "the person in charge", messageKo: "파일", messageEn: "the file", channelKo: "받은 편지함", channelEn: "my inbox" },
      { personKo: "엄마", personEn: "my mom", messageKo: "시간", messageEn: "the time", channelKo: "문자", channelEn: "my text messages" },
      { personKo: "팀장님", personEn: "my manager", messageKo: "링크", messageEn: "the link", channelKo: "업무 메신저", channelEn: "the work messenger" },
      { personKo: "친구", personEn: "my friend", messageKo: "위치", messageEn: "the location", channelKo: "디스코드", channelEn: "Discord" },
      { personKo: "선생님", personEn: "the teacher", messageKo: "숙제", messageEn: "the homework", channelKo: "공지방", channelEn: "the announcement channel" },
      { personKo: "고객센터", personEn: "customer support", messageKo: "주문 번호", messageEn: "the order number", channelKo: "문의 메일", channelEn: "the support email" },
      { personKo: "스터디 멤버", personEn: "the study group member", messageKo: "복습 목록", messageEn: "the review list", channelKo: "공유 문서", channelEn: "the shared document" },
      { personKo: "동료", personEn: "my coworker", messageKo: "회의 링크", messageEn: "the meeting link", channelKo: "캘린더", channelEn: "my calendar" }
    ],
    patterns: [
      {
        id: "call-back",
        level: "easy",
        tone: "casual",
        ko: "나중에 {personKo}에게 다시 전화할게.",
        en: "I'll call {personEn} back later.",
        requiredTerms: ["call back", "later"]
      },
      {
        id: "text",
        level: "easy",
        tone: "neutral",
        ko: "{messageKo} 문자로 보내줄래?",
        en: "Could you send {messageEn} by text?",
        requiredTerms: ["send", "by text"]
      },
      {
        id: "missed-call",
        level: "easy",
        tone: "neutral",
        ko: "아까 {personKo} 전화 못 받아서 미안해.",
        en: "Sorry I missed the call from {personEn} earlier.",
        requiredTerms: ["missed the call", "earlier"]
      },
      {
        id: "check-reply",
        level: "easy",
        tone: "neutral",
        ko: "{channelKo} 확인하고 답장할게.",
        en: "I'll check {channelEn} and reply.",
        requiredTerms: ["check", "reply"]
      },
      {
        id: "as-soon-as",
        level: "medium",
        tone: "neutral",
        ko: "{messageKo} 보내면 내가 바로 볼게.",
        en: "I'll look at {messageEn} as soon as you send it.",
        requiredTerms: ["as soon as", "send it"]
      },
      {
        id: "did-you-get",
        level: "easy",
        tone: "casual",
        ko: "내가 보낸 {messageKo} 받았어?",
        en: "Did you get {messageEn} that I sent?",
        requiredTerms: ["did you get", "sent"]
      },
      {
        id: "cant-talk-now",
        level: "easy",
        tone: "casual",
        ko: "지금은 통화가 어려우니까 {channelKo}으로 보내줘.",
        en: "I can't talk right now, so please send it to {channelEn}.",
        requiredTerms: ["can't talk", "right now"]
      },
      {
        id: "forward",
        level: "easy",
        tone: "neutral",
        ko: "{messageKo}을 {personKo}에게 전달해줄게.",
        en: "I'll forward {messageEn} to {personEn}.",
        requiredTerms: ["forward", "to"]
      },
      {
        id: "wrong-chat",
        level: "medium",
        tone: "casual",
        ko: "{messageKo}을 잘못된 곳에 보낸 것 같아.",
        en: "I think I sent {messageEn} to the wrong place.",
        requiredTerms: ["sent", "wrong place"]
      },
      {
        id: "pin-message",
        level: "medium",
        tone: "neutral",
        ko: "{channelKo}에 {messageKo}을 고정해둘게.",
        en: "I'll pin {messageEn} in {channelEn}.",
        requiredTerms: ["pin", "in"]
      }
    ]
  }
];

export const conversationPracticePrompts = buildConversationPracticePrompts();
