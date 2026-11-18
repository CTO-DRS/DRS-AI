const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../utils/errorHandler');

router.get('/', (req, res) => res.json({ status: 'healthy', timestamp: new Date().toISOString(), service: 'gpu-mig-service' }));
router.get('/live', (req, res) => res.json({ status: 'alive' }));
router.get('/ready', (req, res) => {
  const mm = req.app.locals.migManager;
  res.status(mm?.isInitialized ? 200 : 503).json({ status: mm?.isInitialized ? 'ready' : 'not ready' });
});
module.exports = router;
