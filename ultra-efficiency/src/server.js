/**
 * DRS AI Ultra Efficiency Service
 * 
 * Features:
 * - Smart Hibernation with Intel SGX/AMD SEV
 * - Dynamic Model Distillation (70B → 3B)
 * - Resource Budgeting & Auto-Scaling
 * - Auto-Quantization (INT8, INT4, FP16)
 * - Memory Pool Management
 * - GPU Optimization
 * 
 * @module ultra-efficiency-service
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

// Routes
const hibernationRoutes = require('./routes/hibernation');
const distillationRoutes = require('./routes/distillation');
const quantizationRoutes = require('./routes/quantization');
const resourceRoutes = require('./routes/resource');
const healthRoutes = require('./routes/health');

// Services
const SmartHibernationService = require('./hibernation/SmartHibernationService');
const ModelDistillationService = require('./distillation/ModelDistillationService');
const AutoQuantizationService = require('./quantization/AutoQuantizationService');
const ResourceBudgetingService = require('./resource-budgeting/ResourceBudgetingService');

class UltraEfficiencyService {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.port = process.env.PORT || 3033;
    
    this.hibernationService = null;
    this.distillationService = null;
    this.quantizationService = null;
    this.resourceService = null;
    
    this.isInitialized = false;
    this.startTime = Date.now();
    
    this.initialize();
  }

  async initialize() {
    try {
      logger.info('⚡ Initializing Ultra Efficiency Service...');
      
      this.setupMiddleware();
      this.setupRoutes();
      await this.initializeServices();
      this.setupErrorHandling();
      
      this.isInitialized = true;
      logger.info('✅ Ultra Efficiency Service initialized');
      
    } catch (error) {
      logger.error('❌ Failed to initialize Ultra Efficiency Service:', error);
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
          title: 'DRS AI Ultra Efficiency API',
          version: '1.0.0',
          description: `
            # Ultra Efficiency Service
            
            ## Features
            - 💤 **Smart Hibernation**: Intel SGX/AMD SEV secure hibernation
            - 🎯 **Model Distillation**: Dynamic 70B → 3B distillation
            - 📊 **Resource Budgeting**: Auto-scaling & resource allocation
            - 🔢 **Auto-Quantization**: INT8/INT4/FP16 quantization
          `,
        },
        servers: [{ url: `http://localhost:${this.port}` }],
      },
      apis: ['./src/routes/*.js'],
    };
    
    const specs = swaggerJsdoc(swaggerOptions);
    this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
    
    this.app.use('/api/v1/hibernation', hibernationRoutes);
    this.app.use('/api/v1/distillation', distillationRoutes);
    this.app.use('/api/v1/quantization', quantizationRoutes);
    this.app.use('/api/v1/resource', resourceRoutes);
    this.app.use('/health', healthRoutes);
    
    this.app.get('/', (req, res) => {
      res.json({
        service: 'DRS AI Ultra Efficiency Service',
        version: '1.0.0',
        status: 'operational',
        features: ['smart-hibernation', 'model-distillation', 'auto-quantization', 'resource-budgeting'],
        documentation: '/api-docs',
      });
    });
  }

  async initializeServices() {
    logger.info('🔧 Initializing efficiency services...');
    
    this.hibernationService = new SmartHibernationService();
    await this.hibernationService.initialize();
    
    this.distillationService = new ModelDistillationService({
      hibernationService: this.hibernationService,
    });
    await this.distillationService.initialize();
    
    this.quantizationService = new AutoQuantizationService();
    await this.quantizationService.initialize();
    
    this.resourceService = new ResourceBudgetingService({
      hibernationService: this.hibernationService,
    });
    await this.resourceService.initialize();
    
    this.app.locals.hibernationService = this.hibernationService;
    this.app.locals.distillationService = this.distillationService;
    this.app.locals.quantizationService = this.quantizationService;
    this.app.locals.resourceService = this.resourceService;
    
    logger.info('✅ All efficiency services initialized');
  }

  setupErrorHandling() {
    this.app.use(errorHandler);
  }

  start() {
    this.server.listen(this.port, () => {
      logger.info(`⚡ Ultra Efficiency Service running on port ${this.port}`);
      logger.info(`📚 API Documentation: http://localhost:${this.port}/api-docs`);
    });
    
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  async shutdown() {
    logger.info('🛑 Shutting down Ultra Efficiency Service...');
    
    await this.hibernationService?.shutdown();
    await this.distillationService?.shutdown();
    await this.quantizationService?.shutdown();
    await this.resourceService?.shutdown();
    
    this.server.close(() => {
      logger.info('✅ Ultra Efficiency Service shutdown complete');
      process.exit(0);
    });
  }
}

if (process.env.NODE_ENV !== 'test') {
  const service = new UltraEfficiencyService();
  service.start();
}

module.exports = UltraEfficiencyService;
