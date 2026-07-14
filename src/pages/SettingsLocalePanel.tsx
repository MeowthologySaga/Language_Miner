import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { normalizeAppLocale, type AppLocale } from "../appLocale";
import { changeAppLocale } from "../i18n";

type SettingsLocalePanelProps = {
  className: string;
};

export function SettingsLocalePanel({ className }: SettingsLocalePanelProps) {
  const { i18n, t } = useTranslation();
  const activeLocale = normalizeAppLocale(i18n.resolvedLanguage ?? i18n.language) ?? "ko";

  function selectLocale(locale: AppLocale) {
    if (locale !== activeLocale) {
      void changeAppLocale(locale);
    }
  }

  return (
    <section className={className} data-qa="settings-app-locale">
      <div className="panel-heading">
        <Languages size={19} />
        <h2>{t("settings.locale.title")}</h2>
      </div>
      <p>{t("settings.locale.description")}</p>
      <div aria-label={t("settings.locale.title")} className="segmented-control" role="group">
        <button
          aria-pressed={activeLocale === "ko"}
          className={activeLocale === "ko" ? "active" : ""}
          type="button"
          onClick={() => selectLocale("ko")}
        >
          {t("settings.locale.korean")}
        </button>
        <button
          aria-pressed={activeLocale === "en"}
          className={activeLocale === "en" ? "active" : ""}
          type="button"
          onClick={() => selectLocale("en")}
        >
          {t("settings.locale.english")}
        </button>
      </div>
      <p className="muted compact">{t("settings.locale.osHint")}</p>
    </section>
  );
}
