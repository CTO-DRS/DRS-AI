/**
 * Node Registry
 *
 * Tracks every node participating in the DRS AI distributed cluster.
 *
 * A node is identified by a unique `nodeId` and reports:
 *   - Address (host:port)
 *   - Region (e.g. eu-west-1, ksa-central)
 *   - Capacity (CPU cores, RAM, GPU count, VRAM)
 *   - Tags (e.g. "gpu", "arm64", "edge")
 *   - Health (last heartbeat, latency)
 *
 * Nodes self-register via POST /api/v1/distributed/nodes/register
 * and send heartbeats every 15s.
 */
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const redis = require('../utils/redis');

const HEARTBEAT_TIMEOUT = Number(process.env.NODE_HEARTBEAT_TIMEOUT || 45000); // 45s
const CLEANUP_INTERVAL = Number(process.env.NODE_CLEANUP_INTERVAL || 20000); // 20s

class NodeRegistry {
  constructor() {
    this.isInitialized = false;
    this.nodes = new Map();
    this.cleanupTimer = null;
  }

  async initialize() {
    logger.info('🌐 Initializing Node Registry...');
    await redis.init();
    await this.loadFromRedis();
    this.cleanupTimer = setInterval(() => this.cleanup().catch((e) => logger.error('cleanup', e)), CLEANUP_INTERVAL);
    this.isInitialized = true;
    logger.info(`✅ Node Registry initialized — ${this.nodes.size} active node(s)`);
  }

  async loadFromRedis() {
    const all = await redis.hgetall('drs:dist:nodes');
    for (const [id, raw] of Object.entries(all || {})) {
      try {
        const node = JSON.parse(raw);
        if (Date.now() - new Date(node.lastHeartbeat).getTime() < HEARTBEAT_TIMEOUT) {
          this.nodes.set(id, node);
        } else {
          await redis.hdel('drs:dist:nodes', id);
        }
      } catch {}
    }
  }

  async register({ nodeId, host, port, region, capacity, tags, role = 'worker' }) {
    if (!nodeId) nodeId = uuidv4();
    if (!host || !port) throw new Error('host and port are required');

    const existing = this.nodes.get(nodeId);
    const node = {
      nodeId,
      host,
      port: Number(port),
      address: `${host}:${port}`,
      region: region || 'default',
      role,
      capacity: capacity || { cpu: 1, memoryMb: 1024, gpus: 0, vramMb: 0 },
      tags: tags || [],
      status: 'online',
      registeredAt: existing?.registeredAt || new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
      load: existing?.load || { cpu: 0, memory: 0, gpu: 0 },
      tasksHandled: existing?.tasksHandled || 0,
    };

    this.nodes.set(nodeId, node);
    await redis.hset('drs:dist:nodes', nodeId, JSON.stringify(node));
    logger.info(`➕ Node registered: ${nodeId} (${node.address}, role=${role})`);
    return node;
  }

  async heartbeat(nodeId, payload = {}) {
    const node = this.nodes.get(nodeId);
    if (!node) throw new Error(`Unknown node: ${nodeId}`);
    node.lastHeartbeat = new Date().toISOString();
    if (payload.load) node.load = { ...node.load, ...payload.load };
    if (payload.tasksHandled != null) node.tasksHandled = payload.tasksHandled;
    node.status = 'online';
    await redis.hset('drs:dist:nodes', nodeId, JSON.stringify(node));
    return node;
  }

  async deregister(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node) return null;
    this.nodes.delete(nodeId);
    await redis.hdel('drs:dist:nodes', nodeId);
    logger.info(`➖ Node deregistered: ${nodeId}`);
    return node;
  }

  list() {
    return Array.from(this.nodes.values());
  }

  get(nodeId) { return this.nodes.get(nodeId); }

  /**
   * Find nodes matching the given criteria (region, tags, capacity).
   */
  findMatching({ region, tags, minCapacity, role } = {}) {
    return this.list().filter((n) => {
      if (role && n.role !== role) return false;
      if (region && n.region !== region) return false;
      if (tags && tags.length > 0) {
        if (!tags.every((t) => n.tags.includes(t))) return false;
      }
      if (minCapacity) {
        if (minCapacity.cpu && n.capacity.cpu < minCapacity.cpu) return false;
        if (minCapacity.memoryMb && n.capacity.memoryMb < minCapacity.memoryMb) return false;
        if (minCapacity.gpus && n.capacity.gpus < minCapacity.gpus) return false;
        if (minCapacity.vramMb && n.capacity.vramMb < minCapacity.vramMb) return false;
      }
      return true;
    });
  }

  async cleanup() {
    const now = Date.now();
    for (const [id, node] of this.nodes.entries()) {
      const age = now - new Date(node.lastHeartbeat).getTime();
      if (age > HEARTBEAT_TIMEOUT) {
        node.status = 'offline';
        this.nodes.delete(id);
        await redis.hdel('drs:dist:nodes', id);
        logger.warn(`⚠️  Node timed out: ${id} (last heartbeat ${(age / 1000).toFixed(0)}s ago)`);
      }
    }
  }

  async shutdown() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.isInitialized = false;
    logger.info('🛑 Node Registry stopped');
  }
}

module.exports = NodeRegistry;
