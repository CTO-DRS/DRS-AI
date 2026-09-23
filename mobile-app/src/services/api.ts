/**
 * DRS AI Mobile — REST API client.
 * Talks to the DRS AI Gateway (port 3000 by default).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ApiResponse, AuthSession, ChatMessage, FileItem, ModelInfo, User, Workflow } from '../types';

const DEFAULT_BASE_URL = 'http://localhost:3000';
const STORAGE_BASE_URL_KEY = '@drsai/server_url';
const STORAGE_SESSION_KEY = '@drsai/session';

let baseUrl: string | null = null;

async function getBaseUrl(): Promise<string> {
  if (baseUrl) return baseUrl;
  const stored = await AsyncStorage.getItem(STORAGE_BASE_URL_KEY);
  baseUrl = stored || DEFAULT_BASE_URL;
  return baseUrl;
}

export async function setBaseUrl(url: string): Promise<void> {
  baseUrl = url.replace(/\/$/, '');
  await AsyncStorage.setItem(STORAGE_BASE_URL_KEY, baseUrl);
}

async function getSession(): Promise<AuthSession | null> {
  const raw = await AsyncStorage.getItem(STORAGE_SESSION_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as AuthSession; } catch { return null; }
}

export async function setSession(session: AuthSession | null): Promise<void> {
  if (!session) {
    await AsyncStorage.removeItem(STORAGE_SESSION_KEY);
  } else {
    await AsyncStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<ApiResponse<T>> {
  const base = await getBaseUrl();
  const session = await getSession();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };
  if (session?.token) headers['Authorization'] = `Bearer ${session.token}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(`${base}${path}`, { ...init, headers, signal: controller.signal });
    clearTimeout(timeout);

    let body: unknown = null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) body = await res.json();
    else body = await res.text();

    if (!res.ok) {
      return { status: res.status, error: (body as { message?: string })?.message || `HTTP ${res.status}` };
    }
    return { status: res.status, data: body as T };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error';
    return { status: 0, error: message };
  }
}

// ──────────────────────────────────────────────
// Auth
// ──────────────────────────────────────────────

export async function login(username: string, password: string): Promise<ApiResponse<AuthSession>> {
  const r = await request<{ token: string; refreshToken?: string; expiresIn?: number; user: User }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  if (r.data) {
    const session: AuthSession = {
      token: r.data.token,
      refreshToken: r.data.refreshToken,
      expiresAt: Date.now() + (r.data.expiresIn || 3600) * 1000,
      user: r.data.user,
    };
    await setSession(session);
    return { status: r.status, data: session };
  }
  return r as ApiResponse<AuthSession>;
}

export async function logout(): Promise<void> {
  await setSession(null);
}

export async function getCurrentUser(): Promise<User | null> {
  const session = await getSession();
  return session?.user || null;
}

// ──────────────────────────────────────────────
// Chat
// ──────────────────────────────────────────────

export async function sendChatMessage(message: string, history: ChatMessage[] = []): Promise<ApiResponse<{ message: ChatMessage }>> {
  return request('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message, history }),
  });
}

export async function streamChatMessage(
  message: string,
  onToken: (chunk: string) => void,
  onDone: (full: string) => void,
  onError: (err: string) => void,
): Promise<void> {
  const base = await getBaseUrl();
  const session = await getSession();
  try {
    const res = await fetch(`${base}/api/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
      },
      body: JSON.stringify({ message }),
    });
    if (!res.body) {
      onError('No response body');
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = '';
    // Read chunks — server should send SSE-like tokens
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      full += text;
      onToken(text);
    }
    onDone(full);
  } catch (err) {
    onError(err instanceof Error ? err.message : 'stream failed');
  }
}

// ──────────────────────────────────────────────
// Models
// ──────────────────────────────────────────────

export async function listModels(): Promise<ApiResponse<ModelInfo[]>> {
  return request('/api/models');
}

export async function pullModel(modelId: string): Promise<ApiResponse<{ status: string }>> {
  return request('/api/models/pull', { method: 'POST', body: JSON.stringify({ modelId }) });
}

export async function deleteModel(modelId: string): Promise<ApiResponse<{ status: string }>> {
  return request(`/api/models/${encodeURIComponent(modelId)}`, { method: 'DELETE' });
}

// ──────────────────────────────────────────────
// Files
// ──────────────────────────────────────────────

export async function listFiles(): Promise<ApiResponse<FileItem[]>> {
  return request('/api/files');
}

export async function uploadFile(uri: string, name: string, type: string): Promise<ApiResponse<FileItem>> {
  const base = await getBaseUrl();
  const session = await getSession();
  const formData = new FormData();
  // @ts-expect-error — RN FormData supports uri
  formData.append('file', { uri, name, type } as unknown as Blob);

  try {
    const res = await fetch(`${base}/api/files/upload`, {
      method: 'POST',
      headers: session?.token ? { Authorization: `Bearer ${session.token}` } : {},
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) return { status: res.status, error: data?.message || `HTTP ${res.status}` };
    return { status: res.status, data };
  } catch (err) {
    return { status: 0, error: err instanceof Error ? err.message : 'upload failed' };
  }
}

export async function deleteFile(id: string): Promise<ApiResponse<{ status: string }>> {
  return request(`/api/files/${id}`, { method: 'DELETE' });
}

// ──────────────────────────────────────────────
// Workflows
// ──────────────────────────────────────────────

export async function listWorkflows(): Promise<ApiResponse<Workflow[]>> {
  return request('/api/workflows');
}

export async function runWorkflow(id: string): Promise<ApiResponse<{ status: string }>> {
  return request(`/api/workflows/${id}/run`, { method: 'POST' });
}

// ──────────────────────────────────────────────
// Health
// ──────────────────────────────────────────────

export async function pingServer(): Promise<boolean> {
  const r = await request<{ status: string }>('/health');
  return r.status === 200;
}

export async function getHealthSnapshot(): Promise<ApiResponse<unknown>> {
  // Talk directly to the self-awareness service (port 3037)
  const base = await getBaseUrl();
  const session = await getSession();
  try {
    const res = await fetch(`${base.replace(':3000', ':3037')}/api/v1/health/snapshot`, {
      headers: session?.token ? { Authorization: `Bearer ${session.token}` } : {},
    });
    const data = await res.json();
    if (!res.ok) return { status: res.status, error: data?.message || `HTTP ${res.status}` };
    return { status: res.status, data };
  } catch (err) {
    return { status: 0, error: err instanceof Error ? err.message : 'health fetch failed' };
  }
}

export default {
  setBaseUrl,
  login,
  logout,
  getCurrentUser,
  sendChatMessage,
  streamChatMessage,
  listModels,
  pullModel,
  deleteModel,
  listFiles,
  uploadFile,
  deleteFile,
  listWorkflows,
  runWorkflow,
  pingServer,
  getHealthSnapshot,
};
