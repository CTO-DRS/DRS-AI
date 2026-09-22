/**
 * Crystal-Kyber Service
 * 
 * NIST-approved post-quantum Key Encapsulation Mechanism (KEM)
 * - Kyber-512: ~128-bit security
 * - Kyber-768: ~192-bit security (recommended)
 * - Kyber-1024: ~256-bit security
 * 
 * @class KyberService
 * @version 1.0.0
 */

const { ml_kem512, ml_kem768, ml_kem1024 } = require('ml-kem');
const { logger } = require('../utils/logger');
const { getRedisClient } = require('../utils/redis');
const { v4: uuidv4 } = require('uuid');

class KyberService {
  constructor(options = {}) {
    this.config = {
      mode: options.mode || '768', // 512, 768, or 1024
      keyExpiryHours: options.keyExpiryHours || 24,
      ...options,
    };
    
    this.redis = null;
    this.isInitialized = false;
    
    // Key pairs cache
    this.keyPairs = new Map();
    
    // Stats
    this.stats = {
      keyPairsGenerated: 0,
      encapsulations: 0,
      decapsulations: 0,
    };
  }

  async initialize() {
    try {
      logger.info(`🔐 Initializing Crystal-Kyber (Mode: ${this.config.mode})...`);
      
      // Initialize Redis
      this.redis = await getRedisClient();
      
      // Select Kyber variant
      switch (this.config.mode) {
        case '512':
          this.kyber = ml_kem512;
          break;
        case '1024':
          this.kyber = ml_kem1024;
          break;
        case '768':
        default:
          this.kyber = ml_kem768;
          break;
      }
      
      // Test key generation
      const testKeys = this.kyber.keygen();
      logger.info(`✅ Kyber-${this.config.mode} initialized successfully`);
      logger.info(`   Public key size: ${testKeys.publicKey.length} bytes`);
      logger.info(`   Secret key size: ${testKeys.secretKey.length} bytes`);
      
      this.isInitialized = true;
      
    } catch (error) {
      logger.error('❌ Failed to initialize Kyber:', error);
      throw error;
    }
  }

  /**
   * Generate a new Kyber key pair
   * @param {string} keyId - Optional key identifier
   * @returns {Promise<Object>} Key pair information
   */
  async generateKeyPair(keyId = null) {
    try {
      const id = keyId || uuidv4();
      
      logger.info(`🔑 Generating Kyber-${this.config.mode} key pair: ${id}`);
      
      // Generate key pair
      const { publicKey, secretKey } = this.kyber.keygen();
      
      const keyPair = {
        id,
        mode: this.config.mode,
        publicKey: Buffer.from(publicKey).toString('base64'),
        secretKey: Buffer.from(secretKey).toString('base64'),
        createdAt: Date.now(),
        expiresAt: Date.now() + (this.config.keyExpiryHours * 60 * 60 * 1000),
      };
      
      // Store in cache
      this.keyPairs.set(id, keyPair);
      
      // Store in Redis (only public key for persistence)
      await this.redis.setex(
        `kyber:pubkey:${id}`,
        this.config.keyExpiryHours * 3600,
        keyPair.publicKey
      );
      
      // Update stats
      this.stats.keyPairsGenerated++;
      
      logger.info(`✅ Key pair generated: ${id}`);
      
      // Return without secret key for security
      return {
        id,
        mode: this.config.mode,
        publicKey: keyPair.publicKey,
        createdAt: keyPair.createdAt,
        expiresAt: keyPair.expiresAt,
      };
      
    } catch (error) {
      logger.error('❌ Key pair generation failed:', error);
      throw error;
    }
  }

  /**
   * Encapsulate a shared secret using public key
   * @param {string} publicKeyBase64 - Base64 encoded public key
   * @returns {Promise<Object>} Ciphertext and shared secret
   */
  async encapsulate(publicKeyBase64) {
    try {
      logger.info('🔒 Encapsulating shared secret...');
      
      const publicKey = Buffer.from(publicKeyBase64, 'base64');
      
      // Encapsulate
      const { cipherText, sharedSecret } = this.kyber.encapsulate(publicKey);
      
      this.stats.encapsulations++;
      
      logger.info('✅ Encapsulation successful');
      
      return {
        cipherText: Buffer.from(cipherText).toString('base64'),
        sharedSecret: Buffer.from(sharedSecret).toString('base64'),
        mode: this.config.mode,
      };
      
    } catch (error) {
      logger.error('❌ Encapsulation failed:', error);
      throw error;
    }
  }

  /**
   * Decapsulate shared secret using secret key
   * @param {string} keyId - Key pair identifier
   * @param {string} cipherTextBase64 - Base64 encoded ciphertext
   * @returns {Promise<Object>} Shared secret
   */
  async decapsulate(keyId, cipherTextBase64) {
    try {
      logger.info(`🔓 Decapsulating with key: ${keyId}`);
      
      // Get key pair
      const keyPair = this.keyPairs.get(keyId);
      if (!keyPair) {
        throw new Error(`Key pair not found: ${keyId}`);
      }
      
      const secretKey = Buffer.from(keyPair.secretKey, 'base64');
      const cipherText = Buffer.from(cipherTextBase64, 'base64');
      
      // Decapsulate
      const sharedSecret = this.kyber.decapsulate(cipherText, secretKey);
      
      this.stats.decapsulations++;
      
      logger.info('✅ Decapsulation successful');
      
      return {
        sharedSecret: Buffer.from(sharedSecret).toString('base64'),
        mode: this.config.mode,
      };
      
    } catch (error) {
      logger.error('❌ Decapsulation failed:', error);
      throw error;
    }
  }

  /**
   * Encrypt data using Kyber-derived shared secret
   * @param {string} publicKeyBase64 - Recipient's public key
   * @param {Buffer} plaintext - Data to encrypt
   * @returns {Promise<Object>} Encrypted data
   */
  async encrypt(publicKeyBase64, plaintext) {
    try {
      // Encapsulate to get shared secret
      const { cipherText, sharedSecret } = await this.encapsulate(publicKeyBase64);
      
      // Use shared secret to encrypt data (using AES-256-GCM)
      const crypto = require('crypto');
      const iv = crypto.randomBytes(16);
      const key = crypto.createHash('sha256').update(Buffer.from(sharedSecret, 'base64')).digest();
      
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const authTag = cipher.getAuthTag();
      
      return {
        cipherText, // Kyber ciphertext
        encryptedData: Buffer.concat([iv, authTag, encrypted]).toString('base64'),
        mode: this.config.mode,
      };
      
    } catch (error) {
      logger.error('❌ Encryption failed:', error);
      throw error;
    }
  }

  /**
   * Decrypt data using Kyber-derived shared secret
   * @param {string} keyId - Key pair identifier
   * @param {string} cipherTextBase64 - Kyber ciphertext
   * @param {string} encryptedDataBase64 - Encrypted data
   * @returns {Promise<Buffer>} Decrypted plaintext
   */
  async decrypt(keyId, cipherTextBase64, encryptedDataBase64) {
    try {
      // Decapsulate to get shared secret
      const { sharedSecret } = await this.decapsulate(keyId, cipherTextBase64);
      
      // Decrypt data
      const crypto = require('crypto');
      const encryptedData = Buffer.from(encryptedDataBase64, 'base64');
      
      const iv = encryptedData.slice(0, 16);
      const authTag = encryptedData.slice(16, 32);
      const encrypted = encryptedData.slice(32);
      
      const key = crypto.createHash('sha256').update(Buffer.from(sharedSecret, 'base64')).digest();
      
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      
      return decrypted;
      
    } catch (error) {
      logger.error('❌ Decryption failed:', error);
      throw error;
    }
  }

  /**
   * Get key pair information
   * @param {string} keyId - Key pair identifier
   * @returns {Object|null} Key pair info (without secret key)
   */
  async getKeyInfo(keyId) {
    const keyPair = this.keyPairs.get(keyId);
    if (!keyPair) return null;
    
    return {
      id: keyPair.id,
      mode: keyPair.mode,
      publicKey: keyPair.publicKey,
      createdAt: keyPair.createdAt,
      expiresAt: keyPair.expiresAt,
    };
  }

  /**
   * Delete a key pair
   * @param {string} keyId - Key pair identifier
   * @returns {Promise<boolean>} Success status
   */
  async deleteKeyPair(keyId) {
    try {
      logger.info(`🗑️ Deleting key pair: ${keyId}`);
      
      // Remove from cache
      this.keyPairs.delete(keyId);
      
      // Remove from Redis
      await this.redis.del(`kyber:pubkey:${keyId}`);
      
      logger.info(`✅ Key pair deleted: ${keyId}`);
      
      return true;
      
    } catch (error) {
      logger.error(`❌ Failed to delete key pair ${keyId}:`, error);
      throw error;
    }
  }

  /**
   * Rotate key pair (generate new and delete old)
   * @param {string} keyId - Old key pair identifier
   * @returns {Promise<Object>} New key pair
   */
  async rotateKeyPair(keyId) {
    logger.info(`🔄 Rotating key pair: ${keyId}`);
    
    // Generate new key pair
    const newKeyPair = await this.generateKeyPair();
    
    // Delete old key pair
    await this.deleteKeyPair(keyId);
    
    logger.info(`✅ Key pair rotated: ${keyId} -> ${newKeyPair.id}`);
    
    return newKeyPair;
  }

  getStats() {
    return {
      ...this.stats,
      mode: this.config.mode,
      activeKeys: this.keyPairs.size,
    };
  }

  async shutdown() {
    logger.info('🛑 Shutting down Kyber Service...');
    
    // Clear all key pairs from memory
    this.keyPairs.clear();
    
    if (this.redis) {
      await this.redis.quit();
    }
    
    logger.info('✅ Kyber Service shutdown complete');
  }
}

module.exports = KyberService;
