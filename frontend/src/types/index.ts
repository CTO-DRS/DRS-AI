export interface User {
  id: string;
  email: string;
  username: string;
  role: string;
  isActive: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: {
    model?: string;
    tokens?: number;
    agent?: string;
  };
}

export interface Conversation {
  id: string;
  title?: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

export interface Model {
  id: string;
  name: string;
  description: string;
  size: number;
  capabilities: {
    chat: boolean;
    code: boolean;
    reasoning: boolean;
    vision: boolean;
    embedding: boolean;
  };
  parameters: string;
  family: string;
  quantization: string;
  recommendedFor: string[];
}

export interface Agent {
  id: string;
  name: string;
  capabilities: string[];
}

export interface Task {
  id: string;
  type: string;
  input: string;
  status: 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  result?: {
    output: string;
    metadata?: any;
  };
  createdAt: string;
}

export interface FileItem {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
  processed?: boolean;
}

export interface SystemStats {
  users: {
    total: number;
    activeToday: number;
  };
  conversations: number;
  messages: number;
  memories: number;
}

export interface ServiceHealth {
  [key: string]: {
    status: string;
    latency?: number;
  };
}
