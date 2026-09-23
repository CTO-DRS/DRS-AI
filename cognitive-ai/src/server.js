/**
 * DRS AI Cognitive AI Service
 * Evolving Persona & Visual Reasoning Engine
 * 
 * @module cognitive-ai-service
 * @version 1.0.0
 * @author DRS Technologies
 * @license MIT
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const promClient = require('prom-client');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const { logger, stream } = require('./utils/logger');
const { errorHandler } = require('./utils/errorHandler');
const { requestValidator } = require('./utils/validator');
const { metricsMiddleware, metricsEndpoint } = require('./utils/metrics');

// Import Routes
const personaRoutes = require('./routes/persona');
const visualRoutes = require('./routes/visual');
const metaLearningRoutes = require('./routes/meta-learning');
const embeddingRoutes = require('./routes/embeddings');
const healthRoutes = require('./routes/health');

// Import Services
const EvolvingPersonaEngine = require('./persona/EvolvingPersonaEngine');
const VisualReasoningEngine = require('./visual/VisualReasoningEngine');
const MetaLearningOrchestrator = require('./meta-learning/MetaLearningOrchestrator');
const UserEmbeddingService = require('./embeddings/UserEmbeddingService');
const WebSocketManager = require('./utils/WebSocketManager');

class CognitiveAIService {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server, path: '/ws/cognitive' });
    this.port = process.env.COGNITIVE_AI_PORT || 3030;
    
    // Initialize core engines
    this.personaEngine = null;
    this.visualEngine = null;
    this.metaLearning = null;
    this.embeddingService = null;
    this.wsManager = null;
    
    // Service state
    this.isInitialized = false;
    this.startTime = Date.now();
    
    this.initialize();
  }

  async initialize() {
    try {
      logger.info('🧠 Initializing Cognitive AI Service...');
      
      // Setup middleware
      this.setupMiddleware();
      
      // Setup routes
      this.setupRoutes();
      
      // Setup WebSocket
      this.setupWebSocket();
      
      // Initialize AI engines
      await this.initializeEngines();
      
      // Setup error handling
      this.app.use(errorHandler);
      
      this.isInitialized = true;
      logger.info('✅ Cognitive AI Service initialized successfully');
      
    } catch (error) {
      logger.error('❌ Failed to initialize Cognitive AI Service:', error);
      process.exit(1);
    }
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:"],
        },
      },
    }));
    
    // CORS
    this.app.use(cors({
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    }));
    
    // Compression
    this.app.use(compression());
    
    // Logging
    this.app.use(morgan('combined', { stream }));
    
    // Body parsing
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));
    
    // Metrics
    this.app.use(metricsMiddleware);
    
    // Request validation
    this.app.use(requestValidator);
  }

  setupRoutes() {
    // Swagger documentation
    const swaggerOptions = {
      definition: {
        openapi: '3.0.0',
        info: {
          title: 'DRS AI Cognitive AI API',
          version: '1.0.0',
          description: `
            # Cognitive AI Service
            
            ## Features
            - 🧠 **Evolving Persona Engine**: Meta-learning based user persona evolution
            - 👁️ **Visual Reasoning Engine**: Multi-modal understanding with Qwen-VL/LLaVA
            - 🔄 **Meta-Learning Orchestrator**: Few-shot learning and rapid adaptation
            - 📊 **User Embedding Service**: Deep user behavior embedding and clustering
            
            ## Authentication
            All endpoints require Bearer token authentication.
          `,
          contact: {
            name: 'DRS Technologies',
            email: 'support@drs-tech.com',
          },
          license: {
            name: 'MIT',
            url: 'https://opensource.org/licenses/MIT',
          },
        },
        servers: [
          {
            url: `http://localhost:${this.port}`,
            description: 'Development server',
          },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
            },
          },
        },
        security: [
          {
            bearerAuth: [],
          },
        ],
      },
      apis: ['./src/routes/*.js'],
    };
    
    const specs = swaggerJsdoc(swaggerOptions);
    this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
      explorer: true,
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'DRS AI Cognitive AI API',
    }));
    
    // API routes
    this.app.use('/api/v1/persona', personaRoutes);
    this.app.use('/api/v1/visual', visualRoutes);
    this.app.use('/api/v1/meta-learning', metaLearningRoutes);
    this.app.use('/api/v1/embeddings', embeddingRoutes);
    this.app.use('/health', healthRoutes);
    this.app.use('/metrics', metricsEndpoint);
    
    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        service: 'DRS AI Cognitive AI Service',
        version: '1.0.0',
        status: 'operational',
        features: [
          'evolving-persona',
          'visual-reasoning',
          'meta-learning',
          'user-embeddings'
        ],
        documentation: '/api-docs',
        health: '/health',
        metrics: '/metrics',
        uptime: Date.now() - this.startTime,
      });
    });
  }

  setupWebSocket() {
    this.wsManager = new WebSocketManager(this.wss);
    this.wsManager.initialize();
    
    // Handle real-time cognitive streams
    this.wsManager.on('persona-update', (data) => {
      this.personaEngine?.handleRealtimeUpdate(data);
    });
    
    this.wsManager.on('visual-analysis', (data) => {
      this.visualEngine?.handleRealtimeAnalysis(data);
    });
  }

  async initializeEngines() {
    logger.info('🔧 Initializing AI Engines...');
    
    // Initialize User Embedding Service
    this.embeddingService = new UserEmbeddingService();
    await this.embeddingService.initialize();
    
    // Initialize Evolving Persona Engine
    this.personaEngine = new EvolvingPersonaEngine({
      embeddingService: this.embeddingService,
    });
    await this.personaEngine.initialize();
    
    // Initialize Visual Reasoning Engine
    this.visualEngine = new VisualReasoningEngine({
      modelPath: process.env.VISUAL_MODEL_PATH || 'Qwen/Qwen-VL-Chat',
      useGPU: process.env.USE_GPU === 'true',
    });
    await this.visualEngine.initialize();
    
    // Initialize Meta-Learning Orchestrator
    this.metaLearning = new MetaLearningOrchestrator({
      personaEngine: this.personaEngine,
      embeddingService: this.embeddingService,
    });
    await this.metaLearning.initialize();

    // Expose engines on app.locals so health route + other routes can access them
    this.app.locals.embeddingService = this.embeddingService;
    this.app.locals.personaEngine = this.personaEngine;
    this.app.locals.visualEngine = this.visualEngine;
    this.app.locals.metaLearning = this.metaLearning;

    logger.info('✅ All AI Engines initialized');
  }

  start() {
    this.server.listen(this.port, () => {
      logger.info(`🚀 Cognitive AI Service running on port ${this.port}`);
      logger.info(`📚 API Documentation: http://localhost:${this.port}/api-docs`);
      logger.info(`❤️  Health Check: http://localhost:${this.port}/health`);
      logger.info(`📊 Metrics: http://localhost:${this.port}/metrics`);
    });
    
    // Graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  async shutdown() {
    logger.info('🛑 Shutting down Cognitive AI Service...');
    
    // Close WebSocket server
    this.wss.close();
    
    // Shutdown engines
    await this.personaEngine?.shutdown();
    await this.visualEngine?.shutdown();
    await this.metaLearning?.shutdown();
    await this.embeddingService?.shutdown();
    
    // Close HTTP server
    this.server.close(() => {
      logger.info('✅ Cognitive AI Service shutdown complete');
      process.exit(0);
    });
  }
}

// Start service if not in test mode
if (process.env.NODE_ENV !== 'test') {
  const service = new CognitiveAIService();
  service.start();
}

module.exports = CognitiveAIService;
