/**
 * IPFS Service (in-memory mock)
 *
 * Decentralized storage integration with:
 * - File upload and retrieval
 * - Pin management
 * - Content addressing
 * - IPNS publishing
 *
 * NOTE: This implementation uses an in-memory mock so the service can run
 * without a real IPFS daemon or the ESM-only `ipfs-http-client` package.
 * For production, replace this with the real IPFS HTTP client — the
 * public API is preserved.
 *
 * @class IPFSService
 * @version 1.0.0
 */

const crypto = require('crypto');
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

    this.stats = {
      uploads: 0,
      downloads: 0,
      pins: 0,
      totalSize: 0,
    };

    // In-memory store: cid -> { data, pinned, size, uploadedAt }
    this.store = new Map();
  }

  async initialize() {
    try {
      logger.info('📦 Initializing IPFS Service (in-memory mock)...');

      this.redis = await getRedisClient();

      // Create a pseudo-IPFS client
      this.ipfs = {
        version: async () => ({ version: 'mock-1.0.0', commit: 'memory', repo: 'in-memory' }),
        add: async (data) => {
          const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
          const hash = crypto.createHash('sha256').update(buf).digest('hex');
          // Mock CIDv1 (base58, 46 chars starting with 'bafy')
          const cid = 'bafy' + hash.slice(0, 40);
          this.store.set(cid, { data: buf, pinned: false, size: buf.length, uploadedAt: Date.now() });
          this.stats.uploads++;
          this.stats.totalSize += buf.length;
          return [{ path: cid, cid, size: buf.length }];
        },
        cat: async function* (cid) {
          const entry = this.store.get(cid);
          if (!entry) throw new Error(`CID not found: ${cid}`);
          this.stats.downloads++;
          yield entry.data;
        }.bind(this),
        pin: {
          add: async (cid) => {
            const entry = this.store.get(cid);
            if (!entry) throw new Error(`CID not found: ${cid}`);
            entry.pinned = true;
            this.stats.pins++;
            logger.info(`📌 Pinned: ${cid}`);
            return { pins: [{ cid }] };
          },
          rm: async (cid) => {
            const entry = this.store.get(cid);
            if (entry) entry.pinned = false;
            logger.info(`📤 Unpinned: ${cid}`);
            return { pins: [{ cid }] };
          },
          ls: async function* () {
            for (const [cid, entry] of this.store.entries()) {
              if (entry.pinned) yield { cid, type: 'recursive' };
            }
          }.bind(this),
        },
        name: {
          publish: async (cid) => ({
            name: '/ipns/Qm' + crypto.randomBytes(16).toString('hex'),
            value: `/ipfs/${cid}`,
          }),
          resolve: async (name) => {
            // Mock resolve — return the name itself wrapped in /ipfs/
            return `/ipfs/bafy${name.slice(-40)}`;
          },
        },
        files: {
          stat: async (path) => {
            const cid = path.replace('/ipfs/', '');
            const entry = this.store.get(cid);
            return {
              cid,
              size: entry?.size || 0,
              cumulativeSize: entry?.size || 0,
              blocks: 1,
              type: 'file',
            };
          },
        },
      };

      const version = await this.ipfs.version();
      logger.info(`✅ IPFS Service initialized — version: ${version.version}`);
      this.isInitialized = true;
    } catch (error) {
      logger.error('❌ Failed to initialize IPFS:', error);
      throw error;
    }
  }

  async upload(data, options = {}) {
    if (!this.isInitialized) throw new Error('IPFS not initialized');
    const result = await this.ipfs.add(data, options);
    const cid = result[0].cid;
    if (options.pin) await this.ipfs.pin.add(cid);
    logger.info(`📤 Uploaded ${result[0].size}b → ${cid}`);
    return { cid, size: result[0].size, path: result[0].path };
  }

  async download(cid) {
    if (!this.isInitialized) throw new Error('IPFS not initialized');
    const chunks = [];
    for await (const chunk of this.ipfs.cat(cid)) chunks.push(chunk);
    const data = Buffer.concat(chunks);
    logger.info(`📥 Downloaded ${data.length}b ← ${cid}`);
    return data;
  }

  async pin(cid) {
    if (!this.isInitialized) throw new Error('IPFS not initialized');
    return this.ipfs.pin.add(cid);
  }

  async unpin(cid) {
    if (!this.isInitialized) throw new Error('IPFS not initialized');
    return this.ipfs.pin.rm(cid);
  }

  async listPins() {
    if (!this.isInitialized) throw new Error('IPFS not initialized');
    const pins = [];
    for await (const pin of this.ipfs.pin.ls()) pins.push(pin);
    return pins;
  }

  async publishIPNS(cid) {
    if (!this.isInitialized) throw new Error('IPFS not initialized');
    return this.ipfs.name.publish(cid);
  }

  async resolveIPNS(name) {
    if (!this.isInitialized) throw new Error('IPFS not initialized');
    return this.ipfs.name.resolve(name);
  }

  async stat(cid) {
    if (!this.isInitialized) throw new Error('IPFS not initialized');
    return this.ipfs.files.stat(`/ipfs/${cid}`);
  }

  getStats() {
    return {
      ...this.stats,
      storeSize: this.store.size,
      memoryUsageMB: Number((this.stats.totalSize / (1024 * 1024)).toFixed(2)),
    };
  }

  async shutdown() {
    this.isInitialized = false;
    this.store.clear();
    logger.info('✅ IPFS Service shutdown complete');
  }
}

module.exports = IPFSService;
