/**
 * Type Definitions for Security Sandbox
 */

export type ThreatLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface SandboxConfig {
  image?: string;
  command?: string[];
  memoryLimit?: number;
  cpuLimit?: number;
  pidsLimit?: number;
  timeout?: number;
  readonlyRootfs?: boolean;
  capabilities?: string[];
  env?: Record<string, string>;
  workdir?: string;
}

export interface SandboxSession {
  id: string;
  containerId: string;
  containerName: string;
  config: SandboxConfig;
  createdAt: Date;
  status: 'running' | 'stopped' | 'error';
  timeout?: NodeJS.Timeout;
  metrics: SandboxMetrics;
}

export interface SandboxMetrics {
  cpuUsage: number;
  memoryUsage: number;
  networkRx: number;
  networkTx: number;
  syscalls: SyscallEvent[];
}

export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration?: number;
}

export interface SyscallEvent {
  timestamp: number;
  pid: number;
  syscall: string;
  args: string[];
  result: string;
  threatLevel: ThreatLevel;
}

export interface SyscallPattern {
  name: string;
  args?: string[];
  threatLevel: ThreatLevel;
  description: string;
}

export interface NetworkEvent {
  timestamp: number;
  srcIp: string;
  srcPort: number;
  dstIp: string;
  dstPort: number;
  protocol: string;
  length: number;
  threatLevel: ThreatLevel;
}

export interface ConnectionInfo {
  localAddress: string;
  localPort: number;
  remoteAddress: string;
  remotePort: number;
  state: string;
  processId?: number;
}

export interface DataTransfer {
  timestamp: number;
  direction: 'in' | 'out';
  bytes: number;
  destination: string;
}

export interface BehaviorProfile {
  sessionId: string;
  createdAt: number;
  metadata: {
    image: string;
    command: string[];
    user: string;
    expectedBehavior?: string;
  };
  syscallPatterns: Map<string, number>;
  networkPatterns: Map<string, { count: number; bytes: number }>;
  resourceUsage: {
    cpuHistory: Array<{ timestamp: number; value: number }>;
    memoryHistory: Array<{ timestamp: number; value: number }>;
    ioHistory: Array<{ timestamp: number; read: number; write: number }>;
  };
  timeline: Array<{
    timestamp: number;
    type: 'syscall' | 'network' | 'resource';
    data: any;
  }>;
  riskScore: number;
  anomalies: AnomalyDetection[];
  threatIndicators: ThreatIndicator[];
}

export interface ThreatIndicator {
  type: string;
  severity: ThreatLevel;
  description: string;
  evidence: any;
  timestamp: number;
}

export interface RiskScore {
  score: number;
  level: 'low' | 'medium' | 'high' | 'critical' | 'unknown';
  factors: Array<{
    type: string;
    severity: ThreatLevel;
    timestamp: number;
  }>;
  recommendations: string[];
}

export interface AnomalyDetection {
  type: string;
  description: string;
  confidence: number;
  severity: ThreatLevel;
}

export interface SecurityReport {
  sessionId: string;
  generatedAt: number;
  summary: {
    duration: number;
    totalSyscalls: number;
    totalNetworkEvents: number;
    riskScore: number;
    threatLevel: ThreatLevel;
  };
  syscalls: {
    total: number;
    byThreatLevel: Record<ThreatLevel, number>;
    topSyscalls: Array<{ name: string; count: number }>;
    threats: SyscallEvent[];
  };
  network: {
    totalConnections: number;
    externalConnections: number;
    totalBytes: number;
    suspiciousConnections: NetworkEvent[];
    topDestinations: Array<{ ip: string; port: number; count: number }>;
  };
  behavior: {
    riskScore: number;
    threatIndicators: ThreatIndicator[];
    anomalies: AnomalyDetection[];
    recommendations: string[];
  };
}

export interface ScanResult {
  filePath: string;
  scanId: string;
  status: 'clean' | 'suspicious' | 'malicious' | 'error';
  threats: Array<{
    type: string;
    description: string;
    severity: ThreatLevel;
  }>;
  metadata: {
    fileSize: number;
    fileType: string;
    hash: {
      md5: string;
      sha1: string;
      sha256: string;
    };
  };
  scannedAt: number;
}

export interface QuarantineInfo {
  originalPath: string;
  quarantinePath: string;
  quarantinedAt: number;
  reason: string;
  expiresAt?: number;
}
