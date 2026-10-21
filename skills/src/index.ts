import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import skillsRouter from './routes/skills';
import skillService from './services/skillService';
import logger from './utils/logger';
import redis from './utils/redis';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3044;

app.set('trust proxy', true);

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '25mb' }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'skills',
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/', skillsRouter);

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({
      success: false,
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Uploaded archive exceeds the 50MB limit'
      }
    });
    return;
  }
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
const server = app.listen(PORT, () => {
  logger.info(`=================================`);
  logger.info(`DRS AI Skills Service`);
  logger.info(`Version: 1.0.0`);
  logger.info(`Port: ${PORT}`);
  logger.info(`Storage: ${skillService.getSkillsDir()}`);
  logger.info(`=================================`);
});

// Ensure storage exists and recover the Redis index from disk (non-blocking)
skillService
  .ensureStorage()
  .then(() => skillService.syncIndexFromDisk())
  .then((restored) => {
    if (restored > 0) {
      logger.info(`Re-indexed ${restored} skill package(s) from disk`);
    }
  })
  .catch((error) => {
    logger.error('Storage initialization failed:', error);
  });

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  logger.warn(`${signal} received — shutting down skills service`);
  server.close(() => process.exit(0));
  redis.disconnect();
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

export default app;
