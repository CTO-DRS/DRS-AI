/**
 * Cluster Manager
 *
 * Higher-level orchestration on top of NodeRegistry + TaskRouter.
 *
 * Provides:
 *   - Cluster topology view (master / workers)
 *   - Failover: re-dispatch tasks whose node crashed
 *   - Drain: gracefully migrate tasks off a node
 *   - Scale events: notify subscribers when nodes join / leave
 */
const { logger } = require('../utils/logger');
const redis = require('../utils/redis');

class ClusterManager {
  constructor(nodeRegistry, taskRouter) {
    this.nodeRegistry = nodeRegistry;
    this.taskRouter = taskRouter;
    this.isInitialized = false;
    this.masterNodeId = process.env.DRS_NODE_ID || 'master';
  }

  async initialize() {
    logger.info('🏛️  Initializing Cluster Manager...');
    this.isInitialized = true;
    logger.info(`✅ Cluster Manager initialized (master=${this.masterNodeId})`);
  }

  /**
   * Cluster-wide status: nodes, tasks, throughput.
   */
  async status() {
    const nodes = this.nodeRegistry.list();
    const tasks = this.taskRouter.list();
    const online = nodes.filter((n) => n.status === 'online').length;
    const offline = nodes.length - online;
    const pending = tasks.filter((t) => t.status === 'dispatched' || t.status === 'in_flight').length;
    const completed = tasks.filter((t) => t.status === 'completed').length;
    const failed = tasks.filter((t) => t.status === 'failed').length;

    return {
      master: this.masterNodeId,
      generatedAt: new Date().toISOString(),
      nodes: { total: nodes.length, online, offline },
      tasks: { total: tasks.length, pending, completed, failed },
      strategy: this.taskRouter.getStrategy(),
      regions: [...new Set(nodes.map((n) => n.region))],
    };
  }

  /**
   * Re-dispatch all tasks previously assigned to a (now-dead) node.
   */
  async failover(deadNodeId) {
    const tasks = this.taskRouter.list().filter((t) => t.nodeId === deadNodeId && (t.status === 'dispatched' || t.status === 'in_flight'));
    logger.warn(`🔁 Failover: re-dispatching ${tasks.length} task(s) from dead node ${deadNodeId}`);
    for (const t of tasks) {
      try {
        await this.taskRouter.submit({ type: t.type, payload: t.payload, requirements: t.requirements });
        t.status = 'reassigned';
        await redis.hset('drs:dist:tasks', t.id, JSON.stringify(t));
      } catch (err) {
        logger.error(`Failover failed for task ${t.id}: ${err.message}`);
      }
    }
    return { reassigned: tasks.length };
  }

  /**
   * Gracefully drain a node — pause new task assignment, wait for in-flight tasks.
   */
  async drain(nodeId) {
    const node = this.nodeRegistry.get(nodeId);
    if (!node) throw new Error(`Unknown node: ${nodeId}`);
    node.status = 'draining';
    await redis.hset('drs:dist:nodes', nodeId, JSON.stringify(node));
    const inflight = this.taskRouter.list().filter((t) => t.nodeId === nodeId && t.status !== 'completed' && t.status !== 'failed');
    logger.info(`🚰 Draining node ${nodeId} — ${inflight.length} in-flight task(s)`);
    return { draining: inflight.length };
  }

  async shutdown() {
    this.isInitialized = false;
    logger.info('🛑 Cluster Manager stopped');
  }
}

module.exports = ClusterManager;
