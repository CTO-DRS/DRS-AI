export interface User {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  role: string;
  isActive: boolean;
  isEmailVerified: boolean;
  twoFactorEnabled: boolean;
  twoFactorSecret?: string;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  profile?: UserProfile;
  permissions: string[];
}

export interface UserProfile {
  id: string;
  userId: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  phone?: string;
  timezone: string;
  language: string;
  preferences: Record<string, any>;
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  permissions: string[];
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
  description?: string;
}

export interface TokenPayload {
  userId: string;
  email: string;
  username: string;
  role: string;
  permissions: string[];
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
  twoFactorCode?: string;
}

export interface RegisterData {
  email: string;
  username: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  ipAddress: string;
  userAgent: string;
  expiresAt: Date;
  createdAt: Date;
  lastActivityAt: Date;
}

export interface AuditLog {
  id: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
}
