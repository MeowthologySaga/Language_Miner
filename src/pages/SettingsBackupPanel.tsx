import { DatabaseBackup, FileDown, FileUp, RotateCcw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  collectAppBackupRendererRollbackState,
  collectAppBackupRendererState,
  commitAppBackupRendererRestore
} from "../appBackupState";
import type { LocalEnglishMinerApi } from "../data/api";
import type { LearningProfileRecord } from "../shared/types";
import type {
  AppBackupPreview,
  AppBackupPreviewWarning,
  AppBackupRestoreMode
} from "../shared/appBackup";

type SettingsBackupPanelProps = {
  api: LocalEnglishMinerApi;
  className: string;
  profiles: LearningProfileRecord[];
};

const restoreModes: Array<{
  value: AppBackupRestoreMode;
  labelKey:
    | "settings.backup.modes.newProfile.label"
    | "settings.backup.modes.merge.label"
    | "settings.backup.modes.replace.label";
  descriptionKey:
    | "settings.backup.modes.newProfile.description"
    | "settings.backup.modes.merge.description"
    | "settings.backup.modes.replace.description";
}> = [
  {
    value: "new_profile",
    labelKey: "settings.backup.modes.newProfile.label",
    descriptionKey: "settings.backup.modes.newProfile.description"
  },
  {
    value: "merge",
    labelKey: "settings.backup.modes.merge.label",
    descriptionKey: "settings.backup.modes.merge.description"
  },
  {
    value: "replace",
    labelKey: "settings.backup.modes.replace.label",
    descriptionKey: "settings.backup.modes.replace.description"
  }
];

const warningTranslationKeys: Record<
  AppBackupPreviewWarning,
  | "settings.backup.warnings.secretsAndLocalFilesExcluded"
  | "settings.backup.warnings.replaceRemovesCurrentData"
  | "settings.backup.warnings.deviceGlobalDataPreserved"
> = {
  "secrets-and-local-files-excluded":
    "settings.backup.warnings.secretsAndLocalFilesExcluded",
  "replace-removes-current-data": "settings.backup.warnings.replaceRemovesCurrentData",
  "device-global-data-preserved": "settings.backup.warnings.deviceGlobalDataPreserved"
};

export function SettingsBackupPanel({ api, className, profiles }: SettingsBackupPanelProps) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<AppBackupPreview | null>(null);
  const [restoreMode, setRestoreMode] = useState<AppBackupRestoreMode>("new_profile");
  const [status, setStatus] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const backupApi = api.backups;
  const previewExpired = Boolean(preview && preview.expiresAt <= now);
  const previewMinutesRemaining = preview
    ? Math.max(0, Math.ceil((preview.expiresAt - now) / 60_000))
    : 0;
  const selectedEstimate = preview?.estimates[restoreMode];

  useEffect(() => {
    if (!preview) return undefined;
    setNow(Date.now());
    const intervalId = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(intervalId);
  }, [preview]);

  async function exportBackup() {
    if (!backupApi) return;
    setIsWorking(true);
    setStatus(t("settings.backup.status.preparing"));
    try {
      const result = await backupApi.export({
        renderer: collectAppBackupRendererState(localStorage),
        profileIds: profiles.map((profile) => profile.id)
      });
      setStatus(
        result.canceled
          ? t("settings.backup.status.exportCanceled")
          : t("settings.backup.status.exported", { fileName: getFileName(result.filePath) })
      );
    } catch {
      setStatus(t("settings.backup.status.exportFailed"));
    } finally {
      setIsWorking(false);
    }
  }

  async function previewImport() {
    if (!backupApi) return;
    setIsWorking(true);
    setStatus(t("settings.backup.status.inspecting"));
    try {
      const nextPreview = await backupApi.previewImport({
        renderer: collectAppBackupRendererState(localStorage),
        profileIds: profiles.map((profile) => profile.id)
      });
      setPreview(nextPreview);
      setStatus(
        nextPreview
          ? t("settings.backup.status.reviewContents")
          : t("settings.backup.status.importCanceled")
      );
    } catch {
      setPreview(null);
      setStatus(t("settings.backup.status.openFailed"));
    } finally {
      setIsWorking(false);
    }
  }

  async function restoreBackup() {
    if (!backupApi || !preview) return;
    if (preview.expiresAt <= Date.now()) {
      setNow(Date.now());
      setStatus(t("settings.backup.status.previewExpired"));
      return;
    }
    setIsWorking(true);
    setStatus(t("settings.backup.status.restoring"));
    try {
      const previousRenderer = collectAppBackupRendererRollbackState(localStorage);
      const result = await backupApi.restore({
        handleId: preview.handleId,
        mode: restoreMode,
        currentRenderer: collectAppBackupRendererState(localStorage),
        currentProfileIds: profiles.map((profile) => profile.id)
      });
      if (!result.restored) {
        setStatus(t("settings.backup.status.notRestored"));
        return;
      }
      await commitAppBackupRendererRestore({
        storage: localStorage,
        previousSnapshot: previousRenderer,
        incomingSnapshot: result.renderer,
        mode: restoreMode,
        profileIdMap: result.profileIdMap,
        rollbackHandle: result.rollbackHandle,
        rollbackMain: backupApi.rollbackRestore,
        finalizeMain: backupApi.finalizeRestore
      });
      setStatus(t("settings.backup.status.restored"));
      window.setTimeout(() => window.location.reload(), 350);
    } catch {
      setStatus(t("settings.backup.status.restoreFailed"));
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <section className={className}>
      <div className="panel-heading">
        <DatabaseBackup size={19} />
        <h2>{t("settings.backup.title")}</h2>
      </div>
      <p className="muted compact">
        {t("settings.backup.descriptionBeforeFormat")}{" "}
        <code>.lembackup</code> {t("settings.backup.descriptionAfterFormat")}
      </p>
      <div className="settings-backup-safety">
        <ShieldCheck size={18} />
        <span>
          <strong>{t("settings.backup.exclusionsTitle")}</strong>
          <small>{t("settings.backup.exclusionsDescription")}</small>
        </span>
      </div>
      <div className="settings-backup-actions">
        <button
          className="button primary"
          data-qa="settings-backup-export"
          disabled={!backupApi || isWorking}
          type="button"
          onClick={() => void exportBackup()}
        >
          <FileDown size={17} />
          {t("settings.backup.create")}
        </button>
        <button
          className="button secondary"
          data-qa="settings-backup-import"
          disabled={!backupApi || isWorking}
          type="button"
          onClick={() => void previewImport()}
        >
          <FileUp size={17} />
          {t("settings.backup.open")}
        </button>
      </div>
      {!backupApi ? (
        <p className="selection-warning">{t("settings.backup.desktopOnly")}</p>
      ) : null}
      {preview ? (
        <div className="settings-backup-preview" data-qa="settings-backup-preview">
          <div>
            <strong>
              {t("settings.backup.previewTitle", {
                date: preview.manifest.createdAt.slice(0, 10)
              })}
            </strong>
            <small>
              {t("settings.backup.previewCounts", {
                profiles: preview.manifest.profileIds.length,
                cards: preview.counts.cards,
                lifeLogs: preview.counts.life_logs,
                playZoneSaves: preview.playZoneSaveCount
              })}
            </small>
            <small className={previewExpired ? "selection-warning" : undefined}>
              {previewExpired
                ? t("settings.backup.previewExpired")
                : t("settings.backup.previewExpiresIn", { minutes: previewMinutesRemaining })}
            </small>
          </div>
          {preview.warnings.length ? (
            <ul className="settings-backup-warning-list" data-qa="settings-backup-warnings">
              {preview.warnings.map((warning) => (
                <li key={warning}>{t(warningTranslationKeys[warning])}</li>
              ))}
            </ul>
          ) : null}
          <div
            className="settings-backup-mode-grid"
            role="radiogroup"
            aria-label={t("settings.backup.restoreMode")}
          >
            {restoreModes.map((mode) => (
              <label key={mode.value} className={restoreMode === mode.value ? "active" : ""}>
                <input
                  checked={restoreMode === mode.value}
                  name="backup-restore-mode"
                  type="radio"
                  value={mode.value}
                  onChange={() => setRestoreMode(mode.value)}
                />
                <span>
                  <strong>{t(mode.labelKey)}</strong>
                  <small>{t(mode.descriptionKey)}</small>
                </span>
              </label>
            ))}
          </div>
          {selectedEstimate ? (
            <div className="settings-backup-estimate" data-qa="settings-backup-estimate">
              <strong>{t("settings.backup.estimate.title")}</strong>
              <dl>
                <div>
                  <dt>{t("settings.backup.estimate.profileConflicts")}</dt>
                  <dd>{selectedEstimate.profileConflicts}</dd>
                </div>
                <div>
                  <dt>{t("settings.backup.estimate.profilesAdded")}</dt>
                  <dd>{selectedEstimate.profilesAdded}</dd>
                </div>
                <div>
                  <dt>{t("settings.backup.estimate.itemsAdded")}</dt>
                  <dd>{selectedEstimate.itemsAdded}</dd>
                </div>
                <div>
                  <dt>{t("settings.backup.estimate.itemsOverwritten")}</dt>
                  <dd>{selectedEstimate.itemsOverwritten}</dd>
                </div>
                <div>
                  <dt>{t("settings.backup.estimate.itemsSkipped")}</dt>
                  <dd>{selectedEstimate.itemsSkipped}</dd>
                </div>
              </dl>
              <small>{t("settings.backup.estimate.disclaimer")}</small>
            </div>
          ) : null}
          <button
            className={restoreMode === "replace" ? "button danger-button" : "button primary"}
            data-qa="settings-backup-restore"
            disabled={isWorking || previewExpired}
            type="button"
            onClick={() => void restoreBackup()}
          >
            <RotateCcw size={17} />
            {t("settings.backup.restore")}
          </button>
        </div>
      ) : null}
      {status ? (
        <p aria-live="polite" className="status-text" role="status">
          {status}
        </p>
      ) : null}
    </section>
  );
}

function getFileName(filePath: string | undefined) {
  return filePath?.split(/[\\/]/).pop() || "Language Miner.lembackup";
}
