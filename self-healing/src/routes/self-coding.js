const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

router.post('/analyze', asyncHandler(async (req, res) => {
  const service = req.app.locals.selfCodingService;
  if (!service) throw new AppError('Self-coding service not initialized', 503);
  const result = await service.analyzeCode(req.body);
  res.json({ status: 'success', data: result });
}));

router.post('/fix', asyncHandler(async (req, res) => {
  const service = req.app.locals.selfCodingService;
  if (!service) throw new AppError('Self-coding service not initialized', 503);
  const result = await service.autoFix(req.body.analysisId, req.body);
  res.json({ status: 'success', data: result });
}));

router.get('/stats', asyncHandler(async (req, res) => {
  const service = req.app.locals.selfCodingService;
  if (!service) throw new AppError('Self-coding service not initialized', 503);
  res.json({ status: 'success', data: service.getStats() });
}));

module.exports = router;
