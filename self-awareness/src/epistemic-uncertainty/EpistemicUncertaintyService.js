/**
 * Epistemic Uncertainty Quantification
 *
 * Models uncertainty across two dimensions:
 *   1. Aleatoric uncertainty   – inherent data noise (irreducible)
 *   2. Epistemic uncertainty    – model knowledge gap (reducible w/ more data)
 *
 * Provides per-response confidence scores, calibration metrics, and
 * triggers abstention / human-in-the-loop when confidence < threshold.
 */
const { logger } = require('../utils/logger');
const redis = require('../utils/redis');
const { v4: uuidv4 } = require('uuid');

const DEFAULT_CONFIDENCE_THRESHOLD = Number(process.env.CONFIDENCE_THRESHOLD || 0.65);
const DEFAULT_TEMPERATURE = 0.7;
const MC_DROPOUT_PASSES = Number(process.env.MC_DROPOUT_PASSES || 5);
const CALIBRATION_WINDOW = 1000;

class EpistemicUncertaintyService {
  constructor() {
    this.isInitialized = false;
    this.recentPredictions = []; // ring buffer for calibration
    this.threshold = DEFAULT_CONFIDENCE_THRESHOLD;
  }

  async initialize() {
    logger.info('🧠 Initializing Epistemic Uncertainty Service...');
    await this.loadCalibrationData();
    this.isInitialized = true;
    logger.info(`✅ Epistemic Uncertainty Service initialized (threshold=${this.threshold})`);
  }

  /**
   * Compute uncertainty from a model's token-level logprobs (when available).
   * Falls back to ensemble variance when logprobs are absent.
   *
   * @param {Object} opts
   * @param {number[]} [opts.logprobs] - top-k log-probabilities of chosen tokens
   * @param {Object[]} [opts.ensemble] - ensemble of model outputs for variance calc
   * @param {number} [opts.temperature] - sampling temperature used
   * @returns {Object} { aleatoric, epistemic, total, confidence, abstain }
   */
  async quantify(opts = {}) {
    const { logprobs, ensemble, temperature = DEFAULT_TEMPERATURE } = opts;

    let aleatoric = 0;
    let epistemic = 0;

    if (logprobs && Array.isArray(logprobs) && logprobs.length > 0) {
      // Shannon entropy of the chosen-token distribution
      const entropy = logprobs.reduce((sum, lp) => {
        const p = Math.exp(lp);
        return sum + (p > 0 ? -p * Math.log(p) : 0);
      }, 0) / logprobs.length;
      aleatoric = Math.min(1, entropy);
    }

    if (ensemble && Array.isArray(ensemble) && ensemble.length > 1) {
      // Variance of ensemble response lengths as a proxy for epistemic uncertainty
      const lens = ensemble.map((e) => (typeof e === 'string' ? e.length : (e?.text?.length || 0)));
      const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
      const variance = lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length;
      epistemic = Math.min(1, Math.sqrt(variance) / (mean || 1));
    }

    // MC-Dropout proxy: if neither signal available, fall back to temperature-based heuristic
    if (!logprobs && !ensemble) {
      aleatoric = Math.min(1, (temperature - 0.2) / 1.5);
      epistemic = Math.min(1, MC_DROPOUT_PASSES > 0 ? 0.3 : 0.5);
    }

    const total = Math.min(1, aleatoric * 0.6 + epistemic * 0.8);
    const confidence = Math.max(0, 1 - total);
    const abstain = confidence < this.threshold;

    const result = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      aleatoric: Number(aleatoric.toFixed(4)),
      epistemic: Number(epistemic.toFixed(4)),
      total: Number(total.toFixed(4)),
      confidence: Number(confidence.toFixed(4)),
      threshold: this.threshold,
      abstain,
      temperature,
      method: logprobs ? 'logprob-entropy' : ensemble ? 'ensemble-variance' : 'heuristic',
    };

    this.recentPredictions.push({ predictedConfident: confidence >= this.threshold, actualCorrect: null });
    if (this.recentPredictions.length > CALIBRATION_WINDOW) this.recentPredictions.shift();

    await redis.lpush('drs:uncertainty:predictions', JSON.stringify(result));
    await redis.ltrim('drs:uncertainty:predictions', 0, CALIBRATION_WINDOW - 1);

    return result;
  }

  /**
   * Submit human feedback to recalibrate confidence thresholds.
   * @param {string} predictionId
   * @param {boolean} wasCorrect
   */
  async feedback(predictionId, wasCorrect) {
    const list = await redis.lrange('drs:uncertainty:predictions', 0, CALIBRATION_WINDOW - 1);
    for (const raw of list) {
      const p = JSON.parse(raw);
      if (p.id === predictionId) {
        p.actualCorrect = wasCorrect;
        await redis.lpush('drs:uncertainty:predictions', JSON.stringify(p));
        break;
      }
    }

    // Adjust threshold based on calibration error
    const calibration = await this.calibrationMetrics();
    if (calibration.totalFeedback < 10) return { adjusted: false, reason: 'insufficient feedback' };

    const ece = calibration.expectedCalibrationError;
    if (ece > 0.1 && calibration.confidentButWrong > calibration.correctButUnconfident) {
      // Model is over-confident: raise threshold
      const newThreshold = Math.min(0.95, this.threshold + 0.05);
      const old = this.threshold;
      this.threshold = newThreshold;
      await redis.set('drs:uncertainty:threshold', String(newThreshold));
      logger.warn(`📈 Confidence threshold raised ${old} → ${newThreshold} (ECE=${ece.toFixed(3)})`);
      return { adjusted: true, oldThreshold: old, newThreshold, reason: 'over-confident' };
    }
    if (ece > 0.1 && calibration.correctButUnconfident > calibration.confidentButWrong) {
      const newThreshold = Math.max(0.3, this.threshold - 0.05);
      const old = this.threshold;
      this.threshold = newThreshold;
      await redis.set('drs:uncertainty:threshold', String(newThreshold));
      logger.info(`📉 Confidence threshold lowered ${old} → ${newThreshold} (ECE=${ece.toFixed(3)})`);
      return { adjusted: true, oldThreshold: old, newThreshold, reason: 'under-confident' };
    }

    return { adjusted: false, reason: 'within tolerance' };
  }

  async calibrationMetrics() {
    const list = await redis.lrange('drs:uncertainty:predictions', 0, CALIBRATION_WINDOW - 1);
    const withFeedback = list.map((s) => JSON.parse(s)).filter((p) => p.actualCorrect !== null);

    if (withFeedback.length === 0) {
      return {
        totalFeedback: 0,
        expectedCalibrationError: 0,
        confidentButWrong: 0,
        correctButUnconfident: 0,
      };
    }

    let confidentButWrong = 0;
    let correctButUnconfident = 0;
    let eceNumerator = 0;

    for (const p of withFeedback) {
      const confident = p.confidence >= this.threshold;
      const correct = p.actualCorrect === true;
      if (confident && !correct) confidentButWrong += 1;
      if (!confident && correct) correctButUnconfident += 1;
      eceNumerator += Math.abs(p.confidence - (correct ? 1 : 0));
    }

    return {
      totalFeedback: withFeedback.length,
      expectedCalibrationError: Number((eceNumerator / withFeedback.length).toFixed(4)),
      confidentButWrong,
      correctButUnconfident,
    };
  }

  async loadCalibrationData() {
    const t = await redis.get('drs:uncertainty:threshold');
    if (t) {
      this.threshold = Number(t);
      logger.info(`🔧 Confidence threshold loaded from Redis: ${this.threshold}`);
    }
  }

  async getThreshold() { return this.threshold; }

  async setThreshold(t) {
    if (t < 0 || t > 1) throw new Error('Threshold must be between 0 and 1');
    const old = this.threshold;
    this.threshold = t;
    await redis.set('drs:uncertainty:threshold', String(t));
    logger.info(`🔧 Confidence threshold manually set: ${old} → ${t}`);
    return { oldThreshold: old, newThreshold: t };
  }

  async shutdown() {
    this.isInitialized = false;
    logger.info('🛑 Epistemic Uncertainty Service stopped');
  }
}

module.exports = EpistemicUncertaintyService;
