import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import agentRoutes from './routes/agents';
import autoAgentManager from './agents/AutoAgentManager';
import logger from './utils/logger';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3013;

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'auto-agent', timestamp: new Date().toISOString() });
});

// Routes
app.use('/', agentRoutes);

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
app.listen(PORT, async () => {
  logger.info(`=================================`);
  logger.info(`DRS AI Auto Agent System`);
  logger.info(`Version: 1.0.0`);
  logger.info(`Port: ${PORT}`);
  logger.info(`=================================`);

  // Load and start enabled agents
  try {
    const agents = await autoAgentManager.getAllAgents();
    for (const agent of agents) {
      if (agent.enabled) {
        try {
          await autoAgentManager.startAgent(agent);
          logger.info(`Auto-started agent: ${agent.name}`);
        } catch (error) {
          logger.error(`Failed to auto-start agent ${agent.id}:`, error);
        }
      }
    }
  } catch (error) {
    logger.error('Failed to load agents:', error);
  }
});

export default app;
