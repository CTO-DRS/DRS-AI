import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import agentRoutes from './routes/agents';
import taskRoutes from './routes/tasks';
import taskService from './services/taskService';
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
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'orchestrator',
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/agents', agentRoutes);
app.use('/tasks', taskRoutes);

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
  logger.info(`DRS AI Orchestrator Service`);
  logger.info(`Version: 1.0.0`);
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

export default app;
