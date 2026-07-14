import {
  AlertTriangle,
  BookOpen,
  Cloud,
  Download,
  Link2,
  Lightbulb,
  RefreshCw,
  SlidersHorizontal,
  Plus,
  Tags,
  Trash2,
  Unlink,
  Upload,
  CreditCard,
  X
} from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTranslation } from "react-i18next";
import { CardPreview } from "../components/CardPreview";
import { Dialog } from "../components/Dialog";
import type { LocalEnglishMinerApi } from "../data/api";
import { dismissDefaultSampleCard } from "../defaultSampleCardDismissal";
import {
  getCardDeckFilterLabel,
  getCardDeckLabel,
  getCardDeckShortLabel,
  type CardDeckLabelLocale,
  type CardDeckFilter
} from "../shared/cardDeck";
import { sanitizeSecretStatusMessage } from "../shared/settingsStatus";
import { isDefaultSampleCardId } from "../shared/defaultSampleCards";
import {
  CARD_TAG_UNTAGGED_FILTER,
  getCardTagCounts,
  getCardTagKey,
  getCardTags,
  matchesCardTagFilters,
  normalizeCardTags,
  splitCardTagInput,
  withCardTags
} from "../shared/cardTags";
import type { AppSettings, CardSyncSettings, CardSyncStatus, StudyCard } from "../shared/types";
import { calculateVirtualListWindow } from "../shared/virtualList";
import {
  CARD_LIST_DEFAULT_VIEWPORT_HEIGHT,
  CARD_LIST_VIRTUALIZATION_THRESHOLD,
  CARD_LIST_VIRTUAL_OVERSCAN,
  CARD_LIST_VIRTUAL_ROW_HEIGHT,
  getScrollTopForVirtualCardIndex,
  getVirtualCardNavigationIndex
} from "./cardsPageVirtualization";

type CardsPageProps = {
  api: LocalEnglishMinerApi;
  cards: StudyCard[];
  settings: AppSettings;
  onCardsChanged: () => Promise<void>;
  onSettingsChange: (settings: AppSettings) => void;
  onStartWritingPractice?: (card: StudyCard, promptIndex?: number) => void;
  onNavigate?: (route: "pdfReader" | "life" | "settings") => void;
};

export function CardsPage({
  api,
  cards,
  settings,
  onCardsChanged,
  onSettingsChange,
  onStartWritingPractice,
  onNavigate
}: CardsPageProps) {
  const { i18n, t } = useTranslation();
  const appLocale: CardDeckLabelLocale = (i18n.resolvedLanguage ?? i18n.language).startsWith(
    "en"
  )
    ? "en"
    : "ko";
  const cardPreviewLabels: CardPreviewLabels = {
    conflict: t("cards.previewLabels.conflict"),
    earlierContext: t("cards.previewLabels.earlierContext"),
    earlierMessages: (count) => t("cards.previewLabels.earlierMessages", {
      count,
      formattedCount: formatCardCount(count, appLocale)
    })
  };
  const [selectedCardId, setSelectedCardId] = useState<string | null>(cards[0]?.id ?? null);
  const [deckFilter, setDeckFilter] = useState<CardDeckFilter>("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isTagEditorOpen, setIsTagEditorOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagStatus, setTagStatus] = useState("");
  const [tagStatusIsError, setTagStatusIsError] = useState(false);
  const [isSavingTags, setIsSavingTags] = useState(false);
  const [syncStatus, setSyncStatus] = useState<CardSyncStatus | null>(null);
  const [syncMessage, setSyncMessage] = useState("");
  const [syncMessageIsError, setSyncMessageIsError] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<StudyCard | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const cardListRef = useRef<HTMLDivElement>(null);
  const pendingFocusIndexRef = useRef<number | null>(null);
  const [cardListScrollTop, setCardListScrollTop] = useState(0);
  const [cardListViewportHeight, setCardListViewportHeight] = useState(
    CARD_LIST_DEFAULT_VIEWPORT_HEIGHT
  );
  const [isFilterExpanded, setIsFilterExpanded] = useState(() =>
    typeof window === "undefined" ? true : !window.matchMedia("(max-width: 1100px)").matches
  );
  const syncSettings = useMemo<CardSyncSettings>(
    () => ({
      folderPath: settings.cardSyncFolderPath
    }),
    [settings.cardSyncFolderPath]
  );
  const deckCards = useMemo(
    () => cards.filter((card) => deckFilter === "all" || card.deckType === deckFilter),
    [cards, deckFilter]
  );
  const tagCounts = useMemo(() => getCardTagCounts(deckCards), [deckCards]);
  const allTagCounts = useMemo(() => getCardTagCounts(cards), [cards]);
  const untaggedCount = useMemo(
    () => deckCards.filter((card) => getCardTags(card).length === 0).length,
    [deckCards]
  );
  const filteredCards = useMemo(
    () => deckCards.filter((card) => matchesCardTagFilters(card, selectedTags)),
    [deckCards, selectedTags]
  );
  const isCardListVirtualized = filteredCards.length >= CARD_LIST_VIRTUALIZATION_THRESHOLD;
  const virtualCardWindow = useMemo(
    () =>
      calculateVirtualListWindow({
        itemCount: filteredCards.length,
        rowHeight: CARD_LIST_VIRTUAL_ROW_HEIGHT,
        scrollTop: isCardListVirtualized ? cardListScrollTop : 0,
        viewportHeight: cardListViewportHeight,
        overscan: CARD_LIST_VIRTUAL_OVERSCAN
      }),
    [
      cardListScrollTop,
      cardListViewportHeight,
      filteredCards.length,
      isCardListVirtualized
    ]
  );
  const renderedCardStartIndex = isCardListVirtualized ? virtualCardWindow.startIndex : 0;
  const renderedCards = useMemo(
    () =>
      isCardListVirtualized
        ? filteredCards.slice(virtualCardWindow.startIndex, virtualCardWindow.endIndex)
        : filteredCards,
    [
      filteredCards,
      isCardListVirtualized,
      virtualCardWindow.endIndex,
      virtualCardWindow.startIndex
    ]
  );
  const selectedCard =
    filteredCards.find((card) => card.id === selectedCardId) ?? filteredCards[0] ?? null;

  useEffect(() => {
    if (filteredCards.length === 0) {
      setSelectedCardId(null);
      return;
    }
    if (!selectedCardId || !filteredCards.some((card) => card.id === selectedCardId)) {
      setSelectedCardId(filteredCards[0].id);
      if (cardListRef.current) {
        cardListRef.current.scrollTop = 0;
      }
      setCardListScrollTop(0);
    }
  }, [filteredCards, selectedCardId]);

  const cardFilterSignature = `${deckFilter}\u0000${selectedTags.join("\u0000")}`;

  useEffect(() => {
    const list = cardListRef.current;
    if (list) {
      list.scrollTop = 0;
    }
    setCardListScrollTop(0);
  }, [cardFilterSignature]);

  useEffect(() => {
    const list = cardListRef.current;
    if (!list) {
      return;
    }

    const updateViewportHeight = () => {
      if (list.clientHeight > 0) {
        setCardListViewportHeight(list.clientHeight);
      }
    };
    updateViewportHeight();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateViewportHeight);
      return () => window.removeEventListener("resize", updateViewportHeight);
    }

    const observer = new ResizeObserver(updateViewportHeight);
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const pendingIndex = pendingFocusIndexRef.current;
    if (pendingIndex === null) {
      return;
    }
    const button = cardListRef.current?.querySelector<HTMLButtonElement>(
      `[data-card-index="${pendingIndex}"]`
    );
    if (button) {
      pendingFocusIndexRef.current = null;
      button.focus();
    }
  }, [selectedCardId, virtualCardWindow.endIndex, virtualCardWindow.startIndex]);

  useEffect(() => {
    const available = new Set(tagCounts.map(({ tag }) => getCardTagKey(tag)));
    setSelectedTags((current) =>
      current.filter(
        (tag) =>
          (tag === CARD_TAG_UNTAGGED_FILTER && untaggedCount > 0) ||
          available.has(getCardTagKey(tag))
      )
    );
  }, [tagCounts, untaggedCount]);

  useEffect(() => {
    setIsTagEditorOpen(false);
    setTagInput("");
    setTagStatus("");
    setTagStatusIsError(false);
  }, [selectedCardId]);

  async function deleteCard(card: StudyCard) {
    setIsDeleting(true);
    setDeleteError("");
    try {
      const deleted = await api.cards.delete(card.id);
      if (!deleted) {
        throw new Error("card-delete-failed");
      }
      if (isDefaultSampleCardId(card.id)) {
        dismissDefaultSampleCard(localStorage, card.profileId ?? settings.profileId, card.id);
      }
      setSelectedCardId(null);
      setDeleteCandidate(null);
      await onCardsChanged();
    } catch {
      setDeleteError(t("cards.delete.failed"));
    } finally {
      setIsDeleting(false);
    }
  }

  function toggleTagFilter(tag: string) {
    setSelectedTags((current) =>
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]
    );
  }

  function openTagEditor(card: StudyCard) {
    setTagDraft(getCardTags(card));
    setTagInput("");
    setTagStatus("");
    setTagStatusIsError(false);
    setIsTagEditorOpen(true);
  }

  function addDraftTags(values: string[]) {
    setTagDraft((current) => normalizeCardTags([...current, ...values]));
    setTagInput("");
  }

  async function saveTags() {
    if (!selectedCard) {
      return;
    }
    const nextTags = normalizeCardTags([...tagDraft, ...splitCardTagInput(tagInput)]);
    setIsSavingTags(true);
    setTagStatus(t("cards.tags.saving"));
    setTagStatusIsError(false);
    try {
      const saved = await api.cards.save(withCardTags(selectedCard, nextTags));
      setSelectedCardId(saved.id);
      setTagDraft(getCardTags(saved));
      setTagInput("");
      setTagStatus(t("cards.tags.saved"));
      setTagStatusIsError(false);
      await onCardsChanged();
    } catch (caught) {
      setTagStatus(getErrorMessage(caught, t("cards.tags.saveFailed")));
      setTagStatusIsError(true);
    } finally {
      setIsSavingTags(false);
    }
  }

  const loadSyncStatus = useCallback(async () => {
    try {
      const status = await api.cardSync.status(syncSettings);
      setSyncStatus(status);
      setSyncMessage(sanitizeSecretStatusMessage(status.message));
      setSyncMessageIsError(false);
    } catch (caught) {
      setSyncStatus(null);
      setSyncMessage(
        sanitizeSecretStatusMessage(
          getErrorMessage(caught, t("cards.sync.statusFailed"))
        )
      );
      setSyncMessageIsError(true);
    }
  }, [api.cardSync, syncSettings, t]);

  useEffect(() => {
    if (!isFilterExpanded) {
      return;
    }
    void loadSyncStatus();
  }, [isFilterExpanded, loadSyncStatus]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1100px)");
    const handleChange = (event: MediaQueryListEvent) => setIsFilterExpanded(!event.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  async function runSyncAction(
    action: () => Promise<{ message: string; folderPath?: string; connected?: boolean; configured?: boolean }>,
    options: { reloadCards?: boolean } = {}
  ) {
    setIsSyncing(true);
    setSyncMessage(t("cards.sync.working"));
    setSyncMessageIsError(false);
    try {
      const result = await action();
      const isStatusResult =
        typeof result.connected === "boolean" && typeof result.configured === "boolean";
      if (typeof result.folderPath === "string" && result.folderPath !== settings.cardSyncFolderPath) {
        onSettingsChange({
          ...settings,
          cardSyncFolderPath: result.folderPath
        });
      }
      setSyncMessage(sanitizeSecretStatusMessage(result.message));
      setSyncMessageIsError(false);
      if (isStatusResult) {
        setSyncStatus(result as CardSyncStatus);
      }
      if (options.reloadCards) {
        await onCardsChanged();
      }
      if (!isStatusResult) {
        await loadSyncStatus();
      }
    } catch (caught) {
      setSyncMessage(
        sanitizeSecretStatusMessage(getErrorMessage(caught, t("cards.sync.actionFailed")))
      );
      setSyncMessageIsError(true);
    } finally {
      setIsSyncing(false);
    }
  }

  const isSyncConfigured = Boolean(settings.cardSyncFolderPath.trim());
  const isSyncConnected = Boolean(syncStatus?.connected);

  function focusCardAtIndex(index: number) {
    if (filteredCards.length === 0) {
      return;
    }
    const nextIndex = Math.min(filteredCards.length - 1, Math.max(0, index));
    const nextCard = filteredCards[nextIndex];
    const list = cardListRef.current;

    pendingFocusIndexRef.current = nextIndex;
    setSelectedCardId(nextCard.id);

    if (!list || !isCardListVirtualized) {
      return;
    }

    const viewportHeight = list.clientHeight || cardListViewportHeight;
    const nextScrollTop = getScrollTopForVirtualCardIndex({
      index: nextIndex,
      itemCount: filteredCards.length,
      rowHeight: CARD_LIST_VIRTUAL_ROW_HEIGHT,
      viewportHeight,
      currentScrollTop: list.scrollTop
    });
    if (nextScrollTop !== list.scrollTop) {
      list.scrollTop = nextScrollTop;
    }
    setCardListScrollTop(nextScrollTop);
  }

  function handleCardListKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    cardIndex: number
  ) {
    const pageSize = Math.max(
      1,
      Math.floor(cardListViewportHeight / CARD_LIST_VIRTUAL_ROW_HEIGHT)
    );
    const nextIndex = getVirtualCardNavigationIndex({
      key: event.key,
      currentIndex: cardIndex,
      itemCount: filteredCards.length,
      pageSize
    });
    if (nextIndex === null) {
      return;
    }

    event.preventDefault();
    focusCardAtIndex(nextIndex);
  }

  return (
    <div className="page-grid cards-layout">
      <h1 className="sr-only">{t("cards.title")}</h1>
      <aside className={`panel cards-filter-panel${isFilterExpanded ? " expanded" : ""}`}>
        <div className="panel-heading">
          <SlidersHorizontal size={19} />
          <h2>{t("cards.filters.title")}</h2>
          <span className="pill">{formatCardCount(cards.length, appLocale)}</span>
          <button
            aria-controls="cards-filter-body"
            aria-expanded={isFilterExpanded}
            className="button ghost small cards-filter-toggle"
            data-qa="cards-filter-toggle"
            type="button"
            onClick={() => setIsFilterExpanded((expanded) => !expanded)}
          >
            {isFilterExpanded ? t("cards.filters.collapse") : t("cards.filters.expand")}
          </button>
        </div>
        <div className="cards-filter-body" id="cards-filter-body">
        {isFilterExpanded ? (
        <>
        <div className="card-sync-panel">
          <div className="card-sync-heading">
            <Cloud size={17} />
            <div>
              <strong>{t("cards.sync.title")}</strong>
              <small>{t("cards.sync.description")}</small>
            </div>
          </div>
          <div className={isSyncConnected ? "card-sync-config ready" : "card-sync-config"}>
            <span>
              {isSyncConfigured ? t("cards.sync.configured") : t("cards.sync.required")}
            </span>
            <small>
              {isSyncConfigured
                ? t("cards.sync.locationHidden")
                : t("cards.sync.folderHint")}
            </small>
          </div>
          <div className="card-sync-options" aria-label={t("cards.sync.autoSettings")}>
            <label className="toggle-field compact-toggle">
              <input
                checked={settings.cardSyncOnStartup}
                type="checkbox"
                onChange={(event) =>
                  onSettingsChange({
                    ...settings,
                    cardSyncOnStartup: event.target.checked
                  })
                }
              />
              <span>
                <strong>{t("cards.sync.onStartup")}</strong>
                <small>{t("cards.sync.onStartupHint")}</small>
              </span>
            </label>
            <label className="toggle-field compact-toggle">
              <input
                checked={settings.cardSyncOnQuit}
                type="checkbox"
                onChange={(event) =>
                  onSettingsChange({
                    ...settings,
                    cardSyncOnQuit: event.target.checked
                  })
                }
              />
              <span>
                <strong>{t("cards.sync.onQuit")}</strong>
                <small>{t("cards.sync.onQuitHint")}</small>
              </span>
            </label>
          </div>
          <div className="card-sync-actions">
            <button
              className="button secondary small"
              disabled={isSyncing}
              type="button"
              onClick={() => void runSyncAction(() => api.cardSync.connect(syncSettings))}
            >
              <Link2 size={15} />
              {t("cards.sync.selectFolder")}
            </button>
            <button
              className="button ghost small"
              disabled={!isSyncConfigured || isSyncing}
              type="button"
              onClick={() => void runSyncAction(() => api.cardSync.disconnect())}
            >
              <Unlink size={15} />
              {t("cards.sync.disconnect")}
            </button>
            <button
              className="button ghost small"
              data-qa="cards-sync-status-button"
              disabled={!isSyncConfigured || isSyncing}
              type="button"
              onClick={() => void runSyncAction(() => api.cardSync.status(syncSettings))}
            >
              <RefreshCw size={15} />
              {t("common.confirm")}
            </button>
          </div>
          <div className="card-sync-actions">
            <button
              className="button secondary small"
              disabled={!isSyncConnected || isSyncing}
              type="button"
              onClick={() => void runSyncAction(() => api.cardSync.upload(syncSettings))}
            >
              <Upload size={15} />
              {t("cards.sync.upload")}
            </button>
            <button
              className="button secondary small"
              disabled={!isSyncConnected || isSyncing}
              type="button"
              onClick={() =>
                void runSyncAction(() => api.cardSync.download(syncSettings), {
                  reloadCards: true
                })
              }
            >
              <Download size={15} />
              {t("cards.sync.download")}
            </button>
            <button
              className="button primary small"
              disabled={!isSyncConnected || isSyncing}
              type="button"
              onClick={() =>
                void runSyncAction(() => api.cardSync.sync(syncSettings), {
                  reloadCards: true
                })
              }
            >
              <RefreshCw size={15} />
              {t("cards.sync.sync")}
            </button>
          </div>
          <p
            aria-live={syncMessageIsError ? "assertive" : "polite"}
            className={syncMessageIsError
              ? "status-text danger compact"
              : isSyncConnected
                ? "status-text compact"
                : "muted compact"}
            role={syncMessageIsError ? "alert" : "status"}
          >
            {syncMessage || t("cards.sync.checking")}
          </p>
          {syncStatus?.remoteModifiedAt ? (
            <small className="muted compact">
              {t("cards.sync.lastModified", {
                date: formatCardDateTime(
                  syncStatus.remoteModifiedAt,
                  appLocale,
                  t("common.unknown")
                )
              })}
            </small>
          ) : null}
        </div>
        <div
          aria-label={t("cards.filters.deckLabel")}
          className="segmented-control compact deck-filter"
          role="group"
        >
          {(["all", "input", "input-listening", "output"] as CardDeckFilter[]).map((filter) => (
            <button
              aria-pressed={deckFilter === filter}
              key={filter}
              className={deckFilter === filter ? "active" : ""}
              type="button"
              onClick={() => {
                setDeckFilter(filter);
                setSelectedTags([]);
              }}
            >
              {getCardDeckFilterLabel(filter, appLocale)}
            </button>
          ))}
        </div>
        <section className="card-tag-filter" data-qa="card-tag-filter">
          <div className="card-tag-filter-heading">
            <span><Tags size={15} />{t("cards.tags.title")}</span>
            {selectedTags.length ? (
              <button className="button ghost small" type="button" onClick={() => setSelectedTags([])}>
                {t("cards.tags.clearSelection")}
              </button>
            ) : (
              <small>{t("cards.tags.matchAny")}</small>
            )}
          </div>
          <div className="card-tag-filter-list">
            {tagCounts.map(({ tag, count }) => (
              <button
                aria-pressed={selectedTags.includes(tag)}
                className={selectedTags.includes(tag) ? "card-tag-chip selected" : "card-tag-chip"}
                key={tag}
                type="button"
                onClick={() => toggleTagFilter(tag)}
              >
                <span>#{tag}</span>
                <small>{formatCardCount(count, appLocale)}</small>
              </button>
            ))}
            {untaggedCount ? (
              <button
                aria-pressed={selectedTags.includes(CARD_TAG_UNTAGGED_FILTER)}
                className={
                  selectedTags.includes(CARD_TAG_UNTAGGED_FILTER)
                    ? "card-tag-chip untagged selected"
                    : "card-tag-chip untagged"
                }
                type="button"
                onClick={() => toggleTagFilter(CARD_TAG_UNTAGGED_FILTER)}
              >
                <span>{t("cards.tags.none")}</span>
                <small>{formatCardCount(untaggedCount, appLocale)}</small>
              </button>
            ) : null}
            {!tagCounts.length && !untaggedCount ? (
              <small>{t("cards.tags.noTagsToShow")}</small>
            ) : null}
          </div>
        </section>
        </>
        ) : null}
        </div>
      </aside>
      <section className="panel cards-list-panel">
        <div className="panel-heading cards-list-heading">
          <CreditCard size={19} />
          <h2>{t("cards.listTitle")}</h2>
          <span className="pill">{formatCardCount(filteredCards.length, appLocale)}</span>
        </div>
        <div
          aria-label={t("cards.listTitle")}
          className={`card-list cards-list-scroll-region${
            isCardListVirtualized ? " cards-list-virtualized" : ""
          }`}
          ref={cardListRef}
          role="listbox"
          onScroll={(event) => {
            if (isCardListVirtualized) {
              setCardListScrollTop(event.currentTarget.scrollTop);
            }
          }}
        >
          <div
            className={
              isCardListVirtualized ? "cards-list-virtual-spacer" : "cards-list-static-contents"
            }
            role="presentation"
            style={
              isCardListVirtualized
                ? { height: `${virtualCardWindow.totalHeight}px` }
                : undefined
            }
          >
          <div
            className={
              isCardListVirtualized ? "cards-list-virtual-window" : "cards-list-static-contents"
            }
            role="presentation"
            style={
              isCardListVirtualized
                ? { transform: `translateY(${virtualCardWindow.offsetTop}px)` }
                : undefined
            }
          >
          {renderedCards.map((card, renderedIndex) => {
            const cardIndex = renderedCardStartIndex + renderedIndex;
            const preview = getCardListPreview(card, appLocale, cardPreviewLabels);
            const cardTags = getCardTags(card);
            return (
              <button
                aria-posinset={cardIndex + 1}
                aria-selected={selectedCard?.id === card.id}
                aria-setsize={filteredCards.length}
                data-card-index={cardIndex}
                data-card-list-item="true"
                key={card.id}
                role="option"
                tabIndex={selectedCard?.id === card.id ? 0 : -1}
                className={`card-list-item ${selectedCard?.id === card.id ? "selected" : ""}`}
                type="button"
                onClick={() => setSelectedCardId(card.id)}
                onKeyDown={(event) => handleCardListKeyDown(event, cardIndex)}
              >
                <span className="card-list-title">
                  <span className={`card-list-deck-badge deck-${card.deckType}`}>
                    {getCardDeckShortLabel(card, appLocale)}
                  </span>
                  <span>{preview.title}</span>
                </span>
                <small>{preview.subtitle}</small>
                {cardTags.length ? (
                  <span className="card-list-tags">
                    {cardTags.slice(0, 2).map((tag) => <i key={tag}>#{tag}</i>)}
                    {cardTags.length > 2 ? (
                      <i>+{formatCardCount(cardTags.length - 2, appLocale)}</i>
                    ) : null}
                  </span>
                ) : null}
              </button>
            );
          })}
          </div>
          </div>
          {filteredCards.length === 0 ? (
            <div className="empty-state" data-qa="cards-empty-state">
              <span>{t("cards.empty.title")}</span>
              {onNavigate ? (
                <div className="empty-state-actions">
                  <button
                    className="button primary small"
                    data-qa="cards-empty-open-reader"
                    type="button"
                    onClick={() => onNavigate("pdfReader")}
                  >
                    <BookOpen size={15} />
                    {t("cards.empty.openReader")}
                  </button>
                  <button
                    className="button secondary small"
                    data-qa="cards-empty-open-life"
                    type="button"
                    onClick={() => onNavigate("life")}
                  >
                    <Lightbulb size={15} />
                    {t("nav.lifeMining")}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
      <section className="panel detail-panel">
        {selectedCard ? (
          <>
            <div className="detail-toolbar">
              <div className="detail-toolbar-meta">
                <strong>{t("cards.preview")}</strong>
                <span className="pill">
                  {t("cards.reviewDue", {
                    date: formatCardDateTime(
                      selectedCard.srs.dueAt,
                      appLocale,
                      t("common.unknown")
                    )
                  })}
                </span>
              </div>
              <div className="detail-toolbar-actions">
                <button
                  className="button ghost small"
                  data-qa="card-tag-edit-open"
                  type="button"
                  onClick={() =>
                    isTagEditorOpen ? setIsTagEditorOpen(false) : openTagEditor(selectedCard)
                  }
                >
                  <Tags size={15} />
                  {t("cards.tags.edit")}
                </button>
                <button
                  aria-label={t("cards.delete.label")}
                  className="icon-button danger"
                  title={t("cards.delete.label")}
                  type="button"
                  onClick={() => {
                    setDeleteError("");
                    setDeleteCandidate(selectedCard);
                  }}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
            {isTagEditorOpen ? (
              <section className="card-tag-editor" data-qa="card-tag-editor">
                <div className="card-tag-editor-heading">
                  <div>
                    <span>{t("cards.tags.classification")}</span>
                    <strong>{t("cards.tags.edit")}</strong>
                  </div>
                  <button
                    aria-label={t("cards.tags.closeEditor")}
                    className="icon-button"
                    type="button"
                    onClick={() => setIsTagEditorOpen(false)}
                  >
                    <X size={17} />
                  </button>
                </div>
                <div className="card-tag-draft-list">
                  {tagDraft.map((tag) => (
                    <span className="card-tag-draft" key={tag}>
                      #{tag}
                      <button
                        aria-label={t("cards.tags.deleteTag", { tag })}
                        type="button"
                        onClick={() =>
                          setTagDraft((current) => current.filter((item) => item !== tag))
                        }
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  {!tagDraft.length ? <small>{t("cards.tags.empty")}</small> : null}
                </div>
                <div className="card-tag-input-row">
                  <input
                    aria-label={t("cards.tags.inputLabel")}
                    className="text-input"
                    placeholder={t("cards.tags.placeholder")}
                    value={tagInput}
                    onChange={(event) => setTagInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === ",") {
                        event.preventDefault();
                        addDraftTags(splitCardTagInput(tagInput));
                      }
                    }}
                  />
                  <button
                    className="button secondary"
                    disabled={!tagInput.trim()}
                    type="button"
                    onClick={() => addDraftTags(splitCardTagInput(tagInput))}
                  >
                    <Plus size={15} />
                    {t("cards.tags.add")}
                  </button>
                </div>
                {allTagCounts.some(({ tag }) => !tagDraft.includes(tag)) ? (
                  <div className="card-tag-suggestions">
                    <small>{t("cards.tags.existing")}</small>
                    <div>
                      {allTagCounts
                        .filter(({ tag }) => !tagDraft.includes(tag))
                        .slice(0, 10)
                        .map(({ tag }) => (
                          <button key={tag} type="button" onClick={() => addDraftTags([tag])}>
                            + #{tag}
                          </button>
                        ))}
                    </div>
                  </div>
                ) : null}
                <div className="card-tag-editor-actions">
                  <span
                    aria-live={tagStatusIsError ? "assertive" : "polite"}
                    className={tagStatusIsError ? "status-text danger" : "status-text"}
                    role={tagStatusIsError ? "alert" : "status"}
                  >
                    {tagStatus}
                  </span>
                  <button className="button secondary" type="button" onClick={() => setIsTagEditorOpen(false)}>
                    {t("common.cancel")}
                  </button>
                  <button
                    className="button primary"
                    data-qa="card-tag-save"
                    disabled={isSavingTags}
                    type="button"
                    onClick={() => void saveTags()}
                  >
                    {isSavingTags ? t("cards.tags.saving") : t("cards.tags.save")}
                  </button>
                </div>
              </section>
            ) : null}
            <CardPreview
              card={selectedCard}
              settings={settings}
              defaultShowBack
              onStartWritingPractice={onStartWritingPractice}
            />
          </>
        ) : (
          <div className="empty-state">{t("cards.empty.noSelection")}</div>
        )}
      </section>
      {deleteCandidate ? (
        <Dialog
          ariaLabelledBy="card-delete-title"
          backdropClassName="card-delete-modal-backdrop"
          className="card-delete-modal"
          closeOnBackdrop={!isDeleting}
          closeOnEscape={!isDeleting}
          onClose={() => {
            if (!isDeleting) {
              setDeleteCandidate(null);
              setDeleteError("");
            }
          }}
        >
            <div className="card-delete-modal-heading">
              <span>
                <AlertTriangle size={18} />
              </span>
              <div>
                <h2 id="card-delete-title">{t("cards.delete.title")}</h2>
                <p>{t("cards.delete.description")}</p>
              </div>
            </div>
            <div className="card-delete-preview">
              <span className={`card-list-deck-badge deck-${deleteCandidate.deckType}`}>
                {getCardDeckShortLabel(deleteCandidate, appLocale)}
              </span>
              <strong>{getCardListPreview(deleteCandidate, appLocale, cardPreviewLabels).title}</strong>
              <small>{getCardListPreview(deleteCandidate, appLocale, cardPreviewLabels).subtitle}</small>
            </div>
            {deleteError ? (
              <p className="status-text danger" role="alert">{deleteError}</p>
            ) : null}
            <div className="card-delete-modal-actions">
              <button
                className="button secondary"
                disabled={isDeleting}
                type="button"
                onClick={() => {
                  setDeleteCandidate(null);
                  setDeleteError("");
                }}
              >
                {t("common.cancel")}
              </button>
              <button
                className="button secondary danger-button"
                disabled={isDeleting}
                type="button"
                onClick={() => void deleteCard(deleteCandidate)}
              >
                {isDeleting ? t("cards.delete.deleting") : t("common.delete")}
              </button>
            </div>
        </Dialog>
      ) : null}
    </div>
  );
}

type CardPreviewLabels = {
  conflict: string;
  earlierContext: string;
  earlierMessages: (count: number) => string;
};

function getCardListPreview(
  card: StudyCard,
  locale: CardDeckLabelLocale,
  labels: CardPreviewLabels
) {
  const prefix = card.syncMetadata?.conflict ? `${labels.conflict} · ` : "";
  if (card.deckType === "input-listening") {
    return prefixPreview(getListeningCardListPreview(card, locale), prefix);
  }

  if (card.cardType === "life_expression" || card.deckType === "output") {
    return prefixPreview(getOutputCardListPreview(card, locale, labels), prefix);
  }

  return prefixPreview(getInputCardListPreview(card, locale), prefix);
}

function prefixPreview(preview: { title: string; subtitle: string }, prefix: string) {
  if (!prefix) {
    return preview;
  }
  return {
    ...preview,
    title: `${prefix}${preview.title}`
  };
}

function getListeningCardListPreview(card: StudyCard, locale: CardDeckLabelLocale) {
  const title =
    firstMeaningfulLine(card.sourceSentence || card.frontText) || getCardDeckLabel(card, locale);
  const videoLine = splitMeaningfulLines(card.structureNote).find((line) =>
    /^(?:영상|Video|YouTube)/i.test(line)
  );

  return {
    title,
    subtitle:
      videoLine?.replace(/^(?:영상|Video)\s*[:：]\s*/i, "") ||
      getCardDeckLabel(card, locale)
  };
}

function getInputCardListPreview(card: StudyCard, locale: CardDeckLabelLocale) {
  const terms = getUniquePreviewTerms([
    ...card.vocabularyItems.map((item) => item.term),
    ...card.highlightMappings.map((mapping) => mapping.sourceText)
  ]);
  const fallback =
    firstMeaningfulLine(card.frontText || card.sourceSentence) || getCardDeckLabel(card, locale);
  const title = terms.length ? formatTermsTitle(terms, locale) : fallback;
  const subtitle =
    firstMeaningfulLine(card.sourceSentence || card.frontText) ||
    (title === fallback ? getCardDeckLabel(card, locale) : fallback);

  return {
    title,
    subtitle
  };
}

function getOutputCardListPreview(
  card: StudyCard,
  locale: CardDeckLabelLocale,
  labels: CardPreviewLabels
) {
  const title =
    firstMeaningfulLine(card.sourceSentence) ||
    extractMeLineFromFrontText(card.frontText) ||
    lastMeaningfulLine(card.frontText) ||
    getCardDeckLabel(card, locale);

  return {
    title,
    subtitle: getOutputCardSubtitle(card.frontText, labels) || getCardDeckLabel(card, locale)
  };
}

function getOutputCardSubtitle(frontText: string, labels: CardPreviewLabels) {
  const originalLines = getOriginalSectionLines(frontText);
  if (originalLines.length === 0) {
    return "";
  }

  const meIndex = originalLines.findIndex(isMeLine);
  const contextLines = (meIndex >= 0 ? originalLines.slice(0, meIndex) : originalLines)
    .map((line) => line.trim())
    .filter((line) => line && !isCardFrontHeading(line));

  if (contextLines.length === 0) {
    return "";
  }

  const speakerLabels = contextLines
    .map(extractSpeakerLabel)
    .filter((label): label is string => Boolean(label && !isMeSpeaker(label)));
  const sourceLabel = normalizeSourceLabel(speakerLabels[0]);
  const contextCount = Math.max(1, speakerLabels.length || contextLines.length);
  const contextLabel =
    sourceLabel === "ChatGPT" || sourceLabel === "Claude"
      ? labels.earlierContext
      : labels.earlierMessages(contextCount);

  return sourceLabel ? `${sourceLabel} · ${contextLabel}` : contextLabel;
}

function extractMeLineFromFrontText(frontText: string) {
  const meLine = getOriginalSectionLines(frontText).find(isMeLine);
  if (!meLine) {
    return "";
  }
  return normalizePreviewText(meLine.replace(/^\s*(?:Me|나|내 말)\s*[:：]\s*/i, ""));
}

function getOriginalSectionLines(frontText: string) {
  const lines = splitNormalizedLines(frontText);
  const originalHeadingIndex = lines.findIndex((line) =>
    /^(?:원문|original|conversation)$/i.test(line.trim())
  );
  const scopedLines = originalHeadingIndex >= 0 ? lines.slice(originalHeadingIndex + 1) : lines;
  return scopedLines.filter((line) => !isCardFrontHeading(line));
}

function firstMeaningfulLine(value: string | undefined) {
  return splitMeaningfulLines(value)[0] ?? "";
}

function lastMeaningfulLine(value: string | undefined) {
  const lines = splitMeaningfulLines(value);
  return lines[lines.length - 1] ?? "";
}

function splitMeaningfulLines(value: string | undefined) {
  return splitNormalizedLines(value).filter((line) => !isCardFrontHeading(line));
}

function splitNormalizedLines(value: string | undefined) {
  return String(value || "")
    .split(/\n+/)
    .map(normalizePreviewText)
    .filter(Boolean);
}

function normalizePreviewText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function isCardFrontHeading(line: string) {
  return /^(?:맥락|원문|context|original|conversation)$/i.test(line.trim());
}

function isMeLine(line: string) {
  return /^\s*(?:Me|나|내 말)\s*[:：]/i.test(line);
}

function isMeSpeaker(label: string) {
  return /^(?:Me|나|내 말)$/i.test(label.trim());
}

function extractSpeakerLabel(line: string) {
  const match = line.match(/^\s*([^:：]{1,40})\s*[:：]/);
  return match?.[1]?.trim();
}

function normalizeSourceLabel(label: string | undefined) {
  const normalized = normalizePreviewText(label || "");
  if (!normalized) {
    return "";
  }
  if (/chatgpt|gpt/i.test(normalized)) {
    return "ChatGPT";
  }
  if (/claude/i.test(normalized)) {
    return "Claude";
  }
  if (/discord/i.test(normalized)) {
    return "Discord";
  }
  return normalized;
}

function getUniquePreviewTerms(values: string[]) {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const value of values) {
    const term = normalizePreviewText(value);
    const key = term.toLowerCase();
    if (!term || seen.has(key)) {
      continue;
    }
    seen.add(key);
    terms.push(term);
  }
  return terms;
}

function getErrorMessage(_error: unknown, fallback: string) {
  return fallback;
}

function formatCardCount(value: number, locale: CardDeckLabelLocale) {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "ko-KR").format(value);
}

function formatCardDateTime(
  value: string,
  locale: CardDeckLabelLocale,
  invalidFallback: string
) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? invalidFallback
    : new Intl.DateTimeFormat(locale === "en" ? "en-US" : "ko-KR", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(date);
}

function formatTermsTitle(terms: string[], locale: CardDeckLabelLocale) {
  const visibleTerms = terms.slice(0, 3).join(", ");
  const hiddenCount = terms.length - 3;
  return hiddenCount > 0
    ? `${visibleTerms} +${formatCardCount(hiddenCount, locale)}`
    : visibleTerms;
}
