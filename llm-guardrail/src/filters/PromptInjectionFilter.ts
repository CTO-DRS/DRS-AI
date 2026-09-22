/**
 * Prompt Injection Filter
 * Detects and prevents prompt injection attacks
 */

import { createLogger } from '../utils/logger';
import { FilterResult, InjectionPattern, SecurityPolicy } from '../models/types';
import nlp from 'compromise';

const logger = createLogger('PromptInjectionFilter');

// Known prompt injection patterns
const INJECTION_PATTERNS: InjectionPattern[] = [
  // Direct instruction override
  {
    name: 'instruction_override',
    pattern: /ignore\s+(?:previous|above|prior)\s+instructions?/i,
    severity: 'critical',
    description: 'Attempt to override system instructions'
  },
  {
    name: 'system_prompt_leak',
    pattern: /(?:repeat|print|output|show)\s+(?:your|the)\s+(?:system|initial|original)\s+(?:prompt|instructions?)/i,
    severity: 'high',
    description: 'Attempt to extract system prompt'
  },
  {
    name: 'role_play_escape',
    pattern: /(?:let's|we\s+are|pretend\s+we\s+are)\s+(?:now|going\s+to\s+be)/i,
    severity: 'medium',
    description: 'Role-play escape attempt'
  },
  // Delimiter attacks
  {
    name: 'delimiter_injection',
    pattern: /[\[\]{}<>\"'`]{3,}/,
    severity: 'high',
    description: 'Potential delimiter injection'
  },
  {
    name: 'xml_tag_injection',
    pattern: /<\/?(?:system|user|assistant|instruction)[^>]*>/i,
    severity: 'critical',
    description: 'XML tag injection attempt'
  },
  // Context manipulation
  {
    name: 'context_reset',
    pattern: /(?:forget|clear|reset)\s+(?:everything|all|context|conversation)/i,
    severity: 'medium',
    description: 'Context reset attempt'
  },
  {
    name: 'new_conversation',
    pattern: /(?:start|begin)\s+(?:a\s+)?new\s+(?:conversation|chat|session)/i,
    severity: 'low',
    description: 'New conversation request'
  },
  // Jailbreak patterns
  {
    name: 'dan_jailbreak',
    pattern: /(?:do\s+anything\s+now|dan|jailbreak|d(?:any|an)\s+mode)/i,
    severity: 'critical',
    description: 'DAN jailbreak attempt'
  },
  {
    name: 'developer_mode',
    pattern: /developer\s*mode|debug\s*mode|admin\s*mode/i,
    severity: 'high',
    description: 'Developer mode activation attempt'
  },
  {
    name: 'hypothetical_bypass',
    pattern: /(?:hypothetically|theoretically|imagine|pretend)\s+(?:if|that|you\s+could)/i,
    severity: 'medium',
    description: 'Hypothetical scenario bypass'
  },
  // Encoding attacks
  {
    name: 'base64_encoding',
    pattern: /[A-Za-z0-9+/]{50,}={0,2}/,
    severity: 'medium',
    description: 'Potential base64 encoded payload'
  },
  {
    name: 'unicode_escape',
    pattern: /\\u[0-9a-fA-F]{4}|\\x[0-9a-fA-F]{2}/,
    severity: 'medium',
    description: 'Unicode escape sequence'
  },
  // Prompt leaking
  {
    name: 'prompt_leak_request',
    pattern: /(?:what|tell\s+me)\s+(?:are|is)\s+(?:your|the)\s+(?:instructions?|rules?|guidelines?)/i,
    severity: 'high',
    description: 'Prompt leak request'
  },
  {
    name: 'meta_request',
    pattern: /(?:how|what)\s+(?:do|would|should)\s+you\s+(?:respond|reply|answer)/i,
    severity: 'low',
    description: 'Meta request about responses'
  },
  // Obfuscation
  {
    name: 'zero_width_chars',
    pattern: /[\u200B-\u200D\uFEFF]/,
    severity: 'high',
    description: 'Zero-width character obfuscation'
  },
  {
    name: 'homoglyph_attack',
    pattern: /[а-яА-Я]/, // Cyrillic characters that look like Latin
    severity: 'medium',
    description: 'Potential homoglyph attack'
  },
  // Multi-language injection
  {
    name: 'mixed_language',
    pattern: /[\u0600-\u06FF\u0750-\u077F]/, // Arabic
    severity: 'low',
    description: 'Mixed language content'
  },
  // Code injection
  {
    name: 'code_injection',
    pattern: /```[\s\S]*?```|`[^`]+`/,
    severity: 'low',
    description: 'Code block present'
  },
  {
    name: 'markdown_link',
    pattern: /\[([^\]]+)\]\(([^)]+)\)/,
    severity: 'low',
    description: 'Markdown link'
  },
  // Social engineering
  {
    name: 'authority_claim',
    pattern: /(?:i\s+am|this\s+is)\s+(?:the\s+)?(?:admin|administrator|owner|creator|developer)/i,
    severity: 'high',
    description: 'False authority claim'
  },
  {
    name: 'urgency_pressure',
    pattern: /(?:urgent|emergency|critical|asap|immediately|hurry)/i,
    severity: 'low',
    description: 'Urgency pressure'
  },
  // Confusion attacks
  {
    name: 'conflicting_instructions',
    pattern: /(?:but\s+also|however|although|though|yet)\s+(?:ignore|disregard|forget)/i,
    severity: 'medium',
    description: 'Conflicting instructions'
  },
  // Token manipulation
  {
    name: 'token_overflow',
    pattern: /.{10000,}/,
    severity: 'medium',
    description: 'Potential token overflow attack'
  },
  {
    name: 'repetition_attack',
    pattern: /(\b\w+\b)(?:\s+\1){10,}/i,
    severity: 'medium',
    description: 'Repetition attack'
  }
];

// Context analysis patterns
const CONTEXT_PATTERNS = {
  // Suspicious context switches
  contextSwitch: /(?:switching\s+(?:to|context)|now\s+(?:acting\s+as|you\s+are))/i,
  
  // Persona adoption
  personaAdoption: /(?:you\s+are\s+now|from\s+now\s+on\s+you\s+are|act\s+as\s+(?:if\s+)?you\s+are)/i,
  
  // Boundary testing
  boundaryTest: /(?:test|testing)\s+(?:your|the)\s+(?:limits?|boundaries?|restrictions?)/i,
  
  // Capability probing
  capabilityProbe: /(?:what\s+can\s+you\s+do|what\s+are\s+you\s+capable\s+of|show\s+me\s+your)/i
};

export class PromptInjectionFilter {
  private patterns: InjectionPattern[];
  private policy: SecurityPolicy;

  constructor() {
    this.patterns = INJECTION_PATTERNS;
    this.policy = {
      blockLevel: 'medium', // Block medium and above
      logAll: true,
      alertOnCritical: true
    };
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Prompt Injection Filter...');
    
    // Load additional patterns from configuration if available
    const customPatterns = this.loadCustomPatterns();
    this.patterns = [...this.patterns, ...customPatterns];
    
    logger.info(`✅ Loaded ${this.patterns.length} injection patterns`);
  }

  private loadCustomPatterns(): InjectionPattern[] {
    try {
      const configPath = process.env.GUARDRAIL_CONFIG_PATH;
      if (configPath) {
        const fs = require('fs');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return config.injectionPatterns || [];
      }
    } catch (error) {
      logger.warn('Failed to load custom patterns:', error);
    }
    return [];
  }

  async analyze(prompt: string, context?: {
    userId?: string;
    sessionId?: string;
    previousPrompts?: string[];
  }): Promise<FilterResult> {
    const startTime = Date.now();
    const findings: Array<{
      pattern: string;
      severity: string;
      description: string;
      match?: string;
    }> = [];

    // Layer 1: Pattern matching
    const patternMatches = this.detectPatterns(prompt);
    findings.push(...patternMatches);

    // Layer 2: Semantic analysis
    const semanticIssues = this.analyzeSemantics(prompt);
    findings.push(...semanticIssues);

    // Layer 3: Context analysis
    const contextIssues = this.analyzeContext(prompt, context);
    findings.push(...contextIssues);

    // Layer 4: Structural analysis
    const structuralIssues = this.analyzeStructure(prompt);
    findings.push(...structuralIssues);

    // Calculate risk score
    const riskScore = this.calculateRiskScore(findings);
    
    // Determine action
    const action = this.determineAction(riskScore, findings);

    // Sanitize if needed
    let sanitized = prompt;
    if (action === 'sanitize') {
      sanitized = this.sanitizePrompt(prompt, findings);
    }

    const result: FilterResult = {
      allowed: action !== 'block',
      action,
      riskScore,
      findings: findings.map(f => ({
        type: f.pattern,
        severity: f.severity as any,
        message: f.description,
        match: f.match
      })),
      sanitized: action === 'sanitize' ? sanitized : undefined,
      metadata: {
        processingTime: Date.now() - startTime,
        patternsChecked: this.patterns.length,
        timestamp: Date.now()
      }
    };

    // Log if needed
    if (this.policy.logAll || result.findings.length > 0) {
      this.logAnalysis(prompt, result, context);
    }

    return result;
  }

  private detectPatterns(prompt: string): Array<{
    pattern: string;
    severity: string;
    description: string;
    match?: string;
  }> {
    const findings: Array<{
      pattern: string;
      severity: string;
      description: string;
      match?: string;
    }> = [];

    for (const injectionPattern of this.patterns) {
      const matches = prompt.match(injectionPattern.pattern);
      if (matches) {
        findings.push({
          pattern: injectionPattern.name,
          severity: injectionPattern.severity,
          description: injectionPattern.description,
          match: matches[0].substring(0, 100) // Truncate long matches
        });
      }
    }

    return findings;
  }

  private analyzeSemantics(prompt: string): Array<{
    pattern: string;
    severity: string;
    description: string;
  }> {
    const findings: Array<{
      pattern: string;
      severity: string;
      description: string;
    }> = [];

    try {
      const doc = nlp(prompt);
      
      // Check for imperative mood with sensitive verbs
      const sensitiveVerbs = ['ignore', 'disregard', 'forget', 'bypass', 'override'];
      const verbs = doc.verbs().out('array');
      
      for (const verb of verbs) {
        if (sensitiveVerbs.some(sv => verb.toLowerCase().includes(sv))) {
          findings.push({
            pattern: 'sensitive_verb_usage',
            severity: 'medium',
            description: `Sensitive verb detected: ${verb}`
          });
        }
      }

      // Check for negation patterns
      const negations = doc.match('#Negative').out('array');
      if (negations.length > 3) {
        findings.push({
          pattern: 'excessive_negation',
          severity: 'low',
          description: 'Excessive negation detected'
        });
      }

      // Check for question complexity
      const questions = doc.questions().out('array');
      if (questions.length > 5) {
        findings.push({
          pattern: 'multi_question_attack',
          severity: 'low',
          description: 'Multiple questions may indicate attack'
        });
      }

    } catch (error) {
      logger.warn('Semantic analysis failed:', error);
    }

    return findings;
  }

  private analyzeContext(
    prompt: string,
    context?: { previousPrompts?: string[] }
  ): Array<{
    pattern: string;
    severity: string;
    description: string;
  }> {
    const findings: Array<{
      pattern: string;
      severity: string;
      description: string;
    }> = [];

    // Check for context switch attempts
    if (CONTEXT_PATTERNS.contextSwitch.test(prompt)) {
      findings.push({
        pattern: 'context_switch_attempt',
        severity: 'high',
        description: 'Attempt to switch conversation context'
      });
    }

    // Check for persona adoption
    if (CONTEXT_PATTERNS.personaAdoption.test(prompt)) {
      findings.push({
        pattern: 'persona_adoption',
        severity: 'medium',
        description: 'Attempt to adopt different persona'
      });
    }

    // Check for boundary testing
    if (CONTEXT_PATTERNS.boundaryTest.test(prompt)) {
      findings.push({
        pattern: 'boundary_testing',
        severity: 'medium',
        description: 'Boundary testing behavior detected'
      });
    }

    // Check for capability probing
    if (CONTEXT_PATTERNS.capabilityProbe.test(prompt)) {
      findings.push({
        pattern: 'capability_probing',
        severity: 'low',
        description: 'Capability probing detected'
      });
    }

    // Analyze conversation drift if we have previous prompts
    if (context?.previousPrompts && context.previousPrompts.length > 0) {
      const drift = this.calculateConversationDrift(prompt, context.previousPrompts);
      if (drift > 0.8) {
        findings.push({
          pattern: 'rapid_topic_drift',
          severity: 'medium',
          description: 'Rapid topic drift detected'
        });
      }
    }

    return findings;
  }

  private analyzeStructure(prompt: string): Array<{
    pattern: string;
    severity: string;
    description: string;
  }> {
    const findings: Array<{
      pattern: string;
      severity: string;
      description: string;
    }> = [];

    // Check for excessive length
    if (prompt.length > 10000) {
      findings.push({
        pattern: 'excessive_length',
        severity: 'low',
        description: 'Prompt exceeds recommended length'
      });
    }

    // Check for unusual character distribution
    const specialChars = prompt.match(/[^\w\s]/g);
    if (specialChars && specialChars.length / prompt.length > 0.3) {
      findings.push({
        pattern: 'high_special_char_ratio',
        severity: 'medium',
        description: 'Unusual special character ratio'
      });
    }

    // Check for repeated phrases
    const words = prompt.toLowerCase().split(/\s+/);
    const uniqueWords = new Set(words);
    if (uniqueWords.size / words.length < 0.3) {
      findings.push({
        pattern: 'low_lexical_diversity',
        severity: 'low',
        description: 'Low lexical diversity - possible repetition attack'
      });
    }

    // Check for excessive newlines
    const newlines = prompt.match(/\n/g);
    if (newlines && newlines.length > 50) {
      findings.push({
        pattern: 'excessive_newlines',
        severity: 'low',
        description: 'Excessive newlines - possible formatting attack'
      });
    }

    return findings;
  }

  private calculateConversationDrift(current: string, previous: string[]): number {
    // Simple similarity calculation
    const currentWords = new Set(current.toLowerCase().split(/\s+/));
    const previousText = previous.join(' ').toLowerCase();
    const previousWords = new Set(previousText.split(/\s+/));
    
    const intersection = new Set([...currentWords].filter(x => previousWords.has(x)));
    const union = new Set([...currentWords, ...previousWords]);
    
    return 1 - (intersection.size / union.size);
  }

  private calculateRiskScore(findings: Array<{ severity: string }>): number {
    const weights = {
      critical: 25,
      high: 15,
      medium: 8,
      low: 3,
      none: 0
    };

    let score = 0;
    for (const finding of findings) {
      score += weights[finding.severity as keyof typeof weights] || 0;
    }

    // Apply multiplier for multiple findings
    if (findings.length > 3) {
      score *= 1.2;
    }

    return Math.min(100, score);
  }

  private determineAction(
    riskScore: number,
    findings: Array<{ severity: string }>
  ): 'allow' | 'sanitize' | 'block' {
    const hasCritical = findings.some(f => f.severity === 'critical');
    const hasHigh = findings.some(f => f.severity === 'high');

    if (hasCritical || riskScore >= 80) {
      return 'block';
    }

    if (hasHigh || riskScore >= 50) {
      return 'sanitize';
    }

    return 'allow';
  }

  private sanitizePrompt(prompt: string, findings: Array<{ pattern: string }>): string {
    let sanitized = prompt;

    // Remove or neutralize detected patterns
    for (const finding of findings) {
      switch (finding.pattern) {
        case 'delimiter_injection':
          sanitized = sanitized.replace(/[\[\]{}<>\"'`]{3,}/g, '');
          break;
        case 'xml_tag_injection':
          sanitized = sanitized.replace(/<\/?[^>]+>/g, '');
          break;
        case 'zero_width_chars':
          sanitized = sanitized.replace(/[\u200B-\u200D\uFEFF]/g, '');
          break;
        case 'base64_encoding':
          // Don't remove, but mark for review
          sanitized = `[BASE64_CONTENT_DETECTED] ${sanitized}`;
          break;
      }
    }

    // Add warning prefix
    return `[FILTERED] ${sanitized}`;
  }

  private logAnalysis(
    prompt: string,
    result: FilterResult,
    context?: { userId?: string; sessionId?: string }
  ): void {
    const logData = {
      userId: context?.userId,
      sessionId: context?.sessionId,
      promptLength: prompt.length,
      riskScore: result.riskScore,
      action: result.action,
      findingsCount: result.findings.length,
      findings: result.findings.map(f => ({
        type: f.type,
        severity: f.severity
      })),
      timestamp: Date.now()
    };

    if (result.action === 'block') {
      logger.warn('Prompt blocked:', logData);
    } else if (result.findings.length > 0) {
      logger.info('Prompt analyzed:', logData);
    }
  }

  updatePolicy(policy: Partial<SecurityPolicy>): void {
    this.policy = { ...this.policy, ...policy };
    logger.info('Security policy updated:', this.policy);
  }

  addPattern(pattern: InjectionPattern): void {
    this.patterns.push(pattern);
    logger.info(`Added custom pattern: ${pattern.name}`);
  }

  getPatterns(): InjectionPattern[] {
    return this.patterns;
  }
}
