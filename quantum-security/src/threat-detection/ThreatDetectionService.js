/**
 * Threat Detection Service
 * 
 * Real-time threat monitoring and intelligence:
 * - Network traffic analysis
 * - Anomaly detection
 * - Threat intelligence integration
 * - Automated incident response
 * 
 * @class ThreatDetectionService
 * @version 1.0.0
 */

const { EventEmitter } = require('events');
const { logger } = require('../utils/logger');
const { getRedisClient } = require('../utils/redis');
const { v4: uuidv4 } = require('uuid');

class ThreatDetectionService extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.honeypotService = options.honeypotService;
    
    this.config = {
      monitoringInterval: options.monitoringInterval || 5000,
      anomalyThreshold: options.anomalyThreshold || 0.8,
      ...options,
    };
    
    this.redis = null;
    this.isInitialized = false;
    
    // Monitoring state
    this.isMonitoring = false;
    this.monitoringTimer = null;
    
    // Baseline metrics
    this.baselineMetrics = new Map();
    
    // Active incidents
    this.incidents = new Map();
    
    // Stats
    this.stats = {
      incidentsDetected: 0,
      incidentsResolved: 0,
      falsePositives: 0,
    };
  }

  async initialize() {
    try {
      logger.info('🔍 Initializing Threat Detection Service...');
      
      // Initialize Redis
      this.redis = await getRedisClient();
      
      // Load baseline metrics
      await this.loadBaselineMetrics();
      
      // Start monitoring
      this.startMonitoring();
      
      this.isInitialized = true;
      logger.info('✅ Threat Detection Service initialized');
      
    } catch (error) {
      logger.error('❌ Failed to initialize Threat Detection:', error);
      throw error;
    }
  }

  async loadBaselineMetrics() {
    try {
      const metrics = await this.redis.get('threat:baseline');
      if (metrics) {
        this.baselineMetrics = new Map(Object.entries(JSON.parse(metrics)));
        logger.info('📊 Loaded baseline metrics');
      } else {
        // Initialize default baselines
        this.initializeDefaultBaselines();
      }
    } catch (error) {
      logger.warn('⚠️ Could not load baseline metrics');
      this.initializeDefaultBaselines();
    }
  }

  initializeDefaultBaselines() {
    this.baselineMetrics.set('requests_per_minute', 1000);
    this.baselineMetrics.set('error_rate', 0.05);
    this.baselineMetrics.set('unique_ips_per_minute', 50);
    this.baselineMetrics.set('avg_response_time', 200);
    
    logger.info('📊 Initialized default baseline metrics');
  }

  startMonitoring() {
    if (this.isMonitoring) return;
    
    logger.info('🔍 Starting threat monitoring...');
    
    this.isMonitoring = true;
    
    this.monitoringTimer = setInterval(async () => {
      await this.monitorCycle();
    }, this.config.monitoringInterval);
  }

  stopMonitoring() {
    if (!this.isMonitoring) return;
    
    logger.info('⏹️ Stopping threat monitoring...');
    
    this.isMonitoring = false;
    
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }
  }

  async monitorCycle() {
    try {
      // Collect metrics
      const metrics = await this.collectMetrics();
      
      // Analyze for anomalies
      const anomalies = this.detectAnomalies(metrics);
      
      // Handle anomalies
      for (const anomaly of anomalies) {
        await this.handleAnomaly(anomaly, metrics);
      }
      
      // Update baselines periodically
      if (Math.random() < 0.1) { // 10% chance each cycle
        await this.updateBaselines(metrics);
      }
      
    } catch (error) {
      logger.error('❌ Monitoring cycle failed:', error);
    }
  }

  async collectMetrics() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Get recent requests from Redis
    const requestCount = parseInt(await this.redis.get('metrics:requests:count') || '0');
    const errorCount = parseInt(await this.redis.get('metrics:errors:count') || '0');
    
    // Get unique IPs
    const uniqueIPs = await this.redis.scard('metrics:ips:unique');
    
    // Get response times
    const avgResponseTime = parseFloat(await this.redis.get('metrics:response:avg') || '0');
    
    // Get honeypot stats
    const honeypotStats = this.honeypotService?.getStats() || {};
    
    return {
      timestamp: now,
      requests_per_minute: requestCount,
      error_rate: requestCount > 0 ? errorCount / requestCount : 0,
      unique_ips_per_minute: uniqueIPs,
      avg_response_time: avgResponseTime,
      honeypot_attacks: honeypotStats.attacksDetected || 0,
      blocked_ips: honeypotStats.threatsBlocked || 0,
    };
  }

  detectAnomalies(metrics) {
    const anomalies = [];
    
    for (const [metric, value] of Object.entries(metrics)) {
      if (metric === 'timestamp') continue;
      
      const baseline = this.baselineMetrics.get(metric);
      if (!baseline) continue;
      
      // Calculate deviation
      const deviation = Math.abs(value - baseline) / baseline;
      
      if (deviation > this.config.anomalyThreshold) {
        anomalies.push({
          metric,
          value,
          baseline,
          deviation,
          severity: deviation > 2 ? 'critical' : deviation > 1 ? 'high' : 'medium',
        });
      }
    }
    
    return anomalies;
  }

  async handleAnomaly(anomaly, metrics) {
    logger.warn(`🚨 ANOMALY DETECTED: ${anomaly.metric} = ${anomaly.value} (baseline: ${anomaly.baseline}, deviation: ${(anomaly.deviation * 100).toFixed(1)}%)`);
    
    // Create incident
    const incident = {
      id: uuidv4(),
      type: 'anomaly',
      severity: anomaly.severity,
      description: `Anomaly detected in ${anomaly.metric}`,
      details: anomaly,
      metrics,
      createdAt: Date.now(),
      status: 'open',
    };
    
    this.incidents.set(incident.id, incident);
    this.stats.incidentsDetected++;
    
    // Emit incident
    this.emit('incident:created', incident);
    
    // Auto-response based on severity
    if (anomaly.severity === 'critical') {
      await this.triggerIncidentResponse(incident);
    }
    
    // Store incident
    await this.storeIncident(incident);
  }

  async triggerIncidentResponse(incident) {
    logger.info(`🚨 Triggering incident response for: ${incident.id}`);
    
    // Implement response actions
    const actions = [];
    
    // Action 1: Increase monitoring frequency
    actions.push('increased_monitoring');
    
    // Action 2: Alert administrators
    actions.push('admin_alert');
    
    // Action 3: Enable additional logging
    actions.push('enhanced_logging');
    
    // Action 4: Consider rate limiting if request spike
    if (incident.details.metric === 'requests_per_minute') {
      actions.push('rate_limiting');
    }
    
    // Update incident
    incident.responseActions = actions;
    incident.respondedAt = Date.now();
    
    this.emit('incident:response', incident);
    
    logger.info(`✅ Incident response triggered: ${actions.join(', ')}`);
  }

  async storeIncident(incident) {
    await this.redis.lpush('incidents:list', JSON.stringify(incident));
    await this.redis.ltrim('incidents:list', 0, 9999);
  }

  async updateBaselines(metrics) {
    // Update baselines using exponential moving average
    const alpha = 0.1; // Smoothing factor
    
    for (const [metric, value] of Object.entries(metrics)) {
      if (metric === 'timestamp') continue;
      
      const currentBaseline = this.baselineMetrics.get(metric) || value;
      const newBaseline = currentBaseline * (1 - alpha) + value * alpha;
      
      this.baselineMetrics.set(metric, newBaseline);
    }
    
    // Save to Redis
    await this.redis.setex(
      'threat:baseline',
      86400,
      JSON.stringify(Object.fromEntries(this.baselineMetrics))
    );
  }

  /**
   * Report suspicious activity
   * @param {Object} activity - Activity details
   */
  async reportSuspiciousActivity(activity) {
    logger.info(`⚠️ Suspicious activity reported: ${activity.type}`);
    
    // Create incident
    const incident = {
      id: uuidv4(),
      type: activity.type,
      severity: activity.severity || 'medium',
      description: activity.description,
      source: activity.source,
      details: activity.details,
      createdAt: Date.now(),
      status: 'open',
    };
    
    this.incidents.set(incident.id, incident);
    this.stats.incidentsDetected++;
    
    // Emit and store
    this.emit('incident:created', incident);
    await this.storeIncident(incident);
    
    return incident;
  }

  /**
   * Resolve an incident
   * @param {string} incidentId - Incident ID
   * @param {Object} resolution - Resolution details
   */
  async resolveIncident(incidentId, resolution) {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      throw new Error(`Incident not found: ${incidentId}`);
    }
    
    incident.status = 'resolved';
    incident.resolution = resolution;
    incident.resolvedAt = Date.now();
    
    this.stats.incidentsResolved++;
    
    this.emit('incident:resolved', incident);
    
    logger.info(`✅ Incident resolved: ${incidentId}`);
    
    return incident;
  }

  /**
   * Get active incidents
   * @returns {Array} Active incidents
   */
  getActiveIncidents() {
    return Array.from(this.incidents.values())
      .filter(i => i.status === 'open')
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Get threat intelligence summary
   * @returns {Promise<Object>} Intelligence summary
   */
  async getIntelligenceSummary() {
    const recentIncidents = await this.redis.lrange('incidents:list', 0, 99);
    
    const incidents = recentIncidents.map(i => JSON.parse(i));
    
    // Calculate statistics
    const severityCounts = incidents.reduce((acc, i) => {
      acc[i.severity] = (acc[i.severity] || 0) + 1;
      return acc;
    }, {});
    
    const typeCounts = incidents.reduce((acc, i) => {
      acc[i.type] = (acc[i.type] || 0) + 1;
      return acc;
    }, {});
    
    return {
      totalIncidents: incidents.length,
      activeIncidents: this.getActiveIncidents().length,
      severityDistribution: severityCounts,
      typeDistribution: typeCounts,
      recentIncidents: incidents.slice(0, 10),
    };
  }

  getStats() {
    return {
      ...this.stats,
      isMonitoring: this.isMonitoring,
      activeIncidents: this.getActiveIncidents().length,
    };
  }

  async shutdown() {
    logger.info('🛑 Shutting down Threat Detection Service...');
    
    this.stopMonitoring();
    this.incidents.clear();
    
    if (this.redis) {
      await this.redis.quit();
    }
    
    logger.info('✅ Threat Detection Service shutdown complete');
  }
}

module.exports = ThreatDetectionService;
