import { Request, Response, NextFunction } from 'express';
import client from 'prom-client';

const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const metricsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  next();
};

export const metricsEndpoint = async (req: Request, res: Response) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
};

export { register };
