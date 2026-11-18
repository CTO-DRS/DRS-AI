/**
 * 𝑫𝑹𝑺.𝑽𝑰𝑷. Git Automator
 * Secure Git Operations with Security Verification
 * 
 * Features:
 * - Clone repositories with security checks
 * - Commit with verification
 * - Push with authentication
 * - Branch management
 * - Pull request automation
 * - Security scanning before operations
 * 
 * @module GitAutomator
 * @version 2.0.0
 * @author 𝑫𝑹𝑺.𝑽𝑰𝑷. Architect
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createLogger } from './utils/logger';
import { GitController } from './routes/git';
import { HealthController } from './routes/health';
import { GitService } from './services/GitService';
import { SecurityScanner } from './services/SecurityScanner';

const logger = createLogger('GitAutomator');
const app = express();
const PORT = process.env.PORT || 3024;

// Initialize services
const securityScanner = new SecurityScanner();
const gitService = new GitService(securityScanner);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// Initialize controllers
const gitController = new GitController(gitService);
const healthController = new HealthController(gitService);

// Routes
app.use('/api/v1/git', gitController.router);
app.use('/api/v1/health', healthController.router);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: '𝑫𝑹𝑺.𝑽𝑰𝑷. Git Automator',
    version: '2.0.0',
    status: 'operational',
    features: [
      'clone',
      'commit',
      'push',
      'branch-management',
      'security-scanning',
      'pull-request-automation'
    ],
    endpoints: {
      git: '/api/v1/git',
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

// Start server
app.listen(PORT, async () => {
  logger.info(`🔀 𝑫𝑹𝑺.𝑽𝑰𝑷. Git Automator running on port ${PORT}`);
  
  try {
    await gitService.initialize();
    logger.info('✅ Git Service initialized');
    
    logger.info('🔀 Git Automator fully operational');
  } catch (error) {
    logger.error('Failed to initialize:', error);
    process.exit(1);
  }
});

export { gitService, securityScanner };
