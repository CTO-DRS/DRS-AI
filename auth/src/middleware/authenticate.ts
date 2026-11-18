import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

/**
 * SECURITY: identity is derived ONLY from a verified access token issued by
 * this service. The legacy X-User-ID header is never trusted.
 *
 * The auth service signs the tokens itself, so it verifies them locally with
 * the same JWT_SECRET the gateway uses — no network round-trip required.
 */
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable must be set in production');
  }
  return 'drs-dev-secret'; // development fallback only
})();

export interface AuthedRequest extends Request {
  userId?: string;
  authEmail?: string;
  authRole?: string;
}

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Access token is required' }
    });
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded.type && decoded.type !== 'access') {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Access token required' }
      });
    }
    (req as AuthedRequest).userId = decoded.userId;
    (req as AuthedRequest).authEmail = decoded.email;
    (req as AuthedRequest).authRole = decoded.role;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' }
    });
  }
};

/**
 * Optional verification for routes that stay callable without a token
 * (logout) but must use the token-verified identity when one is supplied.
 */
export const optionalAuthenticate = (req: Request, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.substring(7), JWT_SECRET) as any;
      if (!decoded.type || decoded.type === 'access') {
        (req as AuthedRequest).userId = decoded.userId;
        (req as AuthedRequest).authEmail = decoded.email;
        (req as AuthedRequest).authRole = decoded.role;
      }
    } catch {
      // token invalid/expired — logout remains a no-op success
    }
  }
  next();
};
