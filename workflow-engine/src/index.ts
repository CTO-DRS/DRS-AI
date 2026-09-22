import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import workflowRoutes from './routes/workflows';
import workflowEngine from './engine/WorkflowEngine';
import logger from './utils/logger';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3011;

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'workflow-engine', timestamp: new Date().toISOString() });
});

// Routes
app.use('/', workflowRoutes);

// Webhook endpoint for external triggers
app.post('/webhook/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params;
    const redis = (await import('./utils/redis')).default;
    const data = await redis.get(`workflow:${workflowId}`);

    if (!data) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Workflow not found' } });
    }

    const workflow = JSON.parse(data);
    
    // Verify webhook secret if configured
    if (workflow.trigger.config.secret) {
      const secret = req.headers['x-webhook-secret'];
      if (secret !== workflow.trigger.config.secret) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid secret' } });
      }
    }

    const executionId = await workflowEngine.triggerWorkflow(workflow, req.body);
    res.json({ success: true, data: { executionId } });
  } catch (error: any) {
    logger.error('Webhook error:', error);
    res.status(500).json({ success: false, error: { code: 'WEBHOOK_FAILED', message: error.message } });
  }
});

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
  logger.info(`DRS AI Workflow Engine`);
  logger.info(`Version: 1.0.0`);
  logger.info(`Port: ${PORT}`);
  logger.info(`=================================`);
});

export default app;
