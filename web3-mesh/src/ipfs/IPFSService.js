/**
 * IPFS Service
 * 
 * Decentralized storage integration:
 * - File upload and retrieval
 * - Pin management
 * - Content addressing
 * - IPNS publishing
 * 
 * @class IPFSService
 * @version 1.0.0
 */

const { create } = require('ipfs-http-client');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const { getRedisClient } = require('../utils/redis');

class IPFSService {
  constructor(options = {}) {
    this.config = {
      host: options.host || process.env.IPFS_HOST || 'ipfs',
      port: options.port || process.env.IPFS_PORT || 5001,
      protocol: options.protocol || process.env.IPFS_PROTOCOL || 'http',
      ...options,
    };
    
    this.ipfs = null;
    this.redis = null;
    this.isInitialized = false;
    
    // Stats
    this.stats = {
      uploads: 0,
      downloads: 0,
      pins: 0,
      totalSize: 0,
    };
  }

  async initialize() {
    try {
      logger.info('📦 Initializing IPFS Service...');
      
      // Initialize Redis
      this.redis = await getRedisClient();
      
      // Connect to IPFS
      this.ipfs = create({
        host: this.config.host,
        port: this.config.port,
        protocol: this.config.protocol,
      });
      
      // Test connection
      const version = await this.ipfs.version();
      logger.info(`✅ Connected to IPFS version: ${version.version}`);
      
      // Load stats from Redis
      await this.loadStats();
      
      this.isInitialized = true;
      
    } catch (error) {
      logger.error('❌ Failed to initialize IPFS:', error);
      // Don't throw - service can work in degraded mode
      logger.warn('⚠️ IPFS service running in degraded mode');
    }
  }

  async loadStats() {
    try {
      const stats = await this.redis.get('ipfs:stats');
      if (stats) {
        this.stats = JSON.parse(stats);
      }
    } catch (error) {
      logger.warn('⚠️ Could not load IPFS stats');
    }
  }

  async saveStats() {
    try {
      await this.redis.setex('ipfs:stats', 86400, JSON.stringify(this.stats));
    } catch (error) {
      logger.warn('⚠️ Could not save IPFS stats');
    }
  }

  /**
   * Upload file to IPFS
   * @param {Buffer} data - File data
   * @param {Object} options - Upload options
   * @returns {Promise<Object>} Upload result
   */
  async upload(data, options = {}) {
    if (!this.ipfs) {
      throw new Error('IPFS not initialized');
    }
    
    const { pin = true, wrapWithDirectory = false, metadata = {} } = options;
    
    try {
      logger.info(`📤 Uploading file to IPFS (${data.length} bytes)...`);
      
      const startTime = Date.now();
      
      // Add to IPFS
      const result = await this.ipfs.add(data, {
        pin,
        wrapWithDirectory,
        cidVersion: 1,
      });
      
      const uploadTime = Date.now() - startTime;
      
      // Store metadata
      const uploadRecord = {
        cid: result.cid.toString(),
        size: result.size,
        path: result.path,
        timestamp: Date.now(),
        uploadTime,
        metadata,
      };
      
      await this.redis.setex(
        `ipfs:upload:${result.cid}`,
        86400 * 30,
        JSON.stringify(uploadRecord)
      );
      
      // Update stats
      this.stats.uploads++;
      this.stats.totalSize += result.size;
      await this.saveStats();
      
      logger.info(`✅ File uploaded: ${result.cid}`);
      
      return uploadRecord;
      
    } catch (error) {
      logger.error('❌ IPFS upload failed:', error);
      throw error;
    }
  }

  /**
   * Download file from IPFS
   * @param {string} cid - Content identifier
   * @returns {Promise<Buffer>} File data
   */
  async download(cid) {
    if (!this.ipfs) {
      throw new Error('IPFS not initialized');
    }
    
    try {
      logger.info(`📥 Downloading from IPFS: ${cid}`);
      
      const chunks = [];
      for await (const chunk of this.ipfs.cat(cid)) {
        chunks.push(chunk);
      }
      
      const data = Buffer.concat(chunks);
      
      // Update stats
      this.stats.downloads++;
      await this.saveStats();
      
      logger.info(`✅ Downloaded ${data.length} bytes from IPFS`);
      
      return data;
      
    } catch (error) {
      logger.error(`❌ IPFS download failed for ${cid}:`, error);
      throw error;
    }
  }

  /**
   * Pin content to IPFS
   * @param {string} cid - Content identifier
   * @returns {Promise<Object>} Pin result
   */
  async pin(cid) {
    if (!this.ipfs) {
      throw new Error('IPFS not initialized');
    }
    
    try {
      logger.info(`📌 Pinning content: ${cid}`);
      
      await this.ipfs.pin.add(cid);
      
      // Update stats
      this.stats.pins++;
      await this.saveStats();
      
      logger.info(`✅ Content pinned: ${cid}`);
      
      return {
        cid,
        pinned: true,
        timestamp: Date.now(),
      };
      
    } catch (error) {
      logger.error(`❌ Failed to pin ${cid}:`, error);
      throw error;
    }
  }

  /**
   * Unpin content from IPFS
   * @param {string} cid - Content identifier
   * @returns {Promise<Object>} Unpin result
   */
  async unpin(cid) {
    if (!this.ipfs) {
      throw new Error('IPFS not initialized');
    }
    
    try {
      logger.info(`📍 Unpinning content: ${cid}`);
      
      await this.ipfs.pin.rm(cid);
      
      // Update stats
      this.stats.pins = Math.max(0, this.stats.pins - 1);
      await this.saveStats();
      
      logger.info(`✅ Content unpinned: ${cid}`);
      
      return {
        cid,
        unpinned: true,
        timestamp: Date.now(),
      };
      
    } catch (error) {
      logger.error(`❌ Failed to unpin ${cid}:`, error);
      throw error;
    }
  }

  /**
   * List pinned content
   * @returns {Promise<Array>} List of pinned CIDs
   */
  async listPins() {
    if (!this.ipfs) {
      throw new Error('IPFS not initialized');
    }
    
    try {
      const pins = [];
      for await (const pin of this.ipfs.pin.ls()) {
        pins.push({
          cid: pin.cid.toString(),
          type: pin.type,
        });
      }
      return pins;
    } catch (error) {
      logger.error('❌ Failed to list pins:', error);
      throw error;
    }
  }

  /**
   * Publish to IPNS
   * @param {string} cid - Content to publish
   * @param {string} key - IPNS key name
   * @returns {Promise<Object>} Publish result
   */
  async publishToIPNS(cid, key = 'self') {
    if (!this.ipfs) {
      throw new Error('IPFS not initialized');
    }
    
    try {
      logger.info(`🌐 Publishing to IPNS: ${cid}`);
      
      const result = await this.ipfs.name.publish(cid, {
        key,
        resolve: false,
      });
      
      logger.info(`✅ Published to IPNS: ${result.name}`);
      
      return {
        name: result.name,
        value: result.value,
        timestamp: Date.now(),
      };
      
    } catch (error) {
      logger.error('❌ IPNS publish failed:', error);
      throw error;
    }
  }

  /**
   * Resolve IPNS name
   * @param {string} name - IPNS name
   * @returns {Promise<string>} Resolved CID
   */
  async resolveIPNS(name) {
    if (!this.ipfs) {
      throw new Error('IPFS not initialized');
    }
    
    try {
      logger.info(`🔍 Resolving IPNS: ${name}`);
      
      const result = await this.ipfs.name.resolve(name);
      
      return result;
      
    } catch (error) {
      logger.error(`❌ IPNS resolve failed for ${name}:`, error);
      throw error;
    }
  }

  /**
   * Get content info
   * @param {string} cid - Content identifier
   * @returns {Promise<Object>} Content info
   */
  async getInfo(cid) {
    if (!this.ipfs) {
      throw new Error('IPFS not initialized');
    }
    
    try {
      const stats = await this.ipfs.files.stat(`/ipfs/${cid}`);
      
      return {
        cid,
        size: stats.size,
        cumulativeSize: stats.cumulativeSize,
        type: stats.type,
        blocks: stats.blocks,
        links: stats.links,
      };
      
    } catch (error) {
      logger.error(`❌ Failed to get info for ${cid}:`, error);
      throw error;
    }
  }

  getStats() {
    return {
      ...this.stats,
      connected: this.ipfs !== null,
    };
  }

  async shutdown() {
    logger.info('🛑 Shutting down IPFS Service...');
    
    await this.saveStats();
    
    if (this.redis) {
      await this.redis.quit();
    }
    
    logger.info('✅ IPFS Service shutdown complete');
  }
}

module.exports = IPFSService;
