/**
 * DRS AI Self-Awareness & Transparency Service
 *
 * Phase 29 of the DRS AI transformation roadmap.
 *
 * Capabilities:
 *   1. Digital Health Reports   – continuous monitoring of all 33 microservices
 *   2. Epistemic Uncertainty     – confidence scoring + calibration for every model output
 *   3. Transparency Dashboard    – accountability ledger, model cards, data lineage, compliance
 *   4. Decision Explanation      – human-readable explanations for every AI decision
 *
 * @module self-awareness-service
 * @version 1.0.0
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const { createServer } = require('http');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const { logger, stream } = require('./utils/logger');
const { errorHandler } = require('./utils/errorHandler');

const healthRoutes = require('./routes/health');
const digitalHealthRoutes = require('./routes/digital-health');
const uncertaintyRoutes = require('./routes/uncertainty');
const transparencyRoutes = require('./routes/transparency');
const explanationRoutes = require('./routes/explanations');

const DigitalHealthService = require('./digital-health/DigitalHealthService');
const EpistemicUncertaintyService = require('./epistemic-uncertainty/EpistemicUncertaintyService');
const TransparencyDashboardService = require('./transparency/TransparencyDashboardService');
const DecisionExplanationService = require('./decision-explanation/DecisionExplanationService');

class SelfAwarenessService {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.port = Number(process.env.PORT || 3037);

    this.digitalHealthService = null;
    this.epistemicUncertaintyService = null;
    this.transparencyDashboardService = null;
    this.decisionExplanationService = null;

    this.isInitialized = false;
    this.startTime = Date.now();

    this.initialize();
  }

  async initialize() {
    try {
      logger.info('🧭 Initializing Self-Awareness & Transparency Service...');

      this.setupMiddleware();
      this.setupRoutes();
      await this.initializeServices();
      this.setupErrorHandling();

      this.isInitialized = true;
      logger.info('✅ Self-Awareness & Transparency Service initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize Self-Awareness Service:', error);
      process.exit(1);
    }
  }

  setupMiddleware() {
    this.app.use(helmet());
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
      credentials: true,
    }));
    this.app.use(compression());
    this.app.use(morgan('combined', { stream }));
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  }

  setupRoutes() {
    const swaggerOptions = {
      definition: {
        openapi: '3.0.0',
        info: {
          title: 'DRS AI Self-Awareness & Transparency API',
          version: '1.0.0',
          description: `
            # Self-Awareness & Transparency Service

            ## Capabilities
            - 🏥 **Digital Health**: Continuous monitoring of all DRS AI microservices
            - 🧠 **Epistemic Uncertainty**: Confidence scoring & calibration
            - 🔍 **Transparency Dashboard**: Accountability ledger, model cards, lineage
            - 💡 **Decision Explanation**: Human-readable explanations for AI decisions
          `,
        },
        servers: [{ url: `http://localhost:${this.port}` }],
      },
      apis: ['./src/routes/*.js'],
    };

    const specs = swaggerJsdoc(swaggerOptions);
    this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

    this.app.use('/health', healthRoutes);
    this.app.use('/api/v1/health', digitalHealthRoutes);
    this.app.use('/api/v1/uncertainty', uncertaintyRoutes);
    this.app.use('/api/v1/transparency', transparencyRoutes);
    this.app.use('/api/v1/explanations', explanationRoutes);

    this.app.get('/', (req, res) => {
      res.json({
        service: 'DRS AI Self-Awareness & Transparency Service',
        version: '1.0.0',
        status: 'operational',
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
        capabilities: ['digital-health', 'epistemic-uncertainty', 'transparency-dashboard', 'decision-explanation'],
        documentation: '/api-docs',
        health: '/health',
      });
    });

    // Backwards-compatible alias for the old v0 surface
    this.app.get('/api/v1/self-awareness', (req, res) => {
      res.json({
        status: 'operational',
        transparency: process.env.TRANSPARENCY_LEVEL || 'high',
        epistemicUncertainty: process.env.EPISTEMIC_UNCERTAINTY === 'true',
        services: {
          digitalHealth: this.digitalHealthService?.isInitialized,
          epistemicUncertainty: this.epistemicUncertaintyService?.isInitialized,
          transparency: this.transparencyDashboardService?.isInitialized,
          decisionExplanation: this.decisionExplanationService?.isInitialized,
        },
      });
    });
  }

  async initializeServices() {
    logger.info('🔧 Initializing sub-services...');

    this.digitalHealthService = new DigitalHealthService();
    await this.digitalHealthService.initialize();

    this.epistemicUncertaintyService = new EpistemicUncertaintyService();
    await this.epistemicUncertaintyService.initialize();

    this.transparencyDashboardService = new TransparencyDashboardService();
    await this.transparencyDashboardService.initialize();

    this.decisionExplanationService = new DecisionExplanationService();
    await this.decisionExplanationService.initialize();

    this.app.locals.digitalHealthService = this.digitalHealthService;
    this.app.locals.epistemicUncertaintyService = this.epistemicUncertaintyService;
    this.app.locals.transparencyDashboardService = this.transparencyDashboardService;
    this.app.locals.decisionExplanationService = this.decisionExplanationService;

    logger.info('✅ All sub-services initialized');
  }

  setupErrorHandling() {
    this.app.use(errorHandler);
  }

  start() {
    this.server.listen(this.port, '0.0.0.0', () => {
      logger.info(`🧭 Self-Awareness & Transparency Service running on port ${this.port}`);
      logger.info(`📚 API Documentation: http://localhost:${this.port}/api-docs`);
    });

    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  async shutdown() {
    logger.info('🛑 Shutting down Self-Awareness Service...');
    await this.digitalHealthService?.shutdown();
    await this.epistemicUncertaintyService?.shutdown();
    await this.transparencyDashboardService?.shutdown();
    await this.decisionExplanationService?.shutdown();
    this.server.close(() => {
      logger.info('✅ Self-Awareness Service shutdown complete');
      process.exit(0);
    });
  }
}

if (process.env.NODE_ENV !== 'test') {
  const service = new SelfAwarenessService();
  service.start();
}

module.exports = SelfAwarenessService;
