/**
 * DRS AI Web3 + AI Distributed Mesh Service
 * 
 * Features:
 * - IPFS integration for decentralized storage
 * - libp2p for peer-to-peer communication
 * - Agent Contracts for AI agent coordination
 * - Distributed AI model sharing
 * 
 * @module web3-mesh-service
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
const ipfsRoutes = require('./routes/ipfs');
const p2pRoutes = require('./routes/p2p');
const contractRoutes = require('./routes/contracts');
const agentMeshRoutes = require('./routes/agent-mesh');
const healthRoutes = require('./routes/health');

// Import services
const IPFSService = require('./ipfs/IPFSService');
const LibP2PService = require('./libp2p/LibP2PService');
const AgentContractService = require('./contracts/AgentContractService');
const AgentMeshNetwork = require('./agent-mesh/AgentMeshNetwork');

class Web3MeshService {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.port = process.env.PORT || 3031;
    
    // Services
    this.ipfsService = null;
    this.libp2pService = null;
    this.contractService = null;
    this.agentMesh = null;
    
    this.isInitialized = false;
    this.startTime = Date.now();
    
    this.initialize();
  }

  async initialize() {
    try {
      logger.info('🌐 Initializing Web3 + AI Distributed Mesh Service...');
      
      this.setupMiddleware();
      this.setupRoutes();
      await this.initializeServices();
      this.setupErrorHandling();
      
      this.isInitialized = true;
      logger.info('✅ Web3 Mesh Service initialized');
      
    } catch (error) {
      logger.error('❌ Failed to initialize Web3 Mesh Service:', error);
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
    this.app.use(express.json({ limit: '100mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '100mb' }));
  }

  setupRoutes() {
    // Swagger documentation
    const swaggerOptions = {
      definition: {
        openapi: '3.0.0',
        info: {
          title: 'DRS AI Web3 Mesh API',
          version: '1.0.0',
          description: `
            # Web3 + AI Distributed Mesh
            
            ## Features
            - 📦 **IPFS Integration**: Decentralized file storage
            - 🔗 **libp2p Network**: Peer-to-peer communication
            - 📜 **Agent Contracts**: Smart contracts for AI coordination
            - 🌐 **Agent Mesh**: Distributed AI agent network
          `,
        },
        servers: [{ url: `http://localhost:${this.port}` }],
      },
      apis: ['./src/routes/*.js'],
    };
    
    const specs = swaggerJsdoc(swaggerOptions);
    this.app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
    
    // API routes
    this.app.use('/api/v1/ipfs', ipfsRoutes);
    this.app.use('/api/v1/p2p', p2pRoutes);
    this.app.use('/api/v1/contracts', contractRoutes);
    this.app.use('/api/v1/agent-mesh', agentMeshRoutes);
    this.app.use('/health', healthRoutes);
    
    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        service: 'DRS AI Web3 Mesh Service',
        version: '1.0.0',
        status: 'operational',
        features: ['ipfs', 'libp2p', 'agent-contracts', 'agent-mesh'],
        documentation: '/api-docs',
      });
    });
  }

  async initializeServices() {
    logger.info('🔧 Initializing Web3 services...');
    
    // Initialize IPFS
    this.ipfsService = new IPFSService();
    await this.ipfsService.initialize();
    
    // Initialize libp2p
    this.libp2pService = new LibP2PService();
    await this.libp2pService.initialize();
    
    // Initialize Agent Contracts
    this.contractService = new AgentContractService();
    await this.contractService.initialize();
    
    // Initialize Agent Mesh
    this.agentMesh = new AgentMeshNetwork({
      ipfsService: this.ipfsService,
      libp2pService: this.libp2pService,
      contractService: this.contractService,
    });
    await this.agentMesh.initialize();
    
    // Make services available to routes
    this.app.locals.ipfsService = this.ipfsService;
    this.app.locals.libp2pService = this.libp2pService;
    this.app.locals.contractService = this.contractService;
    this.app.locals.agentMesh = this.agentMesh;
    
    logger.info('✅ All Web3 services initialized');
  }

  setupErrorHandling() {
    this.app.use(errorHandler);
  }

  start() {
    this.server.listen(this.port, () => {
      logger.info(`🚀 Web3 Mesh Service running on port ${this.port}`);
      logger.info(`📚 API Documentation: http://localhost:${this.port}/api-docs`);
    });
    
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  async shutdown() {
    logger.info('🛑 Shutting down Web3 Mesh Service...');
    
    await this.ipfsService?.shutdown();
    await this.libp2pService?.shutdown();
    await this.contractService?.shutdown();
    await this.agentMesh?.shutdown();
    
    this.server.close(() => {
      logger.info('✅ Web3 Mesh Service shutdown complete');
      process.exit(0);
    });
  }
}

// Start service
if (process.env.NODE_ENV !== 'test') {
  const service = new Web3MeshService();
  service.start();
}

module.exports = Web3MeshService;
