import { useTranslation } from "react-i18next";

export type DocumentNoticeValue = {
  summary: string;
  technicalDetail?: string;
};

type DocumentNoticeProps = {
  kind: "error" | "success";
  value: DocumentNoticeValue | null;
};

type TechnicalItem = {
  label: string;
  value: string;
};

export function DocumentNotice({ kind, value }: DocumentNoticeProps) {
  const { t } = useTranslation();
  if (!value) {
    return null;
  }

  return (
    <div
      aria-live={kind === "success" ? "polite" : "assertive"}
      className={`document-notice document-notice-${kind}`}
      role={kind === "error" ? "alert" : "status"}
    >
      <p>{value.summary}</p>
      {value.technicalDetail ? (
        <details className="document-technical-disclosure">
          <summary>{t("documents.technicalDetails")}</summary>
          <code>{value.technicalDetail}</code>
        </details>
      ) : null}
    </div>
  );
}

export function DocumentTechnicalDetails({ items }: { items: TechnicalItem[] }) {
  const { t } = useTranslation();
  const visibleItems = items.filter((item) => item.value.trim());
  if (!visibleItems.length) {
    return null;
  }

  return (
    <details className="document-technical-disclosure">
      <summary>{t("documents.technicalDetails")}</summary>
      <dl>
        {visibleItems.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>
              <code>{item.value}</code>
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
