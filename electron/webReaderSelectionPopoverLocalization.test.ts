import { describe, expect, it } from "vitest";
import { buildWebReaderSelectionPopoverScript } from "./webReaderSelectionPopoverScript";

describe("Web Reader selection popover localization", () => {
  it("builds a complete Korean script", () => {
    const script = buildWebReaderSelectionPopoverScript("ko");

    expect(script).not.toContain("__LEM_WEB_READER_POPOVER_COPY__");
    expect(script).toContain('"locale":"ko"');
    expect(script).toContain('"reviewSentenceCard":"문장카드 전체 확인"');
    expect(script).toContain('"keyVocabulary":"핵심 단어"');
    expect(() => new Function(script)).not.toThrow();
  });

  it("builds an English UI without Korean control labels", () => {
    const script = buildWebReaderSelectionPopoverScript("en");

    expect(script).not.toContain("__LEM_WEB_READER_POPOVER_COPY__");
    expect(script).toContain('"locale":"en"');
    expect(script).toContain('"reviewSentenceCard":"Review the full Sentence Card"');
    expect(script).toContain('"keyVocabulary":"Key vocabulary"');
    expect(script).not.toContain("문장카드 전체 확인");
    expect(script).not.toContain("핵심 단어");
    expect(script).not.toContain("다시 선택");
    expect(() => new Function(script)).not.toThrow();
  });
});
