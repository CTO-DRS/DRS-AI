/**
 * Policy Engine
 * Manages and enforces security policies
 */

import { createLogger } from '../utils/logger';
import { SecurityPolicy, PolicyRule, PolicyAction } from '../models/types';

const logger = createLogger('PolicyEngine');

export class PolicyEngine {
  private policies: Map<string, SecurityPolicy>;
  private rules: Map<string, PolicyRule>;
  private defaultPolicy: SecurityPolicy;

  constructor() {
    this.policies = new Map();
    this.rules = new Map();
    this.defaultPolicy = this.createDefaultPolicy();
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Policy Engine...');
    
    // Load built-in rules
    this.loadBuiltInRules();
    
    // Load custom policies if available
    await this.loadCustomPolicies();
    
    logger.info(`✅ Loaded ${this.rules.size} rules and ${this.policies.size} policies`);
  }

  private createDefaultPolicy(): SecurityPolicy {
    return {
      id: 'default',
      name: 'Default Security Policy',
      description: 'Default security policy with balanced protection',
      version: '2.0.0',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      enabled: true,
      rules: [
        'block_critical_injections',
        'sanitize_high_risk',
        'redact_all_secrets',
        'moderate_content',
        'rate_limit_requests'
      ],
      settings: {
        promptInjection: {
          blockLevel: 'medium',
          logAll: true,
          alertOnCritical: true
        },
        outputFiltering: {
          redactPii: true,
          redactSecrets: true,
          redactInternalUrls: true,
          logDetections: true
        },
        contentModeration: {
          enabled: true,
          categories: ['hate_speech', 'violence', 'self_harm', 'dangerous']
        },
        rateLimiting: {
          enabled: true,
          requestsPerMinute: 60,
          burstSize: 10
        }
      }
    };
  }

  private loadBuiltInRules(): void {
    const builtInRules: PolicyRule[] = [
      {
        id: 'block_critical_injections',
        name: 'Block Critical Injections',
        description: 'Block all critical severity prompt injections',
        condition: {
          type: 'injection_severity',
          operator: 'equals',
          value: 'critical'
        },
        action: 'block',
        priority: 100,
        enabled: true
      },
      {
        id: 'sanitize_high_risk',
        name: 'Sanitize High Risk',
        description: 'Sanitize prompts with high risk score',
        condition: {
          type: 'risk_score',
          operator: 'greater_than',
          value: 50
        },
        action: 'sanitize',
        priority: 90,
        enabled: true
      },
      {
        id: 'redact_all_secrets',
        name: 'Redact All Secrets',
        description: 'Redact all detected secrets in output',
        condition: {
          type: 'secret_detected',
          operator: 'equals',
          value: true
        },
        action: 'redact',
        priority: 100,
        enabled: true
      },
      {
        id: 'moderate_content',
        name: 'Moderate Content',
        description: 'Apply content moderation',
        condition: {
          type: 'always'
        },
        action: 'moderate',
        priority: 80,
        enabled: true
      },
      {
        id: 'rate_limit_requests',
        name: 'Rate Limit Requests',
        description: 'Apply rate limiting to requests',
        condition: {
          type: 'rate_limit_exceeded',
          operator: 'equals',
          value: true
        },
        action: 'rate_limit',
        priority: 95,
        enabled: true
      }
    ];

    for (const rule of builtInRules) {
      this.rules.set(rule.id, rule);
    }
  }

  private async loadCustomPolicies(): Promise<void> {
    try {
      const configPath = process.env.GUARDRAIL_CONFIG_PATH;
      if (configPath) {
        const fs = require('fs');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        if (config.policies) {
          for (const policy of config.policies) {
            this.policies.set(policy.id, policy);
          }
        }
        
        if (config.rules) {
          for (const rule of config.rules) {
            this.rules.set(rule.id, rule);
          }
        }
      }
    } catch (error) {
      logger.warn('Failed to load custom policies:', error);
    }
  }

  evaluate(
    input: string,
    context: {
      userId?: string;
      sessionId?: string;
      riskScore?: number;
      findings?: Array<{ severity: string }>;
    },
    policyId?: string
  ): PolicyAction {
    const policy = policyId ? this.policies.get(policyId) : this.defaultPolicy;
    
    if (!policy || !policy.enabled) {
      return { action: 'allow', reason: 'No active policy' };
    }

    // Evaluate rules in priority order
    const sortedRules = policy.rules
      .map(ruleId => this.rules.get(ruleId))
      .filter((rule): rule is PolicyRule => rule !== undefined && rule.enabled)
      .sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      const matches = this.evaluateCondition(rule.condition, context);
      
      if (matches) {
        return {
          action: rule.action,
          reason: rule.description,
          ruleId: rule.id
        };
      }
    }

    return { action: 'allow', reason: 'No rules matched' };
  }

  private evaluateCondition(
    condition: PolicyRule['condition'],
    context: any
  ): boolean {
    switch (condition.type) {
      case 'always':
        return true;
        
      case 'injection_severity':
        return context.findings?.some(
          (f: any) => f.severity === condition.value
        ) || false;
        
      case 'risk_score':
        const score = context.riskScore || 0;
        switch (condition.operator) {
          case 'greater_than':
            return score > condition.value;
          case 'less_than':
            return score < condition.value;
          case 'equals':
            return score === condition.value;
          default:
            return false;
        }
        
      case 'secret_detected':
        return context.secretsDetected === condition.value;
        
      case 'rate_limit_exceeded':
        return context.rateLimitExceeded === condition.value;
        
      default:
        return false;
    }
  }

  getPolicy(id: string): SecurityPolicy | undefined {
    return id === 'default' ? this.defaultPolicy : this.policies.get(id);
  }

  getAllPolicies(): SecurityPolicy[] {
    return [this.defaultPolicy, ...Array.from(this.policies.values())];
  }

  createPolicy(policy: Omit<SecurityPolicy, 'id' | 'createdAt' | 'updatedAt'>): SecurityPolicy {
    const id = `policy_${Date.now()}`;
    const newPolicy: SecurityPolicy = {
      ...policy,
      id,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    this.policies.set(id, newPolicy);
    logger.info(`Created policy: ${id}`);
    
    return newPolicy;
  }

  updatePolicy(id: string, updates: Partial<SecurityPolicy>): SecurityPolicy | undefined {
    const policy = this.policies.get(id);
    if (!policy) return undefined;
    
    const updated = {
      ...policy,
      ...updates,
      updatedAt: Date.now()
    };
    
    this.policies.set(id, updated);
    logger.info(`Updated policy: ${id}`);
    
    return updated;
  }

  deletePolicy(id: string): boolean {
    const deleted = this.policies.delete(id);
    if (deleted) {
      logger.info(`Deleted policy: ${id}`);
    }
    return deleted;
  }

  getRule(id: string): PolicyRule | undefined {
    return this.rules.get(id);
  }

  createRule(rule: Omit<PolicyRule, 'id'>): PolicyRule {
    const id = `rule_${Date.now()}`;
    const newRule: PolicyRule = {
      ...rule,
      id
    };
    
    this.rules.set(id, newRule);
    logger.info(`Created rule: ${id}`);
    
    return newRule;
  }

  updateRule(id: string, updates: Partial<PolicyRule>): PolicyRule | undefined {
    const rule = this.rules.get(id);
    if (!rule) return undefined;
    
    const updated = { ...rule, ...updates };
    this.rules.set(id, updated);
    logger.info(`Updated rule: ${id}`);
    
    return updated;
  }

  deleteRule(id: string): boolean {
    const deleted = this.rules.delete(id);
    if (deleted) {
      logger.info(`Deleted rule: ${id}`);
    }
    return deleted;
  }
}
