import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

/**
 * SECURITY (V3): every execution endpoint requires a valid access token.
 * Previously this service was reachable without any authentication, which
 * made unauthenticated remote code execution possible.
 *
 * Tokens are verified locally with the shared JWT_SECRET (same secret the
 * gateway uses to issue/verify sessions). The /health endpoint stays public
 * so Docker/Kubernetes probes keep working.
 */
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable must be set in production');
  }
  return 'drs-dev-secret'; // development fallback only
})();

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Access token is required' }
    });
  }

  try {
    const decoded = jwt.verify(authHeader.substring(7), JWT_SECRET) as any;
    if (decoded.type && decoded.type !== 'access') {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Access token required' }
      });
    }
    (req as any).userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' }
    });
  }
};
