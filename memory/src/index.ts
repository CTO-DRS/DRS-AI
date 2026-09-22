import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import memoryRoutes from './routes/memories';
import conversationRoutes from './routes/conversations';
import memoryService from './services/memoryService';
import { initVectorExtension } from './utils/db';
import logger from './utils/logger';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3004;

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

app.get('/health', async (req, res) => {
  res.json({ status: 'healthy', service: 'memory', timestamp: new Date().toISOString() });
});

app.use('/memories', memoryRoutes);
app.use('/conversations', conversationRoutes);

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` } });
});

const startServer = async () => {
  try {
    await initVectorExtension();
    await memoryService.initializeTables();
    
    app.listen(PORT, () => {
      logger.info(`=================================`);
      logger.info(`DRS AI Memory Service`);
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
