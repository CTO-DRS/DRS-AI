import axios from 'axios';

// Shared base URL — also used by the SSE streaming fetch in ChatContext.
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

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
  getConversations: () => api.get('/memory/conversations'),
  getConversation: (id: string) => api.get(`/memory/conversations/${id}`),
  createConversation: () => api.post('/memory/conversations', {}),
  deleteConversation: (id: string) => api.delete(`/memory/conversations/${id}`),
  sendMessage: (content: string, model: string, conversationId?: string) =>
    api.post('/chat', {
      model,
      messages: [{ role: 'user', content }],
      conversationId
    }),
  generate: (prompt: string, model: string) =>
    api.post('/chat/generate', { model, prompt })
};

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
  capabilities: () => api.get('/voice/capabilities'),
  transcribe: (audioBlob: Blob, language?: string) => {
    const formData = new FormData();
    formData.append('audio', audioBlob);
    if (language) formData.append('language', language);
    return api.post('/voice/stt', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  synthesize: (text: string, voice?: string) =>
    api.post('/voice/tts', { text, voice }, { responseType: 'blob' })
};

export const adminService = {
  getStats: () => api.get('/admin/stats'),
  getHealth: () => api.get('/admin/health'),
  getActivity: () => api.get('/admin/activity'),
  getUsers: () => api.get('/admin/users'),
  updateUser: (id: string, data: any) => api.patch(`/admin/users/${id}`, data)
};

/** Agent Teams / HITL approvals / MCP — orchestrator v2 via gateway proxy. */
export const agentsService = {
  listAgents: () => api.get('/agents'),
  listTeams: () => api.get('/teams'),
  createTeam: (data: {
    name: string;
    description?: string;
    agentIds: string[];
    strategy?: string;
    maxRounds?: number;
  }) => api.post('/teams', data),
  deleteTeam: (id: string) => api.delete(`/teams/${id}`),
  runTeam: (
    id: string,
    input: string,
    options?: { maxRounds?: number; useMemory?: boolean; useWebSearch?: boolean; jsonOutput?: boolean }
  ) => api.post(`/teams/${id}/run`, { input, ...options }),
  listTeamRuns: (id: string) => api.get(`/teams/${id}/runs`),
  getRun: (runId: string) => api.get(`/teams/runs/${runId}`),
  stopRun: (runId: string) => api.post(`/teams/runs/${runId}/stop`, {}),
  listApprovals: (status?: string) =>
    api.get('/approvals', { params: status ? { status } : undefined }),
  approve: (id: string) => api.post(`/approvals/${id}/approve`, {}),
  reject: (id: string, reason?: string) => api.post(`/approvals/${id}/reject`, { reason }),
  listMcpServers: () => api.get('/mcp/servers'),
  addMcpServer: (data: { name: string; transport: string; command?: string; url?: string }) =>
    api.post('/mcp/servers', data),
  testMcpServer: (id: string) => api.post(`/mcp/servers/${id}/test`, {}),
  deleteMcpServer: (id: string) => api.delete(`/mcp/servers/${id}`),
  listMcpTools: (id: string) => api.get(`/mcp/servers/${id}/tools`)
};

/** A2A (Agent-to-Agent) protocol — orchestrator v2 via gateway proxy. */
export const a2aService = {
  listAgents: () => api.get('/a2a/agents'),
  registerAgent: (data: { name: string; endpoint: string; description?: string }) =>
    api.post('/a2a/agents', data),
  probeAgent: (id: string) => api.post(`/a2a/agents/${id}/probe`, {}),
  toggleAgent: (id: string, enabled: boolean) => api.post(`/a2a/agents/${id}/toggle`, { enabled }),
  deleteAgent: (id: string) => api.delete(`/a2a/agents/${id}`),
  sendMessage: (agentId: string, text: string, contextId?: string) =>
    api.post('/a2a/message', { agentId, text, contextId }),
  listTeams: () => api.get('/a2a/teams'),
  delegateToTeam: (teamId: string, text: string, useMemory = true) =>
    api.post('/a2a/inbox', { teamId, text, useMemory })
};

/** Agent knowledge memory (ingest + BM25 retrieval) — orchestrator via gateway. */
export const knowledgeService = {
  ingest: (data: { title: string; content: string; source?: string }) =>
    api.post('/knowledge/documents', data),
  upload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/knowledge/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  list: () => api.get('/knowledge/documents'),
  get: (id: string) => api.get(`/knowledge/documents/${id}`),
  toggle: (id: string, enabled: boolean) =>
    api.post(`/knowledge/documents/${id}/toggle`, { enabled }),
  delete: (id: string) => api.delete(`/knowledge/documents/${id}`),
  search: (query: string, topK = 5) => api.post('/knowledge/search', { query, topK })
};

/** Built-in agent tools (keyless web search + status) — orchestrator via gateway. */
export const toolsService = {
  status: () => api.get('/tools/status'),
  webSearch: (query: string, maxResults = 5) =>
    api.post('/tools/web-search', { query, maxResults })
};

export default api;
