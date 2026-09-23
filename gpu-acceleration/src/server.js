/**
 * DRS AI GPU Acceleration Service
 *
 * Phase 32 of the DRS AI transformation roadmap.
 *
 * Capabilities:
 *   1. CUDA Metrics       — real-time GPU utilization, memory, temperature, power
 *   2. VRAM Monitor       — per-model allocations with LRU eviction
 *   3. Offload Manager    — policy-driven layer-offload decisions (always_gpu / prefer_gpu / adaptive / cpu_only)
 *
 * @module gpu-acceleration-service
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
const metricsRoutes = require('./routes/metrics');
const vramRoutes = require('./routes/vram');
const offloadRoutes = require('./routes/offload');

const CudaMetricsService = require('./cuda-metrics/CudaMetricsService');
const VRamMonitor = require('./vram-monitor/VRamMonitor');
const { OffloadManager } = require('./offload-manager/OffloadManager');

class GPUAccelerationService {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.port = Number(process.env.PORT || 3038);
    this.isInitialized = false;
    this.startTime = Date.now();
    this.initialize();
  }

  async initialize() {
    try {
      logger.info('⚡ Initializing GPU Acceleration Service...');
      this.setupMiddleware();
      this.setupRoutes();
      await this.initializeServices();
      this.app.use(errorHandler);
      this.isInitialized = true;
      logger.info('✅ GPU Acceleration Service initialized');
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
    this.app.use('/api/v1/gpu/metrics', metricsRoutes);
    this.app.use('/api/v1/gpu/vram', vramRoutes);
    this.app.use('/api/v1/gpu/offload', offloadRoutes);
    this.app.get('/', (req, res) => {
      res.json({
        service: 'DRS AI GPU Acceleration Service',
        version: '1.0.0',
        status: 'operational',
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
        endpoints: ['/health', '/api/v1/gpu/metrics', '/api/v1/gpu/vram', '/api/v1/gpu/offload'],
      });
    });
  }

  async initializeServices() {
    this.cudaMetrics = new CudaMetricsService();
    await this.cudaMetrics.initialize();
    this.vramMonitor = new VRamMonitor(this.cudaMetrics);
    await this.vramMonitor.initialize();
    this.offloadManager = new OffloadManager(this.vramMonitor, this.cudaMetrics);
    await this.offloadManager.initialize();

    this.app.locals.cudaMetrics = this.cudaMetrics;
    this.app.locals.vramMonitor = this.vramMonitor;
    this.app.locals.offloadManager = this.offloadManager;
  }

  start() {
    this.server.listen(this.port, '0.0.0.0', () => {
      logger.info(`⚡ GPU Acceleration Service running on port ${this.port}`);
    });
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  async shutdown() {
    logger.info('🛑 Shutting down...');
    await this.cudaMetrics?.shutdown();
    await this.vramMonitor?.shutdown();
    await this.offloadManager?.shutdown();
    this.server.close(() => process.exit(0));
  }
}

if (process.env.NODE_ENV !== 'test') {
  const svc = new GPUAccelerationService();
  svc.start();
}

module.exports = GPUAccelerationService;
