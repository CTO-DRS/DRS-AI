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
  runTeam: (id: string, input: string, maxRounds?: number) =>
    api.post(`/teams/${id}/run`, { input, maxRounds }),
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

export default api;
