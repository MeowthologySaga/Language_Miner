import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  InputLanguageMismatchDecision,
  InputLanguageMismatchRequest
} from "../profiledApi";
import { Dialog } from "./Dialog";

type InputLanguageMismatchDialogProps = {
  request: InputLanguageMismatchRequest;
  onDecision: (decision: InputLanguageMismatchDecision) => void;
};

export function InputLanguageMismatchDialog({
  request,
  onDecision
}: InputLanguageMismatchDialogProps) {
  const { i18n, t } = useTranslation();
  const locale = (i18n.resolvedLanguage ?? i18n.language).startsWith("en") ? "en" : "ko";
  const sentence = (request.card.sourceSentence || request.card.frontText).trim().slice(0, 320);
  const detectedLanguageTag = toSafeLanguageTag(request.detectedLanguageCode);

  return (
    <Dialog
      ariaDescribedBy="input-language-mismatch-description"
      ariaLabelledBy="input-language-mismatch-title"
      backdropClassName="input-language-mismatch-backdrop"
      className="input-language-mismatch-dialog"
      closeOnBackdrop={false}
      onClose={() => onDecision("cancel")}
    >
      <header>
        <AlertTriangle aria-hidden="true" size={22} />
        <div>
          <small>{t("app.languageMismatch.eyebrow")}</small>
          <h2 id="input-language-mismatch-title">{t("app.languageMismatch.title")}</h2>
        </div>
      </header>
      <p id="input-language-mismatch-description">
        {t("app.languageMismatch.description")}
      </p>
      <dl>
        <div>
          <dt>{t("app.languageMismatch.currentProfile")}</dt>
          <dd>
            {formatLanguageName(
              request.expectedLanguageCode,
              locale,
              t("common.unknown")
            )}
          </dd>
        </div>
        <div>
          <dt>{t("app.languageMismatch.detected")}</dt>
          <dd>
            {formatLanguageName(
              request.detectedLanguageCode,
              locale,
              t("common.unknown")
            )}
          </dd>
        </div>
      </dl>
      {sentence ? (
        <blockquote lang={detectedLanguageTag}>
          {sentence}
        </blockquote>
      ) : null}
      <p className="input-language-mismatch-warning">
        {t("app.languageMismatch.saveWarning")}
      </p>
      <footer>
        <button className="button secondary" type="button" onClick={() => onDecision("cancel")}>
          {t("common.cancel")}
        </button>
        <button
          className="button secondary"
          disabled={!detectedLanguageTag}
          type="button"
          onClick={() => onDecision("switch")}
        >
          {t("app.languageMismatch.switchProfile")}
        </button>
        <button className="button primary" type="button" onClick={() => onDecision("override")}>
          {t("app.languageMismatch.saveAnyway")}
        </button>
      </footer>
    </Dialog>
  );
}

function formatLanguageName(
  languageCode: string,
  locale: "ko" | "en",
  unknownLabel: string
) {
  const languageTag = toSafeLanguageTag(languageCode);
  if (!languageTag) {
    return unknownLabel;
  }
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(languageTag) ?? languageTag;
  } catch {
    return unknownLabel;
  }
}

function toSafeLanguageTag(languageCode: string) {
  if (!languageCode || languageCode === "unknown") {
    return undefined;
  }
  try {
    return Intl.getCanonicalLocales(languageCode)[0];
  } catch {
    return undefined;
  }
}
