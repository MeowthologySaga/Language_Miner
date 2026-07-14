import { languagePresets } from "../shared/languages";
import type { AppSettings } from "../shared/types";
import { useTranslation } from "react-i18next";

type LanguageProfileEditorProps = {
  label: string;
  language: AppSettings["learningProfile"]["targetLanguage"];
  onChange: (language: AppSettings["learningProfile"]["targetLanguage"]) => void;
};

export function LanguageProfileEditor({
  label,
  language,
  onChange
}: LanguageProfileEditorProps) {
  const { i18n, t } = useTranslation();
  const useEnglishNames = (i18n.resolvedLanguage ?? i18n.language).startsWith("en");
  return (
    <div className="language-profile-editor">
      <strong>{label}</strong>
      <div className="language-preset-row">
        {languagePresets.map((preset) => (
          <button
            key={`${label}-${preset.code}`}
            className={
              language.code === preset.code
                ? "language-preset-button active"
                : "language-preset-button"
            }
            type="button"
            onClick={() => onChange(preset)}
          >
            {useEnglishNames ? preset.nameEn : preset.nameKo}
          </button>
        ))}
      </div>
      <div className="language-field-grid">
        <label className="field-label">
          {t("settings.profile.languageCode")}
          <input
            className="text-input"
            value={language.code}
            onChange={(event) => onChange({ ...language, code: event.target.value })}
          />
        </label>
        <label className="field-label">
          {t("settings.profile.koreanName")}
          <input
            className="text-input"
            value={language.nameKo}
            onChange={(event) => onChange({ ...language, nameKo: event.target.value })}
          />
        </label>
        <label className="field-label">
          {t("settings.profile.englishName")}
          <input
            className="text-input"
            value={language.nameEn}
            onChange={(event) => onChange({ ...language, nameEn: event.target.value })}
          />
        </label>
      </div>
    </div>
  );
}
