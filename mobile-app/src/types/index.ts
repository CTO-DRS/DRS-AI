/**
 * DRS AI Mobile — Shared TypeScript types
 */

export interface User {
  id: string;
  username: string;
  email?: string;
  role: 'admin' | 'user' | 'guest';
  avatar?: string;
  preferences: {
    language: Locale;
    brainMode?: 'left' | 'right' | 'auto';
    voiceId?: string;
  };
}

export type Locale = 'ar' | 'en' | 'fr' | 'de';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  model?: string;
  confidence?: number;
  sources?: Source[];
  pending?: boolean;
  error?: string;
}

export interface Source {
  id: string;
  type: 'rag' | 'memory' | 'web' | 'tool';
  reference: string;
  snippet?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  size?: string;
  capabilities: string[];
  loaded: boolean;
}

export interface FileItem {
  id: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: number;
  status: 'uploading' | 'ready' | 'failed';
  url?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'paused' | 'draft';
  lastRun?: number;
  nextRun?: number;
  triggers: Trigger[];
  actions: Action[];
}

export interface Trigger {
  type: 'schedule' | 'event' | 'webhook';
  config: Record<string, unknown>;
}

export interface Action {
  type: 'ai_generate' | 'http_call' | 'send_message' | 'run_code';
  config: Record<string, unknown>;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: number;
}

export interface AuthSession {
  token: string;
  refreshToken?: string;
  expiresAt: number;
  user: User;
}
