/**
 * DRS AI Federated Learning Service
 *
 * Phase 34 of the DRS AI transformation roadmap.
 *
 * Capabilities:
 *   1. Participant Manager  — register / heartbeat / submit-update
 *   2. Model Aggregator      — FedAvg / FedProx / FedSGD aggregation
 *   3. Secure Aggregation    — pairwise masking (Bonawitz et al.)
 *
 * @module federated-learning-service
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
const participantRoutes = require('./routes/participants');
const trainingRoutes = require('./routes/training');

const ParticipantManager = require('./participants/ParticipantManager');
const { ModelAggregator } = require('./model-aggregator/ModelAggregator');
const SecureAggregationService = require('./secure-aggregation/SecureAggregationService');

class FederatedLearningService {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.port = Number(process.env.PORT || 3040);
    this.isInitialized = false;
    this.startTime = Date.now();
    this.initialize();
  }

  async initialize() {
    try {
      logger.info('🌐 Initializing Federated Learning Service...');
      this.setupMiddleware();
      this.setupRoutes();
      await this.initializeServices();
      this.app.use(errorHandler);
      this.isInitialized = true;
      logger.info('✅ Federated Learning Service initialized');
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
    this.app.use(express.json({ limit: '50mb' })); // weight vectors can be large
  }

  setupRoutes() {
    this.app.use('/health', healthRoutes);
    this.app.use('/api/v1/fl/participants', participantRoutes);
    this.app.use('/api/v1/fl', trainingRoutes);
    this.app.get('/', (req, res) => {
      res.json({
        service: 'DRS AI Federated Learning Service',
        version: '1.0.0',
        status: 'operational',
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
        endpoints: ['/health', '/api/v1/fl/participants', '/api/v1/fl/rounds', '/api/v1/fl/aggregations'],
      });
    });
  }

  async initializeServices() {
    this.participantManager = new ParticipantManager();
    await this.participantManager.initialize();

    this.modelAggregator = new ModelAggregator(this.participantManager);
    await this.modelAggregator.initialize();

    this.secureAggregation = new SecureAggregationService();
    await this.secureAggregation.initialize();

    this.app.locals.participantManager = this.participantManager;
    this.app.locals.modelAggregator = this.modelAggregator;
    this.app.locals.secureAggregation = this.secureAggregation;
  }

  start() {
    this.server.listen(this.port, '0.0.0.0', () => {
      logger.info(`🌐 Federated Learning Service running on port ${this.port}`);
    });
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  async shutdown() {
    logger.info('🛑 Shutting down...');
    await this.participantManager?.shutdown();
    await this.modelAggregator?.shutdown();
    await this.secureAggregation?.shutdown();
    this.server.close(() => process.exit(0));
  }
}

if (process.env.NODE_ENV !== 'test') {
  const svc = new FederatedLearningService();
  svc.start();
}

module.exports = FederatedLearningService;
