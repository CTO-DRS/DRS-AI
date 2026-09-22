/**
 * DRS AI Deep Cultural Localization Service
 *
 * Features:
 * - Arabic Dialect Support (Moroccan, Gulf, Egyptian, Levantine)
 * - Full RTL Support
 * - Cultural Context Awareness
 * - Local Customs Integration
 * - Transliteration & Diacritics
 * - Cultural Sensitivity Analysis
 *
 * @module cultural-localization-service
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

const dialectRoutes = require('./routes/dialects');
const rtlRoutes = require('./routes/rtl');
const culturalRoutes = require('./routes/cultural');
const customsRoutes = require('./routes/customs');
const healthRoutes = require('./routes/health');

const DialectService = require('./dialects/DialectService');
const RTLService = require('./rtl/RTLService');
const CulturalContextService = require('./cultural-context/CulturalContextService');
const LocalCustomsService = require('./local-customs/LocalCustomsService');

class CulturalLocalizationService {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.port = process.env.PORT || 3036;

    this.dialectService = null;
    this.rtlService = null;
    this.culturalContextService = null;
    this.localCustomsService = null;

    this.isInitialized = false;
    this.startTime = Date.now();

    this.initialize();
  }

  async initialize() {
    try {
      logger.info('🌍 Initializing Deep Cultural Localization Service...');

      this.setupMiddleware();
      this.setupRoutes();
      await this.initializeServices();
      this.setupErrorHandling();

      this.isInitialized = true;
      logger.info('✅ Deep Cultural Localization Service initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize Cultural Localization Service:', error);
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
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  }

  setupRoutes() {
    const swaggerOptions = {
      definition: {
        openapi: '3.0.0',
        info: {
          title: 'DRS AI Deep Cultural Localization API',
          version: '1.0.0',
          description: `
            # Deep Cultural Localization Service

            ## Features
            - 🗣️ **Arabic Dialects**: Moroccan, Gulf, Egyptian, Levantine support
            - ↔️ **Full RTL**: Complete right-to-left support
            - 🕌 **Cultural Context**: Islamic calendar, prayer times, holidays
            - 🎉 **Local Customs**: Regional customs and etiquette
          `,
        },
        servers: [{ url: `http://localhost:${this.port}` }],
      },
      apis: ['./src/routes/*.js'],
    };

    const specs = swaggerJsdoc(swaggerOptions);
    this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

    this.app.use('/api/v1/dialects', dialectRoutes);
    this.app.use('/api/v1/rtl', rtlRoutes);
    this.app.use('/api/v1/cultural', culturalRoutes);
    this.app.use('/api/v1/customs', customsRoutes);
    this.app.use('/health', healthRoutes);

    this.app.get('/', (req, res) => {
      res.json({
        service: 'DRS AI Deep Cultural Localization Service',
        version: '1.0.0',
        status: 'operational',
        features: ['arabic-dialects', 'rtl', 'cultural-context', 'local-customs'],
        documentation: '/api-docs',
      });
    });
  }

  async initializeServices() {
    logger.info('🔧 Initializing cultural localization services...');

    this.dialectService = new DialectService();
    await this.dialectService.initialize();

    this.rtlService = new RTLService();
    await this.rtlService.initialize();

    this.culturalContextService = new CulturalContextService();
    await this.culturalContextService.initialize();

    this.localCustomsService = new LocalCustomsService();
    await this.localCustomsService.initialize();

    this.app.locals.dialectService = this.dialectService;
    this.app.locals.rtlService = this.rtlService;
    this.app.locals.culturalContextService = this.culturalContextService;
    this.app.locals.localCustomsService = this.localCustomsService;

    logger.info('✅ All cultural localization services initialized');
  }

  setupErrorHandling() {
    this.app.use(errorHandler);
  }

  start() {
    this.server.listen(this.port, () => {
      logger.info(`🌍 Cultural Localization Service running on port ${this.port}`);
      logger.info(`📚 API Documentation: http://localhost:${this.port}/api-docs`);
    });

    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  async shutdown() {
    logger.info('🛑 Shutting down Cultural Localization Service...');
    await this.dialectService?.shutdown();
    await this.rtlService?.shutdown();
    await this.culturalContextService?.shutdown();
    await this.localCustomsService?.shutdown();
    this.server.close(() => {
      logger.info('✅ Cultural Localization Service shutdown complete');
      process.exit(0);
    });
  }
}

if (process.env.NODE_ENV !== 'test') {
  const service = new CulturalLocalizationService();
  service.start();
}

module.exports = CulturalLocalizationService;
