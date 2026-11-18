const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

/**
 * @openapi
 * /api/v1/uncertainty/quantify
 *   post:
 *     summary: Quantify uncertainty of a model output
 */
router.post('/quantify', asyncHandler(async (req, res) => {
  const svc = req.app.locals.epistemicUncertaintyService;
  const result = await svc.quantify(req.body || {});
  res.status(200).json(result);
}));

router.post('/feedback', asyncHandler(async (req, res) => {
  const svc = req.app.locals.epistemicUncertaintyService;
  const { predictionId, wasCorrect } = req.body || {};
  if (!predictionId) throw new AppError('predictionId is required', 400, 'MISSING_PARAM');
  if (typeof wasCorrect !== 'boolean') throw new AppError('wasCorrect must be boolean', 400, 'INVALID_PARAM');
  const result = await svc.feedback(predictionId, wasCorrect);
  res.json(result);
}));

router.get('/calibration', asyncHandler(async (req, res) => {
  res.json(await req.app.locals.epistemicUncertaintyService.calibrationMetrics());
}));

router.get('/threshold', asyncHandler(async (req, res) => {
  res.json({ threshold: await req.app.locals.epistemicUncertaintyService.getThreshold() });
}));

router.post('/threshold', asyncHandler(async (req, res) => {
  const t = Number(req.body?.threshold);
  if (Number.isNaN(t)) throw new AppError('threshold must be a number', 400, 'INVALID_PARAM');
  res.json(await req.app.locals.epistemicUncertaintyService.setThreshold(t));
}));

module.exports = router;
