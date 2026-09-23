/**
 * Docker Manager Service
 * Manages Docker-in-Docker containers for isolated execution
 */

import Docker from 'dockerode';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger';
import { SandboxConfig, SandboxSession, ExecutionResult } from '../models/types';
import { EventEmitter } from 'events';

const logger = createLogger('DockerManager');

export class DockerManager extends EventEmitter {
  private docker: Docker;
  private sessions: Map<string, SandboxSession>;
  private readonly MAX_CONCURRENT_SANDBOXES = 10;
  private readonly DEFAULT_MEMORY_LIMIT = 512 * 1024 * 1024; // 512MB
  private readonly DEFAULT_CPU_LIMIT = 1.0;
  private readonly DEFAULT_TIMEOUT = 300000; // 5 minutes

  constructor() {
    super();
    this.docker = new Docker({
      socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock'
    });
    this.sessions = new Map();
  }

  async initialize(): Promise<void> {
    try {
      // Verify Docker connection
      await this.docker.ping();
      logger.info('Docker daemon connected successfully');
      
      // Pull required images
      await this.pullBaseImages();
      
      // Setup network for sandboxes
      await this.setupSandboxNetwork();
      
    } catch (error) {
      logger.warn('Docker initialization failed (running in degraded mode without Docker):', (error as Error).message);
      // Don't rethrow — let the service boot so /health and other endpoints work
    }
  }

  private async pullBaseImages(): Promise<void> {
    const images = [
      'alpine:latest',
      'python:3.11-slim',
      'node:20-slim',
      'golang:1.21-alpine',
      'rust:1.75-slim'
    ];

    for (const image of images) {
      try {
        logger.info(`Pulling base image: ${image}`);
        const stream = await this.docker.pull(image);
        await new Promise((resolve, reject) => {
          this.docker.modem.followProgress(stream, (err, res) => {
            if (err) reject(err);
            else resolve(res);
          });
        });
        logger.info(`✅ Image ${image} ready`);
      } catch (error) {
        logger.warn(`Failed to pull ${image}, will retry on demand:`, error);
      }
    }
  }

  private async setupSandboxNetwork(): Promise<void> {
    const networkName = 'drs-sandbox-network';
    try {
      const networks = await this.docker.listNetworks({
        filters: { name: [networkName] }
      });
      
      if (networks.length === 0) {
        await this.docker.createNetwork({
          Name: networkName,
          Driver: 'bridge',
          Internal: true, // No external access
          Attachable: false,
          Labels: {
            'drs-vip-sandbox': 'true',
            'managed-by': 'security-sandbox'
          }
        });
        logger.info(`✅ Sandbox network ${networkName} created`);
      }
    } catch (error) {
      logger.error('Failed to setup sandbox network:', error);
      throw error;
    }
  }

  async createSandbox(config: SandboxConfig): Promise<SandboxSession> {
    // Check concurrent limit
    if (this.sessions.size >= this.MAX_CONCURRENT_SANDBOXES) {
      throw new Error('Maximum concurrent sandboxes reached');
    }

    const sessionId = uuidv4();
    const containerName = `drs-sandbox-${sessionId.substring(0, 8)}`;

    try {
      // Create container with security constraints
      const container = await this.docker.createContainer({
        name: containerName,
        Image: config.image || 'alpine:latest',
        Cmd: config.command || ['sh', '-c', 'while true; do sleep 1; done'],
        WorkingDir: '/workspace',
        HostConfig: {
          // Resource limits
          Memory: config.memoryLimit || this.DEFAULT_MEMORY_LIMIT,
          MemorySwap: (config.memoryLimit || this.DEFAULT_MEMORY_LIMIT) * 2,
          CpuQuota: Math.floor((config.cpuLimit || this.DEFAULT_CPU_LIMIT) * 100000),
          CpuPeriod: 100000,
          PidsLimit: config.pidsLimit || 100,
          
          // Security options
          SecurityOpt: [
            'no-new-privileges:true',
            'seccomp:unconfined' // We'll handle seccomp ourselves
          ],
          CapDrop: ['ALL'],
          CapAdd: config.capabilities || [],
          
          // Network isolation
          NetworkMode: 'drs-sandbox-network',
          
          // Storage
          ReadonlyRootfs: config.readonlyRootfs !== false,
          Tmpfs: {
            '/tmp': 'rw,noexec,nosuid,size=100m',
            '/workspace': 'rw,noexec,nosuid,size=500m'
          },
          
          // Device restrictions
          DeviceCgroupRules: [],
          
          // Restart policy
          RestartPolicy: { Name: 'no' }
        },
        
        // Environment variables
        Env: Object.entries(config.env || {}).map(([k, v]) => `${k}=${v}`),
        
        // Labels
        Labels: {
          'drs-vip-sandbox': 'true',
          'drs-session-id': sessionId,
          'managed-by': 'security-sandbox',
          'created-at': new Date().toISOString()
        },
        
        // Health check
        Healthcheck: {
          Test: ['CMD', 'echo', 'healthy'],
          Interval: 30000000000, // 30s
          Timeout: 10000000000,  // 10s
          Retries: 3
        }
      });

      // Start container
      await container.start();

      // Setup timeout
      const timeout = setTimeout(() => {
        this.destroySandbox(sessionId).catch(err => {
          logger.error(`Auto-cleanup failed for ${sessionId}:`, err);
        });
      }, config.timeout || this.DEFAULT_TIMEOUT);

      // Create session
      const session: SandboxSession = {
        id: sessionId,
        containerId: container.id,
        containerName,
        config,
        createdAt: new Date(),
        status: 'running',
        timeout,
        metrics: {
          cpuUsage: 0,
          memoryUsage: 0,
          networkRx: 0,
          networkTx: 0,
          syscalls: []
        }
      };

      this.sessions.set(sessionId, session);
      
      // Emit event
      this.emit('sandbox:created', session);
      
      logger.info(`✅ Sandbox ${sessionId} created with container ${containerName}`);
      
      return session;
      
    } catch (error) {
      logger.error(`Failed to create sandbox ${sessionId}:`, error);
      throw error;
    }
  }

  async executeInSandbox(
    sessionId: string, 
    command: string[], 
    options: {
      timeout?: number;
      stdin?: string;
      workdir?: string;
    } = {}
  ): Promise<ExecutionResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Sandbox session ${sessionId} not found`);
    }

    const container = this.docker.getContainer(session.containerId);
    const execOptions = {
      Cmd: command,
      AttachStdout: true,
      AttachStderr: true,
      AttachStdin: !!options.stdin,
      WorkingDir: options.workdir || '/workspace',
      Tty: false,
      User: 'sandbox', // Non-root user
    };

    try {
      const exec = await container.exec(execOptions);
      
      const stream = await exec.start({
        hijack: true,
        stdin: !!options.stdin
      });

      let stdout = '';
      let stderr = '';
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          stream.destroy();
          reject(new Error('Execution timeout'));
        }, options.timeout || 60000);

        stream.on('data', (chunk: Buffer) => {
          // Docker multiplexes stdout/stderr
          const header = chunk.slice(0, 8);
          const payload = chunk.slice(8);
          const streamType = header[0];
          
          if (streamType === 1) {
            stdout += payload.toString('utf8');
          } else if (streamType === 2) {
            stderr += payload.toString('utf8');
          }
        });

        stream.on('end', async () => {
          clearTimeout(timeout);
          
          const inspect = await exec.inspect();
          
          resolve({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: inspect.ExitCode || 0,
            duration: inspect.Running ? undefined : Date.now() - session.createdAt.getTime()
          });
        });

        stream.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });

        if (options.stdin) {
          stream.write(options.stdin);
          stream.end();
        }
      });
      
    } catch (error) {
      logger.error(`Execution failed in sandbox ${sessionId}:`, error);
      throw error;
    }
  }

  async copyToSandbox(sessionId: string, sourcePath: string, destPath: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Sandbox session ${sessionId} not found`);
    }

    const container = this.docker.getContainer(session.containerId);
    
    try {
      // Create tar archive
      const tar = require('tar-stream');
      const pack = tar.pack();
      
      const fs = require('fs');
      const path = require('path');
      const content = fs.readFileSync(sourcePath);
      const filename = path.basename(sourcePath);
      
      pack.entry({ name: filename }, content);
      pack.finalize();
      
      await container.putArchive(pack, { path: destPath });
      
      logger.info(`✅ File copied to sandbox ${sessionId}: ${destPath}/${filename}`);
    } catch (error) {
      logger.error(`Failed to copy file to sandbox ${sessionId}:`, error);
      throw error;
    }
  }

  async getSandboxMetrics(sessionId: string): Promise<any> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Sandbox session ${sessionId} not found`);
    }

    const container = this.docker.getContainer(session.containerId);
    
    try {
      const stats = await container.stats({ stream: false });
      const info = await container.inspect();
      
      return {
        cpu: {
          usage: this.calculateCPUUsage(stats),
          limit: session.config.cpuLimit || this.DEFAULT_CPU_LIMIT
        },
        memory: {
          usage: stats.memory_stats.usage || 0,
          limit: stats.memory_stats.limit || session.config.memoryLimit,
          percent: ((stats.memory_stats.usage || 0) / (stats.memory_stats.limit || 1)) * 100
        },
        network: {
          rx_bytes: stats.networks?.eth0?.rx_bytes || 0,
          tx_bytes: stats.networks?.eth0?.tx_bytes || 0,
          rx_packets: stats.networks?.eth0?.rx_packets || 0,
          tx_packets: stats.networks?.eth0?.tx_packets || 0
        },
        pids: stats.pids_stats?.current || 0,
        status: info.State.Status,
        startedAt: info.State.StartedAt,
        health: info.State.Health?.Status
      };
    } catch (error) {
      logger.error(`Failed to get metrics for sandbox ${sessionId}:`, error);
      throw error;
    }
  }

  private calculateCPUUsage(stats: any): number {
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    
    if (systemDelta > 0 && cpuDelta > 0) {
      return (cpuDelta / systemDelta) * (stats.cpu_stats.online_cpus || 1) * 100;
    }
    return 0;
  }

  async destroySandbox(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(`Sandbox ${sessionId} not found for destruction`);
      return;
    }

    try {
      // Clear timeout
      if (session.timeout) {
        clearTimeout(session.timeout);
      }

      const container = this.docker.getContainer(session.containerId);
      
      // Stop container
      try {
        await container.stop({ t: 10 });
        logger.info(`✅ Container ${session.containerName} stopped`);
      } catch (err) {
        logger.warn(`Container ${session.containerName} may already be stopped`);
      }
      
      // Remove container
      await container.remove({ force: true, v: true });
      logger.info(`✅ Container ${session.containerName} removed`);
      
      // Remove from sessions
      this.sessions.delete(sessionId);
      
      // Emit event
      this.emit('sandbox:destroyed', { sessionId, duration: Date.now() - session.createdAt.getTime() });
      
      logger.info(`✅ Sandbox ${sessionId} destroyed`);
      
    } catch (error) {
      logger.error(`Failed to destroy sandbox ${sessionId}:`, error);
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    logger.info('Cleaning up all sandboxes...');
    
    const cleanupPromises = Array.from(this.sessions.keys()).map(sessionId =>
      this.destroySandbox(sessionId).catch(err => {
        logger.error(`Failed to cleanup sandbox ${sessionId}:`, err);
      })
    );
    
    await Promise.all(cleanupPromises);
    
    // Cleanup orphaned containers
    try {
      const containers = await this.docker.listContainers({ all: true });
      const orphanedContainers = containers.filter(c => 
        c.Labels['drs-vip-sandbox'] === 'true'
      );
      
      for (const containerInfo of orphanedContainers) {
        const container = this.docker.getContainer(containerInfo.Id);
        try {
          await container.stop({ t: 5 });
          await container.remove({ force: true });
          logger.info(`✅ Orphaned container ${containerInfo.Names[0]} removed`);
        } catch (err) {
          logger.warn(`Failed to remove orphaned container ${containerInfo.Names[0]}:`, err);
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup orphaned containers:', error);
    }
    
    logger.info('✅ Cleanup complete');
  }

  getActiveSessions(): SandboxSession[] {
    return Array.from(this.sessions.values());
  }

  getSessionCount(): number {
    return this.sessions.size;
  }
}
