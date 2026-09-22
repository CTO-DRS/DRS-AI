import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      requestId: req.context?.requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.context?.ip,
      userAgent: req.context?.userAgent,
      userId: req.user?.id,
      contentLength: res.get('content-length')
    };

    if (res.statusCode >= 400) {
      logger.warn('Request completed with error', logData);
    } else {
      logger.info('Request completed', logData);
    }
  });

  next();
};

export const errorLogger = (err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error', {
    requestId: req.context?.requestId,
    error: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path,
    body: req.body,
    query: req.query
  });

  next(err);
};

export default requestLogger;
