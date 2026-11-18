/**
 * DRS AI Human-Centric Interaction Service
 *
 * Features:
 * - Smart Glasses Integration (Ray-Ban Meta)
 * - AI-Augmented Reality
 * - Dual-Brain UI (Analytical + Creative)
 * - Voice-First Interface
 * - Gesture & Eye Tracking
 *
 * @module human-interaction-service
 * @version 1.0.0
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const { logger, stream } = require('./utils/logger');
const { errorHandler } = require('./utils/errorHandler');

const arRoutes = require('./routes/ar');
const dualBrainRoutes = require('./routes/dual-brain');
const voiceRoutes = require('./routes/voice');
const gestureRoutes = require('./routes/gesture');
const glassesRoutes = require('./routes/glasses');
const healthRoutes = require('./routes/health');

const ARService = require('./ar-vr/ARService');
const DualBrainService = require('./dual-brain/DualBrainService');
const VoiceFirstService = require('./voice-first/VoiceFirstService');
const GestureService = require('./gestures/GestureService');
const SmartGlassesService = require('./smart-glasses/SmartGlassesService');
const WebSocketManager = require('./utils/WebSocketManager');

class HumanInteractionService {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server, path: '/ws/interaction' });
    this.port = process.env.PORT || 3034;

    this.arService = null;
    this.dualBrainService = null;
    this.voiceService = null;
    this.gestureService = null;
    this.glassesService = null;
    this.wsManager = null;

    this.isInitialized = false;
    this.startTime = Date.now();

    this.initialize();
  }

  async initialize() {
    try {
      logger.info('🧑‍💻 Initializing Human-Centric Interaction Service...');

      this.setupMiddleware();
      this.setupRoutes();
      this.setupWebSocket();
      await this.initializeServices();
      this.setupErrorHandling();

      this.isInitialized = true;
      logger.info('✅ Human-Centric Interaction Service initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize Human Interaction Service:', error);
      process.exit(1);
    }
  }

  setupMiddleware() {
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'", "ws:", "wss:"],
        },
      },
    }));
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
          title: 'DRS AI Human-Centric Interaction API',
          version: '1.0.0',
          description: `
            # Human-Centric Interaction Service

            ## Features
            - 🥽 **Smart Glasses**: Ray-Ban Meta & compatible glasses
            - 🌐 **AI-Augmented Reality**: Overlay AI insights on real world
            - 🧠 **Dual-Brain UI**: Analytical + Creative modes
            - 🎙️ **Voice-First**: Conversational AI interface
            - 👋 **Gesture Control**: Hand & eye tracking
          `,
        },
        servers: [{ url: `http://localhost:${this.port}` }],
      },
      apis: ['./src/routes/*.js'],
    };

    const specs = swaggerJsdoc(swaggerOptions);
    this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

    this.app.use('/api/v1/ar', arRoutes);
    this.app.use('/api/v1/dual-brain', dualBrainRoutes);
    this.app.use('/api/v1/voice', voiceRoutes);
    this.app.use('/api/v1/gesture', gestureRoutes);
    this.app.use('/api/v1/glasses', glassesRoutes);
    this.app.use('/health', healthRoutes);

    this.app.get('/', (req, res) => {
      res.json({
        service: 'DRS AI Human-Centric Interaction Service',
        version: '1.0.0',
        status: 'operational',
        features: ['smart-glasses', 'ai-ar', 'dual-brain', 'voice-first', 'gesture-control'],
        documentation: '/api-docs',
        websocket: '/ws/interaction',
      });
    });
  }

  setupWebSocket() {
    this.wsManager = new WebSocketManager(this.wss);
    this.wsManager.initialize();
    logger.info('🔌 WebSocket server initialized on /ws/interaction');
  }

  async initializeServices() {
    logger.info('🔧 Initializing interaction services...');

    this.arService = new ARService({ wsManager: this.wsManager });
    await this.arService.initialize();

    this.dualBrainService = new DualBrainService();
    await this.dualBrainService.initialize();

    this.voiceService = new VoiceFirstService({ wsManager: this.wsManager });
    await this.voiceService.initialize();

    this.gestureService = new GestureService({ wsManager: this.wsManager });
    await this.gestureService.initialize();

    this.glassesService = new SmartGlassesService({
      arService: this.arService,
      voiceService: this.voiceService,
      gestureService: this.gestureService,
      wsManager: this.wsManager,
    });
    await this.glassesService.initialize();

    this.app.locals.arService = this.arService;
    this.app.locals.dualBrainService = this.dualBrainService;
    this.app.locals.voiceService = this.voiceService;
    this.app.locals.gestureService = this.gestureService;
    this.app.locals.glassesService = this.glassesService;
    this.app.locals.wsManager = this.wsManager;

    logger.info('✅ All human interaction services initialized');
  }

  setupErrorHandling() {
    this.app.use(errorHandler);
  }

  start() {
    this.server.listen(this.port, () => {
      logger.info(`🧑‍💻 Human Interaction Service running on port ${this.port}`);
      logger.info(`📚 API Documentation: http://localhost:${this.port}/api-docs`);
      logger.info(`🔌 WebSocket: ws://localhost:${this.port}/ws/interaction`);
    });

    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  async shutdown() {
    logger.info('🛑 Shutting down Human Interaction Service...');
    await this.arService?.shutdown();
    await this.dualBrainService?.shutdown();
    await this.voiceService?.shutdown();
    await this.gestureService?.shutdown();
    await this.glassesService?.shutdown();
    this.wss.close();
    this.server.close(() => {
      logger.info('✅ Human Interaction Service shutdown complete');
      process.exit(0);
    });
  }
}

if (process.env.NODE_ENV !== 'test') {
  const service = new HumanInteractionService();
  service.start();
}

module.exports = HumanInteractionService;
