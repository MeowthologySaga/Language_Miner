import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import "../i18n";
import { defaultSettings } from "../appSettings";
import type { LocalEnglishMinerApi } from "../data/api";
import type { LLMProvider } from "../services/llm/types";
import type { LifeLog } from "../shared/types";
import { LifeMiningPage } from "./LifeMiningPage";

describe("LifeMiningPage candidate mounting", () => {
  it("does not mount thousands of candidate cards at once", () => {
    const html = renderLifeMiningPage(createLifeLogs(4_000));
    const mountedCandidates = html.match(/data-life-log-item="true"/g) ?? [];

    expect(mountedCandidates.length).toBeGreaterThan(0);
    expect(mountedCandidates.length).toBeLessThan(30);
    expect(html).toContain('aria-setsize="4000"');
    expect(html).toContain("life-log-list-virtual-spacer");
    expect(html).toContain('role="list"');
    expect(html).toContain('role="listitem"');
  });

  it("keeps every candidate mounted for a small list", () => {
    const html = renderLifeMiningPage(createLifeLogs(5));
    const mountedCandidates = html.match(/data-life-log-item="true"/g) ?? [];

    expect(mountedCandidates).toHaveLength(5);
    expect(html).not.toContain("life-log-list-virtual-spacer");
  });

  it("does not echo a malformed timestamp that contains a local path", () => {
    const privatePath = "C:\\Users\\Alice\\private-log.txt";
    const [lifeLog] = createLifeLogs(1);
    const html = renderLifeMiningPage([{ ...lifeLog, createdAt: privatePath }]);

    expect(html).not.toContain(privatePath);
  });
});

function renderLifeMiningPage(lifeLogs: LifeLog[]) {
  return renderToStaticMarkup(
    <LifeMiningPage
      api={{} as LocalEnglishMinerApi}
      lifeLogs={lifeLogs}
      provider={{ name: "mock" } as LLMProvider}
      settings={defaultSettings}
      onCardsChanged={async () => undefined}
      onLifeLogsChanged={async () => undefined}
    />
  );
}

function createLifeLogs(count: number): LifeLog[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `life-log-${index}`,
    text: `Candidate sentence ${index}`,
    sourceType: index % 2 === 0 ? "manual" : "browser_extension",
    processed: false,
    createdAt: "2026-07-13T00:00:00.000Z"
  }));
}
