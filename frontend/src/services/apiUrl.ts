/**
 * Runtime-configurable API base URL.
 *
 * The static deployment (e.g. on Vercel) cannot know where the user's
 * self-hosted backend lives, so the URL is stored in localStorage and can be
 * changed from the connection screen (ServerGate). Build-time VITE_API_URL is
 * only the fallback/default.
 */
const STORAGE_KEY = 'drs-api-url';

const FALLBACK = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

export function getApiUrl(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || FALLBACK;
  } catch {
    return FALLBACK;
  }
}

export function setApiUrl(url: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, url);
  } catch {
    // private mode etc. — URL will not persist, ignore
  }
}

export function hasCustomApiUrl(): boolean {
  try {
    return !!localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

/**
 * Normalize whatever the user typed into a gateway base URL ending in
 * /api/v1: add the scheme if missing, strip trailing slashes, append the
 * /api/v1 path unless it is already present.
 */
export function normalizeApiUrl(input: string): string {
  let u = input.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  if (!/\/api\/v1$/.test(u)) u = `${u}/api/v1`;
  return u;
}

/** Base origin of the gateway (API URL without the /api/v1 suffix). */
export function gatewayOrigin(apiUrl?: string): string {
  return (apiUrl ?? getApiUrl()).replace(/\/api\/v1\/?$/, '');
}
