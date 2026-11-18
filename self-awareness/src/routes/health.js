const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../utils/errorHandler');

/**
 * @openapi
 * /health
 *   get:
 *     summary: Service health check
 */
router.get('/', (req, res) => {
  const health = req.app.locals.digitalHealthService;
  const uncertainty = req.app.locals.epistemicUncertaintyService;
  const transparency = req.app.locals.transparencyDashboardService;
  const explanation = req.app.locals.decisionExplanationService;

  const checks = {
    digitalHealth: health?.isInitialized ? 'healthy' : 'unhealthy',
    epistemicUncertainty: uncertainty?.isInitialized ? 'healthy' : 'unhealthy',
    transparency: transparency?.isInitialized ? 'healthy' : 'unhealthy',
    decisionExplanation: explanation?.isInitialized ? 'healthy' : 'unhealthy',
  };

  const isHealthy = Object.values(checks).every((c) => c === 'healthy');
  const status = isHealthy ? 'healthy' : 'degraded';

  res.status(isHealthy ? 200 : 503).json({
    status,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: 'self-awareness-service',
    checks,
  });
});

router.get('/live', (req, res) => {
  res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

router.get('/ready', (req, res) => {
  const svc = req.app.locals.digitalHealthService;
  res.status(svc?.isInitialized ? 200 : 503).json({
    status: svc?.isInitialized ? 'ready' : 'not ready',
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
