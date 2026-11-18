/**
 * 𝑫𝑹𝑺.𝑽𝑰𝑷. Polyglot Interpreter
 * Multi-language Code Execution with Full Isolation
 * 
 * Supported Languages:
 * - Python 3.11
 * - Node.js 20
 * - Go 1.21
 * - Rust 1.75
 * 
 * Features:
 * - Docker-based isolation per session
 * - Resource limits (CPU, Memory, Time)
 * - Network isolation
 * - File system restrictions
 * - Real-time output streaming
 * 
 * @module PolyglotInterpreter
 * @version 2.0.0
 * @author 𝑫𝑹𝑺.𝑽𝑰𝑷. Architect
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createLogger } from './utils/logger';
import { InterpreterController } from './routes/interpreter';
import { HealthController } from './routes/health';
import { CodeExecutor } from './services/CodeExecutor';
import { SessionManager } from './services/SessionManager';

const logger = createLogger('PolyglotInterpreter');
const app = express();
const PORT = process.env.PORT || 3023;

// Initialize services
const sessionManager = new SessionManager();
const codeExecutor = new CodeExecutor(sessionManager);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// Initialize controllers
const interpreterController = new InterpreterController(codeExecutor, sessionManager);
const healthController = new HealthController(codeExecutor);

// Routes
app.use('/api/v1/execute', interpreterController.router);
app.use('/api/v1/health', healthController.router);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: '𝑫𝑹𝑺.𝑽𝑰𝑷. Polyglot Interpreter',
    version: '2.0.0',
    status: 'operational',
    languages: [
      { name: 'python', version: '3.11', aliases: ['py'] },
      { name: 'javascript', version: '20', aliases: ['js', 'node', 'nodejs'] },
      { name: 'typescript', version: '5.3', aliases: ['ts'] },
      { name: 'go', version: '1.21', aliases: ['golang'] },
      { name: 'rust', version: '1.75', aliases: ['rs'] }
    ],
    features: [
      'docker-isolation',
      'resource-limits',
      'network-isolation',
      'real-time-streaming',
      'session-management'
    ],
    endpoints: {
      execute: '/api/v1/execute',
      health: '/api/v1/health'
    }
  });
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down...');
  await sessionManager.cleanup();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down...');
  await sessionManager.cleanup();
  process.exit(0);
});

// Start server
app.listen(PORT, async () => {
  logger.info(`💻 𝑫𝑹𝑺.𝑽𝑰𝑷. Polyglot Interpreter running on port ${PORT}`);
  
  try {
    await sessionManager.initialize();
    logger.info('✅ Session Manager initialized');
    
    await codeExecutor.initialize();
    logger.info('✅ Code Executor initialized');
    
    logger.info('💻 Polyglot Interpreter fully operational');
  } catch (error) {
    logger.error('Failed to initialize:', error);
    process.exit(1);
  }
});

export { codeExecutor, sessionManager };
