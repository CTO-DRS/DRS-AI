import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.request.use((config) => {
  const tokens = localStorage.getItem('tokens');
  if (tokens) {
    const { accessToken } = JSON.parse(tokens);
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('tokens');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Helper: unwrap the standard {success, data} envelope
export const unwrap = (response: any) => response.data?.data ?? response.data;

export const authService = {
  login: (email: string, password: string, twoFactorCode?: string) =>
    api.post('/auth/login', { email, password, twoFactorCode }),
  register: (data: any) => api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
  refreshToken: (refreshToken: string) =>
    api.post('/auth/refresh', { refreshToken }),
  getMe: () => api.get('/auth/me').then(r => r.data.data.user),
  setup2FA: () => api.post('/auth/2fa/setup'),
  verify2FA: (code: string) => api.post('/auth/2fa/verify', { code })
};

export const chatService = {
  getModels: () => api.get('/models'),
  getModel: (name: string) => api.get(`/models/${name}`),
  pullModel: (name: string) => api.post('/models/pull', { name }, { timeout: 600000 }),
  deleteModel: (name: string) => api.delete(`/models/${name}`),
  getConversations: () => api.get('/memory/conversations'),
  getConversation: (id: string) => api.get(`/memory/conversations/${id}`),
  createConversation: (title?: string) => api.post('/memory/conversations', { title }),
  deleteConversation: (id: string) => api.delete(`/memory/conversations/${id}`),
  sendMessage: (content: string, model: string, conversationId?: string, useRag?: boolean) =>
    api.post('/chat', {
      model,
      messages: [{ role: 'user', content }],
      conversationId,
      useRag
    }),
  generate: (prompt: string, model: string) =>
    api.post('/chat/generate', { model, prompt })
};

/**
 * Streaming chat client (SSE).
 * Streams Ollama-style JSON chunks + OpenAI-style chunks through the gateway.
 * onChunk receives the raw parsed `data:` payload; returns an AbortController-backed cancel.
 */
export async function streamChat(
  body: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    conversationId?: string;
    useRag?: boolean;
  },
  onChunk: (data: any) => void,
  onDone?: () => void,
  onError?: (err: any) => void
): Promise<() => void> {
  const tokens = localStorage.getItem('tokens');
  const accessToken = tokens ? JSON.parse(tokens).accessToken : '';
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ ...body, stream: true }),
        signal: controller.signal
      });

      if (!res.ok || !res.body) {
        throw new Error(`Stream failed with status ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n');
        buffer = parts.pop() || '';
        for (const line of parts) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') {
            onDone?.();
            return;
          }
          try {
            onChunk(JSON.parse(payload));
          } catch {
            // ignore partial frames
          }
        }
      }
      onDone?.();
    } catch (err: any) {
      if (err.name !== 'AbortError') onError?.(err);
    }
  })();

  return () => controller.abort();
}

export const fileService = {
  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  process: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/files/process', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  }
};

export const voiceService = {
  transcribe: (audioBlob: Blob) => {
    const formData = new FormData();
    formData.append('audio', audioBlob);
    return api.post('/voice/stt', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  synthesize: (text: string) =>
    api.post('/voice/tts', { text }, { responseType: 'blob' })
};

export const adminService = {
  getStats: () => api.get('/admin/stats'),
  getHealth: () => api.get('/admin/health'),
  getActivity: () => api.get('/admin/activity'),
  getUsers: () => api.get('/admin/users'),
  updateUser: (id: string, data: any) => api.patch(`/admin/users/${id}`, data)
};

// ===== Agent Teams (multi-agent orchestration, ported from OpenDrSai group chats) =====
export const teamsService = {
  list: () => api.get('/teams'),
  get: (id: string) => api.get(`/teams/${id}`),
  create: (data: { name: string; pattern: 'round_robin' | 'selector' | 'handoff'; agents: string[]; maxRounds?: number; task: string }) =>
    api.post('/teams', data),
  run: (id: string, task: string) => api.post(`/teams/${id}/run`, { task }, { timeout: 600000 }),
  delete: (id: string) => api.delete(`/teams/${id}`)
};

// ===== Tools registry (function calling) =====
export const toolsService = {
  list: () => api.get('/agent-tools'),
  execute: (name: string, args: Record<string, any>) =>
    api.post('/agent-tools/execute', { name, args }),
  register: (data: any) => api.post('/agent-tools', data),
  unregister: (name: string) => api.delete(`/agent-tools/${name}`)
};

// ===== Skills (SKILL.md library, ported from OpenDrSai skills system) =====
export const skillsService = {
  list: () => api.get('/skills'),
  get: (id: string) => api.get(`/skills/${id}`),
  install: (content: string) => api.post('/skills', { content }),
  toggle: (id: string, enabled: boolean) => api.post(`/skills/${id}/${enabled ? 'enable' : 'disable'}`),
  remove: (id: string) => api.delete(`/skills/${id}`),
  marketplace: () => api.get('/skills/marketplace')
};

// ===== Prompt library =====
export const promptsService = {
  list: () => api.get('/memory/prompts'),
  get: (id: string) => api.get(`/memory/prompts/${id}`),
  create: (data: { name: string; template: string; description?: string; variables?: string[] }) =>
    api.post('/memory/prompts', data),
  update: (id: string, data: any) => api.put(`/memory/prompts/${id}`, data),
  remove: (id: string) => api.delete(`/memory/prompts/${id}`),
  render: (id: string, variables: Record<string, string>) =>
    api.post(`/memory/prompts/${id}/render`, { variables })
};

// ===== MCP (Model Context Protocol) hub =====
export const mcpService = {
  listServers: () => api.get('/mcp/servers'),
  addServer: (data: { name: string; transport: 'stdio' | 'http'; command?: string; args?: string[]; url?: string; env?: Record<string, string> }) =>
    api.post('/mcp/servers', data),
  removeServer: (name: string) => api.delete(`/mcp/servers/${name}`),
  status: (name: string) => api.get(`/mcp/servers/${name}/status`),
  tools: () => api.get('/mcp/tools'),
  callTool: (server: string, tool: string, args: Record<string, any>) =>
    api.post('/mcp/tools/call', { server, tool, args }, { timeout: 300000 })
};

// ===== RAG (hybrid retrieval) =====
export const ragService = {
  search: (query: string, limit = 5) => api.post('/rag/search', { query, limit }),
  index: (data: { title: string; content: string; metadata?: any }) =>
    api.post('/rag/index', data),
  stats: () => api.get('/rag/stats')
};

export default api;
