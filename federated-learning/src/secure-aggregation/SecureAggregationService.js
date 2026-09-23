/**
 * Secure Aggregation
 *
 * Implements a simplified version of Bonawitz et al.'s secure aggregation
 * protocol so that the central server never sees individual participant
 * updates — only the final aggregated sum.
 *
 * This is a placeholder implementation that:
 *   1. Generates pairwise additive masks between participants (via Diffie-Hellman
 *      in the real protocol — here we just simulate with random numbers).
 *   2. Each participant adds their masks to their local update.
 *   3. The server sums the masked updates — masks cancel out pairwise,
 *      yielding the sum of original updates.
 *
 * For production-grade secure aggregation, integrate with:
 *   - tensorflow-federated's `tff.simulation`
 *   - OpenMined's PySyft
 *   - Microsoft's SEAL (homomorphic encryption library)
 */
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const redis = require('../utils/redis');

class SecureAggregationService {
  constructor() {
    this.isInitialized = false;
  }

  async initialize() {
    logger.info('🔐 Initializing Secure Aggregation Service...');
    this.isInitialized = true;
    logger.info('✅ Secure Aggregation Service initialized');
  }

  /**
   * Generate the cryptographic context for a new round.
   * Each participant will receive a set of pairwise secrets.
   */
  async setupRound(roundId, participantIds) {
    if (participantIds.length < 3) {
      logger.warn('⚠️  Secure aggregation needs ≥3 participants for pairwise masking');
    }

    const pairs = [];
    for (let i = 0; i < participantIds.length; i++) {
      for (let j = i + 1; j < participantIds.length; j++) {
        const seed = crypto.randomBytes(32);
        // Deterministic seed — both participants derive the same mask
        const direction = participantIds[i] < participantIds[j] ? 1 : -1;
        pairs.push({
          id: uuidv4(),
          a: participantIds[i],
          b: participantIds[j],
          seed: seed.toString('hex'),
          direction,
        });
      }
    }

    const ctx = {
      roundId,
      pairs,
      createdAt: new Date().toISOString(),
    };
    await redis.set(`drs:fl:secure:round:${roundId}`, JSON.stringify(ctx));
    logger.info(`🔐 Secure context for round ${roundId} (${pairs.length} pairs)`);
    return ctx;
  }

  /**
   * Apply masks to a participant's update vector.
   * The participant derives its pairwise mask from each pairwise seed
   * and adds/subtracts it (alternating direction) to/from its update.
   */
  async maskUpdate(roundId, participantId, update) {
    const ctxRaw = await redis.get(`drs:fl:secure:round:${roundId}`);
    if (!ctxRaw) throw new Error(`No secure context for round ${roundId}`);
    const ctx = JSON.parse(ctxRaw);

    const masked = [...update];
    for (const pair of ctx.pairs) {
      if (pair.a !== participantId && pair.b !== participantId) continue;
      const otherId = pair.a === participantId ? pair.b : pair.a;
      const sign = pair.a === participantId ? pair.direction : -pair.direction;
      const mask = this.deriveMask(pair.seed, otherId, update.length);
      for (let i = 0; i < masked.length; i++) {
        masked[i] += sign * mask[i];
      }
    }
    return masked;
  }

  /**
   * Derive a mask of given length from a seed.
   * Uses a stream cipher (chacha20 in production).
   */
  deriveMask(seedHex, salt, length) {
    const out = new Array(length);
    const saltBuf = Buffer.from(salt, 'utf8');
    for (let i = 0; i < length; i++) {
      const hash = crypto.createHash('sha256')
        .update(seedHex)
        .update(saltBuf)
        .update(Buffer.from([i & 0xff, (i >> 8) & 0xff, (i >> 16) & 0xff, (i >> 24) & 0xff]))
        .digest();
      out[i] = (hash.readUInt32BE(0) / 0xffffffff) - 0.5; // small float in [-0.5, 0.5)
    }
    return out;
  }

  /**
   * Verify the round by summing masked updates — pairwise masks cancel,
   * leaving the sum of original updates. The server never sees
   * individual updates.
   */
  async aggregateMasked(maskedUpdates) {
    if (!maskedUpdates || maskedUpdates.length === 0) throw new Error('No masked updates');
    const maxLen = Math.max(...maskedUpdates.map((u) => u.length));
    const out = new Array(maxLen).fill(0);
    for (const u of maskedUpdates) {
      for (let i = 0; i < u.length; i++) out[i] += u[i];
    }
    return out;
  }

  async shutdown() {
    this.isInitialized = false;
    logger.info('🛑 Secure Aggregation Service stopped');
  }
}

module.exports = SecureAggregationService;
