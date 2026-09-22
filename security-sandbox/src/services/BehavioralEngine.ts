/**
 * Behavioral Analysis Engine
 * Advanced threat detection using behavioral patterns and ML-based analysis
 */

import { createLogger } from '../utils/logger';
import { EventEmitter } from 'events';
import { 
  BehaviorProfile, 
  ThreatIndicator, 
  RiskScore,
  AnomalyDetection 
} from '../models/types';

const logger = createLogger('BehavioralEngine');

// Risk scoring weights
const RISK_WEIGHTS = {
  syscallAnomaly: 0.25,
  networkAnomaly: 0.25,
  resourceAnomaly: 0.20,
  timeAnomaly: 0.15,
  patternMatch: 0.15
};

// Known attack signatures
const ATTACK_SIGNATURES = [
  {
    name: 'ransomware',
    patterns: ['mass-file-modification', 'encryption-activity', 'ransom-note-creation'],
    riskMultiplier: 10
  },
  {
    name: 'cryptominer',
    patterns: ['high-cpu-usage', 'mining-pool-connection', 'persistent-compute'],
    riskMultiplier: 5
  },
  {
    name: 'data-exfiltration',
    patterns: ['large-upload', 'external-connection', 'sensitive-data-access'],
    riskMultiplier: 8
  },
  {
    name: 'reverse-shell',
    patterns: ['shell-spawn', 'network-connection', 'interactive-session'],
    riskMultiplier: 10
  },
  {
    name: 'privilege-escalation',
    patterns: ['setuid-usage', 'capability-manipulation', 'suid-binary-creation'],
    riskMultiplier: 9
  },
  {
    name: 'container-escape',
    patterns: ['proc-access', 'sys-access', 'privileged-operation'],
    riskMultiplier: 10
  }
];

export class BehavioralEngine extends EventEmitter {
  private profiles: Map<string, BehaviorProfile>;
  private baselineProfiles: Map<string, BehaviorProfile>;
  private threatHistory: Map<string, ThreatIndicator[]>;
  private readonly PROFILE_WINDOW = 300000; // 5 minutes for profile building
  private readonly ANOMALY_THRESHOLD = 0.7;

  constructor() {
    super();
    this.profiles = new Map();
    this.baselineProfiles = new Map();
    this.threatHistory = new Map();
  }

  async initialize(): Promise<void> {
    logger.info('Initializing behavioral analysis engine...');
    
    // Load baseline profiles if available
    await this.loadBaselineProfiles();
    
    // Start periodic analysis
    this.startPeriodicAnalysis();
    
    logger.info('✅ Behavioral analysis engine initialized');
  }

  private async loadBaselineProfiles(): Promise<void> {
    // In production, load from persistent storage
    // For now, we'll build profiles dynamically
    logger.info('Baseline profiles will be built dynamically');
  }

  private startPeriodicAnalysis(): void {
    setInterval(() => {
      this.analyzeAllProfiles();
    }, 30000); // Every 30 seconds
  }

  createProfile(sessionId: string, metadata: {
    image: string;
    command: string[];
    user: string;
    expectedBehavior?: string;
  }): BehaviorProfile {
    const profile: BehaviorProfile = {
      sessionId,
      createdAt: Date.now(),
      metadata,
      syscallPatterns: new Map(),
      networkPatterns: new Map(),
      resourceUsage: {
        cpuHistory: [],
        memoryHistory: [],
        ioHistory: []
      },
      timeline: [],
      riskScore: 0,
      anomalies: [],
      threatIndicators: []
    };

    this.profiles.set(sessionId, profile);
    logger.info(`✅ Behavior profile created for session ${sessionId}`);
    
    return profile;
  }

  recordSyscall(sessionId: string, syscall: string, args: string[]): void {
    const profile = this.profiles.get(sessionId);
    if (!profile) return;

    const key = `${syscall}:${args.length}`;
    const current = profile.syscallPatterns.get(key) || 0;
    profile.syscallPatterns.set(key, current + 1);

    // Record in timeline
    profile.timeline.push({
      timestamp: Date.now(),
      type: 'syscall',
      data: { syscall, args }
    });

    // Trim timeline if too long
    if (profile.timeline.length > 10000) {
      profile.timeline = profile.timeline.slice(-5000);
    }

    // Real-time analysis
    this.analyzeSyscallPattern(sessionId, syscall, args);
  }

  recordNetworkActivity(sessionId: string, event: {
    dstIp: string;
    dstPort: number;
    bytes: number;
    direction: 'in' | 'out';
  }): void {
    const profile = this.profiles.get(sessionId);
    if (!profile) return;

    const key = `${event.dstIp}:${event.dstPort}`;
    const current = profile.networkPatterns.get(key) || { count: 0, bytes: 0 };
    profile.networkPatterns.set(key, {
      count: current.count + 1,
      bytes: current.bytes + event.bytes
    });

    // Record in timeline
    profile.timeline.push({
      timestamp: Date.now(),
      type: 'network',
      data: event
    });

    // Real-time analysis
    this.analyzeNetworkPattern(sessionId, event);
  }

  recordResourceUsage(sessionId: string, metrics: {
    cpu: number;
    memory: number;
    ioRead?: number;
    ioWrite?: number;
  }): void {
    const profile = this.profiles.get(sessionId);
    if (!profile) return;

    profile.resourceUsage.cpuHistory.push({
      timestamp: Date.now(),
      value: metrics.cpu
    });

    profile.resourceUsage.memoryHistory.push({
      timestamp: Date.now(),
      value: metrics.memory
    });

    if (metrics.ioRead !== undefined) {
      profile.resourceUsage.ioHistory.push({
        timestamp: Date.now(),
        read: metrics.ioRead,
        write: metrics.ioWrite || 0
      });
    }

    // Keep only recent history
    const cutoff = Date.now() - this.PROFILE_WINDOW;
    profile.resourceUsage.cpuHistory = profile.resourceUsage.cpuHistory.filter(
      h => h.timestamp > cutoff
    );
    profile.resourceUsage.memoryHistory = profile.resourceUsage.memoryHistory.filter(
      h => h.timestamp > cutoff
    );
    profile.resourceUsage.ioHistory = profile.resourceUsage.ioHistory.filter(
      h => h.timestamp > cutoff
    );

    // Analyze resource pattern
    this.analyzeResourcePattern(sessionId, metrics);
  }

  private analyzeSyscallPattern(sessionId: string, syscall: string, args: string[]): void {
    const profile = this.profiles.get(sessionId);
    if (!profile) return;

    // Check for suspicious syscall sequences
    const recentSyscalls = profile.timeline
      .filter(t => t.type === 'syscall')
      .slice(-10)
      .map(t => t.data.syscall);

    // Pattern: Rapid file operations (ransomware indicator)
    const fileOps = ['openat', 'read', 'write', 'close'];
    const recentFileOps = recentSyscalls.filter(s => fileOps.includes(s));
    if (recentFileOps.length > 20) {
      this.addThreatIndicator(sessionId, {
        type: 'suspicious-file-activity',
        severity: 'high',
        description: 'Rapid file operations detected',
        evidence: { recentFileOps },
        timestamp: Date.now()
      });
    }

    // Pattern: Process injection attempt
    if (syscall === 'ptrace' || syscall === 'process_vm_writev') {
      this.addThreatIndicator(sessionId, {
        type: 'process-injection',
        severity: 'critical',
        description: 'Process memory manipulation detected',
        evidence: { syscall, args },
        timestamp: Date.now()
      });
    }

    // Pattern: Privilege escalation
    const privSyscalls = ['setuid', 'setgid', 'setreuid', 'setregid'];
    if (privSyscalls.includes(syscall)) {
      this.addThreatIndicator(sessionId, {
        type: 'privilege-escalation-attempt',
        severity: 'critical',
        description: 'Privilege change syscall detected',
        evidence: { syscall, args },
        timestamp: Date.now()
      });
    }
  }

  private analyzeNetworkPattern(sessionId: string, event: {
    dstIp: string;
    dstPort: number;
    bytes: number;
    direction: 'in' | 'out';
  }): void {
    const profile = this.profiles.get(sessionId);
    if (!profile) return;

    // Check for data exfiltration
    const totalOutbound = Array.from(profile.networkPatterns.values())
      .reduce((sum, p) => sum + p.bytes, 0);

    if (totalOutbound > 100 * 1024 * 1024) { // 100MB
      this.addThreatIndicator(sessionId, {
        type: 'large-data-transfer',
        severity: 'high',
        description: 'Large outbound data transfer detected',
        evidence: { totalOutbound, recentEvent: event },
        timestamp: Date.now()
      });
    }

    // Check for suspicious ports
    const suspiciousPorts = [4444, 5555, 6666, 7777, 8888, 9999, 31337];
    if (suspiciousPorts.includes(event.dstPort)) {
      this.addThreatIndicator(sessionId, {
        type: 'suspicious-port-connection',
        severity: 'critical',
        description: `Connection to suspicious port ${event.dstPort}`,
        evidence: { event },
        timestamp: Date.now()
      });
    }
  }

  private analyzeResourcePattern(sessionId: string, metrics: {
    cpu: number;
    memory: number;
    ioRead?: number;
    ioWrite?: number;
  }): void {
    const profile = this.profiles.get(sessionId);
    if (!profile) return;

    // Check for cryptominer-like behavior
    const avgCpu = profile.resourceUsage.cpuHistory
      .slice(-10)
      .reduce((sum, h) => sum + h.value, 0) / 10;

    if (avgCpu > 80) {
      this.addThreatIndicator(sessionId, {
        type: 'high-cpu-usage',
        severity: 'medium',
        description: 'Sustained high CPU usage detected',
        evidence: { avgCpu },
        timestamp: Date.now()
      });
    }

    // Check for memory exhaustion attempt
    if (metrics.memory > 90) {
      this.addThreatIndicator(sessionId, {
        type: 'memory-exhaustion',
        severity: 'high',
        description: 'High memory usage detected',
        evidence: { memoryUsage: metrics.memory },
        timestamp: Date.now()
      });
    }
  }

  private addThreatIndicator(sessionId: string, indicator: ThreatIndicator): void {
    const profile = this.profiles.get(sessionId);
    if (!profile) return;

    profile.threatIndicators.push(indicator);

    // Update risk score
    this.updateRiskScore(sessionId);

    // Emit threat event
    this.emit('threat:detected', {
      sessionId,
      indicator,
      riskScore: profile.riskScore
    });

    // Check if we need to take action
    if (profile.riskScore > 80) {
      this.emit('action:required', {
        sessionId,
        action: 'terminate',
        reason: 'Critical risk score exceeded',
        riskScore: profile.riskScore
      });
    }
  }

  private updateRiskScore(sessionId: string): void {
    const profile = this.profiles.get(sessionId);
    if (!profile) return;

    let score = 0;

    // Calculate based on threat indicators
    for (const indicator of profile.threatIndicators) {
      const severityWeights = {
        critical: 25,
        high: 15,
        medium: 8,
        low: 3,
        none: 0
      };
      score += severityWeights[indicator.severity];
    }

    // Check for attack signatures
    for (const signature of ATTACK_SIGNATURES) {
      const matchCount = signature.patterns.filter(p =>
        profile.threatIndicators.some(i => i.type.includes(p))
      ).length;
      
      if (matchCount === signature.patterns.length) {
        score *= signature.riskMultiplier;
        
        this.emit('signature:matched', {
          sessionId,
          signature: signature.name,
          confidence: matchCount / signature.patterns.length
        });
      }
    }

    // Cap at 100
    profile.riskScore = Math.min(100, score);
  }

  private analyzeAllProfiles(): void {
    for (const [sessionId, profile] of this.profiles) {
      this.detectAnomalies(sessionId);
    }
  }

  private detectAnomalies(sessionId: string): void {
    const profile = this.profiles.get(sessionId);
    if (!profile) return;

    // Need enough data for anomaly detection
    if (profile.timeline.length < 100) return;

    const anomalies: AnomalyDetection[] = [];

    // Time-based anomaly: Activity outside expected hours
    const hour = new Date().getHours();
    if (hour < 6 || hour > 22) {
      anomalies.push({
        type: 'time-anomaly',
        description: 'Activity during off-hours',
        confidence: 0.6,
        severity: 'low'
      });
    }

    // Syscall frequency anomaly
    const syscallRate = profile.timeline.filter(
      t => t.type === 'syscall' && Date.now() - t.timestamp < 60000
    ).length;
    
    if (syscallRate > 1000) {
      anomalies.push({
        type: 'syscall-frequency-anomaly',
        description: 'Unusually high syscall rate',
        confidence: Math.min(1, syscallRate / 2000),
        severity: syscallRate > 5000 ? 'high' : 'medium'
      });
    }

    // Network anomaly
    const uniqueConnections = profile.networkPatterns.size;
    if (uniqueConnections > 50) {
      anomalies.push({
        type: 'network-anomaly',
        description: 'Large number of unique connections',
        confidence: Math.min(1, uniqueConnections / 100),
        severity: 'medium'
      });
    }

    // Update profile
    profile.anomalies = anomalies;

    // Emit anomalies
    for (const anomaly of anomalies) {
      this.emit('anomaly:detected', {
        sessionId,
        anomaly
      });
    }
  }

  getRiskAssessment(sessionId: string): RiskScore {
    const profile = this.profiles.get(sessionId);
    if (!profile) {
      return {
        score: 0,
        level: 'unknown',
        factors: [],
        recommendations: []
      };
    }

    const level = this.getRiskLevel(profile.riskScore);
    
    return {
      score: profile.riskScore,
      level,
      factors: profile.threatIndicators.map(i => ({
        type: i.type,
        severity: i.severity,
        timestamp: i.timestamp
      })),
      recommendations: this.generateRecommendations(profile)
    };
  }

  private getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
    if (score < 20) return 'low';
    if (score < 50) return 'medium';
    if (score < 80) return 'high';
    return 'critical';
  }

  private generateRecommendations(profile: BehaviorProfile): string[] {
    const recommendations: string[] = [];

    if (profile.riskScore > 80) {
      recommendations.push('IMMEDIATE: Terminate sandbox session');
      recommendations.push('Investigate all threat indicators');
    } else if (profile.riskScore > 50) {
      recommendations.push('Increase monitoring frequency');
      recommendations.push('Review network connections');
    }

    const hasFileAnomalies = profile.threatIndicators.some(
      i => i.type.includes('file')
    );
    if (hasFileAnomalies) {
      recommendations.push('Audit file system changes');
    }

    const hasNetworkAnomalies = profile.threatIndicators.some(
      i => i.type.includes('network') || i.type.includes('connection')
    );
    if (hasNetworkAnomalies) {
      recommendations.push('Review network traffic logs');
      recommendations.push('Check for data exfiltration');
    }

    return recommendations;
  }

  getProfile(sessionId: string): BehaviorProfile | undefined {
    return this.profiles.get(sessionId);
  }

  removeProfile(sessionId: string): void {
    this.profiles.delete(sessionId);
    this.threatHistory.delete(sessionId);
    logger.info(`✅ Behavior profile removed for session ${sessionId}`);
  }

  getAllProfiles(): BehaviorProfile[] {
    return Array.from(this.profiles.values());
  }

  async cleanup(): Promise<void> {
    logger.info('Cleaning up behavioral engine...');
    this.profiles.clear();
    this.baselineProfiles.clear();
    this.threatHistory.clear();
    logger.info('✅ Behavioral engine cleanup complete');
  }
}
