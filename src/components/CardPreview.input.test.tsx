import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import i18n from "../i18n";
import { CardPreview } from "./CardPreview";
import { MockProvider } from "../services/llm/mockProvider";
import { createStudyCardFromGenerated } from "../shared/cardFactory";
import { defaultLearningProfile } from "../shared/languages";
import { createInitialSrs } from "../shared/srs";
import type { StudyCard } from "../shared/types";

describe("CardPreview input reading back", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("ko");
  });

  it("keeps input listening sentence on the back while front uses the original segment prompt", () => {
    const card: StudyCard = {
      id: "input-listening-card",
      cardType: "reading",
      deckType: "input-listening",
      direction: "en_to_ko",
      sourceSentence: "I was just wondering if you had a minute.",
      targetText: "listening:abc123:segment-1",
      frontText: "I was just wondering if you had a minute.",
      literalTranslationKo: "잠깐 시간이 있는지 궁금했어요.",
      naturalTranslationKo: "잠깐 시간 괜찮으세요?",
      highlightMappings: [
        {
          sourceText: "a minute",
          literalKo: "시간",
          naturalKo: "시간",
          colorKey: "yellow"
        }
      ],
      listeningAnnotations: [
        {
          anchorText: "a minute",
          mark: "linking-bridge",
          label: "a minute: 붙어 들림",
          confidence: 0.68
        }
      ],
      vocabularyItems: [],
      confusingComparisons: [],
      pumpPrompts: [],
      structureNote: "영상: Sample\n구간: 0:00 - 0:05\nYouTube: https://www.youtube.com/watch?v=abc123&t=0s",
      srs: createInitialSrs(new Date("2026-06-12T00:00:00.000Z")),
      createdAt: "2026-06-12T00:00:00.000Z",
      updatedAt: "2026-06-12T00:00:00.000Z"
    };

    const frontHtml = renderToStaticMarkup(<CardPreview card={card} />);
    expect(frontHtml).toContain("원본 구간");
    expect(frontHtml).toContain("0:00 - 0:05");
    expect(frontHtml).toContain("<iframe");
    expect(frontHtml).toContain("http://127.0.0.1:17345/listening-youtube-player");
    expect(frontHtml).toContain("videoId=abc123");
    expect(frontHtml).toContain("start=0");
    expect(frontHtml).toContain("end=5");
    expect(frontHtml).toContain("controls=1");
    expect(frontHtml).not.toContain("I was just wondering if you had a minute.");

    const backHtml = renderToStaticMarkup(<CardPreview card={card} defaultShowBack />);
    expect(backHtml).toContain("I was just wondering if you had ");
    expect(backHtml).toContain("highlight-yellow");
    expect(backHtml).toContain("listening-mark-linking-bridge");
    expect(backHtml).toContain("AI로 만들어진 강세/억양 표시는 정확하지 않을 수 있습니다.");
    expect(backHtml).toContain("뜻");
    expect(backHtml).toContain("소리 포인트");
    expect(backHtml).toContain("강세와 억양 표시 설명");
    expect(backHtml).toContain("연결 발음");
    expect(backHtml).toContain(">시간</mark> 괜찮으세요?");
  });

  it("does not use TTS when an input listening card has no original playback media", () => {
    const card: StudyCard = {
      id: "input-listening-no-media",
      cardType: "reading",
      deckType: "input-listening",
      direction: "target_to_native",
      sourceSentence: "I met your mother.",
      targetText: "listening:local-file-without-media",
      frontText: "I met your mother.",
      literalTranslationKo: "나는 네 엄마를 만났어.",
      naturalTranslationKo: "네 엄마를 만났어.",
      highlightMappings: [],
      vocabularyItems: [],
      confusingComparisons: [],
      pumpPrompts: [],
      structureNote: "영상: Local Video\n구간: 0:08 - 0:10",
      srs: createInitialSrs(new Date("2026-06-12T00:00:00.000Z")),
      createdAt: "2026-06-12T00:00:00.000Z",
      updatedAt: "2026-06-12T00:00:00.000Z"
    };

    const html = renderToStaticMarkup(<CardPreview card={card} />);

    expect(html).toContain("원본 오디오 없음");
    expect(html).toContain("저장된 원본 오디오 없음");
    expect(html).toContain("TTS 대신 원본 구간을 저장하려면");
    expect(html).not.toContain("문장 듣기");
  });

  it("uses a stored original audio clip before any fallback on input listening cards", () => {
    const card: StudyCard = {
      id: "input-listening-audio-media",
      cardType: "reading",
      deckType: "input-listening",
      direction: "target_to_native",
      sourceSentence: "I met your mother.",
      targetText: "listening:local-file-with-media",
      frontText: "I met your mother.",
      literalTranslationKo: "나는 네 엄마를 만났어.",
      naturalTranslationKo: "네 엄마를 만났어.",
      highlightMappings: [],
      vocabularyItems: [],
      confusingComparisons: [],
      pumpPrompts: [],
      structureNote: "영상: Local Video\n구간: 0:08 - 0:10",
      listeningMedia: {
        audioClip: {
          filePath: "C:/tmp/listening/audio.m4a",
          fileUrl: "lem-video://local/audio-token",
          mimeType: "audio/mp4",
          start: 7.75,
          end: 10.25,
          sourceType: "local-video",
          createdAt: "2026-06-12T00:00:00.000Z"
        }
      },
      srs: createInitialSrs(new Date("2026-06-12T00:00:00.000Z")),
      createdAt: "2026-06-12T00:00:00.000Z",
      updatedAt: "2026-06-12T00:00:00.000Z"
    };

    const html = renderToStaticMarkup(<CardPreview card={card} />);

    expect(html).toContain("원본 오디오");
    expect(html).toContain("<audio");
    expect(html).toContain("lem-video://local/audio-token");
    expect(html).toContain("0:07 - 0:10");
    expect(html).toContain("구간 다시 듣기");
    expect(html).not.toContain("문장 듣기");
  });

  it("uses a stored generated video clip before audio or YouTube fallbacks", () => {
    const card: StudyCard = {
      id: "input-listening-video-media",
      cardType: "reading",
      deckType: "input-listening",
      direction: "target_to_native",
      sourceSentence: "So she was considering in her own mind.",
      targetText: "listening:sample-video:segment-1",
      frontText: "So she was considering in her own mind.",
      literalTranslationKo: "그래서 그녀는 마음속으로 생각하고 있었다.",
      naturalTranslationKo: "그래서 앨리스는 머릿속으로 곰곰이 생각하고 있었다.",
      highlightMappings: [],
      vocabularyItems: [],
      confusingComparisons: [],
      pumpPrompts: [],
      structureNote: "영상: Generated Alice Sample\n구간: 0:00 - 1:00",
      listeningMedia: {
        videoClip: {
          filePath: "C:/tmp/listening/alice-sample.mp4",
          fileUrl: "/samples/listening/alice-chapter1-sample.mp4",
          mimeType: "video/mp4",
          start: 0,
          end: 60,
          sourceType: "transcript-audio",
          createdAt: "2026-06-12T00:00:00.000Z"
        },
        audioClip: {
          filePath: "C:/tmp/listening/alice-sample.m4a",
          fileUrl: "/samples/listening/alice-chapter1-sample.m4a",
          mimeType: "audio/mp4",
          start: 0,
          end: 60,
          sourceType: "transcript-audio",
          createdAt: "2026-06-12T00:00:00.000Z"
        },
        frameImage: {
          filePath: "C:/tmp/listening/alice-scene.png",
          fileUrl: "/samples/listening/alice-chapter1-scene.png",
          mimeType: "image/png",
          capturedAt: 0,
          createdAt: "2026-06-12T00:00:00.000Z"
        }
      },
      srs: createInitialSrs(new Date("2026-06-12T00:00:00.000Z")),
      createdAt: "2026-06-12T00:00:00.000Z",
      updatedAt: "2026-06-12T00:00:00.000Z"
    };

    const html = renderToStaticMarkup(<CardPreview card={card} />);

    expect(html).toContain("원본 영상");
    expect(html).toContain("<video");
    expect(html).toContain("/samples/listening/alice-chapter1-sample.mp4");
    expect(html).toContain("poster=\"/samples/listening/alice-chapter1-scene.png\"");
    expect(html).toContain("0:00 - 1:00");
    expect(html).toContain("구간 다시 보기");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<audio");
  });

  it("falls back to a Korean meaning anchor for input listening highlights", () => {
    const card: StudyCard = {
      id: "input-listening-meaning-fallback",
      cardType: "reading",
      deckType: "input-listening",
      direction: "target_to_native",
      sourceSentence: "I've been there for all the big moments.",
      targetText: "listening:meaning-fallback",
      frontText: "I've been there for all the big moments.",
      literalTranslationKo: "나는 모든 중요한 순간에 함께 있었어요.",
      naturalTranslationKo: "나는 모든 중요한 순간에 함께 있었어요.",
      highlightMappings: [
        {
          sourceText: "moments",
          colorKey: "yellow"
        }
      ],
      listeningAnnotations: [
        {
          anchorText: "moments",
          mark: "strong-stress-dot",
          label: "moments: 강한 강세",
          confidence: 0.68
        }
      ],
      vocabularyItems: [],
      confusingComparisons: [],
      pumpPrompts: [],
      structureNote: "영상: Sample\n구간: 0:00 - 0:05",
      srs: createInitialSrs(new Date("2026-06-12T00:00:00.000Z")),
      createdAt: "2026-06-12T00:00:00.000Z",
      updatedAt: "2026-06-12T00:00:00.000Z"
    };

    const html = renderToStaticMarkup(<CardPreview card={card} defaultShowBack />);
    expect(html).toContain("moments");
    expect(html).toContain("listening-mark-strong-stress-dot");
    expect(html).toContain(">순간</mark>");
    expect(html.indexOf("AI로 만들어진 강세/억양 표시는 정확하지 않을 수 있습니다.")).toBeGreaterThan(
      html.indexOf("출처")
    );
  });

  it("hides placeholder function-word vocabulary on input listening cards but keeps sound and comparison notes", () => {
    const card: StudyCard = {
      id: "input-listening-function-vocab",
      cardType: "reading",
      deckType: "input-listening",
      direction: "target_to_native",
      sourceSentence: "I've had this shirt for nearly six years.",
      targetText: "listening:function-vocab",
      frontText: "I've had this shirt for nearly six years.",
      literalTranslationKo: "나는 이 셔츠를 거의 6년 동안 가지고 있었다.",
      naturalTranslationKo: "이 셔츠를 거의 6년 동안 가지고 있었어.",
      highlightMappings: [
        { sourceText: "I've", colorKey: "yellow" },
        { sourceText: "had", colorKey: "orange" }
      ],
      listeningAnnotations: [
        {
          anchorText: "I've",
          mark: "linking-bridge",
          label: "I've: 붙어 들림",
          confidence: 0.68
        },
        {
          anchorText: "had",
          mark: "stress-dot",
          label: "had: 강세 후보",
          confidence: 0.68
        }
      ],
      vocabularyItems: [
        {
          term: "I've",
          partOfSpeech: "word",
          basicMeaningKo: "문맥 기반 의미 확인 필요",
          meaningInContextKo: "선택한 표현을 원문 안에서 확인해야 합니다.",
          colorKey: "yellow",
          examples: ['I noticed "I\'ve" in the sentence.']
        },
        {
          term: "had",
          partOfSpeech: "word",
          basicMeaningKo: "문맥 기반 의미 확인 필요",
          meaningInContextKo: "선택한 표현을 원문 안에서 확인해야 합니다.",
          colorKey: "orange",
          examples: ['I noticed "had" in the sentence.']
        }
      ],
      confusingComparisons: [
        {
          kind: "nuance",
          title: "there's a vs direct translation",
          explanationKo:
            '"there\'s a"은 원문 문장에서의 역할을 기준으로 익히세요. "direct translation"은 비슷해 보여도 표현 단위와 자연스러운 뜻이 달라질 수 있습니다. 예: I noticed "there\'s a" in context. / I used "direct translation" in a simpler sentence.'
        },
        {
          kind: "nuance",
          title: "had vs have had",
          explanationKo:
            "had는 과거 시점의 소유이고 have had는 과거부터 현재까지 이어지는 소유나 경험입니다."
        }
      ],
      pumpPrompts: [],
      structureNote: "영상: Sample\n구간: 0:47 - 0:48",
      srs: createInitialSrs(new Date("2026-06-12T00:00:00.000Z")),
      createdAt: "2026-06-12T00:00:00.000Z",
      updatedAt: "2026-06-12T00:00:00.000Z"
    };

    const html = renderToStaticMarkup(<CardPreview card={card} defaultShowBack />);

    expect(html).toContain("소리 포인트");
    expect(html).toContain("I have 축약형");
    expect(html).toContain("have had 구조 안에서 이어 들리는 핵심 동사");
    expect(html).toContain("had vs have had");
    expect(html).not.toContain("there&#x27;s a vs direct translation");
    expect(html).not.toContain("direct translation");
    expect(html).not.toContain("문맥 기반 의미 확인 필요");
    expect(html).not.toContain("선택한 표현을 원문 안에서 확인해야 합니다.");
    expect(html).not.toContain("vocab-item");
  });

  it("keeps meaningful content-word vocabulary on input listening cards", () => {
    const card: StudyCard = {
      id: "input-listening-content-vocab",
      cardType: "reading",
      deckType: "input-listening",
      direction: "target_to_native",
      sourceSentence: "I had worked hard for nearly two years, for the purpose of infusing life into an inanimate body.",
      targetText: "listening:content-vocab",
      frontText: "I had worked hard for nearly two years, for the purpose of infusing life into an inanimate body.",
      literalTranslationKo: "나는 생명이 없는 몸에 생명을 불어넣기 위해 거의 2년 동안 열심히 일했다.",
      naturalTranslationKo: "나는 거의 2년 동안 생명 없는 몸에 생명을 불어넣으려 애썼다.",
      highlightMappings: [{ sourceText: "inanimate", colorKey: "green" }],
      listeningAnnotations: [
        {
          anchorText: "inanimate",
          mark: "strong-stress-dot",
          label: "inanimate: 강하게 들리는 핵심어",
          confidence: 0.68
        }
      ],
      vocabularyItems: [
        {
          term: "inanimate",
          partOfSpeech: "adjective",
          basicMeaningKo: "생명이 없는",
          meaningInContextKo: "살아 있지 않은 몸을 가리킴",
          colorKey: "green",
          examples: ["The statue looked inanimate."],
          exampleTranslationsKo: ["그 조각상은 생명이 없어 보였다."]
        }
      ],
      confusingComparisons: [],
      pumpPrompts: [],
      structureNote: "영상: Sample\n구간: 0:10 - 0:15",
      srs: createInitialSrs(new Date("2026-06-12T00:00:00.000Z")),
      createdAt: "2026-06-12T00:00:00.000Z",
      updatedAt: "2026-06-12T00:00:00.000Z"
    };

    const html = renderToStaticMarkup(<CardPreview card={card} defaultShowBack />);

    expect(html).toContain("inanimate");
    expect(html).toContain("생명이 없는");
    expect(html).toContain("vocab-item");
  });

  it("colors the selected word in literal and natural translations from display vocabulary fallback", () => {
    const card: StudyCard = {
      id: "input-highlight-card",
      cardType: "reading",
      deckType: "input",
      direction: "en_to_ko",
      sourceSentence: "How do I make it work?",
      frontText: "How do I make it work?",
      literalTranslationKo: "어떻게 내가 그것을 작동하게 만들까?",
      naturalTranslationKo: "이거 어떻게 하면 되지?",
      highlightMappings: [
        {
          sourceText: "How",
          colorKey: "cyan"
        }
      ],
      vocabularyItems: [
        {
          term: "how",
          basicMeaningKo: "선택 표현",
          meaningInContextKo: "How do I make it work?",
          colorKey: "cyan",
          examples: []
        }
      ],
      confusingComparisons: [],
      pumpPrompts: [],
      srs: createInitialSrs(new Date("2026-06-12T00:00:00.000Z")),
      createdAt: "2026-06-12T00:00:00.000Z",
      updatedAt: "2026-06-12T00:00:00.000Z"
    };

    const html = renderToStaticMarkup(<CardPreview card={card} defaultShowBack />);

    expect(html).toContain("highlight-cyan");
    expect(html).toContain(">어떻게</mark>");
    expect(html).toContain("표현 패턴 / Collocation");
    expect(html).toContain("Collocation:");
  });

  it("renders similar expression comparisons on the input card back", () => {
    const card: StudyCard = {
      id: "input-comparison-card",
      cardType: "reading",
      deckType: "input",
      direction: "en_to_ko",
      sourceSentence: "The old gate looked battered.",
      frontText: "The old gate looked battered.",
      literalTranslationKo: "그 오래된 문은 두들겨 맞은 듯 보였다.",
      naturalTranslationKo: "낡은 문이 꽤 손상돼 보였다.",
      highlightMappings: [],
      vocabularyItems: [
        {
          term: "battered",
          basicMeaningKo: "두들겨 맞은, 낡아 손상된",
          meaningInContextKo: "문이 오래 맞고 닳은 듯 손상된 상태",
          colorKey: "orange",
          examples: ["The battered suitcase still worked."]
        }
      ],
      confusingComparisons: [
        {
          kind: "nuance",
          title: "battered vs damaged",
          explanationKo:
            "damaged는 손상됐다는 넓은 말이고, battered는 반복적으로 맞거나 닳아 거칠게 손상된 느낌이 강합니다."
        }
      ],
      pumpPrompts: [],
      srs: createInitialSrs(new Date("2026-06-12T00:00:00.000Z")),
      createdAt: "2026-06-12T00:00:00.000Z",
      updatedAt: "2026-06-12T00:00:00.000Z"
    };

    const html = renderToStaticMarkup(<CardPreview card={card} defaultShowBack />);

    expect(html).toContain("비슷한 표현 비교");
    expect(html).toContain("뉘앙스");
    expect(html).toContain("battered vs damaged");
    expect(html).toContain("1개");
  });

  it("renders a generated multi-term input card with every selected term preserved", async () => {
    const provider = new MockProvider();
    const generated = await provider.generateReadingCard({
      selectedText: "dilapidated, facades, neglect",
      sourceSentence:
        "Narrow, deserted streets wind through dilapidated buildings, their facades worn and battered by time and neglect.",
      learningProfile: defaultLearningProfile
    });
    const card = createStudyCardFromGenerated({
      ...generated,
      structureNote: "앱: QA\n문서: input deck multi-term fixture"
    });

    const html = renderToStaticMarkup(<CardPreview card={card} defaultShowBack />);

    expect(card.deckType).toBe("input");
    expect(card.direction).toBe("target_to_native");
    expect(card.vocabularyItems.map((item) => item.term)).toEqual([
      "dilapidated",
      "facade",
      "neglect"
    ]);
    expect(card.confusingComparisons).toHaveLength(3);
    expect(html.match(/input-vocab-list-item/g) ?? []).toHaveLength(3);
    expect(html).toContain("dilapidated");
    expect(html).toContain("facade");
    expect(html).toContain("neglect");
    expect(html).toContain("highlight-red");
    expect(html).toContain("highlight-orange");
    expect(html).toContain("highlight-blue");
    expect(html).toContain(">황폐한 건물들</mark>");
    expect(html).toContain(">허름한 건물</mark>");
    expect(html).toContain(">외벽</mark>");
    expect(html).toContain(">방치</mark>");
    expect(html).toContain("표현 패턴 / Collocation");
    expect(html).toContain("Collocation: dilapidated + building/facility");
    expect(html).toContain("출처");
    expect(html).toContain("input deck multi-term fixture");
    const comparisonIndex = html.indexOf(card.confusingComparisons?.[0]?.title ?? "");
    const sourceIndex = html.indexOf("input deck multi-term fixture");
    expect(comparisonIndex).toBeGreaterThanOrEqual(0);
    expect(sourceIndex).toBeGreaterThan(comparisonIndex);
    expect(html).toContain("비슷한 표현 비교");
    expect(html).toContain("3개");
  });
});
