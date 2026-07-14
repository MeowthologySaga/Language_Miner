import {
  FileText,
  Languages,
  Loader2,
  Save,
  X
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTranslation } from "react-i18next";
import { CardGenerationUsageEstimate } from "./CardGenerationUsageEstimate";
import { CardPreview } from "./CardPreview";
import {
  DocumentNotice,
  type DocumentNoticeValue
} from "./DocumentTechnicalDetails";
import {
  useCloudTranslationPreflight
} from "./CloudTranslationPreflightDialog";
import { PdfMakerJobSummary } from "./PdfMakerJobSummary";
import { PdfMakerWorkflow } from "./PdfMakerWorkflow";
import { PdfPageHighlights } from "./PdfPageHighlights";
import { PdfReaderEmptyState } from "./PdfReaderEmptyState";
import { PdfReaderRuntimeDialogs } from "./PdfReaderRuntimeDialogs";
import { PdfReaderToolbar } from "./PdfReaderToolbar";
import { PdfTranslationSegmentList } from "./PdfTranslationSegmentList";
import {
  loadPdfDocument,
  usePdfPageDataReader,
  usePdfPageRenderer,
  type ExtractedPdfPageData,
  type PdfDocument
} from "./pdfReaderDocument";
import {
  getTranslationSegmentsForExportMode,
  prepareBilingualExportPage,
  renderPdfPageImage
} from "./pdfExportPreparation";
import {
  buildPdfReaderTranslationContext,
  createPdfSegmentTranslationRequest,
  createPdfTranslationCacheLookupInput
} from "./pdfReaderTranslationRequest";
import {
  normalizeBrowserTranslatorLanguage,
  translatePdfSegmentsWithBrowserTranslator
} from "./pdfBrowserTranslator";
import {
  arrayBufferFromPdfFileData,
  createReaderArtifactFromExportRecord,
  getMergedCacheStatus,
  getPageNavigationDelta,
  isEditableTarget,
  isOllamaConnectionError,
  isPageNavigationShortcut,
  matchesShortcut,
  mergePageTranslationStates,
  mergeSegmentTranslations,
  type PageTranslationState
} from "./pdfSelectionReaderUtils";
import {
  type PdfPageViewport
} from "./pdfLayoutExtraction";
import {
  getPdfReaderWorkflowState,
  getUntranslatedPageNumbers,
  hasCompletePageTranslation as hasCompleteCachedPageTranslation,
  type DocumentTranslationJob,
  type ExportBilingualPdfOptions,
  type PageTranslationFailure,
  type RangeTranslationProgress,
  type RangeTranslationResult,
  type TranslatePageRangeOptions
} from "./pdfReaderWorkflowState";
import type { LocalEnglishMinerApi } from "../data/api";
import type { LLMProvider } from "../services/llm/types";
import { buildBilingualDocumentHtml } from "../shared/bilingualExport";
import { createStudyCardFromGenerated } from "../shared/cardFactory";
import { documentTechnicalError } from "../shared/documentPresentation";
import { isTranslationCancellationError } from "../shared/translationRequestLimits";
import {
  createTranslationUsageEvent,
  estimateTranslationUsage,
  getTranslationModelName,
  type TranslationUsageEstimate
} from "../shared/translationUsage";
import type {
  AppSettings,
  BilingualExportHistoryRecord,
  BilingualReaderArtifact,
  BilingualPdfExportPage,
  PdfSegmentTranslation,
  PdfTextSegment,
  PdfTranslationContext,
  StudyCard,
  TranslatePdfSegmentsResult
} from "../shared/types";
import { recordTranslationUsageEvent } from "../utils/translationUsageLedger";
import { parsePageRange } from "../utils/pageRange";
import { extractSentenceContext } from "../utils/sentenceExtraction";
import {
  createPdfLiveCardRequest,
  estimatePdfLiveCardUsage,
  type PdfLiveCardUsageEstimate
} from "./pdfReaderLiveCards";

type PDFSelectionReaderProps = {
  api: LocalEnglishMinerApi;
  mode?: "reader" | "maker";
  provider?: LLMProvider;
  settings: AppSettings;
  onCardsChanged?: () => Promise<void>;
  onMakerKeepAliveChange?: (shouldKeepAlive: boolean) => void;
  onOpenReaderArtifact?: (artifact: BilingualReaderArtifact) => void;
  onSettingsChange: (settings: AppSettings) => void;
};

type PendingModelDownload = {
  segments?: PdfTextSegment[];
  pageNumbers?: number[];
  continueAction?: "translate" | "translateAndExport";
  model: string;
  baseUrl: string;
};

type PendingOllamaSetup = {
  baseUrl: string;
  model: string;
  message: string;
};

type PdfExportRecord = BilingualExportHistoryRecord;

const OLLAMA_DOWNLOAD_URL = "https://ollama.com/download/windows";

export function PDFSelectionReader({
  api,
  mode = "reader",
  provider,
  settings,
  onCardsChanged,
  onMakerKeepAliveChange,
  onOpenReaderArtifact,
  onSettingsChange
}: PDFSelectionReaderProps) {
  const { i18n, t } = useTranslation();
  const appLocale = i18n.resolvedLanguage ?? i18n.language;
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(appLocale),
    [appLocale]
  );
  const languageDisplayNames = useMemo(
    () => new Intl.DisplayNames([appLocale], { type: "language" }),
    [appLocale]
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const debugPdfLoadKeyRef = useRef("");
  const [fileName, setFileName] = useState("");
  const [sourcePdfData, setSourcePdfData] = useState<Uint8Array | null>(null);
  const [sourcePdfFilePath, setSourcePdfFilePath] = useState("");
  const [pdfDocument, setPdfDocument] = useState<PdfDocument | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageText, setPageText] = useState("");
  const [pageSegments, setPageSegments] = useState<PdfTextSegment[]>([]);
  const [segmentTranslations, setSegmentTranslations] = useState<PdfSegmentTranslation[]>([]);
  const [pageTranslations, setPageTranslations] = useState<Record<number, PageTranslationState>>(
    {}
  );
  const [pageTranslationFailures, setPageTranslationFailures] = useState<
    Record<number, PageTranslationFailure>
  >({});
  const [pageRangeInput, setPageRangeInput] = useState("1");
  const [rangeProgress, setRangeProgress] = useState<RangeTranslationProgress | null>(null);
  const [cacheStatus, setCacheStatus] = useState<"idle" | "hit" | "miss">("idle");
  const [viewerStatus, setViewerStatus] = useState("");
  const [translationStatus, setTranslationStatus] = useState("");
  const [exportRecords, setExportRecords] = useState<PdfExportRecord[]>([]);
  const [documentJob, setDocumentJob] = useState<DocumentTranslationJob | null>(null);
  const [showLayoutHighlights, setShowLayoutHighlights] = useState(false);
  const [showLayoutPreview, setShowLayoutPreview] = useState(false);
  const [layoutPreviewHtml, setLayoutPreviewHtml] = useState("");
  const [layoutPreviewStatus, setLayoutPreviewStatus] = useState("");
  const [bypassTranslationCache, setBypassTranslationCache] = useState(false);
  const [makerUsageEstimate, setMakerUsageEstimate] = useState<TranslationUsageEstimate | null>(
    null
  );
  const [makerUsageStatus, setMakerUsageStatus] = useState("");
  const [errorNotice, setErrorNotice] = useState<DocumentNoticeValue | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [activeTranslationRequestId, setActiveTranslationRequestId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isBuildingLayoutPreview, setIsBuildingLayoutPreview] = useState(false);
  const [isDownloadingModel, setIsDownloadingModel] = useState(false);
  const [liveCardCandidate, setLiveCardCandidate] = useState<StudyCard | null>(null);
  const [liveCardStatus, setLiveCardStatus] = useState("");
  const [liveCardUsageEstimate, setLiveCardUsageEstimate] =
    useState<PdfLiveCardUsageEstimate | null>(null);
  const [isGeneratingLiveCard, setIsGeneratingLiveCard] = useState(false);
  const [pendingModelDownload, setPendingModelDownload] =
    useState<PendingModelDownload | null>(null);
  const [pendingOllamaSetup, setPendingOllamaSetup] = useState<PendingOllamaSetup | null>(
    null
  );
  const activeTranslationJobRef = useRef<{
    requestId: string;
    cancelRequested: boolean;
  } | null>(null);
  const error = errorNotice?.summary ?? "";
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
  const {
    confirmCloudTranslation,
    cloudTranslationPreflightDialog
  } = useCloudTranslationPreflight();
  const translationApiRef = useRef(api.translations);
  translationApiRef.current = api.translations;

  useEffect(() => () => {
    const activeJob = activeTranslationJobRef.current;
    if (!activeJob) return;
    activeJob.cancelRequested = true;
    void translationApiRef.current.cancel(activeJob.requestId).catch(() => false);
  }, []);
  const {
    clearPageDataCache,
    readPageData,
    readPageText,
    readPageSegments
  } = usePdfPageDataReader(pdfDocument);

  const isMakerMode = mode === "maker";
  const isDesktopRuntime =
    typeof window !== "undefined" && Boolean(window.localEnglishMiner);
  const providerLabel = settings.translationProviderName === "browser"
    ? t("pdfAuthoring.reader.providers.browser")
    : settings.translationProviderName === "localMt"
      ? t("pdfAuthoring.reader.providers.localMt")
      : settings.translationProviderName === "local"
        ? t("pdfAuthoring.reader.providers.ollama")
        : settings.translationProviderName === "gemini"
          ? settings.geminiPlan === "free"
            ? t("pdfAuthoring.reader.providers.geminiFree")
            : t("pdfAuthoring.reader.providers.geminiPaid")
          : t("pdfAuthoring.reader.providers.google");
  const selectedTranslationModel = getTranslationModelName(settings);
  const googleKeyMissing =
    (settings.translationProviderName === "google" && !settings.googleTranslateApiKey.trim()) ||
    (settings.translationProviderName === "gemini" && !settings.geminiApiKey.trim());
  const makerRuntimeBlocked =
    isMakerMode && settings.translationProviderName === "localMt" && !isDesktopRuntime;
  const makerRuntimeBlockedMessage = t("pdfAuthoring.reader.runtimeBlocked");
  const sourceLanguageLabel =
    languageDisplayNames.of(settings.learningProfile.targetLanguage.code) ??
    settings.learningProfile.targetLanguage.nameKo;
  const targetLanguageLabel =
    languageDisplayNames.of(settings.learningProfile.nativeLanguage.code) ??
    settings.learningProfile.nativeLanguage.nameKo;
  const formatPageNumbers = useCallback(
    (pageNumbers: number[]) => {
      const visible = pageNumbers
        .slice(0, 8)
        .map((pageNumber) => numberFormatter.format(pageNumber))
        .join(", ");
      return pageNumbers.length > 8
        ? t("pdfAuthoring.reader.ui.pageListMore", {
            pages: visible,
            count: pageNumbers.length - 8
          })
        : visible;
    },
    [numberFormatter, t]
  );
  const formatExportActionError = useCallback(
    (action: string, record: PdfExportRecord) => {
      return t("pdfAuthoring.reader.errors.exportAction", {
        action,
        title: record.title || displayFileName(record.filePath) || "PDF"
      });
    },
    [t]
  );
  const translatedPageCount = Object.values(pageTranslations).filter(
    (pageState) => pageState.translations.length > 0
  ).length;
  const translatedSegmentCount = Object.values(pageTranslations).reduce(
    (sum, pageState) => sum + pageState.translations.length,
    0
  );
  const {
    canShowMakerDone,
    displayedProgressPercent,
    documentJobProgressPercent,
    failedPageCount,
    failedPageList,
    failedPageNumbers,
    isMakerBusy,
    isMakerJobActive,
    latestExportRecord,
    makerFreeTierLimitBlocked,
    makerMonthlyLimitBlocked,
    makerStartBlocked,
    selectedRangePageCount,
    shouldKeepMakerAlive
  } = getPdfReaderWorkflowState({
    currentPage,
    documentJob,
    exportRecords,
    isDownloadingModel,
    isExporting,
    isMakerMode,
    isOpening,
    isTranslating,
    makerRuntimeBlocked,
    makerUsageEstimate,
    monthlySpendLimitKrw: settings.monthlySpendLimitKrw,
    pageCount,
    pageRangeInput,
    pageTranslationFailures,
    pdfDocumentLoaded: Boolean(pdfDocument),
    stopOnFreeTierLimit: settings.stopOnFreeTierLimit,
    stopOnMonthlyLimit: settings.stopOnMonthlyLimit,
    translatedPageCount
  });

  function togglePdfSourceHighlights() {
    onSettingsChange({
      ...settings,
      showPdfSourceHighlights: !settings.showPdfSourceHighlights
    });
  }

  const getLiveSelectionSnapshot = useCallback(() => {
    if (isMakerMode) {
      return null;
    }

    const activeSelection = window.getSelection();
    const textLayer = textLayerRef.current;
    const selectedText = activeSelection?.toString().trim() ?? "";
    if (!activeSelection || activeSelection.rangeCount === 0 || !selectedText || !textLayer) {
      return null;
    }

    const range = activeSelection.getRangeAt(0);
    if (!textLayer.contains(range.commonAncestorContainer)) {
      return null;
    }

    const preSelectionRange = range.cloneRange();
    preSelectionRange.selectNodeContents(textLayer);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);
    return {
      selectedText,
      fullText: pageText || textLayer.innerText,
      selectionOffset: preSelectionRange.toString().length
    };
  }, [isMakerMode, pageText]);
  const getLiveCardExtraction = useCallback(() => {
    const snapshot = getLiveSelectionSnapshot();
    if (!snapshot) {
      return null;
    }
    return extractSentenceContext({
      fullText: snapshot.fullText,
      selectedText: snapshot.selectedText,
      selectionOffset: snapshot.selectionOffset
    });
  }, [getLiveSelectionSnapshot]);
  const buildLiveCardUsageEstimate = useCallback(
    (extraction: ReturnType<typeof extractSentenceContext>) =>
      estimatePdfLiveCardUsage(extraction, settings),
    [settings]
  );
  const refreshLiveCardUsageEstimate = useCallback(() => {
    const extraction = getLiveCardExtraction();
    setLiveCardUsageEstimate(extraction ? buildLiveCardUsageEstimate(extraction) : null);
  }, [buildLiveCardUsageEstimate, getLiveCardExtraction]);

  const createLiveCardFromSelection = useCallback(async () => {
    if (!provider || isGeneratingLiveCard) {
      return;
    }

    const extraction = getLiveCardExtraction();
    if (!extraction) {
      setLiveCardStatus(t("pdfAuthoring.reader.status.liveSelectText"));
      setLiveCardUsageEstimate(null);
      return;
    }

    setLiveCardUsageEstimate(buildLiveCardUsageEstimate(extraction));
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
              extraction.selectedText,
              extraction.sourceSentence,
              extraction.beforeSentence ?? "",
              extraction.afterSentence ?? ""
            ]],
            scopeLabel: t("cloudTranslationPreflight.cardScope"),
            dataCategories: [
              t("cloudTranslationPreflight.cardSelectedText"),
              t("cloudTranslationPreflight.cardContext"),
              t("cloudTranslationPreflight.learningProfile")
            ]
          });
    if (!allowed) {
      setLiveCardStatus(t("manualChatGptBridge.cancelled"));
      return;
    }
    setIsGeneratingLiveCard(true);
    setLiveCardStatus(t("pdfAuthoring.reader.status.liveMakingCard"));
    try {
      const generated = await provider.generateReadingCard(
        createPdfLiveCardRequest(extraction, settings.learningProfile)
      );
      setLiveCardCandidate(createStudyCardFromGenerated(generated));
      setLiveCardStatus(
        t("pdfAuthoring.reader.status.liveExtraction", {
          confidence: extraction.extractionConfidence
        })
      );
    } catch (caught) {
      if (isTranslationCancellationError(caught)) {
        setLiveCardStatus(t("manualChatGptBridge.cancelled"));
        return;
      }
      const summary = t("pdfAuthoring.reader.errors.liveCard");
      setLiveCardStatus(summary);
      setTechnicalError(summary, caught);
    } finally {
      setIsGeneratingLiveCard(false);
    }
  }, [
    buildLiveCardUsageEstimate,
    confirmCloudTranslation,
    getLiveCardExtraction,
    isGeneratingLiveCard,
    provider,
    settings,
    setTechnicalError,
    t
  ]);

  useEffect(() => {
    setLiveCardUsageEstimate(null);
  }, [currentPage, pageText]);

  useEffect(() => {
    if (isMakerMode || !provider) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!matchesShortcut(event, settings.captureShortcut)) {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }
      if (!getLiveSelectionSnapshot()) {
        return;
      }
      event.preventDefault();
      void createLiveCardFromSelection();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    createLiveCardFromSelection,
    getLiveSelectionSnapshot,
    isMakerMode,
    provider,
    settings.captureShortcut
  ]);

  async function saveLiveCardCandidate() {
    if (!liveCardCandidate) {
      return;
    }

    const saved = await api.cards.save(liveCardCandidate);
    setLiveCardCandidate(saved);
    setLiveCardStatus(t("pdfAuthoring.artifactReader.status.cardSaved"));
    await onCardsChanged?.();
  }

  useEffect(() => {
    if (!isMakerMode) {
      return;
    }

    onMakerKeepAliveChange?.(shouldKeepMakerAlive);
  }, [isMakerMode, onMakerKeepAliveChange, shouldKeepMakerAlive]);

  useEffect(() => {
    if (!isMakerMode) {
      return;
    }

    return () => {
      onMakerKeepAliveChange?.(false);
    };
  }, [isMakerMode, onMakerKeepAliveChange]);

  useEffect(() => {
    if (!isMakerMode) {
      return;
    }

    let cancelled = false;
    api.documents
      .listExportRecords()
      .then((records) => {
        if (!cancelled) {
          setExportRecords(records.slice(0, 5));
        }
      })
      .catch(() => {
        // Export history is convenience UI; loading failures should not block the maker.
      });

    return () => {
      cancelled = true;
    };
  }, [api, isMakerMode]);

  useEffect(() => {
    if (!isMakerMode || !api.qa?.heartbeat) {
      return;
    }

    void api.qa.heartbeat({
      fileName,
      pageRange: pageRangeInput,
      pageCount,
      translatedPageCount,
      translatedSegmentCount,
      failedPageNumbers,
      error,
      isTranslating,
      isExporting,
      isDownloadingModel,
      documentJob,
      latestExportRecord: latestExportRecord
        ? {
            filePath: latestExportRecord.filePath,
            pageCount: latestExportRecord.pageCount,
            segmentCount: latestExportRecord.segmentCount,
            providerLabel: latestExportRecord.providerLabel
          }
        : undefined
    });
  }, [
    api,
    documentJob,
    error,
    failedPageList,
    fileName,
    isDownloadingModel,
    isExporting,
    isMakerMode,
    isTranslating,
    latestExportRecord,
    pageCount,
    pageRangeInput,
    translatedPageCount,
    translatedSegmentCount
  ]);

  function updateDocumentJob(jobId: string, patch: Partial<DocumentTranslationJob>) {
    setDocumentJob((previous) => {
      if (!previous || previous.id !== jobId) {
        return previous;
      }

      return {
        ...previous,
        ...patch,
        updatedAt: new Date().toLocaleString(i18n.resolvedLanguage ?? i18n.language)
      };
    });
  }

  function beginPdfTranslationJob() {
    const activeJob = {
      requestId: crypto.randomUUID(),
      cancelRequested: false
    };
    activeTranslationJobRef.current = activeJob;
    setActiveTranslationRequestId(activeJob.requestId);
    return activeJob;
  }

  function finishPdfTranslationJob(activeJob: {
    requestId: string;
    cancelRequested: boolean;
  }) {
    if (activeTranslationJobRef.current === activeJob) {
      activeTranslationJobRef.current = null;
      setActiveTranslationRequestId(null);
    }
  }

  async function stopPdfTranslation() {
    const activeJob = activeTranslationJobRef.current;
    if (!activeJob || activeJob.cancelRequested) return;
    activeJob.cancelRequested = true;
    setTranslationStatus(t("pdfAuthoring.reader.status.stopping"));
    await api.translations.cancel(activeJob.requestId).catch(() => false);
  }

  function setRangeToCurrentPage() {
    setPageRangeInput(String(currentPage));
  }

  function setRangeToAllPages() {
    if (!pageCount) {
      return;
    }

    setPageRangeInput(`1-${pageCount}`);
  }

  function setRangeToUntranslatedPages() {
    const pageNumbers = getUntranslatedPageNumbers(pageCount, pageTranslations);
    setPageRangeInput(pageNumbers.length ? pageNumbers.join(", ") : String(currentPage));
  }

  function hasCompletePageTranslation(pageNumber: number, segments: PdfTextSegment[]) {
    return hasCompleteCachedPageTranslation(
      pageTranslations[pageNumber],
      segments,
      bypassTranslationCache
    );
  }

  function clearPageTranslationFailure(pageNumber: number) {
    setPageTranslationFailures((previous) => {
      if (!previous[pageNumber]) {
        return previous;
      }

      const nextFailures = { ...previous };
      delete nextFailures[pageNumber];
      return nextFailures;
    });
  }

  function recordPageTranslationFailure(
    pageNumber: number,
    message: string,
    segmentCount: number
  ) {
    setPageTranslationFailures((previous) => ({
      ...previous,
      [pageNumber]: {
        pageNumber,
        message,
        segmentCount,
        updatedAt: new Date().toISOString()
      }
    }));
  }

  function clearPageTranslationFailures(pageNumbers: number[]) {
    if (pageNumbers.length === 0) {
      return;
    }

    setPageTranslationFailures((previous) => {
      const nextFailures = { ...previous };
      pageNumbers.forEach((pageNumber) => {
        delete nextFailures[pageNumber];
      });
      return nextFailures;
    });
  }

  function resetPdfReaderForOpen(nextFileName: string) {
    setFileName(nextFileName);
    setError("");
    setViewerStatus(t("pdfAuthoring.reader.status.openingPdf"));
    setTranslationStatus("");
    setPageText("");
    setPageSegments([]);
    setSegmentTranslations([]);
    setPageTranslations({});
    setPageTranslationFailures({});
    setPageRangeInput("1");
    setRangeProgress(null);
    setCacheStatus("idle");
    setExportRecords([]);
    setDocumentJob(null);
    setShowLayoutHighlights(false);
    setShowLayoutPreview(false);
    setLayoutPreviewHtml("");
    setLayoutPreviewStatus("");
    setMakerUsageEstimate(null);
    setMakerUsageStatus("");
    setPdfDocument(null);
    setSourcePdfData(null);
    setSourcePdfFilePath("");
    setPageCount(0);
    setCurrentPage(1);
    clearPageDataCache();
  }

  function resetPdfReaderToEmpty() {
    resetPdfReaderForOpen("");
    setViewerStatus("");
  }

  async function openPdfArrayBuffer(data: ArrayBuffer, sourcePath = "") {
    const sourceBytes = new Uint8Array(data.byteLength);
    sourceBytes.set(new Uint8Array(data));
    const document = await loadPdfDocument(data);
    setPdfDocument(document);
    setSourcePdfData(sourceBytes);
    setSourcePdfFilePath(sourcePath);
    setPageCount(document.numPages);
    setPageRangeInput(isMakerMode ? `1-${document.numPages}` : "1");
    setViewerStatus("");
  }

  async function handleFile(file: File | undefined) {
    if (!file) {
      return;
    }

    setIsOpening(true);
    resetPdfReaderForOpen(file.name);
    try {
      const data = await file.arrayBuffer();
      await openPdfArrayBuffer(data);
    } catch (caught) {
      setTechnicalError(t("pdfAuthoring.reader.errors.openPdf"), caught);
      setViewerStatus("");
    } finally {
      setIsOpening(false);
    }
  }

  useEffect(() => {
    if (!settings.debugMode || pdfDocument || isOpening) {
      return;
    }

    const debugPdfPath = settings.debugPdfPath.trim();
    if (!debugPdfPath || debugPdfLoadKeyRef.current === debugPdfPath) {
      return;
    }

    let cancelled = false;
    debugPdfLoadKeyRef.current = debugPdfPath;
    setIsOpening(true);
    resetPdfReaderForOpen(t("pdfAuthoring.reader.ui.debugPdf"));
    setViewerStatus(t("pdfAuthoring.reader.status.openingDebugPdf"));

    async function loadDebugPdf() {
      try {
        const result = await api.documents.readPdfFile(debugPdfPath);
        if (cancelled) {
          return;
        }

        if (!result) {
          setError(t("pdfAuthoring.reader.errors.debugDesktopOnly"));
          setViewerStatus("");
          return;
        }

        setFileName(result.fileName);
        await openPdfArrayBuffer(arrayBufferFromPdfFileData(result.data), result.filePath);
      } catch (caught) {
        if (!cancelled) {
          setTechnicalError(t("pdfAuthoring.reader.errors.openDebugPdf"), caught);
          setViewerStatus("");
        }
      } finally {
        if (!cancelled) {
          setIsOpening(false);
        }
      }
    }

    void loadDebugPdf();

    return () => {
      cancelled = true;
    };
  }, [api, isOpening, pdfDocument, setTechnicalError, settings.debugMode, settings.debugPdfPath, t]);

  useEffect(() => {
    if (!isMakerMode) {
      return;
    }

    if (!pdfDocument) {
      setMakerUsageEstimate(null);
      setMakerUsageStatus(t("pdfAuthoring.reader.status.usageSelectPdf"));
      return;
    }

    let cancelled = false;

    async function refreshMakerEstimate() {
      const pageNumbers = parsePageRange({
        value: pageRangeInput,
        pageCount,
        fallbackPage: currentPage
      });
      if (pageNumbers.length === 0) {
        setMakerUsageEstimate(null);
        setMakerUsageStatus(t("pdfAuthoring.reader.status.invalidRange"));
        return;
      }

      setMakerUsageStatus(t("pdfAuthoring.reader.status.calculatingUsage"));
      try {
        const pageDataList: ExtractedPdfPageData[] = [];
        for (const pageNumber of pageNumbers) {
          pageDataList.push(await readPageData(pageNumber));
        }
        const segments = pageDataList.flatMap((pageData) =>
          getTranslationSegmentsForExportMode(pageData.segments, settings.pdfExportMode)
        );
        const translationContext = buildTranslationContextForSegments(segments);
        const cacheEntries = bypassTranslationCache
          ? []
          : await Promise.all(
              segments.map((segment) =>
                api.translations.getCached({
                  ...createPdfTranslationCacheLookupInput({
                    segment,
                    settings,
                    selectedTranslationModel,
                    contextHash: translationContext.contextHash
                  })
                })
              )
            );

        if (cancelled) {
          return;
        }

        const estimate = estimateTranslationUsage({
          texts: segments.map((segment, index) => ({
            text: segment.text,
            cacheStatus: cacheEntries[index] ? "hit" : "miss"
          })),
          providerName: settings.translationProviderName,
          model: selectedTranslationModel,
          plan: settings.geminiPlan,
          sourceLang: settings.learningProfile.targetLanguage.code,
          targetLang: settings.learningProfile.nativeLanguage.code,
          dailyAppTokenLimit: settings.dailyAppTokenLimit,
          monthlySpendLimitKrw: settings.monthlySpendLimitKrw
        });
        setMakerUsageEstimate(estimate);
        setMakerUsageStatus(
          t("pdfAuthoring.reader.status.usageSegments", { count: segments.length })
        );
      } catch (caught) {
        if (!cancelled) {
          setMakerUsageEstimate(null);
          const summary = t("pdfAuthoring.reader.errors.calculateUsage");
          setMakerUsageStatus(summary);
          setTechnicalError(summary, caught);
        }
      }
    }

    void refreshMakerEstimate();

    return () => {
      cancelled = true;
    };
  }, [
    api,
    bypassTranslationCache,
    currentPage,
    isMakerMode,
    pageCount,
    pageRangeInput,
    pdfDocument,
    readPageData,
    selectedTranslationModel,
    settings.dailyAppTokenLimit,
    settings.geminiPlan,
    settings.learningProfile,
    settings.monthlySpendLimitKrw,
    settings.pdfExportMode,
    settings.translationProviderName,
    setTechnicalError,
    t
  ]);

  const readCurrentPageText = useCallback(
    () => readPageText(currentPage),
    [currentPage, readPageText]
  );

  const goToPage = useCallback(
    (nextPage: number) => {
      if (!pageCount) {
        return;
      }
      const boundedPage = Math.max(1, Math.min(pageCount, nextPage));
      setCurrentPage(boundedPage);
    },
    [pageCount]
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!pageCount || isEditableTarget(event.target) || !isPageNavigationShortcut(event)) {
        return;
      }

      event.preventDefault();
      goToPage(currentPage + getPageNavigationDelta(event));
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentPage, goToPage, pageCount]);

  async function translateCurrentPage() {
    setError("");
    setPendingModelDownload(null);
    setPendingOllamaSetup(null);

    if (googleKeyMissing) {
      setError(t("pdfAuthoring.reader.errors.apiKeyRequired"));
      return;
    }

    setIsTranslating(true);
    setTranslationStatus(t("pdfAuthoring.reader.status.translating"));

    let activeJob: ReturnType<typeof beginPdfTranslationJob> | null = null;
    try {
      const text = pageText || (await readCurrentPageText());
      const sourceSegments = pageSegments.length
        ? pageSegments
        : await readPageSegments(currentPage);
      const segments = getTranslationSegmentsForExportMode(sourceSegments, settings.pdfExportMode);
      if (!text || sourceSegments.length === 0) {
        throw new Error(t("pdfAuthoring.reader.errors.noCurrentText"));
      }
      if (segments.length === 0) {
        throw new Error(t("pdfAuthoring.reader.errors.paperSegmentPreserved"));
      }

      const allowed = await confirmCloudTranslation({
        settings,
        operation: "pdf",
        textGroups: hasCompletePageTranslation(currentPage, segments)
          ? []
          : [segments.map((segment) => segment.text)],
        scopeLabel: t("pdfAuthoring.reader.preflight.pageScope", {
          page: numberFormatter.format(currentPage),
          count: segments.length
        }),
        dataCategories: [
          t("pdfAuthoring.reader.preflight.extractedText"),
          t("pdfAuthoring.reader.preflight.context"),
          t("pdfAuthoring.reader.preflight.languageSettings")
        ]
      });
      if (!allowed) {
        setTranslationStatus(t("pdfAuthoring.reader.status.canceledBeforeStart"));
        return;
      }

      if (settings.translationProviderName === "local") {
        setTranslationStatus(t("pdfAuthoring.reader.status.checkingModel"));
        const modelStatus = await api.translations.getOllamaModelStatus({
          baseUrl: settings.ollamaBaseUrl,
          model: settings.ollamaModel
        });
        if (!modelStatus.installed) {
          setPendingModelDownload({
            segments,
            model: modelStatus.model,
            baseUrl: modelStatus.baseUrl
          });
          setTranslationStatus(t("pdfAuthoring.reader.status.modelMissing"));
          return;
        }
      }

      const translationJob = beginPdfTranslationJob();
      activeJob = translationJob;
      await translateSegments(
        segments,
        currentPage,
        buildTranslationContextForSegments(segments),
        activeJob
      );
    } catch (caught) {
      if (activeJob?.cancelRequested || isTranslationCancellationError(caught)) {
        setTranslationStatus(t("pdfAuthoring.reader.status.canceled"));
      } else {
        handleTranslationFailure(caught);
        setTranslationStatus("");
      }
    } finally {
      if (activeJob) finishPdfTranslationJob(activeJob);
      setIsTranslating(false);
    }
  }

  async function downloadMissingModelAndTranslate() {
    if (!pendingModelDownload) {
      return;
    }

    setError("");
    setIsDownloadingModel(true);
    setIsTranslating(true);
    setTranslationStatus(
      t("pdfAuthoring.reader.status.downloadingModel", { model: pendingModelDownload.model })
    );

    let activeJob: ReturnType<typeof beginPdfTranslationJob> | null = null;
    try {
      await api.translations.pullOllamaModel({
        baseUrl: pendingModelDownload.baseUrl,
        model: pendingModelDownload.model
      });
      const segments = pendingModelDownload.segments;
      const pageNumbers = pendingModelDownload.pageNumbers;
      const continueAction = pendingModelDownload.continueAction;
      setPendingModelDownload(null);
      setTranslationStatus(t("pdfAuthoring.reader.status.downloadComplete"));
      if (pageNumbers?.length) {
        const result = await translatePageRange(pageNumbers, { skipModelCheck: true });
        if (continueAction === "translateAndExport" && result && !result.blocked) {
          const exportTranslationsByPage = mergePageTranslationStates(
            bypassTranslationCache ? {} : pageTranslations,
            result.translationsByPage
          );
          const incompletePageNumbers = await getIncompleteExportPageNumbers(
            pageNumbers,
            exportTranslationsByPage
          );
          if (incompletePageNumbers.length > 0) {
            const message = t("pdfAuthoring.reader.errors.incompletePages", {
              pages: formatPageNumbers(incompletePageNumbers)
            });
            setError(message);
            updateDocumentJob(result.jobId, {
              status: "partial",
              pageRange: pageNumbers.join(", "),
              totalPages: pageNumbers.length,
              processedPages: Math.max(0, pageNumbers.length - incompletePageNumbers.length),
              failedPages: incompletePageNumbers.length,
              message
            });
            return;
          }
          await exportBilingualPdf({
            pageNumbers,
            translationsByPage: exportTranslationsByPage,
            jobId: result.jobId
          });
        }
      } else if (segments?.length) {
        activeJob = beginPdfTranslationJob();
        await translateSegments(
          segments,
          currentPage,
          buildTranslationContextForSegments(segments),
          activeJob
        );
      }
    } catch (caught) {
      if (activeJob?.cancelRequested || isTranslationCancellationError(caught)) {
        setTranslationStatus(t("pdfAuthoring.reader.status.canceled"));
      } else {
        handleTranslationFailure(caught, t("pdfAuthoring.reader.errors.modelDownload"));
        setTranslationStatus("");
      }
    } finally {
      if (activeJob) finishPdfTranslationJob(activeJob);
      setIsDownloadingModel(false);
      setIsTranslating(false);
    }
  }

  function dismissModelDownloadPrompt() {
    if (isDownloadingModel) {
      return;
    }
    setPendingModelDownload(null);
    setTranslationStatus("");
  }

  function dismissOllamaSetupPrompt() {
    setPendingOllamaSetup(null);
    setTranslationStatus("");
  }

  function handleTranslationFailure(
    caught: unknown,
    fallback: string = t("pdfAuthoring.reader.errors.translate")
  ) {
    const technicalMessage = caught instanceof Error ? caught.message : "";
    if (
      settings.translationProviderName === "local" &&
      isOllamaConnectionError(technicalMessage)
    ) {
      setPendingModelDownload(null);
      setPendingOllamaSetup({
        baseUrl: settings.ollamaBaseUrl,
        model: settings.ollamaModel,
        message: technicalMessage
      });
      setError("");
      setTranslationStatus(t("pdfAuthoring.reader.status.ollamaRequired"));
      return;
    }

    setTechnicalError(fallback, caught);
  }

  function buildTranslationContextForSegments(segments: PdfTextSegment[]) {
    return buildPdfReaderTranslationContext(segments, settings);
  }

  async function requestBrowserTranslateSegments(
    segments: PdfTextSegment[],
    translationContext: PdfTranslationContext
  ): Promise<TranslatePdfSegmentsResult> {
    const now = new Date().toISOString();
    const sourceLang = normalizeBrowserTranslatorLanguage(
      settings.learningProfile.targetLanguage.code,
      "en"
    );
    const targetLang = normalizeBrowserTranslatorLanguage(
      settings.learningProfile.nativeLanguage.code,
      "ko"
    );
    const cachedEntries = bypassTranslationCache
      ? []
      : await Promise.all(
          segments.map((segment) =>
            api.translations.getCached({
              ...createPdfTranslationCacheLookupInput({
                segment,
                settings,
                selectedTranslationModel,
                contextHash: translationContext.contextHash,
                providerName: "browser",
                sourceLang,
                targetLang
              })
            })
          )
        );
    const cachedTranslations = cachedEntries.flatMap((entry, index) =>
      entry
        ? [
            {
              id: segments[index].id,
              translationKo: entry.translatedText,
              cacheStatus: "hit" as const
            }
          ]
        : []
    );
    const cachedIds = new Set(cachedTranslations.map((translation) => translation.id));
    const missingSegments = segments.filter((segment) => !cachedIds.has(segment.id));
    const translatedMisses = missingSegments.length
      ? await translatePdfSegmentsWithBrowserTranslator({
          segments: missingSegments,
          sourceLanguage: sourceLang,
          targetLanguage: targetLang,
          onStatus: setTranslationStatus,
          copy: {
            unavailable: t("pdfAuthoring.reader.errors.browserTranslatorUnavailable"),
            unsupported: (source, target) =>
              t("pdfAuthoring.reader.errors.browserTranslatorUnsupported", { source, target }),
            ready: t("pdfAuthoring.reader.status.browserTranslatorReady"),
            downloadMayStart: t("pdfAuthoring.reader.status.browserDownloadMayStart"),
            downloading: (percent) =>
              t("pdfAuthoring.reader.status.browserDownloading", {
                percent: numberFormatter.format(percent)
              }),
            translating: (current, total) =>
              t("pdfAuthoring.reader.status.browserTranslating", {
                current: numberFormatter.format(current),
                total: numberFormatter.format(total)
              })
          }
        })
      : [];
    if (translatedMisses.length > 0) {
      const translatedMissesById = new Map(
        translatedMisses.map((translation) => [translation.id, translation])
      );
      await Promise.all(
        missingSegments.flatMap((segment) => {
          const translation = translatedMissesById.get(segment.id);
          if (!translation?.translationKo.trim()) {
            return [];
          }

          return api.translations.saveCached({
            ...createPdfTranslationCacheLookupInput({
              segment,
              settings,
              selectedTranslationModel,
              contextHash: translationContext.contextHash,
              providerName: "browser",
              sourceLang,
              targetLang
            }),
            translatedText: translation.translationKo
          });
        })
      );
    }
    const translations = mergeSegmentTranslations(segments, cachedTranslations, translatedMisses);
    const translatedIds = new Set(translations.map((translation) => translation.id));
    const usageEstimate = missingSegments.length
      ? estimateTranslationUsage({
          texts: segments.map((segment) => ({
            text: segment.text,
            cacheStatus: cachedIds.has(segment.id) ? "hit" : "miss"
          })),
          providerName: "browser",
          model: "browser-translator",
          sourceLang,
          targetLang,
          dailyAppTokenLimit: settings.dailyAppTokenLimit,
          monthlySpendLimitKrw: settings.monthlySpendLimitKrw
        })
      : null;

    return {
      translations,
      providerName: "browser",
      sourceLang,
      targetLang,
      cacheStatus:
        !bypassTranslationCache && translatedMisses.length === 0
          ? "hit"
          : cachedTranslations.length > 0
            ? "partial"
            : "miss",
      missingSegmentIds: segments
        .map((segment) => segment.id)
        .filter((segmentId) => !translatedIds.has(segmentId)),
      usage: usageEstimate
        ? createTranslationUsageEvent({
            profileId: settings.profileId,
            providerName: "browser",
            model: usageEstimate.model,
            sourceLang,
            targetLang,
            usage: {
              inputTokens: usageEstimate.inputTokens.max,
              outputTokens: usageEstimate.outputTokens.max,
              totalTokens: usageEstimate.totalTokens.max,
              billableCharacters: usageEstimate.billableCharacters,
              requestCount: usageEstimate.requestCount,
              cacheHitCount: usageEstimate.cacheHitCount,
              cacheMissCount: usageEstimate.cacheMissCount
            }
          })
        : undefined,
      createdAt: now,
      updatedAt: new Date().toISOString()
    };
  }

  async function requestTranslateSegments(
    segments: PdfTextSegment[],
    translationContext: PdfTranslationContext,
    requestId: string
  ) {
    if (settings.translationProviderName === "localMt" && !isDesktopRuntime) {
      throw new Error(makerRuntimeBlockedMessage);
    }

    if (settings.translationProviderName === "browser") {
      const result = await requestBrowserTranslateSegments(segments, translationContext);
      recordTranslationUsageEvent(result.usage);
      return result;
    }

    if (settings.translationProviderName === "localMt") {
      setTranslationStatus(
        t("pdfAuthoring.reader.status.localMtTranslating", {
          model: selectedTranslationModel
        })
      );
    }

    const result = await api.translations.translatePdfSegments(
      {
        ...createPdfSegmentTranslationRequest({
          segments,
          translationContext,
          settings,
          selectedTranslationModel,
          bypassTranslationCache
        }),
        requestId
      }
    );
    return result;
  }

  async function translateSegments(
    segments: PdfTextSegment[],
    pageNumber: number,
    translationContext: PdfTranslationContext,
    activeJob: { requestId: string; cancelRequested: boolean }
  ) {
    let result = await requestTranslateSegments(
      segments,
      translationContext,
      activeJob.requestId
    );
    if (activeJob.cancelRequested) {
      throw new DOMException(t("pdfAuthoring.reader.status.canceled"), "AbortError");
    }
    if (result.missingSegmentIds.length > 0) {
      const missingIds = new Set(result.missingSegmentIds);
      const missingSegments = segments.filter((segment) => missingIds.has(segment.id));
      if (missingSegments.length > 0) {
        setTranslationStatus(
          t("pdfAuthoring.reader.status.retryingMissing", {
            page: numberFormatter.format(pageNumber),
            count: missingSegments.length
          })
        );
        const retryResult = await requestTranslateSegments(
          missingSegments,
          translationContext,
          activeJob.requestId
        );
        if (activeJob.cancelRequested) {
          throw new DOMException(t("pdfAuthoring.reader.status.canceled"), "AbortError");
        }
        const translations = mergeSegmentTranslations(
          segments,
          result.translations,
          retryResult.translations
        );
        const translatedIds = new Set(translations.map((translation) => translation.id));
        result = {
          ...result,
          translations,
          cacheStatus: getMergedCacheStatus(translations, segments.length),
          missingSegmentIds: segments
            .map((segment) => segment.id)
            .filter((segmentId) => !translatedIds.has(segmentId)),
          updatedAt: retryResult.updatedAt
        };
      }
    }
    const pageState: PageTranslationState = {
      segments,
      translations: result.translations,
      cacheStatus: result.cacheStatus
    };
    setPageTranslations((previous) => ({
      ...previous,
      [pageNumber]: pageState
    }));
    clearPageTranslationFailure(pageNumber);
    if (pageNumber === currentPage) {
      setPageSegments(segments);
      setSegmentTranslations(result.translations);
      setCacheStatus(result.cacheStatus === "partial" ? "miss" : result.cacheStatus);
    }
    return {
      ...result,
      pageState
    };
  }

  async function translatePageRange(
    pageNumbers: number[],
    options: TranslatePageRangeOptions = {}
  ): Promise<RangeTranslationResult | undefined> {
    if (!pdfDocument) {
      return undefined;
    }

    setError("");
    setPendingModelDownload(null);
    setPendingOllamaSetup(null);
    const jobId = `translate-${Date.now()}`;
    const jobPageRange = pageNumbers.join(", ");
    setDocumentJob({
      id: jobId,
      status: "checking",
      pageRange: jobPageRange,
      totalPages: pageNumbers.length,
      processedPages: 0,
      translatedSegments: 0,
      totalSegments: 0,
      failedPages: 0,
      message: t("pdfAuthoring.reader.status.preparingJob"),
      updatedAt: new Date().toLocaleString(i18n.resolvedLanguage ?? i18n.language)
    });

    if (googleKeyMissing) {
      setError(t("pdfAuthoring.reader.errors.apiKeyRequired"));
      updateDocumentJob(jobId, {
        status: "failed",
        message: t("pdfAuthoring.reader.errors.apiKeyRequired")
      });
      return undefined;
    }

    let completedPageCount = 0;
    let failedCount = 0;
    const failedPageNumbersInRun: number[] = [];
    let jobTranslatedSegments = 0;
    let jobTotalSegments = 0;
    let stoppedForConnectionError = false;
    let canceledByUser = false;
    let activeJob: ReturnType<typeof beginPdfTranslationJob> | null = null;
    const translationsByPage: Record<number, PageTranslationState> = {};

    try {
      const rangePageData = new Map<number, ExtractedPdfPageData>();
      const pageDataFailures = new Map<number, string>();
      for (const pageNumber of pageNumbers) {
        try {
          rangePageData.set(pageNumber, await readPageData(pageNumber));
        } catch (caught) {
          const message = t("pdfAuthoring.reader.errors.pageExtract", {
            page: numberFormatter.format(pageNumber)
          });
          pageDataFailures.set(pageNumber, message);
          setTechnicalError(message, caught);
        }
      }
      const translationGroups = [...rangePageData.entries()]
        .map(([pageNumber, pageData]) => {
          const segments = getTranslationSegmentsForExportMode(
            pageData.segments,
            settings.pdfExportMode
          );
          return hasCompletePageTranslation(pageNumber, segments)
            ? []
            : segments.map((segment) => segment.text);
        })
        .filter((group) => group.length > 0);
      const allowed = await confirmCloudTranslation({
        settings,
        operation: "pdf",
        textGroups: translationGroups,
        scopeLabel: t("pdfAuthoring.reader.preflight.rangeScope", {
          range: jobPageRange,
          count: translationGroups.reduce((sum, group) => sum + group.length, 0)
        }),
        dataCategories: [
          t("pdfAuthoring.reader.preflight.extractedText"),
          t("pdfAuthoring.reader.preflight.context"),
          t("pdfAuthoring.reader.preflight.languageSettings")
        ]
      });
      if (!allowed) {
        canceledByUser = true;
        setTranslationStatus(t("pdfAuthoring.reader.status.canceledBeforeStart"));
        updateDocumentJob(jobId, {
          status: "canceled",
          message: t("pdfAuthoring.reader.status.canceledBeforeStart")
        });
        return undefined;
      }

      if (settings.translationProviderName === "local" && !options.skipModelCheck) {
        setTranslationStatus(t("pdfAuthoring.reader.status.checkingModel"));
        updateDocumentJob(jobId, {
          status: "checking",
          message: t("pdfAuthoring.reader.status.checkingModelInstalled", {
            model: settings.ollamaModel
          })
        });
        const modelStatus = await api.translations.getOllamaModelStatus({
          baseUrl: settings.ollamaBaseUrl,
          model: settings.ollamaModel
        });
        if (!modelStatus.installed) {
          setPendingModelDownload({
            pageNumbers,
            continueAction: options.afterModelDownload,
            model: modelStatus.model,
            baseUrl: modelStatus.baseUrl
          });
          setTranslationStatus(t("pdfAuthoring.reader.status.modelMissing"));
          updateDocumentJob(jobId, {
            status: "blocked",
            message: t("pdfAuthoring.reader.status.modelDownloadRequired", {
              model: modelStatus.model
            })
          });
          return undefined;
        }
      }

      activeJob = beginPdfTranslationJob();
      const translationJob = activeJob;
      setIsTranslating(true);
      updateDocumentJob(jobId, {
        status: "translating",
        message: t("pdfAuthoring.reader.status.translatingRange")
      });
      setRangeProgress({
        current: 0,
        total: pageNumbers.length,
        pageNumber: pageNumbers[0] ?? currentPage,
        translatedSegments: 0,
        totalSegments: 0
      });
      clearPageTranslationFailures(pageNumbers);
      for (const [failedPageNumber, message] of pageDataFailures) {
        recordPageTranslationFailure(failedPageNumber, message, 0);
        failedCount += 1;
        failedPageNumbersInRun.push(failedPageNumber);
      }
      const rangeTranslationContext = buildTranslationContextForSegments(
        [...rangePageData.values()].flatMap((pageData) =>
          getTranslationSegmentsForExportMode(pageData.segments, settings.pdfExportMode)
        )
      );

      for (const [pageIndex, pageNumber] of pageNumbers.entries()) {
        if (translationJob.cancelRequested) {
          canceledByUser = true;
          break;
        }
        setTranslationStatus(
          t("pdfAuthoring.reader.status.checkingPageSegments", {
            page: numberFormatter.format(pageNumber)
          })
        );
        const pageDataFailure = pageDataFailures.get(pageNumber);
        if (pageDataFailure) {
          setRangeProgress({
            current: pageIndex + 1,
            total: pageNumbers.length,
            pageNumber,
            translatedSegments: 0,
            totalSegments: 0
          });
          updateDocumentJob(jobId, {
            processedPages: pageIndex + 1,
            totalSegments: jobTotalSegments,
            translatedSegments: jobTranslatedSegments,
            failedPages: failedCount,
            message: pageDataFailure
          });
          continue;
        }
        try {
          const { segments: sourceSegments } =
            rangePageData.get(pageNumber) ?? (await readPageData(pageNumber));
          const segments = getTranslationSegmentsForExportMode(
            sourceSegments,
            settings.pdfExportMode
          );
          jobTotalSegments += segments.length;
          setRangeProgress({
            current: pageIndex,
            total: pageNumbers.length,
            pageNumber,
            translatedSegments: 0,
            totalSegments: segments.length
          });

          if (segments.length === 0) {
            completedPageCount += 1;
            updateDocumentJob(jobId, {
              processedPages: pageIndex + 1,
              totalSegments: jobTotalSegments,
              translatedSegments: jobTranslatedSegments,
              failedPages: failedCount,
              message: t("pdfAuthoring.reader.status.pageNoSegments", {
                page: numberFormatter.format(pageNumber)
              })
            });
            continue;
          }

          if (hasCompletePageTranslation(pageNumber, segments)) {
            const existingPageState = pageTranslations[pageNumber];
            const existingTranslations = existingPageState?.translations.length ?? 0;
            if (existingPageState) {
              translationsByPage[pageNumber] = existingPageState;
            }
            jobTranslatedSegments += existingTranslations;
            completedPageCount += 1;
            setRangeProgress({
              current: pageIndex + 1,
              total: pageNumbers.length,
              pageNumber,
              translatedSegments: existingTranslations,
              totalSegments: segments.length
            });
            updateDocumentJob(jobId, {
              processedPages: pageIndex + 1,
              totalSegments: jobTotalSegments,
              translatedSegments: jobTranslatedSegments,
              failedPages: failedCount,
              message: t("pdfAuthoring.reader.status.pageCached", {
                page: numberFormatter.format(pageNumber)
              })
            });
            continue;
          }

          const result = await translateSegments(
            segments,
            pageNumber,
            rangeTranslationContext,
            translationJob
          );
          translationsByPage[pageNumber] = result.pageState;
          jobTranslatedSegments += result.translations.length;
          if (result.missingSegmentIds.length > 0) {
            recordPageTranslationFailure(
              pageNumber,
              t("pdfAuthoring.reader.status.missingSegments", {
                count: result.missingSegmentIds.length
              }),
              segments.length
            );
            failedCount += 1;
            failedPageNumbersInRun.push(pageNumber);
          } else {
            completedPageCount += 1;
          }
          setRangeProgress({
            current: pageIndex + 1,
            total: pageNumbers.length,
            pageNumber,
            translatedSegments: result.translations.length,
            totalSegments: segments.length
          });
          updateDocumentJob(jobId, {
            processedPages: pageIndex + 1,
            totalSegments: jobTotalSegments,
            translatedSegments: jobTranslatedSegments,
            failedPages: failedCount,
            message:
              result.missingSegmentIds.length > 0
                ? t("pdfAuthoring.reader.status.pagePartial", {
                    page: numberFormatter.format(pageNumber)
                  })
                : t("pdfAuthoring.reader.status.pageComplete", {
                    page: numberFormatter.format(pageNumber)
                  })
          });
        } catch (caught) {
          if (translationJob.cancelRequested || isTranslationCancellationError(caught)) {
            translationJob.cancelRequested = true;
            canceledByUser = true;
            break;
          }
          const message = t("pdfAuthoring.reader.errors.pageTranslation");
          setTechnicalError(message, caught);
          recordPageTranslationFailure(pageNumber, message, 0);
          failedCount += 1;
          failedPageNumbersInRun.push(pageNumber);
          setRangeProgress({
            current: pageIndex + 1,
            total: pageNumbers.length,
            pageNumber,
            translatedSegments: 0,
            totalSegments: 0
          });
          updateDocumentJob(jobId, {
            processedPages: pageIndex + 1,
            totalSegments: jobTotalSegments,
            translatedSegments: jobTranslatedSegments,
            failedPages: failedCount,
            message
          });

          const technicalMessage = caught instanceof Error ? caught.message : String(caught ?? "");
          if (
            settings.translationProviderName === "local" &&
            isOllamaConnectionError(technicalMessage)
          ) {
            handleTranslationFailure(caught, t("pdfAuthoring.reader.errors.pageTranslation"));
            updateDocumentJob(jobId, {
              status: "blocked",
              message: t("pdfAuthoring.reader.status.ollamaConnectionRequired")
            });
            stoppedForConnectionError = true;
            break;
          }
        }
      }

      const rangeResult: RangeTranslationResult = {
        jobId,
        pageNumbers,
        failedPageNumbers: [...new Set(failedPageNumbersInRun)],
        translationsByPage,
        completedPages: completedPageCount,
        failedPages: failedCount,
        translatedSegments: jobTranslatedSegments,
        totalSegments: jobTotalSegments,
        blocked: stoppedForConnectionError || canceledByUser
      };

      if (canceledByUser) {
        setTranslationStatus(t("pdfAuthoring.reader.status.canceled"));
        updateDocumentJob(jobId, {
          status: "canceled",
          processedPages: completedPageCount + failedCount,
          totalSegments: jobTotalSegments,
          translatedSegments: jobTranslatedSegments,
          failedPages: failedCount,
          message: t("pdfAuthoring.reader.status.canceled")
        });
      } else if (!stoppedForConnectionError) {
        setTranslationStatus(
          failedCount > 0
            ? t("pdfAuthoring.reader.status.rangePartial", {
                completed: numberFormatter.format(completedPageCount),
                failed: numberFormatter.format(failedCount)
              })
            : t("pdfAuthoring.reader.status.rangeComplete", {
                completed: numberFormatter.format(completedPageCount)
              })
        );
        updateDocumentJob(jobId, {
          status: failedCount > 0 ? "partial" : "completed",
          processedPages: pageNumbers.length,
          totalSegments: jobTotalSegments,
          translatedSegments: jobTranslatedSegments,
          failedPages: failedCount,
          message:
            failedCount > 0
              ? t("pdfAuthoring.reader.status.rangePartial", {
                  completed: numberFormatter.format(completedPageCount),
                  failed: numberFormatter.format(failedCount)
                })
              : t("pdfAuthoring.reader.status.pagesComplete", {
                  completed: numberFormatter.format(completedPageCount)
                })
        });
      }

      return rangeResult;
    } catch (caught) {
      if (activeJob?.cancelRequested || isTranslationCancellationError(caught)) {
        canceledByUser = true;
        setTranslationStatus(t("pdfAuthoring.reader.status.canceled"));
        updateDocumentJob(jobId, {
          status: "canceled",
          message: t("pdfAuthoring.reader.status.canceled")
        });
      } else {
        handleTranslationFailure(caught, t("pdfAuthoring.reader.errors.rangeTranslation"));
        setTranslationStatus("");
        updateDocumentJob(jobId, {
          status: "failed",
          message: t("pdfAuthoring.reader.errors.rangeTranslation")
        });
      }
      return undefined;
    } finally {
      if (activeJob) finishPdfTranslationJob(activeJob);
      setIsTranslating(false);
    }
  }

  async function translateSelectedRange() {
    if (makerRuntimeBlocked) {
      setError(makerRuntimeBlockedMessage);
      return;
    }

    const pageNumbers = parsePageRange({
      value: pageRangeInput,
      pageCount,
      fallbackPage: currentPage
    });
    await translatePageRange(pageNumbers);
  }

  async function retryFailedPages() {
    if (makerRuntimeBlocked) {
      setError(makerRuntimeBlockedMessage);
      return;
    }

    if (failedPageNumbers.length === 0) {
      return;
    }

    await translatePageRange(failedPageNumbers);
  }

  async function retryFailedPagesAndExportSelectedRange() {
    if (makerRuntimeBlocked) {
      setError(makerRuntimeBlockedMessage);
      return;
    }

    if (failedPageNumbers.length === 0) {
      return;
    }

    const pageNumbers = parsePageRange({
      value: pageRangeInput,
      pageCount,
      fallbackPage: currentPage
    });
    const retryResult = await translatePageRange(failedPageNumbers, {
      skipModelCheck: true,
      afterModelDownload: "translateAndExport"
    });
    if (!retryResult || retryResult.blocked) {
      return;
    }

    const exportTranslationsByPage = mergePageTranslationStates(
      bypassTranslationCache ? {} : pageTranslations,
      retryResult.translationsByPage
    );
    const incompletePageNumbers = await getIncompleteExportPageNumbers(
      pageNumbers,
      exportTranslationsByPage
    );

    if (incompletePageNumbers.length > 0) {
      const message = t("pdfAuthoring.reader.errors.incompletePages", {
        pages: formatPageNumbers(incompletePageNumbers)
      });
      setError(message);
      updateDocumentJob(retryResult.jobId, {
        status: "partial",
        pageRange: pageNumbers.join(", "),
        totalPages: pageNumbers.length,
        processedPages: Math.max(0, pageNumbers.length - incompletePageNumbers.length),
        failedPages: incompletePageNumbers.length,
        message
      });
      return;
    }

    await exportBilingualPdf({
      pageNumbers,
      translationsByPage: exportTranslationsByPage,
      jobId: retryResult.jobId
    });
  }

  async function getIncompleteExportPageNumbers(
    pageNumbers: number[],
    translationsByPage: Record<number, PageTranslationState>
  ) {
    const incompletePageNumbers: number[] = [];

    for (const pageNumber of pageNumbers) {
      let sourceSegments: PdfTextSegment[];
      try {
        sourceSegments = (await readPageData(pageNumber)).segments;
      } catch (caught) {
        const summary = t("pdfAuthoring.reader.errors.pageExtract", {
          page: numberFormatter.format(pageNumber)
        });
        recordPageTranslationFailure(
          pageNumber,
          summary,
          0
        );
        setTechnicalError(summary, caught);
        incompletePageNumbers.push(pageNumber);
        continue;
      }
      const exportSegments = getTranslationSegmentsForExportMode(
        sourceSegments,
        settings.pdfExportMode
      );
      if (exportSegments.length === 0) {
        continue;
      }

      const pageState =
        translationsByPage[pageNumber] ?? (bypassTranslationCache ? undefined : pageTranslations[pageNumber]);
      const translatedIds = new Set(
        pageState?.translations
          .filter((translation) => translation.translationKo.trim())
          .map((translation) => translation.id) ?? []
      );
      const missingCount = exportSegments.filter((segment) => !translatedIds.has(segment.id)).length;
      if (missingCount > 0) {
        incompletePageNumbers.push(pageNumber);
      }
    }

    return incompletePageNumbers;
  }

  async function previewCurrentPageLayout() {
    if (!pdfDocument) {
      setError(t("pdfAuthoring.reader.errors.noPdf"));
      return;
    }

    setIsBuildingLayoutPreview(true);
    setShowLayoutPreview(true);
    setLayoutPreviewStatus(t("pdfAuthoring.reader.status.previewBuilding"));
    setLayoutPreviewHtml("");
    setError("");

    try {
      const previewTranslationsByPage: Record<number, PageTranslationState> = {
        ...pageTranslations,
        [currentPage]: {
          segments: pageSegments,
          translations: segmentTranslations,
          cacheStatus:
            segmentTranslations.length === pageSegments.length
              ? cacheStatus === "hit"
                ? "hit"
                : "miss"
              : "partial"
        }
      };
      const prepared = await prepareBilingualExportPage({
        pageNumber: currentPage,
        translationsByPage: previewTranslationsByPage,
        readPageData,
        renderPageImage: (pageNumber) => renderPdfPageImage(pdfDocument, pageNumber),
        exportMode: settings.pdfExportMode
      });
      if (prepared.translatedSegmentCount === 0) {
        setLayoutPreviewStatus(t("pdfAuthoring.reader.status.previewNoTranslation"));
        return;
      }

      const html = buildBilingualDocumentHtml({
        title: fileName ? fileName.replace(/\.pdf$/i, "") : "bilingual-preview",
        sourceLanguageLabel,
        targetLanguageLabel,
        exportMode: settings.pdfExportMode,
        showSourceHighlights: settings.showPdfSourceHighlights,
        pages: [prepared.page]
      });
      setLayoutPreviewHtml(html);
      setLayoutPreviewStatus(
        t("pdfAuthoring.reader.status.previewSegments", {
          translated: numberFormatter.format(prepared.translatedSegmentCount),
          source: numberFormatter.format(prepared.sourceSegmentCount)
        })
      );
    } catch (caught) {
      setLayoutPreviewStatus("");
      setTechnicalError(t("pdfAuthoring.reader.errors.preview"), caught);
    } finally {
      setIsBuildingLayoutPreview(false);
    }
  }

  async function translateAndExportSelectedRange() {
    if (makerRuntimeBlocked) {
      setError(makerRuntimeBlockedMessage);
      return;
    }

    if (makerStartBlocked) {
      setError(t("pdfAuthoring.reader.errors.usageLimit"));
      return;
    }

    const pageNumbers = parsePageRange({
      value: pageRangeInput,
      pageCount,
      fallbackPage: currentPage
    });
    const result = await translatePageRange(pageNumbers, {
      afterModelDownload: "translateAndExport"
    });
    if (!result || result.blocked) {
      return;
    }

    let jobId = result.jobId;
    let exportTranslationsByPage = mergePageTranslationStates(
      bypassTranslationCache ? {} : pageTranslations,
      result.translationsByPage
    );
    let incompletePageNumbers = await getIncompleteExportPageNumbers(
      pageNumbers,
      exportTranslationsByPage
    );

    if (incompletePageNumbers.length > 0) {
      updateDocumentJob(jobId, {
        status: "translating",
        totalPages: pageNumbers.length,
        pageRange: pageNumbers.join(", "),
        message: t("pdfAuthoring.reader.status.autoRetryPages", {
          pages: formatPageNumbers(incompletePageNumbers)
        })
      });
      const retryResult = await translatePageRange(incompletePageNumbers, {
        skipModelCheck: true,
        afterModelDownload: "translateAndExport"
      });
      if (!retryResult || retryResult.blocked) {
        return;
      }
      jobId = retryResult.jobId;
      exportTranslationsByPage = mergePageTranslationStates(
        exportTranslationsByPage,
        retryResult.translationsByPage
      );
      incompletePageNumbers = await getIncompleteExportPageNumbers(
        pageNumbers,
        exportTranslationsByPage
      );
    }

    if (incompletePageNumbers.length > 0) {
      const message = t("pdfAuthoring.reader.errors.incompletePages", {
        pages: formatPageNumbers(incompletePageNumbers)
      });
      setError(message);
      updateDocumentJob(jobId, {
        status: "partial",
        pageRange: pageNumbers.join(", "),
        totalPages: pageNumbers.length,
        processedPages: Math.max(0, pageNumbers.length - incompletePageNumbers.length),
        failedPages: incompletePageNumbers.length,
        message
      });
      return;
    }

    await exportBilingualPdf({
      pageNumbers,
      translationsByPage: exportTranslationsByPage,
      jobId
    });
  }

  async function exportBilingualPdf(options: ExportBilingualPdfOptions = {}) {
    if (!pdfDocument) {
      setError(t("pdfAuthoring.reader.errors.noPdf"));
      return;
    }

    const pageNumbers = options.pageNumbers ?? parsePageRange({
      value: pageRangeInput,
      pageCount,
      fallbackPage: currentPage
    });
    const exportPageRange = options.pageNumbers ? options.pageNumbers.join(", ") : pageRangeInput;
    const exportTranslationsByPage = options.translationsByPage ?? pageTranslations;
    const jobId = options.jobId ?? `export-${Date.now()}`;

    setError("");
    setIsExporting(true);
    setTranslationStatus(t("pdfAuthoring.reader.status.preparingExportPages"));
    if (options.jobId) {
      updateDocumentJob(jobId, {
        status: "exporting",
        pageRange: exportPageRange,
        totalPages: pageNumbers.length,
        processedPages: 0,
        message: t("pdfAuthoring.reader.status.translationDonePreparing")
      });
    } else {
      setDocumentJob({
        id: jobId,
        status: "exporting",
        pageRange: exportPageRange,
        totalPages: pageNumbers.length,
        processedPages: 0,
        translatedSegments: 0,
        totalSegments: 0,
        failedPages: 0,
        message: t("pdfAuthoring.reader.status.preparingExportPages"),
        updatedAt: new Date().toLocaleString(appLocale)
      });
    }

    try {
      const incompletePageNumbers = await getIncompleteExportPageNumbers(
        pageNumbers,
        exportTranslationsByPage
      );
      if (incompletePageNumbers.length > 0) {
        const message = t("pdfAuthoring.reader.errors.incompletePages", {
          pages: formatPageNumbers(incompletePageNumbers)
        });
        setError(message);
        setTranslationStatus("");
        updateDocumentJob(jobId, {
          status: "partial",
          processedPages: 0,
          failedPages: incompletePageNumbers.length,
          message
        });
        return;
      }

      const pages: BilingualPdfExportPage[] = [];
      let exportSegmentCount = 0;
      let exportSourceSegmentCount = 0;

      for (const pageNumber of pageNumbers) {
        setTranslationStatus(
          t("pdfAuthoring.reader.status.renderingSourcePage", {
            page: numberFormatter.format(pageNumber)
          })
        );
        const prepared = await prepareBilingualExportPage({
          pageNumber,
          translationsByPage: exportTranslationsByPage,
          readPageData,
          renderPageImage: (targetPageNumber) => renderPdfPageImage(pdfDocument, targetPageNumber),
          exportMode: settings.pdfExportMode
        });
        exportSourceSegmentCount += prepared.sourceSegmentCount;
        exportSegmentCount += prepared.translatedSegmentCount;
        pages.push(prepared.page);
        updateDocumentJob(jobId, {
          processedPages: pages.length,
          totalPages: pageNumbers.length,
          translatedSegments: exportSegmentCount,
          totalSegments: exportSourceSegmentCount,
          message:
            exportSegmentCount < exportSourceSegmentCount
              ? t("pdfAuthoring.reader.status.pagePreparedPartial", {
                  page: numberFormatter.format(pageNumber)
                })
              : t("pdfAuthoring.reader.status.pagePrepared", {
                  page: numberFormatter.format(pageNumber)
                })
        });
      }

      if (exportSegmentCount === 0 && settings.pdfExportMode !== "paper") {
        setError(t("pdfAuthoring.reader.errors.noExportResult"));
        setTranslationStatus("");
        updateDocumentJob(jobId, {
          status: "failed",
          processedPages: pageNumbers.length,
          message: t("pdfAuthoring.reader.errors.noExportResultShort")
        });
        return;
      }

      setTranslationStatus(t("pdfAuthoring.reader.status.exporting"));
      const missingExportSegments = Math.max(0, exportSourceSegmentCount - exportSegmentCount);
      updateDocumentJob(jobId, {
        status: "exporting",
        totalSegments: exportSourceSegmentCount,
        translatedSegments: exportSegmentCount,
        message:
          missingExportSegments > 0
            ? t("pdfAuthoring.reader.status.creatingExportPartial", {
                count: missingExportSegments
              })
            : t("pdfAuthoring.reader.status.creatingExport")
      });
      const result = await api.documents.exportBilingualPdf({
        title: fileName ? fileName.replace(/\.pdf$/i, "") : "bilingual-translation",
        sourceLanguageLabel,
        targetLanguageLabel,
        sourcePdfData: sourcePdfData ?? undefined,
        sourcePdfFilePath: sourcePdfFilePath || undefined,
        exportMode: settings.pdfExportMode,
        showSourceHighlights: settings.showPdfSourceHighlights,
        pages
      });
      const exportArtifactLabel =
        result.fileType === "pdf"
          ? t("pdfAuthoring.reader.ui.artifactPdf")
          : t("pdfAuthoring.reader.ui.artifactHtml");
      setTranslationStatus(
        t("pdfAuthoring.reader.status.exportSavedSummary", {
          artifact: exportArtifactLabel,
          pages: numberFormatter.format(result.pageCount),
          segments: numberFormatter.format(result.segmentCount)
        })
      );
      updateDocumentJob(jobId, {
        status: missingExportSegments > 0 ? "partial" : "exported",
        processedPages: result.pageCount,
        totalPages: result.pageCount,
        translatedSegments: result.segmentCount,
        totalSegments: exportSourceSegmentCount,
        outputPath: result.filePath,
        message:
          missingExportSegments > 0
            ? t("pdfAuthoring.reader.status.exportSavedPartial", {
                artifact: exportArtifactLabel,
                count: missingExportSegments
              })
            : t("pdfAuthoring.reader.status.exportSaved", { artifact: exportArtifactLabel })
      });
      const createdAt = new Date();
      const title = fileName ? fileName.replace(/\.pdf$/i, "") : "bilingual-translation";
      const exportRecord: PdfExportRecord = {
        id: `${createdAt.toISOString()}-${result.filePath}`,
        title,
        filePath: result.filePath,
        fileType: result.fileType,
        pageRange: exportPageRange,
        pageCount: result.pageCount,
        segmentCount: result.segmentCount,
        providerLabel: selectedTranslationModel,
        sourceLanguageLabel,
        targetLanguageLabel,
        createdAt: createdAt.toISOString()
      };
      let savedRecord = exportRecord;
      try {
        savedRecord = await api.documents.saveExportRecord(exportRecord);
      } catch (recordSaveError) {
        setTechnicalError(t("pdfAuthoring.reader.errors.recordSave"), recordSaveError);
      }
      setExportRecords((previous) => [
        savedRecord,
        ...previous.filter((record) => record.id !== savedRecord.id)
      ].slice(0, 5));
    } catch (caught) {
      setTechnicalError(t("pdfAuthoring.reader.errors.export"), caught);
      setTranslationStatus("");
      updateDocumentJob(jobId, {
        status: "failed",
        message: t("pdfAuthoring.reader.errors.export")
      });
    } finally {
      setIsExporting(false);
    }
  }

  async function openExportRecord(record: PdfExportRecord) {
    try {
      setError("");
      const opened = await api.documents.openPath(record.filePath);
      if (!opened) {
        throw new Error(t("pdfAuthoring.reader.errors.openFileBrowser"));
      }
      setTranslationStatus(
        t("pdfAuthoring.reader.status.fileOpened", { path: displayFileName(record.filePath) })
      );
    } catch (caught) {
      setTechnicalError(
        formatExportActionError(t("pdfAuthoring.reader.ui.openFileAction"), record),
        caught
      );
    }
  }

  async function revealExportRecord(record: PdfExportRecord) {
    try {
      setError("");
      const revealed = await api.documents.revealPath(record.filePath);
      if (!revealed) {
        throw new Error(t("pdfAuthoring.reader.errors.openFolderBrowser"));
      }
      setTranslationStatus(
        t("pdfAuthoring.reader.status.folderOpened", { path: displayFileName(record.filePath) })
      );
    } catch (caught) {
      setTechnicalError(
        formatExportActionError(t("pdfAuthoring.reader.ui.openFolderAction"), record),
        caught
      );
    }
  }

  async function redownloadExportRecord(record: PdfExportRecord) {
    try {
      setError("");
      const result = await api.documents.redownloadExport(record);
      const createdAt = new Date().toISOString();
      const savedRecord = await api.documents.saveExportRecord({
        ...record,
        id: `${createdAt}-${result.filePath}`,
        filePath: result.filePath,
        fileType: result.fileType,
        pageCount: result.pageCount,
        segmentCount: result.segmentCount,
        createdAt
      });
      setExportRecords((previous) => [
        savedRecord,
        ...previous.filter((candidate) => candidate.id !== savedRecord.id)
      ].slice(0, 5));
      setTranslationStatus(
        t("pdfAuthoring.reader.status.redownloaded", { path: displayFileName(result.filePath) })
      );
    } catch (caught) {
      setTechnicalError(
        formatExportActionError(t("pdfAuthoring.reader.ui.redownloadAction"), record),
        caught
      );
    }
  }

  function openExportRecordInReader(record: PdfExportRecord) {
    onOpenReaderArtifact?.(createReaderArtifactFromExportRecord(record));
  }

  usePdfPageRenderer({
    canvasRef,
    currentPage,
    onError: setTechnicalError,
    onStatus: setViewerStatus,
    pdfDocument,
    textLayerRef
  });

  useEffect(() => {
    if (!pdfDocument) {
      return;
    }

    let cancelled = false;

    async function loadTextAndCachedTranslation() {
      setPageText("");
      setPageSegments([]);
      setSegmentTranslations([]);
      setCacheStatus("idle");
      setTranslationStatus(t("pdfAuthoring.reader.status.checkingText"));
      setError("");

      try {
        const { text, segments } = await readPageData(currentPage);
        if (cancelled) {
          return;
        }

        setPageText(text);
        if (!text) {
          setTranslationStatus(t("pdfAuthoring.reader.status.noTextLayer"));
          return;
        }

        setPageSegments(segments);
        if (segments.length === 0) {
          setTranslationStatus(t("pdfAuthoring.reader.status.noSegments"));
          return;
        }

        const translatedPageState = pageTranslations[currentPage];
        if (
          translatedPageState &&
          translatedPageState.segments.map((segment) => segment.id).join("|") ===
            segments.map((segment) => segment.id).join("|")
        ) {
          setPageSegments(translatedPageState.segments);
          setSegmentTranslations(translatedPageState.translations);
          setCacheStatus(
            translatedPageState.cacheStatus === "partial" ? "miss" : translatedPageState.cacheStatus
          );
          setTranslationStatus(t("pdfAuthoring.reader.status.loadedTranslation"));
          return;
        }

        const translationContext = buildTranslationContextForSegments(segments);
        const cachedEntries = await Promise.all(
          segments.map((segment) =>
            api.translations.getCached({
              ...createPdfTranslationCacheLookupInput({
                segment,
                settings,
                selectedTranslationModel,
                contextHash: translationContext.contextHash
              })
            })
          )
        );
        if (cancelled) {
          return;
        }

        const cachedTranslations = cachedEntries.flatMap((entry, index) =>
          entry
            ? [
                {
                  id: segments[index].id,
                  translationKo: entry.translatedText,
                  cacheStatus: "hit" as const
                }
              ]
            : []
        );
        setSegmentTranslations(cachedTranslations);
        if (cachedTranslations.length > 0) {
          setPageTranslations((previous) => ({
            ...previous,
            [currentPage]: {
              segments,
              translations: cachedTranslations,
              cacheStatus: cachedTranslations.length === segments.length ? "hit" : "partial"
            }
          }));
        }

        if (cachedTranslations.length === segments.length) {
          setCacheStatus("hit");
          setTranslationStatus(t("pdfAuthoring.reader.status.allCached"));
        } else if (cachedTranslations.length > 0) {
          setCacheStatus("miss");
          setTranslationStatus(
            t("pdfAuthoring.reader.status.someCached", {
              cached: numberFormatter.format(cachedTranslations.length),
              total: numberFormatter.format(segments.length)
            })
          );
        } else {
          setCacheStatus("miss");
          setTranslationStatus(
            t("pdfAuthoring.reader.status.segmentsReady", { count: segments.length })
          );
        }
      } catch (caught) {
        if (!cancelled) {
          setTechnicalError(t("pdfAuthoring.reader.errors.inspectText"), caught);
          setTranslationStatus("");
        }
      }
    }

    void loadTextAndCachedTranslation();

    return () => {
      cancelled = true;
    };
  }, [
    api,
    currentPage,
    pageTranslations,
    pdfDocument,
    readPageData,
    settings.learningProfile,
    selectedTranslationModel,
    setTechnicalError,
    settings.translationProviderName,
    t
  ]);

  useEffect(() => {
    if (!showLayoutPreview) {
      return;
    }

    setLayoutPreviewHtml("");
    setLayoutPreviewStatus(t("pdfAuthoring.reader.status.previewStale"));
  }, [
    currentPage,
    segmentTranslations,
    settings.pdfExportMode,
    settings.showPdfSourceHighlights,
    showLayoutPreview,
    t
  ]);

  return (
    <section className={`panel pdf-panel pdf-panel-${mode}`}>
      {cloudTranslationPreflightDialog}
      {!isMakerMode ? (
        <PdfReaderToolbar
          cacheStatus={cacheStatus}
          currentPage={currentPage}
          fileName={fileName}
          isOpening={isOpening}
          pageCount={pageCount}
          pdfDocumentLoaded={Boolean(pdfDocument)}
          providerLabel={providerLabel}
          translatedPageCount={translatedPageCount}
          onFileSelected={(file) => void handleFile(file)}
          onGoToPage={goToPage}
        />
      ) : null}

      {pdfDocument && isMakerMode && (documentJob || exportRecords.length > 0) ? (
        <PdfMakerJobSummary
          canOpenReaderArtifact={Boolean(onOpenReaderArtifact)}
          displayedProgressPercent={displayedProgressPercent}
          documentJob={documentJob}
          documentJobProgressPercent={documentJobProgressPercent}
          exportRecords={exportRecords}
          failedPageCount={failedPageCount}
          fileName={fileName}
          pageCount={pageCount}
          selectedRangePageCount={selectedRangePageCount}
          translatedPageCount={translatedPageCount}
          translatedSegmentCount={translatedSegmentCount}
          onOpenExportRecord={(record) => void openExportRecord(record)}
          onOpenExportRecordInReader={openExportRecordInReader}
          onRedownloadExportRecord={(record) => void redownloadExportRecord(record)}
          onRevealExportRecord={(record) => void revealExportRecord(record)}
        />
      ) : null}

      {errorNotice ? (
        <div data-qa="pdf-error">
          <DocumentNotice kind="error" value={errorNotice} />
        </div>
      ) : null}

      {isMakerMode ? (
        <PdfMakerWorkflow
          bypassTranslationCache={bypassTranslationCache}
          canOpenReaderArtifact={Boolean(onOpenReaderArtifact)}
          canShowMakerDone={canShowMakerDone}
          displayedProgressPercent={displayedProgressPercent}
          documentJob={documentJob}
          failedPageCount={failedPageCount}
          failedPageNumbers={failedPageNumbers}
          fileName={fileName}
          googleKeyMissing={googleKeyMissing}
          isMakerBusy={isMakerBusy}
          isMakerJobActive={isMakerJobActive}
          isOpening={isOpening}
          latestExportRecord={latestExportRecord}
          makerFreeTierLimitBlocked={makerFreeTierLimitBlocked}
          makerMonthlyLimitBlocked={makerMonthlyLimitBlocked}
          makerRuntimeBlocked={makerRuntimeBlocked}
          makerRuntimeBlockedMessage={makerRuntimeBlockedMessage}
          makerStartBlocked={makerStartBlocked}
          makerUsageEstimate={makerUsageEstimate}
          makerUsageStatus={makerUsageStatus}
          pageCount={pageCount}
          pageRangeInput={pageRangeInput}
          pageTranslationFailures={pageTranslationFailures}
          pdfDocumentLoaded={Boolean(pdfDocument)}
          providerLabel={providerLabel}
          selectedRangePageCount={selectedRangePageCount}
          settings={settings}
          translatedSegmentCount={translatedSegmentCount}
          onBypassTranslationCacheChange={setBypassTranslationCache}
          onFileSelected={(file) => void handleFile(file)}
          onOpenExportRecord={(record) => void openExportRecord(record)}
          onOpenExportRecordInReader={openExportRecordInReader}
          onPageRangeInputChange={setPageRangeInput}
          onRedownloadExportRecord={(record) => void redownloadExportRecord(record)}
          onResetPdfReaderToEmpty={resetPdfReaderToEmpty}
          onRetryFailedPagesAndExportSelectedRange={() =>
            void retryFailedPagesAndExportSelectedRange()
          }
          onRevealExportRecord={(record) => void revealExportRecord(record)}
          onSettingsChange={onSettingsChange}
          onTogglePdfSourceHighlights={togglePdfSourceHighlights}
          onTranslateAndExportSelectedRange={() => void translateAndExportSelectedRange()}
        />
      ) : null}

      {pdfDocument && !isMakerMode ? (
        <div className="pdf-reader-grid">
          <div className="pdf-viewer-pane">
            {viewerStatus ? <div className="pdf-loading">{viewerStatus}</div> : null}
            <div className="pdf-page-stage">
              <canvas
                ref={canvasRef}
                aria-label={t("pdfAuthoring.reader.ui.pageCanvas", {
                  page: numberFormatter.format(currentPage)
                })}
                className="pdf-canvas"
              />
              <div
                ref={textLayerRef}
                aria-label={t("pdfAuthoring.reader.ui.selectableText", {
                  page: numberFormatter.format(currentPage)
                })}
                className="pdf-visible-text-layer textLayer"
              />
              {showLayoutHighlights ? <PdfPageHighlights segments={pageSegments} /> : null}
            </div>
          </div>

          <aside className="pdf-translation-pane">
            <div className="pdf-translation-header">
              <div>
                <h3>{t("pdfAuthoring.reader.ui.translation")}</h3>
                {translationStatus ? <p className="muted compact">{translationStatus}</p> : null}
              </div>
              <div className="pdf-translation-actions">
                <button
                  className="button ghost"
                  disabled={pageSegments.length === 0}
                  type="button"
                  onClick={() => setShowLayoutHighlights((previous) => !previous)}
                >
                  {showLayoutHighlights
                    ? t("pdfAuthoring.reader.ui.hidePositions")
                    : t("pdfAuthoring.reader.ui.showPositions")}
                </button>
                <button
                  className="button ghost"
                  disabled={pageSegments.length === 0}
                  type="button"
                  onClick={togglePdfSourceHighlights}
                >
                  {settings.showPdfSourceHighlights
                    ? t("pdfAuthoring.reader.ui.hideSourceBoxes")
                    : t("pdfAuthoring.reader.ui.showSourceBoxes")}
                </button>
                {isMakerMode ? (
                  <button
                    className="button secondary"
                    disabled={pageSegments.length === 0 || isBuildingLayoutPreview}
                    type="button"
                    onClick={() => void previewCurrentPageLayout()}
                  >
                    {isBuildingLayoutPreview ? (
                      <Loader2 className="spin" size={16} />
                    ) : (
                      <FileText size={16} />
                    )}
                    {t("pdfAuthoring.reader.ui.layoutPreview")}
                  </button>
                ) : null}
                {activeTranslationRequestId ? (
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => void stopPdfTranslation()}
                  >
                    <X size={16} />
                    {t("pdfAuthoring.reader.stop")}
                  </button>
                ) : (
                  <button
                    className="button primary"
                    disabled={
                      pageSegments.length === 0 ||
                      isTranslating ||
                      isExporting ||
                      isDownloadingModel ||
                      googleKeyMissing
                    }
                    type="button"
                    onClick={() => void translateCurrentPage()}
                  >
                    {isTranslating ? (
                      <Loader2 className="spin" size={16} />
                    ) : (
                      <Languages size={16} />
                    )}
                    {t("pdfAuthoring.reader.ui.translatePage")}
                  </button>
                )}
              </div>
            </div>

            {provider ? (
              <section className="pdf-live-card-panel">
                <div className="pdf-live-card-header">
                  <div>
                    <strong>{t("pdfAuthoring.reader.ui.sentenceCard")}</strong>
                    <span>
                      {t("pdfAuthoring.reader.ui.sentenceCardHint", {
                        shortcut: settings.captureShortcut || "Ctrl+Q"
                      })}
                    </span>
                  </div>
                  <div className="card-generation-action-row">
                    <CardGenerationUsageEstimate estimate={liveCardUsageEstimate} variant="badge" />
                    <button
                      className="button secondary small"
                      disabled={isGeneratingLiveCard || pageSegments.length === 0}
                      type="button"
                      onFocus={refreshLiveCardUsageEstimate}
                      onMouseEnter={refreshLiveCardUsageEstimate}
                      onClick={() => void createLiveCardFromSelection()}
                    >
                      {isGeneratingLiveCard ? (
                        <Loader2 className="spin" size={15} />
                      ) : (
                        <Save size={15} />
                      )}
                      {t("pdfAuthoring.reader.ui.makeCard")}
                    </button>
                  </div>
                </div>
                {liveCardStatus ? <p className="status-text compact">{liveCardStatus}</p> : null}
                {liveCardCandidate ? (
                  <>
                    <CardPreview card={liveCardCandidate} settings={settings} defaultShowBack />
                    <button
                      className="button primary wide"
                      type="button"
                      onClick={() => void saveLiveCardCandidate()}
                    >
                      {t("pdfAuthoring.reader.ui.saveCard")}
                    </button>
                  </>
                ) : null}
              </section>
            ) : null}

            {googleKeyMissing ? (
              <p className="selection-warning">{t("pdfAuthoring.reader.ui.cloudKeyWarning")}</p>
            ) : null}
            {settings.translationProviderName === "local" ||
            settings.translationProviderName === "localMt" ? (
              <p className="muted compact">
                {t("pdfAuthoring.reader.ui.languageDirection", {
                  source: sourceLanguageLabel,
                  target: targetLanguageLabel
                })}
              </p>
            ) : null}
            {isMakerMode && rangeProgress ? (
              <div className="pdf-progress">
                <div className="pdf-progress-bar">
                  <span
                    style={{
                      width: `${Math.round((rangeProgress.current / Math.max(1, rangeProgress.total)) * 100)}%`
                    }}
                  />
                </div>
                <p className="muted compact">
                  {t("pdfAuthoring.reader.ui.progress", {
                    page: numberFormatter.format(rangeProgress.pageNumber),
                    current: numberFormatter.format(rangeProgress.current),
                    total: numberFormatter.format(rangeProgress.total),
                    translated: numberFormatter.format(rangeProgress.translatedSegments),
                    segments: numberFormatter.format(rangeProgress.totalSegments)
                  })}
                </p>
                {activeTranslationRequestId ? (
                  <button
                    className="button secondary small"
                    type="button"
                    onClick={() => void stopPdfTranslation()}
                  >
                    <X size={14} />
                    {t("pdfAuthoring.reader.stop")}
                  </button>
                ) : null}
              </div>
            ) : null}
            {isMakerMode && failedPageCount > 0 ? (
              <div className="pdf-failure-summary">
                <div>
                  <strong>
                    {t("pdfAuthoring.reader.ui.failedPages", { count: failedPageCount })}
                  </strong>
                  <p className="muted compact">
                    {t("pdfAuthoring.reader.ui.retryPages", {
                      pages: failedPageNumbers
                        .slice(0, 6)
                        .map((pageNumber) => numberFormatter.format(pageNumber))
                        .join(", "),
                      more:
                        failedPageNumbers.length > 6
                          ? t("pdfAuthoring.reader.ui.more")
                          : ""
                    })}
                  </p>
                </div>
                <button
                  className="button secondary"
                  disabled={isTranslating || isExporting || isDownloadingModel}
                  type="button"
                  onClick={() => void retryFailedPages()}
                >
                  {t("pdfAuthoring.reader.ui.retryFailures")}
                </button>
              </div>
            ) : null}

            {isMakerMode && showLayoutPreview ? (
              <section className="pdf-layout-preview">
                <div className="pdf-layout-preview-header">
                  <div>
                    <strong>{t("pdfAuthoring.reader.ui.layoutPreview")}</strong>
                    {layoutPreviewStatus ? (
                      <p className="muted compact">{layoutPreviewStatus}</p>
                    ) : null}
                  </div>
                  <button
                    className="mini-button"
                    aria-label={t("pdfAuthoring.reader.ui.closePreview")}
                    type="button"
                    onClick={() => {
                      setShowLayoutPreview(false);
                      setLayoutPreviewHtml("");
                      setLayoutPreviewStatus("");
                    }}
                  >
                    {t("common.close")}
                  </button>
                </div>
                {layoutPreviewHtml ? (
                  <iframe
                    className="pdf-layout-preview-frame"
                    sandbox=""
                    srcDoc={layoutPreviewHtml}
                    title={t("pdfAuthoring.reader.ui.previewFrame", {
                      page: numberFormatter.format(currentPage)
                    })}
                  />
                ) : (
                  <div className="pdf-layout-preview-empty">
                    {isBuildingLayoutPreview
                      ? t("pdfAuthoring.reader.ui.previewLoading")
                      : t("pdfAuthoring.reader.ui.previewEmpty")}
                  </div>
                )}
              </section>
            ) : null}

            <PdfTranslationSegmentList
              segments={pageSegments}
              translations={segmentTranslations}
            />

            <details className="pdf-source-details">
              <summary>{t("pdfAuthoring.reader.ui.currentPageText")}</summary>
              <div className="pdf-page-text">
                {pageText || t("pdfAuthoring.reader.ui.noExtractedText")}
              </div>
            </details>
          </aside>
        </div>
      ) : !pdfDocument && !isMakerMode ? (
        <PdfReaderEmptyState
          isMakerMode={isMakerMode}
          selectedTranslationModel={selectedTranslationModel}
          settings={settings}
          onFileSelected={(file) => void handleFile(file)}
        />
      ) : null}
      <PdfReaderRuntimeDialogs
        isDownloadingModel={isDownloadingModel}
        ollamaDownloadUrl={OLLAMA_DOWNLOAD_URL}
        pendingModelDownload={pendingModelDownload}
        pendingOllamaSetup={pendingOllamaSetup}
        onDismissModelDownload={dismissModelDownloadPrompt}
        onDismissOllamaSetup={dismissOllamaSetupPrompt}
        onDownloadMissingModel={() => void downloadMissingModelAndTranslate()}
        onRetryOllamaSetup={() => void translateCurrentPage()}
      />
    </section>
  );
}

function displayFileName(value: string) {
  return value.split(/[\\/]/).filter(Boolean).at(-1) ?? value;
}
