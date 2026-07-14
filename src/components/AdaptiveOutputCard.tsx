import {
  AlertTriangle,
  BookOpenText,
  Braces,
  Languages,
  Lightbulb,
  MessageSquareText,
  Volume2,
  Tags
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type {
  OutputStudyChunk,
  OutputStudySentence,
  StudyCard
} from "../shared/types";

export function AdaptiveOutputFront({ card }: { card: StudyCard }) {
  const { t } = useTranslation();
  const guide = card.outputStudyGuide;
  if (!guide) {
    return null;
  }

  return (
    <div className="adaptive-output-front">
      <section
        className="adaptive-message-app"
        aria-label={t("cardPreview.adaptive.contextAria")}
      >
        <header className="adaptive-message-app-header">
          <div className="adaptive-message-app-icon"><MessageSquareText size={17} /></div>
          <div>
            <strong>{t("cardPreview.adaptive.context")}</strong>
            <span>{guide.contextKo}</span>
          </div>
          <i aria-hidden="true" />
        </header>
        <div className="adaptive-message-app-body">
          <div className="adaptive-message-day">
            <span>{t("cardPreview.adaptive.nativeOriginal")}</span>
          </div>
          {guide.dialogue.map((sentence, index) => (
            <MessageRow
              key={`${sentence.speaker ?? "speaker"}-${sentence.ko}-${index}`}
              role={sentence.role}
              speaker={
                sentence.role === "me"
                  ? t("cardPreview.adaptive.me")
                  : sentence.speaker || t("cardPreview.adaptive.other")
              }
            >
              <p className="adaptive-message-text">
                <InlineHighlight
                  anchor={sentence.highlightKo}
                  text={sentence.ko}
                  tone={sentence.role === "me" ? "learner" : "context"}
                />
              </p>
            </MessageRow>
          ))}
        </div>
        <div
          className="adaptive-message-app-footer"
          aria-label={t("cardPreview.adaptive.legendAria")}
        >
          <span>
            <i className="adaptive-highlight-swatch context" />
            {t("cardPreview.adaptive.contextChunk")}
          </span>
          <span>
            <i className="adaptive-highlight-swatch learner" />
            {t("cardPreview.adaptive.learnerChunk")}
          </span>
        </div>
      </section>
    </div>
  );
}

export function AdaptiveOutputBack({
  card,
  playingSentenceText = "",
  onPlaySentence,
  pronunciationRecorder
}: {
  card: StudyCard;
  playingSentenceText?: string;
  onPlaySentence?: (sentence: OutputStudySentence) => void;
  pronunciationRecorder?: ReactNode;
}) {
  const { t } = useTranslation();
  const guide = card.outputStudyGuide;
  if (!guide) {
    return null;
  }
  return (
    <div className="adaptive-output-back">
      <section
        className="adaptive-message-app adaptive-message-app-english"
        aria-label={t("cardPreview.adaptive.targetDialogueAria")}
      >
        <header className="adaptive-message-app-header">
          <div className="adaptive-message-app-icon"><Languages size={17} /></div>
          <div>
            <strong>{t("cardPreview.adaptive.reviewTarget")}</strong>
            <span>{t("cardPreview.adaptive.reviewTargetDescription")}</span>
          </div>
          <i aria-hidden="true" />
        </header>
        <div className="adaptive-message-app-body">
          <div className="adaptive-message-day">
            <span>{t("cardPreview.adaptive.targetOriginal")}</span>
          </div>
          {guide.dialogue.map((sentence, index) => (
            <MessageRow
              key={`${sentence.speaker ?? "speaker"}-${sentence.en}-${index}`}
              role={sentence.role}
              speaker={sentence.role === "me" ? "Me" : sentence.speaker || "A"}
              actions={
                <div
                  className="adaptive-message-actions"
                  aria-label={t("cardPreview.adaptive.sentenceActions", {
                    text: sentence.en
                  })}
                >
                  <button
                    disabled={Boolean(playingSentenceText)}
                    title={t("cardPreview.adaptive.readBubbleTitle")}
                    type="button"
                    onClick={() => onPlaySentence?.(sentence)}
                  >
                    <Volume2 size={14} />
                    <span>
                      {playingSentenceText === sentence.en
                        ? t("cardPreview.actions.playing")
                        : t("cardPreview.adaptive.readAloud")}
                    </span>
                  </button>
                </div>
              }
            >
              <StudySentence
                sentence={sentence}
                tone={sentence.role === "me" ? "learner" : "context"}
              />
            </MessageRow>
          ))}
        </div>
      </section>
      {pronunciationRecorder}

      <div className="adaptive-output-focus-grid">
        <AdaptiveSection
          icon={<BookOpenText size={18} />}
          title={t("cardPreview.adaptive.keyChunks")}
          compact
        >
          <div className="adaptive-output-chunk-list">
            {guide.keyChunks.map((chunk) => <ChunkStudy chunk={chunk} key={`${chunk.tone}-${chunk.en}`} />)}
          </div>
        </AdaptiveSection>
        <AdaptiveSection
          icon={<Lightbulb size={18} />}
          title={guide.insight.title}
          badge="Adaptive"
          compact
        >
          <p className="adaptive-output-insight">{guide.insight.bodyKo}</p>
        </AdaptiveSection>
      </div>

      <div className="adaptive-output-meaning-grid">
        <section>
          <span>{t("cardPreview.adaptive.literal")}</span>
          <p>{guide.literalMeaningKo}</p>
        </section>
        <section>
          <span>{t("cardPreview.adaptive.nuance")}</span>
          <p>{guide.nuanceKo}</p>
        </section>
      </div>

      <AdaptiveSection
        icon={<Braces size={18} />}
        title={t("cardPreview.adaptive.structure")}
      >
        <div className="adaptive-output-breakdown">
          {guide.breakdown.map((item) => (
            <div key={`${item.expression}-${item.meaningKo}`}>
              <code>{item.expression}</code>
              <p>{item.meaningKo}</p>
            </div>
          ))}
        </div>
      </AdaptiveSection>

      <AdaptiveSection
        icon={<MessageSquareText size={18} />}
        title={t("cardPreview.adaptive.alternatives")}
      >
        <div className="adaptive-output-sentence-stack">
          {guide.alternatives.map((sentence, index) => (
            <StudySentence key={`${sentence.en}-${index}`} sentence={sentence} />
          ))}
        </div>
      </AdaptiveSection>

      {guide.commonMistake ? (
        <AdaptiveSection
          icon={<AlertTriangle size={18} />}
          title={t("cardPreview.adaptive.correction")}
          tone="warning"
        >
          <div className="adaptive-output-mistake-grid">
            {guide.commonMistake.wrong ? (
              <div>
                <span className="adaptive-output-mistake-label wrong">
                  {t("cardPreview.adaptive.avoid")}
                </span>
                <StudySentence sentence={guide.commonMistake.wrong} />
              </div>
            ) : null}
            <div>
              <span className="adaptive-output-mistake-label right">
                {t("cardPreview.adaptive.recommend")}
              </span>
              <StudySentence sentence={guide.commonMistake.right} tone="learner" />
            </div>
          </div>
          <p className="adaptive-output-mistake-note">{guide.commonMistake.explanationKo}</p>
        </AdaptiveSection>
      ) : null}

      <AdaptiveSection
        icon={<BookOpenText size={18} />}
        title={t("cardPreview.adaptive.drills")}
      >
        <div className="adaptive-output-drills">
          {guide.miniDrills.map((sentence, index) => (
            <details key={`${sentence.en}-${index}`}>
              <summary>{sentence.ko}</summary>
              <StudySentence sentence={sentence} tone="learner" />
            </details>
          ))}
        </div>
      </AdaptiveSection>

      <AdaptiveSection icon={<Tags size={18} />} title={t("cardPreview.adaptive.tags")} compact>
        <div className="adaptive-output-tags">
          {guide.tags.map((tag) => <span key={tag}>#{tag}</span>)}
        </div>
      </AdaptiveSection>
    </div>
  );
}

function StudySentence({
  sentence,
  tone
}: {
  sentence: OutputStudySentence;
  tone?: "context" | "learner";
}) {
  const { t } = useTranslation();
  return (
    <div className="adaptive-study-sentence">
      <p className="adaptive-study-english">
        <InlineHighlight anchor={sentence.highlightEn} text={sentence.en} tone={tone} />
      </p>
      <p className="adaptive-study-translation">
        <span>{t("cardPreview.adaptive.meaning")}</span>
        {sentence.ko}
      </p>
      {sentence.pronunciationKo || sentence.ipa ? (
        <p className="adaptive-study-pronunciation">
          <span>
            {sentence.role === "me"
              ? t("cardPreview.adaptive.mySentence")
              : t("cardPreview.adaptive.pronunciation")}
          </span>
          {sentence.pronunciationKo}
          {sentence.pronunciationKo && sentence.ipa ? <b>·</b> : null}
          {sentence.ipa ? <em>{sentence.ipa}</em> : null}
        </p>
      ) : null}
    </div>
  );
}

function MessageRow({
  actions,
  children,
  role = "context",
  speaker
}: {
  actions?: ReactNode;
  children: ReactNode;
  role?: OutputStudySentence["role"];
  speaker: string;
}) {
  return (
    <div className={`adaptive-message-row adaptive-message-row-${role}`}>
      <span className="adaptive-message-avatar" aria-hidden="true">
        {role === "me" ? "ME" : getSpeakerInitial(speaker)}
      </span>
      <div className="adaptive-message-group">
        <span className="adaptive-message-speaker">{speaker}</span>
        <div className="adaptive-message-bubble">{children}</div>
        {actions}
      </div>
    </div>
  );
}

function getSpeakerInitial(speaker: string) {
  return speaker.trim().slice(0, 2).toUpperCase() || "A";
}

function ChunkStudy({ chunk }: { chunk: OutputStudyChunk }) {
  return (
    <div className={`adaptive-output-chunk adaptive-output-chunk-${chunk.tone}`}>
      <span>{chunk.label}</span>
      <strong><InlineHighlight anchor={chunk.en} text={chunk.en} tone={chunk.tone} /></strong>
      <p>{chunk.ko}</p>
      {chunk.pronunciationKo || chunk.ipa ? (
        <small>
          {chunk.pronunciationKo}
          {chunk.pronunciationKo && chunk.ipa ? " · " : ""}
          {chunk.ipa ? <em>{chunk.ipa}</em> : null}
        </small>
      ) : null}
    </div>
  );
}

function AdaptiveSection({
  badge,
  children,
  compact = false,
  icon,
  title,
  tone = "default"
}: {
  badge?: string;
  children: ReactNode;
  compact?: boolean;
  icon: ReactNode;
  title: string;
  tone?: "default" | "warning";
}) {
  return (
    <section className={`adaptive-output-section ${compact ? "is-compact" : ""} is-${tone}`}>
      <div className="adaptive-output-section-title">
        {icon}
        <h3>{title}</h3>
        {badge ? <span>{badge}</span> : null}
      </div>
      {children}
    </section>
  );
}

function InlineHighlight({
  anchor,
  text,
  tone = "learner"
}: {
  anchor?: string;
  text: string;
  tone?: "context" | "learner";
}) {
  const normalizedAnchor = anchor?.trim();
  if (!normalizedAnchor) {
    return text;
  }
  const index = text.toLocaleLowerCase().indexOf(normalizedAnchor.toLocaleLowerCase());
  if (index < 0) {
    return text;
  }
  return (
    <>
      {text.slice(0, index)}
      <mark className={`adaptive-inline-highlight adaptive-inline-highlight-${tone}`}>
        {text.slice(index, index + normalizedAnchor.length)}
      </mark>
      {text.slice(index + normalizedAnchor.length)}
    </>
  );
}
