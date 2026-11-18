const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  const hibernation = req.app.locals.hibernationService;
  const distillation = req.app.locals.distillationService;
  const quantization = req.app.locals.quantizationService;
  const resource = req.app.locals.resourceService;

  const checks = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: 'ultra-efficiency-service',
    checks: {
      hibernation: hibernation?.isInitialized ? 'healthy' : 'unhealthy',
      distillation: distillation?.isInitialized ? 'healthy' : 'unhealthy',
      quantization: quantization?.isInitialized ? 'healthy' : 'unhealthy',
      resource: resource?.isInitialized ? 'healthy' : 'unhealthy',
    },
  };

  const isHealthy = Object.values(checks.checks).every(c => c === 'healthy');
  checks.status = isHealthy ? 'healthy' : 'degraded';

  res.status(isHealthy ? 200 : 503).json(checks);
});

router.get('/ready', (req, res) => {
  const resource = req.app.locals.resourceService;
  res.status(resource?.isInitialized ? 200 : 503).json({
    status: resource?.isInitialized ? 'ready' : 'not ready',
    timestamp: new Date().toISOString(),
  });
});

router.get('/live', (req, res) => {
  res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

module.exports = router;
