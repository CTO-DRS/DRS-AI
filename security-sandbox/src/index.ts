/**
 * 𝑫𝑹𝑺.𝑽𝑰𝑷. Advanced Security Sandbox
 * Docker-in-Docker Isolated Execution Environment
 * 
 * Features:
 * - Docker-in-Docker containerization for complete isolation
 * - Real-time syscall monitoring using ptrace/seccomp
 * - Network traffic analysis for data leakage prevention
 * - Behavioral analysis engine for threat detection
 * - Resource limits and quotas enforcement
 * 
 * @module SecuritySandbox
 * @version 2.0.0
 * @author 𝑫𝑹𝑺.𝑽𝑰𝑷. Architect
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createLogger } from './utils/logger';
import { metricsMiddleware, metricsEndpoint } from './utils/metrics';
import { errorHandler } from './utils/errorHandler';
import { SandboxController } from './routes/sandbox';
import { MonitoringController } from './routes/monitoring';
import { HealthController } from './routes/health';
import { DockerManager } from './services/DockerManager';
import { SyscallMonitor } from './services/SyscallMonitor';
import { NetworkMonitor } from './services/NetworkMonitor';
import { BehavioralEngine } from './services/BehavioralEngine';
import { RateLimiter } from './utils/rateLimiter';

const logger = createLogger('SecuritySandbox');
const app = express();
const PORT = process.env.PORT || 3020;

// Initialize core services
const dockerManager = new DockerManager();
const syscallMonitor = new SyscallMonitor();
const networkMonitor = new NetworkMonitor();
const behavioralEngine = new BehavioralEngine();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Metrics middleware
app.use(metricsMiddleware);

// Rate limiting
const rateLimiter = new RateLimiter({
  windowMs: 60000, // 1 minute
  maxRequests: 30
});
app.use(rateLimiter.middleware);

// Initialize controllers
const sandboxController = new SandboxController(
  dockerManager,
  syscallMonitor,
  networkMonitor,
  behavioralEngine
);
const monitoringController = new MonitoringController(
  syscallMonitor,
  networkMonitor,
  behavioralEngine
);
const healthController = new HealthController(dockerManager);

// Routes
app.use('/api/v1/sandbox', sandboxController.router);
app.use('/api/v1/monitoring', monitoringController.router);
app.use('/api/v1/health', healthController.router);
app.use('/metrics', metricsEndpoint);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: '𝑫𝑹𝑺.𝑽𝑰𝑷. Security Sandbox',
    version: '2.0.0',
    status: 'operational',
    features: [
      'docker-in-docker-isolation',
      'syscall-monitoring',
      'network-analysis',
      'behavioral-detection',
      'resource-enforcement'
    ],
    endpoints: {
      sandbox: '/api/v1/sandbox',
      monitoring: '/api/v1/monitoring',
      health: '/api/v1/health',
      metrics: '/metrics'
    }
  });
});

// Error handling
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await dockerManager.cleanup();
  await syscallMonitor.cleanup();
  await networkMonitor.cleanup();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await dockerManager.cleanup();
  await syscallMonitor.cleanup();
  await networkMonitor.cleanup();
  process.exit(0);
});

// Start server
app.listen(PORT, async () => {
  logger.info(`🔒 𝑫𝑹𝑺.𝑽𝑰𝑷. Security Sandbox running on port ${PORT}`);
  
  try {
    // Initialize Docker connection
    await dockerManager.initialize();
    logger.info('✅ Docker connection established');
    
    // Initialize monitoring services
    await syscallMonitor.initialize();
    logger.info('✅ Syscall monitor initialized');
    
    await networkMonitor.initialize();
    logger.info('✅ Network monitor initialized');
    
    await behavioralEngine.initialize();
    logger.info('✅ Behavioral engine initialized');
    
    logger.info('🛡️ Security Sandbox fully operational');
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    process.exit(1);
  }
});

export { dockerManager, syscallMonitor, networkMonitor, behavioralEngine };
