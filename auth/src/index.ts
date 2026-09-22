import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { testConnection, syncDatabase } from './database';
import authRoutes from './routes/auth';
import logger from './utils/logger';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || 'unknown';
  logger.info(`${req.method} ${req.path}`, { requestId });
  next();
});

// Health check
app.get('/health', async (req, res) => {
  res.json({
    status: 'healthy',
    service: 'auth',
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/', authRoutes);

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

// Initialize and start
const startServer = async () => {
  try {
    await testConnection();
    await syncDatabase();

    app.listen(PORT, () => {
      logger.info(`=================================`);
      logger.info(`DRS AI Auth Service`);
      logger.info(`Version: 1.0.0`);
      logger.info(`Port: ${PORT}`);
      logger.info(`=================================`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;
