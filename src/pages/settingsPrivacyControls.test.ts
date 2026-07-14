import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { translationResources } from "../i18n";

const settingsSource = readFileSync(join(process.cwd(), "src", "pages", "SettingsPage.tsx"), "utf8");
const privacyControlsSource = readFileSync(
  join(process.cwd(), "src", "pages", "SettingsPrivacyControls.tsx"),
  "utf8"
);
const appSource = readFileSync(join(process.cwd(), "src", "App.tsx"), "utf8");

describe("settings privacy controls", () => {
  it("requires explicit consent before enabling automatic life mining", () => {
    expect(settingsSource).toContain("updateLifeMiningCaptureConsent");
    expect(settingsSource).toContain(
      'setPendingSettingsConfirmation({ kind: "lifeMiningEnable" })'
    );
    expect(settingsSource).toContain('pending.kind === "lifeMiningEnable"');
    expect(settingsSource).toContain("applyLifeMiningCaptureEnabled(true)");
    expect(settingsSource).toContain('t("settings.confirmations.lifeMiningTitle")');
    expect(settingsSource).toContain('t("settings.capture.lifeMiningConsent")');
    expect(settingsSource).toContain('data-qa="settings-life-mining-enabled"');

    const koConsent = translationResources.ko.translation.settings.capture.lifeMiningConsent;
    const enConsent = translationResources.en.translation.settings.capture.lifeMiningConsent;
    expect(koConsent).toMatch(/내가 보낸 메시지/);
    expect(koConsent).toMatch(/주변 대화 문맥/);
    expect(koConsent).toMatch(/로컬 데이터에 저장/);
    expect(koConsent).toMatch(/사이트별 수집 권한/);
    expect(enConsent).toMatch(/messages you sent/i);
    expect(enConsent).toMatch(/surrounding conversation/i);
    expect(enConsent).toMatch(/stored in local/i);
    expect(enConsent).toMatch(/allow each site separately/i);
  });

  it("exposes bridge origin, token rotation, and revocation", () => {
    expect(settingsSource).toContain("getPairingStatus");
    expect(settingsSource).toContain('data-qa="settings-life-miner-bridge-status"');
    expect(settingsSource).toContain('data-qa="settings-life-miner-bridge-rotate"');
    expect(settingsSource).toContain('data-qa="settings-life-miner-bridge-revoke"');
  });

  it("requires a typed uninstall phrase before forgetting durable extension history", () => {
    expect(settingsSource).toContain("forgetUninstalledExtension");
    expect(settingsSource).toContain('data-qa="settings-life-miner-bridge-forget"');
    expect(settingsSource).toContain(
      'data-qa="settings-life-miner-bridge-forget-confirmation"'
    );
    expect(settingsSource).toContain('pending.kind === "bridgeForget"');
    expect(settingsSource).toContain(
      'bridgeForgetConfirmation.trim() !== t("settings.capture.bridgeForgetPhrase")'
    );
    expect(settingsSource).toContain("privacyDeletionInProgress");

    const koCapture = translationResources.ko.translation.settings.capture;
    const enCapture = translationResources.en.translation.settings.capture;
    expect(koCapture.bridgeForgetPhrase).toBe("확장 프로그램을 제거했습니다");
    expect(enCapture.bridgeForgetPhrase).toBe("I UNINSTALLED THE EXTENSION");
    expect(koCapture.bridgeForgetConfirm).toMatch(/연결 이력/);
    expect(koCapture.bridgeForgetConfirm).toMatch(/영구적으로 지웁니다/);
    expect(koCapture.bridgeForgetConfirm).toMatch(/브라우저 확장 저장소의 대기 데이터/);
    expect(koCapture.bridgeForgetConfirm).toMatch(/대기 항목 모두 삭제/);
    expect(enCapture.bridgeForgetConfirm).toMatch(/pairing history/i);
    expect(enCapture.bridgeForgetConfirm).toMatch(/remaining proof/i);
    expect(enCapture.bridgeForgetConfirm).toMatch(/cannot directly delete pending data/i);
    expect(enCapture.bridgeForgetConfirm).toMatch(/delete all pending items/i);
  });

  it("resumes an unfinished destructive verification after an app restart", () => {
    expect(privacyControlsSource).toContain("getPendingDeleteStatus");
    expect(privacyControlsSource).toContain("pending.rendererResetRequired");
    expect(privacyControlsSource).toContain("completeRendererCleanup");
    expect(privacyControlsSource).toContain("getDeleteStatus(operationId)");
    expect(privacyControlsSource).toContain("acknowledgeDeleteResult");
    expect(appSource).toContain("privacyApi.acknowledgeDeleteResult");
  });

  it("keeps the renderer privacy lifecycle active until the terminal result is acknowledged", () => {
    const acknowledgeIndex = privacyControlsSource.indexOf(
      "await activePrivacyApi.acknowledgeDeleteResult"
    );
    const finishCallbackIndex = privacyControlsSource.indexOf(
      "lifecycleCallbacksRef.current.onDeleteResult(acknowledged)"
    );
    expect(acknowledgeIndex).toBeGreaterThan(-1);
    expect(finishCallbackIndex).toBeGreaterThan(acknowledgeIndex);
  });

  it("starts the central renderer lifecycle before calling the destructive backend API", () => {
    const lifecycleStartIndex = privacyControlsSource.indexOf(
      "await lifecycleCallbacksRef.current.onDeleteStart(target)"
    );
    const backendDeleteIndex = privacyControlsSource.indexOf(
      "await privacyApi.deleteData({ target, confirmation: confirmationText })"
    );

    expect(lifecycleStartIndex).toBeGreaterThan(-1);
    expect(backendDeleteIndex).toBeGreaterThan(lifecycleStartIndex);
    expect(appSource).toContain("nextSecureSettingsWriteRevision(");
    expect(appSource).toContain("zeroizeRendererApiKeys(settings)");
    expect(appSource).toContain("invalidatedSecureSettingsQueue");
    expect(appSource).toContain("privacyDeletionInProgress={rendererPrivacyOperation !== null}");
    expect(appSource).toContain("getRendererPrivacyResetPlan(");
    expect(appSource).toContain("pendingPrivacyResumeStartedRef");
    expect(appSource).toContain("!privacyStartupCheckComplete || rendererPrivacyOperationRef.current");
    expect(appSource).toContain('setActiveTab("settings")');
  });

  it("prevents deleting the non-removable default profile before submission", () => {
    expect(settingsSource).toContain("profileId === DEFAULT_PROFILE_ID");
    expect(settingsSource).toContain("profiles.length <= 1");
    expect(settingsSource).toContain("profileDraft.id === DEFAULT_PROFILE_ID");
    expect(settingsSource).toContain("setProfileDeleteCandidate(profileDraft)");
    expect(settingsSource).toContain("profileDeleteCandidate?.id === profileDraft.id");
    expect(settingsSource).toContain('t("settings.profile.defaultCannotDelete")');
    expect(settingsSource).toContain('t("settings.profile.deleteConfirmDescription")');
    expect(settingsSource).toContain('t("settings.profile.deletePermanently")');

    const koProfile = translationResources.ko.translation.settings.profile;
    const enProfile = translationResources.en.translation.settings.profile;
    expect(koProfile.defaultCannotDelete).toMatch(/기본 프로필은 삭제할 수 없습니다/);
    expect(koProfile.deleteConfirmDescription).toMatch(/영구 삭제/);
    expect(koProfile.deleteConfirmDescription).toMatch(/되돌릴 수 없습니다/);
    expect(enProfile.defaultCannotDelete).toMatch(/default profile cannot be deleted/i);
    expect(enProfile.deleteConfirmDescription).toMatch(/permanently deletes/i);
    expect(enProfile.deleteConfirmDescription).toMatch(/cannot be undone/i);
  });
});
