const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

router.post('/session', asyncHandler(async (req, res) => {
  const service = req.app.locals.voiceService;
  if (!service) throw new AppError('Voice service not initialized', 503);
  const result = service.startSession(req.body);
  res.status(201).json({ status: 'success', data: result });
}));

router.post('/audio/:sessionId', asyncHandler(async (req, res) => {
  const service = req.app.locals.voiceService;
  if (!service) throw new AppError('Voice service not initialized', 503);
  const result = await service.processAudio(req.params.sessionId, req.body.audio, req.body.metadata);
  res.json({ status: 'success', data: result });
}));

router.post('/tts', asyncHandler(async (req, res) => {
  const service = req.app.locals.voiceService;
  if (!service) throw new AppError('Voice service not initialized', 503);
  const result = await service.textToSpeech(req.body.text, req.body.options);
  res.json({ status: 'success', data: result });
}));

router.delete('/session/:sessionId', asyncHandler(async (req, res) => {
  const service = req.app.locals.voiceService;
  if (!service) throw new AppError('Voice service not initialized', 503);
  const result = service.endSession(req.params.sessionId);
  res.json({ status: 'success', data: result });
}));

module.exports = router;
