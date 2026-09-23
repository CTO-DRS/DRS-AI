const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

router.get('/gpus', (req, res) => {
  res.json({ gpus: req.app.locals.migManager.listGpus() });
});

router.get('/profiles', (req, res) => {
  res.json({ profiles: req.app.locals.migManager.getSupportedProfiles() });
});

router.post('/gpus/:gpuId/enable', asyncHandler(async (req, res) => {
  try { res.json(await req.app.locals.migManager.enableMig(req.params.gpuId)); }
  catch (e) { throw new AppError(e.message, 400, 'MIG_ENABLE_FAILED'); }
}));

router.post('/gpus/:gpuId/disable', asyncHandler(async (req, res) => {
  try { res.json(await req.app.locals.migManager.disableMig(req.params.gpuId)); }
  catch (e) { throw new AppError(e.message, 400, 'MIG_DISABLE_FAILED'); }
}));

router.get('/instances', (req, res) => {
  res.json({ instances: req.app.locals.migManager.listInstances() });
});

router.post('/instances', asyncHandler(async (req, res) => {
  const { gpuId, profile, tenantId } = req.body || {};
  if (gpuId === undefined || !profile || !tenantId) throw new AppError('gpuId, profile, tenantId required', 400, 'MISSING_PARAM');
  try { res.status(201).json(await req.app.locals.migManager.createInstance(gpuId, profile, tenantId)); }
  catch (e) { throw new AppError(e.message, 400, 'MIG_CREATE_FAILED'); }
}));

router.delete('/instances/:id', asyncHandler(async (req, res) => {
  try { res.json(await req.app.locals.migManager.destroyInstance(req.params.id)); }
  catch (e) { throw new AppError(e.message, 404, 'NOT_FOUND'); }
}));

module.exports = router;
