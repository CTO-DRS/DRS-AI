const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

router.post('/start', asyncHandler(async (req, res) => {
  const service = req.app.locals.distillationService;
  if (!service) throw new AppError('Distillation service not initialized', 503);
  const result = await service.distill(req.body);
  res.status(202).json({ status: 'success', data: result });
}));

router.get('/job/:jobId', asyncHandler(async (req, res) => {
  const service = req.app.locals.distillationService;
  if (!service) throw new AppError('Distillation service not initialized', 503);
  const job = await service.getJobStatus(req.params.jobId);
  if (!job) throw new AppError('Job not found', 404);
  res.json({ status: 'success', data: job });
}));

router.get('/models', asyncHandler(async (req, res) => {
  const service = req.app.locals.distillationService;
  if (!service) throw new AppError('Distillation service not initialized', 503);
  res.json({ status: 'success', data: service.listModels() });
}));

module.exports = router;
