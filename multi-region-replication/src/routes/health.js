const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../utils/errorHandler');

router.get('/', (req, res) => res.json({ status: 'healthy', timestamp: new Date().toISOString(), service: 'multi-region-replication-service' }));
router.get('/live', (req, res) => res.json({ status: 'alive' }));
router.get('/ready', (req, res) => {
  const rm = req.app.locals.regionManager;
  res.status(rm?.isInitialized ? 200 : 503).json({ status: rm?.isInitialized ? 'ready' : 'not ready' });
});
module.exports = router;
