/**
 * VRAM Monitor
 *
 * Tracks per-model VRAM allocations and enforces a soft budget.
 *
 * Each "load" of a model reserves a VRAM block on a specific GPU.
 * When VRAM drops below 10% free, the monitor triggers the offload
 * manager to evict least-recently-used models.
 */
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const redis = require('../utils/redis');

const EVICTION_THRESHOLD = Number(process.env.GPU_EVICTION_THRESHOLD || 0.1); // 10% free
const LRU_TRACK_KEY = 'drs:gpu:lru';

class VRamMonitor {
  constructor(cudaMetrics) {
    this.cudaMetrics = cudaMetrics;
    this.isInitialized = false;
    this.allocations = new Map(); // allocationId -> { model, gpu, bytes, ts }
  }

  async initialize() {
    logger.info('💾 Initializing VRAM Monitor...');
    await this.loadFromRedis();
    this.isInitialized = true;
    logger.info(`✅ VRAM Monitor initialized — ${this.allocations.size} active allocations`);
  }

  async loadFromRedis() {
    const all = await redis.hgetall('drs:gpu:allocations');
    for (const [id, raw] of Object.entries(all || {})) {
      try { this.allocations.set(id, JSON.parse(raw)); } catch {}
    }
  }

  async allocate(model, gpuIndex, bytes) {
    const aggregate = this.cudaMetrics.getAggregate();
    const total = aggregate.total || 0;
    const free = aggregate.free || 0;

    if (total > 0 && bytes > free) {
      throw new Error(`Insufficient VRAM: requested ${bytes} MB, free ${free} MB`);
    }

    const id = uuidv4();
    const record = {
      id,
      model,
      gpu: gpuIndex,
      bytes,
      allocatedAt: new Date().toISOString(),
      lastUsed: Date.now(),
    };
    this.allocations.set(id, record);
    await redis.hset('drs:gpu:allocations', id, JSON.stringify(record));
    await this.touchLRU(id);
    logger.info(`📥 Allocated ${bytes} MB on GPU ${gpuIndex} for model "${model}" (id=${id})`);
    return record;
  }

  async deallocate(id) {
    const rec = this.allocations.get(id);
    if (!rec) return null;
    this.allocations.delete(id);
    await redis.hdel('drs:gpu:allocations', id);
    logger.info(`📤 Deallocated ${rec.bytes} MB from GPU ${rec.gpu} (model=${rec.model})`);
    return rec;
  }

  async touchLRU(id) {
    const rec = this.allocations.get(id);
    if (rec) {
      rec.lastUsed = Date.now();
      await redis.hset('drs:gpu:allocations', id, JSON.stringify(rec));
    }
  }

  /**
   * If free VRAM is below threshold, evict LRU model(s) until safe.
   * Returns list of evicted models.
   */
  async evictIfNecessary(targetModelBytes = 0) {
    const evicted = [];
    const aggregate = this.cudaMetrics.getAggregate();
    const total = aggregate.total || 0;
    if (total === 0) return evicted; // software mode — skip eviction

    let free = aggregate.free;
    const required = targetModelBytes + total * EVICTION_THRESHOLD;
    if (free >= required) return evicted;

    // Sort by lastUsed ascending
    const sorted = Array.from(this.allocations.values()).sort((a, b) => a.lastUsed - b.lastUsed);

    for (const rec of sorted) {
      if (free >= required) break;
      await this.deallocate(rec.id);
      evicted.push(rec);
      free += rec.bytes;
    }
    if (evicted.length > 0) logger.warn(`🧹 Evicted ${evicted.length} model(s) to free VRAM`);
    return evicted;
  }

  list() {
    return Array.from(this.allocations.values());
  }

  async shutdown() {
    this.isInitialized = false;
    logger.info('🛑 VRAM Monitor stopped');
  }
}

module.exports = VRamMonitor;
