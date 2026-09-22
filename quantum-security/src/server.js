/**
 * DRS AI Post-Quantum Security Service
 * 
 * Features:
 * - Crystal-Kyber Key Encapsulation Mechanism (KEM)
 * - Dilithium Digital Signatures
 * - Honeypot AI for threat detection
 * - Quantum-resistant encryption
 * - Real-time threat monitoring
 * 
 * @module quantum-security-service
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

// Import routes
const cryptoRoutes = require('./routes/crypto');
const honeypotRoutes = require('./routes/honeypot');
const threatRoutes = require('./routes/threats');
const healthRoutes = require('./routes/health');

// Import services
const KyberService = require('./crypto/KyberService');
const DilithiumService = require('./crypto/DilithiumService');
const HoneypotAIService = require('./honeypot/HoneypotAIService');
const ThreatDetectionService = require('./threat-detection/ThreatDetectionService');

class QuantumSecurityService {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.port = process.env.PORT || 3032;
    
    // Services
    this.kyberService = null;
    this.dilithiumService = null;
    this.honeypotService = null;
    this.threatDetection = null;
    
    this.isInitialized = false;
    this.startTime = Date.now();
    
    this.initialize();
  }

  async initialize() {
    try {
      logger.info('🔐 Initializing Post-Quantum Security Service...');
      
      this.setupMiddleware();
      this.setupRoutes();
      await this.initializeServices();
      this.setupErrorHandling();
      
      this.isInitialized = true;
      logger.info('✅ Post-Quantum Security Service initialized');
      
    } catch (error) {
      logger.error('❌ Failed to initialize Quantum Security Service:', error);
      process.exit(1);
    }
  }

  setupMiddleware() {
    // Security headers
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    }));
    
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
    // Swagger documentation
    const swaggerOptions = {
      definition: {
        openapi: '3.0.0',
        info: {
          title: 'DRS AI Post-Quantum Security API',
          version: '1.0.0',
          description: `
            # Post-Quantum Security Service
            
            ## Features
            - 🔐 **Crystal-Kyber**: NIST-approved post-quantum KEM
            - ✍️ **Dilithium**: NIST-approved post-quantum signatures
            - 🍯 **Honeypot AI**: AI-powered threat detection
            - 🛡️ **Quantum-Resistant**: Protection against quantum attacks
          `,
        },
        servers: [{ url: `http://localhost:${this.port}` }],
      },
      apis: ['./src/routes/*.js'],
    };
    
    const specs = swaggerJsdoc(swaggerOptions);
    this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
    
    // API routes
    this.app.use('/api/v1/crypto', cryptoRoutes);
    this.app.use('/api/v1/honeypot', honeypotRoutes);
    this.app.use('/api/v1/threats', threatRoutes);
    this.app.use('/health', healthRoutes);
    
    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        service: 'DRS AI Post-Quantum Security Service',
        version: '1.0.0',
        status: 'operational',
        features: ['kyber-kem', 'dilithium-sign', 'honeypot-ai', 'threat-detection'],
        documentation: '/api-docs',
      });
    });
  }

  async initializeServices() {
    logger.info('🔧 Initializing post-quantum cryptographic services...');
    
    // Initialize Kyber (KEM)
    this.kyberService = new KyberService({
      mode: process.env.KYBER_MODE || '768', // 512, 768, or 1024
    });
    await this.kyberService.initialize();
    
    // Initialize Dilithium (Signatures)
    this.dilithiumService = new DilithiumService({
      mode: process.env.DILITHIUM_MODE || '3', // 2, 3, or 5
    });
    await this.dilithiumService.initialize();
    
    // Initialize Honeypot AI
    this.honeypotService = new HoneypotAIService();
    await this.honeypotService.initialize();
    
    // Initialize Threat Detection
    this.threatDetection = new ThreatDetectionService({
      honeypotService: this.honeypotService,
    });
    await this.threatDetection.initialize();
    
    // Make services available to routes
    this.app.locals.kyberService = this.kyberService;
    this.app.locals.dilithiumService = this.dilithiumService;
    this.app.locals.honeypotService = this.honeypotService;
    this.app.locals.threatDetection = this.threatDetection;
    
    logger.info('✅ All post-quantum services initialized');
  }

  setupErrorHandling() {
    this.app.use(errorHandler);
  }

  start() {
    this.server.listen(this.port, () => {
      logger.info(`🔐 Post-Quantum Security Service running on port ${this.port}`);
      logger.info(`📚 API Documentation: http://localhost:${this.port}/api-docs`);
    });
    
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  async shutdown() {
    logger.info('🛑 Shutting down Post-Quantum Security Service...');
    
    await this.kyberService?.shutdown();
    await this.dilithiumService?.shutdown();
    await this.honeypotService?.shutdown();
    await this.threatDetection?.shutdown();
    
    this.server.close(() => {
      logger.info('✅ Post-Quantum Security Service shutdown complete');
      process.exit(0);
    });
  }
}

// Start service
if (process.env.NODE_ENV !== 'test') {
  const service = new QuantumSecurityService();
  service.start();
}

module.exports = QuantumSecurityService;
