const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../utils/errorHandler');

router.get('/', (req, res) => {
  res.json({ gpus: req.app.locals.cudaMetrics.getCurrent() });
});

router.get('/aggregate', (req, res) => {
  res.json(req.app.locals.cudaMetrics.getAggregate());
});

router.get('/history', asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 60), 1000);
  const history = await req.app.locals.cudaMetrics.getHistory(limit);
  res.json({ count: history.length, samples: history });
}));

module.exports = router;
