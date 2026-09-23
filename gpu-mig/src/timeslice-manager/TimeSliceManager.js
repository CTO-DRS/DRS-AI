/**
 * Time-Slicing Manager
 *
 * For GPUs that don't support MIG (Ampere consumer cards, Turing, Pascal, etc.),
 * NVIDIA provides "MPS-style" time-slicing — multiple processes share the same
 * GPU concurrently, scheduled by the driver.
 *
 * Configured via Kubernetes device plugin `time-slicing.config` or by manually
 * setting `CUDA_MPS_PIPE_DIRECTORY` and `CUDA_MPS_LOG_DIRECTORY`.
 *
 * This manager:
 *   1. Tracks active time-slicing contexts
 *   2. Limits concurrent clients per GPU
 *   3. Provides fairness metrics
 */
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const redis = require('../utils/redis');

const DEFAULT_MAX_CLIENTS_PER_GPU = Number(process.env.GPU_TS_MAX_CLIENTS || 4);
const FAIRNESS_WINDOW_SECONDS = 60;

class TimeSliceManager {
  constructor() {
    this.isInitialized = false;
    this.contexts = new Map(); // contextId -> { gpuId, tenant, startedAt, utilSamples: [] }
    this.maxClientsPerGpu = DEFAULT_MAX_CLIENTS_PER_GPU;
  }

  async initialize() {
    logger.info(`⏱️  Initializing Time-Slice Manager (max=${this.maxClientsPerGpu}/GPU)...`);
    await this.loadFromRedis();
    this.isInitialized = true;
    logger.info(`✅ Time-Slice Manager initialized — ${this.contexts.size} active context(s)`);
  }

  async loadFromRedis() {
    const all = await redis.hgetall('drs:ts:contexts');
    for (const [id, raw] of Object.entries(all || {})) {
      try { this.contexts.set(id, JSON.parse(raw)); } catch {}
    }
  }

  /**
   * Acquire a time-slice on a GPU for a tenant.
   */
  async acquire(gpuId, tenantId, opts = {}) {
    const activeOnThisGpu = this.listByGpu(gpuId).length;
    if (activeOnThisGpu >= this.maxClientsPerGpu) {
      throw new Error(`GPU ${gpuId} is at capacity (${this.maxClientsPerGpu} clients)`);
    }

    const id = uuidv4();
    const ctx = {
      id,
      gpuId: Number(gpuId),
      tenantId,
      priority: opts.priority || 1,        // 1=normal, 10=high
      startedAt: new Date().toISOString(),
      lastHeartbeat: Date.now(),
      utilSamples: [],                       // rolling 60s of utilization %
      quota: opts.quota || 100,              // target % share
      status: 'active',
    };
    this.contexts.set(id, ctx);
    await redis.hset('drs:ts:contexts', id, JSON.stringify(ctx));
    logger.info(`⏱️  Time-slice acquired: ${id} on GPU ${gpuId} for ${tenantId} (active=${activeOnThisGpu + 1}/${this.maxClientsPerGpu})`);
    return ctx;
  }

  async heartbeat(contextId, utilization = 0) {
    const ctx = this.contexts.get(contextId);
    if (!ctx) throw new Error(`Unknown context: ${contextId}`);
    ctx.lastHeartbeat = Date.now();
    ctx.utilSamples.push({ t: Date.now(), u: utilization });
    if (ctx.utilSamples.length > FAIRNESS_WINDOW_SECONDS) ctx.utilSamples.shift();
    await redis.hset('drs:ts:contexts', contextId, JSON.stringify(ctx));
    return ctx;
  }

  async release(contextId) {
    const ctx = this.contexts.get(contextId);
    if (!ctx) return null;
    this.contexts.delete(contextId);
    await redis.hdel('drs:ts:contexts', contextId);
    logger.info(`✅ Time-slice released: ${contextId}`);
    return ctx;
  }

  list() { return Array.from(this.contexts.values()); }
  listByGpu(gpuId) { return this.list().filter((c) => c.gpuId === Number(gpuId)); }
  listByTenant(tenantId) { return this.list().filter((c) => c.tenantId === tenantId); }

  /**
   * Compute fairness metrics: each active context should receive its
   * `quota` share. Returns per-context deviation.
   */
  async getFairnessMetrics() {
    const byGpu = new Map();
    for (const ctx of this.contexts.values()) {
      if (!byGpu.has(ctx.gpuId)) byGpu.set(ctx.gpuId, []);
      byGpu.get(ctx.gpuId).push(ctx);
    }

    const results = [];
    for (const [gpuId, contexts] of byGpu.entries()) {
      const totalQuota = contexts.reduce((a, c) => a + c.quota, 0);
      const totalUtil = contexts.reduce((a, c) => {
        if (!c.utilSamples.length) return a;
        const last = c.utilSamples[c.utilSamples.length - 1].u;
        return a + last;
      }, 0);

      for (const ctx of contexts) {
        const expectedShare = totalQuota ? (ctx.quota / totalQuota) * 100 : 0;
        const actualShare = totalUtil > 0 ? ((ctx.utilSamples[ctx.utilSamples.length - 1]?.u || 0) / totalUtil) * 100 : 0;
        results.push({
          contextId: ctx.id,
          gpuId,
          tenantId: ctx.tenantId,
          quota: ctx.quota,
          expectedShare: Number(expectedShare.toFixed(2)),
          actualShare: Number(actualShare.toFixed(2)),
          deviation: Number((actualShare - expectedShare).toFixed(2)),
          utilization: ctx.utilSamples[ctx.utilSamples.length - 1]?.u || 0,
        });
      }
    }
    return results;
  }

  async setMaxClients(n) {
    const old = this.maxClientsPerGpu;
    this.maxClientsPerGpu = n;
    await redis.set('drs:ts:maxClients', String(n));
    logger.info(`🔧 Max clients/GPU: ${old} → ${n}`);
    return { old, new: n };
  }
  getMaxClients() { return this.maxClientsPerGpu; }

  async shutdown() {
    this.isInitialized = false;
    logger.info('🛑 Time-Slice Manager stopped');
  }
}

module.exports = TimeSliceManager;
