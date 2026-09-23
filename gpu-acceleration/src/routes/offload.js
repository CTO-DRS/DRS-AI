const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');
const { OffloadPolicy } = require('../offload-manager/OffloadManager');

router.get('/policy', (req, res) => {
  res.json({ policy: req.app.locals.offloadManager.getPolicy() });
});

router.post('/policy', asyncHandler(async (req, res) => {
  const policy = req.body?.policy;
  if (!policy) throw new AppError('policy required', 400, 'MISSING_PARAM');
  res.json(await req.app.locals.offloadManager.setPolicy(policy));
}));

router.post('/decide', asyncHandler(async (req, res) => {
  const { model } = req.body || {};
  if (!model?.id) throw new AppError('model.id required', 400, 'MISSING_PARAM');
  res.json(await req.app.locals.offloadManager.decide(model));
}));

router.post('/apply', asyncHandler(async (req, res) => {
  const { modelId, numGpu } = req.body || {};
  if (!modelId) throw new AppError('modelId required', 400, 'MISSING_PARAM');
  res.json(await req.app.locals.offloadManager.apply(modelId, Number(numGpu) || 0));
}));

router.get('/policies', (req, res) => {
  res.json({ policies: Object.values(OffloadPolicy) });
});

module.exports = router;
