import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(
  path.resolve(__dirname, "ManualChatGptBridgeDialog.tsx"),
  "utf8"
);

describe("ManualChatGptBridgeDialog boundaries", () => {
  it("uses the shared accessible Dialog and never reads the clipboard", () => {
    expect(source).toContain("<Dialog");
    expect(source).toContain('closeOnBackdrop={false}');
    expect(source).toContain("navigator.clipboard.writeText(request.prompt)");
    expect(source).not.toContain("navigator.clipboard.read");
  });

  it("opens only the fixed ChatGPT home page without putting the prompt in the URL", () => {
    expect(source).toContain('window.open("https://chatgpt.com/"');
    expect(source).not.toMatch(/chatgpt\.com[^\n]*request\.prompt/);
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });

  it("keeps invalid pasted output visible for correction", () => {
    const submitStart = source.indexOf("function submitResponse()");
    const submitEnd = source.indexOf("return (", submitStart);
    const submitSource = source.slice(submitStart, submitEnd);
    expect(submitSource).toContain("const validationError = onSubmit(response)");
    expect(submitSource).toContain("setError(validationError)");
    expect(submitSource).not.toContain("setResponse");
  });
});
