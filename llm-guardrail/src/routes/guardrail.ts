/**
 * Guardrail Routes
 * API endpoints for prompt analysis and protection
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createLogger } from '../utils/logger';
import { PromptInjectionFilter } from '../filters/PromptInjectionFilter';
import { ContentModerator } from '../filters/ContentModerator';
import { PolicyEngine } from '../services/PolicyEngine';

const logger = createLogger('GuardrailRoutes');

// Validation schemas
const AnalyzePromptSchema = z.object({
  prompt: z.string().min(1).max(100000),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  policyId: z.string().optional(),
  context: z.object({
    previousPrompts: z.array(z.string()).optional()
  }).optional()
});

const BatchAnalyzeSchema = z.object({
  prompts: z.array(z.string().min(1)).min(1).max(100),
  userId: z.string().optional(),
  policyId: z.string().optional()
});

export class GuardrailController {
  public router: Router;

  constructor(
    private promptInjectionFilter: PromptInjectionFilter,
    private contentModerator: ContentModerator,
    private policyEngine: PolicyEngine
  ) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Analyze single prompt
    this.router.post('/analyze', async (req: Request, res: Response) => {
      try {
        const data = AnalyzePromptSchema.parse(req.body);
        
        logger.info(`Analyzing prompt for user ${data.userId || 'anonymous'}`);
        
        // Step 1: Check for prompt injection
        const injectionResult = await this.promptInjectionFilter.analyze(
          data.prompt,
          {
            userId: data.userId,
            sessionId: data.sessionId,
            previousPrompts: data.context?.previousPrompts
          }
        );

        // Step 2: Content moderation
        const moderationResult = await this.contentModerator.moderate(data.prompt);

        // Step 3: Apply policy
        const policyAction = this.policyEngine.evaluate(data.prompt, {
          userId: data.userId,
          sessionId: data.sessionId,
          riskScore: injectionResult.riskScore,
          findings: injectionResult.findings
        }, data.policyId);

        // Combine results
        const allowed = injectionResult.allowed && 
                       moderationResult.allowed && 
                       policyAction.action !== 'block';

        const response = {
          success: true,
          data: {
            allowed,
            action: this.determineFinalAction(injectionResult.action, moderationResult.action, policyAction.action),
            riskScore: injectionResult.riskScore,
            injectionAnalysis: {
              findings: injectionResult.findings,
              sanitizedPrompt: injectionResult.sanitized
            },
            moderation: {
              toxicity: moderationResult.toxicity,
              violations: moderationResult.violations,
              explanation: moderationResult.explanation
            },
            policy: {
              action: policyAction.action,
              reason: policyAction.reason
            },
            metadata: {
              processingTime: 
                injectionResult.metadata.processingTime + 
                moderationResult.metadata.processingTime,
              timestamp: Date.now()
            }
          }
        };

        // Log if blocked
        if (!allowed) {
          logger.warn('Prompt blocked:', {
            userId: data.userId,
            riskScore: injectionResult.riskScore,
            reason: policyAction.reason
          });
        }

        res.json(response);
      } catch (error) {
        logger.error('Failed to analyze prompt:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Batch analyze prompts
    this.router.post('/analyze/batch', async (req: Request, res: Response) => {
      try {
        const data = BatchAnalyzeSchema.parse(req.body);
        
        logger.info(`Batch analyzing ${data.prompts.length} prompts`);
        
        const results = await Promise.all(
          data.prompts.map(async (prompt, index) => {
            const injectionResult = await this.promptInjectionFilter.analyze(prompt);
            const moderationResult = await this.contentModerator.moderate(prompt);
            
            return {
              index,
              prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
              allowed: injectionResult.allowed && moderationResult.allowed,
              riskScore: injectionResult.riskScore,
              findings: injectionResult.findings.length,
              toxicity: moderationResult.toxicity
            };
          })
        );

        res.json({
          success: true,
          data: {
            total: results.length,
            allowed: results.filter(r => r.allowed).length,
            blocked: results.filter(r => !r.allowed).length,
            results
          }
        });
      } catch (error) {
        logger.error('Failed to batch analyze:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Quick check endpoint (for middleware integration)
    this.router.post('/check', async (req: Request, res: Response) => {
      try {
        const { prompt } = z.object({ prompt: z.string() }).parse(req.body);
        
        const result = await this.promptInjectionFilter.analyze(prompt);
        
        res.json({
          success: true,
          data: {
            safe: result.allowed && result.riskScore < 30,
            riskScore: result.riskScore,
            action: result.action
          }
        });
      } catch (error) {
        logger.error('Quick check failed:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get injection patterns
    this.router.get('/patterns', async (req: Request, res: Response) => {
      try {
        const patterns = this.promptInjectionFilter.getPatterns();
        
        res.json({
          success: true,
          data: patterns.map(p => ({
            name: p.name,
            severity: p.severity,
            description: p.description
          }))
        });
      } catch (error) {
        logger.error('Failed to get patterns:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Add custom pattern
    this.router.post('/patterns', async (req: Request, res: Response) => {
      try {
        const { name, pattern, severity, description } = z.object({
          name: z.string(),
          pattern: z.string(),
          severity: z.enum(['low', 'medium', 'high', 'critical']),
          description: z.string()
        }).parse(req.body);

        this.promptInjectionFilter.addPattern({
          name,
          pattern: new RegExp(pattern, 'i'),
          severity,
          description
        });

        res.json({
          success: true,
          data: { message: 'Pattern added successfully' }
        });
      } catch (error) {
        logger.error('Failed to add pattern:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get moderation categories
    this.router.get('/moderation/categories', async (req: Request, res: Response) => {
      try {
        const categories = this.contentModerator.getCategories();
        
        res.json({
          success: true,
          data: categories
        });
      } catch (error) {
        logger.error('Failed to get categories:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Moderate content
    this.router.post('/moderate', async (req: Request, res: Response) => {
      try {
        const { content } = z.object({ content: z.string() }).parse(req.body);
        
        const result = await this.contentModerator.moderate(content);
        
        res.json({
          success: true,
          data: result
        });
      } catch (error) {
        logger.error('Moderation failed:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get policies
    this.router.get('/policies', async (req: Request, res: Response) => {
      try {
        const policies = this.policyEngine.getAllPolicies();
        
        res.json({
          success: true,
          data: policies.map(p => ({
            id: p.id,
            name: p.name,
            description: p.description,
            enabled: p.enabled,
            rules: p.rules.length
          }))
        });
      } catch (error) {
        logger.error('Failed to get policies:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get policy details
    this.router.get('/policies/:id', async (req: Request, res: Response) => {
      try {
        const policy = this.policyEngine.getPolicy(req.params.id);
        
        if (!policy) {
          return res.status(404).json({
            success: false,
            error: 'Policy not found'
          });
        }
        
        res.json({
          success: true,
          data: policy
        });
      } catch (error) {
        logger.error('Failed to get policy:', error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }

  private determineFinalAction(
    injectionAction: string,
    moderationAction: string,
    policyAction: string
  ): string {
    // Priority: block > sanitize > flag > allow
    if (injectionAction === 'block' || moderationAction === 'block' || policyAction === 'block') {
      return 'block';
    }
    if (injectionAction === 'sanitize' || policyAction === 'sanitize') {
      return 'sanitize';
    }
    if (moderationAction === 'flag' || policyAction === 'flag') {
      return 'flag';
    }
    return 'allow';
  }
}
