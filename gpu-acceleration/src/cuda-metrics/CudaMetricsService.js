/**
 * CUDA Metrics Collector
 *
 * Polls NVIDIA-SMI (when available) every 2s to collect:
 *   - GPU utilization (%)
 *   - Memory usage (used / total / free)
 *   - Temperature
 *   - Power draw
 *   - Process list per GPU
 *
 * Falls back to software-mode placeholders when NVIDIA-SMI is absent
 * (e.g. CPU-only dev box).
 */
const { exec } = require('child_process');
const { logger } = require('../utils/logger');
const redis = require('../utils/redis');

const POLL_INTERVAL = Number(process.env.GPU_POLL_INTERVAL || 2000);
const HISTORY_LIMIT = 1000;

class CudaMetricsService {
  constructor() {
    this.isInitialized = false;
    this.gpus = [];
    this.timer = null;
  }

  async initialize() {
    logger.info('📊 Initializing CUDA Metrics Service...');
    await redis.init();
    this.gpus = await this.pollNvidiaSmi();
    this.timer = setInterval(() => this.poll().catch((e) => logger.error('poll', e)), POLL_INTERVAL);
    this.isInitialized = true;
    logger.info(`✅ CUDA Metrics initialized — ${this.gpus.length} GPU(s) detected`);
  }

  pollNvidiaSmi() {
    return new Promise((resolve) => {
      const cmd = 'nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total,memory.free,temperature.gpu,power.draw --format=csv,noheader,nounits';
      exec(cmd, { timeout: 5000 }, (err, stdout) => {
        if (err || !stdout) {
          // No NVIDIA drivers — return a software placeholder
          resolve([{
            index: 0,
            name: 'Software Emulation (no GPU detected)',
            utilization: 0,
            memoryUsed: 0,
            memoryTotal: 0,
            memoryFree: 0,
            temperature: 0,
            powerDraw: 0,
            softwareMode: true,
            timestamp: new Date().toISOString(),
          }]);
          return;
        }
        const gpus = stdout.trim().split('\n').map((line, idx) => {
          const parts = line.split(',').map((p) => p.trim());
          return {
            index: Number(parts[0]) || idx,
            name: parts[1] || `GPU ${idx}`,
            utilization: Number(parts[2]) || 0,
            memoryUsed: Number(parts[3]) || 0,
            memoryTotal: Number(parts[4]) || 0,
            memoryFree: Number(parts[5]) || 0,
            temperature: Number(parts[6]) || 0,
            powerDraw: Number(parts[7]) || 0,
            softwareMode: false,
            timestamp: new Date().toISOString(),
          };
        });
        resolve(gpus);
      });
    });
  }

  async poll() {
    this.gpus = await this.pollNvidiaSmi();
    const record = { timestamp: new Date().toISOString(), gpus: this.gpus };
    await redis.lpush('drs:gpu:metrics', JSON.stringify(record));
    await redis.ltrim('drs:gpu:metrics', 0, HISTORY_LIMIT - 1);
  }

  getCurrent() { return this.gpus; }

  async getHistory(limit = 60) {
    const list = await redis.lrange('drs:gpu:metrics', 0, Math.min(limit, HISTORY_LIMIT) - 1);
    return list.map((s) => JSON.parse(s));
  }

  /**
   * Compute aggregated utilization + memory across all GPUs.
   */
  getAggregate() {
    if (this.gpus.length === 0) {
      return { total: 0, used: 0, free: 0, utilization: 0, temperature: 0, power: 0, count: 0 };
    }
    const totalMem = this.gpus.reduce((a, g) => a + g.memoryTotal, 0);
    const usedMem = this.gpus.reduce((a, g) => a + g.memoryUsed, 0);
    const util = this.gpus.reduce((a, g) => a + g.utilization, 0) / this.gpus.length;
    const temp = this.gpus.reduce((a, g) => a + g.temperature, 0) / this.gpus.length;
    const power = this.gpus.reduce((a, g) => a + g.powerDraw, 0);
    return {
      total: totalMem,
      used: usedMem,
      free: totalMem - usedMem,
      utilization: Number(util.toFixed(2)),
      temperature: Number(temp.toFixed(2)),
      power: Number(power.toFixed(2)),
      count: this.gpus.length,
    };
  }

  async shutdown() {
    if (this.timer) clearInterval(this.timer);
    this.isInitialized = false;
    logger.info('🛑 CUDA Metrics stopped');
  }
}

module.exports = CudaMetricsService;
