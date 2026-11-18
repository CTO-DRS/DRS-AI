/**
 * Security Scanner
 * Scans repositories and files for security issues
 */

import { createLogger } from '../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';

const logger = createLogger('SecurityScanner');

// Patterns to detect secrets
const SECRET_PATTERNS = [
  { pattern: /AKIA[0-9A-Z]{16}/, name: 'AWS Access Key' },
  { pattern: /ghp_[a-zA-Z0-9]{36}/, name: 'GitHub Token' },
  { pattern: /glpat-[a-zA-Z0-9\-]{20}/, name: 'GitLab Token' },
  { pattern: /sk-[a-zA-Z0-9]{48}/, name: 'OpenAI Key' },
  { pattern: /sk_live_[a-zA-Z0-9]{24,}/, name: 'Stripe Key' },
  { pattern: /-----BEGIN (RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----/, name: 'Private Key' },
  { pattern: /password\s*[:=]\s*['"][^'"]{8,}['"]/i, name: 'Hardcoded Password' },
  { pattern: /api[_-]?key\s*[:=]\s*['"][a-zA-Z0-9]{32,}['"]/i, name: 'API Key' }
];

// Suspicious file patterns
const SUSPICIOUS_FILES = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  'config.json',
  'secrets.json',
  'credentials.json',
  'id_rsa',
  'id_dsa',
  'id_ecdsa',
  'id_ed25519',
  '.htpasswd',
  'shadow',
  'passwd'
];

// Suspicious URLs
const SUSPICIOUS_URLS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  'file://',
  'ftp://'
];

export class SecurityScanner {
  async checkUrl(url: string): Promise<{ safe: boolean; reason?: string }> {
    // Check for suspicious URLs
    for (const suspicious of SUSPICIOUS_URLS) {
      if (url.includes(suspicious)) {
        return { safe: false, reason: `URL contains suspicious pattern: ${suspicious}` };
      }
    }

    // Check for private IP ranges
    const privateIpPattern = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/;
    if (privateIpPattern.test(url)) {
      return { safe: false, reason: 'URL points to private IP range' };
    }

    return { safe: true };
  }

  async scanFile(filePath: string): Promise<{ issues: Array<{ type: string; message: string }> }> {
    const issues: Array<{ type: string; message: string }> = [];

    try {
      const content = await fs.readFile(filePath, 'utf8');
      const filename = path.basename(filePath);

      // Check for secrets
      for (const { pattern, name } of SECRET_PATTERNS) {
        if (pattern.test(content)) {
          issues.push({
            type: 'secret',
            message: `Potential ${name} found in ${filename}`
          });
        }
      }

      // Check for suspicious file patterns
      for (const suspicious of SUSPICIOUS_FILES) {
        if (filename.toLowerCase().includes(suspicious.toLowerCase())) {
          issues.push({
            type: 'suspicious_file',
            message: `Suspicious file name: ${filename}`
          });
          break;
        }
      }

      // Check for large files (>1MB)
      const stats = await fs.stat(filePath);
      if (stats.size > 1024 * 1024) {
        issues.push({
          type: 'large_file',
          message: `Large file detected: ${filename} (${Math.round(stats.size / 1024)}KB)`
        });
      }

    } catch (error) {
      logger.warn(`Failed to scan file ${filePath}:`, error);
    }

    return { issues };
  }

  async scanRepository(repoDir: string): Promise<{
    issues: Array<{ type: string; file: string; message: string }>;
    summary: {
      totalFiles: number;
      issuesFound: number;
      secretsFound: number;
      suspiciousFiles: number;
    };
  }> {
    const allIssues: Array<{ type: string; file: string; message: string }> = [];
    let totalFiles = 0;

    async function scanDirectory(dir: string): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Skip .git directory
        if (entry.name === '.git') continue;

        if (entry.isDirectory()) {
          await scanDirectory(fullPath);
        } else if (entry.isFile()) {
          totalFiles++;
          const result = await this.scanFile(fullPath);
          
          for (const issue of result.issues) {
            allIssues.push({
              type: issue.type,
              file: path.relative(repoDir, fullPath),
              message: issue.message
            });
          }
        }
      }
    }

    await scanDirectory.call(this, repoDir);

    return {
      issues: allIssues,
      summary: {
        totalFiles,
        issuesFound: allIssues.length,
        secretsFound: allIssues.filter(i => i.type === 'secret').length,
        suspiciousFiles: allIssues.filter(i => i.type === 'suspicious_file').length
      }
    };
  }
}
