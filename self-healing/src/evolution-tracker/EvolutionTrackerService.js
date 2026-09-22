/**
 * Evolution Tracker Service
 *
 * Track codebase evolution over time:
 * - Code growth metrics
 * - Quality trends
 * - Dependency evolution
 * - Technical debt tracking
 * - Evolution timeline
 * - Predictive analysis
 *
 * @class EvolutionTrackerService
 * @version 1.0.0
 */

const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const { getRedisClient } = require('../utils/redis');

class EvolutionTrackerService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.config = {
      enabled: options.enabled !== false,
      snapshotInterval: options.snapshotInterval || 3600000, // 1 hour
      maxSnapshots: options.maxSnapshots || 168, // 1 week hourly
      ...options,
    };
    this.redis = null;
    this.isInitialized = false;
    this.snapshots = new Map();
    this.metrics = new Map();
    this.snapshotTimer = null;
  }

  async initialize() {
    try {
      logger.info('📈 Initializing Evolution Tracker Service...');
      this.redis = await getRedisClient();
      await this.loadSnapshots();
      this.startSnapshotTimer();
      this.isInitialized = true;
      logger.info('✅ Evolution Tracker Service initialized');
    } catch (error) {
      logger.error('❌ Failed to initialize Evolution Tracker:', error);
      throw error;
    }
  }

  async loadSnapshots() {
    try {
      const keys = await this.redis.keys('evolution:snapshot:*');
      for (const key of keys.slice(-this.config.maxSnapshots)) {
        const data = await this.redis.get(key);
        if (data) {
          const snapshot = JSON.parse(data);
          this.snapshots.set(snapshot.id, snapshot);
        }
      }
      logger.info(`📊 Loaded ${this.snapshots.size} evolution snapshots`);
    } catch (error) {
      logger.warn('⚠️ Could not load snapshots');
    }
  }

  startSnapshotTimer() {
    this.snapshotTimer = setInterval(async () => {
      await this.takeSnapshot();
    }, this.config.snapshotInterval);
    logger.info('📸 Snapshot timer started');
  }

  /**
   * Take a codebase snapshot
   * @param {Object} params - Snapshot parameters
   * @returns {Promise<Object>} Snapshot data
   */
  async takeSnapshot(params = {}) {
    const snapshotId = uuidv4();
    const timestamp = Date.now();

    logger.info(`📸 Taking evolution snapshot: ${snapshotId}`);

    const snapshot = {
      id: snapshotId,
      timestamp,
      repoId: params.repoId || 'default',
      codeStats: params.codeStats || await this.analyzeCodeStats(params),
      quality: params.quality || await this.analyzeQuality(params),
      dependencies: params.dependencies || await this.analyzeDependencies(params),
      techDebt: params.techDebt || await this.analyzeTechDebt(params),
      contributors: params.contributors || await this.analyzeContributors(params),
    };

    this.snapshots.set(snapshotId, snapshot);
    await this.redis.setex(
      `evolution:snapshot:${snapshotId}`,
      86400 * 30,
      JSON.stringify(snapshot)
    );

    // Keep only recent snapshots
    if (this.snapshots.size > this.config.maxSnapshots) {
      const sorted = Array.from(this.snapshots.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = sorted.slice(0, this.snapshots.size - this.config.maxSnapshots);
      for (const [id] of toRemove) {
        this.snapshots.delete(id);
        await this.redis.del(`evolution:snapshot:${id}`);
      }
    }

    logger.info(`✅ Snapshot taken: ${snapshotId}`);

    this.emit('snapshot:taken', { snapshotId, timestamp });

    return snapshot;
  }

  async analyzeCodeStats(params) {
    const code = params.code || '';
    const lines = code.split('\n');

    return {
      totalLines: lines.length,
      codeLines: lines.filter(l => l.trim() && !l.trim().startsWith('//') && !l.trim().startsWith('*')).length,
      commentLines: lines.filter(l => l.trim().startsWith('//') || l.trim().startsWith('*') || l.trim().startsWith('/*')).length,
      blankLines: lines.filter(l => !l.trim()).length,
      functions: (code.match(/function\s+\w+/g) || []).length,
      classes: (code.match(/class\s+\w+/g) || []).length,
      imports: (code.match(/require\(|import\s+/g) || []).length,
      exports: (code.match(/module\.exports|export\s+/g) || []).length,
    };
  }

  async analyzeQuality(params) {
    const code = params.code || '';

    return {
      complexity: this.calculateComplexity(code),
      duplication: this.calculateDuplication(code),
      testCoverage: params.testCoverage || 0,
      lintIssues: params.lintIssues || 0,
      securityIssues: params.securityIssues || 0,
      documentation: this.calculateDocumentation(code),
    };
  }

  calculateComplexity(code) {
    // Cyclomatic complexity approximation
    let complexity = 1;
    complexity += (code.match(/if\s*\(/g) || []).length;
    complexity += (code.match(/else\s+if/g) || []).length;
    complexity += (code.match(/for\s*\(/g) || []).length;
    complexity += (code.match(/while\s*\(/g) || []).length;
    complexity += (code.match(/case\s+/g) || []).length;
    complexity += (code.match(/&&|\|\|/g) || []).length;
    complexity += (code.match(/catch\s*\(/g) || []).length;
    return complexity;
  }

  calculateDuplication(code) {
    const lines = code.split('\n').map(l => l.trim()).filter(l => l.length > 10);
    const seen = new Map();
    let duplicates = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (seen.has(line)) {
        duplicates++;
      } else {
        seen.set(line, i);
      }
    }

    return {
      duplicateLines: duplicates,
      duplicationPercent: lines.length > 0 ? (duplicates / lines.length * 100).toFixed(1) : 0,
    };
  }

  calculateDocumentation(code) {
    const functions = (code.match(/function\s+\w+/g) || []).length;
    const documented = (code.match(/\/\*\*[\s\S]*?\*\/\s*function/g) || []).length;
    return {
      totalFunctions: functions,
      documentedFunctions: documented,
      coverage: functions > 0 ? (documented / functions * 100).toFixed(1) : 0,
    };
  }

  async analyzeDependencies(params) {
    const packageJson = params.packageJson || {};
    const deps = Object.keys(packageJson.dependencies || {});
    const devDeps = Object.keys(packageJson.devDependencies || {});

    return {
      total: deps.length + devDeps.length,
      production: deps.length,
      development: devDeps.length,
      outdated: params.outdatedDeps || 0,
      vulnerable: params.vulnerableDeps || 0,
      list: [...deps, ...devDeps],
    };
  }

  async analyzeTechDebt(params) {
    const code = params.code || '';

    const todos = (code.match(/TODO|FIXME|HACK|XXX/gi) || []).length;
    const deprecated = (code.match(/deprecated|@deprecated/gi) || []).length;
    const anyTypes = (code.match(/:\s*any\b/g) || []).length;
    const consoleLogs = (code.match(/console\.(log|warn|error)/g) || []).length;

    return {
      todoComments: todos,
      deprecatedUsages: deprecated,
      anyTypes,
      consoleLogs,
      totalScore: todos * 2 + deprecated * 3 + anyTypes * 1 + consoleLogs * 0.5,
    };
  }

  async analyzeContributors(params) {
    return {
      total: params.contributorCount || 1,
      active: params.activeContributors || 1,
      topContributors: params.topContributors || [],
    };
  }

  /**
   * Get evolution timeline
   * @param {string} repoId - Repository ID
   * @returns {Promise<Object>} Evolution timeline
   */
  async getTimeline(repoId = 'default') {
    const snapshots = Array.from(this.snapshots.values())
      .filter(s => s.repoId === repoId)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (snapshots.length < 2) {
      return { snapshots: snapshots.length, timeline: [], trends: {} };
    }

    const timeline = snapshots.map((s, i) => ({
      snapshotId: s.id,
      timestamp: s.timestamp,
      totalLines: s.codeStats.totalLines,
      functions: s.codeStats.functions,
      complexity: s.quality.complexity,
      techDebt: s.techDebt.totalScore,
      dependencies: s.dependencies.total,
    }));

    // Calculate trends
    const first = timeline[0];
    const last = timeline[timeline.length - 1];
    const duration = last.timestamp - first.timestamp;
    const hours = duration / 3600000;

    const trends = {
      codeGrowth: {
        totalLines: last.totalLines - first.totalLines,
        perHour: hours > 0 ? ((last.totalLines - first.totalLines) / hours).toFixed(1) : 0,
      },
      complexity: {
        current: last.complexity,
        change: last.complexity - first.complexity,
        trend: last.complexity > first.complexity ? 'increasing' : 'decreasing',
      },
      techDebt: {
        current: last.techDebt,
        change: last.techDebt - first.techDebt,
        trend: last.techDebt > first.techDebt ? 'increasing' : 'decreasing',
      },
    };

    return {
      snapshots: snapshots.length,
      timeSpan: `${hours.toFixed(1)} hours`,
      timeline,
      trends,
    };
  }

  /**
   * Predict future evolution
   * @param {string} repoId - Repository ID
   * @returns {Promise<Object>} Predictions
   */
  async predictEvolution(repoId = 'default') {
    const timeline = await this.getTimeline(repoId);

    if (timeline.timeline.length < 5) {
      return { status: 'insufficient_data', message: 'Need at least 5 snapshots for prediction' };
    }

    const recent = timeline.timeline.slice(-5);

    // Simple linear prediction
    const lineGrowth = this.linearRegression(
      recent.map((_, i) => i),
      recent.map(r => r.totalLines)
    );

    const complexityGrowth = this.linearRegression(
      recent.map((_, i) => i),
      recent.map(r => r.complexity)
    );

    const techDebtGrowth = this.linearRegression(
      recent.map((_, i) => i),
      recent.map(r => r.techDebt)
    );

    return {
      status: 'predicted',
      in24Hours: {
        estimatedLines: Math.round(lineGrowth.slope * 24 + recent[recent.length - 1].totalLines),
        estimatedComplexity: Math.round(complexityGrowth.slope * 24 + recent[recent.length - 1].complexity),
        estimatedTechDebt: Math.round(techDebtGrowth.slope * 24 + recent[recent.length - 1].techDebt),
      },
      in7Days: {
        estimatedLines: Math.round(lineGrowth.slope * 168 + recent[recent.length - 1].totalLines),
        estimatedComplexity: Math.round(complexityGrowth.slope * 168 + recent[recent.length - 1].complexity),
        estimatedTechDebt: Math.round(techDebtGrowth.slope * 168 + recent[recent.length - 1].techDebt),
      },
      warnings: this.generateWarnings(lineGrowth, complexityGrowth, techDebtGrowth),
    };
  }

  linearRegression(x, y) {
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((total, xi, i) => total + xi * y[i], 0);
    const sumXX = x.reduce((total, xi) => total + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
  }

  generateWarnings(lineGrowth, complexityGrowth, techDebtGrowth) {
    const warnings = [];

    if (complexityGrowth.slope > 2) {
      warnings.push({
        type: 'complexity',
        severity: 'warning',
        message: 'Complexity increasing rapidly. Consider refactoring.',
      });
    }

    if (techDebtGrowth.slope > 5) {
      warnings.push({
        type: 'tech_debt',
        severity: 'critical',
        message: 'Technical debt growing fast. Address TODOs and FIXMEs.',
      });
    }

    if (lineGrowth.slope > 100) {
      warnings.push({
        type: 'growth',
        severity: 'info',
        message: 'Codebase growing rapidly. Ensure test coverage keeps up.',
      });
    }

    return warnings;
  }

  getStats() {
    return {
      snapshots: this.snapshots.size,
      maxSnapshots: this.config.maxSnapshots,
      snapshotInterval: this.config.snapshotInterval,
      isInitialized: this.isInitialized,
    };
  }

  async shutdown() {
    logger.info('🛑 Shutting down Evolution Tracker Service...');
    if (this.snapshotTimer) clearInterval(this.snapshotTimer);
    this.snapshots.clear();
    if (this.redis) await this.redis.quit();
    logger.info('✅ Evolution Tracker Service shutdown complete');
  }
}

module.exports = EvolutionTrackerService;
