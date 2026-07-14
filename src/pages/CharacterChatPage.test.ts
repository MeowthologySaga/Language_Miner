import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src", "pages", "CharacterChatPage.tsx"),
  "utf8"
);

describe("Character Chat accessible confirmation boundaries", () => {
  it("uses the shared accessible Dialog instead of browser prompt and confirm", () => {
    expect(source).toContain('import { Dialog } from "../components/Dialog"');
    expect(source).not.toContain("window.confirm(");
    expect(source).not.toContain("window.prompt(");

    [
      "character-import-security-dialog",
      "character-export-pack-dialog",
      "character-remote-image-dialog",
      "character-delete-dialog",
      "character-reset-dialog",
      "character-external-transfer-dialog"
    ].forEach((dataQa) => expect(source).toContain(`data-qa="${dataQa}"`));

    expect(source.match(/ariaLabelledBy=/g)?.length).toBeGreaterThanOrEqual(6);
    expect(source.match(/ariaDescribedBy=/g)?.length).toBeGreaterThanOrEqual(6);
    expect(source).toContain("initialFocusRef={dialogCancelButtonRef}");
  });

  it("keeps unverified character cards outside every chat execution path", () => {
    expect(source).toContain("const selectedPresetRunnable = isRunnableCharacterPreset(selectedPreset)");
    expect(source).toContain("if (!isRunnableCharacterPreset(nextPreset))");
    expect(source).toContain("if (!isRunnableCharacterPreset(selectedPreset))");
    expect(source).toContain("!isRunnableCharacterPreset(selectedPreset))");
    expect(source).toContain("disabled={!selectedPresetRunnable}");
    expect(source).toContain('setCharacterView("manage")');
  });

  it("requires an explicit security review before import and inline-validates pack metadata", () => {
    const inspectionIndex = source.indexOf("await inspectCharacterPackJson(rawJson)");
    const pendingReviewIndex = source.indexOf("setPendingImport({ inspected, localizedWarnings, sha256 })");
    const importCommitIndex = source.indexOf("function confirmPendingImport()");

    expect(inspectionIndex).toBeGreaterThan(-1);
    expect(pendingReviewIndex).toBeGreaterThan(inspectionIndex);
    expect(importCommitIndex).toBeGreaterThan(pendingReviewIndex);
    expect(source).toContain("validateCharacterPackExportDraft(exportDraft, t)");
    expect(source).toContain('aria-invalid={Boolean(exportErrors.creator)}');
    expect(source).toContain("isValidCharacterPackSourceUrl");
    expect(source).toContain("isValidCharacterPackExportSemver");
  });

  it("keeps external transfer review and request cancellation in the chat flow", () => {
    expect(source).toContain("buildCharacterExternalPreflight(content, previousMessages, ragHints)");
    expect(source).toContain("setPendingExternalRequest({");
    expect(source).toContain("continuePendingExternalRequest");
    expect(source).toContain("requestAbortRef.current?.abort()");
    expect(source).toContain('t("characterChat.externalConfirm.payload")');
    expect(source).toContain('t("characterChat.externalConfirm.guardWarning")');
  });

  it("aborts on unmount and refuses late chat or native-capture commits after privacy deletion", () => {
    expect(source).toContain('import { rendererPrivacyLifecycle } from "../rendererPrivacyLifecycle"');
    expect(source).toContain("requestAbortRef.current?.abort()");
    expect(source).toContain("const requestJob = rendererPrivacyLifecycle.createJob()");
    expect(source).toContain("rendererPrivacyLifecycle.canCommit(requestJob.epoch)");
    expect(source).toContain("rendererPrivacyLifecycle.canCommit(requestEpoch)");
    expect(source).toContain("requestJob.release()");
  });

  it("announces chat state and exposes selected modes to keyboard and screen-reader users", () => {
    expect(source).toContain('role="log"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('aria-pressed={chatMode === "native_capture"}');
    expect(source).toContain('aria-pressed={chatMode === "target_practice"}');
    expect(source).toContain('aria-label={t("characterChat.chat.messageInput")}');
    expect(source).toContain('role={captureStatus.startsWith(t("characterChat.messages.captureFailed"))');
  });
});
