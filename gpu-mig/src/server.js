/**
 * DRS AI GPU MIG / Time-Slicing Service
 *
 * Phase 38 of the DRS AI transformation roadmap.
 *
 * Capabilities:
 *   1. MIG Manager       — partition NVIDIA Ampere/Hopper GPUs into isolated MIG instances
 *   2. Time-Slice Manager — share non-MIG-capable GPUs via time-slicing with fairness tracking
 *
 * @module gpu-mig-service
 * @version 1.0.0
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const { createServer } = require('http');

const { logger, stream } = require('./utils/logger');
const { errorHandler } = require('./utils/errorHandler');

const healthRoutes = require('./routes/health');
const migRoutes = require('./routes/mig');
const tsRoutes = require('./routes/timeslice');

const MigManager = require('./mig-manager/MigManager');
const TimeSliceManager = require('./timeslice-manager/TimeSliceManager');

class GpuMigService {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.port = Number(process.env.PORT || 3043);
    this.isInitialized = false;
    this.startTime = Date.now();
    this.initialize();
  }

  async initialize() {
    try {
      logger.info('🔶 Initializing GPU MIG / Time-Slicing Service...');
      this.setupMiddleware();
      this.setupRoutes();
      await this.initializeServices();
      this.app.use(errorHandler);
      this.isInitialized = true;
      logger.info('✅ GPU MIG Service initialized');
    } catch (e) {
      logger.error('❌ Init failed:', e);
      process.exit(1);
    }
  }

  setupMiddleware() {
    this.app.use(helmet());
    this.app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || ['*'] }));
    this.app.use(compression());
    this.app.use(morgan('combined', { stream }));
    this.app.use(express.json({ limit: '5mb' }));
  }

  setupRoutes() {
    this.app.use('/health', healthRoutes);
    this.app.use('/api/v1/gpu-mig', migRoutes);
    this.app.use('/api/v1/gpu-ts', tsRoutes);
    this.app.get('/', (req, res) => {
      res.json({
        service: 'DRS AI GPU MIG / Time-Slicing Service',
        version: '1.0.0',
        status: 'operational',
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
      });
    });
  }

  async initializeServices() {
    this.migManager = new MigManager();
    await this.migManager.initialize();

    this.timeSliceManager = new TimeSliceManager();
    await this.timeSliceManager.initialize();

    this.app.locals.migManager = this.migManager;
    this.app.locals.timeSliceManager = this.timeSliceManager;
  }

  start() {
    this.server.listen(this.port, '0.0.0.0', () => {
      logger.info(`🔶 GPU MIG Service running on port ${this.port}`);
    });
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  async shutdown() {
    logger.info('🛑 Shutting down...');
    await this.migManager?.shutdown();
    await this.timeSliceManager?.shutdown();
    this.server.close(() => process.exit(0));
  }
}

if (process.env.NODE_ENV !== 'test') {
  const svc = new GpuMigService();
  svc.start();
}

module.exports = GpuMigService;
