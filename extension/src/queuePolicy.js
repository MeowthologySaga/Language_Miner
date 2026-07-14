export function createPayloadQueueItem(payload, now = Date.now()) {
  return { queuedAt: now, payload };
}

export function compactPayloadQueue(
  values,
  {
    now = Date.now(),
    maxAgeMs,
    maxItems,
    maxItemBytes,
    maxBytes
  }
) {
  const normalized = (Array.isArray(values) ? values : [])
    .map((value) => normalizePayloadQueueItem(value, now))
    .filter((item) => {
      const age = now - item.queuedAt;
      const bytes = getSerializedBytes(item);
      return age >= 0 && age <= maxAgeMs && bytes > 0 && bytes <= maxItemBytes;
    })
    .slice(-maxItems);
  const selected = [];
  let totalBytes = 0;
  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    const item = normalized[index];
    const bytes = getSerializedBytes(item);
    if (totalBytes + bytes > maxBytes) continue;
    selected.push(item);
    totalBytes += bytes;
  }
  return selected.reverse();
}

export function compactPayloadQueueMap(queueMap, limits) {
  const compacted = Object.fromEntries(
    Object.entries(queueMap).map(([key, values]) => [key, compactPayloadQueue(values, limits)])
  );
  const allItems = Object.entries(compacted)
    .flatMap(([queueKey, values]) =>
      values.map((item, index) => ({ queueKey, index, item, bytes: getSerializedBytes(item) }))
    )
    .sort((left, right) => right.item.queuedAt - left.item.queuedAt);
  const retained = new Set();
  let totalBytes = 0;
  for (const entry of allItems) {
    if (totalBytes + entry.bytes > limits.maxTotalBytes) continue;
    retained.add(`${entry.queueKey}:${entry.index}`);
    totalBytes += entry.bytes;
  }
  for (const [queueKey, values] of Object.entries(compacted)) {
    compacted[queueKey] = values.filter((_item, index) => retained.has(`${queueKey}:${index}`));
  }
  return compacted;
}

export function summarizePayloadQueueMap(queueMap) {
  const queues = Object.fromEntries(
    Object.entries(queueMap).map(([key, values]) => {
      const items = Array.isArray(values) ? values : [];
      return [
        key,
        {
          count: items.length,
          bytes: items.reduce((total, item) => total + getSerializedBytes(item), 0),
          oldestQueuedAt: items.length
            ? Math.min(...items.map((item) => Number(item?.queuedAt) || Date.now()))
            : null
        }
      ];
    })
  );
  return {
    queues,
    totalCount: Object.values(queues).reduce((total, queue) => total + queue.count, 0),
    totalBytes: Object.values(queues).reduce((total, queue) => total + queue.bytes, 0)
  };
}

function normalizePayloadQueueItem(value, now) {
  if (
    value &&
    typeof value === "object" &&
    Object.prototype.hasOwnProperty.call(value, "payload")
  ) {
    return {
      queuedAt: Number.isFinite(Number(value.queuedAt)) ? Number(value.queuedAt) : now,
      payload: value.payload
    };
  }
  return { queuedAt: now, payload: value };
}

function getSerializedBytes(value) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return 0;
  }
}
