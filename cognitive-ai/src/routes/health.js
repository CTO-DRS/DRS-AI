const express = require('express');
const router = express.Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *       503:
 *         description: Service is unhealthy
 */
router.get('/', async (req, res) => {
  const checks = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: 'cognitive-ai-service',
    checks: {},
  };

  let isHealthy = true;

  // Check persona engine
  if (req.app.locals.personaEngine?.isInitialized) {
    checks.checks.personaEngine = 'healthy';
  } else {
    checks.checks.personaEngine = 'unhealthy';
    isHealthy = false;
  }

  // Check visual engine
  if (req.app.locals.visualEngine?.isInitialized) {
    checks.checks.visualEngine = 'healthy';
  } else {
    checks.checks.visualEngine = 'unhealthy';
    isHealthy = false;
  }

  // Check meta-learning
  if (req.app.locals.metaLearning?.isInitialized) {
    checks.checks.metaLearning = 'healthy';
  } else {
    checks.checks.metaLearning = 'unhealthy';
    isHealthy = false;
  }

  // Check embedding service
  if (req.app.locals.embeddingService?.isInitialized) {
    checks.checks.embeddingService = 'healthy';
  } else {
    checks.checks.embeddingService = 'unhealthy';
    isHealthy = false;
  }

  checks.status = isHealthy ? 'healthy' : 'unhealthy';

  const statusCode = isHealthy ? 200 : 503;
  res.status(statusCode).json(checks);
});

/**
 * @swagger
 * /health/ready:
 *   get:
 *     summary: Readiness probe
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is ready
 */
router.get('/ready', (req, res) => {
  const isReady = 
    req.app.locals.personaEngine?.isInitialized &&
    req.app.locals.visualEngine?.isInitialized &&
    req.app.locals.metaLearning?.isInitialized &&
    req.app.locals.embeddingService?.isInitialized;

  if (isReady) {
    res.json({ status: 'ready', timestamp: new Date().toISOString() });
  } else {
    res.status(503).json({ status: 'not ready', timestamp: new Date().toISOString() });
  }
});

/**
 * @swagger
 * /health/live:
 *   get:
 *     summary: Liveness probe
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is alive
 */
router.get('/live', (req, res) => {
  res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

module.exports = router;
