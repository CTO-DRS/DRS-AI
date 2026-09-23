/**
 * Transparency Dashboard Service
 *
 * Builds the public-facing transparency report for DRS AI:
 *   - Data lineage (where every fact in an answer came from)
 *   - Model card exposure (which model, version, params answered)
 *   - Bias / fairness audit logs
 *   - Compliance posture (GDPR / CCPA / Saudi NDMO)
 *   - System accountability ledger (who invoked what, when, with what prompt)
 *
 * All records are immutable & append-only — written to Redis lists
 * for audit purposes.
 */
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const redis = require('../utils/redis');

const DEFAULT_RETENTION_DAYS = Number(process.env.AUDIT_RETENTION_DAYS || 365);

class TransparencyDashboardService {
  constructor() {
    this.isInitialized = false;
  }

  async initialize() {
    logger.info('🔍 Initializing Transparency Dashboard Service...');
    this.isInitialized = true;
    logger.info('✅ Transparency Dashboard Service initialized');
  }

  /**
   * Record a system accountability event (immutable).
   */
  async recordEvent(event) {
    const record = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      ...event,
    };
    await redis.lpush('drs:transparency:ledger', JSON.stringify(record));
    return record;
  }

  async getLedger(limit = 100, since) {
    const list = await redis.lrange('drs:transparency:ledger', 0, limit - 1);
    const records = list.map((s) => JSON.parse(s));
    if (since) {
      const sinceDate = new Date(since);
      return records.filter((r) => new Date(r.timestamp) >= sinceDate);
    }
    return records;
  }

  /**
   * Build a public model card summary.
   */
  async getModelCard(modelId) {
    // Pull from Redis if cached
    const cached = await redis.get(`drs:transparency:model:${modelId}`);
    if (cached) return JSON.parse(cached);

    // Otherwise synthesize a default card
    const card = {
      modelId,
      version: '1.0.0',
      provider: 'ollama',
      parameters: { temperature: 0.7, topP: 0.9, topK: 40 },
      training: {
        dataSources: ['Public datasets', 'User feedback'],
        cutoffDate: '2024-01-01',
        languagesSupported: ['ar', 'en'],
      },
      intendedUse: 'General-purpose assistant for enterprise knowledge work',
      limitations: [
        'May produce factually incorrect outputs (hallucinations)',
        'Knowledge cutoff: training data only goes up to cutoff date',
        'May reflect biases present in training data',
      ],
      ethicalConsiderations: [
        'Outputs should be reviewed by a human before being used in high-stakes contexts',
        'User prompts and outputs are logged for accountability and audit',
        'Users may request data deletion per applicable regulations',
      ],
      lastUpdated: new Date().toISOString(),
    };

    await redis.set(`drs:transparency:model:${modelId}`, JSON.stringify(card), 3600);
    return card;
  }

  /**
   * Data lineage: track every source contributing to an answer.
   */
  async recordLineage(answerId, sources) {
    const lineage = {
      answerId,
      timestamp: new Date().toISOString(),
      sources: sources.map((s) => ({
        id: s.id || uuidv4(),
        type: s.type, // 'rag' | 'memory' | 'web' | 'tool' | 'model_internal'
        reference: s.reference, // URL / doc-id / citation
        contribution: s.contribution, // 0..1 — how much this source contributed
        snippet: s.snippet?.slice(0, 500),
      })),
    };
    await redis.lpush(`drs:transparency:lineage:${answerId}`, JSON.stringify(lineage));
    return lineage;
  }

  async getLineage(answerId) {
    const list = await redis.lrange(`drs:transparency:lineage:${answerId}`, 0, -1);
    return list.map((s) => JSON.parse(s));
  }

  /**
   * Bias / fairness audit log.
   */
  async recordBiasAudit(audit) {
    const record = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      ...audit,
    };
    await redis.lpush('drs:transparency:bias-audits', JSON.stringify(record));
    return record;
  }

  async getBiasAudits(limit = 50) {
    const list = await redis.lrange('drs:transparency:bias-audits', 0, limit - 1);
    return list.map((s) => JSON.parse(s));
  }

  /**
   * Build the public compliance posture report.
   */
  async getCompliancePosture() {
    return {
      frameworks: [
        {
          id: 'gdpr',
          name: 'General Data Protection Regulation (EU)',
          status: 'supported',
          userRights: ['access', 'rectification', 'erasure', 'portability', 'objection'],
          notes: 'Right-to-be-forgotten implemented via DELETE /api/v1/transparency/user/:userId',
        },
        {
          id: 'ccpa',
          name: 'California Consumer Privacy Act',
          status: 'supported',
          userRights: ['know', 'delete', 'opt-out'],
        },
        {
          id: 'ndmo',
          name: 'Saudi National Data Management Office',
          status: 'supported',
          userRights: ['access', 'correction', 'deletion'],
          notes: 'Aligns with Personal Data Protection Law (PDPL)',
        },
        {
          id: 'hipaa',
          name: 'Health Insurance Portability and Accountability Act',
          status: 'not_applicable',
          notes: 'DRS AI does not process PHI by default',
        },
      ],
      dataRetentionPolicy: `${DEFAULT_RETENTION_DAYS} days`,
      dataResidency: process.env.DATA_RESIDENCY || 'on-premise',
      encryption: {
        atRest: 'AES-256',
        inTransit: 'TLS 1.3',
        keyManagement: process.env.KEY_MGMT || 'local-kms',
      },
      auditLogAvailable: true,
      lastAudit: new Date().toISOString(),
    };
  }

  /**
   * Aggregate public dashboard summary.
   */
  async getDashboardSummary() {
    const ledgerCount = (await redis.lrange('drs:transparency:ledger', 0, -1)).length;
    const biasAudits = (await redis.lrange('drs:transparency:bias-audits', 0, -1)).length;
    return {
      generatedAt: new Date().toISOString(),
      accountabilityEvents: ledgerCount,
      biasAudits,
      compliance: await this.getCompliancePosture(),
      transparencyLevel: process.env.TRANSPARENCY_LEVEL || 'high',
      links: {
        ledger: '/api/v1/transparency/ledger',
        biasAudits: '/api/v1/transparency/bias-audits',
        compliance: '/api/v1/transparency/compliance',
        userRights: '/api/v1/transparency/user-rights',
      },
    };
  }

  async shutdown() {
    this.isInitialized = false;
    logger.info('🛑 Transparency Dashboard Service stopped');
  }
}

module.exports = TransparencyDashboardService;
