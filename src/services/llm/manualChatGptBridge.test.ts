import { describe, expect, it } from "vitest";
import {
  MANUAL_CHATGPT_MAX_PROMPT_BYTES,
  MANUAL_CHATGPT_MAX_RESPONSE_BYTES,
  buildManualChatGptPrompt,
  parseManualChatGptResponse,
  type ManualChatGptBridgeRequest
} from "./manualChatGptBridge";

const readingRequest: ManualChatGptBridgeRequest = {
  requestId: "request-reading-1",
  task: "reading_card",
  systemPrompt: "Create a precise reading card.",
  userPrompt: "Explain the selected expression.",
  sourceSentence: "I ran into an old friend yesterday."
};

const lifeRequest: ManualChatGptBridgeRequest = {
  requestId: "request-life-1",
  task: "life_expression_card",
  systemPrompt: "Create a natural output card.",
  userPrompt: "Turn the captured reply into natural English.",
  sourceSentence: "나 조금 늦을 것 같아."
};

type TestEnvelope = {
  schemaVersion: number;
  kind: string;
  requestId: string;
  task: string;
  card: Record<string, unknown>;
};

describe("manual ChatGPT bridge prompt", () => {
  it("builds one bounded prompt with exact response metadata and source text", () => {
    const prompt = buildManualChatGptPrompt(readingRequest);

    expect(prompt).toContain('"kind": "language-miner.card-response"');
    expect(prompt).toContain('"requestId": "request-reading-1"');
    expect(prompt).toContain('"task": "reading_card"');
    expect(prompt).toContain(JSON.stringify(readingRequest.sourceSentence));
    expect(prompt).toContain(readingRequest.systemPrompt);
    expect(prompt).toContain(readingRequest.userPrompt);
  });

  it("rejects a prompt larger than 64 KiB", () => {
    expect(() =>
      buildManualChatGptPrompt({
        ...readingRequest,
        systemPrompt: "x".repeat(MANUAL_CHATGPT_MAX_PROMPT_BYTES)
      })
    ).toThrow(/65536-byte limit/);
  });
});

describe("manual ChatGPT bridge response parser", () => {
  it("parses a normal reading-card envelope into a safe new card", () => {
    const raw = JSON.stringify(createReadingEnvelope());
    const result = parseManualChatGptResponse(raw, readingRequest);

    expect(result).toMatchObject({
      schemaVersion: 1,
      kind: "language-miner.card-response",
      requestId: readingRequest.requestId,
      task: "reading_card",
      card: {
        cardType: "reading",
        deckType: "input",
        direction: "target_to_native",
        sourceSentence: readingRequest.sourceSentence,
        frontText: readingRequest.sourceSentence
      }
    });
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(result.card)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(result.card.vocabularyItems[0])).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(result.card, "id")).toBe(false);
  });

  it("parses a normal life-expression envelope including validated answer candidates", () => {
    const result = parseManualChatGptResponse(
      JSON.stringify(createLifeEnvelope()),
      lifeRequest
    );

    expect(result.card).toMatchObject({
      cardType: "life_expression",
      deckType: "output",
      direction: "native_to_target",
      sourceSentence: lifeRequest.sourceSentence,
      targetText: "I think I'll be a little late.",
      answerCandidates: [
        {
          text: "I think I'll be a little late.",
          kind: "recommended",
          register: "best"
        }
      ]
    });
  });

  it("accepts exactly one outer lowercase json fence", () => {
    const raw = `\n\`\`\`json\n${JSON.stringify(createReadingEnvelope())}\n\`\`\`\n`;
    expect(parseManualChatGptResponse(raw, readingRequest).card.cardType).toBe("reading");

    expect(() =>
      parseManualChatGptResponse(`\`\`\`JSON\n${JSON.stringify(createReadingEnvelope())}\n\`\`\``, readingRequest)
    ).toThrow(/outer ```json fence/);
  });

  it("rejects malformed JSON and trailing commentary", () => {
    expect(() => parseManualChatGptResponse("{not-json}", readingRequest)).toThrow(
      /not one valid JSON object/
    );
    expect(() =>
      parseManualChatGptResponse(`${JSON.stringify(createReadingEnvelope())}\nDone!`, readingRequest)
    ).toThrow(/not one valid JSON object/);
  });

  it("rejects a response larger than 256 KiB before parsing", () => {
    expect(() =>
      parseManualChatGptResponse(
        "x".repeat(MANUAL_CHATGPT_MAX_RESPONSE_BYTES + 1),
        readingRequest
      )
    ).toThrow(/262144-byte limit/);
  });

  it.each([
    ["schema version", { schemaVersion: 2 }, /schemaVersion must be 1/],
    ["kind", { kind: "other" }, /response.kind/],
    ["request id", { requestId: "wrong" }, /requestId does not match/],
    ["task", { task: "life_expression_card" }, /task does not match/]
  ])("rejects a mismatched %s", (_label, change, message) => {
    const envelope = { ...createReadingEnvelope(), ...change };
    expect(() => parseManualChatGptResponse(JSON.stringify(envelope), readingRequest)).toThrow(message);
  });

  it.each([
    ["cardType", { cardType: "life_expression" }, /cardType must be reading/],
    ["deckType", { deckType: "output" }, /deckType must be input/],
    ["direction", { direction: "native_to_target" }, /direction must be target_to_native/],
    ["sourceSentence", { sourceSentence: "changed" }, /must exactly match/]
  ])("rejects mismatched card %s", (_label, change, message) => {
    const envelope = createReadingEnvelope();
    envelope.card = { ...envelope.card, ...change };
    expect(() => parseManualChatGptResponse(JSON.stringify(envelope), readingRequest)).toThrow(message);
  });

  it.each(["id", "profileId", "srs", "createdAt", "updatedAt", "syncMetadata", "ttsAudio", "listeningMedia"])(
    "rejects the app-controlled card field %s",
    (field) => {
      const envelope = createReadingEnvelope();
      envelope.card = { ...envelope.card, [field]: "attacker-controlled" };
      expect(() => parseManualChatGptResponse(JSON.stringify(envelope), readingRequest)).toThrow(
        /controlled by the app/
      );
    }
  );

  it("rejects unknown envelope and card fields", () => {
    expect(() =>
      parseManualChatGptResponse(
        JSON.stringify({ ...createReadingEnvelope(), extra: true }),
        readingRequest
      )
    ).toThrow(/response contains an unknown field/);

    const envelope = createReadingEnvelope();
    envelope.card = { ...envelope.card, html: "<script>alert(1)</script>" };
    expect(() => parseManualChatGptResponse(JSON.stringify(envelope), readingRequest)).toThrow(
      /unknown field: html/
    );
  });

  it.each(["__proto__", "prototype", "constructor"])(
    "rejects recursive prototype-pollution key %s",
    (key) => {
      const validCard = JSON.stringify(createReadingEnvelope().card).slice(1, -1);
      const raw = `{"schemaVersion":1,"kind":"language-miner.card-response","requestId":"${readingRequest.requestId}","task":"reading_card","card":{${JSON.stringify(key)}:{"polluted":true},${validCard}}}`;

      expect(() => parseManualChatGptResponse(raw, readingRequest)).toThrow(/forbidden key/);
      expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    }
  );

  it("enforces array-length and depth limits", () => {
    const tooManyTags = createReadingEnvelope();
    tooManyTags.card = {
      ...tooManyTags.card,
      tags: Array.from({ length: 65 }, (_, index) => `tag-${index}`)
    };
    expect(() => parseManualChatGptResponse(JSON.stringify(tooManyTags), readingRequest)).toThrow(
      /at most 64 items/
    );

    let nested: unknown = "leaf";
    for (let index = 0; index < 18; index += 1) nested = { value: nested };
    const raw = JSON.stringify({ ...createReadingEnvelope(), nested });
    expect(() => parseManualChatGptResponse(raw, readingRequest)).toThrow(/depth 16|unknown field/);
  });

  it("enforces the total JSON node limit", () => {
    const manyNodes = Array.from({ length: 64 }, () =>
      Array.from({ length: 64 }, () => [1, 2, 3])
    );
    const raw = JSON.stringify({ ...createReadingEnvelope(), manyNodes });

    expect(() => parseManualChatGptResponse(raw, readingRequest)).toThrow(/exceeds 10000 nodes/);
  });
});

function createReadingEnvelope(): TestEnvelope {
  return {
    schemaVersion: 1,
    kind: "language-miner.card-response",
    requestId: readingRequest.requestId,
    task: "reading_card",
    card: {
      cardType: "reading",
      deckType: "input",
      direction: "target_to_native",
      sourceSentence: readingRequest.sourceSentence,
      frontText: readingRequest.sourceSentence,
      literalTranslationKo: "나는 어제 오랜 친구와 마주쳤다.",
      naturalTranslationKo: "어제 우연히 오랜 친구를 만났다.",
      highlightMappings: [
        {
          sourceText: "ran into",
          literalKo: "마주쳤다",
          naturalKo: "우연히 만났다",
          colorKey: "red"
        }
      ],
      vocabularyItems: [
        {
          term: "run into",
          ipa: "/rʌn ˈɪntuː/",
          partOfSpeech: "phrasal verb",
          basicMeaningKo: "우연히 만나다",
          meaningInContextKo: "예상하지 못한 사람을 만나다",
          usagePatterns: ["Collocation: run into an old friend"],
          colorKey: "red",
          examples: ["I ran into Sam downtown."],
          exampleTranslationsKo: ["나는 시내에서 샘을 우연히 만났다."]
        }
      ],
      structureNote: "",
      confusingComparisons: [],
      pumpPrompts: []
    }
  };
}

function createLifeEnvelope(): TestEnvelope {
  return {
    schemaVersion: 1,
    kind: "language-miner.card-response",
    requestId: lifeRequest.requestId,
    task: "life_expression_card",
    card: {
      cardType: "life_expression",
      deckType: "output",
      direction: "native_to_target",
      sourceSentence: lifeRequest.sourceSentence,
      targetText: "I think I'll be a little late.",
      frontText: `원문\nMe: ${lifeRequest.sourceSentence}`,
      literalTranslationKo: "영어 대화\nMe: I think I'll be a little late.",
      naturalTranslationKo: "내 답변 변형\n짧게: I'll be a little late.",
      answerCandidates: [
        {
          text: "I think I'll be a little late.",
          kind: "recommended",
          register: "best",
          noteKo: "가장 자연스러운 기본 답변"
        }
      ],
      highlightMappings: [],
      vocabularyItems: [],
      structureNote: "",
      confusingComparisons: [],
      pumpPrompts: [
        {
          type: "ko_to_en",
          promptKo: lifeRequest.sourceSentence,
          requiredTerms: ["a little late"]
        }
      ],
      tags: ["주제:일상"]
    }
  };
}
