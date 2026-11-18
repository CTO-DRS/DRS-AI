import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import builderRoutes from './routes/builderRoutes';
import { AutoBuilderService } from './services/AutoBuilderService';
import { Logger } from './utils/logger';
import { Worker } from 'bullmq';

dotenv.config();

const app = express();
const logger = new Logger('AutoBuilderService');
const builderService = new AutoBuilderService();

const PORT = process.env.PORT || 3018;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP'
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'auto-builder',
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use('/api/builder', builderRoutes);

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Initialize service and start server
async function start() {
  try {
    await builderService.initialize();

    // Start build worker
    const buildWorker = new Worker('app-build', async (job) => {
      const { requestId } = job.data;
      logger.info(`Processing build job: ${requestId}`);

      const request = await builderService.getBuildStatus(requestId);
      if (request) {
        const result = await builderService.executeBuild(request);
        logger.info(`Build completed: ${requestId}, Success: ${result.success}`);
        return result;
      }
    }, {
      connection: {
        host: process.env.REDIS_HOST || 'redis',
        port: parseInt(process.env.REDIS_PORT || '6379')
      },
      concurrency: 2
    });

    buildWorker.on('completed', (job) => {
      logger.info(`Build job completed: ${job.id}`);
    });

    buildWorker.on('failed', (job, err) => {
      logger.error(`Build job failed: ${job?.id}`, err);
    });

    app.listen(PORT, () => {
      logger.info(`Auto Builder Service running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start service:', error);
    process.exit(1);
  }
}

start();
