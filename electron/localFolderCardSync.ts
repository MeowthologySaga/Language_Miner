import { app, dialog } from "electron";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  CARD_SYNC_FILE_NAME,
  createCardSyncSnapshot,
  mergeCardsForSync,
  parseCardSyncSnapshot
} from "../src/shared/cardSync";
import type {
  CardSyncResult,
  CardSyncSettings,
  CardSyncStatus,
  StudyCard
} from "../src/shared/types";
import {
  electronText,
  formatElectronNumber,
  formatElectronText,
  type ElectronAppLocale
} from "./appDialogLocalization";

const CARD_SYNC_STATE_DIR = "card-sync-state";

export async function getLocalFolderCardSyncStatus(
  settings: CardSyncSettings,
  locale: ElectronAppLocale = "ko"
): Promise<CardSyncStatus> {
  const folderPath = normalizeFolderPath(settings.folderPath);
  if (!folderPath) {
    return {
      configured: false,
      connected: false,
      folderPath,
      message: electronText(locale, "cardSyncNotConfigured")
    };
  }

  if (!isDirectory(folderPath)) {
    return {
      configured: true,
      connected: false,
      folderPath,
      message: formatElectronText(locale, "cardSyncFolderMissing", {
        folderName: getSafeFolderName(folderPath, locale)
      })
    };
  }

  const file = getCardSyncFileInfo(folderPath);
  return {
    configured: true,
    connected: true,
    folderPath,
    remoteFileName: file.exists ? CARD_SYNC_FILE_NAME : undefined,
    remoteModifiedAt: file.modifiedAt,
    message: electronText(
      locale,
      file.exists ? "cardSyncRemoteFound" : "cardSyncFolderReady"
    )
  };
}

export async function pickLocalCardSyncFolder(
  settings: CardSyncSettings,
  locale: ElectronAppLocale = "ko",
  runManagedWrite: <T>(operation: () => T | Promise<T>) => Promise<T> = async (operation) =>
    operation()
): Promise<CardSyncStatus> {
  const currentFolderPath = normalizeFolderPath(settings.folderPath);
  const result = await dialog.showOpenDialog({
    title: electronText(locale, "cardSyncFolderTitle"),
    defaultPath: currentFolderPath || undefined,
    properties: ["openDirectory", "createDirectory"]
  });
  const folderPath = result.filePaths[0];
  if (result.canceled || !folderPath) {
    return getLocalFolderCardSyncStatus(settings, locale);
  }

  return runManagedWrite(() => {
    ensureDirectory(folderPath, locale);
    return getLocalFolderCardSyncStatus({ folderPath }, locale);
  });
}

export async function disconnectLocalCardSyncFolder(
  locale: ElectronAppLocale = "ko"
): Promise<CardSyncStatus> {
  return {
    configured: false,
    connected: false,
    folderPath: "",
    message: electronText(locale, "cardSyncDisconnected")
  };
}

export async function uploadCardsToLocalFolder(
  settings: CardSyncSettings,
  cards: StudyCard[],
  profileId = "default",
  locale: ElectronAppLocale = "ko"
): Promise<CardSyncResult> {
  const folderPath = requireSyncFolder(settings, locale);
  const snapshot = createCardSyncSnapshot(cards);
  writeSnapshot(folderPath, snapshot, locale);
  writeLastSyncSnapshot(folderPath, profileId, snapshot, locale);
  const file = getCardSyncFileInfo(folderPath);

  return {
    mode: "upload",
    localCardCount: cards.length,
    remoteCardCount: 0,
    mergedCardCount: cards.length,
    uploadedCardCount: cards.length,
    downloadedCardCount: 0,
    skippedCardCount: 0,
    conflictCount: 0,
    remoteModifiedAt: file.modifiedAt,
    message:
      cards.length === 1
        ? electronText(locale, "cardSyncUploadedOne")
        : formatElectronText(locale, "cardSyncUploaded", {
            count: formatElectronNumber(locale, cards.length)
          })
  };
}

export async function downloadCardsFromLocalFolder(
  settings: CardSyncSettings,
  localCards: StudyCard[],
  importCards: (cards: StudyCard[]) => StudyCard[],
  profileId = "default",
  locale: ElectronAppLocale = "ko"
): Promise<CardSyncResult> {
  const folderPath = requireSyncFolder(settings, locale);
  const remote = readRemoteSnapshot(folderPath, locale);
  const merged = mergeCardsForSync(localCards, remote.snapshot.cards);
  importCards(merged.cards);
  writeLastSyncSnapshot(folderPath, profileId, remote.snapshot, locale);

  return {
    mode: "download",
    localCardCount: localCards.length,
    remoteCardCount: remote.snapshot.cards.length,
    mergedCardCount: merged.cards.length,
    uploadedCardCount: 0,
    downloadedCardCount: merged.downloadedCardCount,
    skippedCardCount: merged.skippedCardCount,
    conflictCount: merged.conflictCount,
    remoteModifiedAt: remote.modifiedAt,
    message:
      merged.downloadedCardCount === 1
        ? electronText(locale, "cardSyncDownloadedOne")
        : formatElectronText(locale, "cardSyncDownloaded", {
            count: formatElectronNumber(locale, merged.downloadedCardCount)
          })
  };
}

export async function syncCardsWithLocalFolder(
  settings: CardSyncSettings,
  localCards: StudyCard[],
  importCards: (cards: StudyCard[]) => StudyCard[],
  profileId = "default",
  locale: ElectronAppLocale = "ko"
): Promise<CardSyncResult> {
  return syncCardsWithLocalFolderNow(settings, localCards, importCards, profileId, locale);
}

export function syncCardsWithLocalFolderNow(
  settings: CardSyncSettings,
  localCards: StudyCard[],
  importCards: (cards: StudyCard[]) => StudyCard[],
  profileId = "default",
  locale: ElectronAppLocale = "ko"
): CardSyncResult {
  const folderPath = requireSyncFolder(settings, locale);
  const remote = readRemoteSnapshotIfExists(folderPath, locale);
  const remoteCards = remote?.snapshot.cards ?? [];
  const baseSnapshot = readLastSyncSnapshot(folderPath, profileId);
  const merged = mergeCardsForSync(localCards, remoteCards, {
    baseCards: baseSnapshot?.cards
  });
  importCards(merged.cards);
  const snapshot = createCardSyncSnapshot(merged.cards);
  writeSnapshot(folderPath, snapshot, locale);
  writeLastSyncSnapshot(folderPath, profileId, snapshot, locale);
  const file = getCardSyncFileInfo(folderPath);

  return {
    mode: "sync",
    localCardCount: localCards.length,
    remoteCardCount: remoteCards.length,
    mergedCardCount: merged.cards.length,
    uploadedCardCount: merged.uploadedCardCount,
    downloadedCardCount: merged.downloadedCardCount,
    skippedCardCount: merged.skippedCardCount,
    conflictCount: merged.conflictCount,
    remoteModifiedAt: file.modifiedAt,
    message: [
      formatElectronText(locale, "cardSyncCompleted", {
        uploaded: formatElectronNumber(locale, merged.uploadedCardCount),
        downloaded: formatElectronNumber(locale, merged.downloadedCardCount)
      }),
      merged.conflictCount > 0
        ? merged.conflictCount === 1
          ? electronText(locale, "cardSyncConflictCopyOne")
          : formatElectronText(locale, "cardSyncConflictCopies", {
              count: formatElectronNumber(locale, merged.conflictCount)
            })
        : ""
    ]
      .filter(Boolean)
      .join(" · ")
  };
}

function requireSyncFolder(settings: CardSyncSettings, locale: ElectronAppLocale) {
  const folderPath = normalizeFolderPath(settings.folderPath);
  if (!folderPath) {
    throw new Error(electronText(locale, "cardSyncNotConfigured"));
  }
  ensureDirectory(folderPath, locale);
  return folderPath;
}

function normalizeFolderPath(folderPath: string) {
  return folderPath.trim();
}

function ensureDirectory(folderPath: string, locale: ElectronAppLocale) {
  try {
    fs.mkdirSync(folderPath, { recursive: true });
    if (isDirectory(folderPath)) return;
  } catch {
    // Report only the safe folder label below; Node filesystem errors can contain full paths.
  }
  throw new Error(
    formatElectronText(locale, "cardSyncFolderUnavailable", {
      folderName: getSafeFolderName(folderPath, locale)
    })
  );
}

function isDirectory(folderPath: string) {
  try {
    return fs.statSync(folderPath).isDirectory();
  } catch {
    return false;
  }
}

function getCardSyncFilePath(folderPath: string) {
  return path.join(folderPath, CARD_SYNC_FILE_NAME);
}

function getCardSyncFileInfo(folderPath: string) {
  const filePath = getCardSyncFilePath(folderPath);
  try {
    const stat = fs.statSync(filePath);
    return {
      exists: stat.isFile(),
      modifiedAt: stat.isFile() ? stat.mtime.toISOString() : undefined
    };
  } catch {
    return {
      exists: false,
      modifiedAt: undefined
    };
  }
}

function readRemoteSnapshot(folderPath: string, locale: ElectronAppLocale) {
  const remote = readRemoteSnapshotIfExists(folderPath, locale);
  if (!remote) {
    throw new Error(electronText(locale, "cardSyncRemoteMissing"));
  }
  return remote;
}

function readRemoteSnapshotIfExists(folderPath: string, locale: ElectronAppLocale) {
  const filePath = getCardSyncFilePath(folderPath);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const stat = fs.statSync(filePath);
    return {
      snapshot: parseCardSyncSnapshot(JSON.parse(raw)),
      modifiedAt: stat.mtime.toISOString()
    };
  } catch {
    throw new Error(electronText(locale, "cardSyncReadFailed"));
  }
}

function writeSnapshot(
  folderPath: string,
  snapshot: ReturnType<typeof createCardSyncSnapshot>,
  locale: ElectronAppLocale
) {
  ensureDirectory(folderPath, locale);
  const filePath = getCardSyncFilePath(folderPath);
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(snapshot, null, 2), "utf8");
    fs.renameSync(temporaryPath, filePath);
  } catch {
    try {
      fs.unlinkSync(temporaryPath);
    } catch {
      // Best-effort cleanup only; never include the temporary path in the user-facing error.
    }
    throw new Error(electronText(locale, "cardSyncWriteFailed"));
  }
}

function readLastSyncSnapshot(folderPath: string, profileId: string) {
  const filePath = getLastSyncSnapshotPath(folderPath, profileId);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return parseCardSyncSnapshot(JSON.parse(fs.readFileSync(filePath, "utf8")));
  } catch {
    return null;
  }
}

function writeLastSyncSnapshot(
  folderPath: string,
  profileId: string,
  snapshot: ReturnType<typeof createCardSyncSnapshot>,
  locale: ElectronAppLocale
) {
  const filePath = getLastSyncSnapshotPath(folderPath, profileId);
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), "utf8");
  } catch {
    throw new Error(electronText(locale, "cardSyncWriteFailed"));
  }
}

function getLastSyncSnapshotPath(folderPath: string, profileId: string) {
  const key = createHash("sha256")
    .update(`${profileId || "default"}\0${path.resolve(folderPath).toLowerCase()}`)
    .digest("hex");
  return path.join(app.getPath("userData"), CARD_SYNC_STATE_DIR, `${key}.json`);
}

function getSafeFolderName(folderPath: string, locale: ElectronAppLocale) {
  const folderName = path.basename(path.resolve(folderPath));
  return folderName || electronText(locale, "cardSyncFolderFallback");
}
