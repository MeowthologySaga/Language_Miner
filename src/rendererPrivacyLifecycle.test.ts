import { describe, expect, it } from "vitest";
import { defaultSettings } from "./appSettings";
import {
  RendererPrivacyLifecycle,
  canApplySecureSettingsWrite,
  getRendererPrivacyResetPlan,
  nextSecureSettingsWriteRevision,
  privacyTargetDeletesApiKeys,
  privacyTargetDeletesLearningData,
  zeroizeRendererApiKeys
} from "./rendererPrivacyLifecycle";

describe("renderer privacy lifecycle", () => {
  it("invalidates a queued secure-settings revision before API-key deletion", () => {
    const lifecycle = new RendererPrivacyLifecycle();
    const queuedEpoch = lifecycle.captureEpoch();
    const queuedSecureRevision = 4;

    lifecycle.begin("api_keys");
    const currentSecureRevision = nextSecureSettingsWriteRevision(queuedSecureRevision);

    expect(lifecycle.canCommit(queuedEpoch)).toBe(false);
    expect(canApplySecureSettingsWrite(queuedSecureRevision, currentSecureRevision)).toBe(false);
    expect(privacyTargetDeletesApiKeys("api_keys")).toBe(true);
    expect(privacyTargetDeletesApiKeys("all_local_data")).toBe(true);
  });

  it("zeroizes both renderer API keys without mutating the old settings object", () => {
    const settings = {
      ...defaultSettings,
      geminiApiKey: "gemini-secret",
      googleTranslateApiKey: "google-secret"
    };

    const zeroized = zeroizeRendererApiKeys(settings);

    expect(zeroized).not.toBe(settings);
    expect(zeroized.geminiApiKey).toBe("");
    expect(zeroized.googleTranslateApiKey).toBe("");
    expect(settings.geminiApiKey).toBe("gemini-secret");
  });

  it("aborts Character Chat work and rejects a late response after learning-data deletion", async () => {
    const lifecycle = new RendererPrivacyLifecycle();
    const job = lifecycle.createJob();
    const committed: string[] = [];
    let resolveReply!: (value: string) => void;
    const reply = new Promise<string>((resolve) => {
      resolveReply = resolve;
    });
    const pendingCommit = reply.then((value) => {
      if (lifecycle.canCommit(job.epoch)) committed.push(value);
    });

    lifecycle.begin("learning_data");
    resolveReply("late reply");
    await pendingCommit;

    expect(job.controller.signal.aborted).toBe(true);
    expect(committed).toEqual([]);
    expect(privacyTargetDeletesLearningData("learning_data")).toBe(true);
  });

  it("allows new work only after the prior deletion finishes", () => {
    const lifecycle = new RendererPrivacyLifecycle();
    lifecycle.begin("all_local_data");
    const blockedJob = lifecycle.createJob();
    lifecycle.finish();
    const nextJob = lifecycle.createJob();

    expect(blockedJob.controller.signal.aborted).toBe(true);
    expect(lifecycle.canCommit(blockedJob.epoch)).toBe(false);
    expect(nextJob.controller.signal.aborted).toBe(false);
    expect(lifecycle.canCommit(nextJob.epoch)).toBe(true);
  });

  it("builds deterministic learning and all-local reset plans after renderer cleanup", () => {
    expect(getRendererPrivacyResetPlan("learning_data", "cleared", "complete")).toEqual({
      clearLearningState: true,
      resetApplicationState: false,
      openFreshOnboarding: false
    });
    expect(getRendererPrivacyResetPlan("all_local_data", "cleared", "pending")).toEqual({
      clearLearningState: true,
      resetApplicationState: true,
      openFreshOnboarding: false
    });
    expect(getRendererPrivacyResetPlan("all_local_data", "empty", "complete")).toEqual({
      clearLearningState: true,
      resetApplicationState: true,
      openFreshOnboarding: true
    });
  });
});
