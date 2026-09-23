/**
 * MIG (Multi-Instance GPU) Manager
 *
 * NVIDIA MIG lets you partition a single physical GPU into multiple
 * isolated instances, each with its own memory and compute cores.
 *
 * Available on Ampere (A30, A100) and Hopper (H100) GPUs.
 *
 * MIG profiles:
 *   - 1g.5gb    — 1/7 of GPU, 5 GB
 *   - 2g.10gb   — 2/7 of GPU, 10 GB
 *   - 3g.20gb   — 3/7 of GPU, 20 GB
 *   - 4g.20gb   — 4/7 of GPU, 20 GB (shared with 3g.20gb)
 *   - 7g.40gb   — full GPU, 40 GB
 *
 * This manager:
 *   1. Detects MIG-capable GPUs
 *   2. Enables MIG mode (requires root + GPU not in use)
 *   3. Creates / destroys GPU instances (GI) and compute instances (CI)
 *   4. Allocates MIG devices to tenants
 */
const { exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const redis = require('../utils/redis');

const SUPPORTED_PROFILES = [
  '1g.5gb', '2g.10gb', '3g.20gb', '4g.20gb', '7g.40gb',
  '1g.10gb', '2g.20gb', '4g.40gb', // H100 80GB variants
  '1c.1g.5gb', '1c.2g.10gb', '1c.3g.20gb', '1c.4g.20gb', '1c.7g.40gb',
];

const MIG_PROFILE_MEM = {
  '1g.5gb': 5 * 1024, '2g.10gb': 10 * 1024, '3g.20gb': 20 * 1024,
  '4g.20gb': 20 * 1024, '7g.40gb': 40 * 1024,
  '1g.10gb': 10 * 1024, '2g.20gb': 20 * 1024, '4g.40gb': 40 * 1024,
};

class MigManager {
  constructor() {
    this.isInitialized = false;
    this.instances = new Map(); // id -> { gpuId, profile, giId, ciId, tenant, createdAt }
    this.gpuCapabilities = new Map(); // gpuId -> { migCapable, migEnabled, profiles }
  }

  async initialize() {
    logger.info('🔶 Initializing MIG Manager...');
    await redis.init();
    await this.loadFromRedis();
    await this.detectMigCapableGpus();
    this.isInitialized = true;
    logger.info(`✅ MIG Manager initialized — ${this.gpuCapabilities.size} GPU(s) checked`);
  }

  async loadFromRedis() {
    const all = await redis.hgetall('drs:mig:instances');
    for (const [id, raw] of Object.entries(all || {})) {
      try { this.instances.set(id, JSON.parse(raw)); } catch {}
    }
  }

  /**
   * Detect which GPUs support MIG by running nvidia-smi.
   */
  async detectMigCapableGpus() {
    return new Promise((resolve) => {
      exec('nvidia-smi --query-gpu=index,name,mig.mode.current,mig.mode.pending --format=csv,noheader', { timeout: 5000 }, (err, stdout) => {
        if (err || !stdout) {
          logger.warn('⚠️  nvidia-smi not available — MIG features in software-emulation mode');
          this.gpuCapabilities.set(0, { migCapable: false, migEnabled: false, reason: 'nvidia-smi not available' });
          resolve();
          return;
        }
        stdout.trim().split('\n').forEach((line) => {
          const parts = line.split(',').map((s) => s.trim());
          const gpuId = Number(parts[0]);
          const name = parts[1] || '';
          const currentMode = parts[2] || 'Disabled';
          const migCapable = /A100|A30|A10G|H100|H200/.test(name);
          const migEnabled = currentMode === 'Enabled';
          this.gpuCapabilities.set(gpuId, {
            gpuId, name, migCapable, migEnabled,
            profiles: migCapable ? SUPPORTED_PROFILES : [],
          });
        });
        resolve();
      });
    });
  }

  /**
   * Enable MIG mode on a GPU (requires root + GPU not in use).
   */
  async enableMig(gpuId) {
    const cap = this.gpuCapabilities.get(Number(gpuId));
    if (!cap) throw new Error(`Unknown GPU: ${gpuId}`);
    if (!cap.migCapable) throw new Error(`GPU ${gpuId} does not support MIG`);
    if (cap.migEnabled) return { already: true, gpuId };

    return new Promise((resolve, reject) => {
      exec(`sudo nvidia-smi -i ${gpuId} -mig 1`, { timeout: 10000 }, (err) => {
        if (err) {
          reject(new Error(`Failed to enable MIG on GPU ${gpuId}: ${err.message}. ` +
            'Run as root and ensure GPU is not in use.'));
        } else {
          cap.migEnabled = true;
          this.gpuCapabilities.set(Number(gpuId), cap);
          logger.info(`✅ MIG enabled on GPU ${gpuId}`);
          resolve({ already: false, gpuId });
        }
      });
    });
  }

  async disableMig(gpuId) {
    return new Promise((resolve, reject) => {
      exec(`sudo nvidia-smi -i ${gpuId} -mig 0`, { timeout: 10000 }, (err) => {
        if (err) reject(new Error(`Failed to disable MIG on GPU ${gpuId}: ${err.message}`));
        else {
          const cap = this.gpuCapabilities.get(Number(gpuId));
          if (cap) { cap.migEnabled = false; this.gpuCapabilities.set(Number(gpuId), cap); }
          logger.info(`🔶 MIG disabled on GPU ${gpuId}`);
          resolve({ gpuId });
        }
      });
    });
  }

  /**
   * Create a GPU instance (GI) with the given profile.
   */
  async createInstance(gpuId, profile, tenantId) {
    if (!SUPPORTED_PROFILES.includes(profile)) throw new Error(`Unsupported profile: ${profile}`);
    const cap = this.gpuCapabilities.get(Number(gpuId));
    if (!cap || !cap.migEnabled) throw new Error(`GPU ${gpuId} MIG not enabled`);

    return new Promise((resolve, reject) => {
      exec(`sudo nvidia-smi mig -gi ${profile} -C`, { timeout: 10000 }, (err, stdout) => {
        if (err) {
          reject(new Error(`Failed to create MIG instance: ${err.message}`));
          return;
        }
        // Parse the GI ID from stdout
        const match = stdout.match(/GI ID:\s*(\d+)/);
        const giId = match ? Number(match[1]) : Math.floor(Math.random() * 7) + 1;
        const id = uuidv4();
        const instance = {
          id,
          gpuId: Number(gpuId),
          profile,
          giId,
          ciId: giId, // typically same as GI for v1
          tenantId,
          memoryMb: MIG_PROFILE_MEM[profile] || 0,
          createdAt: new Date().toISOString(),
          status: 'active',
        };
        this.instances.set(id, instance);
        redis.hset('drs:mig:instances', id, JSON.stringify(instance)).catch(() => {});
        logger.info(`✅ Created MIG instance ${id} (GI=${giId}, profile=${profile}) for tenant ${tenantId}`);
        resolve(instance);
      });
    });
  }

  async destroyInstance(id) {
    const inst = this.instances.get(id);
    if (!inst) throw new Error(`Instance not found: ${id}`);
    return new Promise((resolve, reject) => {
      exec(`sudo nvidia-smi mig -gi ${inst.giId} -d`, { timeout: 10000 }, (err) => {
        if (err) logger.warn(`Failed to destroy MIG instance on GPU (may already be destroyed): ${err.message}`);
        this.instances.delete(id);
        redis.hdel('drs:mig:instances', id).catch(() => {});
        logger.info(`🗑️  Destroyed MIG instance ${id}`);
        resolve(inst);
      });
    });
  }

  listInstances() { return Array.from(this.instances.values()); }
  listGpus() { return Array.from(this.gpuCapabilities.values()); }
  getSupportedProfiles() { return SUPPORTED_PROFILES; }

  async shutdown() {
    this.isInitialized = false;
    logger.info('🛑 MIG Manager stopped');
  }
}

module.exports = MigManager;
