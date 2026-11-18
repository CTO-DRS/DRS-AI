/**
 * Token Store
 *
 * Persists OAuth2 access/refresh/id tokens per (user, provider) pair.
 * Encrypted at rest via AES-256-GCM using a master key.
 *
 * Token rotation and revocation supported.
 */
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const redis = require('../utils/redis');

const TOKEN_TTL = 60 * 60 * 24 * 30; // 30 days

class TokenStore {
  constructor() {
    this.isInitialized = false;
    this.masterKey = Buffer.from(process.env.OAUTH_MASTER_KEY || '0'.repeat(64), 'hex');
    if (this.masterKey.length !== 32) {
      // Generate a random key if not provided (dev only!)
      this.masterKey = crypto.randomBytes(32);
      logger.warn('⚠️  OAUTH_MASTER_KEY not set; using a random ephemeral key (tokens won\'t survive restart)');
    }
  }

  async initialize() {
    logger.info('💾 Initializing Token Store...');
    this.isInitialized = true;
    logger.info('✅ Token Store initialized');
  }

  encrypt(plaintext) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, enc]).toString('base64');
  }

  decrypt(payloadB64) {
    const buf = Buffer.from(payloadB64, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.masterKey, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString('utf8');
  }

  async store(userId, providerId, tokens) {
    const id = uuidv4();
    const record = {
      id,
      userId,
      providerId,
      accessToken: this.encrypt(tokens.accessToken),
      refreshToken: tokens.refreshToken ? this.encrypt(tokens.refreshToken) : null,
      idToken: tokens.idToken ? this.encrypt(tokens.idToken) : null,
      tokenType: tokens.tokenType || 'Bearer',
      expiresAt: tokens.expiresAt || (Date.now() + 3600 * 1000),
      scope: tokens.scope || null,
      createdAt: new Date().toISOString(),
    };
    await redis.hset('drs:oauth:tokens', id, JSON.stringify(record));
    await redis.hset(`drs:oauth:user:${userId}:tokens`, providerId, id);
    logger.info(`💾 Tokens stored for user ${userId} / provider ${providerId}`);
    return { id, userId, providerId, expiresAt: record.expiresAt };
  }

  async get(userId, providerId) {
    const id = await redis.hget(`drs:oauth:user:${userId}:tokens`, providerId);
    if (!id) return null;
    const raw = await redis.hget('drs:oauth:tokens', id);
    if (!raw) return null;
    const rec = JSON.parse(raw);
    return {
      ...rec,
      accessToken: this.decrypt(rec.accessToken),
      refreshToken: rec.refreshToken ? this.decrypt(rec.refreshToken) : null,
      idToken: rec.idToken ? this.decrypt(rec.idToken) : null,
    };
  }

  async listByUser(userId) {
    const map = await redis.hgetall(`drs:oauth:user:${userId}:tokens`);
    const out = [];
    for (const [providerId, id] of Object.entries(map || {})) {
      const raw = await redis.hget('drs:oauth:tokens', id);
      if (raw) {
        const rec = JSON.parse(raw);
        out.push({ id: rec.id, providerId, expiresAt: rec.expiresAt, createdAt: rec.createdAt });
      }
    }
    return out;
  }

  async revoke(userId, providerId) {
    const id = await redis.hget(`drs:oauth:user:${userId}:tokens`, providerId);
    if (!id) return false;
    await redis.hdel(`drs:oauth:user:${userId}:tokens`, providerId);
    await redis.hdel('drs:oauth:tokens', id);
    logger.info(`🗑️  Tokens revoked for user ${userId} / provider ${providerId}`);
    return true;
  }

  async revokeAllForUser(userId) {
    const map = await redis.hgetall(`drs:oauth:user:${userId}:tokens`);
    const count = Object.keys(map || {}).length;
    for (const id of Object.values(map || {})) {
      await redis.hdel('drs:oauth:tokens', id);
    }
    await redis.del(`drs:oauth:user:${userId}:tokens`);
    logger.info(`🗑️  Revoked ${count} token set(s) for user ${userId}`);
    return count;
  }

  async shutdown() {
    this.isInitialized = false;
    logger.info('🛑 Token Store stopped');
  }
}

module.exports = TokenStore;
