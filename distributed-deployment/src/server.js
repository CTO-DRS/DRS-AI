/**
 * DRS AI Distributed Deployment Service
 *
 * Phase 33 of the DRS AI transformation roadmap.
 *
 * Capabilities:
 *   1. Node Registry     — register / heartbeat / deregister cluster nodes
 *   2. Task Router       — pick best node for each task (round_robin / least_loaded / capacity_first / affinity)
 *   3. Cluster Manager   — topology, failover, drain
 *
 * @module distributed-deployment-service
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
const nodeRoutes = require('./routes/nodes');
const taskRoutes = require('./routes/tasks');
const clusterRoutes = require('./routes/cluster');

const NodeRegistry = require('./node-registry/NodeRegistry');
const { TaskRouter } = require('./task-router/TaskRouter');
const ClusterManager = require('./cluster-manager/ClusterManager');

class DistributedDeploymentService {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.port = Number(process.env.PORT || 3039);
    this.isInitialized = false;
    this.startTime = Date.now();
    this.initialize();
  }

  async initialize() {
    try {
      logger.info('🌐 Initializing Distributed Deployment Service...');
      this.setupMiddleware();
      this.setupRoutes();
      await this.initializeServices();
      this.app.use(errorHandler);
      this.isInitialized = true;
      logger.info('✅ Distributed Deployment Service initialized');
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
    this.app.use('/api/v1/distributed/nodes', nodeRoutes);
    this.app.use('/api/v1/distributed/tasks', taskRoutes);
    this.app.use('/api/v1/distributed/cluster', clusterRoutes);
    this.app.get('/', (req, res) => {
      res.json({
        service: 'DRS AI Distributed Deployment Service',
        version: '1.0.0',
        status: 'operational',
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
        endpoints: ['/health', '/api/v1/distributed/nodes', '/api/v1/distributed/tasks', '/api/v1/distributed/cluster'],
      });
    });
  }

  async initializeServices() {
    this.nodeRegistry = new NodeRegistry();
    await this.nodeRegistry.initialize();

    this.taskRouter = new TaskRouter(this.nodeRegistry);
    await this.taskRouter.initialize();

    this.clusterManager = new ClusterManager(this.nodeRegistry, this.taskRouter);
    await this.clusterManager.initialize();

    this.app.locals.nodeRegistry = this.nodeRegistry;
    this.app.locals.taskRouter = this.taskRouter;
    this.app.locals.clusterManager = this.clusterManager;
  }

  start() {
    this.server.listen(this.port, '0.0.0.0', () => {
      logger.info(`🌐 Distributed Deployment Service running on port ${this.port}`);
    });
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  async shutdown() {
    logger.info('🛑 Shutting down...');
    await this.nodeRegistry?.shutdown();
    await this.taskRouter?.shutdown();
    await this.clusterManager?.shutdown();
    this.server.close(() => process.exit(0));
  }
}

if (process.env.NODE_ENV !== 'test') {
  const svc = new DistributedDeploymentService();
  svc.start();
}

module.exports = DistributedDeploymentService;
