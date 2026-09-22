/**
 * 𝑫𝑹𝑺.𝑽𝑰𝑷. LLM Guardrail & WAF
 * Prompt Injection Protection & Output Filtering
 * 
 * Features:
 * - Prompt Injection Detection & Prevention
 * - Jailbreak Attempt Blocking
 * - Output Filtering for PII & Secrets
 * - Content Moderation
 * - Rate Limiting per User/IP
 * - Multi-layered Security Pipeline
 * 
 * @module LLMGuardrail
 * @version 2.0.0
 * @author 𝑫𝑹𝑺.𝑽𝑰𝑷. Architect
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createLogger } from './utils/logger';
import { metricsMiddleware, metricsEndpoint } from './utils/metrics';
import { errorHandler } from './utils/errorHandler';
import { GuardrailController } from './routes/guardrail';
import { FilterController } from './routes/filter';
import { HealthController } from './routes/health';
import { PromptInjectionFilter } from './filters/PromptInjectionFilter';
import { OutputFilter } from './filters/OutputFilter';
import { ContentModerator } from './filters/ContentModerator';
import { RateLimiter } from './utils/rateLimiter';
import { PolicyEngine } from './services/PolicyEngine';

const logger = createLogger('LLMGuardrail');
const app = express();
const PORT = process.env.PORT || 3021;

// Initialize filters and services
const promptInjectionFilter = new PromptInjectionFilter();
const outputFilter = new OutputFilter();
const contentModerator = new ContentModerator();
const policyEngine = new PolicyEngine();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
    },
  },
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Metrics middleware
app.use(metricsMiddleware);

// Rate limiting
const rateLimiter = new RateLimiter({
  windowMs: 60000,
  maxRequests: 100
});
app.use(rateLimiter.middleware);

// Initialize controllers
const guardrailController = new GuardrailController(
  promptInjectionFilter,
  contentModerator,
  policyEngine
);
const filterController = new FilterController(outputFilter);
const healthController = new HealthController();

// Routes
app.use('/api/v1/guardrail', guardrailController.router);
app.use('/api/v1/filter', filterController.router);
app.use('/api/v1/health', healthController.router);
app.use('/metrics', metricsEndpoint);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: '𝑫𝑹𝑺.𝑽𝑰𝑷. LLM Guardrail & WAF',
    version: '2.0.0',
    status: 'operational',
    features: [
      'prompt-injection-detection',
      'jailbreak-prevention',
      'output-filtering',
      'pii-redaction',
      'secret-detection',
      'content-moderation',
      'rate-limiting',
      'policy-enforcement'
    ],
    endpoints: {
      guardrail: '/api/v1/guardrail',
      filter: '/api/v1/filter',
      health: '/api/v1/health',
      metrics: '/metrics'
    }
  });
});

// Error handling
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start server
app.listen(PORT, async () => {
  logger.info(`🛡️ 𝑫𝑹𝑺.𝑽𝑰𝑷. LLM Guardrail running on port ${PORT}`);
  
  try {
    // Initialize filters
    await promptInjectionFilter.initialize();
    logger.info('✅ Prompt Injection Filter initialized');
    
    await outputFilter.initialize();
    logger.info('✅ Output Filter initialized');
    
    await contentModerator.initialize();
    logger.info('✅ Content Moderator initialized');
    
    await policyEngine.initialize();
    logger.info('✅ Policy Engine initialized');
    
    logger.info('🛡️ LLM Guardrail fully operational');
  } catch (error) {
    logger.error('Failed to initialize filters:', error);
    process.exit(1);
  }
});

export { promptInjectionFilter, outputFilter, contentModerator, policyEngine };
