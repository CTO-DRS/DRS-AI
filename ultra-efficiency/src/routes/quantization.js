const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

router.post('/quantize', asyncHandler(async (req, res) => {
  const service = req.app.locals.quantizationService;
  if (!service) throw new AppError('Quantization service not initialized', 503);
  const result = await service.quantize(req.body);
  res.json({ status: 'success', data: result });
}));

router.post('/auto', asyncHandler(async (req, res) => {
  const service = req.app.locals.quantizationService;
  if (!service) throw new AppError('Quantization service not initialized', 503);
  const result = await service.autoSelectMode(req.body.modelPath, req.body.targetDevice);
  res.json({ status: 'success', data: result });
}));

router.get('/models', asyncHandler(async (req, res) => {
  const service = req.app.locals.quantizationService;
  if (!service) throw new AppError('Quantization service not initialized', 503);
  res.json({ status: 'success', data: service.listModels() });
}));

module.exports = router;
