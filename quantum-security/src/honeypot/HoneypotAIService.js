/**
 * Honeypot AI Service
 * 
 * AI-powered threat detection and deception system:
 * - Dynamic honeypot deployment
 * - Attack pattern analysis
 * - Behavioral fingerprinting
 * - Real-time threat intelligence
 * - Automated response
 * 
 * @class HoneypotAIService
 * @version 1.0.0
 */

const { EventEmitter } = require('events');
const { logger } = require('../utils/logger');
const { getRedisClient } = require('../utils/redis');
const { v4: uuidv4 } = require('uuid');
const geoip = require('geoip-lite');
const useragent = require('useragent');

class HoneypotAIService extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      enabled: options.enabled !== false,
      deceptionLevel: options.deceptionLevel || 'medium', // low, medium, high
      autoResponse: options.autoResponse !== false,
      threatThreshold: options.threatThreshold || 0.7,
      maxHoneypots: options.maxHoneypots || 10,
      sessionTimeout: options.sessionTimeout || 300000, // 5 minutes
      ...options,
    };
    
    this.redis = null;
    this.isInitialized = false;
    
    // Active honeypots
    this.honeypots = new Map();
    
    // Suspicious sessions
    this.sessions = new Map();
    
    // Threat patterns
    this.threatPatterns = new Map();
    
    // ML model (simplified for now)
    this.threatModel = null;
    
    // Stats
    this.stats = {
      attacksDetected: 0,
      honeypotsTriggered: 0,
      sessionsTracked: 0,
      threatsBlocked: 0,
    };
  }

  async initialize() {
    try {
      logger.info('🍯 Initializing Honeypot AI Service...');
      
      // Initialize Redis
      this.redis = await getRedisClient();
      
      // Load threat patterns
      await this.loadThreatPatterns();
      
      // Initialize ML model
      await this.initializeThreatModel();
      
      // Start cleanup task
      this.startCleanupTask();
      
      this.isInitialized = true;
      logger.info('✅ Honeypot AI Service initialized');
      
    } catch (error) {
      logger.error('❌ Failed to initialize Honeypot AI:', error);
      throw error;
    }
  }

  async loadThreatPatterns() {
    // Load known attack patterns
    this.threatPatterns.set('sql_injection', {
      name: 'SQL Injection',
      patterns: [
        /(\%27)|(\')|(\-\-)|(\%23)|(#)/i,
        /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/i,
        /\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/i,
        /((\%27)|(\'))union/i,
        /exec(\s|\+)+(s|x)p\w+/i,
        /UNION\s+SELECT/i,
        /INSERT\s+INTO/i,
        /DELETE\s+FROM/i,
        /DROP\s+TABLE/i,
      ],
      severity: 'high',
    });
    
    this.threatPatterns.set('xss', {
      name: 'Cross-Site Scripting (XSS)',
      patterns: [
        /((\%3C)|<)((\%2F)|\/)*[a-z0-9\%]+((\%3E)|>)/i,
        /((\%3C)|<)((\%69)|i|(\%49))((\%6D)|m|(\%4D))((\%67)|g|(\%47))[^\n]+((\%3E)|>)/i,
        /<script[^>]*>[\s\S]*?<\/script>/i,
        /javascript:/i,
        /on\w+\s*=/i,
        /<iframe/i,
        /<object/i,
        /<embed/i,
      ],
      severity: 'high',
    });
    
    this.threatPatterns.set('path_traversal', {
      name: 'Path Traversal',
      patterns: [
        /\.\.\//,
        /\.\.\\/,
        /%2e%2e%2f/i,
        /%252e%252e%252f/i,
        /\.\.\/%2f/i,
        /%2e%2e\//i,
        /\.\.\/%5c/i,
        /%252e%252e\//i,
      ],
      severity: 'medium',
    });
    
    this.threatPatterns.set('command_injection', {
      name: 'Command Injection',
      patterns: [
        /;\s*\w+/,
        /\|\s*\w+/,
        /`\s*\w+/,
        /\$\(\s*\w+/,
        /&&\s*\w+/,
        /\|\|\s*\w+/,
        /(?:^|[\s;|&`])\s*(?:cat|ls|pwd|whoami|id|uname|echo|wget|curl|nc|netcat|python|perl|ruby|bash|sh|cmd|powershell)\s/i,
      ],
      severity: 'critical',
    });
    
    this.threatPatterns.set('bot_detection', {
      name: 'Bot/Malicious User-Agent',
      patterns: [
        /sqlmap/i,
        /nikto/i,
        /nmap/i,
        /masscan/i,
        /zgrab/i,
        /gobuster/i,
        /dirbuster/i,
        /wfuzz/i,
        /burpsuite/i,
        /metasploit/i,
        /scrapy/i,
        /curl\/[\d.]+/i,
        /wget\/[\d.]+/i,
        /python-requests\/[\d.]+/i,
      ],
      severity: 'medium',
    });
    
    logger.info(`📚 Loaded ${this.threatPatterns.size} threat patterns`);
  }

  async initializeThreatModel() {
    // Initialize threat scoring model
    // In production, this would load a trained ML model
    this.threatModel = {
      weights: {
        patternMatch: 0.3,
        behaviorAnomaly: 0.25,
        requestRate: 0.2,
        geoRisk: 0.15,
        reputation: 0.1,
      },
    };
    
    logger.info('✅ Threat model initialized');
  }

  /**
   * Analyze request for threats
   * @param {Object} request - Request data
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeRequest(request) {
    try {
      const { ip, userAgent, path, query, body, headers, method } = request;
      
      // Get or create session
      const session = await this.getOrCreateSession(ip, userAgent);
      
      // Update session activity
      session.requests.push({
        timestamp: Date.now(),
        path,
        method,
        query,
        body: body ? JSON.stringify(body).slice(0, 1000) : null,
      });
      
      // Analyze patterns
      const patternAnalysis = this.analyzePatterns(request);
      
      // Analyze behavior
      const behaviorAnalysis = this.analyzeBehavior(session);
      
      // Calculate threat score
      const threatScore = this.calculateThreatScore(
        patternAnalysis,
        behaviorAnalysis,
        session
      );
      
      // Update session threat score
      session.threatScore = Math.max(session.threatScore, threatScore);
      session.lastActivity = Date.now();
      
      // Check if threat threshold exceeded
      if (threatScore >= this.config.threatThreshold) {
        await this.handleThreat(session, request, threatScore);
      }
      
      // Save session
      await this.saveSession(session);
      
      return {
        sessionId: session.id,
        threatScore,
        isThreat: threatScore >= this.config.threatThreshold,
        patterns: patternAnalysis.matches,
        recommendations: this.generateRecommendations(threatScore),
      };
      
    } catch (error) {
      logger.error('❌ Request analysis failed:', error);
      throw error;
    }
  }

  async getOrCreateSession(ip, userAgentString) {
    const sessionId = require('crypto').createHash('sha256').update(`${ip}:${userAgentString}`).digest('hex');
    
    let session = this.sessions.get(sessionId);
    
    if (!session) {
      // Parse user agent
      const agent = useragent.lookup(userAgentString);
      
      // Get geo info
      const geo = geoip.lookup(ip);
      
      session = {
        id: sessionId,
        ip,
        userAgent: userAgentString,
        browser: agent.toAgent(),
        os: agent.os.toString(),
        device: agent.device.toString(),
        geo: geo ? {
          country: geo.country,
          region: geo.region,
          city: geo.city,
          ll: geo.ll,
        } : null,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        requests: [],
        threatScore: 0,
        blocked: false,
        honeypotTriggered: false,
      };
      
      this.sessions.set(sessionId, session);
      this.stats.sessionsTracked++;
      
      logger.info(`🆕 New session: ${sessionId} (${ip})`);
    }
    
    return session;
  }

  analyzePatterns(request) {
    const matches = [];
    const textToAnalyze = [
      request.path,
      JSON.stringify(request.query),
      JSON.stringify(request.body),
      request.userAgent,
    ].join(' ');
    
    for (const [type, patternData] of this.threatPatterns) {
      for (const pattern of patternData.patterns) {
        if (pattern.test(textToAnalyze)) {
          matches.push({
            type,
            name: patternData.name,
            severity: patternData.severity,
            pattern: pattern.toString(),
          });
          break;
        }
      }
    }
    
    return {
      matches,
      matchCount: matches.length,
      severity: matches.length > 0 
        ? matches.reduce((max, m) => {
            const severities = { low: 1, medium: 2, high: 3, critical: 4 };
            return Math.max(max, severities[m.severity] || 0);
          }, 0)
        : 0,
    };
  }

  analyzeBehavior(session) {
    const now = Date.now();
    const recentRequests = session.requests.filter(r => now - r.timestamp < 60000);
    
    // Request rate
    const requestRate = recentRequests.length;
    
    // Unique paths
    const uniquePaths = new Set(session.requests.map(r => r.path)).size;
    
    // Error rate (if we had error tracking)
    const errorRate = 0;
    
    // Time-based patterns
    const hourOfDay = new Date().getHours();
    const isOffHours = hourOfDay < 6 || hourOfDay > 22;
    
    return {
      requestRate,
      uniquePaths,
      errorRate,
      isOffHours,
      sessionDuration: now - session.createdAt,
      requestCount: session.requests.length,
    };
  }

  calculateThreatScore(patternAnalysis, behaviorAnalysis, session) {
    const weights = this.threatModel.weights;
    
    // Pattern match score (0-1)
    const patternScore = Math.min(patternAnalysis.matchCount / 3, 1);
    
    // Behavior anomaly score
    let behaviorScore = 0;
    if (behaviorAnalysis.requestRate > 100) behaviorScore += 0.4;
    if (behaviorAnalysis.uniquePaths > 50) behaviorScore += 0.3;
    if (behaviorAnalysis.isOffHours) behaviorScore += 0.2;
    if (behaviorAnalysis.requestCount > 500) behaviorScore += 0.3;
    behaviorScore = Math.min(behaviorScore, 1);
    
    // Request rate score
    const rateScore = Math.min(behaviorAnalysis.requestRate / 200, 1);
    
    // Geo risk score
    let geoScore = 0;
    if (session.geo) {
      // High-risk countries (example)
      const highRiskCountries = ['CN', 'RU', 'KP', 'IR'];
      if (highRiskCountries.includes(session.geo.country)) {
        geoScore = 0.5;
      }
    }
    
    // Reputation score (check if IP is known bad)
    let reputationScore = 0;
    // Would check external threat intelligence feeds
    
    // Calculate weighted score
    const threatScore = 
      patternScore * weights.patternMatch +
      behaviorScore * weights.behaviorAnomaly +
      rateScore * weights.requestRate +
      geoScore * weights.geoRisk +
      reputationScore * weights.reputation;
    
    return Math.min(threatScore, 1);
  }

  async handleThreat(session, request, threatScore) {
    logger.warn(`🚨 THREAT DETECTED: Session ${session.id} (Score: ${threatScore.toFixed(3)})`);
    
    this.stats.attacksDetected++;
    
    // Emit threat event
    this.emit('threat:detected', {
      sessionId: session.id,
      ip: session.ip,
      threatScore,
      timestamp: Date.now(),
    });
    
    if (this.config.autoResponse) {
      // Block the IP
      await this.blockIP(session.ip, threatScore);
      session.blocked = true;
      
      // Deploy honeypot if not already triggered
      if (!session.honeypotTriggered) {
        await this.deployHoneypot(session);
        session.honeypotTriggered = true;
      }
    }
    
    // Store threat record
    await this.storeThreatRecord(session, request, threatScore);
  }

  async blockIP(ip, threatScore) {
    logger.info(`🚫 Blocking IP: ${ip} (Threat Score: ${threatScore.toFixed(3)})`);
    
    // Add to Redis blocklist
    await this.redis.setex(
      `blocklist:ip:${ip}`,
      86400, // 24 hours
      JSON.stringify({
        ip,
        threatScore,
        blockedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
      })
    );
    
    this.stats.threatsBlocked++;
    
    // Notify other services
    this.emit('ip:blocked', { ip, threatScore });
  }

  async deployHoneypot(session) {
    if (this.honeypots.size >= this.config.maxHoneypots) {
      logger.warn('⚠️ Maximum honeypots reached');
      return;
    }
    
    const honeypotId = uuidv4();
    
    logger.info(`🍯 Deploying honeypot for session: ${session.id}`);
    
    const honeypot = {
      id: honeypotId,
      sessionId: session.id,
      targetIp: session.ip,
      deployedAt: Date.now(),
      type: this.selectHoneypotType(session),
      decoyData: this.generateDecoyData(),
      triggered: false,
    };
    
    this.honeypots.set(honeypotId, honeypot);
    
    // Store in Redis
    await this.redis.setex(
      `honeypot:${honeypotId}`,
      3600,
      JSON.stringify(honeypot)
    );
    
    logger.info(`✅ Honeypot deployed: ${honeypotId}`);
  }

  selectHoneypotType(session) {
    // Select honeypot type based on attack patterns
    const types = ['fake_api', 'fake_admin', 'fake_database', 'fake_file'];
    return types[Math.floor(Math.random() * types.length)];
  }

  generateDecoyData() {
    // Generate realistic-looking fake data
    return {
      users: [
        { id: 1, username: 'admin', email: 'admin@company.com' },
        { id: 2, username: 'user1', email: 'user1@company.com' },
      ],
      secrets: [
        'fake_secret_key_12345',
        'fake_api_key_abcdef',
      ],
    };
  }

  generateRecommendations(threatScore) {
    const recommendations = [];
    
    if (threatScore >= 0.9) {
      recommendations.push('Immediate: Block IP and investigate');
      recommendations.push('Enable enhanced monitoring');
    } else if (threatScore >= 0.7) {
      recommendations.push('High: Deploy honeypot and monitor closely');
      recommendations.push('Consider rate limiting');
    } else if (threatScore >= 0.5) {
      recommendations.push('Medium: Increase logging verbosity');
      recommendations.push('Monitor for pattern escalation');
    } else if (threatScore >= 0.3) {
      recommendations.push('Low: Standard monitoring');
    }
    
    return recommendations;
  }

  async saveSession(session) {
    await this.redis.setex(
      `session:${session.id}`,
      this.config.sessionTimeout / 1000,
      JSON.stringify(session)
    );
  }

  async storeThreatRecord(session, request, threatScore) {
    const record = {
      id: uuidv4(),
      sessionId: session.id,
      ip: session.ip,
      threatScore,
      request: {
        path: request.path,
        method: request.method,
        query: request.query,
      },
      timestamp: Date.now(),
    };
    
    await this.redis.lpush('threats:records', JSON.stringify(record));
    await this.redis.ltrim('threats:records', 0, 9999);
  }

  startCleanupTask() {
    setInterval(() => {
      this.cleanup();
    }, 60000); // Every minute
  }

  cleanup() {
    const now = Date.now();
    
    // Clean up old sessions
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity > this.config.sessionTimeout) {
        this.sessions.delete(id);
      }
    }
    
    // Clean up old honeypots
    for (const [id, honeypot] of this.honeypots) {
      if (now - honeypot.deployedAt > 3600000) { // 1 hour
        this.honeypots.delete(id);
      }
    }
  }

  /**
   * Check if IP is blocked
   * @param {string} ip - IP address
   * @returns {Promise<boolean>} Is blocked
   */
  async isBlocked(ip) {
    const blocked = await this.redis.get(`blocklist:ip:${ip}`);
    return blocked !== null;
  }

  /**
   * Get threat statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeSessions: this.sessions.size,
      activeHoneypots: this.honeypots.size,
      enabled: this.config.enabled,
    };
  }

  /**
   * Get recent threats
   * @param {number} limit - Number of records
   * @returns {Promise<Array>} Threat records
   */
  async getRecentThreats(limit = 100) {
    const records = await this.redis.lrange('threats:records', 0, limit - 1);
    return records.map(r => JSON.parse(r));
  }

  async shutdown() {
    logger.info('🛑 Shutting down Honeypot AI Service...');
    
    this.sessions.clear();
    this.honeypots.clear();
    
    if (this.redis) {
      await this.redis.quit();
    }
    
    logger.info('✅ Honeypot AI Service shutdown complete');
  }
}

module.exports = HoneypotAIService;
