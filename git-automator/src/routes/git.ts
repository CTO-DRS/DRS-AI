/**
 * Git Routes
 * API endpoints for Git operations
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createLogger } from '../utils/logger';
import { GitService } from '../services/GitService';

const logger = createLogger('GitRoutes');

// Validation schemas
const CloneSchema = z.object({
  url: z.string().url(),
  branch: z.string().optional(),
  depth: z.number().min(1).max(100).optional(),
  token: z.string().optional()
});

const CommitSchema = z.object({
  repoDir: z.string(),
  message: z.string().min(1),
  files: z.array(z.string()).optional(),
  author: z.string().optional()
});

const PushSchema = z.object({
  repoDir: z.string(),
  remote: z.string().optional(),
  branch: z.string().optional(),
  token: z.string().optional(),
  setUpstream: z.boolean().optional()
});

const BranchSchema = z.object({
  repoDir: z.string(),
  branchName: z.string(),
  fromBranch: z.string().optional()
});

export class GitController {
  public router: Router;

  constructor(private gitService: GitService) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Clone repository
    this.router.post('/clone', async (req: Request, res: Response) => {
      try {
        const data = CloneSchema.parse(req.body);
        logger.info(`Cloning: ${data.url}`);

        const result = await this.gitService.clone(data);
        res.status(result.success ? 200 : 400).json(result);
      } catch (error) {
        logger.error('Clone failed:', error);
        res.status(500).json({
          success: false,
          message: error instanceof Error ? error.message : 'Clone failed'
        });
      }
    });

    // Commit changes
    this.router.post('/commit', async (req: Request, res: Response) => {
      try {
        const data = CommitSchema.parse(req.body);
        logger.info(`Committing in ${data.repoDir}`);

        const result = await this.gitService.commit(data);
        res.status(result.success ? 200 : 400).json(result);
      } catch (error) {
        logger.error('Commit failed:', error);
        res.status(500).json({
          success: false,
          message: error instanceof Error ? error.message : 'Commit failed'
        });
      }
    });

    // Push changes
    this.router.post('/push', async (req: Request, res: Response) => {
      try {
        const data = PushSchema.parse(req.body);
        logger.info(`Pushing from ${data.repoDir}`);

        const result = await this.gitService.push(data);
        res.status(result.success ? 200 : 400).json(result);
      } catch (error) {
        logger.error('Push failed:', error);
        res.status(500).json({
          success: false,
          message: error instanceof Error ? error.message : 'Push failed'
        });
      }
    });

    // Get repository info
    this.router.get('/info', async (req: Request, res: Response) => {
      try {
        const { repoDir } = z.object({ repoDir: z.string() }).parse(req.query);
        logger.info(`Getting info for ${repoDir}`);

        const info = await this.gitService.getRepoInfo(repoDir);
        res.json({
          success: true,
          data: info
        });
      } catch (error) {
        logger.error('Get info failed:', error);
        res.status(500).json({
          success: false,
          message: error instanceof Error ? error.message : 'Get info failed'
        });
      }
    });

    // Create branch
    this.router.post('/branch/create', async (req: Request, res: Response) => {
      try {
        const data = BranchSchema.parse(req.body);
        logger.info(`Creating branch ${data.branchName}`);

        const result = await this.gitService.createBranch(
          data.repoDir,
          data.branchName,
          data.fromBranch
        );
        res.status(result.success ? 200 : 400).json(result);
      } catch (error) {
        logger.error('Create branch failed:', error);
        res.status(500).json({
          success: false,
          message: error instanceof Error ? error.message : 'Create branch failed'
        });
      }
    });

    // Checkout branch
    this.router.post('/branch/checkout', async (req: Request, res: Response) => {
      try {
        const { repoDir, branchName } = z.object({
          repoDir: z.string(),
          branchName: z.string()
        }).parse(req.body);
        logger.info(`Checking out ${branchName}`);

        const result = await this.gitService.checkoutBranch(repoDir, branchName);
        res.status(result.success ? 200 : 400).json(result);
      } catch (error) {
        logger.error('Checkout failed:', error);
        res.status(500).json({
          success: false,
          message: error instanceof Error ? error.message : 'Checkout failed'
        });
      }
    });

    // Pull changes
    this.router.post('/pull', async (req: Request, res: Response) => {
      try {
        const { repoDir, remote, branch } = z.object({
          repoDir: z.string(),
          remote: z.string().optional(),
          branch: z.string().optional()
        }).parse(req.body);
        logger.info(`Pulling in ${repoDir}`);

        const result = await this.gitService.pull(repoDir, remote, branch);
        res.status(result.success ? 200 : 400).json(result);
      } catch (error) {
        logger.error('Pull failed:', error);
        res.status(500).json({
          success: false,
          message: error instanceof Error ? error.message : 'Pull failed'
        });
      }
    });

    // Cleanup repository
    this.router.delete('/cleanup', async (req: Request, res: Response) => {
      try {
        const { repoDir } = z.object({ repoDir: z.string() }).parse(req.body);
        logger.info(`Cleaning up ${repoDir}`);

        await this.gitService.cleanup(repoDir);
        res.json({
          success: true,
          message: 'Repository cleaned up'
        });
      } catch (error) {
        logger.error('Cleanup failed:', error);
        res.status(500).json({
          success: false,
          message: error instanceof Error ? error.message : 'Cleanup failed'
        });
      }
    });
  }
}
