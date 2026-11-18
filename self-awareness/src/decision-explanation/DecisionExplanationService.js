/**
 * Decision Explanation Engine
 *
 * Generates human-readable explanations for every AI decision:
 *   - Why this model was selected
 *   - Why this response was filtered / blocked
 *   - Why this resource was allocated
 *   - Why this user-facing message was generated
 *
 * Explanations are structured (feature attributions) AND natural-language.
 */
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const redis = require('../utils/redis');
const { DecisionCategory, ConfidenceLevel } = require('../types');

class DecisionExplanationService {
  constructor() {
    this.isInitialized = false;
  }

  async initialize() {
    logger.info('💡 Initializing Decision Explanation Engine...');
    this.isInitialized = true;
    logger.info('✅ Decision Explanation Engine initialized');
  }

  /**
   * Explain a model selection decision.
   */
  async explainModelSelection({ prompt, selectedModel, candidates, scores }) {
    const ranked = (candidates || [])
      .map((id, i) => ({ model: id, score: scores?.[i] ?? 0 }))
      .sort((a, b) => b.score - a.score);

    const top = ranked[0] || { model: selectedModel, score: 1 };
    const reasons = [];

    if (top.model === selectedModel) reasons.push(`Highest overall score (${top.score.toFixed(2)}) across capability, latency, and cost dimensions`);
    if (prompt && prompt.length < 100) reasons.push('Short prompt — favored smaller/faster models');
    if (prompt && /[A-Za-z]/.test(prompt) && /[\u0600-\u06FF]/.test(prompt)) reasons.push('Bilingual prompt — favored models with multi-lingual embeddings');
    if (ranked.length > 1) reasons.push(`Outperformed ${ranked[1].model} by ${(top.score - ranked[1].score).toFixed(2)} points`);

    return this._buildExplanation({
      category: DecisionCategory.MODEL_SELECTION,
      decision: `Selected model "${selectedModel}"`,
      inputs: { promptLength: prompt?.length, candidateCount: candidates?.length },
      rankedCandidates: ranked.slice(0, 5),
      primaryReason: reasons[0] || 'Default model policy',
      additionalReasons: reasons.slice(1),
      confidence: ConfidenceLevel.HIGH,
    });
  }

  /**
   * Explain a content filtering decision.
   */
  async explainContentFiltering({ input, output, filtered, filterId, rules }) {
    const reasons = [];
    const triggered = (rules || []).filter((r) => r.triggered);

    if (filtered) {
      reasons.push(`Output blocked by filter "${filterId}"`);
      if (triggered.length > 0) {
        reasons.push(`Triggered rules: ${triggered.map((r) => r.id).join(', ')}`);
      }
      if (input && /password|secret|api[-_]?key/i.test(input)) reasons.push('Input contained potential credentials');
    } else {
      reasons.push(`Output passed all "${filterId}" rules`);
      if (output && output.length > 4096) reasons.push('Long-form output — additional spot-review recommended');
    }

    return this._buildExplanation({
      category: DecisionCategory.CONTENT_FILTERING,
      decision: filtered ? 'Output filtered' : 'Output allowed',
      inputs: { inputLen: input?.length, outputLen: output?.length },
      triggeredRules: triggered,
      primaryReason: reasons[0],
      additionalReasons: reasons.slice(1),
      confidence: ConfidenceLevel.VERY_HIGH,
    });
  }

  /**
   * Explain a routing decision (which downstream service handled the request).
   */
  async explainRouting({ path, target, latency, reason }) {
    return this._buildExplanation({
      category: DecisionCategory.ROUTING,
      decision: `Routed ${path} → ${target}`,
      inputs: { path, target, latencyMs: latency },
      primaryReason: reason || `Path pattern matched route to ${target}`,
      additionalReasons: [`Measured latency: ${latency}ms`],
      confidence: ConfidenceLevel.VERY_HIGH,
    });
  }

  /**
   * Explain a security decision (allowed / blocked / challenged).
   */
  async explainSecurity({ action, principal, resource, reason, ip }) {
    return this._buildExplanation({
      category: DecisionCategory.SECURITY,
      decision: `${action.toUpperCase()} — principal="${principal}" resource="${resource}"`,
      inputs: { principal, resource, ip },
      primaryReason: reason || 'Default policy',
      additionalReasons: ip ? [`Source IP: ${ip}`] : [],
      confidence: ConfidenceLevel.VERY_HIGH,
    });
  }

  /**
   * Explain a resource allocation decision.
   */
  async explainResourceAllocation({ requester, resource, amount, priority, alternative }) {
    const reasons = [
      `Allocated ${amount} of ${resource} to "${requester}"`,
      `Priority: ${priority}`,
    ];
    if (alternative) reasons.push(`Alternative considered: ${alternative}`);

    return this._buildExplanation({
      category: DecisionCategory.RESOURCE_ALLOCATION,
      decision: `Allocated ${amount} ${resource} → ${requester}`,
      inputs: { requester, resource, amount, priority },
      primaryReason: reasons[0],
      additionalReasons: reasons.slice(1),
      confidence: ConfidenceLevel.HIGH,
    });
  }

  /**
   * Explain a user-facing message (how it was generated, which persona was applied).
   */
  async explainUserFacingMessage({ userId, messageLength, personaApplied, sourcesCount, uncertainty }) {
    const reasons = [];
    if (personaApplied) reasons.push(`Persona "${personaApplied}" applied — tone & style adjusted`);
    if (sourcesCount > 0) reasons.push(`Answer grounded in ${sourcesCount} retrieved sources`);
    if (uncertainty != null) {
      reasons.push(`Model confidence: ${(uncertainty.confidence * 100).toFixed(1)}% (uncertainty=${uncertainty.total.toFixed(2)})`);
      if (uncertainty.abstain) reasons.push('⚠️ Confidence below threshold — abstention / human-review recommended');
    }

    return this._buildExplanation({
      category: DecisionCategory.USER_FACING,
      decision: `Generated message (${messageLength} chars) for user "${userId}"`,
      inputs: { userId, messageLength, personaApplied, sourcesCount },
      uncertainty,
      primaryReason: reasons[0] || 'Default response generation',
      additionalReasons: reasons.slice(1),
      confidence: uncertainty?.confidence ?? ConfidenceLevel.MEDIUM,
    });
  }

  /**
   * Build & persist an explanation record.
   */
  async _buildExplanation(payload) {
    const record = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      ...payload,
    };
    await redis.lpush('drs:explanations:log', JSON.stringify(record));
    await redis.ltrim('drs:explanations:log', 0, 9999);

    record.naturalLanguage = this._toNaturalLanguage(record);
    return record;
  }

  _toNaturalLanguage(r) {
    const parts = [r.decision + '.'];
    parts.push(`Reason: ${r.primaryReason}.`);
    if (r.additionalReasons && r.additionalReasons.length) {
      parts.push(`Additional factors: ${r.additionalReasons.join('; ')}.`);
    }
    if (typeof r.confidence === 'number') {
      parts.push(`Confidence: ${(r.confidence * 100).toFixed(1)}%.`);
    }
    return parts.join(' ');
  }

  async getLog(limit = 50, category) {
    const list = await redis.lrange('drs:explanations:log', 0, limit - 1);
    const records = list.map((s) => JSON.parse(s));
    if (category) return records.filter((r) => r.category === category);
    return records;
  }

  async getById(id) {
    const list = await redis.lrange('drs:explanations:log', 0, 999);
    for (const raw of list) {
      const r = JSON.parse(raw);
      if (r.id === id) return r;
    }
    return null;
  }

  async shutdown() {
    this.isInitialized = false;
    logger.info('🛑 Decision Explanation Engine stopped');
  }
}

module.exports = DecisionExplanationService;
