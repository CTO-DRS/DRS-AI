const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

/**
 * @openapi
 * /api/v1/explanations/model-selection
 *   post:
 *     summary: Explain a model selection decision
 */
router.post('/model-selection', asyncHandler(async (req, res) => {
  const svc = req.app.locals.decisionExplanationService;
  res.status(201).json(await svc.explainModelSelection(req.body || {}));
}));

router.post('/content-filtering', asyncHandler(async (req, res) => {
  const svc = req.app.locals.decisionExplanationService;
  res.status(201).json(await svc.explainContentFiltering(req.body || {}));
}));

router.post('/routing', asyncHandler(async (req, res) => {
  const svc = req.app.locals.decisionExplanationService;
  res.status(201).json(await svc.explainRouting(req.body || {}));
}));

router.post('/security', asyncHandler(async (req, res) => {
  const svc = req.app.locals.decisionExplanationService;
  res.status(201).json(await svc.explainSecurity(req.body || {}));
}));

router.post('/resource-allocation', asyncHandler(async (req, res) => {
  const svc = req.app.locals.decisionExplanationService;
  res.status(201).json(await svc.explainResourceAllocation(req.body || {}));
}));

router.post('/user-facing-message', asyncHandler(async (req, res) => {
  const svc = req.app.locals.decisionExplanationService;
  res.status(201).json(await svc.explainUserFacingMessage(req.body || {}));
}));

router.get('/', asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 500);
  const category = req.query.category;
  const log = await req.app.locals.decisionExplanationService.getLog(limit, category);
  res.json({ count: log.length, explanations: log });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const rec = await req.app.locals.decisionExplanationService.getById(req.params.id);
  if (!rec) throw new AppError('Explanation not found', 404, 'NOT_FOUND');
  res.json(rec);
}));

module.exports = router;
