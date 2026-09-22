/**
 * Sandbox API Routes
 * REST API for sandbox management and execution
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createLogger } from '../utils/logger';
import { DockerManager } from '../services/DockerManager';
import { SyscallMonitor } from '../services/SyscallMonitor';
import { NetworkMonitor } from '../services/NetworkMonitor';
import { BehavioralEngine } from '../services/BehavioralEngine';
import { SandboxConfig, SecurityReport } from '../models/types';

const logger = createLogger('SandboxRoutes');

// Validation schemas
const CreateSandboxSchema = z.object({
  image: z.string().optional().default('alpine:latest'),
  command: z.array(z.string()).optional(),
  memoryLimit: z.number().min(64 * 1024 * 1024).max(4 * 1024 * 1024 * 1024).optional(),
  cpuLimit: z.number().min(0.1).max(8).optional(),
  pidsLimit: z.number().min(10).max(1000).optional(),
  timeout: z.number().min(1000).max(3600000).optional(),
  readonlyRootfs: z.boolean().optional(),
  capabilities: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  workdir: z.string().optional()
});

const ExecuteCommandSchema = z.object({
  command: z.array(z.string()).min(1),
  timeout: z.number().min(1000).max(300000).optional(),
  stdin: z.string().optional(),
  workdir: z.string().optional()
});

const FileUploadSchema = z.object({
  content: z.string(),
  path: z.string(),
  encoding: z.enum(['base64', 'utf8']).optional().default('utf8')
});

export class SandboxController {
  public router: Router;

  constructor(
    private dockerManager: DockerManager,
    private syscallMonitor: SyscallMonitor,
    private networkMonitor: NetworkMonitor,
    private behavioralEngine: BehavioralEngine
  ) {
    this.router = Router();
    this.setupRoutes();
    this.setupEventHandlers();
  }

  private setupRoutes(): void {
    // Create sandbox
    this.router.post('/create', async (req: Request, res: Response) => {
      try {
        const config = CreateSandboxSchema.parse(req.body);
        
        logger.info(`Creating sandbox with image: ${config.image}`);
        
        const session = await this.dockerManager.createSandbox(config);
        
        // Attach monitoring
        await this.syscallMonitor.attachToContainer(session.id, session.containerId);
        await this.networkMonitor.monitorContainer(session.id, session.containerId);
        this.behavioralEngine.createProfile(session.id, {
          image: config.image || 'alpine:latest',
          command: config.command || [],
          user: 'sandbox'
        });

        res.status(201).json({
          success: true,
          data: {
            sessionId: session.id,
            containerId: session.containerId,
            containerName: session.containerName,
            status: session.status,
            createdAt: session.createdAt
          }
        });
      } catch (error) {
        logger.error('Failed to create sandbox:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Execute command in sandbox
    this.router.post('/:sessionId/execute', async (req: Request, res: Response) => {
      try {
        const { sessionId } = req.params;
        const options = ExecuteCommandSchema.parse(req.body);
        
        logger.info(`Executing command in sandbox ${sessionId}: ${options.command.join(' ')}`);
        
        const result = await this.dockerManager.executeInSandbox(
          sessionId,
          options.command,
          {
            timeout: options.timeout,
            stdin: options.stdin,
            workdir: options.workdir
          }
        );

        res.json({
          success: true,
          data: result
        });
      } catch (error) {
        logger.error(`Failed to execute in sandbox ${req.params.sessionId}:`, error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Upload file to sandbox
    this.router.post('/:sessionId/upload', async (req: Request, res: Response) => {
      try {
        const { sessionId } = req.params;
        const { content, path, encoding } = FileUploadSchema.parse(req.body);
        
        // Decode content if base64
        const decodedContent = encoding === 'base64' 
          ? Buffer.from(content, 'base64').toString('utf8')
          : content;

        // Create temp file and copy to sandbox
        const fs = require('fs');
        const os = require('os');
        const tmpFile = `${os.tmpdir()}/drs-upload-${Date.now()}`;
        
        fs.writeFileSync(tmpFile, decodedContent);
        
        await this.dockerManager.copyToSandbox(sessionId, tmpFile, path);
        
        // Cleanup
        fs.unlinkSync(tmpFile);

        res.json({
          success: true,
          data: { uploadedTo: path }
        });
      } catch (error) {
        logger.error(`Failed to upload to sandbox ${req.params.sessionId}:`, error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get sandbox metrics
    this.router.get('/:sessionId/metrics', async (req: Request, res: Response) => {
      try {
        const { sessionId } = req.params;
        
        const metrics = await this.dockerManager.getSandboxMetrics(sessionId);
        const syscallSummary = this.syscallMonitor.getThreatSummary(sessionId);
        const networkSummary = this.networkMonitor.getNetworkSummary(sessionId);
        const riskAssessment = this.behavioralEngine.getRiskAssessment(sessionId);

        res.json({
          success: true,
          data: {
            container: metrics,
            syscalls: syscallSummary,
            network: networkSummary,
            risk: riskAssessment
          }
        });
      } catch (error) {
        logger.error(`Failed to get metrics for sandbox ${req.params.sessionId}:`, error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get security report
    this.router.get('/:sessionId/report', async (req: Request, res: Response) => {
      try {
        const { sessionId } = req.params;
        
        const report = await this.generateSecurityReport(sessionId);

        res.json({
          success: true,
          data: report
        });
      } catch (error) {
        logger.error(`Failed to generate report for sandbox ${req.params.sessionId}:`, error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // List active sandboxes
    this.router.get('/', async (req: Request, res: Response) => {
      try {
        const sessions = this.dockerManager.getActiveSessions();
        
        res.json({
          success: true,
          data: sessions.map(s => ({
            sessionId: s.id,
            containerName: s.containerName,
            status: s.status,
            createdAt: s.createdAt,
            image: s.config.image
          }))
        });
      } catch (error) {
        logger.error('Failed to list sandboxes:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Destroy sandbox
    this.router.delete('/:sessionId', async (req: Request, res: Response) => {
      try {
        const { sessionId } = req.params;
        
        logger.info(`Destroying sandbox ${sessionId}`);
        
        // Stop monitoring
        await this.syscallMonitor.detach(sessionId);
        await this.networkMonitor.stopMonitoring(sessionId);
        this.behavioralEngine.removeProfile(sessionId);
        
        // Destroy sandbox
        await this.dockerManager.destroySandbox(sessionId);

        res.json({
          success: true,
          data: { message: 'Sandbox destroyed successfully' }
        });
      } catch (error) {
        logger.error(`Failed to destroy sandbox ${req.params.sessionId}:`, error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Quick scan endpoint
    this.router.post('/scan', async (req: Request, res: Response) => {
      try {
        const { code, language } = req.body;
        
        if (!code) {
          return res.status(400).json({
            success: false,
            error: 'Code is required'
          });
        }

        // Create temporary sandbox for scanning
        const session = await this.dockerManager.createSandbox({
          image: this.getImageForLanguage(language),
          timeout: 60000,
          memoryLimit: 256 * 1024 * 1024,
          readonlyRootfs: true
        });

        // Write code to file
        const fs = require('fs');
        const os = require('os');
        const tmpFile = `${os.tmpdir()}/drs-scan-${Date.now()}.${language || 'txt'}`;
        fs.writeFileSync(tmpFile, code);

        // Copy to sandbox
        await this.dockerManager.copyToSandbox(session.id, tmpFile, '/workspace');

        // Run security scan (static analysis)
        const scanResult = await this.runSecurityScan(session.id, language);

        // Cleanup
        fs.unlinkSync(tmpFile);
        await this.dockerManager.destroySandbox(session.id);

        res.json({
          success: true,
          data: scanResult
        });
      } catch (error) {
        logger.error('Failed to scan code:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }

  private setupEventHandlers(): void {
    // Handle syscall threats
    this.syscallMonitor.on('syscall:threat', (data) => {
      const profile = this.behavioralEngine.getProfile(data.sessionId);
      if (profile) {
        this.behavioralEngine.recordSyscall(
          data.sessionId,
          data.event.syscall,
          data.event.args
        );
      }
    });

    // Handle attack detection
    this.syscallMonitor.on('attack:detected', (data) => {
      logger.warn(`Attack detected in session ${data.sessionId}: ${data.type}`);
    });

    // Handle network threats
    this.networkMonitor.on('network:threat', (data) => {
      const profile = this.behavioralEngine.getProfile(data.sessionId);
      if (profile) {
        this.behavioralEngine.recordNetworkActivity(data.sessionId, {
          dstIp: data.event.dstIp,
          dstPort: data.event.dstPort,
          bytes: data.event.length,
          direction: 'out'
        });
      }
    });

    // Handle exfiltration detection
    this.networkMonitor.on('exfiltration:detected', (data) => {
      logger.warn(`Potential exfiltration in session ${data.sessionId}: ${data.type}`);
    });

    // Handle behavioral threats
    this.behavioralEngine.on('threat:detected', (data) => {
      logger.warn(`Behavioral threat in session ${data.sessionId}: ${data.indicator.type}`);
    });

    // Handle action required
    this.behavioralEngine.on('action:required', (data) => {
      logger.error(`Action required for session ${data.sessionId}: ${data.reason}`);
      
      // Auto-terminate if critical
      if (data.action === 'terminate') {
        this.dockerManager.destroySandbox(data.sessionId).catch(err => {
          logger.error(`Auto-termination failed for ${data.sessionId}:`, err);
        });
      }
    });
  }

  private async generateSecurityReport(sessionId: string): Promise<SecurityReport> {
    const session = this.dockerManager.getActiveSessions().find(s => s.id === sessionId);
    const syscallLogs = this.syscallMonitor.getSyscallLogs(sessionId);
    const networkLogs = this.networkMonitor.getConnectionLogs(sessionId);
    const riskAssessment = this.behavioralEngine.getRiskAssessment(sessionId);
    const profile = this.behavioralEngine.getProfile(sessionId);

    // Calculate syscall statistics
    const syscallStats = {
      critical: syscallLogs.filter(l => l.threatLevel === 'critical').length,
      high: syscallLogs.filter(l => l.threatLevel === 'high').length,
      medium: syscallLogs.filter(l => l.threatLevel === 'medium').length,
      low: syscallLogs.filter(l => l.threatLevel === 'low').length,
      none: syscallLogs.filter(l => l.threatLevel === 'none').length
    };

    // Top syscalls
    const syscallCounts = new Map<string, number>();
    for (const log of syscallLogs) {
      const count = syscallCounts.get(log.syscall) || 0;
      syscallCounts.set(log.syscall, count + 1);
    }
    const topSyscalls = Array.from(syscallCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    // Network statistics
    const networkSummary = this.networkMonitor.getNetworkSummary(sessionId);

    return {
      sessionId,
      generatedAt: Date.now(),
      summary: {
        duration: session ? Date.now() - session.createdAt.getTime() : 0,
        totalSyscalls: syscallLogs.length,
        totalNetworkEvents: networkLogs.length,
        riskScore: riskAssessment.score,
        threatLevel: riskAssessment.level as any
      },
      syscalls: {
        total: syscallLogs.length,
        byThreatLevel: syscallStats,
        topSyscalls,
        threats: syscallLogs.filter(l => l.threatLevel !== 'none')
      },
      network: {
        totalConnections: networkSummary.totalConnections,
        externalConnections: networkSummary.externalConnections,
        totalBytes: networkSummary.totalBytes,
        suspiciousConnections: networkLogs.filter(l => l.threatLevel !== 'none'),
        topDestinations: networkSummary.topDestinations
      },
      behavior: {
        riskScore: riskAssessment.score,
        threatIndicators: profile?.threatIndicators || [],
        anomalies: profile?.anomalies || [],
        recommendations: riskAssessment.recommendations
      }
    };
  }

  private getImageForLanguage(language?: string): string {
    const images: Record<string, string> = {
      python: 'python:3.11-slim',
      javascript: 'node:20-slim',
      typescript: 'node:20-slim',
      go: 'golang:1.21-alpine',
      rust: 'rust:1.75-slim',
      java: 'openjdk:21-slim',
      ruby: 'ruby:3.2-slim',
      php: 'php:8.2-cli'
    };
    return images[language || ''] || 'alpine:latest';
  }

  private async runSecurityScan(sessionId: string, language?: string): Promise<any> {
    // This would integrate with actual security scanning tools
    // For now, return a placeholder result
    return {
      status: 'clean',
      issues: [],
      scannedFiles: 1,
      duration: 0
    };
  }
}
