/**
 * Syscall Monitor Service
 * Monitors system calls using ptrace for behavioral analysis
 */

import { spawn, ChildProcess } from 'child_process';
import { createLogger } from '../utils/logger';
import { EventEmitter } from 'events';
import { SyscallEvent, SyscallPattern, ThreatLevel } from '../models/types';

const logger = createLogger('SyscallMonitor');

// Dangerous syscalls that indicate potential threats
const DANGEROUS_SYSCALLS: SyscallPattern[] = [
  { name: 'execve', threatLevel: 'medium', description: 'Program execution' },
  { name: 'execveat', threatLevel: 'medium', description: 'Program execution with directory fd' },
  { name: 'fork', threatLevel: 'low', description: 'Process fork' },
  { name: 'vfork', threatLevel: 'low', description: 'Process vfork' },
  { name: 'clone', threatLevel: 'low', description: 'Process/thread creation' },
  { name: 'ptrace', threatLevel: 'critical', description: 'Process tracing (potential injection)' },
  { name: 'process_vm_writev', threatLevel: 'critical', description: 'Write to another process memory' },
  { name: 'openat', args: ['O_RDWR', '/proc/self/mem'], threatLevel: 'critical', description: 'Memory access attempt' },
  { name: 'connect', threatLevel: 'medium', description: 'Network connection' },
  { name: 'socket', threatLevel: 'low', description: 'Socket creation' },
  { name: 'mount', threatLevel: 'critical', description: 'Filesystem mount' },
  { name: 'umount2', threatLevel: 'critical', description: 'Filesystem unmount' },
  { name: 'reboot', threatLevel: 'critical', description: 'System reboot' },
  { name: 'init_module', threatLevel: 'critical', description: 'Kernel module load' },
  { name: 'delete_module', threatLevel: 'critical', description: 'Kernel module unload' },
  { name: 'setuid', threatLevel: 'high', description: 'Set user ID' },
  { name: 'setgid', threatLevel: 'high', description: 'Set group ID' },
  { name: 'setreuid', threatLevel: 'high', description: 'Set real/effective user ID' },
  { name: 'setregid', threatLevel: 'high', description: 'Set real/effective group ID' },
  { name: 'chmod', args: ['04777', '04755'], threatLevel: 'high', description: 'Setuid/setgid bit set' },
  { name: 'chown', threatLevel: 'medium', description: 'Change file ownership' },
  { name: 'chroot', threatLevel: 'high', description: 'Change root directory' },
  { name: 'pivot_root', threatLevel: 'critical', description: 'Change root filesystem' },
  { name: 'kexec_load', threatLevel: 'critical', description: 'Load new kernel' },
  { name: 'ioperm', threatLevel: 'critical', description: 'Set I/O port permissions' },
  { name: 'iopl', threatLevel: 'critical', description: 'Change I/O privilege level' },
];

export class SyscallMonitor extends EventEmitter {
  private monitors: Map<string, ChildProcess>;
  private syscallLogs: Map<string, SyscallEvent[]>;
  private readonly MAX_LOG_SIZE = 10000;
  private readonly ANALYSIS_WINDOW = 60000; // 1 minute window for pattern detection

  constructor() {
    super();
    this.monitors = new Map();
    this.syscallLogs = new Map();
  }

  async initialize(): Promise<void> {
    logger.info('Initializing syscall monitor...');
    
    // Check if strace is available
    try {
      const { execSync } = require('child_process');
      execSync('which strace', { stdio: 'ignore' });
      logger.info('✅ strace available for syscall monitoring');
    } catch {
      logger.warn('⚠️ strace not available, syscall monitoring limited');
    }
    
    logger.info('✅ Syscall monitor initialized');
  }

  async attachToProcess(sessionId: string, pid: number): Promise<void> {
    if (this.monitors.has(sessionId)) {
      logger.warn(`Already monitoring session ${sessionId}`);
      return;
    }

    try {
      // Use strace to monitor syscalls
      const strace = spawn('strace', [
        '-f', // Follow forks
        '-e', 'trace=all',
        '-s', '256', // String size
        '-o', `/tmp/strace-${sessionId}.log`,
        '-p', pid.toString()
      ], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      this.monitors.set(sessionId, strace);
      this.syscallLogs.set(sessionId, []);

      // Process strace output
      strace.stdout?.on('data', (data) => {
        this.processStraceOutput(sessionId, data.toString());
      });

      strace.stderr?.on('data', (data) => {
        this.processStraceOutput(sessionId, data.toString());
      });

      strace.on('exit', (code) => {
        logger.info(`Strace for session ${sessionId} exited with code ${code}`);
        this.monitors.delete(sessionId);
      });

      // Start log rotation
      this.startLogRotation(sessionId);

      logger.info(`✅ Attached syscall monitor to PID ${pid} for session ${sessionId}`);
      
    } catch (error) {
      logger.error(`Failed to attach syscall monitor to PID ${pid}:`, error);
      throw error;
    }
  }

  async attachToContainer(sessionId: string, containerId: string): Promise<void> {
    try {
      // Get container's init process PID
      const { execSync } = require('child_process');
      const pid = execSync(
        `docker inspect -f '{{.State.Pid}}' ${containerId}`,
        { encoding: 'utf8' }
      ).trim();

      if (pid === '0') {
        throw new Error('Container not running');
      }

      await this.attachToProcess(sessionId, parseInt(pid));
      
    } catch (error) {
      logger.error(`Failed to attach to container ${containerId}:`, error);
      throw error;
    }
  }

  private processStraceOutput(sessionId: string, output: string): void {
    const lines = output.split('\n');
    const logs = this.syscallLogs.get(sessionId) || [];

    for (const line of lines) {
      const event = this.parseSyscallLine(line);
      if (event) {
        logs.push(event);
        
        // Check for dangerous patterns
        this.analyzeSyscall(sessionId, event);
        
        // Maintain log size
        if (logs.length > this.MAX_LOG_SIZE) {
          logs.shift();
        }
      }
    }

    this.syscallLogs.set(sessionId, logs);
  }

  private parseSyscallLine(line: string): SyscallEvent | null {
    // Parse strace output format
    // Example: [pid 1234] openat(AT_FDCWD, "/etc/passwd", O_RDONLY) = 3
    const match = line.match(/\[pid\s+(\d+)\]\s+(\w+)\((.*)\)\s*=\s*(.+)/);
    
    if (!match) return null;

    const [, pid, syscall, args, result] = match;
    
    return {
      timestamp: Date.now(),
      pid: parseInt(pid),
      syscall: syscall.trim(),
      args: args.split(',').map(a => a.trim()),
      result: result.trim(),
      threatLevel: this.classifySyscall(syscall, args)
    };
  }

  private classifySyscall(syscall: string, args: string): ThreatLevel {
    const pattern = DANGEROUS_SYSCALLS.find(p => 
      p.name === syscall && 
      (!p.args || p.args.some(arg => args.includes(arg)))
    );
    
    return pattern?.threatLevel || 'none';
  }

  private analyzeSyscall(sessionId: string, event: SyscallEvent): void {
    if (event.threatLevel === 'none') return;

    // Emit threat event
    this.emit('syscall:threat', {
      sessionId,
      event,
      timestamp: Date.now()
    });

    // Check for attack patterns
    this.detectAttackPatterns(sessionId, event);
  }

  private detectAttackPatterns(sessionId: string, event: SyscallEvent): void {
    const logs = this.syscallLogs.get(sessionId) || [];
    const recentLogs = logs.filter(l => 
      Date.now() - l.timestamp < this.ANALYSIS_WINDOW
    );

    // Pattern 1: Fork bomb detection
    const forkCount = recentLogs.filter(l => 
      ['fork', 'vfork', 'clone'].includes(l.syscall)
    ).length;
    
    if (forkCount > 100) {
      this.emit('attack:detected', {
        sessionId,
        type: 'fork-bomb',
        severity: 'critical',
        details: { forkCount },
        recommendation: 'Terminate sandbox immediately'
      });
    }

    // Pattern 2: Reverse shell detection
    const socketCalls = recentLogs.filter(l => l.syscall === 'socket');
    const connectCalls = recentLogs.filter(l => l.syscall === 'connect');
    const execCalls = recentLogs.filter(l => 
      ['execve', 'execveat'].includes(l.syscall)
    );
    
    if (socketCalls.length > 0 && connectCalls.length > 0 && execCalls.length > 0) {
      const timeWindow = Math.max(...connectCalls.map(c => c.timestamp)) - 
                        Math.min(...socketCalls.map(s => s.timestamp));
      
      if (timeWindow < 5000) { // Within 5 seconds
        this.emit('attack:detected', {
          sessionId,
          type: 'reverse-shell',
          severity: 'critical',
          details: { socketCalls, connectCalls, execCalls },
          recommendation: 'Block network and terminate sandbox'
        });
      }
    }

    // Pattern 3: Privilege escalation attempt
    const privCalls = recentLogs.filter(l =>
      ['setuid', 'setgid', 'setreuid', 'setregid', 'chmod'].includes(l.syscall)
    );
    
    if (privCalls.length > 5) {
      this.emit('attack:detected', {
        sessionId,
        type: 'privilege-escalation',
        severity: 'high',
        details: { privCalls },
        recommendation: 'Monitor closely, restrict capabilities'
      });
    }

    // Pattern 4: Container escape attempt
    const escapeCalls = recentLogs.filter(l =>
      ['mount', 'umount2', 'pivot_root', 'chroot', 'openat'].includes(l.syscall) &&
      (l.args.some(a => a.includes('/proc')) || l.args.some(a => a.includes('/sys')))
    );
    
    if (escapeCalls.length > 0) {
      this.emit('attack:detected', {
        sessionId,
        type: 'container-escape',
        severity: 'critical',
        details: { escapeCalls },
        recommendation: 'Terminate sandbox and audit'
      });
    }

    // Pattern 5: Cryptominer detection (high CPU syscalls)
    const computeSyscalls = ['mmap', 'mprotect', 'munmap'];
    const computeCount = recentLogs.filter(l => 
      computeSyscalls.includes(l.syscall)
    ).length;
    
    if (computeCount > 1000) {
      this.emit('attack:detected', {
        sessionId,
        type: 'suspicious-compute',
        severity: 'medium',
        details: { computeCount },
        recommendation: 'Monitor CPU usage'
      });
    }
  }

  private startLogRotation(sessionId: string): void {
    setInterval(() => {
      const logs = this.syscallLogs.get(sessionId);
      if (logs) {
        // Archive old logs
        const cutoff = Date.now() - 300000; // 5 minutes
        const archived = logs.filter(l => l.timestamp < cutoff);
        const current = logs.filter(l => l.timestamp >= cutoff);
        
        if (archived.length > 0) {
          this.emit('logs:archived', { sessionId, count: archived.length });
        }
        
        this.syscallLogs.set(sessionId, current);
      }
    }, 60000); // Every minute
  }

  getSyscallLogs(sessionId: string, options: {
    limit?: number;
    threatLevel?: ThreatLevel;
    syscall?: string;
  } = {}): SyscallEvent[] {
    let logs = this.syscallLogs.get(sessionId) || [];
    
    if (options.threatLevel) {
      logs = logs.filter(l => l.threatLevel === options.threatLevel);
    }
    
    if (options.syscall) {
      logs = logs.filter(l => l.syscall === options.syscall);
    }
    
    if (options.limit) {
      logs = logs.slice(-options.limit);
    }
    
    return logs;
  }

  getThreatSummary(sessionId: string): {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  } {
    const logs = this.syscallLogs.get(sessionId) || [];
    
    return {
      critical: logs.filter(l => l.threatLevel === 'critical').length,
      high: logs.filter(l => l.threatLevel === 'high').length,
      medium: logs.filter(l => l.threatLevel === 'medium').length,
      low: logs.filter(l => l.threatLevel === 'low').length,
      total: logs.length
    };
  }

  async detach(sessionId: string): Promise<void> {
    const monitor = this.monitors.get(sessionId);
    if (monitor) {
      monitor.kill('SIGTERM');
      this.monitors.delete(sessionId);
    }
    
    this.syscallLogs.delete(sessionId);
    
    logger.info(`✅ Detached syscall monitor from session ${sessionId}`);
  }

  async cleanup(): Promise<void> {
    logger.info('Cleaning up syscall monitors...');
    
    for (const [sessionId, monitor] of this.monitors) {
      try {
        monitor.kill('SIGKILL');
        this.monitors.delete(sessionId);
      } catch (error) {
        logger.error(`Failed to cleanup monitor ${sessionId}:`, error);
      }
    }
    
    this.syscallLogs.clear();
    logger.info('✅ Syscall monitor cleanup complete');
  }
}
