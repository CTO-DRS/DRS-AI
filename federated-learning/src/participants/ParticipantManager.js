/**
 * Participant Manager
 *
 * Tracks the participants (clients / nodes) taking part in federated
 * learning rounds.
 *
 * Each participant registers with:
 *   - id, name, public key (for secure aggregation)
 *   - dataset size (number of samples it will train on)
 *   - capabilities (max model size, training backend)
 *
 * During a round, participants submit their local model updates
 * (weights + gradients) which are then aggregated.
 */
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const redis = require('../utils/redis');

class ParticipantManager {
  constructor() {
    this.isInitialized = false;
    this.participants = new Map(); // id -> participant
  }

  async initialize() {
    logger.info('👥 Initializing Participant Manager...');
    await redis.init();
    await this.loadFromRedis();
    this.isInitialized = true;
    logger.info(`✅ Participant Manager initialized — ${this.participants.size} participant(s)`);
  }

  async loadFromRedis() {
    const all = await redis.hgetall('drs:fl:participants');
    for (const [id, raw] of Object.entries(all || {})) {
      try { this.participants.set(id, JSON.parse(raw)); } catch {}
    }
  }

  async register({ id, name, publicKey, datasetSize, backend }) {
    if (!id) id = uuidv4();
    const p = {
      id, name: name || `Participant-${id.slice(0, 8)}`,
      publicKey: publicKey || null,
      datasetSize: Number(datasetSize) || 0,
      backend: backend || 'unknown',
      registeredAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      roundsCompleted: 0,
      status: 'registered',
    };
    this.participants.set(id, p);
    await redis.hset('drs:fl:participants', id, JSON.stringify(p));
    logger.info(`➕ Participant registered: ${id} (dataset=${p.datasetSize})`);
    return p;
  }

  async heartbeat(id) {
    const p = this.participants.get(id);
    if (!p) throw new Error(`Unknown participant: ${id}`);
    p.lastActive = new Date().toISOString();
    p.status = 'active';
    await redis.hset('drs:fl:participants', id, JSON.stringify(p));
    return p;
  }

  async submitUpdate(id, roundId, updatePayload) {
    const p = this.participants.get(id);
    if (!p) throw new Error(`Unknown participant: ${id}`);
    const submission = {
      id: uuidv4(),
      participantId: id,
      roundId,
      update: updatePayload.update,           // weights delta (typically a vector)
      sampleCount: updatePayload.sampleCount || p.datasetSize,
      metrics: updatePayload.metrics || {},    // {loss, accuracy, ...}
      submittedAt: new Date().toISOString(),
    };
    await redis.lpush(`drs:fl:round:${roundId}:updates`, JSON.stringify(submission));
    p.roundsCompleted += 1;
    p.lastActive = new Date().toISOString();
    await redis.hset('drs:fl:participants', id, JSON.stringify(p));
    logger.info(`📥 Update from ${id} for round ${roundId} (samples=${submission.sampleCount})`);
    return submission;
  }

  async getRoundUpdates(roundId) {
    const list = await redis.lrange(`drs:fl:round:${roundId}:updates`, 0, -1);
    return list.map((s) => JSON.parse(s));
  }

  list() { return Array.from(this.participants.values()); }
  get(id) { return this.participants.get(id); }

  async deregister(id) {
    const p = this.participants.get(id);
    if (!p) return null;
    this.participants.delete(id);
    await redis.hdel('drs:fl:participants', id);
    return p;
  }

  async shutdown() {
    this.isInitialized = false;
    logger.info('🛑 Participant Manager stopped');
  }
}

module.exports = ParticipantManager;
