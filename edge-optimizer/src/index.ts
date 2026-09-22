/**
 * 𝑫𝑹𝑺.𝑽𝑰𝑷. Edge Optimizer
 * Auto-Quantization & Resource Budgeting for Termux
 * 
 * Features:
 * - Auto-Quantization for Ollama models
 * - Resource Budgeting (CPU/Memory/Battery)
 * - Dynamic Thread Adjustment
 * - Battery Monitoring
 * - Performance Optimization
 * 
 * @module EdgeOptimizer
 * @version 2.0.0
 * @author 𝑫𝑹𝑺.𝑽𝑰𝑷. Architect
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createLogger } from './utils/logger';
import { OptimizerController } from './routes/optimizer';
import { HealthController } from './routes/health';
import { QuantizationService } from './services/QuantizationService';
import { ResourceMonitor } from './services/ResourceMonitor';
import { BatteryMonitor } from './services/BatteryMonitor';
import { ThreadManager } from './services/ThreadManager';

const logger = createLogger('EdgeOptimizer');
const app = express();
const PORT = process.env.PORT || 3025;

// Initialize services
const quantizationService = new QuantizationService();
const resourceMonitor = new ResourceMonitor();
const batteryMonitor = new BatteryMonitor();
const threadManager = new ThreadManager(resourceMonitor, batteryMonitor);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

app.use(express.json());

// Initialize controllers
const optimizerController = new OptimizerController(
  quantizationService,
  resourceMonitor,
  batteryMonitor,
  threadManager
);
const healthController = new HealthController(resourceMonitor, batteryMonitor);

// Routes
app.use('/api/v1/optimizer', optimizerController.router);
app.use('/api/v1/health', healthController.router);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: '𝑫𝑹𝑺.𝑽𝑰𝑷. Edge Optimizer',
    version: '2.0.0',
    status: 'operational',
    features: [
      'auto-quantization',
      'resource-budgeting',
      'battery-monitoring',
      'dynamic-thread-adjustment',
      'performance-optimization',
      'termux-optimization'
    ],
    endpoints: {
      optimizer: '/api/v1/optimizer',
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
  await resourceMonitor.stop();
  await batteryMonitor.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down...');
  await resourceMonitor.stop();
  await batteryMonitor.stop();
  process.exit(0);
});

// Start server
app.listen(PORT, async () => {
  logger.info(`⚡ 𝑫𝑹𝑺.𝑽𝑰𝑷. Edge Optimizer running on port ${PORT}`);
  
  try {
    await quantizationService.initialize();
    logger.info('✅ Quantization Service initialized');
    
    await resourceMonitor.initialize();
    logger.info('✅ Resource Monitor initialized');
    
    await batteryMonitor.initialize();
    logger.info('✅ Battery Monitor initialized');
    
    await threadManager.initialize();
    logger.info('✅ Thread Manager initialized');
    
    logger.info('⚡ Edge Optimizer fully operational');
  } catch (error) {
    logger.error('Failed to initialize:', error);
    process.exit(1);
  }
});

export { quantizationService, resourceMonitor, batteryMonitor, threadManager };
