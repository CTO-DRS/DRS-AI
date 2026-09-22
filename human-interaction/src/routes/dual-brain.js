const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

router.post('/process', asyncHandler(async (req, res) => {
  const service = req.app.locals.dualBrainService;
  if (!service) throw new AppError('Dual-Brain service not initialized', 503);
  const result = await service.processDualBrain(req.body);
  res.json({ status: 'success', data: result });
}));

router.post('/analyze-context', asyncHandler(async (req, res) => {
  const service = req.app.locals.dualBrainService;
  if (!service) throw new AppError('Dual-Brain service not initialized', 503);
  const { query, userId } = req.body;
  const result = await service.analyzeContext(query, userId);
  res.json({ status: 'success', data: result });
}));

router.post('/set-mode/:userId', asyncHandler(async (req, res) => {
  const service = req.app.locals.dualBrainService;
  if (!service) throw new AppError('Dual-Brain service not initialized', 503);
  const result = await service.setUserMode(req.params.userId, req.body.mode);
  res.json({ status: 'success', data: result });
}));

router.get('/history/:userId', asyncHandler(async (req, res) => {
  const service = req.app.locals.dualBrainService;
  if (!service) throw new AppError('Dual-Brain service not initialized', 503);
  const history = await service.getUserHistory(req.params.userId, parseInt(req.query.limit) || 20);
  res.json({ status: 'success', data: history });
}));

module.exports = router;
