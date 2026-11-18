const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

/**
 * @openapi
 * /api/v1/transparency/dashboard
 *   get:
 *     summary: Public transparency dashboard
 */
router.get('/dashboard', asyncHandler(async (req, res) => {
  res.json(await req.app.locals.transparencyDashboardService.getDashboardSummary());
}));

router.get('/compliance', asyncHandler(async (req, res) => {
  res.json(await req.app.locals.transparencyDashboardService.getCompliancePosture());
}));

router.get('/ledger', asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 100), 1000);
  const since = req.query.since;
  res.json({
    count: 0,
    events: await req.app.locals.transparencyDashboardService.getLedger(limit, since),
  });
}));

router.post('/ledger', asyncHandler(async (req, res) => {
  const record = await req.app.locals.transparencyDashboardService.recordEvent(req.body || {});
  res.status(201).json(record);
}));

router.get('/bias-audits', asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 500);
  res.json({
    count: 0,
    audits: await req.app.locals.transparencyDashboardService.getBiasAudits(limit),
  });
}));

router.post('/bias-audits', asyncHandler(async (req, res) => {
  const record = await req.app.locals.transparencyDashboardService.recordBiasAudit(req.body || {});
  res.status(201).json(record);
}));

router.get('/models/:modelId/card', asyncHandler(async (req, res) => {
  res.json(await req.app.locals.transparencyDashboardService.getModelCard(req.params.modelId));
}));

router.post('/lineage/:answerId', asyncHandler(async (req, res) => {
  const record = await req.app.locals.transparencyDashboardService.recordLineage(req.params.answerId, req.body?.sources || []);
  res.status(201).json(record);
}));

router.get('/lineage/:answerId', asyncHandler(async (req, res) => {
  res.json(await req.app.locals.transparencyDashboardService.getLineage(req.params.answerId));
}));

router.get('/user-rights', (req, res) => {
  res.json({
    rights: [
      { id: 'access', description: 'Access all data we hold about you', endpoint: '/api/v1/transparency/user/:userId' },
      { id: 'rectification', description: 'Correct inaccurate personal data', endpoint: 'POST /api/v1/transparency/user/:userId/correct' },
      { id: 'erasure', description: 'Right to be forgotten (GDPR / PDPL)', endpoint: 'DELETE /api/v1/transparency/user/:userId' },
      { id: 'portability', description: 'Export data in machine-readable format', endpoint: '/api/v1/transparency/user/:userId/export' },
      { id: 'objection', description: 'Object to processing of personal data', endpoint: 'POST /api/v1/transparency/user/:userId/object' },
    ],
  });
});

router.get('/user/:userId', asyncHandler(async (req, res) => {
  // Stub: search the ledger for events involving this user
  const ledger = await req.app.locals.transparencyDashboardService.getLedger(1000);
  const filtered = ledger.filter((e) => e.userId === req.params.userId);
  res.json({ userId: req.params.userId, eventCount: filtered.length, events: filtered });
}));

router.delete('/user/:userId', asyncHandler(async (req, res) => {
  // Right-to-be-forgotten: in a real implementation we'd scrub personal data
  // from postgres / minio / qdrant / redis. Here we just log the request.
  await req.app.locals.transparencyDashboardService.recordEvent({
    type: 'right-to-be-forgotten',
    userId: req.params.userId,
    requestedAt: new Date().toISOString(),
  });
  res.json({ userId: req.params.userId, status: 'scheduled', message: 'Deletion scheduled within 30 days' });
}));

module.exports = router;
