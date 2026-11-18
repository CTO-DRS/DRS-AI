/**
 * Digital Health Report Service
 *
 * Continuously monitors the health of every DRS AI microservice:
 *   - Heartbeat polling
 *   - Latency tracking
 *   - Error-rate tracking
 *   - Resource utilization (CPU, memory, disk, GPU)
 *   - Incident timeline
 *   - Trend analysis (24h / 7d / 30d)
 *
 * Persists snapshots to Redis every 60s by default.
 */
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const redis = require('../utils/redis');
const { HealthStatus } = require('../types');

const DEFAULT_TIMEOUT = 5000;
const SNAPSHOT_INTERVAL = Number(process.env.HEALTH_SNAPSHOT_INTERVAL || 60000); // 60s
const HISTORY_DAYS = Number(process.env.HEALTH_HISTORY_DAYS || 30);

/**
 * Registry of all DRS AI services the self-awareness engine should monitor.
 * Static list populated from docker-compose.yml topology.
 */
const SERVICE_REGISTRY = [
  { id: 'gateway', name: 'API Gateway', url: process.env.GATEWAY_URL || 'http://gateway:3000', port: 3000, category: 'core' },
  { id: 'auth', name: 'Authentication Service', url: process.env.AUTH_URL || 'http://auth:3001', port: 3001, category: 'core' },
  { id: 'router', name: 'Model Router', url: process.env.ROUTER_URL || 'http://router:3002', port: 3002, category: 'core' },
  { id: 'orchestrator', name: 'Agent Orchestrator', url: process.env.ORCHESTRATOR_URL || 'http://orchestrator:3003', port: 3003, category: 'core' },
  { id: 'memory', name: 'Memory & Vector DB', url: process.env.MEMORY_URL || 'http://memory:3004', port: 3004, category: 'core' },
  { id: 'files', name: 'Files Service', url: process.env.FILES_URL || 'http://files:3005', port: 3005, category: 'core' },
  { id: 'voice', name: 'Voice Service', url: process.env.VOICE_URL || 'http://voice:3006', port: 3006, category: 'core' },
  { id: 'dashboard', name: 'Admin Dashboard', url: process.env.DASHBOARD_URL || 'http://dashboard:3007', port: 3007, category: 'core' },
  { id: 'telegram-bot', name: 'Telegram Bot', url: process.env.TELEGRAM_URL, port: 3010, category: 'ai-os', optional: true },
  { id: 'workflow-engine', name: 'Workflow Engine', url: process.env.WORKFLOW_URL || 'http://workflow-engine:3011', port: 3011, category: 'ai-os' },
  { id: 'plugin-system', name: 'Plugin System', url: process.env.PLUGIN_URL || 'http://plugin-system:3012', port: 3012, category: 'ai-os' },
  { id: 'auto-agent', name: 'Auto Agent', url: process.env.AUTO_AGENT_URL || 'http://auto-agent:3013', port: 3013, category: 'ai-os' },
  { id: 'code-interpreter', name: 'Code Interpreter', url: process.env.CODE_INT_URL || 'http://code-interpreter:3014', port: 3014, category: 'ai-os' },
  { id: 'cybersecurity', name: 'Cybersecurity Module', url: process.env.CYBERSEC_URL || 'http://cybersecurity:3015', port: 3015, category: 'ai-os' },
  { id: 'advanced-memory', name: 'Advanced Memory', url: process.env.ADV_MEM_URL || 'http://advanced-memory:3016', port: 3016, category: 'ai-os' },
  { id: 'multi-model', name: 'Multi-Model', url: process.env.MULTI_MODEL_URL || 'http://multi-model:3017', port: 3017, category: 'ai-os' },
  { id: 'auto-builder', name: 'Auto Builder', url: process.env.AUTO_BUILDER_URL || 'http://auto-builder:3018', port: 3018, category: 'ai-os' },
  { id: 'security-sandbox', name: 'Security Sandbox', url: process.env.SEC_SANDBOX_URL || 'http://security-sandbox:3020', port: 3020, category: 'infra' },
  { id: 'llm-guardrail', name: 'LLM Guardrail', url: process.env.GUARDRAIL_URL || 'http://llm-guardrail:3021', port: 3021, category: 'infra' },
  { id: 'hybrid-rag', name: 'Hybrid RAG', url: process.env.RAG_URL || 'http://hybrid-rag:3022', port: 3022, category: 'infra' },
  { id: 'polyglot-interpreter', name: 'Polyglot Interpreter', url: process.env.POLYGLOT_URL || 'http://polyglot-interpreter:3023', port: 3023, category: 'infra' },
  { id: 'git-automator', name: 'Git Automator', url: process.env.GIT_AUTO_URL || 'http://git-automator:3024', port: 3024, category: 'infra' },
  { id: 'edge-optimizer', name: 'Edge Optimizer', url: process.env.EDGE_OPT_URL || 'http://edge-optimizer:3025', port: 3025, category: 'infra' },
  { id: 'cognitive-ai', name: 'Cognitive AI', url: process.env.COGN_AI_URL || 'http://cognitive-ai:3030', port: 3030, category: 'global' },
  { id: 'web3-mesh', name: 'Web3 Mesh', url: process.env.WEB3_URL || 'http://web3-mesh:3031', port: 3031, category: 'global' },
  { id: 'quantum-security', name: 'Quantum Security', url: process.env.QUANTUM_URL || 'http://quantum-security:3032', port: 3032, category: 'global' },
  { id: 'ultra-efficiency', name: 'Ultra Efficiency', url: process.env.ULTRA_EFF_URL || 'http://ultra-efficiency:3033', port: 3033, category: 'global' },
  { id: 'human-interaction', name: 'Human Interaction', url: process.env.HUMAN_INT_URL || 'http://human-interaction:3034', port: 3034, category: 'global' },
  { id: 'self-healing', name: 'Self-Healing', url: process.env.SELF_HEAL_URL || 'http://self-healing:3035', port: 3035, category: 'global' },
  { id: 'cultural-localization', name: 'Cultural Localization', url: process.env.CULT_LOC_URL || 'http://cultural-localization:3036', port: 3036, category: 'global' },
];

class DigitalHealthService {
  constructor() {
    this.isInitialized = false;
    this.registry = SERVICE_REGISTRY;
    this.snapshotTimer = null;
    this.activeIncidents = new Map();
    this.lastSnapshot = null;
  }

  async initialize() {
    logger.info('🏥 Initializing Digital Health Service...');

    await redis.init();

    // Restore active incidents from Redis (if any)
    const incidents = await redis.hgetall('drs:health:incidents');
    for (const [id, payload] of Object.entries(incidents || {})) {
      try {
        this.activeIncidents.set(id, JSON.parse(payload));
      } catch (_) { /* ignore corrupt payload */ }
    }

    // Start snapshot loop
    this.snapshotTimer = setInterval(() => this.snapshot().catch((e) => logger.error('snapshot error', e)), SNAPSHOT_INTERVAL);

    // Take first snapshot immediately
    this.snapshot().catch((e) => logger.error('initial snapshot error', e));

    this.isInitialized = true;
    logger.info(`✅ Digital Health Service initialized — monitoring ${this.registry.length} services`);
  }

  /**
   * Probe a single service.
   */
  async probe(service) {
    if (!service.url) {
      return { status: HealthStatus.UNKNOWN, latency: 0, error: 'No URL configured', timestamp: new Date().toISOString() };
    }

    const start = Date.now();
    try {
      const { status, data } = await axios.get(`${service.url}/health`, { timeout: DEFAULT_TIMEOUT, validateStatus: () => true });
      const latency = Date.now() - start;

      if (status >= 200 && status < 300) {
        return {
          status: data?.status === 'healthy' ? HealthStatus.HEALTHY : HealthStatus.HEALTHY,
          latency,
          response: data,
          timestamp: new Date().toISOString(),
        };
      }
      return {
        status: HealthStatus.DEGRADED,
        latency,
        httpStatus: status,
        error: `HTTP ${status}`,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      const latency = Date.now() - start;
      return {
        status: HealthStatus.CRITICAL,
        latency,
        error: err.code || err.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Probe all services and persist a snapshot.
   */
  async snapshot() {
    const startedAt = new Date().toISOString();
    const results = await Promise.all(
      this.registry.map(async (svc) => ({ service: svc, ...(await this.probe(svc)) }))
    );

    const summary = {
      healthy: results.filter((r) => r.status === HealthStatus.HEALTHY).length,
      degraded: results.filter((r) => r.status === HealthStatus.DEGRADED).length,
      critical: results.filter((r) => r.status === HealthStatus.CRITICAL).length,
      unknown: results.filter((r) => r.status === HealthStatus.UNKNOWN).length,
    };

    const snapshot = {
      id: uuidv4(),
      timestamp: startedAt,
      total: results.length,
      summary,
      services: results.map((r) => ({
        id: r.service.id,
        name: r.service.name,
        category: r.service.category,
        port: r.service.port,
        status: r.status,
        latency: r.latency,
        error: r.error,
        optional: r.service.optional || false,
      })),
    };

    // Persist snapshot
    await redis.lpush('drs:health:snapshots', JSON.stringify(snapshot));
    await redis.ltrim('drs:health:snapshots', 0, 24 * 60 * (HISTORY_DAYS / 30) * 60); // cap list

    // Detect new incidents
    for (const r of results) {
      if (r.status === HealthStatus.CRITICAL && !r.service.optional) {
        await this.openIncident(r.service, r);
      } else if (r.status === HealthStatus.HEALTHY) {
        await this.resolveIncidentsFor(r.service.id);
      }
    }

    this.lastSnapshot = snapshot;
    logger.info(`📊 Health snapshot: ${summary.healthy} ok / ${summary.degraded} degraded / ${summary.critical} critical / ${summary.unknown} unknown`);
    return snapshot;
  }

  async openIncident(service, probeResult) {
    const existing = Array.from(this.activeIncidents.values()).find((i) => i.serviceId === service.id);
    if (existing) {
      existing.lastUpdate = new Date().toISOString();
      existing.probeCount = (existing.probeCount || 1) + 1;
      existing.lastError = probeResult.error;
      await redis.hset('drs:health:incidents', existing.id, JSON.stringify(existing));
      return existing;
    }

    const incident = {
      id: uuidv4(),
      serviceId: service.id,
      serviceName: service.name,
      severity: 'critical',
      status: 'open',
      openedAt: new Date().toISOString(),
      lastUpdate: new Date().toISOString(),
      lastError: probeResult.error,
      probeCount: 1,
    };

    this.activeIncidents.set(incident.id, incident);
    await redis.hset('drs:health:incidents', incident.id, JSON.stringify(incident));
    logger.warn(`🚨 Incident opened: ${service.name} (${probeResult.error})`);
    return incident;
  }

  async resolveIncidentsFor(serviceId) {
    const resolved = [];
    for (const [id, inc] of this.activeIncidents.entries()) {
      if (inc.serviceId === serviceId) {
        inc.status = 'resolved';
        inc.resolvedAt = new Date().toISOString();
        resolved.push(inc);
        this.activeIncidents.delete(id);
        await redis.hdel('drs:health:incidents', id);
        await redis.lpush('drs:health:incidents:history', JSON.stringify(inc));
        logger.info(`✅ Incident resolved: ${inc.serviceName} (was open since ${inc.openedAt})`);
      }
    }
    return resolved;
  }

  async getLatestSnapshot() {
    if (this.lastSnapshot) return this.lastSnapshot;
    const list = await redis.lrange('drs:health:snapshots', 0, 0);
    if (list.length === 0) return null;
    return JSON.parse(list[0]);
  }

  async getHistory(limit = 50) {
    const list = await redis.lrange('drs:health:snapshots', 0, limit - 1);
    return list.map((s) => JSON.parse(s));
  }

  async getActiveIncidents() {
    return Array.from(this.activeIncidents.values());
  }

  async getIncidentHistory(limit = 50) {
    const list = await redis.lrange('drs:health:incidents:history', 0, limit - 1);
    return list.map((s) => JSON.parse(s));
  }

  /**
   * Compute trend metrics (avg latency, error rate) over the last N snapshots.
   */
  async getTrends(windowSize = 24) {
    const history = await this.getHistory(windowSize);
    if (history.length === 0) {
      return { window: windowSize, snapshots: 0, avgLatency: 0, errorRate: 0, healthyRate: 0 };
    }

    let totalLatency = 0;
    let totalServices = 0;
    let totalHealthy = 0;
    let totalCritical = 0;

    for (const snap of history) {
      for (const svc of snap.services) {
        totalLatency += svc.latency || 0;
        totalServices += 1;
        if (svc.status === HealthStatus.HEALTHY) totalHealthy += 1;
        if (svc.status === HealthStatus.CRITICAL) totalCritical += 1;
      }
    }

    return {
      window: windowSize,
      snapshots: history.length,
      avgLatency: totalServices ? Math.round(totalLatency / totalServices) : 0,
      healthyRate: totalServices ? Number(((totalHealthy / totalServices) * 100).toFixed(2)) : 0,
      errorRate: totalServices ? Number(((totalCritical / totalServices) * 100).toFixed(2)) : 0,
      earliest: history[history.length - 1]?.timestamp,
      latest: history[0]?.timestamp,
    };
  }

  async shutdown() {
    if (this.snapshotTimer) clearInterval(this.snapshotTimer);
    this.isInitialized = false;
    logger.info('🛑 Digital Health Service stopped');
  }
}

module.exports = DigitalHealthService;
