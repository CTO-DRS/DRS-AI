const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('../utils/errorHandler');

/**
 * @openapi
 * /api/v1/health/snapshot
 *   get:
 *     summary: Latest health snapshot
 */
router.get('/snapshot', asyncHandler(async (req, res) => {
  const svc = req.app.locals.digitalHealthService;
  const snap = await svc.getLatestSnapshot();
  if (!snap) throw new AppError('No snapshot available yet', 404, 'NO_SNAPSHOT');
  res.json(snap);
}));

/**
 * @openapi
 * /api/v1/health/snapshot
 *   post:
 *     summary: Force a new health snapshot
 */
router.post('/snapshot', asyncHandler(async (req, res) => {
  const svc = req.app.locals.digitalHealthService;
  const snap = await svc.snapshot();
  res.status(201).json(snap);
}));

router.get('/history', asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 500);
  const history = await req.app.locals.digitalHealthService.getHistory(limit);
  res.json({ count: history.length, snapshots: history });
}));

router.get('/incidents', asyncHandler(async (req, res) => {
  const incidents = await req.app.locals.digitalHealthService.getActiveIncidents();
  res.json({ count: incidents.length, incidents });
}));

router.get('/incidents/history', asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 500);
  const history = await req.app.locals.digitalHealthService.getIncidentHistory(limit);
  res.json({ count: history.length, incidents: history });
}));

router.post('/incidents/:id/resolve', asyncHandler(async (req, res) => {
  const svc = req.app.locals.digitalHealthService;
  const incident = Array.from(svc.activeIncidents.values()).find((i) => i.id === req.params.id);
  if (!incident) throw new AppError('Incident not found', 404, 'INCIDENT_NOT_FOUND');

  const resolved = await svc.resolveIncidentsFor(incident.serviceId);
  res.json({ resolved: resolved.length, incidents: resolved });
}));

router.get('/trends', asyncHandler(async (req, res) => {
  const window = Math.min(Number(req.query.window || 24), 168);
  const trends = await req.app.locals.digitalHealthService.getTrends(window);
  res.json(trends);
}));

module.exports = router;
