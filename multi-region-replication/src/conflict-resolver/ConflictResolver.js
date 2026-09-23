/**
 * Conflict Resolver
 *
 * Detects & resolves write conflicts between regions using:
 *
 *   1. Last-Write-Wins (LWW) — use the most recent timestamp
 *   2. Vector-clock comparison — true causality tracking
 *   3. Application-specific merge functions
 *
 * Default policy: LWW with vector-clock tiebreak.
 */
const { logger } = require('../utils/logger');
const redis = require('../utils/redis');

const ResolutionPolicy = {
  LWW: 'lww',                       // Last-Write-Wins
  VECTOR_CLOCK: 'vector_clock',     // Causal consistency
  MERGE: 'merge',                   // Application-specific merge
};

class ConflictResolver {
  constructor() {
    this.isInitialized = false;
    this.policy = process.env.CONFLICT_POLICY || ResolutionPolicy.LWW;
  }

  async initialize() {
    logger.info(`⚖️  Initializing Conflict Resolver (policy=${this.policy})...`);
    this.isInitialized = true;
    logger.info('✅ Conflict Resolver initialized');
  }

  /**
   * Find an existing conflicting write for the same key.
   * Returns null if no conflict.
   */
  async checkConflict(incomingWrite) {
    if (!incomingWrite.key) return null;
    // Look in ingested writes for the same key
    const list = await redis.lrange('drs:mr:writes:ingested', 0, 99);
    for (const raw of list) {
      const existing = JSON.parse(raw);
      if (existing.key === incomingWrite.key && existing.origin !== incomingWrite.origin) {
        return existing;
      }
    }
    return null;
  }

  /**
   * Resolve a conflict per the active policy.
   */
  async resolve(incoming, existing) {
    let resolved;
    if (this.policy === ResolutionPolicy.VECTOR_CLOCK) {
      resolved = this.resolveVectorClock(incoming, existing);
    } else if (this.policy === ResolutionPolicy.MERGE) {
      resolved = this.resolveMerge(incoming, existing);
    } else {
      resolved = this.resolveLWW(incoming, existing);
    }
    await redis.lpush('drs:mr:conflicts:resolved', JSON.stringify({ incoming, existing, resolved, policy: this.policy, at: new Date().toISOString() }));
    logger.info(`⚖️  Conflict resolved via ${this.policy}: ${resolved.id}`);
    return resolved;
  }

  resolveLWW(incoming, existing) {
    const incomingTime = new Date(incoming.timestamp).getTime();
    const existingTime = new Date(existing.timestamp).getTime();
    if (incomingTime > existingTime) {
      return { ...incoming, resolution: 'lww-incoming' };
    }
    if (existingTime > incomingTime) {
      return { ...existing, resolution: 'lww-existing' };
    }
    // Tiebreak by region code
    return incoming.origin < existing.origin
      ? { ...incoming, resolution: 'lww-tiebreak-incoming' }
      : { ...existing, resolution: 'lww-tiebreak-existing' };
  }

  resolveVectorClock(incoming, existing) {
    const incomingVC = incoming.vectorClock || {};
    const existingVC = existing.vectorClock || {};
    const allRegions = new Set([...Object.keys(incomingVC), ...Object.keys(existingVC)]);
    let incomingGreater = false;
    let existingGreater = false;
    for (const r of allRegions) {
      const a = incomingVC[r] || 0;
      const b = existingVC[r] || 0;
      if (a > b) incomingGreater = true;
      else if (b > a) existingGreater = true;
    }
    if (incomingGreater && !existingGreater) return { ...incoming, resolution: 'vc-incoming-causal' };
    if (existingGreater && !incomingGreater) return { ...existing, resolution: 'vc-existing-causal' };
    // Concurrent — fall back to LWW
    return this.resolveLWW(incoming, existing);
  }

  resolveMerge(incoming, existing) {
    // Application-specific merge — for now, deep-merge payloads
    return {
      ...incoming,
      payload: { ...(existing.payload || {}), ...(incoming.payload || {}) },
      resolution: 'merge-combined',
      mergedFrom: [existing.id, incoming.id],
    };
  }

  async listResolvedConflicts(limit = 50) {
    const list = await redis.lrange('drs:mr:conflicts:resolved', 0, limit - 1);
    return list.map((s) => JSON.parse(s));
  }

  async setPolicy(policy) {
    if (!Object.values(ResolutionPolicy).includes(policy)) throw new Error(`Invalid policy: ${policy}`);
    const old = this.policy;
    this.policy = policy;
    await redis.set('drs:mr:conflictPolicy', policy);
    logger.info(`🔧 Conflict policy: ${old} → ${policy}`);
    return { old, new: policy };
  }
  getPolicy() { return this.policy; }

  async shutdown() {
    this.isInitialized = false;
    logger.info('🛑 Conflict Resolver stopped');
  }
}

module.exports = { ConflictResolver, ResolutionPolicy };
