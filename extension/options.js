import "./src/shared/i18n.js";

const { localizeDocument, t } = globalThis.LanguageMinerExtensionI18n;
const statusElement = document.querySelector("#queue-status");
const resultElement = document.querySelector("#result");
const refreshButton = document.querySelector("#refresh");
const clearButton = document.querySelector("#clear");
const clearDialog = document.querySelector("#clear-dialog");

localizeDocument(document);
document.title = t("optionsTitle", "Language Miner Web Capture settings");

refreshButton.addEventListener("click", () => void refresh());
clearButton.addEventListener("click", () => {
  clearDialog.returnValue = "cancel";
  clearDialog.showModal();
});
clearDialog.addEventListener("close", () => {
  if (clearDialog.returnValue !== "confirm") return;
  clearPendingQueues();
});

function clearPendingQueues() {
  setBusy(true);
  chrome.runtime.sendMessage({ type: "LEM_CLEAR_PENDING_QUEUES" }, (response) => {
    setBusy(false);
    resultElement.textContent = response?.ok
      ? response.appAcknowledged
        ? t(
            "optionsClearedAcknowledged",
            "Pending items were deleted, and the app confirmed the deletion."
          )
        : t(
            "optionsClearedPendingAcknowledgement",
            "Pending items were deleted. App confirmation is still pending."
          )
      : response?.error || t("optionsClearFailed", "Could not delete pending items.");
    void refresh();
  });
}

function refresh() {
  setBusy(true);
  chrome.runtime.sendMessage({ type: "LEM_GET_QUEUE_STATUS" }, (response) => {
    setBusy(false);
    if (!response?.ok) {
      statusElement.textContent =
        response?.error || t("optionsReadFailed", "Could not read pending-item status.");
      return;
    }
    statusElement.textContent = t("optionsQueueSummary", "Pending: $1 · $2", [
      String(response.totalCount),
      formatBytes(response.totalBytes)
    ]);
    clearButton.disabled = response.totalCount === 0;
  });
}

function setBusy(busy) {
  refreshButton.disabled = busy;
  clearButton.disabled = busy;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

void refresh();
