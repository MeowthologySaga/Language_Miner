import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "extension", "src", "background.js"),
  "utf8"
);

function functionBody(name: string, nextName: string) {
  const start = source.indexOf(`async function ${name}`);
  const end = source.indexOf(`function ${nextName}`, start + 1);
  expect(start, name).toBeGreaterThanOrEqual(0);
  expect(end, nextName).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("extension privacy queue barrier integration", () => {
  it("activates and clears under the queue mutation lock before acknowledging", () => {
    const handler = functionBody(
      "handleExtensionQueueClearCommand",
      "activatePrivacyQueueBarrierAndClearQueues"
    );
    expect(handler.indexOf("activatePrivacyQueueBarrierAndClearQueues")).toBeLessThan(
      handler.indexOf("postJson(PRIVACY_QUEUE_ACK_BRIDGE_URL")
    );
    expect(handler.indexOf("postJson(PRIVACY_QUEUE_ACK_BRIDGE_URL")).toBeLessThan(
      handler.indexOf("acknowledgeAndScrubPrivacyQueueBarrier")
    );

    const activation = functionBody(
      "activatePrivacyQueueBarrierAndClearQueues",
      "acknowledgeAndScrubPrivacyQueueBarrier"
    );
    expect(activation).toContain("return runQueueMutation(async () =>");
    expect(activation).toContain("runPrivacySettingsMutation(async () =>");
    expect(activation.indexOf("privacyQueueBarrierState = activated")).toBeLessThan(
      activation.indexOf("chrome.storage.local.remove(QUEUE_KEYS)")
    );
  });

  it("checks the barrier epoch inside enqueue and flush mutations", () => {
    const enqueue = functionBody("enqueuePayload", "readQueueUnlocked");
    expect(enqueue.indexOf("isPrivacyQueueWriteStillAllowed")).toBeLessThan(
      enqueue.indexOf("readQueueUnlocked")
    );

    const flush = functionBody("flushPayloadQueue", "postTranslate");
    expect(flush).toContain("return runQueueMutation(async () =>");
    expect(flush.indexOf("isPrivacyQueueWriteStillAllowed")).toBeLessThan(
      flush.indexOf("readQueueUnlocked")
    );
  });

  it("keeps capture settings disabled and polls for an operation-bound release proof", () => {
    const acknowledgement = functionBody(
      "acknowledgeAndScrubPrivacyQueueBarrier",
      "getPrivacyQueueBarrierState"
    );
    expect(acknowledgement).toContain("createPrivacyDisabledBridgeSettings");

    const settings = functionBody(
      "getBridgeSettings",
      "getPrivacyBlockedBridgeSettings"
    );
    expect(settings).toContain("extensionQueueBarrierReleaseRequestId");
    expect(settings).toContain("releasePrivacyQueueBarrierFromAuthenticatedSettings");
    expect(settings).toContain("retryPendingPrivacyQueueBarrierReleaseAcknowledgement");
    expect(settings).toContain("handleExtensionQueueClearCommand");
    expect(settings.indexOf("releasePrivacyQueueBarrierFromAuthenticatedSettings")).toBeLessThan(
      settings.indexOf("handleExtensionQueueClearCommand")
    );
    expect(settings).not.toContain("hashPrivacyBridgeToken");
    expect(settings).not.toContain("probePrivacyQueueBarrierRelease");

    const release = functionBody(
      "releasePrivacyQueueBarrierFromAuthenticatedSettings",
      "clearRecentCaptureMemory"
    );
    expect(release).toContain("releasePrivacyQueueBarrierAndPersistAcknowledgement");
    expect(release).toContain("PRIVACY_QUEUE_RELEASE_ACK_STORAGE_KEY");

    const releaseAcknowledgement = functionBody(
      "retryPendingPrivacyQueueBarrierReleaseAcknowledgement",
      "clearPendingPrivacyQueueBarrierReleaseAcknowledgement"
    );
    expect(releaseAcknowledgement).toContain("PRIVACY_QUEUE_RELEASE_ACK_BRIDGE_URL");
    expect(releaseAcknowledgement).toContain("postJson");

    const pairing = functionBody("pairBridgeOnce", "requestBridgePairingToken");
    expect(pairing).toContain("privacyBarrier.active");
    expect(pairing).toContain("createPrivacyDisabledBridgeSettings");
    expect(pairing).not.toContain("privacyBarrier.acknowledged");
  });
});
