/**
 * Output Filter
 * Filters LLM outputs for PII, secrets, and sensitive information
 */

import { createLogger } from '../utils/logger';
import { OutputFilterResult, SensitivePattern, FilterConfig } from '../models/types';

const logger = createLogger('OutputFilter');

// Sensitive data patterns
const SENSITIVE_PATTERNS: SensitivePattern[] = [
  // API Keys
  {
    name: 'aws_access_key',
    pattern: /AKIA[0-9A-Z]{16}/g,
    severity: 'critical',
    category: 'api_key',
    description: 'AWS Access Key ID'
  },
  {
    name: 'aws_secret_key',
    pattern: /[0-9a-zA-Z/+]{40}/g,
    severity: 'critical',
    category: 'api_key',
    description: 'AWS Secret Access Key'
  },
  {
    name: 'github_token',
    pattern: /ghp_[a-zA-Z0-9]{36}/g,
    severity: 'critical',
    category: 'api_key',
    description: 'GitHub Personal Access Token'
  },
  {
    name: 'gitlab_token',
    pattern: /glpat-[a-zA-Z0-9\-]{20}/g,
    severity: 'critical',
    category: 'api_key',
    description: 'GitLab Personal Access Token'
  },
  {
    name: 'openai_key',
    pattern: /sk-[a-zA-Z0-9]{48}/g,
    severity: 'critical',
    category: 'api_key',
    description: 'OpenAI API Key'
  },
  {
    name: 'stripe_key',
    pattern: /sk_live_[a-zA-Z0-9]{24,}/g,
    severity: 'critical',
    category: 'api_key',
    description: 'Stripe Live Secret Key'
  },
  {
    name: 'slack_token',
    pattern: /xox[baprs]-[0-9a-zA-Z]{10,48}/g,
    severity: 'critical',
    category: 'api_key',
    description: 'Slack Token'
  },
  {
    name: 'generic_api_key',
    pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?([a-zA-Z0-9_\-]{32,})['"]?/gi,
    severity: 'high',
    category: 'api_key',
    description: 'Generic API Key'
  },
  
  // Database connection strings
  {
    name: 'mongodb_uri',
    pattern: /mongodb(\+srv)?:\/\/[^\s\"]+/gi,
    severity: 'critical',
    category: 'database',
    description: 'MongoDB Connection String'
  },
  {
    name: 'postgres_uri',
    pattern: /postgresql:\/\/[^\s\"]+/gi,
    severity: 'critical',
    category: 'database',
    description: 'PostgreSQL Connection String'
  },
  {
    name: 'mysql_uri',
    pattern: /mysql:\/\/[^\s\"]+/gi,
    severity: 'critical',
    category: 'database',
    description: 'MySQL Connection String'
  },
  {
    name: 'redis_uri',
    pattern: /redis:\/\/[^\s\"]+/gi,
    severity: 'high',
    category: 'database',
    description: 'Redis Connection String'
  },
  
  // Private Keys
  {
    name: 'rsa_private_key',
    pattern: /-----BEGIN RSA PRIVATE KEY-----[\s\S]*?-----END RSA PRIVATE KEY-----/g,
    severity: 'critical',
    category: 'private_key',
    description: 'RSA Private Key'
  },
  {
    name: 'dsa_private_key',
    pattern: /-----BEGIN DSA PRIVATE KEY-----[\s\S]*?-----END DSA PRIVATE KEY-----/g,
    severity: 'critical',
    category: 'private_key',
    description: 'DSA Private Key'
  },
  {
    name: 'ec_private_key',
    pattern: /-----BEGIN EC PRIVATE KEY-----[\s\S]*?-----END EC PRIVATE KEY-----/g,
    severity: 'critical',
    category: 'private_key',
    description: 'EC Private Key'
  },
  {
    name: 'openssh_private_key',
    pattern: /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]*?-----END OPENSSH PRIVATE KEY-----/g,
    severity: 'critical',
    category: 'private_key',
    description: 'OpenSSH Private Key'
  },
  {
    name: 'pkcs8_private_key',
    pattern: /-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/g,
    severity: 'critical',
    category: 'private_key',
    description: 'PKCS#8 Private Key'
  },
  {
    name: 'pem_private_key',
    pattern: /-----BEGIN ENCRYPTED PRIVATE KEY-----[\s\S]*?-----END ENCRYPTED PRIVATE KEY-----/g,
    severity: 'critical',
    category: 'private_key',
    description: 'Encrypted Private Key'
  },
  
  // PII - Personal Information
  {
    name: 'email_address',
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    severity: 'medium',
    category: 'pii',
    description: 'Email Address'
  },
  {
    name: 'phone_number',
    pattern: /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g,
    severity: 'medium',
    category: 'pii',
    description: 'Phone Number'
  },
  {
    name: 'ssn',
    pattern: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
    severity: 'critical',
    category: 'pii',
    description: 'Social Security Number'
  },
  {
    name: 'credit_card',
    pattern: /\b(?:\d{4}[-.\s]?){3}\d{4}\b/g,
    severity: 'critical',
    category: 'pii',
    description: 'Credit Card Number'
  },
  {
    name: 'ip_address',
    pattern: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    severity: 'low',
    category: 'pii',
    description: 'IP Address'
  },
  {
    name: 'mac_address',
    pattern: /\b(?:[0-9A-Fa-f]{2}[:-]){5}(?:[0-9A-Fa-f]{2})\b/g,
    severity: 'low',
    category: 'pii',
    description: 'MAC Address'
  },
  
  // Passwords and Tokens
  {
    name: 'password_in_code',
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"]([^'"]{8,})['"]/gi,
    severity: 'high',
    category: 'credential',
    description: 'Password in Code'
  },
  {
    name: 'bearer_token',
    pattern: /Bearer\s+[a-zA-Z0-9_\-\.]+/g,
    severity: 'high',
    category: 'token',
    description: 'Bearer Token'
  },
  {
    name: 'jwt_token',
    pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
    severity: 'high',
    category: 'token',
    description: 'JWT Token'
  },
  {
    name: 'oauth_token',
    pattern: /[0-9a-f]{32,}/g,
    severity: 'high',
    category: 'token',
    description: 'OAuth Token'
  },
  
  // Cloud credentials
  {
    name: 'azure_key',
    pattern: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
    severity: 'high',
    category: 'cloud',
    description: 'Azure Key/Subscription ID'
  },
  {
    name: 'gcp_key',
    pattern: /AIza[0-9A-Za-z_-]{35}/g,
    severity: 'critical',
    category: 'cloud',
    description: 'Google Cloud API Key'
  },
  
  // Cryptocurrency
  {
    name: 'bitcoin_address',
    pattern: /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/g,
    severity: 'low',
    category: 'crypto',
    description: 'Bitcoin Address'
  },
  {
    name: 'ethereum_address',
    pattern: /\b0x[a-fA-F0-9]{40}\b/g,
    severity: 'low',
    category: 'crypto',
    description: 'Ethereum Address'
  },
  
  // Internal URLs
  {
    name: 'internal_url',
    pattern: /(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2[0-9]|3[01])\.\d{1,3}\.\d{1,3})(?::\d+)?(?:\/\S*)?/gi,
    severity: 'medium',
    category: 'internal',
    description: 'Internal Network URL'
  }
];

export class OutputFilter {
  private patterns: SensitivePattern[];
  private config: FilterConfig;

  constructor() {
    this.patterns = SENSITIVE_PATTERNS;
    this.config = {
      redactPii: true,
      redactSecrets: true,
      redactInternalUrls: true,
      logDetections: true,
      maskCharacter: '*',
      preserveLength: false
    };
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Output Filter...');
    
    // Load custom patterns
    const customPatterns = this.loadCustomPatterns();
    this.patterns = [...this.patterns, ...customPatterns];
    
    logger.info(`✅ Loaded ${this.patterns.length} sensitive patterns`);
  }

  private loadCustomPatterns(): SensitivePattern[] {
    try {
      const configPath = process.env.GUARDRAIL_CONFIG_PATH;
      if (configPath) {
        const fs = require('fs');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return config.sensitivePatterns || [];
      }
    } catch (error) {
      logger.warn('Failed to load custom patterns:', error);
    }
    return [];
  }

  async filter(
    output: string,
    options?: {
      redactPii?: boolean;
      redactSecrets?: boolean;
      redactInternalUrls?: boolean;
    }
  ): Promise<OutputFilterResult> {
    const startTime = Date.now();
    const findings: Array<{
      pattern: string;
      category: string;
      severity: string;
      description: string;
      matches: string[];
      positions: Array<{ start: number; end: number }>;
    }> = [];

    let filtered = output;
    const redactedSegments: Array<{
      original: string;
      replacement: string;
      reason: string;
    }> = [];

    // Merge options with config
    const opts = { ...this.config, ...options };

    // Check each pattern
    for (const pattern of this.patterns) {
      // Skip based on options
      if (pattern.category === 'pii' && !opts.redactPii) continue;
      if (['api_key', 'private_key', 'credential', 'token'].includes(pattern.category) && !opts.redactSecrets) continue;
      if (pattern.category === 'internal' && !opts.redactInternalUrls) continue;

      const matches: string[] = [];
      const positions: Array<{ start: number; end: number }> = [];
      
      // Reset regex lastIndex
      pattern.pattern.lastIndex = 0;
      
      let match;
      while ((match = pattern.pattern.exec(output)) !== null) {
        matches.push(match[0]);
        positions.push({
          start: match.index,
          end: match.index + match[0].length
        });
      }

      if (matches.length > 0) {
        findings.push({
          pattern: pattern.name,
          category: pattern.category,
          severity: pattern.severity,
          description: pattern.description,
          matches: matches.map(m => this.truncateMatch(m)),
          positions
        });

        // Redact matches
        for (let i = positions.length - 1; i >= 0; i--) {
          const { start, end } = positions[i];
          const original = output.substring(start, end);
          const replacement = this.redact(original, pattern.category);
          
          filtered = filtered.substring(0, start) + replacement + filtered.substring(end);
          
          redactedSegments.push({
            original: this.truncateMatch(original),
            replacement,
            reason: pattern.description
          });
        }
      }
    }

    const result: OutputFilterResult = {
      original: output,
      filtered,
      wasFiltered: findings.length > 0,
      findings: findings.map(f => ({
        type: f.pattern,
        category: f.category,
        severity: f.severity as any,
        message: f.description,
        count: f.matches.length
      })),
      redactedSegments,
      metadata: {
        processingTime: Date.now() - startTime,
        patternsChecked: this.patterns.length,
        totalFindings: findings.length,
        timestamp: Date.now()
      }
    };

    // Log if needed
    if (this.config.logDetections && findings.length > 0) {
      this.logFiltering(result);
    }

    return result;
  }

  private redact(text: string, category: string): string {
    if (category === 'private_key') {
      return '[REDACTED_PRIVATE_KEY]';
    }
    
    if (category === 'api_key') {
      return '[REDACTED_API_KEY]';
    }

    if (this.config.preserveLength) {
      return this.config.maskCharacter.repeat(text.length);
    }

    // Category-specific redaction
    const redactions: Record<string, string> = {
      pii: '[REDACTED_PII]',
      credential: '[REDACTED_CREDENTIAL]',
      token: '[REDACTED_TOKEN]',
      database: '[REDACTED_DB_URI]',
      cloud: '[REDACTED_CLOUD_KEY]',
      crypto: '[REDACTED_CRYPTO_ADDRESS]',
      internal: '[REDACTED_INTERNAL_URL]'
    };

    return redactions[category] || '[REDACTED]';
  }

  private truncateMatch(match: string, maxLength: number = 50): string {
    if (match.length <= maxLength) return match;
    return match.substring(0, maxLength) + '...';
  }

  private logFiltering(result: OutputFilterResult): void {
    const logData = {
      wasFiltered: result.wasFiltered,
      findingsCount: result.findings.length,
      findings: result.findings.map(f => ({
        type: f.type,
        category: f.category,
        severity: f.severity,
        count: f.count
      })),
      timestamp: Date.now()
    };

    if (result.findings.some(f => f.severity === 'critical')) {
      logger.warn('Critical sensitive data detected:', logData);
    } else {
      logger.info('Sensitive data filtered:', logData);
    }
  }

  async scanForSecrets(text: string): Promise<Array<{
    type: string;
    severity: string;
    match: string;
    position: { line: number; column: number };
  }>> {
    const secrets: Array<{
      type: string;
      severity: string;
      match: string;
      position: { line: number; column: number };
    }> = [];

    const lines = text.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];

      for (const pattern of this.patterns) {
        if (!['api_key', 'private_key', 'credential', 'token'].includes(pattern.category)) {
          continue;
        }

        pattern.pattern.lastIndex = 0;
        let match;

        while ((match = pattern.pattern.exec(line)) !== null) {
          secrets.push({
            type: pattern.name,
            severity: pattern.severity,
            match: this.truncateMatch(match[0]),
            position: {
              line: lineNum + 1,
              column: match.index + 1
            }
          });
        }
      }
    }

    return secrets;
  }

  updateConfig(config: Partial<FilterConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('Filter config updated:', this.config);
  }

  addPattern(pattern: SensitivePattern): void {
    this.patterns.push(pattern);
    logger.info(`Added custom sensitive pattern: ${pattern.name}`);
  }

  getPatterns(): SensitivePattern[] {
    return this.patterns;
  }

  getConfig(): FilterConfig {
    return this.config;
  }
}
