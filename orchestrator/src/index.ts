import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import agentRoutes from './routes/agents';
import taskRoutes from './routes/tasks';
import teamRoutes from './routes/teams';
import planRoutes from './routes/plans';
import approvalRoutes from './routes/approvals';
import mcpRoutes from './routes/mcp';
import taskService from './services/taskService';
import approvalService from './services/approvalService';
import persistence from './services/persistence';
import eventBus from './services/eventBus';
import { testConnection, syncDatabase } from './database';
import logger from './utils/logger';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3003;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', async (req, res) => {
  const health: Record<string, any> = {
    status: 'healthy',
    service: 'orchestrator',
    version: '2.0.0',
    features: ['teams', 'planner', 'approvals', 'mcp', 'persistence'],
    timestamp: new Date().toISOString()
  };

  try {
    const { default: sequelize } = await import('./database');
    await sequelize.authenticate();
    health.database = 'connected';
  } catch {
    health.database = 'disconnected';
    health.status = 'degraded';
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Routes
app.use('/agents', agentRoutes);
app.use('/tasks', taskRoutes);
app.use('/teams', teamRoutes);
app.use('/plans', planRoutes);
app.use('/approvals', approvalRoutes);
app.use('/mcp', mcpRoutes);

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`
    }
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`=================================`);
  logger.info(`DRS AI Orchestrator Service v2`);
  logger.info(`Features: teams | planner | approvals | MCP | persistence`);
  logger.info(`Port: ${PORT}`);
  logger.info(`=================================`);
});

// Start queue processor
setInterval(async () => {
  try {
    await taskService.processQueue();
  } catch (error) {
    logger.error('Queue processing error:', error);
  }
}, 1000);

// Periodic approval expiry sweep (every 10 minutes)
setInterval(async () => {
  try {
    await approvalService.expireStale();
  } catch (error) {
    logger.error('Approval expiry sweep failed:', error);
  }
}, 10 * 60 * 1000);

// Boot: connect DB, sync models, recover queued tasks
(async () => {
  try {
    await testConnection();
    await syncDatabase();
    await persistence.recoverQueuedTasks();
  } catch (error: any) {
    logger.error(`Boot persistence init failed: ${error.message}. Redis-only mode active.`);
  }
})();

export default app;
