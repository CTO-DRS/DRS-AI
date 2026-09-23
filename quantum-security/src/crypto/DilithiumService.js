/**
 * Dilithium Service
 * 
 * NIST-approved post-quantum Digital Signature Algorithm
 * - Dilithium-2: ~128-bit security
 * - Dilithium-3: ~192-bit security (recommended)
 * - Dilithium-5: ~256-bit security
 * 
 * @class DilithiumService
 * @version 1.0.0
 */

const { ml_dsa44, ml_dsa65, ml_dsa87 } = require('./pq-compat');
const { logger } = require('../utils/logger');
const { getRedisClient } = require('../utils/redis');
const { v4: uuidv4 } = require('uuid');

class DilithiumService {
  constructor(options = {}) {
    this.config = {
      mode: options.mode || '3', // 2, 3, or 5
      keyExpiryHours: options.keyExpiryHours || 168, // 7 days
      ...options,
    };
    
    this.redis = null;
    this.isInitialized = false;
    
    // Key pairs cache
    this.keyPairs = new Map();
    
    // Stats
    this.stats = {
      keyPairsGenerated: 0,
      signatures: 0,
      verifications: 0,
    };
  }

  async initialize() {
    try {
      logger.info(`✍️ Initializing Dilithium (Mode: ${this.config.mode})...`);
      
      // Initialize Redis
      this.redis = await getRedisClient();
      
      // Select Dilithium variant
      switch (this.config.mode) {
        case '2':
          this.dilithium = ml_dsa44;
          break;
        case '5':
          this.dilithium = ml_dsa87;
          break;
        case '3':
        default:
          this.dilithium = ml_dsa65;
          break;
      }
      
      // Test key generation
      const testKeys = this.dilithium.keygen();
      logger.info(`✅ Dilithium-${this.config.mode} initialized successfully`);
      logger.info(`   Public key size: ${testKeys.publicKey.length} bytes`);
      logger.info(`   Secret key size: ${testKeys.secretKey.length} bytes`);
      logger.info(`   Signature size: ~${this.getSignatureSize()} bytes`);
      
      this.isInitialized = true;
      
    } catch (error) {
      logger.error('❌ Failed to initialize Dilithium:', error);
      throw error;
    }
  }

  getSignatureSize() {
    const sizes = {
      '2': 2420,
      '3': 3293,
      '5': 4595,
    };
    return sizes[this.config.mode] || 3293;
  }

  /**
   * Generate a new Dilithium key pair
   * @param {string} keyId - Optional key identifier
   * @returns {Promise<Object>} Key pair information
   */
  async generateKeyPair(keyId = null) {
    try {
      const id = keyId || uuidv4();
      
      logger.info(`🔑 Generating Dilithium-${this.config.mode} key pair: ${id}`);
      
      // Generate key pair
      const { publicKey, secretKey } = this.dilithium.keygen();
      
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
        `dilithium:pubkey:${id}`,
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
   * Sign a message
   * @param {string} keyId - Key pair identifier
   * @param {Buffer|string} message - Message to sign
   * @returns {Promise<Object>} Signature
   */
  async sign(keyId, message) {
    try {
      logger.info(`✍️ Signing message with key: ${keyId}`);
      
      // Get key pair
      const keyPair = this.keyPairs.get(keyId);
      if (!keyPair) {
        throw new Error(`Key pair not found: ${keyId}`);
      }
      
      const secretKey = Buffer.from(keyPair.secretKey, 'base64');
      const messageBuffer = Buffer.isBuffer(message) ? message : Buffer.from(message, 'utf8');
      
      // Sign
      const signature = this.dilithium.sign(messageBuffer, secretKey);
      
      this.stats.signatures++;
      
      logger.info('✅ Message signed successfully');
      
      return {
        signature: Buffer.from(signature).toString('base64'),
        messageHash: require('crypto').createHash('sha256').update(messageBuffer).digest('hex'),
        mode: this.config.mode,
        keyId,
        timestamp: Date.now(),
      };
      
    } catch (error) {
      logger.error('❌ Signing failed:', error);
      throw error;
    }
  }

  /**
   * Verify a signature
   * @param {string} publicKeyBase64 - Public key
   * @param {Buffer|string} message - Original message
   * @param {string} signatureBase64 - Signature
   * @returns {Promise<Object>} Verification result
   */
  async verify(publicKeyBase64, message, signatureBase64) {
    try {
      logger.info('🔍 Verifying signature...');
      
      const publicKey = Buffer.from(publicKeyBase64, 'base64');
      const messageBuffer = Buffer.isBuffer(message) ? message : Buffer.from(message, 'utf8');
      const signature = Buffer.from(signatureBase64, 'base64');
      
      // Verify
      const isValid = this.dilithium.verify(messageBuffer, signature, publicKey);
      
      this.stats.verifications++;
      
      logger.info(`✅ Signature verification: ${isValid ? 'VALID' : 'INVALID'}`);
      
      return {
        valid: isValid,
        mode: this.config.mode,
        timestamp: Date.now(),
      };
      
    } catch (error) {
      logger.error('❌ Verification failed:', error);
      return {
        valid: false,
        error: error.message,
        mode: this.config.mode,
      };
    }
  }

  /**
   * Sign JSON data
   * @param {string} keyId - Key pair identifier
   * @param {Object} data - Data to sign
   * @returns {Promise<Object>} Signed data with signature
   */
  async signJSON(keyId, data) {
    try {
      // Canonicalize JSON (sort keys for consistent serialization)
      const canonicalJSON = JSON.stringify(data, Object.keys(data).sort());
      
      const signatureResult = await this.sign(keyId, canonicalJSON);
      
      return {
        data,
        signature: signatureResult.signature,
        algorithm: `Dilithium-${this.config.mode}`,
        timestamp: signatureResult.timestamp,
      };
      
    } catch (error) {
      logger.error('❌ JSON signing failed:', error);
      throw error;
    }
  }

  /**
   * Verify signed JSON data
   * @param {string} publicKeyBase64 - Public key
   * @param {Object} signedData - Signed data object
   * @returns {Promise<Object>} Verification result
   */
  async verifyJSON(publicKeyBase64, signedData) {
    try {
      const { data, signature } = signedData;
      
      // Canonicalize JSON
      const canonicalJSON = JSON.stringify(data, Object.keys(data).sort());
      
      return await this.verify(publicKeyBase64, canonicalJSON, signature);
      
    } catch (error) {
      logger.error('❌ JSON verification failed:', error);
      return {
        valid: false,
        error: error.message,
      };
    }
  }

  /**
   * Create a certificate (self-signed for now)
   * @param {string} keyId - Key pair identifier
   * @param {Object} subject - Certificate subject
   * @returns {Promise<Object>} Certificate
   */
  async createCertificate(keyId, subject) {
    try {
      logger.info(`📜 Creating certificate for key: ${keyId}`);
      
      const keyPair = this.keyPairs.get(keyId);
      if (!keyPair) {
        throw new Error(`Key pair not found: ${keyId}`);
      }
      
      const certificate = {
        version: '1.0',
        algorithm: `Dilithium-${this.config.mode}`,
        subject,
        publicKey: keyPair.publicKey,
        issuedAt: Date.now(),
        expiresAt: Date.now() + (365 * 24 * 60 * 60 * 1000), // 1 year
      };
      
      // Sign the certificate
      const signature = await this.sign(keyId, JSON.stringify(certificate));
      
      return {
        ...certificate,
        signature: signature.signature,
      };
      
    } catch (error) {
      logger.error('❌ Certificate creation failed:', error);
      throw error;
    }
  }

  /**
   * Verify a certificate
   * @param {Object} certificate - Certificate to verify
   * @returns {Promise<Object>} Verification result
   */
  async verifyCertificate(certificate) {
    try {
      logger.info('🔍 Verifying certificate...');
      
      const { signature, ...certData } = certificate;
      
      const result = await this.verify(
        certificate.publicKey,
        JSON.stringify(certData),
        signature
      );
      
      // Check expiration
      const isExpired = Date.now() > certificate.expiresAt;
      
      return {
        ...result,
        expired: isExpired,
        valid: result.valid && !isExpired,
      };
      
    } catch (error) {
      logger.error('❌ Certificate verification failed:', error);
      return {
        valid: false,
        error: error.message,
      };
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
      await this.redis.del(`dilithium:pubkey:${keyId}`);
      
      logger.info(`✅ Key pair deleted: ${keyId}`);
      
      return true;
      
    } catch (error) {
      logger.error(`❌ Failed to delete key pair ${keyId}:`, error);
      throw error;
    }
  }

  getStats() {
    return {
      ...this.stats,
      mode: this.config.mode,
      activeKeys: this.keyPairs.size,
      signatureSize: this.getSignatureSize(),
    };
  }

  async shutdown() {
    logger.info('🛑 Shutting down Dilithium Service...');
    
    // Clear all key pairs from memory
    this.keyPairs.clear();
    
    if (this.redis) {
      await this.redis.quit();
    }
    
    logger.info('✅ Dilithium Service shutdown complete');
  }
}

module.exports = DilithiumService;
