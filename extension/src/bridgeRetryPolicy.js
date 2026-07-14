export function shouldRepairBridgeAuthentication(status, body = {}) {
  if (status === 401) return true;
  if (status !== 403) return false;
  const message = String(body?.error || "").toLowerCase();
  return (
    body?.bridgeTokenRequired === true ||
    message.includes("not been paired") ||
    message.includes("pair again") ||
    message.includes("bridge token")
  );
}

export function shouldRetainQueuedBridgeItem(result) {
  return !result || result.ok !== true;
}
