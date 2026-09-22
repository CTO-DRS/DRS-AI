import { Router } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { verifyToken } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimiter';
import logger from '../utils/logger';

const router = Router();

interface ServiceConfig {
  path: string;
  target: string;
  changeOrigin: boolean;
  pathRewrite: { [key: string]: string };
  requiresAuth: boolean;
  rateLimit?: {
    windowMs: number;
    max: number;
  };
  ws?: boolean;
}

const services: ServiceConfig[] = [
  {
    path: '/api/v1/auth',
    target: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/auth': '' },
    requiresAuth: false,
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10 // 10 attempts
    }
  },
  {
    path: '/api/v1/models',
    target: process.env.ROUTER_SERVICE_URL || 'http://localhost:3002',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/models': '/models' },
    requiresAuth: true,
    rateLimit: {
      windowMs: 60 * 1000,
      max: 50
    }
  },
  {
    path: '/api/v1/chat',
    target: process.env.ROUTER_SERVICE_URL || 'http://localhost:3002',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/chat': '/chat' },
    requiresAuth: true,
    ws: true
  },
  {
    path: '/api/v1/agents',
    target: process.env.ORCHESTRATOR_URL || 'http://localhost:3003',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/agents': '/agents' },
    requiresAuth: true
  },
  {
    path: '/api/v1/tasks',
    target: process.env.ORCHESTRATOR_URL || 'http://localhost:3003',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/tasks': '/tasks' },
    requiresAuth: true
  },
  {
    path: '/api/v1/memory',
    target: process.env.MEMORY_SERVICE_URL || 'http://localhost:3004',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/memory': '' },
    requiresAuth: true
  },
  {
    path: '/api/v1/files',
    target: process.env.FILES_SERVICE_URL || 'http://localhost:3005',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/files': '' },
    requiresAuth: true
  },
  {
    path: '/api/v1/voice',
    target: process.env.VOICE_SERVICE_URL || 'http://localhost:3006',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/voice': '' },
    requiresAuth: true
  },
  {
    path: '/api/v1/admin',
    target: process.env.ADMIN_SERVICE_URL || 'http://localhost:3007',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/admin': '' },
    requiresAuth: true,
    rateLimit: {
      windowMs: 60 * 1000,
      max: 200
    }
  }
];

services.forEach((service) => {
  const middlewares: any[] = [];

  if (service.rateLimit) {
    middlewares.push(createRateLimiter(service.rateLimit));
  }

  if (service.requiresAuth) {
    middlewares.push(verifyToken);
  }

  const proxyMiddleware = createProxyMiddleware({
    target: service.target,
    changeOrigin: service.changeOrigin,
    pathRewrite: service.pathRewrite,
    ws: service.ws || false,
    onError: (err, req, res) => {
      logger.error(`Proxy error for ${service.path}:`, err);
      if (!res.headersSent) {
        (res as any).status(503).json({
          success: false,
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Service temporarily unavailable'
          }
        });
      }
    },
    onProxyReq: (proxyReq, req, res) => {
      if (req.context?.requestId) {
        proxyReq.setHeader('X-Request-ID', req.context.requestId);
      }
      if (req.user) {
        proxyReq.setHeader('X-User-ID', req.user.id);
        proxyReq.setHeader('X-User-Role', req.user.role);
      }
      logger.debug(`Proxying request to ${service.target}${req.path}`);
    },
    onProxyRes: (proxyRes, req, res) => {
      proxyRes.headers['X-Gateway'] = 'DRS-VIP-AI';
    }
  });

  middlewares.push(proxyMiddleware);

  router.use(service.path, ...middlewares);
  logger.info(`Registered proxy route: ${service.path} -> ${service.target}`);
});

export default router;
