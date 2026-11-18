const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

router.post('/register-repo', asyncHandler(async (req, res) => {
  const service = req.app.locals.autoPRService;
  if (!service) throw new AppError('Auto-PR service not initialized', 503);
  const result = await service.registerRepository(req.body);
  res.status(201).json({ status: 'success', data: result });
}));

router.post('/generate', asyncHandler(async (req, res) => {
  const service = req.app.locals.autoPRService;
  if (!service) throw new AppError('Auto-PR service not initialized', 503);
  const result = await service.generatePR(req.body);
  res.status(201).json({ status: 'success', data: result });
}));

router.post('/submit/:prId', asyncHandler(async (req, res) => {
  const service = req.app.locals.autoPRService;
  if (!service) throw new AppError('Auto-PR service not initialized', 503);
  const result = await service.submitPR(req.params.prId);
  res.json({ status: 'success', data: result });
}));

router.post('/approve/:prId', asyncHandler(async (req, res) => {
  const service = req.app.locals.autoPRService;
  if (!service) throw new AppError('Auto-PR service not initialized', 503);
  const result = await service.approvePR(req.params.prId);
  res.json({ status: 'success', data: result });
}));

router.get('/pr/:prId', asyncHandler(async (req, res) => {
  const service = req.app.locals.autoPRService;
  if (!service) throw new AppError('Auto-PR service not initialized', 503);
  const result = service.getPR(req.params.prId);
  if (!result) throw new AppError('PR not found', 404);
  res.json({ status: 'success', data: result });
}));

router.get('/prs', asyncHandler(async (req, res) => {
  const service = req.app.locals.autoPRService;
  if (!service) throw new AppError('Auto-PR service not initialized', 503);
  res.json({ status: 'success', data: service.listPRs() });
}));

module.exports = router;
