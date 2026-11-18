const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../utils/errorHandler');

router.get('/', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString(), service: 'gpu-acceleration-service' });
});
router.get('/live', (req, res) => res.json({ status: 'alive' }));
router.get('/ready', (req, res) => {
  const c = req.app.locals.cudaMetrics;
  res.status(c?.isInitialized ? 200 : 503).json({ status: c?.isInitialized ? 'ready' : 'not ready' });
});
module.exports = router;
