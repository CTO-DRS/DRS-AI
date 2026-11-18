/**
 * Task Router
 *
 * Decides which node should execute a given distributed task.
 *
 * Strategies:
 *   - ROUND_ROBIN    — cycle through nodes
 *   - LEAST_LOADED   — pick the node with the lowest current load
 *   - CAPACITY_FIRST — pick the node with the most matching resources
 *   - AFFINITY       — prefer nodes that previously ran the same task
 */
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const redis = require('../utils/redis');

const Strategy = {
  ROUND_ROBIN: 'round_robin',
  LEAST_LOADED: 'least_loaded',
  CAPACITY_FIRST: 'capacity_first',
  AFFINITY: 'affinity',
};

class TaskRouter {
  constructor(nodeRegistry) {
    this.nodeRegistry = nodeRegistry;
    this.isInitialized = false;
    this.strategy = process.env.TASK_ROUTER_STRATEGY || Strategy.LEAST_LOADED;
    this.rrIndex = 0;
    this.tasks = new Map(); // taskId -> task record
  }

  async initialize() {
    logger.info(`🔀 Initializing Task Router (strategy=${this.strategy})...`);
    await this.loadFromRedis();
    this.isInitialized = true;
    logger.info(`✅ Task Router initialized — ${this.tasks.size} task(s) tracked`);
  }

  async loadFromRedis() {
    const all = await redis.hgetall('drs:dist:tasks');
    for (const [id, raw] of Object.entries(all || {})) {
      try { this.tasks.set(id, JSON.parse(raw)); } catch {}
    }
  }

  /**
   * Submit a task — the router picks the best node and dispatches it.
   */
  async submit({ type, payload = {}, requirements = {}, affinityKey }) {
    const candidates = this.nodeRegistry.findMatching({
      region: requirements.region,
      tags: requirements.tags,
      minCapacity: requirements.minCapacity,
      role: 'worker',
    });

    if (candidates.length === 0) {
      throw new Error('No matching nodes available');
    }

    const target = this.pickNode(candidates, affinityKey);
    const task = {
      id: uuidv4(),
      type,
      payload,
      requirements,
      nodeId: target.nodeId,
      status: 'dispatched',
      dispatchedAt: new Date().toISOString(),
      completedAt: null,
      result: null,
      error: null,
    };

    this.tasks.set(task.id, task);
    await redis.hset('drs:dist:tasks', task.id, JSON.stringify(task));
    await this.dispatch(target, task);
    logger.info(`📤 Task ${task.id} dispatched to node ${target.nodeId} (type=${type})`);
    return task;
  }

  pickNode(candidates, affinityKey) {
    if (this.strategy === Strategy.ROUND_ROBIN) {
      const node = candidates[this.rrIndex % candidates.length];
      this.rrIndex = (this.rrIndex + 1) % candidates.length;
      return node;
    }
    if (this.strategy === Strategy.CAPACITY_FIRST) {
      return candidates.sort((a, b) => b.capacity.cpu - a.capacity.cpu || b.capacity.memoryMb - a.capacity.memoryMb)[0];
    }
    if (this.strategy === Strategy.AFFINITY && affinityKey) {
      // Prefer the node that last ran a task with the same affinityKey
      const recent = Array.from(this.tasks.values())
        .filter((t) => t.affinityKey === affinityKey && t.status === 'completed')
        .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
      if (recent.length > 0) {
        const preferred = candidates.find((n) => n.nodeId === recent[0].nodeId);
        if (preferred) return preferred;
      }
    }
    // LEAST_LOADED (default)
    return candidates.sort((a, b) => (a.load?.cpu || 0) - (b.load?.cpu || 0))[0];
  }

  async dispatch(target, task) {
    // Fire-and-forget POST to the target node's task intake endpoint.
    // In production this would be a gRPC or HTTP call; here we just
    // log the dispatch and let the node poll for tasks (simpler).
    try {
      // Real implementation:
      // await axios.post(`http://${target.address}/internal/tasks`, task, { timeout: 5000 });
      logger.info(`   → dispatched to ${target.address}`);
      task.status = 'in_flight';
      await redis.hset('drs:dist:tasks', task.id, JSON.stringify(task));
    } catch (err) {
      task.status = 'failed';
      task.error = err.message;
      await redis.hset('drs:dist:tasks', task.id, JSON.stringify(task));
      logger.error(`Dispatch failed: ${err.message}`);
    }
  }

  async complete(taskId, result, error) {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Unknown task: ${taskId}`);
    task.status = error ? 'failed' : 'completed';
    task.completedAt = new Date().toISOString();
    task.result = error ? null : result;
    task.error = error || null;
    await redis.hset('drs:dist:tasks', task.id, JSON.stringify(task));
    logger.info(`✅ Task ${taskId} ${task.status}`);
    return task;
  }

  async get(taskId) { return this.tasks.get(taskId); }
  list({ status, type } = {}) {
    let arr = Array.from(this.tasks.values());
    if (status) arr = arr.filter((t) => t.status === status);
    if (type) arr = arr.filter((t) => t.type === type);
    return arr;
  }

  async setStrategy(strategy) {
    if (!Object.values(Strategy).includes(strategy)) throw new Error(`Invalid strategy: ${strategy}`);
    const old = this.strategy;
    this.strategy = strategy;
    await redis.set('drs:dist:strategy', strategy);
    logger.info(`🔧 Task router strategy: ${old} → ${strategy}`);
    return { old, new: strategy };
  }
  getStrategy() { return this.strategy; }

  async shutdown() {
    this.isInitialized = false;
    logger.info('🛑 Task Router stopped');
  }
}

module.exports = { TaskRouter, Strategy };
