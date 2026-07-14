import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  Headphones,
  KeyRound,
  Languages,
  Laptop,
  MessageCircle,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  WalletCards
} from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { normalizeAppLocale, type AppLocale } from "./appLocale";
import { Dialog } from "./components/Dialog";
import { changeAppLocale } from "./i18n";
import { areSameLanguage, languagePresets } from "./shared/languages";
import type { AppSettings } from "./shared/types";

export const APP_ONBOARDING_COMPLETED_KEY = "lem:onboarding:v2:completed";
export const LEGACY_APP_ONBOARDING_COMPLETED_KEYS = ["lem:onboarding:v1:completed"] as const;

type AppOnboardingReadStorage = Pick<Storage, "getItem">;
type AppOnboardingWriteStorage = Pick<Storage, "setItem">;
type AppOnboardingLanguageKind = "nativeLanguage" | "targetLanguage";

type AppOnboardingProps = {
  settings: AppSettings;
  onComplete: (settings: AppSettings) => void | Promise<void>;
  onOpenSettings: (settings: AppSettings) => void | Promise<void>;
  onSkip: (settings: AppSettings) => void | Promise<void>;
};

function getAppOnboardingStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readAppOnboardingCompleted(storage?: AppOnboardingReadStorage | null) {
  const resolvedStorage = storage === undefined ? getAppOnboardingStorage() : storage;
  if (!resolvedStorage) {
    return false;
  }
  try {
    return [APP_ONBOARDING_COMPLETED_KEY, ...LEGACY_APP_ONBOARDING_COMPLETED_KEYS].some(
      (key) => resolvedStorage.getItem(key) === "1"
    );
  } catch {
    return false;
  }
}

export function writeAppOnboardingCompleted(storage?: AppOnboardingWriteStorage | null) {
  const resolvedStorage = storage === undefined ? getAppOnboardingStorage() : storage;
  if (!resolvedStorage) {
    return;
  }
  try {
    resolvedStorage.setItem(APP_ONBOARDING_COMPLETED_KEY, "1");
  } catch {
    // Restricted previews can block localStorage. In that case the in-memory close still works.
  }
}

export function updateAppOnboardingProfileLanguage(
  settings: AppSettings,
  kind: AppOnboardingLanguageKind,
  languageCode: string
) {
  const selected = languagePresets.find((language) => language.code === languageCode);
  if (!selected) {
    return settings;
  }
  const learningProfile = settings.learningProfile;
  const otherKind = kind === "nativeLanguage" ? "targetLanguage" : "nativeLanguage";
  const otherLanguage = learningProfile[otherKind];
  const previousLanguage = learningProfile[kind];
  return {
    ...settings,
    learningProfile: {
      ...learningProfile,
      [kind]: selected,
      [otherKind]: areSameLanguage(selected, otherLanguage)
        ? previousLanguage
        : otherLanguage
    }
  };
}

export function AppOnboarding({
  settings,
  onComplete,
  onOpenSettings,
  onSkip
}: AppOnboardingProps) {
  const { i18n, t } = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);
  const [draftSettings, setDraftSettings] = useState(settings);
  const primaryActionRef = useRef<HTMLButtonElement>(null);
  const activeLocale = normalizeAppLocale(i18n.resolvedLanguage ?? i18n.language) ?? "ko";

  const steps = [
    {
      title: t("onboarding.steps.languages.title"),
      copy: t("onboarding.steps.languages.copy")
    },
    {
      title: t("onboarding.steps.sentences.title"),
      copy: t("onboarding.steps.sentences.copy")
    },
    {
      title: t("onboarding.steps.loop.title"),
      copy: t("onboarding.steps.loop.copy")
    },
    {
      title: t("onboarding.steps.ai.title"),
      copy: t("onboarding.steps.ai.copy")
    }
  ];
  const currentStep = steps[stepIndex];
  const canGoBack = stepIndex > 0;
  const isLanguageStep = stepIndex === 0;
  const isSentenceStep = stepIndex === 1;
  const isLearningLoopStep = stepIndex === 2;
  const isFinalStep = stepIndex === steps.length - 1;

  function selectAppLocale(locale: AppLocale) {
    if (locale !== activeLocale) {
      void changeAppLocale(locale);
    }
  }

  function selectProfileLanguage(
    kind: AppOnboardingLanguageKind,
    languageCode: string
  ) {
    setDraftSettings((current) =>
      updateAppOnboardingProfileLanguage(current, kind, languageCode)
    );
  }

  function goNext() {
    if (!isFinalStep) {
      setStepIndex((current) => current + 1);
      return;
    }
    onComplete(draftSettings);
  }

  function openSettings() {
    onOpenSettings(draftSettings);
  }

  function skipOnboarding() {
    onSkip(draftSettings);
  }

  return (
    <Dialog
      ariaLabel={t("onboarding.ariaLabel")}
      backdropClassName="app-onboarding-backdrop"
      className="app-onboarding-panel"
      closeOnBackdrop={false}
      data-qa="app-onboarding"
      initialFocusRef={primaryActionRef}
      onClose={skipOnboarding}
    >
        <div className="app-onboarding-rail" aria-hidden="true">
          <span className="app-onboarding-mark">LM</span>
          <div>
            <strong>{t("onboarding.privacyTitle")}</strong>
            <span>{t("onboarding.privacySubtitle")}</span>
          </div>
        </div>

        <div className="app-onboarding-body">
          <div className="app-onboarding-scroll">
            <div className="app-onboarding-progress" aria-label={t("onboarding.progressLabel")}>
              {steps.map((step, index) => (
                <span
                  aria-current={index === stepIndex ? "step" : undefined}
                  className={index === stepIndex ? "active" : index < stepIndex ? "done" : ""}
                  key={step.title}
                />
              ))}
            </div>

            <div className="app-onboarding-heading">
              <span className="app-onboarding-kicker">
                <Sparkles size={15} />
                {t("onboarding.kicker")}
              </span>
              <h2>{currentStep.title}</h2>
              <p>{currentStep.copy}</p>
            </div>

            {isLanguageStep ? (
              <div className="app-onboarding-language-setup">
                <fieldset>
                  <legend>{t("onboarding.languages.appLanguage")}</legend>
                  <p>{t("onboarding.languages.appLanguageDescription")}</p>
                  <div
                    aria-label={t("onboarding.languages.appLanguage")}
                    className="app-onboarding-choice-row two"
                    role="group"
                  >
                    {(["ko", "en"] as const).map((locale) => (
                      <button
                        aria-pressed={activeLocale === locale}
                        className={activeLocale === locale ? "active" : ""}
                        data-qa={`onboarding-app-locale-${locale}`}
                        key={locale}
                        type="button"
                        onClick={() => selectAppLocale(locale)}
                      >
                        <Languages size={17} />
                        {locale === "ko" ? "한국어" : "English"}
                      </button>
                    ))}
                  </div>
                </fieldset>

                {(["nativeLanguage", "targetLanguage"] as const).map((kind) => (
                  <fieldset key={kind}>
                    <legend>{t(`onboarding.languages.${kind}`)}</legend>
                    <p>{t(`onboarding.languages.${kind}Description`)}</p>
                    <div
                      aria-label={t(`onboarding.languages.${kind}`)}
                      className="app-onboarding-choice-row"
                      role="group"
                    >
                      {languagePresets.map((language) => {
                        const selected = draftSettings.learningProfile[kind].code === language.code;
                        return (
                          <button
                            aria-pressed={selected}
                            className={selected ? "active" : ""}
                            data-qa={`onboarding-${kind}-${language.code}`}
                            key={`${kind}-${language.code}`}
                            type="button"
                            onClick={() => selectProfileLanguage(kind, language.code)}
                          >
                            {activeLocale === "en" ? language.nameEn : language.nameKo}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
                <p className="app-onboarding-language-hint">
                  {t("onboarding.languages.swapHint")}
                </p>
              </div>
            ) : null}

            {isSentenceStep ? (
              <div className="app-onboarding-checklist">
                <div>
                  <BookOpen size={18} />
                  <span>
                    <strong>{t("onboarding.sentences.saveTitle")}</strong>
                    <small>{t("onboarding.sentences.saveDescription")}</small>
                  </span>
                </div>
                <div>
                  <WalletCards size={18} />
                  <span>
                    <strong>{t("onboarding.sentences.cardTitle")}</strong>
                    <small>{t("onboarding.sentences.cardDescription")}</small>
                  </span>
                </div>
                <div>
                  <RotateCcw size={18} />
                  <span>
                    <strong>{t("onboarding.sentences.reviewTitle")}</strong>
                    <small>{t("onboarding.sentences.reviewDescription")}</small>
                  </span>
                </div>
              </div>
            ) : null}

            {isLearningLoopStep ? (
              <div className="app-onboarding-checklist">
                <div>
                  <Headphones size={18} />
                  <span>
                    <strong>{t("onboarding.loop.inputTitle")}</strong>
                    <small>{t("onboarding.loop.inputDescription")}</small>
                  </span>
                </div>
                <div>
                  <MessageCircle size={18} />
                  <span>
                    <strong>{t("onboarding.loop.outputTitle")}</strong>
                    <small>{t("onboarding.loop.outputDescription")}</small>
                  </span>
                </div>
                <div>
                  <Sparkles size={18} />
                  <span>
                    <strong>{t("onboarding.loop.playZoneTitle")}</strong>
                    <small>{t("onboarding.loop.playZoneDescription")}</small>
                  </span>
                </div>
              </div>
            ) : null}

            {isFinalStep ? (
              <div className="app-onboarding-ai-setup">
                <div className="app-onboarding-checklist compact">
                  <div>
                    <ShieldCheck size={18} />
                    <span>
                      <strong>{t("onboarding.ai.localTitle")}</strong>
                      <small>{t("onboarding.ai.localDescription")}</small>
                    </span>
                  </div>
                  <div>
                    <CheckCircle2 size={18} />
                    <span>
                      <strong>{t("onboarding.ai.disconnectedTitle")}</strong>
                      <small>{t("onboarding.ai.disconnectedDescription")}</small>
                    </span>
                  </div>
                </div>

                <div className="app-onboarding-provider-grid">
                  <article className="app-onboarding-key-card">
                    <div className="app-onboarding-provider-title">
                      <Laptop size={18} />
                      <strong>{t("onboarding.ai.ollamaTitle")}</strong>
                    </div>
                    <p>{t("onboarding.ai.ollamaDescription")}</p>
                    <small>{t("onboarding.ai.ollamaPath")}</small>
                  </article>
                  <article className="app-onboarding-key-card">
                    <div className="app-onboarding-provider-title">
                      <KeyRound size={18} />
                      <strong>{t("onboarding.ai.geminiTitle")}</strong>
                    </div>
                    <ol>
                      <li>{t("onboarding.ai.geminiStep1")}</li>
                      <li>{t("onboarding.ai.geminiStep2")}</li>
                      <li>{t("onboarding.ai.geminiStep3")}</li>
                    </ol>
                    <a
                      className="app-onboarding-link-button"
                      href="https://aistudio.google.com/app/apikey"
                      rel="noreferrer"
                      target="_blank"
                    >
                      {t("onboarding.ai.openAiStudio")}
                      <ExternalLink size={14} />
                    </a>
                  </article>
                </div>
                <div className="app-onboarding-ai-note" role="note">
                  <KeyRound size={17} />
                  <span>
                    <strong>{t("onboarding.ai.googleTranslateTitle")}</strong>
                    <small>{t("onboarding.ai.googleTranslateDescription")}</small>
                    <small>{t("onboarding.ai.consentDescription")}</small>
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="app-onboarding-actions">
            <button
              className="button ghost"
              data-qa="onboarding-skip"
              type="button"
              onClick={skipOnboarding}
            >
              {t("onboarding.actions.later")}
            </button>
            <div>
              {canGoBack ? (
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setStepIndex((current) => current - 1)}
                >
                  {t("onboarding.actions.previous")}
                </button>
              ) : null}
              {isFinalStep ? (
                <button className="button secondary" type="button" onClick={openSettings}>
                  <Settings size={16} />
                  {t("onboarding.actions.openSettings")}
                </button>
              ) : null}
              <button
                ref={primaryActionRef}
                className="button primary"
                data-qa="onboarding-primary"
                type="button"
                onClick={goNext}
              >
                {isFinalStep ? t("onboarding.actions.explore") : t("onboarding.actions.next")}
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
    </Dialog>
  );
}
