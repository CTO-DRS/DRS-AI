import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { RequestContext } from '../types';

declare global {
  namespace Express {
    interface Request {
      context: RequestContext;
    }
  }
}

export const requestContext = (req: Request, res: Response, next: NextFunction) => {
  req.context = {
    requestId: uuidv4(),
    timestamp: new Date(),
    ip: req.ip || req.socket.remoteAddress || 'unknown',
    userAgent: req.get('user-agent') || 'unknown'
  };

  res.setHeader('X-Request-ID', req.context.requestId);
  next();
};

export default requestContext;
