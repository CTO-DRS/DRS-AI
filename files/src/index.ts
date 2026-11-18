import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import fileRoutes from './routes/files';
import minioService from './services/minioService';
import logger from './utils/logger';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3005;

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'files', timestamp: new Date().toISOString() });
});

app.use('/', fileRoutes);

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
});

const startServer = async () => {
  try {
    await minioService.initializeBucket();
    
    app.listen(PORT, () => {
      logger.info(`=================================`);
      logger.info(`DRS AI Files Service`);
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
