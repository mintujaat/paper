const CACHE_KEY = "yaadpage_swr_v1";

export function readSwrCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
  } catch {
    return null;
  }
}

export function writeSwrCache(payload) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), ...payload }));
  } catch {}
}

export function getInitials(name = "S") {
  return (
    String(name)
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(s => s[0]?.toUpperCase() || "")
      .join("") || "S"
  );
}

export const STATES_IN = [
  "Haryana",
  "Delhi",
  "Rajasthan",
  "Uttar Pradesh",
  "Punjab",
  "Himachal Pradesh",
  "Uttarakhand",
  "Madhya Pradesh",
  "Bihar",
  "Maharashtra",
  "Gujarat",
  "Other"
];
