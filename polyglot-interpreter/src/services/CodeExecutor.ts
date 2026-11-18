/**
 * Code Executor Service
 * Executes code in isolated Docker containers
 */

import Docker from 'dockerode';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger';
import { SessionManager } from './SessionManager';
import { 
  ExecutionRequest, 
  ExecutionResult, 
  LanguageConfig,
  ExecutionSession 
} from '../models/types';

const logger = createLogger('CodeExecutor');

// Language configurations
const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  python: {
    name: 'python',
    version: '3.11',
    image: 'python:3.11-slim',
    fileExtension: '.py',
    command: ['python'],
    timeout: 30000,
    memoryLimit: 256 * 1024 * 1024, // 256MB
    cpuLimit: 1.0
  },
  py: {
    name: 'python',
    version: '3.11',
    image: 'python:3.11-slim',
    fileExtension: '.py',
    command: ['python'],
    timeout: 30000,
    memoryLimit: 256 * 1024 * 1024,
    cpuLimit: 1.0
  },
  javascript: {
    name: 'javascript',
    version: '20',
    image: 'node:20-slim',
    fileExtension: '.js',
    command: ['node'],
    timeout: 30000,
    memoryLimit: 256 * 1024 * 1024,
    cpuLimit: 1.0
  },
  js: {
    name: 'javascript',
    version: '20',
    image: 'node:20-slim',
    fileExtension: '.js',
    command: ['node'],
    timeout: 30000,
    memoryLimit: 256 * 1024 * 1024,
    cpuLimit: 1.0
  },
  typescript: {
    name: 'typescript',
    version: '5.3',
    image: 'node:20-slim',
    fileExtension: '.ts',
    command: ['npx', 'ts-node'],
    timeout: 60000,
    memoryLimit: 512 * 1024 * 1024, // 512MB for TS compilation
    cpuLimit: 1.0
  },
  ts: {
    name: 'typescript',
    version: '5.3',
    image: 'node:20-slim',
    fileExtension: '.ts',
    command: ['npx', 'ts-node'],
    timeout: 60000,
    memoryLimit: 512 * 1024 * 1024,
    cpuLimit: 1.0
  },
  go: {
    name: 'go',
    version: '1.21',
    image: 'golang:1.21-alpine',
    fileExtension: '.go',
    command: ['go', 'run'],
    timeout: 60000,
    memoryLimit: 512 * 1024 * 1024,
    cpuLimit: 1.0
  },
  golang: {
    name: 'go',
    version: '1.21',
    image: 'golang:1.21-alpine',
    fileExtension: '.go',
    command: ['go', 'run'],
    timeout: 60000,
    memoryLimit: 512 * 1024 * 1024,
    cpuLimit: 1.0
  },
  rust: {
    name: 'rust',
    version: '1.75',
    image: 'rust:1.75-slim',
    fileExtension: '.rs',
    command: ['rustc', '--edition', '2021', '-o', '/tmp/program', '&&', '/tmp/program'],
    timeout: 120000, // Rust compilation takes longer
    memoryLimit: 1024 * 1024 * 1024, // 1GB for Rust
    cpuLimit: 2.0
  },
  rs: {
    name: 'rust',
    version: '1.75',
    image: 'rust:1.75-slim',
    fileExtension: '.rs',
    command: ['rustc', '--edition', '2021', '-o', '/tmp/program', '&&', '/tmp/program'],
    timeout: 120000,
    memoryLimit: 1024 * 1024 * 1024,
    cpuLimit: 2.0
  }
};

export class CodeExecutor {
  private docker: Docker;

  constructor(private sessionManager: SessionManager) {
    this.docker = new Docker({
      socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock'
    });
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Code Executor...');
    
    // Pull required images
    const images = [...new Set(Object.values(LANGUAGE_CONFIGS).map(c => c.image))];
    
    for (const image of images) {
      try {
        logger.info(`Pulling image: ${image}`);
        const stream = await this.docker.pull(image);
        await new Promise((resolve, reject) => {
          this.docker.modem.followProgress(stream, (err) => {
            if (err) reject(err);
            else resolve(null);
          });
        });
        logger.info(`✅ Image ${image} ready`);
      } catch (error) {
        logger.warn(`Failed to pull ${image}:`, error);
      }
    }
    
    logger.info('✅ Code Executor initialized');
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const startTime = Date.now();
    const sessionId = uuidv4();

    // Get language config
    const config = LANGUAGE_CONFIGS[request.language.toLowerCase()];
    if (!config) {
      throw new Error(`Unsupported language: ${request.language}`);
    }

    logger.info(`Executing ${config.name} code in session ${sessionId}`);

    try {
      // Create execution session
      const session: ExecutionSession = {
        id: sessionId,
        language: config.name,
        createdAt: new Date(),
        status: 'running'
      };

      this.sessionManager.addSession(session);

      // Execute in container
      const result = await this.executeInContainer(request.code, config, request);

      // Update session
      session.status = 'completed';
      session.completedAt = new Date();

      return {
        ...result,
        sessionId,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      logger.error(`Execution failed for session ${sessionId}:`, error);
      
      return {
        stdout: '',
        stderr: error instanceof Error ? error.message : 'Execution failed',
        exitCode: 1,
        sessionId,
        executionTime: Date.now() - startTime
      };
    }
  }

  private async executeInContainer(
    code: string,
    config: LanguageConfig,
    request: ExecutionRequest
  ): Promise<Omit<ExecutionResult, 'sessionId' | 'executionTime'>> {
    const containerName = `drs-polyglot-${uuidv4().substring(0, 8)}`;
    
    // Prepare code file
    const filename = `main${config.fileExtension}`;
    const workdir = '/workspace';

    // Build command based on language
    let cmd: string[];
    if (config.name === 'rust') {
      // Special handling for Rust
      cmd = ['sh', '-c', `echo '${code.replace(/'/g, "'\"'\"'")}' > ${filename} && rustc --edition 2021 -o /tmp/program ${filename} && /tmp/program`];
    } else if (config.name === 'typescript') {
      // Special handling for TypeScript
      cmd = ['sh', '-c', `echo '${code.replace(/'/g, "'\"'\"'")}' > ${filename} && npx ts-node ${filename}`];
    } else {
      cmd = ['sh', '-c', `echo '${code.replace(/'/g, "'\"'\"'")}' > ${filename} && ${config.command.join(' ')} ${filename}`];
    }

    try {
      // Create container
      const container = await this.docker.createContainer({
        name: containerName,
        Image: config.image,
        Cmd: cmd,
        WorkingDir: workdir,
        HostConfig: {
          // Resource limits
          Memory: request.memoryLimit || config.memoryLimit,
          MemorySwap: (request.memoryLimit || config.memoryLimit) * 2,
          CpuQuota: Math.floor((request.cpuLimit || config.cpuLimit) * 100000),
          CpuPeriod: 100000,
          PidsLimit: 50,
          
          // Security
          SecurityOpt: ['no-new-privileges:true'],
          CapDrop: ['ALL'],
          
          // Network isolation (no network by default)
          NetworkMode: request.allowNetwork ? 'bridge' : 'none',
          
          // Storage
          ReadonlyRootfs: true,
          Tmpfs: {
            '/tmp': 'rw,noexec,nosuid,size=100m',
            '/workspace': 'rw,noexec,nosuid,size=50m'
          },
          
          AutoRemove: true
        },
        Labels: {
          'drs-vip-polyglot': 'true',
          'language': config.name
        }
      });

      // Start container
      await container.start();

      // Wait for completion with timeout
      const timeout = request.timeout || config.timeout;
      
      const result = await Promise.race([
        this.waitForContainer(container),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Execution timeout')), timeout)
        )
      ]);

      return result;
    } catch (error) {
      // Cleanup container if still running
      try {
        const container = this.docker.getContainer(containerName);
        await container.stop({ t: 5 });
        await container.remove({ force: true });
      } catch {}

      throw error;
    }
  }

  private async waitForContainer(
    container: Docker.Container
  ): Promise<Omit<ExecutionResult, 'sessionId' | 'executionTime'>> {
    // Get logs
    const logStream = await container.logs({
      follow: true,
      stdout: true,
      stderr: true
    });

    let stdout = '';
    let stderr = '';

    logStream.on('data', (chunk: Buffer) => {
      // Docker multiplexes stdout/stderr with 8-byte header
      const header = chunk.slice(0, 8);
      const payload = chunk.slice(8);
      const streamType = header[0];

      if (streamType === 1) {
        stdout += payload.toString('utf8');
      } else if (streamType === 2) {
        stderr += payload.toString('utf8');
      }
    });

    // Wait for container to finish
    const exitData = await container.wait();

    return {
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: exitData.StatusCode || 0
    };
  }

  async executeStream(
    request: ExecutionRequest,
    onOutput: (data: { type: 'stdout' | 'stderr'; data: string }) => void
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const sessionId = uuidv4();

    const config = LANGUAGE_CONFIGS[request.language.toLowerCase()];
    if (!config) {
      throw new Error(`Unsupported language: ${request.language}`);
    }

    try {
      const containerName = `drs-polyglot-${uuidv4().substring(0, 8)}`;
      const filename = `main${config.fileExtension}`;

      let cmd: string[];
      if (config.name === 'rust') {
        cmd = ['sh', '-c', `echo '${request.code.replace(/'/g, "'\"'\"'")}' > ${filename} && rustc --edition 2021 -o /tmp/program ${filename} && /tmp/program`];
      } else if (config.name === 'typescript') {
        cmd = ['sh', '-c', `echo '${request.code.replace(/'/g, "'\"'\"'")}' > ${filename} && npx ts-node ${filename}`];
      } else {
        cmd = ['sh', '-c', `echo '${request.code.replace(/'/g, "'\"'\"'")}' > ${filename} && ${config.command.join(' ')} ${filename}`];
      }

      const container = await this.docker.createContainer({
        name: containerName,
        Image: config.image,
        Cmd: cmd,
        WorkingDir: '/workspace',
        HostConfig: {
          Memory: request.memoryLimit || config.memoryLimit,
          MemorySwap: (request.memoryLimit || config.memoryLimit) * 2,
          CpuQuota: Math.floor((request.cpuLimit || config.cpuLimit) * 100000),
          CpuPeriod: 100000,
          PidsLimit: 50,
          SecurityOpt: ['no-new-privileges:true'],
          CapDrop: ['ALL'],
          NetworkMode: request.allowNetwork ? 'bridge' : 'none',
          ReadonlyRootfs: true,
          Tmpfs: {
            '/tmp': 'rw,noexec,nosuid,size=100m',
            '/workspace': 'rw,noexec,nosuid,size=50m'
          },
          AutoRemove: true
        }
      });

      await container.start();

      // Stream logs
      const stream = await container.attach({
        stream: true,
        stdout: true,
        stderr: true
      });

      stream.on('data', (chunk: Buffer) => {
        const header = chunk.slice(0, 8);
        const payload = chunk.slice(8);
        const streamType = header[0];

        onOutput({
          type: streamType === 1 ? 'stdout' : 'stderr',
          data: payload.toString('utf8')
        });
      });

      const exitData = await container.wait();

      return {
        stdout: '',
        stderr: '',
        exitCode: exitData.StatusCode || 0,
        sessionId,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      throw error;
    }
  }

  getSupportedLanguages(): Array<{ name: string; version: string; aliases: string[] }> {
    const languages = new Map<string, { name: string; version: string; aliases: string[] }>();

    for (const [alias, config] of Object.entries(LANGUAGE_CONFIGS)) {
      if (!languages.has(config.name)) {
        languages.set(config.name, {
          name: config.name,
          version: config.version,
          aliases: []
        });
      }
      languages.get(config.name)!.aliases.push(alias);
    }

    return Array.from(languages.values());
  }
}
