/**
 * DRS AI Self-Awareness Types
 */

const HealthStatus = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  CRITICAL: 'critical',
  UNKNOWN: 'unknown',
};

const ConfidenceLevel = {
  VERY_HIGH: 0.95,
  HIGH: 0.85,
  MEDIUM: 0.7,
  LOW: 0.55,
  VERY_LOW: 0.4,
};

const DecisionCategory = {
  ROUTING: 'routing',
  MODEL_SELECTION: 'model_selection',
  CONTENT_FILTERING: 'content_filtering',
  SECURITY: 'security',
  RESOURCE_ALLOCATION: 'resource_allocation',
  USER_FACING: 'user_facing',
};

const TransparencyLevel = {
  MINIMAL: 'minimal',
  STANDARD: 'standard',
  HIGH: 'high',
  MAXIMUM: 'maximum',
};

module.exports = {
  HealthStatus,
  ConfidenceLevel,
  DecisionCategory,
  TransparencyLevel,
};
