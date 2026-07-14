import {
  ArrowLeft,
  ArrowRight,
  BookmarkPlus,
  Check,
  Clock3,
  CreditCard,
  Home,
  Languages,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  X
} from "lucide-react";
import type { TFunction } from "i18next";
import "../styles/webReader.css";
import {
  type CSSProperties,
  type FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTranslation } from "react-i18next";
import { CardGenerationUsageEstimate } from "../components/CardGenerationUsageEstimate";
import { CardPreview } from "../components/CardPreview";
import {
  useCloudTranslationPreflight
} from "../components/CloudTranslationPreflightDialog";
import { Dialog } from "../components/Dialog";
import type { LocalEnglishMinerApi, WebReaderBrowserState } from "../data/api";
import { isElementActuallyVisible, useAdaptivePolling } from "../hooks/useAdaptivePolling";
import type { LLMProvider } from "../services/llm/types";
import { createBrowserSentenceFallbackCardData } from "../shared/browserSentenceFallbackCard";
import { createStudyCardFromGenerated } from "../shared/cardFactory";
import { estimateCardGenerationUsage } from "../shared/cardGenerationUsage";
import { findReplaceableDefaultSampleCard } from "../shared/defaultSampleCardReplacement";
import {
  assessCardInputLanguage,
  formatLanguageCode,
  withInputLanguageMetadata,
  type InputLanguagePolicyAssessment
} from "../shared/inputLanguagePolicy";
import type {
  AppSettings,
  InputLanguageSourceKind,
  StudyCard,
  WebReaderLifeMiningState
} from "../shared/types";
import { WEB_READER_PRACTICE_URL } from "../shared/webReaderPractice";
import { isTranslationCancellationError } from "../shared/translationRequestLimits";
import { extractSentenceContext } from "../utils/sentenceExtraction";
import { dismissDefaultSampleCard } from "../defaultSampleCardDismissal";
import { normalizeWebReaderAddress, WEB_READER_DEFAULT_URL } from "./webReaderAddress";
import {
  WEB_READER_MIN_WEBVIEW_MOUNT_HEIGHT,
  getWebReaderHubModel,
  getWebReaderSourceStyle,
  readWebReaderSession,
  webReaderCardColorKeys,
  writeWebReaderSession,
  type WebReaderHubSource,
  type WebReaderSourceTag,
  type WebReaderSessionState
} from "./webReaderHub";
import {
  formatSafeWebReaderAddress,
  formatSafeWebReaderTitle,
  localizeWebReaderHubModel,
  type WebReaderHubLocalization
} from "./webReaderPresentation";

type WebReaderPageProps = {
  api: LocalEnglishMinerApi;
  openUrlRequest?: {
    requestId: number;
    url: string;
    label?: string;
  } | null;
  provider: LLMProvider;
  settings: AppSettings;
  sidebarOverlayOpen?: boolean;
  onCardsChanged: () => Promise<void>;
  onLifeLogsChanged: () => Promise<void>;
  onSettingsChange?: (settings: AppSettings) => void;
  onSwitchToLanguageProfile?: (languageCode: string) => boolean;
};

type WebReaderSelection = {
  selectedText: string;
  sourceSentence?: string;
  fullText: string;
  selectionOffset?: number;
  title: string;
  url: string;
  rect: {
    left: number;
    top: number;
    right?: number;
    bottom?: number;
    width: number;
    height: number;
  };
};

type WebReaderPopoverPosition = {
  left: number;
  top: number;
};

type WebReaderPopoverActionPayload = WebReaderSelection & {
  selectedTerms?: string[];
  sourceSentence?: string;
};

type WebReaderPopoverAction = {
  id?: unknown;
  action?: unknown;
  mode?: unknown;
  payload?: WebReaderPopoverActionPayload;
};

type WebReaderLanguageMismatch = {
  card: StudyCard;
  assessment: InputLanguagePolicyAssessment;
};

type WebReaderTranslatedPageState = {
  sourceUrl: string;
  targetLanguageCode: string;
};

type WebReaderDeleteRequest =
  | {
      kind: "category";
      id: string;
      label: string;
      sourceCount: number;
    }
  | {
      kind: "source";
      id: string;
      label: string;
    };

type WebReaderRetryAction = "open" | "pageTranslation" | "reload" | "selectionTranslation";

const WEB_READER_HIDDEN_BOUNDS = {
  x: 100_000,
  y: 100_000,
  width: 1,
  height: 1
};

export function WebReaderPage({
  api,
  openUrlRequest,
  provider,
  settings,
  sidebarOverlayOpen = false,
  onCardsChanged,
  onLifeLogsChanged,
  onSettingsChange,
  onSwitchToLanguageProfile
}: WebReaderPageProps) {
  const { i18n, t } = useTranslation();
  const appLocale = (i18n.resolvedLanguage ?? i18n.language ?? "ko").startsWith("en")
    ? "en-US"
    : "ko-KR";
  const numberFormatter = useMemo(() => new Intl.NumberFormat(appLocale), [appLocale]);
  const supportsWebview = useMemo(() => Boolean(api.webReader), [api.webReader]);
  const webSurfaceRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const lastSelectionKeyRef = useRef("");
  const handledPopoverActionIdsRef = useRef(new Set<string>());
  const pendingPopoverCardRef = useRef<StudyCard | null>(null);
  const deleteCancelButtonRef = useRef<HTMLButtonElement>(null);
  const initialSessionRef = useRef<WebReaderSessionState | null>(null);
  if (!initialSessionRef.current) {
    initialSessionRef.current = readWebReaderSession();
  }
  const [readerUrl, setReaderUrl] = useState(() =>
    formatSafeWebReaderAddress(
      initialSessionRef.current?.readerUrl ?? WEB_READER_DEFAULT_URL,
      WEB_READER_DEFAULT_URL
    ) || WEB_READER_DEFAULT_URL
  );
  const [addressValue, setAddressValue] = useState(() =>
    formatSafeWebReaderAddress(
      initialSessionRef.current?.addressValue ?? "",
      t("webReader.address.localContent")
    )
  );
  const [isHubVisible, setIsHubVisible] = useState(initialSessionRef.current.isHubVisible);
  const [activeHubCategoryId, setActiveHubCategoryId] = useState("community-expression");
  const [recentHubSources, setRecentHubSources] = useState<WebReaderHubSource[]>([]);
  const [customCategoryLabel, setCustomCategoryLabel] = useState("");
  const [customCategoryPurpose, setCustomCategoryPurpose] = useState<"" | "input-reading" | "output-life">("");
  const [customSourceCategoryId, setCustomSourceCategoryId] = useState("community-expression");
  const [customSourceLabel, setCustomSourceLabel] = useState("");
  const [customSourceUrl, setCustomSourceUrl] = useState("");
  const [isCustomLibraryManagerOpen, setIsCustomLibraryManagerOpen] = useState(false);
  const [isCustomLibraryEditing, setIsCustomLibraryEditing] = useState(false);
  const [pageTitle, setPageTitle] = useState(() =>
    formatSafeWebReaderTitle(initialSessionRef.current?.pageTitle ?? "", "")
  );
  const [isLoading, setIsLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>(() => t("webReader.status.initial"));
  const [retryAction, setRetryAction] = useState<WebReaderRetryAction | null>(null);
  const [lifeMiningState, setLifeMiningState] = useState<WebReaderLifeMiningState>({
    enabled: false,
    mode: "off",
    message: ""
  });
  const [selection, setSelection] = useState<WebReaderSelection | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<WebReaderPopoverPosition | null>(null);
  const [translationText, setTranslationText] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [isTranslatingPage, setIsTranslatingPage] = useState(false);
  const [isSavingCandidate, setIsSavingCandidate] = useState(false);
  const [isSavingCard, setIsSavingCard] = useState(false);
  const [cardPreview, setCardPreview] = useState<StudyCard | null>(null);
  const [languageMismatch, setLanguageMismatch] = useState<WebReaderLanguageMismatch | null>(null);
  const [translatedPageState, setTranslatedPageState] =
    useState<WebReaderTranslatedPageState | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<WebReaderDeleteRequest | null>(null);
  const pageTranslationJobRef = useRef<{
    requestId: string;
    cancelRequested: boolean;
  } | null>(null);
  const selectionTranslationJobRef = useRef<{
    requestId: string;
    cancelRequested: boolean;
  } | null>(null);
  const {
    confirmCloudTranslation,
    cloudTranslationPreflightDialog
  } = useCloudTranslationPreflight();
  const translationApiRef = useRef(api.translations);
  const previousAppLocaleRef = useRef(appLocale);
  translationApiRef.current = api.translations;

  useEffect(() => {
    if (previousAppLocaleRef.current === appLocale) {
      return;
    }
    previousAppLocaleRef.current = appLocale;
    if (retryAction === "open") {
      setStatusMessage(t("webReader.errors.openPage"));
    } else if (retryAction === "pageTranslation") {
      setStatusMessage(t("webReader.errors.pageTranslation"));
    } else if (retryAction === "selectionTranslation") {
      setStatusMessage(t("webReader.errors.selectionTranslation"));
    } else if (retryAction === "reload") {
      setStatusMessage(t("webReader.errors.pageLoad"));
    } else if (isHubVisible) {
      setStatusMessage(t("webReader.status.chooseStartingPoint"));
    } else if (isTranslatingPage) {
      setStatusMessage(t("webReader.status.findingParagraphs"));
    } else if (isTranslating) {
      setStatusMessage(t("webReader.status.translatingSelection"));
    } else if (isSavingCard) {
      setStatusMessage(t("webReader.status.generatingCard"));
    } else {
      setStatusMessage(t("webReader.status.selectionHint"));
    }
  }, [appLocale, isHubVisible, isSavingCard, isTranslating, isTranslatingPage, retryAction, t]);

  useEffect(() => () => {
    const activeJobs = [pageTranslationJobRef.current, selectionTranslationJobRef.current];
    for (const activeJob of activeJobs) {
      if (!activeJob) continue;
      activeJob.cancelRequested = true;
      void translationApiRef.current.cancel(activeJob.requestId).catch(() => false);
    }
  }, []);

  const sourceLanguage = settings.learningProfile.targetLanguage;
  const outputLanguage = settings.learningProfile.nativeLanguage;
  const sourceLanguageCode = useMemo(
    () => sourceLanguage.code.trim().toLowerCase().split("-")[0] || sourceLanguage.code,
    [sourceLanguage.code]
  );
  const rawWebReaderHubModel = useMemo(
    () =>
      getWebReaderHubModel(
        sourceLanguageCode,
        settings.webReaderCustomSources ?? [],
        settings.webReaderCustomCategories ?? []
      ),
    [settings.webReaderCustomCategories, settings.webReaderCustomSources, sourceLanguageCode]
  );
  const hubLocalization = useMemo<WebReaderHubLocalization>(
    () => ({
      categoryLabels: {
        ai: t("webReader.hub.categories.ai"),
        books: t("webReader.hub.categories.books"),
        community: t("webReader.hub.categories.community"),
        "community-expression": t("webReader.hub.categories.communityExpression"),
        knowledge: t("webReader.hub.categories.knowledge"),
        "knowledge-reading": t("webReader.hub.categories.knowledgeReading"),
        "life-dialogue": t("webReader.hub.categories.lifeDialogue"),
        longform: t("webReader.hub.categories.longform"),
        news: t("webReader.hub.categories.news"),
        "news-current": t("webReader.hub.categories.newsCurrent"),
        "public-domain-books": t("webReader.hub.categories.publicDomainBooks"),
        "work-context": t("webReader.hub.categories.workContext")
      },
      customCategoryLabel: t("webReader.hub.custom.defaultCategory"),
      customSourceDescription: t("webReader.hub.custom.defaultSourceDescription"),
      otherLanguageSourceDescription: t("webReader.hub.custom.otherLanguageDescription"),
      sourceDescriptionsByUrl: {
        [WEB_READER_PRACTICE_URL]: t("webReader.hub.sources.practice"),
        "https://chatgpt.com/": t("webReader.hub.sources.chatgpt"),
        "https://gemini.google.com/": t("webReader.hub.sources.gemini"),
        "https://claude.ai/": t("webReader.hub.sources.claude"),
        "https://discord.com/channels/@me": t("webReader.hub.sources.discord"),
        "https://www.reddit.com/": t("webReader.hub.sources.reddit"),
        "https://x.com/": t("webReader.hub.sources.x"),
        "https://news.ycombinator.com/": t("webReader.hub.sources.hackerNews"),
        [WEB_READER_DEFAULT_URL]: t("webReader.hub.sources.wikipedia"),
        "https://www.britannica.com/": t("webReader.hub.sources.britannica"),
        "https://developer.mozilla.org/en-US/": t("webReader.hub.sources.mdn"),
        "https://www.gutenberg.org/files/11/11-0.txt": t("webReader.hub.sources.alice"),
        "https://www.gutenberg.org/": t("webReader.hub.sources.gutenberg"),
        "https://standardebooks.org/": t("webReader.hub.sources.standardEbooks"),
        "https://learningenglish.voanews.com/": t("webReader.hub.sources.voa"),
        "https://www.bbc.com/news": t("webReader.hub.sources.bbc"),
        "https://www.npr.org/": t("webReader.hub.sources.npr"),
        "https://www.reuters.com/": t("webReader.hub.sources.reuters"),
        "https://github.com/": t("webReader.hub.sources.github"),
        "https://stackoverflow.com/": t("webReader.hub.sources.stackOverflow"),
        "https://note.com/": t("webReader.hub.sources.note"),
        "https://b.hatena.ne.jp/": t("webReader.hub.sources.hatena"),
        "https://chiebukuro.yahoo.co.jp/": t("webReader.hub.sources.chiebukuro"),
        "https://www3.nhk.or.jp/news/easy/": t("webReader.hub.sources.nhkEasy"),
        "https://www3.nhk.or.jp/news/": t("webReader.hub.sources.nhk"),
        "https://news.yahoo.co.jp/": t("webReader.hub.sources.yahooJapan"),
        "https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E8%AA%9E": t(
          "webReader.hub.sources.wikipediaJa"
        ),
        "https://www.aozora.gr.jp/": t("webReader.hub.sources.aozora"),
        "https://section.blog.naver.com/": t("webReader.hub.sources.naverBlog"),
        "https://brunch.co.kr/": t("webReader.hub.sources.brunch"),
        "https://news.naver.com/": t("webReader.hub.sources.naverNews"),
        "https://news.daum.net/": t("webReader.hub.sources.daumNews"),
        "https://ko.wikipedia.org/wiki/%ED%95%9C%EA%B5%AD%EC%96%B4": t(
          "webReader.hub.sources.wikipediaKo"
        ),
        "https://www.youtube.com/": t("webReader.hub.sources.youtube")
      },
      sourceLabelsByUrl: {
        [WEB_READER_PRACTICE_URL]: t("webReader.hub.practiceLabel")
      },
      intentCopyByUrl: {
        [WEB_READER_PRACTICE_URL]: {
          label: t("webReader.hub.intents.startPractice.label"),
          description: t("webReader.hub.intents.startPractice.description")
        },
        "https://chatgpt.com/": {
          label: t("webReader.hub.intents.collectMine.label"),
          description: t("webReader.hub.intents.collectMine.description")
        },
        "https://www.reddit.com/": {
          label: t("webReader.hub.intents.collectComments.label"),
          description: t("webReader.hub.intents.collectComments.description")
        },
        [WEB_READER_DEFAULT_URL]: {
          label: t("webReader.hub.intents.readExplanations.label"),
          description: t("webReader.hub.intents.readExplanations.description")
        },
        "https://www.gutenberg.org/files/11/11-0.txt": {
          label: t("webReader.hub.intents.readBookSample.label"),
          description: t("webReader.hub.intents.readBookSample.description")
        },
        "https://learningenglish.voanews.com/": {
          label: t("webReader.hub.intents.readNews.label"),
          description: t("webReader.hub.intents.readNews.description")
        },
        "https://github.com/": {
          label: t("webReader.hub.intents.collectWorkEnglish.label"),
          description: t("webReader.hub.intents.collectWorkEnglish.description")
        },
        "https://www3.nhk.or.jp/news/easy/": {
          label: t("webReader.hub.intents.readEasyNews.label"),
          description: t("webReader.hub.intents.readEasyNews.description")
        },
        "https://note.com/": {
          label: t("webReader.hub.intents.collectDailyExpressions.label"),
          description: t("webReader.hub.intents.collectDailyExpressions.description")
        },
        "https://www.aozora.gr.jp/": {
          label: t("webReader.hub.intents.readOriginal.label"),
          description: t("webReader.hub.intents.readOriginal.description")
        },
        "https://news.naver.com/": {
          label: t("webReader.hub.intents.readNews.label"),
          description: t("webReader.hub.intents.readKoreanNews.description")
        },
        "https://brunch.co.kr/": {
          label: t("webReader.hub.intents.readEssay.label"),
          description: t("webReader.hub.intents.readEssay.description")
        },
        "https://www.youtube.com/": {
          label: t("webReader.hub.intents.readVideoContext.label"),
          description: t("webReader.hub.intents.readVideoContext.description")
        }
      }
    }),
    [t]
  );
  const webReaderHubModel = useMemo(
    () => localizeWebReaderHubModel(rawWebReaderHubModel, hubLocalization),
    [hubLocalization, rawWebReaderHubModel]
  );
  const activeHubCategory =
    webReaderHubModel.categories.find((category) => category.id === activeHubCategoryId) ??
    webReaderHubModel.categories[0];
  const selectedCustomSourceCategory =
    webReaderHubModel.categories.find((category) => category.id === customSourceCategoryId) ??
    webReaderHubModel.categories[0];
  const sourceLanguageDisplayName =
    appLocale === "en-US"
      ? sourceLanguage.nameEn || sourceLanguage.nameKo
      : sourceLanguage.nameKo || sourceLanguage.nameEn;
  const profileCustomCategories = useMemo(
    () =>
      (settings.webReaderCustomCategories ?? []).filter(
        (category) =>
          category.languageCode.trim().toLowerCase().split("-")[0] === sourceLanguageCode
      ),
    [settings.webReaderCustomCategories, sourceLanguageCode]
  );
  const profileCustomSources = useMemo(
    () =>
      (settings.webReaderCustomSources ?? []).filter(
        (source) => source.languageCode.trim().toLowerCase().split("-")[0] === sourceLanguageCode
      ),
    [settings.webReaderCustomSources, sourceLanguageCode]
  );
  const selectionUsageEstimate = useMemo(() => {
    if (!selection?.selectedText) {
      return null;
    }
    const context = getSelectionContext(selection);
    return estimateCardGenerationUsage({
      selectedText: context.selectedText,
      sourceSentence: context.sourceSentence,
      beforeSentence: context.beforeSentence,
      afterSentence: context.afterSentence,
      readerTextContext:
        context.extractionConfidence === "fallback"
          ? context.sourceSentence
          : context.normalizedFullText,
      settings
    });
  }, [selection, settings]);
  const lifeMiningStatusText = useMemo(() => {
    if (isHubVisible) {
      return t("webReader.life.waiting");
    }
    if (!lifeMiningState.enabled) {
      return t("webReader.life.off");
    }
    const modeLabel =
      lifeMiningState.mode === "auto"
        ? t("webReader.life.modes.autoAndSelection")
        : t("webReader.life.modes.selection");
    const siteLabel =
      lifeMiningState.siteKey && lifeMiningState.siteKey !== "genericWeb"
        ? lifeMiningState.siteKey
        : t("webReader.life.genericWeb");
    return t("webReader.life.on", { mode: modeLabel, site: siteLabel });
  }, [isHubVisible, lifeMiningState, t]);
  const isTranslatedPageActive = useMemo(
    () => isTranslatedReaderUrl(readerUrl, translatedPageState, sourceLanguage.code),
    [readerUrl, sourceLanguage.code, translatedPageState]
  );
  const translatedReaderSourceUrl = useMemo(
    () => getTranslatedReaderSourceUrl(readerUrl, translatedPageState),
    [readerUrl, translatedPageState]
  );
  const canTranslateCurrentPage =
    !isHubVisible &&
    Boolean(api.webReader) &&
    !isTranslatingPage &&
    (isTranslatedPageActive ? Boolean(translatedReaderSourceUrl) : isHttpReaderUrl(readerUrl));

  const applyBrowserState = useCallback((state: WebReaderBrowserState | null | undefined) => {
    if (!state) {
      return;
    }
    setCanGoBack(state.canGoBack);
    setCanGoForward(state.canGoForward);
    setIsLoading(state.isLoading);
    if (state.url && state.url !== "about:blank") {
      setReaderUrl(state.url);
      setAddressValue(
        formatSafeWebReaderAddress(state.url, t("webReader.address.localContent"))
      );
    }
    if (state.title) {
      setPageTitle(formatSafeWebReaderTitle(state.title, t("webReader.title")));
    }
  }, [t]);
  const isWebReaderSurfaceVisible = useCallback(
    () => isElementActuallyVisible(stageRef.current),
    []
  );
  const wasLoadingRef = useRef(false);

  useEffect(() => {
    if (isHubVisible) {
      wasLoadingRef.current = false;
      return;
    }
    if (isLoading && !wasLoadingRef.current) {
      setRetryAction(null);
      setStatusMessage(t("webReader.status.loading"));
    } else if (!isLoading && wasLoadingRef.current && !retryAction) {
      setStatusMessage(t("webReader.status.selectionHint"));
    }
    wasLoadingRef.current = isLoading;
  }, [isHubVisible, isLoading, retryAction, t]);

  useEffect(() => {
    const safeReaderUrl = formatSafeWebReaderAddress(readerUrl, WEB_READER_DEFAULT_URL);
    writeWebReaderSession({
      readerUrl: safeReaderUrl || WEB_READER_DEFAULT_URL,
      addressValue: isHubVisible ? "" : safeReaderUrl,
      isHubVisible,
      pageTitle: formatSafeWebReaderTitle(pageTitle, "")
    });
  }, [addressValue, isHubVisible, pageTitle, readerUrl]);

  useEffect(() => {
    if (!webReaderHubModel.categories.some((category) => category.id === activeHubCategoryId)) {
      setActiveHubCategoryId(webReaderHubModel.categories[0]?.id ?? "community-expression");
    }
  }, [activeHubCategoryId, webReaderHubModel.categories]);

  useEffect(() => {
    if (!webReaderHubModel.categories.some((category) => category.id === customSourceCategoryId)) {
      setCustomSourceCategoryId(webReaderHubModel.categories[0]?.id ?? "community-expression");
    }
  }, [customSourceCategoryId, webReaderHubModel.categories]);

  const syncBrowserViewBounds = useCallback(() => {
    const browserView = api.webReader;
    const surface = webSurfaceRef.current;
    if (!browserView || !surface || isHubVisible || cardPreview) {
      return;
    }

    const rect = surface.getBoundingClientRect();
    const bounds = {
      x: Math.max(0, Math.round(rect.left)),
      y: Math.max(0, Math.round(rect.top)),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height))
    };
    if (bounds.width <= 1 || bounds.height < WEB_READER_MIN_WEBVIEW_MOUNT_HEIGHT) {
      return;
    }
    void browserView.attach({ url: readerUrl, bounds }).then(applyBrowserState).catch(() => {
      setRetryAction("reload");
      setStatusMessage(t("webReader.errors.layout"));
    });
  }, [api.webReader, applyBrowserState, cardPreview, isHubVisible, readerUrl, sidebarOverlayOpen, t]);

  useEffect(() => {
    if (!api.webReader) {
      return;
    }
    const shouldShowBrowserView = !isHubVisible && !cardPreview;
    if (!shouldShowBrowserView) {
      void api.webReader.setBounds(WEB_READER_HIDDEN_BOUNDS).catch(() => {
        // The view may already be hidden or detached during navigation.
      });
    }
    const visibilityRequest = api.webReader.setVisible?.(shouldShowBrowserView);
    void visibilityRequest?.catch(() => {
      // Older preload bridges still hide the live view with off-screen bounds.
    });
  }, [api.webReader, cardPreview, isHubVisible]);

  useLayoutEffect(() => {
    if (!api.webReader) {
      return;
    }

    syncBrowserViewBounds();
    const surface = webSurfaceRef.current;
    if (!surface || typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncBrowserViewBounds);
      return () => window.removeEventListener("resize", syncBrowserViewBounds);
    }

    const observer = new ResizeObserver(syncBrowserViewBounds);
    observer.observe(surface);
    window.addEventListener("resize", syncBrowserViewBounds);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncBrowserViewBounds);
    };
  }, [api.webReader, syncBrowserViewBounds]);

  useAdaptivePolling(
    async () => {
      try {
        applyBrowserState(await api.webReader?.getState());
      } catch {
        // BrowserView state polling is best effort while navigating.
      }
    },
    {
      activeIntervalMs: 1500,
      enabled: Boolean(api.webReader) && !isHubVisible,
      inactiveIntervalMs: 6000,
      isActive: isWebReaderSurfaceVisible,
      runImmediately: true
    }
  );

  useEffect(() => {
    if (!api.webReader?.getLifeMiningState || isHubVisible) {
      setLifeMiningState({
        enabled: false,
        mode: "off",
        message: ""
      });
      return;
    }
  }, [api.webReader, isHubVisible]);

  useAdaptivePolling(
    async () => {
      try {
        const state = await api.webReader?.getLifeMiningState();
        if (state) {
          setLifeMiningState(state);
        }
      } catch {
        setLifeMiningState({
          enabled: false,
          mode: "off",
          message: ""
        });
      }
    },
    {
      activeIntervalMs: 5000,
      enabled: Boolean(api.webReader?.getLifeMiningState) && !isHubVisible,
      inactiveIntervalMs: 10000,
      isActive: isWebReaderSurfaceVisible,
      runImmediately: true
    }
  );

  useEffect(() => {
    const browserView = api.webReader;
    if (!browserView) {
      return;
    }
    return () => {
      void browserView.detach().catch(() => {
        // BrowserView may already be destroyed with the window.
      });
    };
  }, [api.webReader]);

  const updateSelectionFromWebview = useCallback(async (showEmptyMessage = false) => {
    if (api.webReader) {
      const stage = stageRef.current;
      const surface = webSurfaceRef.current;
      if (!stage || !surface) {
        return null;
      }

      try {
        const snapshot = (await api.webReader.getSelection()) as WebReaderSelection | null;
        if (!snapshot?.selectedText) {
          lastSelectionKeyRef.current = "";
          setSelection(null);
          setPopoverPosition(null);
          setTranslationText("");
          if (showEmptyMessage) {
            setRetryAction(null);
            setStatusMessage(t("webReader.status.selectFirst"));
          }
          return null;
        }

        const surfaceRect = surface.getBoundingClientRect();
        const stageRect = stage.getBoundingClientRect();
        const popoverWidth = 350;
        const left = clamp(
          surfaceRect.left - stageRect.left + snapshot.rect.left,
          12,
          Math.max(12, stageRect.width - popoverWidth - 12)
        );
        const top = clamp(
          surfaceRect.top - stageRect.top + snapshot.rect.top + snapshot.rect.height + 10,
          12,
          Math.max(12, stageRect.height - 190)
        );
        const selectionKey = [
          snapshot.url,
          snapshot.selectedText,
          "sourceSentence" in snapshot ? snapshot.sourceSentence : "",
          "selectionOffset" in snapshot ? snapshot.selectionOffset : ""
        ].join("|");
        if (selectionKey !== lastSelectionKeyRef.current) {
          lastSelectionKeyRef.current = selectionKey;
          setTranslationText("");
          void api.webReader.showSelectionPopover?.().catch(() => {
            // The in-page popover is a convenience layer; selection polling still drives card creation.
          });
        }
        setSelection(snapshot);
        setPopoverPosition({ left, top });
        return snapshot;
      } catch {
        if (showEmptyMessage) {
          setRetryAction(null);
          setStatusMessage(t("webReader.errors.selectionRead"));
        }
        return null;
      }
    }

    if (showEmptyMessage) {
      setRetryAction(null);
      setStatusMessage(t("webReader.errors.desktopSelectionOnly"));
    }
    return null;
  }, [api.webReader, t]);

  useAdaptivePolling(
    async () => {
      await updateSelectionFromWebview(false);
    },
    {
      activeIntervalMs: 1200,
      enabled: supportsWebview && !isHubVisible,
      inactiveIntervalMs: 6000,
      isActive: isWebReaderSurfaceVisible
    }
  );

  function rememberHubSource(source: WebReaderHubSource) {
    setRecentHubSources((previous) => [
      source,
      ...previous.filter((item) => item.url !== source.url)
    ].slice(0, 4));
  }

  function getActiveCardSourceKind(): InputLanguageSourceKind {
    return isTranslatedPageActive ? "translated_page" : "original";
  }

  function prepareCardForLanguagePolicy(card: StudyCard, override = false) {
    const assessment = assessCardInputLanguage({
      card,
      settings,
      override,
      sourceKind: override ? "manual_override" : getActiveCardSourceKind()
    });
    return {
      assessment,
      card: withInputLanguageMetadata(card, assessment)
    };
  }

  function openWebReaderUrl(value: string, source?: WebReaderHubSource) {
    const nextUrl = normalizeWebReaderAddress(value);
    setReaderUrl(nextUrl);
    setAddressValue(
      formatSafeWebReaderAddress(nextUrl, t("webReader.address.localContent"))
    );
    setIsHubVisible(false);
    setSelection(null);
    setPopoverPosition(null);
    setTranslationText("");
    setLanguageMismatch(null);
    setTranslatedPageState(null);
    setRetryAction(null);
    setStatusMessage(t("webReader.status.selectionHint"));
    if (source) {
      rememberHubSource({ ...source, url: nextUrl });
      setPageTitle(formatSafeWebReaderTitle(source.label, t("webReader.title")));
    }
    if (api.webReader && !isHubVisible) {
      void api.webReader.loadUrl(nextUrl).then(applyBrowserState).catch(() => {
        setRetryAction("open");
        setStatusMessage(t("webReader.errors.openPage"));
      });
    }
  }

  async function translateCurrentPage(statusMessage?: string) {
    setRetryAction(null);
    if (isTranslatedPageActive && translatedReaderSourceUrl) {
      try {
        await api.webReader?.restorePageTranslations?.();
        setTranslatedPageState(null);
        setStatusMessage(t("webReader.status.originalRestored"));
      } catch {
        setRetryAction("pageTranslation");
        setStatusMessage(t("webReader.errors.restoreOriginal"));
      }
      return;
    }
    if (!api.webReader?.getPageTextSegments || !api.webReader.applyPageTranslations) {
      setStatusMessage(t("webReader.errors.pageTranslationUnavailable"));
      return;
    }
    if (!isHttpReaderUrl(readerUrl)) {
      setStatusMessage(t("webReader.errors.pageTranslationUnsupported"));
      return;
    }
    setIsTranslatingPage(true);
    setStatusMessage(t("webReader.status.findingParagraphs"));
    let activeJob: { requestId: string; cancelRequested: boolean } | null = null;
    try {
      const pageText = await api.webReader.getPageTextSegments();
      if (!pageText?.segments.length) {
        setStatusMessage(t("webReader.empty.noParagraphs"));
        return;
      }
      const formattedSegmentCount = numberFormatter.format(pageText.segments.length);
      const allowed = await confirmCloudTranslation({
        settings,
        operation: "text",
        textGroups: pageText.segments.map((segment) => [segment.text]),
        scopeLabel: t("webReader.preflight.pageScope", {
          formattedCount: formattedSegmentCount
        }),
        dataCategories: [
          t("webReader.preflight.pageParagraphs"),
          t("webReader.preflight.languageSettings")
        ],
        sourceLang: "auto",
        targetLang: sourceLanguage.code
      });
      if (!allowed) {
        setStatusMessage(t("webReader.translation.canceledBeforeStart"));
        return;
      }
      activeJob = { requestId: crypto.randomUUID(), cancelRequested: false };
      pageTranslationJobRef.current = activeJob;
      const translatedSegments = [];
      for (let index = 0; index < pageText.segments.length; index += 1) {
        if (activeJob.cancelRequested) break;
        const segment = pageText.segments[index];
        setStatusMessage(
          t("webReader.status.translatingParagraph", {
            current: numberFormatter.format(index + 1),
            total: formattedSegmentCount
          })
        );
        const result = await api.translations.translate({
          requestId: activeJob.requestId,
          text: segment.text,
          profileId: settings.profileId,
          providerName: settings.translationProviderName,
          sourceLang: "auto",
          targetLang: sourceLanguage.code,
          sourceLanguage: {
            code: "auto",
            nameKo: t("webReader.translation.autoDetectedKo"),
            nameEn: t("webReader.translation.autoDetectedEn")
          },
          outputLanguage: sourceLanguage,
          googleApiKey: settings.googleTranslateApiKey,
          geminiApiKey: settings.geminiApiKey,
          geminiModel: settings.geminiModel,
          geminiPlan: settings.geminiPlan,
          ollamaBaseUrl: settings.ollamaBaseUrl,
          ollamaModel: settings.ollamaModel,
          model: getTranslationModel(settings),
          promptVersion: "web-reader-page-inline-v1",
          contextHash: formatSafeWebReaderAddress(pageText.url, "")
        });
        if (activeJob.cancelRequested) break;
        translatedSegments.push({
          ...segment,
          translatedText: result.translatedText
        });
      }
      if (activeJob.cancelRequested) {
        setStatusMessage(t("webReader.translation.canceled"));
        return;
      }
      const applied = await api.webReader.applyPageTranslations({
        targetLanguageCode: sourceLanguage.code,
        segments: translatedSegments
      });
      if (!applied) {
        setRetryAction("pageTranslation");
        setStatusMessage(t("webReader.errors.applyTranslation"));
        return;
      }
      setTranslatedPageState({
        sourceUrl: pageText.url || readerUrl,
        targetLanguageCode: sourceLanguage.code
      });
      setStatusMessage(
        statusMessage ?? t("webReader.status.pageTranslated")
      );
    } catch (error) {
      if (activeJob?.cancelRequested || isTranslationCancellationError(error)) {
        setStatusMessage(t("webReader.translation.canceled"));
      } else {
        setRetryAction("pageTranslation");
        setStatusMessage(t("webReader.errors.pageTranslation"));
      }
    } finally {
      if (activeJob && pageTranslationJobRef.current === activeJob) {
        pageTranslationJobRef.current = null;
      }
      setIsTranslatingPage(false);
    }
  }

  async function stopPageTranslation() {
    const activeJob = pageTranslationJobRef.current;
    if (!activeJob || activeJob.cancelRequested) return;
    activeJob.cancelRequested = true;
    setStatusMessage(t("webReader.translation.stopping"));
    await api.translations.cancel(activeJob.requestId).catch(() => false);
  }

  useEffect(() => {
    if (!openUrlRequest?.url) {
      return;
    }
    openWebReaderUrl(openUrlRequest.url, {
      label: openUrlRequest.label ?? "YouTube",
      url: openUrlRequest.url,
      description: t("webReader.hub.sources.listeningLoop"),
      languageCode: sourceLanguage.code
    });
  }, [openUrlRequest?.requestId, t]);

  function toggleCustomLibraryEditing() {
    setIsCustomLibraryEditing((value) => !value);
    setIsCustomLibraryManagerOpen(false);
  }

  function toggleCustomLibraryManager() {
    setIsCustomLibraryManagerOpen((value) => !value);
    if (!isCustomLibraryManagerOpen) {
      setIsCustomLibraryEditing(false);
    }
  }

  function closeCustomLibraryManager() {
    setIsCustomLibraryManagerOpen(false);
  }

  function addCustomCategory(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const label = customCategoryLabel.trim();
    if (!label || !onSettingsChange) {
      return;
    }

    const existingCategory = (settings.webReaderCustomCategories ?? []).find(
      (category) =>
        category.languageCode.trim().toLowerCase().split("-")[0] === sourceLanguageCode &&
        category.label.trim().toLowerCase() === label.toLowerCase()
    );
    if (existingCategory) {
      setCustomSourceCategoryId(existingCategory.id);
      setActiveHubCategoryId(existingCategory.id);
      setCustomCategoryLabel("");
      setCustomCategoryPurpose("");
      setRetryAction(null);
      setStatusMessage(t("webReader.status.existingCategorySelected"));
      return;
    }

    const now = new Date().toISOString();
    const categoryId = `custom-category:${sourceLanguageCode}:${Date.now()}`;
    const purpose = customCategoryPurpose || undefined;
    onSettingsChange({
      ...settings,
      webReaderCustomCategories: [
        {
          id: categoryId,
          label,
          languageCode: sourceLanguageCode,
          purpose,
          createdAt: now,
          updatedAt: now
        },
        ...(settings.webReaderCustomCategories ?? [])
      ]
    });
    setCustomCategoryLabel("");
    setCustomCategoryPurpose("");
    setCustomSourceCategoryId(categoryId);
    setActiveHubCategoryId(categoryId);
    setRetryAction(null);
    setStatusMessage(t("webReader.status.categoryAdded"));
  }

  function deleteCustomCategory(categoryId: string) {
    if (!onSettingsChange) {
      return;
    }
    const category = (settings.webReaderCustomCategories ?? []).find(
      (item) =>
        item.id === categoryId &&
        item.languageCode.trim().toLowerCase().split("-")[0] === sourceLanguageCode
    );
    if (!category) {
      return;
    }

    const sourcesInCategory = (settings.webReaderCustomSources ?? []).filter(
      (source) =>
        source.categoryId === categoryId &&
        source.languageCode.trim().toLowerCase().split("-")[0] === sourceLanguageCode
    );
    setDeleteRequest({
      kind: "category",
      id: categoryId,
      label: category.label,
      sourceCount: sourcesInCategory.length
    });
  }

  function deleteCustomSource(sourceId: string) {
    if (!onSettingsChange) {
      return;
    }
    const source = (settings.webReaderCustomSources ?? []).find(
      (item) =>
        item.id === sourceId &&
        item.languageCode.trim().toLowerCase().split("-")[0] === sourceLanguageCode
    );
    if (!source) {
      return;
    }

    setDeleteRequest({
      kind: "source",
      id: sourceId,
      label: source.label
    });
  }

  function confirmCustomDelete() {
    if (!deleteRequest || !onSettingsChange) {
      return;
    }

    if (deleteRequest.kind === "category") {
      const sourcesInCategory = (settings.webReaderCustomSources ?? []).filter(
        (source) => source.categoryId === deleteRequest.id
      );
      onSettingsChange({
        ...settings,
        webReaderCustomCategories: (settings.webReaderCustomCategories ?? []).filter(
          (item) => item.id !== deleteRequest.id
        ),
        webReaderCustomSources: (settings.webReaderCustomSources ?? []).filter(
          (source) => source.categoryId !== deleteRequest.id
        )
      });
      if (activeHubCategoryId === deleteRequest.id) {
        setActiveHubCategoryId("community-expression");
      }
      if (customSourceCategoryId === deleteRequest.id) {
        setCustomSourceCategoryId("community-expression");
      }
      setIsCustomLibraryManagerOpen(false);
      setRecentHubSources((previous) =>
        previous.filter((source) => !sourcesInCategory.some((item) => item.url === source.url))
      );
      setStatusMessage(t("webReader.status.categoryDeleted"));
    } else {
      const source = (settings.webReaderCustomSources ?? []).find(
        (item) => item.id === deleteRequest.id
      );
      onSettingsChange({
        ...settings,
        webReaderCustomSources: (settings.webReaderCustomSources ?? []).filter(
          (item) => item.id !== deleteRequest.id
        )
      });
      if (source) {
        setRecentHubSources((previous) =>
          previous.filter((item) => item.url !== source.url)
        );
      }
      setStatusMessage(t("webReader.status.sourceDeleted"));
    }
    setRetryAction(null);
    setDeleteRequest(null);
  }

  function addCustomSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = customSourceLabel.trim();
    const rawUrl = customSourceUrl.trim();
    if (!label || !rawUrl || !onSettingsChange) {
      return;
    }

    const now = new Date().toISOString();
    const url = normalizeWebReaderAddress(rawUrl);
    const categoryId = selectedCustomSourceCategory?.id ?? "community-expression";
    onSettingsChange({
      ...settings,
      webReaderCustomSources: [
        {
          id: `custom:${sourceLanguageCode}:${Date.now()}`,
          label,
          url,
          languageCode: sourceLanguageCode,
          categoryId,
          description: "",
          createdAt: now,
          updatedAt: now
        },
        ...(settings.webReaderCustomSources ?? []).filter((source) => source.url !== url)
      ]
    });
    setCustomSourceLabel("");
    setCustomSourceUrl("");
    setActiveHubCategoryId(categoryId);
    setIsCustomLibraryManagerOpen(false);
    setRetryAction(null);
    setStatusMessage(t("webReader.status.sourceAdded"));
  }

  function submitAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const displayedReaderUrl = formatSafeWebReaderAddress(
      readerUrl,
      t("webReader.address.localContent")
    );
    openWebReaderUrl(addressValue === displayedReaderUrl ? readerUrl : addressValue);
  }

  async function getCurrentSelection() {
    return selection ?? (supportsWebview ? await updateSelectionFromWebview(true) : null);
  }

  async function generateCardFromSelection(
    currentSelection: WebReaderSelection,
    selectedTerms?: string[]
  ) {
    const context = getSelectionContext(currentSelection);
    const selectedText = selectedTerms?.length ? selectedTerms.join(", ") : context.selectedText;
    const allowed = await confirmReadingCardGeneration({
      selectedText,
      sourceSentence: context.sourceSentence,
      beforeSentence: context.beforeSentence,
      afterSentence: context.afterSentence,
      readerTextContext:
        context.extractionConfidence === "fallback"
          ? context.sourceSentence
          : context.normalizedFullText
    });
    if (!allowed) {
      return null;
    }
    try {
      const generated = await provider.generateReadingCard({
        selectedText,
        sourceSentence:
          "sourceSentence" in currentSelection && typeof currentSelection.sourceSentence === "string"
            ? currentSelection.sourceSentence
            : context.sourceSentence,
        beforeSentence: context.beforeSentence,
        afterSentence: context.afterSentence,
        readerTextContext:
          context.extractionConfidence === "fallback"
            ? context.sourceSentence
            : context.normalizedFullText,
        learningProfile: settings.learningProfile,
        learnerLevel: "intermediate"
      });
      return createStudyCardFromGenerated({
        ...generated,
        profileId: settings.profileId
      });
    } catch (error) {
      if (settings.providerName !== "mock") {
        throw error;
      }
      const fallbackCardData = createBrowserSentenceFallbackCardData({
        selectedText,
        sourceSentence:
          "sourceSentence" in currentSelection && typeof currentSelection.sourceSentence === "string"
            ? currentSelection.sourceSentence
            : context.sourceSentence,
        translatedSentence: translationText || undefined,
        colorKeys: [...webReaderCardColorKeys],
        targetLanguageCode: settings.learningProfile.targetLanguage.code
      });
      return createStudyCardFromGenerated({
        ...fallbackCardData,
        profileId: settings.profileId
      });
    }
  }

  function confirmReadingCardGeneration(input: {
    selectedText: string;
    sourceSentence: string;
    beforeSentence?: string;
    afterSentence?: string;
    readerTextContext?: string;
  }) {
    if (settings.providerName !== "gemini" && settings.providerName !== "ollama") {
      return Promise.resolve(true);
    }
    return confirmCloudTranslation({
      settings,
      providerName: settings.providerName === "gemini" ? "gemini" : "local",
      model:
        settings.providerName === "gemini" ? settings.geminiModel : settings.ollamaModel,
      operation: "text",
      textGroups: [[
        input.selectedText,
        input.sourceSentence,
        input.beforeSentence ?? "",
        input.afterSentence ?? "",
        input.readerTextContext ?? ""
      ]],
      scopeLabel: t("cloudTranslationPreflight.cardScope"),
      dataCategories: [
        t("cloudTranslationPreflight.cardSelectedText"),
        t("cloudTranslationPreflight.cardContext"),
        t("cloudTranslationPreflight.learningProfile")
      ]
    });
  }

  async function saveCard(card: StudyCard, options: { override?: boolean } = {}) {
    const prepared = prepareCardForLanguagePolicy(card, options.override === true);
    if (prepared.assessment.shouldBlock && !options.override) {
      setLanguageMismatch({
        card,
        assessment: prepared.assessment
      });
      setRetryAction(null);
      setStatusMessage(t("webReader.mismatch.blocked"));
      throw new Error("web-reader-language-mismatch");
    }

    const existingCards = await api.cards.list(settings.profileId);
    const replacedSample = findReplaceableDefaultSampleCard(existingCards, prepared.card);
    await api.cards.save(prepared.card, settings.profileId);
    if (replacedSample) {
      const deleted = await api.cards.delete(replacedSample.id);
      if (deleted) {
        dismissDefaultSampleCard(localStorage, settings.profileId, replacedSample.id);
      }
    }
    await onCardsChanged();
    setLanguageMismatch(null);
    await dismissSelectionPopoverAfterSave();
  }

  function openTranslatedPageForMismatch() {
    if (!languageMismatch) {
      return;
    }
    void translateCurrentPage(t("webReader.status.mismatchPageTranslated"));
  }

  function switchProfileForMismatch() {
    if (!languageMismatch) {
      return;
    }
    const detectedLanguageCode = languageMismatch.assessment.detectedLanguageCode;
    const switched =
      detectedLanguageCode !== "unknown" &&
      onSwitchToLanguageProfile?.(detectedLanguageCode) === true;
    setStatusMessage(
      switched
        ? t("webReader.status.profileSwitched", {
            language: formatLanguageCode(detectedLanguageCode)
          })
        : t("webReader.errors.profileMissing", {
            language: formatLanguageCode(detectedLanguageCode)
          })
    );
    if (switched) {
      setLanguageMismatch(null);
    }
  }

  async function saveMismatchOverride() {
    if (!languageMismatch || isSavingCard) {
      return;
    }
    setIsSavingCard(true);
    try {
      await saveCard(languageMismatch.card, { override: true });
      setRetryAction(null);
      setStatusMessage(t("webReader.status.mismatchSaved"));
    } catch {
      setStatusMessage(t("webReader.errors.cardSave"));
    } finally {
      setIsSavingCard(false);
    }
  }

  async function dismissSelectionPopoverAfterSave() {
    setSelection(null);
    setPopoverPosition(null);
    setTranslationText("");
    await api.webReader?.hidePopover?.().catch(() => {
      // The fallback React popover is already cleared above.
    });
  }

  async function showUnifiedCardPreview(card: StudyCard) {
    pendingPopoverCardRef.current = card;
    setCardPreview(card);
    setSelection(null);
    setPopoverPosition(null);
    setTranslationText("");
    await api.webReader?.hidePopover?.().catch(() => {
      // The generated card is already shown in the app-level preview.
    });
  }

  function closeUnifiedCardPreview() {
    pendingPopoverCardRef.current = null;
    setCardPreview(null);
    setRetryAction(null);
    setStatusMessage(t("webReader.status.selectAgain"));
  }

  async function handleBrowserPopoverCreate(action: WebReaderPopoverAction) {
    const payload = action.payload;
    if (!payload?.selectedText) {
      return;
    }
    const currentSelection = normalizePopoverSelection(payload);
    const selectedTerms = normalizeSelectedTerms(payload.selectedTerms, currentSelection.selectedText);
    setSelection(currentSelection);
    setTranslationText("");
    setIsSavingCard(true);
    setRetryAction(null);
    setStatusMessage(t("webReader.status.generatingCard"));
    await api.webReader?.showPopoverStatus?.({
      state: "working",
      message: t("webReader.status.generatingCardShort")
    });

    try {
      const card = await generateCardFromSelection(currentSelection, selectedTerms);
      if (!card) {
        const message = t("manualChatGptBridge.cancelled");
        await api.webReader?.showPopoverStatus?.({ state: "ready", message });
        setStatusMessage(message);
        return;
      }
      if (settings.browserSelectionCardMode === "autoSave") {
        await saveCard(card);
        pendingPopoverCardRef.current = null;
        setStatusMessage(t("webReader.status.cardSaved"));
        return;
      }

      await showUnifiedCardPreview(card);
      setStatusMessage(t("webReader.status.previewCard"));
    } catch {
      const message = t("webReader.errors.cardGeneration");
      await api.webReader?.showPopoverStatus?.({ state: "error", message });
      setStatusMessage(message);
    } finally {
      setIsSavingCard(false);
    }
  }

  async function handleBrowserPopoverSavePreview() {
    const card = pendingPopoverCardRef.current;
    if (!card) {
      await api.webReader?.showPopoverStatus?.({
        state: "error",
        message: t("webReader.errors.noCardPreview")
      });
      return;
    }
    setIsSavingCard(true);
    try {
      await saveCard(card);
      pendingPopoverCardRef.current = null;
      setCardPreview(null);
      setStatusMessage(t("webReader.status.cardSaved"));
    } catch {
      const message = t("webReader.errors.cardSave");
      await api.webReader?.showPopoverStatus?.({ state: "error", message });
      setStatusMessage(message);
    } finally {
      setIsSavingCard(false);
    }
  }

  useAdaptivePolling(
    async () => {
      try {
        const action = (await api.webReader?.consumePopoverAction?.()) as WebReaderPopoverAction | null;
        if (!action?.action) {
          return;
        }
        const actionId = typeof action.id === "string" ? action.id : JSON.stringify(action);
        if (handledPopoverActionIdsRef.current.has(actionId)) {
          return;
        }
        handledPopoverActionIdsRef.current.add(actionId);
        if (action.action === "create-card") {
          await handleBrowserPopoverCreate(action);
        } else if (action.action === "save-preview") {
          await handleBrowserPopoverSavePreview();
        }
      } catch {
        setStatusMessage(t("webReader.errors.popover"));
      }
    },
    {
      activeIntervalMs: 1000,
      enabled: Boolean(api.webReader?.consumePopoverAction) && !isHubVisible,
      inactiveIntervalMs: 6000,
      isActive: isWebReaderSurfaceVisible
    }
  );

  async function translateSelection() {
    setRetryAction(null);
    const currentSelection = await getCurrentSelection();
    if (!currentSelection) {
      return;
    }
    const context = getSelectionContext(currentSelection);
    const allowed = await confirmCloudTranslation({
      settings,
      operation: "text",
      textGroups: [[context.sourceSentence]],
      scopeLabel: t("webReader.preflight.selectionScope", {
        formattedCount: numberFormatter.format(1)
      }),
      dataCategories: [
        t("webReader.preflight.selectedSentence"),
        t("webReader.preflight.languageSettings")
      ],
      sourceLang: sourceLanguage.code,
      targetLang: outputLanguage.code
    });
    if (!allowed) {
      setStatusMessage(t("webReader.translation.canceledBeforeStart"));
      return;
    }
    const activeJob = { requestId: crypto.randomUUID(), cancelRequested: false };
    selectionTranslationJobRef.current = activeJob;
    setIsTranslating(true);
    setStatusMessage(t("webReader.status.translatingSelection"));
    try {
      const result = await api.translations.translate({
        requestId: activeJob.requestId,
        text: context.sourceSentence,
        profileId: settings.profileId,
        providerName: settings.translationProviderName,
        sourceLang: sourceLanguage.code,
        targetLang: outputLanguage.code,
        sourceLanguage,
        outputLanguage,
        googleApiKey: settings.googleTranslateApiKey,
        geminiApiKey: settings.geminiApiKey,
        geminiModel: settings.geminiModel,
        geminiPlan: settings.geminiPlan,
        ollamaBaseUrl: settings.ollamaBaseUrl,
        ollamaModel: settings.ollamaModel,
        model: getTranslationModel(settings),
        promptVersion: "web-reader-selection-v1",
        contextHash: formatSafeWebReaderAddress(currentSelection.url, "")
      });
      if (activeJob.cancelRequested) {
        setStatusMessage(t("webReader.translation.canceled"));
        return;
      }
      setTranslationText(result.translatedText);
      setStatusMessage(t("webReader.status.translationShown"));
    } catch (error) {
      if (activeJob.cancelRequested || isTranslationCancellationError(error)) {
        setStatusMessage(t("webReader.translation.canceled"));
      } else {
        setRetryAction("selectionTranslation");
        setStatusMessage(t("webReader.errors.selectionTranslation"));
      }
    } finally {
      if (selectionTranslationJobRef.current === activeJob) {
        selectionTranslationJobRef.current = null;
      }
      setIsTranslating(false);
    }
  }

  async function stopSelectionTranslation() {
    const activeJob = selectionTranslationJobRef.current;
    if (!activeJob || activeJob.cancelRequested) return;
    activeJob.cancelRequested = true;
    setStatusMessage(t("webReader.translation.stopping"));
    await api.translations.cancel(activeJob.requestId).catch(() => false);
  }

  async function saveCandidate() {
    const currentSelection = await getCurrentSelection();
    if (!currentSelection) {
      return;
    }
    const context = getSelectionContext(currentSelection);
    setIsSavingCandidate(true);
    try {
      await api.lifeLogs.save({
        text: context.sourceSentence,
        beforeContext: context.beforeSentence,
        afterContext: context.afterSentence,
        appName: t("webReader.title"),
        sourceType: "browser_extension",
        metadata: {
          url: formatSafeWebReaderAddress(currentSelection.url, ""),
          title: formatSafeWebReaderTitle(
            currentSelection.title || pageTitle,
            t("webReader.title")
          ),
          trigger: "web_reader",
          capturedAt: new Date().toISOString(),
          selectedText: currentSelection.selectedText,
          extractionConfidence: context.extractionConfidence
        }
      });
      await onLifeLogsChanged();
      setRetryAction(null);
      setStatusMessage(t("webReader.status.candidateSaved"));
    } catch {
      setStatusMessage(t("webReader.errors.candidateSave"));
    } finally {
      setIsSavingCandidate(false);
    }
  }

  async function saveReadingCard() {
    const currentSelection = await getCurrentSelection();
    if (!currentSelection) {
      return;
    }
    const context = getSelectionContext(currentSelection);
    setIsSavingCard(true);
    try {
      const cardData = createBrowserSentenceFallbackCardData({
        selectedText: currentSelection.selectedText,
        sourceSentence: context.sourceSentence,
        translatedSentence: translationText || undefined,
        colorKeys: [...webReaderCardColorKeys],
        targetLanguageCode: settings.learningProfile.targetLanguage.code
      });
      const card = createStudyCardFromGenerated({
        ...cardData,
        profileId: settings.profileId
      });
      if (settings.browserSelectionCardMode === "autoSave") {
        await saveCard(card);
        setRetryAction(null);
        setStatusMessage(t("webReader.status.cardSavedWithLocation"));
      } else {
        await showUnifiedCardPreview(card);
        setStatusMessage(t("webReader.status.previewCard"));
      }
    } catch {
      setStatusMessage(t("webReader.errors.cardSave"));
    } finally {
      setIsSavingCard(false);
    }
  }

  async function saveGeneratedReadingCard() {
    const currentSelection = await getCurrentSelection();
    if (!currentSelection) {
      return;
    }

    const context = getSelectionContext(currentSelection);
    const allowed = await confirmReadingCardGeneration({
      selectedText: context.selectedText,
      sourceSentence: context.sourceSentence,
      beforeSentence: context.beforeSentence,
      afterSentence: context.afterSentence,
      readerTextContext:
        context.extractionConfidence === "fallback"
          ? context.sourceSentence
          : context.normalizedFullText
    });
    if (!allowed) {
      setStatusMessage(t("manualChatGptBridge.cancelled"));
      return;
    }
    setIsSavingCard(true);
    setRetryAction(null);
    setStatusMessage(t("webReader.status.generatingCard"));
    try {
      let card: ReturnType<typeof createStudyCardFromGenerated>;
      try {
        const generated = await provider.generateReadingCard({
          selectedText: context.selectedText,
          sourceSentence: context.sourceSentence,
          beforeSentence: context.beforeSentence,
          afterSentence: context.afterSentence,
          readerTextContext:
            context.extractionConfidence === "fallback"
              ? context.sourceSentence
              : context.normalizedFullText,
          learningProfile: settings.learningProfile,
          learnerLevel: "intermediate"
        });
        card = createStudyCardFromGenerated({
          ...generated,
          profileId: settings.profileId
        });
      } catch (error) {
        if (settings.providerName !== "mock") {
          throw error;
        }
        const fallbackCardData = createBrowserSentenceFallbackCardData({
          selectedText: currentSelection.selectedText,
          sourceSentence: context.sourceSentence,
          translatedSentence: translationText || undefined,
          colorKeys: [...webReaderCardColorKeys],
          targetLanguageCode: settings.learningProfile.targetLanguage.code
        });
        card = createStudyCardFromGenerated({
          ...fallbackCardData,
          profileId: settings.profileId
        });
      }

      await saveCard(card);
      setStatusMessage(t("webReader.status.cardSavedWithLocation"));
    } catch {
      setStatusMessage(t("webReader.errors.cardSave"));
    } finally {
      setIsSavingCard(false);
    }
  }

  function goHome() {
    setIsHubVisible(true);
    setAddressValue("");
    setPageTitle("");
    setSelection(null);
    setPopoverPosition(null);
    setTranslationText("");
    setRetryAction(null);
    setStatusMessage(t("webReader.status.chooseStartingPoint"));
  }

  function goBack() {
    if (api.webReader) {
      setRetryAction(null);
      void api.webReader.goBack().then(applyBrowserState).catch(() => {
        setRetryAction("reload");
        setStatusMessage(t("webReader.errors.navigation"));
      });
      return;
    }
  }

  function goForward() {
    if (api.webReader) {
      setRetryAction(null);
      void api.webReader.goForward().then(applyBrowserState).catch(() => {
        setRetryAction("reload");
        setStatusMessage(t("webReader.errors.navigation"));
      });
      return;
    }
  }

  function reloadPage() {
    if (api.webReader) {
      setRetryAction(null);
      setStatusMessage(t("webReader.status.loading"));
      void api.webReader.reload().then(applyBrowserState).catch(() => {
        setRetryAction("reload");
        setStatusMessage(t("webReader.errors.pageLoad"));
      });
      return;
    }
  }

  function retryLastAction() {
    const action = retryAction;
    setRetryAction(null);
    if (action === "open") {
      openWebReaderUrl(readerUrl);
    } else if (action === "pageTranslation") {
      void translateCurrentPage();
    } else if (action === "selectionTranslation") {
      void translateSelection();
    } else {
      reloadPage();
    }
  }

  return (
    <div className={sidebarOverlayOpen ? "web-reader-page sidebar-overlay-open" : "web-reader-page"}>
      {cloudTranslationPreflightDialog}
      <h1 className="web-reader-visually-hidden">{t("webReader.title")}</h1>
      <form className="web-reader-command-rail" onSubmit={submitAddress}>
        <div className="web-reader-nav-cluster">
          <button
            aria-label={t("webReader.actions.back")}
            className="icon-button"
            disabled={!canGoBack}
            type="button"
            onClick={goBack}
          >
            <ArrowLeft size={17} />
          </button>
          <button
            aria-label={t("webReader.actions.forward")}
            className="icon-button"
            disabled={!canGoForward}
            type="button"
            onClick={goForward}
          >
            <ArrowRight size={17} />
          </button>
          <button
            aria-label={t("webReader.actions.reload")}
            className="icon-button"
            disabled={isHubVisible}
            type="button"
            onClick={reloadPage}
          >
            <RefreshCcw className={isLoading ? "spin" : ""} size={16} />
          </button>
          <button
            aria-label={t("webReader.actions.home")}
            className="icon-button"
            type="button"
            onClick={goHome}
          >
            <Home size={16} />
          </button>
        </div>

        <label className="web-reader-address">
          <Search size={16} />
          <input
            aria-label={t("webReader.address.label")}
            data-qa="web-reader-address"
            value={addressValue}
            onChange={(event) => setAddressValue(event.target.value)}
            placeholder={t("webReader.address.placeholder")}
          />
        </label>

        <div className="web-reader-action-cluster">
          <button
            className="button secondary small"
            type="button"
            disabled={!isTranslatingPage && !canTranslateCurrentPage}
            onClick={() =>
              void (isTranslatingPage ? stopPageTranslation() : translateCurrentPage())
            }
          >
            {isTranslatingPage ? <X size={15} /> : <Languages size={15} />}
            {isTranslatingPage
              ? t("webReader.translation.stop")
              : isTranslatedPageActive
                ? t("webReader.actions.original")
                : t("webReader.actions.translatePage")}
          </button>
          <button
            className="button secondary small"
            type="button"
            disabled={!isTranslating && isTranslatingPage}
            onClick={() =>
              void (isTranslating ? stopSelectionTranslation() : translateSelection())
            }
          >
            {isTranslating ? <X size={15} /> : <Languages size={15} />}
            {isTranslating
              ? t("webReader.translation.stop")
              : t("webReader.actions.translateSelection")}
          </button>
          <button
            className="button secondary small"
            type="button"
            disabled={isSavingCandidate}
            onClick={() => void saveCandidate()}
          >
            {isSavingCandidate ? <Loader2 className="spin" size={15} /> : <BookmarkPlus size={15} />}
            {t("webReader.actions.saveCandidate")}
          </button>
          <button
            className="button primary small"
            data-qa="web-reader-create-card"
            type="button"
            disabled={isSavingCard}
            onClick={() => void saveGeneratedReadingCard()}
          >
            {isSavingCard ? <Loader2 className="spin" size={15} /> : <CreditCard size={15} />}
            {isSavingCard ? t("webReader.actions.generating") : t("webReader.actions.createCard")}
          </button>
        </div>
      </form>

      <div className="web-reader-stage" ref={stageRef}>
        {isHubVisible ? (
          <div className="web-reader-hub" data-qa="web-reader-hub">
            <section className="web-reader-hub-hero">
              <div className="web-reader-hub-heading">
                <span>{t("webReader.home.eyebrow")}</span>
                <h2>
                  {t("webReader.home.heading", { language: sourceLanguageDisplayName })}
                </h2>
                <p>{t("webReader.home.description")}</p>
              </div>
              <form className="web-reader-hub-search" onSubmit={submitAddress}>
                <Search size={18} />
                <input
                  aria-label={t("webReader.home.searchLabel")}
                  data-qa="web-reader-hub-search"
                  placeholder={t("webReader.home.searchPlaceholder")}
                  value={addressValue}
                  onChange={(event) => setAddressValue(event.target.value)}
                />
                <button className="button primary small" type="submit">
                  {t("webReader.actions.open")}
                </button>
              </form>
            </section>

            <section className="web-reader-hub-section">
              <div className="web-reader-hub-section-head">
                <span>{t("webReader.home.intentTitle")}</span>
                <small>{t("webReader.home.intentDescription")}</small>
              </div>
              <div className="web-reader-intent-grid">
                {webReaderHubModel.intents.map((intent) => {
                  const IntentIcon = intent.icon;
                  return (
                    <button
                      className="web-reader-intent-card"
                      key={intent.label}
                      type="button"
                      onClick={() =>
                        openWebReaderUrl(intent.url, {
                          label: intent.label,
                          url: intent.url,
                          description: intent.description
                        })
                      }
                    >
                      <IntentIcon size={18} />
                      <strong>{intent.label}</strong>
                      <span>{intent.description}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="web-reader-hub-grid">
              <div className="web-reader-hub-panel category">
                <div className="web-reader-hub-section-head">
                  <span>{t("webReader.home.categoryTitle")}</span>
                  <small>{t("webReader.home.categoryDescription")}</small>
                </div>
                <div className="web-reader-category-layout">
                  <div
                    className="web-reader-category-rail"
                    role="tablist"
                    aria-label={t("webReader.home.categoryAria")}
                  >
                    {webReaderHubModel.categories.map((category) => {
                      const CategoryIcon = category.icon;
                      const isActive = category.id === activeHubCategory.id;
                      const canDeleteCategory = isCustomLibraryEditing && category.isCustom;
                      return (
                        <div
                          className={
                            canDeleteCategory
                              ? "web-reader-category-rail-row editable"
                              : "web-reader-category-rail-row"
                          }
                          key={category.id}
                        >
                          <button
                            aria-selected={isActive}
                            className={isActive ? "active" : ""}
                            role="tab"
                            type="button"
                            onClick={() => setActiveHubCategoryId(category.id)}
                          >
                            <CategoryIcon size={16} />
                            <span className="web-reader-category-main">
                              {category.purpose ? (
                                <span
                                  className={`web-reader-category-purpose ${category.purpose}`}
                                >
                                  {category.purpose === "output-life"
                                    ? t("webReader.hub.purpose.outputLife")
                                    : t("webReader.hub.purpose.inputReading")}
                                </span>
                              ) : null}
                              <span>{category.label}</span>
                            </span>
                          </button>
                          {canDeleteCategory ? (
                            <button
                              aria-label={t("webReader.hub.custom.deleteCategoryAria", {
                                name: category.label
                              })}
                              className="web-reader-category-delete"
                              type="button"
                              onClick={() => deleteCustomCategory(category.id)}
                            >
                              <Trash2 size={13} />
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                    <div className="web-reader-category-rail-actions">
                      <button
                        className={isCustomLibraryManagerOpen ? "active" : ""}
                        disabled={!onSettingsChange}
                        type="button"
                        onClick={toggleCustomLibraryManager}
                      >
                        <Plus size={16} />
                        <span>{t("webReader.actions.add")}</span>
                      </button>
                      <button
                        className={isCustomLibraryEditing ? "active" : ""}
                        disabled={
                          !onSettingsChange ||
                          profileCustomCategories.length + profileCustomSources.length === 0
                        }
                        type="button"
                        onClick={toggleCustomLibraryEditing}
                      >
                        {isCustomLibraryEditing ? <Check size={16} /> : <Pencil size={16} />}
                        <span>
                          {isCustomLibraryEditing
                            ? t("webReader.actions.done")
                            : t("webReader.actions.edit")}
                        </span>
                      </button>
                    </div>
                  </div>
                  <div className="web-reader-source-list">
                    {activeHubCategory.sources.length > 0 ? (
                      activeHubCategory.sources.map((source) => {
                        const sourceStyle = getWebReaderSourceStyle(source);
                        const canDeleteSource =
                          isCustomLibraryEditing && source.isCustom && Boolean(source.id);
                        const sourceCardContent = (
                          <>
                            <span className="web-reader-source-topline">
                              <span className="web-reader-source-badge">{sourceStyle.initials}</span>
                              <span className="web-reader-source-tag">
                                {getWebReaderSourceTagLabel(sourceStyle.tag, t)}
                              </span>
                            </span>
                            <strong>{source.label}</strong>
                            <span>{source.description}</span>
                          </>
                        );
                        if (canDeleteSource) {
                          return (
                            <div
                              className="web-reader-source-card web-reader-source-card-editable"
                              key={source.url}
                              style={{ "--source-accent": sourceStyle.accent } as CSSProperties}
                            >
                              <button
                                className="web-reader-source-card-body"
                                type="button"
                                onClick={() => openWebReaderUrl(source.url, source)}
                              >
                                {sourceCardContent}
                              </button>
                              <button
                                className="web-reader-source-delete"
                                type="button"
                                onClick={() => source.id && deleteCustomSource(source.id)}
                              >
                                <Trash2 size={13} />
                                {t("common.delete")}
                              </button>
                            </div>
                          );
                        }
                        return (
                          <button
                            className="web-reader-source-card"
                            data-qa={
                              source.url === WEB_READER_PRACTICE_URL
                                ? "web-reader-open-practice"
                                : source.url === WEB_READER_DEFAULT_URL
                                ? "web-reader-open-default"
                                : undefined
                            }
                            key={source.url}
                            style={{ "--source-accent": sourceStyle.accent } as CSSProperties}
                            type="button"
                            onClick={() => openWebReaderUrl(source.url, source)}
                          >
                            {sourceCardContent}
                          </button>
                        );
                      })
                    ) : (
                      <div className="web-reader-source-empty">
                        {t("webReader.empty.category")}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <aside className="web-reader-hub-panel side">
                <div className="web-reader-hub-section-head">
                  <span>{t("webReader.home.featuredTitle")}</span>
                  <small>{t("webReader.home.featuredDescription")}</small>
                </div>
                <div className="web-reader-feature-list">
                  {webReaderHubModel.featured.map((source) => {
                    const sourceStyle = getWebReaderSourceStyle(source);
                    return (
                      <button
                        className="web-reader-feature-card"
                        data-qa={
                          source.url === WEB_READER_PRACTICE_URL
                            ? "web-reader-open-practice"
                            : source.url === WEB_READER_DEFAULT_URL
                              ? "web-reader-open-default"
                              : undefined
                        }
                        key={source.url}
                        style={{ "--source-accent": sourceStyle.accent } as CSSProperties}
                        type="button"
                        onClick={() => openWebReaderUrl(source.url, source)}
                      >
                        <span className="web-reader-source-badge">{sourceStyle.initials}</span>
                        <span>
                          <strong>{source.label}</strong>
                          <small>{source.description}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="web-reader-hub-section-head compact">
                  <span>{t("webReader.home.recentTitle")}</span>
                  <small>{t("webReader.home.thisSession")}</small>
                </div>
                <div className="web-reader-recent-list">
                  {(recentHubSources.length ? recentHubSources : webReaderHubModel.featured.slice(0, 2)).map(
                    (source) => {
                      const sourceStyle = getWebReaderSourceStyle(source);
                      return (
                        <button
                          className="web-reader-recent-card"
                          key={`recent-${source.url}`}
                          style={{ "--source-accent": sourceStyle.accent } as CSSProperties}
                          type="button"
                          onClick={() => openWebReaderUrl(source.url, source)}
                        >
                          <Clock3 size={14} />
                          <span>{source.label}</span>
                        </button>
                      );
                    }
                  )}
                </div>

                {webReaderHubModel.otherLanguageSources.length > 0 ? (
                  <details className="web-reader-other-language-sources">
                    <summary>
                      {t("webReader.home.otherLanguageCount", {
                        formattedCount: numberFormatter.format(
                          webReaderHubModel.otherLanguageSources.length
                        )
                      })}
                    </summary>
                    <div className="web-reader-other-language-list">
                      {webReaderHubModel.otherLanguageSources.map((source) => {
                        const sourceStyle = getWebReaderSourceStyle(source);
                        return (
                          <button
                            className="web-reader-recent-card"
                            key={`other-${source.url}`}
                            style={{ "--source-accent": sourceStyle.accent } as CSSProperties}
                            type="button"
                            onClick={() => openWebReaderUrl(source.url, source)}
                          >
                            <span className="web-reader-source-badge">{sourceStyle.initials}</span>
                            <span>
                              {source.label}
                              <small>{formatLanguageCode(source.languageCode || "unknown")}</small>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </details>
                ) : null}
              </aside>
            </section>
          </div>
        ) : (
          <>
            <div className="web-reader-title-strip">
              <span>{formatSafeWebReaderTitle(pageTitle, t("webReader.title"))}</span>
              <small>
                {formatSafeWebReaderAddress(readerUrl, t("webReader.address.localContent"))}
              </small>
            </div>
            <div aria-busy={isLoading} className="web-reader-web-surface" ref={webSurfaceRef}>
              {supportsWebview ? (
                <div
                  className="web-reader-webview web-reader-browser-view-slot"
                  data-qa="web-reader-browser-view-slot"
                />
              ) : (
                <iframe
                  className="web-reader-webview"
                  data-qa="web-reader-iframe"
                  referrerPolicy="no-referrer"
                  src={readerUrl}
                  title={t("webReader.preview.iframeTitle")}
                />
              )}
            </div>
          </>
        )}

        <div className="web-reader-status-bar">
          <span aria-atomic="true" aria-live="polite" role="status">
            {statusMessage}
          </span>
          {retryAction ? (
            <button className="web-reader-status-retry" type="button" onClick={retryLastAction}>
              <RefreshCcw aria-hidden="true" size={12} />
              {t("common.retry")}
            </button>
          ) : null}
          <span className={lifeMiningState.enabled ? "web-reader-life-chip on" : "web-reader-life-chip"}>
            {lifeMiningStatusText}
          </span>
          {!supportsWebview && !isHubVisible ? (
            <small>{t("webReader.preview.iframeLimit")}</small>
          ) : null}
        </div>

        {cardPreview ? (
          <Dialog
            ariaLabelledBy="web-reader-card-preview-title"
            backdropClassName="web-reader-card-preview-layer"
            className="sentence-card-popover web-reader-card-preview-dialog"
            data-qa="web-reader-card-preview"
            closeOnBackdrop={!isSavingCard}
            closeOnEscape={!isSavingCard}
            onClose={closeUnifiedCardPreview}
          >
              <div className="sentence-card-popover-top">
                <div className="sentence-card-popover-header">
                  <div className="panel-heading">
                    <CreditCard size={18} />
                    <div>
                      <small>{t("webReader.preview.result")}</small>
                      <h2 id="web-reader-card-preview-title">
                        {t("webReader.preview.cardTitle")}
                      </h2>
                    </div>
                  </div>
                  <button
                    aria-label={t("webReader.preview.closeCard")}
                    className="icon-button"
                    disabled={isSavingCard}
                    type="button"
                    onClick={closeUnifiedCardPreview}
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="web-reader-card-preview-actions">
                  <button
                    className="button primary"
                    disabled={isSavingCard}
                    type="button"
                    onClick={() => void handleBrowserPopoverSavePreview()}
                  >
                    {isSavingCard ? <Loader2 className="spin" size={15} /> : <CreditCard size={15} />}
                    {isSavingCard
                      ? t("webReader.actions.saving")
                      : t("webReader.actions.saveCard")}
                  </button>
                  <button
                    className="button secondary"
                    disabled={isSavingCard}
                    type="button"
                    onClick={closeUnifiedCardPreview}
                  >
                    {t("webReader.actions.selectAgain")}
                  </button>
                </div>
              </div>
              <div className="sentence-card-preview-scroll">
                <CardPreview card={cardPreview} settings={settings} defaultShowBack />
              </div>
          </Dialog>
        ) : null}

        {isCustomLibraryManagerOpen ? (
          <Dialog
            ariaLabelledBy="web-reader-custom-manager-title"
            backdropClassName="web-reader-custom-modal"
            className="web-reader-custom-manager"
            onClose={closeCustomLibraryManager}
          >
              <div className="web-reader-custom-manager-head">
                <div>
                  <span>{t("webReader.hub.custom.eyebrow")}</span>
                  <h2 id="web-reader-custom-manager-title">
                    {t("webReader.hub.custom.title")}
                  </h2>
                  <small>
                    {t("webReader.hub.custom.profileNote", {
                      language: sourceLanguageDisplayName
                    })}
                  </small>
                </div>
                <button
                  aria-label={t("webReader.hub.custom.close")}
                  className="icon-button"
                  type="button"
                  onClick={closeCustomLibraryManager}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="web-reader-custom-manager-body">
                <form className="web-reader-custom-form" onSubmit={addCustomCategory}>
                  <div className="web-reader-custom-form-title">
                    <strong>{t("webReader.hub.custom.categoryTitle")}</strong>
                    <small>{t("webReader.hub.custom.categoryDescription")}</small>
                  </div>
                  <select
                    aria-label={t("webReader.hub.custom.categoryPurposeLabel")}
                    value={customCategoryPurpose}
                    onChange={(event) =>
                      setCustomCategoryPurpose(
                        event.target.value as "" | "input-reading" | "output-life"
                      )
                    }
                  >
                    <option value="">{t("webReader.hub.purpose.none")}</option>
                    <option value="input-reading">
                      {t("webReader.hub.purpose.inputReading")}
                    </option>
                    <option value="output-life">
                      {t("webReader.hub.purpose.outputLife")}
                    </option>
                  </select>
                  <input
                    aria-label={t("webReader.hub.custom.categoryNameLabel")}
                    placeholder={t("webReader.hub.custom.categoryNamePlaceholder")}
                    value={customCategoryLabel}
                    onChange={(event) => setCustomCategoryLabel(event.target.value)}
                  />
                  <div className="web-reader-custom-form-actions">
                    <button
                      className="button secondary small"
                      disabled={!onSettingsChange || !customCategoryLabel.trim()}
                      type="submit"
                    >
                      {t("webReader.hub.custom.addCategory")}
                    </button>
                  </div>
                </form>

                <form className="web-reader-custom-form" onSubmit={addCustomSource}>
                  <div className="web-reader-custom-form-title">
                    <strong>{t("webReader.hub.custom.sourceTitle")}</strong>
                    <small>{t("webReader.hub.custom.sourceDescription")}</small>
                  </div>
                  <select
                    aria-label={t("webReader.hub.custom.sourceCategoryLabel")}
                    value={selectedCustomSourceCategory?.id ?? customSourceCategoryId}
                    onChange={(event) => setCustomSourceCategoryId(event.target.value)}
                  >
                    {webReaderHubModel.categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.purpose
                          ? `${
                              category.purpose === "output-life"
                                ? t("webReader.hub.purpose.outputLife")
                                : t("webReader.hub.purpose.inputReading")
                            } · ${category.label}`
                          : category.label}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label={t("webReader.hub.custom.sourceNameLabel")}
                    placeholder={t("webReader.hub.custom.sourceNamePlaceholder")}
                    value={customSourceLabel}
                    onChange={(event) => setCustomSourceLabel(event.target.value)}
                  />
                  <input
                    aria-label={t("webReader.hub.custom.sourceAddressLabel")}
                    placeholder="https://example.com"
                    value={customSourceUrl}
                    onChange={(event) => setCustomSourceUrl(event.target.value)}
                  />
                  <div className="web-reader-custom-form-actions">
                    <button
                      className="button secondary small"
                      disabled={
                        !onSettingsChange || !customSourceLabel.trim() || !customSourceUrl.trim()
                      }
                      type="submit"
                    >
                      {t("webReader.hub.custom.addSource")}
                    </button>
                  </div>
                </form>
              </div>
          </Dialog>
        ) : null}

        {deleteRequest ? (
          <Dialog
            ariaDescribedBy="web-reader-delete-description"
            ariaLabelledBy="web-reader-delete-title"
            backdropClassName="web-reader-custom-modal"
            className="web-reader-delete-dialog"
            data-qa="web-reader-delete-dialog"
            initialFocusRef={deleteCancelButtonRef}
            onClose={() => setDeleteRequest(null)}
          >
            <div className="web-reader-delete-copy">
              <Trash2 aria-hidden="true" size={20} />
              <div>
                <h2 id="web-reader-delete-title">
                  {deleteRequest.kind === "category"
                    ? t("webReader.delete.categoryTitle", { name: deleteRequest.label })
                    : t("webReader.delete.sourceTitle", { name: deleteRequest.label })}
                </h2>
                <p id="web-reader-delete-description">
                  {deleteRequest.kind === "category"
                    ? t("webReader.delete.categoryDescription", {
                        formattedCount: numberFormatter.format(deleteRequest.sourceCount)
                      })
                    : t("webReader.delete.sourceDescription")}
                </p>
              </div>
            </div>
            <div className="web-reader-delete-actions">
              <button
                ref={deleteCancelButtonRef}
                className="button secondary"
                type="button"
                onClick={() => setDeleteRequest(null)}
              >
                {t("common.cancel")}
              </button>
              <button className="button danger" type="button" onClick={confirmCustomDelete}>
                {t("common.delete")}
              </button>
            </div>
          </Dialog>
        ) : null}

        {languageMismatch ? (
          <div className="web-reader-language-mismatch" role="alert">
            <div>
              <strong>{t("webReader.mismatch.title")}</strong>
              <span>
                {t("webReader.mismatch.languages", {
                  detected: formatLanguageCode(
                    languageMismatch.assessment.detectedLanguageCode
                  ),
                  expected: formatLanguageCode(
                    languageMismatch.assessment.expectedLanguageCode
                  )
                })}
              </span>
            </div>
            <div className="web-reader-language-mismatch-actions">
              <button className="button secondary small" type="button" onClick={openTranslatedPageForMismatch}>
                {t("webReader.mismatch.openTranslated")}
              </button>
              <button className="button secondary small" type="button" onClick={switchProfileForMismatch}>
                {t("webReader.mismatch.switchProfile")}
              </button>
              <button
                className="button primary small"
                disabled={isSavingCard}
                type="button"
                onClick={() => void saveMismatchOverride()}
              >
                {t("webReader.mismatch.saveAnyway")}
              </button>
            </div>
          </div>
        ) : null}

        {!isHubVisible && !supportsWebview && popoverPosition && selection ? (
          <div
            className="web-reader-selection-popover"
            style={{
              left: popoverPosition.left,
              top: popoverPosition.top
            }}
          >
            <button
              aria-label={t("webReader.selection.closeTools")}
              className="icon-button web-reader-popover-close"
              type="button"
              onClick={() => {
                setSelection(null);
                setPopoverPosition(null);
                setTranslationText("");
              }}
            >
              <X size={14} />
            </button>
            <small>{t("webReader.selection.selectedSentence")}</small>
            <p>{selection.selectedText}</p>
            {translationText ? <div className="web-reader-translation">{translationText}</div> : null}
            <CardGenerationUsageEstimate
              align="start"
              estimate={selectionUsageEstimate}
              variant="badge"
            />
            <div className="web-reader-popover-actions">
              <button
                className="button primary small"
                data-qa="web-reader-popover-create-card"
                type="button"
                disabled={isSavingCard}
                onClick={() => void saveGeneratedReadingCard()}
              >
                <CreditCard size={14} />
                {isSavingCard
                  ? t("webReader.actions.generating")
                  : t("webReader.actions.createCard")}
              </button>
              <button
                className="button secondary small"
                type="button"
                disabled={isSavingCandidate}
                onClick={() => void saveCandidate()}
              >
                <BookmarkPlus size={14} />
                {t("webReader.actions.saveCandidate")}
              </button>
              <button
                className="button secondary small"
                type="button"
                onClick={() =>
                  void (isTranslating ? stopSelectionTranslation() : translateSelection())
                }
              >
                {isTranslating ? <X size={14} /> : <Languages size={14} />}
                {isTranslating
                  ? t("webReader.translation.stop")
                  : t("webReader.actions.translate")}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function getSelectionContext(selection: WebReaderSelection) {
  if (selection.sourceSentence?.trim()) {
    return extractSentenceContext({
      fullText: selection.sourceSentence,
      selectedText: selection.selectedText
    });
  }
  return extractSentenceContext({
    fullText: selection.fullText || selection.selectedText,
    selectedText: selection.selectedText,
    selectionOffset: selection.selectionOffset
  });
}

function getWebReaderSourceTagLabel(tag: WebReaderSourceTag, t: TFunction) {
  switch (tag) {
    case "ai":
      return t("webReader.hub.tags.ai");
    case "article":
      return t("webReader.hub.tags.article");
    case "book":
      return t("webReader.hub.tags.book");
    case "community":
      return t("webReader.hub.tags.community");
    case "conversation":
      return t("webReader.hub.tags.conversation");
    case "discussion":
      return t("webReader.hub.tags.discussion");
    case "documentation":
      return t("webReader.hub.tags.documentation");
    case "easyNews":
      return t("webReader.hub.tags.easyNews");
    case "encyclopedia":
      return t("webReader.hub.tags.encyclopedia");
    case "essay":
      return t("webReader.hub.tags.essay");
    case "knowledge":
      return t("webReader.hub.tags.knowledge");
    case "literature":
      return t("webReader.hub.tags.literature");
    case "longform":
      return t("webReader.hub.tags.longform");
    case "news":
      return t("webReader.hub.tags.news");
    case "qa":
      return t("webReader.hub.tags.qa");
    case "shortPost":
      return t("webReader.hub.tags.shortPost");
    case "studyNews":
      return t("webReader.hub.tags.studyNews");
    case "video":
      return t("webReader.hub.tags.video");
    case "work":
      return t("webReader.hub.tags.work");
    default:
      return t("webReader.hub.tags.web");
  }
}

function normalizePopoverSelection(payload: WebReaderPopoverActionPayload): WebReaderSelection {
  return {
    selectedText: String(payload.selectedText || "").trim(),
    fullText: String(payload.fullText || payload.sourceSentence || payload.selectedText || ""),
    selectionOffset:
      typeof payload.selectionOffset === "number" && Number.isFinite(payload.selectionOffset)
        ? payload.selectionOffset
        : undefined,
    title: String(payload.title || ""),
    url: String(payload.url || ""),
    rect: {
      left: normalizeFiniteNumber(payload.rect?.left),
      top: normalizeFiniteNumber(payload.rect?.top),
      right: normalizeFiniteNumber(payload.rect?.right),
      bottom: normalizeFiniteNumber(payload.rect?.bottom),
      width: normalizeFiniteNumber(payload.rect?.width),
      height: normalizeFiniteNumber(payload.rect?.height)
    },
    ...(payload.sourceSentence ? { sourceSentence: payload.sourceSentence } : {})
  } as WebReaderSelection;
}

function normalizeSelectedTerms(terms: string[] | undefined, fallback: string) {
  const normalized = (Array.isArray(terms) ? terms : [fallback])
    .map((term) => String(term || "").trim())
    .filter(Boolean);
  return normalized.length ? Array.from(new Set(normalized)) : [fallback];
}

function normalizeFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isHttpReaderUrl(value: string) {
  const normalized = normalizeWebReaderAddress(value);
  return normalized.startsWith("http://") || normalized.startsWith("https://");
}

function getTranslatedReaderSourceUrl(
  value: string,
  state: WebReaderTranslatedPageState | null
) {
  if (state?.sourceUrl) {
    return state.sourceUrl;
  }
  return isHttpReaderUrl(value) ? normalizeWebReaderAddress(value) : null;
}

function isTranslatedReaderUrl(
  value: string,
  state: WebReaderTranslatedPageState | null,
  targetLanguageCode: string
) {
  const normalizedCurrentUrl = normalizeWebReaderAddress(value);
  const normalizedSourceUrl = state?.sourceUrl ? normalizeWebReaderAddress(state.sourceUrl) : "";
  return (
    state?.targetLanguageCode.trim().toLowerCase().split("-")[0] ===
      targetLanguageCode.trim().toLowerCase().split("-")[0] &&
    Boolean(normalizedSourceUrl) &&
    normalizedCurrentUrl === normalizedSourceUrl
  );
}

function getTranslationModel(settings: AppSettings) {
  if (settings.translationProviderName === "gemini") {
    return settings.geminiModel;
  }
  if (settings.translationProviderName === "localMt") {
    return settings.localMtModel;
  }
  if (settings.translationProviderName === "local") {
    return settings.ollamaModel;
  }
  return undefined;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
