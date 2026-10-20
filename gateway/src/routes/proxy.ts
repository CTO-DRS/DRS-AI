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
  // ===== Agent Teams (multi-agent orchestration) =====
  {
    path: '/api/v1/teams',
    target: process.env.ORCHESTRATOR_URL || 'http://localhost:3003',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/teams': '/teams' },
    requiresAuth: true
  },
  // ===== Tool registry / function calling =====
  {
    path: '/api/v1/agent-tools',
    target: process.env.ORCHESTRATOR_URL || 'http://localhost:3003',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/agent-tools': '/tools' },
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
  },
  // ===== OpenAI-compatible surface (OpenAI SDKs: baseURL http://<host>:3000/api/openai/v1) =====
  {
    path: '/api/openai',
    target: process.env.ROUTER_SERVICE_URL || 'http://localhost:3002',
    changeOrigin: true,
    pathRewrite: { '^/api/openai': '' },
    requiresAuth: true
  },
  // ===== Hybrid RAG (retrieval, indexing) =====
  {
    path: '/api/v1/rag',
    target: process.env.HYBRID_RAG_URL || 'http://localhost:3022',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/rag': '/api/v1/rag' },
    requiresAuth: true
  },
  // ===== Workflow engine =====
  {
    path: '/api/v1/workflows',
    target: process.env.WORKFLOW_ENGINE_URL || 'http://localhost:3011',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/workflows': '' },
    requiresAuth: true
  },
  // ===== Auto builder (app generation) =====
  {
    path: '/api/v1/builder',
    target: process.env.AUTO_BUILDER_URL || 'http://localhost:3018',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/builder': '/api/builder' },
    requiresAuth: true
  },
  // ===== Code interpreter =====
  {
    path: '/api/v1/interpreter',
    target: process.env.CODE_INTERPRETER_URL || 'http://localhost:3014',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/interpreter': '' },
    requiresAuth: true
  },
  // ===== Multi-model ensemble =====
  {
    path: '/api/v1/multi-model',
    target: process.env.MULTI_MODEL_URL || 'http://localhost:3017',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/multi-model': '/api/models' },
    requiresAuth: true
  },
  // ===== Advanced memory =====
  {
    path: '/api/v1/advanced-memory',
    target: process.env.ADVANCED_MEMORY_URL || 'http://localhost:3016',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/advanced-memory': '/api/memory' },
    requiresAuth: true
  },
  // ===== LLM guardrail =====
  {
    path: '/api/v1/guardrail',
    target: process.env.LLM_GUARDRAIL_URL || 'http://localhost:3021',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/guardrail': '/api/v1/guardrail' },
    requiresAuth: true
  },
  // ===== MCP Hub (Model Context Protocol) =====
  {
    path: '/api/v1/mcp',
    target: process.env.MCP_HUB_URL || 'http://localhost:3044',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/mcp': '' },
    requiresAuth: true
  },
  // ===== Skills (SKILL.md library) =====
  {
    path: '/api/v1/skills',
    target: process.env.SKILLS_SERVICE_URL || 'http://localhost:3045',
    changeOrigin: true,
    pathRewrite: { '^/api/v1/skills': '/skills' },
    requiresAuth: true
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
