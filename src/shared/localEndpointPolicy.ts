export function isLoopbackHttpUrl(value: string | undefined) {
  try {
    const url = new URL(value?.trim() ?? "");
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "[::1]" ||
      /^127(?:\.\d{1,3}){3}$/.test(hostname)
    );
  } catch {
    return false;
  }
}

export function isRemoteOllamaUrl(value: string | undefined) {
  return !isLoopbackHttpUrl(value);
}
