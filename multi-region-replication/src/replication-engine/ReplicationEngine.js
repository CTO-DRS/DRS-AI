/**
 * Replication Engine
 *
 * Propagates writes from the local region to all peer regions using
 * a deterministic write-ordering protocol:
 *
 *   1. Each write is assigned a vector clock (region_code, sequence_number)
 *   2. Writes are queued for replication to each peer region
 *   3. Conflicts are resolved by the ConflictResolver
 *
 * Supports:
 *   - Async replication (default — eventual consistency)
 *   - Sync replication (writes block until N peers ack)
 *   - Quorum replication (writes block until majority ack)
 */
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { logger } = require('../utils/logger');
const redis = require('../utils/redis');

const ReplicationMode = {
  ASYNC: 'async',
  SYNC: 'sync',
  QUORUM: 'quorum',
};

class ReplicationEngine {
  constructor(regionManager, conflictResolver) {
    this.regionManager = regionManager;
    this.conflictResolver = conflictResolver;
    this.isInitialized = false;
    this.mode = process.env.REPLICATION_MODE || ReplicationMode.ASYNC;
    this.localSeq = 0;
    this.pendingReplications = new Map(); // writeId -> { peers: Set, attempts }
    this.flushTimer = null;
  }

  async initialize() {
    logger.info(`🔁 Initializing Replication Engine (mode=${this.mode})...`);
    await this.loadSeqFromRedis();
    this.isInitialized = true;
    logger.info(`✅ Replication Engine initialized (seq=${this.localSeq})`);
  }

  async loadSeqFromRedis() {
    const v = await redis.get(`drs:mr:seq:${this.regionManager.localRegion}`);
    if (v) this.localSeq = Number(v);
  }

  /**
   * Replicate a write to all peer regions.
   *
   * @param {Object} write - { type, payload, table?, key? }
   * @returns {Object} - { writeId, vectorClock, replicatedTo[], errors[] }
   */
  async replicate(write) {
    this.localSeq += 1;
    await redis.set(`drs:mr:seq:${this.regionManager.localRegion}`, String(this.localSeq));

    const writeId = uuidv4();
    const vectorClock = { [this.regionManager.localRegion]: this.localSeq };

    const fullWrite = {
      id: writeId,
      type: write.type,
      payload: write.payload,
      table: write.table,
      key: write.key,
      origin: this.regionManager.localRegion,
      vectorClock,
      timestamp: new Date().toISOString(),
    };

    // Persist locally first
    await redis.lpush('drs:mr:writes:local', JSON.stringify(fullWrite));

    // Replicate to peers
    const peers = this.regionManager.list().filter((r) => r.code !== this.regionManager.localRegion && r.health === 'healthy');
    const results = [];

    if (this.mode === ReplicationMode.ASYNC) {
      // Fire-and-forget
      for (const peer of peers) {
        results.push(this.replicateToPeer(peer, fullWrite).catch((e) => ({ region: peer.code, ok: false, error: e.message })));
      }
      const settled = await Promise.allSettled(results);
      const r = settled.map((s) => s.status === 'fulfilled' ? s.value : { ok: false, error: s.reason?.message });
      return { writeId, vectorClock, replicatedTo: r.filter((x) => x.ok).map((x) => x.region), errors: r.filter((x) => !x.ok) };
    }

    if (this.mode === ReplicationMode.SYNC) {
      // Wait for ALL peers to ack
      const r = await Promise.allSettled(peers.map((p) => this.replicateToPeer(p, fullWrite)));
      const results = r.map((s, i) => ({ region: peers[i].code, ok: s.status === 'fulfilled', error: s.reason?.message }));
      return {
        writeId,
        vectorClock,
        replicatedTo: results.filter((x) => x.ok).map((x) => x.region),
        errors: results.filter((x) => !x.ok),
      };
    }

    if (this.mode === ReplicationMode.QUORUM) {
      // Wait for majority ack
      const required = Math.floor(peers.length / 2) + 1;
      const r = await Promise.allSettled(peers.map((p) => this.replicateToPeer(p, fullWrite)));
      const oks = r.filter((s) => s.status === 'fulfilled').length;
      if (oks < required) {
        throw new Error(`Quorum not reached: ${oks}/${peers.length} (required ${required})`);
      }
      const results = r.map((s, i) => ({ region: peers[i].code, ok: s.status === 'fulfilled', error: s.reason?.message }));
      return {
        writeId,
        vectorClock,
        replicatedTo: results.filter((x) => x.ok).map((x) => x.region),
        errors: results.filter((x) => !x.ok),
      };
    }
  }

  async replicateToPeer(peer, write) {
    try {
      await axios.post(`${peer.gatewayUrl}/api/v1/replication/ingest`, write, { timeout: 10000 });
      await redis.lpush(`drs:mr:replicated:${write.id}`, peer.code);
      logger.info(`✅ Replicated write ${write.id} → ${peer.code} (latency=${peer.latency}ms)`);
      return { region: peer.code, ok: true };
    } catch (err) {
      logger.warn(`❌ Replication to ${peer.code} failed: ${err.message}`);
      // Queue for retry
      await redis.lpush('drs:mr:retry-queue', JSON.stringify({ write, peer: peer.code, attempts: 0 }));
      throw err;
    }
  }

  /**
   * Receive a write from a peer region (called by /api/v1/replication/ingest).
   */
  async ingest(write) {
    // Persist locally
    await redis.lpush('drs:mr:writes:ingested', JSON.stringify(write));

    // Check for conflicts
    const conflict = await this.conflictResolver.checkConflict(write);
    if (conflict) {
      const resolved = await this.conflictResolver.resolve(write, conflict);
      await redis.lpush('drs:mr:writes:resolved', JSON.stringify({ incoming: write, existing: conflict, resolution: resolved }));
      return { ingested: true, conflict: true, resolved: resolved };
    }

    logger.info(`📥 Ingested write ${write.id} from ${write.origin}`);
    return { ingested: true, conflict: false };
  }

  async getLocalWrites(limit = 50) {
    const list = await redis.lrange('drs:mr:writes:local', 0, limit - 1);
    return list.map((s) => JSON.parse(s));
  }

  async getIngestedWrites(limit = 50) {
    const list = await redis.lrange('drs:mr:writes:ingested', 0, limit - 1);
    return list.map((s) => JSON.parse(s));
  }

  async setMode(mode) {
    if (!Object.values(ReplicationMode).includes(mode)) throw new Error(`Invalid mode: ${mode}`);
    const old = this.mode;
    this.mode = mode;
    await redis.set('drs:mr:replicationMode', mode);
    logger.info(`🔧 Replication mode: ${old} → ${mode}`);
    return { old, new: mode };
  }
  getMode() { return this.mode; }

  async shutdown() {
    this.isInitialized = false;
    logger.info('🛑 Replication Engine stopped');
  }
}

module.exports = { ReplicationEngine, ReplicationMode };
