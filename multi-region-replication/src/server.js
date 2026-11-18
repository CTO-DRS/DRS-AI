/**
 * DRS AI Multi-Region Active-Active Replication Service
 *
 * Phase 35 of the DRS AI transformation roadmap.
 *
 * Capabilities:
 *   1. Region Manager       — track all regions, measure latency, find best
 *   2. Replication Engine   — propagate writes (async / sync / quorum)
 *   3. Conflict Resolver    — LWW / vector-clock / merge
 *
 * @module multi-region-replication-service
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
const regionRoutes = require('./routes/regions');
const replicationRoutes = require('./routes/replication');

const RegionManager = require('./region-manager/RegionManager');
const { ConflictResolver } = require('./conflict-resolver/ConflictResolver');
const { ReplicationEngine } = require('./replication-engine/ReplicationEngine');

class MultiRegionReplicationService {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.port = Number(process.env.PORT || 3041);
    this.isInitialized = false;
    this.startTime = Date.now();
    this.initialize();
  }

  async initialize() {
    try {
      logger.info('🌍 Initializing Multi-Region Replication Service...');
      this.setupMiddleware();
      this.setupRoutes();
      await this.initializeServices();
      this.app.use(errorHandler);
      this.isInitialized = true;
      logger.info('✅ Multi-Region Replication Service initialized');
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
    this.app.use(express.json({ limit: '50mb' }));
  }

  setupRoutes() {
    this.app.use('/health', healthRoutes);
    this.app.use('/api/v1/replication/regions', regionRoutes);
    this.app.use('/api/v1/replication', replicationRoutes);
    this.app.get('/', (req, res) => {
      res.json({
        service: 'DRS AI Multi-Region Replication Service',
        version: '1.0.0',
        status: 'operational',
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
      });
    });
  }

  async initializeServices() {
    this.regionManager = new RegionManager();
    await this.regionManager.initialize();

    this.conflictResolver = new ConflictResolver();
    await this.conflictResolver.initialize();

    this.replicationEngine = new ReplicationEngine(this.regionManager, this.conflictResolver);
    await this.replicationEngine.initialize();

    this.app.locals.regionManager = this.regionManager;
    this.app.locals.replicationEngine = this.replicationEngine;
    this.app.locals.conflictResolver = this.conflictResolver;
  }

  start() {
    this.server.listen(this.port, '0.0.0.0', () => {
      logger.info(`🌍 Multi-Region Replication Service running on port ${this.port}`);
    });
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  async shutdown() {
    logger.info('🛑 Shutting down...');
    await this.regionManager?.shutdown();
    await this.replicationEngine?.shutdown();
    await this.conflictResolver?.shutdown();
    this.server.close(() => process.exit(0));
  }
}

if (process.env.NODE_ENV !== 'test') {
  const svc = new MultiRegionReplicationService();
  svc.start();
}

module.exports = MultiRegionReplicationService;
