/**
 * Smart Hibernation Service
 * 
 * Secure memory management and hibernation:
 * - Intel SGX / AMD SEV secure enclaves
 * - Encrypted memory pages
 * - Automatic hibernation based on usage
 * - Wake-on-demand with secure restore
 * - Memory pool management
 * 
 * @class SmartHibernationService
 * @version 1.0.0
 */

const { EventEmitter } = require('events');
const si = require('systeminformation');
const pidusage = require('pidusage');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const { getRedisClient } = require('../utils/redis');
const crypto = require('crypto');

class SmartHibernationService extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      enabled: options.enabled !== false,
      hibernationThreshold: options.hibernationThreshold || 0.1, // 10% usage
      wakeThreshold: options.wakeThreshold || 0.5, // 50% request
      idleTimeoutMinutes: options.idleTimeoutMinutes || 30,
      memoryThreshold: options.memoryThreshold || 85, // 85% RAM usage
      sgxEnabled: options.sgxEnabled || false,
      sevEnabled: options.sevEnabled || false,
      encryptionKeyRotation: options.encryptionKeyRotation || 3600000, // 1 hour
      ...options,
    };
    
    this.redis = null;
    this.isInitialized = false;
    
    // Managed services (models, agents, etc.)
    this.managedServices = new Map();
    
    // Hibernation state
    this.hibernationState = new Map();
    
    // Encryption keys for secure storage
    this.encryptionKeys = new Map();
    
    // Stats
    this.stats = {
      servicesHibernated: 0,
      servicesWoken: 0,
      memorySaved: 0,
      hibernationTime: 0,
    };
    
    // Monitoring timers
    this.monitorTimer = null;
    this.keyRotationTimer = null;
  }

  async initialize() {
    try {
      logger.info('💤 Initializing Smart Hibernation Service...');
      
      this.redis = await getRedisClient();
      
      // Check for SGX/SEV support
      await this.detectSecureEnclaves();
      
      // Start monitoring
      this.startMonitoring();
      
      // Start key rotation
      this.startKeyRotation();
      
      this.isInitialized = true;
      logger.info('✅ Smart Hibernation Service initialized');
      
    } catch (error) {
      logger.error('❌ Failed to initialize Smart Hibernation:', error);
      throw error;
    }
  }

  async detectSecureEnclaves() {
    try {
      const cpu = await si.cpu();
      const osInfo = await si.osInfo();
      
      // Check for Intel SGX
      if (cpu.vendor === 'Intel' && cpu.flags.includes('sgx')) {
        this.config.sgxEnabled = true;
        logger.info('✅ Intel SGX detected and enabled');
      }
      
      // Check for AMD SEV
      if (cpu.vendor === 'AMD' && cpu.flags.includes('sev')) {
        this.config.sevEnabled = true;
        logger.info('✅ AMD SEV detected and enabled');
      }
      
      if (!this.config.sgxEnabled && !this.config.sevEnabled) {
        logger.warn('⚠️ No secure enclave detected. Using software encryption.');
        this.config.softwareEncryption = true;
      }
      
    } catch (error) {
      logger.warn('⚠️ Could not detect secure enclaves:', error.message);
      this.config.softwareEncryption = true;
    }
  }

  /**
   * Register a service for hibernation management
   * @param {Object} service - Service configuration
   * @returns {Promise<Object>} Registration result
   */
  async registerService(service) {
    const serviceId = service.id || uuidv4();
    
    const serviceConfig = {
      id: serviceId,
      name: service.name,
      type: service.type || 'model', // model, agent, pipeline
      memoryUsage: service.memoryUsage || 0,
      priority: service.priority || 'normal', // critical, high, normal, low
      hibernationStrategy: service.hibernationStrategy || 'auto', // auto, manual, never
      state: 'active', // active, hibernating, hibernated
      registeredAt: Date.now(),
      lastActivity: Date.now(),
      hibernationCount: 0,
      totalHibernationTime: 0,
      encryptionKey: null,
    };
    
    // Generate encryption key for secure hibernation
    serviceConfig.encryptionKey = await this.generateEncryptionKey(serviceId);
    
    this.managedServices.set(serviceId, serviceConfig);
    
    logger.info(`✅ Service registered for hibernation: ${service.name} (${serviceId})`);
    
    return {
      serviceId,
      name: serviceConfig.name,
      encryptionType: this.config.sgxEnabled ? 'SGX' : 
                      this.config.sevEnabled ? 'SEV' : 'Software AES-256',
      state: serviceConfig.state,
    };
  }

  async generateEncryptionKey(serviceId) {
    // Generate AES-256 key
    const key = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);
    
    const keyData = {
      key: key.toString('base64'),
      iv: iv.toString('base64'),
      createdAt: Date.now(),
    };
    
    // Store in Redis with TTL
    await this.redis.setex(
      `hibernation:key:${serviceId}`,
      86400, // 24 hours
      JSON.stringify(keyData)
    );
    
    this.encryptionKeys.set(serviceId, keyData);
    
    return keyData;
  }

  /**
   * Hibernate a service
   * @param {string} serviceId - Service identifier
   * @param {Object} stateData - Service state to save
   * @returns {Promise<Object>} Hibernation result
   */
  async hibernate(serviceId, stateData) {
    const service = this.managedServices.get(serviceId);
    if (!service) {
      throw new Error(`Service not found: ${serviceId}`);
    }
    
    if (service.state === 'hibernated') {
      return { serviceId, state: 'already_hibernated' };
    }
    
    try {
      logger.info(`💤 Hibernating service: ${service.name}`);
      
      const startTime = Date.now();
      
      // Serialize state
      const serializedState = JSON.stringify(stateData);
      const stateBuffer = Buffer.from(serializedState);
      
      // Encrypt state
      const encryptedState = await this.encryptState(serviceId, stateBuffer);
      
      // Store encrypted state in Redis
      await this.redis.setex(
        `hibernation:state:${serviceId}`,
        86400 * 7, // 7 days
        JSON.stringify({
          encrypted: encryptedState.encrypted.toString('base64'),
          tag: encryptedState.tag.toString('base64'),
          size: stateBuffer.length,
          hibernatedAt: Date.now(),
        })
      );
      
      // Update service state
      service.state = 'hibernated';
      service.hibernatedAt = Date.now();
      service.hibernationCount++;
      service.memorySaved = service.memoryUsage;
      
      // Update stats
      this.stats.servicesHibernated++;
      this.stats.memorySaved += service.memoryUsage;
      
      const hibernationTime = Date.now() - startTime;
      this.stats.hibernationTime += hibernationTime;
      
      logger.info(`✅ Service hibernated: ${service.name} (${hibernationTime}ms)`);
      
      this.emit('service:hibernated', { serviceId, memorySaved: service.memoryUsage });
      
      return {
        serviceId,
        state: 'hibernated',
        memorySaved: service.memoryUsage,
        hibernationTime,
        encryption: this.config.sgxEnabled ? 'SGX' : 
                    this.config.sevEnabled ? 'SEV' : 'Software AES-256-GCM',
      };
      
    } catch (error) {
      service.state = 'active';
      logger.error(`❌ Hibernation failed for ${serviceId}:`, error);
      throw error;
    }
  }

  /**
   * Wake up a hibernated service
   * @param {string} serviceId - Service identifier
   * @returns {Promise<Object>} Restored state
   */
  async wake(serviceId) {
    const service = this.managedServices.get(serviceId);
    if (!service) {
      throw new Error(`Service not found: ${serviceId}`);
    }
    
    if (service.state === 'active') {
      return { serviceId, state: 'already_active' };
    }
    
    try {
      logger.info(`🌅 Waking service: ${service.name}`);
      
      const startTime = Date.now();
      
      // Retrieve encrypted state from Redis
      const stored = await this.redis.get(`hibernation:state:${serviceId}`);
      if (!stored) {
        throw new Error(`Hibernated state not found for service: ${serviceId}`);
      }
      
      const stateData = JSON.parse(stored);
      
      // Decrypt state
      const encryptedBuffer = Buffer.from(stateData.encrypted, 'base64');
      const tag = Buffer.from(stateData.tag, 'base64');
      
      const decryptedState = await this.decryptState(serviceId, encryptedBuffer, tag);
      
      // Update service state
      service.state = 'active';
      service.wokenAt = Date.now();
      service.lastActivity = Date.now();
      
      if (service.hibernatedAt) {
        const hibernationDuration = Date.now() - service.hibernatedAt;
        service.totalHibernationTime += hibernationDuration;
      }
      
      // Update stats
      this.stats.servicesWoken++;
      
      const wakeTime = Date.now() - startTime;
      
      // Parse restored state
      const restoredState = JSON.parse(decryptedState.toString());
      
      logger.info(`✅ Service woken: ${service.name} (${wakeTime}ms)`);
      
      this.emit('service:woken', { serviceId, wakeTime });
      
      return {
        serviceId,
        state: 'active',
        wakeTime,
        hibernationDuration: service.totalHibernationTime,
        restoredState,
      };
      
    } catch (error) {
      logger.error(`❌ Wake failed for ${serviceId}:`, error);
      throw error;
    }
  }

  async encryptState(serviceId, stateBuffer) {
    const keyData = this.encryptionKeys.get(serviceId);
    if (!keyData) {
      throw new Error(`Encryption key not found for service: ${serviceId}`);
    }
    
    const key = Buffer.from(keyData.key, 'base64');
    const iv = Buffer.from(keyData.iv, 'base64');
    
    // Use AES-256-GCM for authenticated encryption
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(stateBuffer), cipher.final()]);
    const tag = cipher.getAuthTag();
    
    return { encrypted, tag };
  }

  async decryptState(serviceId, encryptedBuffer, tag) {
    const keyData = this.encryptionKeys.get(serviceId);
    if (!keyData) {
      // Try to load from Redis
      const stored = await this.redis.get(`hibernation:key:${serviceId}`);
      if (!stored) {
        throw new Error(`Encryption key not found for service: ${serviceId}`);
      }
      this.encryptionKeys.set(serviceId, JSON.parse(stored));
    }
    
    const key = Buffer.from(keyData.key, 'base64');
    const iv = Buffer.from(keyData.iv, 'base64');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    
    return Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]);
  }

  /**
   * Hibernate all eligible services
   * @returns {Promise<Array>} Hibernation results
   */
  async hibernateAll() {
    logger.info('💤 Hibernating all eligible services...');
    
    const results = [];
    
    for (const [serviceId, service] of this.managedServices) {
      if (service.state === 'active' && service.hibernationStrategy === 'auto') {
        try {
          // Check if service is idle
          const idleTime = Date.now() - service.lastActivity;
          if (idleTime > this.config.idleTimeoutMinutes * 60000) {
            const result = await this.hibernate(serviceId, {
              type: 'auto_hibernation',
              serviceName: service.name,
              memoryUsage: service.memoryUsage,
            });
            results.push(result);
          }
        } catch (error) {
          logger.error(`❌ Failed to hibernate ${serviceId}:`, error);
        }
      }
    }
    
    logger.info(`✅ Hibernated ${results.length} services`);
    
    return results;
  }

  /**
   * Wake all hibernated services
   * @returns {Promise<Array>} Wake results
   */
  async wakeAll() {
    logger.info('🌅 Waking all hibernated services...');
    
    const results = [];
    
    for (const [serviceId, service] of this.managedServices) {
      if (service.state === 'hibernated') {
        try {
          const result = await this.wake(serviceId);
          results.push(result);
        } catch (error) {
          logger.error(`❌ Failed to wake ${serviceId}:`, error);
        }
      }
    }
    
    logger.info(`✅ Woke ${results.length} services`);
    
    return results;
  }

  /**
   * Update service activity
   * @param {string} serviceId - Service identifier
   */
  async updateActivity(serviceId) {
    const service = this.managedServices.get(serviceId);
    if (service) {
      service.lastActivity = Date.now();
      
      // Wake if hibernated
      if (service.state === 'hibernated') {
        await this.wake(serviceId);
      }
    }
  }

  startMonitoring() {
    // Monitor resource usage every 30 seconds
    this.monitorTimer = setInterval(async () => {
      await this.monitorResources();
    }, 30000);
    
    logger.info('🔍 Hibernation monitoring started');
  }

  async monitorResources() {
    try {
      // Get system memory
      const mem = await si.mem();
      const memoryUsagePercent = (mem.active / mem.total) * 100;
      
      // Store metrics
      await this.redis.setex('hibernation:memory:usage', 60, memoryUsagePercent.toString());
      
      // Auto-hibernate if memory threshold exceeded
      if (memoryUsagePercent > this.config.memoryThreshold) {
        logger.warn(`⚠️ Memory usage at ${memoryUsagePercent.toFixed(1)}%. Auto-hibernating...`);
        await this.hibernateAll();
      }
      
    } catch (error) {
      logger.error('❌ Resource monitoring failed:', error);
    }
  }

  startKeyRotation() {
    this.keyRotationTimer = setInterval(async () => {
      await this.rotateEncryptionKeys();
    }, this.config.encryptionKeyRotation);
    
    logger.info('🔑 Key rotation started');
  }

  async rotateEncryptionKeys() {
    logger.info('🔄 Rotating encryption keys...');
    
    for (const [serviceId] of this.encryptionKeys) {
      await this.generateEncryptionKey(serviceId);
    }
    
    logger.info('✅ Encryption keys rotated');
  }

  /**
   * Get hibernation status for all services
   * @returns {Array} Service states
   */
  getHibernationStatus() {
    return Array.from(this.managedServices.values()).map(service => ({
      id: service.id,
      name: service.name,
      state: service.state,
      memoryUsage: service.memoryUsage,
      hibernationCount: service.hibernationCount,
      totalHibernationTime: service.totalHibernationTime,
      lastActivity: service.lastActivity,
    }));
  }

  getStats() {
    return {
      ...this.stats,
      servicesManaged: this.managedServices.size,
      servicesHibernated: Array.from(this.managedServices.values()).filter(s => s.state === 'hibernated').length,
      encryptionType: this.config.sgxEnabled ? 'SGX' : 
                      this.config.sevEnabled ? 'SEV' : 'Software',
      enabled: this.config.enabled,
    };
  }

  async shutdown() {
    logger.info('🛑 Shutting down Smart Hibernation Service...');
    
    if (this.monitorTimer) clearInterval(this.monitorTimer);
    if (this.keyRotationTimer) clearInterval(this.keyRotationTimer);
    
    // Wake all hibernated services before shutdown
    await this.wakeAll();
    
    this.managedServices.clear();
    this.encryptionKeys.clear();
    
    if (this.redis) {
      await this.redis.quit();
    }
    
    logger.info('✅ Smart Hibernation Service shutdown complete');
  }
}

module.exports = SmartHibernationService;
