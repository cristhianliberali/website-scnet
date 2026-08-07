/**
 * Lead attribution capture: UTM params + ad click ids, persisted so they
 * survive across pages and return visits.
 *
 * Storage strategy (per product requirement, not sessionStorage):
 * - localStorage is the primary store — works the same on iOS Safari,
 *   Android Chrome/WebView, and desktop, and (unlike cookies) isn't capped
 *   to a shorter lifetime by Safari's Intelligent Tracking Prevention.
 * - A 180-day cookie is a reinforcement/fallback for when localStorage is
 *   unavailable or gets cleared (private tabs, storage-clearing extensions).
 *   Note Safari ITP silently caps script-set (document.cookie) cookies to a
 *   much shorter real lifetime than the Max-Age we request — expected and
 *   fine, since localStorage is the source of truth.
 */

export const TRACKED_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "msclkid",
  "ttclid",
  "li_fat_id",
  "twclid",
] as const;

export type TrackedParam = (typeof TRACKED_PARAMS)[number];

export type AttributionData = Partial<Record<TrackedParam, string>> & {
  referrer?: string | undefined;
  landing_page?: string | undefined;
  first_visit_at?: string | undefined;
  last_visit_at?: string | undefined;
  last_page?: string | undefined;
};

const STORAGE_KEY = "scnet_attribution";
const COOKIE_NAME = "scnet_attribution";
const COOKIE_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

function readLocalStorage(): AttributionData | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AttributionData) : null;
  } catch {
    return null;
  }
}

function writeLocalStorage(data: AttributionData) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage unavailable (private mode quota, disabled storage, etc). The
    // cookie write below still gives us a fallback.
  }
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  const value = match?.[1];
  return value ? decodeURIComponent(value) : null;
}

function writeCookie(name: string, value: string, maxAgeSeconds: number) {
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax${secure}`;
  } catch {
    // Cookies disabled — localStorage remains the source of truth.
  }
}

function readCookieData(): AttributionData | null {
  const raw = readCookie(COOKIE_NAME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AttributionData;
  } catch {
    return null;
  }
}

function persist(data: AttributionData) {
  writeLocalStorage(data);
  writeCookie(COOKIE_NAME, JSON.stringify(data), COOKIE_MAX_AGE_SECONDS);
}

/** Read whatever attribution data is currently stored, without capturing new params. */
export function getAttribution(): AttributionData {
  if (typeof window === "undefined") return {};
  return readLocalStorage() ?? readCookieData() ?? {};
}

/**
 * Reads UTM/click-id params from the current URL and merges them into the
 * stored attribution profile, then re-persists to both localStorage and the
 * cookie. Safe to call on every page/route load: pages with no tracking
 * params in the URL simply keep whatever was captured earlier.
 */
export function captureAttribution(): AttributionData {
  if (typeof window === "undefined") return {};

  const existing = readLocalStorage() ?? readCookieData() ?? {};
  const params = new URLSearchParams(window.location.search);
  const fromUrl: Partial<Record<TrackedParam, string>> = {};
  for (const key of TRACKED_PARAMS) {
    const value = params.get(key);
    if (value) fromUrl[key] = value;
  }

  const now = new Date().toISOString();
  const currentPage = window.location.pathname + window.location.search;
  const merged: AttributionData = {
    ...existing,
    ...fromUrl,
    referrer: existing.referrer || document.referrer || undefined,
    landing_page: existing.landing_page || currentPage,
    first_visit_at: existing.first_visit_at || now,
    last_visit_at: now,
    last_page: currentPage,
  };

  persist(merged);
  return merged;
}
