import type { PdfSegmentTranslation, PdfTextSegment } from "../shared/types";
import { getSegmentHighlightStyle } from "./pdfLayoutExtraction";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

type PdfTranslationSegmentListProps = {
  segments: PdfTextSegment[];
  translations: PdfSegmentTranslation[];
};

export function PdfTranslationSegmentList({
  segments,
  translations
}: PdfTranslationSegmentListProps) {
  const { i18n, t } = useTranslation();
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language),
    [i18n.language, i18n.resolvedLanguage]
  );
  return (
    <div
      aria-label={t("pdfAuthoring.segments.listLabel")}
      className="pdf-translation-segments"
      tabIndex={0}
    >
      {segments.length ? (
        segments.map((segment, segmentIndex) => {
          const translation = translations.find((candidate) => candidate.id === segment.id);
          const segmentStyle = getSegmentHighlightStyle(segmentIndex);
          return (
            <article
              className={`pdf-segment-card${segment.sourceBounds ? " layout-mapped" : ""}`}
              key={segment.id}
              style={segmentStyle}
            >
              <div className="pdf-segment-meta">
                <span className="pdf-segment-title">
                  <span aria-hidden="true" className="pdf-segment-index">
                    {numberFormatter.format(segmentIndex + 1)}
                  </span>
                  <span className="pdf-segment-id">{segment.id}</span>
                </span>
                <span className="pdf-segment-badges">
                  {segment.sourceBounds ? (
                    <span className="layout-dot">{t("pdfAuthoring.segments.positionMapped")}</span>
                  ) : null}
                  {translation?.cacheStatus ? (
                    <span className={`cache-dot ${translation.cacheStatus}`}>
                      {translation.cacheStatus === "hit"
                        ? t("pdfAuthoring.segments.cached")
                        : t("pdfAuthoring.segments.new")}
                    </span>
                  ) : null}
                </span>
              </div>
              <p className="pdf-segment-source">{segment.text}</p>
              <p className="pdf-segment-translation">
                {translation?.translationKo ?? t("pdfAuthoring.segments.notTranslated")}
              </p>
            </article>
          );
        })
      ) : (
        <div className="pdf-translation-placeholder">{t("pdfAuthoring.segments.empty")}</div>
      )}
    </div>
  );
}
