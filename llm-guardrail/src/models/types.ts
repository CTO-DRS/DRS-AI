/**
 * Type Definitions for LLM Guardrail
 */

export type ThreatLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';
export type ToxicityLevel = 'none' | 'low' | 'medium' | 'high' | 'severe';
export type FilterAction = 'allow' | 'sanitize' | 'block' | 'flag';

export interface InjectionPattern {
  name: string;
  pattern: RegExp;
  severity: ThreatLevel;
  description: string;
}

export interface SensitivePattern {
  name: string;
  pattern: RegExp;
  severity: ThreatLevel;
  category: string;
  description: string;
}

export interface ContentCategory {
  name: string;
  severity: ThreatLevel;
  description: string;
  action: string;
}

export interface FilterResult {
  allowed: boolean;
  action: FilterAction;
  riskScore: number;
  findings: Array<{
    type: string;
    severity: ThreatLevel;
    message: string;
    match?: string;
  }>;
  sanitized?: string;
  metadata: {
    processingTime: number;
    patternsChecked: number;
    timestamp: number;
  };
}

export interface OutputFilterResult {
  original: string;
  filtered: string;
  wasFiltered: boolean;
  findings: Array<{
    type: string;
    category: string;
    severity: ThreatLevel;
    message: string;
    count: number;
  }>;
  redactedSegments: Array<{
    original: string;
    replacement: string;
    reason: string;
  }>;
  metadata: {
    processingTime: number;
    patternsChecked: number;
    totalFindings: number;
    timestamp: number;
  };
}

export interface ModerationResult {
  allowed: boolean;
  action: string;
  toxicity: ToxicityLevel;
  violations: Array<{
    category: string;
    severity: ThreatLevel;
    confidence: number;
    matches: string[];
  }>;
  explanation: string;
  metadata: {
    processingTime: number;
    timestamp: number;
  };
}

export interface SecurityPolicy {
  id: string;
  name: string;
  description: string;
  version: string;
  createdAt: number;
  updatedAt: number;
  enabled: boolean;
  rules: string[];
  settings: {
    promptInjection: {
      blockLevel: ThreatLevel;
      logAll: boolean;
      alertOnCritical: boolean;
    };
    outputFiltering: {
      redactPii: boolean;
      redactSecrets: boolean;
      redactInternalUrls: boolean;
      logDetections: boolean;
    };
    contentModeration: {
      enabled: boolean;
      categories: string[];
    };
    rateLimiting: {
      enabled: boolean;
      requestsPerMinute: number;
      burstSize: number;
    };
  };
}

export interface PolicyRule {
  id: string;
  name: string;
  description: string;
  condition: {
    type: string;
    operator?: string;
    value?: any;
  };
  action: FilterAction;
  priority: number;
  enabled: boolean;
}

export interface PolicyAction {
  action: FilterAction | 'rate_limit' | 'moderate' | 'redact';
  reason: string;
  ruleId?: string;
}

export interface FilterConfig {
  redactPii: boolean;
  redactSecrets: boolean;
  redactInternalUrls: boolean;
  logDetections: boolean;
  maskCharacter: string;
  preserveLength: boolean;
}

export interface GuardrailRequest {
  prompt: string;
  userId?: string;
  sessionId?: string;
  policyId?: string;
  context?: {
    previousPrompts?: string[];
  };
}

export interface GuardrailResponse {
  allowed: boolean;
  action: FilterAction;
  riskScore: number;
  findings: Array<{
    type: string;
    severity: ThreatLevel;
    message: string;
  }>;
  sanitizedPrompt?: string;
  policyApplied: string;
}

export interface FilterRequest {
  output: string;
  options?: {
    redactPii?: boolean;
    redactSecrets?: boolean;
    redactInternalUrls?: boolean;
  };
}

export interface FilterResponse {
  filtered: string;
  wasFiltered: boolean;
  findings: Array<{
    type: string;
    category: string;
    severity: ThreatLevel;
    count: number;
  }>;
}
