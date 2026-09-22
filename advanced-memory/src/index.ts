import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import memoryRoutes from './routes/memoryRoutes';
import { AdvancedMemoryService } from './services/AdvancedMemoryService';
import { Logger } from './utils/logger';

dotenv.config();

const app = express();
const logger = new Logger('AdvancedMemoryService');
const memoryService = new AdvancedMemoryService();

const PORT = process.env.PORT || 3016;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
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
    service: 'advanced-memory',
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use('/api/memory', memoryRoutes);

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
    await memoryService.initialize();

    app.listen(PORT, () => {
      logger.info(`Advanced Memory Service running on port ${PORT}`);
    });

    // Schedule periodic memory consolidation
    setInterval(async () => {
      try {
        logger.info('Running scheduled memory consolidation');
        // Consolidate memories for all users
        const users = await getAllUsers();
        for (const userId of users) {
          await memoryService.consolidateMemories(userId);
        }
      } catch (error) {
        logger.error('Memory consolidation error:', error);
      }
    }, 24 * 60 * 60 * 1000); // Daily

    // Schedule periodic cleanup
    setInterval(async () => {
      try {
        logger.info('Running scheduled memory cleanup');
        await memoryService.cleanupExpiredMemories();
      } catch (error) {
        logger.error('Memory cleanup error:', error);
      }
    }, 60 * 60 * 1000); // Hourly

  } catch (error) {
    logger.error('Failed to start service:', error);
    process.exit(1);
  }
}

async function getAllUsers(): Promise<string[]> {
  // This would typically query the auth service
  // For now, return an empty array
  return [];
}

start();
