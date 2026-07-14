import type { AppSettings } from "./shared/types";
import type {
  PrivacyDataDeletePhase,
  PrivacyDataDeleteTarget,
  PrivacyDataOperationStatus
} from "./shared/privacyData";

export type RendererPrivacyJob = {
  controller: AbortController;
  epoch: number;
  release: () => void;
};

export class RendererPrivacyLifecycle {
  private epoch = 0;
  private blockedTarget: PrivacyDataDeleteTarget | null = null;
  private readonly controllers = new Set<AbortController>();

  begin(target: PrivacyDataDeleteTarget) {
    this.epoch += 1;
    this.blockedTarget = target;
    for (const controller of this.controllers) {
      controller.abort();
    }
    this.controllers.clear();
    return this.epoch;
  }

  finish() {
    this.blockedTarget = null;
  }

  captureEpoch() {
    return this.epoch;
  }

  isBlocked() {
    return this.blockedTarget !== null;
  }

  canCommit(epoch: number) {
    return !this.isBlocked() && epoch === this.epoch;
  }

  createJob(): RendererPrivacyJob {
    const controller = new AbortController();
    const epoch = this.isBlocked() ? -1 : this.epoch;
    if (this.isBlocked()) {
      controller.abort();
    } else {
      this.controllers.add(controller);
    }
    return {
      controller,
      epoch,
      release: () => this.controllers.delete(controller)
    };
  }
}

export const rendererPrivacyLifecycle = new RendererPrivacyLifecycle();

export function privacyTargetDeletesApiKeys(target: PrivacyDataDeleteTarget) {
  return target === "api_keys" || target === "all_local_data";
}

export function privacyTargetDeletesLearningData(target: PrivacyDataDeleteTarget) {
  return target === "learning_data" || target === "all_local_data";
}

export function zeroizeRendererApiKeys(settings: AppSettings): AppSettings {
  if (!settings.geminiApiKey && !settings.googleTranslateApiKey) {
    return settings;
  }
  return {
    ...settings,
    geminiApiKey: "",
    googleTranslateApiKey: ""
  };
}

export function nextSecureSettingsWriteRevision(currentRevision: number) {
  return currentRevision + 1;
}

export function canApplySecureSettingsWrite(
  queuedRevision: number,
  currentRevision: number
) {
  return queuedRevision === currentRevision;
}

export function getRendererPrivacyResetPlan(
  target: PrivacyDataDeleteTarget,
  rendererStorageStatus: PrivacyDataOperationStatus,
  phase: PrivacyDataDeletePhase
) {
  const rendererCleanupSucceeded =
    rendererStorageStatus === "cleared" || rendererStorageStatus === "empty";
  const clearLearningState =
    rendererCleanupSucceeded && privacyTargetDeletesLearningData(target);
  const resetApplicationState = rendererCleanupSucceeded && target === "all_local_data";
  return {
    clearLearningState,
    resetApplicationState,
    openFreshOnboarding: resetApplicationState && phase !== "pending"
  };
}
