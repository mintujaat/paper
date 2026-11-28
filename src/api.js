const memCache = new Map();

export async function api(url, opts = {}, retries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const r = await fetch(url, {
        credentials: "same-origin",
        ...opts,
        headers: { "Content-Type": "application/json", ...(opts.headers || {}) }
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        if ([502, 503, 504].includes(r.status) && attempt < retries) {
          await new Promise(res => setTimeout(res, 300 * (attempt + 1)));
          continue;
        }
        const err = new Error(data.error || `Request failed (${r.status})`);
        err.data = data;
        err.status = r.status;
        throw err;
      }
      return data;
    } catch (e) {
      if (e?.name === "AbortError") throw e;
      lastErr = e;
      const isNetworkDrop =
        e?.name === "TypeError" ||
        /load failed|failed to fetch|network/i.test(String(e?.message || ""));
      if (isNetworkDrop && attempt < retries) {
        await new Promise(res => setTimeout(res, 300 * (attempt + 1)));
        continue;
      }
      if (isNetworkDrop) {
        throw new Error("Connection weak or interrupted. Please check your internet and try again.");
      }
      throw e;
    }
  }
  throw lastErr;
}

export async function apiCached(url, ttlMs = 30000) {
  const hit = memCache.get(url);
  if (hit && Date.now() - hit.ts < ttlMs) return hit.data;
  const data = await api(url);
  memCache.set(url, { ts: Date.now(), data });
  return data;
}

export function invalidateApiCache(prefix = "") {
  if (!prefix) {
    memCache.clear();
    return;
  }
  for (const key of memCache.keys()) {
    if (key.startsWith(prefix)) memCache.delete(key);
  }
}

export function getDeviceMeta() {
  let deviceId = "";
  let deviceFreeUsed = false;
  try {
    deviceId = localStorage.getItem("quiz_device_id") || "";
    if (!deviceId) {
      deviceId = crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      localStorage.setItem("quiz_device_id", deviceId);
    }
    deviceFreeUsed = localStorage.getItem("quiz_free_used") === "1";
  } catch {}
  const raw = [
    navigator.platform,
    navigator.language,
    `${screen.width}x${screen.height}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone
  ].join("|");
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return { deviceId, deviceFp: `qfp_${(h >>> 0).toString(16)}`, deviceFreeUsed };
}

export function markFreeUsed() {
  try {
    localStorage.setItem("quiz_free_used", "1");
  } catch {}
}
