/**
 * Git Service
 * Handles Git operations with security verification
 */

import simpleGit, { SimpleGit } from 'simple-git';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger';
import { SecurityScanner } from './SecurityScanner';
import { 
  CloneRequest, 
  CommitRequest, 
  PushRequest,
  GitOperationResult,
  RepositoryInfo
} from '../models/types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const logger = createLogger('GitService');

export class GitService {
  private reposDir: string;

  constructor(private securityScanner: SecurityScanner) {
    this.reposDir = process.env.REPOS_DIR || '/tmp/drs-repos';
  }

  async initialize(): Promise<void> {
    logger.info('Initializing Git Service...');
    
    // Create repos directory
    await fs.mkdir(this.reposDir, { recursive: true });
    
    logger.info('✅ Git Service initialized');
  }

  async clone(request: CloneRequest): Promise<GitOperationResult> {
    const startTime = Date.now();
    const operationId = uuidv4();

    try {
      logger.info(`Cloning repository: ${request.url}`);

      // Validate URL
      if (!this.isValidGitUrl(request.url)) {
        throw new Error('Invalid Git URL');
      }

      // Security check
      const securityCheck = await this.securityScanner.checkUrl(request.url);
      if (!securityCheck.safe) {
        throw new Error(`Security check failed: ${securityCheck.reason}`);
      }

      // Create repo directory
      const repoName = this.extractRepoName(request.url);
      const repoDir = path.join(this.reposDir, `${repoName}-${operationId}`);
      await fs.mkdir(repoDir, { recursive: true });

      // Clone repository
      const git = simpleGit(repoDir);
      
      const cloneOptions: string[] = [];
      if (request.branch) {
        cloneOptions.push('--branch', request.branch);
      }
      if (request.depth) {
        cloneOptions.push('--depth', request.depth.toString());
      }

      await git.clone(request.url, '.', cloneOptions);

      // Scan cloned repository
      const scanResult = await this.securityScanner.scanRepository(repoDir);

      logger.info(`✅ Repository cloned to ${repoDir}`);

      return {
        success: true,
        operationId,
        message: 'Repository cloned successfully',
        data: {
          repoDir,
          repoName,
          scanResult
        },
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      logger.error('Clone failed:', error);
      return {
        success: false,
        operationId,
        message: error instanceof Error ? error.message : 'Clone failed',
        executionTime: Date.now() - startTime
      };
    }
  }

  async commit(request: CommitRequest): Promise<GitOperationResult> {
    const startTime = Date.now();
    const operationId = uuidv4();

    try {
      logger.info(`Committing changes in ${request.repoDir}`);

      const git = simpleGit(request.repoDir);

      // Check if there are changes
      const status = await git.status();
      
      if (status.files.length === 0) {
        return {
          success: true,
          operationId,
          message: 'No changes to commit',
          executionTime: Date.now() - startTime
        };
      }

      // Stage files
      if (request.files && request.files.length > 0) {
        for (const file of request.files) {
          await git.add(file);
        }
      } else {
        await git.add('.');
      }

      // Scan staged files
      const stagedFiles = await git.diff(['--cached', '--name-only']);
      if (stagedFiles) {
        const files = stagedFiles.split('\n').filter(f => f);
        for (const file of files) {
          const filePath = path.join(request.repoDir, file);
          const scanResult = await this.securityScanner.scanFile(filePath);
          if (scanResult.issues.length > 0) {
            logger.warn(`Security issues found in ${file}:`, scanResult.issues);
          }
        }
      }

      // Commit
      const commitResult = await git.commit(request.message, {
        '--author': request.author || 'DRS AI <bot@drs.vip>',
        '--no-verify': null
      });

      logger.info(`✅ Committed: ${commitResult.commit}`);

      return {
        success: true,
        operationId,
        message: 'Changes committed successfully',
        data: {
          commitHash: commitResult.commit,
          summary: commitResult.summary
        },
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      logger.error('Commit failed:', error);
      return {
        success: false,
        operationId,
        message: error instanceof Error ? error.message : 'Commit failed',
        executionTime: Date.now() - startTime
      };
    }
  }

  async push(request: PushRequest): Promise<GitOperationResult> {
    const startTime = Date.now();
    const operationId = uuidv4();

    try {
      logger.info(`Pushing from ${request.repoDir}`);

      const git = simpleGit(request.repoDir);

      // Configure authentication if token provided
      if (request.token) {
        const remoteUrl = await git.getConfig('remote.origin.url');
        if (remoteUrl.value) {
          const authUrl = this.injectToken(remoteUrl.value, request.token);
          await git.removeRemote('origin');
          await git.addRemote('origin', authUrl);
        }
      }

      // Push
      const pushResult = await git.push(
        request.remote || 'origin',
        request.branch || 'HEAD',
        {
          '--set-upstream': request.setUpstream
        }
      );

      logger.info(`✅ Pushed: ${pushResult.pushed.length} refs`);

      return {
        success: true,
        operationId,
        message: 'Push successful',
        data: {
          pushed: pushResult.pushed,
          remoteMessages: pushResult.remoteMessages
        },
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      logger.error('Push failed:', error);
      return {
        success: false,
        operationId,
        message: error instanceof Error ? error.message : 'Push failed',
        executionTime: Date.now() - startTime
      };
    }
  }

  async getRepoInfo(repoDir: string): Promise<RepositoryInfo> {
    const git = simpleGit(repoDir);

    const [status, log, remotes, branches] = await Promise.all([
      git.status(),
      git.log({ maxCount: 1 }),
      git.getRemotes(true),
      git.branch()
    ]);

    return {
      directory: repoDir,
      currentBranch: status.current || 'unknown',
      ahead: status.ahead,
      behind: status.behind,
      staged: status.staged.length,
      modified: status.modified.length,
      untracked: status.not_added.length,
      lastCommit: log.latest ? {
        hash: log.latest.hash,
        message: log.latest.message,
        author: log.latest.author_name,
        date: log.latest.date
      } : null,
      remotes: remotes.map(r => ({
        name: r.name,
        url: r.refs.fetch
      })),
      branches: branches.all
    };
  }

  async createBranch(repoDir: string, branchName: string, fromBranch?: string): Promise<GitOperationResult> {
    try {
      const git = simpleGit(repoDir);

      if (fromBranch) {
        await git.checkoutBranch(branchName, fromBranch);
      } else {
        await git.checkoutLocalBranch(branchName);
      }

      return {
        success: true,
        message: `Branch ${branchName} created`,
        data: { branchName }
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Branch creation failed'
      };
    }
  }

  async checkoutBranch(repoDir: string, branchName: string): Promise<GitOperationResult> {
    try {
      const git = simpleGit(repoDir);
      await git.checkout(branchName);

      return {
        success: true,
        message: `Checked out ${branchName}`,
        data: { branchName }
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Checkout failed'
      };
    }
  }

  async pull(repoDir: string, remote?: string, branch?: string): Promise<GitOperationResult> {
    try {
      const git = simpleGit(repoDir);
      const pullResult = await git.pull(remote || 'origin', branch);

      return {
        success: true,
        message: 'Pull successful',
        data: {
          filesChanged: pullResult.files.length,
          insertions: pullResult.summary.insertions,
          deletions: pullResult.summary.deletions
        }
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Pull failed'
      };
    }
  }

  private isValidGitUrl(url: string): boolean {
    const patterns = [
      /^https:\/\/[^\s]+\.git$/,
      /^git@[^\s]+:[^\s]+\.git$/,
      /^https:\/\/github\.com\/[^\/]+\/[^\/]+$/,
      /^https:\/\/gitlab\.com\/[^\/]+\/[^\/]+$/,
      /^https:\/\/bitbucket\.org\/[^\/]+\/[^\/]+$/
    ];

    return patterns.some(p => p.test(url));
  }

  private extractRepoName(url: string): string {
    const match = url.match(/\/([^\/]+?)(?:\.git)?$/);
    return match ? match[1] : `repo-${Date.now()}`;
  }

  private injectToken(url: string, token: string): string {
    if (url.startsWith('https://')) {
      return url.replace('https://', `https://oauth2:${token}@`);
    }
    return url;
  }

  async cleanup(repoDir: string): Promise<void> {
    try {
      await fs.rm(repoDir, { recursive: true, force: true });
      logger.info(`Cleaned up ${repoDir}`);
    } catch (error) {
      logger.error(`Failed to cleanup ${repoDir}:`, error);
    }
  }
}
