const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../utils/errorHandler');

router.get('/', (req, res) => res.json({ status: 'healthy', timestamp: new Date().toISOString(), service: 'federated-learning-service' }));
router.get('/live', (req, res) => res.json({ status: 'alive' }));
router.get('/ready', (req, res) => {
  const pm = req.app.locals.participantManager;
  res.status(pm?.isInitialized ? 200 : 503).json({ status: pm?.isInitialized ? 'ready' : 'not ready' });
});
module.exports = router;
