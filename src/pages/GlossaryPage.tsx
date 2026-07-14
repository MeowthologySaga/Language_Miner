import { BookMarked, BookOpen, CreditCard, Search } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  buildGlossaryEntries,
  filterGlossaryEntries,
  type GlossaryEntry
} from "../shared/glossary";
import type { StudyCard } from "../shared/types";
import { calculateVirtualListWindow } from "../shared/virtualList";

type GlossaryPageProps = {
  cards: StudyCard[];
  onNavigate: (route: "cards" | "pdfReader") => void;
};

const GLOSSARY_VIRTUALIZE_THRESHOLD = 120;
const GLOSSARY_ROW_HEIGHT = 64;
const GLOSSARY_DEFAULT_VIEWPORT_HEIGHT = 480;

export function GlossaryPage({ cards, onNavigate }: GlossaryPageProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(GLOSSARY_DEFAULT_VIEWPORT_HEIGHT);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const glossaryEntries = useMemo(() => buildGlossaryEntries(cards), [cards]);
  const filteredEntries = useMemo(
    () => filterGlossaryEntries(glossaryEntries, deferredSearchQuery),
    [deferredSearchQuery, glossaryEntries]
  );
  const hasGlossaryEntries = glossaryEntries.length > 0;
  const virtualized = filteredEntries.length >= GLOSSARY_VIRTUALIZE_THRESHOLD;
  const virtualWindow = calculateVirtualListWindow({
    itemCount: filteredEntries.length,
    rowHeight: GLOSSARY_ROW_HEIGHT,
    scrollTop,
    viewportHeight,
    overscan: 6
  });
  const visibleEntries = virtualized
    ? filteredEntries.slice(virtualWindow.startIndex, virtualWindow.endIndex)
    : filteredEntries;

  useEffect(() => {
    setScrollTop(0);
    viewportRef.current?.scrollTo({ top: 0 });
  }, [deferredSearchQuery]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const updateHeight = () => setViewportHeight(Math.max(1, element.clientHeight));
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, [virtualized]);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    if (virtualized) setScrollTop(event.currentTarget.scrollTop);
  }

  return (
    <div className="document-page glossary-page">
      <section className="export-history-panel" aria-labelledby="glossary-title">
        <div className="document-section-heading glossary-heading">
          <div className="glossary-heading-copy">
            <h1 id="glossary-title">{t("glossary.title")}</h1>
            <span>{t("glossary.totalCount", { count: glossaryEntries.length })}</span>
          </div>
          <div className="export-history-heading-actions">
            <button
              className="button secondary"
              data-qa="glossary-open-cards"
              type="button"
              onClick={() => onNavigate("cards")}
            >
              <CreditCard aria-hidden="true" size={17} />
              {t("glossary.openCards")}
            </button>
            <button
              className="button primary"
              data-qa="glossary-open-reader"
              type="button"
              onClick={() => onNavigate("pdfReader")}
            >
              <BookOpen aria-hidden="true" size={17} />
              {t("glossary.createCard")}
            </button>
          </div>
        </div>

        <div className="glossary-toolbar">
          <label className="glossary-search">
            <Search aria-hidden="true" size={16} />
            <span className="sr-only">{t("glossary.searchLabel")}</span>
            <input
              data-qa="glossary-search"
              type="search"
              placeholder={t("glossary.searchPlaceholder")}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </label>
          <span aria-live="polite" className="glossary-count">
            {t("glossary.visibleCount", { count: filteredEntries.length })}
          </span>
        </div>

        <div
          aria-colcount={4}
          aria-rowcount={filteredEntries.length + 1}
          className="glossary-table"
          role="table"
        >
          <div className="document-row document-row-head glossary-row" role="row">
            <span role="columnheader">{t("glossary.columns.term")}</span>
            <span role="columnheader">{t("glossary.columns.meaning")}</span>
            <span role="columnheader">{t("glossary.columns.policy")}</span>
            <span role="columnheader">{t("glossary.columns.source")}</span>
          </div>
          {filteredEntries.length > 0 ? (
            <div
              className={virtualized ? "glossary-virtual-viewport" : "glossary-row-group"}
              onScroll={handleScroll}
              ref={viewportRef}
              role="rowgroup"
              tabIndex={virtualized ? 0 : undefined}
            >
              {virtualized ? (
                <div
                  className="glossary-virtual-spacer"
                  role="presentation"
                  style={{ height: virtualWindow.totalHeight }}
                >
                  <div
                    className="glossary-virtual-window"
                    role="presentation"
                    style={{ transform: `translateY(${virtualWindow.offsetTop}px)` }}
                  >
                    {visibleEntries.map((entry, index) => (
                      <GlossaryRow
                        entry={entry}
                        key={entry.term}
                        rowIndex={virtualWindow.startIndex + index + 2}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                visibleEntries.map((entry, index) => (
                  <GlossaryRow entry={entry} key={entry.term} rowIndex={index + 2} />
                ))
              )}
            </div>
          ) : (
            <div role="row">
              <div
                aria-colspan={4}
                className="empty-document-state glossary-empty-state"
                role="cell"
              >
                <BookMarked aria-hidden="true" size={32} />
                <strong>
                  {hasGlossaryEntries
                    ? t("glossary.empty.noResultsTitle")
                    : t("glossary.empty.noTermsTitle")}
                </strong>
                <span>
                  {hasGlossaryEntries
                    ? t("glossary.empty.noResultsDescription")
                    : t("glossary.empty.noTermsDescription")}
                </span>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function GlossaryRow({ entry, rowIndex }: { entry: GlossaryEntry; rowIndex: number }) {
  const { t } = useTranslation();
  return (
    <div aria-rowindex={rowIndex} className="document-row glossary-row" role="row">
      <span className="glossary-term-cell" role="cell">
        <strong>{entry.term}</strong>
        <small>{entry.partOfSpeech}</small>
      </span>
      <span className="glossary-meaning-cell" role="cell">
        <strong>{entry.meaningKo || t("glossary.meaningNeeded")}</strong>
        {entry.sourcePreview ? <small>{entry.sourcePreview}</small> : null}
      </span>
      <span role="cell">
        <span className="glossary-policy-pill">{t("glossary.policy.cardBased")}</span>
      </span>
      <span className="glossary-source-cell" role="cell">
        {t("glossary.cardCount", { count: entry.sourceCardCount })}
        {entry.exampleCount > 0 ? (
          <small>{t("glossary.exampleCount", { count: entry.exampleCount })}</small>
        ) : null}
      </span>
    </div>
  );
}
