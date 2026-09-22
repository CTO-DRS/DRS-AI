import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import executeRoutes from './routes/execute';
import logger from './utils/logger';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3014;

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'code-interpreter', timestamp: new Date().toISOString() });
});

// Routes
app.use('/', executeRoutes);

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` } });
});

// Start server
app.listen(PORT, () => {
  logger.info(`=================================`);
  logger.info(`DRS AI Code Interpreter`);
  logger.info(`Version: 1.0.0`);
  logger.info(`Port: ${PORT}`);
  logger.info(`=================================`);
});

export default app;
