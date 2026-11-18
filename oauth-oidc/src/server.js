/**
 * DRS AI OAuth2 / OIDC Integration Service
 *
 * Phase 36 of the DRS AI transformation roadmap.
 *
 * Capabilities:
 *   1. Provider Registry — Keycloak, Auth0, Google, GitHub, Azure AD, Okta
 *   2. Token Store        — encrypted at-rest storage of access/refresh/ID tokens
 *   3. Authorization flow — authorization code + PKCE
 *
 * @module oauth-oidc-service
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
const { asyncHandler } = require('./utils/errorHandler');

const healthRoutes = require('./routes/health');
const providerRoutes = require('./routes/providers');
const tokenRoutes = require('./routes/tokens');

const ProviderRegistry = require('./providers/ProviderRegistry');
const TokenStore = require('./token-store/TokenStore');

class OAuthOIDCService {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.port = Number(process.env.PORT || 3042);
    this.isInitialized = false;
    this.startTime = Date.now();
    this.initialize();
  }

  async initialize() {
    try {
      logger.info('🔐 Initializing OAuth/OIDC Service...');
      this.setupMiddleware();
      this.setupRoutes();
      await this.initializeServices();
      this.app.use(errorHandler);
      this.isInitialized = true;
      logger.info('✅ OAuth/OIDC Service initialized');
    } catch (e) {
      logger.error('❌ Init failed:', e);
      process.exit(1);
    }
  }

  setupMiddleware() {
    this.app.use(helmet());
    this.app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || ['*'], credentials: true }));
    this.app.use(compression());
    this.app.use(morgan('combined', { stream }));
    this.app.use(express.json({ limit: '5mb' }));
    this.app.use(express.urlencoded({ extended: true }));
  }

  setupRoutes() {
    this.app.use('/health', healthRoutes);
    this.app.use('/api/v1/oauth/providers', providerRoutes);
    this.app.use('/api/v1/oauth/tokens', tokenRoutes);

    // Simple "validate token" endpoint for downstream services
    this.app.post('/api/v1/oauth/validate', asyncHandler(async (req, res) => {
      const authz = req.headers.authorization || '';
      const token = authz.replace(/^Bearer\s+/, '');
      if (!token) return res.status(401).json({ valid: false, error: 'Missing bearer token' });
      // Decrypt our stored tokens to find a match — note this is for inspection only
      // Real validation would call the provider's introspection endpoint.
      const providerId = req.body?.providerId;
      const userId = req.body?.userId;
      if (!userId || !providerId) {
        return res.json({ valid: true, note: 'Pass userId + providerId in body to compare against stored token' });
      }
      const stored = await this.tokenStore.get(userId, providerId);
      if (!stored) return res.status(401).json({ valid: false, error: 'No stored token' });
      const matches = stored.accessToken === token;
      return res.json({ valid: matches, expiresAt: stored.expiresAt });
    }));

    this.app.get('/', (req, res) => {
      res.json({
        service: 'DRS AI OAuth2 / OIDC Service',
        version: '1.0.0',
        status: 'operational',
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
        providers: this.providerRegistry.listConfigured().map((p) => p.id),
      });
    });
  }

  async initializeServices() {
    this.providerRegistry = new ProviderRegistry();
    await this.providerRegistry.initialize();

    this.tokenStore = new TokenStore();
    await this.tokenStore.initialize();

    // Reuse redis as stateStore (set/get/del on short TTLs for OAuth state)
    const redis = require('./utils/redis');
    this.stateStore = redis;

    this.app.locals.providerRegistry = this.providerRegistry;
    this.app.locals.tokenStore = this.tokenStore;
    this.app.locals.stateStore = this.stateStore;
  }

  start() {
    this.server.listen(this.port, '0.0.0.0', () => {
      logger.info(`🔐 OAuth/OIDC Service running on port ${this.port}`);
    });
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  async shutdown() {
    logger.info('🛑 Shutting down...');
    await this.providerRegistry?.shutdown();
    await this.tokenStore?.shutdown();
    this.server.close(() => process.exit(0));
  }
}

if (process.env.NODE_ENV !== 'test') {
  const svc = new OAuthOIDCService();
  svc.start();
}

module.exports = OAuthOIDCService;
