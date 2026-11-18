/**
 * Network Monitor Service
 * Monitors network traffic for data leakage and suspicious connections
 */

import { spawn, ChildProcess } from 'child_process';
import { createLogger } from '../utils/logger';
import { EventEmitter } from 'events';
import { NetworkEvent, ConnectionInfo, DataTransfer } from '../models/types';

const logger = createLogger('NetworkMonitor');

// Suspicious patterns for data exfiltration detection
const SUSPICIOUS_PATTERNS = [
  { pattern: /api[_-]?key[_-]?[:=]\s*['"]?[a-zA-Z0-9]{32,}['"]?/i, type: 'api-key' },
  { pattern: /password[_-]?[:=]\s*['"]?[^\s'"]{8,}['"]?/i, type: 'password' },
  { pattern: /token[_-]?[:=]\s*['"]?[a-zA-Z0-9._-]{20,}['"]?/i, type: 'token' },
  { pattern: /private[_-]?key/i, type: 'private-key' },
  { pattern: /BEGIN\s+(RSA|DSA|EC|OPENSSH)\s+PRIVATE\s+KEY/, type: 'private-key' },
  { pattern: /AKIA[0-9A-Z]{16}/, type: 'aws-key' },
  { pattern: /ghp_[a-zA-Z0-9]{36}/, type: 'github-token' },
  { pattern: /glpat-[a-zA-Z0-9\-]{20}/, type: 'gitlab-token' },
  { pattern: /sk-[a-zA-Z0-9]{48}/, type: 'openai-key' },
  { pattern: /sk_live_[a-zA-Z0-9]{24,}/, type: 'stripe-key' },
];

// Known malicious domains/IPs (simplified list)
const MALICIOUS_INDICATORS = [
  'tor2web',
  'onion',
  'pastebin',
  'termbin',
  'requestbin',
  'hookbin',
  'ngrok',
  'serveo',
  'localhost.run',
  'pagekite',
];

export class NetworkMonitor extends EventEmitter {
  private monitors: Map<string, ChildProcess>;
  private connectionLogs: Map<string, NetworkEvent[]>;
  private dataTransfers: Map<string, DataTransfer[]>;
  private readonly MAX_LOG_SIZE = 5000;

  constructor() {
    super();
    this.monitors = new Map();
    this.connectionLogs = new Map();
    this.dataTransfers = new Map();
  }

  async initialize(): Promise<void> {
    logger.info('Initializing network monitor...');
    
    // Check if tcpdump is available
    try {
      const { execSync } = require('child_process');
      execSync('which tcpdump', { stdio: 'ignore' });
      logger.info('✅ tcpdump available for network monitoring');
    } catch {
      logger.warn('⚠️ tcpdump not available, using fallback monitoring');
    }
    
    logger.info('✅ Network monitor initialized');
  }

  async monitorContainer(sessionId: string, containerId: string): Promise<void> {
    if (this.monitors.has(sessionId)) {
      logger.warn(`Already monitoring network for session ${sessionId}`);
      return;
    }

    try {
      // Get container network interface
      const { execSync } = require('child_process');
      const veth = execSync(
        `docker inspect -f '{{range .NetworkSettings.Networks}}{{.MacAddress}}{{end}}' ${containerId}`,
        { encoding: 'utf8' }
      ).trim();

      if (!veth) {
        throw new Error('Could not determine container network interface');
      }

      // Find the veth interface on host
      const vethHost = this.findVethInterface(veth);
      
      if (!vethHost) {
        logger.warn('Could not find host veth interface, using container netns');
        await this.monitorViaNetns(sessionId, containerId);
        return;
      }

      // Start tcpdump on the veth interface
      await this.startTcpdump(sessionId, vethHost);
      
    } catch (error) {
      logger.error(`Failed to monitor container ${containerId}:`, error);
      throw error;
    }
  }

  private findVethInterface(containerMac: string): string | null {
    try {
      const { execSync } = require('child_process');
      const output = execSync('ip link show', { encoding: 'utf8' });
      
      // Parse output to find veth interface
      const lines = output.split('\n');
      let currentInterface = '';
      
      for (const line of lines) {
        const interfaceMatch = line.match(/^(\d+):\s+(veth[^:@]+)/);
        if (interfaceMatch) {
          currentInterface = interfaceMatch[2];
        }
        
        if (line.includes(containerMac) && currentInterface) {
          return currentInterface;
        }
      }
      
      return null;
    } catch (error) {
      logger.error('Failed to find veth interface:', error);
      return null;
    }
  }

  private async monitorViaNetns(sessionId: string, containerId: string): Promise<void> {
    // Use nsenter to monitor inside container network namespace
    const pid = require('child_process')
      .execSync(`docker inspect -f '{{.State.Pid}}' ${containerId}`, { encoding: 'utf8' })
      .trim();

    const tcpdump = spawn('nsenter', [
      '-t', pid,
      '-n',
      'tcpdump',
      '-i', 'any',
      '-n',
      '-l',
      '-q'
    ], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    this.setupTcpdumpHandlers(sessionId, tcpdump);
  }

  private async startTcpdump(sessionId: string, interfaceName: string): Promise<void> {
    const tcpdump = spawn('tcpdump', [
      '-i', interfaceName,
      '-n',
      '-l',
      '-q',
      '-tttt',
      'not', 'port', '53', // Exclude DNS for now
      'and', 'not', 'icmp'
    ], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    this.setupTcpdumpHandlers(sessionId, tcpdump);
  }

  private setupTcpdumpHandlers(sessionId: string, tcpdump: ChildProcess): void {
    this.monitors.set(sessionId, tcpdump);
    this.connectionLogs.set(sessionId, []);
    this.dataTransfers.set(sessionId, []);

    tcpdump.stdout?.on('data', (data) => {
      this.processTcpdumpOutput(sessionId, data.toString());
    });

    tcpdump.stderr?.on('data', (data) => {
      // tcpdump outputs to stderr
      this.processTcpdumpOutput(sessionId, data.toString());
    });

    tcpdump.on('exit', (code) => {
      logger.info(`Tcpdump for session ${sessionId} exited with code ${code}`);
      this.monitors.delete(sessionId);
    });

    logger.info(`✅ Network monitoring started for session ${sessionId}`);
  }

  private processTcpdumpOutput(sessionId: string, output: string): void {
    const lines = output.split('\n');
    const logs = this.connectionLogs.get(sessionId) || [];

    for (const line of lines) {
      const event = this.parseTcpdumpLine(line);
      if (event) {
        logs.push(event);
        
        // Analyze for threats
        this.analyzeNetworkEvent(sessionId, event);
        
        // Maintain log size
        if (logs.length > this.MAX_LOG_SIZE) {
          logs.shift();
        }
      }
    }

    this.connectionLogs.set(sessionId, logs);
  }

  private parseTcpdumpLine(line: string): NetworkEvent | null {
    // Parse tcpdump output
    // Example: 2024-01-15 10:30:45.123456 IP 172.18.0.2.12345 > 93.184.216.34.80: tcp 0
    const match = line.match(
      /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+)\s+IP\s+(\S+)\s+>\s+(\S+):\s+(\w+)\s*(\d*)/
    );

    if (!match) return null;

    const [, timestamp, src, dst, protocol, length] = match;
    
    const [srcIp, srcPort] = src.split('.');
    const [dstIp, dstPort] = dst.split('.');

    return {
      timestamp: new Date(timestamp).getTime(),
      srcIp: srcIp,
      srcPort: parseInt(srcPort) || 0,
      dstIp: dstIp,
      dstPort: parseInt(dstPort) || 0,
      protocol: protocol.toLowerCase(),
      length: parseInt(length) || 0,
      threatLevel: this.classifyConnection(dstIp, parseInt(dstPort) || 0)
    };
  }

  private classifyConnection(dstIp: string, dstPort: number): 'none' | 'low' | 'medium' | 'high' | 'critical' {
    // Check for suspicious ports
    const suspiciousPorts = [4444, 5555, 6666, 7777, 8888, 9999, 31337];
    if (suspiciousPorts.includes(dstPort)) {
      return 'high';
    }

    // Check for known malicious indicators
    if (MALICIOUS_INDICATORS.some(ind => dstIp.toLowerCase().includes(ind))) {
      return 'critical';
    }

    // Check for external connections (potential data exfiltration)
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^192\.168\./,
      /^127\./,
      /^0\./
    ];
    
    const isPrivate = privateRanges.some(range => range.test(dstIp));
    if (!isPrivate) {
      return 'medium';
    }

    return 'none';
  }

  private analyzeNetworkEvent(sessionId: string, event: NetworkEvent): void {
    if (event.threatLevel === 'none') return;

    // Emit threat event
    this.emit('network:threat', {
      sessionId,
      event,
      timestamp: Date.now()
    });

    // Check for data exfiltration patterns
    this.detectExfiltration(sessionId, event);
  }

  private detectExfiltration(sessionId: string, event: NetworkEvent): void {
    const logs = this.connectionLogs.get(sessionId) || [];
    const recentLogs = logs.filter(l => 
      Date.now() - l.timestamp < 60000 // Last minute
    );

    // Pattern 1: Large data transfer
    const totalBytes = recentLogs.reduce((sum, l) => sum + l.length, 0);
    if (totalBytes > 10 * 1024 * 1024) { // 10MB in 1 minute
      this.emit('exfiltration:detected', {
        sessionId,
        type: 'large-transfer',
        severity: 'high',
        details: { totalBytes, connectionCount: recentLogs.length },
        recommendation: 'Investigate data destination and content'
      });
    }

    // Pattern 2: Multiple external connections
    const externalConnections = recentLogs.filter(l => l.threatLevel !== 'none');
    const uniqueDestinations = new Set(externalConnections.map(l => `${l.dstIp}:${l.dstPort}`));
    
    if (uniqueDestinations.size > 10) {
      this.emit('exfiltration:detected', {
        sessionId,
        type: 'scanning-behavior',
        severity: 'medium',
        details: { uniqueDestinations: Array.from(uniqueDestinations) },
        recommendation: 'Monitor for C2 communication'
      });
    }

    // Pattern 3: Connection to known bad IPs (would integrate with threat intel)
    // This is a placeholder for real threat intelligence integration
  }

  async analyzePayload(sessionId: string, payload: Buffer): Promise<{
    sensitive: boolean;
    findings: Array<{ type: string; match: string }>;
  }> {
    const findings: Array<{ type: string; match: string }> = [];
    const payloadStr = payload.toString('utf8');

    for (const { pattern, type } of SUSPICIOUS_PATTERNS) {
      const matches = payloadStr.match(pattern);
      if (matches) {
        findings.push({
          type,
          match: matches[0].substring(0, 50) // Truncate for safety
        });
      }
    }

    if (findings.length > 0) {
      this.emit('payload:sensitive', {
        sessionId,
        findings,
        timestamp: Date.now()
      });
    }

    return {
      sensitive: findings.length > 0,
      findings
    };
  }

  getConnectionLogs(sessionId: string, options: {
    limit?: number;
    threatLevel?: 'none' | 'low' | 'medium' | 'high' | 'critical';
  } = {}): NetworkEvent[] {
    let logs = this.connectionLogs.get(sessionId) || [];
    
    if (options.threatLevel) {
      logs = logs.filter(l => l.threatLevel === options.threatLevel);
    }
    
    if (options.limit) {
      logs = logs.slice(-options.limit);
    }
    
    return logs;
  }

  getNetworkSummary(sessionId: string): {
    totalConnections: number;
    externalConnections: number;
    totalBytes: number;
    topDestinations: Array<{ ip: string; port: number; count: number }>;
    threatStats: {
      critical: number;
      high: number;
      medium: number;
      low: number;
    };
  } {
    const logs = this.connectionLogs.get(sessionId) || [];
    
    // Count destinations
    const destCounts = new Map<string, { ip: string; port: number; count: number }>();
    for (const log of logs) {
      const key = `${log.dstIp}:${log.dstPort}`;
      const existing = destCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        destCounts.set(key, { ip: log.dstIp, port: log.dstPort, count: 1 });
      }
    }
    
    const topDestinations = Array.from(destCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalConnections: logs.length,
      externalConnections: logs.filter(l => l.threatLevel !== 'none').length,
      totalBytes: logs.reduce((sum, l) => sum + l.length, 0),
      topDestinations,
      threatStats: {
        critical: logs.filter(l => l.threatLevel === 'critical').length,
        high: logs.filter(l => l.threatLevel === 'high').length,
        medium: logs.filter(l => l.threatLevel === 'medium').length,
        low: logs.filter(l => l.threatLevel === 'low').length
      }
    };
  }

  async stopMonitoring(sessionId: string): Promise<void> {
    const monitor = this.monitors.get(sessionId);
    if (monitor) {
      monitor.kill('SIGTERM');
      this.monitors.delete(sessionId);
    }
    
    this.connectionLogs.delete(sessionId);
    this.dataTransfers.delete(sessionId);
    
    logger.info(`✅ Stopped network monitoring for session ${sessionId}`);
  }

  async cleanup(): Promise<void> {
    logger.info('Cleaning up network monitors...');
    
    for (const [sessionId, monitor] of this.monitors) {
      try {
        monitor.kill('SIGKILL');
        this.monitors.delete(sessionId);
      } catch (error) {
        logger.error(`Failed to cleanup network monitor ${sessionId}:`, error);
      }
    }
    
    this.connectionLogs.clear();
    this.dataTransfers.clear();
    
    logger.info('✅ Network monitor cleanup complete');
  }
}
