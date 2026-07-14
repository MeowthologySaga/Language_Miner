import { Copy, ExternalLink, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "./Dialog";
import "../styles/manualChatGptBridge.css";

export type ManualChatGptDialogRequest = {
  requestId: string;
  task: "reading_card" | "life_expression_card" | "character_reply";
  prompt: string;
  responseFormat: "card_json" | "text";
};

type ManualChatGptBridgeDialogProps = {
  request: ManualChatGptDialogRequest;
  onCancel: () => void;
  onSubmit: (response: string) => string | null;
};

export function ManualChatGptBridgeDialog({
  request,
  onCancel,
  onSubmit
}: ManualChatGptBridgeDialogProps) {
  const { t } = useTranslation();
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [response, setResponse] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setResponse("");
    setStatus("");
    setError("");
  }, [request.requestId]);

  async function copyPrompt() {
    setError("");
    try {
      await navigator.clipboard.writeText(request.prompt);
      setStatus(t("manualChatGptBridge.promptCopied"));
    } catch {
      promptRef.current?.focus();
      promptRef.current?.select();
      setStatus(t("manualChatGptBridge.copyFallback"));
    }
  }

  async function openChatGpt() {
    setError("");
    try {
      if (window.localEnglishMiner?.app?.openChatGpt) {
        const opened = await window.localEnglishMiner.app.openChatGpt();
        if (!opened) throw new Error("open_failed");
      } else {
        window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
      }
    } catch {
      setError(t("manualChatGptBridge.openFailed"));
    }
  }

  function submitResponse() {
    setError("");
    const validationError = onSubmit(response);
    if (validationError) {
      setError(validationError);
    }
  }

  return (
    <Dialog
      ariaDescribedBy="manual-chatgpt-description manual-chatgpt-privacy"
      ariaLabelledBy="manual-chatgpt-title"
      backdropClassName="manual-chatgpt-backdrop"
      className="manual-chatgpt-dialog"
      closeOnBackdrop={false}
      data-qa="manual-chatgpt-bridge-dialog"
      initialFocusRef={copyButtonRef}
      onClose={onCancel}
    >
      <header className="manual-chatgpt-heading">
        <span aria-hidden="true"><ShieldCheck size={22} /></span>
        <div>
          <small>{t("manualChatGptBridge.eyebrow")}</small>
          <h2 id="manual-chatgpt-title">{t("manualChatGptBridge.title")}</h2>
        </div>
      </header>

      <p id="manual-chatgpt-description">{t("manualChatGptBridge.description")}</p>
      <p className="manual-chatgpt-privacy" id="manual-chatgpt-privacy" role="note">
        {t("manualChatGptBridge.privacyNotice")}
      </p>

      <section className="manual-chatgpt-step" aria-labelledby="manual-chatgpt-prompt-label">
        <div className="manual-chatgpt-step-heading">
          <span>1</span>
          <h3 id="manual-chatgpt-prompt-label">{t("manualChatGptBridge.promptLabel")}</h3>
        </div>
        <textarea
          ref={promptRef}
          aria-label={t("manualChatGptBridge.promptLabel")}
          className="manual-chatgpt-prompt"
          readOnly
          spellCheck={false}
          value={request.prompt}
        />
        <div className="manual-chatgpt-actions split">
          <button ref={copyButtonRef} className="button primary" type="button" onClick={() => void copyPrompt()}>
            <Copy size={17} />
            {t("manualChatGptBridge.copyWithConsent")}
          </button>
          <button className="button secondary" type="button" onClick={() => void openChatGpt()}>
            <ExternalLink size={17} />
            {t("manualChatGptBridge.openChatGpt")}
          </button>
        </div>
      </section>

      <section className="manual-chatgpt-step" aria-labelledby="manual-chatgpt-response-label">
        <div className="manual-chatgpt-step-heading">
          <span>2</span>
          <h3 id="manual-chatgpt-response-label">
            {request.responseFormat === "card_json"
              ? t("manualChatGptBridge.cardResponseLabel")
              : t("manualChatGptBridge.textResponseLabel")}
          </h3>
        </div>
        <textarea
          aria-label={
            request.responseFormat === "card_json"
              ? t("manualChatGptBridge.cardResponseLabel")
              : t("manualChatGptBridge.textResponseLabel")
          }
          autoCapitalize="off"
          autoComplete="off"
          className="manual-chatgpt-response"
          data-qa="manual-chatgpt-response"
          placeholder={t("manualChatGptBridge.responsePlaceholder")}
          spellCheck={false}
          value={response}
          onChange={(event) => setResponse(event.target.value)}
        />
      </section>

      {status ? <p className="manual-chatgpt-status" role="status" aria-live="polite">{status}</p> : null}
      {error ? <p className="manual-chatgpt-error" role="alert">{error}</p> : null}

      <footer className="manual-chatgpt-footer">
        <button className="button secondary" type="button" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button
          className="button primary"
          data-qa="manual-chatgpt-use-response"
          disabled={!response.trim()}
          type="button"
          onClick={submitResponse}
        >
          {t("manualChatGptBridge.validateAndUse")}
        </button>
      </footer>
    </Dialog>
  );
}
