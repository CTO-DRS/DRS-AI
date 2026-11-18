const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

router.get('/contexts', (req, res) => {
  res.json({ contexts: req.app.locals.timeSliceManager.list() });
});

router.get('/contexts/gpu/:gpuId', (req, res) => {
  res.json({ contexts: req.app.locals.timeSliceManager.listByGpu(req.params.gpuId) });
});

router.get('/contexts/tenant/:tenantId', (req, res) => {
  res.json({ contexts: req.app.locals.timeSliceManager.listByTenant(req.params.tenantId) });
});

router.post('/acquire', asyncHandler(async (req, res) => {
  const { gpuId, tenantId, ...opts } = req.body || {};
  if (gpuId === undefined || gpuId === null || !tenantId) throw new AppError('gpuId, tenantId required', 400, 'MISSING_PARAM');
  try { res.status(201).json(await req.app.locals.timeSliceManager.acquire(gpuId, tenantId, opts)); }
  catch (e) { throw new AppError(e.message, 409, 'GPU_AT_CAPACITY'); }
}));

router.post('/contexts/:id/heartbeat', asyncHandler(async (req, res) => {
  try { res.json(await req.app.locals.timeSliceManager.heartbeat(req.params.id, req.body?.utilization || 0)); }
  catch (e) { throw new AppError(e.message, 404, 'NOT_FOUND'); }
}));

router.delete('/contexts/:id', asyncHandler(async (req, res) => {
  const r = await req.app.locals.timeSliceManager.release(req.params.id);
  if (!r) throw new AppError('Context not found', 404, 'NOT_FOUND');
  res.json(r);
}));

router.get('/fairness', asyncHandler(async (req, res) => {
  res.json({ metrics: await req.app.locals.timeSliceManager.getFairnessMetrics() });
}));

router.get('/max-clients', (req, res) => {
  res.json({ maxClientsPerGpu: req.app.locals.timeSliceManager.getMaxClients() });
});

router.post('/max-clients', asyncHandler(async (req, res) => {
  const n = Number(req.body?.max);
  if (!Number.isFinite(n) || n < 1) throw new AppError('max must be a positive number', 400, 'INVALID_PARAM');
  res.json(await req.app.locals.timeSliceManager.setMaxClients(n));
}));

module.exports = router;
