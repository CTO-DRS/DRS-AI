/**
 * Dual-Brain UI Service
 *
 * Simulates the brain's two hemispheres:
 * - Left Brain (Analytical): Logic, facts, analysis, precision
 * - Right Brain (Creative): Intuition, patterns, synthesis, big picture
 * - Dynamic switching based on context and user preference
 *
 * @class DualBrainService
 * @version 1.0.0
 */

const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const { getRedisClient } = require('../utils/redis');

class DualBrainService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.config = {
      defaultMode: options.defaultMode || 'balanced', // left, right, balanced, auto
      autoSwitchThreshold: options.autoSwitchThreshold || 0.7,
      ...options,
    };
    this.redis = null;
    this.isInitialized = false;
    this.userModes = new Map();
  }

  async initialize() {
    try {
      logger.info('🧠 Initializing Dual-Brain UI Service...');
      this.redis = await getRedisClient();
      await this.loadUserModes();
      this.isInitialized = true;
      logger.info('✅ Dual-Brain Service initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize Dual-Brain:', error);
      throw error;
    }
  }

  async loadUserModes() {
    try {
      const keys = await this.redis.keys('dualbrain:user:*');
      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const userData = JSON.parse(data);
          this.userModes.set(userData.userId, userData);
        }
      }
      logger.info(`📊 Loaded ${this.userModes.size} user brain modes`);
    } catch (error) {
      logger.warn('⚠️ Could not load user modes');
    }
  }

  /**
   * Analyze context to determine which brain mode is best
   * @param {string} query - User query
   * @param {string} userId - User identifier
   * @returns {Promise<Object>} Recommended mode with confidence
   */
  async analyzeContext(query, userId) {
    const leftKeywords = [
      'calculate', 'compute', 'exact', 'precise', 'number', 'data',
      'statistics', 'formula', 'equation', 'proof', 'logical',
      'analysis', 'breakdown', 'step by step', 'how to', 'tutorial',
      'code', 'debug', 'error', 'syntax', 'algorithm',
      'تفاصيل', 'خطوات', 'حساب', 'رقم', 'بيانات', 'تحليل'
    ];

    const rightKeywords = [
      'design', 'creative', 'imagine', 'visualize', 'concept',
      'overview', 'big picture', 'intuition', 'feel', 'sense',
      'pattern', 'connect', 'synthesize', 'brainstorm', 'innovate',
      'art', 'music', 'story', 'poem', 'draw', 'sketch',
      'تصميم', 'إبداعي', 'خيال', 'فني', 'ألوان', 'نمط'
    ];

    const queryLower = query.toLowerCase();
    let leftScore = 0;
    let rightScore = 0;

    for (const kw of leftKeywords) {
      if (queryLower.includes(kw.toLowerCase())) leftScore++;
    }
    for (const kw of rightKeywords) {
      if (queryLower.includes(kw.toLowerCase())) rightScore++;
    }

    const total = leftScore + rightScore;
    if (total === 0) {
      return { mode: 'balanced', confidence: 0.5, reason: 'neutral_query' };
    }

    const leftRatio = leftScore / total;
    const rightRatio = rightScore / total;

    if (leftRatio > this.config.autoSwitchThreshold) {
      return { mode: 'left', confidence: leftRatio, reason: 'analytical_detected' };
    } else if (rightRatio > this.config.autoSwitchThreshold) {
      return { mode: 'right', confidence: rightRatio, reason: 'creative_detected' };
    }

    return { mode: 'balanced', confidence: Math.max(leftRatio, rightRatio), reason: 'mixed_signals' };
  }

  /**
   * Process a query in the appropriate brain mode
   * @param {Object} params - Processing parameters
   * @returns {Promise<Object>} Processed response with brain-specific formatting
   */
  async processDualBrain(params) {
    const { query, userId, mode: requestedMode, context } = params;
    const sessionId = uuidv4();

    // Determine mode
    let mode = requestedMode || this.config.defaultMode;
    let autoDetected = false;

    if (mode === 'auto') {
      const analysis = await this.analyzeContext(query, userId);
      mode = analysis.mode;
      autoDetected = true;
    }

    // Get user preferences
    const userData = this.userModes.get(userId) || { preferredMode: 'balanced' };

    logger.info(`🧠 Dual-Brain processing [${mode}]: ${query.slice(0, 50)}...`);

    // Process based on mode
    let response;
    switch (mode) {
      case 'left':
        response = await this.leftBrainProcess(query, context);
        break;
      case 'right':
        response = await this.rightBrainProcess(query, context);
        break;
      case 'balanced':
      default:
        response = await this.balancedProcess(query, context);
        break;
    }

    const result = {
      sessionId,
      mode,
      autoDetected,
      userPreferred: userData.preferredMode,
      response,
      uiHints: this.generateUIHints(mode),
      timestamp: Date.now(),
    };

    // Save interaction
    await this.saveInteraction(userId, result);

    this.emit('dualbrain:processed', { userId, mode, sessionId });

    return result;
  }

  async leftBrainProcess(query, context) {
    // Analytical: structured, precise, step-by-step
    return {
      type: 'left_brain',
      style: 'analytical',
      formatting: {
        layout: 'structured',
        sections: ['facts', 'analysis', 'conclusion'],
        detail: 'high',
        useNumbers: true,
        useBullets: true,
        useTables: true,
      },
      response: {
        heading: 'Analytical Analysis',
        structure: 'step_by_step',
        emphasis: 'precision',
        tone: 'professional',
      },
      metadata: {
        confidence: 0.92,
        reasoningDepth: 'deep',
        citations: true,
      },
    };
  }

  async rightBrainProcess(query, context) {
    // Creative: visual, intuitive, big picture
    return {
      type: 'right_brain',
      style: 'creative',
      formatting: {
        layout: 'visual',
        sections: ['overview', 'connections', 'insights'],
        detail: 'medium',
        useVisuals: true,
        useMetaphors: true,
        useStories: true,
      },
      response: {
        heading: 'Creative Insights',
        structure: 'conceptual',
        emphasis: 'intuition',
        tone: 'inspirational',
      },
      metadata: {
        confidence: 0.85,
        reasoningDepth: 'broad',
        associations: true,
      },
    };
  }

  async balancedProcess(query, context) {
    // Balanced: combines both approaches
    return {
      type: 'balanced',
      style: 'integrated',
      formatting: {
        layout: 'adaptive',
        sections: ['overview', 'details', 'synthesis'],
        detail: 'adaptive',
        useNumbers: true,
        useVisuals: true,
      },
      response: {
        heading: 'Integrated Analysis',
        structure: 'adaptive',
        emphasis: 'clarity',
        tone: 'neutral',
      },
      metadata: {
        confidence: 0.88,
        reasoningDepth: 'moderate',
        dualApproach: true,
      },
    };
  }

  generateUIHints(mode) {
    const hints = {
      left: {
        theme: 'cool_blue',
        layout: 'grid',
        font: 'monospace',
        animations: 'minimal',
        density: 'high',
        sidebar: 'data_panel',
      },
      right: {
        theme: 'warm_orange',
        layout: 'fluid',
        font: 'serif',
        animations: 'expressive',
        density: 'medium',
        sidebar: 'mind_map',
      },
      balanced: {
        theme: 'adaptive',
        layout: 'responsive',
        font: 'sans_serif',
        animations: 'subtle',
        density: 'adaptive',
        sidebar: 'context_panel',
      },
    };

    return hints[mode] || hints.balanced;
  }

  async saveInteraction(userId, interaction) {
    try {
      await this.redis.lpush(`dualbrain:history:${userId}`, JSON.stringify(interaction));
      await this.redis.ltrim(`dualbrain:history:${userId}`, 0, 99);
    } catch (error) {
      logger.warn('⚠️ Could not save interaction');
    }
  }

  /**
   * Set user's preferred brain mode
   * @param {string} userId - User identifier
   * @param {string} mode - Preferred mode
   */
  async setUserMode(userId, mode) {
    const userData = {
      userId,
      preferredMode: mode,
      updatedAt: Date.now(),
    };

    this.userModes.set(userId, userData);
    await this.redis.setex(`dualbrain:user:${userId}`, 86400 * 30, JSON.stringify(userData));

    return { userId, mode, status: 'updated' };
  }

  /**
   * Get user's brain mode history
   * @param {string} userId - User identifier
   * @returns {Promise<Array>} Mode history
   */
  async getUserHistory(userId, limit = 20) {
    const history = await this.redis.lrange(`dualbrain:history:${userId}`, 0, limit - 1);
    return history.map(h => JSON.parse(h));
  }

  getStats() {
    return {
      usersConfigured: this.userModes.size,
      defaultMode: this.config.defaultMode,
      isInitialized: this.isInitialized,
    };
  }

  async shutdown() {
    logger.info('🛑 Shutting down Dual-Brain Service...');
    this.userModes.clear();
    if (this.redis) await this.redis.quit();
    logger.info('✅ Dual-Brain Service shutdown complete');
  }
}

module.exports = DualBrainService;
