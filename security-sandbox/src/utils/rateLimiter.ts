/**
 * Rate Limiter
 * Request rate limiting for API protection
 */

import { Request, Response, NextFunction } from 'express';
import { RateLimiterRes, RateLimiterAbstract } from 'rate-limiter-flexible';

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
    
    // Cleanup old entries periodically
    setInterval(() => this.cleanup(), options.windowMs);
  }

  middleware = (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'unknown';
    const now = Date.now();

    const entry = this.limiters.get(key);

    if (!entry || now > entry.resetTime) {
      // New window
      this.limiters.set(key, {
        count: 1,
        resetTime: now + this.options.windowMs
      });
      return next();
    }

    if (entry.count >= this.options.maxRequests) {
      // Rate limit exceeded
      return res.status(429).json({
        success: false,
        error: 'Too many requests',
        retryAfter: Math.ceil((entry.resetTime - now) / 1000)
      });
    }

    // Increment counter
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
