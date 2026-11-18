import { Request, Response, NextFunction } from 'express';

/**
 * SECURITY (V4): sandbox management endpoints (container creation, exec,
 * destroy) require either a verified user access token (JWT) or the internal
 * service key. Previously these endpoints were completely unauthenticated
 * while the container itself ran with a mounted docker.sock and
 * privileged: true — a direct path from any reachable port to host takeover.
 *
 * /api/v1/health and /metrics stay public for probes and Prometheus scraping.
 */
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable must be set in production');
  }
  return 'drs-dev-secret'; // development fallback only
})();

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  // Service-to-service calls use the internal key when configured
  if (INTERNAL_API_KEY) {
    const providedKey = req.headers['x-internal-api-key'] as string | undefined;
    if (providedKey === INTERNAL_API_KEY) {
      (req as any).authType = 'service';
      return next();
    }
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Access token or internal API key is required' }
    });
  }

  try {
    const { default: jwt } = await import('jsonwebtoken');
    const decoded = jwt.verify(authHeader.substring(7), JWT_SECRET) as any;
    if (decoded.type && decoded.type !== 'access') {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Access token required' }
      });
    }
    (req as any).userId = decoded.userId;
    (req as any).authType = 'user';
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' }
    });
  }
};
