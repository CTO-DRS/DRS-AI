import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../types';
import logger from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable must be set in production');
  }
  return 'drs-dev-secret'; // development fallback only
})();

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

interface JwtPayload {
  userId: string;
  email: string;
  username: string;
  role: string;
  permissions: string[];
  iat: number;
  exp: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/* ------------------------------------------------------------------ */
/* API-key validation with a short in-memory cache                    */
/* (drSai user_api_key_manager parity: drsk_... machine keys)         */
/* ------------------------------------------------------------------ */

const API_KEY_CACHE_TTL = 60_000; // 60s
const apiKeyCache = new Map<string, { value: ApiKeyValidation; expires: number }>();

interface ApiKeyValidation {
  valid: boolean;
  userId?: string;
  email?: string;
  username?: string;
  role?: string;
  permissions?: string[];
  scopes?: string[];
  reason?: string;
}

async function validateApiKeyWithAuth(key: string): Promise<ApiKeyValidation> {
  const cached = apiKeyCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${AUTH_SERVICE_URL}/apikeys/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(INTERNAL_API_KEY ? { 'X-Internal-Key': INTERNAL_API_KEY } : {})
      },
      body: JSON.stringify({ key }),
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!response.ok) {
      return { valid: false, reason: `Auth service HTTP ${response.status}` };
    }
    const body: any = await response.json();
    const value: ApiKeyValidation = body?.data || { valid: false, reason: 'Malformed response' };

    // Cache both hits and misses (misses shorter)
    apiKeyCache.set(key, {
      value,
      expires: Date.now() + (value.valid ? API_KEY_CACHE_TTL : 10_000)
    });
    if (apiKeyCache.size > 5000) {
      // naive sweep
      for (const [k, v] of apiKeyCache) {
        if (v.expires < Date.now()) apiKeyCache.delete(k);
      }
    }
    return value;
  } catch (error: any) {
    logger.error('API key validation failed:', error.message);
    return { valid: false, reason: 'Auth service unreachable' };
  }
}

/* ------------------------------------------------------------------ */
/* verifyToken — JWT bearer (primary) or X-API-Key (machine clients)  */
/* ------------------------------------------------------------------ */

export const verifyToken = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'] as string | undefined;

  // Machine authentication via API key
  if ((!authHeader || !authHeader.startsWith('Bearer ')) && apiKey) {
    const validation = await validateApiKeyWithAuth(apiKey);
    if (!validation.valid) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_API_KEY', message: validation.reason || 'Invalid API key' }
      });
    }
    req.user = {
      id: validation.userId!,
      email: validation.email || '',
      username: validation.username || '',
      role: validation.role || 'user',
      permissions: validation.permissions || []
    };
    (req as any).apiScopes = validation.scopes;
    return next();
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Access token is required'
      }
    });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;

    req.user = {
      id: decoded.userId,
      email: decoded.email,
      username: decoded.username,
      role: decoded.role,
      permissions: decoded.permissions
    };

    next();
  } catch (error) {
    logger.warn('Invalid token:', error);
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired token'
      }
    });
  }
};

export const requirePermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
    }

    if (!req.user.permissions.includes(permission) && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient permissions'
        }
      });
    }

    next();
  };
};

export const requireRole = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
    }

    if (!roles.includes(req.user.role) && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Insufficient role privileges'
        }
      });
    }

    next();
  };
};

export default verifyToken;
