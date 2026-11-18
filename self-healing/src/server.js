/**
 * DRS AI Self-Healing & Evolution Service
 *
 * Features:
 * - Self-Coding Evolution: Auto code repair and optimization
 * - Code Telepathy: Intent-aware code suggestions
 * - Auto-PR: Automatic pull request generation
 * - Evolution Tracker: Track codebase evolution over time
 * - GitHub/GitLab integration
 *
 * @module self-healing-service
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

const selfCodingRoutes = require('./routes/self-coding');
const codeTelepathyRoutes = require('./routes/code-telepathy');
const autoPRRoutes = require('./routes/auto-pr');
const evolutionRoutes = require('./routes/evolution');
const healthRoutes = require('./routes/health');

const SelfCodingService = require('./self-coding/SelfCodingService');
const CodeTelepathyService = require('./code-telepathy/CodeTelepathyService');
const AutoPRService = require('./auto-pr/AutoPRService');
const EvolutionTrackerService = require('./evolution-tracker/EvolutionTrackerService');

class SelfHealingService {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.port = process.env.PORT || 3035;

    this.selfCodingService = null;
    this.codeTelepathyService = null;
    this.autoPRService = null;
    this.evolutionTracker = null;

    this.isInitialized = false;
    this.startTime = Date.now();

    this.initialize();
  }

  async initialize() {
    try {
      logger.info('🔧 Initializing Self-Healing & Evolution Service...');

      this.setupMiddleware();
      this.setupRoutes();
      await this.initializeServices();
      this.setupErrorHandling();

      this.isInitialized = true;
      logger.info('✅ Self-Healing & Evolution Service initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize Self-Healing Service:', error);
      process.exit(1);
    }
  }

  setupMiddleware() {
    this.app.use(helmet());
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
    }));
    this.app.use(compression());
    this.app.use(morgan('combined', { stream }));
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  }

  setupRoutes() {
    const swaggerOptions = {
      definition: {
        openapi: '3.0.0',
        info: {
          title: 'DRS AI Self-Healing & Evolution API',
          version: '1.0.0',
          description: `
            # Self-Healing & Evolution Service

            ## Features
            - 🔧 **Self-Coding Evolution**: Auto code repair and optimization
            - 🧠 **Code Telepathy**: Intent-aware code suggestions
            - 📥 **Auto-PR**: Automatic pull request generation
            - 📈 **Evolution Tracker**: Track codebase evolution over time
          `,
        },
        servers: [{ url: `http://localhost:${this.port}` }],
      },
      apis: ['./src/routes/*.js'],
    };

    const specs = swaggerJsdoc(swaggerOptions);
    this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

    this.app.use('/api/v1/self-coding', selfCodingRoutes);
    this.app.use('/api/v1/telepathy', codeTelepathyRoutes);
    this.app.use('/api/v1/auto-pr', autoPRRoutes);
    this.app.use('/api/v1/evolution', evolutionRoutes);
    this.app.use('/health', healthRoutes);

    this.app.get('/', (req, res) => {
      res.json({
        service: 'DRS AI Self-Healing & Evolution Service',
        version: '1.0.0',
        status: 'operational',
        features: ['self-coding', 'code-telepathy', 'auto-pr', 'evolution-tracker'],
        documentation: '/api-docs',
      });
    });
  }

  async initializeServices() {
    logger.info('🔧 Initializing self-healing services...');

    this.selfCodingService = new SelfCodingService();
    await this.selfCodingService.initialize();

    this.codeTelepathyService = new CodeTelepathyService();
    await this.codeTelepathyService.initialize();

    this.autoPRService = new AutoPRService({
      selfCodingService: this.selfCodingService,
    });
    await this.autoPRService.initialize();

    this.evolutionTracker = new EvolutionTrackerService();
    await this.evolutionTracker.initialize();

    this.app.locals.selfCodingService = this.selfCodingService;
    this.app.locals.codeTelepathyService = this.codeTelepathyService;
    this.app.locals.autoPRService = this.autoPRService;
    this.app.locals.evolutionTracker = this.evolutionTracker;

    logger.info('✅ All self-healing services initialized');
  }

  setupErrorHandling() {
    this.app.use(errorHandler);
  }

  start() {
    this.server.listen(this.port, () => {
      logger.info(`🔧 Self-Healing & Evolution Service running on port ${this.port}`);
      logger.info(`📚 API Documentation: http://localhost:${this.port}/api-docs`);
    });

    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  async shutdown() {
    logger.info('🛑 Shutting down Self-Healing & Evolution Service...');
    await this.selfCodingService?.shutdown();
    await this.codeTelepathyService?.shutdown();
    await this.autoPRService?.shutdown();
    await this.evolutionTracker?.shutdown();
    this.server.close(() => {
      logger.info('✅ Self-Healing & Evolution Service shutdown complete');
      process.exit(0);
    });
  }
}

if (process.env.NODE_ENV !== 'test') {
  const service = new SelfHealingService();
  service.start();
}

module.exports = SelfHealingService;
