import "../styles/writingPractice.css";
import {
  CheckCircle,
  Eye,
  Lightbulb,
  ListChecks,
  BookOpen,
  RefreshCw,
  Shuffle,
  Target,
  CreditCard
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LocalEnglishMinerApi } from "../data/api";
import {
  buildWritingPracticePrompts,
  evaluateWritingPracticeAnswer,
  type WritingPracticeEvaluation
} from "../shared/writingPractice";
import type { StudyCard } from "../shared/types";

type WritingPracticePageProps = {
  api: LocalEnglishMinerApi;
  cards: StudyCard[];
  focusCardId?: string | null;
  focusPromptIndex?: number;
  focusRequestId?: number;
  onFocusConsumed?: () => void;
  onMissionProgressChanged?: () => Promise<void>;
  onNavigate?: (route: "cards" | "pdfReader" | "life") => void;
};

export function WritingPracticePage({
  api,
  cards,
  focusCardId,
  focusPromptIndex = 0,
  focusRequestId = 0,
  onFocusConsumed,
  onMissionProgressChanged,
  onNavigate
}: WritingPracticePageProps) {
  const { i18n, t } = useTranslation();
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language),
    [i18n.language, i18n.resolvedLanguage]
  );
  const prompts = useMemo(() => buildWritingPracticePrompts(cards), [cards]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [evaluation, setEvaluation] = useState<WritingPracticeEvaluation | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const [passCount, setPassCount] = useState(0);
  const [lastSubmittedAnswer, setLastSubmittedAnswer] = useState<string | null>(null);

  const activePrompt = prompts[Math.min(activeIndex, prompts.length - 1)];
  const activePromptCard = activePrompt?.cardId
    ? cards.find((card) => card.id === activePrompt.cardId)
    : undefined;
  const normalizedCurrentAnswer = answer.trim();
  const isCurrentAnswerAlreadyChecked =
    Boolean(evaluation) && normalizedCurrentAnswer === lastSubmittedAnswer;
  const evaluationLevelLabel = evaluation?.level === "great"
    ? t("writingPractice.feedback.level.great")
    : evaluation?.level === "good"
      ? t("writingPractice.feedback.level.good")
      : t("writingPractice.feedback.level.try_again");

  useEffect(() => {
    if (!focusCardId || prompts.length === 0) {
      return;
    }
    const cardPromptIndexes = prompts
      .map((prompt, index) => ({ prompt, index }))
      .filter(({ prompt }) => prompt.cardId === focusCardId);
    const target = cardPromptIndexes[Math.min(focusPromptIndex, cardPromptIndexes.length - 1)];
    if (!target) {
      return;
    }
    setActiveIndex(target.index);
    resetAttempt();
    onFocusConsumed?.();
  }, [focusCardId, focusPromptIndex, focusRequestId, onFocusConsumed, prompts]);

  async function checkAnswer() {
    if (!activePrompt || !normalizedCurrentAnswer || isCurrentAnswerAlreadyChecked) {
      return;
    }
    const result = evaluateWritingPracticeAnswer(activePrompt, normalizedCurrentAnswer);
    setEvaluation(result);
    setShowAnswer(true);
    setLastSubmittedAnswer(normalizedCurrentAnswer);
    setAttemptCount((value) => value + 1);
    if (result.level === "great" || result.level === "good") {
      setPassCount((value) => value + 1);
    }
    try {
      await api.missions.recordEvent({
        type: "writing_practice_completed",
        amount: 1,
        metadata: {
          promptSource: activePrompt.source,
          level: result.level
        }
      });
      await onMissionProgressChanged?.();
    } catch {
      // Mission rewards should not block the writing practice flow.
    }
  }

  function goNext() {
    setActiveIndex((index) => (index + 1) % prompts.length);
    resetAttempt();
  }

  function pickRandom() {
    if (prompts.length <= 1) {
      resetAttempt();
      return;
    }
    let nextIndex = activeIndex;
    while (nextIndex === activeIndex) {
      nextIndex = Math.floor(Math.random() * prompts.length);
    }
    setActiveIndex(nextIndex);
    resetAttempt();
  }

  function resetAttempt() {
    setAnswer("");
    setEvaluation(null);
    setShowHint(false);
    setShowAnswer(false);
    setLastSubmittedAnswer(null);
  }

  if (!activePrompt) {
    return (
      <div className="writing-practice-page">
        <section className="writing-practice-empty" aria-labelledby="writing-practice-empty-title">
          <Target size={36} />
          <h1 id="writing-practice-empty-title">{t("writingPractice.empty.title")}</h1>
          <p>{t("writingPractice.empty.description")}</p>
          {onNavigate ? (
            <div className="writing-empty-actions">
              <button
                className="button secondary"
                data-qa="writing-empty-open-cards"
                type="button"
                onClick={() => onNavigate("cards")}
              >
                <CreditCard size={16} />
                {t("writingPractice.actions.openCards")}
              </button>
              <button
                className="button primary"
                data-qa="writing-empty-open-reader"
                type="button"
                onClick={() => onNavigate("pdfReader")}
              >
                <BookOpen size={16} />
                {t("writingPractice.actions.openReader")}
              </button>
              <button
                className="button secondary"
                data-qa="writing-empty-open-life"
                type="button"
                onClick={() => onNavigate("life")}
              >
                <Lightbulb size={16} />
                {t("writingPractice.actions.openLifeMining")}
              </button>
            </div>
          ) : null}
        </section>
      </div>
    );
  }

  return (
    <div className="writing-practice-page">
      <section className="writing-practice-main">
        <header className="writing-practice-header">
          <div>
            <h1>{t("writingPractice.title")}</h1>
            <p>{t("writingPractice.description")}</p>
          </div>
          <div className="writing-practice-stats">
            <span>
              {t("writingPractice.stats.sentences", {
                formattedCount: numberFormatter.format(prompts.length)
              })}
            </span>
            <span>
              {attemptCount
                ? t("writingPractice.stats.passed", {
                    passed: numberFormatter.format(passCount),
                    attempts: numberFormatter.format(attemptCount)
                  })
                : t("writingPractice.stats.ready")}
            </span>
          </div>
        </header>

        <div className="writing-prompt-card">
          <div className="writing-prompt-meta">
            <span>
              {activePrompt.source === "conversation-bank"
                ? t("writingPractice.prompt.conversationBank")
                : activePromptCard?.deckType === "output"
                  ? t("writingPractice.prompt.speakingCard")
                  : t("writingPractice.prompt.readingCard")}
            </span>
            <span>
              {activePrompt.source === "card"
                ? t("writingPractice.prompt.cardSource")
                : t("writingPractice.prompt.conversationSource")}
            </span>
            <span>{t("writingPractice.prompt.type")}</span>
          </div>
          <p>{activePrompt.promptKo}</p>
        </div>

        <div className="writing-practice-controls">
          <button
            className="button secondary"
            data-qa="writing-random-button"
            type="button"
            onClick={pickRandom}
          >
            <Shuffle size={16} />
            {t("writingPractice.actions.random")}
          </button>
          <button
            className="button secondary"
            data-qa="writing-next-button"
            type="button"
            onClick={goNext}
          >
            <RefreshCw size={16} />
            {t("writingPractice.actions.next")}
          </button>
          <button
            className="button secondary"
            data-qa="writing-hint-button"
            aria-pressed={showHint}
            type="button"
            onClick={() => setShowHint((value) => !value)}
          >
            <Lightbulb size={16} />
            {t("writingPractice.actions.hint")}
          </button>
          <button
            className="button secondary"
            data-qa="writing-answer-button"
            aria-pressed={showAnswer}
            type="button"
            onClick={() => setShowAnswer((value) => !value)}
          >
            <Eye size={16} />
            {t("writingPractice.actions.showAnswer")}
          </button>
        </div>

        {showHint ? (
          <section className="writing-practice-hint">
            <h3>
              <ListChecks size={17} />
              {t("writingPractice.hint.title")}
            </h3>
            <div className="writing-term-row">
              {activePrompt.requiredTerms.length ? (
                activePrompt.requiredTerms.map((term) => <span key={term}>{term}</span>)
              ) : (
                <span>{t("writingPractice.hint.freeWriting")}</span>
              )}
            </div>
          </section>
        ) : null}

        <form
          className="writing-answer-form"
          onSubmit={(event) => {
            event.preventDefault();
            void checkAnswer();
          }}
        >
          <label className="sr-only" htmlFor="writing-practice-answer">
            {t("writingPractice.answer.label")}
          </label>
          <textarea
            id="writing-practice-answer"
            placeholder={t("writingPractice.answer.placeholder")}
            value={answer}
            onChange={(event) => {
              const nextAnswer = event.target.value;
              setAnswer(nextAnswer);
              if (evaluation && nextAnswer.trim() !== lastSubmittedAnswer) {
                setEvaluation(null);
                setShowAnswer(false);
              }
            }}
          />
          <div className="writing-answer-actions">
            <button
              className="button primary"
              data-qa="writing-check-button"
              disabled={!normalizedCurrentAnswer || isCurrentAnswerAlreadyChecked}
              type="submit"
            >
              <CheckCircle size={17} />
              {isCurrentAnswerAlreadyChecked
                ? t("writingPractice.actions.checked")
                : t("common.confirm")}
            </button>
            <button className="button secondary" type="button" onClick={resetAttempt}>
              {t("writingPractice.actions.rewrite")}
            </button>
          </div>
        </form>
      </section>

      <aside aria-atomic="true" aria-live="polite" className="writing-feedback-panel">
        <h2>{t("writingPractice.feedback.title")}</h2>
        {evaluation ? (
          <>
            <div className={`writing-score-card ${evaluation.level}`}>
              <strong>{evaluation.score}</strong>
              <span>{evaluationLevelLabel}</span>
              <small>{t("writingPractice.feedback.scoreHint")}</small>
            </div>

            <section>
              <h3>{t("writingPractice.feedback.expressionCheck")}</h3>
              <div className="writing-term-row">
                {evaluation.matchedTerms.map((term) => (
                  <span className="matched" key={term}>{term}</span>
                ))}
                {evaluation.missingTerms.map((term) => (
                  <span className="missing" key={term}>{term}</span>
                ))}
                {!evaluation.matchedTerms.length && !evaluation.missingTerms.length ? (
                  <span>{t("writingPractice.feedback.noRequiredTerms")}</span>
                ) : null}
              </div>
            </section>

            <section>
              <h3>{t("writingPractice.feedback.myAnswer")}</h3>
              <p>{answer}</p>
            </section>
          </>
        ) : (
          <div className="writing-feedback-empty">
            <Target size={30} />
            <strong>{t("writingPractice.feedback.emptyTitle")}</strong>
            <p>{t("writingPractice.feedback.emptyDescription")}</p>
          </div>
        )}

        {showAnswer ? (
          <section className="writing-answer-suggestion">
            <h3>{t("writingPractice.feedback.suggestedAnswer")}</h3>
            <p>{activePrompt.targetEnglish}</p>
          </section>
        ) : null}
      </aside>
    </div>
  );
}
