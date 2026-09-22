import CryptoJS from 'crypto-js';
import URLParse from 'url-parse';
import logger from '../utils/logger';

export interface LinkAnalysisResult {
  url: string;
  isSuspicious: boolean;
  riskScore: number;
  riskFactors: string[];
  recommendations: string[];
}

export interface FileAnalysisResult {
  fileName: string;
  hash: string;
  isSuspicious: boolean;
  riskScore: number;
  riskFactors: string[];
}

export interface LogAnalysisResult {
  threats: LogThreat[];
  summary: {
    totalEntries: number;
    threatCount: number;
    severityBreakdown: Record<string, number>;
  };
}

export interface LogThreat {
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: string;
  message: string;
  source?: string;
}

export interface PasswordAnalysisResult {
  password: string;
  score: number; // 0-4
  strength: 'very-weak' | 'weak' | 'fair' | 'good' | 'strong';
  crackTime: string;
  feedback: {
    warning?: string;
    suggestions: string[];
  };
}

export class SecurityAnalyzer {
  // Phishing detection patterns
  private suspiciousPatterns = [
    /(?:password|passwd|pwd)\s*[=:]\s*\S+/i,
    /(?:credit.?card|cc.?num|card.?num).*?\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}/i,
    /(?:ssn|social.?security).*?\d{3}[\s-]?\d{2}[\s-]?\d{4}/i,
    /\b(?:login|signin|verify|confirm|update|secure|account|banking)\b/i,
    /urgent|immediate|action required|verify now/i
  ];

  private suspiciousTLDs = [
    '.tk', '.ml', '.ga', '.cf', '.gq', // Free domains often used for phishing
    '.top', '.xyz', '.click', '.link', '.work'
  ];

  async analyzeLink(url: string): Promise<LinkAnalysisResult> {
    const result: LinkAnalysisResult = {
      url,
      isSuspicious: false,
      riskScore: 0,
      riskFactors: [],
      recommendations: []
    };

    try {
      const parsed = URLParse(url);

      // Check for IP address instead of domain
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(parsed.hostname)) {
        result.riskScore += 30;
        result.riskFactors.push('URL uses IP address instead of domain name');
      }

      // Check for suspicious TLD
      const tld = parsed.hostname.split('.').pop();
      if (tld && this.suspiciousTLDs.some(stld => parsed.hostname.endsWith(stld))) {
        result.riskScore += 20;
        result.riskFactors.push(`Suspicious TLD: .${tld}`);
      }

      // Check for URL shorteners
      const shorteners = ['bit.ly', 'tinyurl', 't.co', 'goo.gl', 'ow.ly', 'short.link'];
      if (shorteners.some(s => parsed.hostname.includes(s))) {
        result.riskScore += 15;
        result.riskFactors.push('URL uses a link shortener');
        result.recommendations.push('Expand the shortened URL before visiting');
      }

      // Check for suspicious characters
      if (/[^\x00-\x7F]/.test(url)) {
        result.riskScore += 25;
        result.riskFactors.push('URL contains non-ASCII characters (possible homograph attack)');
      }

      // Check for excessive subdomains
      const subdomainCount = parsed.hostname.split('.').length - 2;
      if (subdomainCount > 3) {
        result.riskScore += 15;
        result.riskFactors.push('Excessive number of subdomains');
      }

      // Check for HTTP instead of HTTPS
      if (parsed.protocol === 'http:') {
        result.riskScore += 10;
        result.riskFactors.push('Connection is not encrypted (HTTP)');
        result.recommendations.push('Avoid entering sensitive information on this site');
      }

      // Check for brand impersonation
      const brandDomains = [
        { brand: 'PayPal', domain: 'paypal.com' },
        { brand: 'Apple', domain: 'apple.com' },
        { brand: 'Google', domain: 'google.com' },
        { brand: 'Microsoft', domain: 'microsoft.com' },
        { brand: 'Amazon', domain: 'amazon.com' },
        { brand: 'Facebook', domain: 'facebook.com' },
        { brand: 'Bank', domain: '' }
      ];

      for (const { brand, domain } of brandDomains) {
        if (parsed.hostname.toLowerCase().includes(brand.toLowerCase()) && 
            domain && !parsed.hostname.endsWith(domain)) {
          result.riskScore += 40;
          result.riskFactors.push(`Possible ${brand} impersonation`);
          break;
        }
      }

      result.isSuspicious = result.riskScore >= 30;

      if (result.riskScore === 0) {
        result.recommendations.push('URL appears to be safe');
      } else if (result.riskScore < 30) {
        result.recommendations.push('Exercise caution when visiting this URL');
      } else {
        result.recommendations.push('Avoid visiting this URL - high risk of phishing');
      }

    } catch (error) {
      result.riskScore = 50;
      result.riskFactors.push('Invalid URL format');
      result.isSuspicious = true;
    }

    return result;
  }

  async analyzeFile(fileBuffer: Buffer, fileName: string): Promise<FileAnalysisResult> {
    const hash = CryptoJS.SHA256(fileBuffer.toString('base64')).toString();
    
    const result: FileAnalysisResult = {
      fileName,
      hash,
      isSuspicious: false,
      riskScore: 0,
      riskFactors: []
    };

    // Check file extension
    const ext = fileName.split('.').pop()?.toLowerCase();
    const dangerousExts = ['exe', 'dll', 'bat', 'cmd', 'sh', 'scr', 'vbs', 'js', 'jar'];
    
    if (ext && dangerousExts.includes(ext)) {
      result.riskScore += 40;
      result.riskFactors.push(`Executable file type: .${ext}`);
    }

    // Check for double extension
    if ((fileName.match(/\./g) || []).length > 1) {
      const parts = fileName.split('.');
      if (parts.length >= 3) {
        result.riskScore += 30;
        result.riskFactors.push('Double file extension (possible spoofing)');
      }
    }

    // Check for suspicious patterns in content
    const content = fileBuffer.toString('utf-8', 0, 10000);
    
    if (content.includes('eval(') || content.includes('exec(')) {
      result.riskScore += 25;
      result.riskFactors.push('Contains code execution functions');
    }

    if (content.includes('powershell') || content.includes('cmd.exe')) {
      result.riskScore += 35;
      result.riskFactors.push('Contains system command references');
    }

    result.isSuspicious = result.riskScore >= 40;
    return result;
  }

  async analyzeLogs(logContent: string): Promise<LogAnalysisResult> {
    const threats: LogThreat[] = [];
    const lines = logContent.split('\n');

    const threatPatterns = [
      { pattern: /authentication failure|failed password|login failed/i, type: 'Authentication Failure', severity: 'medium' as const },
      { pattern: /sql injection|union select|drop table/i, type: 'SQL Injection Attempt', severity: 'critical' as const },
      { pattern: /xss|cross.site.scripting|javascript:/i, type: 'XSS Attempt', severity: 'high' as const },
      { pattern: /directory traversal|\.\.\//i, type: 'Directory Traversal', severity: 'high' as const },
      { pattern: /remote code execution|rce|shell_exec/i, type: 'RCE Attempt', severity: 'critical' as const },
      { pattern: /brute force|multiple failed attempts/i, type: 'Brute Force Attack', severity: 'high' as const },
      { pattern: /malware|virus|trojan/i, type: 'Malware Detected', severity: 'critical' as const },
      { pattern: /unauthorized access|access denied|forbidden/i, type: 'Unauthorized Access', severity: 'medium' as const },
      { pattern: /error|exception|fatal/i, type: 'System Error', severity: 'low' as const }
    ];

    for (const line of lines) {
      for (const { pattern, type, severity } of threatPatterns) {
        if (pattern.test(line)) {
          // Extract timestamp if present
          const timestampMatch = line.match(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/);
          
          threats.push({
            timestamp: timestampMatch ? timestampMatch[0] : new Date().toISOString(),
            severity,
            type,
            message: line.substring(0, 200)
          });
          break; // Only match first pattern per line
        }
      }
    }

    const severityBreakdown: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0
    };

    for (const threat of threats) {
      severityBreakdown[threat.severity]++;
    }

    return {
      threats: threats.slice(0, 100), // Limit to 100 threats
      summary: {
        totalEntries: lines.length,
        threatCount: threats.length,
        severityBreakdown
      }
    };
  }

  analyzePassword(password: string): PasswordAnalysisResult {
    let score = 0;
    const feedback: { warning?: string; suggestions: string[] } = { suggestions: [] };

    // Length check
    if (password.length < 8) {
      feedback.suggestions.push('Use at least 8 characters');
    } else if (password.length >= 12) {
      score += 1;
    }

    // Character variety
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (hasLower && hasUpper) score += 1;
    if (hasNumber) score += 1;
    if (hasSpecial) score += 1;

    // Common patterns
    const commonPatterns = [
      /^(password|123456|qwerty|abc123|letmein|welcome|admin|login)$/i,
      /(\w)\1{2,}/, // Repeated characters
      /^(19|20)\d{2}/, // Years
      /^\d{6,}$/ // Only numbers
    ];

    for (const pattern of commonPatterns) {
      if (pattern.test(password)) {
        score = Math.max(0, score - 1);
        feedback.warning = 'Avoid common patterns and dictionary words';
        break;
      }
    }

    // Calculate crack time estimate
    const charset = (hasLower ? 26 : 0) + (hasUpper ? 26 : 0) + (hasNumber ? 10 : 0) + (hasSpecial ? 32 : 0);
    const combinations = Math.pow(charset, password.length);
    const guessesPerSecond = 10000000000; // 10 billion guesses/second (high-end cracking)
    const seconds = combinations / guessesPerSecond;

    let crackTime: string;
    if (seconds < 1) crackTime = 'Instant';
    else if (seconds < 60) crackTime = `${Math.round(seconds)} seconds`;
    else if (seconds < 3600) crackTime = `${Math.round(seconds / 60)} minutes`;
    else if (seconds < 86400) crackTime = `${Math.round(seconds / 3600)} hours`;
    else if (seconds < 31536000) crackTime = `${Math.round(seconds / 86400)} days`;
    else if (seconds < 3153600000) crackTime = `${Math.round(seconds / 31536000)} years`;
    else crackTime = 'Centuries';

    // Determine strength label
    const strengthLabels: PasswordAnalysisResult['strength'][] = ['very-weak', 'weak', 'fair', 'good', 'strong'];
    const strength = strengthLabels[score] || 'very-weak';

    if (score < 2) {
      feedback.suggestions.push('Add uppercase letters, numbers, and special characters');
    }
    if (!feedback.warning && score < 3) {
      feedback.suggestions.push('Use a longer, more complex password');
    }

    return {
      password: '*'.repeat(password.length),
      score,
      strength,
      crackTime,
      feedback
    };
  }
}

export default new SecurityAnalyzer();
