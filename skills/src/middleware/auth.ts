import { NextFunction, Request, Response } from 'express';

/**
 * Auth model: this service trusts the gateway. The gateway authenticates
 * requests and injects `x-user-id` / `x-user-role` headers before proxying.
 *
 * Dev bypass: when NODE_ENV !== 'production' and DEV_AUTH_BYPASS=true,
 * requests without x-user-id are treated as a local admin ("dev-user") so the
 * service can be exercised without the gateway.
 */

const DEV_BYPASS_ENABLED = process.env.NODE_ENV !== 'production' && process.env.DEV_AUTH_BYPASS === 'true';

function headerValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value.length > 0 ? value[0] : null;
  }
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const userId = headerValue(req.headers['x-user-id']);

  if (userId) {
    req.userId = userId;
    req.userRole = headerValue(req.headers['x-user-role']) || 'user';
    next();
    return;
  }

  if (DEV_BYPASS_ENABLED) {
    req.userId = 'dev-user';
    req.userRole = headerValue(req.headers['x-user-role']) || 'admin';
    next();
    return;
  }

  res.status(401).json({
    success: false,
    error: {
      code: 'UNAUTHORIZED',
      message: 'Authentication required: missing x-user-id header'
    }
  });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.userRole === 'admin') {
    next();
    return;
  }
  res.status(403).json({
    success: false,
    error: {
      code: 'FORBIDDEN',
      message: 'Admin role required'
    }
  });
}

/**
 * Populate req.userId / req.userRole when the gateway headers are present,
 * but never reject. Used on public routes that accept an identity hint
 * (e.g. GET /?mine=true).
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const userId = headerValue(req.headers['x-user-id']);

  if (userId) {
    req.userId = userId;
    req.userRole = headerValue(req.headers['x-user-role']) || 'user';
  } else if (DEV_BYPASS_ENABLED) {
    req.userId = 'dev-user';
    req.userRole = headerValue(req.headers['x-user-role']) || 'admin';
  }

  next();
}
