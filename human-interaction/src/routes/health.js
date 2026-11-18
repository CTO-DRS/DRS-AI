const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  const ar = req.app.locals.arService;
  const dualBrain = req.app.locals.dualBrainService;
  const voice = req.app.locals.voiceService;
  const gesture = req.app.locals.gestureService;
  const glasses = req.app.locals.glassesService;

  const checks = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: 'human-interaction-service',
    checks: {
      ar: ar?.isInitialized ? 'healthy' : 'unhealthy',
      dualBrain: dualBrain?.isInitialized ? 'healthy' : 'unhealthy',
      voice: voice?.isInitialized ? 'healthy' : 'unhealthy',
      gesture: gesture?.isInitialized ? 'healthy' : 'unhealthy',
      glasses: glasses?.isInitialized ? 'healthy' : 'unhealthy',
    },
  };

  const isHealthy = Object.values(checks.checks).every(c => c === 'healthy');
  checks.status = isHealthy ? 'healthy' : 'degraded';

  res.status(isHealthy ? 200 : 503).json(checks);
});

router.get('/ready', (req, res) => {
  const dualBrain = req.app.locals.dualBrainService;
  res.status(dualBrain?.isInitialized ? 200 : 503).json({
    status: dualBrain?.isInitialized ? 'ready' : 'not ready',
    timestamp: new Date().toISOString(),
  });
});

router.get('/live', (req, res) => {
  res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

module.exports = router;
