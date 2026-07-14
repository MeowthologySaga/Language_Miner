export const GOOGLE_TRANSLATE_V2_ENDPOINT =
  "https://translation.googleapis.com/language/translate/v2";

export function buildGoogleTranslationRequest(
  apiKey: string,
  requestBody: Record<string, unknown>
): { url: string; init: RequestInit } {
  return {
    url: GOOGLE_TRANSLATE_V2_ENDPOINT,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify(requestBody)
    }
  };
}
