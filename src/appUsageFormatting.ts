type UsageLocale = "ko" | "en";

export function formatInteger(value: number, locale: UsageLocale = "ko") {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "ko-KR").format(
    Math.max(0, Math.floor(value))
  );
}

export function formatUsageCost(value: number, locale: UsageLocale = "ko") {
  const rounded = Math.max(0, Math.round(value));
  if (rounded === 0) {
    return "₩0";
  }
  const amount = rounded.toLocaleString(locale === "en" ? "en-US" : "ko-KR");
  return locale === "en" ? `about ₩${amount}` : `약 ₩${amount}`;
}

export function formatElectricityCost(value: number, locale: UsageLocale = "ko") {
  if (value > 0 && value < 1) {
    return locale === "en" ? "under ₩1" : "₩1 미만";
  }
  return formatUsageCost(value, locale);
}

export function formatLocalRuntime(minutes: number, locale: UsageLocale = "ko") {
  if (minutes <= 0) {
    return locale === "en" ? "0 min" : "0분";
  }
  if (minutes < 1) {
    return locale === "en" ? "under 1 min" : "1분 미만";
  }
  if (minutes < 60) {
    return locale === "en" ? `${Math.round(minutes)} min` : `${Math.round(minutes)}분`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  if (locale === "en") {
    return remainingMinutes > 0 ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`;
  }
  return remainingMinutes > 0 ? `${hours}시간 ${remainingMinutes}분` : `${hours}시간`;
}

export function formatUsageLimit(value: number, locale: UsageLocale = "ko") {
  const rounded = Math.max(0, Math.round(value));
  return rounded > 0
    ? `₩${rounded.toLocaleString(locale === "en" ? "en-US" : "ko-KR")}`
    : locale === "en"
      ? "no guard"
      : "가드 없음";
}

export function getUsageLimitChipClassName(percent: number) {
  if (percent >= 90) {
    return "sidebar-limit-chip danger";
  }
  if (percent >= 70) {
    return "sidebar-limit-chip warning";
  }
  return "sidebar-limit-chip";
}
