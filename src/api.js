export async function api(url, opts = {}) {
  const r = await fetch(url, {
    credentials: "same-origin",
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) }
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error || `Request failed (${r.status})`);
    err.data = data;
    err.status = r.status;
    throw err;
  }
  return data;
}

export function getDeviceMeta() {
  let deviceId = "";
  let deviceFreeUsed = false;
  try {
    deviceId = localStorage.getItem("quiz_device_id") || "";
    if (!deviceId) {
      deviceId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      localStorage.setItem("quiz_device_id", deviceId);
    }
    deviceFreeUsed = localStorage.getItem("quiz_free_used") === "1";
  } catch {}
  const raw = [navigator.platform, navigator.language, `${screen.width}x${screen.height}`, Intl.DateTimeFormat().resolvedOptions().timeZone].join("|");
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) { h ^= raw.charCodeAt(i); h = Math.imul(h, 16777619); }
  return { deviceId, deviceFp: `qfp_${(h >>> 0).toString(16)}`, deviceFreeUsed };
}

export function markFreeUsed() {
  try { localStorage.setItem("quiz_free_used", "1"); } catch {}
}
