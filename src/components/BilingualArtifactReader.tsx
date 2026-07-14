import * as pdfjsLib from "pdfjs-dist";
import {
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  ListPlus,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  X
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent
} from "react";
import { useTranslation } from "react-i18next";
import { CardPreview } from "./CardPreview";
import { CardGenerationUsageEstimate } from "./CardGenerationUsageEstimate";
import { useCloudTranslationPreflight } from "./CloudTranslationPreflightDialog";
import {
  DocumentNotice,
  type DocumentNoticeValue
} from "./DocumentTechnicalDetails";
import { SelectionPopover } from "./SelectionPopover";
import type { LocalEnglishMinerApi } from "../data/api";
import type { LLMProvider } from "../services/llm/types";
import {
  readReaderBookmarks,
  removeReaderBookmark,
  upsertReaderBookmark
} from "../readerBookmarks";
import { createStudyCardFromGenerated } from "../shared/cardFactory";
import { documentTechnicalError } from "../shared/documentPresentation";
import { isAbortError } from "../shared/translationRequestLimits";
import type {
  AppSettings,
  BilingualReaderArtifact,
  StudyCard
} from "../shared/types";
import { extractSentenceContext } from "../utils/sentenceExtraction";
import {
  MAX_READER_SCALE,
  MIN_READER_SCALE,
  arrayBufferFromPdfFileData,
  clampScale,
  getPageNavigationDelta,
  getRangeRect,
  isEditableTarget,
  isPageNavigationShortcut,
  matchesShortcut,
  normalizeWhitespace,
  pdfTextItemsToString,
  positionPopover,
  positionSentencePopover,
  renderSentenceTerms,
  replaceSourceSentenceInContext,
  type SelectionRect
} from "./bilingualArtifactReaderUtils";
import {
  clampReaderPage,
  resolveReaderScale,
  resolveWheelPageNavigation,
  type ReaderViewMode,
  type ReaderWheelNavigationState
} from "./bilingualArtifactReaderNavigation";
import {
  MAX_SENTENCE_TERMS,
  createCardRequestFromExtraction,
  createCardRequestFromSentenceTerms,
  createSentenceTermsSession,
  estimateReaderCardUsage,
  type CardGenerationRequest,
  type SentenceTermsSession
} from "./bilingualArtifactReaderCards";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

async function loadPdfDocument(data: ArrayBuffer) {
  return pdfjsLib.getDocument({ data }).promise;
}

type PdfDocument = Awaited<ReturnType<typeof loadPdfDocument>>;
type PdfRenderTask = {
  promise: Promise<unknown>;
  cancel: () => void;
};
type PdfTextLayer = {
  render: () => Promise<unknown>;
  cancel: () => void;
};
type PdfTextLayerConstructor = new (options: {
  textContentSource: unknown;
  container: HTMLElement;
  viewport: unknown;
}) => PdfTextLayer;

type BilingualArtifactReaderProps = {
  api: LocalEnglishMinerApi;
  artifact: BilingualReaderArtifact | null;
  provider: LLMProvider;
  settings: AppSettings;
  onCardsChanged: () => Promise<void>;
  onOpenLiveTranslate: () => void;
  modeTabs?: ReactNode;
};

type LoadedKind = "empty" | "html" | "pdf";

type SelectionSnapshot = {
  selectedText: string;
  fullText: string;
  selectionOffset?: number;
  rect?: SelectionRect;
};

type ReaderSelection = {
  selectedText: string;
};

type PendingSentenceTerm = {
  text: string;
  position: {
    top: number;
    left: number;
  };
};

export function BilingualArtifactReader({
  api,
  artifact,
  provider,
  settings,
  onCardsChanged,
  onOpenLiveTranslate,
  modeTabs
}: BilingualArtifactReaderProps) {
  const { i18n, t } = useTranslation();
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language),
    [i18n.language, i18n.resolvedLanguage]
  );
  const viewerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const htmlFrameRef = useRef<HTMLIFrameElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const pdfTextCacheRef = useRef<Map<number, string>>(new Map());
  const wheelNavigationRef = useRef<ReaderWheelNavigationState>({
    accumulatedDelta: 0,
    lastNavigatedAt: 0
  });
  const stageMeasureRef = useRef({ width: 0, height: 0, frame: 0 });
  const pageCountRef = useRef(0);
  const hasDocumentRef = useRef(false);
  const isFullscreenRef = useRef(false);
  const [loadedKind, setLoadedKind] = useState<LoadedKind>("empty");
  const [title, setTitle] = useState<string>(() =>
    t("pdfAuthoring.artifactReader.defaultTitle")
  );
  const [htmlSource, setHtmlSource] = useState("");
  const [pdfDocument, setPdfDocument] = useState<PdfDocument | null>(null);
  const [pdfPageText, setPdfPageText] = useState("");
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [renderScale, setRenderScale] = useState(1);
  const [viewMode, setViewMode] = useState<ReaderViewMode>("fit-width");
  const [viewportVersion, setViewportVersion] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [bookmarkedPages, setBookmarkedPages] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [selection, setSelection] = useState<ReaderSelection | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number } | null>(
    null
  );
  const [sentenceTermsSession, setSentenceTermsSession] =
    useState<SentenceTermsSession | null>(null);
  const [sentencePopoverPosition, setSentencePopoverPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [sentenceTermsWarning, setSentenceTermsWarning] = useState("");
  const [isEditingSentence, setIsEditingSentence] = useState(false);
  const [sentenceDraft, setSentenceDraft] = useState("");
  const [pendingSentenceTerm, setPendingSentenceTerm] = useState<PendingSentenceTerm | null>(
    null
  );
  const [readerStatus, setReaderStatus] = useState("");
  const [errorNotice, setErrorNotice] = useState<DocumentNoticeValue | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [isGeneratingCard, setIsGeneratingCard] = useState(false);
  const [isSavingCard, setIsSavingCard] = useState(false);
  const [cardCandidate, setCardCandidate] = useState<StudyCard | null>(null);
  const [isEditingCardCandidate, setIsEditingCardCandidate] = useState(false);
  const [cardStatus, setCardStatus] = useState("");
  const [isCardPopupOpen, setIsCardPopupOpen] = useState(false);
  const [cardRequest, setCardRequest] = useState<CardGenerationRequest | null>(null);
  const {
    confirmCloudTranslation,
    cloudTranslationPreflightDialog
  } = useCloudTranslationPreflight();
  const setError = useCallback((summary: string) => {
    setErrorNotice(summary ? { summary } : null);
  }, []);
  const setTechnicalError = useCallback((summary: string, caught: unknown) => {
    const technicalDetail = documentTechnicalError(caught);
    setErrorNotice({
      summary,
      ...(technicalDetail ? { technicalDetail } : {})
    });
  }, []);

  const pageLabel = pageCount > 0
    ? t("pdfAuthoring.artifactReader.pageLabel", {
        current: numberFormatter.format(currentPage),
        total: numberFormatter.format(pageCount)
      })
    : t("pdfAuthoring.artifactReader.noDocument");
  const hasDocument = loadedKind !== "empty";
  const cardUsageEstimate = useMemo(() => {
    if (!cardRequest) {
      return null;
    }
    return estimateReaderCardUsage(cardRequest, settings);
  }, [
    cardRequest,
    settings.dailyAppTokenLimit,
    settings.geminiModel,
    settings.geminiPlan,
    settings.learningProfile,
    settings.monthlySpendLimitKrw,
    settings.ollamaModel,
    settings.providerName
  ]);

  useEffect(() => {
    pageCountRef.current = pageCount;
    hasDocumentRef.current = hasDocument;
    isFullscreenRef.current = isFullscreen;
    if (!isFullscreen) {
      wheelNavigationRef.current.accumulatedDelta = 0;
    }
  }, [hasDocument, isFullscreen, pageCount]);

  useEffect(() => {
    if (!artifact?.id) {
      setBookmarkedPages(new Set());
      return;
    }
    setBookmarkedPages(
      new Set(
        readReaderBookmarks(localStorage, settings.profileId)
          .filter((bookmark) => bookmark.documentId === artifact.id)
          .map((bookmark) => bookmark.pageNumber)
      )
    );
  }, [artifact?.id, settings.profileId]);

  useEffect(() => {
    setIsEditingCardCandidate(false);
  }, [cardCandidate?.id]);

  useEffect(() => {
    if (loadedKind === "empty") {
      setTitle(t("pdfAuthoring.artifactReader.defaultTitle"));
    }
  }, [loadedKind, t]);

  const clearLoadedDocument = useCallback(() => {
    setLoadedKind("empty");
    setHtmlSource("");
    setPdfDocument(null);
    setPdfPageText("");
    setPageCount(0);
    setCurrentPage(1);
    setZoom(1);
    setRenderScale(1);
    setViewMode("fit-width");
    setBookmarkedPages(new Set());
    setReaderStatus("");
    setError("");
    setSelection(null);
    setPopoverPosition(null);
    setSentenceTermsSession(null);
    setSentencePopoverPosition(null);
    setSentenceTermsWarning("");
    setIsEditingSentence(false);
    setSentenceDraft("");
    setPendingSentenceTerm(null);
    setCardCandidate(null);
    setCardStatus("");
    setIsCardPopupOpen(false);
    setCardRequest(null);
    pdfTextCacheRef.current.clear();
  }, [setError]);

  const openPdfData = useCallback(async (data: ArrayBuffer, nextTitle: string) => {
    const document = await loadPdfDocument(data);
    setLoadedKind("pdf");
    setTitle(nextTitle);
    setPdfDocument(document);
    setHtmlSource("");
    setPageCount(document.numPages);
    setCurrentPage(1);
    setZoom(1);
    setRenderScale(1);
    setViewMode("fit-page");
    setPdfPageText("");
    setReaderStatus("");
    setSelection(null);
    setPopoverPosition(null);
    setSentenceTermsSession(null);
    setSentencePopoverPosition(null);
    setSentenceTermsWarning("");
    setIsEditingSentence(false);
    setSentenceDraft("");
    setPendingSentenceTerm(null);
    setCardCandidate(null);
    setCardStatus("");
    setIsCardPopupOpen(false);
    setCardRequest(null);
    pdfTextCacheRef.current.clear();
  }, []);

  const openHtmlText = useCallback((html: string, nextTitle: string, nextPageCount?: number) => {
    setLoadedKind("html");
    setTitle(nextTitle);
    setHtmlSource(html);
    setPdfDocument(null);
    setPdfPageText("");
    setPageCount(Math.max(1, nextPageCount ?? 1));
    setCurrentPage(1);
    setZoom(1);
    setRenderScale(1);
    setViewMode("fit-width");
    setReaderStatus("");
    setSelection(null);
    setPopoverPosition(null);
    setSentenceTermsSession(null);
    setSentencePopoverPosition(null);
    setSentenceTermsWarning("");
    setIsEditingSentence(false);
    setSentenceDraft("");
    setPendingSentenceTerm(null);
    setCardCandidate(null);
    setCardStatus("");
    setIsCardPopupOpen(false);
    setCardRequest(null);
    pdfTextCacheRef.current.clear();
  }, []);

  useEffect(() => {
    const currentArtifact = artifact;
    if (!currentArtifact) {
      return;
    }
    const artifactToOpen: BilingualReaderArtifact = currentArtifact;

    let cancelled = false;
    setIsOpening(true);
    setError("");
    setReaderStatus(t("pdfAuthoring.artifactReader.status.openingArtifact"));

    async function openArtifact() {
      try {
        if (
          artifactToOpen.fileType === "html" ||
          /\.html?$/i.test(artifactToOpen.filePath)
        ) {
          const result = await api.documents.readTextFile(artifactToOpen.filePath);
          if (cancelled) {
            return;
          }
          if (!result) {
            throw new Error(t("pdfAuthoring.artifactReader.errors.htmlPath"));
          }
          openHtmlText(
            result.text,
            artifactToOpen.title || result.fileName,
            artifactToOpen.pageCount
          );
          setCurrentPage(
            clampReaderPage(
              artifactToOpen.initialPage ?? 1,
              Math.max(1, artifactToOpen.pageCount)
            ) ?? 1
          );
          return;
        }

        const result = await api.documents.readPdfFile(artifactToOpen.filePath);
        if (cancelled) {
          return;
        }
        if (!result) {
          throw new Error(t("pdfAuthoring.artifactReader.errors.pdfPath"));
        }
        await openPdfData(
          arrayBufferFromPdfFileData(result.data),
          artifactToOpen.title || result.fileName
        );
        setCurrentPage(
          clampReaderPage(artifactToOpen.initialPage ?? 1, Math.max(1, artifactToOpen.pageCount)) ?? 1
        );
      } catch (caught) {
        if (!cancelled) {
          clearLoadedDocument();
          setTechnicalError(t("pdfAuthoring.artifactReader.errors.openArtifact"), caught);
        }
      } finally {
        if (!cancelled) {
          setIsOpening(false);
        }
      }
    }

    void openArtifact();
    return () => {
      cancelled = true;
    };
  }, [api, artifact, clearLoadedDocument, openHtmlText, openPdfData, setTechnicalError, t]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) {
      return;
    }

    const requestMeasure = () => {
      const width = Math.round(stage.clientWidth);
      const height = Math.round(stage.clientHeight);
      const previous = stageMeasureRef.current;
      if (Math.abs(previous.width - width) < 2 && Math.abs(previous.height - height) < 2) {
        return;
      }

      stageMeasureRef.current = {
        ...previous,
        width,
        height
      };
      if (previous.frame) {
        window.cancelAnimationFrame(previous.frame);
      }
      const frame = window.requestAnimationFrame(() => {
        stageMeasureRef.current.frame = 0;
        setViewportVersion((value) => value + 1);
      });
      stageMeasureRef.current.frame = frame;
    };
    const observer = new ResizeObserver(requestMeasure);
    observer.observe(stage);
    window.addEventListener("resize", requestMeasure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", requestMeasure);
      if (stageMeasureRef.current.frame) {
        window.cancelAnimationFrame(stageMeasureRef.current.frame);
        stageMeasureRef.current.frame = 0;
      }
    };
  }, []);

  useEffect(() => {
    function handleFullscreenChange() {
      const nextIsFullscreen = document.fullscreenElement === viewerRef.current;
      setIsFullscreen(nextIsFullscreen);
      void api.app?.setPlayerFullscreen?.(nextIsFullscreen);
      setViewportVersion((value) => value + 1);
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      void api.app?.setPlayerFullscreen?.(false);
    };
  }, [api]);

  useEffect(() => {
    const document = pdfDocument;
    if (!document || !canvasRef.current || loadedKind !== "pdf") {
      return;
    }
    const documentToRender: PdfDocument = document;

    let cancelled = false;
    let renderTask: PdfRenderTask | null = null;
    let textLayer: PdfTextLayer | null = null;

    async function renderPage() {
      setReaderStatus(t("pdfAuthoring.artifactReader.status.renderingPage"));
      try {
        const page = await documentToRender.getPage(currentPage);
        if (cancelled || !canvasRef.current) {
          return;
        }

        const scale = resolvePdfScale(page, viewMode, zoom);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error(t("pdfAuthoring.artifactReader.errors.canvas"));
        }

        const outputScale = window.devicePixelRatio || 1;
        const cssWidth = Math.floor(viewport.width);
        const cssHeight = Math.floor(viewport.height);
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
        setRenderScale(scale);
        renderTask = page.render({
          canvasContext: context,
          viewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined
        });
        await renderTask.promise;

        const textContent = await page.getTextContent();
        const text = pdfTextItemsToString(textContent.items);
        pdfTextCacheRef.current.set(currentPage, text);
        setPdfPageText(text);

        const textLayerContainer = textLayerRef.current;
        const TextLayer = getPdfTextLayerConstructor();
        if (textLayerContainer && TextLayer) {
          textLayerContainer.textContent = "";
          textLayerContainer.style.width = `${cssWidth}px`;
          textLayerContainer.style.height = `${cssHeight}px`;
          textLayerContainer.style.setProperty("--scale-factor", String(viewport.scale));
          textLayer = new TextLayer({
            textContentSource: textContent,
            container: textLayerContainer,
            viewport
          });
          await textLayer.render();
        }

        if (!cancelled) {
          setReaderStatus("");
        }
      } catch (caught) {
        if (!cancelled) {
          setTechnicalError(t("pdfAuthoring.artifactReader.errors.renderPage"), caught);
          setReaderStatus("");
        }
      }
    }

    void renderPage();
    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [currentPage, isFullscreen, loadedKind, pdfDocument, setTechnicalError, t, viewMode, viewportVersion, zoom]);

  useEffect(() => {
    if (loadedKind !== "html") {
      return;
    }

    applyHtmlFrameView(currentPage);
  }, [currentPage, isFullscreen, loadedKind, viewMode, viewportVersion, zoom]);

  const goToPage = useCallback(
    (nextPage: number) => {
      const clampedPage = clampReaderPage(nextPage, pageCount);
      if (clampedPage === null) {
        return;
      }
      setCurrentPage(clampedPage);
    },
    [pageCount]
  );

  const navigatePageByWheel = useCallback(
    (deltaY: number, deltaMode = 0, timeStamp = Date.now()) => {
      const latestPageCount = pageCountRef.current;
      if (
        !isFullscreenRef.current ||
        !hasDocumentRef.current ||
        latestPageCount <= 1 ||
        !Number.isFinite(deltaY) ||
        deltaY === 0
      ) {
        return false;
      }

      const result = resolveWheelPageNavigation({
        isFullscreen: isFullscreenRef.current,
        hasDocument: hasDocumentRef.current,
        pageCount: latestPageCount,
        deltaY,
        deltaMode,
        timeStamp,
        state: wheelNavigationRef.current
      });
      wheelNavigationRef.current = result.state;
      if (result.pageDelta !== 0) {
        setCurrentPage((page) => clampReaderPage(page + result.pageDelta, latestPageCount) ?? page);
      }
      return result.handled;
    },
    []
  );

  const handleReaderWheel = useCallback(
    (event: ReactWheelEvent<HTMLElement>) => {
      if (event.ctrlKey || event.metaKey || isEditableTarget(event.target)) {
        return;
      }
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        return;
      }

      const handled = navigatePageByWheel(event.deltaY, event.deltaMode, event.timeStamp);
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    [navigatePageByWheel]
  );

  const handleDocumentWheel = useCallback(
    (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || isEditableTarget(event.target)) {
        return;
      }
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        return;
      }

      const handled = navigatePageByWheel(event.deltaY, event.deltaMode, event.timeStamp);
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    [navigatePageByWheel]
  );

  function resolvePdfScale(page: Awaited<ReturnType<PdfDocument["getPage"]>>, mode: ReaderViewMode, customZoom: number) {
    const stage = stageRef.current;
    if (!stage) {
      return clampScale(customZoom);
    }

    const baseViewport = page.getViewport({ scale: 1 });
    return resolveReaderScale({
      viewMode: mode,
      customZoom,
      isFullscreen,
      stageWidth: stage.clientWidth,
      stageHeight: stage.clientHeight,
      pageWidth: baseViewport.width,
      pageHeight: baseViewport.height
    });
  }

  function handleHtmlFrameLoad() {
    const frame = htmlFrameRef.current;
    const doc = frame?.contentDocument;
    if (!doc) {
      return;
    }

    const pages = doc.querySelectorAll(".page");
    if (pages.length > 0) {
      setPageCount(pages.length);
    }
    applyHtmlFrameView(currentPage);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isPageNavigationShortcut(event) && !isEditableTarget(event.target)) {
        event.preventDefault();
        const framePageCount = doc.querySelectorAll(".page").length || pageCount || 1;
        const delta = getPageNavigationDelta(event);
        setCurrentPage((page) => clampReaderPage(page + delta, framePageCount) ?? page);
        return;
      }

      if (!matchesShortcut(event, settings.captureShortcut) || isEditableTarget(event.target)) {
        return;
      }
      const selection = frame.contentWindow?.getSelection()?.toString().trim();
      if (!selection) {
        return;
      }
      event.preventDefault();
      void createCardFromSelection();
    };
    const handleSelectionUpdate = () => {
      window.setTimeout(updateSelectionFromReader, 0);
    };
    const handleSelectionChange = () => {
      const selectedText = frame.contentWindow?.getSelection()?.toString().trim() ?? "";
      if (!selectedText) {
        setSelection(null);
        setPopoverPosition(null);
      }
    };

    doc.addEventListener("keydown", handleKeyDown);
    doc.addEventListener("wheel", handleDocumentWheel, { passive: false });
    doc.addEventListener("mouseup", handleSelectionUpdate);
    doc.addEventListener("keyup", handleSelectionUpdate);
    doc.addEventListener("selectionchange", handleSelectionChange);
  }

  async function handleOpenFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    setIsOpening(true);
    setError("");
    try {
      if (/\.html?$/i.test(file.name)) {
        openHtmlText(await file.text(), file.name);
      } else if (/\.pdf$/i.test(file.name)) {
        await openPdfData(await file.arrayBuffer(), file.name);
      } else {
        throw new Error(t("pdfAuthoring.artifactReader.errors.selectFile"));
      }
    } catch (caught) {
      setTechnicalError(t("pdfAuthoring.artifactReader.errors.openFile"), caught);
    } finally {
      setIsOpening(false);
    }
  }

  function applyHtmlFrameView(nextPage: number) {
    const doc = htmlFrameRef.current?.contentDocument;
    if (!doc) {
      return;
    }

    const scale = resolveHtmlScale();
    doc.documentElement.style.setProperty("zoom", String(scale));
    setRenderScale(scale);
    const pages = Array.from(doc.querySelectorAll<HTMLElement>(".page"));
    const targetPage = pages[nextPage - 1];
    if (targetPage) {
      targetPage.scrollIntoView({ block: "start" });
    }
  }

  function resolveHtmlScale() {
    const frame = htmlFrameRef.current;
    const doc = frame?.contentDocument;
    const stage = stageRef.current;
    if (!frame || !doc || !stage) {
      return clampScale(zoom);
    }

    const previousZoom = doc.documentElement.style.getPropertyValue("zoom");
    doc.documentElement.style.setProperty("zoom", "1");
    const page = doc.querySelector<HTMLElement>(".page");
    if (!page) {
      doc.documentElement.style.setProperty("zoom", previousZoom || "1");
      return clampScale(zoom);
    }

    const pageRect = page.getBoundingClientRect();
    doc.documentElement.style.setProperty("zoom", previousZoom || "1");
    return resolveReaderScale({
      viewMode,
      customZoom: zoom,
      isFullscreen,
      stageWidth: stage.clientWidth,
      stageHeight: stage.clientHeight,
      pageWidth: pageRect.width,
      pageHeight: pageRect.height
    });
  }

  async function runSearch() {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      setReaderStatus("");
      return;
    }

    if (loadedKind === "html") {
      const doc = htmlFrameRef.current?.contentDocument;
      const pages = Array.from(doc?.querySelectorAll<HTMLElement>(".page") ?? []);
      const pageIndex = pages.findIndex((page) =>
        (page.textContent ?? "").toLowerCase().includes(query)
      );
      if (pageIndex >= 0) {
        goToPage(pageIndex + 1);
        setReaderStatus(
          t("pdfAuthoring.artifactReader.status.foundOnPage", {
            page: numberFormatter.format(pageIndex + 1)
          })
        );
      } else {
        setReaderStatus(t("pdfAuthoring.artifactReader.status.noMatch"));
      }
      return;
    }

    if (loadedKind === "pdf" && pdfDocument) {
      for (let offset = 0; offset < pageCount; offset += 1) {
        const pageNumber = ((currentPage - 1 + offset) % pageCount) + 1;
        const pageText = await getPdfPageText(pdfDocument, pageNumber);
        if (pageText.toLowerCase().includes(query)) {
          goToPage(pageNumber);
          setReaderStatus(
            t("pdfAuthoring.artifactReader.status.foundOnPage", {
              page: numberFormatter.format(pageNumber)
            })
          );
          return;
        }
      }
      setReaderStatus(t("pdfAuthoring.artifactReader.status.noMatch"));
    }
  }

  async function getPdfPageText(document: PdfDocument, pageNumber: number) {
    const cached = pdfTextCacheRef.current.get(pageNumber);
    if (cached !== undefined) {
      return cached;
    }

    const page = await document.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const text = pdfTextItemsToString(textContent.items);
    pdfTextCacheRef.current.set(pageNumber, text);
    return text;
  }

  const getSelectionSnapshot = useCallback((): SelectionSnapshot | null => {
    if (loadedKind === "html") {
      const frame = htmlFrameRef.current;
      const doc = frame?.contentDocument;
      const selection = frame?.contentWindow?.getSelection();
      const selectedText = selection?.toString().trim() ?? "";
      if (!doc || !selection || selection.rangeCount === 0 || !selectedText) {
        return null;
      }

      const range = selection.getRangeAt(0);
      const preSelectionRange = range.cloneRange();
      preSelectionRange.selectNodeContents(doc.body);
      preSelectionRange.setEnd(range.startContainer, range.startOffset);
      const rangeRect = getRangeRect(range);
      const frameRect = frame.getBoundingClientRect();
      return {
        selectedText,
        fullText: doc.body.innerText,
        selectionOffset: preSelectionRange.toString().length,
        rect: rangeRect
          ? {
              top: frameRect.top + rangeRect.top,
              left: frameRect.left + rangeRect.left,
              width: rangeRect.width,
              height: rangeRect.height
            }
          : undefined
      };
    }

    if (loadedKind === "pdf") {
      const selection = window.getSelection();
      const textLayer = textLayerRef.current;
      const selectedText = selection?.toString().trim() ?? "";
      if (!selection || selection.rangeCount === 0 || !selectedText || !textLayer) {
        return null;
      }

      const range = selection.getRangeAt(0);
      if (!textLayer.contains(range.commonAncestorContainer)) {
        return null;
      }
      const preSelectionRange = range.cloneRange();
      preSelectionRange.selectNodeContents(textLayer);
      preSelectionRange.setEnd(range.startContainer, range.startOffset);
      const rangeRect = getRangeRect(range);
      return {
        selectedText,
        fullText: pdfPageText || textLayer.innerText,
        selectionOffset: preSelectionRange.toString().length,
        rect: rangeRect ?? undefined
      };
    }

    return null;
  }, [loadedKind, pdfPageText]);
  const selectionUsageEstimate = useMemo(() => {
    if (!selection?.selectedText) {
      return null;
    }
    const snapshot = getSelectionSnapshot();
    if (!snapshot) {
      return null;
    }
    const extraction = extractSentenceContext({
      fullText: snapshot.fullText,
      selectedText: snapshot.selectedText,
      selectionOffset: snapshot.selectionOffset
    });
    return estimateReaderCardUsage(
      createCardRequestFromExtraction(extraction, { fallbackContext: "sourceSentence" }),
      settings
    );
  }, [getSelectionSnapshot, selection, settings]);
  const sentenceTermsUsageEstimate = useMemo(() => {
    if (!sentenceTermsSession) {
      return null;
    }
    return estimateReaderCardUsage(
      createCardRequestFromSentenceTerms(sentenceTermsSession),
      settings
    );
  }, [sentenceTermsSession, settings]);

  const clearReaderSelection = useCallback(() => {
    setSelection(null);
    setPopoverPosition(null);
    setPendingSentenceTerm(null);
    window.getSelection()?.removeAllRanges();
    htmlFrameRef.current?.contentWindow?.getSelection()?.removeAllRanges();
  }, []);

  const cancelSelectionFlow = useCallback(() => {
    setSentenceTermsSession(null);
    setSentencePopoverPosition(null);
    setSentenceTermsWarning("");
    setIsEditingSentence(false);
    setSentenceDraft("");
    setPendingSentenceTerm(null);
    clearReaderSelection();
  }, [clearReaderSelection]);

  const updateSelectionFromReader = useCallback(() => {
    const snapshot = getSelectionSnapshot();
    if (!snapshot?.selectedText || !snapshot.rect) {
      setSelection(null);
      setPopoverPosition(null);
      return;
    }

    setSelection({ selectedText: snapshot.selectedText });
    setPopoverPosition(positionPopover(snapshot.rect));
  }, [getSelectionSnapshot]);

  const updateSentencePanelSelection = useCallback(() => {
    const session = sentenceTermsSession;
    if (!session) {
      return;
    }

    if (session.selectedTerms.length >= MAX_SENTENCE_TERMS) {
      setSentenceTermsWarning(
        t("pdfAuthoring.artifactReader.errors.maxTerms", { count: MAX_SENTENCE_TERMS })
      );
      setPendingSentenceTerm(null);
      window.getSelection()?.removeAllRanges();
      return;
    }

    const activeSelection = window.getSelection();
    if (!activeSelection || activeSelection.rangeCount === 0) {
      return;
    }

    const selectedText = activeSelection.toString().trim();
    if (!selectedText) {
      setPendingSentenceTerm(null);
      return;
    }

    const range = activeSelection.getRangeAt(0);
    const sourceBox = document.querySelector(".sentence-term-popover .sentence-source-box");
    if (!sourceBox?.contains(range.commonAncestorContainer)) {
      return;
    }

    const rect = getRangeRect(range);
    if (!rect) {
      return;
    }

    setPendingSentenceTerm({
      text: selectedText,
      position: {
        top: Math.max(12, rect.top - 72),
        left: Math.min(window.innerWidth - 176, Math.max(16, rect.left + rect.width / 2 - 88))
      }
    });
    setSentenceTermsWarning("");
  }, [sentenceTermsSession, t]);

  const addSentenceTerm = useCallback(
    (term: string) => {
      const session = sentenceTermsSession;
      if (!session) {
        return;
      }

      if (session.selectedTerms.length >= MAX_SENTENCE_TERMS) {
        setSentenceTermsWarning(
          t("pdfAuthoring.artifactReader.errors.maxTerms", { count: MAX_SENTENCE_TERMS })
        );
        setPendingSentenceTerm(null);
        window.getSelection()?.removeAllRanges();
        return;
      }

      const trimmedTerm = term.trim();
      const normalizedTerm = trimmedTerm.toLowerCase();
      const hasTerm = session.selectedTerms.some(
        (selectedTerm) => selectedTerm.toLowerCase() === normalizedTerm
      );

      if (hasTerm) {
        setSentenceTermsWarning(t("pdfAuthoring.artifactReader.errors.duplicateTerm"));
        setPendingSentenceTerm(null);
        window.getSelection()?.removeAllRanges();
        return;
      }

      setSentenceTermsSession({
        ...session,
        selectedTerms: [...session.selectedTerms, trimmedTerm]
      });
      setSentenceTermsWarning("");
      setPendingSentenceTerm(null);
      setCardStatus(t("pdfAuthoring.artifactReader.status.termAdded", { term: trimmedTerm }));
      window.getSelection()?.removeAllRanges();
    },
    [sentenceTermsSession, t]
  );

  const startSentenceEdit = useCallback(() => {
    const session = sentenceTermsSession;
    if (!session) {
      return;
    }

    setSentenceDraft(session.sourceSentence);
    setIsEditingSentence(true);
    setSentenceTermsWarning("");
    setPendingSentenceTerm(null);
    window.getSelection()?.removeAllRanges();
  }, [sentenceTermsSession]);

  const cancelSentenceEdit = useCallback(() => {
    setSentenceDraft(sentenceTermsSession?.sourceSentence ?? "");
    setIsEditingSentence(false);
    setSentenceTermsWarning("");
  }, [sentenceTermsSession]);

  const applySentenceEdit = useCallback(() => {
    const session = sentenceTermsSession;
    if (!session) {
      return;
    }

    const editedSentence = normalizeWhitespace(sentenceDraft);
    if (!editedSentence) {
      setSentenceTermsWarning(t("pdfAuthoring.artifactReader.errors.enterSentence"));
      return;
    }

    const normalizedFullText = replaceSourceSentenceInContext(
      session.normalizedFullText,
      session.sourceSentence,
      editedSentence,
      session.beforeSentence,
      session.afterSentence
    );
    setSentenceTermsSession({
      ...session,
      sourceSentence: editedSentence,
      normalizedFullText,
      isSourceSentenceEdited: true
    });
    setSentenceDraft(editedSentence);
    setIsEditingSentence(false);
    setSentenceTermsWarning(t("pdfAuthoring.artifactReader.sentenceTerms.editedNotice"));
  }, [sentenceDraft, sentenceTermsSession, t]);

  const startSentenceTermSelection = useCallback(() => {
    const snapshot = getSelectionSnapshot();
    if (!snapshot) {
      setCardStatus(t("pdfAuthoring.artifactReader.errors.selectTerm"));
      return;
    }

    const extraction = extractSentenceContext({
      fullText: snapshot.fullText,
      selectedText: snapshot.selectedText,
      selectionOffset: snapshot.selectionOffset
    });
    setSentenceTermsSession(createSentenceTermsSession(extraction));
    setSentencePopoverPosition(positionSentencePopover(snapshot.rect));
    setSentenceTermsWarning("");
    setIsEditingSentence(false);
    setSentenceDraft(extraction.sourceSentence);
    setPendingSentenceTerm(null);
    setCardCandidate(null);
    setIsCardPopupOpen(false);
    setCardRequest(null);
    setCardStatus(
      t("pdfAuthoring.artifactReader.status.choosingSentenceTerms", {
        text: extraction.selectedText
      })
    );
    clearReaderSelection();
  }, [clearReaderSelection, getSelectionSnapshot, t]);

  const generateCardFromRequest = useCallback(async (request: CardGenerationRequest) => {
    const allowed =
      settings.providerName !== "gemini" && settings.providerName !== "ollama"
        ? true
        : await confirmCloudTranslation({
            settings,
            providerName: settings.providerName === "gemini" ? "gemini" : "local",
            model:
              settings.providerName === "gemini"
                ? settings.geminiModel
                : settings.ollamaModel,
            operation: "text",
            textGroups: [[
              request.selectedText,
              request.sourceSentence,
              request.beforeSentence ?? "",
              request.afterSentence ?? "",
              request.readerTextContext ?? ""
            ]],
            scopeLabel: t("cloudTranslationPreflight.cardScope"),
            dataCategories: [
              t("cloudTranslationPreflight.cardSelectedText"),
              t("cloudTranslationPreflight.cardContext"),
              t("cloudTranslationPreflight.learningProfile")
            ]
          });
    if (!allowed) {
      setCardStatus(t("manualChatGptBridge.cancelled"));
      return;
    }
    setCardRequest(request);
    setCardCandidate(null);
    setIsCardPopupOpen(true);
    setIsGeneratingCard(true);
    setIsSavingCard(false);
    setCardStatus(t("pdfAuthoring.artifactReader.status.makingCard"));
    setError("");
    try {
      const generated = await provider.generateReadingCard({
        selectedText: request.selectedText,
        sourceSentence: request.sourceSentence,
        beforeSentence: request.beforeSentence,
        afterSentence: request.afterSentence,
        readerTextContext: request.readerTextContext,
        learningProfile: settings.learningProfile,
        learnerLevel: "intermediate"
      });
      setCardCandidate(createStudyCardFromGenerated(generated));
      const confidenceLabel = request.isSourceSentenceEdited
        ? t("pdfAuthoring.artifactReader.confidence.edited")
        : request.extractionConfidence === "high"
          ? t("pdfAuthoring.artifactReader.confidence.high")
          : request.extractionConfidence === "medium"
            ? t("pdfAuthoring.artifactReader.confidence.medium")
            : t("pdfAuthoring.artifactReader.confidence.fallback");
      setCardStatus(
        t("pdfAuthoring.artifactReader.status.extractionComplete", {
          confidence: confidenceLabel
        })
      );
    } catch (caught) {
      if (isAbortError(caught)) {
        setCardStatus(t("manualChatGptBridge.cancelled"));
        return;
      }
      const summary = t("pdfAuthoring.artifactReader.errors.createCard");
      setCardStatus(summary);
      setTechnicalError(summary, caught);
    } finally {
      setIsGeneratingCard(false);
    }
  }, [confirmCloudTranslation, provider, setTechnicalError, settings, t]);

  const createCardFromSentenceTerms = useCallback(async () => {
    const session = sentenceTermsSession;
    if (!session || isGeneratingCard || isEditingSentence) {
      return;
    }

    const request = createCardRequestFromSentenceTerms(session);
    cancelSelectionFlow();
    await generateCardFromRequest(request);
  }, [
    cancelSelectionFlow,
    generateCardFromRequest,
    isEditingSentence,
    isGeneratingCard,
    sentenceTermsSession
  ]);

  function handleZoomDelta(delta: number) {
    const currentScale = viewMode === "custom" ? zoom : renderScale;
    setZoom(clampScale(currentScale + delta));
    setViewMode("custom");
  }

  function handleActualSize() {
    setZoom(1);
    setViewMode("custom");
  }

  async function toggleFullscreen() {
    const viewer = viewerRef.current;
    if (!viewer) {
      return;
    }

    if (document.fullscreenElement === viewer) {
      await document.exitFullscreen();
      await api.app?.setPlayerFullscreen?.(false);
      return;
    }

    await viewer.requestFullscreen();
    await api.app?.setPlayerFullscreen?.(true);
  }

  const createCardFromSelection = useCallback(async () => {
    if (isGeneratingCard) {
      return;
    }

    const snapshot = getSelectionSnapshot();
    if (!snapshot) {
      setCardStatus(t("pdfAuthoring.artifactReader.errors.selectTerm"));
      return;
    }

    const extraction = extractSentenceContext({
      fullText: snapshot.fullText,
      selectedText: snapshot.selectedText,
      selectionOffset: snapshot.selectionOffset
    });
    clearReaderSelection();
    await generateCardFromRequest(createCardRequestFromExtraction(extraction));
  }, [
    clearReaderSelection,
    generateCardFromRequest,
    getSelectionSnapshot,
    isGeneratingCard,
    t
  ]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!matchesShortcut(event, settings.captureShortcut)) {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }
      if (sentenceTermsSession) {
        if (isEditingSentence) {
          return;
        }
        event.preventDefault();
        void createCardFromSentenceTerms();
        return;
      }
      if (!getSelectionSnapshot()) {
        return;
      }
      event.preventDefault();
      void createCardFromSelection();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    createCardFromSelection,
    createCardFromSentenceTerms,
    getSelectionSnapshot,
    isEditingSentence,
    sentenceTermsSession,
    settings.captureShortcut
  ]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!hasDocument || isEditableTarget(event.target) || !isPageNavigationShortcut(event)) {
        return;
      }

      event.preventDefault();
      goToPage(currentPage + getPageNavigationDelta(event));
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentPage, goToPage, hasDocument]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      const viewer = viewerRef.current;
      const popover = document.querySelector(".selection-popover");
      if (viewer?.contains(target) || popover?.contains(target)) {
        return;
      }
      if (sentenceTermsSession) {
        cancelSelectionFlow();
        return;
      }
      clearReaderSelection();
    }

    function handleSelectionChange() {
      if (loadedKind !== "pdf") {
        return;
      }
      const selectedText = window.getSelection()?.toString().trim() ?? "";
      if (!selectedText) {
        setSelection(null);
        setPopoverPosition(null);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [cancelSelectionFlow, clearReaderSelection, loadedKind, sentenceTermsSession]);

  async function saveCardCandidate() {
    if (!cardCandidate || isSavingCard) {
      return;
    }

    setIsSavingCard(true);
    setCardStatus(t("pdfAuthoring.artifactReader.status.savingCard"));
    try {
      await api.cards.save(cardCandidate);
      setCardStatus(t("pdfAuthoring.artifactReader.status.cardSaved"));
      setCardCandidate(null);
      setCardRequest(null);
      setIsCardPopupOpen(false);
      await onCardsChanged();
    } catch (caught) {
      const summary = t("pdfAuthoring.artifactReader.errors.saveCard");
      setCardStatus(summary);
      setTechnicalError(summary, caught);
    } finally {
      setIsSavingCard(false);
    }
  }

  function closeCardPopup() {
    if (isGeneratingCard || isSavingCard) {
      return;
    }
    setIsCardPopupOpen(false);
  }

  async function regenerateCardCandidate() {
    if (!cardRequest || isGeneratingCard) {
      return;
    }
    await generateCardFromRequest(cardRequest);
  }

  function toggleBookmark() {
    if (!currentPage || !hasDocument) {
      return;
    }

    setBookmarkedPages((previous) => {
      const next = new Set(previous);
      const documentId = artifact?.id ?? `manual:${title}`;
      const bookmarkId = `${documentId}:${currentPage}`;
      if (next.has(currentPage)) {
        next.delete(currentPage);
        removeReaderBookmark(localStorage, settings.profileId, bookmarkId);
      } else {
        next.add(currentPage);
        upsertReaderBookmark(localStorage, {
          profileId: settings.profileId,
          documentId,
          title,
          filePath: artifact?.filePath ?? "",
          fileType: artifact?.fileType ?? (loadedKind === "html" ? "html" : "pdf"),
          sourceLabel: artifact?.sourceLabel ?? t("pdfAuthoring.artifactReader.labels.source"),
          translationLabel:
            artifact?.translationLabel ?? t("pdfAuthoring.artifactReader.labels.translation"),
          pageNumber: currentPage,
          pageCount: Math.max(currentPage, pageCount)
        });
      }
      return next;
    });
  }

  function handleToolbarKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      void runSearch();
    }
  }

  return (
    <div className="finished-reader-shell">
      {cloudTranslationPreflightDialog}
      <div
        ref={viewerRef}
        className={`finished-reader-viewer${isFullscreen ? " is-fullscreen" : ""}`}
      >
      <div className="finished-reader-toolbar">
        <div className="finished-reader-title">
          <FileText size={18} />
          <div>
            <h2>{title}</h2>
            <span>
              {artifact?.filePath
                ? displayArtifactFileName(artifact.filePath)
                : t("pdfAuthoring.artifactReader.toolbar.filePrompt")}
            </span>
          </div>
        </div>
        <div className="finished-reader-actions">
          <button
            aria-label={t("pdfAuthoring.artifactReader.toolbar.previousPage")}
            className="icon-button"
            disabled={!hasDocument || currentPage <= 1}
            type="button"
            onClick={() => goToPage(currentPage - 1)}
          >
            <ChevronLeft size={17} />
          </button>
          <span className="finished-reader-page-label">{pageLabel}</span>
          <button
            aria-label={t("pdfAuthoring.artifactReader.toolbar.nextPage")}
            className="icon-button"
            disabled={!hasDocument || currentPage >= pageCount}
            type="button"
            onClick={() => goToPage(currentPage + 1)}
          >
            <ChevronRight size={17} />
          </button>
          <button
            aria-label={t("pdfAuthoring.artifactReader.toolbar.zoomOut")}
            className="icon-button"
            disabled={!hasDocument || renderScale <= MIN_READER_SCALE}
            type="button"
            onClick={() => handleZoomDelta(-0.1)}
          >
            <Minus size={17} />
          </button>
          <span className="finished-reader-zoom">
            {numberFormatter.format(Math.round(renderScale * 100))}%
          </span>
          <button
            aria-label={t("pdfAuthoring.artifactReader.toolbar.zoomIn")}
            className="icon-button"
            disabled={!hasDocument || renderScale >= MAX_READER_SCALE}
            type="button"
            onClick={() => handleZoomDelta(0.1)}
          >
            <Plus size={17} />
          </button>
          <button
            aria-label={
              isFullscreen
                ? t("pdfAuthoring.artifactReader.toolbar.exitFullscreen")
                : t("pdfAuthoring.artifactReader.toolbar.enterFullscreen")
            }
            className="icon-button"
            disabled={!hasDocument}
            title={
              isFullscreen
                ? t("pdfAuthoring.artifactReader.toolbar.exitFullscreen")
                : t("pdfAuthoring.artifactReader.toolbar.enterFullscreen")
            }
            type="button"
            onClick={() => void toggleFullscreen()}
          >
            {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
          <label
            className="button secondary small finished-reader-open-file"
            data-qa="finished-reader-open-file"
          >
            {t("pdfAuthoring.artifactReader.toolbar.openFile")}
            <input accept=".html,.htm,.pdf" type="file" onChange={handleOpenFile} />
          </label>
          {modeTabs ?? (
            <button className="button ghost small" type="button" onClick={onOpenLiveTranslate}>
              {t("pdfAuthoring.artifactReader.toolbar.liveTranslation")}
            </button>
          )}
        </div>
      </div>

      <div className="finished-reader-subbar">
        <label className="finished-reader-search">
          <Search size={15} />
          <input
            aria-label={t("pdfAuthoring.artifactReader.toolbar.search")}
            placeholder={t("pdfAuthoring.artifactReader.toolbar.search")}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={handleToolbarKeyDown}
          />
        </label>
        <button
          className={`button ghost small${viewMode === "fit-width" ? " active" : ""}`}
          disabled={!hasDocument}
          aria-pressed={viewMode === "fit-width"}
          type="button"
          onClick={() => setViewMode("fit-width")}
        >
          {t("pdfAuthoring.artifactReader.toolbar.fitWidth")}
        </button>
        <button
          className={`button ghost small${viewMode === "fit-page" ? " active" : ""}`}
          disabled={!hasDocument}
          aria-pressed={viewMode === "fit-page"}
          type="button"
          onClick={() => setViewMode("fit-page")}
        >
          {t("pdfAuthoring.artifactReader.toolbar.fitPage")}
        </button>
        <button
          className={`button ghost small${viewMode === "custom" && zoom === 1 ? " active" : ""}`}
          disabled={!hasDocument}
          aria-pressed={viewMode === "custom" && zoom === 1}
          type="button"
          onClick={handleActualSize}
        >
          100%
        </button>
        <button
          className={`button ghost small${bookmarkedPages.has(currentPage) ? " active" : ""}`}
          disabled={!hasDocument}
          aria-pressed={bookmarkedPages.has(currentPage)}
          type="button"
          onClick={toggleBookmark}
        >
          <Bookmark size={15} />
          {t("pdfAuthoring.artifactReader.toolbar.bookmark")}
        </button>
        <button
          className="button primary small"
          disabled={!hasDocument || isGeneratingCard}
          type="button"
          onClick={() => void createCardFromSelection()}
        >
          {isGeneratingCard ? <Loader2 className="spin" size={15} /> : <CreditCard size={15} />}
          {t("pdfAuthoring.artifactReader.toolbar.makeSentenceCard")}
        </button>
        <span className="muted compact">
          {t("pdfAuthoring.artifactReader.toolbar.shortcut", {
            shortcut: settings.captureShortcut || "Ctrl+Q"
          })}
        </span>
        <span
          aria-live="polite"
          className={`status-text compact finished-reader-status${readerStatus ? "" : " empty"}`}
        >
          {readerStatus || "\u00a0"}
        </span>
      </div>

      <DocumentNotice kind="error" value={errorNotice} />

      <div className="finished-reader-main">
        <div
          ref={stageRef}
          className="finished-reader-stage"
          onMouseUp={() => window.setTimeout(updateSelectionFromReader, 0)}
          onKeyUp={() => window.setTimeout(updateSelectionFromReader, 0)}
          onWheel={handleReaderWheel}
          tabIndex={0}
        >
          {isOpening ? (
            <div className="finished-reader-empty">
              <Loader2 className="spin" size={24} />
              <strong>{t("pdfAuthoring.artifactReader.empty.opening")}</strong>
            </div>
          ) : loadedKind === "html" ? (
            <iframe
              ref={htmlFrameRef}
              className="finished-reader-frame"
              sandbox="allow-same-origin"
              srcDoc={htmlSource}
              title={title}
              onLoad={handleHtmlFrameLoad}
            />
          ) : loadedKind === "pdf" ? (
            <div className="finished-reader-pdf-stage">
              <canvas ref={canvasRef} className="finished-reader-pdf-canvas" />
              <div ref={textLayerRef} className="finished-reader-pdf-text-layer textLayer" />
            </div>
          ) : (
            <label className="finished-reader-empty">
              <FileText size={38} />
              <strong>{t("pdfAuthoring.artifactReader.empty.title")}</strong>
              <span>{t("pdfAuthoring.artifactReader.empty.description")}</span>
              <span className="button primary">
                {t("pdfAuthoring.artifactReader.empty.action")}
              </span>
              <input accept=".html,.htm,.pdf" type="file" onChange={handleOpenFile} />
            </label>
          )}
        </div>

      </div>

      {sentenceTermsSession && sentencePopoverPosition ? (
        <div
          aria-label={t("pdfAuthoring.artifactReader.sentenceTerms.dialogLabel")}
          className="sentence-term-popover"
          style={{
            top: sentencePopoverPosition.top,
            left: sentencePopoverPosition.left
          }}
        >
          <div className="sentence-term-header">
            <div className="sentence-term-title">
              <ListPlus size={16} />
              <strong>{t("pdfAuthoring.artifactReader.sentenceTerms.title")}</strong>
            </div>
            {!isEditingSentence ? (
              <button
                className="button ghost sentence-edit-button"
                type="button"
                onClick={startSentenceEdit}
              >
                <Pencil size={13} />
                {t("pdfAuthoring.artifactReader.sentenceTerms.editSentence")}
              </button>
            ) : null}
          </div>
          {isEditingSentence ? (
            <div className="sentence-edit-panel">
              <textarea
                aria-label={t("pdfAuthoring.artifactReader.sentenceTerms.editLabel")}
                autoFocus
                className="sentence-edit-textarea"
                value={sentenceDraft}
                onChange={(event) => setSentenceDraft(event.target.value)}
              />
              <p className="muted compact">
                {t("pdfAuthoring.artifactReader.sentenceTerms.editHint")}
              </p>
            </div>
          ) : (
            <div
              className="sentence-source-box"
              onMouseUp={() => window.setTimeout(updateSentencePanelSelection, 0)}
              onKeyUp={() => window.setTimeout(updateSentencePanelSelection, 0)}
              tabIndex={0}
            >
              {renderSentenceTerms(
                sentenceTermsSession.sourceSentence,
                sentenceTermsSession.selectedTerms
              )}
            </div>
          )}
          {!isEditingSentence && pendingSentenceTerm ? (
            <div
              className="term-add-popover"
              style={{
                top: pendingSentenceTerm.position.top,
                left: pendingSentenceTerm.position.left
              }}
            >
              <div className="selection-popover-text">{pendingSentenceTerm.text}</div>
              <button
                className="button primary"
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addSentenceTerm(pendingSentenceTerm.text)}
              >
                <ListPlus size={15} />
                {t("pdfAuthoring.artifactReader.sentenceTerms.add")}
              </button>
            </div>
          ) : null}
          <div
            className="selection-term-list"
            aria-label={t("pdfAuthoring.artifactReader.sentenceTerms.selectedTerms")}
          >
            {sentenceTermsSession.selectedTerms.map((term) => (
              <span className="selection-term-chip" key={term}>
                {term}
              </span>
            ))}
            <span className="sentence-term-count">
              {numberFormatter.format(sentenceTermsSession.selectedTerms.length)}/
              {numberFormatter.format(MAX_SENTENCE_TERMS)}
            </span>
          </div>
          {sentenceTermsWarning ? <p className="selection-warning">{sentenceTermsWarning}</p> : null}
          <div className="sentence-term-actions">
            {isEditingSentence ? (
              <>
                <button className="button primary" type="button" onClick={applySentenceEdit}>
                  <Check size={15} />
                  {t("pdfAuthoring.artifactReader.sentenceTerms.apply")}
                </button>
                <button className="button ghost" type="button" onClick={cancelSentenceEdit}>
                  <X size={15} />
                  {t("common.cancel")}
                </button>
              </>
            ) : (
              <>
                <div className="card-generation-action-row">
                  <CardGenerationUsageEstimate
                    estimate={sentenceTermsUsageEstimate}
                    variant="badge"
                  />
                  <button
                    className="button primary"
                    type="button"
                    onClick={() => void createCardFromSentenceTerms()}
                  >
                    {isGeneratingCard ? <Loader2 className="spin" size={15} /> : <Save size={15} />}
                    {t("pdfAuthoring.artifactReader.sentenceTerms.createCard")}
                  </button>
                </div>
                <button className="button ghost" type="button" onClick={cancelSelectionFlow}>
                  <X size={15} />
                  {t("common.cancel")}
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {popoverPosition && selection ? (
        <SelectionPopover
          loading={isGeneratingCard}
          position={popoverPosition}
          selectedText={selection.selectedText}
          usageEstimate={selectionUsageEstimate}
          onCreate={() => void createCardFromSelection()}
          onStartSentenceTerms={startSentenceTermSelection}
          onDismiss={clearReaderSelection}
        />
      ) : null}

      {isCardPopupOpen ? (
        <div
          aria-label={t("pdfAuthoring.artifactReader.card.dialogLabel")}
          className="sentence-card-popover"
          role="dialog"
        >
          <div className="sentence-card-popover-top">
          <div className="sentence-card-popover-header">
            <div className="panel-heading">
              <CreditCard size={18} />
              <h2>{t("pdfAuthoring.artifactReader.card.title")}</h2>
            </div>
            <button
              aria-label={t("common.close")}
              className="icon-button"
              disabled={isGeneratingCard || isSavingCard}
              type="button"
              onClick={closeCardPopup}
            >
              <X size={16} />
            </button>
          </div>
          {cardStatus ? <p aria-live="polite" className="status-text" role="status">{cardStatus}</p> : null}
          <CardGenerationUsageEstimate estimate={cardUsageEstimate} variant="badge" />
          {cardRequest?.selectedTerms.length ? (
            <div
              className="sentence-card-term-row"
              aria-label={t("pdfAuthoring.artifactReader.sentenceTerms.selectedTerms")}
            >
              {cardRequest.selectedTerms.map((term) => (
                <span className="selection-term-chip" key={term}>
                  {term}
                </span>
              ))}
            </div>
          ) : null}
          </div>
          <div className="sentence-card-preview-scroll">
          {isGeneratingCard ? (
            <div className="sentence-card-loading">
              <Loader2 className="spin" size={24} />
              <strong>{t("pdfAuthoring.artifactReader.card.loading")}</strong>
              <span>{t("pdfAuthoring.artifactReader.card.loadingDescription")}</span>
              <div className="sentence-card-progress" aria-hidden="true">
                <span />
              </div>
            </div>
          ) : null}
          {cardCandidate && !isGeneratingCard ? (
            isEditingCardCandidate ? (
              <div className="sentence-card-body-editor">
                <label>
                  <span>{t("pdfAuthoring.artifactReader.card.front")}</span>
                  <textarea
                    value={cardCandidate.frontText}
                    onChange={(event) =>
                      setCardCandidate({
                        ...cardCandidate,
                        frontText: event.target.value,
                        sourceSentence: event.target.value,
                        updatedAt: new Date().toISOString()
                      })
                    }
                  />
                </label>
                <label>
                  <span>{t("pdfAuthoring.artifactReader.card.literal")}</span>
                  <textarea
                    value={cardCandidate.literalTranslationKo}
                    onChange={(event) =>
                      setCardCandidate({
                        ...cardCandidate,
                        literalTranslationKo: event.target.value,
                        updatedAt: new Date().toISOString()
                      })
                    }
                  />
                </label>
                <label>
                  <span>{t("pdfAuthoring.artifactReader.card.natural")}</span>
                  <textarea
                    value={cardCandidate.naturalTranslationKo}
                    onChange={(event) =>
                      setCardCandidate({
                        ...cardCandidate,
                        naturalTranslationKo: event.target.value,
                        updatedAt: new Date().toISOString()
                      })
                    }
                  />
                </label>
                <label>
                  <span>{t("pdfAuthoring.artifactReader.card.studyNote")}</span>
                  <textarea
                    value={cardCandidate.structureNote}
                    onChange={(event) =>
                      setCardCandidate({
                        ...cardCandidate,
                        structureNote: event.target.value,
                        updatedAt: new Date().toISOString()
                      })
                    }
                  />
                </label>
              </div>
            ) : (
              <CardPreview card={cardCandidate} settings={settings} defaultShowBack />
            )
          ) : null}
          </div>
          {!isGeneratingCard ? (
            <div className="sentence-card-popover-actions">
              {cardCandidate ? (
                <>
                  <button
                    className="button secondary"
                    disabled={isSavingCard}
                    type="button"
                    onClick={() => setIsEditingCardCandidate((editing) => !editing)}
                  >
                    <Pencil size={15} />
                    {isEditingCardCandidate
                      ? t("pdfAuthoring.artifactReader.card.preview")
                      : t("pdfAuthoring.artifactReader.card.editBody")}
                  </button>
                  <button
                    className="button primary"
                    disabled={isSavingCard}
                    type="button"
                    onClick={() => void saveCardCandidate()}
                  >
                    {isSavingCard ? <Loader2 className="spin" size={15} /> : <Save size={15} />}
                    {t("common.save")}
                  </button>
                </>
              ) : null}
              {cardRequest ? (
                <div className="card-generation-action-row sentence-card-regenerate-row">
                  <CardGenerationUsageEstimate estimate={cardUsageEstimate} variant="badge" />
                  <button
                    className="button secondary"
                    disabled={isSavingCard}
                    type="button"
                    onClick={() => void regenerateCardCandidate()}
                  >
                    <RotateCcw size={15} />
                    {t("pdfAuthoring.artifactReader.card.regenerate")}
                  </button>
                </div>
              ) : null}
              <button
                className="button ghost"
                disabled={isSavingCard}
                type="button"
                onClick={closeCardPopup}
              >
                <X size={15} />
                {t("common.close")}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      </div>
    </div>
  );
}

function getPdfTextLayerConstructor() {
  const candidate = (pdfjsLib as unknown as { TextLayer?: PdfTextLayerConstructor }).TextLayer;
  return typeof candidate === "function" ? candidate : undefined;
}

function displayArtifactFileName(value: string) {
  return value.split(/[\\/]/).filter(Boolean).at(-1) ?? value;
}
