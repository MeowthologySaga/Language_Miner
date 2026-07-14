export const WEB_READER_PRACTICE_PROTOCOL = "lem-practice";
export const WEB_READER_PRACTICE_URL = `${WEB_READER_PRACTICE_PROTOCOL}://reader/getting-started`;

export type WebReaderPracticeLocale = "ko" | "en";

export function isWebReaderPracticeUrl(value: unknown) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value.trim());
    return (
      !url.username &&
      !url.password &&
      url.protocol === `${WEB_READER_PRACTICE_PROTOCOL}:` &&
      url.hostname === "reader" &&
      url.pathname === "/getting-started" &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export function renderWebReaderPracticeHtml(locale: WebReaderPracticeLocale) {
  const copy =
    locale === "en"
      ? {
          eyebrow: "Language Miner · Practice text",
          title: "One useful sentence from a real situation",
          lead: "My train was delayed, so I sent a quick message:",
          after: "Please start without me.",
          instruction:
            "Select “running a little late,” choose Sentence card, review the preview, and save it as a Reading Card.",
          privacy: "This practice page is built into the app and does not contact an external website."
        }
      : {
          eyebrow: "Language Miner · 연습 글",
          title: "실제 상황에서 건진 한 문장",
          lead: "기차가 늦어져서 짧은 메시지를 보냈습니다.",
          after: "먼저 시작해 주세요.",
          instruction:
            "‘running a little late’를 선택하고 문장카드를 누른 뒤, 미리보기를 확인해 읽기 카드로 저장하세요.",
          privacy: "이 연습 글은 앱에 내장되어 있으며 외부 웹사이트에 접속하지 않습니다."
        };

  return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Language Miner Practice</title>
  <style>
    :root { color-scheme: light; font-family: Inter, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f4f7fb; color: #172033; font-size: 18px; line-height: 1.72; }
    main { max-width: 780px; margin: 64px auto; padding: 42px; border: 1px solid #d8e3ef; border-radius: 20px; background: #fff; box-shadow: 0 18px 48px rgba(15, 23, 42, .10); }
    .eyebrow { color: #2563eb; font-size: 13px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    h1 { margin: .35rem 0 1rem; font-size: clamp(28px, 4vw, 38px); line-height: 1.18; }
    p { margin: 0 0 1.1rem; }
    .practice { margin: 1.4rem 0; padding: 20px 22px; border-radius: 16px; background: #eff6ff; color: #0f172a; font-size: clamp(22px, 3vw, 27px); font-weight: 750; }
    .target { text-decoration: underline 4px #60a5fa; text-underline-offset: 5px; }
    .instruction { border-left: 4px solid #22c55e; padding-left: 16px; color: #334155; }
    .privacy { color: #64748b; font-size: 14px; }
    @media (max-width: 720px) { main { margin: 20px; padding: 26px; } }
  </style>
</head>
<body>
  <main>
    <span class="eyebrow">${copy.eyebrow}</span>
    <h1>${copy.title}</h1>
    <p>${copy.lead}</p>
    <p class="practice" lang="en">I’m <span class="target">running a little late</span>. Please start without me.</p>
    <p>${copy.after}</p>
    <p class="instruction">${copy.instruction}</p>
    <p class="privacy">${copy.privacy}</p>
  </main>
</body>
</html>`;
}
