import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
const model = process.env.OLLAMA_MODEL || "gemma4:12b";
const outputPath =
  process.env.LISTENING_CARD_QA_OUTPUT ||
  path.join(process.cwd(), ".tmp", "listening-card-local-model-qa.json");

const cases = [
  {
    id: "linking-big-moments",
    sourceSentence:
      "I've been there for all the big moments of you and Lily: the night you met, your first date, other first things.",
    selectedTerms: ["I've been there", "big moments", "first things"],
    note: "connected speech, been there nuance, repeated phrase"
  },
  {
    id: "short-request-figure-out",
    sourceSentence: "Could you give me a second? I'm trying to figure this out.",
    selectedTerms: ["give me a second", "figure this out"],
    note: "soft request plus phrasal verb"
  },
  {
    id: "reduction-slipped-my-mind",
    sourceSentence: "I was gonna tell you, but it kind of slipped my mind.",
    selectedTerms: ["gonna", "kind of", "slipped my mind"],
    note: "reduced speech and idiom"
  },
  {
    id: "head-out-packed",
    sourceSentence: "We should probably head out before it gets packed.",
    selectedTerms: ["head out", "gets packed"],
    note: "casual plan, phrasal verb, passive-like adjective"
  },
  {
    id: "didnt-go-over",
    sourceSentence: "That didn't go over the way I thought it would.",
    selectedTerms: ["go over", "the way I thought it would"],
    note: "idiomatic reception and clause compression"
  },
  {
    id: "walk-me-through",
    sourceSentence: "Can you walk me through what happened, step by step?",
    selectedTerms: ["walk me through", "step by step"],
    note: "workplace expression and rhythm"
  }
];

const allowedMarks = new Set([
  "stress-dot",
  "strong-stress-dot",
  "rising-curve",
  "falling-curve",
  "continuing-curve",
  "linking-bridge",
  "reduced"
]);

function buildPrompt() {
  return [
    "You are testing the back side of an input-listening card for a Korean native speaker learning English.",
    "Return valid JSON only. Do not wrap it in Markdown.",
    "For each case, generate a card-back QA draft.",
    "The app will show:",
    "- sourceSentence with inline highlights",
    "- tiny AI-generated stress/intonation marks above selected anchors",
    "- a section titled 뜻, not 직역",
    "- optional tips for difficult expressions.",
    "Rules:",
    "- meaningKo must be one natural Korean meaning of the full sentence.",
    "- Do not include a separate literal translation.",
    "- highlightMappings must include each selected term when possible.",
    "- highlightMappings[].naturalKo must be copied exactly from meaningKo. If the selected term is implied but no exact Korean substring exists in meaningKo, use an empty string.",
    "- listeningAnnotations[].anchorText must be an exact substring of sourceSentence.",
    "- listeningAnnotations[].mark must be exactly one of: stress-dot, strong-stress-dot, rising-curve, falling-curve, continuing-curve, linking-bridge, reduced. Never invent other values such as rhythm, pause, emphasis, or flat.",
    "- tipsKo should explain hard expressions briefly in Korean.",
    "Return this exact JSON shape:",
    JSON.stringify(
      {
        cases: [
          {
            id: "case id",
            sourceSentence: "same source sentence",
            meaningKo: "natural Korean meaning",
            highlightMappings: [
              {
                sourceText: "selected term",
                naturalKo: "exact substring in meaningKo",
                colorKey: "yellow"
              }
            ],
            listeningAnnotations: [
              {
                anchorText: "exact substring in sourceSentence",
                mark: "linking-bridge",
                labelKo: "short Korean label",
                confidence: 0.65
              }
            ],
            tipsKo: ["short Korean tip"]
          }
        ]
      },
      null,
      2
    ),
    "Test cases:",
    JSON.stringify(cases, null, 2)
  ].join("\n");
}

async function requestOllama() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 240_000);
  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        format: "json",
        messages: [
          {
            role: "system",
            content: "You are a precise language-learning QA data generator. Return JSON only."
          },
          {
            role: "user",
            content: buildPrompt()
          }
        ]
      })
    });
    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}: ${await response.text()}`);
    }
    const payload = await response.json();
    return payload.message?.content ?? payload.response ?? "";
  } finally {
    clearTimeout(timeout);
  }
}

async function repairWithOllama(result, issues) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        format: "json",
        messages: [
          {
            role: "system",
            content: "You repair JSON QA output. Return valid JSON only."
          },
          {
            role: "user",
            content: [
              "Repair this input-listening card QA JSON.",
              "Keep the same JSON shape and all case ids.",
              "Fix every issue listed below.",
              "Rules:",
              "- Every highlightMappings[].naturalKo must be an exact substring copied from meaningKo, or an empty string.",
              "- Every listeningAnnotations[].anchorText must be an exact substring copied from sourceSentence.",
              "- Every listeningAnnotations[].mark must be exactly one of: stress-dot, strong-stress-dot, rising-curve, falling-curve, continuing-curve, linking-bridge, reduced.",
              "- Do not include the label 직역 anywhere.",
              "Issues:",
              JSON.stringify(issues, null, 2),
              "Original test cases:",
              JSON.stringify(cases, null, 2),
              "JSON to repair:",
              JSON.stringify(result, null, 2)
            ].join("\n")
          }
        ]
      })
    });
    if (!response.ok) {
      throw new Error(`Ollama repair returned ${response.status}: ${await response.text()}`);
    }
    const payload = await response.json();
    return payload.message?.content ?? payload.response ?? "";
  } finally {
    clearTimeout(timeout);
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first >= 0 && last > first) {
      return JSON.parse(text.slice(first, last + 1));
    }
    throw new Error("No JSON object found in model output.");
  }
}

async function parseJsonOrSaveRaw(text, label) {
  try {
    return parseJson(text);
  } catch (error) {
    const rawPath = path.join(path.dirname(outputPath), `listening-card-local-model-qa.${label}.raw.txt`);
    await mkdir(path.dirname(rawPath), { recursive: true });
    await writeFile(rawPath, text, "utf8");
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} JSON parse failed: ${message}. raw=${rawPath}`);
  }
}

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function validateResult(result) {
  const issues = [];
  const generatedCases = Array.isArray(result.cases) ? result.cases : [];
  const byId = new Map(generatedCases.map((item) => [item?.id, item]));

  for (const testCase of cases) {
    const item = byId.get(testCase.id);
    if (!item) {
      issues.push(`${testCase.id}: missing case`);
      continue;
    }
    const meaningKo = String(item.meaningKo ?? "");
    if (meaningKo.trim().length < 8) {
      issues.push(`${testCase.id}: meaningKo is too short`);
    }
    if (/직역/.test(JSON.stringify(item))) {
      issues.push(`${testCase.id}: contains forbidden label 직역`);
    }
    for (const term of testCase.selectedTerms) {
      const found = Array.isArray(item.highlightMappings)
        ? item.highlightMappings.some((mapping) => normalize(mapping?.sourceText) === normalize(term))
        : false;
      if (!found) {
        issues.push(`${testCase.id}: missing highlight mapping for "${term}"`);
      }
    }
    for (const mapping of item.highlightMappings ?? []) {
      const anchor = String(mapping?.naturalKo ?? "");
      if (anchor && !meaningKo.includes(anchor)) {
        issues.push(`${testCase.id}: naturalKo is not in meaningKo: "${anchor}"`);
      }
    }
    for (const annotation of item.listeningAnnotations ?? []) {
      const anchor = String(annotation?.anchorText ?? "");
      if (anchor && !testCase.sourceSentence.includes(anchor)) {
        issues.push(`${testCase.id}: annotation anchor is not in sourceSentence: "${anchor}"`);
      }
      if (!allowedMarks.has(annotation?.mark)) {
        issues.push(`${testCase.id}: invalid prosody mark "${annotation?.mark}"`);
      }
    }
    if (!Array.isArray(item.tipsKo) || item.tipsKo.length === 0) {
      issues.push(`${testCase.id}: tipsKo is empty`);
    }
  }

  return issues;
}

function normalizeResultForApp(result) {
  const normalizedCases = Array.isArray(result.cases)
    ? result.cases.map((item) => {
        const sourceSentence = String(item?.sourceSentence ?? "");
        const meaningKo = String(item?.meaningKo ?? "");
        return {
          ...item,
          highlightMappings: Array.isArray(item?.highlightMappings)
            ? item.highlightMappings.map((mapping) => {
                const naturalKo = String(mapping?.naturalKo ?? "");
                return {
                  ...mapping,
                  naturalKo: naturalKo && meaningKo.includes(naturalKo) ? naturalKo : ""
                };
              })
            : [],
          listeningAnnotations: Array.isArray(item?.listeningAnnotations)
            ? item.listeningAnnotations
                .filter((annotation) => {
                  const anchor = String(annotation?.anchorText ?? "");
                  return anchor.length > 0 && sourceSentence.includes(anchor);
                })
                .map((annotation) => ({
                  ...annotation,
                  mark: allowedMarks.has(annotation?.mark)
                    ? annotation.mark
                    : mapUnknownProsodyMark(annotation?.mark)
                }))
            : []
        };
      })
    : [];
  return {
    ...result,
    cases: normalizedCases
  };
}

function mapUnknownProsodyMark(mark) {
  const normalized = normalize(mark);
  if (normalized.includes("rhythm") || normalized.includes("pause")) {
    return "continuing-curve";
  }
  if (normalized.includes("link")) {
    return "linking-bridge";
  }
  if (normalized.includes("reduce")) {
    return "reduced";
  }
  if (normalized.includes("fall")) {
    return "falling-curve";
  }
  if (normalized.includes("rise")) {
    return "rising-curve";
  }
  return "stress-dot";
}

function summarize(result, issues) {
  const generatedCases = Array.isArray(result.cases) ? result.cases : [];
  console.log(`model=${model}`);
  console.log(`baseUrl=${baseUrl}`);
  console.log(`cases=${generatedCases.length}/${cases.length}`);
  console.log(`issues=${issues.length}`);
  if (issues.length) {
    for (const issue of issues) {
      console.log(`- ${issue}`);
    }
  }
  console.log("");
  for (const item of generatedCases) {
    console.log(`# ${item.id}`);
    console.log(`뜻: ${item.meaningKo}`);
    const mappings = (item.highlightMappings ?? [])
      .map((mapping) => `${mapping.sourceText} => ${mapping.naturalKo || "(no anchor)"}`)
      .join(" | ");
    console.log(`형광펜: ${mappings}`);
    const marks = (item.listeningAnnotations ?? [])
      .map((annotation) => `${annotation.anchorText}:${annotation.mark}`)
      .join(" | ");
    console.log(`강세/억양: ${marks}`);
    console.log(`팁: ${(item.tipsKo ?? []).join(" / ")}`);
    console.log("");
  }
}

async function main() {
  const raw = await requestOllama();
  let result = await parseJsonOrSaveRaw(raw, "initial");
  let issues = validateResult(result);
  const rawIssues = [...issues];
  let repaired = false;
  let repairMode = "";
  if (issues.length) {
    result = normalizeResultForApp(result);
    issues = validateResult(result);
    repaired = true;
    repairMode = "local-normalization";
  }
  if (issues.length && process.env.LISTENING_CARD_QA_LLM_REPAIR === "1") {
    const repairRaw = await repairWithOllama(result, issues);
    result = await parseJsonOrSaveRaw(repairRaw, "repair");
    issues = validateResult(result);
    repaired = true;
    repairMode = "llm-repair";
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        model,
        baseUrl,
        testCases: cases,
        repaired,
        repairMode,
        rawIssues,
        result,
        issues
      },
      null,
      2
    ),
    "utf8"
  );
  if (repaired) {
    console.log(`repair=${repairMode}`);
    console.log(`rawIssues=${rawIssues.length}`);
    for (const issue of rawIssues) {
      console.log(`raw - ${issue}`);
    }
  }
  summarize(result, issues);
  console.log(`saved=${outputPath}`);
  if (issues.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
