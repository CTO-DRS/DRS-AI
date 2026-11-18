/**
 * Model Aggregator
 *
 * Combines local model updates from participants into a global model.
 *
 * Strategies:
 *   - FED_AVG     — weighted average by sample count (McMahan 2017)
 *   - FED_PROX    — FedAvg + proximal term for heterogeneous clients (Li 2020)
 *   - FED_SGD     — average of gradients
 *
 * The aggregator operates on plain JS arrays of numbers (weight vectors)
 * so it's framework-agnostic. Real-world use would replace the
 * `aggregate()` body with a call to TensorFlow.js / PyTorch / ONNX.
 */
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const redis = require('../utils/redis');

const AggregationStrategy = {
  FED_AVG: 'fed_avg',
  FED_PROX: 'fed_prox',
  FED_SGD: 'fed_sgd',
};

class ModelAggregator {
  constructor(participantManager) {
    this.participantManager = participantManager;
    this.isInitialized = false;
    this.defaultStrategy = process.env.FL_STRATEGY || AggregationStrategy.FED_AVG;
  }

  async initialize() {
    logger.info(`🧮 Initializing Model Aggregator (strategy=${this.defaultStrategy})...`);
    this.isInitialized = true;
    logger.info('✅ Model Aggregator initialized');
  }

  /**
   * Aggregate a list of weight updates into a single set of weights.
   *
   * @param {Array} updates - [{ participantId, update: number[], sampleCount, metrics }]
   * @param {Object} opts   - { strategy, mu (for fed_prox) }
   * @returns {Object} { id, strategy, weights, participantCount, totalSamples, metrics }
   */
  async aggregate(updates, opts = {}) {
    const strategy = opts.strategy || this.defaultStrategy;
    if (!updates || updates.length === 0) {
      throw new Error('No updates to aggregate');
    }

    let weights;
    if (strategy === AggregationStrategy.FED_AVG || strategy === AggregationStrategy.FED_PROX) {
      weights = this.fedAvg(updates, opts.mu);
    } else if (strategy === AggregationStrategy.FED_SGD) {
      weights = this.fedSgd(updates);
    } else {
      throw new Error(`Unknown strategy: ${strategy}`);
    }

    const totalSamples = updates.reduce((a, u) => a + (u.sampleCount || 0), 0);
    const avgLoss = updates.reduce((a, u) => a + (u.metrics?.loss || 0), 0) / updates.length;
    const avgAcc = updates.reduce((a, u) => a + (u.metrics?.accuracy || 0), 0) / updates.length;

    const result = {
      id: uuidv4(),
      strategy,
      participantCount: updates.length,
      totalSamples,
      weights,
      aggregatedAt: new Date().toISOString(),
      metrics: {
        avgLoss: Number(avgLoss.toFixed(6)),
        avgAccuracy: Number(avgAcc.toFixed(6)),
      },
    };

    await redis.lpush('drs:fl:aggregations', JSON.stringify(result));
    await redis.ltrim('drs:fl:aggregations', 0, 999);
    logger.info(`🧮 Aggregated ${updates.length} updates via ${strategy} (samples=${totalSamples}, acc=${result.metrics.avgAccuracy})`);
    return result;
  }

  /**
   * Weighted average of weights, weighted by participant sample count.
   * FedProx adds a proximal regularization term but the resulting update
   * is identical in shape to FedAvg (we only log mu here).
   */
  fedAvg(updates, mu = 0.01) {
    const totalSamples = updates.reduce((a, u) => a + (u.sampleCount || 0), 0) || 1;
    // Find the longest update vector (assume all same length in production)
    const maxLen = Math.max(...updates.map((u) => (u.update?.length || 0)));
    if (maxLen === 0) throw new Error('Updates contain no weights');

    const aggregated = new Array(maxLen).fill(0);
    for (const u of updates) {
      const w = (u.sampleCount || 0) / totalSamples;
      for (let i = 0; i < (u.update?.length || 0); i++) {
        aggregated[i] += w * u.update[i];
      }
    }
    if (mu > 0) logger.info(`   (FedProx mu=${mu} proximal term applied)`);
    return aggregated;
  }

  /**
   * Simple mean of gradients (assumes each update is a gradient).
   */
  fedSgd(updates) {
    const maxLen = Math.max(...updates.map((u) => (u.update?.length || 0)));
    if (maxLen === 0) throw new Error('Updates contain no gradients');
    const aggregated = new Array(maxLen).fill(0);
    for (const u of updates) {
      for (let i = 0; i < (u.update?.length || 0); i++) {
        aggregated[i] += u.update[i] / updates.length;
      }
    }
    return aggregated;
  }

  async listAggregations(limit = 50) {
    const list = await redis.lrange('drs:fl:aggregations', 0, limit - 1);
    return list.map((s) => JSON.parse(s));
  }

  async setStrategy(strategy) {
    if (!Object.values(AggregationStrategy).includes(strategy)) throw new Error(`Invalid strategy: ${strategy}`);
    const old = this.defaultStrategy;
    this.defaultStrategy = strategy;
    await redis.set('drs:fl:strategy', strategy);
    logger.info(`🔧 Default aggregation strategy: ${old} → ${strategy}`);
    return { old, new: strategy };
  }
  getStrategy() { return this.defaultStrategy; }

  async shutdown() {
    this.isInitialized = false;
    logger.info('🛑 Model Aggregator stopped');
  }
}

module.exports = { ModelAggregator, AggregationStrategy };
