import "../styles/playZone.css";
import {
  Clock3,
  Download,
  FilePlus2,
  Filter,
  FolderOpen,
  Gamepad2,
  HelpCircle,
  Play,
  RefreshCcw,
  Search,
  ShieldCheck,
  Star,
  UploadCloud,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import creatorGuideEn from "../../docs/creator-guide.en.md?raw";
import creatorGuideKo from "../../docs/creator-guide.ko.md?raw";
import playZoneCurrentRuntimeContract from "../../docs/ugc/playzone-current-runtime-contract.md?raw";
import gameKitStartHere from "../../gamekit/00_START_HERE.md?raw";
import diamondEconomyRules from "../../gamekit/03_DIAMOND_ECONOMY_RULES.md?raw";
import gamePackSpec from "../../gamekit/04_LEM_PACKAGE_SPEC.md?raw";
import runtimeSecurityRules from "../../gamekit/05_RUNTIME_SECURITY_RULES.md?raw";
import manifestSchema from "../../gamekit/07_MANIFEST_SCHEMA.md?raw";
import { Dialog } from "../components/Dialog";
import { DocumentTechnicalDetails } from "../components/DocumentTechnicalDetails";
import { documentTechnicalError } from "../shared/documentPresentation";
import { PLAY_ZONE_CURRENT_APP_VERSION } from "../shared/playZoneContract";
import { isRetiredPlayZonePackId } from "../shared/playZoneRetiredPacks";
import type {
  PlayZoneLibraryEntry,
  PlayZoneOfficialDownloadProgress,
  PlayZoneSecurityReport
} from "../shared/types";

type PlayZoneStatus = "installed" | "available" | "featured" | "update" | "local" | "trusted" | "blocked";
type PlayZoneCategory = "all" | "installed" | "featured" | "learning" | "action" | "story";
type PlayZoneRuntimeId = "cartridge";
type PlayZoneNotice = {
  kind: "error" | "status";
  summary: string;
  technicalDetail?: string;
};

type PlayZoneItem = {
  id: string;
  title: string;
  creator: string;
  version?: string;
  lineageId?: string;
  minPlayZoneVersion?: string;
  saveSchemaVersion?: string;
  releaseNotes?: string;
  category: Exclude<PlayZoneCategory, "all" | "installed" | "featured">;
  status: PlayZoneStatus;
  summary: string;
  tags: string[];
  playTime: string;
  lastPlayed: string;
  progress: number;
  rating: number;
  coverClassName: string;
  thumbnailUrl?: string;
  cartridgeId?: string;
  entryUrl?: string;
  runtimeId?: PlayZoneRuntimeId;
  sourceType?: PlayZoneLibraryEntry["sourceType"];
  sourcePath?: string;
  installationId?: string;
  installed: boolean;
  bundled: boolean;
  libraryStatus?: PlayZoneLibraryEntry["status"];
  diamondActions?: PlayZoneLibraryEntry["diamondActions"];
  officialDownload?: PlayZoneLibraryEntry["officialDownload"];
  officialUpdateAvailable?: boolean;
  securityReport?: PlayZoneSecurityReport;
  libraryEntry: PlayZoneLibraryEntry;
};

type PendingPlayZoneInstall = {
  entry: PlayZoneLibraryEntry;
  replacing?: PlayZoneItem;
  updateWarnings: string[];
  playAfterInstall?: boolean;
};

type PlayZonePageProps = {
  walletBalance?: number;
};

type PlayZoneLocalLibraryState = {
  libraryFolderPath: string;
  importedEntries: PlayZoneLibraryEntry[];
  supersededSourcePaths?: string[];
};

const categories: PlayZoneCategory[] = ["all", "installed", "learning", "action", "story"];
const PLAY_ZONE_LOCAL_LIBRARY_KEY = "lem:playZone:library:v2";
const LEGACY_PLAY_ZONE_LOCAL_LIBRARY_KEY = "lem:playZone:library:v1";
const gameDeveloperAgentGuideFileName = "LanguageMinerGameKit.zip";
const gameDeveloperAgentGuideAssetPath = "./playzone/LanguageMinerGameKit.zip";
const fallbackGameDeveloperAgentGuideFileName = "language-miner-game-agent-guide.md";
const gameDeveloperAgentGuideDocs = [
  {
    title: "UGC Creator Guide (Korean)",
    source: "docs/creator-guide.ko.md",
    content: creatorGuideKo
  },
  {
    title: "UGC Creator Guide (English)",
    source: "docs/creator-guide.en.md",
    content: creatorGuideEn
  },
  {
    title: "GameKit Start Here",
    source: "gamekit/00_START_HERE.md",
    content: gameKitStartHere
  },
  {
    title: "PlayZone Current Runtime Contract",
    source: "docs/ugc/playzone-current-runtime-contract.md",
    content: playZoneCurrentRuntimeContract
  },
  {
    title: "Game Pack Specification",
    source: "gamekit/04_LEM_PACKAGE_SPEC.md",
    content: gamePackSpec
  },
  {
    title: "Runtime Security Rules",
    source: "gamekit/05_RUNTIME_SECURITY_RULES.md",
    content: runtimeSecurityRules
  },
  {
    title: "Manifest Schema",
    source: "gamekit/07_MANIFEST_SCHEMA.md",
    content: manifestSchema
  },
  {
    title: "Diamond Economy Rules",
    source: "gamekit/03_DIAMOND_ECONOMY_RULES.md",
    content: diamondEconomyRules
  }
];

export function PlayZonePage({ walletBalance = 0 }: PlayZonePageProps) {
  const { i18n, t } = useTranslation();
  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language),
    [i18n.language, i18n.resolvedLanguage]
  );
  const ratingFormatter = useMemo(
    () => new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }),
    [i18n.language, i18n.resolvedLanguage]
  );
  const percentFormatter = useMemo(
    () => new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language, {
      style: "percent",
      maximumFractionDigits: 0
    }),
    [i18n.language, i18n.resolvedLanguage]
  );
  const [activeCategory, setActiveCategory] = useState<PlayZoneCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [statusNotice, setStatusNotice] = useState<PlayZoneNotice | null>(null);
  const [libraryFolderPath, setLibraryFolderPath] = useState("");
  const [importedEntries, setImportedEntries] = useState<PlayZoneLibraryEntry[]>([]);
  const [scannedEntries, setScannedEntries] = useState<PlayZoneLibraryEntry[]>([]);
  const [supersededSourcePaths, setSupersededSourcePaths] = useState<string[]>([]);
  const [isScanningLibrary, setIsScanningLibrary] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [pendingInstall, setPendingInstall] = useState<PendingPlayZoneInstall | null>(null);
  const [installNotice, setInstallNotice] = useState<PlayZoneNotice | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [activeOfficialRequestId, setActiveOfficialRequestId] = useState("");
  const [officialDownloadProgress, setOfficialDownloadProgress] = useState<PlayZoneOfficialDownloadProgress | null>(null);
  const officialCancelRequestedRef = useRef(false);
  const [isLoadingInstalled, setIsLoadingInstalled] = useState(true);

  useEffect(() => {
    const savedState = readPlayZoneLocalLibraryState();
    setLibraryFolderPath(savedState.libraryFolderPath);
    setSupersededSourcePaths(savedState.supersededSourcePaths ?? []);
    void loadInstalledEntries();
    if (savedState.libraryFolderPath) {
      void scanLibraryFolder(savedState.libraryFolderPath);
    }
  }, []);

  useEffect(() => {
    const api = window.localEnglishMiner?.playZone;
    if (!api?.onOfficialDownloadProgress) return undefined;
    return api.onOfficialDownloadProgress((progress) => {
      if (!activeOfficialRequestId || progress.requestId === activeOfficialRequestId) {
        setOfficialDownloadProgress(progress);
      }
    });
  }, [activeOfficialRequestId]);

  const localLibraryItems = useMemo(
    () =>
      mergePlayZoneLibraryEntries(importedEntries, scannedEntries)
        .filter((entry) => !isRetiredPlayZonePackId(entry.id))
        .filter((entry) => !isSupersededPlayZoneSourcePath(entry.sourcePath, supersededSourcePaths))
        .map((entry) => mapLibraryEntryToPlayZoneItem(entry, t)),
    [importedEntries, scannedEntries, supersededSourcePaths, t]
  );
  const allItems = useMemo(() => localLibraryItems, [localLibraryItems]);

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return allItems.filter((item) => {
      if (activeCategory === "all") {
        return matchesPlayZoneQuery(item, query, t);
      }
      if (
        activeCategory === "installed" &&
        item.installed
      ) {
        return matchesPlayZoneQuery(item, query, t);
      }
      if (activeCategory === "featured" && item.status === "featured") {
        return matchesPlayZoneQuery(item, query, t);
      }
      return item.category === activeCategory && matchesPlayZoneQuery(item, query, t);
    });
  }, [activeCategory, allItems, searchQuery, t]);

  const selectedItem = filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0];
  const hasAnyItems = allItems.length > 0;
  const emptyTitle = hasAnyItems
    ? t("playZone.empty.noResultsTitle")
    : t("playZone.empty.noPacksTitle");
  const emptyDescription = hasAnyItems
    ? t("playZone.empty.noResultsDescription")
    : t("playZone.empty.noPacksDescription");
  const isLibraryBusy = isLoadingInstalled || isScanningLibrary;

  function setCategory(category: PlayZoneCategory) {
    setActiveCategory(category);
    setStatusNotice(null);
  }

  function setStatusMessage(summary: string) {
    setStatusNotice(summary ? { kind: "status", summary } : null);
  }

  function setErrorMessage(summary: string, caught?: unknown) {
    const technicalDetail = documentTechnicalError(caught);
    setStatusNotice({
      kind: "error",
      summary,
      ...(technicalDetail ? { technicalDetail } : {})
    });
  }

  function setInstallErrorMessage(summary: string, caught?: unknown) {
    const technicalDetail = documentTechnicalError(caught);
    setInstallNotice({
      kind: "error",
      summary,
      ...(technicalDetail ? { technicalDetail } : {})
    });
  }

  async function loadInstalledEntries(options: { quiet?: boolean } = {}) {
    const api = window.localEnglishMiner?.playZone;
    setIsLoadingInstalled(true);
    if (!api?.listInstalledPacks) {
      if (!options.quiet) {
        setErrorMessage(getPlayZoneBridgeUnavailableMessage(t("playZone.library"), t));
      }
      setIsLoadingInstalled(false);
      return;
    }
    try {
      const installedEntries = await api.listInstalledPacks();
      setImportedEntries(installedEntries);
      if (!selectedId && installedEntries[0]) {
        setSelectedId(createPlayZoneItemIdFromLibraryEntry(installedEntries[0]));
      }
    } catch (caught) {
      if (!options.quiet) {
        setErrorMessage(t("playZone.messages.installedLoadFailed"), caught);
      }
    } finally {
      setIsLoadingInstalled(false);
    }
  }

  async function handlePlay() {
    if (!selectedItem) {
      return;
    }
    if (!selectedItem.installed && selectedItem.officialDownload) {
      setInstallNotice(null);
      setPendingInstall({
        entry: selectedItem.libraryEntry,
        updateWarnings: [],
        playAfterInstall: true
      });
      return;
    }
    const runnableItem = await refreshLocalPlayZoneItemBeforePlay(selectedItem);
    if (runnableItem.runtimeId && runnableItem.entryUrl) {
      void openPlayZoneRuntimeWindow(runnableItem);
      return;
    }
    if (runnableItem.libraryStatus) {
      const firstIssue = runnableItem.securityReport?.issues[0];
      setErrorMessage(
        firstIssue
          ? getPlayZoneSecurityIssueMessage(firstIssue.code, t)
          : getLibraryStatusLabel(runnableItem.libraryStatus, t)
      );
      return;
    }
    setStatusMessage(
      t("playZone.messages.runtimeUnavailable", { title: runnableItem.title })
    );
  }

  async function refreshLocalPlayZoneItemBeforePlay(item: PlayZoneItem) {
    const api = window.localEnglishMiner?.playZone;
    if (item.installed || !item.sourcePath || item.sourceType !== "file" || !api?.scanPackFile) {
      return item;
    }
    try {
      const refreshed = await api.scanPackFile(item.sourcePath);
      const refreshedItem = mapLibraryEntryToPlayZoneItem(refreshed, t);
      const knownImported = importedEntries.some((entry) => isSamePlayZoneSourcePath(entry.sourcePath, refreshed.sourcePath));
      if (knownImported) {
        const nextImportedEntries = mergePlayZoneLibraryEntries(importedEntries, [refreshed]);
        setImportedEntries(nextImportedEntries);
        writePlayZoneLocalLibraryState({
          libraryFolderPath,
          importedEntries: nextImportedEntries,
          supersededSourcePaths
        });
      }
      setScannedEntries((currentEntries) =>
        currentEntries.some((entry) => isSamePlayZoneSourcePath(entry.sourcePath, refreshed.sourcePath))
          ? mergePlayZoneLibraryEntries(currentEntries, [refreshed])
          : currentEntries
      );
      setSelectedId(createPlayZoneItemIdFromLibraryEntry(refreshed));
      return refreshedItem;
    } catch (caught) {
      setErrorMessage(t("playZone.messages.rescanFailed"), caught);
      return item;
    }
  }

  async function handleInstall() {
    if (!selectedItem) {
      return;
    }
    if (selectedItem.installed && !selectedItem.officialUpdateAvailable) {
      setStatusMessage(t("playZone.messages.alreadyInstalled", { title: selectedItem.title }));
      return;
    }
    setInstallNotice(null);
    setPendingInstall({
      entry: selectedItem.libraryEntry,
      replacing: selectedItem.installed ? selectedItem : undefined,
      updateWarnings: []
    });
  }

  async function handleAddPackFile() {
    const api = window.localEnglishMiner?.playZone;
    if (!api?.pickPackFile) {
      setErrorMessage(getPlayZoneBridgeUnavailableMessage(t("playZone.import.addFile"), t));
      return;
    }
    try {
      const picked = await api.pickPackFile();
      if (!picked) {
        return;
      }
      setScannedEntries((current) => mergePlayZoneLibraryEntries(current, [picked]));
      setSelectedId(createPlayZoneItemIdFromLibraryEntry(picked));
      setInstallNotice(null);
      setPendingInstall({ entry: picked, updateWarnings: [] });
      setStatusMessage(t("playZone.messages.inspected", { title: picked.title }));
    } catch (caught) {
      setErrorMessage(t("playZone.messages.addFailed"), caught);
    }
  }

  async function handleUpdateSelectedPackFile() {
    if (!selectedItem?.installed || !selectedItem.installationId || !selectedItem.cartridgeId) {
      setErrorMessage(t("playZone.messages.chooseUpdateFirst"));
      return;
    }
    const api = window.localEnglishMiner?.playZone;
    if (!api?.pickPackFile) {
      setErrorMessage(getPlayZoneBridgeUnavailableMessage(t("playZone.updateFile"), t));
      return;
    }
    try {
      const picked = await api.pickPackFile();
      if (!picked) {
        return;
      }
      const warnings = getPlayZoneUpdateWarnings(selectedItem, picked, t);
      setScannedEntries((current) => mergePlayZoneLibraryEntries(current, [picked]));
      setInstallNotice(null);
      setPendingInstall({ entry: picked, replacing: selectedItem, updateWarnings: warnings });
    } catch (caught) {
      setErrorMessage(t("playZone.messages.updateFailed"), caught);
    }
  }

  async function confirmPendingInstall() {
    if (!pendingInstall || isInstalling) return;
    const { entry, replacing, playAfterInstall } = pendingInstall;
    if (!entry.officialDownload && entry.status !== "ready" && entry.status !== "trusted_official") {
      setInstallErrorMessage(t("playZone.install.blocked"));
      return;
    }
    const api = window.localEnglishMiner?.playZone;
    const isOfficialDownload = Boolean(entry.officialDownload);
    if (!api || (!isOfficialDownload && !api.installPack) || (isOfficialDownload && !api.installOfficialPack)) {
      setInstallErrorMessage(
        getPlayZoneBridgeUnavailableMessage(t("playZone.secondaryAction.install"), t)
      );
      return;
    }
    try {
      setIsInstalling(true);
      setInstallNotice(null);
      const backupResult = replacing?.cartridgeId
        ? await api.backupSave?.({ cartridgeId: replacing.cartridgeId })
        : undefined;
      let installedEntry: PlayZoneLibraryEntry;
      if (isOfficialDownload) {
        const requestId = createPlayZoneOfficialRequestId();
        officialCancelRequestedRef.current = false;
        setActiveOfficialRequestId(requestId);
        setOfficialDownloadProgress({
          requestId,
          packId: entry.id,
          state: "downloading",
          receivedBytes: 0,
          totalBytes: entry.officialDownload?.downloadBytes ?? 0
        });
        installedEntry = await api.installOfficialPack!({ packId: entry.id, requestId });
      } else {
        installedEntry = await api.installPack!({
          sourcePath: entry.sourcePath,
          replaceInstallationId: replacing?.installationId
        });
      }
      setScannedEntries((current) => current.filter(
        (candidate) => !isSamePlayZoneSourcePath(candidate.sourcePath, entry.sourcePath)
      ));
      await loadInstalledEntries({ quiet: true });
      setSelectedId(createPlayZoneItemIdFromLibraryEntry(installedEntry));
      setInstallNotice(null);
      setPendingInstall(null);
      setStatusMessage(replacing
        ? t("playZone.messages.updateConnected", {
            title: replacing.title,
            versionChange: formatPlayZoneVersionChange(replacing.version, installedEntry.version, t),
            backupMessage: formatPlayZoneBackupMessage(backupResult?.backedUp, t)
          })
        : t("playZone.messages.installed", { title: installedEntry.title }));
      if (playAfterInstall) {
        await openPlayZoneRuntimeWindow(mapLibraryEntryToPlayZoneItem(installedEntry, t));
      }
    } catch (caught) {
      const isCancelled = officialCancelRequestedRef.current;
      setInstallErrorMessage(
        isCancelled
          ? t("playZone.messages.downloadCancelled")
          : getOfficialInstallFailureMessage(caught, t),
        isCancelled ? undefined : caught
      );
    } finally {
      setIsInstalling(false);
      setActiveOfficialRequestId("");
      setOfficialDownloadProgress(null);
      officialCancelRequestedRef.current = false;
    }
  }

  async function cancelPendingInstall() {
    if (isInstalling && activeOfficialRequestId) {
      officialCancelRequestedRef.current = true;
      await window.localEnglishMiner?.playZone?.cancelOfficialPackDownload?.(activeOfficialRequestId);
      return;
    }
    if (!isInstalling) {
      setInstallNotice(null);
      setPendingInstall(null);
    }
  }

  async function handlePickLibraryFolder() {
    const api = window.localEnglishMiner?.playZone;
    if (!api?.pickLibraryFolder) {
      setErrorMessage(getPlayZoneBridgeUnavailableMessage(t("playZone.import.chooseFolder"), t));
      return;
    }
    try {
      setIsScanningLibrary(true);
      const result = await api.pickLibraryFolder();
      if (!result) {
        return;
      }
      setLibraryFolderPath(result.folderPath);
      setScannedEntries(result.entries);
      writePlayZoneLocalLibraryState({
        libraryFolderPath: result.folderPath,
        importedEntries,
        supersededSourcePaths
      });
      if (result.entries[0]) {
        setSelectedId(createPlayZoneItemIdFromLibraryEntry(result.entries[0]));
      }
      setStatusMessage(t("playZone.messages.folderScan", {
        folder: result.folderName,
        count: result.entries.length,
        formattedCount: numberFormatter.format(result.entries.length),
        warningSummary: result.warnings.length
          ? t("playZone.messages.warningCount", {
              count: result.warnings.length,
              formattedCount: numberFormatter.format(result.warnings.length)
            })
          : ""
      }));
    } catch (caught) {
      setErrorMessage(t("playZone.messages.folderReadFailed"), caught);
    } finally {
      setIsScanningLibrary(false);
    }
  }

  async function refreshLibraryFolder() {
    if (!libraryFolderPath) {
      setErrorMessage(t("playZone.messages.chooseFolderFirst"));
      return;
    }
    await scanLibraryFolder(libraryFolderPath);
  }

  async function scanLibraryFolder(folderPath: string, options: { quiet?: boolean } = {}) {
    const api = window.localEnglishMiner?.playZone;
    if (!api?.scanLibraryFolder) {
      if (!options.quiet) {
        setErrorMessage(getPlayZoneBridgeUnavailableMessage(t("playZone.import.refresh"), t));
      }
      return;
    }
    try {
      setIsScanningLibrary(true);
      const result = await api.scanLibraryFolder(folderPath);
      setLibraryFolderPath(result.folderPath);
      setScannedEntries(result.entries);
      if (!options.quiet) {
        setStatusMessage(t("playZone.messages.libraryRefreshed", {
          folder: result.folderName,
          count: result.entries.length,
          formattedCount: numberFormatter.format(result.entries.length)
        }));
      }
    } catch (caught) {
      if (!options.quiet) {
        setErrorMessage(t("playZone.messages.libraryRefreshFailed"), caught);
      }
    } finally {
      setIsScanningLibrary(false);
    }
  }

  async function downloadGameDeveloperAgentGuide() {
    try {
      const response = await fetch(gameDeveloperAgentGuideAssetPath);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      downloadBlob(await response.blob(), gameDeveloperAgentGuideFileName);
      setStatusMessage(t("playZone.messages.kitDownloaded", { file: gameDeveloperAgentGuideFileName }));
    } catch {
      const markdown = createGameDeveloperAgentGuideMarkdown(t);
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      downloadBlob(blob, fallbackGameDeveloperAgentGuideFileName);
      setStatusMessage(t("playZone.messages.fallbackGuideDownloaded", { file: fallbackGameDeveloperAgentGuideFileName }));
    }
  }

  async function openPlayZoneRuntimeWindow(item: PlayZoneItem) {
    const runtimeId = item.runtimeId ?? "cartridge";
    const cartridgeId = item.cartridgeId ?? item.id;
    const entryUrl = item.entryUrl ?? "";
    const hostOpenRuntimeWindow = window.localEnglishMiner?.app?.openPlayZoneRuntimeWindow;
    if (hostOpenRuntimeWindow) {
      try {
        const openedByHost = await hostOpenRuntimeWindow({
          runtimeId,
          cartridgeId,
          title: item.title,
          entryUrl,
          walletBalance,
          diamondActions: item.diamondActions ?? []
        });
        if (openedByHost) {
          setStatusMessage(t("playZone.messages.opened", { title: item.title }));
        } else {
          setErrorMessage(t("playZone.messages.securityRejected"));
        }
      } catch (caught) {
        setErrorMessage(t("playZone.messages.runtimeOpenFailed"), caught);
      }
      // Electron must never fall back to a renderer-created window: doing so would
      // bypass the host's manifest revalidation, CSP, network deny, and permission gates.
      return;
    }

    // Static web previews do not have the Electron bridge. They may open only the
    // bundled preview route and never execute a host-authorized local pack.
    const runtimeUrl = createPlayZoneRuntimeUrl({
      runtimeId,
      cartridgeId,
      title: item.title,
      entryUrl,
      walletBalance,
      diamondActions: item.diamondActions ?? []
    });
    const gameWindow = window.open(
      runtimeUrl,
      `lem-game-${cartridgeId}`,
      "popup,width=1280,height=820,resizable=yes,scrollbars=no"
    );

    if (!gameWindow) {
      setErrorMessage(t("playZone.messages.popupBlocked"));
      return;
    }

    gameWindow.focus();
    setStatusMessage(t("playZone.messages.opened", { title: item.title }));
  }

  return (
    <section aria-labelledby="play-zone-page-title" className="play-zone-page">
      <h1 className="sr-only" id="play-zone-page-title">{t("playZone.title")}</h1>
      <aside aria-label={t("playZone.library")} className="play-zone-library">
        <div className="play-zone-search">
          <Search size={16} />
          <input
            type="search"
            aria-label={t("playZone.searchPlaceholder")}
            placeholder={t("playZone.searchPlaceholder")}
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setStatusMessage("");
            }}
          />
        </div>
        <div className="play-zone-filter-heading">
          <Filter size={15} />
          <span>{t("playZone.library")}</span>
        </div>
        <div aria-label={t("playZone.categories.filterAria")} className="play-zone-category-list" role="group">
          {categories.map((category) => (
            <button
              aria-pressed={activeCategory === category}
              className={activeCategory === category ? "active" : ""}
              key={category}
              type="button"
              onClick={() => setCategory(category)}
            >
              <span>{getCategoryLabel(category, t)}</span>
              <small>{numberFormatter.format(getCategoryCount(category, allItems))}</small>
            </button>
          ))}
        </div>
        <div className="play-zone-import-box">
          <div className="play-zone-import-head">
            <UploadCloud size={18} />
            <div>
              <strong>{t("playZone.import.title")}</strong>
              <span>{t("playZone.import.formats")}</span>
            </div>
          </div>
          <button className="button secondary small" data-qa="play-zone-add-lem-file" type="button" onClick={handleAddPackFile}>
            <FilePlus2 size={15} />
            {t("playZone.import.addFile")}
          </button>
          <button
            className="button secondary small"
            data-qa="play-zone-pick-library-folder"
            disabled={isScanningLibrary}
            type="button"
            onClick={handlePickLibraryFolder}
          >
            <FolderOpen size={15} />
            {t("playZone.import.chooseFolder")}
          </button>
          {libraryFolderPath ? (
            <div className="play-zone-library-path">
              <span>{getPlayZoneFileName(libraryFolderPath, t)}</span>
              <button
                className="icon-button"
                type="button"
                aria-label={t("playZone.import.refresh")}
                title={t("playZone.import.refresh")}
                disabled={isScanningLibrary}
                onClick={() => void refreshLibraryFolder()}
              >
                <RefreshCcw className={isScanningLibrary ? "spin" : ""} size={14} />
              </button>
            </div>
          ) : null}
        </div>
        <button
          className="play-zone-author-kit"
          type="button"
          onClick={() => void downloadGameDeveloperAgentGuide()}
        >
          <Download size={18} />
          <span>
            <strong>{t("playZone.import.authorKit")}</strong>
            <small>{t("playZone.import.authorKitDescription")}</small>
          </span>
        </button>
        <button
          className="play-zone-help-button"
          type="button"
          onClick={() => setIsHelpOpen(true)}
        >
          <HelpCircle size={18} />
          <span>
            <strong>{t("playZone.import.help")}</strong>
            <small>{t("playZone.import.helpDescription")}</small>
          </span>
        </button>
      </aside>

      <div
        aria-busy={isLibraryBusy}
        aria-labelledby="play-zone-shelf-title"
        className="play-zone-content"
        role="region"
      >
        <div className="play-zone-overview">
          {selectedItem ? (
            <div className="play-zone-hero" id="play-zone-selected-game">
            <div
              className={getPlayZoneCoverClassName(selectedItem, "play-zone-hero-art")}
              style={getPlayZoneCoverStyle(selectedItem)}
            >
              <span>{getCategoryLabel(selectedItem.category, t)}</span>
              <strong>{selectedItem.title}</strong>
            </div>
            <div className="play-zone-hero-body">
              <div className="play-zone-title-line">
                <div>
                  <span className="play-zone-kicker">{t("playZone.selectedGame")}</span>
                  <h2>{selectedItem.title}</h2>
                </div>
                <span className="play-zone-rating">
                  <Star aria-hidden="true" size={15} />
                  <span className="sr-only">{t("playZone.ratingLabel")}</span>
                  {ratingFormatter.format(selectedItem.rating)}
                </span>
              </div>
              <p>{selectedItem.summary}</p>
              <div className="play-zone-tags">
                {selectedItem.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <div className="play-zone-actions">
                <button
                  aria-label={t("playZone.playAria", { title: selectedItem.title })}
                  className="button primary"
                  data-qa="play-zone-play-selected"
                  disabled={!isExecutablePlayZoneItem(selectedItem)}
                  type="button"
                  onClick={() => void handlePlay()}
                >
                  <Play size={16} />
                  {!selectedItem.installed && selectedItem.officialDownload
                    ? t("playZone.downloadAndPlay")
                    : t("playZone.play")}
                </button>
                {!selectedItem.installed || selectedItem.officialUpdateAvailable ? (
                  <button
                    className="button secondary"
                    data-qa="play-zone-install-selected"
                    type="button"
                    onClick={() => void handleInstall()}
                  >
                    <Download size={16} />
                    {getSecondaryActionLabel(selectedItem, t)}
                  </button>
                ) : null}
                {selectedItem.installed && !selectedItem.bundled ? (
                  <button className="button secondary" type="button" onClick={() => void handleUpdateSelectedPackFile()}>
                    <RefreshCcw size={16} />
                    {t("playZone.updateFile")}
                  </button>
                ) : null}
              </div>
            </div>
            </div>
          ) : (
            <div aria-live="polite" className="play-zone-empty-selection" role="status">
              <strong>{isLibraryBusy ? t("playZone.empty.loadingTitle") : emptyTitle}</strong>
              <span>{isLibraryBusy ? t("playZone.empty.loadingDescription") : emptyDescription}</span>
            </div>
          )}
          {statusNotice ? (
            <div
              aria-live={statusNotice.kind === "error" ? "assertive" : "polite"}
              className={`play-zone-status play-zone-status-${statusNotice.kind}`}
              role={statusNotice.kind === "error" ? "alert" : "status"}
            >
              <p>{statusNotice.summary}</p>
              {statusNotice.technicalDetail ? (
                <DocumentTechnicalDetails
                  items={[{
                    label: t("playZone.fields.technicalDetail"),
                    value: statusNotice.technicalDetail
                  }]}
                />
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="play-zone-shelf-heading">
          <div>
            <span className="play-zone-kicker">{t("playZone.gamePacks")}</span>
            <h2 id="play-zone-shelf-title">{getCategoryLabel(activeCategory, t)}</h2>
          </div>
          <span>{t("playZone.packCount", {
            count: filteredItems.length,
            formattedCount: numberFormatter.format(filteredItems.length)
          })}</span>
        </div>
        <div aria-label={t("playZone.gamePacks")} className="play-zone-grid">
          {filteredItems.map((item) => (
            <button
              aria-controls="play-zone-selected-game"
              aria-pressed={item.id === selectedItem?.id}
              className={item.id === selectedItem?.id ? "play-zone-card active" : "play-zone-card"}
              data-pack-id={item.cartridgeId}
              data-qa={item.officialDownload ? "play-zone-official-pack" : undefined}
              key={item.id}
              type="button"
              onClick={() => {
                setSelectedId(item.id);
                setStatusMessage("");
              }}
            >
              <span
                className={getPlayZoneCoverClassName(item, "play-zone-card-cover")}
                style={getPlayZoneCoverStyle(item)}
              >
                <span>{getStatusLabel(item.status, t)}</span>
              </span>
              <span className="play-zone-card-body">
                <strong>{item.title}</strong>
                <small>{item.creator}</small>
                <span
                  aria-label={t("playZone.progressLabel", {
                    value: percentFormatter.format(item.progress / 100)
                  })}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={item.progress}
                  className="play-zone-progress"
                  role="progressbar"
                >
                  <span style={{ width: `${item.progress}%` }} />
                </span>
              </span>
            </button>
          ))}
          {filteredItems.length === 0 ? (
            <div aria-live="polite" className="play-zone-empty-result" role="status">
              {isLibraryBusy ? t("playZone.empty.loadingDescription") : emptyDescription}
            </div>
          ) : null}
        </div>
      </div>

      <aside className="play-zone-detail">
        <div className="play-zone-detail-header">
          <Gamepad2 size={18} />
          <h2>{t("playZone.packInfo")}</h2>
        </div>
        {selectedItem ? (
          <>
            <div className="play-zone-detail-cover">
              <div
                className={getPlayZoneCoverClassName(selectedItem)}
                style={getPlayZoneCoverStyle(selectedItem)}
              >
                <span>{selectedItem.title}</span>
              </div>
            </div>
            <dl className="play-zone-facts">
              <div>
                <dt>{t("playZone.fields.creator")}</dt>
                <dd>{selectedItem.creator}</dd>
              </div>
              {selectedItem.version ? (
                <div>
                  <dt>{t("playZone.fields.version")}</dt>
                  <dd>{selectedItem.version}</dd>
                </div>
              ) : null}
              {selectedItem.minPlayZoneVersion ? (
                <div>
                  <dt>{t("playZone.fields.requiredApp")}</dt>
                  <dd>{t("playZone.fields.minimumVersion", { version: selectedItem.minPlayZoneVersion })}</dd>
                </div>
              ) : null}
              {selectedItem.saveSchemaVersion ? (
                <div>
                  <dt>{t("playZone.fields.saveSchema")}</dt>
                  <dd>v{selectedItem.saveSchemaVersion}</dd>
                </div>
              ) : null}
              {selectedItem.lineageId ? (
                <div>
                  <dt>{t("playZone.fields.lineageId")}</dt>
                  <dd title={selectedItem.lineageId}>{selectedItem.lineageId}</dd>
                </div>
              ) : null}
              <div>
                <dt>{t("playZone.fields.playTime")}</dt>
                <dd>{selectedItem.playTime}</dd>
              </div>
              <div>
                <dt>{t("playZone.fields.lastPlayed")}</dt>
                <dd>{selectedItem.lastPlayed}</dd>
              </div>
              <div>
                <dt>{t("playZone.fields.progress")}</dt>
                <dd>{percentFormatter.format(selectedItem.progress / 100)}</dd>
              </div>
              {selectedItem.sourcePath ? (
                <div>
                  <dt>{t("playZone.fields.packFile")}</dt>
                  <dd>{selectedItem.libraryEntry.fileName || getPlayZoneFileName(selectedItem.sourcePath, t)}</dd>
                </div>
              ) : null}
            </dl>
            {selectedItem.sourcePath && !selectedItem.installed ? (
              <DocumentTechnicalDetails
                items={[{
                  label: t("playZone.fields.technicalPath"),
                  value: documentTechnicalError(selectedItem.sourcePath)
                }]}
              />
            ) : null}
            {selectedItem.releaseNotes ? (
              <div className="play-zone-activity">
                <div>
                  <RefreshCcw size={15} />
                  <span>{t("playZone.fields.releaseNotes")}</span>
                </div>
                <p>{selectedItem.releaseNotes}</p>
              </div>
            ) : null}
            <div className="play-zone-safety">
              <ShieldCheck size={17} />
              <div>
                <strong>{t("playZone.security.sandboxTitle")}</strong>
                <span>{t("playZone.security.sandboxDescription")}</span>
              </div>
            </div>
            {selectedItem.securityReport ? (
              <section className="play-zone-security-report" data-qa="play-zone-security-report">
                <div className="play-zone-security-report-heading">
                  <ShieldCheck size={17} />
                  <div>
                    <strong>{t("playZone.security.reportTitle")}</strong>
                    <span>{getLibraryStatusLabel(selectedItem.securityReport.status, t)}</span>
                  </div>
                </div>
                <dl>
                  <div>
                    <dt>{t("playZone.security.sha256")}</dt>
                    <dd title={selectedItem.securityReport.packSha256}>
                      {formatPlayZoneHash(selectedItem.securityReport.packSha256, t)}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("playZone.security.license")}</dt>
                    <dd>{selectedItem.securityReport.license ?? t("playZone.security.unknown")}</dd>
                  </div>
                  <div>
                    <dt>{t("playZone.security.source")}</dt>
                    <dd>{selectedItem.securityReport.sourceUrl ?? t("playZone.security.unknown")}</dd>
                  </div>
                </dl>
                <div className="play-zone-permission-list" aria-label={t("playZone.security.permissionsAria")}>
                  {Object.entries(selectedItem.securityReport.permissions).map(([permission, enabled]) => (
                    <span className={enabled ? "requested" : "denied"} key={permission}>
                      {getPlayZonePermissionLabel(permission, t)}: {enabled ? t("playZone.security.requested") : t("playZone.security.denied")}
                    </span>
                  ))}
                </div>
                {selectedItem.securityReport.issues.length ? (
                  <ul>
                    {selectedItem.securityReport.issues.map((issue) => (
                      <li className={`severity-${issue.severity}`} key={`${issue.code}:${issue.file ?? ""}`}>
                        <strong>{issue.code}</strong> {getPlayZoneSecurityIssueMessage(issue.code, t)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{t("playZone.security.noWarnings")}</p>
                )}
              </section>
            ) : null}
            <div className="play-zone-activity">
              <div>
                <Clock3 size={15} />
                <span>{t("playZone.recentActivity")}</span>
              </div>
              <p>{t("playZone.lastOpened", { when: selectedItem.lastPlayed })}</p>
            </div>
          </>
        ) : (
          <div className="play-zone-detail-empty">
            <strong>{t("playZone.empty.noSelection")}</strong>
            <span>{emptyDescription}</span>
          </div>
        )}
      </aside>
      {pendingInstall ? (
        <Dialog
          ariaDescribedBy="play-zone-install-description"
          ariaLabelledBy="play-zone-install-title"
          backdropClassName="play-zone-help-overlay"
          className="play-zone-help-dialog play-zone-install-dialog"
          closeOnBackdrop={!isInstalling}
          closeOnEscape={!isInstalling}
          data-qa="play-zone-install-confirmation"
          onClose={() => void cancelPendingInstall()}
        >
          <div className="play-zone-help-header">
            <div>
              <span className="play-zone-kicker">{t("playZone.install.kicker")}</span>
              <h2 id="play-zone-install-title">
                {pendingInstall.replacing
                  ? t("playZone.install.updateTitle", { title: pendingInstall.entry.title })
                  : t("playZone.install.title", { title: pendingInstall.entry.title })}
              </h2>
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label={t("common.close")}
              disabled={isInstalling && !activeOfficialRequestId}
              onClick={() => void cancelPendingInstall()}
            >
              <X size={17} />
            </button>
          </div>
          <div className="play-zone-help-body play-zone-install-body">
            <p id="play-zone-install-description">
              {pendingInstall.entry.officialDownload
                ? t("playZone.install.downloadDescription")
                : t("playZone.install.description")}
            </p>
            {installNotice ? (
              <div
                aria-live="assertive"
                className="play-zone-status play-zone-status-error"
                data-qa="play-zone-install-error"
                role="alert"
              >
                <p>{installNotice.summary}</p>
                {installNotice.technicalDetail ? (
                  <DocumentTechnicalDetails
                    items={[{
                      label: t("playZone.fields.technicalDetail"),
                      value: installNotice.technicalDetail
                    }]}
                  />
                ) : null}
              </div>
            ) : null}
            <dl className="play-zone-install-facts">
              <div>
                <dt>{t("playZone.install.status")}</dt>
                <dd>
                  {pendingInstall.entry.officialDownload && !pendingInstall.entry.installed
                    ? t("playZone.status.downloadAvailable")
                    : getLibraryStatusLabel(pendingInstall.entry.status, t)}
                </dd>
              </div>
              <div>
                <dt>{t("playZone.fields.creator")}</dt>
                <dd>{pendingInstall.entry.creator}</dd>
              </div>
              {pendingInstall.entry.officialDownload ? (
                <div>
                  <dt>{t("playZone.fields.downloadSize")}</dt>
                  <dd>{formatPlayZoneByteSize(pendingInstall.entry.officialDownload.downloadBytes, i18n.resolvedLanguage)}</dd>
                </div>
              ) : null}
              <div>
                <dt>{t("playZone.security.sha256")}</dt>
                <dd title={pendingInstall.entry.securityReport?.packSha256 ?? pendingInstall.entry.securityReport?.archiveSha256 ?? pendingInstall.entry.officialDownload?.archiveSha256}>
                  {formatPlayZoneHash(
                    pendingInstall.entry.securityReport?.packSha256
                      ?? pendingInstall.entry.securityReport?.archiveSha256
                      ?? pendingInstall.entry.officialDownload?.archiveSha256,
                    t
                  )}
                </dd>
              </div>
              <div>
                <dt>{t("playZone.security.license")}</dt>
                <dd>{pendingInstall.entry.license ?? t("playZone.security.unknown")}</dd>
              </div>
              <div>
                <dt>{t("playZone.security.source")}</dt>
                <dd>{pendingInstall.entry.sourceUrl ?? t("playZone.security.unknown")}</dd>
              </div>
            </dl>
            <section aria-labelledby="play-zone-install-permissions">
              <h3 id="play-zone-install-permissions">{t("playZone.security.permissionsAria")}</h3>
              <div className="play-zone-permission-list">
                {Object.entries(pendingInstall.entry.securityReport?.permissions ?? pendingInstall.entry.permissions ?? {}).map(
                  ([permission, enabled]) => (
                    <span className={enabled ? "requested" : "denied"} key={permission}>
                      {getPlayZonePermissionLabel(permission, t)}: {enabled ? t("playZone.security.requested") : t("playZone.security.denied")}
                    </span>
                  )
                )}
              </div>
            </section>
            {pendingInstall.updateWarnings.length ? (
              <section className="play-zone-install-warnings" aria-labelledby="play-zone-update-warnings">
                <h3 id="play-zone-update-warnings">{t("playZone.install.updateWarnings")}</h3>
                <ul>{pendingInstall.updateWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
              </section>
            ) : null}
            {pendingInstall.entry.securityReport?.issues.length ? (
              <section className="play-zone-install-warnings" aria-labelledby="play-zone-security-findings">
                <h3 id="play-zone-security-findings">{t("playZone.install.findings")}</h3>
                <ul>
                  {pendingInstall.entry.securityReport.issues.map((issue) => (
                    <li className={`severity-${issue.severity}`} key={`${issue.code}:${issue.file ?? ""}`}>
                      <strong>{issue.code}</strong> {getPlayZoneSecurityIssueMessage(issue.code, t)}
                    </li>
                  ))}
                </ul>
              </section>
            ) : pendingInstall.entry.officialDownload && !pendingInstall.entry.securityReport ? (
              <p>{t("playZone.install.verificationPending")}</p>
            ) : (
              <p>{t("playZone.security.noWarnings")}</p>
            )}
            {officialDownloadProgress && activeOfficialRequestId === officialDownloadProgress.requestId ? (
              <div className="play-zone-download-progress">
                <div>
                  <strong>{getOfficialDownloadProgressLabel(officialDownloadProgress.state, t)}</strong>
                  <span>{formatOfficialDownloadProgress(officialDownloadProgress, i18n.resolvedLanguage)}</span>
                </div>
                <progress
                  aria-label={t("playZone.install.progress")}
                  max={officialDownloadProgress.totalBytes || 1}
                  value={Math.min(officialDownloadProgress.receivedBytes, officialDownloadProgress.totalBytes || 1)}
                />
              </div>
            ) : null}
          </div>
          <div aria-busy={isInstalling} aria-live="polite" className="play-zone-install-actions">
            <button
              className="button secondary"
              type="button"
              disabled={isInstalling && !activeOfficialRequestId}
              onClick={() => void cancelPendingInstall()}
            >
              {isInstalling && activeOfficialRequestId
                ? t("playZone.install.cancelDownload")
                : t("common.cancel")}
            </button>
            <button
              className="button primary"
              type="button"
              disabled={
                isInstalling ||
                (!pendingInstall.entry.officialDownload &&
                  pendingInstall.entry.status !== "ready" &&
                  pendingInstall.entry.status !== "trusted_official")
              }
              onClick={() => void confirmPendingInstall()}
            >
              {isInstalling
                ? getOfficialDownloadProgressLabel(officialDownloadProgress?.state ?? "installing", t)
                : pendingInstall.replacing
                  ? t("playZone.install.confirmUpdate")
                  : pendingInstall.entry.officialDownload
                    ? t("playZone.install.confirmDownload")
                    : t("playZone.install.confirm")}
            </button>
          </div>
        </Dialog>
      ) : null}
      {isHelpOpen ? (
        <Dialog
          ariaLabelledBy="play-zone-help-title"
          backdropClassName="play-zone-help-overlay"
          className="play-zone-help-dialog"
          data-qa="play-zone-help-dialog"
          onClose={() => setIsHelpOpen(false)}
        >
          <div className="play-zone-help-header">
            <div>
              <span className="play-zone-kicker">{t("playZone.help.kicker")}</span>
              <h2 id="play-zone-help-title">{t("playZone.help.title")}</h2>
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label={t("playZone.help.close")}
              title={t("playZone.help.close")}
              onClick={() => setIsHelpOpen(false)}
            >
              <X aria-hidden="true" size={17} />
            </button>
          </div>

          <div className="play-zone-help-body">
            <section className="play-zone-help-section">
              <h3>{t("playZone.help.delegateTitle")}</h3>
              <ol>
                <li>{t("playZone.help.delegateSteps.one")}</li>
                <li>{t("playZone.help.delegateSteps.two")}</li>
                <li>{t("playZone.help.delegateSteps.three")}</li>
                <li>{t("playZone.help.delegateSteps.four")}</li>
                <li>{t("playZone.help.delegateSteps.five")}</li>
                <li>{t("playZone.help.delegateSteps.six")}</li>
              </ol>
              <button
                className="button primary"
                type="button"
                onClick={() => void downloadGameDeveloperAgentGuide()}
              >
                <Download aria-hidden="true" size={16} />
                {t("playZone.help.downloadKit")}
              </button>
            </section>

            <section className="play-zone-help-section">
              <h3>{t("playZone.help.kitRulesTitle")}</h3>
              <ul>
                <li>{t("playZone.help.kitRules.one")}</li>
                <li>{t("playZone.help.kitRules.two")}</li>
                <li>{t("playZone.help.kitRules.three")}</li>
                <li>{t("playZone.help.kitRules.four")}</li>
                <li>{t("playZone.help.kitRules.five")}</li>
              </ul>
            </section>

            <section className="play-zone-help-section">
              <h3>{t("playZone.help.noticeTitle")}</h3>
              <ul>
                <li>{t("playZone.help.notices.one")}</li>
                <li>{t("playZone.help.notices.two")}</li>
                <li>{t("playZone.help.notices.three")}</li>
                <li>{t("playZone.help.notices.four")}</li>
                <li>{t("playZone.help.notices.five")}</li>
              </ul>
            </section>
          </div>
        </Dialog>
      ) : null}
    </section>
  );
}

function createPlayZoneRuntimeUrl(input: {
  runtimeId: PlayZoneRuntimeId;
  cartridgeId: string;
  title: string;
  entryUrl: string;
  walletBalance: number;
  diamondActions: NonNullable<PlayZoneLibraryEntry["diamondActions"]>;
}) {
  const runtimeUrl = new URL(window.location.href);
  runtimeUrl.hash = "";
  runtimeUrl.search = "";
  runtimeUrl.searchParams.set("playZoneRuntime", input.runtimeId);
  runtimeUrl.searchParams.set("cartridgeId", input.cartridgeId);
  runtimeUrl.searchParams.set("title", input.title);
  runtimeUrl.searchParams.set("entryUrl", input.entryUrl);
  runtimeUrl.searchParams.set("diamondActions", JSON.stringify(input.diamondActions));
  runtimeUrl.searchParams.set(
    "walletBalance",
    String(Math.max(0, Math.floor(input.walletBalance)))
  );
  return runtimeUrl.toString();
}

function getCategoryCount(category: PlayZoneCategory, items: PlayZoneItem[]) {
  if (category === "all") {
    return items.length;
  }
  if (category === "installed") {
    return items.filter((item) => item.installed).length;
  }
  if (category === "featured") {
    return items.filter((item) => item.status === "featured").length;
  }
  return items.filter((item) => item.category === category).length;
}

function matchesPlayZoneQuery(item: PlayZoneItem, query: string, t: TFunction) {
  if (!query) {
    return true;
  }
  return [item.title, item.creator, item.category, getCategoryLabel(item.category, t), item.summary, ...item.tags]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function getCategoryLabel(category: PlayZoneCategory, t: TFunction) {
  switch (category) {
    case "all":
      return t("playZone.categories.all");
    case "installed":
      return t("playZone.categories.installed");
    case "featured":
      return t("playZone.categories.featured");
    case "learning":
      return t("playZone.categories.learning");
    case "action":
      return t("playZone.categories.action");
    default:
      return t("playZone.categories.story");
  }
}

function getStatusLabel(status: PlayZoneStatus, t: TFunction) {
  if (status === "installed") {
    return t("playZone.status.installed");
  }
  if (status === "local") {
    return t("playZone.status.local");
  }
  if (status === "available") {
    return t("playZone.status.downloadAvailable");
  }
  if (status === "trusted") {
    return t("playZone.status.trusted");
  }
  if (status === "blocked") {
    return t("playZone.status.blocked");
  }
  if (status === "update") {
    return t("playZone.status.update");
  }
  return t("playZone.status.featured");
}

function isExecutablePlayZoneItem(item: PlayZoneItem) {
  if (!item.installed && item.officialDownload) return true;
  return (
    Boolean(item.entryUrl && item.runtimeId) &&
    (item.libraryStatus === "ready" || item.libraryStatus === "trusted_official")
  );
}

function getLibraryStatusLabel(status: PlayZoneLibraryEntry["status"], t: TFunction) {
  switch (status) {
    case "trusted_official":
      return t("playZone.status.trustedOfficial");
    case "ready":
      return t("playZone.status.ready");
    case "warning":
      return t("playZone.status.warning");
    case "quarantined":
      return t("playZone.status.quarantined");
    default:
      return t("playZone.status.blockedRuntime");
  }
}

function getPlayZonePermissionLabel(permission: string, t: TFunction) {
  switch (permission) {
    case "walletSpend":
      return t("playZone.security.permissionLabels.walletSpend");
    case "storage":
      return t("playZone.security.permissionLabels.storage");
    case "network":
      return t("playZone.security.permissionLabels.network");
    case "externalLinks":
      return t("playZone.security.permissionLabels.externalLinks");
    case "cardRead":
      return t("playZone.security.permissionLabels.cardRead");
    default:
      return permission;
  }
}

function formatPlayZoneHash(value: string | undefined, t: TFunction) {
  if (!value) return t("playZone.security.unknown");
  return value.length > 24 ? `${value.slice(0, 12)}…${value.slice(-12)}` : value;
}

function getPlayZoneSecurityIssueMessage(code: string, t: TFunction) {
  switch (code) {
    case "manifest_missing":
      return t("playZone.security.issues.manifestMissing");
    case "manifest_ambiguous":
      return t("playZone.security.issues.manifestAmbiguous");
    case "manifest_invalid":
      return t("playZone.security.issues.manifestInvalid");
    case "content_type_unsupported":
      return t("playZone.security.issues.contentTypeUnsupported");
    case "id_invalid":
      return t("playZone.security.issues.idInvalid");
    case "lineage_id_invalid":
      return t("playZone.security.issues.lineageIdInvalid");
    case "app_version_too_old":
      return t("playZone.security.issues.appVersionTooOld");
    case "creator_missing":
      return t("playZone.security.issues.creatorMissing");
    case "license_invalid":
      return t("playZone.security.issues.licenseInvalid");
    case "source_url_invalid":
      return t("playZone.security.issues.sourceUrlInvalid");
    case "entry_missing":
      return t("playZone.security.issues.entryMissing");
    case "thumbnail_missing":
      return t("playZone.security.issues.thumbnailMissing");
    case "file_too_large":
      return t("playZone.security.issues.fileTooLarge");
    case "pack_too_large":
      return t("playZone.security.issues.packTooLarge");
    case "integrity_missing":
      return t("playZone.security.issues.integrityMissing");
    case "integrity_too_many_files":
    case "integrity_path_invalid":
    case "integrity_path_duplicate":
    case "integrity_hash_invalid":
    case "integrity_file_missing":
    case "integrity_mismatch":
    case "integrity_file_unlisted":
      return t("playZone.security.issues.integrityInvalid");
    case "symlink_forbidden":
      return t("playZone.security.issues.symlinkForbidden");
    case "file_path_invalid":
    case "file_path_collision":
      return t("playZone.security.issues.filePathInvalid");
    case "too_many_files":
      return t("playZone.security.issues.tooManyFiles");
    case "schema_version_missing":
    case "schema_version_unsupported":
      return t("playZone.security.issues.schemaVersionInvalid");
    case "entry_invalid":
    case "entry_type_invalid":
    case "entry_path_invalid":
      return t("playZone.security.issues.entryInvalid");
    case "thumbnail_path_invalid":
      return t("playZone.security.issues.thumbnailInvalid");
    case "permissions_missing":
      return t("playZone.security.issues.permissionsMissing");
    case "diamond_actions_invalid":
      return t("playZone.security.issues.diamondActionsInvalid");
    case "wallet_permission_missing":
      return t("playZone.security.issues.walletPermissionMissing");
    case "diamond_action_invalid":
      return t("playZone.security.issues.diamondActionInvalid");
    case "archive_quarantined":
      return t("playZone.security.issues.archiveQuarantined");
    case "snapshot_integrity_failed":
      return t("playZone.security.issues.snapshotIntegrityFailed");
    default:
      if (code.startsWith("permission_") && code.endsWith("_missing")) {
        return t("playZone.security.issues.permissionMissing", {
          permission: code.slice("permission_".length, -"_missing".length)
        });
      }
      if (code.startsWith("permission_") && code.endsWith("_unsupported")) {
        return t("playZone.security.issues.permissionUnsupported", {
          permission: code.slice("permission_".length, -"_unsupported".length)
        });
      }
      if (code.endsWith("_missing") || code.endsWith("_invalid")) {
        return t("playZone.security.issues.semanticVersionInvalid");
      }
      return t("playZone.security.issues.generic", { code });
  }
}

function getPlayZoneFileName(value: string, t: TFunction) {
  return value.split(/[\\/]/).pop() || t("playZone.localItem.fallbackName");
}

function getSecondaryActionLabel(item: PlayZoneItem, t: TFunction) {
  if (item.officialUpdateAvailable) return t("playZone.secondaryAction.update");
  if (!item.installed && item.officialDownload) return t("playZone.secondaryAction.download");
  return item.installed
    ? t("playZone.secondaryAction.update")
    : t("playZone.secondaryAction.install");
}

function getPlayZoneBridgeUnavailableMessage(actionLabel: string, t: TFunction) {
  if (typeof window !== "undefined" && window.localEnglishMiner) {
    return t("playZone.messages.bridgeRestart", { action: actionLabel });
  }
  return t("playZone.messages.desktopOnly", { action: actionLabel });
}

function getOfficialInstallFailureMessage(caught: unknown, t: TFunction) {
  const message = String(caught ?? "");
  if (message.includes("HTTP 404")) {
    return t("playZone.messages.downloadNotPublished");
  }
  if (message.includes("PLAY_ZONE_DOWNLOAD_NO_PROGRESS_TIMEOUT")) {
    return t("playZone.messages.downloadNoProgress");
  }
  if (message.includes("PLAY_ZONE_DOWNLOAD_OVERALL_TIMEOUT")) {
    return t("playZone.messages.downloadTimedOut");
  }
  return t("playZone.messages.installFailed");
}

function mapLibraryEntryToPlayZoneItem(entry: PlayZoneLibraryEntry, t: TFunction): PlayZoneItem {
  return {
    id: createPlayZoneItemIdFromLibraryEntry(entry),
    title: entry.title,
    creator: entry.creator,
    version: entry.version,
    lineageId: entry.lineageId,
    minPlayZoneVersion: entry.minPlayZoneVersion,
    saveSchemaVersion: entry.saveSchemaVersion,
    releaseNotes: entry.releaseNotes,
    category: normalizePlayZoneCategory(entry.category),
    status:
      !entry.installed && entry.officialDownload
        ? "available"
        : entry.status === "trusted_official"
        ? "trusted"
        : entry.installed
          ? "installed"
        : entry.status === "ready"
          ? "local"
          : "blocked",
    summary: entry.summary || t("playZone.localItem.summary"),
    tags: [
      ...(Array.isArray(entry.tags) ? entry.tags : []),
      entry.sourceType === "folder" ? t("playZone.localItem.folder") : t("playZone.localItem.lemFile")
    ].slice(0, 7),
    playTime: t("playZone.localItem.zeroMinutes"),
    lastPlayed:
      entry.status === "ready" || entry.status === "trusted_official"
        ? t("playZone.localItem.justDetected")
        : t("playZone.localItem.waiting"),
    progress: 0,
    rating: entry.status === "ready" || entry.status === "trusted_official" ? 4.0 : 0,
    coverClassName: getLocalPlayZoneCoverClassName(entry.id),
    thumbnailUrl: entry.thumbnailUrl,
    cartridgeId: entry.id,
    entryUrl: entry.entryUrl,
    runtimeId: entry.entryUrl ? "cartridge" : undefined,
    sourceType: entry.sourceType,
    sourcePath: entry.sourcePath,
    installationId: entry.installationId,
    installed: entry.installed === true,
    bundled: entry.bundled === true,
    libraryStatus: entry.status,
    diamondActions: entry.diamondActions,
    officialDownload: entry.officialDownload,
    officialUpdateAvailable: entry.officialUpdateAvailable,
    securityReport: entry.securityReport,
    libraryEntry: entry
  };
}

function createPlayZoneOfficialRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `official-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatPlayZoneByteSize(bytes: number, locale?: string) {
  const safeBytes = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  const units = ["B", "KB", "MB", "GB"];
  let value = safeBytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: unitIndex > 1 ? 1 : 0 }).format(value)} ${units[unitIndex]}`;
}

function getOfficialDownloadProgressLabel(
  state: PlayZoneOfficialDownloadProgress["state"],
  t: TFunction
) {
  switch (state) {
    case "downloading":
      return t("playZone.install.downloading");
    case "verifying":
      return t("playZone.install.verifying");
    case "installing":
      return t("playZone.install.installingOfficial");
    case "complete":
      return t("playZone.install.complete");
    case "cancelled":
      return t("playZone.install.cancelled");
    default:
      return t("playZone.install.installing");
  }
}

function formatOfficialDownloadProgress(progress: PlayZoneOfficialDownloadProgress, locale?: string) {
  if (!progress.totalBytes) return formatPlayZoneByteSize(progress.receivedBytes, locale);
  const percent = Math.min(100, Math.round((progress.receivedBytes / progress.totalBytes) * 100));
  return `${formatPlayZoneByteSize(progress.receivedBytes, locale)} / ${formatPlayZoneByteSize(progress.totalBytes, locale)} (${percent}%)`;
}

function mergePlayZoneLibraryEntries(
  ...entryLists: PlayZoneLibraryEntry[][]
): PlayZoneLibraryEntry[] {
  const entries = new Map<string, PlayZoneLibraryEntry>();
  for (const entry of entryLists.flat()) {
    entries.set(entry.sourcePath.toLowerCase(), entry);
  }
  return Array.from(entries.values());
}

function createPlayZoneItemIdFromLibraryEntry(entry: PlayZoneLibraryEntry) {
  return `library-${entry.id}-${hashPlayZoneSourcePath(entry.sourcePath)}`;
}

function isSamePlayZoneSourcePath(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

function isSupersededPlayZoneSourcePath(sourcePath: string, supersededSourcePaths: string[]) {
  return supersededSourcePaths.some((candidate) => isSamePlayZoneSourcePath(candidate, sourcePath));
}

function hashPlayZoneSourcePath(sourcePath: string) {
  let hash = 0;
  for (let index = 0; index < sourcePath.length; index += 1) {
    hash = (hash * 31 + sourcePath.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function getPlayZoneUpdateWarnings(
  currentItem: PlayZoneItem,
  pickedEntry: PlayZoneLibraryEntry,
  t: TFunction
) {
  const warnings: string[] = [];
  if (currentItem.lineageId && pickedEntry.lineageId && currentItem.lineageId !== pickedEntry.lineageId) {
    warnings.push(t("playZone.update.lineageMismatch"));
  }
  if (!currentItem.lineageId || !pickedEntry.lineageId) {
    warnings.push(t("playZone.update.lineageMissing"));
  }
  if (currentItem.cartridgeId && pickedEntry.id && currentItem.cartridgeId !== pickedEntry.id) {
    warnings.push(t("playZone.update.manifestMismatch", {
      current: currentItem.cartridgeId,
      next: pickedEntry.id
    }));
  }
  const versionCompare = comparePlayZoneVersions(pickedEntry.version, currentItem.version);
  if (pickedEntry.version && currentItem.version && versionCompare <= 0) {
    warnings.push(t("playZone.update.versionNotHigher", {
      current: currentItem.version,
      next: pickedEntry.version
    }));
  }
  if (
    pickedEntry.minPlayZoneVersion &&
    comparePlayZoneVersions(pickedEntry.minPlayZoneVersion, PLAY_ZONE_CURRENT_APP_VERSION) > 0
  ) {
    warnings.push(t("playZone.update.appVersionRequired", {
      required: pickedEntry.minPlayZoneVersion,
      current: PLAY_ZONE_CURRENT_APP_VERSION
    }));
  }
  if (
    currentItem.saveSchemaVersion &&
    pickedEntry.saveSchemaVersion &&
    currentItem.saveSchemaVersion !== pickedEntry.saveSchemaVersion
  ) {
    warnings.push(t("playZone.update.saveSchemaChanged", {
      current: currentItem.saveSchemaVersion,
      next: pickedEntry.saveSchemaVersion
    }));
  }
  return warnings;
}

function comparePlayZoneVersions(left?: string, right?: string) {
  if (!left || !right) {
    return 0;
  }
  const leftParts = left.split(/[.-]/).map((part) => Number.parseInt(part, 10));
  const rightParts = right.split(/[.-]/).map((part) => Number.parseInt(part, 10));
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const leftValue = Number.isFinite(leftParts[index]) ? leftParts[index] : 0;
    const rightValue = Number.isFinite(rightParts[index]) ? rightParts[index] : 0;
    if (leftValue !== rightValue) {
      return leftValue > rightValue ? 1 : -1;
    }
  }
  return left.localeCompare(right);
}

function formatPlayZoneVersionChange(
  currentVersion: string | undefined,
  nextVersion: string | undefined,
  t: TFunction
) {
  if (!currentVersion && !nextVersion) {
    return "";
  }
  return ` (${currentVersion || t("playZone.update.noVersion")} -> ${nextVersion || t("playZone.update.noVersion")})`;
}

function formatPlayZoneBackupMessage(backedUp: boolean | undefined, t: TFunction) {
  if (backedUp === true) {
    return t("playZone.update.backupCreated");
  }
  if (backedUp === false) {
    return t("playZone.update.backupSkipped");
  }
  return "";
}

function normalizePlayZoneCategory(
  value: string | undefined
): Exclude<PlayZoneCategory, "all" | "installed" | "featured"> {
  const normalized = value?.toLowerCase() ?? "";
  if (/action|arcade|battle|combat|\uC561\uC158/.test(normalized)) {
    return "action";
  }
  if (/study|learn|word|phrase|language|\uAD50\uC721|\uD559\uC2B5/.test(normalized)) {
    return "learning";
  }
  return "story";
}

function getLocalPlayZoneCoverClassName(id: string) {
  const covers = ["cover-local-a", "cover-local-b", "cover-local-c", "cover-local-d"];
  const sum = Array.from(id).reduce((total, character) => total + character.charCodeAt(0), 0);
  return covers[sum % covers.length];
}

function getPlayZoneCoverClassName(item: PlayZoneItem, baseClassName = "") {
  return [baseClassName, item.coverClassName, item.thumbnailUrl ? "cover-image" : ""]
    .filter(Boolean)
    .join(" ");
}

function getPlayZoneCoverStyle(item: PlayZoneItem): CSSProperties | undefined {
  if (!item.thumbnailUrl) {
    return undefined;
  }
  const thumbnailUrl = item.thumbnailUrl.replace(/["\\\r\n]/g, "");
  return {
    backgroundImage:
      `linear-gradient(180deg, rgb(5 8 20 / 12%) 0%, rgb(5 8 20 / 22%) 44%, rgb(5 8 20 / 82%) 100%), url("${thumbnailUrl}")`
  };
}

function readPlayZoneLocalLibraryState(): PlayZoneLocalLibraryState {
  if (typeof localStorage === "undefined") {
    return { libraryFolderPath: "", importedEntries: [], supersededSourcePaths: [] };
  }
  try {
    const current = localStorage.getItem(PLAY_ZONE_LOCAL_LIBRARY_KEY);
    const legacy = localStorage.getItem(LEGACY_PLAY_ZONE_LOCAL_LIBRARY_KEY);
    const parsed = JSON.parse(current ?? legacy ?? "{}") as Partial<PlayZoneLocalLibraryState>;
    if (legacy) localStorage.removeItem(LEGACY_PLAY_ZONE_LOCAL_LIBRARY_KEY);
    return {
      libraryFolderPath: typeof parsed.libraryFolderPath === "string" ? parsed.libraryFolderPath : "",
      // Installed packs are authoritative in the Electron snapshot store. Never
      // persist scanned or picked source paths as if they were installed.
      importedEntries: [],
      supersededSourcePaths: Array.isArray(parsed.supersededSourcePaths)
        ? parsed.supersededSourcePaths.filter((sourcePath): sourcePath is string => typeof sourcePath === "string")
        : []
    };
  } catch {
    return { libraryFolderPath: "", importedEntries: [], supersededSourcePaths: [] };
  }
}

function writePlayZoneLocalLibraryState(state: PlayZoneLocalLibraryState) {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(PLAY_ZONE_LOCAL_LIBRARY_KEY, JSON.stringify({
    libraryFolderPath: state.libraryFolderPath,
    importedEntries: [],
    supersededSourcePaths: state.supersededSourcePaths ?? []
  } satisfies PlayZoneLocalLibraryState));
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function createGameDeveloperAgentGuideMarkdown(t: TFunction) {
  const sections = gameDeveloperAgentGuideDocs.map(
    (doc) => `## ${doc.title}\n\n${t("playZone.security.source")}: \`${doc.source}\`\n\n${doc.content.trim()}`
  );
  const delegateSteps = [
    t("playZone.help.delegateSteps.one"),
    t("playZone.help.delegateSteps.two"),
    t("playZone.help.delegateSteps.three"),
    t("playZone.help.delegateSteps.four"),
    t("playZone.help.delegateSteps.five"),
    t("playZone.help.delegateSteps.six")
  ].map((step, index) => `${index + 1}. ${step}`);
  const kitRules = [
    t("playZone.help.kitRules.one"),
    t("playZone.help.kitRules.two"),
    t("playZone.help.kitRules.three"),
    t("playZone.help.kitRules.four"),
    t("playZone.help.kitRules.five")
  ].map((rule) => `- ${rule}`);
  const notices = [
    t("playZone.help.notices.one"),
    t("playZone.help.notices.two"),
    t("playZone.help.notices.three"),
    t("playZone.help.notices.four"),
    t("playZone.help.notices.five")
  ].map((notice) => `- ${notice}`);

  return [
    "# Language Miner Game Developer Agent Guide",
    "",
    t("playZone.import.authorKitDescription"),
    "",
    `## ${t("playZone.help.delegateTitle")}`,
    "",
    ...delegateSteps,
    "",
    `## ${t("playZone.help.kitRulesTitle")}`,
    "",
    ...kitRules,
    "",
    `## ${t("playZone.help.noticeTitle")}`,
    "",
    ...notices,
    "",
    ...sections
  ].join("\n");
}
