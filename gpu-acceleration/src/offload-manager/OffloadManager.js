/**
 * Offload Manager
 *
 * Decides which models should be loaded onto GPU vs CPU,
 * based on the configured offload policy and current VRAM pressure.
 *
 * Talks to Ollama (port 11434) to apply num_gpu settings.
 */
const { logger } = require('../utils/logger');
const redis = require('../utils/redis');

const OffloadPolicy = {
  ALWAYS_GPU: 'always_gpu',     // try to load entire model on GPU
  PREFER_GPU: 'prefer_gpu',     // load as many layers as possible on GPU
  ADAPTIVE: 'adaptive',         // GPU when VRAM available, else hybrid
  CPU_ONLY: 'cpu_only',         // never use GPU
};

class OffloadManager {
  constructor(vramMonitor, cudaMetrics) {
    this.vramMonitor = vramMonitor;
    this.cudaMetrics = cudaMetrics;
    this.isInitialized = false;
    this.policy = process.env.GPU_OFFLOAD_POLICY || OffloadPolicy.ADAPTIVE;
    this.ollamaUrl = process.env.OLLAMA_URL || 'http://ollama:11434';
  }

  async initialize() {
    logger.info(`🧠 Initializing Offload Manager (policy=${this.policy})...`);
    this.isInitialized = true;
    logger.info('✅ Offload Manager initialized');
  }

  /**
   * Decide how many of the model's layers to offload to GPU.
   * @param model object { id, sizeBytes, layerCount }
   * @returns { numGpu, reason }
   */
  async decide(model) {
    if (this.policy === OffloadPolicy.CPU_ONLY) return { numGpu: 0, reason: 'policy=cpu_only' };

    if (this.cudaMetrics.getAggregate().count === 0) {
      return { numGpu: 0, reason: 'no GPU available' };
    }

    if (this.policy === OffloadPolicy.ALWAYS_GPU) {
      return { numGpu: model.layerCount || 99, reason: 'policy=always_gpu' };
    }

    const modelBytes = Math.ceil((model.sizeBytes || 0) / (1024 * 1024)); // MB
    const evicted = await this.vramMonitor.evictIfNecessary(modelBytes);
    const free = this.cudaMetrics.getAggregate().free;

    if (this.policy === OffloadPolicy.PREFER_GPU) {
      const numGpu = free >= modelBytes ? (model.layerCount || 99) : Math.floor((free / modelBytes) * (model.layerCount || 32));
      return { numGpu: Math.max(numGpu, 0), reason: `policy=prefer_gpu, free=${free}MB` };
    }

    // ADAPTIVE
    if (free >= modelBytes * 1.5) {
      return { numGpu: model.layerCount || 99, reason: `policy=adaptive, sufficient VRAM (free=${free}MB)` };
    }
    if (free >= modelBytes * 0.5) {
      const numGpu = Math.floor((free / modelBytes) * (model.layerCount || 32));
      return { numGpu, reason: `policy=adaptive, hybrid (free=${free}MB)` };
    }
    return { numGpu: 0, reason: 'policy=adaptive, VRAM too low — using CPU' };
  }

  /**
   * Apply the offload decision to Ollama by sending a /api/generate request
   * with the chosen num_gpu parameter.
   */
  async apply(modelId, numGpu) {
    try {
      const res = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelId, prompt: '', keep_alive: 0, options: { num_gpu: numGpu } }),
      });
      return { ok: res.ok, status: res.status };
    } catch (err) {
      logger.warn(`Failed to apply offload to Ollama: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  async setPolicy(policy) {
    if (!Object.values(OffloadPolicy).includes(policy)) throw new Error(`Invalid policy: ${policy}`);
    const old = this.policy;
    this.policy = policy;
    await redis.set('drs:gpu:offloadPolicy', policy);
    logger.info(`🔧 Offload policy changed: ${old} → ${policy}`);
    return { old, new: policy };
  }

  getPolicy() { return this.policy; }

  async shutdown() {
    this.isInitialized = false;
    logger.info('🛑 Offload Manager stopped');
  }
}

module.exports = { OffloadManager, OffloadPolicy };
