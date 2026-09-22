import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

import { requestContext } from './middleware/requestContext';
import { requestLogger, errorLogger } from './middleware/logging';
import { defaultRateLimiter } from './middleware/rateLimiter';
import proxyRoutes from './routes/proxy';
import logger from './utils/logger';
import redis from './utils/redis';

dotenv.config();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"],
    },
  },
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:80',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
}));

app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request context and logging
app.use(requestContext);
app.use(requestLogger);
app.use(defaultRateLimiter);

// Health check endpoint
app.get('/health', async (req: Request, res: Response) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'gateway',
    version: '1.0.0',
    uptime: process.uptime(),
    checks: {
      redis: 'unknown',
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        unit: 'MB'
      }
    }
  };

  try {
    await redis.ping();
    health.checks.redis = 'connected';
  } catch (error) {
    health.checks.redis = 'disconnected';
    health.status = 'degraded';
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

// API status endpoint
app.get('/api/status', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      name: 'DRS AI Platform',
      version: '1.0.0',
      status: 'operational',
      services: {
        gateway: 'online',
        auth: process.env.AUTH_SERVICE_URL ? 'configured' : 'not configured',
        router: process.env.ROUTER_SERVICE_URL ? 'configured' : 'not configured',
        orchestrator: process.env.ORCHESTRATOR_URL ? 'configured' : 'not configured',
        memory: process.env.MEMORY_SERVICE_URL ? 'configured' : 'not configured',
        files: process.env.FILES_SERVICE_URL ? 'configured' : 'not configured',
        voice: process.env.VOICE_SERVICE_URL ? 'configured' : 'not configured',
        admin: process.env.ADMIN_SERVICE_URL ? 'configured' : 'not configured'
      }
    },
    meta: {
      requestId: req.context.requestId,
      timestamp: new Date().toISOString()
    }
  });
});

// Proxy routes
app.use('/', proxyRoutes);

// WebSocket handling
wss.on('connection', (ws, req) => {
  logger.info(`WebSocket connection established: ${req.url}`);
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      logger.debug('WebSocket message received:', data);
      
      // Echo back for now - will be handled by specific services
      ws.send(JSON.stringify({
        type: 'ack',
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      logger.error('WebSocket message error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });

  ws.on('close', () => {
    logger.info('WebSocket connection closed');
  });

  ws.on('error', (error) => {
    logger.error('WebSocket error:', error);
  });
});

// Error handling
app.use(errorLogger);
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error:', err);
  
  if (!res.headersSent) {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: process.env.NODE_ENV === 'production' 
          ? 'An internal error occurred' 
          : err.message
      },
      meta: {
        requestId: req.context?.requestId,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`
    },
    meta: {
      requestId: req.context?.requestId,
      timestamp: new Date().toISOString()
    }
  });
});

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);
  
  server.close(() => {
    logger.info('HTTP server closed');
  });

  wss.close(() => {
    logger.info('WebSocket server closed');
  });

  await redis.quit();
  logger.info('Redis connection closed');

  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
});

// Start server
server.listen(PORT, () => {
  logger.info(`=================================`);
  logger.info(`DRS AI Gateway Service`);
  logger.info(`Version: 1.0.0`);
  logger.info(`Port: ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`=================================`);
});

export default app;
