export interface User {
  id: string;
  email: string;
  username: string;
  role: string;
  permissions: string[];
}

export interface RequestContext {
  requestId: string;
  user?: User;
  timestamp: Date;
  ip: string;
  userAgent: string;
}

export interface ServiceConfig {
  name: string;
  url: string;
  path: string;
  requiresAuth: boolean;
  rateLimit?: {
    windowMs: number;
    max: number;
  };
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    requestId: string;
    timestamp: string;
    duration: number;
  };
}

export interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  context: RequestContext;
  metadata?: any;
  timestamp: Date;
}
