/**
 * OAuth2 / OIDC Provider Registry
 *
 * Supports out-of-the-box integration with:
 *   - Keycloak (self-hosted)
 *   - Auth0
 *   - Google
 *   - GitHub
 *   - Microsoft Azure AD
 *   - Okta
 *
 * Each provider is configured with:
 *   - authorization_endpoint
 *   - token_endpoint
 *   - userinfo_endpoint
 *   - client_id, client_secret
 *   - scopes
 *   - PKCE support flag
 */
const { logger } = require('../utils/logger');
const redis = require('../utils/redis');

const BUILTIN_PROVIDERS = {
  keycloak: {
    name: 'Keycloak',
    type: 'oidc',
    authorizationTemplate: '{issuer}/protocol/openid-connect/auth',
    tokenTemplate: '{issuer}/protocol/openid-connect/token',
    userinfoTemplate: '{issuer}/protocol/openid-connect/userinfo',
    pkce: true,
    scopes: ['openid', 'profile', 'email'],
  },
  auth0: {
    name: 'Auth0',
    type: 'oidc',
    authorizationTemplate: 'https://{domain}/authorize',
    tokenTemplate: 'https://{domain}/oauth/token',
    userinfoTemplate: 'https://{domain}/userinfo',
    pkce: true,
    scopes: ['openid', 'profile', 'email'],
  },
  google: {
    name: 'Google',
    type: 'oidc',
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    userinfoEndpoint: 'https://www.googleapis.com/oauth2/v3/userinfo',
    pkce: true,
    scopes: ['openid', 'email', 'profile'],
  },
  github: {
    name: 'GitHub',
    type: 'oauth2',
    authorizationEndpoint: 'https://github.com/login/oauth/authorize',
    tokenEndpoint: 'https://github.com/login/oauth/access_token',
    userinfoEndpoint: 'https://api.github.com/user',
    pkce: false,
    scopes: ['read:user', 'user:email'],
  },
  azure: {
    name: 'Microsoft Azure AD',
    type: 'oidc',
    authorizationTemplate: 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize',
    tokenTemplate: 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token',
    userinfoEndpoint: 'https://graph.microsoft.com/oidc/userinfo',
    pkce: true,
    scopes: ['openid', 'profile', 'email', 'User.Read'],
  },
  okta: {
    name: 'Okta',
    type: 'oidc',
    authorizationTemplate: 'https://{domain}/oauth2/default/v1/authorize',
    tokenTemplate: 'https://{domain}/oauth2/default/v1/token',
    userinfoTemplate: 'https://{domain}/oauth2/default/v1/userinfo',
    pkce: true,
    scopes: ['openid', 'profile', 'email'],
  },
};

class ProviderRegistry {
  constructor() {
    this.isInitialized = false;
    this.providers = new Map();
  }

  async initialize() {
    logger.info('🔐 Initializing OAuth/OIDC Provider Registry...');
    await redis.init();
    await this.loadFromRedis();
    // Merge builtins as defaults
    for (const [id, def] of Object.entries(BUILTIN_PROVIDERS)) {
      if (!this.providers.has(id)) {
        this.providers.set(id, { id, ...def, configured: false });
      }
    }
    this.isInitialized = true;
    logger.info(`✅ Provider Registry initialized — ${this.providers.size} providers (${this.listConfigured().length} configured)`);
  }

  async loadFromRedis() {
    const all = await redis.hgetall('drs:oauth:providers');
    for (const [id, raw] of Object.entries(all || {})) {
      try { this.providers.set(id, JSON.parse(raw)); } catch {}
    }
  }

  /**
   * Configure a provider with client credentials.
   */
  async configure(id, { clientId, clientSecret, redirectUri, params = {} }) {
    const provider = this.providers.get(id);
    if (!provider) throw new Error(`Unknown provider: ${id}`);
    provider.clientId = clientId;
    provider.clientSecret = clientSecret;
    provider.redirectUri = redirectUri || process.env.OAUTH_REDIRECT_URI || 'http://localhost:8080/auth/callback';
    provider.params = params;
    provider.configured = true;
    await redis.hset('drs:oauth:providers', id, JSON.stringify(provider));
    logger.info(`🔧 Provider configured: ${id} (${provider.name})`);
    return provider;
  }

  /**
   * Resolve the authorization endpoint URL for a provider.
   */
  resolveAuthorizationEndpoint(provider) {
    if (provider.authorizationEndpoint) return provider.authorizationEndpoint;
    if (provider.authorizationTemplate) {
      return this.fillTemplate(provider.authorizationTemplate, provider.params || {});
    }
    throw new Error('No authorization endpoint for provider');
  }

  resolveTokenEndpoint(provider) {
    if (provider.tokenEndpoint) return provider.tokenEndpoint;
    if (provider.tokenTemplate) return this.fillTemplate(provider.tokenTemplate, provider.params || {});
    throw new Error('No token endpoint for provider');
  }

  resolveUserinfoEndpoint(provider) {
    if (provider.userinfoEndpoint) return provider.userinfoEndpoint;
    if (provider.userinfoTemplate) return this.fillTemplate(provider.userinfoTemplate, provider.params || {});
    throw new Error('No userinfo endpoint for provider');
  }

  fillTemplate(tpl, params) {
    return tpl.replace(/\{(\w+)\}/g, (_, k) => params[k] || '');
  }

  get(id) { return this.providers.get(id); }
  list() { return Array.from(this.providers.values()); }
  listConfigured() { return this.list().filter((p) => p.configured); }

  async remove(id) {
    const p = this.providers.get(id);
    if (!p) return null;
    if (BUILTIN_PROVIDERS[id]) {
      // Just clear configuration, keep template
      p.configured = false;
      p.clientId = undefined;
      p.clientSecret = undefined;
      await redis.hset('drs:oauth:providers', id, JSON.stringify(p));
    } else {
      this.providers.delete(id);
      await redis.hdel('drs:oauth:providers', id);
    }
    return p;
  }

  async shutdown() {
    this.isInitialized = false;
    logger.info('🛑 Provider Registry stopped');
  }
}

module.exports = ProviderRegistry;
