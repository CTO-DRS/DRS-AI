import rateLimit from 'express-rate-limit';
import Redis from 'ioredis';
import logger from '../utils/logger';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

interface RateLimitInfo {
  limit: number;
  current: number;
  remaining: number;
  resetTime?: Date;
}

export const createRateLimiter = (options: {
  windowMs?: number;
  max?: number;
  keyPrefix?: string;
}) => {
  const windowMs = options.windowMs || 60 * 1000; // 1 minute
  const max = options.max || 100;
  const keyPrefix = options.keyPrefix || 'ratelimit';

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const userId = (req as any).user?.id || 'anonymous';
      return `${keyPrefix}:${userId}:${req.ip}`;
    },
    handler: (req, res) => {
      logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later'
        }
      });
    },
    store: {
      incr: async (key) => {
        const multi = redis.multi();
        multi.incr(key);
        multi.pexpire(key, windowMs);
        const results = await multi.exec();
        return results?.[0]?.[1] as number || 1;
      },
      decrement: (key) => {
        redis.decr(key);
      },
      resetKey: (key) => {
        redis.del(key);
      }
    } as any
  });
};

export const defaultRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  keyPrefix: 'gateway'
});

export const strictRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  keyPrefix: 'gateway:strict'
});

export default defaultRateLimiter;
