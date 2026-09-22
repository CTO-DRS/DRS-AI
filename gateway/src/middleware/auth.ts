import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../types';
import logger from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'drs-secret-key';

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

export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
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
