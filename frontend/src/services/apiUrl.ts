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

/** Second storage key: how the saved URL was chosen (docker auto-detect vs user entry). */
const SOURCE_KEY = 'drs-api-url-source';

export type ApiUrlSource = 'docker' | 'custom';

/** Default docker-compose gateway address (published port, per docker-compose.yml). */
export const DOCKER_API_URL = 'http://localhost:3000/api/v1';

/**
 * Candidate addresses for the local docker-compose deployment, in probe order:
 * first the origin the UI itself is served from (the stack's nginx proxies
 * /api to the gateway), then the published gateway port for on-host browsing.
 */
export function dockerCandidates(): string[] {
  const candidates: string[] = [];
  try {
    const { origin } = window.location;
    if (origin && origin !== 'null') candidates.push(`${origin}/api/v1`);
  } catch {
    // non-browser environment — same-origin is not applicable
  }
  if (!candidates.includes(DOCKER_API_URL)) candidates.push(DOCKER_API_URL);
  return candidates;
}

export function setApiUrlSource(source: ApiUrlSource): void {
  try {
    localStorage.setItem(SOURCE_KEY, source);
  } catch {
    // private mode etc. — ignore
  }
}

export function getApiUrlSource(): ApiUrlSource {
  try {
    return localStorage.getItem(SOURCE_KEY) === 'custom' ? 'custom' : 'docker';
  } catch {
    return 'docker';
  }
}

/**
 * Probe a gateway base URL (absolute origin + /api/v1). Two paths are tried:
 * the direct root /health, and the /api/v1/health path that also works when
 * the UI is served behind the stack's nginx proxy. A 200 with an HTML body is
 * the SPA fallback, not the gateway, and is rejected; a JSON 404 through the
 * /api/ proxy proves the gateway is reachable.
 */
export async function probeGateway(base: string, timeoutMs = 5000): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const answersJson = (res: Response): boolean => {
    const ct = res.headers.get('content-type') || '';
    return ct.includes('json');
  };
  try {
    const origin = gatewayOrigin(base);
    const direct = await fetch(`${origin}/health`, { signal: ctrl.signal });
    if (direct.ok && answersJson(direct)) return true;
    const proxied = await fetch(`${origin}/api/v1/health`, { signal: ctrl.signal });
    return answersJson(proxied);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
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
