import { Request, Response, NextFunction } from 'express';

interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
}

export class RateLimiter {
  private limiters: Map<string, { count: number; resetTime: number }>;
  private options: RateLimiterOptions;

  constructor(options: RateLimiterOptions) {
    this.options = options;
    this.limiters = new Map();
    setInterval(() => this.cleanup(), options.windowMs);
  }

  middleware = (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'unknown';
    const now = Date.now();

    const entry = this.limiters.get(key);

    if (!entry || now > entry.resetTime) {
      this.limiters.set(key, {
        count: 1,
        resetTime: now + this.options.windowMs
      });
      return next();
    }

    if (entry.count >= this.options.maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests',
        retryAfter: Math.ceil((entry.resetTime - now) / 1000)
      });
    }

    entry.count++;
    next();
  };

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.limiters) {
      if (now > entry.resetTime) {
        this.limiters.delete(key);
      }
    }
  }
}
