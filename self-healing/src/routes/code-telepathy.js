const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

router.post('/read-intent', asyncHandler(async (req, res) => {
  const service = req.app.locals.codeTelepathyService;
  if (!service) throw new AppError('Code telepathy service not initialized', 503);
  const result = await service.readIntent(req.body);
  res.json({ status: 'success', data: result });
}));

router.post('/predict-edits', asyncHandler(async (req, res) => {
  const service = req.app.locals.codeTelepathyService;
  if (!service) throw new AppError('Code telepathy service not initialized', 503);
  const result = await service.predictNextEdits(req.body);
  res.json({ status: 'success', data: result });
}));

router.post('/complete', asyncHandler(async (req, res) => {
  const service = req.app.locals.codeTelepathyService;
  if (!service) throw new AppError('Code telepathy service not initialized', 503);
  const result = await service.completeCode(req.body);
  res.json({ status: 'success', data: result });
}));

router.get('/stats', asyncHandler(async (req, res) => {
  const service = req.app.locals.codeTelepathyService;
  if (!service) throw new AppError('Code telepathy service not initialized', 503);
  res.json({ status: 'success', data: service.getStats() });
}));

module.exports = router;
